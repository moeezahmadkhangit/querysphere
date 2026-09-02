const SECTIONS = [
  { type: 'channel',   label: 'Channels',        empty: 'No channels.' },
  { type: 'community', label: 'Communities',     empty: 'None yet — start one from ＋ Add people.' },
  { type: 'dm',        label: 'Direct messages', empty: 'Add someone to start a conversation.' },
];

export default function Sidebar({
  user, rooms, activeRoom, members = [], connected,
  requestCount = 0, onSwitch, onLogout, onOpenPeople,
}) {
  // You first, then everyone else alphabetically, so the list does not reshuffle
  // under the reader every time somebody's socket reconnects.
  const roster = [...members].sort((a, b) => {
    if (a.userId === user?.id) return -1;
    if (b.userId === user?.id) return 1;
    return a.username.localeCompare(b.username);
  });

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo-icon">🔮</div>
        <span className="sidebar-logo-name">QuerySphere</span>
      </div>

      {/* Only this middle band scrolls. The wordmark above and the account row
          below stay put, so sign-out is reachable on a viewport too short to
          show every channel. */}
      <div className="sidebar-scroll">
        <div className="sidebar-section">
          <button id="qs-open-people" type="button" className="btn-add-people" onClick={onOpenPeople}>
            <span className="channel-icon">＋</span>
            <span className="channel-name">Add people</span>
            {/* An unanswered friend request is invisible everywhere else in the
                app, so the count has to live on the button that opens it. */}
            {requestCount > 0 && <span className="channel-badge">{requestCount}</span>}
          </button>
        </div>

        {SECTIONS.map(({ type, label, empty }) => {
          const list = rooms.filter((room) => room.type === type);
          return (
            <nav className="sidebar-section" key={type} aria-label={label}>
              <p className="sidebar-section-label">
                {label}
                {list.length > 0 && <span className="sidebar-section-count">{list.length}</span>}
              </p>

              {list.length === 0 && <p className="sidebar-empty">{empty}</p>}

              {list.map((room) => (
                // A button, not a div: these were plain divs with an onClick, which
                // meant no keyboard focus, no Enter/Space, and nothing announced to
                // a screen reader. Switching rooms was mouse-only.
                <button
                  key={room.id}
                  type="button"
                  id={`channel-${room.id}`}
                  className={`channel-item${activeRoom?.id === room.id ? ' active' : ''}`}
                  aria-current={activeRoom?.id === room.id ? 'page' : undefined}
                  onClick={() => onSwitch(room)}
                >
                  <span className={`channel-icon${type === 'dm' ? ' is-avatar' : ''}`}>{room.icon || '#'}</span>
                  <span className="channel-name">{room.name}</span>
                  {/* A real count from the server's read state. This slot used to
                      be a literal 3 pinned to #general forever. */}
                  {room.unread > 0 && activeRoom?.id !== room.id && (
                    <span className="channel-badge">{room.unread > 99 ? '99+' : room.unread}</span>
                  )}
                </button>
              ))}
            </nav>
          );
        })}

        {/* Real presence, from the server's roster for this room.
            This slot used to hold four hard-coded names with hard-coded green
            dots. It looked like a member list and was a drawing — two people
            could be signed in and neither would ever know the other was there. */}
        <div className="sidebar-section">
          <p className="sidebar-section-label">
            In this {activeRoom?.type === 'dm' ? 'conversation' : 'room'}
            {roster.length > 0 && <span className="sidebar-section-count">{roster.length}</span>}
          </p>
          {roster.length === 0 ? (
            <p className="sidebar-empty">
              {connected ? 'Nobody else here yet.' : 'Connecting…'}
            </p>
          ) : (
            roster.map((member) => (
              <div key={member.userId} className="channel-item is-static" id={`member-${member.userId}`}>
                <span className="dm-initial">
                  {(member.avatar || member.username).slice(0, 1)}
                  <span className="dm-dot" />
                </span>
                <span className="channel-name">{member.username}</span>
                {member.userId === user?.id && <span className="member-you">you</span>}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="sidebar-footer">
        <div className="user-avatar">{user?.avatar || '?'}</div>
        <div className="user-info">
          <div className="user-name">{user?.username}</div>
          {/* Reports the real socket state. It read a hard-coded "Online" before,
              which was actively misleading during the one moment it mattered:
              a dropped connection, when nothing you send arrives. */}
          <div className={`user-status${connected ? '' : ' is-offline'}`}>
            <span className="status-dot" />
            {connected ? 'Online' : 'Reconnecting…'}
          </div>
        </div>
        <button id="qs-logout" className="btn-logout" onClick={onLogout} title="Sign out" aria-label="Sign out">↩</button>
      </div>
    </aside>
  );
}
