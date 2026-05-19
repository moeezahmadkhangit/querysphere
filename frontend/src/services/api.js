import axios from 'axios';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const MLEND   = import.meta.env.VITE_MLEND_URL   || 'http://localhost:3002';

const api = axios.create({ baseURL: BACKEND });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('qs_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

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
