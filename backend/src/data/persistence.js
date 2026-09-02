import fs from 'fs';
import path from 'path';
import { encryptField, decryptField } from './crypto.js';

/**
 * Disk persistence for the in-memory store.
 *
 * Everything used to live only in a Map, so every restart — a deploy, a crash,
 * a free-tier host spinning the container down after fifteen idle minutes —
 * silently deleted every account, every friendship and every message. People
 * came back to an app that had forgotten them.
 *
 * One JSON file, written atomically and debounced. It is not a database and is
 * not pretending to be one: a single process owns it, and the whole file is
 * rewritten on change. That is fine at this size and keeps the deployment on a
 * free tier with no external service.
 *
 * Message bodies and email addresses are encrypted on the way out and decrypted
 * on the way in — see crypto.js for why.
 */

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'querysphere.json');
const TMP_FILE = `${DATA_FILE}.tmp`;
const DEBOUNCE_MS = 400;

let saveTimer = null;
let snapshotFn = null;

/** Serialise a user for disk. The bcrypt hash goes as-is; the address is encrypted. */
function encodeUser(user) {
  return {
    ...user,
    email: encryptField(user.email),
    friends: [...user.friends],
    requestsIn: [...user.requestsIn],
    requestsOut: [...user.requestsOut],
    lastRead: Object.fromEntries(user.lastRead),
  };
}

function decodeUser(raw) {
  const email = decryptField(raw.email);
  if (email === null) return null; // undecryptable: drop rather than create a broken account
  return {
    ...raw,
    email,
    friends: new Set(raw.friends || []),
    requestsIn: new Set(raw.requestsIn || []),
    requestsOut: new Set(raw.requestsOut || []),
    lastRead: new Map(Object.entries(raw.lastRead || {})),
  };
}

function encodeRoom(room) {
  return {
    ...room,
    memberIds: room.memberIds ? [...room.memberIds] : null,
    messages: room.messages.map((m) => ({ ...m, text: encryptField(m.text) })),
  };
}

function decodeRoom(raw) {
  return {
    ...raw,
    memberIds: raw.memberIds ? new Set(raw.memberIds) : null,
    messages: (raw.messages || [])
      .map((m) => ({ ...m, text: decryptField(m.text) }))
      // A message we cannot decrypt is dropped, not rendered as ciphertext.
      .filter((m) => typeof m.text === 'string'),
  };
}

/** Read the store off disk. Returns null when there is nothing to restore. */
export function loadSnapshot() {
  try {
    if (!fs.existsSync(DATA_FILE)) return null;
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const decodedUsers = (raw.users || []).map(decodeUser);
    const users = decodedUsers.filter(Boolean);
    const rooms = (raw.rooms || []).map(decodeRoom);

    /**
     * Say so when the file held records we could not read.
     *
     * These are dropped rather than surfaced as ciphertext, which is right —
     * but dropping them quietly is how a wrong key or a bad envelope turns into
     * "everyone's account vanished" with a cheerful success line in the log.
     * A bug in the envelope parser did exactly that during development.
     */
    const lostUsers = decodedUsers.length - users.length;
    const lostMessages = (raw.rooms || []).reduce(
      (n, room, i) => n + ((room.messages || []).length - rooms[i].messages.length), 0
    );
    if (lostUsers || lostMessages) {
      console.error(`⚠️  ${lostUsers} account(s) and ${lostMessages} message(s) in ${DATA_FILE} could not be decrypted.`);
      console.error('    This usually means DATA_ENCRYPTION_KEY (or the JWT_SECRET it is derived from) has changed.');
    }

    console.log(`💾 Restored ${users.length} accounts and ${rooms.length} rooms from ${DATA_FILE}`);
    return { users, rooms };
  } catch (err) {
    // A corrupt file must not stop the server booting. Move it aside so the
    // evidence survives and the next write starts clean.
    console.error(`⚠️  Could not read ${DATA_FILE}: ${err.message}`);
    try { fs.renameSync(DATA_FILE, `${DATA_FILE}.corrupt-${Date.now()}`); } catch { /* nothing to move */ }
    return null;
  }
}

function writeNow() {
  if (!snapshotFn) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
    const { users, rooms } = snapshotFn();
    const payload = JSON.stringify({
      version: 1,
      savedAt: new Date().toISOString(),
      users: users.map(encodeUser),
      rooms: rooms.map(encodeRoom),
    });
    // Write-then-rename: a process killed mid-write leaves the previous good
    // file in place instead of a truncated one that fails to parse on boot.
    fs.writeFileSync(TMP_FILE, payload, { mode: 0o600 });
    fs.renameSync(TMP_FILE, DATA_FILE);
  } catch (err) {
    console.error(`⚠️  Could not persist store: ${err.message}`);
  }
}

/** Tell persistence how to read the live store, then restore-on-exit handlers. */
export function initPersistence(getSnapshot) {
  snapshotFn = getSnapshot;
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => { flush(); process.exit(0); });
  }
  process.on('beforeExit', flush);
}

/** Queue a save. Many mutations in one tick collapse into a single write. */
export function persist() {
  if (!snapshotFn) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; writeNow(); }, DEBOUNCE_MS);
}

/** Write immediately — used on shutdown, where a debounce would lose the tail. */
export function flush() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  writeNow();
}
