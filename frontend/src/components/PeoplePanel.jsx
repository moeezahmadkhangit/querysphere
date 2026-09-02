import { useState, useEffect, useMemo } from 'react';

const COMMUNITY_ICONS = ['🌐', '🎨', '🚀', '📚', '🎧', '🧪', '🍜', '⚽'];

/** One person, with whatever action makes sense for your relationship to them. */
function PersonRow({ person, subtitle, actions }) {
  return (
    <div className="person-row">
      <span className="person-avatar">{person.avatar || person.username.slice(0, 2).toUpperCase()}</span>
      <span className="person-text">
        <span className="person-name">
          {person.username}
          {person.isSim && <span className="msg-sim-tag" title="Simulated developer">sim</span>}
        </span>
        {subtitle && <span className="person-sub">{subtitle}</span>}
      </span>
      <span className="person-actions">{actions}</span>
    </div>
  );
}

/**
 * Finding people, answering requests, and starting a community.
 *
 * One panel with three tabs rather than three places, because they are one
 * task: the app had no way at all to reach another human being, so everything
 * that gets you to a conversation belongs behind a single button.
 */
export default function PeoplePanel({ social, rooms, onOpenDM, onCreateCommunity, onAddMembers, onClose }) {
  const [tab, setTab] = useState('discover');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const [communityName, setCommunityName] = useState('');
  const [communityDesc, setCommunityDesc] = useState('');
  const [communityIcon, setCommunityIcon] = useState(COMMUNITY_ICONS[0]);
  const [picked, setPicked] = useState([]);
  const [targetRoomId, setTargetRoomId] = useState('new');
  const [creating, setCreating] = useState(false);

  const myCommunities = useMemo(() => rooms.filter((r) => r.type === 'community'), [rooms]);

  /**
   * Search is debounced, and a stale response is discarded.
   *
   * Typing "adeel" fires five requests; without the `cancelled` flag they can
   * land out of order and the list settles on the results for "ade".
   */
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      const found = await social.search(term);
      if (cancelled) return;
      setResults(found);
      setSearching(false);
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, social]);

  const withBusy = async (id, fn) => {
    setBusyId(id);
    try { await fn(); } finally { setBusyId(null); }
  };

  const togglePicked = (id) => {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  const submitCommunity = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      if (targetRoomId === 'new') {
        await onCreateCommunity({
          name: communityName,
          description: communityDesc,
          icon: communityIcon,
          memberIds: picked,
        });
        setCommunityName(''); setCommunityDesc('');
      } else {
        await onAddMembers(targetRoomId, picked);
      }
      setPicked([]);
      onClose();
    } catch (err) {
      social.setError(err.response?.data?.error || 'Could not save that community.');
    } finally {
      setCreating(false);
    }
  };

  const relationAction = (person, relation) => {
    if (relation === 'friends') {
      return <button className="btn-mini primary" onClick={() => onOpenDM(person.id)}>Message</button>;
    }
    if (relation === 'requested') return <span className="btn-mini is-muted">Requested</span>;
    if (relation === 'incoming') {
      return <button className="btn-mini primary" disabled={busyId === person.id}
        onClick={() => withBusy(person.id, () => social.accept(person.id))}>Accept</button>;
    }
    return <button className="btn-mini" disabled={busyId === person.id}
      onClick={() => withBusy(person.id, () => social.addFriend(person.id))}>＋ Add</button>;
  };

  const friendRelation = (id) => (social.friends.some((f) => f.id === id) ? 'friends'
    : social.outgoing.some((f) => f.id === id) ? 'requested'
    : social.incoming.some((f) => f.id === id) ? 'incoming'
    : 'none');

  return (
    <aside className="people-panel" aria-label="People">
      <div className="people-header">
        <span className="people-title">People</span>
        <button className="btn-icon" onClick={onClose} aria-label="Close people panel">✕</button>
      </div>

      <div className="people-tabs" role="tablist">
        {[
          ['discover', 'Discover'],
          ['requests', `Requests${social.incoming.length ? ` (${social.incoming.length})` : ''}`],
          ['community', 'Community'],
        ].map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={`people-tab${tab === id ? ' active' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {social.error && <p className="auth-error people-error">⚠️ {social.error}</p>}

      <div className="people-body">
        {tab === 'discover' && (
          <>
            <input
              className="form-input people-search"
              type="search"
              placeholder="Search by name, or paste an email"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />

            {query.trim().length >= 2 ? (
              <>
                <p className="sidebar-section-label">Results</p>
                {searching && <p className="sidebar-empty">Searching…</p>}
                {!searching && results.length === 0 && (
                  <p className="sidebar-empty">Nobody by that name. Names match partially; an email has to be exact.</p>
                )}
                {results.map(({ user: person, relation }) => (
                  <PersonRow key={person.id} person={person} actions={relationAction(person, relation)} />
                ))}
              </>
            ) : (
              <>
                <p className="sidebar-section-label">People you may know</p>
                {social.suggestions.length === 0 && (
                  <p className="sidebar-empty">No suggestions yet — search for someone by name to get started.</p>
                )}
                {social.suggestions.map(({ user: person, reason }) => (
                  <PersonRow
                    key={person.id}
                    person={person}
                    subtitle={reason}
                    actions={relationAction(person, friendRelation(person.id))}
                  />
                ))}

                <p className="sidebar-section-label">Your people</p>
                {social.friends.length === 0 && <p className="sidebar-empty">Nobody yet.</p>}
                {social.friends.map((person) => (
                  <PersonRow
                    key={person.id}
                    person={person}
                    actions={<button className="btn-mini primary" onClick={() => onOpenDM(person.id)}>Message</button>}
                  />
                ))}
              </>
            )}
          </>
        )}

        {tab === 'requests' && (
          <>
            <p className="sidebar-section-label">Waiting for you</p>
            {social.incoming.length === 0 && <p className="sidebar-empty">No requests right now.</p>}
            {social.incoming.map((person) => (
              <PersonRow
                key={person.id}
                person={person}
                subtitle="Wants to connect"
                actions={
                  <>
                    <button className="btn-mini primary" disabled={busyId === person.id}
                      onClick={() => withBusy(person.id, () => social.accept(person.id))}>Accept</button>
                    <button className="btn-mini" disabled={busyId === person.id}
                      onClick={() => withBusy(person.id, () => social.decline(person.id))}>Ignore</button>
                  </>
                }
              />
            ))}

            <p className="sidebar-section-label">Sent</p>
            {social.outgoing.length === 0 && <p className="sidebar-empty">Nothing pending.</p>}
            {social.outgoing.map((person) => (
              <PersonRow
                key={person.id}
                person={person}
                subtitle="Waiting on them"
                actions={<button className="btn-mini" disabled={busyId === person.id}
                  onClick={() => withBusy(person.id, () => social.removeFriend(person.id))}>Cancel</button>}
              />
            ))}
          </>
        )}

        {tab === 'community' && (
          <form onSubmit={submitCommunity}>
            <div className="form-group">
              <label className="form-label" htmlFor="qs-community-target">Add people to</label>
              <select
                id="qs-community-target"
                className="form-input"
                value={targetRoomId}
                onChange={(e) => setTargetRoomId(e.target.value)}
              >
                <option value="new">＋ A new community</option>
                {myCommunities.map((room) => (
                  <option key={room.id} value={room.id}>{room.icon} {room.name}</option>
                ))}
              </select>
            </div>

            {targetRoomId === 'new' && (
              <>
                <div className="form-group">
                  <label className="form-label" htmlFor="qs-community-name">Name</label>
                  <input
                    id="qs-community-name"
                    className="form-input"
                    value={communityName}
                    onChange={(e) => setCommunityName(e.target.value)}
                    placeholder="e.g. Design Guild"
                    maxLength={40}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="qs-community-desc">What is it for?</label>
                  <input
                    id="qs-community-desc"
                    className="form-input"
                    value={communityDesc}
                    onChange={(e) => setCommunityDesc(e.target.value)}
                    placeholder="One line is plenty"
                    maxLength={140}
                  />
                </div>
                <div className="form-group">
                  <span className="form-label">Icon</span>
                  <div className="icon-picker">
                    {COMMUNITY_ICONS.map((icon) => (
                      <button
                        key={icon}
                        type="button"
                        className={`icon-choice${communityIcon === icon ? ' active' : ''}`}
                        onClick={() => setCommunityIcon(icon)}
                        aria-pressed={communityIcon === icon}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <p className="sidebar-section-label">
              Who is coming
              {picked.length > 0 && <span className="sidebar-section-count">{picked.length}</span>}
            </p>
            {social.friends.length === 0 ? (
              <p className="sidebar-empty">
                Add a few people on the Discover tab first — a community of one is just a notes file.
              </p>
            ) : (
              social.friends.map((person) => (
                <label key={person.id} className="person-row is-pickable">
                  <input
                    type="checkbox"
                    checked={picked.includes(person.id)}
                    onChange={() => togglePicked(person.id)}
                  />
                  <span className="person-avatar">{person.avatar}</span>
                  <span className="person-text"><span className="person-name">{person.username}</span></span>
                </label>
              ))
            )}

            <button
              className="btn-primary"
              type="submit"
              disabled={creating || (targetRoomId === 'new' ? communityName.trim().length < 2 : picked.length === 0)}
            >
              {creating ? <span className="spinner" /> : targetRoomId === 'new' ? 'Create community →' : 'Add to community →'}
            </button>
          </form>
        )}
      </div>
    </aside>
  );
}
