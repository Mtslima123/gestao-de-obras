import React from 'react';

// Curva S (SVG): linhas acumuladas (Linha de Base cinza tracejado, Reprogramado azul,
// Real verde com pontos) + barras mensais opcionais agrupadas (Previsto/Replanejado/
// Executado) com eixo secundário, e o marcador "hoje". Cores da marca (navy).
export const SCurveChart = ({ months = [], reprogramado = [], real = [], baseline = null, monthlyPct = [], todayIdx = -1,
  show = { bl: true, rep: true, real: true }, height = 300,
  previstoM = [], replanM = [], execM = [], showBarras = false, repDashed = false }) => {
  const [hover, setHover] = React.useState(null); // { cx, cy, text, color, kind }
  const N = months.length || 1;
  const pL = 54, pR = showBarras ? 50 : 20, pT = 18, pB = 52;
  const svgW = 1000, svgH = height;
  const chartW = svgW - pL - pR, chartH = svgH - pT - pB;
  const xC = (i) => pL + (chartW / N) * (i + 0.5);
  const yS = (pct) => pT + (1 - pct / 100) * chartH;
  const barW = (chartW / N) * 0.55;
  const ptsOf = (arr) => arr.map((v, i) => v != null ? `${xC(i).toFixed(1)},${yS(v).toFixed(1)}` : null).filter(Boolean).join(' ');
  const firstX = xC(0).toFixed(1), lastX = xC(N - 1).toFixed(1);
  // Área leve sob a linha Real (ou Reprogramado, se Real oculto).
  const areaSrc = (show.real && real.length) ? real : (show.rep ? reprogramado : []);
  const areaPath = areaSrc.length
    ? `M${firstX},${yS(areaSrc[0]).toFixed(1)} ` +
      areaSrc.slice(1).map((v, i) => `L${xC(i + 1).toFixed(1)},${yS(v).toFixed(1)}`).join(' ') +
      ` L${lastX},${(pT + chartH).toFixed(1)} L${firstX},${(pT + chartH).toFixed(1)} Z`
    : '';
  const baselinePts = (show.bl && baseline) ? ptsOf(baseline) : '';
  const repPts  = show.rep  ? ptsOf(reprogramado) : '';
  const realPts = show.real ? ptsOf(real) : '';
  // ── Barras mensais agrupadas (Previsto/Replanejado/Executado) — eixo secundário ──
  const barSeries = [];
  if (showBarras && show.bl && baseline) barSeries.push({ data: previstoM, color: '#cbd5e1', label: '#64748b', name: 'Previsto' });
  if (showBarras && show.rep)            barSeries.push({ data: replanM,  color: 'var(--brand)', label: 'var(--brand)', name: 'Replanejado' });
  if (showBarras && show.real)           barSeries.push({ data: execM,    color: '#16a34a', label: '#16a34a', name: 'Executado' });
  const niceCeil = (v) => {
    if (!(v > 0)) return 1;
    const base = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / base;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * base;
  };
  let barPeak = 0;
  barSeries.forEach(s => (s.data || []).forEach(v => { if (v != null && v > barPeak) barPeak = v; }));
  const barMax = niceCeil(barPeak);
  const yBar = (v) => (pT + chartH) - (v / barMax) * chartH;
  const fmtPct = (v) => v.toFixed(2).replace('.', ',') + '%';
  const groupW = (chartW / N) * 0.6;
  const nb = barSeries.length;
  const subW = nb ? groupW / nb : groupW;
  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} width="100%" height={svgH} style={{ display: 'block', minWidth: Math.max(600, N * (showBarras ? 44 : 36)) }}>
      {[0, 20, 40, 60, 80, 100].map(pct => (
        <g key={pct}>
          <line x1={pL} y1={yS(pct)} x2={pL + chartW} y2={yS(pct)} stroke="var(--border)" strokeWidth="1" strokeDasharray={pct === 0 || pct === 100 ? undefined : '3,4'} />
          <text x={pL - 6} y={yS(pct) + 4} textAnchor="end" fontSize="10" fill="var(--text-muted)" fontFamily="var(--font-mono)">{pct}%</text>
          {showBarras && <text x={pL + chartW + 6} y={yS(pct) + 4} textAnchor="start" fontSize="9" fill="var(--text-muted)" fontFamily="var(--font-mono)">{(barMax * pct / 100).toFixed(1).replace('.', ',')}%</text>}
        </g>
      ))}
      {showBarras
        ? barSeries.map((s, si) => (
            <g key={'bs' + si}>
              {months.map((m, i) => {
                const v = (s.data || [])[i];
                if (v == null || v <= 0.3) return null;
                const x = xC(i) - groupW / 2 + si * subW;
                const y = yBar(v);
                const bw = Math.max(subW * 0.82, 1);
                const cx = x + bw / 2;
                const tip = `${s.name} · ${months[i]?.label || ''}: ${fmtPct(v)}`;
                return (
                  <g key={i}>
                    <rect x={x} y={y} width={bw} height={(pT + chartH) - y} fill={s.color} rx="1"
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setHover({ cx, cy: y, text: tip, color: s.color, kind: 'bar' })}
                      onMouseLeave={() => setHover(null)} />
                    <text transform={`rotate(-90 ${cx.toFixed(1)} ${(y - 3).toFixed(1)})`} x={cx.toFixed(1)} y={(y - 3).toFixed(1)}
                      textAnchor="start" fontSize="6.5" fill={s.label} fontFamily="var(--font-mono)">{fmtPct(v)}</text>
                  </g>
                );
              })}
            </g>
          ))
        : monthlyPct.map((pct, i) => { const bh = (pct / 100) * chartH; return <rect key={i} x={xC(i) - barW / 2} y={yS(0) - bh} width={barW} height={bh} fill="#e2e8f0" rx="2" />; })}
      {showBarras && <text x={pL + chartW + 6} y={pT - 6} textAnchor="start" fontSize="9" fill="var(--text-muted)">% no mês</text>}
      {todayIdx >= 0 && (
        <g pointerEvents="none">
          <line x1={xC(todayIdx)} y1={pT} x2={xC(todayIdx)} y2={pT + chartH} stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4,3" />
          <text x={xC(todayIdx)} y={pT - 5} textAnchor="middle" fontSize="9" fill="#94a3b8">hoje</text>
        </g>
      )}
      <path d={areaPath} fill="var(--brand)" opacity="0.06" pointerEvents="none" />
      {/* Linha de Base — cinza tracejado */}
      {baselinePts && <polyline points={baselinePts} fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="5,4" strokeLinejoin="round" pointerEvents="none" />}
      {/* Reprogramado — azul */}
      {show.rep && <polyline points={repPts} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinejoin="round" strokeDasharray={repDashed ? '6,4' : undefined} pointerEvents="none" />}
      {show.rep && reprogramado.map((v, i) => v == null ? null : (
        <g key={'r' + i}>
          <circle cx={xC(i)} cy={yS(v)} r="3.5" fill="#fff" stroke="var(--brand)" strokeWidth="2" />
          <circle cx={xC(i)} cy={yS(v)} r="10" fill="transparent" style={{ cursor: 'pointer' }}
            onMouseEnter={() => setHover({ cx: xC(i), cy: yS(v), text: (months[i]?.label ? months[i].label + ': ' : '') + fmtPct(v), color: 'var(--brand)', kind: 'dot' })}
            onMouseLeave={() => setHover(null)} />
        </g>
      ))}
      {/* Real — verde */}
      {show.real && <polyline points={realPts} fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinejoin="round" pointerEvents="none" />}
      {show.real && real.map((v, i) => v == null ? null : (
        <g key={'re' + i}>
          <circle cx={xC(i)} cy={yS(v)} r="3.5" fill="#16a34a" />
          <circle cx={xC(i)} cy={yS(v)} r="10" fill="transparent" style={{ cursor: 'pointer' }}
            onMouseEnter={() => setHover({ cx: xC(i), cy: yS(v), text: (months[i]?.label ? months[i].label + ': ' : '') + fmtPct(v), color: '#16a34a', kind: 'dot' })}
            onMouseLeave={() => setHover(null)} />
        </g>
      ))}
      {months.map((m, i) => {
        if (N > 18 && i % 2 !== 0) return null;
        if (N > 30 && i % 3 !== 0) return null;
        return <text key={m.key} x={xC(i)} y={pT + chartH + 18} textAnchor="middle" fontSize="9.5" fill="var(--text-muted)">{m.label}</text>;
      })}
      <line x1={pL} y1={pT + chartH} x2={pL + chartW} y2={pT + chartH} stroke="var(--border)" strokeWidth="1" />
      {/* Tooltip destacado no hover de pontos/colunas — desenhado por último (fica por cima). */}
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
