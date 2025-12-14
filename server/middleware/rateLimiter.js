/**
 * Rate limiting middleware
 * Prevents abuse and brute force attacks
 */

const { RateLimiterMemory } = require('rate-limiter-flexible');

// Rate limiter configurations
const limiters = {
  // Login: 5 attempts per minute, 5 minute block on exceed
  login: new RateLimiterMemory({
    points: 5,
    duration: 60,
    blockDuration: 300
  }),

  // General API: 60 requests per minute
  api: new RateLimiterMemory({
    points: 60,
    duration: 60
  }),

  // File write: 30 requests per minute
  fileWrite: new RateLimiterMemory({
    points: 30,
    duration: 60
  }),

  // Session creation: 10 per minute
  sessionCreate: new RateLimiterMemory({
    points: 10,
    duration: 60
  }),

  // Tunnel operations: 1 per hour
  tunnel: new RateLimiterMemory({
    points: 1,
    duration: 3600
  }),

  // Token refresh: 10 per minute
  tokenRefresh: new RateLimiterMemory({
    points: 10,
    duration: 60
  }),

  // Metadata requests: 120 per minute (high frequency)
  metadata: new RateLimiterMemory({
    points: 120,
    duration: 60
  })
};

/**
 * Create rate limit middleware
 * @param {string} limiterName - Name of the rate limiter to use
 * @returns {Function} Express middleware
 */
function rateLimitMiddleware(limiterName) {
  const limiter = limiters[limiterName];

  if (!limiter) {
    console.warn(`[RateLimiter] Unknown limiter: ${limiterName}, using default 'api'`);
    return rateLimitMiddleware('api');
  }

  return async (req, res, next) => {
    // Use IP as key, with user ID if authenticated
    const key = req.user ? `${req.ip}_${req.user.id}` : req.ip;

    try {
      await limiter.consume(key);
      next();
    } catch (rateLimiterRes) {
      const retryAfter = Math.ceil(rateLimiterRes.msBeforeNext / 1000);

      res.set('Retry-After', retryAfter);
      res.set('X-RateLimit-Limit', limiter.points);
      res.set('X-RateLimit-Remaining', 0);
      res.set('X-RateLimit-Reset', new Date(Date.now() + rateLimiterRes.msBeforeNext).toISOString());

      res.status(429).json({
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: retryAfter
      });
    }
  };
}

/**
 * Add rate limit headers to response
 * @param {string} limiterName - Name of the rate limiter
 */
function rateLimitHeaders(limiterName) {
  const limiter = limiters[limiterName] || limiters.api;

  return async (req, res, next) => {
    const key = req.user ? `${req.ip}_${req.user.id}` : req.ip;

    try {
      const rateLimiterRes = await limiter.get(key);

      if (rateLimiterRes) {
        res.set('X-RateLimit-Limit', limiter.points);
        res.set('X-RateLimit-Remaining', Math.max(0, limiter.points - rateLimiterRes.consumedPoints));
        res.set('X-RateLimit-Reset', new Date(Date.now() + rateLimiterRes.msBeforeNext).toISOString());
      }
    } catch (error) {
      // Ignore errors in header setting
    }

    next();
  };
}

module.exports = {
  rateLimitMiddleware,
  rateLimitHeaders,
  limiters
};
