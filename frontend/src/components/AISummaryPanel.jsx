import { useState } from 'react';
import { aiAPI } from '../services/api';

function renderMarkdown(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^• (.+)$/gm, '<li>$1</li>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/\n/g, '<br/>');
}

const MEMBERS = [
  { id: 'm1', avatar: 'MZ', name: 'Moeez ', online: true },
  { id: 'm2', avatar: 'BS', name: 'Basim', online: true },
  { id: 'm3', avatar: 'AD', name: 'Adeel', online: true },
  { id: 'm4', avatar: 'BL', name: 'Bilawal', online: false },
];

export default function AISummaryPanel({ messages }) {
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSummarize = async () => {
    if (messages.length < 2) { setError('Need at least 2 messages to summarize.'); return; }
    setLoading(true); setError(''); setSummary('');
    try {
      const { data } = await aiAPI.summarize(messages.map(m => ({ username: m.username, text: m.text, timestamp: m.timestamp })));
      setSummary(data.summary);
    } catch (err) {
      setError(err.response?.data?.error || 'Summarization failed. Check your API key in mlend/.env');
    } finally { setLoading(false); }
  };

  return (
    <aside className="ai-panel">
      <div className="ai-panel-header">
        <span className="ai-panel-title">🤖 AI Assistant</span>
        <button id="qs-summarize" className="btn-summarize" onClick={handleSummarize} disabled={loading}>
          {loading ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : '📋 Summarize'}
        </button>
      </div>
      <div className="ai-panel-body">
        {error && <p style={{ color: '#EF4444', fontSize: 12, marginBottom: 12 }}>{error}</p>}
        {summary ? (
          <div className="ai-summary-card">
            <div className="ai-summary-label">✨ AI Summary</div>
            <div className="ai-summary-text" dangerouslySetInnerHTML={{ __html: renderMarkdown(summary) }} />
          </div>
        ) : (
          <div className="ai-empty">
            <div className="ai-empty-icon">💡</div>
            <p className="ai-empty-text">Click <strong>Summarize</strong> to get an AI recap of this conversation</p>
          </div>
        )}

        <div className="members-section">
          <p className="members-title">Online Members</p>
          {MEMBERS.map((m) => (
            <div key={m.id} className="member-item">
              <div className="member-avatar">
                {m.avatar}
                {m.online && <span className="member-dot" />}
              </div>
              <span className="member-name">{m.name}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
