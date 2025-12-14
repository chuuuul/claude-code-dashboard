/**
 * Claude Code Dashboard - Main Application Entry Point
 *
 * Initializes Express server, Socket.io, and all services
 */

require('dotenv').config();

const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');

// Database
const { getDatabase, closeDatabase } = require('./db');
const { bootstrapDatabase } = require('./db/bootstrap');

// Services
const SessionManager = require('./services/SessionManager');
const AuthService = require('./services/AuthService');
const FileExplorer = require('./services/FileExplorer');
const MetadataExtractor = require('./services/MetadataExtractor');
const AuditLogger = require('./services/AuditLogger');
const initializeSocketHandler = require('./services/SocketHandler');

// Routes
const createAuthRoutes = require('./routes/auth');
const createSessionRoutes = require('./routes/sessions');
const createFileRoutes = require('./routes/files');

// Middleware
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { rateLimitMiddleware } = require('./middleware/rateLimiter');

// Configuration
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '127.0.0.1';
const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Initialize and start the server
 */
async function createServer() {
  const app = express();
  const server = http.createServer(app);

  // Initialize Socket.io
  const io = new Server(server, {
    cors: {
      origin: NODE_ENV === 'development' ? '*' : false,
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  // Initialize database
  console.log('[Server] Initializing database...');
  const db = getDatabase();

  // Bootstrap database (creates initial admin if needed)
  const bootstrapResult = await bootstrapDatabase();
  if (bootstrapResult.created) {
    console.log(`[Server] ${bootstrapResult.message}`);
  }

  // Initialize services
  console.log('[Server] Initializing services...');
  const auditLogger = new AuditLogger(db);
  const authService = new AuthService(db);
  const sessionManager = new SessionManager(db);
  const metadataExtractor = new MetadataExtractor();

  let fileExplorer = null;
  try {
    fileExplorer = new FileExplorer();
  } catch (error) {
    console.warn('[Server] FileExplorer disabled:', error.message);
  }

  // Recover existing tmux sessions
  await sessionManager.recoverSessions();

  // Connect SessionManager audit events to AuditLogger
  sessionManager.on('audit', (event) => {
    auditLogger.log(event);
  });

  // CSP Nonce middleware - generates unique nonce per request
  app.use((req, res, next) => {
    res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
    next();
  });

  // Security middleware with nonce-based CSP
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // Use nonce for scripts instead of unsafe-inline/unsafe-eval
        scriptSrc: [
          "'self'",
          (req, res) => `'nonce-${res.locals.cspNonce}'`,
          // Monaco Editor requires unsafe-eval for web workers
          // This is a known limitation - consider using a sandboxed iframe in future
          ...(NODE_ENV === 'production' ? [] : ["'unsafe-eval'"])
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'", // Required for styled-components/emotion
          (req, res) => `'nonce-${res.locals.cspNonce}'`
        ],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'", "wss:", "ws:"],
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        mediaSrc: ["'none'"],
        frameSrc: ["'none'"],
        workerSrc: ["'self'", "blob:"], // For Monaco Editor web workers
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: NODE_ENV === 'production' ? [] : null
      }
    },
    hsts: NODE_ENV === 'production' ? {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    } : false
  }));

  // CORS - explicit origins even in development for security
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : NODE_ENV === 'development'
      ? ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173']
      : [];

  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like curl, health checks, same-origin)
      // This is safe because browsers always send Origin header for cross-origin requests
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true
  }));

  // Health check (no auth required)
  app.get('/health', async (req, res) => {
    const checks = {
      server: 'ok',
      database: 'unknown',
      tmux: 'unknown'
    };

    // Database check
    try {
      db.prepare('SELECT 1').get();
      checks.database = 'ok';
    } catch {
      checks.database = 'error';
    }

    // tmux check
    try {
      await sessionManager.listSessions();
      checks.tmux = 'ok';
    } catch (error) {
      checks.tmux = error.message.includes('no server') ? 'no-sessions' : 'error';
    }

    const allOk = Object.values(checks).every(v => v === 'ok' || v === 'no-sessions');

    res.status(allOk ? 200 : 503).json({
      status: allOk ? 'healthy' : 'degraded',
      checks,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      version: require('../package.json').version
    });
  });

  // API routes
  app.use('/api/auth', createAuthRoutes(authService, auditLogger));
  app.use('/api/sessions', createSessionRoutes(sessionManager, metadataExtractor, auditLogger));

  if (fileExplorer) {
    app.use('/api/files', createFileRoutes(fileExplorer, auditLogger));
  }

  // Audit logs (admin only)
  const { authMiddleware, requireAdmin } = require('./middleware/auth');
  app.get('/api/audit',
    authMiddleware(),
    requireAdmin,
    rateLimitMiddleware('api'),
    (req, res) => {
      const limit = parseInt(req.query.limit || '100', 10);
      const logs = auditLogger.getRecentLogs(Math.min(limit, 1000));
      res.json(logs);
    }
  );

  // Serve static files in production
  if (NODE_ENV === 'production') {
    const clientBuildPath = path.join(__dirname, '../client/build');
    app.use(express.static(clientBuildPath));

    // SPA fallback
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        return next();
      }
      res.sendFile(path.join(clientBuildPath, 'index.html'));
    });
  }

  // 404 handler
  app.use(notFoundHandler);

  // Error handler
  app.use(errorHandler);

  // Initialize WebSocket handlers
  initializeSocketHandler(io, sessionManager, auditLogger);

  // Metadata events to WebSocket clients
  metadataExtractor.on('metadata', (data) => {
    io.to(`session:${data.sessionId}`).emit('metadata-update', data);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[Server] Shutting down gracefully...');

    // Stop metadata polling
    metadataExtractor.stopAll();

    // Close Socket.io
    io.close();

    // Close server
    server.close(() => {
      console.log('[Server] HTTP server closed');

      // Close database
      closeDatabase();
      console.log('[Server] Database closed');

      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      console.error('[Server] Forced shutdown');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Start server
  return new Promise((resolve) => {
    server.listen(PORT, HOST, () => {
      console.log(`
╔═══════════════════════════════════════════════════════════╗
║           Claude Code Dashboard v1.0.0                    ║
║                                                           ║
║  Server running at http://${HOST}:${PORT}                   ║
║  Environment: ${NODE_ENV.padEnd(43)}║
║                                                           ║
║  Press Ctrl+C to stop                                     ║
╚═══════════════════════════════════════════════════════════╝
      `);

      resolve({ server, app, io, db });
    });
  });
}

// Run if executed directly
if (require.main === module) {
  createServer().catch((error) => {
    console.error('[Server] Failed to start:', error);
    process.exit(1);
  });
}

module.exports = { createServer };
