import express from 'express';
import { roomsForUser, getRoom, canAccess, getMessages, markRead, roomView } from '../data/store.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();
router.use(authenticateToken);

// GET /api/rooms
router.get('/', (req, res) => {
  // Only what this person is actually in. The old handler returned every room
  // in the store to anyone with a token, which was harmless while the store
  // held four public channels and is a disclosure now that it holds private
  // conversations: the response named every direct message and community.
  res.json({ rooms: roomsForUser(req.user.id) });
});

// GET /api/rooms/:roomId/messages?limit=50&before=<messageId>
router.get('/:roomId/messages', (req, res) => {
  const room = getRoom(req.params.roomId);

  /**
   * Membership is checked before anything is read.
   *
   * A missing room and a room you may not see answer identically, on purpose.
   * Distinguishing them tells an outsider that a given conversation exists,
   * which for a two-person direct message is most of what they wanted to know.
   */
  if (!room || !canAccess(req.user.id, room)) {
    return res.status(404).json({ error: 'Room not found' });
  }

  const { messages, hasMore } = getMessages(room.id, {
    limit: req.query.limit,
    before: req.query.before,
  });

  // Only a first page means the reader is at the live end of the conversation.
  if (!req.query.before) markRead(req.user, room.id);

  res.json({ roomId: room.id, messages, hasMore });
});

// POST /api/rooms/:roomId/read
router.post('/:roomId/read', (req, res) => {
  const room = getRoom(req.params.roomId);
  if (!room || !canAccess(req.user.id, room)) {
    return res.status(404).json({ error: 'Room not found' });
  }
  markRead(req.user, room.id);
  res.json({ room: roomView(room, req.user.id) });
});

export default router;
