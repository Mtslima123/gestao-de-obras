import React from 'react';

// Campo de quantidade: ao entrar num campo com 0, ele aparece vazio, para o que a pessoa digita
// não virar "05" ou "50". Se sair sem digitar nada, o 0 continua valendo (nada é alterado).
export function CampoQtd({ value, onFocus, onBlur, ...resto }) {
  const [foco, setFoco] = React.useState(false);
  return (
    <input type="number" {...resto} value={foco && value === 0 ? '' : (value ?? '')}
      onFocus={(e) => { setFoco(true); onFocus?.(e); }}
      onBlur={(e) => { setFoco(false); onBlur?.(e); }} />
  );
}
