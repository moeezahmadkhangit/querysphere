import dotenv from 'dotenv';

/**
 * Environment loading, isolated so it can be made to happen FIRST.
 *
 * `dotenv.config()` used to sit in the body of index.js, below its imports.
 * ES module imports are hoisted and evaluated before any statement in the
 * importing file, so every module in the graph — the store, which now reads
 * DATA_ENCRYPTION_KEY at load time to decrypt the file on disk — saw an
 * environment that had not been populated yet. It happened to work only
 * because nothing used to read env at import time.
 *
 * Importing this module for its side effect, as the very first import in
 * index.js, makes the ordering explicit rather than accidental.
 */
dotenv.config();

/**
 * Fail loudly and immediately when JWT_SECRET is missing.
 *
 * Without this the server starts fine and every register and login throws
 * `secretOrPrivateKey must have a value` from deep inside jsonwebtoken, which
 * the route turns into a generic 500. What a reviewer sees is "Registration
 * failed" on the auth screen with a healthy-looking server log — the one clue
 * that matters (you did not create backend/.env) never reaches them.
 */
if (!process.env.JWT_SECRET) {
  console.error('\n❌ JWT_SECRET is not set. Copy backend/.env.example to backend/.env before starting.\n');
  process.exit(1);
}

/**
 * Fatal everywhere, production included.
 *
 * This was briefly a warning in production, on the reasoning that refusing to
 * boot would take a running site down. That reasoning was wrong: Render — and
 * every host with a health check — does not promote a deploy that fails to
 * start, so the previous version keeps serving and the operator gets a clear
 * error. The cost of failing hard is a red deploy, not an outage.
 *
 * The cost of not failing is much higher. Tokens are signed with this value and
 * carry nothing but a user id, so a guessable secret is not a weak password —
 * it lets anyone mint a valid token for any account in the app. A warning in a
 * log nobody reads is not a control.
 */
if (process.env.JWT_SECRET.length < 32) {
  console.error('\n❌ JWT_SECRET is too short — tokens signed with it are forgeable.');
  console.error('   Generate a real one: openssl rand -hex 32\n');
  process.exit(1);
}

/**
 * The example file ships a placeholder so the app runs out of the box. Shipping
 * it to production would mean anyone who has read this repository can forge a
 * login token for any account.
 */
if (process.env.NODE_ENV === 'production' && /replace_me|change_me|example/i.test(process.env.JWT_SECRET)) {
  console.error('\n❌ JWT_SECRET is still the example placeholder. Generate your own: openssl rand -hex 32\n');
  process.exit(1);
}
