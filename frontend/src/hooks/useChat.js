import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { io } from 'socket.io-client';
import { chatAPI, socialAPI, expireSession } from '../services/api';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export function useChat(user) {
  const [rooms,        setRooms]        = useState([]);
  const [activeRoomId, setActiveRoomId] = useState(null);
  const [messages,     setMessages]     = useState([]);
  const [hasMore,      setHasMore]      = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [typingUsers,  setTypingUsers]  = useState([]);
  const [members,      setMembers]      = useState([]);
  const [connected,    setConnected]    = useState(false);
  // The socket lives in state as well as a ref: `useSocial` subscribes to it,
  // and a ref would hand that hook a value that never triggers its effect.
  const [socket,       setSocket]       = useState(null);
  const socketRef  = useRef(null);
  const typingTimer = useRef(null);

  /**
   * The active room is derived from the room list rather than stored.
   *
   * It used to be a copy of the room object, which then never changed again —
   * so a community that gained a member, or a room whose unread count moved,
   * kept rendering the snapshot taken when it was clicked. Holding the id and
   * looking it up makes the header and the member list follow the data.
   */
  const activeRoom = useMemo(
    () => rooms.find((room) => room.id === activeRoomId) || null,
    [rooms, activeRoomId]
  );

  /**
   * The active room id, mirrored into a ref.
   *
   * The socket effect below runs once per user and never again, so anything it
   * reads from state is frozen at the value that state had on the render that
   * opened the connection — and on that render there is no active room, because
   * rooms are fetched afterwards. The `new_message` handler was comparing every
   * inbound `roomId` against `undefined` and dropping the message, which
   * silently broke the entire chat: nothing you sent came back, and none of the
   * simulated replies ever arrived.
   */
  const activeRoomIdRef = useRef(null);
  useEffect(() => { activeRoomIdRef.current = activeRoomId; }, [activeRoomId]);

  const refreshRooms = useCallback(async () => {
    try {
      const { data } = await chatAPI.getRooms();
      setRooms(data.rooms);
      return data.rooms;
    } catch {
      return [];
    }
  }, []);

  // Init socket
  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('qs_token');
    const connection = io(BACKEND, { auth: { token }, transports: ['websocket', 'polling'] });
    socketRef.current = connection;
    setSocket(connection);

    connection.on('connect', () => {
      setConnected(true);
      // A reconnect hands us a fresh socket that is in no rooms, and join_room
      // only fires when the active room changes. Without this a client that
      // dropped and came back — server restart, laptop lid, a phone
      // backgrounding the tab — keeps showing the room and silently receives
      // nothing from it.
      const roomId = activeRoomIdRef.current;
      if (roomId) connection.emit('join_room', roomId);
    });

    connection.on('disconnect', () => setConnected(false));

    /**
     * The handshake middleware rejects a missing or invalid token before the
     * connection ever opens, and nothing was listening for that. The room
     * rendered as normal and every send went nowhere — the message was emitted
     * into a socket that was not connected, so it was dropped without an error
     * anywhere the user could see.
     */
    connection.on('connect_error', (err) => {
      setConnected(false);
      if (/auth|token/i.test(err.message || '')) expireSession();
    });

    // Who else is actually in this room. Scoped to the room on screen, since
    // the server broadcasts a roster per room and we may still be joined to
    // the one we just left while its leave is in flight.
    connection.on('presence', ({ roomId, members: list }) => {
      if (roomId !== activeRoomIdRef.current) return;
      setMembers(list);
    });

    connection.on('new_message', ({ roomId, message }) => {
      if (roomId === activeRoomIdRef.current) {
        // The server echoes to everyone in the room, sender included, so guard
        // against a double-append if the same id arrives twice.
        setMessages((p) => (p.some((m) => m.id === message.id) ? p : [...p, message]));
        return;
      }
      // A message in a room you are not looking at. Move its badge rather than
      // dropping it on the floor, which is what used to happen — a direct
      // message could arrive with nothing anywhere on screen to show for it.
      setRooms((p) => p.map((room) => (
        room.id === roomId ? { ...room, unread: (room.unread || 0) + 1 } : room
      )));
    });

    // Sent to a person rather than a room, for rooms they have not opened.
    connection.on('room_activity', ({ roomId }) => {
      if (roomId === activeRoomIdRef.current) return;
      setRooms((p) => p.map((room) => (
        room.id === roomId ? { ...room, unread: (room.unread || 0) + 1 } : room
      )));
    });

    connection.on('message_deleted', ({ roomId, messageId, text }) => {
      if (roomId !== activeRoomIdRef.current) return;
      setMessages((p) => p.map((m) => (
        m.id === messageId ? { ...m, text, deleted: true, reactions: [] } : m
      )));
    });

    // The server broadcasts this after every add_reaction, but nothing was
    // listening — so a reaction incremented on the server and the chip in front
    // of you never moved until the room was re-entered.
    connection.on('reaction_updated', ({ messageId, reactions }) => {
      setMessages((p) => p.map((m) => (m.id === messageId ? { ...m, reactions } : m)));
    });

    connection.on('typing_start', ({ userId, username }) => {
      if (userId !== user.id) setTypingUsers((p) => (p.find((u) => u.id === userId) ? p : [...p, { id: userId, username }]));
    });
    connection.on('typing_stop', ({ userId }) => {
      setTypingUsers((p) => p.filter((u) => u.id !== userId));
    });

    // A new direct message or a community somebody added you to. It has to
    // appear without a refresh or the invitation is invisible.
    connection.on('room_added',   () => { refreshRooms(); });
    connection.on('room_updated', () => { refreshRooms(); });
    connection.on('friend_accepted', () => { refreshRooms(); });
    connection.on('room_removed', ({ roomId }) => {
      setRooms((p) => p.filter((room) => room.id !== roomId));
      if (activeRoomIdRef.current === roomId) setActiveRoomId(null);
    });

    return () => {
      connection.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
  }, [user, refreshRooms]);

  // Load rooms, and open the first one
  useEffect(() => {
    if (!user) return;
    refreshRooms().then((list) => {
      setActiveRoomId((current) => current ?? list[0]?.id ?? null);
    });
  }, [user, refreshRooms]);

  // Join room + load its most recent page
  useEffect(() => {
    if (!activeRoomId) { setMessages([]); return; }
    socketRef.current?.emit('join_room', activeRoomId);

    let cancelled = false;
    chatAPI.getMessages(activeRoomId)
      .then(({ data }) => {
        if (cancelled) return;
        setMessages(data.messages);
        setHasMore(data.hasMore);
      })
      .catch(() => { if (!cancelled) { setMessages([]); setHasMore(false); } });

    setTypingUsers([]);
    setMembers([]);
    // Opening a room reads it. Clear the badge here rather than waiting for the
    // next room fetch, so the count does not linger on the row you are in.
    setRooms((p) => p.map((room) => (room.id === activeRoomId ? { ...room, unread: 0 } : room)));

    return () => { cancelled = true; };
  }, [activeRoomId]);

  const switchRoom = useCallback((room) => {
    const nextId = typeof room === 'string' ? room : room?.id;
    if (!nextId || nextId === activeRoomIdRef.current) return;
    const previous = activeRoomIdRef.current;
    if (socketRef.current && previous) socketRef.current.emit('leave_room', previous);
    setActiveRoomId(nextId);
  }, []);

  /** Page backwards through history — the room keeps more than one screen of it. */
  const loadOlder = useCallback(async () => {
    if (!activeRoomId || !hasMore || loadingOlder || messages.length === 0) return;
    setLoadingOlder(true);
    try {
      const { data } = await chatAPI.getMessages(activeRoomId, { before: messages[0].id });
      setMessages((p) => [...data.messages, ...p]);
      setHasMore(data.hasMore);
    } catch { /* leave the button in place to retry */ }
    finally { setLoadingOlder(false); }
  }, [activeRoomId, hasMore, loadingOlder, messages]);

  const sendMessage = useCallback((text) => {
    if (!text.trim() || !activeRoomIdRef.current || !socketRef.current) return;
    socketRef.current.emit('send_message', { roomId: activeRoomIdRef.current, text });
  }, []);

  const deleteMessage = useCallback((messageId) => {
    if (!activeRoomIdRef.current || !socketRef.current) return;
    socketRef.current.emit('delete_message', { roomId: activeRoomIdRef.current, messageId });
  }, []);

  const startTyping = useCallback(() => {
    const roomId = activeRoomIdRef.current;
    if (!roomId || !socketRef.current) return;
    socketRef.current.emit('typing_start', { roomId });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socketRef.current?.emit('typing_stop', { roomId });
    }, 2000);
  }, []);

  const addReaction = useCallback((messageId, emoji) => {
    const roomId = activeRoomIdRef.current;
    if (!roomId || !socketRef.current) return;
    socketRef.current.emit('add_reaction', { roomId, messageId, emoji });
  }, []);

  /** Open (or create) the direct message with someone, and switch to it. */
  const openDM = useCallback(async (userId) => {
    const { data } = await socialAPI.openDM(userId);
    const list = await refreshRooms();
    const room = list.find((r) => r.id === data.room.id) || data.room;
    switchRoom(room);
    return room;
  }, [refreshRooms, switchRoom]);

  const createCommunity = useCallback(async (body) => {
    const { data } = await socialAPI.createCommunity(body);
    const list = await refreshRooms();
    switchRoom(list.find((r) => r.id === data.room.id) || data.room);
    return data.room;
  }, [refreshRooms, switchRoom]);

  const addToCommunity = useCallback(async (roomId, memberIds) => {
    const { data } = await socialAPI.addMembers(roomId, memberIds);
    await refreshRooms();
    return data.added;
  }, [refreshRooms]);

  const leaveCommunity = useCallback(async (roomId) => {
    await socialAPI.leaveCommunity(roomId);
    const list = await refreshRooms();
    if (activeRoomIdRef.current === roomId) setActiveRoomId(list[0]?.id ?? null);
  }, [refreshRooms]);

  return {
    rooms, activeRoom, messages, hasMore, loadingOlder, typingUsers, members, connected, socket,
    switchRoom, loadOlder, sendMessage, deleteMessage, startTyping, addReaction,
    openDM, createCommunity, addToCommunity, leaveCommunity, refreshRooms,
  };
}
