import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import authRouter from './routes/auth.js';
import chatRouter from './routes/chat.js';
import { initSocket } from './socket/chatSocket.js';

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

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok', service: 'QuerySphere Backend' }));

// Routes
app.use('/api/auth', authRouter);
app.use('/api/rooms', chatRouter);

// Socket.io
initSocket(io);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`\n🚀 QuerySphere Backend running on http://localhost:${PORT}`);
  console.log(`📡 Socket.io ready`);
});
