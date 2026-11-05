import React from 'react';

// Rótulos curtos para as 5 abas caberem numa linha em 360px (os nomes completos continuam no desktop).
const ROTULOS_CURTOS = { gantt: 'Gantt', lista: 'Lista', uso: 'Uso', curva: 'Curva', medicao: 'Medição' };

// Cabeçalho do Cronograma na casca mobile: a obra num seletor de largura total e as abas em chips. Substitui o
// cabeçalho do desktop (título + seletor + abas lado a lado), que não cabe numa tela de celular. A aba Medição
// Mensal não abre a tela do desktop: abre a Medição do modo foco, que já é feita para o celular.
const CronogramaCabecalhoMobile = ({ obras, obraSel, onObraChange, abas, view, onView, onAbrirMedicao }) => (
  <div className="mfs-crono-topo">
    <select className="input mfs-select" aria-label="Obra" value={obraSel || ''} onChange={(e) => onObraChange(e.target.value)}>
      {!obraSel && <option value="">Selecione uma obra</option>}
      {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
    </select>
    <div className="mfs-abas" role="tablist" aria-label="Abas do cronograma">
      {abas.map(a => {
        const abreMedicao = a.id === 'medicao' && !!onAbrirMedicao;
        return (
          <button
            key={a.id} type="button" role="tab"
            aria-selected={view === a.id}
            aria-disabled={a.locked || undefined}
            title={a.locked ? 'Sem acesso a esta aba. Fale com o administrador.' : abreMedicao ? 'Abre a Medição Mensal em tela cheia' : undefined}
            className={'mfs-aba' + (view === a.id ? ' active' : '') + (a.locked ? ' locked' : '')}
            onClick={a.locked ? undefined : () => (abreMedicao ? onAbrirMedicao() : onView(a.id))}
          >{ROTULOS_CURTOS[a.id] || a.label}</button>
        );
      })}
    </div>
  </div>
);

export { CronogramaCabecalhoMobile };
