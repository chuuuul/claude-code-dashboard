/**
 * SessionManager - tmux session management with security enhancements
 *
 * Key security features:
 * - execFile/spawn only (no execSync, no shell interpretation)
 * - UUID v4 session IDs with strict validation
 * - Dedicated tmux socket (tmux -L claude-dashboard)
 * - Path whitelist validation with symlink resolution
 * - Master/Viewer mode for concurrent access control
 */

const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const { v4: uuidv4, validate: uuidValidate } = require('uuid');
const EventEmitter = require('events');
const path = require('path');
const fs = require('fs').promises;

const execFileAsync = promisify(execFile);

// Security: Dedicated tmux socket name for isolation
const TMUX_SOCKET = 'claude-dashboard';

class SessionManager extends EventEmitter {
  constructor(db) {
    super();
    this.db = db;
    this.activeSessions = new Map();
    this.masterClients = new Map(); // sessionId -> clientId
  }

  /**
   * Recover existing tmux sessions on server startup
   */
  async recoverSessions() {
    try {
      const { stdout } = await execFileAsync('tmux', [
        '-L', TMUX_SOCKET,
        'list-sessions', '-F', '#{session_name}'
      ]);

      const existingSessions = stdout.trim().split('\n').filter(Boolean);

      for (const sessionId of existingSessions) {
        if (uuidValidate(sessionId)) {
          // Try to recover from DB
          const dbSession = this.db.prepare(
            'SELECT * FROM sessions WHERE session_id = ?'
          ).get(sessionId);

          if (dbSession) {
            this.activeSessions.set(sessionId, {
              ...dbSession,
              status: 'recovered'
            });
          } else {
            // Orphan session - register in DB
            this.db.prepare(`
              INSERT INTO sessions (session_id, project_name, status, created_at)
              VALUES (?, ?, ?, datetime('now'))
            `).run(sessionId, 'recovered-session', 'active');

            this.activeSessions.set(sessionId, {
              session_id: sessionId,
              project_name: 'recovered-session',
              status: 'recovered'
            });
          }
        }
      }

      console.log(`[SessionManager] Recovered ${this.activeSessions.size} sessions`);
    } catch (error) {
      // No tmux server running is normal for first startup
      if (!error.message.includes('no server running')) {
        console.error('[SessionManager] Recovery error:', error);
      }
    }
  }

  /**
   * Validate session ID (Command Injection prevention)
   * @param {string} id - Session ID to validate
   * @throws {Error} If session ID is invalid
   */
  validateSessionId(id) {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid session ID: must be a string');
    }
    if (!uuidValidate(id)) {
      throw new Error('Invalid session ID: must be UUID v4 format');
    }
    return true;
  }

  /**
   * Validate project path against whitelist
   * @param {string} inputPath - Path to validate
   * @returns {Promise<string>} Resolved real path
   */
  async validateProjectPath(inputPath) {
    const ALLOWED_ROOTS = (process.env.ALLOWED_PROJECT_ROOTS || '')
      .split(':')
      .filter(Boolean);

    if (ALLOWED_ROOTS.length === 0) {
      throw new Error('ALLOWED_PROJECT_ROOTS not configured');
    }

    // Resolve to real path (follows symlinks)
    const realPath = await fs.realpath(inputPath);

    // Check against whitelist with path.sep to prevent prefix attacks
    const isAllowed = ALLOWED_ROOTS.some(root => {
      const resolvedRoot = path.resolve(root);
      return realPath === resolvedRoot || realPath.startsWith(resolvedRoot + path.sep);
    });

    if (!isAllowed) {
      throw new Error('Path not in allowed roots');
    }

    return realPath;
  }

  /**
   * Create a new Claude session
   * @param {string} projectPath - Project directory path
   * @param {string} projectName - Human-readable project name
   * @returns {Promise<string>} Created session ID
   */
  async createSession(projectPath, projectName) {
    const sessionId = uuidv4();

    // Validate project path
    const validatedPath = await this.validateProjectPath(projectPath);

    // Create tmux session with Claude CLI
    await execFileAsync('tmux', [
      '-L', TMUX_SOCKET,
      'new-session',
      '-d',                    // detached
      '-s', sessionId,         // session name
      '-c', validatedPath,     // working directory
      'claude'                 // command to run
    ]);

    // Save to database
    this.db.prepare(`
      INSERT INTO sessions (session_id, project_name, project_path, status, created_at)
      VALUES (?, ?, ?, 'active', datetime('now'))
    `).run(sessionId, projectName, validatedPath);

    this.activeSessions.set(sessionId, {
      session_id: sessionId,
      project_name: projectName,
      project_path: validatedPath,
      status: 'active'
    });

    // Emit audit event
    this.emit('audit', {
      action: 'session_created',
      sessionId,
      projectPath: validatedPath
    });

    return sessionId;
  }

  /**
   * Check if session exists in tmux
   * @param {string} sessionId - Session ID to check
   * @returns {Promise<boolean>}
   */
  async hasSession(sessionId) {
    this.validateSessionId(sessionId);

    try {
      await execFileAsync('tmux', [
        '-L', TMUX_SOCKET,
        'has-session', '-t', sessionId
      ]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List all active sessions
   * @returns {Promise<Array>} List of sessions with metadata
   */
  async listSessions() {
    try {
      const { stdout } = await execFileAsync('tmux', [
        '-L', TMUX_SOCKET,
        'list-sessions',
        '-F', '#{session_name}:#{session_activity}:#{session_attached}'
      ]);

      return stdout.trim().split('\n')
        .filter(Boolean)
        .map(line => {
          const [id, activity, attached] = line.split(':');
          const dbInfo = this.activeSessions.get(id) || {};
          return {
            session_id: id,
            project_name: dbInfo.project_name || 'Unknown',
            project_path: dbInfo.project_path,
            last_activity: new Date(parseInt(activity) * 1000),
            attached_clients: parseInt(attached),
            has_master: this.masterClients.has(id),
            ...dbInfo
          };
        });
    } catch {
      return [];
    }
  }

  /**
   * Send input to a session (master only)
   * @param {string} sessionId - Target session
   * @param {string} input - Input to send
   * @param {string} clientId - Client attempting to send
   */
  async sendInput(sessionId, input, clientId) {
    this.validateSessionId(sessionId);

    // Check master permission
    const master = this.masterClients.get(sessionId);
    if (master && master !== clientId) {
      throw new Error('Only master client can send input');
    }

    // Validate input type
    if (typeof input !== 'string') {
      throw new Error('Input must be a string');
    }

    // Use literal mode (-l) to prevent escape interpretation
    await execFileAsync('tmux', [
      '-L', TMUX_SOCKET,
      'send-keys', '-t', sessionId,
      '-l',  // literal mode
      input
    ]);
  }

  /**
   * Send large text input using spawn + load-buffer
   * @param {string} sessionId - Target session
   * @param {string} text - Large text to send
   * @param {string} clientId - Client attempting to send
   */
  async sendLargeInput(sessionId, text, clientId) {
    this.validateSessionId(sessionId);

    const master = this.masterClients.get(sessionId);
    if (master && master !== clientId) {
      throw new Error('Only master client can send input');
    }

    // Use spawn to pipe text to tmux load-buffer via stdin
    await new Promise((resolve, reject) => {
      const proc = spawn('tmux', ['-L', TMUX_SOCKET, 'load-buffer', '-']);

      proc.stdin.write(text);
      proc.stdin.end();

      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`tmux load-buffer exited with code ${code}`));
      });

      proc.on('error', reject);
    });

    // Paste buffer to session
    await execFileAsync('tmux', [
      '-L', TMUX_SOCKET,
      'paste-buffer', '-t', sessionId
    ]);
  }

  /**
   * Kill a session
   * @param {string} sessionId - Session to kill
   */
  async killSession(sessionId) {
    this.validateSessionId(sessionId);

    await execFileAsync('tmux', [
      '-L', TMUX_SOCKET,
      'kill-session', '-t', sessionId
    ]);

    // Update database
    this.db.prepare(
      'UPDATE sessions SET status = ?, ended_at = datetime("now") WHERE session_id = ?'
    ).run('terminated', sessionId);

    // Clean up maps
    this.activeSessions.delete(sessionId);
    this.masterClients.delete(sessionId);

    this.emit('audit', { action: 'session_killed', sessionId });
  }

  /**
   * Capture current pane content
   * @param {string} sessionId - Session to capture
   * @returns {Promise<string>} Pane content
   */
  async capturePane(sessionId) {
    this.validateSessionId(sessionId);

    const { stdout } = await execFileAsync('tmux', [
      '-L', TMUX_SOCKET,
      'capture-pane', '-t', sessionId, '-p'
    ]);

    return stdout;
  }

  /**
   * Set master client for a session
   * @param {string} sessionId - Session ID
   * @param {string} clientId - Client to set as master
   */
  setMaster(sessionId, clientId) {
    this.validateSessionId(sessionId);
    this.masterClients.set(sessionId, clientId);
  }

  /**
   * Release master if client matches
   * @param {string} sessionId - Session ID
   * @param {string} clientId - Client releasing master
   */
  releaseMaster(sessionId, clientId) {
    if (this.masterClients.get(sessionId) === clientId) {
      this.masterClients.delete(sessionId);
    }
  }

  /**
   * Check if client is master
   * @param {string} sessionId - Session ID
   * @param {string} clientId - Client to check
   * @returns {boolean}
   */
  isMaster(sessionId, clientId) {
    return this.masterClients.get(sessionId) === clientId;
  }

  /**
   * Check if session has a master
   * @param {string} sessionId - Session ID
   * @returns {boolean}
   */
  hasMaster(sessionId) {
    return this.masterClients.has(sessionId);
  }

  /**
   * Get session info from active sessions map
   * @param {string} sessionId - Session ID
   * @returns {Object|undefined}
   */
  getSession(sessionId) {
    this.validateSessionId(sessionId);
    return this.activeSessions.get(sessionId);
  }

  /**
   * Update session status
   * @param {string} sessionId - Session ID
   * @param {string} status - New status ('active', 'idle', 'terminated')
   */
  updateStatus(sessionId, status) {
    this.validateSessionId(sessionId);

    const validStatuses = ['active', 'idle', 'terminated'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    this.db.prepare(
      'UPDATE sessions SET status = ?, last_active = datetime("now") WHERE session_id = ?'
    ).run(status, sessionId);

    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.status = status;
    }
  }
}

module.exports = SessionManager;
