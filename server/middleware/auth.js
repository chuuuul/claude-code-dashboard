/**
 * Authentication middleware
 * JWT token verification for protected routes
 */

const jwt = require('jsonwebtoken');

/**
 * Verify JWT token in Authorization header
 * @param {Object} options - Middleware options
 * @param {boolean} options.optional - If true, allow unauthenticated requests
 * @returns {Function} Express middleware
 */
function authMiddleware(options = {}) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;

    // Check for token
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      if (options.optional) {
        return next();
      }
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer '

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Check token type
      if (decoded.type !== 'access') {
        return res.status(401).json({
          error: 'Invalid token type',
          code: 'INVALID_TOKEN_TYPE'
        });
      }

      // Attach user to request
      req.user = {
        id: decoded.userId,
        username: decoded.username,
        role: decoded.role
      };

      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: 'Token expired',
          code: 'TOKEN_EXPIRED'
        });
      }

      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          error: 'Invalid token',
          code: 'INVALID_TOKEN'
        });
      }

      return res.status(500).json({
        error: 'Authentication failed',
        code: 'AUTH_ERROR'
      });
    }
  };
}

/**
 * Require admin role
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Admin access required',
      code: 'FORBIDDEN'
    });
  }

  next();
}

/**
 * Get client IP address
 */
function getClientIp(req) {
  // Handle proxied requests
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.connection.remoteAddress;
}

module.exports = {
  authMiddleware,
  requireAdmin,
  getClientIp
};
