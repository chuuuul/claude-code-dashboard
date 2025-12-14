/**
 * SocketHandler - WebSocket event handling for terminal streaming
 *
 * Features:
 * - JWT authentication on handshake
 * - Master/Viewer mode support
 * - Terminal resize handling
 * - Automatic cleanup on disconnect
 * - Token expiration handling
 */

const pty = require('node-pty');
const jwt = require('jsonwebtoken');

const TMUX_SOCKET = 'claude-dashboard';

// Whitelist safe environment variables for PTY sessions
// Prevents leaking sensitive variables like JWT_SECRET, DB_PATH
const SAFE_PTY_ENV = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  TERM: 'xterm-256color',
  LANG: process.env.LANG || 'en_US.UTF-8',
  LC_ALL: process.env.LC_ALL || '',
  SHELL: process.env.SHELL || '/bin/bash',
  USER: process.env.USER || 'claude'
};

/**
 * Initialize Socket.io handlers
 * @param {SocketIO.Server} io - Socket.io server instance
 * @param {SessionManager} sessionManager - Session manager instance
 * @param {AuditLogger} auditLogger - Audit logger instance
 */
function initializeSocketHandler(io, sessionManager, auditLogger) {
  // JWT authentication middleware - only accepts access tokens
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Reject refresh tokens - only access tokens allowed for WebSocket
      if (decoded.type !== 'access') {
        return next(new Error('Invalid token type: access token required'));
      }

      socket.user = decoded;

      // Schedule token expiration check
      scheduleTokenExpiration(socket, decoded.exp);

      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return next(new Error('Token expired'));
      }
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}, user: ${socket.user.username}`);

    let term = null;
    let currentSessionId = null;
    let isReadOnly = false;

    // Helper: Clean up event listeners
    const cleanupListeners = () => {
      socket.removeAllListeners('input');
      socket.removeAllListeners('resize');
    };

    // Attach to a session
    socket.on('attach', async ({ sessionId, mode = 'master' }) => {
      try {
        // Validate session ID
        sessionManager.validateSessionId(sessionId);

        // Check session exists
        if (!(await sessionManager.hasSession(sessionId))) {
          socket.emit('error', { message: 'Session not found' });
          return;
        }

        // Clean up existing connection
        if (term) {
          cleanupListeners();
          term.kill();
        }

        currentSessionId = sessionId;
        isReadOnly = mode === 'viewer';

        // Handle master/viewer mode
        if (mode === 'master') {
          if (sessionManager.hasMaster(sessionId)) {
            // Master already exists - switch to viewer
            isReadOnly = true;
            socket.emit('mode-changed', {
              mode: 'viewer',
              reason: 'Master already connected'
            });
          } else {
            sessionManager.setMaster(sessionId, socket.id);
          }
        }

        // Build tmux attach command
        const attachArgs = ['-L', TMUX_SOCKET, 'attach-session', '-t', sessionId];
        if (isReadOnly) {
          attachArgs.push('-r'); // Read-only mode
        }

        // Spawn pty with tmux using sanitized environment
        term = pty.spawn('tmux', attachArgs, {
          name: 'xterm-256color',
          cols: 80,
          rows: 30,
          cwd: SAFE_PTY_ENV.HOME,
          env: SAFE_PTY_ENV
        });

        // Stream output to client
        term.onData((data) => {
          socket.emit('output', data);
        });

        // Handle terminal exit
        term.onExit(({ exitCode }) => {
          socket.emit('session-ended', { exitCode });
          currentSessionId = null;
        });

        // Handle input from client (master only)
        socket.on('input', (data) => {
          if (!isReadOnly && term) {
            term.write(data);
          }
        });

        // Handle terminal resize
        socket.on('resize', ({ cols, rows }) => {
          if (term && cols > 0 && rows > 0) {
            term.resize(cols, rows);
          }
        });

        // Log attachment
        auditLogger.logSessionAttached(
          socket.user.userId,
          sessionId,
          isReadOnly ? 'viewer' : 'master',
          socket.handshake.address
        );

        // Notify client of successful attachment
        socket.emit('attached', {
          sessionId,
          mode: isReadOnly ? 'viewer' : 'master'
        });

      } catch (error) {
        console.error(`[Socket] Attach error:`, error.message);
        socket.emit('error', { message: error.message });
      }
    });

    // Request master control
    socket.on('request-master', () => {
      if (!currentSessionId || !isReadOnly) return;

      if (!sessionManager.hasMaster(currentSessionId)) {
        sessionManager.setMaster(currentSessionId, socket.id);
        isReadOnly = false;

        // Reattach without -r flag
        if (term) {
          term.kill();

          term = pty.spawn('tmux', [
            '-L', TMUX_SOCKET,
            'attach-session', '-t', currentSessionId
          ], {
            name: 'xterm-256color',
            cols: 80,
            rows: 30,
            cwd: SAFE_PTY_ENV.HOME,
            env: SAFE_PTY_ENV
          });

          term.onData((data) => socket.emit('output', data));
          term.onExit(({ exitCode }) => {
            socket.emit('session-ended', { exitCode });
            currentSessionId = null;
          });
        }

        socket.emit('mode-changed', { mode: 'master' });

        auditLogger.log({
          userId: socket.user.userId,
          action: 'master_acquired',
          resourceType: 'session',
          resourceId: currentSessionId,
          ipAddress: socket.handshake.address
        });
      } else {
        socket.emit('mode-changed', {
          mode: 'viewer',
          reason: 'Master still connected'
        });
      }
    });

    // Release master control voluntarily
    socket.on('release-master', () => {
      if (currentSessionId && sessionManager.isMaster(currentSessionId, socket.id)) {
        sessionManager.releaseMaster(currentSessionId, socket.id);
        isReadOnly = true;

        socket.emit('mode-changed', { mode: 'viewer' });

        auditLogger.log({
          userId: socket.user.userId,
          action: 'master_released',
          resourceType: 'session',
          resourceId: currentSessionId,
          ipAddress: socket.handshake.address
        });
      }
    });

    // Detach from session
    socket.on('detach', () => {
      if (term) {
        cleanupListeners();
        term.kill();
        term = null;
      }

      if (currentSessionId) {
        sessionManager.releaseMaster(currentSessionId, socket.id);
        currentSessionId = null;
      }

      socket.emit('detached');
    });

    // Send input (direct, for small inputs)
    // Security: Only allow input to the session the socket is attached to
    socket.on('send-input', async ({ sessionId, input }) => {
      try {
        // Validate user is attached to this session
        if (sessionId !== currentSessionId) {
          socket.emit('error', { message: 'Not attached to this session' });
          return;
        }
        // Validate input size (prevent memory exhaustion)
        if (typeof input !== 'string' || input.length > 64 * 1024) {
          socket.emit('error', { message: 'Input too large (max 64KB)' });
          return;
        }
        await sessionManager.sendInput(sessionId, input, socket.id);
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    // Send large input (uses load-buffer)
    // Security: Only allow input to the session the socket is attached to
    socket.on('send-large-input', async ({ sessionId, text }) => {
      try {
        // Validate user is attached to this session
        if (sessionId !== currentSessionId) {
          socket.emit('error', { message: 'Not attached to this session' });
          return;
        }
        // Validate text size (max 1MB for large input)
        if (typeof text !== 'string' || text.length > 1024 * 1024) {
          socket.emit('error', { message: 'Input too large (max 1MB)' });
          return;
        }
        await sessionManager.sendLargeInput(sessionId, text, socket.id);
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    // Get session list
    socket.on('list-sessions', async () => {
      try {
        const sessions = await sessionManager.listSessions();
        socket.emit('sessions-list', sessions);
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log(`[Socket] Client disconnected: ${socket.id}, reason: ${reason}`);

      cleanupListeners();

      if (currentSessionId) {
        sessionManager.releaseMaster(currentSessionId, socket.id);
      }

      if (term) {
        term.kill();
        term = null;
      }
    });

    // Handle connection errors
    socket.on('error', (error) => {
      console.error(`[Socket] Error for ${socket.id}:`, error);
    });
  });

  /**
   * Schedule socket disconnect on token expiration
   */
  function scheduleTokenExpiration(socket, exp) {
    const expiresIn = (exp * 1000) - Date.now();

    // Warn 10 minutes before expiration
    const warnTime = expiresIn - (10 * 60 * 1000);
    if (warnTime > 0) {
      setTimeout(() => {
        socket.emit('token-expiring', {
          expiresIn: 10 * 60,
          message: 'Token expires in 10 minutes. Please refresh.'
        });
      }, warnTime);
    }

    // Disconnect on expiration
    if (expiresIn > 0) {
      setTimeout(() => {
        socket.emit('token-expired', { message: 'Session expired' });
        socket.disconnect(true);
      }, expiresIn);
    }
  }
}

module.exports = initializeSocketHandler;
