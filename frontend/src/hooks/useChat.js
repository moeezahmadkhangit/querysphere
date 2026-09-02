import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { chatAPI, expireSession } from '../services/api';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export function useChat(user) {
  const [rooms,        setRooms]        = useState([]);
  const [activeRoom,   setActiveRoom]   = useState(null);
  const [messages,     setMessages]     = useState([]);
  const [typingUsers,  setTypingUsers]  = useState([]);
  const [members,      setMembers]      = useState([]);
  const [connected,    setConnected]    = useState(false);
  const socketRef  = useRef(null);
  const typingTimer = useRef(null);

  /**
   * The active room, mirrored into a ref.
   *
   * The socket effect below runs once per user and never again, so anything it
   * reads from state is frozen at the value that state had on the render that
   * opened the connection — and on that render `activeRoom` is still null,
   * because rooms are fetched afterwards. The `new_message` handler was
   * comparing every inbound `roomId` against `undefined` and dropping the
   * message, which silently broke the entire chat: nothing you sent came back,
   * and none of the simulated replies ever arrived.
   *
   * A ref is read at call time, so the handler sees the room you are actually
   * looking at. Re-subscribing on every room change would work too, but it
   * would tear down and rebuild the socket listeners on each click.
   */
  const activeRoomRef = useRef(null);
  useEffect(() => { activeRoomRef.current = activeRoom; }, [activeRoom]);

  // Init socket
  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('qs_token');
    const socket = io(BACKEND, { auth: { token }, transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('connect', () => {
      setConnected(true);
      // A reconnect hands us a fresh socket that is in no rooms, and join_room
      // only fires when the active room changes. Without this a client that
      // dropped and came back — server restart, laptop lid, a phone
      // backgrounding the tab — keeps showing the room and silently receives
      // nothing from it.
      const room = activeRoomRef.current;
      if (room) socket.emit('join_room', room.id);
    });
    socket.on('disconnect', () => setConnected(false));
    /**
     * The handshake middleware rejects a missing or invalid token before the
     * connection ever opens, and nothing was listening for that. The room
     * rendered as normal and every send went nowhere — the message was emitted
     * into a socket that was not connected, so it was dropped without an error
     * anywhere the user could see.
     */
    socket.on('connect_error', (err) => {
      setConnected(false);
      if (/auth|token/i.test(err.message || '')) expireSession();
    });
    // Who else is actually in this room. Scoped to the room on screen, since
    // the server broadcasts a roster per room and we may still be joined to
    // the one we just left while its leave is in flight.
    socket.on('presence', ({ roomId, members: list }) => {
      if (roomId !== activeRoomRef.current?.id) return;
      setMembers(list);
    });
    socket.on('new_message', ({ roomId, message }) => {
      if (roomId !== activeRoomRef.current?.id) return;
      // The server echoes to everyone in the room, sender included, so guard
      // against a double-append if the same id arrives twice.
      setMessages((p) => (p.some((m) => m.id === message.id) ? p : [...p, message]));
    });
    // The server broadcasts this after every add_reaction, but nothing was
    // listening — so a reaction incremented on the server and the chip in front
    // of you never moved until the room was re-entered.
    socket.on('reaction_updated', ({ messageId, reactions }) => {
      setMessages((p) => p.map((m) => (m.id === messageId ? { ...m, reactions } : m)));
    });
    socket.on('typing_start', ({ userId, username }) => {
      if (userId !== user.id) setTypingUsers((p) => p.find(u => u.id === userId) ? p : [...p, { id: userId, username }]);
    });
    socket.on('typing_stop', ({ userId }) => {
      setTypingUsers((p) => p.filter((u) => u.id !== userId));
    });
    return () => socket.disconnect();
  }, [user]); // eslint-disable-line

  // Load rooms
  useEffect(() => {
    if (!user) return;
    chatAPI.getRooms().then(({ data }) => {
      setRooms(data.rooms);
      if (data.rooms.length > 0 && !activeRoom) setActiveRoom(data.rooms[0]);
    }).catch(() => {});
  }, [user]); // eslint-disable-line

  // Join room + load messages
  useEffect(() => {
    if (!activeRoom || !socketRef.current) return;
    socketRef.current.emit('join_room', activeRoom.id);
    chatAPI.getMessages(activeRoom.id).then(({ data }) => {
      setMessages(data.messages);
    }).catch(() => setMessages([]));
    setTypingUsers([]);
    setMembers([]);
  }, [activeRoom]);

  const switchRoom = useCallback((room) => {
    if (socketRef.current && activeRoom) socketRef.current.emit('leave_room', activeRoom.id);
    setActiveRoom(room);
  }, [activeRoom]);

  const sendMessage = useCallback((text) => {
    if (!text.trim() || !activeRoom || !socketRef.current) return;
    socketRef.current.emit('send_message', { roomId: activeRoom.id, text });
  }, [activeRoom]);

  const startTyping = useCallback(() => {
    if (!activeRoom || !socketRef.current) return;
    socketRef.current.emit('typing_start', { roomId: activeRoom.id });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socketRef.current?.emit('typing_stop', { roomId: activeRoom.id });
    }, 2000);
  }, [activeRoom]);

  const addReaction = useCallback((messageId, emoji) => {
    if (!activeRoom || !socketRef.current) return;
    socketRef.current.emit('add_reaction', { roomId: activeRoom.id, messageId, emoji });
  }, [activeRoom]);

  return { rooms, activeRoom, messages, typingUsers, members, connected, switchRoom, sendMessage, startTyping, addReaction };
}
