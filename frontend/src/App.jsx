import { useState } from 'react';
import AuthScreen from './components/AuthScreen';
import Sidebar from './components/Sidebar';
import ChatRoom from './components/ChatRoom';
import PeoplePanel from './components/PeoplePanel';
import { useAuth } from './hooks/useAuth';
import { useChat } from './hooks/useChat';
import { useSocial } from './hooks/useSocial';

export default function App() {
  const { user, loading, error, login, register, logout, setError } = useAuth();
  const {
    rooms, activeRoom, messages, hasMore, loadingOlder, typingUsers, members, connected, socket,
    switchRoom, loadOlder, sendMessage, deleteMessage, startTyping, addReaction,
    openDM, createCommunity, addToCommunity,
  } = useChat(user);
  const social = useSocial(user, socket);

  // Below 720px the sidebar is a slide-over rather than a column. Desktop
  // ignores this entirely — the CSS only consults it inside the media query.
  const [navOpen, setNavOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);

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

  const handleOpenDM = async (userId) => {
    await openDM(userId);
    setPeopleOpen(false);
    setNavOpen(false);
  };

  return (
    <div className={`app-layout${navOpen ? ' nav-open' : ''}${peopleOpen ? ' people-open' : ''}`}>
      <Sidebar
        user={user}
        rooms={rooms}
        activeRoom={activeRoom}
        members={members}
        connected={connected}
        requestCount={social.incoming.length}
        onSwitch={(room) => { switchRoom(room); setNavOpen(false); }}
        onOpenPeople={() => { setPeopleOpen(true); setNavOpen(false); social.refresh(); }}
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
        hasMore={hasMore}
        loadingOlder={loadingOlder}
        onLoadOlder={loadOlder}
        onSend={sendMessage}
        onStartTyping={startTyping}
        onReact={addReaction}
        onDelete={deleteMessage}
        connected={connected}
        onToggleNav={() => setNavOpen((o) => !o)}
        onOpenPeople={() => { setPeopleOpen(true); social.refresh(); }}
      />
      {peopleOpen && (
        <PeoplePanel
          social={social}
          rooms={rooms}
          onOpenDM={handleOpenDM}
          onCreateCommunity={createCommunity}
          onAddMembers={addToCommunity}
          onClose={() => setPeopleOpen(false)}
        />
      )}
    </div>
  );
}
