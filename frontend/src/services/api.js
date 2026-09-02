import axios from 'axios';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const MLEND   = import.meta.env.VITE_MLEND_URL   || 'http://localhost:3002';

const api = axios.create({ baseURL: BACKEND });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('qs_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Fired when the backend rejects our token. `useAuth` listens and signs out. */
export const AUTH_EXPIRED_EVENT = 'qs:auth-expired';

export function clearSession() {
  localStorage.removeItem('qs_token');
  localStorage.removeItem('qs_user');
}

export function expireSession() {
  clearSession();
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
}

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

// Auth
export const authAPI = {
  register: (data) => api.post('/api/auth/register', data),
  login:    (data) => api.post('/api/auth/login', data),
  me:       ()     => api.get('/api/auth/me'),
};

// Chat
export const chatAPI = {
  getRooms:    ()       => api.get('/api/rooms'),
  getMessages: (roomId) => api.get(`/api/rooms/${roomId}/messages`),
};

// AI (MLend)
export const aiAPI = {
  format:    (message)  => axios.post(`${MLEND}/format`,    { message }),
  summarize: (messages) => axios.post(`${MLEND}/summarize`, { messages }),
};
