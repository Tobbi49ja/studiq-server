// Rate limiting middleware to prevent LLM abuse
// Simple in-memory rate limiter (use Redis in production)

const rateLimits = new Map(); // userId -> { count, resetTime }

const RATE_LIMIT = {
  // Max requests per window
  maxRequests: 10,
  // Window in milliseconds (1 minute)
  windowMs: 60 * 1000,
  // Max chars per request
  maxCharsPerRequest: 40000
};

/**
 * Clean up expired entries periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [userId, data] of rateLimits) {
    if (now > data.resetTime) {
      rateLimits.delete(userId);
    }
  }
}, 5 * 60 * 1000); // Clean every 5 minutes

/**
 * Rate limiting middleware
 */
export function rateLimit(req, res, next) {
  const userId = req.user?.id;
  if (!userId) return next();

  const now = Date.now();
  const userLimit = rateLimits.get(userId);

  if (!userLimit || now > userLimit.resetTime) {
    // New window
    rateLimits.set(userId, {
      count: 1,
      resetTime: now + RATE_LIMIT.windowMs
    });
    return next();
  }

  if (userLimit.count >= RATE_LIMIT.maxRequests) {
    const retryAfter = Math.ceil((userLimit.resetTime - now) / 1000);
    return res.status(429).json({
      error: 'Too many requests. Please wait a moment before trying again.',
      retryAfter
    });
  }

  userLimit.count++;
  next();
}

/**
 * Check input size
 */
export function checkInputSize(req, res, next) {
  const contentLength = req.headers['content-length'];
  const maxSize = 10 * 1024 * 1024; // 10MB

  if (contentLength && parseInt(contentLength) > maxSize) {
    return res.status(413).json({
      error: 'File too large. Maximum size is 10MB.'
    });
  }

  next();
}

export { RATE_LIMIT };
