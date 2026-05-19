export default function Sidebar({ user, rooms, activeRoom, onSwitch, onLogout }) {
  const mockDMs = [
    { id: 'dm1', name: 'Moeez (Main Dev) ✨', avatar: 'MZ', online: true },
    { id: 'dm2', name: 'Basim',            avatar: 'BS', online: true },
    { id: 'dm3', name: 'Adeel',            avatar: 'AD', online: true },
    { id: 'dm4', name: 'Bilawal',          avatar: 'BL', online: false },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo-icon">🔮</div>
        <span className="sidebar-logo-name">QuerySphere</span>
      </div>

      <div className="sidebar-section">
        <p className="sidebar-section-label">Channels</p>
        {rooms.map((room) => (
          <div
            key={room.id}
            id={`channel-${room.id}`}
            className={`channel-item${activeRoom?.id === room.id ? ' active' : ''}`}
            onClick={() => onSwitch(room)}
          >
            <span className="channel-icon">{room.icon || '#'}</span>
            <span className="channel-name">{room.name}</span>
            {room.id === 'general' && <span className="channel-badge">3</span>}
          </div>
        ))}
      </div>

      <div className="sidebar-section">
        <p className="sidebar-section-label">Direct Messages</p>
        {mockDMs.map((dm) => (
          <div key={dm.id} className="channel-item" id={`dm-${dm.id}`}>
            <div style={{ position:'relative', width:20 }}>
              <span style={{ fontSize:14 }}>{dm.avatar.slice(0,1)}</span>
              {dm.online && <span style={{ position:'absolute', bottom:-1, right:-2, width:7, height:7, borderRadius:'50%', background:'var(--mint)', border:'1.5px solid var(--surface)' }} />}
            </div>
            <span className="channel-name">{dm.name}</span>
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <div className="user-avatar">{user?.avatar || '?'}</div>
        <div className="user-info">
          <div className="user-name">{user?.username}</div>
          <div className="user-status">
            <span className="status-dot" />
            Online
          </div>
        </div>
        <button id="qs-logout" className="btn-logout" onClick={onLogout} title="Sign out">↩</button>
      </div>
    </aside>
  );
}
