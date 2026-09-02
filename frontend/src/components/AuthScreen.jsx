import { useState } from 'react';

const QUOTES = [
  "Every great community started with a simple hello 💬",
  "Where curious minds meet 🌱",
  "Your ideas deserve to be heard ✨",
  "Connect, share, and grow together 🤝",
];

// The seeded demo account, so the first click on a fresh install works.
const DEMO = { email: 'moeez@querysphere.com', password: 'password123' };

export default function AuthScreen({ onLogin, onRegister, loading, error, setError }) {
  const [tab,      setTab]      = useState('login');
  const [username, setUsername] = useState('');
  const [email,    setEmail]    = useState(DEMO.email);
  const [password, setPassword] = useState(DEMO.password);
  const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];

  /**
   * Switching to Sign Up empties the demo credentials out of the form.
   *
   * They were pre-filled for both tabs, so the very first thing a new person
   * did — press Sign Up — submitted the demo account's own address and came
   * back "Email already registered". The one path the app most needed to work
   * was the one guaranteed to fail. Going back to Sign In restores them, which
   * is the case the pre-fill was for.
   */
  const handleTab = (t) => {
    setTab(t);
    setError('');
    if (t === 'register') {
      setEmail(''); setPassword(''); setUsername('');
    } else {
      setEmail(DEMO.email); setPassword(DEMO.password);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (tab === 'login') await onLogin(email, password);
    else await onRegister(username, email, password);
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">🔮</div>
          <span className="auth-logo-name">QuerySphere</span>
        </div>
        <p className="auth-tagline">AI-powered community chat</p>

        <div className="auth-quote">
          <p>"{quote}"</p>
        </div>

        <div className="auth-tabs">
          <button className={`auth-tab${tab === 'login' ? ' active' : ''}`} onClick={() => handleTab('login')}>Sign In</button>
          <button className={`auth-tab${tab === 'register' ? ' active' : ''}`} onClick={() => handleTab('register')}>Sign Up</button>
        </div>

        <form onSubmit={handleSubmit}>
          {tab === 'register' && (
            <div className="form-group">
              <label className="form-label" htmlFor="qs-username">Username</label>
              <input id="qs-username" className="form-input" type="text" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="e.g. stardust_dev" value={username} onChange={e => setUsername(e.target.value)} required />
            </div>
          )}
          <div className="form-group">
            <label className="form-label" htmlFor="qs-email">Email</label>
            {/* Phone keyboards capitalise the first letter of a text field and offer
                to autocorrect it. An address typed as "Moeez@..." on a phone and
                "moeez@..." on a desktop has to reach the same account — the server
                normalises the address, and these stop the keyboard mangling it in
                the first place. */}
            <input
              id="qs-email"
              className="form-input"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="qs-password">Password</label>
            <input
              id="qs-password"
              className="form-input"
              type="password"
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              minLength={tab === 'register' ? 8 : undefined}
              required
            />
            {/* Say the rule before the server has to. The form used to accept
                six characters and let the request come back with the real
                minimum, which reads as the app changing its mind. */}
            {tab === 'register' && <p className="form-hint">At least 8 characters.</p>}
          </div>
          {error && <p className="auth-error">⚠️ {error}</p>}
          <button id="qs-auth-submit" className="btn-primary" type="submit" disabled={loading}>
            {loading ? <span className="spinner" /> : tab === 'login' ? 'Sign In →' : 'Create Account →'}
          </button>
        </form>
      </div>
    </div>
  );
}
