import React from 'react';
import { supabase } from './services/supabase';
import { AppData } from './utils/data';
import { Icon } from './components/Icons';
import { ToastProvider, NovaObraModal, NovaMedicaoModal, SolicitarCompraModal, NovoOrcamentoModal } from './components/Modals';
import { Sidebar, Topbar } from './Chrome';
import { LoginScreen } from './modules/auth/Login';
import { Dashboard } from './modules/dashboard/Dashboard';
import { ObrasList } from './modules/obras/ObrasList';
import { ObraDetail } from './modules/obras/ObraDetail';
import { OrcamentosScreen } from './modules/financeiro/Orcamentos';
import { EstimativasScreen } from './modules/financeiro/Estimativas';
import { ControleObrasScreen } from './modules/controle/Controle';
import { EfetivoScreen } from './modules/controle/Efetivo';
import { ResumoObrasScreen } from './modules/controle/Resumo';
import { MedicaoBancoScreen } from './modules/financeiro/Medicao';
import { INCCScreen } from './modules/financeiro/Incc';
import { CronogramaFull } from './modules/cronograma/Cronograma';
import { ContratosScreen } from './modules/financeiro/Contratos';
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
  const devMode = new URLSearchParams(window.location.search).get('devMode') === '1';
  const [authed, setAuthed] = React.useState(() => devMode);
  const [user,   setUser]   = React.useState(() => devMode ? { email: 'dev@local' } : null);
  const [view, setView] = React.useState(() => {
    const saved = sessionStorage.getItem('nav_view');
    return (saved && saved !== 'obra-detail') ? saved : 'dashboard';
  });
  const [selectedObra, setSelectedObra] = React.useState(null);
  const [modal, setModal] = React.useState(null);
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  const [obras, setObras] = React.useState(() => [...AppData.obras]);
  const [cronogramaObraId, setCronogramaObraId] = React.useState(null);

  // Carrega obras do Supabase ao autenticar; mantém mock como fallback se a tabela estiver vazia
  React.useEffect(() => {
    if (!authed) return;
    supabase.from('obras').select('*').then(({ data, error }) => {
      if (!error && data && data.length > 0) {
        AppData.obras = data;
        setObras(data);
      }
    });
  }, [authed]);

  const handleObraCreate = async (nova) => {
    const { error } = await supabase.from('obras').insert([{ ...nova, user_id: user?.id }]);
    if (error) { console.warn('Supabase insert error:', error); }
    const novas = [...obras, nova];
    AppData.obras = novas;
    setObras(novas);
  };
  const handleObraUpdate = async (updated) => {
    const { error } = await supabase.from('obras').update(updated).eq('id', updated.id);
    if (error) { console.warn('Supabase update error:', error); }
    const novas = obras.map(o => o.id === updated.id ? updated : o);
    AppData.obras = novas;
    setObras(novas);
    if (selectedObra?.id === updated.id) setSelectedObra(updated);
  };
  const handleObraDelete = async (id) => {
    const { error } = await supabase.from('obras').delete().eq('id', id);
    if (error) { console.warn('Supabase delete error:', error); }
    const novas = obras.filter(o => o.id !== id);
    AppData.obras = novas;
    setObras(novas);
    if (selectedObra?.id === id) { setSelectedObra(null); setView('obras'); sessionStorage.setItem('nav_view', 'obras'); }
  };

  React.useEffect(() => {
    if (devMode) return; // em devMode ignora Supabase auth
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) { setAuthed(true); setUser(session.user); }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setAuthed(!!session);
      setUser(session?.user ?? null);
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

  const handleLogout = () => supabase.auth.signOut();

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
    'dashboard': '01 Dashboard',
    'obras': '02 Obras — Lista',
    'obra-detail': '03 Obra — Detalhe',
    'resumo': '04 Resumo de Obras',
    'controle': '05 Controle de Obras',
    'estimativas': '06 Estimativas',
    'orcamentos': '07 Orçamentos',
    'cronograma': '08 Cronograma',
    'contratos': '09 Contratos',
    'incc': '10 INCC',
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
      obras: 'Obras', resumo: 'Resumo de obras', controle: 'Controle de obras', efetivo: 'Efetivo', estimativas: 'Estimativas',
      orcamentos: 'Orçamentos', planejamento: 'Planejamento',
      cronograma: 'Cronogramas', contratos: 'Contratos', medicaobanco: 'Medição Banco', incc: 'INCC',
      incorporacao: 'Incorporação', relatorios: 'Relatórios', admin: 'Administração',
    };
    return [home, { label: map[view] || view }];
  };

  return (
    <>
      {!authed && <LoginScreen onLogin={() => {}} />}
      {authed && (
    <div className="app" data-screen-label={screenLabels[view] || view}>
      <Sidebar
        currentView={view === 'obra-detail' ? 'obras' : view}
        onNavigate={handleNavigate}
        user={user}
        onLogout={handleLogout}
      />
      <div className="main">
        <Topbar
          breadcrumb={buildBreadcrumb()}
          onNovaObra={view === 'dashboard' ? () => setModal('nova-obra') : null}
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
          {view === 'orcamentos' && <OrcamentosScreen onNovoOrcamento={() => setModal('novo-orcamento')} />}
          {view === 'estimativas' && <EstimativasScreen />}
          {view === 'controle' && <ControleObrasScreen />}
          {view === 'efetivo' && <EfetivoScreen />}
          {view === 'resumo' && <ResumoObrasScreen />}
          {view === 'medicaobanco' && <MedicaoBancoScreen />}
          {view === 'incc' && <INCCScreen />}
          {view === 'cronograma' && <CronogramaFull initialObraId={cronogramaObraId} />}
          {view === 'contratos' && <ContratosScreen />}
          {view !== 'dashboard' && view !== 'obra-detail' && view !== 'obras' &&
           view !== 'orcamentos' && view !== 'estimativas' && view !== 'controle' && view !== 'resumo' && view !== 'incc' &&
           view !== 'cronograma' && view !== 'contratos' && view !== 'medicaobanco' && view !== 'efetivo' && (
            <PlaceholderModule view={view} onOpenObra={handleOpenObra} />
          )}
          </ErrorBoundary>
        </div>
      </div>

      {/* Modals */}
      {modal === 'nova-obra' && <NovaObraModal onClose={() => setModal(null)} />}
      {modal === 'nova-medicao' && <NovaMedicaoModal onClose={() => setModal(null)} />}
      {modal === 'novo-orcamento' && <NovoOrcamentoModal onClose={() => setModal(null)} />}
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
        <TweakButton label="Resumo de obras" onClick={() => handleNavigate('resumo')} />
        <TweakButton label="Controle de obras" onClick={() => handleNavigate('controle')} />
        <TweakButton label="Detalhe da Obra A" onClick={() => handleOpenObra(AppData.obraAtual)} />
        <TweakButton label="Estimativas" onClick={() => handleNavigate('estimativas')} />
        <TweakButton label="Orçamentos" onClick={() => handleNavigate('orcamentos')} />
        <TweakButton label="Cronograma" onClick={() => handleNavigate('cronograma')} />
        <TweakButton label="Contratos" onClick={() => handleNavigate('contratos')} />
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
    planejamento: 'Planejamento físico-financeiro',
    incorporacao: 'Incorporação',
    relatorios: 'Relatórios',
    admin: 'Administração',
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

export { App };
