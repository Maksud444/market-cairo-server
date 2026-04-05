/**
 * Simple in-memory cache with TTL (Time To Live).
 * No external dependency — suitable for single-server or Vercel deployments.
 * For multi-instance deployments, replace with Redis.
 */

const store = new Map();

/**
 * Get a cached value. Returns null if expired or not found.
 */
function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

/**
 * Set a value in cache.
 * @param {string} key
 * @param {*} value
 * @param {number} ttlSeconds - time to live in seconds (default 5 min)
 */
function set(key, value, ttlSeconds = 300) {
  store.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

/**
 * Delete a specific key or all keys matching a prefix.
 */
function del(keyOrPrefix) {
  for (const key of store.keys()) {
    if (key === keyOrPrefix || key.startsWith(keyOrPrefix)) {
      store.delete(key);
    }
  }
}

/**
 * Express middleware factory — caches JSON responses.
 * @param {number} ttlSeconds
 */
function cacheMiddleware(ttlSeconds = 300) {
  return (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') return next();

    const key = `route:${req.originalUrl}`;
    const cached = get(key);
    if (cached) {
      return res.json(cached);
    }

    // Intercept res.json to store the response
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      // Only cache successful responses
      if (res.statusCode === 200 && data?.success) {
        set(key, data, ttlSeconds);
      }
      return originalJson(data);
    };

    next();
  };
}

module.exports = { get, set, del, cacheMiddleware };
