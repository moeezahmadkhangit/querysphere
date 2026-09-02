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

/**
 * Who is actually in each room: roomId => Map(userId => { ...user, sockets }).
 *
 * The sidebar used to list four hard-coded names with hard-coded green dots,
 * so there was no way to tell whether anyone else was really there — a second
 * person could sign in and neither of them would know. This is the real thing.
 *
 * Keyed by user rather than by socket, with a reference count, so one person
 * with two tabs open is one entry in the roster and closing one tab does not
 * remove them while the other is still connected.
 */
const presence = new Map();

function roster(roomId) {
  const members = presence.get(roomId);
  if (!members) return [];
  return [...members.values()].map(({ sockets, ...member }) => member);
}

function emitPresence(io, roomId) {
  io.to(roomId).emit('presence', { roomId, members: roster(roomId) });
}

function addMember(roomId, user) {
  if (!presence.has(roomId)) presence.set(roomId, new Map());
  const members = presence.get(roomId);
  const existing = members.get(user.id);
  if (existing) existing.sockets += 1;
  else members.set(user.id, { userId: user.id, username: user.username, avatar: user.avatar, sockets: 1 });
}

function removeMember(roomId, userId) {
  const members = presence.get(roomId);
  if (!members) return;
  const existing = members.get(userId);
  if (!existing) return;
  existing.sockets -= 1;
  if (existing.sockets <= 0) members.delete(userId);
  if (members.size === 0) presence.delete(roomId);
}

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

    // Every room this socket is currently in, so a disconnect can clean up
    // after itself. `currentRoom` only ever held the last one, which left the
    // person listed as present in every room they had visited.
    socket.joinedRooms = new Set();

    // Join a room
    socket.on('join_room', (roomId) => {
      if (!rooms.has(roomId)) return;
      socket.join(roomId);
      socket.joinedRooms.add(roomId);

      if (!typingUsers.has(roomId)) typingUsers.set(roomId, new Set());

      addMember(roomId, socket.user);

      // Notify others
      socket.to(roomId).emit('user_joined', {
        userId: socket.user.id,
        username: socket.user.username,
      });
      // Broadcast to the whole room, joiner included: this is also how the
      // arriving client receives the roster that already existed.
      emitPresence(io, roomId);
    });

    // Leave a room
    socket.on('leave_room', (roomId) => {
      if (!socket.joinedRooms.has(roomId)) return;
      socket.joinedRooms.delete(roomId);
      removeMember(roomId, socket.user.id);
      // Clear any indicator this person left behind, or everyone else watches
      // a phantom keep typing forever.
      socket.to(roomId).emit('typing_stop', { userId: socket.user.id });
      socket.to(roomId).emit('user_left', { userId: socket.user.id });
      emitPresence(io, roomId);
      socket.leave(roomId);
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
      // A closed tab never sends leave_room, so without this the roster keeps
      // growing with people who are gone and their typing dots never stop.
      for (const roomId of socket.joinedRooms) {
        removeMember(roomId, socket.user.id);
        socket.to(roomId).emit('typing_stop', { userId: socket.user.id });
        socket.to(roomId).emit('user_left', { userId: socket.user.id });
        emitPresence(io, roomId);
      }
      socket.joinedRooms.clear();
      console.log(`🔴 ${socket.user.username} disconnected`);
    });
  });
}
