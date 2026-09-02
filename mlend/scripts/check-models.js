/**
 * Sends one real `/format`-shaped request to every model in the cascade and
 * prints what came back.
 *
 * Free models rot: providers rate-limit them, take them offline, or swap the
 * weights behind the same id for a version that narrates its own reasoning into
 * the answer. When QuerySphere starts falling back to the local formatter, run
 * this before touching any other code — it tells you which model in the list
 * stopped answering and whether what it returns is still usable.
 *
 *   npm run check:models --prefix mlend
 */
import dotenv from 'dotenv';
import { MODELS, OPENROUTER_ENDPOINT, getApiKey } from '../src/openrouter.js';

dotenv.config();

const SYSTEM = `You are a friendly chat message formatter. Your job is to lightly polish the user's message:
- Fix spelling and grammar
- Improve punctuation
- Keep the original tone and meaning
- Return ONLY the formatted message, nothing else.`;
const PROBE = 'yo btw idk if u seen it but the new ui r lookin insane tbh';

const key = getApiKey();
if (!key) {
  console.error('No OPENROUTER_API_KEY in mlend/.env — nothing to check.');
  process.exit(1);
}

async function probe(model) {
  const started = Date.now();
  try {
    const res = await fetch(OPENROUTER_ENDPOINT, {
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'X-Title': 'QuerySphere check:models',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: PROBE },
        ],
        // Matches the /format route's budget. A reasoning model spends part of
        // this on its scratchpad before writing anything, so probing with a
        // smaller number reports "empty content" for models that answer fine
        // in production.
        max_tokens: 400,
        temperature: 0.7,
      }),
    });
    const ms = Date.now() - started;
    if (!res.ok) return { model, ms, ok: false, note: `HTTP ${res.status}` };
    const data = await res.json();
    const out = (data.choices?.[0]?.message?.content ?? '').trim();
    if (!out) return { model, ms, ok: false, note: 'empty content' };
    return { model, ms, ok: true, note: out.replace(/\s+/g, ' ').slice(0, 90) };
  } catch (err) {
    return { model, ms: Date.now() - started, ok: false, note: err.message.slice(0, 60) };
  }
}

// In parallel: the point is a snapshot of the tier right now, and serial probes
// would let a slow provider change the conditions the later ones are measured in.
const results = await Promise.all(MODELS.map(probe));

console.log(`\nProbing ${MODELS.length} free models with the /format prompt:\n`);
for (const r of results) {
  console.log(`${r.ok ? '✅' : '❌'} ${r.model.padEnd(42)} ${String(r.ms).padStart(6)}ms  ${r.note}`);
}

const healthy = results.filter((r) => r.ok).length;
console.log(`\n${healthy}/${results.length} answering.`);
// Read the output before trusting the count: a model can return HTTP 200 and
// still be unusable if it answered with a scratchpad instead of the message.
if (healthy === 0) {
  console.log('Cascade is fully down — QuerySphere is serving local fallbacks.');
  process.exit(1);
}
