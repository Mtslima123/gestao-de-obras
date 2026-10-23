import React from 'react';
import { aceitarDigitacaoPerc, percParaCampo, concluirEdicaoPerc } from './medicaoMensalPure';

// Campo "% medido" da Medição Mensal. Guarda o texto digitado em estado local e só converte e
// registra o valor FINAL ao sair do campo ou no Enter. Antes cada tecla era convertida na
// hora e o separador decimal sumia ("5,5" virava 55, "33,3" virava 100) — BUG-009. As regras
// estão em medicaoMensalPure.js (aceitarDigitacaoPerc, concluirEdicaoPerc), com teste.
//
// `valor`: % atual (número 0-100). `onCommit(valor)`: chamado uma vez com o número final.
// O restante das props (className, style, disabled, aria-label...) vai direto ao <input>.
export default function InputPercMedido({ valor, onCommit, onKeyDown, ...resto }) {
  const [texto, setTexto] = React.useState(null); // null = não está editando
  // Ref além do estado: Enter conclui e em seguida move o foco, o que dispara o blur na MESMA
  // renderização (o estado ainda estaria velho e registraria duas vezes).
  const textoRef = React.useRef(null);
  const inicialRef = React.useRef('');

  const iniciar = () => {
    inicialRef.current = percParaCampo(valor);
    textoRef.current = inicialRef.current;
    setTexto(inicialRef.current);
  };
  const concluir = () => {
    const t = textoRef.current;
    if (t === null) return;
    textoRef.current = null;
    setTexto(null);
    const r = concluirEdicaoPerc(t, inicialRef.current);
    if (r.registrar) onCommit(r.valor);
  };

  return (
    <input
      {...resto}
      inputMode="decimal"
      value={texto ?? percParaCampo(valor)}
      onFocus={iniciar}
      onChange={(e) => {
        if (textoRef.current === null) iniciar(); // alteração sem foco prévio (leitor de tela, autofill)
        const aceito = aceitarDigitacaoPerc(e.target.value, textoRef.current);
        textoRef.current = aceito;
        setTexto(aceito);
      }}
      onBlur={concluir}
      onKeyDown={(e) => {
        if (e.key === 'Enter') concluir();
        onKeyDown?.(e);
      }}
    />
  );
}
