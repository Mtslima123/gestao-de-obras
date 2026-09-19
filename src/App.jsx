import React from 'react';
import { AppData } from './utils/data';
import { Icon } from './components/Icons';
import { ToastProvider, useToast, NovaObraModal, NovaMedicaoModal, SolicitarCompraModal, NovoOrcamentoModal } from './components/Modals';
import { Sidebar, Topbar } from './Chrome';
import { LoginScreen } from './modules/auth/Login';
import { AcessoNaoAutorizado } from './modules/auth/AcessoNaoAutorizado';
import { authService } from './modules/auth/auth.service';
import { supabase } from './services/supabase';
import { moduloLiberado, obraLiberada, obrasPermitidas } from './utils/permissions';
import { obrasService, obraDeleteErrorMessage } from './modules/obras/obras.service';
import { logger, setContext, clearContext } from './services/logger';
import { friendlyError } from './utils/friendlyError';
import { useIsMobile } from './utils/useIsMobile';
import { MobileGate } from './modules/mobile/MobileGate';
// Telas pesadas carregadas sob demanda (code-splitting) — reduz o bundle inicial.
// Renderizadas dentro de <Suspense> no corpo do App.
const Dashboard                 = React.lazy(() => import('./modules/dashboard/Dashboard').then(m => ({ default: m.Dashboard })));
const ObrasList                 = React.lazy(() => import('./modules/obras/ObrasList').then(m => ({ default: m.ObrasList })));
const ObraDetail                = React.lazy(() => import('./modules/obras/ObraDetail').then(m => ({ default: m.ObraDetail })));
const OrcamentosScreen          = React.lazy(() => import('./modules/financeiro/Orcamentos').then(m => ({ default: m.OrcamentosScreen })));
const CronogramaFull            = React.lazy(() => import('./modules/cronograma/Cronograma').then(m => ({ default: m.CronogramaFull })));
const OrcamentoCronogramaScreen = React.lazy(() => import('./modules/financeiro/OrcamentoCronograma').then(m => ({ default: m.OrcamentoCronogramaScreen })));
const UsuariosScreen            = React.lazy(() => import('./modules/admin/Usuarios').then(m => ({ default: m.UsuariosScreen })));
const AuditoriaScreen           = React.lazy(() => import('./modules/admin/Auditoria').then(m => ({ default: m.AuditoriaScreen })));
import { useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakSelect, TweakColor, TweakButton } from './components/TweaksPanel';

// Um módulo (React.lazy) que já estava carregado na aba e o site foi atualizado (novo
// deploy) deixa de conseguir buscar o .js antigo — o navegador ainda tenta o arquivo com
// o hash da versão anterior, que o deploy novo já não tem mais. "Failed to fetch
// dynamically imported module" é a mensagem que os browsers dão nesse caso; sem tratar
// à parte, caía na regra genérica de "falha de conexão", que é enganosa aqui (o problema
// não é a internet do usuário, é a aba estar com a versão antiga do app).
const CHUNK_LOAD_ERROR_RE = /dynamically imported module|failed to fetch dynamically|importing a module script failed|chunkloaderror/i;
const isChunkLoadError = (error) => CHUNK_LOAD_ERROR_RE.test(String(error?.message || error?.name || ''));

// Captura erros de render e exibe mensagem em vez de tela branca
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    logger.fatal('erro de renderizacao', { module: 'react', action: 'render', err: error, componentStack: info?.componentStack });
    // React.lazy() guarda a promise da importação pra sempre — clicar em "Tentar
    // novamente" não re-busca o arquivo, só re-lança o mesmo erro. Só uma recarga de
    // verdade (window.location.reload) busca o index.html novo e resolve. Recarrega
    // automaticamente UMA vez (guarda por sessionStorage: se persistir após a recarga,
    // não é isso — evita ficar recarregando em loop).
    if (isChunkLoadError(error)) {
      try {
        if (!sessionStorage.getItem('gm_reload_chunk_error')) {
          sessionStorage.setItem('gm_reload_chunk_error', '1');
          window.location.reload();
        }
      } catch { /* sessionStorage indisponível: só mostra o botão manual abaixo */ }
    }
  }
  render() {
    if (this.state.error) {
      const chunkError = isChunkLoadError(this.state.error);
      return (
        <div style={{ padding: 40, textAlign: 'center', fontFamily: 'system-ui' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>{chunkError ? 'Nova versão disponível' : 'Erro ao carregar este módulo'}</h2>
          <p style={{ color: '#b91c1c', fontSize: 13.5, textAlign: 'center', maxWidth: 460,
                      margin: '16px auto', background: '#fef2f2',
                      padding: '10px 16px', borderRadius: 8, border: '1px solid #fecaca' }}>
            {chunkError ? 'O sistema foi atualizado. Recarregue a página para continuar.' : friendlyError(this.state.error)}
          </p>
          <button
            onClick={() => chunkError ? window.location.reload() : this.setState({ error: null })}
            style={{ padding: '8px 20px', background: 'var(--brand,#014386)', color: '#fff',
                     border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
          >
            {chunkError ? 'Recarregar página' : 'Tentar novamente'}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Main App — Gestão de Obras
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "density": "default",
  "accent": "#014386"
}/*EDITMODE-END*/;

const AppInner = () => {
  // A app montou normalmente: limpa a guarda de "já recarreguei uma vez por erro de
  // chunk" (ver ErrorBoundary/isChunkLoadError) — sem isso, só o PRIMEIRO deploy depois
  // de abrir a aba ganhava a recarga automática; deploys seguintes na mesma sessão cairiam
  // direto no botão manual, mesmo sendo exatamente o mesmo caso.
  React.useEffect(() => { try { sessionStorage.removeItem('gm_reload_chunk_error'); } catch { /* ignore */ } }, []);
  const toast = useToast();
  const [authed, setAuthed]           = React.useState(false);
  const [acessoNegado, setAcessoNegado] = React.useState(false); // sessão válida, mas e-mail não autorizado
  const [user,   setUser]             = React.useState(null);
  const [userProfile, setUserProfile] = React.useState(null);
  const [view, setView] = React.useState(() => {
    const saved = sessionStorage.getItem('nav_view');
    return (saved && saved !== 'obra-detail') ? saved : 'dashboard';
  });
  const [selectedObra, setSelectedObra] = React.useState(null);
  const [modal, setModal] = React.useState(null);
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  const [obras, setObras] = React.useState(() => []);
  const [refreshOrcamentos, setRefreshOrcamentos] = React.useState(0);
  const [cronogramaObraId, setCronogramaObraId] = React.useState(null);
  const [obrasLoaded,     setObrasLoaded]     = React.useState(false);
  const [cronogramaTab,   setCronogramaTab]   = React.useState(() => sessionStorage.getItem('nav_cronograma_tab') || 'gantt');
  const [adminTab,        setAdminTab]        = React.useState(() => sessionStorage.getItem('nav_admin_tab') || 'usuarios');
  const [sidebarPinned,   setSidebarPinned]   = React.useState(false); // menu fixado aberto (sem persistir)
  const isMobile = useIsMobile();
  const [mobileGateBypassed, setMobileGateBypassed] = React.useState(() => {
    try { return sessionStorage.getItem('mobile_gate_ok') === '1'; } catch { return false; }
  });
  // Deep links "de uma vez só" para dentro dos módulos — ver handleOpenCronograma/handleOpenObra abaixo.
  const [cronogramaInitialTab, setCronogramaInitialTab] = React.useState(null);
  const [selectedObraInitialTab, setSelectedObraInitialTab] = React.useState('visao');
  // Sub-abas persistem na sessão para o F5 reabrir na mesma aba
  React.useEffect(() => { sessionStorage.setItem('nav_cronograma_tab', cronogramaTab); }, [cronogramaTab]);
  React.useEffect(() => { sessionStorage.setItem('nav_admin_tab', adminTab); }, [adminTab]);

  // Carrega obras do Supabase ao autenticar; mock serve só de fallback se a consulta falhar
  React.useEffect(() => {
    if (!authed) return;
    obrasService.listar()
      .then(({ data, error }) => {
        if (!error && data) {
          AppData.obras = data;
          setObras(data);
        } else {
          setObras([...AppData.obras]); // fallback ao mock apenas em caso de erro
        }
      })
      .finally(() => setObrasLoaded(true)); // libera o gate mesmo se a consulta falhar
  }, [authed]);

  const handleObraCreate = async (nova) => {
    const { data, error } = await obrasService.criar(nova, user?.id);
    if (error) {
      logger.error('erro ao criar obra', { module: 'obras', action: 'criar', err: error });
      toast('Erro ao criar obra. ' + friendlyError(error), { tone: 'danger' });
      return false;
    }
    const novaComId = (Array.isArray(data) ? data[0] : data) || nova;
    const novas = [...obras, novaComId];
    AppData.obras = novas;
    setObras(novas);
    toast('Obra criada com sucesso', { tone: 'success', icon: 'check' });
    return true;
  };
  const handleObraUpdate = async (updated) => {
    const { error } = await obrasService.atualizar(updated.id, updated);
    if (error) {
      logger.error('erro ao atualizar obra', { module: 'obras', action: 'atualizar', err: error });
      toast('Erro ao atualizar obra. ' + friendlyError(error), { tone: 'danger' });
      return false;
    }
    const novas = obras.map(o => o.id === updated.id ? updated : o);
    AppData.obras = novas;
    setObras(novas);
    if (selectedObra?.id === updated.id) setSelectedObra(updated);
    toast('Obra atualizada com sucesso', { tone: 'success', icon: 'check' });
    return true;
  };
  const handleObraDelete = async (id) => {
    const { error } = await obrasService.excluir(id);
    if (error) {
      toast(obraDeleteErrorMessage(error), { tone: 'danger', icon: 'alert' });
      return;
    }
    const novas = obras.filter(o => o.id !== id);
    AppData.obras = novas;
    setObras(novas);
    if (selectedObra?.id === id) { setSelectedObra(null); setView('obras'); sessionStorage.setItem('nav_view', 'obras'); }
  };

  // Carrega perfil de permissões após autenticação. Retorna o perfil (ou null)
  // para o portão de acesso decidir se libera a entrada.
  const loadUserProfile = async (email) => {
    if (!email) return null;
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, perfil, status, modulos_ids, modulos_readonly_ids, abas_ids, abas_readonly_ids, user_obras(obra_id)')
      .eq('email', email)
      .single();
    // PGRST116 = 0 linhas (usuário sem perfil cadastrado) — caso legítimo, não é erro.
    // Qualquer outro erro (rede/RLS/SQL) era engolido e virava "acesso negado" silencioso.
    if (error && error.code !== 'PGRST116') logger.error('falha ao carregar perfil do usuario', { module: 'app', action: 'loadUserProfile', err: error });
    setUserProfile(data ?? null);
    return data ?? null;
  };

  // Portão de acesso app-wide: só entra quem tem perfil cadastrado e ativo.
  // Centraliza a regra para valer tanto no restore de sessão quanto no login SSO.
  // O grupo de acesso do Azure AD (G-SOTER-<App>) é validado fora deste app: gate no
  // Enterprise Application ("Assignment required" + grupo atribuído), gerenciado pelo
  // Appiá — quem não está no grupo nem completa o login (AADSTS50105, tratado em
  // Login.jsx). Não há checagem de grupo em runtime aqui de propósito.
  const aplicarSessao = async (session) => {
    if (!session?.user) {
      setAuthed(false);
      setAcessoNegado(false);
      setUser(null);
      setUserProfile(null);
      clearContext(); // some o userId dos logs após logout
      // Some junto com a sessão — próximo login (mesma aba) deve mostrar o Mobile Gate de novo.
      try { sessionStorage.removeItem('mobile_gate_ok'); } catch { /* ignore */ }
      setMobileGateBypassed(false);
      return;
    }
    setUser(session.user);
    setContext({ userId: session.user.id, userEmail: session.user.email }); // enriquece os logs

    const perfil = await loadUserProfile(session.user.email);
    const autorizado = !!perfil && perfil.status === 'ativo';
    setAuthed(autorizado);
    setAcessoNegado(!autorizado); // mantém a sessão para exibir o e-mail na tela de bloqueio
    // Fire-and-forget: RLS não deixa o usuário comum dar UPDATE direto na própria
    // linha, por isso passa por função SECURITY DEFINER estreita (só grava esta coluna).
    if (autorizado) {
      supabase.rpc('registrar_ultimo_acesso').then(({ error }) => {
        if (error) logger.error('falha ao registrar ultimo acesso', { module: 'app', action: 'registrarUltimoAcesso', err: error });
      });
    }
  };

  React.useEffect(() => {
    authService.getSession().then(({ data: { session } }) => {
      if (session?.user) aplicarSessao(session);
    }).catch(err => logger.error('falha ao restaurar sessao', { module: 'app', action: 'getSession', err }));
    const { data: { subscription } } = authService.onAuthStateChange((event, session) => {
      aplicarSessao(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Restaura obra-detail após reload
  React.useEffect(() => {
    if (sessionStorage.getItem('nav_view') === 'obra-detail') {
      try {
        const obra = JSON.parse(sessionStorage.getItem('nav_obra') || 'null');
        if (obra) { setSelectedObra(obra); setView('obra-detail'); }
        else setView('obras');
      } catch { setView('obras'); }
    }
  }, []);

  // Reseta a rolagem ao trocar de tela/obra — sem isso a janela mantinha a
  // posição de scroll anterior (nenhum container tem overflow próprio, quem
  // rola é o window), fazendo a tela nova abrir "no meio".
  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, [view, selectedObra?.id]);

  const handleLogout = () => authService.signOut();

  const bypassMobileGate = () => {
    try { sessionStorage.setItem('mobile_gate_ok', '1'); } catch { /* ignore */ }
    setMobileGateBypassed(true);
  };

  // apply theme + density + accent to root
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', tweaks.theme);
    document.documentElement.setAttribute('data-density', tweaks.density);
    document.documentElement.style.setProperty('--brand', tweaks.accent);
  }, [tweaks.theme, tweaks.density, tweaks.accent]);

  const handleNavigate = (v) => {
    sessionStorage.setItem('nav_view', v);
    setSelectedObra(null);
    setView(v);
  };

  const handleOpenObra = (obra, tab = 'visao') => {
    sessionStorage.setItem('nav_view', 'obra-detail');
    try { sessionStorage.setItem('nav_obra', JSON.stringify(obra)); } catch {}
    setSelectedObra(obra);
    setSelectedObraInitialTab(tab);
    setView('obra-detail');
  };

  const handleOpenCronograma = (obraId, tab) => {
    setCronogramaObraId(obraId);
    // "Ir para Cronograma" sempre quer dizer o Gantt/Lista — só o Mobile Gate passa
    // um `tab` explícito (ex.: 'medicao') pra abrir direto numa sub-aba.
    setCronogramaTab('gantt');
    if (tab) setCronogramaInitialTab(tab);
    handleNavigate('cronograma');
  };

  // Zera o deep link só ao SAIR do Cronograma (não logo depois de setar): CronogramaFull
  // é React.lazy, então o mount real pode ficar suspenso até o chunk carregar — resetar no
  // efeito seguinte ao clique apagava o valor antes do componente nascer com ele, e a
  // Medição sempre caía no Gantt. Zerando só na saída, o deep link sobrevive ao carregamento
  // do chunk e uma futura navegação comum pela Sidebar ainda não reabre na sub-aba antiga.
  const cronogramaViewAnteriorRef = React.useRef(view);
  React.useEffect(() => {
    if (cronogramaViewAnteriorRef.current === 'cronograma' && view !== 'cronograma') {
      setCronogramaInitialTab(null);
    }
    cronogramaViewAnteriorRef.current = view;
  }, [view]);

  const screenLabels = {
    'dashboard':  '01 Dashboard',
    'obras':      '02 Obras — Lista',
    'obra-detail':'03 Obra — Detalhe',
    'orcamentos': '05 Orçamentos',
    'cronograma': '06 Cronograma',
    'admin':      'Administração',
  };

  const buildBreadcrumb = () => {
    const home = { label: 'Início', onClick: () => handleNavigate('dashboard') };
    if (view === 'dashboard') return [{ label: 'Início' }, { label: 'Dashboard' }];
    if (view === 'obra-detail') return [
      home,
      { label: 'Obras', onClick: () => handleNavigate('obras') },
      { label: selectedObra ? selectedObra.nome : AppData.obraAtual.nome },
    ];
    const map = {
      obras: 'Obras',
      orcamentos: 'Orçamentos', cronograma: 'Cronogramas',
      admin: 'Administração',
    };
    return [home, { label: map[view] || view }];
  };

  // Obras visíveis conforme as obras autorizadas do usuário (admin vê todas)
  const obrasVisiveis = React.useMemo(() => {
    const permitidas = obrasPermitidas(userProfile);
    if (permitidas === null) return obras;
    return obras.filter(o => permitidas.includes(o.id));
  }, [obras, userProfile]);

  // Mapa view -> módulo, para bloquear telas não liberadas ao usuário
  const VIEW_MODULO = {
    dashboard: 'dashboard', obras: 'obras', 'obra-detail': 'obras',
    orcamentos: 'orcamentos', cronograma: 'cronograma',
  };
  const moduloDaView = VIEW_MODULO[view];
  const viewBloqueada = !!moduloDaView && !moduloLiberado(userProfile, moduloDaView);
  const primeiraViewLiberada =
    ['dashboard', 'obras', 'orcamentos', 'cronograma']
      .find(v => moduloLiberado(userProfile, v)) || 'dashboard';

  const showMobileGate = isMobile && !mobileGateBypassed;

  return (
    <>
      {!authed && !acessoNegado && (
        <LoginScreen />
      )}
      {acessoNegado && (
        <AcessoNaoAutorizado email={user?.email} onSair={handleLogout} />
      )}
      {authed && !acessoNegado && showMobileGate && (
        <MobileGate
          obras={obrasVisiveis}
          obrasLoaded={obrasLoaded}
          userProfile={userProfile}
          onLogout={handleLogout}
          onEnterFull={bypassMobileGate}
          onGoMedicao={(obraId) => { bypassMobileGate(); handleOpenCronograma(obraId, 'medicao'); }}
          onGoFotos={(obra) => { bypassMobileGate(); handleOpenObra(obra, 'fotos'); }}
        />
      )}
      {authed && !acessoNegado && !showMobileGate && (
    <div className={'app' + (sidebarPinned ? ' sidebar-pinned' : '')} data-screen-label={screenLabels[view] || view}>
      <Sidebar
        currentView={view === 'obra-detail' ? 'obras' : view}
        onNavigate={handleNavigate}
        user={user}
        userProfile={userProfile}
        onLogout={handleLogout}
        cronogramaTab={cronogramaTab}
        onCronogramaTabChange={setCronogramaTab}
        adminTab={adminTab}
        onAdminTabChange={setAdminTab}
        pinned={sidebarPinned}
        onPinChange={setSidebarPinned}
      />
      <div className="main">
        <Topbar
          breadcrumb={buildBreadcrumb()}
        />
        <div className="content">
          <ErrorBoundary key={view}>
          {!obrasLoaded ? (
            <div className="content-loading"><span className="spinner" /></div>
          ) : viewBloqueada ? (
            <AcessoNegado onVoltar={() => handleNavigate(primeiraViewLiberada)} />
          ) : (
          <React.Suspense fallback={<div className="content-loading"><span className="spinner" /></div>}>
          <>
          {view === 'dashboard' && <Dashboard obras={obrasVisiveis} onOpenObra={handleOpenObra} />}
          {view === 'obras' && <ObrasList onOpenObra={handleOpenObra} obras={obrasVisiveis} onObraCreate={handleObraCreate} onObraUpdate={handleObraUpdate} onObraDelete={handleObraDelete} userProfile={userProfile} />}
          {view === 'obra-detail' && (
            <ObraDetail
              obra={selectedObra}
              userProfile={userProfile}
              onBack={() => handleNavigate('obras')}
              onObraUpdate={handleObraUpdate}
              onObraDelete={handleObraDelete}
              onOpenCronograma={handleOpenCronograma}
              initialTab={selectedObraInitialTab}
            />
          )}
          {view === 'orcamentos' && (
            <OrcamentosScreen
              onNovoOrcamento={() => setModal('novo-orcamento')}
              obras={obrasVisiveis}
              refreshKey={refreshOrcamentos}
              user={user}
              userProfile={userProfile}
            />
          )}
          {view === 'cronograma' && (
            <>
              {cronogramaTab === 'gantt'      && <CronogramaFull initialObraId={cronogramaObraId} obras={obrasVisiveis} userProfile={userProfile} initialTab={cronogramaInitialTab} />}
              {cronogramaTab === 'orc-x-cron' && moduloLiberado(userProfile, 'orc-x-cron') && <OrcamentoCronogramaScreen obras={obrasVisiveis} user={user} userProfile={userProfile} />}
            </>
          )}
          {/* 🔒 SEGURANÇA [VULN-3]: telas admin bloqueadas para não-admin no frontend */}
          {view === 'admin' && (
            userProfile?.perfil === 'admin' ? (
              <>
                <div className="tabs" style={{ marginBottom: 16 }}>
                  <button className={'tab' + (adminTab === 'usuarios'  ? ' active' : '')} onClick={() => setAdminTab('usuarios')}>Usuários</button>
                  <button className={'tab' + (adminTab === 'auditoria' ? ' active' : '')} onClick={() => setAdminTab('auditoria')}>Auditoria do Sistema</button>
                </div>
                {adminTab === 'usuarios'  && <UsuariosScreen obras={obras} user={user} />}
                {adminTab === 'auditoria' && <AuditoriaScreen obras={obras} user={user} />}
              </>
            ) : <AcessoNegado onVoltar={() => handleNavigate('dashboard')} />
          )}
          {view !== 'dashboard' && view !== 'obra-detail' && view !== 'obras' &&
           view !== 'orcamentos' &&
           view !== 'cronograma' && view !== 'admin' && (
            <PlaceholderModule view={view} onOpenObra={handleOpenObra} />
          )}
          </>
          </React.Suspense>
          )}
          </ErrorBoundary>
        </div>
      </div>

      {/* Modals */}
      {modal === 'nova-obra' && <NovaObraModal onClose={() => setModal(null)} />}
      {modal === 'nova-medicao' && <NovaMedicaoModal onClose={() => setModal(null)} />}
      {modal === 'novo-orcamento' && (
        <NovoOrcamentoModal
          onClose={() => setModal(null)}
          obras={obras}
          user={user}
          onCreated={() => setRefreshOrcamentos(k => k + 1)}
        />
      )}
      {modal && typeof modal === 'object' && modal.type === 'compra' && (
        <SolicitarCompraModal insumo={modal.insumo} onClose={() => setModal(null)} />
      )}

      {/* Tweaks panel */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="Aparência" />
        <TweakRadio label="Tema" value={tweaks.theme} onChange={v => setTweak('theme', v)}
          options={[{ value: 'light', label: 'Claro' }, { value: 'dark', label: 'Escuro' }]} />
        <TweakSelect label="Densidade" value={tweaks.density} onChange={v => setTweak('density', v)}
          options={[
            { value: 'compact', label: 'Compacta' },
            { value: 'default', label: 'Padrão' },
            { value: 'comfortable', label: 'Confortável' },
          ]} />
        <TweakColor label="Cor principal" value={tweaks.accent} onChange={v => setTweak('accent', v)}
          options={['#014386', '#0b5e8c', '#1d4ed8', '#0f766e', '#7c2d12']} />

        <TweakSection label="Navegação" />
        <TweakButton label="Dashboard" onClick={() => handleNavigate('dashboard')} />
        <TweakButton label="Obras" onClick={() => handleNavigate('obras')} />
        <TweakButton label="Detalhe da Obra A" onClick={() => handleOpenObra(AppData.obraAtual)} />
        <TweakButton label="Orçamentos" onClick={() => handleNavigate('orcamentos')} />
        <TweakButton label="Cronograma" onClick={() => handleNavigate('cronograma')} />

        <TweakSection label="Modais" />
        <TweakButton label="Nova obra" onClick={() => setModal('nova-obra')} secondary />
        <TweakButton label="Nova medição" onClick={() => setModal('nova-medicao')} secondary />
        <TweakButton label="Sair (voltar ao login)" onClick={() => setAuthed(false)} secondary />
      </TweaksPanel>
    </div>
      )}
    </>
  );
};

const App = () => (
  <ToastProvider>
    <AppInner />
  </ToastProvider>
);

// Placeholder for modules not yet built
const PlaceholderModule = ({ view, onOpenObra }) => {
  const titles = {};
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">{titles[view] || view}</h1>
          <div className="page-subtitle">Módulo disponível em breve</div>
        </div>
      </div>
      <div className="card" style={{ padding: '80px 24px', textAlign: 'center' }}>
        <div style={{
          width: 72, height: 72, borderRadius: 16,
          background: 'var(--brand-tint)', color: 'var(--brand)',
          display: 'grid', placeItems: 'center', margin: '0 auto 18px',
        }}>
          <Icon name="layers" size={32} />
        </div>
        <h2 style={{ margin: '0 0 6px', fontSize: 18, letterSpacing: '-0.01em' }}>Módulo em desenvolvimento</h2>
        <div className="text-muted" style={{ maxWidth: 420, margin: '0 auto', fontSize: 13.5 }}>
          Este módulo será disponibilizado em uma próxima sprint. Por enquanto, explore as outras telas pelo menu lateral.
        </div>
      </div>
    </>
  );
};

const AcessoNegado = ({ onVoltar }) => (
  <div style={{ padding: '80px 24px', textAlign: 'center' }}>
    <div style={{
      width: 72, height: 72, borderRadius: 16,
      background: '#fef2f2', color: '#b91c1c',
      display: 'grid', placeItems: 'center', margin: '0 auto 18px',
    }}>
      <Icon name="shield" size={32} />
    </div>
    <h2 style={{ margin: '0 0 6px', fontSize: 18 }}>Acesso restrito</h2>
    <p style={{ color: 'var(--text-muted)', maxWidth: 360, margin: '0 auto 24px', fontSize: 13.5 }}>
      Esta área é exclusiva para administradores do sistema.
    </p>
    <button
      onClick={onVoltar}
      style={{ padding: '8px 20px', background: 'var(--brand,#014386)', color: '#fff',
               border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
    >
      Voltar ao Dashboard
    </button>
  </div>
);

export { App };
