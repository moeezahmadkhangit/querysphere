/**
 * OpenRouter client for QuerySphere's AI microservice.
 *
 * QuerySphere runs on OpenRouter's free tier: every model in the cascade below
 * is a `:free` variant, so a reply costs nothing. Free models are also the
 * least reliable models on the platform — they rate-limit without warning and
 * individual providers drop offline — so a single model id would leave the
 * chat falling back to the local formatter most of the day. The cascade tries
 * them in order and returns the first clean answer.
 */

export const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * The cascade, ordered by a live probe of every `:free` model OpenRouter listed
 * on 2026-09-02, run against QuerySphere's own `/format` prompt.
 *
 * Order is measurement, not reputation. The excluded models are listed at the
 * bottom of this comment because "why isn't the big one in here" is the first
 * question anyone reading this will have.
 *
 * Excluded on measurement:
 *   nvidia/nemotron-3.5-lightning:free  — returned its scratchpad as the answer
 *                                         ("Here's a thinking process: 1. Analyze
 *                                         User Input..."). Unusable for a feature
 *                                         whose output goes straight into a chat box.
 *   minimax/minimax-m2.7:free           — answered the message instead of formatting
 *                                         it. Ignores the system prompt's job.
 *   thinkingmachines/inkling*:free      — HTTP 403, "only available on agentic
 *                                         harnesses".
 *
 * Re-run `npm run check:models` when replies start falling back to the local
 * formatter; a free model that has gone permanently 429 belongs at the back or
 * out of the list.
 */
export const MODELS = [
  // Primary. 1.6s, no reasoning tokens, and the only model in the probe that
  // kept the sender's voice ("Yo, btw...") instead of rewriting them into a
  // stranger. That matters more here than raw model size: this feature polishes
  // someone's chat message, it does not author a new one.
  'minimax/minimax-m3:free',
  // 1.4s, no reasoning tokens, clean prose. Same model the portfolio site's
  // chat cascade leans on.
  'poolside/laguna-s-2.1:free',
  // Fast and clean content. Spends some completion budget reasoning first,
  // which `max_tokens` has to cover — see MAX_OUTPUT_TOKENS.
  'nvidia/nemotron-3-super-120b-a12b:free',
  // Clean content, sub-second. Also a reasoning model.
  'inclusionai/ling-3.0-flash-fin:free',
  // Both were HTTP 429 across the whole probe, so neither is measured. They sit
  // at the back rather than being deleted: they cost nothing to keep, and a
  // free tier that is rate-limited this hour is usually fine the next.
  'google/gemma-4-31b-it:free',
  'z-ai/glm-5.2:free',
];

/**
 * Per-model deadline. Without it, one hung provider stalls the whole cascade
 * and the user watches a spinner until the browser gives up.
 *
 * 15s: the slowest CLEAN model in the probe answered in 1.6s, but free-tier
 * providers queue requests behind paid traffic, so the median is not the number
 * to size this against.
 */
export const MODEL_TIMEOUT_MS = 15_000;

/**
 * The cascade's own wall clock. Six models at MODEL_TIMEOUT_MS each is a minute
 * and a half of a user waiting on a "✨ Format" button. When the budget runs
 * out the caller falls back to the local formatter, which answers instantly and
 * answers well enough.
 */
export const CASCADE_BUDGET_MS = 35_000;

/** Covers a reasoning model's scratchpad plus the actual reply. */
export const MAX_OUTPUT_TOKENS = 700;

/**
 * Returns the configured key, or null when the service should run in local
 * fallback mode. Treats the placeholder from `.env.example` as absent so a
 * checkout that copied the example verbatim degrades gracefully instead of
 * sending `your_openrouter_api_key_here` to OpenRouter six times.
 */
export function getApiKey(env = process.env) {
  const key = env.OPENROUTER_API_KEY;
  if (!key || key.trim() === '' || key === 'your_openrouter_api_key_here') return null;
  return key.trim();
}

/**
 * Some free models emit their chain of thought inside the content field even
 * when the API also exposes it separately. Anything the model wrapped in a
 * think-tag is scratchpad, never the answer.
 */
function stripReasoning(text) {
  return text
    .replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, '')
    .replace(/^<(think|thinking|reasoning)>[\s\S]*$/i, '')
    .trim();
}

/**
 * Runs the cascade and returns the first non-empty reply, or null when every
 * model failed, timed out, or the budget ran out. Callers treat null as "use
 * the local fallback" — this function never throws.
 */
export async function chat({
  system,
  user,
  temperature = 0.7,
  maxTokens = MAX_OUTPUT_TOKENS,
  apiKey = getApiKey(),
  fetchImpl = fetch,
  clock = () => Date.now(),
  models = MODELS,
}) {
  if (!apiKey) return null;

  const deadline = clock() + CASCADE_BUDGET_MS;

  for (const model of models) {
    // Stop before starting a call that cannot finish inside the budget: better
    // to hand back the local fallback now than to spend the last seconds on a
    // request the user will never see.
    const remaining = deadline - clock();
    if (remaining <= 0) break;

    try {
      const res = await fetchImpl(OPENROUTER_ENDPOINT, {
        method: 'POST',
        signal: AbortSignal.timeout(Math.min(MODEL_TIMEOUT_MS, remaining)),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://querysphere.local',
          'X-Title': 'QuerySphere',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          max_tokens: maxTokens,
          temperature,
        }),
      });

      // 429 (free tier exhausted) and 5xx (provider down) are the common cases
      // and both mean the same thing here: try the next model.
      if (!res.ok) {
        console.warn(`[openrouter] ${model} → HTTP ${res.status}, trying next`);
        continue;
      }

      const data = await res.json();
      const reply = stripReasoning(data.choices?.[0]?.message?.content ?? '');
      if (!reply) {
        console.warn(`[openrouter] ${model} → empty content, trying next`);
        continue;
      }

      console.log(`[openrouter] ${model} → ok`);
      return { reply, model };
    } catch (err) {
      console.warn(`[openrouter] ${model} → ${err.name}: ${err.message}, trying next`);
      continue;
    }
  }

  console.warn('[openrouter] every free model failed — falling back to local');
  return null;
}
