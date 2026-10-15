import React from 'react';

// Card congelado sob a topbar, com rolagem interna. É o mesmo padrão da Lista
// (ListaInterativa.jsx) e da Medição Mensal (MedicaoMensal.jsx), que o têm copiado dentro de
// cada tela; esse hook só o isola. As telas antigas não foram migradas.
//
// Por que não `position: sticky`: o card é o último elemento da página e preenche a viewport,
// então o `sticky` nunca chega a prender. Em vez disso: uma sentinela de altura 0 marca onde o
// card começa; a página rola normal até ela chegar em `topbarH + folga`; aí o card vira
// `position: fixed` e um espaçador mantém o lugar dele no fluxo. Como o card tem a altura da
// viewport nos dois estados, depois de preso a página praticamente não tem mais rolagem, e
// quem rola é o corpo do card (o chamador põe `overflow:auto; flex:1; minHeight:0` nele).
//
// Uso (um único <div> envolvente, senão um `gap` do pai conta duas vezes):
//   const { sentinelRef, congelado, topoFixo, alturaCard } = useCardCongelado({ ativo });
//   <div>
//     <div ref={sentinelRef} aria-hidden="true" style={{ height: 0 }} />
//     {congelado && <div aria-hidden="true" style={{ height: alturaCard }} />}
//     <section style={{ height: alturaCard, display: 'flex', flexDirection: 'column',
//       ...(congelado ? { position: 'fixed', top: topoFixo, left: congelado.left, width: congelado.width, zIndex: 5 } : null) }}>
//
// `ativo: false` desliga tudo (ex.: celular): nunca congela e a altura fica `auto`.
export function useCardCongelado({ ativo = true, folga = 10 } = {}) {
  // Altura real da topbar, para congelar exatamente abaixo dela sem corte.
  const [topbarH, setTopbarH] = React.useState(60);
  React.useEffect(() => {
    const medir = () => { const tb = document.querySelector('.topbar'); if (tb) setTopbarH(tb.offsetHeight); };
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, []);

  const topoFixo = topbarH + folga;
  const sentinelRef = React.useRef(null);
  const [congelado, setCongelado] = React.useState(null); // null = fluxo normal; { left, width } = fixo

  React.useEffect(() => {
    if (!ativo) { setCongelado(null); return undefined; }
    let raf = 0;
    const checar = () => {
      raf = 0;
      const s = sentinelRef.current;
      if (!s) return;
      const r = s.getBoundingClientRect();
      // Gatilho na mesma altura em que o card prende (topoFixo), senão ele salta para baixo
      // no instante do congelamento.
      if (r.top <= topoFixo) {
        // Tolerância de 0.5px evita re-render em loop por variação fracionária.
        setCongelado((prev) => ((prev && Math.abs(prev.left - r.left) < 0.5 && Math.abs(prev.width - r.width) < 0.5) ? prev : { left: r.left, width: r.width }));
      } else {
        setCongelado((prev) => (prev ? null : prev));
      }
    };
    const aoRolar = () => { if (!raf) raf = requestAnimationFrame(checar); };
    window.addEventListener('scroll', aoRolar, { passive: true });
    window.addEventListener('resize', aoRolar);
    // Reajusta left/width quando a largura muda sem rolagem: fixar/soltar a sidebar, ou o
    // body travado por um modal (some a barra de rolagem da janela).
    let ro = null;
    if (typeof ResizeObserver !== 'undefined' && sentinelRef.current) {
      ro = new ResizeObserver(aoRolar);
      ro.observe(sentinelRef.current);
    }
    const id = setTimeout(checar, 0);
    return () => {
      window.removeEventListener('scroll', aoRolar);
      window.removeEventListener('resize', aoRolar);
      clearTimeout(id);
      if (raf) cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
    };
  }, [ativo, topoFixo]);

  // Altura fixa nos dois estados: sem ela o documento não tem rolagem suficiente para levar o
  // topo do card até o gatilho de congelamento.
  const alturaCard = ativo ? `calc(100vh - ${topoFixo}px)` : 'auto';
  return { sentinelRef, congelado, topoFixo, alturaCard };
}
