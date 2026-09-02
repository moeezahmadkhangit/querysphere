// Loaded first and for its side effects: it populates process.env and validates
// the secrets before any other module in the graph reads them. See env.js.
import './env.js';

import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import authRouter from './routes/auth.js';
import chatRouter from './routes/chat.js';
import socialRouter from './routes/social.js';
import { initSocket } from './socket/chatSocket.js';
import { setIo } from './socket/notify.js';
import { startKeepAlive } from './keepAlive.js';
import { allowedOrigins } from './allowedOrigins.js';

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

/**
 * Render, Vercel and every other managed host put a proxy in front of this
 * process, so `req.ip` is the proxy unless Express is told to read the
 * forwarded header. The rate limiter keys on the client address; without this
 * every visitor shares one bucket and the first person to fat-finger their
 * password locks everybody out.
 */
app.set('trust proxy', 1);

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

// A cap, because every auth request runs a deliberately expensive hash and
// there is no reason for any body this app accepts to approach even this size.
app.use(express.json({ limit: '64kb' }));

app.use((req, res, next) => {
  // This API answers JSON to a separate frontend origin; nothing it returns
  // should ever be interpreted as a document, sniffed into one, or framed.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  // Tokens and message bodies must not be held by a shared cache on the way back.
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok', service: 'QuerySphere Backend' }));

// Routes
app.use('/api/auth', authRouter);
app.use('/api/rooms', chatRouter);
app.use('/api/social', socialRouter);

/**
 * One error handler for the whole API.
 *
 * An async route that threw used to reach Express's default handler, which in
 * a non-production environment answers with the stack trace — file paths, line
 * numbers and, for anything thrown out of the auth path, whatever was in scope.
 * Log it where the operator can read it; tell the caller nothing.
 */
app.use((err, req, res, _next) => {
  console.error(`❌ ${req.method} ${req.path}:`, err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Something went wrong on our end' });
});

setIo(io);
initSocket(io);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`\n🚀 QuerySphere Backend running on http://localhost:${PORT}`);
  console.log(`📡 Socket.io ready`);
  console.log(`🔓 Allowed origins: ${allowedOrigins.join(', ')}`);
  startKeepAlive();
});
