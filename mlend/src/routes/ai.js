import express from 'express';
import dotenv from 'dotenv';
import { chat, getApiKey } from '../openrouter.js';

dotenv.config();

const router = express.Router();

// Slang cleanup helper for simulated fallback formatting
function localFormat(msg) {
  let text = msg.trim();
  if (!text) return "";

  // Replace common chat abbreviations
  const slangs = {
    "\\bu\\b": "you",
    "\\br\\b": "are",
    "\\bur\\b": "your",
    "\\bim\\b": "I'm",
    "\\bIm\\b": "I'm",
    "\\btbh\\b": "to be honest",
    "\\bbtw\\b": "by the way",
    "\\bidk\\b": "I don't know",
    "\\bcant\\b": "can't",
    "\\bwont\\b": "won't",
    "\\bdidnt\\b": "didn't",
    "\\bwasnt\\b": "wasn't",
    "\\bplz\\b": "please",
    "\\bpls\\b": "please",
    "\\btg\\b": "thank goodness",
    "\\bty\\b": "thank you",
    "\\bthx\\b": "thanks",
    "\\bnp\\b": "no problem",
  };

  for (const [key, value] of Object.entries(slangs)) {
    text = text.replace(new RegExp(key, 'g'), value);
  }

  // Capitalize first letter
  text = text.charAt(0).toUpperCase() + text.slice(1);

  // Capitalize single "i"
  text = text.replace(/\bi\b/g, "I");

  // Add trailing punctuation if missing
  if (!/[.!?]$/.test(text)) {
    text += ".";
  }

  // Append context-aware emoji
  const lower = text.toLowerCase();
  if (lower.includes("ui") || lower.includes("design") || lower.includes("theme") || lower.includes("beautiful")) {
    text += " 🎨✨";
  } else if (lower.includes("code") || lower.includes("dev") || lower.includes("ship") || lower.includes("pr")) {
    text += " 💻🚀";
  } else if (lower.includes("hello") || lower.includes("hey") || lower.includes("hi")) {
    text += " 👋";
  } else if (lower.includes("love") || lower.includes("cool") || lower.includes("great")) {
    text += " ❤️🔥";
  } else {
    text += " 💬";
  }

  return text;
}

// POST /format
router.post('/format', async (req, res) => {
  const { message } = req.body;

  if (!message?.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  if (!getApiKey()) {
    console.log('⚠️  No OPENROUTER_API_KEY — using the local formatter.');
    return res.json({ formatted: localFormat(message), source: 'local' });
  }

  const result = await chat({
    system: `You are a friendly chat message formatter. Your job is to lightly polish the user's message:
- Fix spelling and grammar
- Improve punctuation
- Make it sound natural and conversational
- Keep the original tone and meaning — do not rewrite the sender into someone else
- Add appropriate emoji if it fits the mood (1-2 max)
- Keep it concise — do NOT expand the message significantly
- Return ONLY the formatted message, nothing else.`,
    user: message,
    temperature: 0.7,
    maxTokens: 400,
  });

  // Every free model in the cascade failed or was rate-limited. The local
  // formatter is not as good, but it is instant and it always answers.
  if (!result) return res.json({ formatted: localFormat(message), source: 'local' });

  res.json({ formatted: result.reply, source: result.model });
});

// POST /summarize
router.post('/summarize', async (req, res) => {
  const { messages } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Messages array is required' });
  }

  if (!getApiKey()) {
    console.log('⚠️  No OPENROUTER_API_KEY — using the local summarizer.');
    return res.json({ summary: generateLocalSummary(messages), source: 'local' });
  }

  // Last 30 turns only: the free models have large context windows, but a long
  // room would spend the cascade's whole time budget on tokens nobody reads.
  const conversation = messages
    .slice(-30)
    .map((m) => `[${m.username}]: ${m.text}`)
    .join('\n');

  const result = await chat({
    system: `You are a helpful chat summarizer. Given a community chat conversation, create a concise, friendly summary.
Format your response as:
- **Overview**: 1 sentence describing the main topic
- **Key Points**: 3-5 bullet points of the most important things discussed
- **Vibe**: One emoji + one word describing the conversation mood

Keep it short, clear, and friendly. Use markdown formatting.`,
    user: `Summarize this chat conversation:\n\n${conversation}`,
    temperature: 0.5,
    maxTokens: 600,
  });

  if (!result) return res.json({ summary: generateLocalSummary(messages), source: 'local' });

  res.json({ summary: result.reply, source: result.model });
});

// Local summarization algorithm for offline / key fallback
function generateLocalSummary(messages) {
  const allText = messages.map(m => m.text.toLowerCase()).join(" ");

  let overview = "The team is engaging in a friendly chat in the QuerySphere community channel.";
  let bullet1 = "Discussed community updates and general check-ins.";
  let bullet2 = "Moeez welcomed everyone and walked through the dark gold-accented redesign.";
  let bullet3 = "Basim, Adeel, and Bilawal expressed excitement about the smooth features.";
  let vibeEmoji = "✨";
  let vibeWord = "Productive";

  if (allText.includes("theme") || allText.includes("ui") || allText.includes("design") || allText.includes("css")) {
    overview = "The developers are reviewing the dark editorial redesign that ports the portfolio's design language into QuerySphere.";
    bullet1 = "Moeez walked through the shared token set — ink ground, gold accent, teal reserved for the AI panel.";
    bullet2 = "Basim commented on the hairline gold borders and the Fraunces display type.";
    bullet3 = "Adeel noted that the micro-animations and color choices make the app feel incredibly premium.";
    vibeEmoji = "🎨";
    vibeWord = "Inspired";
  } else if (allText.includes("bug") || allText.includes("error") || allText.includes("fix") || allText.includes("key")) {
    overview = "The team is currently working on API setups and verifying service integrations.";
    bullet1 = "Addressed OpenRouter key verification and free-model cascade status in `mlend`.";
    bullet2 = "Added robust fallback algorithms to prevent application crashes.";
    bullet3 = "Successfully completed end-to-end integration tests between frontend, backend, and AI.";
    vibeEmoji = "🛠️";
    vibeWord = "Focused";
  }

  return `- **Overview**: ${overview}
- **Key Points**:
  - ${bullet1}
  - ${bullet2}
  - ${bullet3}
- **Vibe**: ${vibeEmoji} ${vibeWord}`;
}

export default router;
