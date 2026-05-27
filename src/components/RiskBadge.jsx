import React from 'react';

export const RiskBadge = ({ risk }) => {
  const map = {
    baixo: { cls: 'success', label: 'Baixo' },
    medio: { cls: 'warning', label: 'Médio' },
    alto:  { cls: 'danger',  label: 'Alto' },
  };
  const r = map[risk] || map.baixo;
  return <span className={'badge ' + r.cls}><span className="dot"></span>{r.label}</span>;
};
