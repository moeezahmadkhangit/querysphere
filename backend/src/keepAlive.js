/**
 * Self-ping so a free-tier host never idles the service out.
 *
 * Render (and Railway, Fly, Koyeb) spin a free web service down after ~15
 * minutes without inbound traffic. A cold start then costs the next visitor
 * close to a minute — and for this backend it costs more than that: the chat
 * store lives in memory (`src/data/store.js`), so a spin-down wipes every user
 * and message, and every open socket drops.
 *
 * Hitting our own public URL every few minutes counts as inbound traffic and
 * keeps the instance up. The request has to go out to the public hostname and
 * back in through the host's edge — pinging localhost would not register.
 *
 * The URL comes from RENDER_EXTERNAL_URL, which Render injects automatically,
 * so nothing needs configuring there. KEEP_ALIVE_URL overrides it for any other
 * host. With neither set (local dev) the pinger stays off.
 */

const INTERVAL_MS = Number(process.env.KEEP_ALIVE_INTERVAL_MS) || 5 * 60 * 1000;

export function startKeepAlive(path = '/health') {
  const base = process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL;

  if (!base) {
    console.log('💤 Keep-alive off (no KEEP_ALIVE_URL / RENDER_EXTERNAL_URL)');
    return null;
  }

  const target = new URL(path, base).toString();
  const minutes = Math.round(INTERVAL_MS / 60000);
  console.log(`♥️  Keep-alive on — pinging ${target} every ${minutes} min`);

  const ping = async () => {
    try {
      const res = await fetch(target, {
        signal: AbortSignal.timeout(10_000),
        headers: { 'user-agent': 'querysphere-keepalive' },
      });
      if (!res.ok) console.warn(`Keep-alive ping got HTTP ${res.status}`);
    } catch (err) {
      // A failed ping is not fatal — the host may be mid-deploy. Log and retry
      // on the next tick rather than taking the process down.
      console.warn(`Keep-alive ping failed: ${err.message}`);
    }
  };

  const timer = setInterval(ping, INTERVAL_MS);
  // Do not hold the event loop open on its own account.
  timer.unref?.();
  return timer;
}
