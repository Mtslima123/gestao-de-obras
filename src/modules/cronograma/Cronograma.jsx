import React from 'react';
import { Icon } from '../../components/Icons';
import { AppData } from '../../utils/data';
import { supabase } from '../../services/supabase';
import { FluxoExecutivo } from './FluxoExecutivo';
import { useToast } from '../../components/Modals';
import { vinculoService, itemValor } from '../financeiro/vinculoService';
import { computeValorVinculadoMap } from './ganttUtils';
import { podeVerAba, moduloSomenteLeitura, isAdmin } from '../../utils/permissions';
import { offsetToDate, offsetToISO, isoToBR, setWorkCal, taskEnd } from './cronogramaDateUtils';
import {
  migrateEtapas, fmtBRL, computeAllWBS, effStatus, autoScheduleFromDeps,
  getMonthRange, computeMonthlyDist, computeRealizedDist, getGroupMonthlyDist,
  computeGroupValues,
} from './scheduleEngine';
import {
  CriarLinhaModal, GerenciarLinhasModal, FeriadosModal,
  CriarReprogramacaoModal, GerenciarReprogramacoesModal,
} from './cronogramaModais';
import { GM_TOTAL, gmConflicts } from './cronogramaShared';
import { GanttInterativo } from './GanttInterativo';
import { ListaInterativa } from './ListaInterativa';
import { AnexosTab, HistoricoTab } from './TaskDetailTabs';
import { taskDetailStore } from './taskDetailStore';
import { usuariosService } from '../admin/usuarios.service';

// cronograma.jsx — Gantt interativo com drag & drop, undo/redo, tooltips e validação de dependências

// ─── Constantes de layout + helpers de timeline ──────────────────────────────
// Movidos para ./cronogramaShared (GM_*, GROUP_PALETTE, GM_MONTHS/QUARTERS,
// gmCalcToday, gmMonthLabel, gmConflicts). Importados no topo.

// ─── Utilitários de data + calendário de trabalho ────────────────────────────
// Movidos para ./cronogramaDateUtils (offsetToDate, offsetToISO, isoToBR,
// dateToOffset, setWorkCal, workEnd, workDur, taskEnd). Importados no topo.

// ─── Funções puras (dados / hierarquia / agenda / distribuição / formatação) ──
// Movidas para ./scheduleEngine (movimento verbatim). Importadas no topo.

// ─── GanttInterativo ─────────────────────────────────────────────────────────
// Barras coloridas por STATUS (done/exec/late/upcoming), grupos em ardósia.
// ─── GanttInterativo ─────────────────────────────────────────────────────────
// Movido para ./GanttInterativo (movimento verbatim). Importado no topo.

// ─── EditableCell ─────────────────────────────────────────────────────────────
// Movido para ./cronogramaShared.

// ─── Modais da grade (AddCol / RowHeight / Pavimentos) ───────────────────────
// Movidos para ./cronogramaModais.

// ─── Defs de colunas + paleta de cores + ColorMenu ───────────────────────────
// Movidos para ./cronogramaShared.

// ─── ListaInterativa ──────────────────────────────────────────────────────────
// ─── ListaInterativa ──────────────────────────────────────────────────────────
// Movido para ./ListaInterativa (movimento verbatim). Importado no topo.

// ─── UsoTarefaView ───────────────────────────────────────────────────────────
const USO_COL_KEYS    = ['id', 'wbs', 'nome', 'inicio', 'fim', 'dur', 'avanco'];
const USO_COL_LABELS  = ['ID', 'EAP', 'Nome da Tarefa', 'Início', 'Término', 'Dur.', '%'];
const USO_COL_DEFAULT = { id: 44, wbs: 52, nome: 208, inicio: 88, fim: 88, dur: 56, avanco: 52 };
const USO_COL_ALIGN   = { id: 'right', wbs: 'left', nome: 'left', inicio: 'left', fim: 'left', dur: 'right', avanco: 'right' };

const UsoTarefaView = ({ etapas, months, monthlyDist, obraId, valorVinculadoMap = {} }) => {
  const [selectedId, setSelectedId] = React.useState(null);
  const leftRef  = React.useRef(null);
  const rightRef = React.useRef(null);
  const syncing  = React.useRef(false);

  // Larguras de colunas do painel esquerdo persistidas por obra
  const [usoColW, setUsoColW] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem(`uso_widths_${obraId}`) || 'null') || {}; }
    catch { return {}; }
  });
  React.useEffect(() => {
    if (obraId) localStorage.setItem(`uso_widths_${obraId}`, JSON.stringify(usoColW));
  }, [usoColW, obraId]);
  const getUsoW = (col) => usoColW[col] ?? USO_COL_DEFAULT[col] ?? 80;
  const usoRef  = React.useRef(null);
  const [exportingPDF, setExportingPDF] = React.useState(false);

  const startUsoResize = (ev, col) => {
    ev.preventDefault(); ev.stopPropagation();
    const startX = ev.clientX, startW = getUsoW(col);
    const onMove = (e2) => setUsoColW(prev => ({ ...prev, [col]: Math.max(40, startW + e2.clientX - startX) }));
    const onUp   = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  React.useEffect(() => {
    const L = leftRef.current, R = rightRef.current;
    if (!L || !R) return;
    const sl = () => { if (!syncing.current) { syncing.current = true; R.scrollTop = L.scrollTop; syncing.current = false; } };
    const sr = () => { if (!syncing.current) { syncing.current = true; L.scrollTop = R.scrollTop; syncing.current = false; } };
    L.addEventListener('scroll', sl);
    R.addEventListener('scroll', sr);
    return () => { L.removeEventListener('scroll', sl); R.removeEventListener('scroll', sr); };
  }, []);

  // UsoTarefaView mostra todas as tarefas independente de collapsed na Lista
  const visible = etapas;
  const wbsMap  = React.useMemo(() => computeAllWBS(etapas), [etapas]);

  // Distribuição sempre por custo previsto (valor vinculado ao orçamento quando houver).
  const hasVinculos = Object.keys(valorVinculadoMap).length > 0;
  const cfg = {
    val: (e) => hasVinculos ? (valorVinculadoMap[e.id] || 0) : (e.custo || 0),
    cell: (v) => v < 1 ? '—' : 'R$ ' + Math.round(v / 1000) + 'k',
    tot: (v) => fmtBRL(v),
  };
  const metricOverride = React.useMemo(() => {
    const o = {}; etapas.forEach(e => { if (!e.isGroup) o[e.id] = cfg.val(e); }); return o;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etapas, valorVinculadoMap]);
  const dist2 = React.useMemo(() => computeMonthlyDist(etapas, metricOverride), [etapas, metricOverride]);
  const cellMax = React.useMemo(() => {
    let mx = 0;
    etapas.forEach(e => { if (!e.isGroup) { const d = dist2[e.id] || {}; months.forEach(m => { const v = d[m.key] || 0; if (v > mx) mx = v; }); } });
    return mx || 1;
  }, [dist2, etapas, months]);

  const getDist = (e) =>
    e.isGroup
      ? getGroupMonthlyDist(e.id, etapas, dist2)
      : (dist2[e.id] || {});

  const rowBg = (e) =>
    selectedId === e.id
      ? 'color-mix(in srgb, var(--brand) 8%, transparent)'
      : e.isGroup ? 'var(--brand-50)' : undefined;

  const thSt = {
    position: 'sticky', top: 0, zIndex: 2,
    background: 'var(--surface)',
    borderBottom: '2px solid var(--border)',
    padding: '0 10px',
    height: 36,
    fontSize: 10.5,
    fontWeight: 600,
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    color: 'var(--text-soft)',
    whiteSpace: 'nowrap',
    userSelect: 'none',
  };
  const tdSt = {
    padding: '0 10px',
    height: 36,
    fontSize: 13,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    borderBottom: '1px solid var(--border-subtle, rgba(0,0,0,0.06))',
    verticalAlign: 'middle',
    maxWidth: 0,
  };

  const exportExcelUso = () => {
    import('xlsx').then(XLSX => {
      const wb   = XLSX.utils.book_new();
      const hdrs = [...USO_COL_LABELS, ...months.map(m => m.label), 'Total'];
      const rows = [hdrs, ...etapas.map(e => {
        const dist  = getDist(e);
        const total = Object.values(dist).reduce((s, v) => s + v, 0);
        return [
          e.displayId ?? e.id,
          wbsMap[e.id] || '',
          '  '.repeat(e.nivel || 0) + e.etapa,
          offsetToDate(e.inicio),
          offsetToDate(e.inicio + e.dur),
          e.dur,
          e.avanco / 100,
          e.isGroup ? '' : (e.custo || 0),
          ...months.map(m => dist[m.key] || 0),
          total,
        ];
      })];
      const ws  = XLSX.utils.aoa_to_sheet(rows, { dateNF: 'DD/MM/YYYY' });
      const rng = XLSX.utils.decode_range(ws['!ref']);
      for (let R = 1; R <= rng.e.r; R++) {
        [[3, 'DD/MM/YYYY'], [4, 'DD/MM/YYYY'], [6, '0.00%'], [7, '#,##0.00']].forEach(([C, z]) => {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          if (ws[addr]) ws[addr].z = z;
        });
        for (let C = 8; C <= rng.e.c; C++) {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          if (ws[addr]) ws[addr].z = '#,##0.00';
        }
      }
      ws['!cols']   = [...USO_COL_KEYS.map(k => ({ wch: Math.max(8, Math.round(getUsoW(k) / 7)) })), ...months.map(() => ({ wch: 16 })), { wch: 16 }];
      ws['!freeze'] = { xSplit: 3, ySplit: 1 };
      XLSX.utils.book_append_sheet(wb, ws, 'Uso da Tarefa');
      XLSX.writeFile(wb, `uso-tarefa-${new Date().toISOString().slice(0, 10)}.xlsx`);
    });
  };

  const exportPDFUso = async () => {
    setExportingPDF(true);
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
      const doc   = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
      const BRAND = [1, 67, 134];
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();
      doc.setFontSize(13); doc.text('Uso da Tarefa', 14, 14);
      doc.setFontSize(8);  doc.setTextColor(130);
      doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, 14, 20);
      doc.setTextColor(0);
      const body = etapas.map(e => {
        const dist  = getDist(e);
        const total = Object.values(dist).reduce((s, v) => s + v, 0);
        return {
          _isGroup: e.isGroup,
          vals: [
            String(e.displayId ?? e.id),
            wbsMap[e.id] || '',
            '  '.repeat(e.nivel || 0) + e.etapa,
            isoToBR(offsetToISO(e.inicio)),
            isoToBR(offsetToISO(taskEnd(e))),
            e.dur + 'd',
            e.avanco + '%',
            e.isGroup ? '—' : fmtBRL(e.custo || 0),
            ...months.map(m => dist[m.key] > 0 ? fmtBRL(dist[m.key]) : '—'),
            total > 0 ? fmtBRL(total) : '—',
          ],
        };
      });
      const fixedStyles = {
        0: { cellWidth: 8,  halign: 'right' },
        1: { cellWidth: 12, halign: 'left' },
        2: { cellWidth: 55, halign: 'left' },
        3: { cellWidth: 18, halign: 'center' },
        4: { cellWidth: 18, halign: 'center' },
        5: { cellWidth: 10, halign: 'right' },
        6: { cellWidth: 10, halign: 'right' },
        7: { cellWidth: 22, halign: 'right' },
      };
      const monthStyles = Object.fromEntries([
        ...months.map((_, i) => [8 + i, { cellWidth: 22, halign: 'right' }]),
        [8 + months.length, { cellWidth: 22, halign: 'right' }],
      ]);
      autoTable(doc, {
        startY: 25,
        head: [[ ...USO_COL_LABELS, ...months.map(m => m.label), 'Total']],
        body: body.map(r => r.vals),
        theme: 'grid',
        headStyles: { fillColor: BRAND, textColor: 255, fontSize: 7, fontStyle: 'bold', halign: 'center' },
        bodyStyles: { fontSize: 7, textColor: 40 },
        alternateRowStyles: { fillColor: [248, 249, 250] },
        columnStyles: { ...fixedStyles, ...monthStyles },
        horizontalPageBreak: true,
        horizontalPageBreakRepeat: 2,
        margin: { top: 25, right: 14, bottom: 14, left: 14 },
        didParseCell: (data) => {
          if (data.section === 'body' && body[data.row.index]?._isGroup) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [232, 240, 252];
            data.cell.styles.textColor = 20;
          }
        },
        didDrawPage: ({ pageNumber }) => {
          doc.setFontSize(8); doc.setTextColor(150);
          doc.text(`Página ${pageNumber}`, W - 20, H - 6);
          doc.setTextColor(0);
        },
      });
      doc.save(`uso-tarefa-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally { setExportingPDF(false); }
  };

  if (!months.length) return (
    <div className="card" style={{ marginTop: 'var(--gap)', padding: 40, textAlign: 'center' }}>
      <p className="text-muted">Adicione tarefas com datas e valores para ver a distribuição.</p>
    </div>
  );

  return (
    <div ref={usoRef} style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 280px)', marginTop: 'var(--gap)' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0', marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>Custo (R$) previsto por mês</span>
        <span style={{ fontSize: 12, color: 'var(--text-faint)', marginLeft: 8 }}>
          Intensidade da célula = concentração no mês · clique numa tarefa para destacar
        </span>
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px', height: 28, gap: 5 }}
          onClick={exportExcelUso} title="Exportar para Excel (.xlsx)">
          <Icon name="download" size={13} /> Excel
        </button>
        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px', height: 28, gap: 5, minWidth: 72 }}
          onClick={exportPDFUso} disabled={exportingPDF} title="Exportar para PDF">
          <Icon name="download" size={13} /> {exportingPDF ? 'Gerando…' : 'PDF'}
        </button>
      </div>

      {/* Painel dividido */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)' }}>

        {/* Lado esquerdo — hierarquia com colunas redimensionáveis */}
        <div ref={leftRef} style={{ flexShrink: 0, overflowY: 'auto', overflowX: 'auto', borderRight: '1px solid var(--border)' }}>
          <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              {USO_COL_KEYS.map(k => <col key={k} style={{ width: getUsoW(k) }} />)}
            </colgroup>
            <thead>
              <tr>
                {USO_COL_KEYS.map((k, i) => (
                  <th key={k} style={{ ...thSt, width: getUsoW(k), minWidth: getUsoW(k), textAlign: USO_COL_ALIGN[k], position: 'sticky', top: 0, zIndex: 2 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                      {USO_COL_LABELS[i]}
                    </span>
                    <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 5, cursor: 'col-resize', zIndex: 3 }}
                      onMouseDown={ev => startUsoResize(ev, k)} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map(e => {
                const nomeText = e.etapa;
                const idText   = String(e.displayId ?? e.id);
                const wbsText  = wbsMap[e.id] || '';
                const iniText  = isoToBR(offsetToISO(e.inicio));
                const fimText  = isoToBR(offsetToISO(taskEnd(e)));
                const durText  = `${e.dur}d`;
                const avText   = `${e.avanco}%`;
                return (
                  <tr key={e.id}
                    style={{ background: rowBg(e), cursor: 'pointer', height: 36 }}
                    onClick={() => setSelectedId(e.id === selectedId ? null : e.id)}>
                    <td style={{ ...tdSt, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-soft)' }} title={idText}>
                      {idText}
                    </td>
                    <td style={{ ...tdSt, color: 'var(--text-faint)', fontSize: 12 }} title={wbsText}>{wbsText}</td>
                    <td style={{ ...tdSt, paddingLeft: (e.nivel * 14 + 10) + 'px', fontWeight: e.isGroup ? 600 : 400 }} title={nomeText}>
                      {e.isGroup && <span style={{ marginRight: 5, color: 'var(--text-faint)', fontSize: 10 }}>▸</span>}
                      {nomeText}
                    </td>
                    <td style={{ ...tdSt, color: 'var(--text-soft)', fontSize: 12 }} title={iniText}>{iniText}</td>
                    <td style={{ ...tdSt, color: 'var(--text-soft)', fontSize: 12 }} title={fimText}>{fimText}</td>
                    <td style={{ ...tdSt, textAlign: 'right', color: 'var(--text-soft)' }} title={durText}>{durText}</td>
                    <td style={{ ...tdSt, textAlign: 'right' }} title={avText}>{avText}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Lado direito — grade temporal */}
        <div ref={rightRef} style={{ flex: 1, overflowX: 'auto', overflowY: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              {months.map(m => <col key={m.key} style={{ width: 92 }} />)}
              <col style={{ width: 112 }} />
            </colgroup>
            <thead>
              <tr>
                {months.map(m => (
                  <th key={m.key} style={{ ...thSt, textAlign: 'right' }}>{m.label}</th>
                ))}
                <th style={{ ...thSt, textAlign: 'right', color: 'var(--text)' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(e => {
                const dist  = getDist(e);
                const total = months.reduce((s, m) => s + (dist[m.key] || 0), 0);
                const emptyThresh = 1;
                return (
                  <tr key={e.id}
                    style={{ background: rowBg(e), cursor: 'pointer', height: 36 }}
                    onClick={() => setSelectedId(e.id === selectedId ? null : e.id)}>
                    {months.map(m => {
                      const v = dist[m.key] || 0;
                      const empty = v < emptyThresh;
                      const f = Math.min(1, v / cellMax);
                      return (
                        <td key={m.key}
                          className={'heat-cell' + (e.isGroup ? ' group' : '') + (empty ? ' empty' : (f > 0.35 ? ' hot' : ''))}
                          style={{ ...tdSt, textAlign: 'right', '--f': f }}
                          title={empty ? undefined : cfg.cell(v)}>
                          {empty ? '—' : cfg.cell(v)}
                        </td>
                      );
                    })}
                    <td style={{ ...tdSt, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }} title={total > 0 ? cfg.tot(total) : undefined}>
                      {total > 0 ? cfg.tot(total) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ─── SCurveChart — Curva S própria (SVG). Recriada do zero; não copia o protótipo.
// Recebe séries já computadas e desenha grade, barras mensais, linhas planejado/
// realizado com pontos, e o marcador "hoje". Cores da marca (navy) + verde/cinza.
const SCurveChart = ({ months = [], planned = [], realized = [], monthlyPct = [], todayIdx = -1, height = 300 }) => {
  const N = months.length || 1;
  const pL = 54, pR = 20, pT = 18, pB = 52;
  const svgW = 1000, svgH = height;
  const chartW = svgW - pL - pR, chartH = svgH - pT - pB;
  const xC = (i) => pL + (chartW / N) * (i + 0.5);
  const yS = (pct) => pT + (1 - pct / 100) * chartH;
  const barW = (chartW / N) * 0.55;
  const ptsPlan = planned.map((v, i) => `${xC(i).toFixed(1)},${yS(v).toFixed(1)}`).join(' ');
  const firstX = xC(0).toFixed(1), lastX = xC(N - 1).toFixed(1);
  const areaPath = planned.length
    ? `M${firstX},${yS(planned[0]).toFixed(1)} ` +
      planned.slice(1).map((v, i) => `L${xC(i + 1).toFixed(1)},${yS(v).toFixed(1)}`).join(' ') +
      ` L${lastX},${(pT + chartH).toFixed(1)} L${firstX},${(pT + chartH).toFixed(1)} Z`
    : '';
  const realPts = realized.map((v, i) => v != null ? `${xC(i).toFixed(1)},${yS(v).toFixed(1)}` : null).filter(Boolean).join(' ');
  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} width="100%" height={svgH} style={{ display: 'block', minWidth: Math.max(600, N * 36) }}>
      {[0, 20, 40, 60, 80, 100].map(pct => (
        <g key={pct}>
          <line x1={pL} y1={yS(pct)} x2={pL + chartW} y2={yS(pct)} stroke="var(--border)" strokeWidth="1" strokeDasharray={pct === 0 || pct === 100 ? undefined : '3,4'} />
          <text x={pL - 6} y={yS(pct) + 4} textAnchor="end" fontSize="10" fill="var(--text-muted)" fontFamily="var(--font-mono)">{pct}%</text>
        </g>
      ))}
      {monthlyPct.map((pct, i) => { const bh = (pct / 100) * chartH; return <rect key={i} x={xC(i) - barW / 2} y={yS(0) - bh} width={barW} height={bh} fill="#e2e8f0" rx="2" />; })}
      {todayIdx >= 0 && (
        <g>
          <line x1={xC(todayIdx)} y1={pT} x2={xC(todayIdx)} y2={pT + chartH} stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4,3" />
          <text x={xC(todayIdx)} y={pT - 5} textAnchor="middle" fontSize="9" fill="#94a3b8">hoje</text>
        </g>
      )}
      <path d={areaPath} fill="var(--brand)" opacity="0.07" />
      <polyline points={ptsPlan} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinejoin="round" />
      {planned.map((v, i) => <circle key={i} cx={xC(i)} cy={yS(v)} r="3.5" fill="#fff" stroke="var(--brand)" strokeWidth="2" />)}
      {realPts && <polyline points={realPts} fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinejoin="round" />}
      {realized.map((v, i) => v != null ? <circle key={i} cx={xC(i)} cy={yS(v)} r="3.5" fill="#16a34a" /> : null)}
      {months.map((m, i) => {
        if (N > 18 && i % 2 !== 0) return null;
        if (N > 30 && i % 3 !== 0) return null;
        return <text key={m.key} x={xC(i)} y={pT + chartH + 18} textAnchor="middle" fontSize="9.5" fill="var(--text-muted)">{m.label}</text>;
      })}
      <line x1={pL} y1={pT + chartH} x2={pL + chartW} y2={pT + chartH} stroke="var(--border)" strokeWidth="1" />
    </svg>
  );
};

// ─── CurvaFisicaView — Curva S + Histograma ──────────────────────────────────
const CurvaFisicaView = ({ etapas, months, monthlyDist, realizedTotals, baselines, blVisivelId, reprogramacoes, repVisivelId, valorVinculadoMap = {}, onCommit }) => {
  const toast = useToast();
  // Custo efetivo: com vínculos, usa o valor vinculado distribuído (cobre folhas e grupos)
  const hasVinc  = Object.keys(valorVinculadoMap).length > 0;
  const custoEf  = (e, gv) => hasVinc
    ? (valorVinculadoMap[e.id] || 0)
    : (e.isGroup ? (gv?.custo || 0) : (e.custo || 0));
  // Totais planejados — soma de todas as tarefas (sem filtro de grupo)
  const filteredPlanned = React.useMemo(() => {
    const agg = {};
    Object.values(monthlyDist).forEach(dist => {
      Object.entries(dist).forEach(([k, v]) => { agg[k] = (agg[k] || 0) + v; });
    });
    return agg;
  }, [monthlyDist]);

  // Linha de Base = somente o baseline explicitamente selecionado
  const activeBL = blVisivelId
    ? (baselines?.find(b => b.id === blVisivelId) || null)
    : null;
  const blEtapas = activeBL?.etapas || null;
  const blNome   = activeBL?.nome   || 'Linha de Base';

  const baselineDist = React.useMemo(() => {
    if (!blEtapas) return null;
    const dist = computeMonthlyDist(blEtapas);
    const agg = {};
    Object.values(dist).forEach(d =>
      Object.entries(d).forEach(([k, v]) => { agg[k] = (agg[k] || 0) + v; })
    );
    return agg;
  }, [blEtapas]);

  const baselineTotal = baselineDist
    ? months.reduce((s, m) => s + (baselineDist[m.key] || 0), 0)
    : null;

  // Reprogramação = retrato do cronograma salvo antes de reprogramar (snapshot congelado).
  // Sem nenhuma selecionada, cai no cronograma vivo (mesmo comportamento de antes desta feature).
  const activeRep = repVisivelId
    ? (reprogramacoes?.find(r => r.id === repVisivelId) || null)
    : null;
  const repEtapas = activeRep?.etapas || null;
  const repNome   = activeRep?.nome   || null;
  const hasRep    = repEtapas != null;

  const repDist = React.useMemo(() => {
    if (!repEtapas) return null;
    const dist = computeMonthlyDist(repEtapas);
    const agg = {};
    Object.values(dist).forEach(d =>
      Object.entries(d).forEach(([k, v]) => { agg[k] = (agg[k] || 0) + v; })
    );
    return agg;
  }, [repEtapas]);

  // Mês selecionado para a coluna Produção
  const [selMonKey, setSelMonKey] = React.useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  });

  const [exportingPDF, setExportingPDF] = React.useState(false);
  const curvaRef = React.useRef(null);

  const hasData = months.length > 0 && Object.values(filteredPlanned).some(v => v > 0);

  // Recomputa séries mensais (usadas no export e no render)
  const computeSeries = () => {
    const totalPlanned = months.reduce((s, m) => s + (filteredPlanned[m.key] || 0), 0);
    const hasBL  = baselineDist != null;
    const refBLT = baselineTotal || totalPlanned || 1;
    const refRep = totalPlanned || 1;
    const todayKey2 = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    let apBL = 0, apRep = 0, apRR = 0;
    const blM=[], blA=[], repM=[], repA=[], rrM=[], rrA=[], difBL=[], difRep=[];
    months.forEach(m => {
      const vBL  = hasBL ? (baselineDist[m.key] || 0) : 0;
      const vRep = hasRep ? (repDist[m.key] || 0) : (filteredPlanned[m.key] || 0);
      const vRR  = m.key <= todayKey2 ? (realizedTotals[m.key] || 0) : vRep;
      apBL += vBL; apRep += vRep; apRR += vRR;
      blM.push(vBL  / refBLT * 100); blA.push(apBL / refBLT * 100);
      repM.push(vRep / refRep * 100); repA.push(apRep / refRep * 100);
      rrM.push(vRR  / refRep * 100); rrA.push(apRR  / refRep * 100);
      difBL.push(hasBL ? rrA[rrA.length-1] - blA[blA.length-1] : null);
      difRep.push(rrA[rrA.length-1] - repA[repA.length-1]);
    });
    return { blM, blA, repM, repA, rrM, rrA, difBL, difRep };
  };

  const exportExcel = () => {
    import('xlsx').then(XLSX => {
      try {
      const wb = XLSX.utils.book_new();
      const { blM, blA, repM, repA, rrM, rrA, difBL, difRep } = computeSeries();
      const fmt = v => v != null ? parseFloat(v.toFixed(4)) : null;

      // Sheet 1 — Resumo Mensal
      const cabMeses = months.map(m => m.label);
      const resumo = [
        ['Atividade', ...cabMeses],
        ['LB Mensal (%)',              ...blM.map(fmt)],
        ['LB Acumulado (%)',           ...blA.map(fmt)],
        ['Reprogramado Mensal (%)',    ...repM.map(fmt)],
        ['Reprogramado Acumulado (%)', ...repA.map(fmt)],
        ['Real+Rep. Mensal (%)',       ...rrM.map(fmt)],
        ['Real+Rep. Acumulado (%)',    ...rrA.map(fmt)],
        ['Dif. vs LB Acumulado (%)',   ...difBL.map(fmt)],
        ['Dif. vs Rep. Acumulado (%)', ...difRep.map(fmt)],
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumo), 'Resumo Mensal');

      // Sheet 2 — Distribuição por Tarefa
      const groupValsExp = computeGroupValues(etapas);
      const distRows = etapas.filter(e => e.isGroup || e.showInDist === true);
      const folhas = etapas.filter(e => !e.isGroup);
      const totalCusto = folhas.reduce((s, e) => s + custoEf(e), 0);
      const avancoGeral = totalCusto > 0
        ? folhas.reduce((s, e) => s + (e.avanco || 0) * custoEf(e), 0) / totalCusto : 0;

      const cabDist = ['Atividade', 'Valor (R$)', 'Peso %', 'Conc. %', ...cabMeses, 'Total'];
      const dist = [cabDist];
      distRows.forEach(e => {
        const gv = e.isGroup ? (groupValsExp[e.id] || {}) : {};
        const taskCusto  = custoEf(e, gv);
        const taskAvanco = e.isGroup ? (gv.avanco || 0) : (e.avanco || 0);
        const peso = totalCusto > 0 ? taskCusto / totalCusto * 100 : 0;
        const mDist = monthlyDist[e.id] || {};
        const monPcts = months.map(m => taskCusto > 0 ? parseFloat(((mDist[m.key] || 0) / taskCusto * 100).toFixed(4)) : null);
        dist.push([e.etapa, taskCusto, parseFloat(peso.toFixed(4)), parseFloat(taskAvanco.toFixed(2)), ...monPcts, 100]);
      });
      // Rodapé
      const totalMonPcts = months.map(m => totalCusto > 0 ? parseFloat(((filteredPlanned[m.key] || 0) / totalCusto * 100).toFixed(4)) : null);
      dist.push(['Total geral', totalCusto, 100, parseFloat(avancoGeral.toFixed(2)), ...totalMonPcts, 100]);

      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dist), 'Distribuição');

      XLSX.writeFile(wb, `curva-fisica-${new Date().toISOString().slice(0,10)}.xlsx`);
      } catch (err) { toast('Erro ao exportar Excel: ' + err.message, { tone: 'danger' }); }
    });
  };

  const exportPDF = async () => {
    setExportingPDF(true);
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
      const doc   = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
      const BRAND = [1, 67, 134];
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();
      const footerFn = ({ pageNumber }) => {
        doc.setFontSize(8); doc.setTextColor(150);
        doc.text(`Página ${pageNumber}`, W - 20, H - 6);
        doc.setTextColor(0);
      };
      doc.setFontSize(13); doc.text('Curva Física', 14, 14);
      doc.setFontSize(8);  doc.setTextColor(130);
      doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, 14, 20);
      doc.setTextColor(0);

      // ── Tabela 1: Resumo Mensal ─────────────────────────────────────────
      const { blM, blA, repM, repA, rrM, rrA, difBL, difRep } = computeSeries();
      const fmt      = v => v != null ? v.toFixed(2) + '%' : '—';
      const cabMeses = months.map(m => m.label);
      autoTable(doc, {
        startY: 25,
        head: [['Atividade', ...cabMeses]],
        body: [
          ['LB Mensal',              ...blM.map(fmt)],
          ['LB Acumulado',           ...blA.map(fmt)],
          ['Reprogramado Mensal',    ...repM.map(fmt)],
          ['Reprogramado Acumulado', ...repA.map(fmt)],
          ['Real Mensal',            ...rrM.map(fmt)],
          ['Real Acumulado',         ...rrA.map(fmt)],
          ['Dif. vs LB Acumulado',   ...difBL.map(fmt)],
          ['Dif. vs Rep. Acumulado', ...difRep.map(fmt)],
        ],
        theme: 'grid',
        headStyles: { fillColor: BRAND, textColor: 255, fontSize: 7, fontStyle: 'bold', halign: 'center' },
        bodyStyles: { fontSize: 7 },
        columnStyles: {
          0: { cellWidth: 45, fontStyle: 'bold', halign: 'left' },
          ...Object.fromEntries(cabMeses.map((_, i) => [i + 1, { cellWidth: 20, halign: 'right' }])),
        },
        horizontalPageBreak: true,
        horizontalPageBreakRepeat: 0,
        margin: { top: 25, right: 14, bottom: 14, left: 14 },
        didDrawPage: footerFn,
      });

      // ── Tabela 2: Distribuição por Tarefa ──────────────────────────────
      const groupValsExp = computeGroupValues(etapas);
      const distRows     = etapas.filter(e => e.isGroup || e.showInDist === true);
      const folhas       = etapas.filter(e => !e.isGroup);
      const totCusto     = folhas.reduce((s, e) => s + (e.custo || 0), 0);
      const avancoGeral  = totCusto > 0
        ? folhas.reduce((s, e) => s + (e.avanco || 0) * (e.custo || 0), 0) / totCusto : 0;
      const distBody = distRows.map(e => {
        const gv      = e.isGroup ? (groupValsExp[e.id] || {}) : {};
        const taskCst = e.isGroup ? (gv.custo || 0) : (e.custo || 0);
        const taskAv  = e.isGroup ? (gv.avanco || 0) : (e.avanco || 0);
        const peso    = totCusto > 0 ? taskCst / totCusto * 100 : 0;
        const mDist   = monthlyDist[e.id] || {};
        return {
          _isGroup: e.isGroup,
          vals: [
            e.etapa, fmtBRL(taskCst), peso.toFixed(2) + '%', taskAv.toFixed(1) + '%',
            ...months.map(m => taskCst > 0 ? ((mDist[m.key] || 0) / taskCst * 100).toFixed(2) + '%' : '—'),
            '100%',
          ],
        };
      });
      const totMonPcts = months.map(m => totCusto > 0 ? ((filteredPlanned[m.key] || 0) / totCusto * 100).toFixed(2) + '%' : '—');
      const startY2    = (doc.lastAutoTable?.finalY ?? 60) + 12;
      doc.setFontSize(10); doc.setTextColor(0);
      doc.text('Distribuição por Tarefa', 14, startY2 - 4);
      autoTable(doc, {
        startY: startY2,
        head: [['Atividade', 'Valor (R$)', 'Peso %', 'Conc. %', ...cabMeses, 'Total']],
        body: distBody.map(r => r.vals),
        foot: [['Total geral', fmtBRL(totCusto), '100%', avancoGeral.toFixed(1) + '%', ...totMonPcts, '100%']],
        theme: 'grid',
        headStyles: { fillColor: BRAND, textColor: 255, fontSize: 7, fontStyle: 'bold', halign: 'center' },
        bodyStyles: { fontSize: 7 },
        footStyles: { fillColor: [225, 232, 242], fontStyle: 'bold', fontSize: 7 },
        columnStyles: {
          0: { cellWidth: 45, halign: 'left' },
          1: { cellWidth: 22, halign: 'right' },
          2: { cellWidth: 14, halign: 'right' },
          3: { cellWidth: 14, halign: 'right' },
          ...Object.fromEntries(months.map((_, i) => [i + 4, { cellWidth: 20, halign: 'right' }])),
          [4 + months.length]: { cellWidth: 14, halign: 'right' },
        },
        horizontalPageBreak: true,
        horizontalPageBreakRepeat: 0,
        margin: { top: 25, right: 14, bottom: 14, left: 14 },
        didParseCell: (data) => {
          if (data.section === 'body' && distBody[data.row.index]?._isGroup) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [232, 240, 252];
          }
        },
        didDrawPage: footerFn,
      });
      doc.save(`curva-fisica-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setExportingPDF(false);
    }
  };

  if (!hasData) return (
    <div className="card" style={{ marginTop: 'var(--gap)', padding: 40, textAlign: 'center' }}>
      <Icon name="trending-up" size={40} style={{ color: 'var(--text-faint)' }} />
      <h3 style={{ marginTop: 12, fontSize: 16, color: 'var(--text-soft)' }}>Curva S — Produção física planejada</h3>
      <p className="text-muted" style={{ maxWidth: 420, margin: '6px auto 0', fontSize: 13 }}>
        Adicione tarefas com datas e custos no cronograma para gerar a Curva S automaticamente.
      </p>
    </div>
  );

  const total = months.reduce((s, m) => s + (filteredPlanned[m.key] || 0), 0);
  const totalReal = months.reduce((s, m) => s + (realizedTotals[m.key] || 0), 0);

  // Chave do mês atual
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Séries acumuladas para o SVG
  let acum = 0, acumReal = 0;
  const seriesPlanned = [], seriesRealized = [];
  months.forEach((m) => {
    const v = filteredPlanned[m.key] || 0;
    const r = realizedTotals[m.key] || 0;
    acum += v;
    const pctA = total > 0 ? acum / total * 100 : 0;
    seriesPlanned.push(pctA);
    if (m.key <= todayKey) {
      acumReal += r;
      seriesRealized.push(total > 0 ? acumReal / total * 100 : 0);
    } else {
      seriesRealized.push(null);
    }
  });

  // Constantes SVG
  const N = months.length;
  const pL = 54, pR = 20, pT = 16, pB = 52;
  const svgW = 1000, svgH = 300;
  const chartW = svgW - pL - pR;
  const chartH = svgH - pT - pB;
  const xC = (i) => pL + (chartW / N) * (i + 0.5);
  const yS = (pct) => pT + (1 - pct / 100) * chartH;
  const barW = (chartW / N) * 0.55;
  const todayIdx = months.findIndex(m => m.key === todayKey);
  // Polilinha planejada
  const ptsPlan = seriesPlanned.map((v, i) => `${xC(i).toFixed(1)},${yS(v).toFixed(1)}`).join(' ');
  // Área planejada
  const firstX = xC(0).toFixed(1), lastX = xC(N - 1).toFixed(1);
  const areaPath = `M${firstX},${yS(seriesPlanned[0]).toFixed(1)} ` +
    seriesPlanned.slice(1).map((v, i) => `L${xC(i + 1).toFixed(1)},${yS(v).toFixed(1)}`).join(' ') +
    ` L${lastX},${(pT + chartH).toFixed(1)} L${firstX},${(pT + chartH).toFixed(1)} Z`;
  // Polilinha realizada
  const realPts = seriesRealized
    .map((v, i) => v !== null ? `${xC(i).toFixed(1)},${yS(v).toFixed(1)}` : null)
    .filter(Boolean).join(' ');

  const thSt = {
    padding: '9px 14px', fontSize: 10.5, fontWeight: 600,
    letterSpacing: '0.07em', textTransform: 'uppercase',
    color: 'var(--text-soft)', borderBottom: '2px solid var(--border)',
    whiteSpace: 'nowrap', background: 'var(--surface-muted)',
  };
  const tdSt = { padding: '8px 14px', borderBottom: '1px solid var(--border-subtle, rgba(0,0,0,0.06))', verticalAlign: 'middle' };

  return (
    <div ref={curvaRef} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>

      {/* ── Gráfico SVG ───────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Curva S — Produção física acumulada</div>
            <div className="card-subtitle">Distribuição mensal do custo planejado e realizado · calculado automaticamente pelo cronograma</div>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 12 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 18, height: 3, background: 'var(--brand)', display: 'inline-block', borderRadius: 2 }} />
              Planejado acum.
            </span>
            {totalReal > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 18, height: 2, borderTop: '2px dashed #16a34a', display: 'inline-block' }} />
                Realizado acum.
              </span>
            )}
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 14, height: 12, background: '#e2e8f0', display: 'inline-block', borderRadius: 2 }} />
              Prod. mensal
            </span>
            <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
              <button className="btn btn-ghost" style={{ gap: 5, fontSize: 12, padding: '4px 10px', height: 28 }}
                onClick={exportExcel} title="Exportar para Excel (.xlsx)">
                <Icon name="download" size={13} />Excel
              </button>
              <button className="btn btn-ghost" style={{ gap: 5, fontSize: 12, padding: '4px 10px', height: 28 }}
                onClick={exportPDF} disabled={exportingPDF} title="Exportar para PDF">
                <Icon name="download" size={13} />{exportingPDF ? 'Gerando…' : 'PDF'}
              </button>
            </div>
          </div>
        </div>
        <div className="card-body" style={{ padding: '12px 16px 0', overflowX: 'auto' }}>
          <SCurveChart
            months={months}
            planned={seriesPlanned}
            realized={seriesRealized}
            monthlyPct={months.map(m => total > 0 ? (filteredPlanned[m.key] || 0) / total * 100 : 0)}
            todayIdx={todayIdx}
          />
        </div>
      </div>

      {/* ── Resumo Mensal ─────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Resumo Mensal</div>
            <div className="card-subtitle">Linha de Base · Reprogramação · Real + Reprogramado · Desvios</div>
          </div>
        </div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          {(() => {
            const hasBL  = baselineDist != null;
            const refBLT = baselineTotal || total || 1;
            const refRep = total || 1;

            // Séries por mês
            let apBL = 0, apRep = 0, apRR = 0;
            const blM=[], blA=[], repM=[], repA=[], rrM=[], rrA=[], difBL=[], difRep=[];

            months.forEach(m => {
              const vBL  = hasBL ? (baselineDist[m.key] || 0) : 0;
              const vRep = hasRep ? (repDist[m.key] || 0) : (filteredPlanned[m.key] || 0);
              const vRR  = m.key <= todayKey
                ? (realizedTotals[m.key] || 0)
                : (filteredPlanned[m.key] || 0);
              apBL += vBL; apRep += vRep; apRR += vRR;
              blM.push(vBL  / refBLT * 100);
              blA.push(apBL / refBLT * 100);
              repM.push(vRep / refRep * 100);
              repA.push(apRep / refRep * 100);
              rrM.push(vRR  / refRep * 100);
              rrA.push(apRR / refRep * 100);
              difBL.push(hasBL ? rrA[rrA.length-1] - blA[blA.length-1] : null);
              difRep.push(rrA[rrA.length-1] - repA[repA.length-1]);
            });

            // Índice do mês selecionado para a coluna Produção
            const rawIdx  = months.findIndex(m => m.key === selMonKey);
            const selIdx  = rawIdx >= 0 ? rawIdx : months.length - 1;
            const selLabel = months[selIdx]?.label || '';

            const fmt1 = v => v != null ? (v === 0 ? '—' : v.toFixed(2) + '%') : '—';
            const fmtD = v => v != null ? (v > 0 ? '+' : '') + v.toFixed(2) + '%' : '—';

            const ACT_W = 130, MON_W = 38, PROD_W = MON_W;

            const thBase = {
              padding: '6px 4px', fontSize: 10, fontWeight: 700,
              letterSpacing: '0.05em', textTransform: 'uppercase',
              color: 'var(--text-soft)', borderBottom: '2px solid var(--border)',
              whiteSpace: 'nowrap', background: 'var(--surface-muted)',
            };
            const thAct  = { ...thBase, textAlign: 'left', minWidth: ACT_W,
              padding: '6px 10px', position: 'sticky', left: 0, zIndex: 2 };
            const thMon  = { ...thBase, textAlign: 'right', minWidth: MON_W };

            const grpHdrBlue = {
              background: 'var(--brand)', color: '#fff',
              fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em',
              textTransform: 'uppercase', padding: '6px 14px',
            };
            const grpHdrGray  = { ...grpHdrBlue, background: '#475569' };
            const grpHdrGreen = { ...grpHdrBlue, background: '#15803d' };
            const grpHdrBase  = { ...grpHdrBlue, background: 'var(--brand-700)' };

            const bdr = '1px solid var(--border-subtle, rgba(0,0,0,0.06))';
            const tdAct = (accum) => ({
              padding: '5px 8px 5px 14px', fontSize: 11,
              borderBottom: bdr, whiteSpace: 'nowrap',
              position: 'sticky', left: 0, zIndex: 1,
              background: accum ? 'var(--surface-muted, #f9fafb)' : 'var(--surface)',
              fontWeight: accum ? 600 : 400, color: 'var(--text-soft)',
            });
            const tdBase = {
              padding: '5px 4px', fontSize: 10.5, textAlign: 'right',
              borderBottom: bdr, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
            };
            const tdMon  = (accum) => ({
              ...tdBase,
              background: accum ? 'rgba(0,0,0,0.015)' : undefined,
              fontWeight: accum ? 600 : 400,
            });
            const tdProd = (accum) => ({
              ...tdBase,
              minWidth: PROD_W,
              fontWeight: accum ? 700 : 600,
              borderLeft: '2px solid var(--border)',
              background: accum ? 'rgba(1,67,134,0.06)' : 'rgba(1,67,134,0.03)',
            });

            // Retorna células dos meses (sem coluna Produção)
            const monCells = (vals, fmt, color, accum) =>
              months.map((m, i) => {
                const v   = vals[i];
                const clr = color === 'desvio' && v != null
                  ? (v >= 0 ? '#16a34a' : '#dc2626') : (color || 'var(--text)');
                return (
                  <td key={m.key} style={{
                    ...tdMon(accum),
                    color: v == null || v === 0 ? 'var(--text-faint)' : clr,
                    background: m.key === todayKey
                      ? 'rgba(1,67,134,0.06)' : (accum ? 'rgba(0,0,0,0.015)' : undefined),
                  }}>
                    {fmt(v)}
                  </td>
                );
              });

            // Célula da coluna Produção (valor do mês selecionado)
            const prodCell = (vals, fmt, color, accum, fallback = null) => {
              const v   = selIdx >= 0 ? (fallback !== null && vals[selIdx] == null ? fallback : vals[selIdx]) : null;
              const clr = color === 'desvio' && v != null
                ? (v >= 0 ? '#16a34a' : '#dc2626') : (color || 'var(--text)');
              return (
                <td style={{
                  ...tdProd(accum),
                  color: v == null || v === 0 ? 'var(--text-faint)' : clr,
                }}>
                  {fmt(v)}
                </td>
              );
            };

            const totalCols = 2 + months.length; // Atividades + Produção + meses

            return (
              <table style={{ borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed',
                minWidth: ACT_W + PROD_W + months.length * MON_W }}>
                <thead>
                  <tr>
                    <th style={thAct}></th>
                    <th style={{
                      ...thBase, textAlign: 'center', minWidth: PROD_W,
                      borderLeft: '2px solid var(--border)',
                      background: 'rgba(1,67,134,0.07)',
                      padding: '4px 2px',
                    }}>
                      <select
                        value={selMonKey}
                        onChange={e => setSelMonKey(e.target.value)}
                        style={{
                          fontSize: 10, fontWeight: 700, color: 'var(--brand)',
                          border: 'none', background: 'transparent', cursor: 'pointer',
                          width: '100%', textAlign: 'center', padding: 0,
                        }}
                      >
                        {months.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                      </select>
                      <div style={{ fontSize: 9, letterSpacing: '0.08em', color: 'var(--text-muted)',
                        textTransform: 'uppercase', marginTop: 1 }}>Produção</div>
                    </th>
                    {months.map(m => (
                      <th key={m.key} style={{
                        ...thMon,
                        color: m.key === selMonKey ? 'var(--brand)' : 'var(--text-soft)',
                        fontWeight: m.key === selMonKey ? 700 : 600,
                      }}>{m.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* ── Linha de Base ── */}
                  <tr>
                    <td colSpan={totalCols} style={grpHdrBase}>
                      {hasBL ? blNome : 'Linha de Base'}
                    </td>
                  </tr>
                  <tr>
                    <td style={tdAct(false)}>Mensal</td>
                    {prodCell(hasBL ? blM : months.map(() => null), fmt1, 'var(--brand)', false)}
                    {monCells(hasBL ? blM : months.map(() => null), fmt1, 'var(--brand)', false)}
                  </tr>
                  <tr>
                    <td style={tdAct(true)}>Acumulado</td>
                    {prodCell(hasBL ? blA : months.map(() => null), fmt1, 'var(--brand)', true)}
                    {monCells(hasBL ? blA : months.map(() => null), fmt1, 'var(--brand)', true)}
                  </tr>

                  {/* ── Reprogramação ── */}
                  <tr>
                    <td colSpan={totalCols} style={{ ...grpHdrBlue, borderTop: '2px solid rgba(255,255,255,0.2)' }}>
                      {hasRep ? repNome : 'Reprogramação Mês Anterior'}
                    </td>
                  </tr>
                  <tr>
                    <td style={tdAct(false)}>Mensal</td>
                    {prodCell(repM, fmt1, 'var(--text)', false)}
                    {monCells(repM, fmt1, 'var(--text)', false)}
                  </tr>
                  <tr>
                    <td style={tdAct(true)}>Acumulado</td>
                    {prodCell(repA, fmt1, 'var(--text)', true)}
                    {monCells(repA, fmt1, 'var(--text)', true)}
                  </tr>

                  {/* ── Real + Reprogramado ── */}
                  <tr>
                    <td colSpan={totalCols} style={{ ...grpHdrGreen, borderTop: '2px solid rgba(255,255,255,0.2)' }}>
                      Real + Reprogramado
                    </td>
                  </tr>
                  <tr>
                    <td style={tdAct(false)}>Mensal</td>
                    {prodCell(rrM, fmt1, '#16a34a', false)}
                    {monCells(rrM, fmt1, '#16a34a', false)}
                  </tr>
                  <tr>
                    <td style={tdAct(true)}>Acumulado</td>
                    {prodCell(rrA, fmt1, '#16a34a', true)}
                    {monCells(rrA, fmt1, '#16a34a', true)}
                  </tr>

                  {/* ── Diferenças ── */}
                  <tr>
                    <td colSpan={totalCols} style={{ ...grpHdrGray, borderTop: '2px solid rgba(255,255,255,0.15)' }}>
                      Diferenças
                    </td>
                  </tr>
                  {hasBL && (
                    <tr>
                      <td style={tdAct(false)}>Dif. em relação à Linha de Base — Acumulado</td>
                      {prodCell(difBL, fmtD, 'desvio', false)}
                      {monCells(difBL, fmtD, 'desvio', false)}
                    </tr>
                  )}
                  <tr>
                    <td style={tdAct(false)}>Dif. em relação ao Reprogramado — Acumulado</td>
                    {prodCell(difRep, fmtD, 'desvio', false)}
                    {monCells(difRep, fmtD, 'desvio', false)}
                  </tr>
                </tbody>
              </table>
            );
          })()}
        </div>
      </div>
      {/* ── Distribuição por tarefa × mês ───────────────────────────────── */}
      {(() => {
        const groupVals2  = computeGroupValues(etapas);
        // CurvaFisicaView mostra todas as tarefas independente de collapsed na Lista
        const visibleRows = etapas;
        const distRows    = visibleRows.filter(e => e.isGroup || e.showInDist === true);
        const ACT_W = 220, VAL_W = 100, PESO_W = 64, CONC_W = 56, MON_W = 52, TOT_W = 68;
        const thBase = {
          fontSize: 10.5, fontWeight: 600, letterSpacing: '0.07em',
          textTransform: 'uppercase', color: 'var(--text-soft)',
          borderBottom: '2px solid var(--border)',
          background: 'var(--surface-muted)',
          whiteSpace: 'nowrap', padding: '8px 6px',
        };
        const tdBase = {
          borderBottom: '1px solid var(--border-subtle, rgba(0,0,0,0.06))',
          padding: '6px 6px', whiteSpace: 'nowrap', verticalAlign: 'middle',
        };
        const fmt = v => v > 0.005 ? v.toFixed(2) + '%' : '—';

        // Avanco médio ponderado geral (para o rodapé)
        const folhas = etapas.filter(e => !e.isGroup);
        const totalCustoFolha = folhas.reduce((s, e) => s + custoEf(e), 0);
        const avancoGeral = totalCustoFolha > 0
          ? folhas.reduce((s, e) => s + (e.avanco || 0) * custoEf(e), 0) / totalCustoFolha
          : 0;

        return (
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Distribuição por tarefa</div>
                <div className="card-subtitle">% do custo de cada tarefa alocado por mês · clique nos grupos para expandir / recolher</div>
              </div>
            </div>
            <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 11, tableLayout: 'fixed',
                minWidth: ACT_W + VAL_W + PESO_W + CONC_W + months.length * MON_W + TOT_W }}>
                <colgroup>
                  <col style={{ width: ACT_W }} />
                  <col style={{ width: VAL_W }} />
                  <col style={{ width: PESO_W }} />
                  <col style={{ width: CONC_W }} />
                  {months.map(m => <col key={m.key} style={{ width: MON_W }} />)}
                  <col style={{ width: TOT_W }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={{ ...thBase, textAlign: 'left', position: 'sticky', left: 0, zIndex: 3, padding: '8px 14px' }}>
                      Atividade
                    </th>
                    <th style={{ ...thBase, textAlign: 'right' }}>Valor (R$)</th>
                    <th style={{ ...thBase, textAlign: 'right' }}>Peso %</th>
                    <th style={{ ...thBase, textAlign: 'right' }}>Conc. %</th>
                    {months.map(m => (
                      <th key={m.key} style={{
                        ...thBase, textAlign: 'right',
                        color: m.key === todayKey ? 'var(--brand)' : 'var(--text-soft)',
                        fontWeight: m.key === todayKey ? 700 : 600,
                        background: m.key === todayKey ? 'rgba(1,67,134,0.07)' : 'var(--surface-muted)',
                      }}>{m.label}</th>
                    ))}
                    <th style={{ ...thBase, textAlign: 'right', borderLeft: '2px solid var(--border)' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {distRows.length === 0 && (
                    <tr>
                      <td colSpan={4 + months.length + 1}
                          style={{ padding: '24px 0', textAlign: 'center',
                                   color: 'var(--text-faint)', fontSize: 12 }}>
                        Nenhuma tarefa marcada — ative a coluna "Curva" na Lista.
                      </td>
                    </tr>
                  )}
                  {distRows.map((e, ri) => {
                    const gv       = groupVals2[e.id];
                    const taskDist = e.isGroup
                      ? getGroupMonthlyDist(e.id, etapas, monthlyDist)
                      : (monthlyDist[e.id] || {});
                    const taskCusto  = custoEf(e, gv);
                    const taskAvanco = e.isGroup ? (gv?.avanco || 0) : (e.avanco || 0);
                    const rowBg = e.isGroup ? 'var(--surface-muted)' : (ri % 2 === 0 ? undefined : 'rgba(0,0,0,0.013)');
                    return (
                      <tr key={e.id} style={{ background: rowBg }}>
                        {/* Atividade (sticky) */}
                        <td style={{
                          ...tdBase, position: 'sticky', left: 0, zIndex: 1,
                          background: rowBg || 'var(--surface)',
                          fontWeight: e.isGroup ? 600 : 400,
                          paddingLeft: e.nivel * 14 + 10,
                          overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {e.isGroup ? (
                              <button
                                onClick={() => {
                                  const novas = etapas.map(t => t.id === e.id ? { ...t, collapsed: !t.collapsed } : t);
                                  onCommit(novas, { silent: true });
                                }}
                                style={{ width: 16, height: 16, flexShrink: 0, display: 'flex', alignItems: 'center',
                                  justifyContent: 'center', border: 'none', background: 'none',
                                  cursor: 'pointer', color: 'var(--text-soft)', fontSize: 9, padding: 0 }}
                              >{e.collapsed ? '▶' : '▼'}</button>
                            ) : (
                              <span style={{ width: 16, flexShrink: 0 }} />
                            )}
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.etapa}</span>
                          </div>
                        </td>
                        {/* Valor */}
                        <td style={{ ...tdBase, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                          color: taskCusto > 0 ? 'var(--text)' : 'var(--text-faint)', fontSize: 10.5 }}>
                          {taskCusto > 0 ? fmtBRL(taskCusto) : '—'}
                        </td>
                        {/* Peso */}
                        <td style={{ ...tdBase, textAlign: 'right', color: 'var(--text-soft)', fontSize: 10.5 }}>
                          {total > 0 && taskCusto > 0 ? (taskCusto / total * 100).toFixed(2) + '%' : '—'}
                        </td>
                        {/* Conc. */}
                        <td style={{ ...tdBase, textAlign: 'right',
                          color: taskAvanco === 100 ? '#16a34a' : taskAvanco > 0 ? 'var(--brand)' : 'var(--text-faint)',
                          fontWeight: 500, fontSize: 10.5 }}>
                          {taskAvanco > 0 ? taskAvanco.toFixed(0) + '%' : '—'}
                        </td>
                        {/* Meses */}
                        {months.map(m => {
                          const v   = taskDist[m.key] || 0;
                          const pct = taskCusto > 0 ? v / taskCusto * 100 : 0;
                          const empty = pct <= 0.5;
                          const f = Math.min(1, pct / 100);
                          return (
                            <td key={m.key}
                              className={'heat-cell' + (e.isGroup ? ' group' : '') + (empty ? ' empty' : (f > 0.4 ? ' hot' : ''))}
                              style={{ ...tdBase, textAlign: 'right', fontSize: 10.5, '--f': f }}>
                              {empty ? '—' : fmt(pct)}
                            </td>
                          );
                        })}
                        {/* Total col */}
                        <td style={{ ...tdBase, textAlign: 'right', borderLeft: '2px solid var(--border)',
                          fontWeight: 600, color: taskCusto > 0 ? 'var(--text-soft)' : 'var(--text-faint)', fontSize: 10.5 }}>
                          {taskCusto > 0 ? '100%' : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--surface-muted)', fontWeight: 600 }}>
                    <td style={{ ...tdBase, borderTop: '2px solid var(--border)', position: 'sticky', left: 0,
                      zIndex: 1, background: 'var(--surface-muted)', paddingLeft: 14, fontSize: 11 }}>
                      Total geral
                    </td>
                    <td style={{ ...tdBase, borderTop: '2px solid var(--border)', textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums', fontSize: 10.5 }}>
                      {fmtBRL(total)}
                    </td>
                    <td style={{ ...tdBase, borderTop: '2px solid var(--border)', textAlign: 'right', fontSize: 10.5 }}>100%</td>
                    <td style={{ ...tdBase, borderTop: '2px solid var(--border)', textAlign: 'right',
                      color: '#16a34a', fontSize: 10.5 }}>
                      {avancoGeral > 0 ? avancoGeral.toFixed(0) + '%' : '—'}
                    </td>
                    {months.map(m => {
                      const pct = total > 0 ? (filteredPlanned[m.key] || 0) / total * 100 : 0;
                      return (
                        <td key={m.key} style={{
                          ...tdBase, borderTop: '2px solid var(--border)', textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                          color: pct > 0.005 ? 'var(--brand)' : 'var(--text-faint)',
                          background: m.key === todayKey ? 'rgba(1,67,134,0.07)' : undefined,
                          fontSize: 10.5,
                        }}>
                          {fmt(pct)}
                        </td>
                      );
                    })}
                    <td style={{ ...tdBase, borderTop: '2px solid var(--border)',
                      borderLeft: '2px solid var(--border)', textAlign: 'right',
                      color: 'var(--brand)', fontSize: 10.5 }}>100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

// ─── Helpers de Linha de Base ────────────────────────────────────────────────
function carregarBaselines(obraId) {
  try { return JSON.parse(localStorage.getItem(`cronograma_baselines_${obraId}`)) || []; }
  catch { return []; }
}
function salvarBaselines(obraId, bls) {
  localStorage.setItem(`cronograma_baselines_${obraId}`, JSON.stringify(bls));
}

// ─── Helpers de Reprogramação (retrato do cronograma antes de reprogramar) ──
function carregarReprogramacoes(obraId) {
  try { return JSON.parse(localStorage.getItem(`cronograma_reprogramacoes_${obraId}`)) || []; }
  catch { return []; }
}
function salvarReprogramacoesLocal(obraId, reps) {
  localStorage.setItem(`cronograma_reprogramacoes_${obraId}`, JSON.stringify(reps));
}
// Entre as reprogramações anteriores ao mês atual, a mais recente; sem nenhuma
// anterior, a mais recente entre todas; lista vazia, null.
function defaultRepId(reps) {
  if (!reps.length) return null;
  const mesAtual = new Date().toISOString().slice(0, 7);
  const anteriores = reps.filter(r => r.criadaEm.slice(0, 7) < mesAtual);
  const pool = anteriores.length ? anteriores : reps;
  return pool.reduce((best, r) => (!best || r.criadaEm > best.criadaEm) ? r : best, null)?.id ?? null;
}

// updated_at que acreditamos ser o vigente por obra (última carga ou último save nosso).
// Base do bloqueio otimista: se o banco divergir disso, outra pessoa salvou no meio.
const _cronSavedAt = {};

// Bloqueio otimista. Retorna:
//   { error }                  em falha de rede/SQL
//   { error:null }             sucesso (grava e avança o _cronSavedAt)
//   { error:null, conflict:true } outra sessão gravou no meio (NÃO sobrescreve)
async function salvarCronograma(obraId, etapas, customCols, baselines, reprogramacoes, feriados) {
  const nowISO = new Date().toISOString();
  const payload = { etapas, custom_cols: customCols, baselines, reprogramacoes, updated_at: nowISO };
  // Feriados só entram no payload quando fornecidos (edição de feriados). Assim os saves
  // de etapas não sobrescrevem a config de feriados já gravada na obra.
  if (feriados !== undefined) payload.feriados = feriados;
  const expected = _cronSavedAt[obraId];

  // Sem baseline conhecida (1ª sessão sem ter carregado do banco): upsert simples (comportamento anterior).
  if (expected === undefined || expected === null) {
    const { error } = await supabase.from('cronogramas').upsert(
      { obra_id: obraId, ...payload }, { onConflict: 'obra_id' });
    if (error) { console.error('[cronograma] falha ao salvar', error); return { error }; }
    _cronSavedAt[obraId] = nowISO;
    return { error: null };
  }

  // Update condicional: só grava se o updated_at do banco ainda for o que carregamos.
  const { data, error } = await supabase.from('cronogramas')
    .update(payload).eq('obra_id', obraId).eq('updated_at', expected).select('updated_at');
  if (error) { console.error('[cronograma] falha ao salvar', error); return { error }; }
  if (data && data.length) { _cronSavedAt[obraId] = nowISO; return { error: null }; }

  // 0 linhas: ou a linha ainda não existe, ou o updated_at mudou (conflito).
  const { data: atual } = await supabase.from('cronogramas')
    .select('updated_at').eq('obra_id', obraId).maybeSingle();
  if (!atual) {
    const { error: insErr } = await supabase.from('cronogramas').insert({ obra_id: obraId, ...payload });
    if (insErr) { console.error('[cronograma] falha ao inserir', insErr); return { error: insErr }; }
    _cronSavedAt[obraId] = nowISO;
    return { error: null };
  }
  // Conflito: mantém expected inalterado para os próximos saves seguirem barrando até recarregar.
  console.warn('[cronograma] conflito de edição — outra sessão salvou', obraId);
  return { error: null, conflict: true };
}

async function carregarCronogramaDB(obraId) {
  const { data, error } = await supabase.from('cronogramas')
    .select('etapas, custom_cols, baselines, reprogramacoes, feriados, updated_at')
    .eq('obra_id', obraId)
    .single();
  if (error) return null;
  _cronSavedAt[obraId] = data.updated_at;  // baseline do bloqueio otimista
  return data;
}

// Cache por obra (espelha o estado em memória), evita rebuscar/reprocessar ao voltar; resetado no F5
const _cronCache = {};

// ─── Modais de Linha de Base / Reprogramação / Feriados ──────────────────────
// Movidos para ./cronogramaModais.

// ─── CronogramaFull ──────────────────────────────────────────────────────────
const CronogramaFull = ({ initialObraId, obras = [], userProfile }) => {
  const D    = AppData;
  const toast = useToast();
  const readOnly = moduloSomenteLeitura(userProfile, 'cronograma');

  // Escolhe a obra inicial a partir da lista real de obras (prop). Navegação
  // explícita (initialObraId) tem prioridade; depois a obra salva na sessão,
  // mas só se ela ainda existir na lista (evita ficar preso numa obra fantasma);
  // por fim a primeira em andamento e, na falta, a primeira da lista.
  const obraSalva = sessionStorage.getItem('cronograma_obra');
  const defaultObraId = initialObraId
    || (obras.some(o => o.id === obraSalva) ? obraSalva : null)
    || obras.find(o => o.status === 'em_andamento')?.id
    || obras[0]?.id
    || null;

  const [obraSel,      setObraSel]      = React.useState(defaultObraId);
  const [view,         setView]         = React.useState(() => sessionStorage.getItem('cronograma_view') || 'gantt');
  // Persistem a sub-aba e a obra na sessão para o F5 reabrir onde o usuário estava
  React.useEffect(() => { sessionStorage.setItem('cronograma_view', view); }, [view]);

  const abasCronograma = [
    { id: 'gantt', label: 'Gantt' },
    { id: 'lista', label: 'Lista' },
    { id: 'uso',   label: 'Uso da Tarefa' },
    { id: 'curva', label: 'Curva Física' },
    { id: 'fluxo', label: 'Fluxo Executivo' },
  ].filter(a => podeVerAba(userProfile, 'cronograma', a.id));

  // Se a sub-aba salva não estiver liberada para este usuário, cai na primeira permitida
  React.useEffect(() => {
    if (abasCronograma.length && !abasCronograma.some(a => a.id === view)) setView(abasCronograma[0].id);
  }, [abasCronograma, view]);
  React.useEffect(() => { if (obraSel) sessionStorage.setItem('cronograma_obra', obraSel); }, [obraSel]);
  const [etapas,       setEtapas]       = React.useState([]);
  const [customCols,   setCustomCols]   = React.useState(() => D.cronogramaCustomCols || []);
  const [baselines,    setBaselines]    = React.useState(() => carregarBaselines(defaultObraId || ''));
  const [blVisivelId,  setBlVisivelId]  = React.useState(null);
  const [reprogramacoes, setReprogramacoes] = React.useState(() => carregarReprogramacoes(defaultObraId || ''));
  const [repVisivelId,   setRepVisivelId]   = React.useState(() => defaultRepId(carregarReprogramacoes(defaultObraId || '')));
  const [showCriar,    setShowCriar]    = React.useState(false);
  const [showCriarRep,     setShowCriarRep]     = React.useState(false);
  const [showGerenciarRep, setShowGerenciarRep] = React.useState(false);
  // Cronograma iniciado mas ainda sem etapas: mostra o editor vazio sem gravar nada
  const [iniciando,    setIniciando]    = React.useState(false);
  const [showGerenciar, setShowGerenciar] = React.useState(false);
  const [outlineOpen,  setOutlineOpen]  = React.useState(false);
  // Feriados por obra (dias não trabalhados) — persistidos por obra no navegador.
  const [showFeriados, setShowFeriados] = React.useState(false);
  const [feriadosCfg,  setFeriadosCfg]  = React.useState({ dias: [], sabadoUtil: false });
  React.useEffect(() => {
    try { const raw = localStorage.getItem('ls_crono_feriados_' + obraSel); setFeriadosCfg(raw ? JSON.parse(raw) : { dias: [], sabadoUtil: false }); }
    catch { setFeriadosCfg({ dias: [], sabadoUtil: false }); }
  }, [obraSel]);
  // Salva explicitamente (evita corromper ao trocar de obra com um efeito keyed em obraSel).
  const saveFeriados = (next) => {
    setFeriadosCfg(next);
    try { localStorage.setItem('ls_crono_feriados_' + obraSel, JSON.stringify(next)); } catch { /* ignore */ }
    // Sincroniza no banco (coluna feriados) para valer entre usuários da mesma obra.
    // localStorage acima fica como cache/fallback instantâneo.
    salvarCronograma(obraSel, etapas, customCols, baselines, reprogramacoes, next).then(handleSaveResult);
  };
  // Aplica o calendário de trabalho (feriados/sábado) globalmente antes de renderizar os filhos,
  // para que término/barras/duração usem dias úteis. Roda no render (síncrono).
  React.useMemo(() => { setWorkCal(feriadosCfg); return feriadosCfg; }, [feriadosCfg]);
  const [loadedObraId, setLoadedObraId] = React.useState(null);
  // Bloqueio otimista: conflito quando outra sessão salvou o mesmo cronograma
  const [conflito,     setConflito]     = React.useState(false);
  const [reloadKey,    setReloadKey]    = React.useState(0);
  // Painel lateral de detalhes da tarefa selecionada
  const [detailId,     setDetailId]    = React.useState(null);
  const [detailTab,    setDetailTab]   = React.useState('detalhes');
  // Usuário logado (autor de anexos/comentários/eventos). Resolvido 1x via sessão.
  const [currentUser, setCurrentUser] = React.useState({ id: 'sistema', nome: 'Sistema', email: '', isAdmin: isAdmin(userProfile) });
  const currentUserRef = React.useRef(currentUser);
  currentUserRef.current = currentUser;
  React.useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const u = session?.user;
        if (!u) return;
        let nome = u.email;
        try {
          const { data: prof } = await usuariosService.buscarPorId(u.id);
          if (prof?.nome) nome = prof.nome;
        } catch { /* mantém email como nome */ }
        if (vivo) setCurrentUser({ id: u.id, nome, email: u.email, isAdmin: isAdmin(userProfile) });
      } catch { /* sem sessão: mantém "Sistema" */ }
    })();
    return () => { vivo = false; };
  }, [userProfile]);
  // Integração Orçamento × Cronograma
  const [vinculos,         setVinculos]         = React.useState([]);
  const [orcamentoItensMap, setOrcamentoItensMap] = React.useState({});
  // isLoading derivado: true quando obraSel existe mas ainda não terminou de carregar seus dados
  const isLoading = !!(obraSel && loadedObraId !== obraSel);

  // Histórico de undo/redo unificado (Lista + Gantt)
  const histRef = React.useRef([etapas.map(e => ({ ...e }))]);
  const hidxRef = React.useRef(0);
  const undoRef        = React.useRef(null);
  const redoRef        = React.useRef(null);
  const applyOutlineRef = React.useRef(null);
  const saveTimerRef   = React.useRef(null);

  // Carrega vínculos orçamento × cronograma para a obra selecionada
  React.useEffect(() => {
    if (!obraSel) { setVinculos([]); setOrcamentoItensMap({}); return; }
    if (_cronCache[obraSel]) return; // restaurado pelo efeito de carga (cache)
    vinculoService.listarPorObra(obraSel).then(({ data }) => {
      if (!data?.length) { setVinculos([]); setOrcamentoItensMap({}); return; }
      setVinculos(data);
      const m = {};
      data.forEach(v => {
        if (v.orcamento_itens) m[v.orcamento_item_id] = itemValor(v.orcamento_itens);
      });
      setOrcamentoItensMap(m);
    });
  }, [obraSel]);

  // Recarrega etapas, histórico e baselines ao trocar de obra (Supabase first, fallback para mock)
  React.useEffect(() => {
    let cancelled = false;
    setIniciando(false); // outra obra sem cronograma volta a exibir o empty-state
    async function carregar() {
      if (!obraSel) { setLoadedObraId(null); return; }
      // Cache da sessão: restaura na hora, sem rede nem reprocessamento
      const cached = _cronCache[obraSel];
      if (cached) {
        setEtapas(cached.etapas);
        setCustomCols(cached.customCols);
        setBaselines(cached.baselines);
        setReprogramacoes(cached.reprogramacoes || []);
        setVinculos(cached.vinculos);
        setOrcamentoItensMap(cached.orcamentoItensMap);
        histRef.current = [cached.etapas.map(e => ({ ...e }))];
        hidxRef.current = 0;
        setBlVisivelId(null);
        setRepVisivelId(defaultRepId(cached.reprogramacoes || []));
        setLoadedObraId(obraSel);
        return;
      }
      // isLoading já é true sincronamente quando obraSel muda — sem necessidade de setState extra
      const db = await carregarCronogramaDB(obraSel);
      if (cancelled) return;
      // Sanitiza restrições com tipo definido mas sem data (estado inválido de bug anterior)
      // e re-aplica scheduling para recuperar posições corrompidas
      const sanitizarERecuperar = (lista) => {
        const sem_data = lista.map(e =>
          (e.restricaoTipo && e.restricaoTipo !== 'asap' && !e.restricaoData)
            ? { ...e, restricaoTipo: 'asap' }
            : e
        );
        return autoScheduleFromDeps(sem_data);
      };

      if (db) {
        const etapasDB = sanitizarERecuperar(migrateEtapas(db.etapas || []));
        setEtapas(etapasDB);
        D.cronograma[obraSel] = etapasDB;
        histRef.current = [etapasDB.map(e => ({ ...e }))];
        hidxRef.current = 0;
        if (db.custom_cols?.length) {
          setCustomCols(db.custom_cols);
          D.cronogramaCustomCols = db.custom_cols;
        }
        const bls = db.baselines?.length ? db.baselines : carregarBaselines(obraSel);
        setBaselines(bls);
        if (db.baselines?.length) salvarBaselines(obraSel, db.baselines);
        const reps = db.reprogramacoes?.length ? db.reprogramacoes : carregarReprogramacoes(obraSel);
        setReprogramacoes(reps);
        if (db.reprogramacoes?.length) salvarReprogramacoesLocal(obraSel, db.reprogramacoes);
        setRepVisivelId(defaultRepId(reps));
        // Feriados: DB é a fonte de verdade quando tem conteúdo; senão mantém o valor do
        // localStorage (setado no efeito keyed em obraSel) para migração suave.
        if (db.feriados && (db.feriados.dias?.length || db.feriados.sabadoUtil)) setFeriadosCfg(db.feriados);
      } else {
        const mock = sanitizarERecuperar(migrateEtapas(D.cronograma[obraSel] || []));
        setEtapas(mock);
        histRef.current = [mock.map(e => ({ ...e }))];
        hidxRef.current = 0;
        setBaselines(carregarBaselines(obraSel));
        const reps = carregarReprogramacoes(obraSel);
        setReprogramacoes(reps);
        setRepVisivelId(defaultRepId(reps));
      }
      setBlVisivelId(null);
      setLoadedObraId(obraSel); // marca carga concluída — isLoading vira false
    }
    setConflito(false);   // recarregou do banco: baseline atualizada, conflito resolvido
    carregar();
    return () => { cancelled = true; };
  }, [obraSel, reloadKey]);

  // Mantém o cache da obra espelhando o estado atual (inclui edições), para voltar instantâneo
  React.useEffect(() => {
    if (loadedObraId && loadedObraId === obraSel) {
      _cronCache[loadedObraId] = { etapas, customCols, baselines, reprogramacoes, vinculos, orcamentoItensMap };
    }
  }, [etapas, customCols, baselines, reprogramacoes, vinculos, orcamentoItensMap, loadedObraId, obraSel]);

  // Trata o resultado de salvarCronograma (bloqueio otimista): conflito ou erro.
  // Retorna true quando houve problema (o chamador não deve exibir "sucesso").
  const handleSaveResult = (res) => {
    if (res?.conflict) {
      setConflito(true);
      toast('Este cronograma foi alterado por outra pessoa. Recarregue para ver a versão atual antes de continuar.', { tone: 'warning', icon: 'alert-triangle' });
      return true;
    }
    if (res?.error) {
      toast('Falha ao salvar o cronograma. Suas mudanças podem não ter sido gravadas.', { tone: 'danger', icon: 'alert-triangle' });
      return true;
    }
    return false;
  };

  // Descarta o estado local e recarrega do banco (resolve o conflito reconciliando pela versão do servidor).
  const recarregarCronograma = () => {
    delete _cronCache[obraSel];
    delete _cronSavedAt[obraSel];
    setConflito(false);
    setReloadKey(k => k + 1);
  };

  // Handlers de linha de base
  const criarLinha = (nome) => {
    const nova = {
      id: 'BL-' + Date.now(),
      nome,
      criadaEm: new Date().toISOString().slice(0, 10),
      etapas: etapas.map(e => ({ ...e })),
    };
    const novas = [...baselines, nova];
    setBaselines(novas);
    salvarBaselines(obraSel, novas);
    salvarCronograma(obraSel, etapas, customCols, novas, reprogramacoes).then(handleSaveResult);
    toast(`Linha de base "${nome}" criada`, { tone: 'success', icon: 'check' });
  };

  const atualizarLinha = (id, nome) => {
    const novas = baselines.map(b =>
      b.id === id
        ? { ...b, nome, criadaEm: new Date().toISOString().slice(0, 10), etapas: etapas.map(e => ({ ...e })) }
        : b
    );
    setBaselines(novas);
    salvarBaselines(obraSel, novas);
    salvarCronograma(obraSel, etapas, customCols, novas, reprogramacoes).then(handleSaveResult);
    toast(`Linha de base "${nome}" atualizada`, { tone: 'success', icon: 'check' });
  };

  const excluirLinha = (id) => {
    const novas = baselines.filter(b => b.id !== id);
    setBaselines(novas);
    salvarBaselines(obraSel, novas);
    salvarCronograma(obraSel, etapas, customCols, novas, reprogramacoes).then(handleSaveResult);
    if (blVisivelId === id) setBlVisivelId(null);
    toast('Linha de base excluída', { tone: 'neutral', icon: 'check' });
  };

  const duplicarLinha = (id) => {
    const orig = baselines.find(b => b.id === id);
    if (!orig) return;
    const copia = { ...orig, id: 'BL-' + Date.now(), nome: orig.nome + ' (cópia)', etapas: orig.etapas.map(e => ({ ...e })) };
    const novas = [...baselines, copia];
    setBaselines(novas);
    salvarBaselines(obraSel, novas);
    salvarCronograma(obraSel, etapas, customCols, novas, reprogramacoes).then(handleSaveResult);
    toast(`"${copia.nome}" criada`, { tone: 'success', icon: 'check' });
  };

  // Handlers de reprogramação (retrato imutável — sem sobrescrever/duplicar)
  const criarReprogramacao = (nome) => {
    const nova = {
      id: 'RP-' + Date.now(),
      nome,
      criadaEm: new Date().toISOString().slice(0, 10),
      etapas: etapas.map(e => ({ ...e })),
    };
    const novas = [...reprogramacoes, nova];
    setReprogramacoes(novas);
    salvarReprogramacoesLocal(obraSel, novas);
    salvarCronograma(obraSel, etapas, customCols, baselines, novas).then(handleSaveResult);
    setRepVisivelId(nova.id);
    toast(`Reprogramação "${nome}" salva`, { tone: 'success', icon: 'check' });
  };

  const excluirReprogramacao = (id) => {
    const novas = reprogramacoes.filter(r => r.id !== id);
    setReprogramacoes(novas);
    salvarReprogramacoesLocal(obraSel, novas);
    salvarCronograma(obraSel, etapas, customCols, baselines, novas).then(handleSaveResult);
    if (repVisivelId === id) setRepVisivelId(defaultRepId(novas));
    toast('Reprogramação excluída', { tone: 'neutral', icon: 'check' });
  };

  const handleCustomColsChange = (novasCols) => {
    setCustomCols(novasCols);
    D.cronogramaCustomCols = novasCols;
    salvarCronograma(obraSel, etapas, novasCols, baselines, reprogramacoes).then(handleSaveResult);
  };

  // Etapas da baseline visível (null = nenhuma)
  const baselineEtapas = blVisivelId ? (baselines.find(b => b.id === blVisivelId)?.etapas || null) : null;

  const obra       = obras.find(o => o.id === obraSel) || obras[0];
  const concluidas = etapas.filter(e => effStatus(e) === 'done').length;
  const atrasadas  = etapas.filter(e => effStatus(e) === 'late').length;

  // Pesos vinculados ao orçamento — quando existem, substituem custo na Curva S e no avanço
  const valorVinculadoMapFull = React.useMemo(
    () => computeValorVinculadoMap(etapas, vinculos, orcamentoItensMap),
    [etapas, vinculos, orcamentoItensMap]
  );
  const weightOverride = vinculos.length > 0 ? valorVinculadoMapFull : null;

  // Avanço ponderado pelo custo de cada etapa (folhas). Com vínculos, usa o valor vinculado.
  const avancoTotal = React.useMemo(() => {
    const folhas    = etapas.filter(e => !e.isGroup);
    if (!folhas.length) return 0;
    const peso = (e) => vinculos.length ? (valorVinculadoMapFull[e.id] || 0) : (e.custo || 0);
    const totalPeso = folhas.reduce((s, e) => s + peso(e), 0);
    if (!totalPeso) return Math.round(folhas.reduce((s, e) => s + e.avanco, 0) / folhas.length);
    return Math.round(folhas.reduce((s, e) => s + e.avanco * peso(e), 0) / totalPeso);
  }, [etapas, vinculos, valorVinculadoMapFull]);

  // Distribuição mensal de custos — alimenta Uso da Tarefa e Curva S
  const months      = React.useMemo(() => getMonthRange(etapas),                           [etapas]);
  const monthlyDist = React.useMemo(() => computeMonthlyDist(etapas, weightOverride),      [etapas, weightOverride]);
  const monthlyTotals = React.useMemo(() => {
    const t = {};
    Object.values(monthlyDist).forEach(d =>
      Object.entries(d).forEach(([k, v]) => { t[k] = (t[k] || 0) + v; })
    );
    return t;
  }, [monthlyDist]);
  const realizedTotals = React.useMemo(() => computeRealizedDist(etapas, weightOverride), [etapas, weightOverride]);

  // ── Commit (fonte única de verdade) ────────────────────────────────────────
  const commit = (novas, opts = {}) => {
    const clean = novas.map(e => ({ ...e }));
    // Auto-histórico: registra mudanças relevantes por tarefa (fora do undo/redo)
    taskDetailStore.diffAndLog(obraSel, etapas, clean, currentUserRef.current);
    const h = histRef.current.slice(0, hidxRef.current + 1);
    h.push(clean);
    histRef.current = h;
    hidxRef.current = h.length - 1;
    setEtapas(clean);
    D.cronograma[obraSel] = clean;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    // O toast reflete o RESULTADO real da persistência (após o await), não a intenção.
    saveTimerRef.current = setTimeout(async () => {
      const res = await salvarCronograma(obraSel, clean, customCols, baselines, reprogramacoes);
      if (handleSaveResult(res)) return;   // conflito ou erro: sempre avisa (mesmo em save silencioso)
      if (opts.silent) return;
      const cfls = gmConflicts(clean);
      if (cfls.length > 0) {
        toast(`Salvo com ${cfls.length} conflito(s) de precedência`, { tone: 'warning', icon: 'alert-triangle' });
      } else {
        toast('Cronograma atualizado', { tone: 'success', icon: 'check' });
      }
    }, 800);
  };

  const undo = () => {
    if (hidxRef.current <= 0) { toast('Nada para desfazer', { tone: 'neutral', icon: 'alert' }); return; }
    hidxRef.current--;
    const snap = histRef.current[hidxRef.current].map(e => ({ ...e }));
    setEtapas(snap);
    D.cronograma[obraSel] = snap;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      handleSaveResult(await salvarCronograma(obraSel, snap, customCols, baselines, reprogramacoes));
    }, 800);
    toast('Ação desfeita', { tone: 'neutral', icon: 'check' });
  };

  const redo = () => {
    if (hidxRef.current >= histRef.current.length - 1) { toast('Nada para refazer', { tone: 'neutral', icon: 'alert' }); return; }
    hidxRef.current++;
    const snap = histRef.current[hidxRef.current].map(e => ({ ...e }));
    setEtapas(snap);
    D.cronograma[obraSel] = snap;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      handleSaveResult(await salvarCronograma(obraSel, snap, customCols, baselines, reprogramacoes));
    }, 800);
    toast('Ação refeita', { tone: 'neutral', icon: 'check' });
  };

  // Colapsa/expande toda a hierarquia até o nível N (0 = expandir tudo)
  const applyOutlineLevel = (level) => {
    const novas = etapas.map(e => {
      if (!e.isGroup) return e;
      return { ...e, collapsed: level > 0 && e.nivel >= level - 1 };
    });
    commit(novas, { silent: true });
  };

  // Refs para evitar closures stale no listener de teclado
  undoRef.current = undo;
  redoRef.current = redo;
  applyOutlineRef.current = applyOutlineLevel;

  // Atalho Ctrl+Z / Ctrl+Y global (funciona em qualquer aba do módulo)
  React.useEffect(() => {
    const h = (e) => {
      if (readOnly) return;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undoRef.current(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redoRef.current(); }
      if (e.altKey && e.shiftKey && e.key === '*') { e.preventDefault(); applyOutlineRef.current(0); }
      if (e.altKey && e.shiftKey && (e.key === '-' || e.key === '_')) { e.preventDefault(); applyOutlineRef.current(1); }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [readOnly]);

  React.useEffect(() => {
    if (!outlineOpen) return;
    const h = () => setOutlineOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [outlineOpen]);

  return (
    <>
      {conflito && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
          <Icon name="alert-triangle" size={16} style={{ color: '#b45309', flexShrink: 0 }} />
          <span style={{ flex: 1 }}>Este cronograma foi alterado por outra pessoa. Recarregue para ver a versão atual (suas edições não salvas serão descartadas).</span>
          <button onClick={recarregarCronograma} style={{ background: '#b45309', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>Recarregar</button>
        </div>
      )}
      <div className="page-header">
        <div>
          <h1 className="page-title">Cronogramas</h1>
          <div className="page-subtitle">Planejamento físico das obras · Gantt interativo com replanejamento direto</div>
        </div>
        <div className="page-actions">
          <select className="input" value={obraSel || ''} onChange={e => setObraSel(e.target.value)} style={{ minWidth: 200 }}>
            {!obraSel && <option value="">Selecione uma obra</option>}
            {obras.map(o => (
              <option key={o.id} value={o.id}>{o.nome} ({o.id})</option>
            ))}
          </select>
          {/* Estrutura de Tópicos — controle de nível da EAP */}
          <div style={{ position: 'relative' }} onMouseDown={e => e.stopPropagation()}>
            <button className="btn btn-ghost" onClick={() => setOutlineOpen(o => !o)} style={{ gap: 6 }}>
              <Icon name="layers" size={15} />
              Estrutura {outlineOpen ? '▲' : '▼'}
            </button>
            {outlineOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', right: 0,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 8, boxShadow: 'var(--shadow-md)',
                minWidth: 170, zIndex: 200, padding: '4px 0',
              }}>
                {[
                  { label: 'Expandir Tudo', level: 0 },
                  { label: 'Recolher Tudo', level: 1 },
                  null,
                  ...[1,2,3,4,5,6,7,8,9].map(n => ({ label: `Nível ${n}`, level: n })),
                ].map((item, i) =>
                  item === null
                    ? <div key={i} style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                    : <button key={item.label}
                        onClick={() => { applyOutlineLevel(item.level); setOutlineOpen(false); }}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: '7px 14px', border: 'none', background: 'none',
                          cursor: 'pointer', fontSize: 13, color: 'var(--text)',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-muted)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                      >
                        {item.label}
                      </button>
                )}
              </div>
            )}
          </div>
          <div className="segmented">
            {abasCronograma.map(a => (
              <button key={a.id} className={view === a.id ? 'active' : ''} onClick={() => setView(a.id)}>{a.label}</button>
            ))}
          </div>
          {baselines.length > 0 && (
            <select className="input" style={{ minWidth: 180 }}
              value={blVisivelId || ''}
              onChange={e => setBlVisivelId(e.target.value || null)}
            >
              <option value="">Sem linha de base</option>
              {baselines.map(b => (
                <option key={b.id} value={b.id}>{b.nome}</option>
              ))}
            </select>
          )}
          {!readOnly && (
            <button className="btn btn-ghost" onClick={() => setShowCriar(true)}>
              <Icon name="bookmark" size={15} />Criar Linha de Base
            </button>
          )}
          {baselines.length > 0 && !readOnly && (
            <button className="btn btn-ghost" onClick={() => setShowGerenciar(true)}>
              <Icon name="layers" size={15} />Gerenciar
            </button>
          )}
          {reprogramacoes.length > 0 && (
            <select className="input" style={{ minWidth: 200 }}
              value={repVisivelId || ''}
              onChange={e => setRepVisivelId(e.target.value || null)}
              title="Reprogramação comparada na Curva Física"
            >
              <option value="">Sem reprogramação</option>
              {reprogramacoes.map(r => (
                <option key={r.id} value={r.id}>{r.nome}</option>
              ))}
            </select>
          )}
          {!readOnly && (
            <button className="btn btn-ghost" onClick={() => setShowCriarRep(true)}>
              <Icon name="clock" size={15} />Salvar Reprogramação
            </button>
          )}
          {reprogramacoes.length > 0 && !readOnly && (
            <button className="btn btn-ghost" onClick={() => setShowGerenciarRep(true)}>
              <Icon name="layers" size={15} />Gerenciar
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => setShowFeriados(true)} title="Cadastrar feriados / dias não trabalhados">
            <Icon name="calendar" size={15} />Feriados
          </button>
          <button className="btn btn-ghost"><Icon name="download" size={15} />Exportar</button>
        </div>
      </div>

      {isLoading
        ? <div className="text-muted" style={{ padding: 64, textAlign: 'center' }}>Carregando…</div>
        : !obraSel || (etapas.length === 0 && !iniciando)
          ? (
            <div className="card" style={{ marginTop: 'var(--gap)', padding: '72px 24px', textAlign: 'center' }}>
              <div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--brand-tint)', color: 'var(--brand)',
                            display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
                <Icon name="calendar" size={28} />
              </div>
              <h2 style={{ margin: '0 0 6px', fontSize: 18 }}>Nenhum cronograma criado</h2>
              <div className="text-muted" style={{ maxWidth: 400, margin: '0 auto 20px', fontSize: 13.5 }}>
                Esta obra ainda não possui cronograma. Adicione a primeira etapa para começar o planejamento.
              </div>
              {obraSel && !readOnly && (
                <button className="btn btn-primary" onClick={() => {
                  // Entra no editor vazio sem criar/gravar etapa. As etapas são
                  // adicionadas pelo usuário via "Adicionar tarefa", que persiste.
                  setIniciando(true);
                  setView('lista');
                }}>
                  <Icon name="plus" size={15} />Criar cronograma
                </button>
              )}
            </div>
          )
          : (
            <>
              {/* KPIs — faixa de 5 (redesenho handoff). Dados reais onde há; mock sinalizado. */}
              {(() => {
                const leaves = etapas.filter(e => !e.isGroup);
                const pesoDe = (e) => weightOverride ? (weightOverride[e.id] || 0) : (e.custo || 0);
                const custoPrev = leaves.reduce((s, e) => s + pesoDe(e), 0);
                // Custo incorrido = valor agregado (avanço × peso) — proxy de earned value
                const custoReal = leaves.reduce((s, e) => s + (e.avanco || 0) / 100 * pesoDe(e), 0);
                const custoPct = custoPrev > 0 ? Math.round(custoReal / custoPrev * 100) : 0;
                // Previsto acumulado até hoje, a partir da distribuição mensal já computada
                const totalPlan = Object.values(monthlyTotals).reduce((s, v) => s + v, 0);
                const todayKey = new Date().toISOString().slice(0, 7);
                const planToDate = Object.entries(monthlyTotals).reduce((s, [k, v]) => k <= todayKey ? s + v : s, 0);
                const plannedPct = totalPlan > 0 ? Math.round(planToDate / totalPlan * 100) : 0;
                const deltaPp = avancoTotal - plannedPct;
                // Término projetado = maior data de término das tarefas (real). Comparação com base = TODO.
                const maxEnd = leaves.length ? Math.max(...leaves.map(e => taskEnd(e))) : 0;
                const termino = leaves.length ? offsetToDate(maxEnd).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }) : '—';
                // ── Derivações por-view da Curva Física (aba view === 'curva') ────────
                const mesAtual     = todayKey; // "YYYY-MM" do mês corrente
                const realAcum     = Object.entries(realizedTotals).reduce((s, [k, v]) => k <= mesAtual ? s + v : s, 0);
                const incorridoTot = Object.values(realizedTotals).reduce((s, v) => s + v, 0);
                const previstoPct  = plannedPct; // planToDate / totalPlan (%)
                const prodMesPct   = totalPlan > 0 ? Math.round((realizedTotals[mesAtual] || 0) / totalPlan * 100) : 0;
                const planMesPct   = totalPlan > 0 ? Math.round((monthlyTotals[mesAtual] || 0) / totalPlan * 100) : 0;
                const deltaMesPp   = prodMesPct - planMesPct;
                const desvioPp     = totalPlan > 0 ? (Math.round(realAcum / totalPlan * 100) - previstoPct) : 0;
                const incorridoPct = totalPlan > 0 ? Math.round(incorridoTot / totalPlan * 100) : 0;
                const nowCurva     = new Date();
                const mesLabel     = nowCurva.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') + '/' + String(nowCurva.getFullYear()).slice(2);
                // TODO: delta de dias do término projetado vs linha de base — sem baseline no pipeline (mock).
                const terminoDeltaDias = 22;
                return (
                  view === 'curva' ? (
                  <div className="kpi-grid cols-5">
                    <div className="kpi" style={{ padding: '18px 20px' }}>
                      <div className="kpi-label">Avanço realizado</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                        <div className="kpi-value num" style={{ fontSize: 30 }}>{avancoTotal}<span className="unit">%</span></div>
                        <span style={{ color: deltaPp < 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 600, fontSize: 12 }}>{deltaPp >= 0 ? '+' : ''}{deltaPp} pp vs previsto</span>
                      </div>
                      <div className="kpi-bar"><span className="kpi-bar-fill" style={{ width: avancoTotal + '%' }} /><span className="kpi-bar-target" style={{ left: previstoPct + '%' }} /></div>
                      <div className="kpi-foot" style={{ marginTop: 6 }}><span className="kpi-foot-text">realizado × previsto ({previstoPct}%)</span></div>
                    </div>
                    <div className="kpi" style={{ padding: '18px 20px' }}>
                      <div className="kpi-label">Produção do mês</div>
                      <div className="kpi-value num" style={{ fontSize: 30, marginTop: 4 }}>{prodMesPct}<span className="unit">%</span></div>
                      <div className="kpi-foot" style={{ marginTop: 6 }}>
                        <span style={{ color: '#d97706', fontWeight: 600 }}>{deltaMesPp >= 0 ? '+' : ''}{deltaMesPp} pp</span>
                        <span className="kpi-foot-text"> vs planejado ({planMesPct}%)</span>
                      </div>
                      <div className="kpi-foot" style={{ marginTop: 2, textTransform: 'capitalize' }}><span className="kpi-foot-text">{mesLabel} · mês corrente</span></div>
                    </div>
                    <div className="kpi risk" style={{ padding: '18px 20px' }}>
                      <div className="kpi-label">Desvio acumulado</div>
                      <div className="kpi-value num" style={{ fontSize: 30, marginTop: 4, color: 'var(--danger)' }}>{desvioPp >= 0 ? '+' : ''}{desvioPp}<span className="unit">pp</span></div>
                      <div className="kpi-foot" style={{ marginTop: 6 }}><span className="kpi-foot-text" style={{ color: desvioPp < 0 ? 'var(--danger)' : undefined }}>{desvioPp < 0 ? 'obra atrasada' : 'obra no prazo'}</span></div>
                    </div>
                    <div className="kpi" style={{ padding: '18px 20px' }}>
                      <div className="kpi-label">Custo planejado</div>
                      <div className="kpi-value num" style={{ fontSize: 28, marginTop: 4 }}>{D.brl(totalPlan, { compact: true })}</div>
                      <div className="kpi-bar"><span className="kpi-bar-fill ok" style={{ width: incorridoPct + '%' }} /></div>
                      <div className="kpi-foot" style={{ marginTop: 6 }}><span className="kpi-foot-text">{D.brl(incorridoTot, { compact: true })} incorridos ({incorridoPct}%)</span></div>
                    </div>
                    <div className="kpi" style={{ padding: '18px 20px' }}>
                      <div className="kpi-label">Término projetado</div>
                      <div className="kpi-value num" style={{ fontSize: 26, marginTop: 4, textTransform: 'capitalize' }}>{termino}</div>
                      {/* TODO: delta de dias vs linha de base — sem baseline no pipeline; valor mockado */}
                      <div className="kpi-foot" style={{ marginTop: 6 }}><span style={{ color: '#d97706', fontWeight: 600 }}>+{terminoDeltaDias} dias</span><span className="kpi-foot-text"> vs planejado</span></div>
                    </div>
                  </div>
                  ) : (
                <div className="kpi-grid cols-5">
                  <div className="kpi" style={{ padding: '18px 20px' }}>
                    <div className="kpi-label">Avanço físico</div>
                    <div className="kpi-value num" style={{ fontSize: 30, marginTop: 4 }}>{avancoTotal}<span className="unit">%</span></div>
                    <div className="kpi-bar"><span className="kpi-bar-fill" style={{ width: avancoTotal + '%' }} /><span className="kpi-bar-target" style={{ left: plannedPct + '%' }} /></div>
                    <div className="kpi-foot" style={{ marginTop: 6 }}>
                      <span style={{ color: deltaPp < 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>{deltaPp >= 0 ? '+' : ''}{deltaPp} pp</span>
                      <span className="kpi-foot-text"> vs previsto ({plannedPct}%)</span>
                    </div>
                  </div>
                  <div className="kpi" style={{ padding: '18px 20px' }}>
                    <div className="kpi-label">Custo incorrido</div>
                    <div className="kpi-value num" style={{ fontSize: 28, marginTop: 4 }}>{D.brl(custoReal, { compact: true })}</div>
                    <div className="kpi-bar"><span className="kpi-bar-fill ok" style={{ width: custoPct + '%' }} /></div>
                    <div className="kpi-foot" style={{ marginTop: 6 }}><span className="kpi-foot-text">de {D.brl(custoPrev, { compact: true })} previstos ({custoPct}%)</span></div>
                  </div>
                  <div className="kpi" style={{ padding: '18px 20px' }}>
                    <div className="kpi-label">Término projetado</div>
                    <div className="kpi-value num" style={{ fontSize: 26, marginTop: 4, textTransform: 'capitalize' }}>{termino}</div>
                    {/* TODO: comparar com a linha de base (delta de dias) quando houver baseline selecionada */}
                    <div className="kpi-foot" style={{ marginTop: 6 }}><span className="kpi-foot-text">maior término entre as tarefas</span></div>
                  </div>
                  <div className="kpi risk" style={{ padding: '18px 20px' }}>
                    <div className="kpi-label">Etapas atrasadas</div>
                    <div className="kpi-value num" style={{ fontSize: 30, marginTop: 4, color: 'var(--danger)' }}>{atrasadas}</div>
                    <div className="kpi-foot" style={{ marginTop: 6 }}><span className="kpi-foot-text">{atrasadas === 0 ? 'nenhuma tarefa atrasada' : 'status = atrasada'}</span></div>
                  </div>
                  <div className="kpi" style={{ padding: '18px 20px' }}>
                    <div className="kpi-label">Folga total</div>
                    {/* TODO: calcular folga/caminho crítico (CPM) — não há esse cálculo no pipeline hoje */}
                    <div className="kpi-value num" style={{ fontSize: 30, marginTop: 4, color: 'var(--text-faint)' }}>—</div>
                    <div className="kpi-foot" style={{ marginTop: 6 }}><span className="kpi-foot-text">requer cálculo de caminho crítico</span></div>
                  </div>
                </div>
                  )
                );
              })()}

              {view === 'gantt' && (() => {
                const detailTask = detailId ? etapas.find(e => e.id === detailId) : null;
                const dtStatus = detailTask ? effStatus(detailTask) : null;
                const dtColor = detailTask
                  ? (dtStatus === 'done' ? '#1b8f5e' : dtStatus === 'late' ? '#c0281f' : dtStatus === 'upcoming' ? '#3d7fc9' : 'var(--brand)')
                  : 'var(--brand)';
                return (
                  <div style={{ display: 'flex', gap: 'var(--gap)', marginTop: 'var(--gap)', alignItems: 'flex-start' }}>
                    {/* Card do Gantt */}
                    <div className="card" style={{ flex: 1, minWidth: 0 }}>
                      <div className="card-header">
                        <div>
                          <div className="card-title">{obra.nome} · Gantt interativo</div>
                          <div className="card-subtitle">{etapas.length} etapas · {GM_TOTAL} meses · arraste as barras para replanejar</div>
                        </div>
                        <div className="card-actions">
                          <div className="legend">
                            <span className="legend-item"><span className="legend-swatch" style={{ background: '#16a34a' }}></span>Concluída</span>
                            <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--brand)' }}></span>Em execução</span>
                            <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--danger)' }}></span>Atrasada</span>
                            <span className="legend-item"><span className="legend-swatch" style={{ background: '#60a5fa' }}></span>Futura</span>
                            <span className="legend-item"><span className="legend-swatch" style={{ background: 'transparent', border: '1.5px solid #d97706' }}></span>Conflito</span>
                            <span className="legend-item"><span className="legend-swatch" style={{ width: 10, height: 10, background: '#1e293b', transform: 'rotate(45deg)', borderRadius: 2 }}></span>Marco</span>
                            {baselineEtapas && (
                              <span className="legend-item"><span className="legend-swatch" style={{ background: 'rgba(107,120,144,0.55)', height: 4 }}></span>Linha de base</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="card-body" style={{ padding: 0 }}>
                        <GanttInterativo key={obraSel} obraId={obraSel} etapas={etapas} onCommit={commit} undo={undo} redo={redo} baselineEtapas={baselineEtapas} feriadosCfg={feriadosCfg} onTaskSelect={id => { setDetailId(prev => prev === id ? null : id); setDetailTab('detalhes'); }} readOnly={readOnly} />
                      </div>
                    </div>

                    {/* Painel lateral de detalhes */}
                    {detailTask && (
                      <div style={{
                        width: 400, flexShrink: 0, background: 'var(--surface)',
                        border: '1px solid var(--border)', borderRadius: 'var(--r-lg)',
                        boxShadow: 'var(--shadow-md)', overflow: 'hidden',
                      }}>
                        {/* Cabeçalho do painel */}
                        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div title={detailTask.etapa} style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3, marginBottom: 4 }}>
                              {detailTask.etapa}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
                              EAP {detailTask.displayId ?? detailTask.id}
                            </div>
                          </div>
                          <button onClick={() => setDetailId(null)}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 6, fontSize: 16, lineHeight: 1, flexShrink: 0 }}>
                            ×
                          </button>
                        </div>

                        {/* Tabs */}
                        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 20px' }}>
                          {['detalhes', 'anexos', 'histórico'].map(tab => (
                            <button key={tab} onClick={() => setDetailTab(tab)}
                              style={{
                                border: 'none', background: 'none', cursor: 'pointer',
                                padding: '10px 12px 8px', fontSize: 12, fontWeight: detailTab === tab ? 600 : 400,
                                color: detailTab === tab ? 'var(--brand)' : 'var(--text-muted)',
                                borderBottom: detailTab === tab ? '2px solid var(--brand)' : '2px solid transparent',
                                textTransform: 'capitalize', transition: 'color 0.12s',
                              }}>
                              {tab.charAt(0).toUpperCase() + tab.slice(1)}
                            </button>
                          ))}
                        </div>

                        <div style={{ padding: '16px 20px', overflowY: 'auto', maxHeight: 'calc(100vh - 320px)' }}>
                          {detailTab === 'anexos' ? (
                            <AnexosTab obraId={obraSel} taskId={detailTask.id} currentUser={currentUser} />
                          ) : detailTab === 'histórico' ? (
                            <HistoricoTab obraId={obraSel} taskId={detailTask.id} currentUser={currentUser} />
                          ) : (
                            <>
                              {/* Datas e duração */}
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 14px', marginBottom: 16 }}>
                                {[
                                  ['Início', isoToBR(offsetToISO(detailTask.inicio))],
                                  ['Término', isoToBR(offsetToISO(taskEnd(detailTask)))],
                                  ['Duração', `${detailTask.dur} dias`],
                                  ['EAP', detailTask.displayId ?? detailTask.id],
                                ].map(([label, val]) => (
                                  <div key={label}>
                                    <div style={{ fontSize: 10.5, color: 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>{label}</div>
                                    <div style={{ fontSize: 12.5, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{val}</div>
                                  </div>
                                ))}
                              </div>

                              <div style={{ height: 1, background: 'var(--border)', margin: '12px 0' }} />

                              {/* Progresso físico */}
                              <div style={{ marginBottom: 12 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                  <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 500 }}>Progresso físico</span>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: dtColor, fontFamily: 'var(--font-mono)' }}>{detailTask.avanco}%</span>
                                </div>
                                <div style={{ height: 6, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${detailTask.avanco}%`, background: dtColor, borderRadius: 4, transition: 'width 0.3s' }} />
                                </div>
                              </div>

                              <div style={{ height: 1, background: 'var(--border)', margin: '12px 0' }} />

                              {/* Custo */}
                              {detailTask.custo > 0 && (
                                <div style={{ marginBottom: 12 }}>
                                  <div style={{ fontSize: 10.5, color: 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Custo orçado</div>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(detailTask.custo)}
                                  </div>
                                </div>
                              )}

                              {/* Responsável */}
                              {detailTask.responsavel && (
                                <div style={{ marginBottom: 12 }}>
                                  <div style={{ fontSize: 10.5, color: 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Responsável</div>
                                  <div style={{ fontSize: 12.5, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--brand-tint)', color: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
                                      {detailTask.responsavel.split(' ').slice(0, 2).map(n => n[0]).join('')}
                                    </div>
                                    {detailTask.responsavel}
                                  </div>
                                </div>
                              )}

                              {/* Status */}
                              <div style={{ marginBottom: 16 }}>
                                <div style={{ fontSize: 10.5, color: 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Status</div>
                                <span style={{
                                  display: 'inline-block', fontSize: 11.5, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                                  background: dtStatus === 'done' ? '#e5f3ec' : dtStatus === 'late' ? '#fbe6e4' : 'var(--brand-tint)',
                                  color: dtColor,
                                }}>
                                  {dtStatus === 'done' ? 'Concluída' : dtStatus === 'late' ? 'Atrasada' : dtStatus === 'upcoming' ? 'Planejada' : 'Em execução'}
                                </span>
                              </div>

                              {/* Dependências */}
                              {(detailTask.dep || []).length > 0 && (
                                <>
                                  <div style={{ height: 1, background: 'var(--border)', margin: '12px 0' }} />
                                  <div style={{ fontSize: 10.5, color: 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Dependências</div>
                                  {detailTask.dep.map((dep, di) => {
                                    const depId = typeof dep === 'string' ? dep : dep.id;
                                    const depTipo = typeof dep === 'string' ? 'TI' : (dep.tipo || 'TI');
                                    const depTask = etapas.find(e => e.id === depId);
                                    return (
                                      <div key={di} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 12 }}>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--brand)', background: 'var(--brand-tint)', padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>{depId}</span>
                                        <span title={depTask?.etapa || depId} style={{ flex: 1, minWidth: 0, color: 'var(--text-soft)', fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{depTask?.etapa || depId}</span>
                                        <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{depTipo}</span>
                                      </div>
                                    );
                                  })}
                                </>
                              )}

                              {/* Botão Editar */}
                              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                                <button className="btn btn-ghost"
                                  style={{ width: '100%', justifyContent: 'center', gap: 6, fontSize: 12.5 }}
                                  onClick={() => { setView('lista'); setDetailId(null); }}>
                                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                  </svg>
                                  Editar tarefa
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {view === 'curva' && (
                <CurvaFisicaView
                  etapas={etapas}
                  months={months}
                  monthlyDist={monthlyDist}
                  realizedTotals={realizedTotals}
                  baselines={baselines}
                  blVisivelId={blVisivelId}
                  reprogramacoes={reprogramacoes}
                  repVisivelId={repVisivelId}
                  valorVinculadoMap={valorVinculadoMapFull}
                  onCommit={commit}
                />
              )}

              {view === 'lista' && (
                <ListaInterativa
                  etapas={etapas}
                  onCommit={commit}
                  customCols={customCols}
                  onCustomColsChange={handleCustomColsChange}
                  obraId={obraSel}
                  undo={undo}
                  redo={redo}
                  vinculos={vinculos}
                  orcamentoItensMap={orcamentoItensMap}
                  readOnly={readOnly}
                />
              )}

              {view === 'uso' && (
                <UsoTarefaView etapas={etapas} months={months} monthlyDist={monthlyDist} obraId={obraSel} valorVinculadoMap={valorVinculadoMapFull} />
              )}

              {view === 'fluxo' && (
                <FluxoExecutivo etapas={etapas} onCommit={commit} obraId={obraSel} />
              )}
            </>
          )
      }

      {showCriar && (
        <CriarLinhaModal
          baselines={baselines}
          totalEtapas={etapas.length}
          onClose={() => setShowCriar(false)}
          onCreate={criarLinha}
          onUpdate={atualizarLinha}
        />
      )}

      {showGerenciar && (
        <GerenciarLinhasModal
          baselines={baselines}
          blVisivelId={blVisivelId}
          onSelect={setBlVisivelId}
          onDuplicar={duplicarLinha}
          onExcluir={excluirLinha}
          onClose={() => setShowGerenciar(false)}
        />
      )}

      {showCriarRep && (
        <CriarReprogramacaoModal
          totalEtapas={etapas.length}
          onClose={() => setShowCriarRep(false)}
          onCreate={criarReprogramacao}
        />
      )}

      {showGerenciarRep && (
        <GerenciarReprogramacoesModal
          reprogramacoes={reprogramacoes}
          repVisivelId={repVisivelId}
          onSelect={setRepVisivelId}
          onExcluir={excluirReprogramacao}
          onClose={() => setShowGerenciarRep(false)}
        />
      )}
      {showFeriados && (
        <FeriadosModal cfg={feriadosCfg} onChange={saveFeriados} onClose={() => setShowFeriados(false)} />
      )}
    </>
  );
};

export { CronogramaFull, GanttInterativo };
export { GanttInterativo as GanttElegante };
