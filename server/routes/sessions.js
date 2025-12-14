/**
 * Session management routes
 * CRUD operations for Claude tmux sessions
 */

const express = require('express');
const router = express.Router();

const { authMiddleware, getClientIp } = require('../middleware/auth');
const { rateLimitMiddleware } = require('../middleware/rateLimiter');
const { validateSessionId, validateProjectCreate } = require('../middleware/validator');

/**
 * Initialize session routes with dependencies
 * @param {SessionManager} sessionManager
 * @param {MetadataExtractor} metadataExtractor
 * @param {AuditLogger} auditLogger
 */
function createSessionRoutes(sessionManager, metadataExtractor, auditLogger) {
  /**
   * GET /api/sessions
   * List all active sessions
   */
  router.get('/',
    authMiddleware(),
    rateLimitMiddleware('api'),
    async (req, res, next) => {
      try {
        const sessions = await sessionManager.listSessions();
        res.json({ sessions });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * POST /api/sessions
   * Create a new session
   */
  router.post('/',
    authMiddleware(),
    rateLimitMiddleware('sessionCreate'),
    validateProjectCreate,
    async (req, res, next) => {
      try {
        const sessionId = await sessionManager.createSession(
          req.validatedProjectPath,
          req.validatedProjectName
        );

        // Start metadata polling for new session
        if (metadataExtractor) {
          metadataExtractor.startPolling(sessionId, req.validatedProjectPath);
        }

        // Log session creation
        auditLogger.logSessionCreated(
          req.user.id,
          sessionId,
          req.validatedProjectPath,
          getClientIp(req)
        );

        res.status(201).json({
          session_id: sessionId,
          project_name: req.validatedProjectName,
          project_path: req.validatedProjectPath,
          status: 'active'
        });
      } catch (error) {
        if (error.message.includes('not in allowed roots')) {
          return res.status(403).json({
            error: 'Project path is not in allowed directories',
            code: 'PATH_NOT_ALLOWED'
          });
        }
        if (error.message.includes('ENOENT')) {
          return res.status(400).json({
            error: 'Project path does not exist',
            code: 'PATH_NOT_FOUND'
          });
        }
        next(error);
      }
    }
  );

  /**
   * GET /api/sessions/:id
   * Get session details
   */
  router.get('/:id',
    authMiddleware(),
    rateLimitMiddleware('api'),
    validateSessionId,
    async (req, res, next) => {
      try {
        const session = sessionManager.getSession(req.validatedSessionId);

        if (!session) {
          // Check if session exists in tmux
          const exists = await sessionManager.hasSession(req.validatedSessionId);
          if (!exists) {
            return res.status(404).json({
              error: 'Session not found',
              code: 'SESSION_NOT_FOUND'
            });
          }
        }

        // Get metadata
        let metadata = null;
        if (metadataExtractor && session?.project_path) {
          try {
            metadata = await metadataExtractor.getMetadata(
              req.validatedSessionId,
              session.project_path
            );
          } catch {
            // Ignore metadata errors
          }
        }

        res.json({
          ...session,
          metadata,
          has_master: sessionManager.hasMaster(req.validatedSessionId)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /api/sessions/:id/metadata
   * Get session metadata (context usage, tokens, etc.)
   */
  router.get('/:id/metadata',
    authMiddleware(),
    rateLimitMiddleware('metadata'),
    validateSessionId,
    async (req, res, next) => {
      try {
        const session = sessionManager.getSession(req.validatedSessionId);

        if (!session) {
          return res.status(404).json({
            error: 'Session not found',
            code: 'SESSION_NOT_FOUND'
          });
        }

        if (!metadataExtractor) {
          return res.status(503).json({
            error: 'Metadata service unavailable',
            code: 'SERVICE_UNAVAILABLE'
          });
        }

        const metadata = await metadataExtractor.getMetadata(
          req.validatedSessionId,
          session.project_path
        );

        res.json(metadata);
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * DELETE /api/sessions/:id
   * Kill a session
   */
  router.delete('/:id',
    authMiddleware(),
    rateLimitMiddleware('api'),
    validateSessionId,
    async (req, res, next) => {
      try {
        // Check if session exists
        const exists = await sessionManager.hasSession(req.validatedSessionId);
        if (!exists) {
          return res.status(404).json({
            error: 'Session not found',
            code: 'SESSION_NOT_FOUND'
          });
        }

        // Stop metadata polling
        if (metadataExtractor) {
          metadataExtractor.stopPolling(req.validatedSessionId);
        }

        // Kill session
        await sessionManager.killSession(req.validatedSessionId);

        // Log session termination
        auditLogger.logSessionKilled(
          req.user.id,
          req.validatedSessionId,
          getClientIp(req)
        );

        res.json({ message: 'Session terminated successfully' });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * POST /api/sessions/:id/share
   * Generate a share link for viewer access
   */
  router.post('/:id/share',
    authMiddleware(),
    rateLimitMiddleware('api'),
    validateSessionId,
    async (req, res, next) => {
      try {
        const { expiresIn = 3600 } = req.body; // Default 1 hour

        // Check if session exists
        const exists = await sessionManager.hasSession(req.validatedSessionId);
        if (!exists) {
          return res.status(404).json({
            error: 'Session not found',
            code: 'SESSION_NOT_FOUND'
          });
        }

        // Generate share token
        const crypto = require('crypto');
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + expiresIn * 1000);

        // Store token in database
        const db = auditLogger.getDb();
        const hasCreatedByColumn = db.prepare("PRAGMA table_info('share_tokens')").all()
          .some((col) => col.name === 'created_by');

        const insertSql = hasCreatedByColumn
          ? `
            INSERT INTO share_tokens (session_id, token, expires_at, created_by)
            VALUES (?, ?, datetime(?), ?)
          `
          : `
            INSERT INTO share_tokens (session_id, token, expires_at)
            VALUES (?, ?, datetime(?))
          `;

        db.prepare(insertSql.trim()).run(
          req.validatedSessionId,
          token,
          expiresAt.toISOString(),
          hasCreatedByColumn ? req.user.id : undefined
        );

        auditLogger.log({
          userId: req.user.id,
          action: 'share_link_created',
          resourceType: 'session',
          resourceId: req.validatedSessionId,
          details: { expiresAt: expiresAt.toISOString() },
          ipAddress: getClientIp(req)
        });

        res.json({
          token,
          expiresAt: expiresAt.toISOString(),
          url: `/viewer/${req.validatedSessionId}?token=${token}`
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * POST /api/sessions/:id/send
   * Send input to a session (alternative to WebSocket)
   */
  router.post('/:id/send',
    authMiddleware(),
    rateLimitMiddleware('api'),
    validateSessionId,
    async (req, res, next) => {
      try {
        const { input } = req.body;

        if (!input || typeof input !== 'string') {
          return res.status(400).json({
            error: 'Input is required and must be a string',
            code: 'INVALID_INPUT'
          });
        }

        // Check if user is master
        // Note: This is less secure than WebSocket since we can't track client ID
        // In production, require WebSocket for input

        await sessionManager.sendInput(
          req.validatedSessionId,
          input,
          req.user.id // Using user ID as client ID
        );

        res.json({ message: 'Input sent successfully' });
      } catch (error) {
        if (error.message.includes('Only master')) {
          return res.status(403).json({
            error: 'Only the master client can send input',
            code: 'NOT_MASTER'
          });
        }
        next(error);
      }
    }
  );

  /**
   * GET /api/sessions/:id/capture
   * Capture current terminal screen
   */
  router.get('/:id/capture',
    authMiddleware(),
    rateLimitMiddleware('api'),
    validateSessionId,
    async (req, res, next) => {
      try {
        const content = await sessionManager.capturePane(req.validatedSessionId);

        res.json({
          content,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}

module.exports = createSessionRoutes;
