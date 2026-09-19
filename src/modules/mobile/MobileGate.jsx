import React from 'react';
import { Icon } from '../../components/Icons';
import { moduloLiberado, podeVerAba } from '../../utils/permissions';

// Hub pós-login exibido só no mobile (ver isMobile em App.jsx), antes do shell
// completo (Sidebar+Topbar), oferecendo os 2 fluxos mobile-first (Medição/Fotos)
// ou a entrada no sistema completo (desktop-first, mas usável no celular).
const MobileGate = ({ obras, obrasLoaded, userProfile, onLogout, onEnterFull, onGoMedicao, onGoFotos }) => {
  const [pendingDestino, setPendingDestino] = React.useState(null); // null | 'medicao' | 'fotos'

  const podeMedicao = moduloLiberado(userProfile, 'cronograma') && podeVerAba(userProfile, 'cronograma', 'medicao');
  const podeFotos   = moduloLiberado(userProfile, 'obras')      && podeVerAba(userProfile, 'obras', 'fotos');
  const temObra = obras.length > 0;

  const escolherDestino = (destino) => {
    if (obras.length <= 1) {
      const obra = obras[0];
      if (!obra) return; // sem obra nenhuma — botão já vem desabilitado
      destino === 'medicao' ? onGoMedicao(obra.id) : onGoFotos(obra);
      return;
    }
    setPendingDestino(destino);
  };
  const escolherObra = (obra) => {
    pendingDestino === 'medicao' ? onGoMedicao(obra.id) : onGoFotos(obra);
  };

  if (!obrasLoaded) {
    return (
      <div className="mobile-gate" data-screen-label="00 Mobile Gate">
        <div className="content-loading"><span className="spinner" /></div>
      </div>
    );
  }

  return (
    <div className="mobile-gate" data-screen-label="00 Mobile Gate">
      <div className="mobile-gate-header">
        <div className="mobile-gate-brand">
          <img src="/assets/soter-mark-white.png" alt="" style={{ width: 24, height: 24 }} />
          Soter · Gestão de Obras
        </div>
        <button className="icon-btn" title="Sair" onClick={onLogout}>
          <Icon name="log-out" size={18} />
        </button>
      </div>

      {pendingDestino === null ? (
        <>
          <div className="mobile-gate-title">O que você precisa agora?</div>
          <div className="mobile-gate-sub">Escolha um atalho rápido ou entre no sistema completo.</div>
          <div className="mobile-gate-options">
            <button
              type="button" className="mobile-gate-option primary"
              disabled={!podeMedicao || !temObra}
              title={!podeMedicao ? 'Sem acesso a esta função. Fale com o administrador.' : !temObra ? 'Nenhuma obra disponível.' : undefined}
              onClick={() => escolherDestino('medicao')}
            >
              <span className="mobile-gate-icon"><Icon name="measure" size={20} /></span>
              Medição Mensal
              <Icon name="chevron-right" size={18} className="mobile-gate-option-meta" />
            </button>
            <button
              type="button" className="mobile-gate-option"
              disabled={!podeFotos || !temObra}
              title={!podeFotos ? 'Sem acesso a esta função. Fale com o administrador.' : !temObra ? 'Nenhuma obra disponível.' : undefined}
              onClick={() => escolherDestino('fotos')}
            >
              <span className="mobile-gate-icon"><Icon name="camera" size={20} /></span>
              Fotos
              <Icon name="chevron-right" size={18} className="mobile-gate-option-meta" />
            </button>
            <button type="button" className="mobile-gate-option" onClick={onEnterFull}>
              <span className="mobile-gate-icon"><Icon name="layers" size={20} /></span>
              Acessar sistema completo
              <Icon name="chevron-right" size={18} className="mobile-gate-option-meta" />
            </button>
          </div>
        </>
      ) : (
        <>
          <button type="button" className="btn btn-ghost" style={{ marginBottom: 12, alignSelf: 'flex-start' }} onClick={() => setPendingDestino(null)}>
            <Icon name="chevron-left" size={15} />Voltar
          </button>
          <div className="mobile-gate-title">Escolha a obra</div>
          <div className="mobile-gate-options">
            {obras.map(o => (
              <button key={o.id} type="button" className="mobile-gate-obra-row" onClick={() => escolherObra(o)}>
                {o.nome}
                <Icon name="chevron-right" size={16} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export { MobileGate };
