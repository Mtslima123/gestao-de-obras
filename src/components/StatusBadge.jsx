import React from 'react';

export const StatusBadge = ({ status }) => {
  const map = {
    aprovado:  { cls: 'success', label: 'Aprovado' },
    pendente:  { cls: 'warning', label: 'Em aprovação' },
    rascunho:  { cls: 'neutral', label: 'Rascunho' },
    rejeitado: { cls: 'danger',  label: 'Rejeitado' },
    vigente:   { cls: 'success', label: 'Vigente' },
    encerrado: { cls: 'neutral', label: 'Encerrado' },
  };
  const s = map[status] || map.rascunho;
  return <span className={'badge ' + s.cls}><span className="dot"></span>{s.label}</span>;
};
