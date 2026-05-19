import AuthScreen from './components/AuthScreen';
import Sidebar from './components/Sidebar';
import ChatRoom from './components/ChatRoom';
import { useAuth } from './hooks/useAuth';
import { useChat } from './hooks/useChat';

export default function App() {
  const { user, loading, error, login, register, logout, setError } = useAuth();
  const { rooms, activeRoom, messages, typingUsers, switchRoom, sendMessage, startTyping, addReaction } = useChat(user);

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
    <div className="app-layout">
      <Sidebar
        user={user}
        rooms={rooms}
        activeRoom={activeRoom}
        onSwitch={switchRoom}
        onLogout={logout}
      />
      <ChatRoom
        room={activeRoom}
        messages={messages}
        typingUsers={typingUsers}
        user={user}
        onSend={sendMessage}
        onStartTyping={startTyping}
        onReact={addReaction}
      />
    </div>
  );
}
