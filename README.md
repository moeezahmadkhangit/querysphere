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

- 🔐 **JWT auth** — register and sign in. The stored session is checked against the server on every load, so an expired token signs you out with a reason instead of rendering a shell whose every request fails. Rate-limited, constant-time, and bcrypt at cost 12.
- 👥 **Add people** — search the directory by name (or by an exact email address), send a request, and answer the ones you get. The request arrives on the other person's screen live.
- 💡 **People you may know** — a transparent score over the graph the app already has: mutual friends ×3, shared communities ×2, then recency. No model, nothing to train.
- ✉️ **Direct messages** — opened the moment a request is accepted, and private: a room you are not in answers 404 to the REST call and ignores the socket join.
- 🌐 **Communities** — name it, pick an icon, choose who comes. Any member can bring somebody else in; everyone already inside sees the new arrival without refreshing.
- 📡 **Real-time chat** over Socket.io — channels, typing indicators, emoji reactions, all of which cross between real users.
- 🔢 **Real unread counts and history paging** — per-person read state on the server, and ↑ Older messages walks back through the stored backlog.
- 🗑 **Delete your own messages** — and only your own; the server checks authorship rather than trusting a hidden button.
- 🟢 **Real presence** — "In this channel" is the server's live roster, not a drawing. Open a second browser, sign in as somebody else, and each sees the other appear.
- 🔌 **Honest connection state** — if the socket drops, the composer says so and holds the send rather than swallowing the message. On reconnect the client re-joins the room by itself.
- 👥 **Simulated developers** are real accounts now, not literals in a socket handler — searchable, suggestible, and they answer a direct message every time (a 40% chance in a one-to-one conversation reads as being ignored). They still interject in the public channels ~40% of the time, tagged `sim`, and never in a community.
- ✨ **AI message formatting** — polish a messy draft before you send it.
- 📋 **AI conversation summary** — Overview / Key Points / Vibe, with the answering model named.
- 🛡️ **Local fallbacks** for both AI features when the free tier is down.
- 📞 **Call overlay** — a UI mockup, not a working call.
- 📱 **Narrow screens** — the sidebar and AI panel become slide-overs rather than disappearing.

---

## 🔒 Where the messages live

The store is a `Map` in the backend process, mirrored to **one encrypted JSON file** (`backend/.data/querysphere.json`) so that a restart does not take everybody's history with it. It is not a database and does not pretend to be one — a single process owns the file and rewrites it, debounced, on change.

**Message bodies and email addresses are encrypted with AES-256-GCM before they are written.** The key comes from `DATA_ENCRYPTION_KEY`; leave it unset and it is derived from `JWT_SECRET`, which works but ties the two together — rotating the signing key would then make every stored message unreadable. The bcrypt hashes are *not* encrypted: they are already digests, and encrypting them would only mean a lost key locks every account out. What the file looks like:

```json
{"id":"user_...","username":"Moeez","email":"encv1.PR3gTkMD…","password":"$2b$12$…"}
```

**Access control is one function.** `canAccess(userId, room)` is enforced on the REST room list, the message history *and* the socket join, so there is no path that returns a room you are not in. A room you may not see and a room that does not exist answer identically — distinguishing them would tell an outsider that a given two-person conversation exists, which is most of what they wanted to know.

**The browser keeps almost nothing.** Only a token and `{id, username, avatar}` — not your email. Messages, rooms and friend lists live in React state for the life of the tab and are gone when it closes; caching a conversation in `localStorage` would leave it readable by any script on the origin and sitting on the disk of a shared computer long after sign-out. Signing out sweeps the whole `qs_` namespace from both `localStorage` and `sessionStorage`, and propagates to every other open tab.

**On a free host this file is ephemeral.** Render's free plan has no persistent disk: the store survives a process restart but not a redeploy or a spin-down. Attach a disk on a paid instance and point `DATA_DIR` at it for history that outlives a deploy.

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

`backend/.env` needs `JWT_SECRET`; the example file has a usable value. The server exits immediately with a clear message if it is missing, if it is too short, or if the placeholder is still in place in production. `DATA_ENCRYPTION_KEY` is optional locally and worth setting before you deploy.

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

Open http://localhost:5173. The Sign In tab is pre-filled with a seeded demo account (`moeez@querysphere.com` / `password123`) that owns the starter messages in `#general`, so the first click works.

To watch two people talk, sign up as somebody else in a second browser — a private window is enough, since the session lives in `localStorage`. Both appear in each other's "In this channel" list.

Accounts, friendships, communities and messages now survive a backend restart — see **Where the messages live** above for the file they are written to and how it is encrypted.

---

## 🚢 Deployment

Three pieces, all on free tiers:

| | Where | Deploys when |
|---|---|---|
| `frontend` | Vercel (Hobby) | you push to `main` |
| `backend` | Render (Free) | you push to `main` |
| `mlend` | Render (Free) | you push to `main` |

Both Render services are declared in `render.yaml` with `autoDeploy: true`, and Vercel's Git integration builds `main` on every push. There is nothing to run by hand — a merge is a release.

**Staying awake without running out of hours.** Render idles a free web service out after ~15 minutes with no inbound traffic, and a free workspace gets **750 instance-hours a month in total, not per service**. One service kept up around the clock costs about 730 of them. Two costs about 1460, so the allowance runs out mid-month and Render suspends *both*.

So exactly one service is kept awake — the backend, because it holds the live sockets and a spin-down disconnects everyone. It is kept awake in two layers:

- **From inside**, `KEEP_ALIVE_INTERVAL_MS` on the backend service makes it ping its own public URL every five minutes. Setting that variable is also the switch that turns the pinger on: it used to start by itself wherever `RENDER_EXTERNAL_URL` was present, which is *every* Render service, so mlend was quietly staying awake too and the two of them were on course to burn the whole month's hours by about the 15th.
- **From outside**, `.github/workflows/keep-alive.yml` hits `/health` every ten minutes from GitHub Actions. This is the layer that matters after something has gone wrong: a self-ping can only prevent a spin-down, never recover from one, because a stopped instance has stopped timers. Note that GitHub disables a scheduled workflow after 60 days without repository activity — re-enable it from the Actions tab if the pings stop.

mlend is left to sleep. It is stateless and holds no sockets; the cost is a slow first **Format** or **Summarize** after an idle spell.

**What does not survive a deploy.** Render's free plan has no persistent disk, so `backend/.data/querysphere.json` lives in the container's ephemeral filesystem: it survives a process restart, not a redeploy or a spin-down. Attach a disk on a paid instance and point `DATA_DIR` at it for history that outlives a release.

---

## 💻 Stack

React · Vite · Express · Socket.io · JWT · bcryptjs · OpenRouter (free tier, no SDK — plain `fetch`)

---

## 📄 License

MIT
