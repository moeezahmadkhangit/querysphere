import axios from 'axios';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const MLEND   = import.meta.env.VITE_MLEND_URL   || 'http://localhost:3002';

const api = axios.create({ baseURL: BACKEND });

/* ------------------------------------------------------------------ *
 * Browser storage
 *
 * Everything this app keeps on the device is listed here, and it is
 * deliberately short: a token, and the three fields needed to render your own
 * avatar before the first request comes back.
 *
 * Nothing else is cached. Messages, rooms, friend lists and search results are
 * held in React state for the life of the tab and are gone when it closes.
 * Caching a conversation in localStorage would leave it readable by any script
 * on the origin, and — the case that actually bites — sitting on the disk of a
 * shared or borrowed computer long after the person signed out. The
 * conversation is fetched again on load instead; it is a few kilobytes.
 * ------------------------------------------------------------------ */

const TOKEN_KEY = 'qs_token';
const USER_KEY  = 'qs_user';

/** The subset of the account that is safe to keep on the device. No email. */
function persistableUser(user) {
  if (!user) return null;
  return { id: user.id, username: user.username, avatar: user.avatar };
}

export function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(persistableUser(user)));
}

export function saveUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(persistableUser(user)));
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/**
 * Remove every trace of the session from this device.
 *
 * Sweeps the whole `qs_` namespace rather than naming two keys, so a key added
 * later cannot be left behind by a sign-out that was never updated to know
 * about it. sessionStorage is cleared for the same reason even though nothing
 * currently writes there — the guarantee this function makes is "nothing of
 * yours is left", and that has to hold for code written after it.
 */
export function clearSession() {
  for (const store of [localStorage, sessionStorage]) {
    try {
      const keys = Object.keys(store).filter((k) => k.startsWith('qs_'));
      for (const key of keys) store.removeItem(key);
    } catch { /* storage disabled or full — nothing to clear */ }
  }
}

/** Fired when the backend rejects our token. `useAuth` listens and signs out. */
export const AUTH_EXPIRED_EVENT = 'qs:auth-expired';

export function expireSession() {
  clearSession();
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * A dead token used to fail silently.
 *
 * The signed-in user is restored straight out of localStorage and was never
 * checked against the server, so a token that had expired (they last for seven
 * days) or that was signed with a since-changed JWT_SECRET still rendered the
 * full app. Every request behind it 403'd, the socket handshake was rejected,
 * and nothing said so — channels came up empty and sending a message did
 * nothing at all. It reads as a broken app rather than as an expired session.
 *
 * Login and register are excluded: a 401 from those means the password is
 * wrong, which the form already reports, and treating it as an expired session
 * would sign out whoever is already signed in on that device.
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url || '';
    const isCredentialCheck = url.includes('/api/auth/login') || url.includes('/api/auth/register');
    if (!isCredentialCheck && (status === 401 || status === 403)) expireSession();
    return Promise.reject(error);
  }
);

/**
 * Signing out in one tab signs out the others.
 *
 * Two tabs on a shared machine meant closing one and clearing its session left
 * the second one showing an open inbox. The `storage` event fires in every
 * other tab of the origin, so the sign-out propagates.
 */
window.addEventListener('storage', (event) => {
  if (event.key === TOKEN_KEY && event.newValue === null) {
    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
  }
});

// Auth
export const authAPI = {
  register: (data) => api.post('/api/auth/register', data),
  login:    (data) => api.post('/api/auth/login', data),
  me:       ()     => api.get('/api/auth/me'),
};

// Chat
export const chatAPI = {
  getRooms:    ()                  => api.get('/api/rooms'),
  getMessages: (roomId, params={}) => api.get(`/api/rooms/${roomId}/messages`, { params }),
  markRead:    (roomId)            => api.post(`/api/rooms/${roomId}/read`),
};

// People, friends and communities
export const socialAPI = {
  search:        (q)               => api.get('/api/social/users', { params: { q } }),
  suggestions:   ()                => api.get('/api/social/suggestions'),
  friends:       ()                => api.get('/api/social/friends'),
  addFriend:     (userId)          => api.post('/api/social/friends', { userId }),
  accept:        (userId)          => api.post(`/api/social/friends/${userId}/accept`),
  decline:       (userId)          => api.post(`/api/social/friends/${userId}/decline`),
  remove:        (userId)          => api.delete(`/api/social/friends/${userId}`),
  openDM:        (userId)          => api.post('/api/social/dm', { userId }),
  createCommunity: (body)          => api.post('/api/social/communities', body),
  addMembers:    (roomId, memberIds) => api.post(`/api/social/communities/${roomId}/members`, { memberIds }),
  leaveCommunity:(roomId)          => api.delete(`/api/social/communities/${roomId}/members/me`),
};

// AI (MLend)
export const aiAPI = {
  format:    (message)  => axios.post(`${MLEND}/format`,    { message }),
  summarize: (messages) => axios.post(`${MLEND}/summarize`, { messages }),
};
