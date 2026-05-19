import { useState, useRef, useEffect } from 'react';
import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';
import AISummaryPanel from './AISummaryPanel';
import CallOverlay from './CallOverlay';
import { aiAPI } from '../services/api';

const EMPTY_QUOTES = [
  "Quiet here… be the spark! 🌟",
  "Every great community started with one message 💬",
  "No messages yet. Say something kind 🕊️",
  "The best conversations start with a simple hello 👋",
];

export default function ChatRoom({ room, messages, typingUsers, user, onSend, onStartTyping, onReact }) {
  const [draft,      setDraft]      = useState('');
  const [formatting, setFormatting] = useState(false);
  const [showCall,   setShowCall]   = useState(false);
  const [showPanel,  setShowPanel]  = useState(true);
  const bottomRef = useRef(null);
  const quote = EMPTY_QUOTES[Math.floor(Math.random() * EMPTY_QUOTES.length)];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!draft.trim()) return;
    onSend(draft);
    setDraft('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleFormat = async () => {
    if (!draft.trim()) return;
    setFormatting(true);
    try {
      const { data } = await aiAPI.format(draft);
      setDraft(data.formatted);
    } catch (err) {
      alert(err.response?.data?.error || 'Format failed — check your API key in mlend/.env');
    } finally { setFormatting(false); }
  };

  if (!room) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:12 }}>🔮</div>
        <p>Select a channel to start chatting</p>
      </div>
    </div>
  );

  return (
    <>
      {showCall && <CallOverlay user={user} onClose={() => setShowCall(false)} />}
      <div className="chat-area">
        {/* Header */}
        <div className="chat-header">
          <span className="chat-header-icon">{room.icon || '💬'}</span>
          <div className="chat-header-info">
            <div className="chat-header-name">{room.name}</div>
            <div className="chat-header-desc">{room.description}</div>
          </div>
          <div className="header-actions">
            <button id="qs-call" className="btn-icon" title="Start call" onClick={() => setShowCall(true)}>📞</button>
            <button id="qs-video-call" className="btn-icon" title="Video call" onClick={() => setShowCall(true)}>📹</button>
            <button id="qs-toggle-panel" className="btn-icon" title="AI Panel" onClick={() => setShowPanel(p => !p)}>🤖</button>
          </div>
        </div>

        {/* Messages */}
        <div className="messages-container">
          {messages.length === 0 ? (
            <div className="messages-empty">
              <div className="messages-empty-icon">💬</div>
              <p className="messages-empty-quote">"{quote}"</p>
              <p style={{ fontSize:13 }}>Be the first to say something!</p>
            </div>
          ) : (
            messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isOwn={msg.userId === user?.id}
                onReact={onReact}
              />
            ))
          )}
          <div ref={bottomRef} />
        </div>

        <TypingIndicator typingUsers={typingUsers} />

        {/* Input */}
        <div className="input-area">
          <div className="input-box">
            <textarea
              id="qs-message-input"
              className="msg-input"
              placeholder={`Message #${room.name}…`}
              value={draft}
              rows={1}
              onChange={(e) => { setDraft(e.target.value); onStartTyping(); }}
              onKeyDown={handleKeyDown}
            />
            <div className="input-actions">
              <button
                id="qs-format"
                className="btn-format"
                onClick={handleFormat}
                disabled={!draft.trim() || formatting}
                title="AI format message"
              >
                {formatting ? <span className="spinner" style={{ width:12, height:12, borderWidth:2 }} /> : '✨ Format'}
              </button>
              <button id="qs-send" className="btn-send" onClick={handleSend} disabled={!draft.trim()} title="Send">➤</button>
            </div>
          </div>
          <p style={{ fontSize:11, color:'var(--text-light)', marginTop:6, textAlign:'center' }}>
            Press <kbd style={{ background:'var(--bg)', border:'1px solid var(--border)', padding:'0 4px', borderRadius:3 }}>Enter</kbd> to send · <kbd style={{ background:'var(--bg)', border:'1px solid var(--border)', padding:'0 4px', borderRadius:3 }}>Shift+Enter</kbd> for new line
          </p>
        </div>
      </div>

      {showPanel && <AISummaryPanel messages={messages} />}
    </>
  );
}
