import { useState } from 'react';
import AuthScreen from './components/AuthScreen';
import Sidebar from './components/Sidebar';
import ChatRoom from './components/ChatRoom';
import { useAuth } from './hooks/useAuth';
import { useChat } from './hooks/useChat';

export default function App() {
  const { user, loading, error, login, register, logout, setError } = useAuth();
  const { rooms, activeRoom, messages, typingUsers, members, connected, switchRoom, sendMessage, startTyping, addReaction } = useChat(user);
  // Below 720px the sidebar is a slide-over rather than a column. Desktop
  // ignores this entirely — the CSS only consults it inside the media query.
  const [navOpen, setNavOpen] = useState(false);

  if (!user) {
    return (
      <AuthScreen
        onLogin={login}
        onRegister={register}
        loading={loading}
        error={error}
        setError={setError}
      />
    );
  }

  return (
    <div className={`app-layout${navOpen ? ' nav-open' : ''}`}>
      <Sidebar
        user={user}
        rooms={rooms}
        activeRoom={activeRoom}
        members={members}
        connected={connected}
        onSwitch={(room) => { switchRoom(room); setNavOpen(false); }}
        onLogout={logout}
      />
      {/* Only ever visible under the narrow media query; it is what closes the
          slide-over when you tap beside it. */}
      <button
        className="nav-scrim"
        aria-label="Close channel list"
        tabIndex={navOpen ? 0 : -1}
        onClick={() => setNavOpen(false)}
      />
      <ChatRoom
        room={activeRoom}
        messages={messages}
        typingUsers={typingUsers}
        user={user}
        onSend={sendMessage}
        onStartTyping={startTyping}
        onReact={addReaction}
        connected={connected}
        onToggleNav={() => setNavOpen((o) => !o)}
      />
    </div>
  );
}
