import express from 'express';
import jwt from 'jsonwebtoken';
import {
  createUser,
  findUserByEmail,
  findUserById,
  verifyPassword,
  selfUser,
  DUMMY_HASH,
  normalizeEmail,
} from '../data/store.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { rateLimit, resetLimit, clientIp } from '../security/rateLimit.js';

const router = express.Router();

/**
 * bcrypt hashes the first 72 BYTES of a password and silently discards the
 * rest, so a longer one is not more secure — it just costs more CPU to hash.
 * The upper bound also closes the cheap denial of service in posting a
 * megabyte-long password to a route that runs a cost-12 hash on it.
 */
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 72;
const MAX_USERNAME = 32;

// Deliberately permissive: the job here is to reject obvious nonsense, not to
// adjudicate RFC 5322. Anything stricter starts rejecting real addresses.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  // Keyed on address AND address-of-origin: keying on IP alone lets one office
  // behind a NAT lock each other out, and keying on email alone lets an
  // attacker lock a known victim out of their own account.
  keyOf: (req) => `login:${clientIp(req)}:${normalizeEmail(req.body?.email)}`,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 20,
  keyOf: (req) => `register:${clientIp(req)}`,
});

function issueToken(user) {
  // The token is readable by anyone holding it — it is signed, not encrypted —
  // and it lives in the browser's localStorage. It therefore carries the
  // minimum needed to authorise a request: who you are. Username, avatar and
  // email were in here and are not needed to authorise anything; they also went
  // stale the moment a profile changed, since a token cannot be updated in
  // place. Handlers look the user up by id instead.
  return jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

// POST /api/auth/register
router.post('/register', registerLimiter, async (req, res, next) => {
  try {
    const { username, email, password } = req.body ?? {};

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (typeof password !== 'string' || typeof email !== 'string' || typeof username !== 'string') {
      return res.status(400).json({ error: 'All fields must be text' });
    }
    // Trim before measuring: '  ' cleared a raw length check and created an
    // account with a blank display name that every message then rendered under.
    const name = username.trim();
    if (name.length < 2) {
      return res.status(400).json({ error: 'Username must be at least 2 characters' });
    }
    if (name.length > MAX_USERNAME) {
      return res.status(400).json({ error: `Username must be ${MAX_USERNAME} characters or fewer` });
    }
    if (!EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ error: 'Enter a valid email address' });
    }
    if (password.length < MIN_PASSWORD) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD} characters` });
    }
    if (password.length > MAX_PASSWORD) {
      return res.status(400).json({ error: `Password must be ${MAX_PASSWORD} characters or fewer` });
    }
    if (findUserByEmail(email)) {
      return res.status(409).json({ error: 'Email already registered — try signing in instead' });
    }

    const user = await createUser(name, email, password);
    res.status(201).json({ token: issueToken(user), user: selfUser(user) });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = findUserByEmail(email);

    /**
     * Always run a comparison, even when the address is unknown.
     *
     * The previous code returned immediately if `findUserByEmail` came back
     * empty and otherwise spent a bcrypt round-trip. The difference is trivially
     * measurable over the network, which turned this endpoint into a membership
     * oracle: an attacker could sort a leaked address list into "has an account
     * here" and "does not" without guessing a single password. Comparing against
     * a throwaway hash makes both paths cost the same.
     */
    const valid = await verifyPassword(password, user?.password ?? DUMMY_HASH);

    // Simulated accounts have an unguessable random password and exist only to
    // be talked to. Refuse explicitly rather than relying on that.
    if (!user || !valid || user.isSim) {
      // The message is identical for a bad address and a bad password, on
      // purpose — naming which half was wrong is the same disclosure as above.
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    resetLimit(`login:${clientIp(req)}:${normalizeEmail(email)}`);
    res.json({ token: issueToken(user), user: selfUser(user) });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, (req, res) => {
  // Read through to the store rather than echoing the token's contents, so a
  // renamed account reports its current name and a deleted one is rejected.
  const user = findUserById(req.user.id);
  if (!user) return res.status(401).json({ error: 'Account no longer exists' });
  res.json({ user: selfUser(user) });
});

export default router;
