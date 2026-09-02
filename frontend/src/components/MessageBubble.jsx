const EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥'];

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function MessageBubble({ message, isOwn, onReact, onDelete }) {
  const deleted = !!message.deleted;

  return (
    <div className={`msg-row${isOwn ? ' own' : ''}${deleted ? ' is-deleted' : ''}`} id={`msg-${message.id}`}>
      <div className="msg-avatar">{message.avatar}</div>
      <div className="msg-content">
        <div className="msg-header">
          <span className="msg-username">{message.username}</span>
          <span className="msg-time">{formatTime(message.timestamp)}</span>
          {message.isBot && <span className="msg-sim-tag" title="Simulated reply">sim</span>}
        </div>
        <div className="msg-bubble">{message.text}</div>

        {!deleted && message.reactions?.length > 0 && (
          <div className="msg-reactions">
            {message.reactions.map((r) => (
              <button key={r.emoji} className="reaction-chip" onClick={() => onReact(message.id, r.emoji)}>
                {r.emoji} <span>{r.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Visibility is handled by `.msg-row:hover .msg-quick-reactions` in
            index.css, so the row is not permanently fringed with five buttons. */}
        {!deleted && (
          <div className="msg-quick-reactions">
            {EMOJIS.map((e) => (
              <button key={e} className="quick-reaction" onClick={() => onReact(message.id, e)} title={`React ${e}`}>
                {e}
              </button>
            ))}
            {/* Only ever on your own messages: being in a room is not authority
                over what somebody else said in it. The server checks this too —
                hiding the button is a courtesy, not the control. */}
            {isOwn && (
              <button
                className="quick-reaction quick-delete"
                onClick={() => onDelete?.(message.id)}
                title="Delete this message"
                aria-label="Delete this message"
              >
                🗑
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
