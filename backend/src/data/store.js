// The application store. In memory for speed, mirrored to an encrypted file on
// disk so a restart does not erase everyone's history — see persistence.js.
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { loadSnapshot, initPersistence, persist } from './persistence.js';

const BCRYPT_ROUNDS = 12;
const MAX_MESSAGES_PER_ROOM = 500;

/** Email (normalised) => user. */
export const users = new Map();
/** User id => the same user objects. Friend lists and room membership are by id. */
const usersById = new Map();
/** Room id => room. */
export const rooms = new Map();

/* ------------------------------------------------------------------ *
 * Users
 * ------------------------------------------------------------------ */

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
export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

/**
 * The ONLY shape of a user that may leave this process.
 *
 * Every route and socket payload builds its user objects through here. The
 * previous code hand-picked fields at each call site, which worked exactly as
 * long as nobody added a new endpoint — and this change adds six of them. One
 * `res.json({ user })` on a raw record would have shipped the bcrypt hash to
 * the browser.
 *
 * The email address is deliberately absent. A member list, a search result and
 * a suggestion are all visible to people who are not you; your address is not
 * theirs to read. `/api/auth/me` adds it back for the account's own owner.
 */
export function publicUser(user) {
  if (!user) return null;
  return { id: user.id, username: user.username, avatar: user.avatar, isSim: !!user.isSim };
}

/** The signed-in user's own view of themselves — adds the address, still no hash. */
export function selfUser(user) {
  if (!user) return null;
  return { ...publicUser(user), email: user.email };
}

function newUserRecord({ id, username, email, passwordHash, avatar, isSim = false }) {
  return {
    id,
    username,
    email,
    password: passwordHash,
    avatar,
    isSim,
    createdAt: new Date().toISOString(),
    friends: new Set(),
    requestsIn: new Set(),
    requestsOut: new Set(),
    lastRead: new Map(), // roomId => ISO timestamp of the last message this user saw
  };
}

function register(user) {
  users.set(user.email, user);
  usersById.set(user.id, user);
  return user;
}

export async function createUser(username, email, password) {
  const id = `user_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const name = String(username ?? '').trim();
  // bcrypt is CPU-bound and `hashSync` at cost 12 blocks the event loop for
  // roughly a quarter of a second — with Socket.io on the same process that
  // stalls every open conversation in the app while one person registers.
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = register(newUserRecord({
    id,
    username: name,
    email: normalizeEmail(email),
    passwordHash,
    avatar: name.slice(0, 2).toUpperCase(),
  }));
  persist();
  return user;
}

export function findUserByEmail(email) {
  return users.get(normalizeEmail(email)) || null;
}

export function findUserById(id) {
  return usersById.get(id) || null;
}

export function allUsers() {
  return [...usersById.values()];
}

/**
 * A bcrypt hash of a value nobody knows, compared against when the email does
 * not exist so that a wrong address and a wrong password cost the same time.
 *
 * Without it `login` returned immediately for an unknown address and spent
 * ~250ms hashing for a known one, which is a clean oracle: an attacker learns
 * which of a leaked address list have accounts here before guessing a single
 * password.
 */
export const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), BCRYPT_ROUNDS);

export function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash || DUMMY_HASH);
}

/* ------------------------------------------------------------------ *
 * Friends
 * ------------------------------------------------------------------ */

export function friendState(me, otherId) {
  if (me.id === otherId) return 'self';
  if (me.friends.has(otherId)) return 'friends';
  if (me.requestsOut.has(otherId)) return 'requested';
  if (me.requestsIn.has(otherId)) return 'incoming';
  return 'none';
}

/** Returns { status } — 'requested' normally, 'friends' when it completed a mutual pair. */
export function sendFriendRequest(me, other) {
  if (me.id === other.id) throw new Error('You cannot add yourself');
  if (me.friends.has(other.id)) return { status: 'friends' };
  // They already asked us: treat our request as the acceptance rather than
  // leaving two people each waiting on the other.
  if (me.requestsIn.has(other.id)) return acceptFriendRequest(me, other);
  me.requestsOut.add(other.id);
  other.requestsIn.add(me.id);
  persist();
  return { status: 'requested' };
}

export function acceptFriendRequest(me, other) {
  if (!me.requestsIn.has(other.id)) throw new Error('No pending request from that person');
  me.requestsIn.delete(other.id);
  other.requestsOut.delete(me.id);
  me.friends.add(other.id);
  other.friends.add(me.id);
  // Open the conversation immediately. Accepting and then having to hunt for a
  // way to say something is the point at which this feature stops being useful.
  const room = getOrCreateDM(me.id, other.id);
  persist();
  return { status: 'friends', room };
}

export function declineFriendRequest(me, other) {
  me.requestsIn.delete(other.id);
  other.requestsOut.delete(me.id);
  persist();
  return { status: 'none' };
}

export function cancelFriendRequest(me, other) {
  me.requestsOut.delete(other.id);
  other.requestsIn.delete(me.id);
  persist();
  return { status: 'none' };
}

export function removeFriend(me, other) {
  me.friends.delete(other.id);
  other.friends.delete(me.id);
  persist();
  return { status: 'none' };
}

/**
 * People worth talking to, best first.
 *
 * Deliberately not machine learning — it is a transparent score over the graph
 * the app already has. Mutual friends dominate, because someone two of your
 * friends know is the strongest signal available here; sharing a community is
 * weaker but real; being new is a tie-breaker that stops the same faces sitting
 * at the top forever and gives a fresh sign-up somebody to talk to on day one.
 */
export function suggestionsFor(me, { limit = 12 } = {}) {
  const myCommunities = [...rooms.values()].filter(
    (r) => r.type === 'community' && r.memberIds?.has(me.id)
  );

  const scored = [];
  for (const other of usersById.values()) {
    if (other.id === me.id) continue;
    if (me.friends.has(other.id)) continue;
    if (me.requestsOut.has(other.id) || me.requestsIn.has(other.id)) continue;

    const mutuals = [...me.friends].filter((id) => other.friends.has(id));
    const sharedCommunities = myCommunities.filter((r) => r.memberIds.has(other.id));
    const daysOld = (Date.now() - new Date(other.createdAt).getTime()) / 86_400_000;

    let score = mutuals.length * 3 + sharedCommunities.length * 2;
    if (daysOld < 7) score += 1;
    // The simulated developers answer immediately, so they are the one thing
    // that makes this feature demonstrable for the very first person to sign up.
    if (other.isSim) score += 1;
    if (score === 0) continue;

    scored.push({
      user: publicUser(other),
      score,
      mutualFriends: mutuals.map((id) => publicUser(findUserById(id))).filter(Boolean),
      sharedCommunities: sharedCommunities.map((r) => ({ id: r.id, name: r.name, icon: r.icon })),
      reason: mutuals.length
        ? `${mutuals.length} mutual friend${mutuals.length > 1 ? 's' : ''}`
        : sharedCommunities.length
          ? `Also in ${sharedCommunities[0].name}`
          : other.isSim
            ? 'Replies right away'
            : 'New to QuerySphere',
    });
  }

  return scored.sort((a, b) => b.score - a.score || a.user.username.localeCompare(b.user.username)).slice(0, limit);
}

/**
 * Directory search.
 *
 * Names match on a substring so the picker is usable; addresses match only in
 * full. A substring match on email would turn this endpoint into an address
 * harvester — type "@gmail" and read back everyone's provider — while an exact
 * match still lets you add the colleague whose address you were given.
 */
export function searchUsers(me, query, { limit = 20 } = {}) {
  const q = String(query ?? '').trim().toLowerCase();
  if (q.length < 2) return [];
  const exactEmail = normalizeEmail(q);
  return allUsers()
    .filter((u) => u.id !== me.id && (u.username.toLowerCase().includes(q) || u.email === exactEmail))
    .slice(0, limit)
    .map((u) => ({ user: publicUser(u), relation: friendState(me, u.id) }));
}

/* ------------------------------------------------------------------ *
 * Rooms
 * ------------------------------------------------------------------ */

const DEFAULT_CHANNELS = [
  ['general',  'Welcome to QuerySphere! Say hello 👋', '💬'],
  ['ideas',    'Drop your wild ideas here 💡',         '💡'],
  ['random',   'Anything goes 🎲',                     '🎲'],
  ['dev-talk', 'Code, debug, ship 🚀',                 '🚀'],
];

function makeRoom({ id, name, description, icon, type, ownerId = null, memberIds = null }) {
  return { id, name, description, icon, type, ownerId, memberIds, messages: [], createdAt: new Date().toISOString() };
}

/**
 * May this person see this room at all?
 *
 * Every read path goes through here — the REST list, the message history and
 * the socket join. Before direct messages existed the app had four public
 * channels and no check anywhere, so `GET /api/rooms/:id/messages` with any
 * valid token returned any room's contents. That was survivable when every room
 * was public. With DMs in the store it is the whole privacy model, so the check
 * is enforced in one function that all three call sites share.
 */
export function canAccess(userId, room) {
  if (!room) return false;
  if (room.type === 'channel') return true;
  return !!room.memberIds?.has(userId);
}

export function getRoom(roomId) {
  return rooms.get(roomId) || null;
}

/** A room as one particular person sees it — a DM is named after the other party. */
export function roomView(room, viewerId) {
  const base = {
    id: room.id,
    name: room.name,
    description: room.description,
    icon: room.icon,
    type: room.type,
    ownerId: room.ownerId,
    messageCount: room.messages.length,
    unread: unreadCount(findUserById(viewerId), room),
  };

  if (room.type === 'dm') {
    const otherId = [...room.memberIds].find((id) => id !== viewerId);
    const other = findUserById(otherId);
    return {
      ...base,
      name: other?.username || 'Unknown',
      description: other?.isSim ? 'Simulated developer' : 'Direct message',
      icon: other?.avatar || '💬',
      partner: publicUser(other),
    };
  }

  if (room.type === 'community') {
    return {
      ...base,
      members: [...room.memberIds].map((id) => publicUser(findUserById(id))).filter(Boolean),
    };
  }

  return base;
}

export function roomsForUser(userId) {
  return [...rooms.values()]
    .filter((room) => canAccess(userId, room))
    .map((room) => roomView(room, userId))
    .sort((a, b) => {
      const order = { channel: 0, community: 1, dm: 2 };
      return order[a.type] - order[b.type] || a.name.localeCompare(b.name);
    });
}

/** DM ids are derived from the pair, so the room is the same whoever opens it first. */
export function dmRoomId(a, b) {
  return `dm_${[a, b].sort().join('__')}`;
}

export function getOrCreateDM(aId, bId) {
  const id = dmRoomId(aId, bId);
  const existing = rooms.get(id);
  if (existing) return existing;
  const room = makeRoom({
    id,
    name: 'Direct message',
    description: 'Direct message',
    icon: '💬',
    type: 'dm',
    memberIds: new Set([aId, bId]),
  });
  rooms.set(id, room);
  persist();
  return room;
}

export function createCommunity(owner, { name, description, icon, memberIds = [] }) {
  const clean = String(name ?? '').trim();
  if (clean.length < 2) throw new Error('Community name must be at least 2 characters');
  if (clean.length > 40) throw new Error('Community name must be 40 characters or fewer');

  const slug = clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'community';
  const id = `com_${slug}_${crypto.randomBytes(3).toString('hex')}`;

  const members = new Set([owner.id]);
  for (const memberId of memberIds) {
    if (findUserById(memberId)) members.add(memberId);
  }

  const room = makeRoom({
    id,
    name: clean,
    description: String(description ?? '').trim().slice(0, 140) || `${clean} — a QuerySphere community`,
    icon: icon || '🌐',
    type: 'community',
    ownerId: owner.id,
    memberIds: members,
  });
  rooms.set(id, room);
  persist();
  return room;
}

export function addCommunityMembers(room, memberIds) {
  const added = [];
  for (const memberId of memberIds) {
    const user = findUserById(memberId);
    if (!user || room.memberIds.has(memberId)) continue;
    room.memberIds.add(memberId);
    added.push(user);
  }
  if (added.length) persist();
  return added;
}

export function leaveCommunity(room, userId) {
  room.memberIds.delete(userId);
  // A community nobody is in is not a community. Removing it stops the store
  // filling with empty rooms nobody can ever open again.
  if (room.memberIds.size === 0) rooms.delete(room.id);
  else if (room.ownerId === userId) room.ownerId = [...room.memberIds][0];
  persist();
}

/* ------------------------------------------------------------------ *
 * Messages
 * ------------------------------------------------------------------ */

export function addMessage(roomId, message) {
  const room = rooms.get(roomId);
  if (!room) return null;
  room.messages.push(message);
  if (room.messages.length > MAX_MESSAGES_PER_ROOM) {
    room.messages.splice(0, room.messages.length - MAX_MESSAGES_PER_ROOM);
  }
  persist();
  return message;
}

/**
 * A page of history, oldest-first, ending just before `before`.
 *
 * The old version always returned the newest 50 and had no way to ask for
 * anything older, so a room silently lost its past as soon as it got busy.
 */
export function getMessages(roomId, { limit = 50, before } = {}) {
  const room = rooms.get(roomId);
  if (!room) return { messages: [], hasMore: false };

  let slice = room.messages;
  if (before) {
    const index = slice.findIndex((m) => m.id === before);
    if (index > 0) slice = slice.slice(0, index);
    else if (index === 0) slice = [];
  }

  const capped = Math.min(Math.max(Number(limit) || 50, 1), 100);
  return { messages: slice.slice(-capped), hasMore: slice.length > capped };
}

export function findMessage(roomId, messageId) {
  return rooms.get(roomId)?.messages.find((m) => m.id === messageId) || null;
}

/** Soft delete: the row stays so ordering and reply context survive, the text does not. */
export function deleteMessage(room, message) {
  message.text = 'This message was deleted';
  message.deleted = true;
  message.reactions = [];
  persist();
  return message;
}

/* ------------------------------------------------------------------ *
 * Read state
 * ------------------------------------------------------------------ */

export function unreadCount(user, room) {
  if (!user) return 0;
  const since = user.lastRead.get(room.id);
  if (!since) {
    // Never opened. Only count what somebody else said, or every channel shows
    // a badge for the seed backlog the moment you sign up.
    return room.messages.filter((m) => m.userId !== user.id).length;
  }
  return room.messages.filter((m) => m.userId !== user.id && m.timestamp > since).length;
}

export function markRead(user, roomId) {
  if (!user) return;
  user.lastRead.set(roomId, new Date().toISOString());
  persist();
}

/* ------------------------------------------------------------------ *
 * Boot: restore from disk, or seed a fresh install
 * ------------------------------------------------------------------ */

/**
 * The three simulated developers are real accounts, not decoration.
 *
 * They already replied in the channels, but they existed only as literals in
 * the socket handler — so they could not be searched for, suggested, befriended
 * or messaged. The first person to sign up on a fresh deployment would open
 * "people you may know" and find nobody in it at all, which makes the feature
 * look broken rather than empty.
 *
 * Their password is 32 random bytes generated at boot and never written down,
 * so these accounts exist to be talked to and cannot be signed into.
 */
const SIM_USERS = [
  { id: 'basim',   username: 'Basim',   avatar: 'BS', email: 'basim@querysphere.com' },
  { id: 'adeel',   username: 'Adeel',   avatar: 'AD', email: 'adeel@querysphere.com' },
  { id: 'bilawal', username: 'Bilawal', avatar: 'BL', email: 'bilawal@querysphere.com' },
];

const DEMO_USER = { id: 'moeez', username: 'Moeez', avatar: 'MZ', email: 'moeez@querysphere.com' };

function seedMessages() {
  return [
    { id: 'seed1', userId: 'moeez', username: 'Moeez', avatar: 'MZ', text: 'Hey everyone — QuerySphere is live. I ported the whole thing onto the portfolio design system: ink ground, gold accent, teal for anything the AI says. 🎨', timestamp: new Date(Date.now() - 300000).toISOString(), reactions: [{ emoji: '🎉', count: 4 }, { emoji: '🔥', count: 3 }] },
    { id: 'seed2', userId: 'basim', username: 'Basim', avatar: 'BS', text: 'Woah, this reads so much sharper. The hairline gold borders and the Fraunces wordmark do a lot of work.', timestamp: new Date(Date.now() - 240000).toISOString(), reactions: [{ emoji: '👍', count: 2 }] },
    { id: 'seed3', userId: 'adeel', username: 'Adeel', avatar: 'AD', text: 'Agreed. And keeping teal strictly for the assistant means you always know which voice you are reading. 🚀', timestamp: new Date(Date.now() - 180000).toISOString(), reactions: [{ emoji: '💯', count: 3 }] },
    { id: 'seed4', userId: 'bilawal', username: 'Bilawal', avatar: 'BL', text: 'Love it. Trying Format and Summarize now — running on OpenRouter free models, so it costs nothing.', timestamp: new Date(Date.now() - 120000).toISOString(), reactions: [{ emoji: '💡', count: 2 }] },
  ];
}

function ensureDefaultChannels() {
  for (const [id, description, icon] of DEFAULT_CHANNELS) {
    if (rooms.has(id)) continue;
    rooms.set(id, makeRoom({ id, name: id, description, icon, type: 'channel' }));
  }
}

function seedFreshInstall() {
  ensureDefaultChannels();
  rooms.get('general').messages = seedMessages();

  register(newUserRecord({
    ...DEMO_USER,
    // The auth screen opens on Sign In with these credentials filled in, and the
    // seeded #general backlog is authored by this id, so it must exist or the
    // first button a new reader presses answers "Invalid email or password".
    passwordHash: bcrypt.hashSync('password123', BCRYPT_ROUNDS),
  }));

  for (const sim of SIM_USERS) {
    register(newUserRecord({
      ...sim,
      passwordHash: bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), BCRYPT_ROUNDS),
      isSim: true,
    }));
  }

  // The demo account already knows them, which gives anyone who signs up next a
  // set of mutual friends and therefore a non-empty suggestion list.
  const demo = findUserById('moeez');
  for (const sim of SIM_USERS) {
    const simUser = findUserById(sim.id);
    demo.friends.add(sim.id);
    simUser.friends.add(demo.id);
  }
  for (let i = 0; i < SIM_USERS.length; i++) {
    for (let j = i + 1; j < SIM_USERS.length; j++) {
      findUserById(SIM_USERS[i].id).friends.add(SIM_USERS[j].id);
      findUserById(SIM_USERS[j].id).friends.add(SIM_USERS[i].id);
    }
  }
}

function restore(snapshot) {
  for (const user of snapshot.users) register(user);
  for (const room of snapshot.rooms) rooms.set(room.id, room);
  // A channel added to DEFAULT_CHANNELS after a store was written must still
  // appear rather than being missing for every existing deployment.
  ensureDefaultChannels();
}

const snapshot = loadSnapshot();
if (snapshot?.users?.length) restore(snapshot);
else seedFreshInstall();

initPersistence(() => ({ users: allUsers(), rooms: [...rooms.values()] }));
