/**
 * A small fixed-window rate limiter, in memory.
 *
 * The auth routes had no limit of any kind: a script could post to
 * /api/auth/login as fast as the event loop would answer, which with a
 * six-character minimum password is a workable offline-speed online attack.
 * Registration was equally open — each call runs a cost-12 bcrypt hash, so it
 * doubled as a way to peg the CPU of a free-tier instance.
 *
 * In memory is the right size for this app (one process, no shared cache) and
 * has one honest limitation: a restart forgets the counters. It is a speed bump
 * against scripted guessing, not a defence against a distributed attacker.
 */

const buckets = new Map(); // key => { count, resetAt }

// Sweep expired buckets so a long-running process does not accumulate one entry
// per address ever seen. `unref` keeps the timer from holding the process open.
const SWEEP_MS = 60_000;
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, SWEEP_MS).unref();

/**
 * @param {object} options
 * @param {number} options.windowMs   width of the window
 * @param {number} options.max        requests allowed per key per window
 * @param {(req) => string} options.keyOf  what counts as "the same caller"
 */
export function rateLimit({ windowMs, max, keyOf }) {
  return (req, res, next) => {
    const key = keyOf(req);
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: `Too many attempts. Try again in ${Math.ceil(retryAfter / 60)} minute(s).`,
      });
    }
    next();
  };
}

/** Drop a caller's counter — called after a success so honest users are not punished. */
export function resetLimit(key) {
  buckets.delete(key);
}

/**
 * Behind a proxy (Render, Vercel, any load balancer) `req.ip` is the proxy's
 * address, so every user shares one bucket and one attacker locks out the world.
 * The client address is read from the forwarded header when the app is
 * configured to trust its proxy, which is exactly what `trust proxy` means.
 */
export function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}
