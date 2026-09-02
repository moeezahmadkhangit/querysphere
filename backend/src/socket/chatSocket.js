import jwt from 'jsonwebtoken';
import {
  addMessage,
  getRoom,
  canAccess,
  findUserById,
  findMessage,
  deleteMessage,
  markRead,
  publicUser,
} from '../data/store.js';

// The simulated developers, by the id of their real account in the store.
const SIM_IDS = ['basim', 'adeel', 'bilawal'];

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

const dmReplies = [
  "Ha, nice one. What are you working on today?",
  "Makes sense to me — send it over when it's ready 👀",
  "I'm around if you want to pair on that 🙌",
  "Good shout. I'll take a look this afternoon.",
  "Honestly that's the cleanest way to do it 💯",
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

function buildMessage(sender, text, extra = {}) {
  return {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    userId: sender.id,
    username: sender.username,
    avatar: sender.avatar,
    text,
    timestamp: new Date().toISOString(),
    reactions: [],
    ...extra,
  };
}

/** Post as one of the simulated developers, after a visible typing pause. */
function simReply(io, room, sim, text, { typingMs = 1500, delayMs = 800 } = {}) {
  setTimeout(() => {
    io.to(room.id).emit('typing_start', { userId: sim.id, username: sim.username });
    setTimeout(() => {
      io.to(room.id).emit('typing_stop', { userId: sim.id });
      const message = addMessage(room.id, buildMessage(sim, text, { isBot: true }));
      if (!message) return;
      io.to(room.id).emit('new_message', { roomId: room.id, message });
      // Members who do not have the room open still need their unread badge to
      // move, and they are not in the Socket.io room to receive the line above.
      for (const memberId of room.memberIds ?? []) {
        io.to(`user:${memberId}`).emit('room_activity', { roomId: room.id });
      }
    }, typingMs);
  }, delayMs);
}

export function initSocket(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      // Resolve the live record: the token now carries only an id, and room
      // access is decided against the friend list and membership on it.
      const user = findUserById(payload.id);
      if (!user) return next(new Error('Invalid token'));
      socket.user = user;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`🟢 ${socket.user.username} connected`);

    // A room per person, so the REST routes can push friend requests and
    // invitations to every tab this account has open. See socket/notify.js.
    socket.join(`user:${socket.user.id}`);

    // Every room this socket is currently in, so a disconnect can clean up
    // after itself. `currentRoom` only ever held the last one, which left the
    // person listed as present in every room they had visited.
    socket.joinedRooms = new Set();

    /**
     * Resolve a room the caller is allowed to be in, or nothing.
     *
     * Socket.io has no equivalent of an HTTP middleware chain, so before this
     * existed every handler took the client's `roomId` on trust — a crafted
     * `join_room` for somebody else's direct message id joined it and then
     * received every message sent in it. Each handler now goes through here.
     */
    const authorize = (roomId) => {
      const room = getRoom(roomId);
      if (!room || !canAccess(socket.user.id, room)) return null;
      return room;
    };

    socket.on('join_room', (roomId) => {
      const room = authorize(roomId);
      if (!room) return;

      socket.join(room.id);
      socket.joinedRooms.add(room.id);
      if (!typingUsers.has(room.id)) typingUsers.set(room.id, new Set());

      addMember(room.id, socket.user);
      markRead(socket.user, room.id);

      socket.to(room.id).emit('user_joined', {
        userId: socket.user.id,
        username: socket.user.username,
      });
      // Broadcast to the whole room, joiner included: this is also how the
      // arriving client receives the roster that already existed.
      emitPresence(io, room.id);
    });

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

    socket.on('send_message', ({ roomId, text }) => {
      const room = authorize(roomId);
      if (!room) return;
      if (typeof text !== 'string' || !text.trim()) return;

      // Bound the body. Nothing stopped a client posting a megabyte of text
      // into a store that is written to disk and echoed to every member.
      const body = text.trim().slice(0, 4000);

      const message = addMessage(room.id, buildMessage(socket.user, body));
      if (!message) return;

      io.to(room.id).emit('new_message', { roomId: room.id, message });
      markRead(socket.user, room.id);

      // Nudge the unread badge for members who are not currently in the room.
      for (const memberId of room.memberIds ?? []) {
        if (memberId === socket.user.id) continue;
        io.to(`user:${memberId}`).emit('room_activity', { roomId: room.id });
      }

      if (room.type === 'dm') {
        // A direct message to one of the simulated developers always gets an
        // answer — a 40% chance in a one-to-one conversation reads as being
        // ignored rather than as realism.
        const partnerId = [...room.memberIds].find((id) => id !== socket.user.id);
        const partner = findUserById(partnerId);
        if (partner?.isSim) {
          simReply(io, room, partner, dmReplies[Math.floor(Math.random() * dmReplies.length)], { delayMs: 1000 });
        }
        return;
      }

      // Public channels keep the ambient chatter. Communities do not: they are
      // rooms of real people, and a bot interjecting in one is noise.
      if (room.type === 'channel' && Math.random() < 0.4) {
        const sim = findUserById(SIM_IDS[Math.floor(Math.random() * SIM_IDS.length)]);
        if (sim) simReply(io, room, sim, botReplies[Math.floor(Math.random() * botReplies.length)]);
      }
    });

    // Removing your own message. There was no way to take anything back at all.
    socket.on('delete_message', ({ roomId, messageId }) => {
      const room = authorize(roomId);
      if (!room) return;
      const message = findMessage(room.id, messageId);
      // Ownership, not membership: being in the room is not authority over
      // what somebody else said in it.
      if (!message || message.userId !== socket.user.id) return;
      deleteMessage(room, message);
      io.to(room.id).emit('message_deleted', { roomId: room.id, messageId, text: message.text });
    });

    socket.on('mark_read', ({ roomId }) => {
      const room = authorize(roomId);
      if (!room) return;
      markRead(socket.user, room.id);
    });

    socket.on('typing_start', ({ roomId }) => {
      if (!authorize(roomId)) return;
      socket.to(roomId).emit('typing_start', {
        userId: socket.user.id,
        username: socket.user.username,
      });
    });

    socket.on('typing_stop', ({ roomId }) => {
      if (!authorize(roomId)) return;
      socket.to(roomId).emit('typing_stop', { userId: socket.user.id });
    });

    socket.on('add_reaction', ({ roomId, messageId, emoji }) => {
      const room = authorize(roomId);
      if (!room) return;
      // An arbitrary client string was stored and re-broadcast verbatim; cap it
      // so the reaction chip cannot be used to smuggle a paragraph into the UI.
      const symbol = String(emoji ?? '').slice(0, 8);
      if (!symbol) return;

      const msg = findMessage(room.id, messageId);
      if (!msg || msg.deleted) return;

      const existing = msg.reactions.find((r) => r.emoji === symbol);
      if (existing) existing.count++;
      else msg.reactions.push({ emoji: symbol, count: 1 });
      io.to(room.id).emit('reaction_updated', { messageId, reactions: msg.reactions });
    });

    socket.on('whoami', (ack) => {
      if (typeof ack === 'function') ack(publicUser(socket.user));
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
