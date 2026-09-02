// In-memory data store — no DB required for portfolio demo
import bcrypt from 'bcryptjs';

export const users = new Map();
export const rooms = new Map([
  ['general', {
    id: 'general',
    name: 'general',
    description: 'Welcome to QuerySphere! Say hello 👋',
    icon: '💬',
    type: 'channel',
    messages: [],
    members: [],
  }],
  ['ideas', {
    id: 'ideas',
    name: 'ideas',
    description: 'Drop your wild ideas here 💡',
    icon: '💡',
    type: 'channel',
    messages: [],
    members: [],
  }],
  ['random', {
    id: 'random',
    name: 'random',
    description: 'Anything goes 🎲',
    icon: '🎲',
    type: 'channel',
    messages: [],
    members: [],
  }],
  ['dev-talk', {
    id: 'dev-talk',
    name: 'dev-talk',
    description: 'Code, debug, ship 🚀',
    icon: '🚀',
    type: 'channel',
    messages: [],
    members: [],
  }],
]);

// Seed some starter messages in general
const seedMessages = [
  { id: 'seed1', userId: 'moeez', username: 'Moeez (Alpha)', avatar: 'MZ', text: 'Hey everyone — QuerySphere is live. I ported the whole thing onto the portfolio design system: ink ground, gold accent, teal for anything the AI says. 🎨', timestamp: new Date(Date.now() - 300000).toISOString(), reactions: [{ emoji: '🎉', count: 4 }, { emoji: '🔥', count: 3 }] },
  { id: 'seed2', userId: 'basim', username: 'Basim', avatar: 'BS', text: 'Woah, this reads so much sharper. The hairline gold borders and the Fraunces wordmark do a lot of work.', timestamp: new Date(Date.now() - 240000).toISOString(), reactions: [{ emoji: '👍', count: 2 }] },
  { id: 'seed3', userId: 'adeel', username: 'Adeel', avatar: 'AD', text: 'Agreed. And keeping teal strictly for the assistant means you always know which voice you are reading. 🚀', timestamp: new Date(Date.now() - 180000).toISOString(), reactions: [{ emoji: '💯', count: 3 }] },
  { id: 'seed4', userId: 'bilawal', username: 'Bilawal', avatar: 'BL', text: 'Love it. Trying Format and Summarize now — running on OpenRouter free models, so it costs nothing.', timestamp: new Date(Date.now() - 120000).toISOString(), reactions: [{ emoji: '💡', count: 2 }] },
];

rooms.get('general').messages = seedMessages;

export function createUser(username, email, password) {
  const id = `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const hashedPassword = bcrypt.hashSync(password, 10);
  const avatarInitials = username.slice(0, 2).toUpperCase();
  const user = { id, username, email, password: hashedPassword, avatar: avatarInitials, createdAt: new Date().toISOString() };
  users.set(email, user);
  return user;
}

export function findUserByEmail(email) {
  return users.get(email) || null;
}

export function addMessage(roomId, message) {
  const room = rooms.get(roomId);
  if (!room) return null;
  room.messages.push(message);
  // Keep last 100 messages
  if (room.messages.length > 100) room.messages.shift();
  return message;
}

export function getMessages(roomId, limit = 50) {
  const room = rooms.get(roomId);
  if (!room) return [];
  return room.messages.slice(-limit);
}

export function getRooms() {
  return Array.from(rooms.values()).map(({ messages, ...rest }) => ({
    ...rest,
    messageCount: messages.length,
  }));
}
