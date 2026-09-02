import jwt from 'jsonwebtoken';
import { findUserById } from '../data/store.js';

/**
 * Verify the bearer token and attach the live user record.
 *
 * `req.user` used to be the decoded token payload, which meant handlers worked
 * from a snapshot of the account taken up to seven days earlier and had no way
 * to reach the friend list or room membership that authorisation now depends
 * on. Resolving to the stored record also revokes a token whose account is
 * gone, which a signature check alone can never do.
 */
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }

  const user = findUserById(payload.id);
  if (!user) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }

  req.user = user;
  next();
}
