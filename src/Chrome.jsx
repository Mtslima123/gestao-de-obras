import React from 'react';
import { Icon } from './components/Icons';
import { NotifPanel } from './components/Modals';
import { authService } from './modules/auth/auth.service';
import { moduloLiberado } from './utils/permissions';
import { MODULOS_TOPO } from './config/modulos';

// Sidebar + Topbar — shared app chrome
const ModalAlterarSenha = ({ onClose, forcar = false }) => {
  const [nova, setNova] = React.useState('');
  const [confirma, setConfirma] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [erro, setErro] = React.useState(null);
  const [sucesso, setSucesso] = React.useState(false);

  const handleSalvar = async (e) => {
    e.preventDefault();
    if (nova.length < 6) { setErro('A senha deve ter pelo menos 6 caracteres.'); return; }
    if (nova !== confirma) { setErro('As senhas não coincidem.'); return; }
    setErro(null);
    setLoading(true);
    const { error } = await authService.updatePassword(nova);
    if (error) { setErro('Erro ao alterar senha: ' + error.message); setLoading(false); return; }
    await authService.marcarSenhaAlterada();
    setLoading(false);
    if (forcar) { onClose(); return; }
    setSucesso(true);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '28px 32px', maxWidth: 380, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}>
        {sucesso ? (
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
            {forcar && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fefce8', border: '1px solid #fde047', borderRadius: 9, padding: '10px 14px', marginBottom: 20 }}>
                <Icon name="alert" size={15} style={{ color: '#ca8a04', flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: '#854d0e' }}>Por segurança, defina uma senha pessoal antes de continuar.</span>
              </div>
            )}
            <h3 style={{ margin: '0 0 6px', fontSize: 17 }}>{forcar ? 'Defina sua nova senha' : 'Alterar senha'}</h3>
            <p style={{ margin: '0 0 20px', color: 'var(--text-muted)', fontSize: 13.5 }}>
              {forcar ? 'Sua senha temporária precisa ser substituída.' : 'Escolha uma nova senha para sua conta.'}
            </p>
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
              {!forcar && <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>}
              <button type="submit" className="btn btn-primary" style={{ flex: forcar ? 1 : undefined }} disabled={loading}>
                {loading ? <span className="login-spinner" style={{ width: 14, height: 14 }} /> : 'Salvar senha'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

const Sidebar = ({ currentView, onNavigate, user, userProfile, onLogout, forcarAlterarSenha = false, onPasswordChanged, cronogramaTab, onCronogramaTabChange, adminTab, onAdminTabChange, pinned = false, onPinChange }) => {
  const [expanded, setExpanded] = React.useState(false);
  const [showAlterarSenha, setShowAlterarSenha] = React.useState(false);
  const [expandedSection, setExpandedSection] = React.useState(null);

  React.useEffect(() => {
    if (forcarAlterarSenha) setShowAlterarSenha(true);
  }, [forcarAlterarSenha]);

  // Abre accordion ao entrar na seção; fecha ao sair para outro módulo
  React.useEffect(() => {
    if (currentView === 'cronograma' || currentView === 'admin') {
      setExpandedSection(currentView);
    } else {
      setExpandedSection(null);
    }
  }, [currentView]);
  const open = expanded || pinned;   // aberto por hover OU por fixação
  const collapsed = !open;
  // Menu derivado da fonte única (config/modulos) e filtrado pelas permissões
  // do usuário (admin vê tudo; usuário comum vê o que está em modulos_ids)
  const navItems = MODULOS_TOPO
    .map(m => ({ id: m.id, label: m.label, icon: m.icon }))
    .filter(item => moduloLiberado(userProfile, item.id));
  const cronogramaSubItems = [
    { id: 'gantt',       label: 'Cronograma',       mod: 'cronograma' },
    { id: 'orc-x-cron',  label: 'Orç. × Cronograma', mod: 'orc-x-cron' },
  ].filter(sub => moduloLiberado(userProfile, sub.mod));
  const adminSubItems = [
    { id: 'usuarios',  label: 'Usuários' },
    { id: 'auditoria', label: 'Auditoria do Sistema' },
  ];
  // Administração é exclusiva de admin
  const navMgmt = [
    { id: 'admin',         label: 'Administração',       icon: 'shield' },
  ].filter(() => userProfile?.perfil === 'admin');

  const displayName = userProfile?.nome || user?.email || '—';
  const roleLabel = userProfile?.perfil === 'admin' ? 'Administrador' : 'Usuário';

  const handleSectionClick = (id) => {
    if (expandedSection === id) {
      setExpandedSection(null);
    } else {
      onNavigate(id);
      setExpandedSection(id);
    }
  };

  const renderItem = (item, onClick) => (
    <button
      key={item.id}
      className={'nav-item' + (currentView === item.id ? ' active' : '') + (item.subtle ? ' subtle' : '')}
      onClick={onClick ?? (() => onNavigate(item.id))}
      title={collapsed ? item.label : undefined}
      aria-current={currentView === item.id ? 'page' : undefined}
    >
      <Icon name={item.icon} size={20} className="nav-icon" />
      {!collapsed && <span>{item.label}</span>}
      {!collapsed && item.badge != null && <span className="nav-badge">{item.badge}</span>}
    </button>
  );

  return (
    <>
      {open && !pinned && <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.3)',zIndex:199,pointerEvents:'none'}}/>}
      <aside
        className={'sidebar' + (open ? ' expanded' : '')}
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
      >
        <div className="sidebar-header">
        <div className="brand-logo">
          <img src="/assets/soter-mark-white.png" alt="Soter" />
        </div>
        {!collapsed && (
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="brand-name">Soter</div>
            <div className="brand-sub">Gestão de Obras</div>
          </div>
        )}
        {!collapsed && (
          <button
            className={'sidebar-toggle' + (pinned ? ' pinned' : '')}
            title={pinned ? 'Desafixar menu' : 'Fixar menu'}
            aria-pressed={pinned}
            onClick={() => onPinChange?.(!pinned)}
          >
            <Icon name={pinned ? 'pin-off' : 'pin'} size={16} />
          </button>
        )}
      </div>

      <nav className="sidebar-nav">
        {!collapsed && <div className="nav-group-label">Principal</div>}
        {navItems.map(item => {
          const isCronograma = item.id === 'cronograma';
          return (
            <React.Fragment key={item.id}>
              {renderItem(item, isCronograma ? () => handleSectionClick('cronograma') : null)}
              {isCronograma && !collapsed && expandedSection === 'cronograma' && (
                <div className="nav-sub-group">
                  {cronogramaSubItems.map(sub => (
                    <button
                      key={sub.id}
                      className={'nav-sub-item' + (cronogramaTab === sub.id ? ' active' : '')}
                      onClick={() => { onNavigate('cronograma'); onCronogramaTabChange && onCronogramaTabChange(sub.id); }}
                    >
                      {sub.label}
                    </button>
                  ))}
                </div>
              )}
            </React.Fragment>
          );
        })}

        {!collapsed && <div className="nav-group-label">Gestão</div>}
        {navMgmt.map(item => {
          const isAdmin = item.id === 'admin';
          return (
            <React.Fragment key={item.id}>
              {renderItem(item, isAdmin ? () => handleSectionClick('admin') : null)}
              {isAdmin && !collapsed && expandedSection === 'admin' && (
                <div className="nav-sub-group">
                  {adminSubItems.map(sub => (
                    <button
                      key={sub.id}
                      className={'nav-sub-item' + (adminTab === sub.id ? ' active' : '')}
                      onClick={() => { onNavigate('admin'); onAdminTabChange && onAdminTabChange(sub.id); }}
                    >
                      {sub.label}
                    </button>
                  ))}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </nav>

      <div className="sidebar-user">
        <div className="sidebar-avatar">{displayName[0]?.toUpperCase() ?? '?'}</div>
        {!collapsed && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="user-name" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{displayName}</div>
            <div className="user-role">{roleLabel}</div>
          </div>
        )}
        {!collapsed && (
          <button className="icon-btn" title="Sair" onClick={onLogout}>
            <Icon name="log-out" size={17} />
          </button>
        )}
      </div>
    </aside>
    {showAlterarSenha && (
      <ModalAlterarSenha
        forcar={forcarAlterarSenha}
        onClose={() => {
          setShowAlterarSenha(false);
          if (forcarAlterarSenha && onPasswordChanged) onPasswordChanged();
        }}
      />
    )}
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
