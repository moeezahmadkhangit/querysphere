const EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥'];

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function MessageBubble({ message, isOwn, onReact }) {
  return (
    <div className={`msg-row${isOwn ? ' own' : ''}`} id={`msg-${message.id}`}>
      <div className={`msg-avatar${message.isBot ? ' bot' : ''}`}>{message.avatar}</div>
      <div className="msg-content">
        <div className="msg-header">
          <span className={`msg-username${message.isBot ? ' bot' : ''}`}>{message.username}</span>
          <span className="msg-time">{formatTime(message.timestamp)}</span>
        </div>
        <div className={`msg-bubble${message.isBot ? ' bot' : ''}`}>{message.text}</div>
        {message.reactions?.length > 0 && (
          <div className="msg-reactions">
            {message.reactions.map((r) => (
              <button key={r.emoji} className="reaction-chip" onClick={() => onReact(message.id, r.emoji)}>
                {r.emoji} <span>{r.count}</span>
              </button>
            ))}
          </div>
        )}
        <div className="msg-quick-reactions" style={{ display:'flex', gap:4, marginTop:4 }}>
          {EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => onReact(message.id, e)}
              style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, opacity:0.4, transition:'opacity 0.15s' }}
              onMouseEnter={ev => ev.target.style.opacity = 1}
              onMouseLeave={ev => ev.target.style.opacity = 0.4}
            >{e}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
