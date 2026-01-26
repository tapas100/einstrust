import rateLimit from 'express-rate-limit';

// ────────────────────────────────────────────────────────────────────────────────
// Rate Limiting Configuration
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Login Rate Limiter
 * 5 attempts per 15 minutes per IP
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Max 5 requests per window
  message: {
    error: true,
    message: 'Too many login attempts. Please try again in 15 minutes.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count all attempts
  handler: (req, res) => {
    res.status(429).json({
      error: true,
      message: 'Too many login attempts from this IP. Please try again in 15 minutes.',
      retryAfter: req.rateLimit.resetTime
    });
  }
});

/**
 * Registration Rate Limiter
 * 3 attempts per hour per IP
 */
export const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Max 3 registrations per hour
  message: {
    error: true,
    message: 'Too many accounts created from this IP. Please try again in 1 hour.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Only count failed attempts
  handler: (req, res) => {
    res.status(429).json({
      error: true,
      message: 'Too many registration attempts. Please try again later.',
      retryAfter: req.rateLimit.resetTime
    });
  }
});

/**
 * Token Refresh Rate Limiter
 * 10 attempts per 15 minutes per IP
 */
export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Max 10 refresh requests
  message: {
    error: true,
    message: 'Too many token refresh attempts. Please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: true,
      message: 'Too many token refresh attempts. Please try again in 15 minutes.',
      retryAfter: req.rateLimit.resetTime
    });
  }
});

/**
 * Password Reset Rate Limiter
 * 3 attempts per hour per IP
 */
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Max 3 password reset requests
  message: {
    error: true,
    message: 'Too many password reset requests. Please try again in 1 hour.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    res.status(429).json({
      error: true,
      message: 'Too many password reset requests. Please try again later.',
      retryAfter: req.rateLimit.resetTime
    });
  }
});

/**
 * General API Rate Limiter
 * 100 requests per 15 minutes per IP
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Max 100 requests per window
  message: {
    error: true,
    message: 'Too many requests. Please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: true,
      message: 'Rate limit exceeded. Please slow down.',
      retryAfter: req.rateLimit.resetTime
    });
  }
});

/**
 * Strict Rate Limiter for Sensitive Operations
 * 3 attempts per hour per IP
 */
export const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: {
    error: true,
    message: 'Too many requests for this sensitive operation. Please try again later.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: true,
      message: 'Operation rate limit exceeded. Please try again in 1 hour.',
      retryAfter: req.rateLimit.resetTime
    });
  }
});

/**
 * Custom rate limiter with dynamic limits based on user authentication
 */
export function createDynamicLimiter(options = {}) {
  return rateLimit({
    windowMs: options.windowMs || 15 * 60 * 1000,
    max: async (req) => {
      // Authenticated users get higher limits
      if (req.user) {
        return options.authenticatedMax || 200;
      }
      return options.anonymousMax || 50;
    },
    message: options.message || {
      error: true,
      message: 'Rate limit exceeded'
    },
    standardHeaders: true,
    legacyHeaders: false
  });
}

// Export all limiters
export default {
  loginLimiter,
  registrationLimiter,
  refreshLimiter,
  passwordResetLimiter,
  apiLimiter,
  strictLimiter,
  createDynamicLimiter
};
