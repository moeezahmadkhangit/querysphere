/**
 * Origins allowed through CORS and the socket.io handshake.
 *
 * FRONTEND_URL is a comma-separated list, not a single URL, because one
 * deployment answers on more than one hostname: Vercel serves the project at
 * `<project>.vercel.app` as well as at the custom domain, and a browser sends
 * whichever one the user typed as the Origin header. Allowing only the custom
 * domain means the app looks completely broken on the .vercel.app URL — every
 * request fails CORS and the socket never connects — which is exactly the URL
 * you test on while DNS is still propagating.
 *
 * Each origin is listed explicitly rather than matching `*.vercel.app` with a
 * pattern: this API is served with credentials enabled, and a wildcard would
 * let any site hosted on Vercel call it.
 */
export const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);
