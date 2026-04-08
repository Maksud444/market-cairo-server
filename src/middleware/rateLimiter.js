const rateLimit = require('express-rate-limit');

// Generic rate limit error handler
const handler = (req, res) => {
  res.status(429).json({
    success: false,
    message: 'Too many requests. Please wait a moment and try again.',
  });
};

// Auth endpoints (login, register, forgot-password)
// 50 attempts per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});

// General API limiter — 1000 req / 15 min per IP
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});

// Search/browse endpoints — 300 req / minute per IP
const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});

// File upload endpoints — 30 req / 10 minutes per IP
const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});

module.exports = { authLimiter, apiLimiter, searchLimiter, uploadLimiter };
