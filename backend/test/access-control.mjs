/**
 * Adversarial test: a room id is not a capability.
 *
 * Direct message ids are derived from the two user ids that own them
 * (`dm_<sorted ids>`), and user ids are handed out freely by search and by the
 * suggestion list. So the id of somebody else's private conversation is not a
 * secret and was never meant to be one — guessing it is expected. What has to
 * hold is that knowing it gets you nothing.
 *
 * This walks every surface that accepts a roomId, as an authenticated outsider,
 * and asserts each one refuses. It also checks the weaker properties that make
 * the refusal meaningful: that a forbidden room is indistinguishable from a
 * missing one, and that nothing leaks through presence, typing or read state.
 *
 *   node --run test:access      (from backend/)
 */
import { spawn } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { io } = require('socket.io-client');

const PORT = 3400 + Math.floor(Math.random() * 150);
const BASE = `http://localhost:${PORT}`;
const DATA_DIR = mkdtempSync(join(tmpdir(), 'qs-access-'));

let failures = 0;
let checks = 0;

function ok(condition, label, detail = '') {
  checks++;
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`);
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const api = (path, { method = 'GET', token, body } = {}) =>
  fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }).then(async (res) => ({ status: res.status, body: await res.text() }));

const register = async (name) => {
  const { body } = await api('/api/auth/register', {
    method: 'POST',
    body: { username: name, email: `${name.toLowerCase()}${Date.now()}@test.invalid`, password: 'correct-horse-battery' },
  });
  return JSON.parse(body);
};

const connect = (token) =>
  new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token }, transports: ['websocket'], reconnection: false });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });

// ------------------------------------------------------------------ boot

const server = spawn(process.execPath, ['src/index.js'], {
  cwd: new URL('..', import.meta.url).pathname,
  env: {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR,
    JWT_SECRET: 'a'.repeat(64),
    DATA_ENCRYPTION_KEY: 'b'.repeat(64),
    KEEP_ALIVE_INTERVAL_MS: '',
    NODE_ENV: 'test',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', (d) => process.stderr.write(d));

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('server did not start')), 15000);
  server.stdout.on('data', (d) => {
    if (d.toString().includes('running on')) { clearTimeout(timer); resolve(); }
  });
  server.on('exit', (code) => reject(new Error(`server exited with ${code}`)));
});

function finish() {
  server.kill();
  rmSync(DATA_DIR, { recursive: true, force: true });
  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed\n`);
  process.exit(failures === 0 ? 0 : 1);
}

try {
  // ---------------------------------------------------------- the setup
  //
  // Alice and Bob hold a private conversation. Eve is a perfectly ordinary
  // signed-up user who knows their ids — which is realistic, because the
  // directory hands them out.
  const alice = await register('Alice');
  const bob = await register('Bob');
  const eve = await register('Eve');

  await api('/api/social/friends', { method: 'POST', token: alice.token, body: { userId: bob.user.id } });
  const accepted = await api(`/api/social/friends/${alice.user.id}/accept`, { method: 'POST', token: bob.token });
  const dmId = JSON.parse(accepted.body).room.id;

  const community = JSON.parse((await api('/api/social/communities', {
    method: 'POST', token: alice.token, body: { name: 'Private Guild', memberIds: [bob.user.id] },
  })).body).room.id;

  const sa = await connect(alice.token);
  sa.emit('join_room', dmId);
  await wait(200);
  sa.emit('send_message', { roomId: dmId, text: 'the secret is 42' });
  sa.emit('send_message', { roomId: community, text: 'guild business' });
  await wait(400);

  console.log('\nEve can derive the room ids without being told:');
  const derived = `dm_${[alice.user.id, bob.user.id].sort().join('__')}`;
  ok(derived === dmId, 'the DM id is reproducible from two public user ids', `derived ${derived}`);

  // ------------------------------------------------------- REST surfaces
  console.log('\nREST, as Eve holding a valid token:');

  const history = await api(`/api/rooms/${dmId}/messages`, { token: eve.token });
  ok(history.status === 404, 'GET /api/rooms/:id/messages on the DM is refused', `got ${history.status}`);
  ok(!history.body.includes('secret is 42'), 'no message text in that response');

  const comHistory = await api(`/api/rooms/${community}/messages`, { token: eve.token });
  ok(comHistory.status === 404, 'GET messages on the community is refused', `got ${comHistory.status}`);
  ok(!comHistory.body.includes('guild business'), 'no community message text in that response');

  const missing = await api('/api/rooms/dm_does_not_exist__at_all/messages', { token: eve.token });
  ok(
    missing.status === history.status && missing.body === history.body,
    'a forbidden room is byte-identical to a non-existent one (no existence oracle)',
    `forbidden=${history.status}:${history.body} missing=${missing.status}:${missing.body}`
  );

  const read = await api(`/api/rooms/${dmId}/read`, { method: 'POST', token: eve.token });
  ok(read.status === 404, 'POST /api/rooms/:id/read on the DM is refused', `got ${read.status}`);

  const rooms = JSON.parse((await api('/api/rooms', { token: eve.token })).body).rooms;
  ok(!rooms.some((r) => r.id === dmId), "the DM is absent from Eve's room list");
  ok(!rooms.some((r) => r.id === community), "the community is absent from Eve's room list");
  ok(rooms.every((r) => r.type === 'channel'), 'Eve sees public channels and nothing else');

  const invite = await api(`/api/social/communities/${community}/members`, {
    method: 'POST', token: eve.token, body: { memberIds: [eve.user.id] },
  });
  ok(invite.status === 403, 'Eve cannot add herself to the community', `got ${invite.status}`);

  const dmAsCommunity = await api(`/api/social/communities/${dmId}/members`, {
    method: 'POST', token: eve.token, body: { memberIds: [eve.user.id] },
  });
  ok(dmAsCommunity.status === 404, 'a DM cannot be treated as a community to join', `got ${dmAsCommunity.status}`);

  const forceDM = await api('/api/social/dm', { method: 'POST', token: eve.token, body: { userId: alice.user.id } });
  ok(forceDM.status === 403, 'Eve cannot open a DM with a non-friend', `got ${forceDM.status}`);

  // ----------------------------------------------------- socket surfaces
  console.log('\nSockets, as Eve holding a valid token:');

  const se = await connect(eve.token);
  const leaked = [];
  for (const event of ['new_message', 'presence', 'typing_start', 'reaction_updated', 'message_deleted', 'user_joined']) {
    se.on(event, (payload) => leaked.push({ event, payload }));
  }

  se.emit('join_room', dmId);
  se.emit('join_room', community);
  // A room named after somebody's private notification channel is not a room.
  se.emit('join_room', `user:${alice.user.id}`);
  await wait(400);

  sa.emit('send_message', { roomId: dmId, text: 'still private?' });
  sa.emit('typing_start', { roomId: dmId });
  sa.emit('send_message', { roomId: community, text: 'still private?' });
  await wait(700);

  ok(leaked.length === 0, 'Eve receives nothing after joining both ids', JSON.stringify(leaked).slice(0, 300));

  // Writing into a room she cannot read must not work either.
  se.emit('send_message', { roomId: dmId, text: 'injected by Eve' });
  se.emit('add_reaction', { roomId: dmId, messageId: 'anything', emoji: '👀' });
  await wait(500);

  const aliceView = JSON.parse((await api(`/api/rooms/${dmId}/messages`, { token: alice.token })).body);
  ok(!aliceView.messages.some((m) => m.text === 'injected by Eve'), 'Eve cannot post into the DM');
  ok(!aliceView.messages.some((m) => m.userId === eve.user.id), 'no message in the DM is authored by Eve');

  // Deleting somebody else's message, in a room she is not even in.
  const target = aliceView.messages[0];
  se.emit('delete_message', { roomId: dmId, messageId: target.id });
  await wait(400);
  const afterDelete = JSON.parse((await api(`/api/rooms/${dmId}/messages`, { token: alice.token })).body);
  ok(!afterDelete.messages.find((m) => m.id === target.id)?.deleted, "Eve cannot delete Alice's message");

  // Presence: Alice must not learn that Eve tried.
  const roster = await new Promise((resolve) => {
    sa.once('presence', ({ members }) => resolve(members));
    sa.emit('join_room', dmId);
    setTimeout(() => resolve([]), 1500);
  });
  ok(!roster.some((m) => m.userId === eve.user.id), 'Eve never appears in the DM roster');

  // -------------------------------------- the personal notification channel
  //
  // Every socket joins a room named after its own user id so the REST routes
  // can push friend requests and invitations to it. That makes `user:<id>` a
  // guessable Socket.io room name carrying somebody's private notifications —
  // the one new attack surface this design introduced. It is not a room in the
  // store, so `join_room` cannot reach it, but that has to be demonstrated
  // rather than assumed.
  console.log('\nThe per-user notification channel:');

  const privateEvents = [];
  for (const event of ['friend_request', 'friend_accepted', 'room_added', 'room_updated', 'room_activity', 'room_removed']) {
    se.on(event, (payload) => privateEvents.push({ event, payload }));
  }
  se.emit('join_room', `user:${alice.user.id}`);
  se.emit('join_room', `user:${bob.user.id}`);
  await wait(300);

  // Things that push to Alice's and Bob's personal channels.
  const mallory = await register('Mallory');
  await api('/api/social/friends', { method: 'POST', token: mallory.token, body: { userId: alice.user.id } });
  await api('/api/social/communities', {
    method: 'POST', token: alice.token, body: { name: 'Another Guild', memberIds: [bob.user.id] },
  });
  sa.emit('send_message', { roomId: community, text: 'more guild business' });
  await wait(700);

  ok(
    privateEvents.length === 0,
    "Eve receives none of Alice's or Bob's private notifications",
    JSON.stringify(privateEvents).slice(0, 300)
  );

  // ------------------------------------------- writes into unreachable rooms
  console.log('\nWrites aimed at rooms Eve is not in:');

  let sawPhantom = false;
  sa.on('user_left', ({ userId }) => { if (userId === eve.user.id) sawPhantom = true; });
  sa.on('typing_start', ({ userId }) => { if (userId === eve.user.id) sawPhantom = true; });
  se.emit('leave_room', dmId);
  se.emit('typing_start', { roomId: dmId });
  se.emit('mark_read', { roomId: dmId });
  await wait(600);
  ok(!sawPhantom, 'Eve cannot announce herself into the DM via leave/typing');

  // ------------------------------------------ leaving revokes what you saw
  console.log('\nAfter leaving a community:');

  const beforeLeave = await api(`/api/rooms/${community}/messages`, { token: bob.token });
  ok(beforeLeave.status === 200, 'Bob can read the community while he is in it');

  await api(`/api/social/communities/${community}/members/me`, { method: 'DELETE', token: bob.token });
  const afterLeave = await api(`/api/rooms/${community}/messages`, { token: bob.token });
  ok(afterLeave.status === 404, 'Bob cannot read it once he has left', `got ${afterLeave.status}`);

  const bobRooms = JSON.parse((await api('/api/rooms', { token: bob.token })).body).rooms;
  ok(!bobRooms.some((r) => r.id === community), 'and it is gone from his room list');

  const sb = await connect(bob.token);
  let postLeaveLeak = false;
  sb.on('new_message', ({ roomId }) => { if (roomId === community) postLeaveLeak = true; });
  sb.emit('join_room', community);
  await wait(300);
  sa.emit('send_message', { roomId: community, text: 'said after Bob left' });
  await wait(700);
  ok(!postLeaveLeak, 'and he cannot rejoin over the socket to keep listening');
  sb.close();

  // ------------------------------------------ removing somebody means something
  //
  // Friendship gated the CREATION of a direct message and was never checked
  // again, so removing somebody left them holding an open channel to you.
  console.log('\nAfter Alice removes Bob:');

  const sb2 = await connect(bob.token);
  sb2.emit('join_room', dmId);
  await wait(250);

  await api(`/api/social/friends/${bob.user.id}`, { method: 'DELETE', token: alice.token });
  await wait(200);

  const bobStillReads = await api(`/api/rooms/${dmId}/messages`, { token: bob.token });
  ok(bobStillReads.status === 200, 'Bob keeps his own copy of the conversation (deliberate)');

  const bobRoomView = JSON.parse((await api('/api/rooms', { token: bob.token })).body)
    .rooms.find((r) => r.id === dmId);
  ok(bobRoomView?.readOnly === true, 'the room is flagged read-only so the composer can say so');

  sb2.emit('send_message', { roomId: dmId, text: 'can Bob still reach Alice?' });
  sb2.emit('typing_start', { roomId: dmId });
  await wait(600);
  const alicePostRemoval = JSON.parse((await api(`/api/rooms/${dmId}/messages`, { token: alice.token })).body);
  ok(
    !alicePostRemoval.messages.some((m) => m.text === 'can Bob still reach Alice?'),
    'but he can no longer send anything to Alice'
  );

  sb2.emit('add_reaction', { roomId: dmId, messageId: alicePostRemoval.messages[0].id, emoji: '👀' });
  await wait(400);
  const afterReaction = JSON.parse((await api(`/api/rooms/${dmId}/messages`, { token: alice.token })).body);
  ok(
    (afterReaction.messages[0].reactions || []).every((r) => r.emoji !== '👀'),
    'and he cannot reach her with a reaction either'
  );
  sb2.close();

  se.close();
  sa.close();
} catch (err) {
  failures++;
  console.error('\nTest harness error:', err);
}

finish();
