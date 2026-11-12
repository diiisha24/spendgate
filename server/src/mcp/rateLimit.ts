import type { NextFunction, Request, Response } from 'express';

/**
 * Minimal fixed-window rate limiter (per client IP, in memory). Adequate for a
 * single-instance MVP; use a shared store (e.g. Redis) when scaling out.
 */
export function rateLimit(limitPerMinute: number) {
  const windowMs = 60_000;
  const hits = new Map<string, { count: number; windowStart: number }>();

  // Periodically drop stale entries so memory stays bounded.
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (now - entry.windowStart > windowMs) hits.delete(key);
    }
  }, windowMs).unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || now - entry.windowStart > windowMs) {
      hits.set(key, { count: 1, windowStart: now });
      next();
      return;
    }

    entry.count += 1;
    if (entry.count > limitPerMinute) {
      const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);
      res
        .status(429)
        .set('Retry-After', String(retryAfter))
        .json({ jsonrpc: '2.0', error: { code: -32000, message: 'Too many requests' }, id: null });
      return;
    }
    next();
  };
}
