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

/**
 * Enabled only by an explicit opt-in, never by the host's own environment.
 *
 * The pinger used to start whenever a public URL could be resolved — and on
 * Render that is always, because RENDER_EXTERNAL_URL is injected into every
 * service automatically. So both services kept themselves awake around the
 * clock: roughly 1460 instance-hours a month against a free allowance of 750,
 * shared across the whole workspace. The hours run out in the middle of the
 * month and Render suspends the free services, which takes down the very
 * backend the pinger exists to protect.
 *
 * Setting KEEP_ALIVE_INTERVAL_MS or KEEP_ALIVE_URL is a decision somebody made
 * on purpose. RENDER_EXTERNAL_URL is not, so on its own it no longer counts —
 * it is still where the URL comes from once the pinger is switched on.
 */
const OPT_IN = process.env.KEEP_ALIVE_INTERVAL_MS || process.env.KEEP_ALIVE_URL;

const INTERVAL_MS = Number(process.env.KEEP_ALIVE_INTERVAL_MS) || 5 * 60 * 1000;

/**
 * Whether the pinger is actually running, reported on /health.
 *
 * Turning the pinger into an opt-in made it possible to deploy with it
 * silently off — the service looks perfectly healthy right up until it is
 * idled out fifteen minutes later, and the only way to find out was to read
 * the boot log or wait for the outage. A service that depends on a background
 * task to stay alive should be able to say whether that task is running.
 *
 * Nothing here is sensitive: the target is the service's own public hostname.
 */
let state = { enabled: false, everyMinutes: null, target: null, lastPingAt: null, lastPingOk: null };

export function keepAliveStatus() {
  return { ...state };
}

export function startKeepAlive(path = '/health') {
  if (!OPT_IN) {
    console.log('💤 Keep-alive off (set KEEP_ALIVE_INTERVAL_MS to switch it on)');
    return null;
  }

  const base = process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL;

  if (!base) {
    console.log('💤 Keep-alive off (no KEEP_ALIVE_URL / RENDER_EXTERNAL_URL to ping)');
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
      state.lastPingAt = new Date().toISOString();
      state.lastPingOk = res.ok;
      if (!res.ok) console.warn(`Keep-alive ping got HTTP ${res.status}`);
    } catch (err) {
      state.lastPingAt = new Date().toISOString();
      state.lastPingOk = false;
      // A failed ping is not fatal — the host may be mid-deploy. Log and retry
      // on the next tick rather than taking the process down.
      console.warn(`Keep-alive ping failed: ${err.message}`);
    }
  };

  const timer = setInterval(ping, INTERVAL_MS);
  // Do not hold the event loop open on its own account.
  timer.unref?.();

  state = { enabled: true, everyMinutes: minutes, target, lastPingAt: null, lastPingOk: null };
  return timer;
}
