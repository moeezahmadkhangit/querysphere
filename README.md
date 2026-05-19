# QuerySphere

An AI-powered community chat app built for portfolio.

## Structure

```
QuerySphere/
├── frontend/   # React + Vite (port 5173)
├── backend/    # Express + Socket.io (port 3001)
└── mlend/      # Express + OpenAI (port 3002)
```

## Setup

### 1. Add your API key
Edit `mlend/.env` and set `OPENAI_API_KEY=sk-...`

### 2. Install dependencies
```bash
npm install --prefix backend
npm install --prefix mlend
npm install --prefix frontend
```

### 3. Run all three services (3 terminals)
```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd mlend && npm run dev

# Terminal 3
cd frontend && npm run dev
```

### 4. Open http://localhost:5173

## Features
- ✅ Auth (register/login) with JWT
- ✅ Real-time chat via Socket.io
- ✅ AI message formatting (✨ Format button)
- ✅ AI conversation summary (📋 Summarize button)
- ✅ Typing indicators & bot replies
- ✅ Emoji reactions
- 🎨 Call overlay UI
- 🎨 DM list UI
