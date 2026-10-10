import React from 'react';

// Ao digitar uma data o navegador dispara valores intermediários (ano "0020"...). Só vale data
// completa entre 2000 e 2100; senão a tela calcularia milhares de meses.
export const dataOk = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && +v.slice(0, 4) >= 2000 && +v.slice(0, 4) <= 2100;

// Campo de data com rascunho local: mostra o que a pessoa digita e só confirma (onConfirmar)
// quando a data está completa e válida; ao sair do campo volta ao último valor confirmado.
export function CampoData({ value, onConfirmar, ...resto }) {
  const [rascunho, setRascunho] = React.useState(value ?? '');
  React.useEffect(() => { setRascunho(value ?? ''); }, [value]);
  return (
    <input type="date" value={rascunho}
      onChange={(e) => { setRascunho(e.target.value); if (dataOk(e.target.value)) onConfirmar(e.target.value); }}
      onBlur={() => setRascunho(value ?? '')}
      {...resto} />
  );
}
