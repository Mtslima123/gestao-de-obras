import React from 'react';
import { AppData } from './utils/data';
import { Icon } from './components/Icons';
import { ToastProvider, useToast, NovaObraModal, NovaMedicaoModal, SolicitarCompraModal, NovoOrcamentoModal } from './components/Modals';
import { Sidebar, Topbar } from './Chrome';
import { LoginScreen } from './modules/auth/Login';
import { authService } from './modules/auth/auth.service';
import { supabase } from './services/supabase';
import { obrasService } from './modules/obras/obras.service';
import { Dashboard } from './modules/dashboard/Dashboard';
import { ObrasList } from './modules/obras/ObrasList';
import { ObraDetail } from './modules/obras/ObraDetail';
import { OrcamentosScreen } from './modules/financeiro/Orcamentos';
import { EstimativasScreen } from './modules/financeiro/Estimativas';
import { MedicaoBancoScreen } from './modules/financeiro/Medicao';
import { INCCScreen } from './modules/financeiro/Incc';
import { CronogramaFull } from './modules/cronograma/Cronograma';
import { OrcamentoCronogramaScreen } from './modules/financeiro/OrcamentoCronograma';
import { IaScreen } from './modules/ia/IA';
import { UsuariosScreen } from './modules/admin/Usuarios';
import { AuditoriaScreen } from './modules/admin/Auditoria';
import { useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakSelect, TweakColor, TweakButton } from './components/TweaksPanel';

// Captura erros de render e exibe mensagem em vez de tela branca
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('Render error:', error, info.componentStack); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, textAlign: 'center', fontFamily: 'system-ui' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Erro ao carregar este módulo</h2>
          <pre style={{ color: '#b91c1c', fontSize: 12, textAlign: 'left', maxWidth: 700,
                        margin: '16px auto', whiteSpace: 'pre-wrap', background: '#fef2f2',
                        padding: 16, borderRadius: 8, border: '1px solid #fecaca' }}>
            {this.state.error.message}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ padding: '8px 20px', background: 'var(--brand,#014386)', color: '#fff',
                     border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
          >
            Tentar novamente
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
  "accent": "#014386",
  "obrasLayout": "cards"
}/*EDITMODE-END*/;

const AppInner = () => {
  const toast = useToast();
  const [authed, setAuthed]           = React.useState(false);
  const [user,   setUser]             = React.useState(null);
  const [userProfile, setUserProfile] = React.useState(null);
  const [passwordRecovery, setPasswordRecovery] = React.useState(false);
  const [view, setView] = React.useState(() => {
    const saved = sessionStorage.getItem('nav_view');
    return (saved && saved !== 'obra-detail') ? saved : 'dashboard';
  });
  const [selectedObra, setSelectedObra] = React.useState(null);
  const [modal, setModal] = React.useState(null);
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  const [obras, setObras] = React.useState(() => [...AppData.obras]);
  const [refreshOrcamentos, setRefreshOrcamentos] = React.useState(0);
  const [cronogramaObraId, setCronogramaObraId] = React.useState(null);
  const [obrasLoaded,     setObrasLoaded]     = React.useState(false);
  const [cronogramaTab,   setCronogramaTab]   = React.useState(() => sessionStorage.getItem('nav_cronograma_tab') || 'gantt');
  const [adminTab,        setAdminTab]        = React.useState(() => sessionStorage.getItem('nav_admin_tab') || 'usuarios');
  // Sub-abas persistem na sessão para o F5 reabrir na mesma aba
  React.useEffect(() => { sessionStorage.setItem('nav_cronograma_tab', cronogramaTab); }, [cronogramaTab]);
  React.useEffect(() => { sessionStorage.setItem('nav_admin_tab', adminTab); }, [adminTab]);

  // Carrega obras do Supabase ao autenticar; mantém mock como fallback se a tabela estiver vazia
  React.useEffect(() => {
    if (!authed) return;
    obrasService.listar().then(({ data, error }) => {
      if (!error && data) {
        AppData.obras = data;
        setObras(data);
      }
      setObrasLoaded(true); // garante que CronogramaFull só monta com obras reais
    });
  }, [authed]);

  const handleObraCreate = async (nova) => {
    const { data, error } = await obrasService.criar(nova, user?.id);
    if (error) {
      toast('Erro ao criar obra: ' + error.message, { tone: 'danger' });
      return;
    }
    const novaComId = (Array.isArray(data) ? data[0] : data) || nova;
    const novas = [...obras, novaComId];
    AppData.obras = novas;
    setObras(novas);
  };
  const handleObraUpdate = async (updated) => {
    const { error } = await obrasService.atualizar(updated.id, updated);
    if (error) {
      toast('Erro ao atualizar obra: ' + error.message, { tone: 'danger' });
      return;
    }
    const novas = obras.map(o => o.id === updated.id ? updated : o);
    AppData.obras = novas;
    setObras(novas);
    if (selectedObra?.id === updated.id) setSelectedObra(updated);
  };
  const handleObraDelete = async (id) => {
    const { error } = await obrasService.excluir(id);
    if (error) {
      toast('Erro ao excluir obra: ' + error.message, { tone: 'danger' });
      return;
    }
    const novas = obras.filter(o => o.id !== id);
    AppData.obras = novas;
    setObras(novas);
    if (selectedObra?.id === id) { setSelectedObra(null); setView('obras'); sessionStorage.setItem('nav_view', 'obras'); }
  };

  // Carrega perfil de permissões após autenticação
  const loadUserProfile = async (email) => {
    if (!email) return;
    const { data } = await supabase
      .from('user_profiles')
      .select('id, perfil, modulos_ids, abas_ids, deve_alterar_senha')
      .eq('email', email)
      .single();
    setUserProfile(data ?? null);
  };

  React.useEffect(() => {
    authService.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setAuthed(true);
        setUser(session.user);
        loadUserProfile(session.user.email);
      }
    });
    const { data: { subscription } } = authService.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true);
        return;
      }
      setPasswordRecovery(false);
      setAuthed(!!session);
      setUser(session?.user ?? null);
      if (session?.user) loadUserProfile(session.user.email);
      else setUserProfile(null);
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

  const handleLogout = () => authService.signOut();

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

  const handleOpenObra = (obra) => {
    sessionStorage.setItem('nav_view', 'obra-detail');
    try { sessionStorage.setItem('nav_obra', JSON.stringify(obra)); } catch {}
    setSelectedObra(obra);
    setView('obra-detail');
  };

  const handleOpenCronograma = (obraId) => {
    setCronogramaObraId(obraId);
    handleNavigate('cronograma');
  };

  const screenLabels = {
    'dashboard':  '01 Dashboard',
    'obras':      '02 Obras — Lista',
    'obra-detail':'03 Obra — Detalhe',
    'estimativas':'04 Estimativas',
    'orcamentos': '05 Orçamentos',
    'cronograma': '06 Cronograma',
    'incc':       '07 INCC',
    'ia':         '08 Assistente IA',
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
      obras: 'Obras', estimativas: 'Estimativas',
      orcamentos: 'Orçamentos', cronograma: 'Cronogramas',
      medicaobanco: 'Medição Banco', incc: 'INCC',
      admin: 'Administração',
    };
    return [home, { label: map[view] || view }];
  };

  return (
    <>
      {(!authed || passwordRecovery) && (
        <LoginScreen
          onLogin={() => {}}
          passwordRecovery={passwordRecovery}
          onPasswordSet={() => setPasswordRecovery(false)}
        />
      )}
      {authed && (
    <div className="app" data-screen-label={screenLabels[view] || view}>
      <Sidebar
        currentView={view === 'obra-detail' ? 'obras' : view}
        onNavigate={handleNavigate}
        user={user}
        onLogout={handleLogout}
        forcarAlterarSenha={userProfile?.deve_alterar_senha === true}
        onPasswordChanged={() => setUserProfile(p => p ? { ...p, deve_alterar_senha: false } : p)}
        cronogramaTab={cronogramaTab}
        onCronogramaTabChange={setCronogramaTab}
        adminTab={adminTab}
        onAdminTabChange={setAdminTab}
      />
      <div className="main">
        <Topbar
          breadcrumb={buildBreadcrumb()}
        />
        <div className="content">
          <ErrorBoundary key={view}>
          {view === 'dashboard' && <Dashboard onOpenObra={handleOpenObra} onAcao={(a) => setModal(a)} />}
          {view === 'obras' && <ObrasList onOpenObra={handleOpenObra} layout={tweaks.obrasLayout} obras={obras} onObraCreate={handleObraCreate} onObraUpdate={handleObraUpdate} onObraDelete={handleObraDelete} />}
          {view === 'obra-detail' && (
            <ObraDetail
              obra={selectedObra}
              onBack={() => handleNavigate('obras')}
              onNovaMedicao={() => setModal('nova-medicao')}
              onSolicitarCompra={(insumo) => setModal({ type: 'compra', insumo })}
              onObraUpdate={handleObraUpdate}
              onObraDelete={handleObraDelete}
              onOpenCronograma={handleOpenCronograma}
            />
          )}
          {view === 'orcamentos' && (
            <OrcamentosScreen
              onNovoOrcamento={() => setModal('novo-orcamento')}
              obras={obras}
              refreshKey={refreshOrcamentos}
              user={user}
            />
          )}
          {view === 'estimativas' && <EstimativasScreen />}
          {view === 'incc' && <INCCScreen />}
          {view === 'cronograma' && obrasLoaded && (
            <>
              {cronogramaTab === 'gantt'      && <CronogramaFull initialObraId={cronogramaObraId} />}
              {cronogramaTab === 'orc-x-cron' && <OrcamentoCronogramaScreen obras={obras} user={user} />}
            </>
          )}
          {view === 'ia' && <IaScreen obras={obras} user={user} />}
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
           view !== 'orcamentos' && view !== 'estimativas' && view !== 'incc' &&
           view !== 'cronograma' && view !== 'ia' && view !== 'admin' && (
            <PlaceholderModule view={view} onOpenObra={handleOpenObra} />
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

        <TweakSection label="Layout" />
        <TweakRadio label="Lista de obras" value={tweaks.obrasLayout} onChange={v => setTweak('obrasLayout', v)}
          options={[{ value: 'tabela', label: 'Tabela' }, { value: 'cards', label: 'Cards' }]} />

        <TweakSection label="Navegação" />
        <TweakButton label="Dashboard" onClick={() => handleNavigate('dashboard')} />
        <TweakButton label="Obras" onClick={() => handleNavigate('obras')} />
        <TweakButton label="Detalhe da Obra A" onClick={() => handleOpenObra(AppData.obraAtual)} />
        <TweakButton label="Estimativas" onClick={() => handleNavigate('estimativas')} />
        <TweakButton label="Orçamentos" onClick={() => handleNavigate('orcamentos')} />
        <TweakButton label="Cronograma" onClick={() => handleNavigate('cronograma')} />
        <TweakButton label="INCC" onClick={() => handleNavigate('incc')} />

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
  const titles = {
    medicaobanco: 'Medição Banco',
  };
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
