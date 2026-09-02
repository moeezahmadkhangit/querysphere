import { useState } from 'react';
import { aiAPI } from '../services/api';

/**
 * The models return a small, predictable markdown shape: bold labels, a flat
 * list, and an indented sub-list under "Key Points". This renders that shape
 * and nothing else — it is not a markdown parser and must not be pointed at
 * arbitrary text.
 *
 * The bullet patterns are anchored with `^[ \t]*` because the sub-list under
 * Key Points arrives indented two spaces. Matching only column zero left those
 * lines as literal dashes in the middle of a rendered list.
 */
function renderMarkdown(text) {
  const html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Indented bullets keep their rank: the models nest the actual key points
    // under a "**Key Points**:" line, and flattening them loses which is the
    // heading and which are its items.
    .replace(/^[ \t]+[-•*] (.+)$/gm, '<li class="sub">$1</li>')
    .replace(/^[-•*] (.+)$/gm, '<li>$1</li>')
    .split('\n')
    .map((line) => (line.startsWith('<li') ? line : line.trim() && `<p>${line.trim()}</p>`))
    .filter(Boolean)
    .join('');

  // Wrap each run of consecutive <li> in a single <ul>.
  return html.replace(/(?:<li(?: class="sub")?>.*?<\/li>)+/g, (run) => `<ul>${run}</ul>`);
}

const MEMBERS = [
  { id: 'm1', avatar: 'MZ', name: 'Moeez ', online: true },
  { id: 'm2', avatar: 'BS', name: 'Basim', online: true },
  { id: 'm3', avatar: 'AD', name: 'Adeel', online: true },
  { id: 'm4', avatar: 'BL', name: 'Bilawal', online: false },
];

export default function AISummaryPanel({ messages, onClose }) {
  const [summary, setSummary] = useState('');
  // Which free model actually answered — mlend cascades through several and
  // falls back to a local summarizer when they are all rate-limited, and
  // "where did this text come from" is the first thing you want to know when
  // a summary reads oddly.
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSummarize = async () => {
    if (messages.length < 2) { setError('Need at least 2 messages to summarize.'); return; }
    setLoading(true); setError(''); setSummary(''); setSource('');
    try {
      const { data } = await aiAPI.summarize(messages.map(m => ({ username: m.username, text: m.text, timestamp: m.timestamp })));
      setSummary(data.summary);
      setSource(data.source || '');
    } catch (err) {
      setError(err.response?.data?.error || 'Summarization failed. Check OPENROUTER_API_KEY in mlend/.env');
    } finally { setLoading(false); }
  };

  return (
    <aside className="ai-panel">
      <div className="ai-panel-header">
        <span className="ai-panel-title">🤖 AI Assistant</span>
        <button id="qs-summarize" className="btn-summarize" onClick={handleSummarize} disabled={loading}>
          {loading ? <span className="spinner" /> : '📋 Summarize'}
        </button>
        <button id="qs-close-panel" className="btn-icon btn-panel-close" title="Close panel" onClick={onClose}>✕</button>
      </div>
      <div className="ai-panel-body">
        {error && <p className="ai-error">⚠️ {error}</p>}
        {summary ? (
          <div className="ai-summary-card">
            <div className="ai-summary-label">✨ AI Summary</div>
            <div className="ai-summary-text" dangerouslySetInnerHTML={{ __html: renderMarkdown(summary) }} />
            {source && (
              <p className="ai-summary-source">
                {source === 'local' ? 'local fallback — no model reached' : source}
              </p>
            )}
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
