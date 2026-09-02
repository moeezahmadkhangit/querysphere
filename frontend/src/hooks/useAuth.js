import { useState, useCallback, useEffect } from 'react';
import { authAPI, clearSession, saveSession, saveUser, getStoredUser, AUTH_EXPIRED_EVENT } from '../services/api';

export function useAuth() {
  const [user, setUser]       = useState(getStoredUser);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  /**
   * Confirm the restored session is still good.
   *
   * `getStoredUser` reads localStorage and trusts it, so the app came up fully
   * signed in on a token the server would refuse. `/api/auth/me` existed for
   * exactly this and was never called by anything.
   *
   * A request that came back with no response at all is a different case: the
   * backend is down or the network dropped. Signing someone out for that would
   * cost them their session over a restart of a dev server, so it is left
   * alone — only an actual 401/403 ends the session, via the interceptor.
   */
  useEffect(() => {
    if (!getStoredUser()) return;
    authAPI.me()
      .then(({ data }) => {
        setUser(data.user);
        saveUser(data.user);
      })
      .catch(() => {});
  }, []);

  // Raised by the response interceptor, by the socket when its handshake is
  // rejected, and by a sign-out in another tab. All funnel here so there is one
  // way to be signed out.
  useEffect(() => {
    const onExpired = () => {
      setUser((current) => {
        if (current) setError('Your session expired — please sign in again.');
        return null;
      });
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  const login = useCallback(async (email, password) => {
    setLoading(true); setError('');
    try {
      const { data } = await authAPI.login({ email, password });
      saveSession(data.token, data.user);
      setUser(data.user);
      return true;
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed — is the backend running on :3001?');
      return false;
    } finally { setLoading(false); }
  }, []);

  const register = useCallback(async (username, email, password) => {
    setLoading(true); setError('');
    try {
      const { data } = await authAPI.register({ username, email, password });
      saveSession(data.token, data.user);
      setUser(data.user);
      return true;
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed — is the backend running on :3001?');
      return false;
    } finally { setLoading(false); }
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
    setError('');
  }, []);

  return { user, loading, error, login, register, logout, setError };
}
