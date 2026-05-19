import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { chatAPI } from '../services/api';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export function useChat(user) {
  const [rooms,        setRooms]        = useState([]);
  const [activeRoom,   setActiveRoom]   = useState(null);
  const [messages,     setMessages]     = useState([]);
  const [typingUsers,  setTypingUsers]  = useState([]);
  const [connected,    setConnected]    = useState(false);
  const socketRef  = useRef(null);
  const typingTimer = useRef(null);

  // Init socket
  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('qs_token');
    const socket = io(BACKEND, { auth: { token }, transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('connect',    () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('new_message', ({ roomId, message }) => {
      if (roomId === activeRoom?.id) setMessages((p) => [...p, message]);
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

  return { rooms, activeRoom, messages, typingUsers, connected, switchRoom, sendMessage, startTyping, addReaction };
}
