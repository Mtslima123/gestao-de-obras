import React from 'react';

// Curva S "faseada" (Curva 2): até o mês de referência (selIdx) mostra o Executado (realizado);
// depois, a Linha de Base e o restante Replanejado. A linha acumulada é verde até o corte e
// continua azul (replanejado) a partir do ponto verde. Eixo esquerdo 0–100% (linhas), eixo
// secundário à direita para as barras mensais.
export const SCurveChart2 = ({ months = [], selIdx = 0,
  previstoM = [], execM = [], replanM = [],
  baselineA = null, execA = [], replanA = [],
  show = { bl: true, rep: true, real: true }, showBarras = true, showLines = true, height = 300 }) => {
  const [hover, setHover] = React.useState(null);
  const N = months.length || 1;
  const cut = Math.max(0, Math.min(selIdx, N - 1));
  const pL = 54, pR = showBarras ? 50 : 20, pT = 18, pB = 52;
  const svgW = 1000, svgH = height;
  const chartW = svgW - pL - pR, chartH = svgH - pT - pB;
  const xC = (i) => pL + (chartW / N) * (i + 0.5);
  const yS = (pct) => pT + (1 - pct / 100) * chartH;
  const fmtPct = (v) => v.toFixed(2).replace('.', ',') + '%';
  const ptsOf = (arr) => arr.map((v, i) => v != null ? `${xC(i).toFixed(1)},${yS(v).toFixed(1)}` : null).filter(Boolean).join(' ');

  // ── Escala secundária das barras (mesmo padrão do SCurveChart) ──
  // Executado (verde, até o corte) e Replanejado (azul, depois) nunca coexistem no mesmo mês,
  // então ocupam a MESMA coluna (cor por barra). Assim ficam só 2 barras por mês (Previsto +
  // período), sem o vão de uma 3ª coluna.
  const barSeries = [];
  if (showBarras && show.bl) barSeries.push({ key: 'prev', color: '#cbd5e1', label: '#64748b', name: 'Previsto',
    data: months.map((m, i) => i > cut ? previstoM[i] : null) });
  if (showBarras && (show.real || show.rep)) barSeries.push({ key: 'per', perColor: true,
    data: months.map((m, i) => i <= cut ? (show.real ? execM[i] : null) : (show.rep ? replanM[i] : null)) });
  // Barras em eixo secundário (valores mensais); linhas ficam no eixo esquerdo 0–100% (acumulado).
  const niceCeil = (v) => {
    if (!(v > 0)) return 1;
    const base = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / base;
    const step = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(s => n <= s + 1e-9) ?? 10;
    return step * base;
  };
  let barPeak = 0;
  barSeries.forEach(s => (s.data || []).forEach(v => { if (v != null && v > barPeak) barPeak = v; }));
  const barMax = niceCeil(barPeak * 1.08);
  const yBar = (v) => (pT + chartH) - (v / barMax) * chartH;
  const groupW = (chartW / N) * 0.6;
  const nb = barSeries.length;
  const subW = nb ? groupW / nb : groupW;

  // ── Linhas acumuladas ──
  const baselinePts = (showLines && show.bl && baselineA) ? ptsOf(baselineA) : '';
  const execPts     = (showLines && show.real) ? ptsOf(months.map((m, i) => i <= cut ? execA[i] : null)) : '';
  const replanPts   = (showLines && show.rep)  ? ptsOf(months.map((m, i) => i >= cut ? replanA[i] : null)) : '';

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} width="100%" height={svgH} style={{ display: 'block', minWidth: Math.max(600, N * (showBarras ? 44 : 36)) }}>
      {[0, 20, 40, 60, 80, 100].map(pct => (
        <g key={pct}>
          <line x1={pL} y1={yS(pct)} x2={pL + chartW} y2={yS(pct)} stroke="var(--border)" strokeWidth="1" strokeDasharray={pct === 0 || pct === 100 ? undefined : '3,4'} />
          <text x={pL - 6} y={yS(pct) + 4} textAnchor="end" fontSize="10" fill="var(--text-muted)" fontFamily="var(--font-mono)">{pct}%</text>
          {showBarras && <text x={pL + chartW + 6} y={yS(pct) + 4} textAnchor="start" fontSize="9" fill="var(--text-muted)" fontFamily="var(--font-mono)">{(barMax * pct / 100).toFixed(1).replace('.', ',')}%</text>}
        </g>
      ))}
      {showBarras && barSeries.map((s, si) => (
        <g key={'bs' + s.key}>
          {months.map((m, i) => {
            const v = (s.data || [])[i];
            if (v == null || v <= 0.3) return null;
            // Série "período": cor por barra (verde até o corte, azul depois).
            const isExec = i <= cut;
            const fill    = s.perColor ? (isExec ? '#74c99a' : '#9bb8e0') : s.color;
            const lblCol  = s.perColor ? (isExec ? '#15803d' : 'var(--brand)') : s.label;
            const nm      = s.perColor ? (isExec ? 'Executado' : 'Replanejado') : s.name;
            const x = xC(i) - groupW / 2 + si * subW;
            const y = yBar(v);
            const bw = Math.max(subW * 0.82, 1);
            const cx = x + bw / 2;
            const tip = `${nm} · ${months[i]?.label || ''}: ${fmtPct(v)}`;
            return (
              <g key={i}>
                <rect x={x} y={y} width={bw} height={(pT + chartH) - y} fill={fill} rx="1"
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHover({ cx, cy: y, text: tip, color: fill, kind: 'bar' })}
                  onMouseLeave={() => setHover(null)} />
                <text transform={`rotate(-90 ${cx.toFixed(1)} ${(y - 3).toFixed(1)})`} x={cx.toFixed(1)} y={(y - 3).toFixed(1)}
                  textAnchor="start" fontSize="6.5" fill={lblCol} fontFamily="var(--font-mono)">{fmtPct(v)}</text>
              </g>
            );
          })}
        </g>
      ))}
      {showBarras && <text x={pL + chartW + 6} y={pT - 6} textAnchor="start" fontSize="9" fill="var(--text-muted)">% no mês</text>}
      {/* Linha de Base — cinza tracejado */}
      {baselinePts && <polyline points={baselinePts} fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="5,4" strokeLinejoin="round" pointerEvents="none" />}
      {/* Replanejado acumulado — azul da marca (do corte em diante) */}
      {replanPts && <polyline points={replanPts} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinejoin="round" pointerEvents="none" />}
      {showLines && show.rep && replanA.map((v, i) => (i < cut || v == null) ? null : (
        <g key={'rp' + i}>
          <circle cx={xC(i)} cy={yS(v)} r="3.5" fill="#fff" stroke="var(--brand)" strokeWidth="2" />
          <circle cx={xC(i)} cy={yS(v)} r="10" fill="transparent" style={{ cursor: 'pointer' }}
            onMouseEnter={() => setHover({ cx: xC(i), cy: yS(v), text: 'Replanejado · ' + (months[i]?.label ? months[i].label + ': ' : '') + fmtPct(v), color: 'var(--brand)', kind: 'dot' })}
            onMouseLeave={() => setHover(null)} />
        </g>
      ))}
      {/* Executado acumulado — verde (até o corte) */}
      {execPts && <polyline points={execPts} fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinejoin="round" pointerEvents="none" />}
      {showLines && show.real && execA.map((v, i) => (i > cut || v == null) ? null : (
        <g key={'ex' + i}>
          <circle cx={xC(i)} cy={yS(v)} r="3.5" fill="#16a34a" />
          <circle cx={xC(i)} cy={yS(v)} r="10" fill="transparent" style={{ cursor: 'pointer' }}
            onMouseEnter={() => setHover({ cx: xC(i), cy: yS(v), text: 'Executado · ' + (months[i]?.label ? months[i].label + ': ' : '') + fmtPct(v), color: '#16a34a', kind: 'dot' })}
            onMouseLeave={() => setHover(null)} />
        </g>
      ))}
      {months.map((m, i) => {
        if (N > 18 && i % 2 !== 0) return null;
        if (N > 30 && i % 3 !== 0) return null;
        return <text key={m.key} x={xC(i)} y={pT + chartH + 18} textAnchor="middle" fontSize="9.5" fill="var(--text-muted)">{m.label}</text>;
      })}
      <line x1={pL} y1={pT + chartH} x2={pL + chartW} y2={pT + chartH} stroke="var(--border)" strokeWidth="1" />
      {hover && (() => {
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
  );
};
