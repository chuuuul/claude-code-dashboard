/**
 * Authentication routes
 * Login, logout, token refresh, user management
 *
 * Security: Refresh tokens are stored in HttpOnly cookies to prevent XSS theft
 */

const express = require('express');
const router = express.Router();

const { authMiddleware, requireAdmin, getClientIp } = require('../middleware/auth');
const { rateLimitMiddleware } = require('../middleware/rateLimiter');
const { validateLogin, validateUserCreate } = require('../middleware/validator');

// Cookie configuration for refresh tokens
const REFRESH_TOKEN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/api/auth' // Only send to auth endpoints
};

/**
 * Initialize auth routes with dependencies
 * @param {AuthService} authService
 * @param {AuditLogger} auditLogger
 * @param {Function} csrfProtection
 */
function createAuthRoutes(authService, auditLogger, csrfProtection) {
  /**
   * POST /api/auth/login
   * Login with username and password
   */
  router.post('/login',
    rateLimitMiddleware('login'),
    validateLogin,
    async (req, res, next) => {
      try {
        const result = await authService.login(
          req.validatedUsername,
          req.validatedPassword
        );

        // Log successful login
        auditLogger.logLogin(
          result.user.id,
          result.user.username,
          getClientIp(req),
          req.headers['user-agent']
        );

        // Set refresh token in HttpOnly cookie
        res.cookie('refreshToken', result.refreshToken, REFRESH_TOKEN_COOKIE_OPTIONS);

        // Only return access token in response body (not refresh token)
        res.json({
          accessToken: result.accessToken,
          user: result.user
        });
      } catch (error) {
        // Log failed login
        auditLogger.logLoginFailed(
          req.validatedUsername,
          getClientIp(req),
          req.headers['user-agent']
        );

        if (error.message === 'Invalid credentials') {
          return res.status(401).json({
            error: 'Invalid username or password',
            code: 'INVALID_CREDENTIALS'
          });
        }

        next(error);
      }
    }
  );

  /**
   * POST /api/auth/refresh
   * Refresh access token using refresh token from HttpOnly cookie
   */
  router.post('/refresh',
    rateLimitMiddleware('tokenRefresh'),
    csrfProtection,
    async (req, res, next) => {
      try {
        // Get refresh token from HttpOnly cookie (preferred) or body (legacy/fallback)
        const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

        if (!refreshToken) {
          return res.status(400).json({
            error: 'Refresh token is required',
            code: 'MISSING_REFRESH_TOKEN'
          });
        }

        const tokens = await authService.refreshTokens(refreshToken);

        // Log token refresh
        const decoded = authService.verifyAccessToken(tokens.accessToken);
        auditLogger.logTokenRefresh(decoded.userId, getClientIp(req));

        // Update HttpOnly cookie with new refresh token
        res.cookie('refreshToken', tokens.refreshToken, REFRESH_TOKEN_COOKIE_OPTIONS);

        // Only return access token in response body
        res.json({
          accessToken: tokens.accessToken
        });
      } catch (error) {
        // Clear invalid refresh token cookie
        res.clearCookie('refreshToken', { path: '/api/auth' });

        if (error.message.includes('Invalid') || error.message.includes('expired')) {
          return res.status(401).json({
            error: error.message,
            code: 'INVALID_REFRESH_TOKEN'
          });
        }
        next(error);
      }
    }
  );

  /**
   * POST /api/auth/logout
   * Revoke refresh token and clear cookie
   */
  router.post('/logout',
    csrfProtection,
    authMiddleware(),
    async (req, res, next) => {
      try {
        // Get refresh token from cookie (preferred) or body
        const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

        if (refreshToken) {
          await authService.revokeRefreshToken(refreshToken);
        }

        // Clear the HttpOnly cookie
        res.clearCookie('refreshToken', { path: '/api/auth' });

        // Log logout
        auditLogger.logLogout(req.user.id, getClientIp(req));

        res.json({ message: 'Logged out successfully' });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * POST /api/auth/logout-all
   * Revoke all refresh tokens for user (logout all devices)
   */
  router.post('/logout-all',
    authMiddleware(),
    async (req, res, next) => {
      try {
        await authService.revokeAllUserTokens(req.user.id);

        auditLogger.log({
          userId: req.user.id,
          action: 'logout_all_devices',
          resourceType: 'auth',
          ipAddress: getClientIp(req)
        });

        res.json({ message: 'Logged out from all devices' });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /api/auth/me
   * Get current user info
   */
  router.get('/me',
    authMiddleware(),
    async (req, res, next) => {
      try {
        const user = authService.getUser(req.user.id);

        if (!user) {
          return res.status(404).json({
            error: 'User not found',
            code: 'USER_NOT_FOUND'
          });
        }

        res.json(user);
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * POST /api/auth/change-password
   * Change current user's password
   */
  router.post('/change-password',
    authMiddleware(),
    async (req, res, next) => {
      try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
          return res.status(400).json({
            error: 'Current and new password are required',
            code: 'MISSING_PASSWORDS'
          });
        }

        if (newPassword.length < 8) {
          return res.status(400).json({
            error: 'New password must be at least 8 characters',
            code: 'INVALID_PASSWORD_LENGTH'
          });
        }

        await authService.changePassword(req.user.id, currentPassword, newPassword);

        auditLogger.log({
          userId: req.user.id,
          action: 'password_changed',
          resourceType: 'auth',
          ipAddress: getClientIp(req)
        });

        res.json({ message: 'Password changed successfully' });
      } catch (error) {
        if (error.message === 'Current password is incorrect') {
          return res.status(400).json({
            error: error.message,
            code: 'INCORRECT_PASSWORD'
          });
        }
        next(error);
      }
    }
  );

  /**
   * POST /api/auth/users (Admin only)
   * Create a new user
   */
  router.post('/users',
    authMiddleware(),
    requireAdmin,
    rateLimitMiddleware('api'),
    validateUserCreate,
    async (req, res, next) => {
      try {
        const userId = await authService.createUser(
          req.validatedUsername,
          req.validatedPassword,
          req.validatedRole
        );

        auditLogger.log({
          userId: req.user.id,
          action: 'user_created',
          resourceType: 'auth',
          resourceId: userId,
          details: { username: req.validatedUsername, role: req.validatedRole },
          ipAddress: getClientIp(req)
        });

        res.status(201).json({
          id: userId,
          username: req.validatedUsername,
          role: req.validatedRole
        });
      } catch (error) {
        if (error.message === 'Username already exists') {
          return res.status(409).json({
            error: error.message,
            code: 'USERNAME_EXISTS'
          });
        }
        next(error);
      }
    }
  );

  /**
   * GET /api/csrf-token
   * Get CSRF token for forms
   */
  router.get('/csrf-token', csrfProtection, (req, res) => {
    res.json({ csrfToken: req.csrfToken() });
  });

  return router;
}

module.exports = createAuthRoutes;
