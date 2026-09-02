import { useState } from 'react';

export default function CallOverlay({ user, onClose }) {
  const [muted,    setMuted]    = useState(false);
  const [videoOff, setVideoOff] = useState(false);

  return (
    <div className="call-overlay" id="call-overlay">
      <div className="call-card">
        <div className="call-avatar-ring">{user?.avatar || '?'}</div>
        <p className="call-name">{user?.username}</p>
        <p className="call-status">🟢 Calling General Channel...</p>
        <div className="call-controls">
          <button
            id="call-mute"
            className={`call-btn mute`}
            onClick={() => setMuted(p => !p)}
            title={muted ? 'Unmute' : 'Mute'}
          >{muted ? '🔇' : '🎤'}</button>
          <button
            id="call-video"
            className={`call-btn video`}
            onClick={() => setVideoOff(p => !p)}
            title={videoOff ? 'Start Video' : 'Stop Video'}
          >{videoOff ? '📵' : '📹'}</button>
          <button id="call-end" className="call-btn end" onClick={onClose} title="End call">📵</button>
        </div>
        <p className="call-footnote">Voice &amp; video calls coming soon in v2 🚀</p>
      </div>
    </div>
  );
}
