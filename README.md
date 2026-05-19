# 🔮 QuerySphere — AI-Powered Community Chat App

QuerySphere is a portfolio-grade, real-time community messaging platform designed with a stunning **Soft Neumorphic (Tactile 3D)** UI design language. It integrates real-time WebSocket communications with an intelligent Express-based AI microservice to provide automatic grammar formatting and conversation summarization.

---

## 🎨 Soft Neumorphic UI Design
Unlike generic dashboards, QuerySphere features a gorgeous custom design system:
- **Soft Raised Cards**: Sidebars, messaging windows, and the assistant panels are designed with smooth squircle edges and double-drop shadow grids (`box-shadow: 8px 8px 16px #cbd5e0, -8px -8px 16px #ffffff`).
- **Tactile Inset Inputs**: All interactive input fields (like the chat textbox and auth inputs) display inset neumorphic drop shadows (`box-shadow: inset 4px 4px 8px #cbd5e0`) to feel highly responsive.
- **Micro-Animations**: Hover-triggered color shifts, bouncy typing status bubbles, and a pulsing ring calling overlay keep the client interface alive.
- **Accents**: Gradient accents (`linear-gradient(135deg, #2F80ED, #1B4FB3)`) for main indicators and actions.

---

## ✨ Features
*   🔐 **Secure JWT-Based Authentication**: Full register and sign-in modules with JWT session storage and pre-filled default options for easy reviewer testing.
*   📡 **Real-Time WebSocket Chat**: Built on Socket.io, supporting live channel selection, messaging relays, typing indicator broadcasts, and emoji reactions.
*   👥 **Simulated Developer Responses**: When you send messages, other developers (Basim, Adeel, Bilawal) will show typing status and respond automatically with natural delays!
*   ✨ **AI Message Formatting**: Pre-process messy or slang-heavy chat drafts with a formatting parser that corrects grammar and inserts emojis.
*   📋 **AI Conversation Summarizer**: Generates structured, markdown summaries (Overview, Key Points, Vibe status) of the active room's chat history.
*   🛡️ **High-Fidelity AI Fallbacks**: Full local offline fallback modules. If no OpenAI API key is present or the connection fails, the microservice automatically transitions to smart local formatting and context summarization (fully customized for design and development queries!).
*   📞 **Voice & Video Calling UI**: Beautiful overlay mockup representing active audio and video chat calls.

---

## ⚙️ Monorepo Directory Layout
```
QuerySphere/
├── frontend/   # React + Vite (port 5173)
├── backend/    # Node + Express + Socket.io (port 3001)
└── mlend/      # Express + OpenAI integration (port 3002)
```

---

## 🚀 Quick Setup & Installation

### 1. Prerequisite
Ensure you have **Node.js (v16+)** installed on your local computer.

### 2. Configure Environment
Create a `.env` file in the `mlend/` folder:
```bash
# mlend/.env
OPENAI_API_KEY=your_openai_key_here
PORT=3002
```
*(If no OpenAI key is configured, QuerySphere will seamlessly transition to its local high-fidelity AI fallback system!).*

Create a `.env` file in the `backend/` folder:
```bash
# backend/.env
JWT_SECRET=super_secret_jwt_key
PORT=3001
```

### 3. Install Dependencies
Open your terminal and run:
```bash
npm install --prefix backend
npm install --prefix mlend
npm install --prefix frontend
```

### 4. Boot Up All Services
Open three separate terminals in the project root folder:

*   **Terminal 1 (Backend Server)**:
    ```bash
    cd backend && npm run dev
    ```
*   **Terminal 2 (MLend AI Service)**:
    ```bash
    cd mlend && npm run dev
    ```
*   **Terminal 3 (Vite Client)**:
    ```bash
    cd frontend && npm run dev
    ```

---

## 💻 Tech Stack
- **Frontend**: React, Vite, Vanilla CSS (Neumorphic system)
- **Real-Time Backend**: Node.js, Express, Socket.io
- **AI Microservice**: Express, OpenAI NodeJS Client (`gpt-4o-mini`), custom regex fallbacks
- **Session Auth**: JWT, bcryptjs

---

## 📄 License
This project is licensed under the MIT License.
