# 🔮 QuerySphere — AI-Powered Community Chat

QuerySphere is a real-time community messaging app with an AI microservice that polishes your drafts and recaps a room. It runs entirely on **OpenRouter's free model tier**, so the AI features cost nothing to operate.

The interface is a port of the design system from [moeezahmadkhan.com](https://moeezahmadkhan.com) — the two properties are meant to read as one designer's work.

---

## 🎨 Design system

Dark editorial, ported token-for-token from the portfolio's `styles/tokens.css`:

| | |
|---|---|
| **Ground** | `--ink #07070d`, panels `--surface #0e0e17`, recessed `--surface-2 #14141f` |
| **Lines** | one hairline, `rgb(231 194 125 / 0.14)` — depth comes from borders, not shadows |
| **Gold** `#e7c27d` | the only accent on a human surface: active channel, your own message, the primary button |
| **Teal** `#5fd3c6` | reserved for the machine — the AI panel and the ✨ Format button, and nothing else |
| **Type** | Fraunces (display), Geist (body), JetBrains Mono (labels, timestamps, model ids) |
| **Spacing** | 8px scale, nothing outside it. Three radii: 4px, 12px, pill |

Two rules are worth stating because they are easy to break by accident:

- **Gold is the only accent on a human surface.** If something needs to be noticed, it is gold.
- **Teal means software is talking.** The simulated developers (Basim, Adeel, Bilawal) are *not* the machine for this purpose — they are people in the app's fiction, so they render like anyone else and carry a small mono `sim` tag instead. A teal bubble signed "Adeel" would destroy the distinction the colour exists to make.

The previous build was soft neumorphism on a light ground. None of it survives.

---

## 🤖 The AI service, and why it is a cascade

`mlend` calls OpenRouter and only ever asks for `:free` models. Free models are also the least reliable models on the platform — they rate-limit without warning and individual providers drop offline — so a single model id would leave the app serving local fallbacks most of the day. It tries several in order and takes the first clean answer:

```
minimax/minimax-m3:free                 ← primary: fastest clean answer, best at keeping the sender's voice
poolside/laguna-s-2.1:free
nvidia/nemotron-3-super-120b-a12b:free
inclusionai/ling-3.0-flash-fin:free
google/gemma-4-31b-it:free
z-ai/glm-5.2:free
```

The order is measurement, not reputation — see the comments in `mlend/src/openrouter.js` for what each model actually returned and which ones were excluded (one narrated its own scratchpad into the answer; another answered the message instead of formatting it).

**Check the tier's health at any time:**

```bash
npm run check:models --prefix mlend
```

It sends one real request per model and prints latency and output. A run where only 2 or 3 of 6 answer is normal — that is exactly the condition the cascade exists for.

**If every model fails**, the service falls back to a local formatter and summarizer. They are not as good, but they are instant and they always answer. The AI panel labels which model produced a summary, so you can always tell.

**Cost and limits:** free models cost nothing per request. An OpenRouter account with credits purchased gets 1000 free-model requests/day; a key with no credits gets 50/day.

---

## ✨ Features

- 🔐 **JWT auth** — register and sign in, token in localStorage.
- 📡 **Real-time chat** over Socket.io — channels, typing indicators, emoji reactions.
- 👥 **Simulated developers** reply with a realistic typing delay ~40% of the time, tagged `sim`.
- ✨ **AI message formatting** — polish a messy draft before you send it.
- 📋 **AI conversation summary** — Overview / Key Points / Vibe, with the answering model named.
- 🛡️ **Local fallbacks** for both AI features when the free tier is down.
- 📞 **Call overlay** — a UI mockup, not a working call.
- 📱 **Narrow screens** — the sidebar and AI panel become slide-overs rather than disappearing.

---

## ⚙️ Layout

```
querysphere/
├── frontend/   # React + Vite            (5173)
├── backend/    # Express + Socket.io     (3001)
└── mlend/      # Express + OpenRouter    (3002)
```

---

## 🚀 Setup

**1. Environment.** Both services need a `.env`; the app will not start without them.

```bash
cp backend/.env.example backend/.env
cp mlend/.env.example   mlend/.env
```

Then put your OpenRouter key (from [openrouter.ai/keys](https://openrouter.ai/keys)) into `mlend/.env`:

```bash
OPENROUTER_API_KEY=sk-or-v1-...
```

Leave it unset and everything still runs — you just get the local fallbacks instead of model output.

`backend/.env` needs `JWT_SECRET`; the example file has a usable value. The server exits immediately with a clear message if it is missing.

**2. Install.**

```bash
npm install --prefix backend
npm install --prefix mlend
npm install --prefix frontend
```

**3. Run**, in three terminals:

```bash
cd backend  && npm run dev    # :3001
cd mlend    && npm run dev    # :3002
cd frontend && npm run dev    # :5173
```

Open http://localhost:5173 and create an account. There are no seeded users — the store is in-memory and resets when the backend restarts.

---

## 💻 Stack

React · Vite · Express · Socket.io · JWT · bcryptjs · OpenRouter (free tier, no SDK — plain `fetch`)

---

## 📄 License

MIT
