import { useState } from 'react';

const QUOTES = [
  "Every great community started with a simple hello 💬",
  "Where curious minds meet 🌱",
  "Your ideas deserve to be heard ✨",
  "Connect, share, and grow together 🤝",
];

export default function AuthScreen({ onLogin, onRegister, loading, error, setError }) {
  const [tab,      setTab]      = useState('login');
  const [username, setUsername] = useState('MOeez');
  const [email,    setEmail]    = useState('moeez@querysphere.com');
  const [password, setPassword] = useState('password123');
  const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];

  const handleTab = (t) => { setTab(t); setError(''); };

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
              <input id="qs-username" className="form-input" type="text" autoComplete="username" placeholder="e.g. stardust_dev" value={username} onChange={e => setUsername(e.target.value)} required />
            </div>
          )}
          <div className="form-group">
            <label className="form-label" htmlFor="qs-email">Email</label>
            <input id="qs-email" className="form-input" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="qs-password">Password</label>
            <input id="qs-password" className="form-input" type="password" autoComplete={tab === 'login' ? 'current-password' : 'new-password'} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
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
