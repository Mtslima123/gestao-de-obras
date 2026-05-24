// Main App — Gestão de Obras
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "density": "default",
  "accent": "#014386",
  "obrasLayout": "tabela"
}/*EDITMODE-END*/;

const AppInner = () => {
  const [authed, setAuthed] = React.useState(false);
  const [user,   setUser]   = React.useState(null);
  const [view, setView] = React.useState('dashboard');
  const [selectedObra, setSelectedObra] = React.useState(null);
  const [modal, setModal] = React.useState(null);
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  React.useEffect(() => {
    window.sb.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) { setAuthed(true); setUser(session.user); }
    });
    const { data: { subscription } } = window.sb.auth.onAuthStateChange((_, session) => {
      setAuthed(!!session);
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = () => window.sb.auth.signOut();

  // apply theme + density + accent to root
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', tweaks.theme);
    document.documentElement.setAttribute('data-density', tweaks.density);
    document.documentElement.style.setProperty('--brand', tweaks.accent);
  }, [tweaks.theme, tweaks.density, tweaks.accent]);

  const handleNavigate = (v) => {
    setSelectedObra(null);
    setView(v);
  };

  const handleOpenObra = (obra) => {
    setSelectedObra(obra);
    setView('obra-detail');
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
      { label: selectedObra ? selectedObra.nome : window.AppData.obraAtual.nome },
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
          onNovaObra={view === 'dashboard' || view === 'obras' ? () => setModal('nova-obra') : null}
        />
        <div className="content">
          {view === 'dashboard' && <Dashboard onOpenObra={handleOpenObra} onAcao={(a) => setModal(a)} />}
          {view === 'obras' && <ObrasList onOpenObra={handleOpenObra} layout={tweaks.obrasLayout} />}
          {view === 'obra-detail' && (
            <ObraDetail
              obra={selectedObra}
              onBack={() => handleNavigate('obras')}
              onNovaMedicao={() => setModal('nova-medicao')}
              onSolicitarCompra={(insumo) => setModal({ type: 'compra', insumo })}
            />
          )}
          {view === 'orcamentos' && <OrcamentosScreen onNovoOrcamento={() => setModal('novo-orcamento')} />}
          {view === 'estimativas' && <EstimativasScreen />}
          {view === 'controle' && <ControleObrasScreen />}
          {view === 'efetivo' && <EfetivoScreen />}
          {view === 'resumo' && <ResumoObrasScreen />}
          {view === 'medicaobanco' && <MedicaoBancoScreen />}
          {view === 'incc' && <INCCScreen />}
          {view === 'cronograma' && <CronogramaFull />}
          {view === 'contratos' && <ContratosScreen />}
          {view !== 'dashboard' && view !== 'obra-detail' && view !== 'obras' &&
           view !== 'orcamentos' && view !== 'estimativas' && view !== 'controle' && view !== 'resumo' && view !== 'incc' &&
           view !== 'cronograma' && view !== 'contratos' && view !== 'medicaobanco' && view !== 'efetivo' && (
            <PlaceholderModule view={view} onOpenObra={handleOpenObra} />
          )}
        </div>
      </div>

      {/* Modals */}
      {modal === 'nova-obra' && <NovaObraModal onClose={() => setModal(null)} />}
      {modal === 'nova-medicao' && <NovaMedicaoModal onClose={() => setModal(null)} />}
      {modal === 'novo-orcamento' && <NovaObraModal onClose={() => setModal(null)} />}
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
        <TweakButton label="Detalhe da Obra A" onClick={() => handleOpenObra(window.AppData.obraAtual)} />
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

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
