import express from 'express';
import { getRooms, getMessages } from '../data/store.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// GET /api/rooms
router.get('/', authenticateToken, (req, res) => {
  res.json({ rooms: getRooms() });
});

// GET /api/rooms/:roomId/messages
router.get('/:roomId/messages', authenticateToken, (req, res) => {
  const { roomId } = req.params;
  const limit = parseInt(req.query.limit) || 50;
  const messages = getMessages(roomId, limit);
  res.json({ messages, roomId });
});

export default router;
