import { useState, useEffect, useCallback } from 'react';
import { socialAPI } from '../services/api';

/**
 * The social graph: who you know, who has asked to know you, and who you might.
 *
 * Kept out of `useChat` on purpose. Rooms and messages change on every keypress
 * in a busy channel; friendships change a few times a session. Sharing one hook
 * would re-render the whole sidebar every time a message arrived.
 *
 * Nothing here is written to browser storage — see services/api.js. It is
 * re-fetched when the panel opens, which is cheap and cannot go stale.
 */
export function useSocial(user, socket) {
  const [friends,     setFriends]     = useState([]);
  const [incoming,    setIncoming]    = useState([]);
  const [outgoing,    setOutgoing]    = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [{ data: graph }, { data: suggested }] = await Promise.all([
        socialAPI.friends(),
        socialAPI.suggestions(),
      ]);
      setFriends(graph.friends);
      setIncoming(graph.incoming);
      setOutgoing(graph.outgoing);
      setSuggestions(suggested.suggestions);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load people right now.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  /**
   * Someone else acting on the graph has to move this UI too.
   *
   * A friend request that only appears after a manual refresh is a request
   * nobody ever sees — there is nothing on screen to prompt the refresh.
   */
  useEffect(() => {
    if (!socket) return;
    const onChange = () => refresh();
    socket.on('friend_request',  onChange);
    socket.on('friend_accepted', onChange);
    socket.on('friend_removed',  onChange);
    return () => {
      socket.off('friend_request',  onChange);
      socket.off('friend_accepted', onChange);
      socket.off('friend_removed',  onChange);
    };
  }, [socket, refresh]);

  /** Wrap a call so a failure surfaces as a message instead of an unhandled rejection. */
  const run = useCallback(async (fn) => {
    try {
      const result = await fn();
      await refresh();
      return result;
    } catch (err) {
      setError(err.response?.data?.error || 'That did not work — try again.');
      return null;
    }
  }, [refresh]);

  return {
    friends, incoming, outgoing, suggestions, loading, error, setError, refresh,
    addFriend:   (userId) => run(() => socialAPI.addFriend(userId)),
    accept:      (userId) => run(() => socialAPI.accept(userId)),
    decline:     (userId) => run(() => socialAPI.decline(userId)),
    removeFriend:(userId) => run(() => socialAPI.remove(userId)),
    search:      (q)      => socialAPI.search(q).then(({ data }) => data.results).catch(() => []),
  };
}
