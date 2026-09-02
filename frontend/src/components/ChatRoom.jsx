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

export default function ChatRoom({ room, messages, typingUsers, user, connected, onSend, onStartTyping, onReact, onToggleNav }) {
  const [draft,      setDraft]      = useState('');
  const [formatting, setFormatting] = useState(false);
  const [showCall,   setShowCall]   = useState(false);
  // Open by default only where it is a column. Below 1080px it renders as an
  // overlay, so defaulting it open would land a phone user on the AI panel
  // rather than on the room they just signed in to read.
  const [showPanel,  setShowPanel]  = useState(() => window.innerWidth > 1080);
  const bottomRef = useRef(null);
  const quote = EMPTY_QUOTES[Math.floor(Math.random() * EMPTY_QUOTES.length)];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!draft.trim() || !connected) return;
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
      alert(err.response?.data?.error || 'Format failed — check OPENROUTER_API_KEY in mlend/.env');
    } finally { setFormatting(false); }
  };

  if (!room) return (
    <div className="room-placeholder">
      <div>
        <div className="room-placeholder-icon">🔮</div>
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
          <button id="qs-toggle-nav" className="btn-icon btn-nav" title="Channels" onClick={onToggleNav}>☰</button>
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
              <p>Be the first to say something!</p>
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
          {/* Sending over a closed socket is a silent no-op: the packet is
              buffered and the draft is cleared, so the message looks sent and
              simply never appears. Say so, and hold the send. */}
          {!connected && (
            <p className="conn-banner" role="status">
              <span className="conn-dot" />
              Reconnecting — messages you send now will not be delivered.
            </p>
          )}
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
                {formatting ? <span className="spinner" /> : '✨ Format'}
              </button>
              <button id="qs-send" className="btn-send" onClick={handleSend} disabled={!draft.trim() || !connected} title={connected ? 'Send' : 'Reconnecting…'}>➤</button>
            </div>
          </div>
          <p className="input-hint">
            <kbd>Enter</kbd> to send · <kbd>Shift+Enter</kbd> for a new line
          </p>
        </div>
      </div>

      {/* Narrow screens render this as a full-width overlay — see the media
          query in index.css — so the 🤖 toggle stays meaningful on a phone. */}
      {showPanel && <AISummaryPanel messages={messages} onClose={() => setShowPanel(false)} />}
    </>
  );
}
