/**
 * A one-way channel from the HTTP routes to a person's open sockets.
 *
 * Friending, community invites and new direct messages all happen over REST,
 * but the person on the other end is looking at a sidebar that was rendered
 * minutes ago. Without a push they only find out by refreshing — which for an
 * incoming friend request means never, because nothing tells them to.
 *
 * Every socket joins a room named after its user id on connect, so this
 * addresses a person rather than a connection: all their open tabs get it, and
 * a user with none simply misses it, which is correct.
 */

let io = null;

export function setIo(instance) {
  io = instance;
}

export function notifyUser(userId, event, payload) {
  io?.to(`user:${userId}`).emit(event, payload);
}

export function notifyUsers(userIds, event, payload) {
  for (const id of userIds) notifyUser(id, event, payload);
}
