import React from 'react';

const fmtTxt = (v) => (v == null ? '' : String(v).replace('.', ','));

// Campo de quantidade: ao entrar num campo com 0, ele aparece vazio, para o que a pessoa digita
// não virar "05" ou "50". Se sair sem digitar nada, o 0 continua valendo (nada é alterado).
//
// `decimal`: aceita número quebrado (2,5), com vírgula ou ponto. É um campo de texto
// (inputMode decimal, teclado numérico no celular) que guarda o que a pessoa está digitando
// enquanto tem o foco ("2," não vira "2" no meio da digitação). O onChange recebe um objeto
// { target: { value } } com o texto já com ponto; quem recebe converte com lerQtd.
export function CampoQtd({ value, onFocus, onBlur, onChange, decimal = false, ...resto }) {
  const [foco, setFoco] = React.useState(false);
  const [txt, setTxt] = React.useState('');

  if (!decimal) {
    return (
      <input type="number" {...resto} value={foco && value === 0 ? '' : (value ?? '')} onChange={onChange}
        onFocus={(e) => { setFoco(true); onFocus?.(e); }}
        onBlur={(e) => { setFoco(false); onBlur?.(e); }} />
    );
  }

  const { min, ...demais } = resto; // eslint-disable-line no-unused-vars
  return (
    <input type="text" inputMode="decimal" autoComplete="off" {...demais} value={foco ? txt : fmtTxt(value)}
      onFocus={(e) => { setTxt(value ? fmtTxt(value) : ''); setFoco(true); onFocus?.(e); }}
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d.,]/g, '');
        if (t.split(/[.,]/).length > 2) return; // só um separador decimal
        setTxt(t);
        onChange?.({ target: { value: t.replace(',', '.') } });
      }}
      onBlur={(e) => { setFoco(false); onBlur?.(e); }} />
  );
}
