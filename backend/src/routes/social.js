import express from 'express';
import {
  findUserById,
  publicUser,
  searchUsers,
  suggestionsFor,
  friendState,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  removeFriend,
  getOrCreateDM,
  createCommunity,
  addCommunityMembers,
  leaveCommunity,
  getRoom,
  roomView,
  canAccess,
  addMessage,
} from '../data/store.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { notifyUser, notifyUsers } from '../socket/notify.js';

const router = express.Router();
router.use(authenticateToken);

/** Resolve a target user from the body or the path, or answer 404 and stop. */
function targetUser(res, id) {
  const user = findUserById(id);
  if (!user) {
    res.status(404).json({ error: 'That person is no longer on QuerySphere' });
    return null;
  }
  return user;
}

/* ---------------------------- discovery ---------------------------- */

// GET /api/social/users?q=
router.get('/users', (req, res) => {
  res.json({ results: searchUsers(req.user, req.query.q) });
});

// GET /api/social/suggestions
router.get('/suggestions', (req, res) => {
  res.json({ suggestions: suggestionsFor(req.user) });
});

/* ----------------------------- friends ----------------------------- */

// GET /api/social/friends
router.get('/friends', (req, res) => {
  const me = req.user;
  const list = (ids) => [...ids].map((id) => publicUser(findUserById(id))).filter(Boolean);
  res.json({
    friends: list(me.friends).sort((a, b) => a.username.localeCompare(b.username)),
    incoming: list(me.requestsIn),
    outgoing: list(me.requestsOut),
  });
});

/**
 * The simulated developers accept after a beat and open with a greeting.
 *
 * A brand new account has no one to talk to, so every part of this feature —
 * the request, the acceptance, the direct message that follows — would look
 * broken to the first person who tried it. These three make the whole flow
 * demonstrable by yourself, and the delay is what stops it feeling like a
 * button that just toggles a label.
 */
function simAcceptsLater(sim, me) {
  setTimeout(() => {
    try {
      const { room } = acceptFriendRequest(sim, me);
      notifyUser(me.id, 'friend_accepted', { user: publicUser(sim), room: roomView(room, me.id) });

      const greeting = {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        userId: sim.id,
        username: sim.username,
        avatar: sim.avatar,
        text: `Hey ${me.username}! Good to be connected 👋 What are you building?`,
        timestamp: new Date().toISOString(),
        reactions: [],
        isBot: true,
      };
      addMessage(room.id, greeting);
      notifyUsers([me.id, sim.id], 'new_message', { roomId: room.id, message: greeting });
    } catch { /* they cancelled the request in the meantime */ }
  }, 1400);
}

// POST /api/social/friends  { userId }
router.post('/friends', (req, res) => {
  const other = targetUser(res, req.body?.userId);
  if (!other) return;

  try {
    const result = sendFriendRequest(req.user, other);

    if (result.status === 'friends') {
      notifyUser(other.id, 'friend_accepted', { user: publicUser(req.user), room: roomView(result.room, other.id) });
      return res.json({ status: 'friends', room: roomView(result.room, req.user.id) });
    }

    if (other.isSim) simAcceptsLater(other, req.user);
    else notifyUser(other.id, 'friend_request', { user: publicUser(req.user) });

    res.json({ status: result.status });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/social/friends/:userId/accept
router.post('/friends/:userId/accept', (req, res) => {
  const other = targetUser(res, req.params.userId);
  if (!other) return;
  try {
    const { room } = acceptFriendRequest(req.user, other);
    notifyUser(other.id, 'friend_accepted', { user: publicUser(req.user), room: roomView(room, other.id) });
    res.json({ status: 'friends', room: roomView(room, req.user.id) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/social/friends/:userId/decline
router.post('/friends/:userId/decline', (req, res) => {
  const other = targetUser(res, req.params.userId);
  if (!other) return;
  declineFriendRequest(req.user, other);
  // Deliberately silent towards the sender: telling someone their request was
  // refused is information they do not need and cannot act on well.
  res.json({ status: 'none' });
});

// DELETE /api/social/friends/:userId  — cancels a pending request, or unfriends
router.delete('/friends/:userId', (req, res) => {
  const other = targetUser(res, req.params.userId);
  if (!other) return;
  const state = friendState(req.user, other.id);
  if (state === 'requested') cancelFriendRequest(req.user, other);
  else if (state === 'friends') {
    removeFriend(req.user, other);
    notifyUser(other.id, 'friend_removed', { userId: req.user.id });
  }
  res.json({ status: 'none' });
});

/* --------------------------- direct messages ------------------------ */

// POST /api/social/dm  { userId }
router.post('/dm', (req, res) => {
  const other = targetUser(res, req.body?.userId);
  if (!other) return;
  if (other.id === req.user.id) {
    return res.status(400).json({ error: 'You cannot message yourself' });
  }
  /**
   * Being friends is what makes a direct message possible.
   *
   * Without this check the endpoint is an open channel to any account whose id
   * you can obtain — which the search endpoint hands out — so the request and
   * accept flow would be decoration that anyone could route around.
   */
  if (!req.user.friends.has(other.id)) {
    return res.status(403).json({ error: 'Add each other first to start a direct message' });
  }
  const room = getOrCreateDM(req.user.id, other.id);
  notifyUser(other.id, 'room_added', { room: roomView(room, other.id) });
  res.json({ room: roomView(room, req.user.id) });
});

/* ---------------------------- communities --------------------------- */

// POST /api/social/communities  { name, description, icon, memberIds }
router.post('/communities', (req, res) => {
  const { name, description, icon, memberIds } = req.body ?? {};
  const requested = Array.isArray(memberIds) ? memberIds.slice(0, 50) : [];
  try {
    const room = createCommunity(req.user, { name, description, icon, memberIds: requested });
    for (const id of room.memberIds) {
      if (id === req.user.id) continue;
      notifyUser(id, 'room_added', { room: roomView(room, id), invitedBy: publicUser(req.user) });
    }
    res.status(201).json({ room: roomView(room, req.user.id) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/social/communities/:roomId/members  { memberIds }
router.post('/communities/:roomId/members', (req, res) => {
  const room = getRoom(req.params.roomId);
  if (!room || room.type !== 'community') {
    return res.status(404).json({ error: 'Community not found' });
  }
  // Only somebody already inside may bring somebody else in. Checking
  // membership rather than ownership keeps a community usable when its creator
  // is offline, without making it an open door.
  if (!canAccess(req.user.id, room)) {
    return res.status(403).json({ error: 'You are not in that community' });
  }

  const requested = Array.isArray(req.body?.memberIds) ? req.body.memberIds.slice(0, 50) : [];
  const added = addCommunityMembers(room, requested);

  for (const user of added) {
    notifyUser(user.id, 'room_added', { room: roomView(room, user.id), invitedBy: publicUser(req.user) });
  }
  // Everyone already inside needs the member list they are looking at to update.
  notifyUsers([...room.memberIds], 'room_updated', { roomId: room.id, members: added.map(publicUser) });

  res.json({ added: added.map(publicUser), room: roomView(room, req.user.id) });
});

// DELETE /api/social/communities/:roomId/members/me
router.delete('/communities/:roomId/members/me', (req, res) => {
  const room = getRoom(req.params.roomId);
  if (!room || room.type !== 'community') {
    return res.status(404).json({ error: 'Community not found' });
  }
  if (!canAccess(req.user.id, room)) {
    return res.status(403).json({ error: 'You are not in that community' });
  }
  leaveCommunity(room, req.user.id);
  notifyUsers([...(room.memberIds ?? [])], 'room_updated', { roomId: room.id, leftId: req.user.id });
  notifyUser(req.user.id, 'room_removed', { roomId: room.id });
  res.json({ ok: true });
});

export default router;
