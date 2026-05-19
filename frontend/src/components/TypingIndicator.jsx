export default function TypingIndicator({ typingUsers }) {
  if (!typingUsers || typingUsers.length === 0) return <div className="typing-indicator" />;
  const names = typingUsers.map(u => u.username).join(', ');
  const label = typingUsers.length === 1 ? `${names} is typing` : `${names} are typing`;
  return (
    <div className="typing-indicator">
      <div className="typing-dots">
        <div className="typing-dot" />
        <div className="typing-dot" />
        <div className="typing-dot" />
      </div>
      <span>{label}</span>
    </div>
  );
}
