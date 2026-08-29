import React from 'react';
import { Icon } from '../../components/Icons';
import { AppData } from '../../utils/data';
import { supabase } from '../../services/supabase';
import { pavimentosService } from '../../services/pavimentos.service';
import { logger } from '../../services/logger';
import { SCurveChart } from './SCurveChart';
import { SCurveChart2 } from './SCurveChart2';
import { FluxoExecutivo } from './FluxoExecutivo';
import { useToast } from '../../components/Modals';
import { vinculoService, itemValor } from '../financeiro/vinculoService';
import { computeValorVinculadoMap, computeCustoOrcadoMap } from './ganttUtils';
import { podeVerAba, moduloSomenteLeitura, abaSomenteLeitura, isAdmin } from '../../utils/permissions';
import { offsetToDate, offsetToISO, isoToBR, setWorkCal, taskEnd } from './cronogramaDateUtils';
import {
  migrateEtapas, fmtBRL, computeAllWBS, effStatus, autoScheduleFromDeps,
  getMonthRange, computeMonthlyDist, computeRealizedDist, getGroupMonthlyDist,
  computeGroupValues, computeSuccessors, computeAvancoFisico,
} from './scheduleEngine';
import MedicaoMensal from './MedicaoMensal';
import {
  CriarLinhaModal, GerenciarLinhasModal, FeriadosModal,
  CriarReprogramacaoModal, GerenciarReprogramacoesModal, InformacoesProjetoModal,
} from './cronogramaModais';
import { GM_TOTAL, gmConflicts } from './cronogramaShared';
import { _cronCache, _cronSavedAt, invalidateOcCache } from './cronogramaCache';
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

const UsoTarefaView = ({ etapas, months, monthlyDist, obraId, valorVinculadoMap = {}, custoOrcadoMap = {}, wbsMap = {} }) => {
  const [selectedId, setSelectedId] = React.useState(null);
  const leftRef  = React.useRef(null);
  const rightRef = React.useRef(null);
  const syncing  = React.useRef(false);
  // Altura da barra de rolagem horizontal do painel direito. O painel esquerdo não tem
  // essa barra, então reservamos o mesmo espaço embaixo dele para as linhas de total dos
  // dois painéis ficarem alinhadas (senão o esquerdo rola ~17px a mais e sobrepõe).
  const [botGutter, setBotGutter] = React.useState(0);
  // Segue a altura de linha configurada na Lista (mesma chave), com fonte menor no padrão dela.
  const usoRowH = (() => { const v = parseInt(localStorage.getItem('ls_crono_row_h_v2') || '', 10); return Number.isFinite(v) ? Math.min(120, Math.max(20, v)) : 21; })();
  const usoFont = 12;

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
  const [pdfFormat, setPdfFormat] = React.useState('a3');
  const [exportUsoOpen, setExportUsoOpen] = React.useState(false);
  const exportUsoRef = React.useRef(null);
  React.useEffect(() => {
    if (!exportUsoOpen) return;
    const h = (e) => { if (exportUsoRef.current && !exportUsoRef.current.contains(e.target)) setExportUsoOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [exportUsoOpen]);
  const [colsUsoOpen, setColsUsoOpen] = React.useState(false);
  const colsUsoRef = React.useRef(null);
  React.useEffect(() => {
    if (!colsUsoOpen) return;
    const h = (e) => { if (colsUsoRef.current && !colsUsoRef.current.contains(e.target)) setColsUsoOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [colsUsoOpen]);

  // Ordem das colunas do painel esquerdo (arrastar cabeçalhos), persistida por obra
  const [usoColOrder, setUsoColOrder] = React.useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`uso_order_${obraId}`) || 'null');
      if (Array.isArray(saved) && saved.length === USO_COL_KEYS.length && USO_COL_KEYS.every(k => saved.includes(k)))
        return saved;
    } catch { /* ignore */ }
    return USO_COL_KEYS;
  });
  React.useEffect(() => {
    if (obraId) localStorage.setItem(`uso_order_${obraId}`, JSON.stringify(usoColOrder));
  }, [usoColOrder, obraId]);
  // Colunas fixas ocultadas (só as 7 do painel esquerdo — colunas de mês sempre aparecem)
  const [usoHiddenCols, setUsoHiddenCols] = React.useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(`uso_hidden_${obraId}`) || '[]')); }
    catch { return new Set(); }
  });
  React.useEffect(() => {
    if (obraId) localStorage.setItem(`uso_hidden_${obraId}`, JSON.stringify([...usoHiddenCols]));
  }, [usoHiddenCols, obraId]);
  const usoColOrderVisible = usoColOrder.filter(k => !usoHiddenCols.has(k));
  const toggleUsoColHidden = (k) => setUsoHiddenCols(prev => { const next = new Set(prev); next.has(k) ? next.delete(k) : next.add(k); return next; });
  const [dragUsoCol, setDragUsoCol] = React.useState(null);
  const [dragOverUsoCol, setDragOverUsoCol] = React.useState(null); // { key, side: 'before' | 'after' }
  const usoLabel = (k) => USO_COL_LABELS[USO_COL_KEYS.indexOf(k)];
  const moveUsoCol = (from, to, side) => {
    if (!from || from === to) return;
    setUsoColOrder(prev => {
      const arr = [...prev];
      const fi = arr.indexOf(from);
      if (fi < 0) return prev;
      arr.splice(fi, 1);
      const ti = arr.indexOf(to);
      if (ti < 0) return prev;
      arr.splice(side === 'after' ? ti + 1 : ti, 0, from);
      return arr;
    });
  };

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

  // Mede a barra de rolagem horizontal do painel direito e reflete no espaçador do esquerdo.
  React.useEffect(() => {
    const R = rightRef.current;
    if (!R) return;
    const measure = () => setBotGutter(R.offsetHeight - R.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(R);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  // Colapso LOCAL desta aba: nao mexe no campo collapsed das tarefas, entao recolher
  // aqui nao altera a Lista, o Gantt, o banco nem o undo/redo. E por isso que nao uso
  // getVisibleEtapas (ela deriva o conjunto de e.collapsed e nao aceita um Set).
  const [collapsedUso, setCollapsedUso] = React.useState(() => new Set());
  const paiPorId = React.useMemo(() => new Map(etapas.map(e => [e.id, e.parentId ?? null])), [etapas]);

  // 'visible' e o UNICO ponto de entrada das linhas dos dois paineis (hierarquia e
  // meses), entao filtrar aqui mantem os dois lados alinhados automaticamente.
  const visible = React.useMemo(() => {
    if (!collapsedUso.size) return etapas;
    const escondido = (id) => {
      let p = paiPorId.get(id);
      const visto = new Set();
      while (p && !visto.has(p)) { if (collapsedUso.has(p)) return true; visto.add(p); p = paiPorId.get(p); }
      return false;
    };
    return etapas.filter(e => !escondido(e.id));
  }, [etapas, collapsedUso, paiPorId]);

  const temFilhosUso = React.useMemo(() => {
    const set = new Set();
    etapas.forEach(e => { if (e.parentId) set.add(e.parentId); });
    return set;
  }, [etapas]);

  const alternarGrupoUso = (id) => setCollapsedUso(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // Mesma semantica de applyOutlineLevel (0 = expandir tudo, N recolhe de nivel >= N-1),
  // mas preenchendo o Set local em vez de dar commit no cronograma.
  const aplicarNivelUso = (nivel) => setCollapsedUso(
    nivel > 0 ? new Set(etapas.filter(e => e.isGroup && (e.nivel || 0) >= nivel - 1).map(e => e.id)) : new Set()
  );

  // wbsMap e custoOrcadoMap vêm por prop, calculados uma única vez em CronogramaFull
  // (que nunca desmonta ao trocar de aba) — evita recalcular sobre todas as etapas
  // toda vez que o usuário volta pra esta aba.
  const cfg = {
    val: (e) => custoOrcadoMap[e.id] || 0,
    cell: (v) => v < 1 ? '—' : fmtBRL(v),
    tot: (v) => fmtBRL(v),
  };
  // dist2 (distribuição mensal por tarefa) NÃO é recalculado aqui — é matematicamente
  // idêntico ao `monthlyDist` que já chega pronto por prop (mesmo computeMonthlyDist,
  // mesmo custoOrcadoMap; computeMonthlyDist já ignora grupos e só lê o peso da folha).
  // Recalcular seria refazer, a cada montagem, o mesmo trabalho que o pai já fez.
  const dist2 = monthlyDist;
  const cellMax = React.useMemo(() => {
    let mx = 0;
    etapas.forEach(e => { if (!e.isGroup) { const d = dist2[e.id] || {}; months.forEach(m => { const v = d[m.key] || 0; if (v > mx) mx = v; }); } });
    return mx || 1;
  }, [dist2, etapas, months]);

  const getDist = (e) =>
    e.isGroup
      ? getGroupMonthlyDist(e.id, etapas, dist2)
      : (dist2[e.id] || {});

  // Totais das colunas (soma de todas as tarefas-folha por mês) e total geral
  const monthTotals = React.useMemo(() => {
    const t = {};
    months.forEach(m => { t[m.key] = 0; });
    Object.values(dist2).forEach(d => months.forEach(m => { t[m.key] += (d[m.key] || 0); }));
    return t;
  }, [dist2, months]);
  const grandTotal = React.useMemo(() => months.reduce((s, m) => s + (monthTotals[m.key] || 0), 0), [monthTotals, months]);

  // Tarefa-pai dentro de outra tarefa-pai: tom mais forte pro nível mais alto (raiz da EAP),
  // enfraquecendo a cada nível mais fundo — mesma escala usada no Gantt, na Lista e na Curva
  // Física, pra não cair todo grupo no mesmo azul plano.
  const rowBg = (e) =>
    selectedId === e.id
      ? 'color-mix(in srgb, var(--brand) 8%, transparent)'
      : e.isGroup ? ((e.nivel || 0) <= 0 ? 'var(--brand-100)' : (e.nivel || 0) === 1 ? 'var(--brand-50)' : 'var(--brand-tint)') : undefined;

  const thSt = {
    position: 'sticky', top: 0, zIndex: 2,
    background: 'var(--brand)',
    color: '#fff',
    borderBottom: '2px solid var(--brand-700)',
    padding: '0 10px',
    height: 34,
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
    userSelect: 'none',
  };
  const tdSt = {
    padding: '0 10px',
    height: usoRowH,
    fontSize: usoFont,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    borderBottom: '1px solid var(--border-subtle, rgba(0,0,0,0.06))',
    verticalAlign: 'middle',
    maxWidth: 0,
  };
  // Células de valor (meses/total): sem recorte, para mostrar o valor R$ completo
  // e deixar a coluna se ajustar (table-layout: auto) ao maior número.
  const tdNum = {
    padding: '0 12px',
    height: usoRowH,
    fontSize: usoFont,
    whiteSpace: 'nowrap',
    borderBottom: '1px solid var(--border-subtle, rgba(0,0,0,0.06))',
    verticalAlign: 'middle',
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  };
  // Linhas de totais das colunas (duas últimas linhas): "Total geral" (R$) e, abaixo,
  // "% do total". NÃO sticky — evita a scrollbar horizontal do painel direito aparecer
  // entre elas (o painel esquerdo não tem scrollbar, o que desalinhava as linhas fixas).
  const totalTopTd = {
    height: usoRowH, padding: '0 12px',
    background: 'var(--brand-50)', fontWeight: 700, fontSize: usoFont,
    borderTop: '2px solid var(--border)', whiteSpace: 'nowrap',
    textAlign: 'right', fontVariantNumeric: 'tabular-nums',
  };
  const totalBotTd = {
    height: usoRowH, padding: '0 12px',
    background: 'var(--surface-muted)', fontWeight: 700, fontSize: usoFont,
    borderTop: '2px solid var(--border)', whiteSpace: 'nowrap',
    textAlign: 'right', fontVariantNumeric: 'tabular-nums',
  };

  // Valor por coluna fixa (id/wbs/nome/inicio/fim/dur/avanco), respeitando a mesma
  // ordem/ocultação usada na tabela em tela (usoColOrderVisible) — 'Valor (R$)',
  // meses e 'Total' continuam fixos e vêm sempre depois, como já era.
  const usoExcelVal = (e, k) => {
    switch (k) {
      case 'id':     return e.displayId ?? e.id;
      case 'wbs':    return wbsMap[e.id] || '';
      case 'nome':   return '  '.repeat(e.nivel || 0) + e.etapa;
      case 'inicio': return offsetToDate(e.inicio);
      case 'fim':    return offsetToDate(e.inicio + e.dur);
      case 'dur':    return e.dur;
      case 'avanco': return e.avanco / 100;
      default:       return '';
    }
  };
  const usoPdfVal = (e, k) => {
    switch (k) {
      case 'id':     return String(e.displayId ?? e.id);
      case 'wbs':    return wbsMap[e.id] || '';
      case 'nome':   return '  '.repeat(e.nivel || 0) + e.etapa;
      case 'inicio': return isoToBR(offsetToISO(e.inicio));
      case 'fim':    return isoToBR(offsetToISO(taskEnd(e)));
      case 'dur':    return e.dur + 'd';
      case 'avanco': return e.avanco + '%';
      default:       return '';
    }
  };

  const exportExcelUso = () => {
    import('xlsx').then(XLSX => {
      const wb     = XLSX.utils.book_new();
      const nFixed = usoColOrderVisible.length;
      const hdrs   = [...usoColOrderVisible.map(usoLabel), 'Valor (R$)', ...months.map(m => m.label), 'Total'];
      const rows = [hdrs, ...etapas.map(e => {
        const dist  = getDist(e);
        const total = Object.values(dist).reduce((s, v) => s + v, 0);
        return [
          ...usoColOrderVisible.map(k => usoExcelVal(e, k)),
          e.isGroup ? '' : cfg.val(e),
          ...months.map(m => dist[m.key] || 0),
          total,
        ];
      })];
      // Linhas de total: "Total geral" (R$) e "% do total"
      rows.push(['Total geral', ...Array(nFixed).fill(''), ...months.map(m => monthTotals[m.key] || 0), grandTotal]);
      rows.push(['% do total', ...Array(nFixed).fill(''), ...months.map(m => grandTotal > 0 ? monthTotals[m.key] / grandTotal : 0), grandTotal > 0 ? 1 : 0]);
      const ws  = XLSX.utils.aoa_to_sheet(rows, { dateNF: 'DD/MM/YYYY' });
      const rng = XLSX.utils.decode_range(ws['!ref']);
      const fmtCols = [];
      const iIni = usoColOrderVisible.indexOf('inicio'); if (iIni >= 0) fmtCols.push([iIni, 'DD/MM/YYYY']);
      const iFim = usoColOrderVisible.indexOf('fim');    if (iFim >= 0) fmtCols.push([iFim, 'DD/MM/YYYY']);
      const iAv  = usoColOrderVisible.indexOf('avanco'); if (iAv  >= 0) fmtCols.push([iAv, '0.00%']);
      fmtCols.push([nFixed, '#,##0.00']); // Valor (R$)
      for (let R = 1; R <= rng.e.r; R++) {
        fmtCols.forEach(([C, z]) => {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          if (ws[addr]) ws[addr].z = z;
        });
        for (let C = nFixed + 1; C <= rng.e.c; C++) {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          if (ws[addr]) ws[addr].z = '#,##0.00';
        }
      }
      // Última linha ("% do total") formatada como porcentagem
      for (let C = nFixed + 1; C <= rng.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: rng.e.r, c: C });
        if (ws[addr]) ws[addr].z = '0.00%';
      }
      ws['!cols']   = [...usoColOrderVisible.map(k => ({ wch: Math.max(8, Math.round(getUsoW(k) / 7)) })), { wch: 16 }, ...months.map(() => ({ wch: 16 })), { wch: 16 }];
      ws['!freeze'] = { xSplit: Math.min(3, nFixed), ySplit: 1 };
      XLSX.utils.book_append_sheet(wb, ws, 'Uso da Tarefa');
      XLSX.writeFile(wb, `uso-tarefa-${new Date().toISOString().slice(0, 10)}.xlsx`);
    });
  };

  const exportPDFUso = async () => {
    setExportingPDF(true);
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
      const doc   = new jsPDF({ orientation: 'landscape', unit: 'mm', format: pdfFormat });
      const BRAND = [28, 69, 132];
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();
      doc.setFontSize(13); doc.text('Uso da Tarefa', 14, 14);
      doc.setFontSize(8);  doc.setTextColor(130);
      doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, 14, 20);
      doc.setTextColor(0);
      const nFixed = usoColOrderVisible.length;
      const body = etapas.map(e => {
        const dist  = getDist(e);
        const total = Object.values(dist).reduce((s, v) => s + v, 0);
        return {
          _isGroup: e.isGroup,
          vals: [
            ...usoColOrderVisible.map(k => usoPdfVal(e, k)),
            e.isGroup ? '—' : fmtBRL(cfg.val(e)),
            ...months.map(m => dist[m.key] > 0 ? fmtBRL(dist[m.key]) : '—'),
            total > 0 ? fmtBRL(total) : '—',
          ],
        };
      });
      const USO_PDF_STYLE = {
        id:     { cellWidth: 8,  halign: 'right' },
        wbs:    { cellWidth: 12, halign: 'left' },
        nome:   { cellWidth: 55, halign: 'left' },
        inicio: { cellWidth: 18, halign: 'center' },
        fim:    { cellWidth: 18, halign: 'center' },
        dur:    { cellWidth: 10, halign: 'right' },
        avanco: { cellWidth: 10, halign: 'right' },
      };
      const fixedStyles = Object.fromEntries([
        ...usoColOrderVisible.map((k, i) => [i, USO_PDF_STYLE[k]]),
        [nFixed, { cellWidth: 22, halign: 'right' }],
      ]);
      const monthStyles = Object.fromEntries([
        ...months.map((_, i) => [nFixed + 1 + i, { cellWidth: 22, halign: 'right' }]),
        [nFixed + 1 + months.length, { cellWidth: 22, halign: 'right' }],
      ]);
      autoTable(doc, {
        startY: 25,
        head: [[ ...usoColOrderVisible.map(usoLabel), 'Valor (R$)', ...months.map(m => m.label), 'Total']],
        body: body.map(r => r.vals),
        foot: [
          [{ content: 'Total geral', colSpan: nFixed + 1, styles: { halign: 'left' } }, ...months.map(m => monthTotals[m.key] > 0 ? fmtBRL(monthTotals[m.key]) : '—'), grandTotal > 0 ? fmtBRL(grandTotal) : '—'],
          [{ content: '% do total', colSpan: nFixed + 1, styles: { halign: 'left' } }, ...months.map(m => grandTotal > 0 ? (monthTotals[m.key] / grandTotal * 100).toFixed(2) + '%' : '—'), grandTotal > 0 ? '100%' : '—'],
        ],
        theme: 'grid',
        headStyles: { fillColor: BRAND, textColor: 255, fontSize: 7, fontStyle: 'bold', halign: 'center' },
        bodyStyles: { fontSize: 7, textColor: 40 },
        footStyles: { fillColor: [225, 232, 242], textColor: 20, fontStyle: 'bold', fontSize: 7, halign: 'right' },
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
          if (data.section === 'foot' && data.column.index === 0) {
            data.cell.styles.halign = 'left';
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
      {/* Um único card (mesmo padrão .card/.card-header/.card-actions das outras abas)
          envolvendo toolbar + tabela — igual à Lista, sem caixa separada com respiro
          entre o título e o cabeçalho azul da tabela. */}
      <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="card-header">
          <div className="card-title" style={{ fontWeight: 400 }}>Custo (R$) previsto por mês</div>
          <div className="card-actions">
            <div ref={colsUsoRef} style={{ position: 'relative' }}>
              <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px', height: 28, gap: 5 }}
                onClick={() => setColsUsoOpen(v => !v)} title="Mostrar/ocultar colunas">
                <Icon name="layers" size={13} />Colunas{usoHiddenCols.size > 0 && <span className="nav-badge" style={{ marginLeft: 2 }}>{usoHiddenCols.size}</span>}
              </button>
              {colsUsoOpen && (
                <div style={{ position: 'absolute', left: 0, top: '100%', marginTop: 6, zIndex: 50, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', padding: 10, minWidth: 190, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {USO_COL_KEYS.map(k => (
                    <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer', padding: '3px 4px' }}>
                      <input type="checkbox" checked={!usoHiddenCols.has(k)} onChange={() => toggleUsoColHidden(k)} />
                      {usoLabel(k)}
                    </label>
                  ))}
                  {usoHiddenCols.size > 0 && (
                    <button className="btn btn-ghost btn-sm" style={{ marginTop: 4 }} onClick={() => setUsoHiddenCols(new Set())}>Mostrar todas</button>
                  )}
                </div>
              )}
            </div>
            {/* Recolher/expandir por nivel — mesmo select da Lista e do Gantt, mas local. */}
            <select defaultValue="" title="Expandir/recolher a estrutura por nivel"
              onChange={e => { const v = e.target.value; e.target.value = ''; if (v !== '') aplicarNivelUso(Number(v)); }}
              style={{ height: 28, fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', padding: '0 6px', cursor: 'pointer' }}>
              <option value="" disabled>Estrutura…</option>
              <option value="0">Expandir tudo</option>
              <option value="1">Recolher tudo</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => <option key={n} value={n}>Nível {n}</option>)}
            </select>
            <div ref={exportUsoRef} style={{ position: 'relative' }}>
              <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px', height: 28, gap: 5 }}
                onClick={() => setExportUsoOpen(v => !v)} title="Exportar">
                <Icon name="download" size={13} />{exportingPDF ? 'Gerando…' : 'Exportar'}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
              </button>
              {exportUsoOpen && (
                <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 6, zIndex: 50, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', padding: 12, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <span style={{ color: 'var(--text-soft)' }}>Formato PDF:</span>
                    <select value={pdfFormat} onChange={e => setPdfFormat(e.target.value)} title="Tamanho da folha do PDF"
                      style={{ fontSize: 12, height: 26, padding: '0 4px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}>
                      <option value="a4">A4</option>
                      <option value="a3">A3</option>
                      <option value="a2">A2</option>
                      <option value="a1">A1</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost" style={{ gap: 5, fontSize: 12, padding: '4px 10px', height: 28, flex: 1 }}
                      onClick={() => { setExportUsoOpen(false); exportExcelUso(); }} title="Exportar para Excel (.xlsx)">
                      <Icon name="download" size={13} />Excel
                    </button>
                    <button className="btn btn-ghost" style={{ gap: 5, fontSize: 12, padding: '4px 10px', height: 28, flex: 1 }}
                      onClick={() => { setExportUsoOpen(false); exportPDFUso(); }} disabled={exportingPDF} title="Exportar para PDF">
                      <Icon name="download" size={13} />{exportingPDF ? 'Gerando…' : 'PDF'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Painel dividido — dentro do mesmo .card do toolbar acima (card-body flush,
            sem borda/fundo próprios: quem desenha isso agora é o .card em volta). */}
        <div className="card-body" style={{ padding: 0, flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Lado esquerdo — hierarquia com colunas redimensionáveis e reordenáveis.
            overflowX: hidden — sem barra interna; o painel dimensiona ao conteúdo (item 10). */}
        <div ref={leftRef} className="uso-hide-scrollbar" style={{ flexShrink: 0, overflowY: 'auto', overflowX: 'hidden', borderRight: '1px solid var(--border)' }}>
          <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              {usoColOrderVisible.map(k => <col key={k} style={{ width: getUsoW(k) }} />)}
            </colgroup>
            <thead>
              <tr>
                {usoColOrderVisible.map(k => (
                  <th key={k}
                    className={dragOverUsoCol?.key === k ? `drag-over-col-${dragOverUsoCol.side}` : undefined}
                    onDragOver={ev => {
                      if (!dragUsoCol) return;
                      ev.preventDefault();
                      if (dragUsoCol === k) return;
                      const rect = ev.currentTarget.getBoundingClientRect();
                      const side = (ev.clientX - rect.left) < rect.width / 2 ? 'before' : 'after';
                      setDragOverUsoCol(prev => (prev && prev.key === k && prev.side === side) ? prev : { key: k, side });
                    }}
                    onDragLeave={() => setDragOverUsoCol(prev => prev?.key === k ? null : prev)}
                    onDrop={ev => { ev.preventDefault(); moveUsoCol(dragUsoCol, k, dragOverUsoCol?.side); setDragUsoCol(null); setDragOverUsoCol(null); }}
                    style={{ ...thSt, width: getUsoW(k), minWidth: getUsoW(k), textAlign: USO_COL_ALIGN[k], position: 'sticky', top: 0, zIndex: 2, opacity: dragUsoCol === k ? 0.4 : 1 }}>
                    <span draggable
                      onDragStart={ev => { setDragUsoCol(k); ev.dataTransfer.effectAllowed = 'move'; }}
                      onDragEnd={() => { setDragUsoCol(null); setDragOverUsoCol(null); }}
                      title="Arraste para reordenar a coluna"
                      style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', cursor: 'grab' }}>
                      {usoLabel(k)}
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
                const cellMap = {
                  id:     <td key="id" style={{ ...tdSt, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-soft)' }} title={idText}>{idText}</td>,
                  wbs:    <td key="wbs" style={{ ...tdSt, color: 'var(--text-faint)', fontSize: 12 }} title={wbsText}>{wbsText}</td>,
                  nome:   (
                    <td key="nome" style={{ ...tdSt, paddingLeft: (e.nivel * 14 + 10) + 'px', fontWeight: e.isGroup ? 600 : 400 }} title={nomeText}>
                      {(e.isGroup || temFilhosUso.has(e.id)) ? (
                        <button className="lista-toggle" title={collapsedUso.has(e.id) ? 'Expandir' : 'Recolher'}
                          onClick={ev => { ev.stopPropagation(); alternarGrupoUso(e.id); }}>
                          {collapsedUso.has(e.id) ? '▶' : '▼'}
                        </button>
                      ) : null}
                      {nomeText}
                    </td>
                  ),
                  inicio: <td key="inicio" style={{ ...tdSt, color: 'var(--text-soft)', fontSize: 12 }} title={iniText}>{iniText}</td>,
                  fim:    <td key="fim" style={{ ...tdSt, color: 'var(--text-soft)', fontSize: 12 }} title={fimText}>{fimText}</td>,
                  dur:    <td key="dur" style={{ ...tdSt, textAlign: 'right', color: 'var(--text-soft)' }} title={durText}>{durText}</td>,
                  avanco: <td key="avanco" style={{ ...tdSt, textAlign: 'right' }} title={avText}>{avText}</td>,
                };
                return (
                  <tr key={e.id}
                    style={{ background: rowBg(e), cursor: 'pointer', height: usoRowH }}
                    onClick={() => setSelectedId(e.id === selectedId ? null : e.id)}>
                    {usoColOrderVisible.map(k => cellMap[k])}
                  </tr>
                );
              })}
              <tr style={{ height: usoRowH }}>
                <td colSpan={usoColOrderVisible.length} style={{ ...totalTopTd, textAlign: 'left', paddingLeft: 10, left: 0 }}>Total geral</td>
              </tr>
              <tr style={{ height: usoRowH }}>
                <td colSpan={usoColOrderVisible.length} style={{ ...totalBotTd, textAlign: 'left', paddingLeft: 10, left: 0 }}>% do total</td>
              </tr>
            </tbody>
          </table>
          {/* Reserva o mesmo espaço da barra de rolagem horizontal do painel direito */}
          <div style={{ height: botGutter, flexShrink: 0 }} />
        </div>

        {/* Lado direito — grade temporal. table-layout: auto + células sem recorte:
            as colunas se ajustam ao maior valor R$ e o excesso rola na barra final (itens 9/10). */}
        <div ref={rightRef} style={{ flex: 1, overflowX: 'auto', overflowY: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', tableLayout: 'auto' }}>
            <thead>
              <tr>
                {months.map(m => (
                  <th key={m.key} style={{ ...thSt, textAlign: 'right', minWidth: 92 }}>{m.label}</th>
                ))}
                <th style={{ ...thSt, textAlign: 'right', minWidth: 112 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(e => {
                const dist  = getDist(e);
                const total = months.reduce((s, m) => s + (dist[m.key] || 0), 0);
                const emptyThresh = 1;
                return (
                  <tr key={e.id}
                    style={{ background: rowBg(e), cursor: 'pointer', height: usoRowH }}
                    onClick={() => setSelectedId(e.id === selectedId ? null : e.id)}>
                    {months.map(m => {
                      const v = dist[m.key] || 0;
                      const empty = v < emptyThresh;
                      const f = Math.min(1, v / cellMax);
                      // Grupos (tarefas pai): sem cor por peso — só o fundo padrão da linha pai.
                      if (e.isGroup) return (
                        <td key={m.key} style={{ ...tdNum, minWidth: 92, background: rowBg(e), fontWeight: 700 }}
                          title={empty ? undefined : cfg.cell(v)}>
                          {empty ? '—' : cfg.cell(v)}
                        </td>
                      );
                      return (
                        <td key={m.key}
                          className={'heat-cell' + (empty ? ' empty' : (f > 0.35 ? ' hot' : ''))}
                          style={{ ...tdNum, minWidth: 92, '--f': f }}
                          title={empty ? undefined : cfg.cell(v)}>
                          {empty ? '—' : cfg.cell(v)}
                        </td>
                      );
                    })}
                    <td style={{ ...tdNum, minWidth: 112, fontWeight: e.isGroup ? 700 : 400 }} title={total > 0 ? cfg.tot(total) : undefined}>
                      {total > 0 ? cfg.tot(total) : '—'}
                    </td>
                  </tr>
                );
              })}
              <tr style={{ height: usoRowH }}>
                {months.map(m => (
                  <td key={m.key} style={{ ...totalTopTd, minWidth: 92 }}>
                    {monthTotals[m.key] > 0 ? cfg.tot(monthTotals[m.key]) : '—'}
                  </td>
                ))}
                <td style={{ ...totalTopTd, minWidth: 112 }}>{grandTotal > 0 ? cfg.tot(grandTotal) : '—'}</td>
              </tr>
              <tr style={{ height: usoRowH }}>
                {months.map(m => (
                  <td key={m.key} style={{ ...totalBotTd, minWidth: 92 }}>
                    {grandTotal > 0 ? (monthTotals[m.key] / grandTotal * 100).toFixed(2) + '%' : '—'}
                  </td>
                ))}
                <td style={{ ...totalBotTd, minWidth: 112 }}>{grandTotal > 0 ? '100%' : '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>
        </div>
      </div>
    </div>
  );
};

// ─── CurvaFisicaView — Curva S + Histograma ──────────────────────────────────
const CurvaFisicaView = ({ etapas, months, monthlyDist, realizedTotals, baselines, blVisivelId, onSelectBaseline, reprogramacoes, repVisivelId, onSelectReprogramacao, selMonKey, setSelMonKey, valorVinculadoMap = {}, onCommit, topbarH }) => {
  const toast = useToast();
  // Colapso LOCAL da tabela "Distribuição por tarefa" — não mexe no `collapsed` da Lista.
  const [collapsedCurva, setCollapsedCurva] = React.useState(() => new Set());
  // Congela o card "Distribuição por tarefa" sob a topbar ao rolar a página — mesmo mecanismo
  // de `ganttPinned`/`listaPinned` (sentinela + position:fixed via JS, não CSS sticky: a topbar
  // não é fixa por CSS, então só um valor de `top` calculado a partir da altura REAL medida dela
  // (`topbarH`, prop vinda de CronogramaFull) reproduz o mesmo respiro usado nas outras abas).
  const distSentinelRef = React.useRef(null);
  const [distPinned, setDistPinned] = React.useState(null);
  React.useEffect(() => {
    let raf = 0;
    const check = () => {
      raf = 0;
      const s = distSentinelRef.current;
      if (!s) return;
      const r = s.getBoundingClientRect();
      if (r.top <= topbarH) {
        setDistPinned(prev => (prev && Math.abs(prev.left - r.left) < 0.5 && Math.abs(prev.width - r.width) < 0.5) ? prev : { left: r.left, width: r.width });
      } else {
        setDistPinned(prev => (prev ? null : prev));
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(check); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    let ro = null;
    if (typeof ResizeObserver !== 'undefined' && distSentinelRef.current) {
      ro = new ResizeObserver(onScroll);
      ro.observe(distSentinelRef.current);
    }
    const id = setTimeout(check, 0);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); clearTimeout(id); if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect(); };
  }, [topbarH]);
  // Duas curvas selecionáveis (Curva 1 / Curva 2). Cada uma guarda suas próprias opções.
  const [curvaSel, setCurvaSel] = React.useState('c1'); // 'c1' | 'c2'
  const [serieMap,  setSerieMap]  = React.useState({ c1: { bl: true, rep: true, real: true }, c2: { bl: true, rep: true, real: true } });
  const [barrasMap, setBarrasMap] = React.useState({ c1: true, c2: true });
  const [linhasMap, setLinhasMap] = React.useState({ c1: true, c2: true });
  // Valores/atalhos da curva ATIVA — mantêm os nomes já usados no restante do componente.
  const showSerie   = serieMap[curvaSel];
  const showBarras  = barrasMap[curvaSel];
  const showLinhas  = linhasMap[curvaSel];
  const toggleSerie   = (k)  => setSerieMap(m => ({ ...m, [curvaSel]: { ...m[curvaSel], [k]: !m[curvaSel][k] } }));
  const setShowBarras = (fn) => setBarrasMap(m => ({ ...m, [curvaSel]: typeof fn === 'function' ? fn(m[curvaSel]) : fn }));
  const setShowLinhas = (fn) => setLinhasMap(m => ({ ...m, [curvaSel]: typeof fn === 'function' ? fn(m[curvaSel]) : fn }));
  // Custo Orçado (Valor Vinculado + Custo Real) — peso usado pela distribuição/Curva Física
  // (cobre folhas e grupos via bubble-up, então custoEf ignora gv/isGroup).
  const custoOrcadoMap = React.useMemo(
    () => computeCustoOrcadoMap(etapas, valorVinculadoMap),
    [etapas, valorVinculadoMap]
  );
  const custoEf = (e) => custoOrcadoMap[e.id] || 0;
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
    const dist = computeMonthlyDist(blEtapas, computeCustoOrcadoMap(blEtapas, valorVinculadoMap));
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

  // Distribuição por tarefa da Reprogramação (não agregada) — usada pela tabela "Distribuição
  // por tarefa" quando uma reprogramação está selecionada, em vez da distribuição ao vivo.
  const repMonthlyDistByTask = React.useMemo(() => {
    if (!repEtapas) return null;
    return computeMonthlyDist(repEtapas, computeCustoOrcadoMap(repEtapas, valorVinculadoMap));
  }, [repEtapas]); // eslint-disable-line react-hooks/exhaustive-deps

  const repDist = React.useMemo(() => {
    if (!repMonthlyDistByTask) return null;
    const agg = {};
    Object.values(repMonthlyDistByTask).forEach(d =>
      Object.entries(d).forEach(([k, v]) => { agg[k] = (agg[k] || 0) + v; })
    );
    return agg;
  }, [repMonthlyDistByTask]);

  const repTotal = repDist
    ? months.reduce((s, m) => s + (repDist[m.key] || 0), 0)
    : null;

  // Mês de referência (selMonKey) vem por prop agora — persistido por obra no componente
  // pai, para sobreviver à troca de sub-aba. Também decide sozinho qual Reprogramação
  // comparar (a mais recente salva antes deste mês), pelo efeito logo abaixo.

  // Marca quando o usuário mexe no seletor de reprogramação — inclusive escolher "Sem
  // reprogramação". A partir daí, não auto-selecionamos mais a padrão.
  const repTouched = React.useRef(false);
  React.useEffect(() => {
    if (!reprogramacoes.length) return;
    // Respeita a escolha do usuário: só auto-seleciona quando ainda não há reprogramação
    // escolhida E o usuário não interagiu com o seletor.
    if (repVisivelId || repTouched.current) return;
    const alvo = defaultRepId(reprogramacoes, selMonKey);
    if (alvo !== repVisivelId) onSelectReprogramacao?.(alvo);
  }, [selMonKey, reprogramacoes, repVisivelId]); // eslint-disable-line react-hooks/exhaustive-deps

  const [exportingPDF, setExportingPDF] = React.useState(false);
  const [pdfFormat, setPdfFormat] = React.useState('a3');
  const [expOpen, setExpOpen] = React.useState(false);
  const [expSel, setExpSel]  = React.useState({ grafico: true, resumo: true, dist: true });
  const curvaRef = React.useRef(null);
  const chartRef = React.useRef(null);
  const expRef   = React.useRef(null);

  // Fecha o painel de exportação ao clicar fora dele
  React.useEffect(() => {
    if (!expOpen) return;
    const onDoc = e => { if (expRef.current && !expRef.current.contains(e.target)) setExpOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [expOpen]);

  // Serializa o SVG da curva (inline das cores var(--…)) e devolve {dataUrl, w, h} para o PDF.
  const capturarGraficoCurva = () => new Promise((resolve) => {
    const svg = chartRef.current?.querySelector('svg');
    if (!svg) { resolve(null); return; }
    const vb = svg.viewBox.baseVal;
    const w = vb && vb.width ? vb.width : (svg.clientWidth || 1000);
    const h = vb && vb.height ? vb.height : (svg.clientHeight || 300);
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', w);
    clone.setAttribute('height', h);
    let s = new XMLSerializer().serializeToString(clone);
    s = s.replace(/var\(--brand\)/g, '#1c4584')
         .replace(/var\(--border\)/g, '#e2e8f0')
         .replace(/var\(--text-muted\)/g, '#64748b')
         .replace(/var\(--font-mono\)/g, 'monospace');
    const img = new Image();
    img.onload = () => {
      try {
        const scale = 2;
        const canvas = document.createElement('canvas');
        canvas.width = w * scale; canvas.height = h * scale;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve({ dataUrl: canvas.toDataURL('image/png'), w, h });
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  });

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
      const vRR  = filteredPlanned[m.key] || 0; // Real = plano ao vivo (igual ao Uso da Tarefa)
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

      const cabMeses = months.map(m => m.label);

      // Sheet 1 — Resumo Mensal
      if (expSel.resumo) {
      const resumo = [
        ['Atividade', ...cabMeses],
        ['LB Mensal (%)',              ...blM.map(fmt)],
        ['LB Acumulado (%)',           ...blA.map(fmt)],
        ['Reprogramado Mensal (%)',    ...repM.map(fmt)],
        ['Reprogramado Acumulado (%)', ...repA.map(fmt)],
        ['Real Mensal (%)',            ...rrM.map(fmt)],
        ['Real Acumulado (%)',         ...rrA.map(fmt)],
        ['Dif. vs LB Acumulado (%)',   ...difBL.map(fmt)],
        ['Dif. vs Rep. Acumulado (%)', ...difRep.map(fmt)],
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumo), 'Resumo Mensal');
      }

      // Sheet 2 — Distribuição por Tarefa
      if (expSel.dist) {
      const groupValsExp = computeGroupValues(etapas, custoOrcadoMap);
      const distRows = etapas.filter(e => e.isGroup || e.showInDist === true);
      const folhas = etapas.filter(e => !e.isGroup);
      const totalCusto = folhas.reduce((s, e) => s + custoEf(e), 0);
      // Conc. % geral (rodapé) = acumulado da distribuição mensal até o mês de referência,
      // mesma lógica usada por linha logo abaixo.
      const concGeralAteRef = totalCusto > 0
        ? months.reduce((s, m, i) => i <= selIdx ? s + (filteredPlanned[m.key] || 0) : s, 0) / totalCusto * 100
        : 0;

      const cabDist = ['Atividade', 'Valor (R$)', 'Peso %', 'Conc. %', ...cabMeses, 'Total'];
      const dist = [cabDist];
      distRows.forEach(e => {
        const gv = e.isGroup ? (groupValsExp[e.id] || {}) : {};
        const taskCusto  = custoEf(e, gv);
        const peso = totalCusto > 0 ? taskCusto / totalCusto * 100 : 0;
        const mDist = e.isGroup ? getGroupMonthlyDist(e.id, etapas, monthlyDist) : (monthlyDist[e.id] || {});
        // Conc. % = acumulado até o mês de referência selecionado (não o avanco bruto).
        const concAteRef = taskCusto > 0
          ? months.reduce((s, m, i) => i <= selIdx ? s + (mDist[m.key] || 0) : s, 0) / taskCusto * 100
          : 0;
        const monPcts = months.map(m => taskCusto > 0 ? parseFloat(((mDist[m.key] || 0) / taskCusto * 100).toFixed(4)) : null);
        dist.push([e.etapa, taskCusto, parseFloat(peso.toFixed(4)), parseFloat(concAteRef.toFixed(2)), ...monPcts, 100]);
      });
      // Rodapé
      const totalMonPcts = months.map(m => totalCusto > 0 ? parseFloat(((filteredPlanned[m.key] || 0) / totalCusto * 100).toFixed(4)) : null);
      dist.push(['Total geral', totalCusto, 100, parseFloat(concGeralAteRef.toFixed(2)), ...totalMonPcts, 100]);

      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dist), 'Distribuição');
      }

      if (wb.SheetNames.length === 0) { toast('Selecione ao menos uma tabela para o Excel.', { tone: 'warn' }); return; }
      XLSX.writeFile(wb, `curva-fisica-${new Date().toISOString().slice(0,10)}.xlsx`);
      } catch (err) { toast('Erro ao exportar Excel: ' + err.message, { tone: 'danger' }); }
    });
  };

  const exportPDF = async () => {
    setExportingPDF(true);
    try {
      if (!expSel.grafico && !expSel.resumo && !expSel.dist) { toast('Selecione ao menos um item para o PDF.', { tone: 'warn' }); return; }
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
      const doc   = new jsPDF({ orientation: 'landscape', unit: 'mm', format: pdfFormat });
      const BRAND = [28, 69, 132];
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

      // ── Gráfico da Curva S (imagem) ─────────────────────────────────────
      let startY1 = 25;
      const grafico = expSel.grafico ? await capturarGraficoCurva() : null;
      if (grafico) {
        const imgW = W - 28;
        const imgH = Math.min(90, imgW * (grafico.h / grafico.w));
        doc.addImage(grafico.dataUrl, 'PNG', 14, startY1, imgW, imgH);
        startY1 += imgH + 5;
        // Legenda das séries (o SVG não inclui a legenda, que é HTML fora dele)
        const leg = [];
        const c2 = curvaSel === 'c2';
        if (showLinhas && showSerie.real) leg.push({ label: c2 ? 'Executado' : 'Real', color: [22, 163, 74], dashed: false });
        if (showLinhas && showSerie.rep)  leg.push({ label: c2 ? 'Replanejado' : (hasRep ? `Reprogramado (${repNome})` : 'Reprogramado'), color: [28, 69, 132], dashed: false });
        if (showLinhas && showSerie.bl && blEtapas) leg.push({ label: c2 ? 'Previsto (Linha de Base)' : `Linha de Base (${blNome})`, color: [148, 163, 184], dashed: true });
        let lx = 14; const ly = startY1 + 2;
        doc.setFontSize(8); doc.setLineWidth(0.9);
        leg.forEach(item => {
          doc.setDrawColor(item.color[0], item.color[1], item.color[2]);
          if (item.dashed) doc.setLineDashPattern([1.2, 1], 0);
          doc.line(lx, ly, lx + 9, ly);
          doc.setLineDashPattern([], 0);
          doc.setTextColor(70);
          doc.text(item.label, lx + 11, ly + 1.2);
          lx += 11 + doc.getTextWidth(item.label) + 9;
        });
        doc.setFillColor(226, 232, 240);
        doc.rect(lx, ly - 1.6, 5, 3.2, 'F');
        doc.setTextColor(70);
        doc.text('Prod. mensal', lx + 7, ly + 1.2);
        doc.setTextColor(0);
        startY1 += 9;
      }

      // ── Tabela 1: Resumo Mensal ─────────────────────────────────────────
      const { blM, blA, repM, repA, rrM, rrA, difBL, difRep } = computeSeries();
      const fmt      = v => v != null ? v.toFixed(2) + '%' : '—';
      const cabMeses = months.map(m => m.label);
      const nColRes  = 1 + months.length;
      const grpRow   = (label, rgb) => [{ content: label, colSpan: nColRes, styles: { fillColor: rgb, textColor: 255, fontStyle: 'bold', halign: 'left', fontSize: 7 } }];
      if (expSel.resumo) autoTable(doc, {
        startY: startY1,
        head: [['', ...cabMeses]],
        body: [
          grpRow(blEtapas ? blNome : 'Linha de Base', [16, 43, 84]),
          ['Mensal',    ...blM.map(fmt)],
          ['Acumulado', ...blA.map(fmt)],
          grpRow(hasRep ? repNome : 'Reprogramação', [28, 69, 132]),
          ['Mensal',    ...repM.map(fmt)],
          ['Acumulado', ...repA.map(fmt)],
          grpRow('Real + Reprogramado', [21, 128, 61]),
          ['Mensal',    ...rrM.map(fmt)],
          ['Acumulado', ...rrA.map(fmt)],
          grpRow('Diferenças', [71, 85, 105]),
          ['Dif. vs LB Acum.',  ...difBL.map(fmt)],
          ['Dif. vs Rep. Acum.', ...difRep.map(fmt)],
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
      if (expSel.dist) {
      const groupValsExp = computeGroupValues(etapas, custoOrcadoMap);
      const distRows     = etapas.filter(e => e.isGroup || e.showInDist === true);
      const folhas       = etapas.filter(e => !e.isGroup);
      const totCusto     = folhas.reduce((s, e) => s + custoEf(e), 0);
      const selColIdx    = 4 + selIdx; // coluna do mês selecionado
      // Conc. % geral (rodapé) = acumulado da distribuição mensal até o mês de referência.
      const concGeralAteRef = totCusto > 0
        ? months.reduce((s, m, i) => i <= selIdx ? s + (filteredPlanned[m.key] || 0) : s, 0) / totCusto * 100
        : 0;
      const blendC       = (rgb, a) => [Math.round(255 + (rgb[0] - 255) * a), Math.round(255 + (rgb[1] - 255) * a), Math.round(255 + (rgb[2] - 255) * a)];
      const distBody = distRows.map(e => {
        const gv      = e.isGroup ? (groupValsExp[e.id] || {}) : {};
        const taskCst = custoEf(e, gv);
        const peso    = totCusto > 0 ? taskCst / totCusto * 100 : 0;
        const mDist   = e.isGroup ? getGroupMonthlyDist(e.id, etapas, monthlyDist) : (monthlyDist[e.id] || {});
        const mf      = months.map(m => taskCst > 0 ? (mDist[m.key] || 0) / taskCst : 0); // fração 0..1 por mês
        // Conc. % = acumulado até o mês de referência selecionado (não o avanco bruto).
        const concAteRef = taskCst > 0
          ? mf.reduce((s, f, i) => i <= selIdx ? s + f * 100 : s, 0)
          : 0;
        return {
          _isGroup: e.isGroup, _conc: concAteRef, _mf: mf,
          vals: [
            e.etapa, fmtBRL(taskCst), peso.toFixed(2) + '%', concAteRef.toFixed(2) + '%',
            ...months.map((m, i) => taskCst > 0 ? (mf[i] * 100).toFixed(2) + '%' : '—'),
            '100%',
          ],
        };
      });
      const totMonPcts = months.map(m => totCusto > 0 ? ((filteredPlanned[m.key] || 0) / totCusto * 100).toFixed(2) + '%' : '—');
      // Início da tabela: após a última seção (+12) ou logo abaixo do gráfico (+6). Nunca
      // acima de 32mm, para o título "Distribuição por Tarefa" não colar no cabeçalho (título + data).
      let startY2 = (doc.lastAutoTable?.finalY != null ? doc.lastAutoTable.finalY + 12 : startY1 + 6);
      if (startY2 < 32) startY2 = 32;
      doc.setFontSize(10); doc.setTextColor(0);
      doc.text('Distribuição por Tarefa', 14, startY2 - 4);
      autoTable(doc, {
        startY: startY2,
        head: [['Atividade', 'Valor (R$)', 'Peso %', 'Conc. %', ...cabMeses, 'Total']],
        body: distBody.map(r => r.vals),
        foot: [['Total geral', fmtBRL(totCusto), '100%', concGeralAteRef.toFixed(2) + '%', ...totMonPcts, '100%']],
        theme: 'grid',
        headStyles: { fillColor: BRAND, textColor: 255, fontSize: 7, fontStyle: 'bold', halign: 'center' },
        bodyStyles: { fontSize: 7 },
        footStyles: { fillColor: [225, 232, 242], textColor: 20, fontStyle: 'bold', fontSize: 7, halign: 'right' },
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
          const row = distBody[data.row.index];
          const ci  = data.column.index;
          if (data.section === 'body' && row?._isGroup) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [232, 240, 252];
          }
          // Conc. % — verde 100% / azul >0 / cinza 0 (folhas e grupos)
          if (data.section === 'body' && ci === 3) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = row._conc >= 100 ? [22, 163, 74] : row._conc > 0 ? [28, 69, 132] : [148, 163, 184];
            if (!row._isGroup) data.cell.styles.fillColor = blendC([28, 69, 132], 0.05);
          }
          // Meses — heat azul proporcional (só folhas; grupos mantêm o fundo do grupo)
          if (data.section === 'body' && ci >= 4 && ci < 4 + months.length && !row._isGroup) {
            const pct = (row._mf[ci - 4] || 0) * 100;
            if (pct > 0.5) data.cell.styles.fillColor = [235, 237, 240]; // cinza chapado, igual ao site
            else if (ci === selColIdx) data.cell.styles.fillColor = blendC([28, 69, 132], 0.06);
          }
          // Coluna do mês selecionado — leve realce no cabeçalho e rodapé
          if (ci === selColIdx && (data.section === 'head' || data.section === 'foot')) {
            data.cell.styles.fontStyle = 'bold';
          }
          // Rodapé Conc. % em verde
          if (data.section === 'foot' && ci === 3) {
            data.cell.styles.textColor = [22, 163, 74];
          }
        },
        didDrawPage: footerFn,
      });
      }
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

  // Séries acumuladas para o gráfico (mesmas do Resumo Mensal): Linha de Base (blA),
  // Reprogramado (repA) e Real (rrA = plano ao vivo). Cada uma com toggle de exibição.
  const { blM: seriesPrevistoM, blA: seriesBaselineFull, repA: seriesReprog, rrA: seriesReal, repM: monthlyPctSeries, rrM: seriesExecM } = computeSeries();
  const seriesBaseline = baselineDist ? seriesBaselineFull : null;
  const todayIdx = months.findIndex(m => m.key === todayKey);
  // Curva 2 (faseada): índice do mês de referência (corte). A série é a "Real + Reprogramado"
  // (rrM mensal / rrA acumulado), verde até o mês selecionado e azul depois.
  const selIdx = (() => { const i = months.findIndex(m => m.key === selMonKey); return i >= 0 ? i : months.length - 1; })();

  const thSt = {
    padding: '9px 14px', fontSize: 10.5, fontWeight: 600,
    letterSpacing: '0.07em', textTransform: 'uppercase',
    color: 'var(--text-soft)', borderBottom: '2px solid var(--border)',
    whiteSpace: 'nowrap', background: 'var(--surface-muted)',
  };
  const tdSt = { padding: '8px 14px', borderBottom: '1px solid var(--border-subtle, rgba(0,0,0,0.06))', verticalAlign: 'middle' };

  return (
    <div ref={curvaRef} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>

      {/* ── Comparar com: Linha de Base / Reprogramação ──────────────────── */}
      <div className="card" style={{ padding: '10px 16px', display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', overflow: 'visible' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-soft)' }}>Comparar com:</span>
        <select className="input" style={{ minWidth: 180 }} value={blVisivelId || ''}
          onChange={e => onSelectBaseline?.(e.target.value || null)} title="Linha de base comparada na Curva Física">
          <option value="">Sem linha de base</option>
          {baselines.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
        </select>
        <select className="input" style={{ minWidth: 180 }} value={repVisivelId || ''}
          onChange={e => { repTouched.current = true; onSelectReprogramacao?.(e.target.value || null); }} title="Reprogramação comparada na Curva Física">
          <option value="">Sem reprogramação</option>
          {reprogramacoes.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
        </select>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-soft)' }}>Mês de referência:</span>
          <select className="input" style={{ minWidth: 140 }} value={selMonKey}
            onChange={e => setSelMonKey(e.target.value)}
            title="Escolhe automaticamente a Reprogramação mais recente anterior a este mês">
            {months.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </span>

        {/* ── Exportar (fora do gráfico): escolhe o que extrair ───────────── */}
        <div ref={expRef} style={{ marginLeft: 'auto', position: 'relative' }}>
          <button className="btn btn-ghost" style={{ gap: 5, fontSize: 12, padding: '4px 10px', height: 28 }}
            onClick={() => setExpOpen(v => !v)} title="Exportar gráfico e/ou tabelas">
            <Icon name="download" size={13} />Exportar
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
          </button>
          {expOpen && (
            <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 6, zIndex: 50, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', padding: 12, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: 0.3 }}>Incluir</div>
              {[['grafico', 'Gráfico Curva S'], ['resumo', 'Resumo Mensal'], ['dist', 'Distribuição por tarefa']].map(([k, label]) => (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer', color: 'var(--text)' }}>
                  <input type="checkbox" checked={expSel[k]} onChange={() => setExpSel(s => ({ ...s, [k]: !s[k] }))} style={{ accentColor: 'var(--brand)', cursor: 'pointer' }} />
                  {label}
                </label>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginTop: 2 }}>
                <span style={{ color: 'var(--text-soft)' }}>Formato PDF:</span>
                <select value={pdfFormat} onChange={e => setPdfFormat(e.target.value)} title="Tamanho da folha do PDF"
                  style={{ fontSize: 12, height: 26, padding: '0 4px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}>
                  <option value="a4">A4</option>
                  <option value="a3">A3</option>
                  <option value="a2">A2</option>
                  <option value="a1">A1</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <button className="btn btn-ghost" style={{ gap: 5, fontSize: 12, padding: '4px 10px', height: 28, flex: 1 }}
                  onClick={exportExcel} disabled={!expSel.resumo && !expSel.dist} title="Exportar tabelas para Excel (.xlsx)">
                  <Icon name="download" size={13} />Excel
                </button>
                <button className="btn btn-ghost" style={{ gap: 5, fontSize: 12, padding: '4px 10px', height: 28, flex: 1 }}
                  onClick={exportPDF} disabled={exportingPDF || (!expSel.grafico && !expSel.resumo && !expSel.dist)} title="Exportar para PDF">
                  <Icon name="download" size={13} />{exportingPDF ? 'Gerando…' : 'PDF'}
                </button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>O gráfico entra apenas no PDF.</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Gráfico SVG ───────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <select value={curvaSel} onChange={e => setCurvaSel(e.target.value)} title="Escolher qual curva exibir"
                style={{ height: 26, fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', padding: '0 6px', cursor: 'pointer' }}>
                <option value="c1">Curva 1</option>
                <option value="c2">Curva 2</option>
              </select>
              <div className="card-title">Curva S — Produção física acumulada</div>
            </div>
            <div className="card-subtitle">
              Distribuição mensal do custo planejado e realizado
            </div>
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'center', flex: 1, flexWrap: 'wrap', fontSize: 12 }}>
            {(() => {
              const legItem = (k, cor, tracejado, label, enabled = true) => (
                <label title={enabled ? 'Marque/desmarque para mostrar/ocultar' : 'Selecione para comparar'}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, whiteSpace: 'nowrap',
                    cursor: enabled ? 'pointer' : 'default',
                    color: enabled ? 'var(--text-soft)' : 'var(--text-faint)',
                    opacity: enabled ? 1 : 0.5 }}>
                  <input type="checkbox" checked={enabled && showSerie[k]} disabled={!enabled}
                    onChange={() => toggleSerie(k)} style={{ accentColor: 'var(--brand)', cursor: enabled ? 'pointer' : 'default' }} />
                  <span style={{ width: 18, height: tracejado ? 2 : 3, background: tracejado ? 'none' : cor,
                    borderTop: tracejado ? `2px dashed ${cor}` : undefined, display: 'inline-block', borderRadius: 2 }} />
                  {label}
                </label>
              );
              return (
                <>
                  {legItem('real', '#16a34a', false, 'Real')}
                  {legItem('rep', 'var(--brand)', false, 'Reprogramado', hasRep)}
                  {legItem('bl', '#94a3b8', true, 'Linha de Base', !!seriesBaseline)}
                </>
              );
            })()}
            <label title="Mostrar/ocultar as barras de % de cada mês (Previsto, Replanejado, Executado)"
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer', color: 'var(--text-soft)' }}>
              <input type="checkbox" checked={showBarras} onChange={() => setShowBarras(v => !v)} style={{ accentColor: 'var(--brand)', cursor: 'pointer' }} />
              <span style={{ width: 14, height: 12, background: '#cbd5e1', display: 'inline-block', borderRadius: 2 }} />
              Barras
            </label>
            <label title="Mostrar/ocultar as linhas acumuladas. Desmarque para ver só as colunas."
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer', color: 'var(--text-soft)' }}>
              <input type="checkbox" checked={showLinhas} onChange={() => setShowLinhas(v => !v)} style={{ accentColor: 'var(--brand)', cursor: 'pointer' }} />
              <span style={{ width: 18, height: 3, background: 'var(--text-soft)', display: 'inline-block', borderRadius: 2 }} />
              Linhas
            </label>
          </div>
        </div>
        <div ref={chartRef} className="card-body" style={{ padding: '12px 16px 0', overflowX: 'auto' }}>
          {curvaSel === 'c1' ? (
            <SCurveChart
              months={months}
              reprogramado={hasRep ? seriesReprog : []}
              real={seriesReal}
              baseline={seriesBaseline}
              monthlyPct={monthlyPctSeries}
              previstoM={seriesPrevistoM}
              replanM={hasRep ? monthlyPctSeries : []}
              execM={seriesExecM}
              showBarras={showBarras}
              showLines={showLinhas}
              todayIdx={todayIdx}
              show={showSerie}
            />
          ) : (
            <SCurveChart2
              months={months}
              selIdx={selIdx}
              previstoM={seriesPrevistoM}
              execM={seriesExecM}
              replanM={seriesExecM}
              baselineA={seriesBaseline}
              execA={seriesReal}
              replanA={seriesReal}
              show={showSerie}
              showBarras={showBarras}
              showLines={showLinhas}
            />
          )}
        </div>
      </div>

      {/* ── Resumo Mensal ─────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Resumo Mensal</div>
            <div className="card-subtitle">Linha de Base · Reprogramação · Real · Desvios</div>
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
              // Real = distribuição planejada AO VIVO (momento atual) — mesmo % da coluna
              // "% do total" no Uso da Tarefa; não copia o reprogramado selecionado.
              const vRR  = filteredPlanned[m.key] || 0;
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

            // MON_W/PROD_W confirmados por medição isolada (fonte/conteúdo reais): "100.00%"
            // e "+100.00%" (linhas de Diferenças) exigem >=56px; o <select> de mês + rótulo
            // "PRODUÇÃO" da coluna Produção exige >=65px. 38px nunca foi suficiente — só não
            // dava pra notar antes porque a tabela sem colgroup/width deixava o navegador
            // "esticar" as colunas por conta própria (mascarando o problema).
            const ACT_W = 130, MON_W = 58, PROD_W = 68;

            const thBase = {
              padding: '6px 4px', fontSize: 10, fontWeight: 700,
              letterSpacing: '0.05em', textTransform: 'uppercase',
              color: 'var(--text-soft)', borderBottom: '2px solid var(--border)',
              whiteSpace: 'nowrap', background: 'var(--surface-muted)',
            };
            // boxShadow "sangra" 2px da própria cor de fundo pra dentro do território da
            // próxima coluna sticky (Produção) — cobre qualquer fresta de arredondamento de
            // sub-pixel entre duas colunas sticky adjacentes ao rolar (visível só ao vivo,
            // nunca em getBoundingClientRect/scrollWidth, por isso não aparecia nas
            // verificações isoladas anteriores). Onde não há fresta, fica escondido atrás da
            // Produção real (que pinta depois, por ordem do DOM); onde há, preenche o vão.
            const thAct  = { ...thBase, textAlign: 'left', minWidth: ACT_W, maxWidth: ACT_W,
              padding: '6px 10px', position: 'sticky', left: 0, zIndex: 2, isolation: 'isolate',
              boxShadow: '2px 0 0 0 var(--surface-muted)' };
            const thMon  = { ...thBase, textAlign: 'right', minWidth: MON_W, maxWidth: MON_W, overflow: 'hidden' };
            // "Produção" fica congelada logo depois da coluna de rótulo (Mensal/Acumulado).
            const thProdSticky = { position: 'sticky', left: ACT_W, zIndex: 2, isolation: 'isolate',
              maxWidth: PROD_W, overflow: 'hidden' };

            const grpHdrBlue = {
              background: 'var(--brand)', color: '#fff',
              fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em',
              textTransform: 'uppercase', padding: '6px 14px',
            };
            const grpHdrGray  = { ...grpHdrBlue, background: '#475569' };
            const grpHdrGreen = { ...grpHdrBlue, background: '#15803d' };
            const grpHdrBase  = { ...grpHdrBlue, background: 'var(--brand-700)' };
            // Rótulo das faixas coloridas: antes era um <span position:sticky> dentro de um
            // único <td colSpan> cobrindo a linha toda — funcionava na posição de repouso, mas
            // sticky num elemento inline-block dentro de uma célula não-sticky não usa o mesmo
            // caminho otimizado (compositor) que um <td>/<th> sticky de verdade, e "arrastava"
            // visivelmente atrás da rolagem. Trocado por duas células: a primeira, sticky de
            // verdade (mesma técnica já usada e comprovada em tdAct/thAct), carrega o rótulo;
            // a segunda, colSpan cobrindo o resto da linha, só estende a cor de fundo.
            // O rótulo precisa de mais que ACT_W (130px) — "Reprogramação Mês Anterior" só
            // cabe sem cortar a partir de ~256px (medido isoladamente) — por isso a primeira
            // célula abrange algumas colunas (ACT_W+PROD_W+MON_W*2 ≈ 314px, com margem).
            const bandLabelRow = (label, style) => {
              const labelCols = Math.min(4, totalCols);
              const restCols = totalCols - labelCols;
              return (
                <tr>
                  <td colSpan={labelCols} style={{ ...style, position: 'sticky', left: 0, zIndex: 1,
                    isolation: 'isolate',
                    // Sangra a própria cor pra dentro da célula seguinte (mesma técnica já
                    // validada em tdAct/tdProd) — mesmo com as duas células declarando a MESMA
                    // cor de fundo, uma sendo sticky (camada composta) e a outra não pode deixar
                    // uma costura visível na fronteira entre elas ao rolar.
                    boxShadow: `6px 0 0 0 ${style.background}`,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {label}
                  </td>
                  {restCols > 0 && <td colSpan={restCols} style={style} />}
                </tr>
              );
            };

            const bdr = '1px solid var(--border-subtle, rgba(0,0,0,0.06))';
            const tdAct = (accum) => ({
              padding: '5px 8px 5px 14px', fontSize: 11,
              borderBottom: bdr, whiteSpace: 'nowrap',
              // maxWidth (sozinho, sem overflow:hidden) já é suficiente pra travar a largura
              // real da coluna, mesmo com table-layout:fixed sem colgroup — confirmado por
              // medição isolada. NÃO colocar overflow:hidden aqui: um elemento com
              // overflow:hidden recorta o PRÓPRIO boxShadow (abaixo) antes dele sair da caixa,
              // o que anulava silenciosamente a sangria pra dentro da Produção. O recorte com
              // "…" dos rótulos longos de "Diferenças" fica por conta do <span> interno
              // (ellipsisSpan, ver usos abaixo), não desta célula.
              maxWidth: ACT_W,
              position: 'sticky', left: 0, zIndex: 1, isolation: 'isolate',
              background: accum ? 'var(--surface-muted, #f9fafb)' : 'var(--surface)',
              // Sangra 6px pra dentro do território da Produção — mais generoso que o valor
              // original (2px) pra não depender de acertar o tamanho exato de uma eventual
              // fresta de arredondamento; onde não há fresta, a Produção real (pintada por
              // cima, depois, na ordem do DOM) esconde a sangria inteira, sem efeito colateral.
              // Cor: a cor BASE da PRÓPRIA Produção (tdProd usa sempre
              // backgroundColor:'var(--surface)', nunca surface-muted, independente de accum),
              // não a cor desta célula — usar a cor errada criava uma listra visível
              // justamente nas linhas "Acumulado" (onde tdAct vira surface-muted mas o
              // vizinho continua surface).
              boxShadow: '6px 0 0 0 var(--surface)',
              fontWeight: accum ? 600 : 400, color: 'var(--text-soft)',
            });
            // Recorte de texto longo (ellipsis) num <span> interno, não na própria <td> — ver
            // comentário em tdAct sobre por que overflow:hidden não pode ficar na <td>.
            const ellipsisSpan = { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
            const tdBase = {
              padding: '5px 4px', fontSize: 10.5, textAlign: 'right',
              borderBottom: bdr, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
            };
            const tdMon  = (accum) => ({
              ...tdBase,
              // maxWidth + overflow:hidden como rede de segurança: mesmo com colgroup+width
              // fixando a largura real da coluna, um valor 1px mais largo que o previsto
              // (ex.: negrito, fonte diferente) vazaria visualmente por cima da coluna
              // Produção sticky vizinha em vez de simplesmente cortar — mesma técnica já
              // aplicada em tdAct.
              maxWidth: MON_W, overflow: 'hidden',
              background: accum ? 'rgba(0,0,0,0.015)' : undefined,
              fontWeight: accum ? 600 : 400,
            });
            const tdProd = (accum) => ({
              ...tdBase,
              maxWidth: PROD_W, overflow: 'hidden',
              fontWeight: accum ? 700 : 600,
              // NÃO usar borderLeft aqui: numa tabela border-collapse:collapse, a borda
              // pertence à GRADE da tabela, não à célula — ela não acompanha o translate do
              // position:sticky ao rolar (bug documentado, cross-browser: Chromium #332350945,
              // CSSWG #3136, Mozilla #1727594/#1658119). O divisor visual "sumia" durante a
              // rolagem sticky, exatamente a fresta relatada — nenhuma das tentativas
              // anteriores (todas em tdAct) tocava essa linha. boxShadow inset é pintado
              // dentro da própria caixa da célula, então acompanha o sticky normalmente.
              boxShadow: 'inset 2px 0 0 0 var(--border)',
              position: 'sticky', left: ACT_W, zIndex: 1, isolation: 'isolate',
              // backgroundImage pinta o tom azul POR CIMA de um backgroundColor opaco — uma
              // célula sticky sem fundo opaco próprio deixaria os meses vazarem por baixo dela
              // ao rolar (mesmo problema já corrigido nas outras tabelas fixas desta tela).
              backgroundColor: 'var(--surface)',
              backgroundImage: accum ? 'linear-gradient(rgba(1,67,134,0.06), rgba(1,67,134,0.06))'
                                      : 'linear-gradient(rgba(1,67,134,0.03), rgba(1,67,134,0.03))',
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
                    background: m.key === selMonKey
                      ? 'rgba(1,67,134,0.10)' : (accum ? 'rgba(0,0,0,0.015)' : undefined),
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

            // width (não só minWidth) é obrigatório aqui: com table-layout:fixed, o
            // navegador só respeita as larguras do colgroup à risca quando a <table> tem
            // uma largura DEFINIDA — com apenas minWidth ele recai num cálculo "auto"
            // baseado no conteúdo (foi isso que fez o <select> da Produção e o texto
            // longo de "Diferenças" bagunçarem a largura real das colunas, mesmo com
            // maxWidth nas células). Confirmado via reprodução isolada antes de aplicar.
            const totalTableW = ACT_W + PROD_W + months.length * MON_W;
            return (
              <table style={{ borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed',
                width: totalTableW, minWidth: totalTableW }}>
                <colgroup>
                  <col style={{ width: ACT_W }} />
                  <col style={{ width: PROD_W }} />
                  {months.map(m => <col key={m.key} style={{ width: MON_W }} />)}
                </colgroup>
                <thead>
                  <tr>
                    <th style={thAct}></th>
                    <th style={{
                      ...thBase, ...thProdSticky, textAlign: 'center', minWidth: PROD_W,
                      // Ver nota em tdProd: borderLeft não acompanha o sticky em tabela
                      // border-collapse — boxShadow inset sim.
                      boxShadow: 'inset 2px 0 0 0 var(--border)',
                      backgroundColor: 'var(--surface-muted)',
                      backgroundImage: 'linear-gradient(rgba(1,67,134,0.07), rgba(1,67,134,0.07))',
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
                        background: m.key === selMonKey ? 'rgba(1,67,134,0.10)' : undefined,
                      }}>{m.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* ── Linha de Base ── */}
                  {bandLabelRow(hasBL ? blNome : 'Linha de Base', grpHdrBase)}
                  <tr>
                    <td style={tdAct(false)}><span style={ellipsisSpan}>Mensal</span></td>
                    {prodCell(hasBL ? blM : months.map(() => null), fmt1, 'var(--brand)', false)}
                    {monCells(hasBL ? blM : months.map(() => null), fmt1, 'var(--brand)', false)}
                  </tr>
                  <tr>
                    <td style={tdAct(true)}><span style={ellipsisSpan}>Acumulado</span></td>
                    {prodCell(hasBL ? blA : months.map(() => null), fmt1, 'var(--brand)', true)}
                    {monCells(hasBL ? blA : months.map(() => null), fmt1, 'var(--brand)', true)}
                  </tr>

                  {/* ── Reprogramação ── */}
                  {bandLabelRow(hasRep ? repNome : 'Reprogramação Mês Anterior',
                    { ...grpHdrBlue, borderTop: '2px solid rgba(255,255,255,0.2)' })}
                  <tr>
                    <td style={tdAct(false)}><span style={ellipsisSpan}>Mensal</span></td>
                    {prodCell(repM, fmt1, 'var(--text)', false)}
                    {monCells(repM, fmt1, 'var(--text)', false)}
                  </tr>
                  <tr>
                    <td style={tdAct(true)}><span style={ellipsisSpan}>Acumulado</span></td>
                    {prodCell(repA, fmt1, 'var(--text)', true)}
                    {monCells(repA, fmt1, 'var(--text)', true)}
                  </tr>

                  {/* ── Real ── */}
                  {bandLabelRow('Real + Reprogramado',
                    { ...grpHdrGreen, borderTop: '2px solid rgba(255,255,255,0.2)' })}
                  <tr>
                    <td style={tdAct(false)}><span style={ellipsisSpan}>Mensal</span></td>
                    {prodCell(rrM, fmt1, '#16a34a', false)}
                    {monCells(rrM, fmt1, '#16a34a', false)}
                  </tr>
                  <tr>
                    <td style={tdAct(true)}><span style={ellipsisSpan}>Acumulado</span></td>
                    {prodCell(rrA, fmt1, '#16a34a', true)}
                    {monCells(rrA, fmt1, '#16a34a', true)}
                  </tr>

                  {/* ── Diferenças ── */}
                  {bandLabelRow('Diferenças',
                    { ...grpHdrGray, borderTop: '2px solid rgba(255,255,255,0.15)' })}
                  {hasBL && (
                    <tr>
                      <td style={tdAct(false)}><span style={ellipsisSpan}>Dif. em relação à Linha de Base — Acumulado</span></td>
                      {prodCell(difBL, fmtD, 'desvio', false)}
                      {monCells(difBL, fmtD, 'desvio', false)}
                    </tr>
                  )}
                  <tr>
                    <td style={tdAct(false)}><span style={ellipsisSpan}>Dif. em relação ao Reprogramado — Acumulado</span></td>
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
        // Sempre o cronograma AO VIVO (momento atual): esta tabela não sofre influência do
        // filtro de Reprogramação — a comparação com a reprogramação fica no Resumo Mensal/gráfico.
        const visibleRows = etapas;
        const taskDistSource = monthlyDist;
        const distTotal   = total;
        const groupVals2  = computeGroupValues(visibleRows, custoOrcadoMap);
        // CurvaFisicaView mostra todas as tarefas independente de collapsed na Lista.
        // A coluna "Curva" (showInDist) é preferência de exibição AO VIVO: mesmo mostrando
        // uma reprogramação (retrato congelado), respeita as marcas atuais do cronograma —
        // senão, marcar depois de criar a reprogramação não apareceria na tabela.
        const liveShown   = new Set(etapas.filter(e => e.showInDist === true).map(e => e.id));
        // Esconde descendentes de grupos recolhidos LOCALMENTE nesta tabela (sem tocar na Lista).
        const isHiddenCurva = (e) => {
          let p = e.parentId;
          while (p) { if (collapsedCurva.has(p)) return true; p = visibleRows.find(x => x.id === p)?.parentId; }
          return false;
        };
        const distRows    = visibleRows.filter(e => (e.isGroup || liveShown.has(e.id) || e.showInDist === true) && !isHiddenCurva(e));
        const ACT_W = 220, VAL_W = 100, PESO_W = 64, CONC_W = 56, MON_W = 58, TOT_W = 68;
        // Colunas congeladas: Atividade, Valor, Peso e Conc. ficam fixas à esquerda ao
        // rolar horizontal (mesma técnica das colunas congeladas da Lista) — só os meses
        // e o Total rolam por baixo delas.
        const COL2_LEFT = ACT_W;
        const COL3_LEFT = ACT_W + VAL_W;
        const COL4_LEFT = ACT_W + VAL_W + PESO_W;
        const thBase = {
          fontSize: 10.5, fontWeight: 600, letterSpacing: '0.07em',
          textTransform: 'uppercase', color: '#fff',
          borderBottom: '2px solid var(--brand-700)',
          background: 'var(--brand)',
          whiteSpace: 'nowrap', padding: '8px 6px',
        };
        const tdBase = {
          borderBottom: '1px solid var(--border-subtle, rgba(0,0,0,0.06))',
          padding: '6px 6px', whiteSpace: 'nowrap', verticalAlign: 'middle',
        };
        const fmt = v => v > 0.005 ? v.toFixed(2) + '%' : '—';

        // Conc. % geral (rodapé) = acumulado da distribuição mensal até o mês de referência,
        // mesma lógica da coluna por linha (ver `concAteRef` acima).
        const concGeralAteRef = distTotal > 0
          ? months.reduce((s, m, i) => i <= selIdx ? s + (filteredPlanned[m.key] || 0) : s, 0) / distTotal * 100
          : 0;

        // calc(100vh - (topbarH+10)) sempre — pinned ou não — mesma técnica do Gantt/Lista:
        // a altura do card nunca muda entre os dois estados, só a posição muda (fixed vs. fluxo
        // normal), então não há "pulo" de layout ao pinar/despinar.
        const distCardH = `calc(100vh - ${topbarH + 10}px)`;
        return (
          // curvaRef é flex-column com gap: 'var(--gap)' entre TODOS os filhos diretos — diferente
          // do Gantt/Lista (soltos num Fragment sem gap ambiente, por isso eles usam marginTop
          // explícito). Se a sentinela e o card fossem filhos diretos separados aqui, cada um
          // consumiria seu próprio gap (2x 'var(--gap)' = respiro dobrado). Por isso os dois vivem
          // dentro de UM wrapper só (sem gap próprio, fluxo normal) — o wrapper inteiro conta como
          // um único filho de curvaRef, recebendo exatamente um 'var(--gap)' do pai.
          <div>
          <div ref={distSentinelRef} aria-hidden="true" style={{ height: 0 }} />
          {distPinned && <div aria-hidden="true" style={{ height: distCardH }} />}
          <div className="card" style={distPinned
            ? { position: 'fixed', top: topbarH + 10, left: distPinned.left, width: distPinned.width, height: distCardH, zIndex: 5, margin: 0, display: 'flex', flexDirection: 'column' }
            : { height: distCardH, display: 'flex', flexDirection: 'column' }
          }>
            <div className="card-header">
              <div>
                <div className="card-title">Distribuição por tarefa</div>
                <div className="card-subtitle">
                  % do custo de cada tarefa alocado por mês
                </div>
              </div>
            </div>
            {/* flex:1 + minHeight:0 (não maxHeight) — o card agora tem altura própria (distCardH,
                acima); o card-body só precisa preencher o espaço restante e rolar dentro dele,
                mesmo padrão flexbox usado no card do Gantt. */}
            <div className="card-body" style={{ padding: 0, overflowX: 'auto', overflowY: 'auto',
              flex: 1, minHeight: 0 }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 11, tableLayout: 'fixed',
                // width explícito (não só minWidth) é necessário para o colgroup abaixo
                // ser respeitado à risca com table-layout:fixed — ver nota na tabela
                // "Resumo Mensal" acima.
                width: ACT_W + VAL_W + PESO_W + CONC_W + months.length * MON_W + TOT_W,
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
                    {/* As 4 primeiras células ficam sticky nas DUAS direções (top+left) — viram
                        "cantos" fixos tanto rolando pra baixo quanto pro lado. As de mês/Total só
                        precisam de top (rolam normalmente na horizontal, escondidas atrás dos
                        cantos quando a coluna correspondente passa por baixo deles). zIndex 3 nos
                        cantos fica acima do zIndex 2 das colunas de mês/Total, que por sua vez
                        fica acima do zIndex 1 das células sticky-left do CORPO da tabela — assim
                        o cabeçalho inteiro sempre pinta por cima das linhas ao rolar verticalmente. */}
                    <th style={{ ...thBase, textAlign: 'left', position: 'sticky', left: 0, top: 0, zIndex: 3, isolation: 'isolate', padding: '8px 14px',
                      boxShadow: '2px 0 0 0 var(--brand)' }}>
                      Atividade
                    </th>
                    <th style={{ ...thBase, textAlign: 'right', position: 'sticky', left: COL2_LEFT, top: 0, zIndex: 3, isolation: 'isolate',
                      boxShadow: '2px 0 0 0 var(--brand)' }}>Valor (R$)</th>
                    <th style={{ ...thBase, textAlign: 'right', position: 'sticky', left: COL3_LEFT, top: 0, zIndex: 3, isolation: 'isolate',
                      boxShadow: '2px 0 0 0 var(--brand)' }}>Peso %</th>
                    <th style={{ ...thBase, textAlign: 'right', background: 'var(--brand-700)', position: 'sticky', left: COL4_LEFT, top: 0, zIndex: 3, isolation: 'isolate' }}>Conc. %</th>
                    {months.map(m => (
                      <th key={m.key} style={{
                        ...thBase, textAlign: 'right', color: '#fff',
                        fontWeight: m.key === selMonKey ? 700 : 600,
                        background: m.key === selMonKey ? 'var(--brand-700)' : 'var(--brand)',
                        position: 'sticky', top: 0, zIndex: 2, isolation: 'isolate',
                      }}>{m.label}</th>
                    ))}
                    {/* borderLeft trocado por boxShadow: numa tabela border-collapse, uma borda
                        crua não acompanha o translate de um elemento sticky ao rolar (mesmo bug
                        já confirmado e corrigido em tdProd/thProdSticky no "Resumo Mensal"). */}
                    <th style={{ ...thBase, textAlign: 'right', position: 'sticky', top: 0, zIndex: 2, isolation: 'isolate',
                      boxShadow: 'inset 2px 0 0 0 var(--border)' }}>Total</th>
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
                      ? getGroupMonthlyDist(e.id, visibleRows, taskDistSource)
                      : (taskDistSource[e.id] || {});
                    const taskCusto  = custoEf(e, gv);
                    // Conc. % = acumulado da distribuição mensal até o mês de referência
                    // selecionado (não o `avanco` bruto da tarefa) — mesma lógica da Curva S.
                    const concAteRef = taskCusto > 0
                      ? months.reduce((s, m, i) => i <= selIdx ? s + (taskDist[m.key] || 0) : s, 0) / taskCusto * 100
                      : 0;
                    // Tarefa-pai dentro de outra tarefa-pai: tom mais forte pro nível mais alto
                    // (raiz da EAP), enfraquecendo a cada nível mais fundo — assim dá pra
                    // distinguir visualmente quem está aninhado dentro de quem, em vez de todo
                    // grupo cair no mesmo azul plano.
                    const groupBg = e.nivel <= 0 ? 'var(--brand-100)' : e.nivel === 1 ? 'var(--brand-50)' : 'var(--brand-tint)';
                    const rowBg = e.isGroup ? groupBg : (ri % 2 === 0 ? undefined : 'rgba(0,0,0,0.013)');
                    // Fundo sticky sempre opaco (backgroundColor); o tom zebra (rowBg,
                    // quase transparente) entra por cima via backgroundImage — nunca como
                    // `background` sozinho, senão as colunas de mês vazam por baixo ao rolar.
                    const stickyBg = {
                      backgroundColor: e.isGroup ? groupBg : 'var(--surface)',
                      backgroundImage: (!e.isGroup && rowBg) ? `linear-gradient(${rowBg}, ${rowBg})` : undefined,
                    };
                    return (
                      <tr key={e.id} style={{ background: rowBg }}>
                        {/* Atividade (sticky) */}
                        <td style={{
                          ...tdBase, position: 'sticky', left: 0, zIndex: 1, isolation: 'isolate',
                          ...stickyBg,
                          // Sangra 2px da própria cor pra dentro da coluna Valor — cobre qualquer
                          // fresta de sub-pixel entre duas colunas sticky adjacentes ao rolar
                          // (mesma técnica aplicada em "Resumo Mensal"). NÃO colocar
                          // overflow:hidden nesta <td>: ele recortaria o próprio boxShadow antes
                          // dele sair da caixa, anulando a sangria. O recorte do texto longo já é
                          // feito pelo <span> interno abaixo (que tem seu próprio overflow:hidden).
                          boxShadow: `2px 0 0 0 ${stickyBg.backgroundColor}`,
                          fontWeight: e.isGroup ? 600 : 400,
                          paddingLeft: e.nivel * 14 + 10,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {e.isGroup && <span style={{ color: 'var(--text-muted)', fontSize: 10, flexShrink: 0 }}>▸</span>}
                            <span style={{ display: 'block', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.etapa}</span>
                          </div>
                        </td>
                        {/* Valor (sticky) */}
                        <td style={{ ...tdBase, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                          fontWeight: e.isGroup ? 700 : 400,
                          color: taskCusto > 0 ? 'var(--text)' : 'var(--text-faint)', fontSize: 10.5,
                          position: 'sticky', left: COL2_LEFT, zIndex: 1, isolation: 'isolate',
                          ...stickyBg, boxShadow: `2px 0 0 0 ${stickyBg.backgroundColor}` }}>
                          {taskCusto > 0 ? fmtBRL(taskCusto) : '—'}
                        </td>
                        {/* Peso (sticky) */}
                        <td style={{ ...tdBase, textAlign: 'right', fontWeight: e.isGroup ? 700 : 400,
                          color: e.isGroup ? 'var(--text)' : 'var(--text-soft)', fontSize: 10.5,
                          position: 'sticky', left: COL3_LEFT, zIndex: 1, isolation: 'isolate',
                          ...stickyBg, boxShadow: `2px 0 0 0 ${stickyBg.backgroundColor}` }}>
                          {distTotal > 0 && taskCusto > 0 ? (taskCusto / distTotal * 100).toFixed(2) + '%' : '—'}
                        </td>
                        {/* Conc. (sticky) — coluna destacada com fundo sutil. backgroundImage pinta os tons
                            (zebra + azul) POR CIMA de um backgroundColor opaco (senão a célula sticky, sem
                            fundo opaco próprio, deixaria os meses vazarem por baixo ao rolar). */}
                        <td style={{ ...tdBase, textAlign: 'right',
                          ...stickyBg,
                          backgroundImage: [
                            stickyBg.backgroundImage,
                            'linear-gradient(rgba(1,67,134,0.05), rgba(1,67,134,0.05))',
                          ].filter(Boolean).join(', '),
                          position: 'sticky', left: COL4_LEFT, zIndex: 1, isolation: 'isolate',
                          color: Math.round(concAteRef) >= 100 ? '#16a34a' : concAteRef > 0 ? 'var(--brand)' : 'var(--text-faint)',
                          fontWeight: 600, fontSize: 10.5 }}>
                          {concAteRef > 0.005 ? concAteRef.toFixed(2) + '%' : '—'}
                        </td>
                        {/* Meses */}
                        {months.map(m => {
                          const v   = taskDist[m.key] || 0;
                          const pct = taskCusto > 0 ? v / taskCusto * 100 : 0;
                          const empty = pct <= 0.5;
                          const f = Math.min(1, pct / 100);
                          const sel = m.key === selMonKey;
                          // Grupos (pai): sem cor por peso, só o fundo da linha; mês selecionado azul claro.
                          if (e.isGroup) return (
                            <td key={m.key} style={{ ...tdBase, textAlign: 'right', fontSize: 10.5, fontWeight: 700,
                              background: sel ? 'rgba(1,67,134,0.10)' : rowBg }}>
                              {empty ? '—' : fmt(pct)}
                            </td>
                          );
                          // Folhas: intensidade por peso, SEM negrito; célula vazia no mês selecionado fica azul claro.
                          return (
                            <td key={m.key}
                              className={'heat-cell' + (empty ? ' empty' : (f > 0.4 ? ' hot' : ''))}
                              style={{ ...tdBase, textAlign: 'right', fontSize: 10.5, fontWeight: 400, '--f': f,
                                ...(empty && sel ? { background: 'rgba(1,67,134,0.06)' } : {}) }}>
                              {empty ? '—' : fmt(pct)}
                            </td>
                          );
                        })}
                        {/* Total col */}
                        <td style={{ ...tdBase, textAlign: 'right', borderLeft: '2px solid var(--border)',
                          fontWeight: e.isGroup ? 700 : 600, color: taskCusto > 0 ? (e.isGroup ? 'var(--text)' : 'var(--text-soft)') : 'var(--text-faint)', fontSize: 10.5 }}>
                          {taskCusto > 0 ? '100%' : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--surface-muted)', fontWeight: 600 }}>
                    <td style={{ ...tdBase, borderTop: '2px solid var(--border)', position: 'sticky', left: 0,
                      zIndex: 1, isolation: 'isolate', background: 'var(--surface-muted)', paddingLeft: 14, fontSize: 11,
                      boxShadow: '2px 0 0 0 var(--surface-muted)' }}>
                      Total geral
                    </td>
                    <td style={{ ...tdBase, borderTop: '2px solid var(--border)', textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums', fontSize: 10.5,
                      position: 'sticky', left: COL2_LEFT, zIndex: 1, isolation: 'isolate', background: 'var(--surface-muted)',
                      boxShadow: '2px 0 0 0 var(--surface-muted)' }}>
                      {fmtBRL(distTotal)}
                    </td>
                    <td style={{ ...tdBase, borderTop: '2px solid var(--border)', textAlign: 'right', fontSize: 10.5,
                      position: 'sticky', left: COL3_LEFT, zIndex: 1, isolation: 'isolate', background: 'var(--surface-muted)',
                      boxShadow: '2px 0 0 0 var(--surface-muted)' }}>100%</td>
                    <td style={{ ...tdBase, borderTop: '2px solid var(--border)', textAlign: 'right',
                      backgroundColor: 'var(--surface-muted)',
                      backgroundImage: 'linear-gradient(rgba(1,67,134,0.05), rgba(1,67,134,0.05))',
                      position: 'sticky', left: COL4_LEFT, zIndex: 1, isolation: 'isolate',
                      color: '#16a34a', fontSize: 10.5 }}>
                      {concGeralAteRef > 0.005 ? concGeralAteRef.toFixed(2) + '%' : '—'}
                    </td>
                    {months.map(m => {
                      const pct = distTotal > 0 ? ((filteredPlanned[m.key]) || 0) / distTotal * 100 : 0;
                      return (
                        <td key={m.key} style={{
                          ...tdBase, borderTop: '2px solid var(--border)', textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                          color: pct > 0.005 ? 'var(--brand)' : 'var(--text-faint)',
                          background: m.key === selMonKey ? 'rgba(1,67,134,0.10)' : undefined,
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
function defaultRepId(reps, refMonthKey) {
  if (!reps.length) return null;
  const ref = refMonthKey || new Date().toISOString().slice(0, 7);
  const anteriores = reps.filter(r => r.criadaEm.slice(0, 7) < ref);
  const pool = anteriores.length ? anteriores : reps;
  return pool.reduce((best, r) => (!best || r.criadaEm > best.criadaEm) ? r : best, null)?.id ?? null;
}

// ─── Seleção visível da Curva (Linha de Base / Reprogramação), persistida por obra ──
function carregarBlVisivel(obraId) {
  try { return localStorage.getItem('crono_bl_visivel_' + obraId) || null; } catch { return null; }
}
function carregarRepVisivel(obraId) {
  try { return localStorage.getItem('crono_rep_visivel_' + obraId) || null; } catch { return null; }
}
function carregarMesRef(obraId) {
  try { return localStorage.getItem('crono_mesref_' + obraId) || null; } catch { return null; }
}
function mesAtualKey() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}

// updated_at que acreditamos ser o vigente por obra (última carga ou último save nosso).
// Base do bloqueio otimista: se o banco divergir disso, outra pessoa salvou no meio.
// _cronCache/_cronSavedAt agora vêm de um módulo compartilhado (cronogramaCache) para que
// outras telas (Orçamento × Cronograma) possam invalidar o cache ao gravar direto no banco.

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
    if (error) { logger.error('falha ao salvar cronograma', { module: 'cronograma', action: 'upsert', obraId, err: error }); return { error }; }
    _cronSavedAt[obraId] = nowISO;
    invalidateOcCache(obraId);
    return { error: null };
  }

  // Update condicional: só grava se o updated_at do banco ainda for o que carregamos.
  const { data, error } = await supabase.from('cronogramas')
    .update(payload).eq('obra_id', obraId).eq('updated_at', expected).select('updated_at');
  if (error) { logger.error('falha ao salvar cronograma', { module: 'cronograma', action: 'update', obraId, err: error }); return { error }; }
  if (data && data.length) { _cronSavedAt[obraId] = nowISO; invalidateOcCache(obraId); return { error: null }; }

  // 0 linhas: ou a linha ainda não existe, ou o updated_at mudou (conflito).
  const { data: atual } = await supabase.from('cronogramas')
    .select('updated_at').eq('obra_id', obraId).maybeSingle();
  if (!atual) {
    const { error: insErr } = await supabase.from('cronogramas').insert({ obra_id: obraId, ...payload });
    if (insErr) { logger.error('falha ao inserir cronograma', { module: 'cronograma', action: 'insert', obraId, err: insErr }); return { error: insErr }; }
    _cronSavedAt[obraId] = nowISO;
    invalidateOcCache(obraId);
    return { error: null };
  }
  // Conflito: mantém expected inalterado para os próximos saves seguirem barrando até recarregar.
  logger.warn('conflito de edicao — outra sessao salvou', { module: 'cronograma', action: 'conflito', obraId });
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

// ─── Modais de Linha de Base / Reprogramação / Feriados ──────────────────────
// Movidos para ./cronogramaModais.

// ─── CronogramaFull ──────────────────────────────────────────────────────────
const CronogramaFull = ({ initialObraId, obras = [], userProfile }) => {
  const D    = AppData;
  const toast = useToast();

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
  // Sempre abre na aba Gantt (não persiste a sub-aba entre acessos ao módulo).
  const [view,         setView]         = React.useState('gantt');
  // Módulo inteiro OU só a aba ativa marcada como "Visualizar" no admin — recalcula a
  // cada troca de aba (view), então uma aba liberada pra editar volta a funcionar ao navegar pra ela.
  const readOnly = moduloSomenteLeitura(userProfile, 'cronograma') || abaSomenteLeitura(userProfile, 'cronograma', view);

  const abasCronograma = [
    { id: 'gantt', label: 'Gantt' },
    { id: 'lista', label: 'Lista' },
    { id: 'uso',   label: 'Uso da Tarefa' },
    { id: 'curva', label: 'Curva Física' },
    { id: 'medicao', label: 'Medição Mensal' },
    { id: 'fluxo', label: 'Fluxo Executivo' },
  ].map(a => ({ ...a, locked: !podeVerAba(userProfile, 'cronograma', a.id) }));
  const abasCronogramaLiberadas = abasCronograma.filter(a => !a.locked);

  // Se a sub-aba salva não estiver liberada para este usuário, cai na primeira permitida
  React.useEffect(() => {
    if (abasCronogramaLiberadas.length && !abasCronogramaLiberadas.some(a => a.id === view)) setView(abasCronogramaLiberadas[0].id);
  }, [abasCronogramaLiberadas, view]);
  React.useEffect(() => { if (obraSel) sessionStorage.setItem('cronograma_obra', obraSel); }, [obraSel]);
  const [etapas,       setEtapas]       = React.useState([]);
  const [customCols,   setCustomCols]   = React.useState(() => D.cronogramaCustomCols || []);
  const [baselines,    setBaselines]    = React.useState(() => carregarBaselines(defaultObraId || ''));
  const [blVisivelId,  setBlVisivelId]  = React.useState(() => carregarBlVisivel(defaultObraId || ''));
  const [reprogramacoes, setReprogramacoes] = React.useState(() => carregarReprogramacoes(defaultObraId || ''));
  const [repVisivelId,   setRepVisivelId]   = React.useState(() => carregarRepVisivel(defaultObraId || '') ?? defaultRepId(carregarReprogramacoes(defaultObraId || '')));
  // Mês de referência da Curva Física — persistido por obra pelo mesmo motivo de blVisivelId/
  // repVisivelId: a view "curva" é desmontada ao trocar de sub-aba, perdendo estado local.
  const [selMonKey,      setSelMonKey]      = React.useState(() => carregarMesRef(defaultObraId || '') || mesAtualKey());
  const [showCriar,    setShowCriar]    = React.useState(false);
  const [showCriarRep,     setShowCriarRep]     = React.useState(false);
  const [showGerenciarRep, setShowGerenciarRep] = React.useState(false);
  // Cronograma iniciado mas ainda sem etapas: mostra o editor vazio sem gravar nada
  const [iniciando,    setIniciando]    = React.useState(false);
  const [showGerenciar, setShowGerenciar] = React.useState(false);
  // Feriados por obra (dias não trabalhados) — persistidos por obra no navegador.
  const [showFeriados, setShowFeriados] = React.useState(false);
  const [showProjInfo, setShowProjInfo] = React.useState(false);
  const [feriadosCfg,  setFeriadosCfg]  = React.useState({ dias: [], sabadoUtil: false });
  React.useEffect(() => {
    try { const raw = localStorage.getItem('ls_crono_feriados_' + obraSel); setFeriadosCfg(raw ? JSON.parse(raw) : { dias: [], sabadoUtil: false }); }
    catch { setFeriadosCfg({ dias: [], sabadoUtil: false }); }
  }, [obraSel]);
  // Colunas ocultas da Lista (Exibir → Colunas) — por obra, no histórico de undo/redo
  // (ver commit/undo/redo abaixo), igual a customCols e feriadosCfg.
  const [hiddenCols, setHiddenCols] = React.useState(() => new Set());
  React.useEffect(() => {
    try { setHiddenCols(new Set(JSON.parse(localStorage.getItem('ls_hidden_' + obraSel) || '[]'))); }
    catch { setHiddenCols(new Set()); }
  }, [obraSel]);

  // Altura real da topbar (mesmo padrão de ListaInterativa.jsx) — usada para congelar o card
  // do Gantt exatamente abaixo dela, sem corte, ao rolar a página.
  const [topbarH, setTopbarH] = React.useState(60);
  React.useEffect(() => {
    const measure = () => { const tb = document.querySelector('.topbar'); if (tb) setTopbarH(tb.offsetHeight); };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Fixa o card do Gantt (título+legenda+ribbon+grade) sob a topbar ao rolar a página — mesmo
  // mecanismo de `listaPinned` em ListaInterativa.jsx (sentinela + position:fixed via JS). Os
  // cartões de indicador (acima) NÃO entram no congelamento — só o que vem abaixo deles.
  const ganttSentinelRef = React.useRef(null);
  const [ganttPinned, setGanttPinned] = React.useState(null);
  const [ganttDocTop, setGanttDocTop] = React.useState(null);
  React.useEffect(() => {
    let raf = 0;
    const check = () => {
      raf = 0;
      const s = ganttSentinelRef.current;
      if (!s) return;
      const r = s.getBoundingClientRect();
      const dt = Math.round(r.top + window.scrollY);
      setGanttDocTop(prev => (prev === dt ? prev : dt));
      if (r.top <= topbarH) {
        setGanttPinned(prev => (prev && Math.abs(prev.left - r.left) < 0.5 && Math.abs(prev.width - r.width) < 0.5) ? prev : { left: r.left, width: r.width });
      } else {
        setGanttPinned(prev => (prev ? null : prev));
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(check); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    let ro = null;
    if (typeof ResizeObserver !== 'undefined' && ganttSentinelRef.current) {
      ro = new ResizeObserver(onScroll);
      ro.observe(ganttSentinelRef.current);
    }
    const id = setTimeout(check, 0);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); clearTimeout(id); if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect(); };
  }, [topbarH]);

  // Pavimentos já usados nesta obra (tabela própria `pavimentos_obra`), sugeridos como chips
  // no modal "Inserção automática de pavimentos".
  const [pavimentosObra, setPavimentosObra] = React.useState([]);
  const salvarNovosPavimentos = (nomes) => {
    const novos = nomes.filter(n => !pavimentosObra.includes(n));
    if (!novos.length) return;
    setPavimentosObra(prev => [...new Set([...prev, ...novos])]);
    pavimentosService.salvar(obraSel, novos);
  };
  const excluirPavimentoObra = (nome) => {
    setPavimentosObra(prev => prev.filter(n => n !== nome));
    pavimentosService.excluir(obraSel, nome);
  };
  // Preferências de visualização estilo MS Project (Mostrar/Ocultar), por obra.
  // summaryTasks (mostrar tarefa-resumo em negrito/azul) NÃO é persistido: ficava salvo
  // por navegador/aparelho, então duas pessoas na mesma obra podiam ver a hierarquia
  // diferente sem nenhuma pista do motivo (uma com o checkbox desligado de uma sessão
  // antiga, esquecido). Sempre nasce ligado; ainda dá pra desligar durante a sessão,
  // só não fica "preso" desligado de uma vez anterior.
  const [viewCfg, setViewCfg] = React.useState({ projSummary: false, summaryTasks: true });
  React.useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem('crono_view_' + obraSel) || 'null');
      setViewCfg({ projSummary: v?.projSummary ?? false, summaryTasks: true });
    } catch { setViewCfg({ projSummary: false, summaryTasks: true }); }
  }, [obraSel]);
  const setViewPref = (patch) => setViewCfg(prev => {
    const next = { ...prev, ...patch };
    try { localStorage.setItem('crono_view_' + obraSel, JSON.stringify({ projSummary: next.projSummary })); } catch { /* ignore */ }
    return next;
  });
  // Filtro global (aba "Filtro" da Lista) — compartilhado entre Lista e Gantt, para o filtro
  // valer nas duas views. KPIs do topo continuam sobre `etapas` completo, sem filtro.
  const [filtroResp, setFiltroResp] = React.useState('');
  const [filtroPreset, setFiltroPreset] = React.useState('');
  const [filtroPresetRange, setFiltroPresetRange] = React.useState({ de: '', ate: '' });
  const [filtroTaskIds, setFiltroTaskIds] = React.useState([]);
  const [filtroTexto, setFiltroTexto] = React.useState('');
  const [filtroVinculo, setFiltroVinculo] = React.useState('');
  // Salva explicitamente (evita corromper ao trocar de obra com um efeito keyed em obraSel).
  const saveFeriados = (next) => {
    setFeriadosCfg(next);
    try { localStorage.setItem('ls_crono_feriados_' + obraSel, JSON.stringify(next)); } catch { /* ignore */ }
    // Aplica o novo calendário JÁ e re-cascateia: reposiciona as dependentes
    // (TI/TT/II/IT) conforme os novos dias úteis. O commit persiste, num único save,
    // as etapas reposicionadas + a config de feriados (coluna feriados no banco),
    // com entrada no histórico de undo/redo. localStorage acima = cache/fallback.
    setWorkCal(next);
    commit(autoScheduleFromDeps(etapas), { silent: true, feriados: next });
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
  const succByIdAll = React.useMemo(() => computeSuccessors(etapas), [etapas]);
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
  // Histórico paralelo das colunas personalizadas, alinhado por índice a histRef —
  // permite que undo/redo restaure também a definição de colunas (add/excluir coluna).
  const histColsRef = React.useRef([customCols]);
  // Histórico paralelo do calendário de feriados, alinhado por índice a histRef —
  // permite que undo/redo restaure também o calendário (ver saveFeriados/commit abaixo).
  const histFeriadosRef = React.useRef([feriadosCfg]);
  // Histórico paralelo das colunas ocultas da Lista, alinhado por índice a histRef —
  // permite que undo/redo restaure também exibir/ocultar coluna.
  const histHiddenColsRef = React.useRef([[...hiddenCols]]);
  const hidxRef = React.useRef(0);
  const undoRef        = React.useRef(null);
  const redoRef        = React.useRef(null);
  const applyOutlineRef = React.useRef(null);
  const saveTimerRef   = React.useRef(null);
  // Foco de seleção após undo/redo ou "Editar tarefa" — leva a Lista a selecionar/rolar até a tarefa
  const [histFocus, setHistFocus] = React.useState(null); // { id, nonce }
  const focusNonceRef = React.useRef(0);
  const focarTarefa = (id) => { if (id) setHistFocus({ id, nonce: ++focusNonceRef.current }); };
  // Primeiro id cujo conteúdo difere entre dois snapshots de etapas
  const diffTaskId = (a, b) => {
    const mb = new Map(b.map(e => [e.id, e]));
    for (const e of a) { const o = mb.get(e.id); if (!o || JSON.stringify(o) !== JSON.stringify(e)) return e.id; }
    for (const e of b) { if (!a.find(x => x.id === e.id)) return e.id; }
    return null;
  };

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
    // Lê o calendário de feriados persistido (mesma lógica do efeito keyed em obraSel, linha
    // acima) — usado para semear histFeriadosRef sem depender do estado feriadosCfg, que só
    // é atualizado num efeito separado e pode ainda não ter sido aplicado neste ponto.
    const lerFeriadosLS = (obraId) => {
      try { const raw = localStorage.getItem('ls_crono_feriados_' + obraId); return raw ? JSON.parse(raw) : { dias: [], sabadoUtil: false }; }
      catch { return { dias: [], sabadoUtil: false }; }
    };
    // Idem para colunas ocultas — puramente local/navegador, não vem do banco.
    const lerHiddenColsLS = (obraId) => {
      try { return JSON.parse(localStorage.getItem('ls_hidden_' + obraId) || '[]'); }
      catch { return []; }
    };
    async function carregar() {
      if (!obraSel) { setLoadedObraId(null); return; }
      // Pavimentos salvos (tabela própria) — não faz parte do cache de etapas/baselines,
      // busca à parte e não bloqueia o resto do carregamento.
      pavimentosService.listar(obraSel).then(nomes => { if (!cancelled) setPavimentosObra(nomes); });
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
        histColsRef.current = [cached.customCols];
        histFeriadosRef.current = [lerFeriadosLS(obraSel)];
        histHiddenColsRef.current = [lerHiddenColsLS(obraSel)];
        hidxRef.current = 0;
        setBlVisivelId(carregarBlVisivel(obraSel));
        setRepVisivelId(carregarRepVisivel(obraSel) ?? defaultRepId(cached.reprogramacoes || []));
        setSelMonKey(carregarMesRef(obraSel) || mesAtualKey());
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
        histColsRef.current = [db.custom_cols?.length ? db.custom_cols : customCols];
        histFeriadosRef.current = [lerFeriadosLS(obraSel)];
        histHiddenColsRef.current = [lerHiddenColsLS(obraSel)];
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
        setRepVisivelId(carregarRepVisivel(obraSel) ?? defaultRepId(reps));
        // Feriados: DB é a fonte de verdade quando tem conteúdo; senão mantém o valor do
        // localStorage (setado no efeito keyed em obraSel) para migração suave.
        if (db.feriados && (db.feriados.dias?.length || db.feriados.sabadoUtil)) {
          setFeriadosCfg(db.feriados);
          histFeriadosRef.current[0] = db.feriados; // ponto zero do histórico já nasce consistente
        }
      } else {
        const mock = sanitizarERecuperar(migrateEtapas(D.cronograma[obraSel] || []));
        setEtapas(mock);
        histRef.current = [mock.map(e => ({ ...e }))];
        histColsRef.current = [customCols];
        histFeriadosRef.current = [lerFeriadosLS(obraSel)];
        histHiddenColsRef.current = [lerHiddenColsLS(obraSel)];
        hidxRef.current = 0;
        setBaselines(carregarBaselines(obraSel));
        const reps = carregarReprogramacoes(obraSel);
        setReprogramacoes(reps);
        setRepVisivelId(carregarRepVisivel(obraSel) ?? defaultRepId(reps));
      }
      setBlVisivelId(carregarBlVisivel(obraSel));
      setSelMonKey(carregarMesRef(obraSel) || mesAtualKey());
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

  // Persiste a seleção visível da Curva (Linha de Base / Reprogramação) por obra, para
  // sobreviver a troca de aba e ao recarregar o app. Só grava após a carga concluir.
  React.useEffect(() => {
    if (!obraSel || loadedObraId !== obraSel) return;
    try {
      if (blVisivelId) localStorage.setItem('crono_bl_visivel_' + obraSel, blVisivelId);
      else localStorage.removeItem('crono_bl_visivel_' + obraSel);
    } catch { /* ignore */ }
  }, [blVisivelId, obraSel, loadedObraId]);

  React.useEffect(() => {
    if (!obraSel || loadedObraId !== obraSel) return;
    try {
      if (repVisivelId) localStorage.setItem('crono_rep_visivel_' + obraSel, repVisivelId);
      else localStorage.removeItem('crono_rep_visivel_' + obraSel);
    } catch { /* ignore */ }
  }, [repVisivelId, obraSel, loadedObraId]);

  React.useEffect(() => {
    if (!obraSel || loadedObraId !== obraSel) return;
    try { localStorage.setItem('crono_mesref_' + obraSel, selMonKey); } catch { /* ignore */ }
  }, [selMonKey, obraSel, loadedObraId]);

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
  // Nomes já usados por linhas de base e reprogramações (para bloquear duplicados, sem diferenciar tipo)
  const nomesUsados = [...baselines, ...reprogramacoes].map(x => (x.nome || '').trim().toLowerCase());

  const criarLinha = (nome) => {
    if (nomesUsados.includes(nome.trim().toLowerCase())) {
      toast('Já existe uma linha de base ou reprogramação com esse nome.', { tone: 'danger' });
      return;
    }
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
    // Gera um nome de cópia único (não repete outra linha de base nem reprogramação)
    let nomeCopia = `${orig.nome} (cópia)`;
    let n = 2;
    while (nomesUsados.includes(nomeCopia.trim().toLowerCase())) { nomeCopia = `${orig.nome} (cópia ${n})`; n++; }
    const copia = { ...orig, id: 'BL-' + Date.now(), nome: nomeCopia, etapas: orig.etapas.map(e => ({ ...e })) };
    const novas = [...baselines, copia];
    setBaselines(novas);
    salvarBaselines(obraSel, novas);
    salvarCronograma(obraSel, etapas, customCols, novas, reprogramacoes).then(handleSaveResult);
    toast(`"${copia.nome}" criada`, { tone: 'success', icon: 'check' });
  };

  // Handlers de reprogramação (retrato imutável — sem sobrescrever/duplicar)
  const criarReprogramacao = (nome) => {
    if (nomesUsados.includes(nome.trim().toLowerCase())) {
      toast('Já existe uma linha de base ou reprogramação com esse nome.', { tone: 'danger' });
      return;
    }
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

  // Exibir/ocultar coluna na Lista — entra no histórico de undo/redo (ver commit acima).
  // Aceita um Set direto ou uma função atualizadora (mesma assinatura de um setState).
  const onHiddenColsChange = (updater) => {
    const next = typeof updater === 'function' ? updater(hiddenCols) : updater;
    const nextArr = [...next].sort();
    const curArr = [...hiddenCols].sort();
    if (JSON.stringify(nextArr) === JSON.stringify(curArr)) return; // sem mudança real
    commit(etapas, { silent: true, hiddenCols: nextArr });
  };

  // Etapas da baseline visível (null = nenhuma)
  const baselineEtapas = blVisivelId
    ? ((baselines.find(b => b.id === blVisivelId)?.etapas) || (reprogramacoes.find(r => r.id === blVisivelId)?.etapas) || null)
    : null;

  const obra       = obras.find(o => o.id === obraSel) || obras[0];
  const concluidas = etapas.filter(e => effStatus(e) === 'done').length;

  // Pesos vinculados ao orçamento — quando existem, substituem custo na Curva S e no avanço
  const valorVinculadoMapFull = React.useMemo(
    () => computeValorVinculadoMap(etapas, vinculos, orcamentoItensMap),
    [etapas, vinculos, orcamentoItensMap]
  );
  // Custo Orçado (novo peso do avanço físico): Valor Vinculado + Custo Real de cada
  // etapa, somados sempre — substitui o antigo weightOverride (valor vinculado OU custo).
  const custoOrcadoMap = React.useMemo(
    () => computeCustoOrcadoMap(etapas, valorVinculadoMapFull),
    [etapas, valorVinculadoMapFull]
  );
  const weightOverride = custoOrcadoMap;
  // WBS e rollup de grupo (valores agregados por tarefa-pai): calculados aqui porque
  // CronogramaFull nunca desmonta ao trocar de aba — Lista/Uso da Tarefa/Gantt recebem
  // por prop em vez de recalcular do zero a cada remontagem (custo real com 1000+ etapas).
  const groupVals = React.useMemo(() => computeGroupValues(etapas, custoOrcadoMap), [etapas, custoOrcadoMap]);
  const wbsMap     = React.useMemo(() => computeAllWBS(etapas), [etapas]);

  // Ids de tarefa com vínculo direto a algum item de orçamento (para o filtro vinculado/não vinculado).
  const vinculadoIds = React.useMemo(() => new Set(vinculos.map(v => v.etapa_id)), [vinculos]);

  // Avanço ponderado pelo Custo Orçado (valor vinculado + custo real) de cada etapa (folhas).
  const avancoTotal = React.useMemo(
    () => computeAvancoFisico(etapas, custoOrcadoMap),
    [etapas, custoOrcadoMap]
  );

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
    // Tarefa que chega a 100% de avanço trava o valor vinculado no que ele vale agora
    // (deixa de entrar no rateio proporcional do grupo — ver `distributeToLeaves` em
    // ganttUtils.js); se reabrir (avanço < 100), destrava e volta ao rateio normal.
    // Roda pra QUALQUER commit (Lista, Gantt, colar, etc.) — é o único caminho de gravação —
    // então também "pega" tarefas que já estavam 100% concluídas antes desta trava existir,
    // na primeira vez que qualquer edição tocar o cronograma delas.
    const precisaTravar   = novas.some(e => !e.isGroup && (e.avanco ?? 0) >= 100 && e.valorVinculadoFixo == null);
    const precisaDestravar = novas.some(e => !e.isGroup && (e.avanco ?? 0) < 100 && e.valorVinculadoFixo != null);
    let ajustadas = novas;
    if (precisaTravar || precisaDestravar) {
      const valorMap = precisaTravar ? computeValorVinculadoMap(novas, vinculos, orcamentoItensMap) : null;
      ajustadas = novas.map(e => {
        if (e.isGroup) return e;
        const done = (e.avanco ?? 0) >= 100;
        if (done && e.valorVinculadoFixo == null) return { ...e, valorVinculadoFixo: valorMap[e.id] || 0 };
        if (!done && e.valorVinculadoFixo != null) return { ...e, valorVinculadoFixo: null };
        return e;
      });
    }
    const clean = ajustadas.map(e => ({ ...e }));
    // Qualquer commit que traga `feriados` (config de calendário/pavimentos salvos) também
    // sincroniza o estado local — sem isso, quem chamou onCommit(novas, {feriados}) fora do
    // fluxo do FeriadosModal (ex.: PavimentosModal) só veria o valor novo após recarregar.
    if (opts.feriados !== undefined) {
      setFeriadosCfg(opts.feriados);
      try { localStorage.setItem('ls_crono_feriados_' + obraSel, JSON.stringify(opts.feriados)); } catch { /* ignore */ }
    }
    // Auto-histórico: registra mudanças relevantes por tarefa (fora do undo/redo)
    taskDetailStore.diffAndLog(obraSel, etapas, clean, currentUserRef.current);
    // customCols também entra no histórico (undo/redo restaura a definição de colunas).
    const colsSnap = opts.customCols !== undefined ? opts.customCols : customCols;
    if (opts.customCols !== undefined) { setCustomCols(opts.customCols); D.cronogramaCustomCols = opts.customCols; }
    const feriadosSnap = opts.feriados !== undefined ? opts.feriados : feriadosCfg;
    // hiddenCols (colunas ocultas da Lista) também entra no histórico — exibir/ocultar coluna
    // vira um passo de Ctrl+Z de verdade, ao contrário do collapse (skipHistory abaixo).
    const hiddenColsSnap = opts.hiddenCols !== undefined ? opts.hiddenCols : [...hiddenCols];
    if (opts.hiddenCols !== undefined) {
      setHiddenCols(new Set(opts.hiddenCols));
      try { localStorage.setItem('ls_hidden_' + obraSel, JSON.stringify(opts.hiddenCols)); } catch { /* ignore */ }
    }
    // skipHistory: usado por ações que não são "edições" de verdade (ex.: expandir/recolher
    // grupo) — aplica e salva normalmente, mas não ocupa um slot de undo/redo. Sem isso, cada
    // toggle de collapse entraria no mesmo histórico linear das edições reais, fazendo o
    // Ctrl+Z desfazer o toggle em vez da última edição pretendida pelo usuário.
    if (!opts.skipHistory) {
      const h = histRef.current.slice(0, hidxRef.current + 1);
      h.push(clean);
      const hc = histColsRef.current.slice(0, hidxRef.current + 1);
      hc.push(colsSnap);
      const hf = histFeriadosRef.current.slice(0, hidxRef.current + 1);
      hf.push(feriadosSnap);
      const hh = histHiddenColsRef.current.slice(0, hidxRef.current + 1);
      hh.push(hiddenColsSnap);
      histRef.current = h;
      histColsRef.current = hc;
      histFeriadosRef.current = hf;
      histHiddenColsRef.current = hh;
      hidxRef.current = h.length - 1;
    }
    setEtapas(clean);
    D.cronograma[obraSel] = clean;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    // O toast reflete o RESULTADO real da persistência (após o await), não a intenção.
    saveTimerRef.current = setTimeout(async () => {
      const res = await salvarCronograma(obraSel, clean, colsSnap, baselines, reprogramacoes, opts.feriados);
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
    const prev = histRef.current[hidxRef.current];
    hidxRef.current--;
    const snap = histRef.current[hidxRef.current].map(e => ({ ...e }));
    const colsSnap = histColsRef.current[hidxRef.current] ?? customCols;
    const feriadosSnap = histFeriadosRef.current[hidxRef.current] ?? feriadosCfg;
    const hiddenColsSnap = histHiddenColsRef.current[hidxRef.current] ?? [...hiddenCols];
    setEtapas(snap);
    setCustomCols(colsSnap);
    setFeriadosCfg(feriadosSnap);
    setHiddenCols(new Set(hiddenColsSnap));
    try { localStorage.setItem('ls_crono_feriados_' + obraSel, JSON.stringify(feriadosSnap)); } catch { /* ignore */ }
    try { localStorage.setItem('ls_hidden_' + obraSel, JSON.stringify(hiddenColsSnap)); } catch { /* ignore */ }
    D.cronograma[obraSel] = snap;
    D.cronogramaCustomCols = colsSnap;
    focarTarefa(diffTaskId(prev, snap));
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      handleSaveResult(await salvarCronograma(obraSel, snap, colsSnap, baselines, reprogramacoes, feriadosSnap));
    }, 800);
    toast('Ação desfeita', { tone: 'neutral', icon: 'check' });
  };

  const redo = () => {
    if (hidxRef.current >= histRef.current.length - 1) { toast('Nada para refazer', { tone: 'neutral', icon: 'alert' }); return; }
    const prev = histRef.current[hidxRef.current];
    hidxRef.current++;
    const snap = histRef.current[hidxRef.current].map(e => ({ ...e }));
    const colsSnap = histColsRef.current[hidxRef.current] ?? customCols;
    const feriadosSnap = histFeriadosRef.current[hidxRef.current] ?? feriadosCfg;
    const hiddenColsSnap = histHiddenColsRef.current[hidxRef.current] ?? [...hiddenCols];
    setEtapas(snap);
    setCustomCols(colsSnap);
    setFeriadosCfg(feriadosSnap);
    setHiddenCols(new Set(hiddenColsSnap));
    try { localStorage.setItem('ls_crono_feriados_' + obraSel, JSON.stringify(feriadosSnap)); } catch { /* ignore */ }
    try { localStorage.setItem('ls_hidden_' + obraSel, JSON.stringify(hiddenColsSnap)); } catch { /* ignore */ }
    D.cronograma[obraSel] = snap;
    D.cronogramaCustomCols = colsSnap;
    focarTarefa(diffTaskId(prev, snap));
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      handleSaveResult(await salvarCronograma(obraSel, snap, colsSnap, baselines, reprogramacoes, feriadosSnap));
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
        </div>
        <div className="page-actions">
          <select className="input" value={obraSel || ''} onChange={e => setObraSel(e.target.value)} style={{ minWidth: 200 }}>
            {!obraSel && <option value="">Selecione uma obra</option>}
            {obras.map(o => (
              <option key={o.id} value={o.id}>{o.nome} ({o.id})</option>
            ))}
          </select>
          <div className="segmented">
            {abasCronograma.map(a => (
              <button
                key={a.id}
                className={(view === a.id ? 'active' : '') + (a.locked ? ' locked' : '')}
                title={a.locked ? 'Sem acesso a esta aba. Fale com o administrador.' : undefined}
                aria-disabled={a.locked || undefined}
                onClick={a.locked ? undefined : () => setView(a.id)}
              >{a.label}</button>
            ))}
          </div>
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
                // Previsto acumulado até hoje, a partir da distribuição mensal já computada
                const totalPlan = Object.values(monthlyTotals).reduce((s, v) => s + v, 0);
                const todayKey = new Date().toISOString().slice(0, 7);
                const planToDate = Object.entries(monthlyTotals).reduce((s, [k, v]) => k <= todayKey ? s + v : s, 0);
                const plannedPct = totalPlan > 0 ? planToDate / totalPlan * 100 : 0;
                const deltaPp = avancoTotal - plannedPct;
                // Término projetado = maior data de término das tarefas (real). Comparação com base = TODO.
                const maxEnd = leaves.length ? Math.max(...leaves.map(e => taskEnd(e))) : 0;
                const termino = leaves.length ? offsetToDate(maxEnd).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }) : '—';
                // ── Derivações por-view da Curva Física (aba view === 'curva') ────────
                const mesAtual     = todayKey; // "YYYY-MM" do mês corrente
                const realAcum     = Object.entries(realizedTotals).reduce((s, [k, v]) => k <= mesAtual ? s + v : s, 0);
                const previstoPct  = plannedPct; // planToDate / totalPlan (%)
                const prodMesPct   = totalPlan > 0 ? (realizedTotals[mesAtual] || 0) / totalPlan * 100 : 0;
                const planMesPct   = totalPlan > 0 ? (monthlyTotals[mesAtual] || 0) / totalPlan * 100 : 0;
                const deltaMesPp   = prodMesPct - planMesPct;
                const desvioPp     = totalPlan > 0 ? (Math.round(realAcum / totalPlan * 100) - Math.round(previstoPct)) : 0;
                const nowCurva     = new Date();
                const mesLabel     = nowCurva.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') + '/' + String(nowCurva.getFullYear()).slice(2);
                // TODO: delta de dias do término projetado vs linha de base — sem baseline no pipeline (mock).
                const terminoDeltaDias = 22;
                return (
                  view === 'curva' ? (
                  <div className="kpi-grid">
                    <div className="kpi" style={{ padding: '18px 20px' }}>
                      <div className="kpi-label">Avanço realizado</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                        <div className="kpi-value num" style={{ fontSize: 30 }}>{avancoTotal.toFixed(2)}<span className="unit">%</span></div>
                        <span style={{ color: deltaPp < 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 600, fontSize: 12 }}>{deltaPp >= 0 ? '+' : ''}{deltaPp.toFixed(2)} pp vs previsto</span>
                      </div>
                      <div className="kpi-bar"><span className="kpi-bar-fill" style={{ width: avancoTotal + '%' }} /><span className="kpi-bar-target" style={{ left: previstoPct + '%' }} /></div>
                      <div className="kpi-foot" style={{ marginTop: 6 }}><span className="kpi-foot-text">realizado × previsto ({previstoPct.toFixed(2)}%)</span></div>
                    </div>
                    <div className="kpi" style={{ padding: '18px 20px' }}>
                      <div className="kpi-label">Produção do mês</div>
                      <div className="kpi-value num" style={{ fontSize: 30, marginTop: 4 }}>{prodMesPct.toFixed(2)}<span className="unit">%</span></div>
                      <div className="kpi-foot" style={{ marginTop: 6 }}>
                        <span style={{ color: '#d97706', fontWeight: 600 }}>{deltaMesPp >= 0 ? '+' : ''}{deltaMesPp.toFixed(2)} pp</span>
                        <span className="kpi-foot-text"> vs planejado ({planMesPct.toFixed(2)}%)</span>
                      </div>
                      <div className="kpi-foot" style={{ marginTop: 2, textTransform: 'capitalize' }}><span className="kpi-foot-text">{mesLabel} · mês corrente</span></div>
                    </div>
                    <div className="kpi risk" style={{ padding: '18px 20px' }}>
                      <div className="kpi-label">Desvio acumulado</div>
                      <div className="kpi-value num" style={{ fontSize: 30, marginTop: 4, color: 'var(--danger)' }}>{desvioPp >= 0 ? '+' : ''}{desvioPp}<span className="unit">pp</span></div>
                      <div className="kpi-foot" style={{ marginTop: 6 }}><span className="kpi-foot-text" style={{ color: desvioPp < 0 ? 'var(--danger)' : undefined }}>{desvioPp < 0 ? 'obra atrasada' : 'obra no prazo'}</span></div>
                    </div>
                    <div className="kpi" style={{ padding: '18px 20px' }}>
                      <div className="kpi-label">Término projetado</div>
                      <div className="kpi-value num" style={{ fontSize: 26, marginTop: 4, textTransform: 'capitalize' }}>{termino}</div>
                      {/* TODO: delta de dias vs linha de base — sem baseline no pipeline; valor mockado */}
                      <div className="kpi-foot" style={{ marginTop: 6 }}><span style={{ color: '#d97706', fontWeight: 600 }}>+{terminoDeltaDias} dias</span><span className="kpi-foot-text"> vs planejado</span></div>
                    </div>
                  </div>
                  ) : view === 'medicao' ? null : (
                <div className="kpi-grid cols-3" style={view === 'uso' ? { position: 'sticky', top: topbarH + 32, zIndex: 2 } : undefined}>
                  <div className="kpi" style={{ padding: '18px 20px' }}>
                    <div className="kpi-label">Avanço físico</div>
                    <div className="kpi-value num" style={{ fontSize: 30, marginTop: 4 }}>{avancoTotal.toFixed(2)}<span className="unit">%</span></div>
                    <div className="kpi-bar"><span className="kpi-bar-fill" style={{ width: avancoTotal + '%' }} /><span className="kpi-bar-target" style={{ left: plannedPct + '%' }} /></div>
                    <div className="kpi-foot" style={{ marginTop: 6 }}>
                      <span style={{ color: deltaPp < 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>{deltaPp >= 0 ? '+' : ''}{deltaPp.toFixed(2)} pp</span>
                      <span className="kpi-foot-text"> vs previsto ({plannedPct.toFixed(2)}%)</span>
                    </div>
                  </div>
                  <div className="kpi" style={{ padding: '18px 20px' }}>
                    <div className="kpi-label">Término projetado</div>
                    <div className="kpi-value num" style={{ fontSize: 26, marginTop: 4, textTransform: 'capitalize' }}>{termino}</div>
                    {/* TODO: comparar com a linha de base (delta de dias) quando houver baseline selecionada */}
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
                // Altura única do card (não depende de `ganttDocTop`) — assim o documento
                // sempre tem espaço de rolagem suficiente pra levar o topo do card até o
                // gatilho de congelamento, não importa quão alta seja a seção de cards de
                // indicador acima (se dependesse de docTop, a altura pré-scroll encolheria
                // conforme os cards ficassem mais altos, quase zerando a rolagem disponível).
                const ganttCardH = `calc(100vh - ${topbarH + 10}px)`;
                return (
                  <>
                  <div ref={ganttSentinelRef} aria-hidden="true" style={{ height: 0 }} />
                  {ganttPinned && <div aria-hidden="true" style={{ marginTop: 'var(--gap)', height: ganttCardH }} />}
                  <div style={ganttPinned
                    ? { display: 'flex', gap: 'var(--gap)', alignItems: 'flex-start', position: 'fixed', top: topbarH + 10, left: ganttPinned.left, width: ganttPinned.width, height: ganttCardH, zIndex: 5, margin: 0 }
                    : { display: 'flex', gap: 'var(--gap)', marginTop: 'var(--gap)', alignItems: 'flex-start', height: ganttCardH }
                  }>
                    {/* Card do Gantt */}
                    <div className="card" style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
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
                      <div className="card-body" style={{ padding: 0, flex: 1, minHeight: 0, overflow: 'hidden' }}>
                        <GanttInterativo key={obraSel} obraId={obraSel} etapas={etapas} onCommit={commit} undo={undo} redo={redo} canUndo={hidxRef.current > 0} canRedo={hidxRef.current < histRef.current.length - 1} baselineEtapas={baselineEtapas} feriadosCfg={feriadosCfg} onTaskSelect={id => { setDetailId(prev => prev === id ? null : id); setDetailTab('detalhes'); }} readOnly={readOnly} isAdmin={currentUser.isAdmin} customCols={customCols}
                          baselines={baselines} reprogramacoes={reprogramacoes}
                          blVisivelId={blVisivelId} onSelectBaseline={setBlVisivelId}
                          onCriarBaseline={() => setShowCriar(true)} onGerenciarBaselines={() => setShowGerenciar(true)}
                          onSalvarRep={() => setShowCriarRep(true)} onGerenciarReps={() => setShowGerenciarRep(true)}
                          onFeriados={() => setShowFeriados(true)} onOutlineLevel={applyOutlineLevel}
                          onProjectInfo={() => setShowProjInfo(true)}
                          obraNome={obra?.nome || 'Projeto'}
                          pavimentosSalvos={pavimentosObra} onPavimentosCriados={salvarNovosPavimentos} onPavimentoExcluir={excluirPavimentoObra}
                          showProjSummary={viewCfg.projSummary} showSummaryTasks={viewCfg.summaryTasks}
                          onToggleProjSummary={() => setViewPref({ projSummary: !viewCfg.projSummary })}
                          onToggleSummaryTasks={() => setViewPref({ summaryTasks: !viewCfg.summaryTasks })}
                          filtroResp={filtroResp} filtroPreset={filtroPreset}
                          filtroPresetRange={filtroPresetRange} filtroTaskIds={filtroTaskIds}
                          filtroTexto={filtroTexto} filtroVinculo={filtroVinculo} vinculadoIds={vinculadoIds}
                          valorVinculadoMap={valorVinculadoMapFull} hasVinculos={vinculos.length > 0}
                          custoOrcadoMap={custoOrcadoMap} groupVals={groupVals} />
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

                              {/* Vínculos — predecessoras e sucessoras */}
                              {(() => {
                                const preds = (detailTask.dep || []).map(dep => {
                                  const id = typeof dep === 'string' ? dep : dep.id;
                                  const tipo = typeof dep === 'string' ? 'TI' : (dep.tipo || 'TI');
                                  const t = etapas.find(e => e.id === id);
                                  return { id, tipo, t };
                                });
                                const succs = (succByIdAll[detailTask.id] || []).map(sid => {
                                  const t = etapas.find(e => e.id === sid);
                                  const link = (t?.dep || []).find(d => (typeof d === 'string' ? d : d.id) === detailTask.id);
                                  const tipo = typeof link === 'string' ? 'TI' : (link?.tipo || 'TI');
                                  return { id: sid, tipo, t };
                                });
                                if (!preds.length && !succs.length) return null;
                                const paiNome = (t) => (t?.parentId ? (etapas.find(e => e.id === t.parentId)?.etapa || '') : '');
                                const linkRow = (v, i) => {
                                  const pai = paiNome(v.t);
                                  const nome = v.t?.etapa || v.id;
                                  return (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 12 }}>
                                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--brand)', background: 'var(--brand-tint)', padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>{v.t?.displayId ?? v.id}</span>
                                      <span title={pai ? `${pai} · ${nome}` : nome} style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{ display: 'block', color: 'var(--text-soft)', fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nome}</span>
                                        {pai && <span style={{ display: 'block', color: 'var(--text-faint)', fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>em {pai}</span>}
                                      </span>
                                      <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{v.tipo}</span>
                                    </div>
                                  );
                                };
                                const secTitle = { fontSize: 10.5, color: 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 };
                                return (
                                  <>
                                    <div style={{ height: 1, background: 'var(--border)', margin: '12px 0' }} />
                                    {preds.length > 0 && (<>
                                      <div style={secTitle}>Predecessoras</div>
                                      {preds.map(linkRow)}
                                    </>)}
                                    {succs.length > 0 && (<>
                                      <div style={{ ...secTitle, marginTop: preds.length ? 12 : 0 }}>Sucessoras</div>
                                      {succs.map(linkRow)}
                                    </>)}
                                  </>
                                );
                              })()}

                              {/* Botão Editar */}
                              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                                <button className="btn btn-ghost"
                                  style={{ width: '100%', justifyContent: 'center', gap: 6, fontSize: 12.5 }}
                                  onClick={() => { focarTarefa(detailTask.id); setView('lista'); setDetailId(null); }}>
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
                  </>
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
                  onSelectBaseline={setBlVisivelId}
                  reprogramacoes={reprogramacoes}
                  repVisivelId={repVisivelId}
                  onSelectReprogramacao={setRepVisivelId}
                  selMonKey={selMonKey}
                  setSelMonKey={setSelMonKey}
                  valorVinculadoMap={valorVinculadoMapFull}
                  onCommit={commit}
                  topbarH={topbarH}
                />
              )}

              {view === 'lista' && (
                <ListaInterativa
                  etapas={etapas}
                  onCommit={commit}
                  customCols={customCols}
                  onCustomColsChange={handleCustomColsChange}
                  hiddenCols={hiddenCols}
                  onHiddenColsChange={onHiddenColsChange}
                  obraId={obraSel}
                  undo={undo}
                  redo={redo}
                  canUndo={hidxRef.current > 0}
                  canRedo={hidxRef.current < histRef.current.length - 1}
                  focusTaskId={histFocus}
                  vinculos={vinculos}
                  orcamentoItensMap={orcamentoItensMap}
                  readOnly={readOnly}
                  isAdmin={currentUser.isAdmin}
                  baselines={baselines}
                  reprogramacoes={reprogramacoes}
                  onCriarBaseline={() => setShowCriar(true)}
                  onGerenciarBaselines={() => setShowGerenciar(true)}
                  onSalvarRep={() => setShowCriarRep(true)}
                  onGerenciarReps={() => setShowGerenciarRep(true)}
                  onFeriados={() => setShowFeriados(true)}
                  onOutlineLevel={applyOutlineLevel}
                  onProjectInfo={() => setShowProjInfo(true)}
                  obraNome={obra?.nome || 'Projeto'}
                  pavimentosSalvos={pavimentosObra} onPavimentosCriados={salvarNovosPavimentos} onPavimentoExcluir={excluirPavimentoObra}
                  showProjSummary={viewCfg.projSummary}
                  showSummaryTasks={viewCfg.summaryTasks}
                  onToggleProjSummary={() => setViewPref({ projSummary: !viewCfg.projSummary })}
                  onToggleSummaryTasks={() => setViewPref({ summaryTasks: !viewCfg.summaryTasks })}
                  filtroResp={filtroResp} setFiltroResp={setFiltroResp}
                  filtroPreset={filtroPreset} setFiltroPreset={setFiltroPreset}
                  filtroPresetRange={filtroPresetRange} setFiltroPresetRange={setFiltroPresetRange}
                  filtroTaskIds={filtroTaskIds} setFiltroTaskIds={setFiltroTaskIds}
                  filtroTexto={filtroTexto} setFiltroTexto={setFiltroTexto}
                  filtroVinculo={filtroVinculo} setFiltroVinculo={setFiltroVinculo}
                  vinculadoIds={vinculadoIds}
                  valorVinculadoMap={valorVinculadoMapFull}
                  custoOrcadoMap={custoOrcadoMap}
                  groupVals={groupVals}
                  succMap={succByIdAll}
                  wbsMap={wbsMap}
                />
              )}

              {view === 'uso' && (
                <UsoTarefaView etapas={etapas} months={months} monthlyDist={monthlyDist} obraId={obraSel} valorVinculadoMap={valorVinculadoMapFull} custoOrcadoMap={custoOrcadoMap} wbsMap={wbsMap} />
              )}

              {view === 'medicao' && (
                <MedicaoMensal
                  etapas={etapas} months={months} monthlyDist={monthlyDist} monthlyTotals={monthlyTotals}
                  valorVinculadoMap={valorVinculadoMapFull} obraId={obraSel} readOnly={readOnly}
                  currentUser={currentUser} onAtualizarDados={recarregarCronograma}
                />
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
          nomesUsados={nomesUsados}
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
          nomesUsados={nomesUsados}
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
      {showProjInfo && (() => {
        const leaves  = etapas.filter(e => !e.isGroup);
        const grupos  = etapas.filter(e => e.isGroup);
        const manuais = leaves.filter(e => e.modo === 'manual').length;
        const temTarefas = etapas.length > 0;
        const inicioOff = temTarefas ? Math.min(...etapas.map(e => e.inicio)) : 0;
        const fimOff    = temTarefas ? Math.max(...etapas.map(e => taskEnd(e))) : 0;
        const durDias   = Math.max(0, fimOff - inicioOff);
        const custoPrev = leaves.reduce((s, e) => s + (custoOrcadoMap[e.id] || 0), 0);
        const info = {
          obraNome:      obra?.nome || '—',
          obraCodigo:    obra?.codigo || '',
          inicio:        temTarefas ? isoToBR(offsetToISO(inicioOff)) : '—',
          termino:       temTarefas ? isoToBR(offsetToISO(fimOff)) : '—',
          duracao:       temTarefas ? `${durDias} dias corridos` : '—',
          dataStatus:    new Date().toLocaleDateString('pt-BR'),
          grupos:        String(grupos.length),
          tarefas:       String(leaves.length),
          manuais:       `${manuais} de ${leaves.length}`,
          avanco:        `${avancoTotal.toFixed(2)}%`,
          custoPrevisto: fmtBRL(custoPrev),
          feriados:      `${feriadosCfg.dias?.length || 0} dia(s)`,
          sabadoUtil:    feriadosCfg.sabadoUtil ? 'Sim' : 'Não',
        };
        return <InformacoesProjetoModal info={info} onClose={() => setShowProjInfo(false)} />;
      })()}
    </>
  );
};

export { CronogramaFull, GanttInterativo };
export { GanttInterativo as GanttElegante };
