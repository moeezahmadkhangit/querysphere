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
  { id: 'seed1', userId: 'moeez', username: 'Moeez', avatar: 'MZ', text: 'Hey everyone — QuerySphere is live. I ported the whole thing onto the portfolio design system: ink ground, gold accent, teal for anything the AI says. 🎨', timestamp: new Date(Date.now() - 300000).toISOString(), reactions: [{ emoji: '🎉', count: 4 }, { emoji: '🔥', count: 3 }] },
  { id: 'seed2', userId: 'basim', username: 'Basim', avatar: 'BS', text: 'Woah, this reads so much sharper. The hairline gold borders and the Fraunces wordmark do a lot of work.', timestamp: new Date(Date.now() - 240000).toISOString(), reactions: [{ emoji: '👍', count: 2 }] },
  { id: 'seed3', userId: 'adeel', username: 'Adeel', avatar: 'AD', text: 'Agreed. And keeping teal strictly for the assistant means you always know which voice you are reading. 🚀', timestamp: new Date(Date.now() - 180000).toISOString(), reactions: [{ emoji: '💯', count: 3 }] },
  { id: 'seed4', userId: 'bilawal', username: 'Bilawal', avatar: 'BL', text: 'Love it. Trying Format and Summarize now — running on OpenRouter free models, so it costs nothing.', timestamp: new Date(Date.now() - 120000).toISOString(), reactions: [{ emoji: '💡', count: 2 }] },
];

rooms.get('general').messages = seedMessages;

/**
 * Emails are the map key, so they have to be stored in one canonical form.
 *
 * They were previously keyed verbatim, which made the account you registered
 * unreachable from a different capitalisation of the same address. Phones make
 * this the common case rather than the edge case: both iOS and Android
 * autocapitalise the first letter of a text field, so an account created on a
 * phone as `Moeez@querysphere.com` could not be signed into from a desktop
 * typing `moeez@querysphere.com`. Trailing whitespace from a paste or an
 * autocomplete did the same thing.
 */
function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

export function createUser(username, email, password) {
  const id = `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const name = String(username ?? '').trim();
  const key = normalizeEmail(email);
  const hashedPassword = bcrypt.hashSync(password, 10);
  const avatarInitials = name.slice(0, 2).toUpperCase();
  const user = { id, username: name, email: key, password: hashedPassword, avatar: avatarInitials, createdAt: new Date().toISOString() };
  users.set(key, user);
  return user;
}

export function findUserByEmail(email) {
  return users.get(normalizeEmail(email)) || null;
}

/**
 * The store is in memory, so it is empty on every boot.
 *
 * The auth screen opens on the Sign In tab with these credentials pre-filled,
 * which meant the first button a new reader pressed always came back "Invalid
 * email or password" — the app looked broken before it had done anything
 * wrong. Seeding the account the form points at makes the default path work.
 *
 * The id is fixed rather than generated so the seeded #general backlog above,
 * which is authored by `moeez`, renders as this account's own messages instead
 * of somebody else's.
 */
const DEMO_USER = {
  id: 'moeez',
  username: 'Moeez',
  email: 'moeez@querysphere.com',
  avatar: 'MZ',
};

users.set(DEMO_USER.email, {
  ...DEMO_USER,
  password: bcrypt.hashSync('password123', 10),
  createdAt: new Date().toISOString(),
});

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
