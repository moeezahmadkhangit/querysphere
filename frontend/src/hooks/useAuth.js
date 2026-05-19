import { useState, useCallback } from 'react';
import { authAPI } from '../services/api';

function getStoredUser() {
  try {
    const raw = localStorage.getItem('qs_user');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function useAuth() {
  const [user, setUser]       = useState(getStoredUser);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const login = useCallback(async (email, password) => {
    setLoading(true); setError('');
    try {
      const { data } = await authAPI.login({ email, password });
      localStorage.setItem('qs_token', data.token);
      localStorage.setItem('qs_user', JSON.stringify(data.user));
      setUser(data.user);
      return true;
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
      return false;
    } finally { setLoading(false); }
  }, []);

  const register = useCallback(async (username, email, password) => {
    setLoading(true); setError('');
    try {
      const { data } = await authAPI.register({ username, email, password });
      localStorage.setItem('qs_token', data.token);
      localStorage.setItem('qs_user', JSON.stringify(data.user));
      setUser(data.user);
      return true;
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
      return false;
    } finally { setLoading(false); }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('qs_token');
    localStorage.removeItem('qs_user');
    setUser(null);
  }, []);

  return { user, loading, error, login, register, logout, setError };
}
