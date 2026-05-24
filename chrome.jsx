// Sidebar + Topbar — shared app chrome
const Sidebar = ({ currentView, onNavigate, user, onLogout }) => {
  const [expanded, setExpanded] = React.useState(false);
  const collapsed = !expanded;
  const navItems = [
    { id: 'dashboard',     label: 'Dashboard',           icon: 'dashboard' },
    { id: 'obras',         label: 'Obras',               icon: 'building', badge: 14 },
    { id: 'resumo',        label: 'Resumo de obras',     icon: 'chart' },
    { id: 'controle',      label: 'Controle de obras',   icon: 'hard-hat' },
    { id: 'efetivo',       label: 'Efetivo',             icon: 'users' },
    { id: 'estimativas',   label: 'Estimativas',         icon: 'calculator' },
    { id: 'orcamentos',    label: 'Orçamentos',          icon: 'wallet' },
    { id: 'planejamento',  label: 'Planejamento',        icon: 'gantt' },
    { id: 'cronograma',    label: 'Cronogramas',         icon: 'calendar' },
    { id: 'contratos',     label: 'Contratos',           icon: 'file' },
    { id: 'medicaobanco',  label: 'Medição Banco',       icon: 'measure' },
    { id: 'incc',          label: 'INCC',                icon: 'trending-up' },
  ];
  const navMgmt = [
    { id: 'incorporacao',  label: 'Incorporação',        icon: 'briefcase' },
    { id: 'relatorios',    label: 'Relatórios',          icon: 'chart' },
    { id: 'admin',         label: 'Administração',       icon: 'shield' },
  ];

  const renderItem = (item) => (
    <button
      key={item.id}
      className={'nav-item' + (currentView === item.id ? ' active' : '') + (item.subtle ? ' subtle' : '')}
      onClick={() => onNavigate(item.id)}
      title={collapsed ? item.label : undefined}
    >
      <Icon name={item.icon} size={17} className="nav-icon" />
      {!collapsed && <span>{item.label}</span>}
      {!collapsed && item.badge != null && <span className="nav-badge">{item.badge}</span>}
    </button>
  );

  return (
    <>
      {expanded && <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.3)',zIndex:199,pointerEvents:'none'}}/>}
      <aside
        className={'sidebar' + (expanded ? ' expanded' : '')}
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
      >
        <div className="sidebar-header">
        <div className="brand-logo">
          <img src="assets/soter-icon.png" alt="Soter" style={{ width: 40, height: 40, objectFit: 'contain' }} />
        </div>
        {!collapsed && (
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="brand-name">Soter</div>
            <div className="brand-sub">Gestão de Obras</div>
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="sidebar-search">
          <Icon name="search" size={14} style={{ color: 'var(--sb-text-muted)' }} />
          <input placeholder="Buscar no sistema…" />
          <kbd>⌘K</kbd>
        </div>
      )}

      <nav className="sidebar-nav">
        {!collapsed && <div className="nav-group-label">Principal</div>}
        {navItems.map(renderItem)}

        {!collapsed && <div className="nav-group-label">Gestão</div>}
        {navMgmt.map(renderItem)}
      </nav>

      <div className="sidebar-user">
        <div className="avatar av-5 lg">{user?.email?.[0]?.toUpperCase() ?? '?'}</div>
        {!collapsed && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="user-name" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.email ?? '—'}</div>
          </div>
        )}
        {!collapsed && (
          <button className="icon-btn" title="Sair" onClick={onLogout}>
            <Icon name="log-out" size={16} />
          </button>
        )}
      </div>
    </aside>
    </>
  );
};

const Topbar = ({ breadcrumb, onNovaObra }) => {
  const [notifOpen, setNotifOpen] = React.useState(false);
  return (
    <header className="topbar">
      <div className="breadcrumb">
        {breadcrumb.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <Icon name="chevron-right" size={14} className="sep" />}
            <span className={i === breadcrumb.length - 1 ? 'current' : 'crumb'} onClick={c.onClick}>
              {c.label}
            </span>
          </React.Fragment>
        ))}
      </div>

      <div className="topbar-actions">
        <button className="search-trigger">
          <Icon name="search" size={14} />
          <span>Buscar em todo o sistema…</span>
          <kbd>⌘K</kbd>
        </button>
        <div style={{ position: 'relative' }}>
          <button
            className="icon-btn"
            data-notif-trigger
            onClick={() => setNotifOpen(o => !o)}
            title="Notificações"
          >
            <Icon name="bell" size={17} />
            <span className="dot"></span>
          </button>
          {notifOpen && <NotifPanel onClose={() => setNotifOpen(false)} />}
        </div>
        <button className="icon-btn" title="Ajuda">
          <Icon name="help" size={17} />
        </button>
        {onNovaObra && (
          <button className="btn btn-primary" onClick={onNovaObra}>
            <Icon name="plus" size={15} />Nova obra
          </button>
        )}
      </div>
    </header>
  );
};

Object.assign(window, { Sidebar, Topbar });
