import React from 'react';
import { Icon } from './components/Icons';
import { NotifPanel } from './components/Modals';
import { notificacoesService, notifBus } from './services/notificacoes.service';
import { logger } from './services/logger';
import { moduloLiberado } from './utils/permissions';
import { MODULOS_TOPO } from './config/modulos';

// Sidebar + Topbar — shared app chrome
//
// Login é SOMENTE SSO (Microsoft Entra ID) — não existe senha própria no app, então não há
// tela de "alterar senha" aqui (removida na auditoria de 2026-09, junto com o restante da
// infraestrutura de senha própria que não era mais usada por nenhuma tela).
const Sidebar = ({ currentView, onNavigate, user, userProfile, onLogout, cronogramaTab, onCronogramaTabChange, adminTab, onAdminTabChange, pinned = false, onPinChange, mobileOpen = false, onMobileClose }) => {
  const [expanded, setExpanded] = React.useState(false);
  const [expandedSection, setExpandedSection] = React.useState(null);
  const asideRef = React.useRef(null);

  // Recolhe o menu assim que o ponteiro sai da área do sidebar. Garante o
  // recolhimento mesmo quando o evento nativo onMouseLeave se perde (ex.: após
  // uma re-renderização pesada disparada ao clicar num módulo).
  React.useEffect(() => {
    if (!expanded || pinned) return;
    const onMove = (e) => {
      const el = asideRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const fora = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      if (fora) setExpanded(false);
    };
    document.addEventListener('mousemove', onMove);
    return () => document.removeEventListener('mousemove', onMove);
  }, [expanded, pinned]);

  // Abre accordion ao entrar na seção; fecha ao sair para outro módulo
  React.useEffect(() => {
    if (currentView === 'cronograma' || currentView === 'admin') {
      setExpandedSection(currentView);
    } else {
      setExpandedSection(null);
    }
  }, [currentView]);
  const open = expanded || pinned || mobileOpen;   // aberto por hover, fixação OU pelo hambúrguer (mobile)
  const collapsed = !open;
  // Menu derivado da fonte única (config/modulos). Módulos sem permissão
  // continuam visíveis (locked: true) em vez de somem — só ficam bloqueados
  // ao clique (admin vê tudo; usuário comum vê o que está em modulos_ids)
  const navItems = MODULOS_TOPO
    .map(m => ({ id: m.id, label: m.label, icon: m.icon, locked: !moduloLiberado(userProfile, m.id) }));
  const cronogramaSubItems = [
    { id: 'gantt',       label: 'Cronograma',       mod: 'cronograma' },
    { id: 'orc-x-cron',  label: 'Orç. × Cronograma', mod: 'orc-x-cron' },
  ].map(sub => ({ ...sub, locked: !moduloLiberado(userProfile, sub.mod) }));
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
    // Não colapsa no clique: o menu deve continuar aberto para escolher as
    // sub-opções (ex.: Cronograma). O recolhimento acontece ao sair o mouse.
  };

  const renderItem = (item, onClick) => (
    <button
      key={item.id}
      className={'nav-item' + (currentView === item.id ? ' active' : '') + (item.subtle ? ' subtle' : '') + (item.locked ? ' locked' : '')}
      onClick={item.locked ? undefined : (onClick ?? (() => { onNavigate(item.id); onMobileClose?.(); }))}
      title={item.locked ? 'Sem acesso a este módulo. Fale com o administrador.' : (collapsed ? item.label : undefined)}
      aria-disabled={item.locked || undefined}
      aria-current={currentView === item.id ? 'page' : undefined}
    >
      <Icon name={item.icon} size={20} className="nav-icon" />
      {!collapsed && <span>{item.label}</span>}
      {!collapsed && item.badge != null && <span className="nav-badge">{item.badge}</span>}
    </button>
  );

  return (
    <>
      {open && !pinned && (
        <div
          onClick={mobileOpen ? onMobileClose : undefined}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 199, pointerEvents: mobileOpen ? 'auto' : 'none' }}
        />
      )}
      <aside
        ref={asideRef}
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
        {!userProfile ? (
          // Perfil ainda carregando: skeleton para o menu nunca ficar "em branco"
          <div className="nav-skeleton" aria-hidden="true">
            {[0, 1, 2, 3, 4].map(i => <div key={i} className="nav-skeleton-item" />)}
          </div>
        ) : (
          <>
            {navItems.length > 0 && !collapsed && <div className="nav-group-label">Principal</div>}
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
                          className={'nav-sub-item' + (cronogramaTab === sub.id ? ' active' : '') + (sub.locked ? ' locked' : '')}
                          title={sub.locked ? 'Sem acesso a este módulo. Fale com o administrador.' : undefined}
                          aria-disabled={sub.locked || undefined}
                          onClick={sub.locked ? undefined : () => { onNavigate('cronograma'); onCronogramaTabChange && onCronogramaTabChange(sub.id); onMobileClose?.(); }}
                        >
                          {sub.label}
                        </button>
                      ))}
                    </div>
                  )}
                </React.Fragment>
              );
            })}

            {navMgmt.length > 0 && !collapsed && <div className="nav-group-label">Gestão</div>}
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
                          onClick={() => { onNavigate('admin'); onAdminTabChange && onAdminTabChange(sub.id); onMobileClose?.(); }}
                        >
                          {sub.label}
                        </button>
                      ))}
                    </div>
                  )}
                </React.Fragment>
              );
            })}

            {navItems.length === 0 && navMgmt.length === 0 && !collapsed && (
              <div className="nav-empty">Sem módulos liberados</div>
            )}
          </>
        )}
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
    </>
  );
};

const Topbar = ({ breadcrumb, onNovaObra, onMenuToggle }) => {
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [naoLidas,  setNaoLidas]  = React.useState(0);
  const refreshCount = React.useCallback(async () => {
    try { const { count } = await notificacoesService.contarNaoLidas(); setNaoLidas(count || 0); }
    catch (err) { setNaoLidas(0); logger.warn('falha ao contar notificacoes nao lidas', { module: 'notificacoes', action: 'contarNaoLidas', err }); }
  }, []);
  React.useEffect(() => { refreshCount(); }, [refreshCount]);
  // Reatualiza o contador ao fechar o painel (após marcar como lida)
  React.useEffect(() => { if (!notifOpen) refreshCount(); }, [notifOpen, refreshCount]);
  // Atualização imediata quando uma ação gera notificação (evento do notifBus)
  React.useEffect(() => notifBus.subscribe(refreshCount), [refreshCount]);
  // Rede de segurança: polling leve (só com a aba visível) + refresh ao focar a aba.
  // Cobre notificações geradas por outras pessoas / em outras telas, sem recarregar.
  React.useEffect(() => {
    const tick = () => { if (!document.hidden) refreshCount(); };
    const id = setInterval(tick, 20000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [refreshCount]);
  return (
    <header className="topbar">
      <button className="icon-btn sidebar-hamburger" onClick={onMenuToggle} title="Abrir menu">
        <Icon name="menu" size={20} />
      </button>
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
        <div style={{ position: 'relative' }}>
          <button
            className="icon-btn"
            data-notif-trigger
            onClick={() => setNotifOpen(o => !o)}
            title="Notificações"
          >
            <Icon name="bell" size={17} />
            {naoLidas > 0 && <span className="dot"></span>}
          </button>
          {notifOpen && <NotifPanel onClose={() => setNotifOpen(false)} onChange={refreshCount} />}
        </div>
        {onNovaObra && (
          <button className="btn btn-primary" onClick={onNovaObra}>
            <Icon name="plus" size={15} /><span className="topbar-btn-label">Nova obra</span>
          </button>
        )}
      </div>
    </header>
  );
};

export { Sidebar, Topbar };
