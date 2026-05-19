import jwt from 'jsonwebtoken';
import { addMessage, rooms } from '../data/store.js';

// Mock developers for simulated real-time conversation replies
const mockDevs = [
  { username: 'Basim', avatar: 'BS', userId: 'basim' },
  { username: 'Adeel', avatar: 'AD', userId: 'adeel' },
  { username: 'Bilawal', avatar: 'BL', userId: 'bilawal' },
];

const botReplies = [
  "That's a great point! 🙌",
  "Totally agree with you on that 💯",
  "Interesting perspective — hadn't thought of it that way 🤔",
  "Love the energy here! Keep it coming 🔥",
  "This is why QuerySphere is the best community 💜",
  "Could you tell me more about that? 👀",
  "100% this! Bookmarking for later 📌",
  "Great question, someone should write a blog post about this 📝",
];

const typingUsers = new Map(); // roomId => Set of userIds

export function initSocket(io) {
  // Auth middleware for socket
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const user = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = user;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`🟢 ${socket.user.username} connected`);

    // Join a room
    socket.on('join_room', (roomId) => {
      socket.join(roomId);
      socket.currentRoom = roomId;

      if (!typingUsers.has(roomId)) typingUsers.set(roomId, new Set());

      // Notify others
      socket.to(roomId).emit('user_joined', {
        userId: socket.user.id,
        username: socket.user.username,
      });
    });

    // Leave a room
    socket.on('leave_room', (roomId) => {
      socket.leave(roomId);
      socket.to(roomId).emit('user_left', { userId: socket.user.id });
    });

    // Send a message
    socket.on('send_message', ({ roomId, text }) => {
      if (!text?.trim() || !roomId) return;

      const message = {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        userId: socket.user.id,
        username: socket.user.username,
        avatar: socket.user.avatar,
        text: text.trim(),
        timestamp: new Date().toISOString(),
        reactions: [],
      };

      addMessage(roomId, message);
      io.to(roomId).emit('new_message', { roomId, message });

      // Simulate developer reply ~40% of the time with a delay
      if (Math.random() < 0.4) {
        const dev = mockDevs[Math.floor(Math.random() * mockDevs.length)];
        setTimeout(() => {
          // Show typing
          io.to(roomId).emit('typing_start', { userId: dev.userId, username: dev.username });
          setTimeout(() => {
            io.to(roomId).emit('typing_stop', { userId: dev.userId });
            const botMessage = {
              id: `msg_bot_${Date.now()}`,
              userId: dev.userId,
              username: dev.username,
              avatar: dev.avatar,
              text: botReplies[Math.floor(Math.random() * botReplies.length)],
              timestamp: new Date().toISOString(),
              reactions: [],
              isBot: true,
            };
            addMessage(roomId, botMessage);
            io.to(roomId).emit('new_message', { roomId, message: botMessage });
          }, 1500);
        }, 800);
      }
    });

    // Typing indicators
    socket.on('typing_start', ({ roomId }) => {
      socket.to(roomId).emit('typing_start', {
        userId: socket.user.id,
        username: socket.user.username,
      });
    });

    socket.on('typing_stop', ({ roomId }) => {
      socket.to(roomId).emit('typing_stop', { userId: socket.user.id });
    });

    // Add reaction
    socket.on('add_reaction', ({ roomId, messageId, emoji }) => {
      const room = rooms.get(roomId);
      if (!room) return;
      const msg = room.messages.find((m) => m.id === messageId);
      if (!msg) return;
      const existing = msg.reactions.find((r) => r.emoji === emoji);
      if (existing) existing.count++;
      else msg.reactions.push({ emoji, count: 1 });
      io.to(roomId).emit('reaction_updated', { messageId, reactions: msg.reactions });
    });

    socket.on('disconnect', () => {
      console.log(`🔴 ${socket.user.username} disconnected`);
    });
  });
}
