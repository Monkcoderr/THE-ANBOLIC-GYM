/**
 * Simple in-memory rate limiter (per-IP) for the login route.
 * Note: in a serverless multi-instance deployment this is best-effort only,
 * but it satisfies the "5 attempts per 15 minutes" requirement per instance.
 */
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

const store = global.__loginRateLimit || new Map();
if (!global.__loginRateLimit) global.__loginRateLimit = store;

/**
 * Returns { allowed, remaining, retryAfterMs } for a given key (IP).
 * Does NOT consume an attempt — call recordFailure() on a failed login.
 */
export function checkRateLimit(key) {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now - entry.first > WINDOW_MS) {
    return { allowed: true, remaining: MAX_ATTEMPTS, retryAfterMs: 0 };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: WINDOW_MS - (now - entry.first),
    };
  }

  return {
    allowed: true,
    remaining: MAX_ATTEMPTS - entry.count,
    retryAfterMs: 0,
  };
}

/**
 * Record a failed login attempt for a key.
 */
export function recordFailure(key) {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || now - entry.first > WINDOW_MS) {
    store.set(key, { count: 1, first: now });
  } else {
    entry.count += 1;
    store.set(key, entry);
  }
}

/**
 * Clear attempts for a key after a successful login.
 */
export function resetRateLimit(key) {
  store.delete(key);
}
