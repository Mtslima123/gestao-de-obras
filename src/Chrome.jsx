import React from 'react';
import { Icon } from './components/Icons';
import { NotifPanel } from './components/Modals';
import { authService } from './modules/auth/auth.service';

// Sidebar + Topbar — shared app chrome
const ModalAlterarSenha = ({ onClose }) => {
  const [nova, setNova] = React.useState('');
  const [confirma, setConfirma] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [erro, setErro] = React.useState(null);
  const [ok, setOk] = React.useState(false);

  const handleSalvar = async (e) => {
    e.preventDefault();
    if (nova.length < 6) { setErro('A senha deve ter pelo menos 6 caracteres.'); return; }
    if (nova !== confirma) { setErro('As senhas não coincidem.'); return; }
    setErro(null);
    setLoading(true);
    const { error } = await authService.updatePassword(nova);
    setLoading(false);
    if (error) { setErro('Erro ao alterar senha: ' + error.message); return; }
    setOk(true);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '28px 32px', maxWidth: 380, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}>
        {ok ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#dcfce7', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
              <Icon name="check" size={22} style={{ color: '#15803d' }} />
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: 17 }}>Senha alterada!</h3>
            <p style={{ margin: '0 0 22px', color: 'var(--text-muted)', fontSize: 14 }}>Sua nova senha já está ativa.</p>
            <button className="btn btn-primary" onClick={onClose}>Fechar</button>
          </div>
        ) : (
          <form onSubmit={handleSalvar}>
            <h3 style={{ margin: '0 0 6px', fontSize: 17 }}>Alterar senha</h3>
            <p style={{ margin: '0 0 20px', color: 'var(--text-muted)', fontSize: 13.5 }}>Escolha uma nova senha para sua conta.</p>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 5 }}>Nova senha</label>
              <input className="input" style={{ width: '100%' }} type="password"
                placeholder="Mínimo 6 caracteres" value={nova} onChange={e => setNova(e.target.value)} autoFocus />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 5 }}>Confirmar senha</label>
              <input className="input" style={{ width: '100%' }} type="password"
                placeholder="Repita a senha" value={confirma} onChange={e => setConfirma(e.target.value)} />
            </div>
            {erro && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 12px', marginBottom: 16, fontSize: 13, color: '#b91c1c' }}>
                <Icon name="alert" size={14} />{erro}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? <span className="login-spinner" style={{ width: 14, height: 14 }} /> : 'Salvar senha'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

const Sidebar = ({ currentView, onNavigate, user, onLogout }) => {
  const [expanded, setExpanded] = React.useState(false);
  const [showAlterarSenha, setShowAlterarSenha] = React.useState(false);
  const collapsed = !expanded;
  const navItems = [
    { id: 'dashboard',     label: 'Dashboard',           icon: 'dashboard' },
    { id: 'obras',         label: 'Obras',               icon: 'building', badge: 14 },
    { id: 'orcamentos',    label: 'Orçamentos',          icon: 'wallet' },
    { id: 'cronograma',    label: 'Cronogramas',         icon: 'calendar' },
    { id: 'orc-x-cron',   label: 'Orç. × Cronograma',  icon: 'link' },
    { id: 'resumo',        label: 'Resumo de obras',     icon: 'chart' },
    { id: 'controle',      label: 'Controle de obras',   icon: 'hard-hat' },
    { id: 'efetivo',       label: 'Efetivo',             icon: 'users' },
    { id: 'estimativas',   label: 'Estimativas',         icon: 'calculator' },
    { id: 'planejamento',  label: 'Planejamento',        icon: 'gantt' },
    { id: 'contratos',     label: 'Contratos',           icon: 'file' },
    { id: 'medicaobanco',  label: 'Medição Banco',       icon: 'measure' },
    { id: 'incc',          label: 'INCC',                icon: 'trending-up' },
  ];
  const navMgmt = [
    { id: 'ia',            label: 'Assistente IA',       icon: 'sparkle' },
    { id: 'incorporacao',  label: 'Incorporação',        icon: 'briefcase' },
    { id: 'relatorios',    label: 'Relatórios',          icon: 'chart' },
    { id: 'admin',         label: 'Administração',       icon: 'shield' },
  ];
  const navConfig = [
    { id: 'usuarios',  label: 'Usuários',            icon: 'user'   },
    { id: 'auditoria', label: 'Auditoria do Sistema', icon: 'shield' },
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
          <img src="/assets/soter-icon.png" alt="Soter" style={{ width: 40, height: 40, objectFit: 'contain' }} />
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

        {!collapsed && <div className="nav-group-label">Configurações</div>}
        {navConfig.map(renderItem)}
      </nav>

      <div className="sidebar-user">
        <div className="avatar av-5 lg">{user?.email?.[0]?.toUpperCase() ?? '?'}</div>
        {!collapsed && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="user-name" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.email ?? '—'}</div>
          </div>
        )}
        {!collapsed && (
          <>
            <button className="icon-btn" title="Alterar senha" onClick={() => setShowAlterarSenha(true)}>
              <Icon name="key" size={16} />
            </button>
            <button className="icon-btn" title="Sair" onClick={onLogout}>
              <Icon name="log-out" size={16} />
            </button>
          </>
        )}
      </div>
    </aside>
    {showAlterarSenha && <ModalAlterarSenha onClose={() => setShowAlterarSenha(false)} />}
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

export { Sidebar, Topbar };
