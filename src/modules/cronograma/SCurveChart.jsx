import React from 'react';

// Curva S (SVG): linhas acumuladas (Linha de Base cinza tracejado, Reprogramado azul,
// Real verde com pontos) + barras mensais opcionais agrupadas (Previsto/Replanejado/
// Executado) com eixo secundário, e o marcador "hoje". Cores da marca (navy).
export const SCurveChart = ({ months = [], reprogramado = [], real = [], baseline = null, monthlyPct = [], todayIdx = -1,
  show = { bl: true, rep: true, real: true }, height = 300,
  previstoM = [], replanM = [], execM = [], showBarras = false, showLines = true, repDashed = false }) => {
  const [hover, setHover] = React.useState(null); // { cx, cy, text, color, kind } | { cx, lines, kind: 'mes' }
  const N = months.length || 1;
  // Largura real do card (px). Antes o viewBox era fixo em 1000 e, com altura fixa, o
  // desenho ficava preso nesses 1000px no meio do card: com ~36 meses sobravam ~5px por
  // barra e as colunas/rótulos embolavam. Agora viewBox = tamanho em px (nada esticado).
  const wrapRef = React.useRef(null);
  const [wrapW, setWrapW] = React.useState(1000);
  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (w > 0) setWrapW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pL = 54, pR = showBarras ? 50 : 20, pT = 18, pB = 52;
  const svgH = height;
  // ── Barras mensais agrupadas (Previsto/Replanejado/Executado) — eixo secundário ──
  const barSeries = [];
  // Barras em tons mais claros que as linhas (mesma família de cor), para não se confundirem
  // com a linha Reprogramado (azul) e a linha Real (verde). Só entram no grupo as séries que
  // têm valores — assim as colunas se ajeitam sem deixar vão de uma série vazia/oculta.
  const hasVals = (arr) => (arr || []).some(v => v != null && v > 0.3);
  if (showBarras && show.bl && baseline && hasVals(previstoM)) barSeries.push({ data: previstoM, color: '#cbd5e1', label: '#64748b', name: 'Previsto' });
  if (showBarras && show.rep && hasVals(replanM))              barSeries.push({ data: replanM,  color: '#9bb8e0', label: 'var(--brand)', name: 'Replanejado' });
  if (showBarras && show.real && hasVals(execM))               barSeries.push({ data: execM,    color: '#74c99a', label: '#15803d', name: 'Real' });
  const nb = barSeries.length;
  // Piso de largura por mês: com barras, cada barra precisa de ~11px pro % girado (fonte
  // 8,5) não encostar no rótulo da vizinha — o grupo ocupa 72% do mês, daí o /0.72. Os
  // rótulos ficam sempre visíveis; se a obra tiver meses demais pro card, rola na horizontal.
  // 40px no mínimo mesmo sem barras: é o que cabe o nome do mês ("Set/24") sem encostar.
  const minPorMes = nb ? Math.max(44, Math.ceil((nb * 11) / 0.72)) : 40;
  const svgW = Math.max(wrapW, 600, N * minPorMes);
  const chartW = svgW - pL - pR, chartH = svgH - pT - pB;
  const xC = (i) => pL + (chartW / N) * (i + 0.5);
  const yS = (pct) => pT + (1 - pct / 100) * chartH;
  const ptsOf = (arr) => arr.map((v, i) => v != null ? `${xC(i).toFixed(1)},${yS(v).toFixed(1)}` : null).filter(Boolean).join(' ');
  const baselinePts = (showLines && show.bl && baseline) ? ptsOf(baseline) : '';
  const repPts  = (showLines && show.rep)  ? ptsOf(reprogramado) : '';
  const realPts = (showLines && show.real) ? ptsOf(real) : '';
  const niceCeil = (v) => {
    if (!(v > 0)) return 1;
    const base = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / base; // 1..10
    const step = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(s => n <= s + 1e-9) ?? 10;
    return step * base;
  };
  let barPeak = 0;
  barSeries.forEach(s => (s.data || []).forEach(v => { if (v != null && v > barPeak) barPeak = v; }));
  const barMax = niceCeil(barPeak * 1.08); // topo justo ao pico, com folga para o rótulo
  const yBar = (v) => (pT + chartH) - (v / barMax) * chartH;
  const fmtPct = (v) => v.toFixed(2).replace('.', ',') + '%';
  const groupW = (chartW / N) * 0.72;
  const subW = nb ? groupW / nb : groupW;
  // 1px de respiro entre as barras do mesmo mês — coladas, viravam um bloco só.
  const bw = Math.max(subW - 1, 1);
  // Tooltip do mês inteiro: todas as séries de barra daquele mês num balão só.
  const linhasDoMes = (i) => barSeries
    .map(s => ({ v: (s.data || [])[i], s }))
    .filter(({ v }) => v != null && v > 0)
    .map(({ v, s }) => ({ text: `${s.name}: ${fmtPct(v)}`, color: s.color }));
  return (
    <div ref={wrapRef} style={{ width: '100%' }}>
    <svg viewBox={`0 0 ${svgW} ${svgH}`} width={svgW} height={svgH} style={{ display: 'block' }}>
      {[0, 20, 40, 60, 80, 100].map(pct => (
        <g key={pct}>
          <line x1={pL} y1={yS(pct)} x2={pL + chartW} y2={yS(pct)} stroke="var(--border)" strokeWidth="1" strokeDasharray={pct === 0 || pct === 100 ? undefined : '3,4'} />
          <text x={pL - 6} y={yS(pct) + 4} textAnchor="end" fontSize="10" fill="var(--text-muted)" fontFamily="var(--font-mono)">{pct}%</text>
          {showBarras && <text x={pL + chartW + 6} y={yS(pct) + 4} textAnchor="start" fontSize="9" fill="var(--text-muted)" fontFamily="var(--font-mono)">{(barMax * pct / 100).toFixed(1).replace('.', ',')}%</text>}
        </g>
      ))}
      {/* Área invisível de cada mês, atrás das barras/pontos (que têm tooltip próprio):
          passar o mouse no mês mostra todas as séries de barra dele de uma vez. */}
      {showBarras && nb > 0 && months.map((m, i) => {
        const linhas = linhasDoMes(i);
        if (!linhas.length) return null;
        return (
          <rect key={'hm' + i} x={pL + (chartW / N) * i} y={pT} width={chartW / N} height={chartH} fill="transparent"
            onMouseEnter={() => setHover({ cx: xC(i), lines: [{ text: m.label || '' }, ...linhas], kind: 'mes' })}
            onMouseLeave={() => setHover(null)} />
        );
      })}
      {/* Barras: só os retângulos aqui — os rótulos de % ficam num passe à parte, desenhado
          DEPOIS das linhas/pontos (mais abaixo), pra ficarem sempre por cima e legíveis em
          vez de passarem por baixo do traço quando a linha cruza a barra. */}
      {showBarras && barSeries.map((s, si) => (
            <g key={'bs' + si}>
              {months.map((m, i) => {
                const v = (s.data || [])[i];
                if (v == null || v <= 0) return null;
                const x = xC(i) - groupW / 2 + si * subW;
                // % muito pequeno (ex.: resíduo do último mês) rende uma barra quase
                // invisível — mantém uma lasca mínima (2px) pra sempre dar pra ver que
                // existe algo ali, com o rótulo do % de qualquer jeito.
                const y = Math.min(yBar(v), (pT + chartH) - 2);
                const cx = x + bw / 2;
                const tip = `${s.name} · ${months[i]?.label || ''}: ${fmtPct(v)}`;
                return (
                  <rect key={i} x={x} y={y} width={bw} height={(pT + chartH) - y} fill={s.color} rx="1"
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHover({ cx, cy: y, text: tip, color: s.color, kind: 'bar' })}
                    onMouseLeave={() => setHover(null)} />
                );
              })}
            </g>
          ))}
      {showBarras && <text x={pL + chartW + 6} y={pT - 6} textAnchor="start" fontSize="9" fill="var(--text-muted)">% no mês</text>}
      {/* Reprogramado — azul */}
      {show.rep && <polyline points={repPts} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinejoin="round" strokeDasharray={repDashed ? '6,4' : undefined} pointerEvents="none" />}
      {showLines && show.rep && reprogramado.map((v, i) => v == null ? null : (
        <g key={'r' + i}>
          <circle cx={xC(i)} cy={yS(v)} r="3.5" fill="#fff" stroke="var(--brand)" strokeWidth="2" />
          <circle cx={xC(i)} cy={yS(v)} r="10" fill="transparent" style={{ cursor: 'pointer' }}
            onMouseEnter={() => setHover({ cx: xC(i), cy: yS(v), text: (months[i]?.label ? months[i].label + ': ' : '') + fmtPct(v), color: 'var(--brand)', kind: 'dot' })}
            onMouseLeave={() => setHover(null)} />
        </g>
      ))}
      {/* Linha de Base — cinza tracejado (por cima da Reprogramado para não ficar escondida quando coincidem) */}
      {baselinePts && <polyline points={baselinePts} fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="5,4" strokeLinejoin="round" pointerEvents="none" />}
      {/* Real — verde */}
      {show.real && <polyline points={realPts} fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinejoin="round" pointerEvents="none" />}
      {showLines && show.real && real.map((v, i) => v == null ? null : (
        <g key={'re' + i}>
          <circle cx={xC(i)} cy={yS(v)} r="3.5" fill="#16a34a" />
          <circle cx={xC(i)} cy={yS(v)} r="10" fill="transparent" style={{ cursor: 'pointer' }}
            onMouseEnter={() => setHover({ cx: xC(i), cy: yS(v), text: (months[i]?.label ? months[i].label + ': ' : '') + fmtPct(v), color: '#16a34a', kind: 'dot' })}
            onMouseLeave={() => setHover(null)} />
        </g>
      ))}
      {/* Rótulos de % das barras — por cima das linhas/pontos (ver comentário acima, junto
          dos <rect>), pra não ficarem ilegíveis quando uma linha passa sobre a barra. */}
      {showBarras && barSeries.map((s, si) => (
        <g key={'bl' + si} pointerEvents="none">
          {months.map((m, i) => {
            const v = (s.data || [])[i];
            if (v == null || v <= 0) return null;
            const x = xC(i) - groupW / 2 + si * subW;
            const y = Math.min(yBar(v), (pT + chartH) - 2);
            const cx = x + bw / 2;
            return (
              <text key={i} transform={`rotate(-90 ${cx.toFixed(1)} ${(y - 3).toFixed(1)})`} x={cx.toFixed(1)} y={(y - 3).toFixed(1)}
                textAnchor="start" fontSize="8.5" fontWeight="600" fill={s.label} fontFamily="var(--font-mono)">{fmtPct(v)}</text>
            );
          })}
        </g>
      ))}
      {/* Todo mês rotulado — o piso de largura por mês (minPorMes) garante espaço pro "Set/24". */}
      {months.map((m, i) => {
        return <text key={m.key} x={xC(i)} y={pT + chartH + 18} textAnchor="middle" fontSize="9.5" fill="var(--text-muted)">{m.label}</text>;
      })}
      <line x1={pL} y1={pT + chartH} x2={pL + chartW} y2={pT + chartH} stroke="var(--border)" strokeWidth="1" />
      {/* Tooltip do mês (várias linhas, uma por série) — desenhado por último, por cima. */}
      {hover?.lines && (() => {
        const lh = 15;
        const w = Math.max(60, Math.max(...hover.lines.map(l => l.text.length)) * 6.6 + 30);
        const h = hover.lines.length * lh + 8;
        const bx = Math.max(pL, Math.min(hover.cx - w / 2, pL + chartW - w));
        const by = pT;
        return (
          <g pointerEvents="none">
            <rect x={bx} y={by} width={w} height={h} rx="4" fill="#0f172a" opacity="0.94" />
            {hover.lines.map((l, k) => (
              <g key={k}>
                {k > 0 && <rect x={bx + 8} y={by + 4 + lh * k + 3} width="8" height="8" rx="1.5" fill={l.color} />}
                <text x={bx + (k > 0 ? 22 : 8)} y={by + 4 + lh * (k + 1) - 4} fontSize="11" fontWeight={k === 0 ? 700 : 600}
                  fill="#fff" fontFamily="var(--font-mono)">{l.text}</text>
              </g>
            ))}
          </g>
        );
      })()}
      {/* Tooltip destacado no hover de pontos/colunas — desenhado por último (fica por cima). */}
      {hover && !hover.lines && (() => {
        const w = Math.max(44, hover.text.length * 6.2 + 16);
        const h = 20;
        const bx = Math.max(pL, Math.min(hover.cx - w / 2, pL + chartW - w));
        const by = Math.max(pT, hover.cy - h - 10);
        return (
          <g pointerEvents="none">
            {hover.kind === 'dot' && <circle cx={hover.cx} cy={hover.cy} r="5.5" fill="none" stroke={hover.color} strokeWidth="2" />}
            <rect x={bx} y={by} width={w} height={h} rx="4" fill="#0f172a" opacity="0.94" />
            <text x={bx + w / 2} y={by + h / 2 + 3.6} textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff" fontFamily="var(--font-mono)">{hover.text}</text>
          </g>
        );
      })()}
    </svg>
    </div>
  );
};
