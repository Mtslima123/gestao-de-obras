import React from 'react';
import { Icon } from '../../components/Icons';
import { AppData } from '../../utils/data';
import { supabase } from '../../services/supabase';
import { FluxoExecutivo } from './FluxoExecutivo';
import { Modal, useToast } from '../../components/Modals';
import { vinculoService, itemValor } from '../financeiro/vinculoService';
import { computeValorVinculadoMap as _computeValorVinculadoMap,
         buildCalendarMonths, buildCalendarQuarters, buildCalendarYears,
         buildCalendarWeeks, buildCalendarDays } from './ganttUtils';
import { podeVerAba, moduloSomenteLeitura, isAdmin } from '../../utils/permissions';
import { offsetToDate, offsetToISO, isoToBR, dateToOffset,
         setWorkCal, workEnd, workDur, taskEnd } from './cronogramaDateUtils';
import {
  migrateEtapas, fmtBRL, parseBRL, computeAllWBS, indentTasks, outdentTasks,
  computeSuccessors, effStatus, getVisibleEtapas, nextEtapaId, nextDisplayId,
  emptyCustomCols, createGroup, deleteTask, propagateDrag, autoScheduleFromDeps,
  updateParentBounds, formatDepList, parseDep, getMonthRange,
  computeMonthlyDist, computeRealizedDist, getGroupMonthlyDist, verificarRestricoes,
  computeGroupValues, moveTaskBlock,
} from './scheduleEngine';
import {
  AddColModal, RowHeightModal, PavimentosModal, CriarLinhaModal,
  GerenciarLinhasModal, FeriadosModal, CriarReprogramacaoModal,
  GerenciarReprogramacoesModal,
} from './cronogramaModais';
import {
  GM_START_YEAR, GM_START_MONTH, GM_TOTAL, GM_DAY_W, GM_BAR_H,
  GM_ROW_H, GM_ROW_ANO, GM_ROW_TRI, GM_ROW_MES, GM_ROW_FINE,
  ZOOM_PX_DIA, GM_REF_DATE, GROUP_PALETTE, GM_MN, GM_MONTHS,
  gmCalcToday, gmMonthLabel, gmConflicts, EditableCell, ColorMenu,
  LISTA_COL_DEFS, LISTA_BAND_LABELS, LISTA_DEFAULT_ORDER, LISTA_FROZEN,
  GUTTER_W, ROW_DRAG_COLS, respInitials, respColor,
} from './cronogramaShared';
import { AnexosTab, HistoricoTab } from './TaskDetailTabs';
import { taskDetailStore } from './taskDetailStore';
import { usuariosService } from '../admin/usuarios.service';
// Alias local para uso interno neste módulo
const computeValorVinculadoMap = _computeValorVinculadoMap;

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
const GanttInterativo = ({ etapas, onCommit, undo, redo, baselineEtapas, obraId, feriadosCfg = { dias: [], sabadoUtil: false }, onTaskSelect, readOnly = false }) => {
  const toast = useToast();
  const [selected,    setSel]      = React.useState(new Set());
  const [editModeRaw, setEdit]     = React.useState(() => { try { const c = JSON.parse(localStorage.getItem(`gantt_cfg_${obraId}`) || '{}'); return c.editMode   ?? true; } catch { return true; } });
  const editMode = readOnly ? false : editModeRaw;
  const [lockDone,    setLock]     = React.useState(() => { try { const c = JSON.parse(localStorage.getItem(`gantt_cfg_${obraId}`) || '{}'); return c.lockDone   ?? true; } catch { return true; } });
  const [replanAuto,  setReplan]   = React.useState(() => { try { const c = JSON.parse(localStorage.getItem(`gantt_cfg_${obraId}`) || '{}'); return c.replanAuto ?? true; } catch { return true; } });
  const [labelWidth,  setLabelW]   = React.useState(() => { try { const s = localStorage.getItem(`gantt_lw_${obraId}`); return s ? Math.max(150, Math.min(500, parseInt(s, 10))) : 220; } catch { return 220; } });
  const [zoom,        setZoom]     = React.useState('mes');
  const [search,      setSearch]   = React.useState('');
  const [showBaseline, setShowBaseline] = React.useState(true);   // toggle "Linha de base"
  const [showCritical, setShowCritical] = React.useState(false);  // toggle "Caminho crítico"
  // Ref para uso em event handlers — sincronizado no render
  const zoomDayWRef = React.useRef(GM_DAY_W);

  const saveGanttCfg = (patch) => {
    try {
      const curr = JSON.parse(localStorage.getItem(`gantt_cfg_${obraId}`) || '{}');
      localStorage.setItem(`gantt_cfg_${obraId}`, JSON.stringify({ ...curr, ...patch }));
    } catch { /* ignora falha de escrita no storage */ }
  };
  const [tooltip,     setTip]      = React.useState(null);
  const [draft,       setDraft]    = React.useState(null);

  const cRef      = React.useRef(null);
  const etapasRef = React.useRef(etapas);  // ref para event handlers (evita closures stale)
  const dragged   = React.useRef(false);
  const ganttRef  = React.useRef(null);
  const [exportingPDF, setExportingPDF] = React.useState(false);
  const [pdfFormat,    setPdfFormat]    = React.useState('a3');

  // Mantém o ref sincronizado com a prop a cada render
  etapasRef.current = etapas;

  const today = React.useMemo(() => gmCalcToday(), []);

  // Conflitos derivados da prop (atualiza após cada commit)
  const conflictIds = React.useMemo(() => {
    const cfls = gmConflicts(etapas);
    return new Set(cfls.flatMap(c => [c.pred, c.succ]));
  }, [etapas]);

  // Mapa de etapas da linha de base por ID
  const blMap = React.useMemo(() => {
    if (!baselineEtapas) return {};
    return Object.fromEntries(baselineEtapas.map(e => [e.id, e]));
  }, [baselineEtapas]);

  // Caminho crítico (cadeia condutora): parte da tarefa de término mais tardio
  // e volta pela predecessora que determina o início de cada etapa.
  // TODO: CPM completo com folga (early/late start via forward/backward pass).
  const criticalIds = React.useMemo(() => {
    const leaves = etapas.filter(e => !e.isGroup);
    if (!leaves.length) return new Set();
    const byId = Object.fromEntries(etapas.map(e => [e.id, e]));
    const preds = (e) => (e.dep || [])
      .map(d => (typeof d === 'string' ? d : d.id))
      .map(id => byId[id])
      .filter(p => p && !p.isGroup);
    let end = leaves[0];
    leaves.forEach(e => { if (taskEnd(e) > taskEnd(end)) end = e; });
    const set = new Set();
    let cur = end;
    while (cur && !set.has(cur.id)) {
      set.add(cur.id);
      const ps = preds(cur);
      if (!ps.length) break;
      let drv = ps[0];
      ps.forEach(p => { if (taskEnd(p) > taskEnd(drv)) drv = p; });
      cur = drv;
    }
    return set;
  }, [etapas]);

  // Limpa seleção de IDs que não existem mais
  React.useEffect(() => {
    const ids = new Set(etapas.map(e => e.id));
    setSel(s => {
      const cleaned = new Set([...s].filter(id => ids.has(id)));
      return cleaned.size !== s.size ? cleaned : s;
    });
  }, [etapas]);

  // Posiciona scroll na menor posição entre hoje e a primeira tarefa visível
  // Evita que tarefas fora do período atual fiquem completamente fora da tela
  React.useEffect(() => {
    if (!cRef.current) return;
    const folhas = etapas.filter(e => !e.isGroup);
    const minInicio = folhas.length ? Math.min(...folhas.map(e => e.inicio)) : today;
    const alvo = Math.min(today, minInicio);
    const alvoPx = labelWidth + alvo * zoomDayWRef.current;
    cRef.current.scrollLeft = Math.max(0, alvoPx - cRef.current.clientWidth * 0.15);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pan (arrastar para rolar) ──────────────────────────────────────────────
  const onContDown = (e) => {
    if (e.target.closest('[data-gb]')) return;
    const el = cRef.current, sx = e.pageX, ss = el.scrollLeft;
    el.style.cursor = 'grabbing';
    const mv = (ev) => { el.scrollLeft = ss - (ev.pageX - sx); };
    const up = () => { el.style.cursor = ''; document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
  };

  // ── Ajustar: reenquadra a timeline no período que tem tarefas ──────────────
  const onAjustar = () => {
    if (!cRef.current) return;
    const folhas = etapas.filter(e => !e.isGroup);
    const minIni = folhas.length ? Math.min(...folhas.map(e => e.inicio)) : 0;
    const alvoPx = labelWidth + minIni * zoomDayWRef.current;
    cRef.current.scrollTo({ left: Math.max(0, alvoPx - 48), behavior: 'smooth' });
  };

  // ── Redimensionar coluna de rótulos ───────────────────────────────────────
  const onDividerDown = React.useCallback((ev) => {
    ev.preventDefault(); ev.stopPropagation();
    const sx = ev.clientX, sw = labelWidth;
    const onMove = (e) => setLabelW(Math.max(150, Math.min(500, sw + (e.clientX - sx))));
    const onUp   = (e) => {
      localStorage.setItem(`gantt_lw_${obraId}`, String(Math.max(150, Math.min(500, sw + (e.clientX - sx)))));
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [labelWidth, obraId]);

  // ── Drag de barra / resize ─────────────────────────────────────────────────
  const onBarDown = (e, id, type) => {
    e.stopPropagation(); e.preventDefault();
    dragged.current = false;
    if (!editMode) return;
    const etapa = etapasRef.current.find(et => et.id === id);
    if (!etapa) return;
    if (lockDone && etapa.status === 'done') return;

    const movedIds = (selected.has(id) && selected.size > 1) ? new Set(selected) : new Set([id]);
    const orig = {};
    movedIds.forEach(mid => {
      const et = etapasRef.current.find(et => et.id === mid);
      if (et) orig[mid] = { inicio: et.inicio, dur: et.dur };
    });

    const sx = e.clientX;
    let cur = null;

    const mv = (ev) => {
      // Snap a 1 dia
      const delta = Math.round((ev.clientX - sx) / zoomDayWRef.current);
      if (delta !== 0) dragged.current = true;
      const nd = {};
      movedIds.forEach(mid => {
        const o = orig[mid]; if (!o) return;
        if (type === 'move') {
          nd[mid] = { inicio: Math.max(0, o.inicio + delta), dur: o.dur };
        } else if (type === 'resizeRight' && mid === id) {
          nd[mid] = { inicio: o.inicio, dur: Math.max(1, o.dur + delta) };
        } else if (type === 'resizeLeft' && mid === id) {
          const ni = Math.max(0, o.inicio + delta);
          nd[mid] = { inicio: ni, dur: Math.max(1, o.dur - (ni - o.inicio)) };
        }
      });
      cur = nd;
      setDraft({ ...nd });
    };

    const up = () => {
      setDraft(null);
      document.removeEventListener('mousemove', mv);
      document.removeEventListener('mouseup', up);
      const wasDragged = dragged.current;
      setTimeout(() => { dragged.current = false; }, 0);
      if (!wasDragged || !cur) return;
      const changed = Object.keys(cur).some(mid => {
        const d = cur[mid], o = orig[mid];
        return d && o && (d.inicio !== o.inicio || d.dur !== o.dur);
      });
      if (!changed) return;
      let novas = etapasRef.current.map(et => ({
        ...et, ...(movedIds.has(et.id) && cur[et.id] ? cur[et.id] : {}),
      }));

      // Replanejamento automático: cascata para sucessoras
      if (replanAuto) {
        const endDeltaMap = {}, startDeltaMap = {};
        movedIds.forEach(mid => {
          if (!cur[mid] || !orig[mid]) return;
          const sd = cur[mid].inicio - orig[mid].inicio;
          const ed = (cur[mid].inicio + cur[mid].dur) - (orig[mid].inicio + orig[mid].dur);
          if (sd !== 0) startDeltaMap[mid] = sd;
          if (ed !== 0) endDeltaMap[mid] = ed;
        });
        if (Object.keys(endDeltaMap).length || Object.keys(startDeltaMap).length) {
          novas = propagateDrag(novas, endDeltaMap, startDeltaMap);
        }
      }

      // Atualiza limites do grupo pai automaticamente
      novas = updateParentBounds(novas);

      // Verifica restrições e avisa (não bloqueia)
      if (toast) {
        const viol = verificarRestricoes(novas);
        viol.forEach(v => toast(`⚠ Restrição: ${v.etapa} — ${v.msg}`, { tone: 'warning', icon: 'alert-triangle' }));
      }

      onCommit(novas);
    };

    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
  };

  // ── Seleção ────────────────────────────────────────────────────────────────
  const onBarClick = (e, id) => {
    if (dragged.current) return;
    e.stopPropagation();
    if (e.shiftKey) {
      setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    } else {
      setSel(s => (s.size === 1 && s.has(id)) ? new Set() : new Set([id]));
      if (onTaskSelect) onTaskSelect(id);
    }
  };

  // Valores calculados dos grupos (inicio/dur baseados nos descendentes)
  const groupVals = React.useMemo(() => computeGroupValues(etapas), [etapas]);

  // Para grupos usa inicio/dur calculados; para tarefas normais usa os valores diretos.
  // O draft (estado de drag) tem prioridade em ambos os casos.
  const getBar = (e) => {
    const base = e.isGroup && groupVals[e.id]
      ? { ...e, inicio: groupVals[e.id].inicio, dur: groupVals[e.id].dur }
      : e;
    return draft && draft[e.id] ? { ...base, ...draft[e.id] } : base;
  };
  const findEt = (id) => etapas.find(e => e.id === id);
  const idxEt  = (id) => etapas.findIndex(e => e.id === id);

  const barColor = (e, isConf) => {
    const s = effStatus(e);
    return isConf              ? '#d97706'
    : s === 'done'     ? '#16a34a'
    : s === 'late'     ? 'var(--danger)'
    : s === 'upcoming' ? '#60a5fa'
    : 'var(--brand)';
  };

  // Paleta de barras por STATUS (não por grupo) — fiel ao protótipo.
  // track = trilho claro (parte não executada), fill = cor sólida (executado).
  // fills em hex (não var()) para permitir sufixo alfa CSS, ex: `${sc.fill}33`
  const STATUS_COLORS = {
    done:     { fill: '#16a34a', track: '#c8efd5', text: '#166534' },
    late:     { fill: '#b3241e', track: '#f2b3af', text: '#991b1b' },
    upcoming: { fill: '#60a5fa', track: '#e4eefb', text: '#1e40af' },
    exec:     { fill: '#1c4584', track: '#d5e2f0', text: '#102b54' },
  };
  const statusKey = (e) => {
    const s = effStatus(e);
    return s === 'done'     ? 'done'
    : s === 'late'     ? 'late'
    : s === 'upcoming' ? 'upcoming'
    : 'exec';
  };


  const exportExcelGantt = () => {
    import('xlsx').then(XLSX => {
      try {
      const wb   = XLSX.utils.book_new();
      const wbs  = computeAllWBS(etapas);
      const hdrs = ['WBS', 'ID', 'Nome', 'Início', 'Término', 'Duração (d)', 'Avanço', 'Status', 'Custo (R$)', 'Predecessoras'];
      const rows = [hdrs, ...etapas.map(e => {
        const gv  = e.isGroup ? groupVals[e.id] : null;
        const ini = gv ? gv.inicio : e.inicio;
        const dur = gv ? gv.dur    : e.dur;
        const av  = gv ? gv.avanco : e.avanco;
        const cst = gv ? (gv.custo || 0) : (e.custo || 0);
        return [
          wbs[e.id] || '',
          e.displayId ?? e.id,
          '  '.repeat(e.nivel || 0) + e.etapa,
          offsetToDate(ini),
          offsetToDate(ini + dur),
          dur,
          av / 100,
          e.isGroup ? '' : (effStatus(e) === 'done' ? 'Concluída' : effStatus(e) === 'late' ? 'Atrasada' : 'Futura'),
          cst,
          e.isGroup ? '' : formatDepList(e.dep, etapas),
        ];
      })];
      const ws  = XLSX.utils.aoa_to_sheet(rows, { dateNF: 'DD/MM/YYYY' });
      const fmts = { 3: 'DD/MM/YYYY', 4: 'DD/MM/YYYY', 6: '0.00%', 8: '#,##0.00' };
      const rng  = XLSX.utils.decode_range(ws['!ref']);
      for (let R = 1; R <= rng.e.r; R++) {
        Object.entries(fmts).forEach(([C, z]) => {
          const addr = XLSX.utils.encode_cell({ r: R, c: Number(C) });
          if (ws[addr]) ws[addr].z = z;
        });
      }
      ws['!cols']   = [{ wch: 8 }, { wch: 6 }, { wch: 32 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 20 }];
      ws['!freeze'] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(wb, ws, 'Cronograma');
      XLSX.writeFile(wb, `gantt-${new Date().toISOString().slice(0, 10)}.xlsx`);
      } catch (err) { toast('Erro ao exportar Excel: ' + err.message, { tone: 'danger' }); }
    });
  };

  const exportPDFGantt = async () => {
    setExportingPDF(true);
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'), import('jspdf-autotable'),
      ]);
      const doc  = new jsPDF({ orientation: 'landscape', unit: 'mm', format: pdfFormat });
      const BRAND = [1, 67, 134];
      const W = doc.internal.pageSize.getWidth();   // 420mm
      const H = doc.internal.pageSize.getHeight();  // 297mm

      const ML = 14, MR = 14, MT = 20, MB = 14;
      const LABEL_W  = 72;
      const TL_W     = W - ML - MR - LABEL_W;
      const ROW_H    = 7;
      const HDR_H    = 14;   // 7mm trimestres + 7mm meses
      const BAR_H    = 3.5;
      const tlX      = ML + LABEL_W;
      const mpd      = TL_W / (dynTotal * 30);  // mm por dia

      const availH      = H - MT - MB - HDR_H;
      const rowsPerPage = Math.max(1, Math.floor(availH / ROW_H));

      // Cor da barra por status (RGB)
      const pdfBarColor = (e) => {
        if (e.isGroup) return BRAND;
        const s = effStatus(e);
        if (s === 'done') return [27, 143, 94];
        if (s === 'late') return [192, 40, 31];
        return [61, 127, 201];
      };

      const drawGanttHeader = (startY) => {
        // Trimestres
        let x = tlX;
        dynQuarters.forEach((q, qi) => {
          const qW = (q.end - q.start) * 30 * mpd;
          doc.setFillColor(qi % 2 === 0 ? 244 : 250, 246, 251);
          doc.rect(x, startY, qW, 7, 'F');
          doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(50);
          doc.text(q.label, x + 2, startY + 4.8);
          doc.setFont('helvetica', 'normal');
          doc.setDrawColor(190); doc.setLineWidth(0.2);
          doc.line(x + qW, startY, x + qW, startY + 7);
          x += qW;
        });
        doc.setDrawColor(175); doc.setLineWidth(0.3);
        doc.line(ML, startY + 7, W - MR, startY + 7);
        // Meses
        x = tlX;
        dynMonths.forEach((m) => {
          const mW = 30 * mpd;
          doc.setFontSize(6);
          doc.setFont('helvetica', m.isQ ? 'bold' : 'normal');
          doc.setTextColor(m.isQ ? 30 : 80);
          doc.text(m.short, x + mW / 2, startY + 7 + 5, { align: 'center' });
          doc.setFont('helvetica', 'normal');
          doc.setDrawColor(210); doc.setLineWidth(0.15);
          doc.line(x + mW, startY + 7, x + mW, startY + 14);
          x += mW;
        });
        doc.setDrawColor(155); doc.setLineWidth(0.3);
        doc.line(ML, startY + 14, W - MR, startY + 14);
      };

      const drawGanttPage = (slice, pageIdx) => {
        if (pageIdx > 0) doc.addPage();
        // Título e data
        doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(20);
        doc.text('Cronograma de Obras', ML, 12);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7); doc.setTextColor(130);
        doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, ML, 17);
        doc.setTextColor(0);
        // Divisor coluna de nomes / timeline
        doc.setDrawColor(180); doc.setLineWidth(0.3);
        doc.line(tlX, MT, tlX, H - MB);
        drawGanttHeader(MT);

        const bodyY = MT + HDR_H;

        slice.forEach((e, ri) => {
          const y   = bodyY + ri * ROW_H;
          const gv  = e.isGroup ? groupVals[e.id] : null;
          const ini = (gv ? gv.inicio : e.inicio) ?? 0;
          const dur = Math.max((gv ? gv.dur : e.dur) ?? 1, 1);
          const av  = (gv ? gv.avanco : e.avanco) ?? 0;

          // Fundo zebrado
          if (ri % 2 === 0) {
            doc.setFillColor(248, 249, 251);
            doc.rect(ML, y, W - ML - MR, ROW_H, 'F');
          }
          // Divisor horizontal
          doc.setDrawColor(228); doc.setLineWidth(0.1);
          doc.line(ML, y + ROW_H, W - ML - MR, y + ROW_H);

          // Nome da tarefa (coluna esquerda)
          const indent = (e.nivel || 0) * 2.5;
          doc.setFontSize(6.5);
          doc.setFont('helvetica', e.isGroup ? 'bold' : 'normal');
          doc.setTextColor(e.isGroup ? 15 : 40);
          const maxTxtW = LABEL_W - indent - 3;
          const nameStr = doc.splitTextToSize(e.etapa, maxTxtW)[0];
          doc.text(nameStr, ML + indent, y + ROW_H / 2 + 1.8);
          doc.setFont('helvetica', 'normal');

          // Barra ou marco
          const bx = tlX + ini * mpd;
          const bw = Math.max(dur * mpd, 0.8);
          const by = y + (ROW_H - BAR_H) / 2;
          const [r, g, b] = pdfBarColor(e);

          if (e.milestone) {
            // Marco: quadrado preenchido (visual de losango)
            const cx = tlX + ini * mpd;
            const cy = y + ROW_H / 2;
            doc.setFillColor(r, g, b);
            doc.rect(cx - 2, cy - 2, 4, 4, 'F');
          } else {
            // Fundo da barra (cor clara = parte não executada)
            doc.setFillColor(Math.min(r + 100, 255), Math.min(g + 100, 255), Math.min(b + 100, 255));
            doc.rect(bx, by, bw, BAR_H, 'F');
            // Progresso executado (cor plena)
            if (av > 0) {
              doc.setFillColor(r, g, b);
              doc.rect(bx, by, bw * (av / 100), BAR_H, 'F');
            }
            // % dentro da barra
            const execW = bw * (av / 100);
            if (av > 5 && execW > 5) {
              doc.setFontSize(4.5); doc.setTextColor(255);
              doc.text(`${av}%`, bx + execW / 2, by + BAR_H / 2 + 1.5, { align: 'center' });
            }
          }
        });

        // Linha "hoje" (tracejada)
        const todayX = tlX + today * mpd;
        if (todayX >= tlX && todayX <= tlX + TL_W) {
          doc.setDrawColor(220, 38, 38); doc.setLineWidth(0.4);
          doc.setLineDashPattern([1.5, 1], 0);
          doc.line(todayX, bodyY, todayX, bodyY + slice.length * ROW_H);
          doc.setLineDashPattern([], 0); doc.setLineWidth(0.2);
        }
        // Número da página
        doc.setFontSize(7); doc.setTextColor(160);
        doc.text(`Cronograma — pág. ${pageIdx + 1}`, W - MR, H - 6, { align: 'right' });
        doc.setTextColor(0);
      };

      // Paginar verticalmente o gráfico
      const totalGanttPages = Math.ceil(visible.length / rowsPerPage);
      for (let p = 0; p < totalGanttPages; p++) {
        drawGanttPage(visible.slice(p * rowsPerPage, (p + 1) * rowsPerPage), p);
      }

      // ── Tabela de dados ───────────────────────────────────────────────
      doc.addPage();
      doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
      doc.text('Lista de Tarefas', ML, 12);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7); doc.setTextColor(130);
      doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, ML, 17);
      doc.setTextColor(0);
      const wbs  = computeAllWBS(etapas);
      const body = etapas.map(e => {
        const gv  = e.isGroup ? groupVals[e.id] : null;
        const ini = gv ? gv.inicio : e.inicio;
        const dur = gv ? gv.dur    : e.dur;
        const av  = gv ? gv.avanco : e.avanco;
        const cst = gv ? (gv.custo || 0) : (e.custo || 0);
        return {
          _isGroup: e.isGroup,
          vals: [
            wbs[e.id] || '',
            String(e.displayId ?? e.id),
            '  '.repeat(e.nivel || 0) + e.etapa,
            isoToBR(offsetToISO(ini)),
            isoToBR(offsetToISO(ini + dur)),
            dur + 'd',
            av + '%',
            e.isGroup ? '' : (effStatus(e) === 'done' ? 'Concluída' : effStatus(e) === 'late' ? 'Atrasada' : 'Futura'),
            fmtBRL(cst),
            e.isGroup ? '' : formatDepList(e.dep, etapas),
          ],
        };
      });
      autoTable(doc, {
        startY: 20,
        head: [['WBS', 'ID', 'Nome', 'Início', 'Término', 'Dur', 'Avanço', 'Status', 'Custo (R$)', 'Predecessoras']],
        body: body.map(r => r.vals),
        theme: 'grid',
        headStyles: { fillColor: BRAND, textColor: 255, fontSize: 8, fontStyle: 'bold' },
        bodyStyles: { fontSize: 8, textColor: 40 },
        alternateRowStyles: { fillColor: [248, 249, 250] },
        columnStyles: {
          0: { cellWidth: 12 },
          1: { cellWidth: 8,  halign: 'center' },
          2: { cellWidth: 70 },
          3: { cellWidth: 20, halign: 'center' },
          4: { cellWidth: 20, halign: 'center' },
          5: { cellWidth: 12, halign: 'right' },
          6: { cellWidth: 12, halign: 'right' },
          7: { cellWidth: 18, halign: 'center' },
          8: { cellWidth: 28, halign: 'right' },
          9: { cellWidth: 'auto' },
        },
        margin: { top: 20, right: 14, bottom: 14, left: 14 },
        didParseCell: (data) => {
          if (data.section === 'body' && body[data.row.index]?._isGroup) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [232, 240, 252];
            data.cell.styles.textColor = 20;
          }
        },
        didDrawPage: ({ pageNumber }) => {
          doc.setFontSize(8); doc.setTextColor(150);
          doc.text(`Lista — pág. ${pageNumber}`, W - 20, H - 6);
          doc.setTextColor(0);
        },
      });
      doc.save(`gantt-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally { setExportingPDF(false); }
  };

  // Filtra linhas ocultas por collapse — respeita grupos recolhidos
  const visible = React.useMemo(() => getVisibleEtapas(etapas), [etapas]);

  const handleToggleCollapse = (id) => {
    const novas = etapas.map(e => e.id === id ? { ...e, collapsed: !e.collapsed } : e);
    onCommit(novas, { silent: true });
  };

  // Timeline dinâmica: cresce para cobrir todas as tarefas + 3 meses de folga
  const dynTotal = React.useMemo(() => {
    if (!etapas.length) return GM_TOTAL;
    const maxDay = Math.max(...etapas.map(e => (e.inicio || 0) + Math.max(e.dur || 0, 1)));
    return Math.max(Math.ceil(maxDay / 30) + 3, GM_TOTAL);
  }, [etapas]);

  const dynMonths = React.useMemo(() => {
    const out = [];
    let y = GM_START_YEAR, mo = GM_START_MONTH;
    for (let i = 0; i < dynTotal; i++) {
      out.push({ short: GM_MN[mo], year: y, isQ: mo % 3 === 0, idx: i });
      if (++mo === 12) { mo = 0; y++; }
    }
    return out;
  }, [dynTotal]);

  const dynQuarters = React.useMemo(() => {
    const out = [];
    for (let q = 0; q * 3 < dynTotal; q++) {
      const start = q * 3;
      const end = Math.min(start + 3, dynTotal);
      let mo = GM_START_MONTH + start, y = GM_START_YEAR;
      while (mo >= 12) { mo -= 12; y++; }
      out.push({ label: `T${(q % 4) + 1}/${y}`, start, end });
    }
    return out;
  }, [dynTotal]);
  // Grade de calendário real (dias corretos por mês) para o cabeçalho e a grade de fundo.
  // dynMonths/dynQuarters (acima) continuam existindo só para o export em PDF, que assume
  // meses de 30 dias fixos — não são tocados para não alterar o layout do PDF.
  const calTotalDays = dynTotal * 30;
  const calMonths = React.useMemo(
    () => buildCalendarMonths(GM_REF_DATE, calTotalDays), [calTotalDays]
  );
  const calQuarters = React.useMemo(() => buildCalendarQuarters(calMonths), [calMonths]);
  const calYears    = React.useMemo(() => buildCalendarYears(calMonths), [calMonths]);
  const calWeeks    = React.useMemo(
    () => zoom === 'semana' ? buildCalendarWeeks(GM_REF_DATE, calTotalDays) : [], [zoom, calTotalDays]
  );
  const calDays     = React.useMemo(
    () => zoom === 'dia' ? buildCalendarDays(GM_REF_DATE, calTotalDays) : [], [zoom, calTotalDays]
  );

  // Escala por zoom — px/dia crescente de Trimestre (mais zoom-out) para Dia (mais zoom-in).
  const zoomDayW = ZOOM_PX_DIA[zoom] ?? ZOOM_PX_DIA.mes;
  zoomDayWRef.current = zoomDayW; // sincroniza o ref para event handlers
  const tlW = calTotalDays * zoomDayW;

  // Linhas de grade de fundo por tarefa: granularidade muda com o zoom selecionado.
  const gridLines = React.useMemo(() => {
    if (zoom === 'trimestre') return calQuarters.map(q => ({ offset: q.startOffset, strong: true }));
    if (zoom === 'dia')       return calDays.map(d => ({ offset: d.offset, strong: d.isMonthStart }));
    if (zoom === 'semana') {
      const monthStarts = calMonths.map(m => m.startOffset);
      return calWeeks.map(w => ({
        offset: w.startOffset,
        strong: monthStarts.some(mo => mo >= w.startOffset && mo < w.startOffset + w.days),
      }));
    }
    return calMonths.map(m => ({ offset: m.startOffset, strong: m.isQ }));
  }, [zoom, calMonths, calQuarters, calWeeks, calDays]);

  // Feriados dentro da janela do timeline (offset -> descrição), para marcar no Gantt.
  const holidayMap = React.useMemo(() => {
    const m = new Map();
    (feriadosCfg?.dias || []).forEach(d => {
      const off = dateToOffset(d.data);
      if (off >= 0 && off < calTotalDays) m.set(off, d.descricao || 'Feriado');
    });
    return m;
  }, [feriadosCfg, calTotalDays]);

  // Altura do cabeçalho varia com o zoom: Trimestre esconde a linha de Mês; Semana/Dia somam uma linha extra.
  const headerH = GM_ROW_ANO + GM_ROW_TRI
    + (zoom !== 'trimestre' ? GM_ROW_MES : 0)
    + ((zoom === 'semana' || zoom === 'dia') ? GM_ROW_FINE : 0);

  // Utilitário para verificar se uma tarefa é compatível com a busca atual
  const matchesSearch = (e) => !search ||
    e.etapa?.toLowerCase().includes(search.toLowerCase()) ||
    String(e.displayId || '').toLowerCase().includes(search.toLowerCase()) ||
    e.isGroup;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div ref={ganttRef} style={{ position: 'relative' }}>

      {/* ── Toolbar — 2 linhas (fiel ao protótipo) ───────────────────────── */}
      {(() => {
        const darkToggle = (active) => ({
          fontSize: 12, padding: '4px 12px', height: 32, gap: 6, fontWeight: 600,
          borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
          border: active ? '1px solid #1e293b' : '1px solid var(--border)',
          background: active ? '#1e293b' : 'var(--surface)',
          color: active ? '#fff' : 'var(--text-muted)',
          transition: 'background 0.12s, color 0.12s, border-color 0.12s',
        });
        return (
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        {/* Linha 1 — busca + VER + Ajustar */}
        <div style={{ display: 'flex', gap: 12, padding: '8px 20px 6px', alignItems: 'center' }}>
          {/* Busca */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar tarefa…"
              style={{
                paddingLeft: 32, paddingRight: 12, height: 32, fontSize: 12.5,
                border: '1px solid var(--border)', borderRadius: 8,
                background: 'var(--surface-muted)', color: 'var(--text)',
                outline: 'none', width: 240,
              }}
            />
          </div>

          {/* VER — escala de tempo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 700, letterSpacing: '0.09em' }}>VER</span>
            <div style={{ display: 'inline-flex', background: 'var(--surface-muted)', border: '1px solid var(--border)', borderRadius: 8, padding: 3, gap: 2 }}>
              {[
                { key: 'dia', label: 'Dia' },
                { key: 'semana', label: 'Semana' },
                { key: 'mes', label: 'Mês' },
                { key: 'trimestre', label: 'Trimestre' },
              ].map(z => (
                <button key={z.key} onClick={() => setZoom(z.key)}
                  style={{
                    fontSize: 12.5, padding: '5px 13px', border: 'none',
                    borderRadius: 6, cursor: 'pointer', fontWeight: zoom === z.key ? 600 : 500,
                    background: zoom === z.key ? 'var(--brand)' : 'transparent',
                    color: zoom === z.key ? '#fff' : 'var(--text-muted)',
                    transition: 'background 0.15s, color 0.15s',
                  }}>
                  {z.label}
                </button>
              ))}
            </div>
          </div>

          {/* Ajustar — reenquadra ao período com tarefas */}
          <button onClick={onAjustar} title="Reenquadrar a timeline no período com tarefas"
            style={{
              fontSize: 12.5, padding: '5px 13px', height: 32, gap: 6, fontWeight: 600,
              borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
              border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)',
            }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>
            </svg>
            Ajustar
          </button>
        </div>

        {/* Linha 2 — visão / edição / histórico / export */}
        <div style={{ display: 'flex', gap: 8, padding: '2px 20px 8px', alignItems: 'center' }}>
          {/* Linha de base */}
          <button onClick={() => setShowBaseline(v => !v)} style={darkToggle(showBaseline)}
            title={baselineEtapas ? 'Mostrar/ocultar barras da linha de base' : 'Nenhuma linha de base salva'}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="6" y1="4" x2="6" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="18" y1="4" x2="18" y2="20"/>
            </svg>
            Linha de base
          </button>

          {/* Caminho crítico */}
          <button onClick={() => setShowCritical(v => !v)} style={darkToggle(showCritical)}
            title="Destacar a cadeia condutora (caminho crítico)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l10 10-10 10L2 12z"/>
            </svg>
            Caminho crítico
          </button>

          <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 2px' }} />

          {/* Edição */}
          {!readOnly && (
            <button
              className={'btn ' + (editModeRaw ? 'btn-primary' : 'btn-ghost')}
              style={{ fontSize: 12, padding: '4px 12px', height: 32, gap: 5 }}
              onClick={() => { const nv = !editModeRaw; saveGanttCfg({ editMode: nv }); setEdit(nv); }}
            >
              <Icon name="edit" size={12} />{editModeRaw ? 'Editando' : 'Somente leitura'}
            </button>
          )}

          <button
            className="btn btn-ghost"
            style={{ fontSize: 12, padding: '4px 12px', height: 32, gap: 5, color: lockDone ? 'var(--success)' : 'var(--text-muted)' }}
            onClick={() => { const nv = !lockDone; saveGanttCfg({ lockDone: nv }); setLock(nv); }}
          >
            <Icon name="shield" size={12} />{lockDone ? 'Concluídas bloqueadas' : 'Concluídas livres'}
          </button>

          <button
            className="btn btn-ghost"
            style={{ fontSize: 12, padding: '4px 12px', height: 32, gap: 5, color: replanAuto ? 'var(--brand)' : 'var(--text-muted)' }}
            onClick={() => { const nv = !replanAuto; saveGanttCfg({ replanAuto: nv }); setReplan(nv); }}
            title="Quando ativo, arrastar uma barra move automaticamente todas as tarefas sucessoras"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
            </svg>
            {replanAuto ? 'Replan. automático' : 'Replan. manual'}
          </button>

          <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 2px' }} />

          <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px', height: 32, gap: 5 }} onClick={undo} title="Desfazer (Ctrl+Z)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7v6h6"/><path d="M3 13C5.5 8 10 5 15 5c4 0 7 2.5 7 6s-3 6-7 6H12"/>
            </svg>
            Desfazer
          </button>

          <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px', height: 32, gap: 5 }} onClick={redo} title="Refazer (Ctrl+Y)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 7v6h-6"/><path d="M21 13C18.5 8 14 5 9 5c-4 0-7 2.5-7 6s3 6 7 6H12"/>
            </svg>
            Refazer
          </button>

          <div style={{ flex: 1 }} />

          {selected.size > 0 && (
            <span style={{ fontSize: 11.5, color: 'var(--brand)', fontWeight: 600, padding: '3px 10px', background: 'var(--brand-tint)', borderRadius: 20 }}>
              {selected.size} selecionada{selected.size > 1 ? 's' : ''} · Shift+clique para adicionar
            </span>
          )}

          {conflictIds.size > 0 && (
            <span style={{ fontSize: 11.5, color: '#d97706', fontWeight: 600, padding: '3px 10px', background: '#fef3c7', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon name="alert-triangle" size={11} /> Conflito de dependência
            </span>
          )}

          <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 2px' }} />
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px', height: 32, gap: 5 }}
            onClick={exportExcelGantt} title="Exportar para Excel (.xlsx)">
            <Icon name="download" size={13} /> Excel
          </button>
          <select
            value={pdfFormat}
            onChange={e => setPdfFormat(e.target.value)}
            style={{ fontSize: 12, height: 32, padding: '0 6px', borderRadius: 6,
                     border: '1px solid var(--border)', background: 'var(--surface)',
                     color: 'var(--text)', cursor: 'pointer' }}
            title="Formato do PDF">
            <option value="a3">A3</option>
            <option value="a2">A2</option>
            <option value="a1">A1</option>
            <option value="a0">A0</option>
          </select>
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px', height: 32, gap: 5 }}
            onClick={exportPDFGantt} disabled={exportingPDF} title="Exportar para PDF">
            <Icon name="download" size={13} /> {exportingPDF ? 'Gerando…' : 'PDF'}
          </button>
        </div>
      </div>
        );
      })()}

      {/* ── Scroll container ──────────────────────────────────────────────── */}
      <div
        ref={cRef}
        style={{
          overflow: 'auto', maxWidth: '100%', userSelect: 'none', cursor: editMode ? 'grab' : 'default',
          // Altura mínima: não deixa a caixa encolher ao recolher grupos (piso = até 10 linhas, ou todas se forem menos)
          minHeight: headerH + Math.min(etapas.length, 10) * GM_ROW_H,
        }}
        onMouseDown={onContDown}
        onClick={() => { if (!dragged.current) setSel(new Set()); }}
      >
        <div style={{
          display: 'grid',
          gridTemplateColumns: `${labelWidth}px ${tlW}px`,
          minWidth: labelWidth + tlW,
          position: 'relative',
        }}>

          {/* ── Cabeçalho rótulo (EAP / Tarefa / Progresso) ──────────────── */}
          <div style={{
            height: headerH, borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
            padding: '0 14px 10px 18px',
            background: 'var(--surface, #fff)',
            position: 'sticky', left: 0, top: 0, zIndex: 10, overflow: 'visible',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 4 }}>
              <span style={{ minWidth: 30, fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-faint)', flexShrink: 0 }}>EAP</span>
              <span style={{ flex: 1, fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-faint)', paddingLeft: 22 }}>Tarefa</span>
              <span style={{ minWidth: 50, fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-faint)', textAlign: 'right' }}>%</span>
            </div>
            <div
              onMouseDown={onDividerDown}
              style={{
                position: 'absolute', right: 0, top: 0, bottom: 0,
                width: 5, cursor: 'col-resize', zIndex: 10,
                background: 'transparent',
              }}
            />
          </div>

          {/* ── Cabeçalho linha do tempo (Ano / Trimestre / [Mês] / [Semana|Dia]) ── */}
          <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface, #fff)', position: 'sticky', top: 0, zIndex: 6 }}>
            {/* Anos */}
            <div style={{ display: 'flex', height: GM_ROW_ANO, borderBottom: '1px solid var(--border)', background: 'rgba(1,67,134,0.018)' }}>
              {calYears.map((yg, yi) => (
                <div key={yi} style={{
                  width: yg.days * zoomDayW,
                  fontSize: 10, fontWeight: 700, color: 'var(--brand-500)',
                  letterSpacing: '0.05em', padding: '3px 10px',
                  borderRight: '1px solid var(--border)',
                }}>
                  {yg.year}
                </div>
              ))}
            </div>
            {/* Trimestres — sempre calendário real (Jan-Mar/Abr-Jun/Jul-Set/Out-Dez) */}
            <div style={{ display: 'flex', height: GM_ROW_TRI, borderBottom: '1px solid var(--border)' }}>
              {calQuarters.map((q, qi) => (
                <div key={qi} style={{
                  width: q.days * zoomDayW,
                  fontSize: 10, fontWeight: 600, color: 'var(--text-soft)',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  padding: '7px 10px', borderRight: '1px solid var(--border)',
                  background: qi % 2 === 0 ? 'rgba(1,67,134,0.025)' : 'transparent',
                }}>
                  {q.label}
                </div>
              ))}
            </div>
            {/* Meses — ocultos no zoom Trimestre, que se resume a Ano/Trimestre */}
            {zoom !== 'trimestre' && (
              <div style={{ display: 'flex', height: GM_ROW_MES, borderBottom: (zoom === 'semana' || zoom === 'dia') ? '1px solid var(--border)' : 'none' }}>
                {calMonths.map((m, mi) => (
                  <div key={mi} style={{
                    width: m.days * zoomDayW, textAlign: 'center', padding: '8px 0', fontSize: 10,
                    borderRight: '1px solid var(--border)', fontFamily: 'var(--font-mono)',
                    color: m.isQ ? 'var(--text-muted)' : 'var(--text-faint)',
                    fontWeight: m.isQ ? 600 : 400,
                    background: m.isQ ? 'rgba(1,67,134,0.018)' : 'transparent',
                  }}>
                    {m.short}
                  </div>
                ))}
              </div>
            )}
            {/* Semana — número ISO da semana (zoom "semana") */}
            {zoom === 'semana' && (
              <div style={{ display: 'flex', height: GM_ROW_FINE }}>
                {calWeeks.map((w, wi) => (
                  <div key={wi} style={{
                    width: w.days * zoomDayW, textAlign: 'center', padding: '5px 0', fontSize: 9.5,
                    borderRight: '1px solid var(--border)', fontFamily: 'var(--font-mono)',
                    color: 'var(--text-faint)', whiteSpace: 'nowrap', overflow: 'hidden',
                  }}>
                    S{w.isoWeek}
                  </div>
                ))}
              </div>
            )}
            {/* Dia — número do dia, com destaque leve para fins de semana (zoom "dia") */}
            {zoom === 'dia' && (
              <div style={{ display: 'flex', height: GM_ROW_FINE }}>
                {calDays.map((d, di) => {
                  const fer = holidayMap.get(d.offset);
                  return (
                  <div key={di} title={fer || undefined} style={{
                    width: zoomDayW, textAlign: 'center', padding: '5px 0', fontSize: 9.5,
                    borderRight: '1px solid var(--border)', fontFamily: 'var(--font-mono)',
                    color: fer ? 'rgb(220,38,38)' : d.isWeekend ? 'var(--text-faint)' : 'var(--text-muted)',
                    background: fer ? 'rgba(220,38,38,0.12)' : d.isWeekend ? 'rgba(1,67,134,0.03)' : 'transparent',
                  }}>
                    {d.day}
                  </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Linhas das etapas ────────────────────────────────────────── */}
          {visible.map((e, i) => {
            const bar    = getBar(e);
            const isSel  = selected.has(e.id);
            const isConf = conflictIds.has(e.id);
            const isLock = lockDone && e.status === 'done';
            const sc      = STATUS_COLORS[statusKey(e)];        // cores por status
            const isCrit  = showCritical && criticalIds.has(e.id);
            const borderCol = isConf ? '#d97706' : isCrit ? '#dc2626' : `${sc.fill}33`;
            const borderW   = (isConf || isCrit) ? 2 : 1;
            const rowBg   = isSel ? 'rgba(28,69,132,0.05)' : i % 2 === 0 ? 'transparent' : 'rgba(248,250,253,0.8)';
            // Base sempre sólida (opaca) + tint via backgroundImage para não vazar timeline
            const lblBase = i % 2 === 0 ? 'var(--surface)' : 'var(--surface-muted)';
            const lblTint = isSel
              ? 'linear-gradient(rgba(28,69,132,0.08),rgba(28,69,132,0.08))'
              : e.isGroup
                ? 'linear-gradient(var(--brand-50),var(--brand-50))'
                : 'none';
            const isSearchMatch = matchesSearch(e);

            return (
              <React.Fragment key={e.id}>
                {/* Rótulo sticky — estrutura EAP / Tarefa / Progresso */}
                <div
                  onClick={(ev) => onBarClick(ev, e.id)}
                  style={{
                    height: GM_ROW_H, padding: '0 10px 0 15px',
                    borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)',
                    borderLeft: '3px solid transparent',
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: 12.5, fontWeight: isSel ? 600 : (e.isGroup ? 600 : 500),
                    color: isSel ? 'var(--brand)' : 'var(--text)',
                    position: 'sticky', left: 0, zIndex: 5,
                    backgroundColor: lblBase, backgroundImage: lblTint,
                    cursor: 'default',
                    transition: 'background-color 0.12s, color 0.12s',
                    opacity: isSearchMatch ? 1 : 0.3,
                  }}
                >
                  {/* Coluna EAP */}
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-faint)', minWidth: 30, flexShrink: 0 }}>
                    {e.displayId ?? e.id}
                  </span>
                  {/* Chevron de recolher para grupos / espaço para tarefas */}
                  {e.isGroup
                    ? <button
                        onClick={ev => { ev.stopPropagation(); handleToggleCollapse(e.id); }}
                        style={{ width: 16, height: 16, flexShrink: 0, display: 'flex', alignItems: 'center',
                                 justifyContent: 'center', border: 'none', background: 'none',
                                 cursor: 'pointer', padding: 0 }}
                        title={e.collapsed ? 'Expandir' : 'Recolher'}
                      >
                        <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                          style={{ transform: e.collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.12s' }}>
                          <path d="M6 9l6 6 6-6"/>
                        </svg>
                      </button>
                    : <span style={{ width: 16, flexShrink: 0 }} />
                  }
                  {/* Nome da tarefa com indentação + pill de status ao lado */}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, paddingLeft: (e.nivel || 0) * 10 }}>
                    <span style={{
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      fontSize: e.isGroup ? 12 : e.nivel > 0 ? 11.5 : 12.5,
                      color: isSel ? undefined : e.isGroup ? undefined : '#111827',
                    }}>
                      {e.etapa}
                    </span>
                    {!e.isGroup && (() => {
                      const es = effStatus(e);
                      const st = es === 'done'     ? { label: 'Concluída',   color: '#15803d',      bg: '#dcfce7' }
                               : es === 'late'     ? { label: 'Atrasada',    color: '#dc2626',      bg: '#fee2e2' }
                               : es === 'upcoming' ? { label: 'Futura',      color: '#60a5fa',      bg: 'rgba(96,165,250,0.14)' }
                               :                           { label: 'Em execução', color: 'var(--brand)', bg: 'var(--brand-tint)' };
                      return (
                        <span className="badge" style={{ flexShrink: 0, color: st.color, background: st.bg, border: 'none', fontSize: 9.5, lineHeight: 1.6, padding: '0 7px', textTransform: 'none' }}>
                          {st.label}
                        </span>
                      );
                    })()}
                  </div>
                  {isLock && <Icon name="shield" size={10} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />}
                  {/* Percentual de progresso */}
                  <span style={{ fontSize: 10.5, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text)', flexShrink: 0, minWidth: 28, textAlign: 'right' }}>
                    {`${e.avanco}%`}
                  </span>
                  {/* Indicador circular de progresso */}
                  {(() => {
                    const r = 6, circ = 2 * Math.PI * r;
                    const offset = circ * (1 - Math.min(100, e.avanco) / 100);
                    if (e.avanco >= 100) return (
                      <svg viewBox="0 0 16 16" width={16} height={16} style={{ flexShrink: 0 }}>
                        <circle cx="8" cy="8" r="8" fill="#16a34a"/>
                        <path d="M4.5 8l2.5 2.5 4.5-4.5" stroke="white" strokeWidth="1.8"
                          fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    );
                    return (
                      <svg viewBox="0 0 16 16" width={16} height={16} style={{ flexShrink: 0 }}>
                        <circle cx="8" cy="8" r={r} fill="none" stroke="rgba(0,0,0,0.10)" strokeWidth={2.5}/>
                        {e.avanco > 0 && (
                          <circle cx="8" cy="8" r={r} fill="none" stroke={sc.fill} strokeWidth={2.5}
                            strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
                            style={{ transform: 'rotate(-90deg)', transformOrigin: '8px 8px' }}/>
                        )}
                      </svg>
                    );
                  })()}
                </div>

                {/* Faixa da timeline */}
                <div style={{
                  position: 'relative', height: GM_ROW_H,
                  borderBottom: '1px solid var(--border)', background: rowBg,
                  opacity: isSearchMatch ? 1 : 0.25,
                }}>
                  {/* Grade — granularidade muda com o zoom (ver gridLines) */}
                  {gridLines.map((g, gi) => (
                    <div key={gi} style={{
                      position: 'absolute', left: g.offset * zoomDayW, top: 0, bottom: 0, width: 1,
                      background: g.strong ? 'var(--border-strong)' : 'var(--border)',
                      opacity: g.strong ? 0.65 : 0.20,
                    }} />
                  ))}

                  {/* Feriados (dias não trabalhados) — faixa vertical destacada */}
                  {[...holidayMap.keys()].map(off => (
                    <div key={'fer-' + off} style={{
                      position: 'absolute', left: off * zoomDayW, top: 0, bottom: 0,
                      width: Math.max(zoomDayW, 2), background: 'rgba(220,38,38,0.10)',
                      borderLeft: '1px solid rgba(220,38,38,0.35)', pointerEvents: 'none',
                    }} />
                  ))}

                  {/* Sombreamento do passado */}
                  <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: Math.min(today, calTotalDays) * zoomDayW,
                    background: 'rgba(0,0,0,0.022)', pointerEvents: 'none',
                  }} />

                  {/* Barra de linha de base — fina, logo abaixo da barra atual */}
                  {showBaseline && blMap[e.id] && !e.milestone && (
                    <div style={{
                      position: 'absolute',
                      left: blMap[e.id].inicio * zoomDayW + 3,
                      width: Math.max(blMap[e.id].dur * zoomDayW - 6, 10),
                      top: 'calc(50% + 11px)',
                      height: 5, borderRadius: 3,
                      background: 'rgba(107,120,144,0.5)',
                      zIndex: 0, pointerEvents: 'none',
                    }} />
                  )}

                  {/* Barra ou Marco */}
                  {!e.milestone ? (
                    e.isGroup ? (
                      /* Barra-resumo de grupo — ardósia escura, plana, com pés (estilo bracket) */
                      <div
                        data-gb={e.id}
                        onClick={(ev) => onBarClick(ev, e.id)}
                        onMouseEnter={(ev) => setTip({ etapa: e, x: ev.clientX, y: ev.clientY })}
                        onMouseLeave={() => setTip(null)}
                        style={{
                          position: 'absolute',
                          left: bar.inicio * zoomDayW + 3,
                          width: Math.max(bar.dur * zoomDayW - 6, 10),
                          top: '50%', transform: 'translateY(-50%)',
                          height: 9, background: '#334155', borderRadius: 2,
                          boxShadow: isSel ? '0 0 0 2px white, 0 0 0 3px #334155' : 'none',
                          cursor: 'pointer',
                          transition: draft ? 'none' : 'left 0.15s ease, width 0.15s ease',
                          zIndex: isSel ? 3 : 1,
                        }}
                      >
                        <span style={{ position: 'absolute', left: 0, top: '100%', width: 0, height: 0, borderLeft: '5px solid #334155', borderBottom: '5px solid transparent' }} />
                        <span style={{ position: 'absolute', right: 0, top: '100%', width: 0, height: 0, borderRight: '5px solid #334155', borderBottom: '5px solid transparent' }} />
                      </div>
                    ) : (
                      /* Barra de tarefa — trilho claro + preenchimento sólido por status */
                      <div
                        data-gb={e.id}
                        onClick={(ev) => onBarClick(ev, e.id)}
                        onMouseDown={editMode && !isLock ? (ev) => onBarDown(ev, e.id, 'move') : undefined}
                        onMouseEnter={(ev) => setTip({ etapa: e, x: ev.clientX, y: ev.clientY })}
                        onMouseLeave={() => setTip(null)}
                        style={{
                          position: 'absolute',
                          left: bar.inicio * zoomDayW + 3,
                          width: Math.max((workEnd(bar.inicio, bar.dur) - bar.inicio) * zoomDayW - 6, 10),
                          top: '50%', transform: 'translateY(-50%)',
                          height: GM_BAR_H - 4,
                          backgroundColor: sc.track,
                          borderRadius: 7,
                          border: `${borderW}px solid ${borderCol}`,
                          boxShadow: isSel
                            ? `0 0 0 2px white, 0 0 0 3px ${sc.fill}, 0 4px 14px rgba(0,0,0,0.16)`
                            : '0 1px 3px rgba(0,0,0,0.10)',
                          display: 'flex', alignItems: 'center', overflow: 'hidden',
                          cursor: editMode && !isLock ? 'grab' : 'pointer',
                          transition: draft ? 'none' : 'left 0.15s ease, width 0.15s ease, box-shadow 0.12s',
                          zIndex: isSel ? 3 : 1,
                        }}
                      >
                        {/* Porção concluída — cor sólida do status */}
                        {e.avanco > 0 && (
                          <div style={{
                            position: 'absolute', left: 0, top: 0, bottom: 0,
                            width: e.avanco + '%',
                            backgroundColor: sc.fill,
                            backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.16) 0%, transparent 60%, rgba(0,0,0,0.06) 100%)',
                            borderRadius: 6,
                          }} />
                        )}
                        {/* Ícone de restrição */}
                        {e.restricaoTipo && e.restricaoTipo !== 'asap' && (
                          <svg viewBox="0 0 24 24" width="10" height="10" fill="none"
                            stroke={e.avanco > 25 ? 'rgba(255,255,255,0.95)' : sc.text} strokeWidth="2.5"
                            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', zIndex: 1, flexShrink: 0 }}>
                            <circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                          </svg>
                        )}
                        {/* Handle resize esquerda */}
                        {editMode && !isLock && (
                          <div data-gb={e.id}
                            onMouseDown={(ev) => { ev.stopPropagation(); onBarDown(ev, e.id, 'resizeLeft'); }}
                            style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 8, cursor: 'ew-resize', zIndex: 5, background: `${sc.fill}44`, borderRadius: '7px 0 0 7px' }}
                          />
                        )}
                        {/* Handle resize direita */}
                        {editMode && !isLock && (
                          <div data-gb={e.id}
                            onMouseDown={(ev) => { ev.stopPropagation(); onBarDown(ev, e.id, 'resizeRight'); }}
                            style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 8, cursor: 'ew-resize', zIndex: 5, background: `${sc.fill}44`, borderRadius: '0 7px 7px 0' }}
                          />
                        )}
                      </div>
                    )
                  ) : (
                    /* Marco */
                    <div
                      data-gb={e.id}
                      onClick={(ev) => onBarClick(ev, e.id)}
                      onMouseDown={editMode ? (ev) => onBarDown(ev, e.id, 'move') : undefined}
                      onMouseEnter={(ev) => setTip({ etapa: e, x: ev.clientX, y: ev.clientY })}
                      onMouseLeave={() => setTip(null)}
                      style={{
                        position: 'absolute',
                        left: bar.inicio * zoomDayW - 10,
                        top: '50%', transform: 'translateY(-50%) rotate(45deg)',
                        width: 20, height: 20,
                        backgroundColor: isConf ? '#d97706' : '#1e293b',
                        borderRadius: 4,
                        border: '2px solid rgba(255,255,255,0.6)',
                        boxShadow: isSel ? '0 0 0 2px white, 0 0 0 4px #1e293b' : '0 3px 10px rgba(0,0,0,0.22)',
                        cursor: editMode ? 'grab' : 'pointer',
                        transition: draft ? 'none' : 'left 0.15s ease',
                        zIndex: 2,
                      }}
                    />
                  )}
                </div>
              </React.Fragment>
            );
          })}

          {/* ── Linha HOJE ────────────────────────────────────────────────── */}
          <div style={{
            position: 'absolute',
            left: labelWidth + Math.min(today, calTotalDays) * zoomDayW,
            top: 0, bottom: 0, width: 0,
            borderLeft: '2px solid var(--danger)',
            zIndex: 10, pointerEvents: 'none',
          }}>
            <div style={{
              position: 'absolute', top: 2, left: 0, transform: 'translateX(-50%)',
              background: 'var(--danger)', color: '#fff',
              fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
              padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap',
            }}>
              HOJE
            </div>
          </div>

          {/* ── SVG: setas de dependência tipadas (TI/TT/II/IT) ──────────── */}
          <svg style={{
            position: 'absolute', top: headerH, left: labelWidth,
            width: tlW, height: visible.length * GM_ROW_H,
            pointerEvents: 'none', overflow: 'visible',
          }}>
            <defs>
              <marker id="arr-dep" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                <path d="M0,0.5 L6,3.5 L0,6.5 Z" fill="var(--text-faint)" />
              </marker>
              <marker id="arr-warn" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                <path d="M0,0.5 L6,3.5 L0,6.5 Z" fill="#d97706" />
              </marker>
            </defs>
            {etapas.map((e, i) =>
              (e.dep || []).map(depObj => {
                const dId  = typeof depObj === 'string' ? depObj : depObj.id;
                const tipo = typeof depObj === 'string' ? 'TI' : (depObj.tipo || 'TI');
                const lag  = typeof depObj === 'string' ? 0 : (depObj.lag || 0);
                const dep  = findEt(dId);
                if (!dep) return null;
                const dBar = getBar(dep);
                const eBar = getBar(e);
                const warn = conflictIds.has(e.id) || conflictIds.has(dId);

                // Âncoras por tipo de vínculo
                let fx, tx;
                if (tipo === 'TI') { fx = (dBar.inicio + dBar.dur) * zoomDayW; tx = eBar.inicio * zoomDayW + 4; }
                else if (tipo === 'TT') { fx = (dBar.inicio + dBar.dur) * zoomDayW; tx = (eBar.inicio + eBar.dur) * zoomDayW - 4; }
                else if (tipo === 'II') { fx = dBar.inicio * zoomDayW; tx = eBar.inicio * zoomDayW + 4; }
                else /* IT */           { fx = dBar.inicio * zoomDayW; tx = (eBar.inicio + eBar.dur) * zoomDayW - 4; }

                const fy  = idxEt(dId) * GM_ROW_H + GM_ROW_H / 2;
                const ty  = i * GM_ROW_H + GM_ROW_H / 2;
                const midY = (fy + ty) / 2;
                const CONN_MARGIN = 12;

                // Caminho ortogonal 90° por tipo de vínculo (estilo MS Project)
                let pathD;
                if (tipo === 'TI') {
                  if (tx >= fx + CONN_MARGIN * 2) {
                    const midX = (fx + tx) / 2;
                    pathD = `M ${fx} ${fy} H ${midX} V ${ty} H ${tx}`;
                  } else {
                    pathD = `M ${fx} ${fy} H ${fx + CONN_MARGIN} V ${midY} H ${tx - CONN_MARGIN} V ${ty} H ${tx}`;
                  }
                } else if (tipo === 'TT') {
                  const rightX = Math.max(fx, tx) + CONN_MARGIN;
                  pathD = `M ${fx} ${fy} H ${rightX} V ${ty} H ${tx}`;
                } else if (tipo === 'II') {
                  const leftX = Math.min(fx, tx) - CONN_MARGIN;
                  pathD = `M ${fx} ${fy} H ${leftX} V ${ty} H ${tx}`;
                } else { // IT
                  const leftX = Math.min(fx, tx) - CONN_MARGIN;
                  pathD = `M ${fx} ${fy} H ${leftX} V ${ty} H ${tx}`;
                }

                const midX = (fx + tx) / 2 + 4;
                const lagLabel = lag !== 0 ? (lag > 0 ? `+${lag}d` : `${lag}d`) : '';
                const typeLabel = tipo !== 'TI' ? tipo : '';
                const label = [typeLabel, lagLabel].filter(Boolean).join(' ');

                return (
                  <g key={`${e.id}-${dId}`}>
                    <path
                      d={pathD}
                      fill="none"
                      stroke={warn ? '#d97706' : 'var(--text-faint)'}
                      strokeWidth={warn ? 1.8 : 1.2}
                      markerEnd={warn ? 'url(#arr-warn)' : 'url(#arr-dep)'}
                    />
                    {label && (
                      <text x={midX} y={midY - 3} fontSize={8.5} fill={warn ? '#d97706' : 'var(--text-faint)'}
                        style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {label}
                      </text>
                    )}
                  </g>
                );
              })
            )}
          </svg>
        </div>
      </div>

      {/* ── Tooltip fixo ──────────────────────────────────────────────────── */}
      {tooltip && (
        <div style={{
          position: 'fixed', left: tooltip.x + 16, top: Math.max(8, tooltip.y - 12),
          zIndex: 9999, background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.14), 0 2px 6px rgba(0,0,0,0.07)',
          padding: '12px 16px', minWidth: 240, pointerEvents: 'none', fontSize: 12,
        }}>
          <div style={{
            fontWeight: 700, color: 'var(--text)', fontSize: 13, marginBottom: 9, paddingBottom: 9,
            borderBottom: '1px solid var(--border)', borderLeft: '3px solid var(--brand-400)',
            paddingLeft: 8,
          }}>
            {tooltip.etapa.etapa}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: '5px 8px' }}>
            {[
              ['Início',   gmMonthLabel(tooltip.etapa.inicio)],
              ['Término',  gmMonthLabel(tooltip.etapa.inicio + tooltip.etapa.dur)],
              ['Duração',  `${tooltip.etapa.dur}d`],
            ].map(([label, val]) => (
              <React.Fragment key={label}>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{label}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{val}</span>
              </React.Fragment>
            ))}
            {tooltip.etapa.responsavel && (
              <>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Responsável</span>
                <span style={{ fontSize: 11.5 }}>{tooltip.etapa.responsavel}</span>
              </>
            )}
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Concluído</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ display: 'inline-block', width: 48, height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', verticalAlign: 'middle' }}>
                <span style={{ display: 'block', height: '100%', width: tooltip.etapa.avanco + '%', background: barColor(tooltip.etapa, false), borderRadius: 3 }} />
              </span>
              <span style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)' }}>{tooltip.etapa.avanco}%</span>
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Status</span>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: effStatus(tooltip.etapa) === 'done' ? '#1b8f5e' : effStatus(tooltip.etapa) === 'late' ? '#c0281f' : '#3d7fc9' }}>
              {effStatus(tooltip.etapa) === 'done' ? '✓ Concluída' : effStatus(tooltip.etapa) === 'late' ? '⚠ Atrasada' : '◷ Planejada'}
            </span>
          </div>
          {(tooltip.etapa.dep || []).length > 0 && (
            <div style={{ marginTop: 9, paddingTop: 9, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)' }}>
              Depende de: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-soft)' }}>{tooltip.etapa.dep.join(', ')}</span>
            </div>
          )}
          {editMode && !(lockDone && tooltip.etapa.status === 'done') && !tooltip.etapa.milestone && (
            <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-faint)' }}>
              Arraste para mover · Bordas para redimensionar · Shift+clique para multi-seleção
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── EditableCell ─────────────────────────────────────────────────────────────
// Movido para ./cronogramaShared.

// ─── Modais da grade (AddCol / RowHeight / Pavimentos) ───────────────────────
// Movidos para ./cronogramaModais.

// ─── Defs de colunas + paleta de cores + ColorMenu ───────────────────────────
// Movidos para ./cronogramaShared.

// ─── ListaInterativa ──────────────────────────────────────────────────────────
const ListaInterativa = ({ etapas, onCommit, customCols, onCustomColsChange, obraId, undo, redo, vinculos = [], orcamentoItensMap = {}, readOnly = false }) => {
  const toast = useToast();
  const [selectedId,     setSelectedId]     = React.useState(null);
  const [showAddCol,     setShowAddCol]     = React.useState(false);
  const [deleteConfirm,  setDeleteConfirm]  = React.useState(null); // id da tarefa a excluir
  const [showPavimentos, setShowPavimentos] = React.useState(false);
  const [showRowHDialog, setShowRowHDialog] = React.useState(false); // caixa "Altura da linha"
  const [rowHDialogTargets, setRowHDialogTargets] = React.useState([]); // linhas alvo da altura
  const [pendingFontSize, setPendingFontSize] = React.useState(null); // tamanho armado p/ texto novo
  const [pendingFontFamily, setPendingFontFamily] = React.useState(null); // fonte armada p/ texto novo
  const [fmtCollapsed, setFmtCollapsed] = React.useState(() => localStorage.getItem('ls_crono_fmt_collapsed') === '1');
  React.useEffect(() => {
    try { localStorage.setItem('ls_crono_fmt_collapsed', fmtCollapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [fmtCollapsed]);
  const [multiSel,       setMultiSel]       = React.useState([]);   // seleção ordenada para Ctrl+F2
  const [editingCusto,   setEditingCusto]   = React.useState(null); // 'id_custo' | 'id_real'
  const [editingFatorPeso, setEditingFatorPeso] = React.useState(null); // id da tarefa em edição
  const [editingDep,     setEditingDep]     = React.useState(null); // id da tarefa com predecessora em edição
  const [busca,          setBusca]          = React.useState('');
  const [filtroStatus,   setFiltroStatus]   = React.useState('');
  const [filtroResp,     setFiltroResp]     = React.useState('');
  const [ctxMenu,        setCtxMenu]        = React.useState(null); // { x, y, taskId }
  const [dragOverId,     setDragOverId]     = React.useState(null);
  const [showColPanel,   setShowColPanel]   = React.useState(false);
  const [selectedCell,   setSelectedCell]   = React.useState(null); // { taskId, colId } — foco ativo (planilha)
  const [selAnchor,      setSelAnchor]      = React.useState(null); // { taskId, colId } — âncora do intervalo
  const [marquee,        setMarquee]        = React.useState(null); // retângulo "marching ants" da cópia
  const [painterOn,      setPainterOn]      = React.useState(false); // pincel de formatação ativo
  const painterRef = React.useRef(null); // fmt capturado pelo pincel
  const isSelectingRef = React.useRef(false); // arraste de seleção de intervalo em andamento
  // Altura real da topbar (para congelar o cabeçalho exatamente abaixo dela, sem corte)
  const [topbarH, setTopbarH] = React.useState(60);
  React.useEffect(() => {
    const measure = () => { const tb = document.querySelector('.topbar'); if (tb) setTopbarH(tb.offsetHeight); };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  // Altura da linha de banda (para empilhar o cabeçalho de colunas logo abaixo dela, ambos fixos)
  const bandRowRef = React.useRef(null);
  const [bandH, setBandH] = React.useState(26);
  React.useEffect(() => {
    if (bandRowRef.current) {
      const h = bandRowRef.current.offsetHeight;
      if (h && h !== bandH) setBandH(h);
    }
  }); // sem deps: mede após cada render (leitura barata; auto-estabiliza pelo guard acima)

  // Fixa o bloco (formatação+banda+cabeçalho+tabela) sob a topbar ao rolar a página.
  // sticky não serve aqui (o card é o último elemento e preenche a viewport), então
  // usamos um sentinela + position:fixed via JS. `listaPinned` = null (fluxo normal) ou
  // { left, width } (fixado). Um espaçador preserva a altura para não haver salto.
  const listaSentinelRef = React.useRef(null);
  const [listaPinned, setListaPinned] = React.useState(null);
  React.useEffect(() => {
    let raf = 0;
    const check = () => {
      raf = 0;
      const s = listaSentinelRef.current;
      if (!s) return;
      const r = s.getBoundingClientRect();
      if (r.top <= topbarH) {
        setListaPinned(prev => (prev && Math.abs(prev.left - r.left) < 0.5 && Math.abs(prev.width - r.width) < 0.5) ? prev : { left: r.left, width: r.width });
      } else {
        setListaPinned(prev => (prev ? null : prev));
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(check); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    // Reajusta left/width quando a largura do conteúdo muda sem scroll/resize
    // (ex.: fixar/soltar a sidebar, que anima o padding). Observa o sentinela (largura do conteúdo).
    let ro = null;
    if (typeof ResizeObserver !== 'undefined' && listaSentinelRef.current) {
      ro = new ResizeObserver(onScroll);
      ro.observe(listaSentinelRef.current);
    }
    const id = setTimeout(check, 0);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); clearTimeout(id); if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect(); };
  }, [topbarH]);

  const dragRowRef   = React.useRef(null);
  const hoverRowRef  = React.useRef(null);   // linha sob o cursor (para o arraste manual de linha)
  const rowDragMovedRef = React.useRef(false); // houve movimento de linha (suprime o clique seguinte)
  const rowSelectingRef = React.useRef(false); // arraste de seleção de LINHAS pela calha em andamento
  const rowSelAnchorRef = React.useRef(null);  // id da linha-âncora do arraste pela calha
  const colPanelRef  = React.useRef(null);
  const cellClipRef  = React.useRef(null); // clipboard interno de célula { value, kind, fmt }
  const rowClipRef   = React.useRef(null); // clipboard interno de LINHA (clone da tarefa copiada)
  const listaScrollRef = React.useRef(null); // container rolável da lista (foco p/ navegação por setas)

  // Altura das linhas da lista (ajustável na UI, estilo MS Project), persistida no navegador.
  const ROW_H_MIN = 20, ROW_H_MAX = 120;
  const [rowH, setRowH] = React.useState(() => {
    const v = parseInt(localStorage.getItem('ls_crono_row_h') || '', 10);
    return Number.isFinite(v) ? Math.min(ROW_H_MAX, Math.max(ROW_H_MIN, v)) : 34;
  });
  React.useEffect(() => {
    try { localStorage.setItem('ls_crono_row_h', String(rowH)); } catch { /* ignore */ }
  }, [rowH]);
  // Alturas por linha (override só das linhas selecionadas), persistidas por obra.
  const [rowHeights, setRowHeights] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem(`ls_crono_rowheights_${obraId}`) || '{}') || {}; }
    catch { return {}; }
  });
  React.useEffect(() => {
    try { localStorage.setItem(`ls_crono_rowheights_${obraId}`, JSON.stringify(rowHeights)); } catch { /* ignore */ }
  }, [rowHeights, obraId]);

  const wbsMap      = React.useMemo(() => computeAllWBS(etapas), [etapas]);
  const succMap     = React.useMemo(() => computeSuccessors(etapas), [etapas]);
  const idToDisplayId = React.useMemo(
    () => Object.fromEntries(etapas.map(e => [e.id, e.displayId ?? e.id])),
    [etapas]
  );
  const visible     = React.useMemo(() => getVisibleEtapas(etapas), [etapas]);
  const groupVals   = React.useMemo(() => computeGroupValues(etapas), [etapas]);
  const totalCusto  = React.useMemo(() => etapas.filter(e => !e.isGroup).reduce((s, e) => s + (e.custo || 0), 0), [etapas]);
  const totalReal   = React.useMemo(() => etapas.filter(e => !e.isGroup).reduce((s, e) => s + (e.custoRealizado || 0), 0), [etapas]);
  const totalSaldo  = totalCusto - totalReal;

  // Integração Orçamento × Cronograma — calcula valor vinculado por etapa
  const hasVinculos = vinculos.length > 0;
  const valorVinculadoMap = React.useMemo(
    () => computeValorVinculadoMap(etapas, vinculos, orcamentoItensMap),
    [etapas, vinculos, orcamentoItensMap]
  );
  // Total para calcular o peso % (soma das folhas)
  const totalValorVinculado = React.useMemo(
    () => etapas.filter(e => !e.isGroup).reduce((s, e) => s + (valorVinculadoMap[e.id] || 0), 0),
    [etapas, valorVinculadoMap]
  );

  // Custo efetivo: quando há vínculos, o custo de cada etapa é o valor vinculado distribuído
  // (valorVinculadoMap já cobre folhas e grupos via bubble-up). Nunca grava no dado — só exibe.
  const custoEf = (e, gv) => hasVinculos
    ? (valorVinculadoMap[e.id] || 0)
    : (e.isGroup ? (gv?.custo || 0) : (e.custo || 0));
  const totalCustoEf = hasVinculos ? totalValorVinculado : totalCusto;

  // Avisa quando há vínculos mas a soma dos fatores impediu a distribuição (RN003)
  React.useEffect(() => {
    if (hasVinculos && totalValorVinculado === 0) {
      toast('Fator Peso de todas as tarefas é zero — distribuição não realizada. Defina valores > 0.', { tone: 'warning', icon: 'alert-triangle' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasVinculos, totalValorVinculado]);

  // ── Gerenciamento de colunas ────────────────────────────────────────────────
  const [colOrder, setColOrder] = React.useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`ls_cols_${obraId}`) || 'null');
      if (!saved) return LISTA_DEFAULT_ORDER;
      const missing = LISTA_DEFAULT_ORDER.filter(c => !saved.includes(c));
      return missing.length ? [...saved, ...missing] : saved;
    }
    catch { return LISTA_DEFAULT_ORDER; }
  });
  const [colWidths, setColWidths] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem(`ls_widths_${obraId}`) || 'null') || {}; }
    catch { return {}; }
  });
  const [hiddenCols, setHiddenCols] = React.useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(`ls_hidden_${obraId}`) || '[]')); }
    catch { return new Set(); }
  });
  const dragColRef = React.useRef(null);
  const [dragOverCol, setDragOverCol] = React.useState(null); // { id, side: 'before' | 'after' }
  const listaRef   = React.useRef(null);
  const [exportingPDF, setExportingPDF] = React.useState(false);

  React.useEffect(() => {
    if (obraId) localStorage.setItem(`ls_cols_${obraId}`, JSON.stringify(colOrder));
  }, [colOrder, obraId]);
  React.useEffect(() => {
    if (obraId) localStorage.setItem(`ls_widths_${obraId}`, JSON.stringify(colWidths));
  }, [colWidths, obraId]);
  React.useEffect(() => {
    if (obraId) localStorage.setItem(`ls_hidden_${obraId}`, JSON.stringify([...hiddenCols]));
  }, [hiddenCols, obraId]);

  const toggleColVisibility = (colId) => {
    setHiddenCols(prev => {
      const next = new Set(prev);
      next.has(colId) ? next.delete(colId) : next.add(colId);
      return next;
    });
  };

  // Fecha painel de colunas ao clicar fora
  React.useEffect(() => {
    if (!showColPanel) return;
    const onDown = (ev) => { if (colPanelRef.current && !colPanelRef.current.contains(ev.target)) setShowColPanel(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showColPanel]);

  const getColW = (colId) => colWidths[colId] ?? LISTA_COL_DEFS[colId]?.defWidth ?? 100;

  const frozenLeft = React.useMemo(() => {
    const out = {}; let acc = GUTTER_W; // reserva a faixa da calha de número de linha
    for (const cid of LISTA_FROZEN) { out[cid] = acc; acc += (colWidths[cid] ?? LISTA_COL_DEFS[cid]?.defWidth ?? 100); }
    return out;
  }, [colWidths]);

  const startColResize = (ev, colId) => {
    ev.preventDefault(); ev.stopPropagation();
    const startX = ev.clientX;
    const startW = getColW(colId);
    const onMove = (e2) => setColWidths(prev => ({ ...prev, [colId]: Math.max(50, startW + e2.clientX - startX) }));
    const onUp   = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const onColDragStart = (ev, colId) => { dragColRef.current = colId; ev.dataTransfer.effectAllowed = 'move'; };
  const onColDragOver  = (ev, colId) => {
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';
    const from = dragColRef.current;
    if (!from || from === colId || LISTA_FROZEN.includes(colId)) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    const side = (ev.clientX - rect.left) < rect.width / 2 ? 'before' : 'after';
    setDragOverCol(prev => (prev && prev.id === colId && prev.side === side) ? prev : { id: colId, side });
  };
  const onColDrop      = (ev, targetColId) => {
    ev.preventDefault();
    const from = dragColRef.current;
    const side = dragOverCol?.side;
    dragColRef.current = null;
    setDragOverCol(null);
    if (!from || from === targetColId || LISTA_FROZEN.includes(from) || LISTA_FROZEN.includes(targetColId)) return;
    setColOrder(prev => {
      const next = [...prev];
      const fi = next.indexOf(from);
      if (fi < 0) return prev;
      next.splice(fi, 1);
      const ti = next.indexOf(targetColId);
      if (ti < 0) return prev;
      next.splice(side === 'after' ? ti + 1 : ti, 0, from);
      return next;
    });
  };

  const renderTh = (colId) => {
    const col = LISTA_COL_DEFS[colId];
    if (!col) return null;
    const isFrozen = col.frozen;
    const w = getColW(colId);
    return (
      <th key={colId}
        className={dragOverCol?.id === colId ? `drag-over-col-${dragOverCol.side}` : undefined}
        style={{
          width: w, minWidth: w,
          position: 'sticky', top: bandH, zIndex: isFrozen ? 6 : 3,
          ...(isFrozen ? { left: frozenLeft[colId] } : {}),
          cursor: !isFrozen ? 'grab' : undefined,
          userSelect: 'none',
          ...(col.align === 'right' ? { textAlign: 'right' } : {}),
        }}
        draggable={!isFrozen}
        onClick={() => selectColumn(colId)}
        onContextMenu={(ev) => { ev.preventDefault(); setCtxMenu({ x: ev.clientX, y: ev.clientY, kind: 'col', colId }); }}
        onDragStart={!isFrozen ? (ev) => onColDragStart(ev, colId) : undefined}
        onDragOver={!isFrozen ? (ev) => onColDragOver(ev, colId) : undefined}
        onDragLeave={!isFrozen ? () => setDragOverCol(prev => prev?.id === colId ? null : prev) : undefined}
        onDragEnd={!isFrozen ? () => { dragColRef.current = null; setDragOverCol(null); } : undefined}
        onDrop={!isFrozen ? (ev) => onColDrop(ev, colId) : undefined}
      >
        {col.label}
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 5, cursor: 'col-resize', zIndex: 5 }}
          draggable={false} onClick={(ev) => ev.stopPropagation()} onMouseDown={(ev) => { ev.stopPropagation(); startColResize(ev, colId); }} />
      </th>
    );
  };

  // Aplica filtros de busca sobre as linhas visíveis
  const filtrada = React.useMemo(() =>
    visible.filter(e =>
      (!busca || e.etapa.toLowerCase().includes(busca.toLowerCase())) &&
      (!filtroStatus || effStatus(e) === filtroStatus) &&
      (!filtroResp || (e.responsavel || '').toLowerCase().includes(filtroResp.toLowerCase()))
    ),
    [visible, busca, filtroStatus, filtroResp]
  );

  // ── Seleção de célula estilo planilha: copiar/colar + navegação ──────────────
  // Colunas cujo valor pode ser copiado/colado (por tipo). 'text' aceita colar de qualquer origem.
  const COPY_COLS = {
    etapa:     { kind: 'text',   get: e => e.etapa || '',                    field: 'etapa' },
    inicio:    { kind: 'date',   get: e => offsetToISO(e.inicio),            field: 'inicio' },
    fim:       { kind: 'date',   get: e => offsetToISO(taskEnd(e)),          field: 'fim' },
    duracao:   { kind: 'number', get: e => String(e.dur ?? ''),             field: 'duracaoDias' },
    avanco:    { kind: 'number', get: e => String(e.avanco ?? 0),           field: 'avanco' },
    custo:     { kind: 'number', get: e => String(e.custo ?? 0),            field: 'custo' },
    custoReal: { kind: 'number', get: e => String(e.custoRealizado ?? 0),   field: 'custoRealizado' },
    resp:      { kind: 'text',   get: e => e.responsavel || '',              field: 'responsavel' },
  };
  const cellSpec = (colId) => {
    if (colId?.startsWith('cc_')) return { kind: 'text', get: e => (e.customCols || {})[colId] ?? '', field: colId };
    return COPY_COLS[colId] || null;
  };
  // Copia o RETÂNGULO selecionado (grade valores+fmt) e também as LINHAS distintas do
  // intervalo (para o Ctrl++ inserir N cópias).
  // Marching ants: retângulo tracejado animado sobre a seleção copiada (estilo Excel).
  const showMarquee = () => {
    const sc = listaScrollRef.current;
    if (!sc || !selectedCell) return;
    const a = selAnchor || selectedCell;
    const el1 = sc.querySelector(`td[data-ck="${a.taskId}|${a.colId}"]`);
    const el2 = sc.querySelector(`td[data-ck="${selectedCell.taskId}|${selectedCell.colId}"]`);
    if (!el1 || !el2) { setMarquee(null); return; }
    const scr = sc.getBoundingClientRect();
    const r1 = el1.getBoundingClientRect(), r2 = el2.getBoundingClientRect();
    const left   = Math.min(r1.left, r2.left)     - scr.left + sc.scrollLeft;
    const top    = Math.min(r1.top,  r2.top)      - scr.top  + sc.scrollTop;
    const right  = Math.max(r1.right, r2.right)   - scr.left + sc.scrollLeft;
    const bottom = Math.max(r1.bottom, r2.bottom) - scr.top  + sc.scrollTop;
    setMarquee({ left, top, width: right - left, height: bottom - top });
  };

  const copyCell = () => {
    if (!selectedCell) return;
    const rows = filtrada.map(x => x.id);
    const cols = visibleColIds();
    const a = selAnchor || selectedCell;
    let r1 = rows.indexOf(a.taskId), r2 = rows.indexOf(selectedCell.taskId);
    let c1 = cols.indexOf(a.colId), c2 = cols.indexOf(selectedCell.colId);
    if (r1 < 0 || r2 < 0 || c1 < 0 || c2 < 0) return;
    if (r1 > r2) [r1, r2] = [r2, r1];
    if (c1 > c2) [c1, c2] = [c2, c1];
    const grid = [];
    const rowClones = [];
    for (let r = r1; r <= r2; r++) {
      const e = etapas.find(x => x.id === rows[r]);
      if (!e) continue;
      rowClones.push(JSON.parse(JSON.stringify(e)));
      const gr = [];
      for (let c = c1; c <= c2; c++) {
        const colId = cols[c];
        const spec = cellSpec(colId);
        gr.push({ colId, value: spec ? spec.get(e) : null, kind: spec?.kind, fmt: e.fmt?.[colId] });
      }
      grid.push(gr);
    }
    cellClipRef.current = { grid };
    rowClipRef.current = rowClones; // permite Ctrl++ inserir o nº de linhas copiadas
    try { navigator.clipboard?.writeText(grid.map(gr => gr.map(c => c.value ?? '').join('\t')).join('\n')); } catch { /* best-effort */ }
  };
  // Cola o bloco a partir da célula selecionada (canto superior esquerdo), estilo Excel.
  const pasteCell = () => {
    if (readOnly || !selectedCell) return;
    const clip = cellClipRef.current;
    if (!clip || !clip.grid) return;
    const rows = filtrada.map(x => x.id);
    const cols = visibleColIds();
    const r0 = rows.indexOf(selectedCell.taskId);
    const c0 = cols.indexOf(selectedCell.colId);
    if (r0 < 0 || c0 < 0) return;
    const edits = [];
    clip.grid.forEach((gr, dr) => {
      const taskId = rows[r0 + dr];
      if (!taskId) return;
      gr.forEach((cellData, dc) => {
        const colId = cols[c0 + dc];
        if (!colId) return;
        const spec = cellSpec(colId);
        const compat = spec && cellData.value != null && (spec.kind === 'text' || cellData.kind == null || cellData.kind === spec.kind);
        edits.push({
          taskId, colId,
          ...(compat ? { field: spec.field, rawValue: cellData.value } : {}),
          fmt: cellData.fmt || null, // cola a formatação da origem (limpa se origem não tinha)
        });
      });
    });
    applyBlockEdits(edits);
  };
  // Rola a linha em foco para dentro da área visível, respeitando o cabeçalho fixo.
  const scrollRowIntoView = (taskId) => {
    const sc = listaScrollRef.current;
    if (!sc) return;
    const tr = sc.querySelector(`tr[data-taskid="${CSS.escape(String(taskId))}"]`);
    if (!tr) return;
    const scRect = sc.getBoundingClientRect();
    const trRect = tr.getBoundingClientRect();
    const head = sc.querySelector('thead');
    const headBottom = head ? head.getBoundingClientRect().bottom : scRect.top;
    if (trRect.top < headBottom) sc.scrollTop -= (headBottom - trRect.top);
    else if (trRect.bottom > scRect.bottom) sc.scrollTop += (trRect.bottom - scRect.bottom);
  };
  const moveSelCell = (key, extend) => {
    const rows = filtrada.map(x => x.id);
    const cols = [
      ...colOrder.filter(c => !hiddenCols.has(c)),
      ...customCols.filter(c => !hiddenCols.has(c.id)).map(c => c.id),
    ];
    let r = rows.indexOf(selectedCell.taskId);
    let c = cols.indexOf(selectedCell.colId);
    if (r < 0 || c < 0) return;
    if (key === 'ArrowUp')    r = Math.max(0, r - 1);
    if (key === 'ArrowDown')  r = Math.min(rows.length - 1, r + 1);
    if (key === 'ArrowLeft')  c = Math.max(0, c - 1);
    if (key === 'ArrowRight') c = Math.min(cols.length - 1, c + 1);
    const next = { taskId: rows[r], colId: cols[c] };
    setSelectedCell(next);
    scrollRowIntoView(next.taskId);
    if (extend) return;                       // Shift+seta: estende o intervalo (âncora fica)
    setSelAnchor(next);                        // seta sem shift: colapsa o intervalo
    setSelectedId(rows[r]);                    // linha atual acompanha para as ações da barra
  };
  // ── Copiar/inserir LINHA (quando uma linha está selecionada, sem célula) ─────
  const copyRow = () => {
    if (!selectedId) return;
    const e = etapas.find(x => x.id === selectedId);
    if (!e) return;
    rowClipRef.current = [JSON.parse(JSON.stringify(e))]; // array (uma linha)
  };
  const pasteRow = () => {
    if (readOnly || !selectedId) return;
    const idx = etapas.findIndex(x => x.id === selectedId);
    if (idx < 0) return;
    const ref = etapas[idx];
    const clips = rowClipRef.current;
    if (clips && clips.length) {
      // Insere N CÓPIAS (uma por linha copiada) ACIMA da linha selecionada, estilo Excel
      let base = [...etapas];
      const clones = clips.map(src => {
        const clone = {
          ...JSON.parse(JSON.stringify(src)),
          id: nextEtapaId(base),
          displayId: nextDisplayId(base),
          dep: [],
          isGroup: false,
          collapsed: false,
          nivel: ref.nivel,
          parentId: ref.parentId,
          customCols: { ...emptyCustomCols(customCols), ...(src.customCols || {}) },
        };
        base = [...base, clone]; // garante ids/displayIds únicos incrementais
        return clone;
      });
      const novas = [...etapas];
      novas.splice(idx, 0, ...clones);
      onCommit(novas, { silent: true });
      setSelectedId(clones[0].id);
      rowClipRef.current = null; // cópia de uso único
    } else {
      // Nada copiado: insere N linhas em branco (N = nº de linhas do intervalo, ou 1)
      const n = Math.max(1, new Set(rangeCellList().map(x => x.taskId)).size);
      for (let i = 0; i < n; i++) insertTask(selectedId, 'above');
    }
  };
  // Ctrl++ (inserir cópia): duplica as LINHAS SELECIONADAS acima da primeira — determinístico,
  // funciona com 1 ou várias linhas, sem depender do clipboard (rowClipRef).
  const duplicateSelectedRows = () => {
    if (readOnly) return;
    const ids = [...selectedRowIds()];
    const idxs = ids.map(id => etapas.findIndex(x => x.id === id)).filter(i => i >= 0).sort((a, b) => a - b);
    if (!idxs.length) return;
    const insertAt = idxs[0];
    const ref = etapas[insertAt];
    let base = [...etapas];
    const clones = idxs.map(i => {
      const src = etapas[i];
      const clone = {
        ...JSON.parse(JSON.stringify(src)),
        id: nextEtapaId(base), displayId: nextDisplayId(base),
        dep: [], isGroup: false, collapsed: false,
        nivel: ref.nivel, parentId: ref.parentId,
        customCols: { ...emptyCustomCols(customCols), ...(src.customCols || {}) },
      };
      base = [...base, clone];
      return clone;
    });
    const novas = [...etapas];
    novas.splice(insertAt, 0, ...clones);
    onCommit(novas, { silent: true });
    setSelectedId(clones[0].id);
  };

  // ── Formatação de célula/linha (compartilhada, salva no JSON do cronograma) ──
  // key = colId (formata a célula) ou '__row' (formata a linha inteira)
  const handleCellFormat = (taskId, key, patch) => {
    const novas = etapas.map(e => {
      if (e.id !== taskId) return e;
      const prevFmt = e.fmt || {};
      const prevKey = prevFmt[key] || {};
      const nextKey = { ...prevKey, ...patch };
      // remove chaves vazias/false para não inchar o JSON
      Object.keys(nextKey).forEach(k => {
        if (nextKey[k] === null || nextKey[k] === undefined || nextKey[k] === false || nextKey[k] === '') delete nextKey[k];
      });
      const nextFmt = { ...prevFmt, [key]: nextKey };
      if (Object.keys(nextKey).length === 0) delete nextFmt[key];
      return { ...e, fmt: nextFmt };
    });
    onCommit(novas, { silent: true });
  };
  // fmt efetivo de uma célula: linha (__row) sobrescrita pela célula (colId)
  const effFmt = (e, colId) => ({ ...(e?.fmt?.__row || {}), ...(e?.fmt?.[colId] || {}) });
  // alvo atual: célula (se houver) senão a linha selecionada
  const fmtTarget = () => {
    if (selectedCell) return { taskId: selectedCell.taskId, key: selectedCell.colId };
    if (selectedId)   return { taskId: selectedId, key: '__row' };
    return null;
  };
  // Colunas visíveis na ordem atual (para calcular o retângulo de seleção)
  const visibleColIds = () => [
    ...colOrder.filter(c => !hiddenCols.has(c)),
    ...customCols.filter(c => !hiddenCols.has(c.id)).map(c => c.id),
  ];
  // Lista de células do intervalo (retângulo entre âncora e foco); ignora colunas-pegada
  // Seleciona a COLUNA inteira (todas as linhas visíveis) — reaproveita o range de seleção,
  // então a coluna fica selecionada/formatável/pintável como no Excel.
  const selectColumn = (colId) => {
    const rows = filtrada.map(x => x.id);
    if (!rows.length) return;
    setSelAnchor({ taskId: rows[0], colId });
    setSelectedCell({ taskId: rows[rows.length - 1], colId });
    setSelectedId(null);
    setMultiSel([]);
    listaScrollRef.current?.focus?.({ preventScroll: true });
  };

  // Seleciona a tabela inteira (clique na célula-canto da calha, estilo Excel).
  const selectAll = () => {
    const rows = filtrada.map(x => x.id);
    const cols = visibleColIds();
    if (!rows.length || !cols.length) return;
    setSelAnchor({ taskId: rows[0], colId: cols[0] });
    setSelectedCell({ taskId: rows[rows.length - 1], colId: cols[cols.length - 1] });
    setSelectedId(rows[0]);
    setMultiSel([]);
    listaScrollRef.current?.focus?.({ preventScroll: true });
  };

  // Conjunto de linhas atualmente selecionadas (intervalo de células + multi-seleção + linha ativa).
  const selectedRowIds = () => {
    const ids = new Set();
    if (selectedCell) {
      const rows = filtrada.map(x => x.id);
      const a = selAnchor || selectedCell;
      let r1 = rows.indexOf(a.taskId), r2 = rows.indexOf(selectedCell.taskId);
      if (r1 >= 0 && r2 >= 0) { if (r1 > r2) [r1, r2] = [r2, r1]; for (let r = r1; r <= r2; r++) ids.add(rows[r]); }
    }
    multiSel.forEach(id => ids.add(id));
    if (selectedId != null) ids.add(selectedId);
    return ids;
  };

  // Cria uma tarefa raiz a partir de uma linha em branco (estilo Project: digitar o nome cria a tarefa).
  const createFromBlank = (nome) => {
    const name = (nome || '').trim();
    if (!name || readOnly) return;
    const novo = {
      id: nextEtapaId(etapas), displayId: nextDisplayId(etapas), etapa: name,
      nivel: 0, parentId: null, isGroup: false, collapsed: false,
      inicio: 0, dur: 1, avanco: 0, status: 'upcoming',
      dep: [], milestone: false, responsavel: '',
      customCols: emptyCustomCols(customCols), custo: 0,
      restricaoTipo: 'asap', restricaoData: '', fator_peso: 1,
    };
    // Texto novo herda o tamanho/tipo de fonte "armados" na barra (aplicado na célula do nome).
    const etapaFmt = {};
    if (pendingFontSize) etapaFmt.fontSize = pendingFontSize;
    if (pendingFontFamily) etapaFmt.fontFamily = pendingFontFamily;
    if (Object.keys(etapaFmt).length) novo.fmt = { etapa: etapaFmt };
    onCommit([...etapas, novo], { silent: true });
    setSelectedId(novo.id);
  };

  const rangeCellList = () => {
    if (!selectedCell) return [];
    const a = selAnchor || selectedCell;
    const rows = filtrada.map(x => x.id);
    const cols = visibleColIds();
    let r1 = rows.indexOf(a.taskId), r2 = rows.indexOf(selectedCell.taskId);
    let c1 = cols.indexOf(a.colId), c2 = cols.indexOf(selectedCell.colId);
    if (r1 < 0 || r2 < 0 || c1 < 0 || c2 < 0) return [{ taskId: selectedCell.taskId, colId: selectedCell.colId }];
    if (r1 > r2) [r1, r2] = [r2, r1];
    if (c1 > c2) [c1, c2] = [c2, c1];
    const list = [];
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
      if (ROW_DRAG_COLS.has(cols[c])) continue;
      list.push({ taskId: rows[r], colId: cols[c] });
    }
    return list;
  };
  // Mapa "taskId|colId" -> arestas externas do retângulo {t,b,l,r} (borda só no contorno)
  const rangeEdgeMap = () => {
    const map = new Map();
    if (!selectedCell) return map;
    const a = selAnchor || selectedCell;
    const rows = filtrada.map(x => x.id);
    const cols = visibleColIds();
    let r1 = rows.indexOf(a.taskId), r2 = rows.indexOf(selectedCell.taskId);
    let c1 = cols.indexOf(a.colId), c2 = cols.indexOf(selectedCell.colId);
    if (r1 < 0 || r2 < 0 || c1 < 0 || c2 < 0) {
      map.set(selectedCell.taskId + '|' + selectedCell.colId, { t: true, b: true, l: true, r: true });
      return map;
    }
    if (r1 > r2) [r1, r2] = [r2, r1];
    if (c1 > c2) [c1, c2] = [c2, c1];
    // Colunas de dados dentro do intervalo (ignora pegadas WBS/ID) para achar as bordas L/R reais
    const dataCols = [];
    for (let c = c1; c <= c2; c++) if (!ROW_DRAG_COLS.has(cols[c])) dataCols.push(c);
    const leftC = dataCols[0], rightC = dataCols[dataCols.length - 1];
    for (let r = r1; r <= r2; r++) for (const c of dataCols) {
      map.set(rows[r] + '|' + cols[c], { t: r === r1, b: r === r2, l: c === leftC, r: c === rightC });
    }
    return map;
  };
  const cleanFmtObj = (obj) => { Object.keys(obj).forEach(k => { if (obj[k] === null || obj[k] === undefined || obj[k] === false || obj[k] === '') delete obj[k]; }); return obj; };
  // Aplica um patch de formatação a várias células num ÚNICO commit
  const applyFmtToCells = (cellsList, patch) => {
    if (readOnly || !cellsList.length) return;
    const byTask = {};
    cellsList.forEach(({ taskId, colId }) => { (byTask[taskId] = byTask[taskId] || []).push(colId); });
    const novas = etapas.map(e => {
      const colIds = byTask[e.id];
      if (!colIds) return e;
      const nextFmt = { ...(e.fmt || {}) };
      colIds.forEach(colId => {
        const nk = cleanFmtObj({ ...(nextFmt[colId] || {}), ...patch });
        if (Object.keys(nk).length) nextFmt[colId] = nk; else delete nextFmt[colId];
      });
      return { ...e, fmt: nextFmt };
    });
    onCommit(novas, { silent: true });
  };
  const applyFmt = (patch) => {
    if (readOnly) return;
    if (selectedCell) { applyFmtToCells(rangeCellList(), patch); return; }
    if (selectedId)   { handleCellFormat(selectedId, '__row', patch); }
  };
  // Tamanho da fonte: aplica SÓ nas células selecionadas (nunca em __row, que vazaria para a linha
  // toda) e "arma" o tamanho para valer no próximo texto novo (linhas em branco).
  const applyFontSize = (fs) => {
    if (!readOnly) {
      if (selectedCell) applyFmtToCells(rangeCellList(), { fontSize: fs });
      else if (selectedId) applyFmtToCells(visibleColIds().map(colId => ({ taskId: selectedId, colId })), { fontSize: fs });
    }
    setPendingFontSize(fs);
  };
  // Tipo da fonte: mesma lógica do tamanho (só nas células selecionadas + arma p/ texto novo).
  // ff = string da família, ou false para voltar ao padrão.
  const applyFontFamily = (ff) => {
    if (!readOnly) {
      const patch = { fontFamily: ff || false };
      if (selectedCell) applyFmtToCells(rangeCellList(), patch);
      else if (selectedId) applyFmtToCells(visibleColIds().map(colId => ({ taskId: selectedId, colId })), patch);
    }
    setPendingFontFamily(ff || null);
  };
  const clearFmt = () => {
    if (readOnly) return;
    if (selectedCell) {
      const byTask = {};
      rangeCellList().forEach(({ taskId, colId }) => { (byTask[taskId] = byTask[taskId] || []).push(colId); });
      const novas = etapas.map(e => {
        const colIds = byTask[e.id];
        if (!colIds) return e;
        const nextFmt = { ...(e.fmt || {}) };
        colIds.forEach(colId => delete nextFmt[colId]);
        return { ...e, fmt: nextFmt };
      });
      onCommit(novas, { silent: true });
      return;
    }
    if (selectedId) {
      const novas = etapas.map(e => {
        if (e.id !== selectedId) return e;
        const nextFmt = { ...(e.fmt || {}) };
        delete nextFmt.__row;
        return { ...e, fmt: nextFmt };
      });
      onCommit(novas, { silent: true });
    }
  };
  // estado efetivo do alvo (para os botões B/I/S refletirem on/off)
  const activeFmt = (() => {
    const t = fmtTarget();
    if (!t) return {};
    const e = etapas.find(x => x.id === t.taskId);
    return t.key === '__row' ? (e?.fmt?.__row || {}) : effFmt(e, t.key);
  })();
  // Arestas externas do intervalo por célula (borda só no contorno, estilo Excel)
  const rangeEdges = rangeEdgeMap();
  // Linhas cobertas por uma seleção de INTERVALO de células. Usado para não pintar a
  // linha-âncora com o realce de linha (que destoava do fundo do intervalo).
  const rangeRowIds = (() => {
    const s = new Set();
    if (!selectedCell) return s;
    const a = selAnchor || selectedCell;
    const rows = filtrada.map(x => x.id);
    let r1 = rows.indexOf(a.taskId), r2 = rows.indexOf(selectedCell.taskId);
    if (r1 < 0 || r2 < 0) { s.add(selectedCell.taskId); return s; }
    if (r1 > r2) [r1, r2] = [r2, r1];
    for (let r = r1; r <= r2; r++) s.add(rows[r]);
    return s;
  })();

  // Teclado da lista: ligado ao container focável (onKeyDown), não ao document,
  // para as setas moverem a seleção de célula em vez de rolar a página.
  const handleListKeyDown = (ev) => {
    if (ev.key === 'Escape') { setMarquee(null); return; } // limpa marching ants
    if (!selectedCell && !selectedId) return;
    const tag = ev.target?.tagName;
    const editingNow = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'c' || ev.key === 'C')) {
      if (editingNow) return; // deixa o navegador copiar o texto do input em edição
      // copyCell já grava rowClipRef com as linhas da seleção (≥1), então Ctrl++ insere a cópia.
      if (selectedCell) copyCell(); else copyRow();
      showMarquee(); // borda tracejada animada na seleção copiada
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'v' || ev.key === 'V')) {
      if (editingNow || readOnly) return;
      ev.preventDefault();
      if (selectedCell) pasteCell(); else pasteRow();
      setMarquee(null);
      return;
    }
    // Ctrl + '+' (estilo Excel): insere item (cópia da linha se houver, senão linha em
    // branco). preventDefault impede o zoom do navegador. Cobre '+', '=' e o + do numpad.
    if ((ev.ctrlKey || ev.metaKey) && (ev.key === '+' || ev.key === '=' || ev.code === 'NumpadAdd')) {
      if (editingNow || readOnly) return;
      ev.preventDefault();
      duplicateSelectedRows(); // insere cópia da(s) linha(s) selecionada(s) — funciona com 1 também
      setMarquee(null);
      return;
    }
    if (editingNow) return;
    // Shift+Espaço: seleciona as LINHAS inteiras (estilo Excel) — cobre todas as colunas do
    // intervalo atual, então funciona tanto com uma célula quanto com várias selecionadas.
    if (ev.shiftKey && (ev.key === ' ' || ev.key === 'Spacebar') && selectedCell) {
      ev.preventDefault();
      const rows = filtrada.map(x => x.id);
      const a = selAnchor || selectedCell;
      let r1 = rows.indexOf(a.taskId), r2 = rows.indexOf(selectedCell.taskId);
      if (r1 < 0 || r2 < 0) return;
      if (r1 > r2) [r1, r2] = [r2, r1];
      const cols = visibleColIds();
      const firstCol = cols[0], lastCol = cols[cols.length - 1];
      setSelAnchor({ taskId: rows[r1], colId: firstCol });
      setSelectedCell({ taskId: rows[r2], colId: lastCol });
      setSelectedId(rows[r1]);
      return;
    }
    if (selectedCell && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(ev.key)) {
      ev.preventDefault();
      moveSelCell(ev.key, ev.shiftKey);
    }
    if (ev.key === 'Enter' || ev.key === 'F2') {
      // duplo-clique é o gatilho principal de edição; Enter/F2 apenas evita rolagem
      ev.preventDefault();
    }
  };

  // Limpa a célula selecionada se a tarefa deixar de existir
  React.useEffect(() => {
    if (selectedCell && !etapas.find(e => e.id === selectedCell.taskId)) setSelectedCell(null);
  }, [etapas, selectedCell]);

  // Fim do arraste de seleção de intervalo em qualquer soltar de botão
  React.useEffect(() => {
    const up = () => { isSelectingRef.current = false; rowSelectingRef.current = false; };
    document.addEventListener('mouseup', up);
    return () => document.removeEventListener('mouseup', up);
  }, []);

  // Envolve cada <td> com seleção de célula (clique único) + destaque, preservando
  // a classe de drag de coluna e qualquer onMouseDown já existente.
  // Converte o objeto fmt em { style, classes }. Cor/tamanho/negrito/itálico/sublinhado
  // usam classes com !important (via variáveis CSS) para vencer estilos internos das células
  // (ex.: a coluna Etapa define o próprio font-weight/size no span).
  const fmtToCss = (f) => {
    if (!f) return { style: null, classes: [] };
    const style = {}; const classes = [];
    if (f.bg)       style.background = f.bg;
    if (f.color)    { style['--fmt-color'] = f.color; classes.push('fmt-color'); }
    if (f.fontSize) { style['--fmt-size'] = f.fontSize + 'px'; classes.push('fmt-size'); }
    if (f.fontFamily) { style['--fmt-family'] = f.fontFamily; classes.push('fmt-family'); }
    if (f.bold)     classes.push('fmt-b');
    if (f.italic)   classes.push('fmt-i');
    if (f.underline) classes.push('fmt-u');
    return { style: Object.keys(style).length ? style : null, classes };
  };
  // Borda externa do intervalo (só nas arestas do retângulo, estilo Excel) via box-shadow.
  // O tom de fundo só entra quando a célula NÃO tem cor própria (assim a cor dela aparece).
  const rangeSelStyle = (edges, hasOwnBg, frozen) => {
    if (!edges) return null;
    const sh = [];
    if (edges.t) sh.push('inset 0 1px 0 0 var(--brand)');
    if (edges.b) sh.push('inset 0 -1px 0 0 var(--brand)');
    if (edges.l) sh.push('inset 1px 0 0 0 var(--brand)');
    if (edges.r) sh.push('inset -1px 0 0 0 var(--brand)');
    const s = { boxShadow: sh.join(', ') };
    // Colunas congeladas precisam de fundo OPACO (senão vazam o conteúdo rolado por baixo)
    if (!hasOwnBg) s.background = frozen
      ? 'color-mix(in srgb, var(--brand) 10%, var(--surface))'
      : 'color-mix(in srgb, var(--brand) 10%, transparent)';
    return s;
  };
  const decorateCell = (cell, colId, taskId, fmt, edges) => {
    if (!cell) return null;
    const eff = { ...(fmt?.__row || {}), ...(fmt?.[colId] || {}) };
    const dragCls = dragOverCol?.id === colId ? `drag-over-col-${dragOverCol.side}` : '';
    const { style: fmtStyle, classes: fmtClasses } = fmtToCss(eff);
    const cls     = [cell.props.className, dragCls, ...fmtClasses].filter(Boolean).join(' ');
    const selStyle = rangeSelStyle(edges, !!eff.bg, LISTA_FROZEN.includes(colId));
    const styled = { ...(cell.props.style || {}), ...(fmtStyle || {}), ...(selStyle || {}) };
    // Colunas-pegada (se houver) não participam da seleção de célula
    if (ROW_DRAG_COLS.has(colId)) {
      return React.cloneElement(cell, { className: cls || undefined, style: styled });
    }
    const prevMd = cell.props.onMouseDown;
    return React.cloneElement(cell, {
      className: cls || undefined,
      style: styled,
      'data-ck': taskId + '|' + colId,
      onMouseDown: (ev) => {
        // Pincel de formatação ativo: aplica a formatação capturada nesta célula e desliga
        if (painterOn && painterRef.current) {
          ev.preventDefault();
          applyFmtToCells([{ taskId, colId }], painterRef.current);
          setPainterOn(false);
          setSelectedCell({ taskId, colId }); setSelAnchor({ taskId, colId });
          if (!ev.ctrlKey && !ev.metaKey) setSelectedId(taskId);
          listaScrollRef.current?.focus?.({ preventScroll: true });
          return;
        }
        setSelectedCell({ taskId, colId });
        setSelAnchor({ taskId, colId });
        isSelectingRef.current = true; // inicia possível arraste de intervalo
        // Seleciona a linha também (as células editáveis param a propagação do clique)
        if (!ev.ctrlKey && !ev.metaKey) { setSelectedId(taskId); setMultiSel([]); }
        listaScrollRef.current?.focus?.({ preventScroll: true });
        if (prevMd) prevMd(ev);
      },
      onMouseEnter: () => {
        // Estende o intervalo enquanto arrasta com o botão pressionado
        if (isSelectingRef.current) setSelectedCell({ taskId, colId });
      },
    });
  };

  // Limpa seleção se o item selecionado for excluído
  React.useEffect(() => {
    if (selectedId && !etapas.find(e => e.id === selectedId)) setSelectedId(null);
    setMultiSel(ms => ms.filter(id => etapas.find(e => e.id === id)));
  }, [etapas, selectedId]);

  // Insere uma nova tarefa acima ou abaixo da tarefa de referência
  const insertTask = (referenceId, position) => {
    const refIdx = etapas.findIndex(e => e.id === referenceId);
    if (refIdx < 0) return;
    const ref = etapas[refIdx];
    const newTask = {
      id:            nextEtapaId(etapas),
      displayId:     nextDisplayId(etapas),
      etapa:         'Nova Tarefa',
      inicio:        ref.inicio,
      dur:           1,
      avanco:        0,
      status:        'upcoming',
      dep:           [],
      nivel:         ref.nivel,
      parentId:      ref.parentId,
      isGroup:       false,
      collapsed:     false,
      responsavel:   '',
      custo:         0,
      custoRealizado: 0,
      showInDist:    false,
      restricaoTipo: 'asap',
      restricaoData: '',
      customCols:    emptyCustomCols(customCols),
    };
    const novas = [...etapas];
    novas.splice(position === 'above' ? refIdx : refIdx + 1, 0, newTask);
    onCommit(novas, { silent: true });
    setSelectedId(newTask.id);
  };

  // Fecha menu de contexto ao clicar fora ou pressionar Escape
  React.useEffect(() => {
    if (!ctxMenu) return;
    const onDown = (ev) => { if (!ev.target.closest('.ctx-menu')) setCtxMenu(null); };
    const onKey  = (ev) => { if (ev.key === 'Escape') setCtxMenu(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [ctxMenu]);

  // Atalho Ctrl+F2 — cria vínculos em cadeia entre tarefas de multiSel (na ordem de clique)
  React.useEffect(() => {
    const handler = (e) => {
      if (readOnly) return;
      if (e.ctrlKey && e.key === 'F2') {
        e.preventDefault();
        if (multiSel.length < 2) { toast('Selecione ao menos 2 tarefas com Ctrl+clique', { tone: 'warning', icon: 'alert-triangle' }); return; }
        const novas = etapas.map(et => ({ ...et }));
        for (let i = 1; i < multiSel.length; i++) {
          const succ = novas.find(et => et.id === multiSel[i]);
          const predId = multiSel[i - 1];
          if (succ && !(succ.dep || []).some(d => (typeof d === 'string' ? d : d.id) === predId)) {
            succ.dep = [...(succ.dep || []), { id: predId, tipo: 'TI', lag: 0 }];
          }
        }
        onCommit(autoScheduleFromDeps(novas));
        setMultiSel([]);
        toast(`${multiSel.length - 1} vínculo(s) criado(s)`, { tone: 'success', icon: 'check' });
      }
      // Insert — insere linha abaixo da tarefa selecionada
      if (e.key === 'Insert' && selectedId) {
        e.preventDefault();
        insertTask(selectedId, 'below');
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [multiSel, etapas, selectedId]);

  // ── Atualização de campo ────────────────────────────────────────────────────
  // Campos que exigem reprogramação (recalcular datas via dependências)
  const RESCHEDULE_FIELDS = ['dep', 'inicio', 'fim', 'duracaoDias', 'restricaoTipo', 'restricaoData'];
  // Aplica um único campo a uma etapa (conversões de valor). Reutilizado por handleCellSave
  // e pelo colar de bloco (applyBlockEdits). NÃO trata 'id' (caso especial em handleCellSave).
  const applyFieldToEtapa = (e, field, rawValue) => {
    if (field === 'inicio')      { return { ...e, inicio: Math.round(dateToOffset(rawValue)) }; }
    if (field === 'fim')         { const offset = Math.round(dateToOffset(rawValue)); return { ...e, dur: workDur(e.inicio, offset) }; }
    if (field === 'duracaoDias') { return { ...e, dur: Math.max(1, parseInt(rawValue) || 1) }; }
    if (field === 'avanco')      { return { ...e, avanco: Math.min(100, Math.max(0, parseInt(rawValue) || 0)) }; }
    if (field === 'dep')         { return { ...e, dep: parseDep(rawValue, etapas) }; }
    if (field === 'restricaoTipo') { return { ...e, restricaoTipo: rawValue }; }
    if (field === 'restricaoData') { return { ...e, restricaoData: rawValue }; }
    if (field === 'custo' || field === 'custoRealizado') { return { ...e, [field]: parseBRL(rawValue) }; }
    if (field === 'fator_peso')  { const v = parseFloat(rawValue); return { ...e, fator_peso: isNaN(v) ? 1 : Math.max(0, v) }; }
    if (field.startsWith('cc_')) { return { ...e, customCols: { ...(e.customCols || {}), [field]: rawValue } }; }
    return { ...e, [field]: rawValue };
  };
  // Aplica um lote de edições (valor e/ou fmt por célula) num ÚNICO commit — usado no colar
  // de bloco (estilo Excel). Cada edição: { taskId, colId, field?, rawValue?, fmt? }.
  // fmt (quando presente) SUBSTITUI a formatação da coluna alvo (cola formatação da origem).
  const applyBlockEdits = (edits) => {
    if (readOnly || !edits.length) return;
    const byTask = new Map();
    edits.forEach(ed => { if (!byTask.has(ed.taskId)) byTask.set(ed.taskId, []); byTask.get(ed.taskId).push(ed); });
    let reschedule = false;
    const novas = etapas.map(e => {
      const list = byTask.get(e.id);
      if (!list) return e;
      let ne = e;
      let fmt = { ...(e.fmt || {}) };
      let fmtChanged = false;
      list.forEach(ed => {
        if (ed.field !== undefined) {
          ne = applyFieldToEtapa(ne, ed.field, ed.rawValue);
          if (RESCHEDULE_FIELDS.includes(ed.field)) reschedule = true;
        }
        if ('fmt' in ed) {
          const nk = cleanFmtObj({ ...(ed.fmt || {}) });
          if (Object.keys(nk).length) fmt[ed.colId] = nk; else delete fmt[ed.colId];
          fmtChanged = true;
        }
      });
      if (fmtChanged) ne = { ...ne, fmt };
      return ne;
    });
    onCommit(reschedule ? autoScheduleFromDeps(novas) : novas, { silent: true });
  };

  const handleCellSave = (id, field, rawValue) => {
    // Tratamento especial para mudança de ID (propaga referências)
    if (field === 'id') {
      const newId = String(rawValue).trim();
      if (!newId || newId === id) return;
      if (etapas.some(x => x.id !== id && x.id === newId)) {
        toast('ID já existe — escolha outro', { tone: 'warning', icon: 'alert-triangle' }); return;
      }
      const novas = etapas.map(e => ({
        ...e,
        id:       e.id === id ? newId : e.id,
        parentId: e.parentId === id ? newId : e.parentId,
        dep:      (e.dep || []).map(d =>
          typeof d === 'string'
            ? (d === id ? newId : d)
            : (d.id === id ? { ...d, id: newId } : d)
        ),
      }));
      if (selectedId === id) setSelectedId(newId);
      onCommit(novas, { silent: true });
      toast('ID atualizado', { tone: 'success', icon: 'check' });
      return;
    }

    const novas = etapas.map(e => e.id !== id ? e : applyFieldToEtapa(e, field, rawValue));
    onCommit(RESCHEDULE_FIELDS.includes(field) ? autoScheduleFromDeps(novas) : novas, { silent: true });
  };

  const handleToggleCollapse = (id) => {
    const novas = etapas.map(e => e.id === id ? { ...e, collapsed: !e.collapsed } : e);
    onCommit(novas, { silent: true });
  };

  // ── Ações de toolbar ────────────────────────────────────────────────────────
  const handleAddGroup   = () => onCommit(createGroup(selectedId, etapas, customCols), { silent: true });

  const handleDelete = () => {
    if (!selectedId) return;
    setDeleteConfirm(selectedId);
  };

  const handleIndent = () => {
    if (!selectedId) return;
    const novas = indentTasks(etapas, [selectedId]);
    onCommit(novas);
  };

  const handleOutdent = () => {
    if (!selectedId) return;
    const novas = outdentTasks(etapas, [selectedId]);
    onCommit(novas);
  };

  const canIndent  = !!selectedId && etapas.findIndex(e => e.id === selectedId) > 0;
  const canOutdent = !!selectedId && (etapas.find(e => e.id === selectedId)?.nivel || 0) > 0;

  // Atalhos Ctrl+Shift+→ / Ctrl+Shift+← para recuar/promover tarefa selecionada
  React.useEffect(() => {
    const h = (e) => {
      if (readOnly) return;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'ArrowRight') { e.preventDefault(); handleIndent(); }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'ArrowLeft')  { e.preventDefault(); handleOutdent(); }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [selectedId, etapas, readOnly]);

  const confirmDelete = () => {
    if (!deleteConfirm) return;
    const novas = deleteTask(deleteConfirm, etapas);
    const count = etapas.length - novas.length;
    onCommit(novas, { silent: true });
    setSelectedId(null);
    setDeleteConfirm(null);
    toast(`${count} tarefa${count > 1 ? 's removidas' : ' removida'}`, { tone: 'neutral', icon: 'check' });
  };

  const handleAddCol = (colDef) => {
    const newCols = [...customCols, colDef];
    AppData.cronogramaCustomCols = newCols;
    onCustomColsChange(newCols);
    const novas = etapas.map(e => ({ ...e, customCols: { ...(e.customCols || {}), [colDef.id]: '' } }));
    onCommit(novas, { silent: true });
    toast(`Coluna "${colDef.label}" adicionada`, { tone: 'success', icon: 'check' });
  };

  const statusBadgeClass = s => s === 'done' ? 'success' : s === 'late' ? 'danger' : 'info';
  const statusLabel      = s => s === 'done' ? 'Concluída' : s === 'late' ? 'Atrasada' : 'Futura';

  const exportExcelLista = () => {
    import('xlsx').then(XLSX => {
      const wb      = XLSX.utils.book_new();
      // Colunas visíveis na ordem atual (inclui custom cols que já estão em colOrder)
      const visCols = colOrder.filter(c => !hiddenCols.has(c));
      const getLabel = (cid) => {
        if (LISTA_COL_DEFS[cid]) return LISTA_COL_DEFS[cid].label;
        const cc = customCols.find(c => c.id === cid);
        return cc ? cc.label : cid;
      };
      // Formatos por índice de coluna
      const colFmts = {};
      visCols.forEach((cid, i) => {
        if (['custo', 'custoReal', 'saldo'].includes(cid)) { colFmts[i] = '#,##0.00'; return; }
        if (cid === 'avanco' || cid === 'peso') { colFmts[i] = '0.00%'; return; }
        if (cid === 'inicio' || cid === 'fim')  { colFmts[i] = 'DD/MM/YYYY'; return; }
        const cc = customCols.find(c => c.id === cid);
        if (cc) {
          if (cc.type === 'currency') colFmts[i] = '#,##0.00';
          if (cc.type === 'percent')  colFmts[i] = '0.00%';
          if (cc.type === 'date')     colFmts[i] = 'DD/MM/YYYY';
        }
      });
      const getCellVal = (e, cid) => {
        const gv      = e.isGroup ? groupVals[e.id] : null;
        const ini     = gv ? gv.inicio : e.inicio;
        const dur     = gv ? gv.dur    : e.dur;
        const av      = gv ? gv.avanco : e.avanco;
        const cst     = custoEf(e, gv);
        const realCst = e.isGroup
          ? etapas.filter(c => c.parentId === e.id).reduce((s, c) => s + (c.custoRealizado || 0), 0)
          : (e.custoRealizado || 0);
        if (cid === 'wbs')      return wbsMap[e.id] || '';
        if (cid === 'id')       return e.displayId ?? e.id;
        if (cid === 'etapa')    return '  '.repeat(e.nivel || 0) + e.etapa;
        if (cid === 'inicio')   return offsetToDate(ini);
        if (cid === 'fim')      return offsetToDate(ini + dur);
        if (cid === 'duracao')  return dur;
        if (cid === 'avanco')   return av / 100;
        if (cid === 'custo')    return cst;
        if (cid === 'peso') {
          if (e.isGroup) return '';
          if (hasVinculos && totalValorVinculado > 0) return (valorVinculadoMap[e.id] || 0) / totalValorVinculado;
          return (e.custo || 0) / (totalCusto || 1);
        }
        if (cid === 'fatorPeso')      return e.isGroup ? '' : (e.fator_peso ?? 1);
        if (cid === 'valorVinculado') return valorVinculadoMap[e.id] || '';
        if (cid === 'custoReal') return realCst;
        if (cid === 'saldo')    return cst - realCst;
        if (cid === 'resp')     return e.responsavel || '';
        if (cid === 'dep')      return e.isGroup ? '' : formatDepList(e.dep, etapas);
        if (cid === 'succ')     return (succMap[e.id] || []).map(id => idToDisplayId[id] ?? id).join(', ');
        if (cid === 'status')   return e.isGroup ? '' : (effStatus(e) === 'done' ? 'Concluída' : effStatus(e) === 'late' ? 'Atrasada' : 'Futura');
        if (cid === 'restricao') return (e.restricaoTipo && e.restricaoTipo !== 'asap')
          ? `${e.restricaoTipo}${e.restricaoData ? ' ' + e.restricaoData : ''}` : '';
        if (cid === 'participa') return e.showInDist ? 'Sim' : 'Não';
        return e.customCols?.[cid] ?? '';
      };
      const rows = [
        visCols.map(getLabel),
        ...filtrada.map(e => visCols.map(cid => getCellVal(e, cid))),
        visCols.map(cid => {
          if (cid === 'etapa')    return 'Total';
          if (cid === 'custo')    return totalCustoEf;
          if (cid === 'custoReal') return totalReal;
          if (cid === 'saldo')    return totalCustoEf - totalReal;
          return '';
        }),
      ];
      const ws  = XLSX.utils.aoa_to_sheet(rows, { dateNF: 'DD/MM/YYYY' });
      const rng = XLSX.utils.decode_range(ws['!ref']);
      for (let R = 1; R <= rng.e.r; R++) {
        Object.entries(colFmts).forEach(([C, z]) => {
          const addr = XLSX.utils.encode_cell({ r: R, c: Number(C) });
          if (ws[addr]) ws[addr].z = z;
        });
      }
      ws['!cols']   = visCols.map(c => ({ wch: Math.max(8, Math.round(getColW(c) / 7)) }));
      ws['!freeze'] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(wb, ws, 'Tarefas');
      XLSX.writeFile(wb, `lista-tarefas-${new Date().toISOString().slice(0, 10)}.xlsx`);
    });
  };

  const exportPDFLista = async () => {
    setExportingPDF(true);
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
      const doc   = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
      const BRAND = [1, 67, 134];
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();
      doc.setFontSize(13); doc.text('Lista de Tarefas', 14, 14);
      doc.setFontSize(8);  doc.setTextColor(130);
      doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, 14, 20);
      doc.setTextColor(0);
      const visCols    = colOrder.filter(c => !hiddenCols.has(c));
      const getLabel   = (cid) => LISTA_COL_DEFS[cid]?.label ?? (customCols.find(c => c.id === cid)?.label ?? cid);
      const RIGHT_C    = new Set(['custo', 'custoReal', 'saldo', 'peso', 'avanco', 'duracao', 'id', 'fatorPeso', 'valorVinculado']);
      const CENTER_C   = new Set(['status', 'inicio', 'fim', 'participa']);
      const getPDFVal  = (e, cid) => {
        const gv      = e.isGroup ? groupVals[e.id] : null;
        const ini     = gv ? gv.inicio : e.inicio;
        const dur     = gv ? gv.dur    : e.dur;
        const av      = gv ? gv.avanco : e.avanco;
        const cst     = custoEf(e, gv);
        const realCst = e.isGroup
          ? etapas.filter(c => c.parentId === e.id).reduce((s, c) => s + (c.custoRealizado || 0), 0)
          : (e.custoRealizado || 0);
        if (cid === 'wbs')       return wbsMap[e.id] || '';
        if (cid === 'id')        return String(e.displayId ?? e.id);
        if (cid === 'etapa')     return '  '.repeat(e.nivel || 0) + e.etapa;
        if (cid === 'inicio')    return isoToBR(offsetToISO(ini));
        if (cid === 'fim')       return isoToBR(offsetToISO(ini + dur));
        if (cid === 'duracao')   return dur + 'd';
        if (cid === 'avanco')    return av + '%';
        if (cid === 'custo')     return fmtBRL(cst);
        if (cid === 'peso') {
          if (e.isGroup) return '—';
          if (hasVinculos && totalValorVinculado > 0) return ((valorVinculadoMap[e.id] || 0) / totalValorVinculado * 100).toFixed(1) + '%';
          return (((e.custo || 0) / (totalCusto || 1)) * 100).toFixed(1) + '%';
        }
        if (cid === 'fatorPeso')      return e.isGroup ? '—' : (e.fator_peso ?? 1).toLocaleString('pt-BR');
        if (cid === 'valorVinculado') return valorVinculadoMap[e.id] ? fmtBRL(valorVinculadoMap[e.id]) : '—';
        if (cid === 'custoReal') return fmtBRL(realCst);
        if (cid === 'saldo')     return fmtBRL(cst - realCst);
        if (cid === 'resp')      return e.responsavel || '';
        if (cid === 'dep')       return e.isGroup ? '' : formatDepList(e.dep, etapas);
        if (cid === 'succ')      return (succMap[e.id] || []).map(id => idToDisplayId[id] ?? id).join(', ');
        if (cid === 'status')    return e.isGroup ? '' : (effStatus(e) === 'done' ? 'Concluída' : effStatus(e) === 'late' ? 'Atrasada' : 'Futura');
        if (cid === 'restricao') return (e.restricaoTipo && e.restricaoTipo !== 'asap') ? `${e.restricaoTipo}${e.restricaoData ? ' ' + e.restricaoData : ''}` : '';
        if (cid === 'participa') return e.showInDist ? 'Sim' : 'Não';
        return String(e.customCols?.[cid] ?? '');
      };
      const body = filtrada.map(e => ({
        _isGroup: e.isGroup,
        vals: visCols.map(cid => getPDFVal(e, cid)),
      }));
      const totRow = visCols.map(cid => {
        if (cid === 'etapa')     return 'Total';
        if (cid === 'custo')     return fmtBRL(totalCustoEf);
        if (cid === 'custoReal') return fmtBRL(totalReal);
        if (cid === 'saldo')     return fmtBRL(totalCustoEf - totalReal);
        return '';
      });
      const colStyles = Object.fromEntries(visCols.map((cid, i) => [i, {
        halign: RIGHT_C.has(cid) ? 'right' : CENTER_C.has(cid) ? 'center' : 'left',
        cellWidth: Math.max(10, (LISTA_COL_DEFS[cid]?.defWidth ?? 100) / 4),
      }]));
      autoTable(doc, {
        startY: 25,
        head: [visCols.map(getLabel)],
        body: body.map(r => r.vals),
        foot: [totRow],
        theme: 'grid',
        headStyles: { fillColor: BRAND, textColor: 255, fontSize: 7, fontStyle: 'bold' },
        bodyStyles: { fontSize: 7, textColor: 40 },
        alternateRowStyles: { fillColor: [248, 249, 250] },
        footStyles: { fillColor: [225, 232, 242], fontStyle: 'bold', fontSize: 7 },
        columnStyles: colStyles,
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
      doc.save(`lista-tarefas-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally { setExportingPDF(false); }
  };

  const btnStyle = { fontSize: 12, padding: '4px 10px', height: 30, gap: 5, display: 'flex', alignItems: 'center' };

  return (
    <>
    {/* Card comum: ações + filtro — rolam para fora ao rolar a página */}
    <div className="card" style={{ marginTop: 'var(--gap)' }}>

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 8, padding: '10px 16px', alignItems: 'center',
        flexWrap: 'wrap', background: 'var(--surface-muted)',
        borderBottom: '1px solid var(--border)',
      }}>
        {!readOnly && (
        <>
        <button className="btn btn-ghost" style={btnStyle} onClick={handleAddGroup}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          Grupo
        </button>

        <button className="btn btn-ghost" style={btnStyle} onClick={() => setShowPavimentos(true)}
          title="Inserir pavimentos automaticamente como subtarefas">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="4" rx="1"/><rect x="3" y="17" width="18" height="4" rx="1"/>
          </svg>
          Pavimentos
        </button>

        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

        <button
          className="btn btn-ghost"
          style={{ ...btnStyle, color: selectedId ? 'var(--danger)' : undefined, opacity: selectedId ? 1 : 0.45 }}
          onClick={handleDelete}
          disabled={!selectedId}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
          Excluir
        </button>
        </>
        )}

        <div style={{ flex: 1 }} />

        {!readOnly && (
        <>
        <button className="btn btn-ghost" style={btnStyle} onClick={undo} title="Desfazer (Ctrl+Z)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v6h6"/><path d="M3 13C5.5 8 10 5 15 5c4 0 7 2.5 7 6s-3 6-7 6H12"/>
          </svg>
          Desfazer
        </button>

        <button className="btn btn-ghost" style={btnStyle} onClick={redo} title="Refazer (Ctrl+Y)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 7v6h-6"/><path d="M21 13C18.5 8 14 5 9 5c-4 0-7 2.5-7 6s3 6 7 6H12"/>
          </svg>
          Refazer
        </button>
        </>
        )}

        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

        {multiSel.length > 0 && (
          <span style={{ fontSize: 11.5, color: 'var(--brand)', fontWeight: 600, padding: '3px 10px', background: 'var(--brand-tint)', borderRadius: 20 }}>
            {multiSel.length} selecionadas · Ctrl+F2 para vincular
          </span>
        )}

        {selectedId && !multiSel.length && (
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {selectedId} selecionado
          </span>
        )}

        <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>
          {visible.length} de {etapas.length} tarefas
        </span>

        {/* Botão de visibilidade de colunas */}
        <div ref={colPanelRef} style={{ position: 'relative' }}>
          <button className="btn btn-ghost" style={{ ...btnStyle, position: 'relative' }}
            onClick={() => setShowColPanel(v => !v)}
            title="Mostrar/ocultar colunas">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>
            </svg>
            Colunas{hiddenCols.size > 0 && <span style={{ marginLeft: 4, background: 'var(--brand)', color: 'white', borderRadius: 10, fontSize: 10, padding: '0 5px' }}>{hiddenCols.size}</span>}
          </button>

          {showColPanel && (
            <div style={{
              position: 'absolute', right: 0, top: '100%', marginTop: 4,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.13)',
              padding: '8px 0', zIndex: 9999, minWidth: 200,
            }}>
              <div style={{ padding: '4px 14px 8px', fontSize: 11, fontWeight: 600, color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid var(--border-subtle)' }}>
                Visibilidade das colunas
              </div>
              {colOrder.filter(c => !LISTA_FROZEN.includes(c)).map(colId => {
                const col = LISTA_COL_DEFS[colId];
                if (!col) return null;
                const visible = !hiddenCols.has(colId);
                return (
                  <label key={colId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, color: visible ? 'var(--text)' : 'var(--text-faint)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover, rgba(0,0,0,0.04))'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <input type="checkbox" checked={visible} onChange={() => toggleColVisibility(colId)}
                      style={{ accentColor: 'var(--brand)', width: 14, height: 14, cursor: 'pointer' }} />
                    {col.label}
                  </label>
                );
              })}
              {/* Colunas personalizadas */}
              {customCols.length > 0 && customCols.map(col => {
                const visible = !hiddenCols.has(col.id);
                return (
                  <label key={col.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, color: visible ? 'var(--text)' : 'var(--text-faint)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover, rgba(0,0,0,0.04))'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <input type="checkbox" checked={visible} onChange={() => toggleColVisibility(col.id)}
                      style={{ accentColor: 'var(--brand)', width: 14, height: 14, cursor: 'pointer' }} />
                    {col.label}
                  </label>
                );
              })}
              {hiddenCols.size > 0 && (
                <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '6px 14px 2px' }}>
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 0', color: 'var(--brand)' }}
                    onClick={() => setHiddenCols(new Set())}>
                    Mostrar todas
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ flex: 1 }} />
        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
        <button className="btn btn-ghost" style={btnStyle} onClick={exportExcelLista} title="Exportar para Excel (.xlsx)">
          <Icon name="download" size={13} /> Excel
        </button>
        <button className="btn btn-ghost" style={{ ...btnStyle, minWidth: 72 }} onClick={exportPDFLista} disabled={exportingPDF} title="Exportar para PDF">
          <Icon name="download" size={13} /> {exportingPDF ? 'Gerando…' : 'PDF'}
        </button>
      </div>

      {/* ── Barra de filtros ─────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 8, padding: '8px 16px', alignItems: 'center',
        borderBottom: '1px solid var(--border)', flexWrap: 'wrap',
        background: 'var(--bg-app)',
      }}>
        <input
          className="input" style={{ height: 30, fontSize: 12, minWidth: 180, flex: 1 }}
          placeholder="Buscar tarefa..."
          value={busca} onChange={e => setBusca(e.target.value)}
        />
        <select
          className="input" style={{ height: 30, fontSize: 12 }}
          value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
        >
          <option value="">Todos os status</option>
          <option value="done">Concluída</option>
          <option value="late">Atrasada</option>
          <option value="upcoming">Futura</option>
        </select>
        <input
          className="input" style={{ height: 30, fontSize: 12, minWidth: 130 }}
          placeholder="Responsável..."
          value={filtroResp} onChange={e => setFiltroResp(e.target.value)}
        />
        {(busca || filtroStatus || filtroResp) && (
          <button className="btn btn-ghost" style={{ height: 30, fontSize: 12 }}
            onClick={() => { setBusca(''); setFiltroStatus(''); setFiltroResp(''); }}>
            Limpar filtros
          </button>
        )}
        {(busca || filtroStatus || filtroResp) && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {filtrada.length} de {visible.length} exibidas
          </span>
        )}
      </div>
    </div>{/* fim card comum (ações + filtro) */}

    {/* Sentinela: marca onde o card fixo começa (para detectar quando prender) */}
    <div ref={listaSentinelRef} aria-hidden="true" style={{ height: 0 }} />
    {/* Espaçador: preserva a altura do fluxo quando o card fixo sai do fluxo (position:fixed) */}
    {listaPinned && <div aria-hidden="true" style={{ marginTop: 8, height: `calc(100vh - ${topbarH}px - 8px)` }} />}

    {/* Card FIXO: barra de formatação + banda + cabeçalho + tabela; congela sob a topbar */}
    <div ref={listaRef} className="card"
      style={listaPinned
        ? { position: 'fixed', top: topbarH + 10, left: listaPinned.left, width: listaPinned.width, height: `calc(100vh - ${topbarH + 10}px - 8px)`, zIndex: 5, margin: 0, display: 'flex', flexDirection: 'column' }
        : { marginTop: 8, height: `calc(100vh - ${topbarH}px - 8px)`, display: 'flex', flexDirection: 'column' }
      }>

      {/* ── Barra de formatação (célula/linha estilo Excel) ────────────────── */}
      {!readOnly && (() => {
        const hasTarget = !!(selectedCell || selectedId);
        const alvo = selectedCell ? 'célula' : (selectedId ? 'linha' : '');
        const tglStyle = (on) => ({
          ...btnStyle, height: 28, padding: '2px 9px', fontWeight: 700,
          background: on ? 'var(--brand)' : 'var(--surface)', color: on ? '#fff' : 'var(--text)',
          border: '1px solid var(--border)', borderRadius: 6,
        });
        const size = activeFmt.fontSize || pendingFontSize || 13;
        const clampSize = (n) => Math.min(24, Math.max(9, n));
        const div = () => <span style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 2px' }} />;
        const iconBtn = { ...btnStyle, height: 28, width: 30, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6 };
        // Estilos dos grupos estilo ribbon (Excel)
        const groupBox = { display: 'inline-flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', padding: '4px 6px 2px' };
        const groupContent = { display: 'flex', flexDirection: 'column', gap: 4, flex: 1, justifyContent: 'center' };
        const rowStyle = { display: 'flex', alignItems: 'center', gap: 4 };
        const caption = { textAlign: 'center', fontSize: 9.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 3 };
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '6px 2px 8px' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Formatar {alvo ? <strong>{alvo}</strong> : ''}
            </span>
            {!fmtCollapsed && (
            <div style={{ display: 'inline-flex', alignItems: 'stretch', gap: 8, flexWrap: 'wrap', opacity: hasTarget ? 1 : 0.5, pointerEvents: hasTarget || painterOn ? 'auto' : 'none' }}>

              {/* ── Grupo FONTE (2 linhas) ── */}
              <div style={groupBox}>
                <div style={groupContent}>
                  {/* Linha 1: tipo da fonte + tamanho */}
                  <div style={rowStyle}>
                    <select
                      value={activeFmt.fontFamily || pendingFontFamily || ''}
                      onChange={(ev) => applyFontFamily(ev.target.value || false)}
                      title="Tipo da fonte"
                      style={{ height: 26, fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', padding: '0 4px', maxWidth: 128, cursor: 'pointer' }}
                    >
                      <option value="">Padrão</option>
                      <option value="Arial, sans-serif">Arial</option>
                      <option value="Calibri, 'Segoe UI', sans-serif">Calibri</option>
                      <option value="Verdana, sans-serif">Verdana</option>
                      <option value="Tahoma, sans-serif">Tahoma</option>
                      <option value="Georgia, serif">Georgia</option>
                      <option value="'Times New Roman', serif">Times New Roman</option>
                      <option value="'Courier New', monospace">Courier New</option>
                    </select>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                      <button style={{ ...btnStyle, height: 26, padding: '2px 7px' }} onClick={() => applyFontSize(clampSize(size - 1))} title="Diminuir fonte">A−</button>
                      <span style={{ fontSize: 12, minWidth: 18, textAlign: 'center', color: 'var(--text-muted)' }}>{size}</span>
                      <button style={{ ...btnStyle, height: 26, padding: '2px 7px' }} onClick={() => applyFontSize(clampSize(size + 1))} title="Aumentar fonte">A+</button>
                    </span>
                  </div>
                  {/* Linha 2: N I S + cores */}
                  <div style={rowStyle}>
                    <button style={tglStyle(activeFmt.bold)} onClick={() => applyFmt({ bold: !activeFmt.bold })} title="Negrito">N</button>
                    <button style={{ ...tglStyle(activeFmt.italic), fontStyle: 'italic' }} onClick={() => applyFmt({ italic: !activeFmt.italic })} title="Itálico">I</button>
                    <button style={{ ...tglStyle(activeFmt.underline), textDecoration: 'underline' }} onClick={() => applyFmt({ underline: !activeFmt.underline })} title="Sublinhado">S</button>
                    {div()}
                    <ColorMenu label="Fundo" title="Cor de preenchimento" value={activeFmt.bg}
                      onPick={(c) => applyFmt({ bg: c })} onClear={() => applyFmt({ bg: false })} clearLabel="Sem preenchimento"
                      icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m19 11-8-8-8.5 8.5a2 2 0 0 0 0 3L8 20a2 2 0 0 0 3 0l8-8Z"/><path d="m5 2 5 5"/><path d="M2 13h15"/><path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z"/></svg>} />
                    <ColorMenu label="Texto" title="Cor da fonte" value={activeFmt.color}
                      onPick={(c) => applyFmt({ color: c })} onClear={() => applyFmt({ color: false })} clearLabel="Cor automática"
                      icon={<span style={{ fontWeight: 800, fontSize: 13, lineHeight: 1 }}>A</span>} />
                  </div>
                </div>
                <div style={caption}>Fonte</div>
              </div>

              {/* ── Grupo RECUO ── */}
              <div style={groupBox}>
                <div style={{ ...groupContent, justifyContent: 'center' }}>
                  <div style={rowStyle}>
                    <button style={{ ...iconBtn, opacity: canOutdent ? 1 : 0.4 }} onClick={handleOutdent} disabled={!canOutdent}
                      title="Promover — subir um nível hierárquico (Ctrl+Shift+←)">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="7 8 3 12 7 16"/><line x1="21" y1="6" x2="11" y2="6"/><line x1="21" y1="12" x2="11" y2="12"/><line x1="21" y1="18" x2="11" y2="18"/></svg>
                    </button>
                    <button style={{ ...iconBtn, opacity: canIndent ? 1 : 0.4 }} onClick={handleIndent} disabled={!canIndent}
                      title="Recuar — tornar subtarefa da linha acima (Ctrl+Shift+→)">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 8 7 12 3 16"/><line x1="21" y1="6" x2="11" y2="6"/><line x1="21" y1="12" x2="11" y2="12"/><line x1="21" y1="18" x2="11" y2="18"/></svg>
                    </button>
                  </div>
                </div>
                <div style={caption}>Recuo</div>
              </div>

              {/* ── Grupo FORMATAÇÃO ── */}
              <div style={groupBox}>
                <div style={{ ...groupContent, justifyContent: 'center' }}>
                  <div style={rowStyle}>
                    <button style={{ ...tglStyle(painterOn), width: 30, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                      onClick={() => {
                        if (painterOn) { setPainterOn(false); return; }
                        painterRef.current = { ...activeFmt };
                        setPainterOn(true);
                      }}
                      title="Pincel: copia a formatação da seleção; clique numa célula para aplicar">
                      <Icon name="edit" size={14} />
                    </button>
                    <button style={iconBtn} onClick={clearFmt} title="Limpar formatação da seleção">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7V4h16v3"/><path d="M5 20h6"/><path d="M13 4 8 20"/><line x1="15" y1="15" x2="20" y2="20"/><line x1="20" y1="15" x2="15" y2="20"/></svg>
                    </button>
                  </div>
                </div>
                <div style={caption}>Formatação</div>
              </div>

            </div>
            )}
            <button
              onClick={() => setFmtCollapsed(v => !v)}
              title={fmtCollapsed ? 'Mostrar formatação' : 'Ocultar formatação'}
              style={{ marginLeft: 'auto', alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0 }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: fmtCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .12s' }}><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>
        );
      })()}

      {/* ── Tabela ───────────────────────────────────────────────────────── */}
      <div ref={listaScrollRef} tabIndex={-1} onKeyDown={handleListKeyDown} onScroll={() => { if (marquee) setMarquee(null); }} style={{ overflow: 'auto', flex: 1, minHeight: 0, outline: 'none', userSelect: 'none', WebkitUserSelect: 'none', position: 'relative' }}>
        <table className="tbl tbl-lista" style={{ minWidth: 1780 + GUTTER_W, '--lista-row-h': rowH + 'px' }}>
          <thead>
            {(() => {
              // Linha de bandas (Etapa/Tarefa · Prazo · Avanço · Financeiro · Sequenciamento).
              // Dinâmica: agrupa colunas visíveis contíguas por banda, respeitando reordenação.
              const frozenVis = LISTA_FROZEN.filter(c => !hiddenCols.has(c));
              const frozenW = frozenVis.reduce((a, c) => a + getColW(c), 0);
              const rest = colOrder.filter(c => !hiddenCols.has(c) && !LISTA_FROZEN.includes(c));
              const runs = [];
              rest.forEach(c => {
                const b = LISTA_COL_DEFS[c]?.band || 'seq';
                const last = runs[runs.length - 1];
                if (last && last.band === b) last.cols.push(c); else runs.push({ band: b, cols: [c] });
              });
              const custVis = customCols.filter(col => !hiddenCols.has(col.id));
              return (
                <tr className="band-row" ref={bandRowRef}>
                  <th className="band-th" onClick={selectAll} title="Selecionar tudo" style={{ position: 'sticky', top: 0, left: 0, zIndex: 7, width: GUTTER_W, minWidth: GUTTER_W, cursor: 'pointer' }} />
                  {frozenVis.length > 0 && (
                    <th colSpan={frozenVis.length} className="band-th" style={{ position: 'sticky', top: 0, left: GUTTER_W, zIndex: 6, width: frozenW, minWidth: frozenW }}>
                      {LISTA_BAND_LABELS.etapa}
                    </th>
                  )}
                  {runs.map((r, i) => (
                    <th key={'band-' + i} colSpan={r.cols.length} className="band-th">{LISTA_BAND_LABELS[r.band] || ''}</th>
                  ))}
                  {custVis.length > 0 && <th colSpan={custVis.length} className="band-th">{LISTA_BAND_LABELS.custom}</th>}
                  <th className="band-th" />
                </tr>
              );
            })()}
            <tr>
              <th onClick={selectAll} title="Selecionar tudo" style={{ width: GUTTER_W, minWidth: GUTTER_W, position: 'sticky', top: bandH, left: 0, zIndex: 7, userSelect: 'none', cursor: 'pointer' }} />
              {colOrder.filter(c => !hiddenCols.has(c)).map(colId => renderTh(colId))}
              {customCols.filter(col => !hiddenCols.has(col.id)).map(col => (
                <th key={col.id} style={{ minWidth: getColW(col.id) || 110, position: 'sticky', top: bandH, zIndex: 3, userSelect: 'none', cursor: 'pointer' }}
                  onClick={() => selectColumn(col.id)}
                  onContextMenu={(ev) => { ev.preventDefault(); setCtxMenu({ x: ev.clientX, y: ev.clientY, kind: 'col', colId: col.id }); }}>
                  {col.label}
                  <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 5, cursor: 'col-resize', zIndex: 5 }}
                    onClick={(ev) => ev.stopPropagation()} onMouseDown={(ev) => { ev.stopPropagation(); startColResize(ev, col.id); }} />
                </th>
              ))}
              <th style={{ width: 36, padding: '0 8px', textAlign: 'center', position: 'sticky', top: bandH, zIndex: 3 }}>
                <button
                  onClick={() => setShowAddCol(true)}
                  title="Adicionar coluna personalizada"
                  style={{ color: 'var(--text-faint)', fontSize: 18, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontWeight: 300 }}
                >+</button>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtrada.map((e, rowIdx) => {
              // Realce de LINHA só quando a linha está selecionada e não há uma CÉLULA
              // selecionada nessa linha (seleção de célula tem prioridade visual).
              const cellSelHere = selectedCell?.taskId === e.id;
              // Não aplica o realce de linha quando a linha faz parte de um intervalo de
              // células selecionadas (senão a âncora fica com tom diferente do restante).
              const isSelected  = selectedId === e.id && !cellSelHere && !rangeRowIds.has(e.id);
              const indent      = (e.nivel || 0) * 20;
              const hasChildren = etapas.some(x => x.parentId === e.id);
              const gv          = e.isGroup ? groupVals[e.id] : null;
              const multiIdx    = multiSel.indexOf(e.id);
              const isMultiSel  = multiIdx >= 0;
              const eInicio     = gv ? gv.inicio : e.inicio;
              const eDur        = gv ? gv.dur    : e.dur;
              const eAvanco     = gv ? gv.avanco : e.avanco;

              // Background explícito para células sticky (colunas congeladas)
              const frozenBg = isSelected
                ? 'color-mix(in srgb, var(--brand) 8%, var(--surface))'
                : e.isGroup ? 'var(--brand-50)' : 'var(--surface)';
              const stickyStyle = (colId) => ({
                position: 'sticky', left: frozenLeft[colId], zIndex: 1, background: frozenBg,
              });

              // Mapa de células por colId — renderizadas na ordem de colOrder
              const cells = {
                wbs: (
                  <td key="wbs" className="mono text-sm text-muted"
                    style={{ paddingRight: 4, ...stickyStyle('wbs') }}>
                    {wbsMap[e.id]}
                  </td>
                ),
                id: (
                  <td key="id" className="mono"
                    style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', ...stickyStyle('id') }}>
                    {e.displayId ?? e.id}
                  </td>
                ),
                etapa: (
                  <td key="etapa" onClick={ev => ev.stopPropagation()} style={{ paddingLeft: 0, ...stickyStyle('etapa') }}>
                    <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 10 + indent }}>
                      {(e.isGroup || hasChildren) ? (
                        <button className="lista-toggle" onClick={ev => { ev.stopPropagation(); handleToggleCollapse(e.id); }}>
                          {e.collapsed ? '▶' : '▼'}
                        </button>
                      ) : (
                        <span style={{ width: 20, flexShrink: 0, display: 'inline-block' }} />
                      )}
                      <EditableCell value={e.etapa} onSave={v => v.trim() && handleCellSave(e.id, 'etapa', v)}
                        readOnly={readOnly} style={{ fontWeight: e.isGroup ? 700 : 400, fontSize: e.isGroup ? 13.5 : 13 }} />
                      {isMultiSel && <span className="multi-sel-badge">{multiIdx + 1}</span>}
                    </div>
                  </td>
                ),
                inicio: (
                  <td key="inicio" className="mono text-sm" onClick={ev => ev.stopPropagation()}>
                    <EditableCell type="date" value={offsetToISO(eInicio)}
                      onSave={v => handleCellSave(e.id, 'inicio', v)} readOnly={readOnly || e.isGroup} />
                  </td>
                ),
                fim: (
                  <td key="fim" className="mono text-sm" onClick={ev => ev.stopPropagation()}>
                    <EditableCell type="date" value={offsetToISO(e.isGroup ? eInicio + eDur : workEnd(eInicio, eDur))}
                      onSave={v => handleCellSave(e.id, 'fim', v)} readOnly={readOnly || e.isGroup} />
                  </td>
                ),
                duracao: (
                  <td key="duracao" className="mono num" onClick={ev => ev.stopPropagation()}>
                    {e.isGroup ? (
                      <span className="text-muted mono" style={{ fontSize: 12 }}>{eDur}d</span>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <EditableCell type="number" value={String(e.dur)}
                          onSave={v => handleCellSave(e.id, 'duracaoDias', v)} readOnly={readOnly} style={{ minWidth: 32 }} />
                        <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>d</span>
                      </div>
                    )}
                  </td>
                ),
                avanco: (
                  <td key="avanco" onClick={ev => ev.stopPropagation()}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, minWidth: 50 }}>
                        <div className={'progress' + (e.isGroup ? ' groupbar' : effStatus(e) === 'done' ? ' success' : effStatus(e) === 'late' ? ' danger' : effStatus(e) === 'upcoming' ? ' futura' : '')}>
                          <span style={{ width: eAvanco + '%' }}></span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <EditableCell type="number" value={String(eAvanco)}
                          onSave={v => handleCellSave(e.id, 'avanco', v)} readOnly={readOnly || e.isGroup}
                          style={{ fontFamily: 'var(--font-mono)', fontSize: 12, minWidth: 28 }} />
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>%</span>
                      </div>
                    </div>
                  </td>
                ),
                custo: (
                  <td key="custo" className="num" style={{ textAlign: 'right' }} onClick={ev => ev.stopPropagation()}>
                    {hasVinculos ? (
                      <span className="mono" style={{ fontSize: 12, color: 'var(--text)' }}
                        title="Derivado do orçamento vinculado">{fmtBRL(valorVinculadoMap[e.id] || 0)}</span>
                    ) : e.isGroup ? (
                      <span className="mono" style={{ fontSize: 12, fontWeight: 700 }}>{fmtBRL(gv?.custo || 0)}</span>
                    ) : readOnly ? (
                      <span className="mono" style={{ fontSize: 12, display: 'block', textAlign: 'right' }}>{fmtBRL(e.custo || 0)}</span>
                    ) : editingCusto === e.id + '_custo' ? (
                      <input autoFocus type="number" min="0" defaultValue={e.custo || 0}
                        style={{ width: 100, textAlign: 'right', border: 'none', outline: '2px solid var(--brand)', borderRadius: 4, padding: '2px 6px', fontSize: 12, fontFamily: 'var(--font-mono)', background: 'var(--surface)', boxSizing: 'border-box' }}
                        onBlur={ev => { handleCellSave(e.id, 'custo', ev.target.value); setEditingCusto(null); }}
                        onKeyDown={ev => { ev.stopPropagation(); if (ev.key === 'Enter') { handleCellSave(e.id, 'custo', ev.target.value); setEditingCusto(null); } if (ev.key === 'Escape') setEditingCusto(null); }}
                      />
                    ) : (
                      <span className="mono" style={{ fontSize: 12, cursor: 'text', display: 'block', textAlign: 'right' }}
                        onClick={() => setEditingCusto(e.id + '_custo')}>{fmtBRL(e.custo || 0)}</span>
                    )}
                  </td>
                ),
                peso: (
                  <td key="peso" className="num mono" style={{ textAlign: 'right', fontSize: 12, fontWeight: e.isGroup ? 700 : 400, color: e.isGroup ? 'var(--text)' : 'var(--text-muted)' }}>
                    {(() => {
                      const base = hasVinculos && totalValorVinculado > 0 ? totalValorVinculado : totalCusto;
                      const val = hasVinculos ? (valorVinculadoMap[e.id] || 0) : (e.isGroup ? (gv?.custo || 0) : (e.custo || 0));
                      return base > 0 ? (val / base * 100).toFixed(1) + '%' : '—';
                    })()}
                  </td>
                ),
                fatorPeso: (
                  <td key="fatorPeso" className="num" style={{ textAlign: 'right', fontSize: 12 }} onClick={ev => ev.stopPropagation()}>
                    {e.isGroup ? (
                      <span className="text-faint">—</span>
                    ) : readOnly ? (
                      <span className="mono" style={{ display: 'block', textAlign: 'right' }}>{(e.fator_peso ?? 1).toLocaleString('pt-BR')}</span>
                    ) : editingFatorPeso === e.id ? (
                      <input
                        autoFocus type="number" min="0" step="any"
                        defaultValue={e.fator_peso ?? 1}
                        style={{ width: 72, textAlign: 'right', border: 'none', outline: '2px solid var(--brand)', borderRadius: 4, padding: '2px 6px', fontSize: 12, fontFamily: 'var(--font-mono)', background: 'var(--surface)', boxSizing: 'border-box' }}
                        onBlur={ev => { handleCellSave(e.id, 'fator_peso', ev.target.value); setEditingFatorPeso(null); }}
                        onKeyDown={ev => { ev.stopPropagation(); if (ev.key === 'Enter') { handleCellSave(e.id, 'fator_peso', ev.target.value); setEditingFatorPeso(null); } if (ev.key === 'Escape') setEditingFatorPeso(null); }}
                      />
                    ) : (
                      <span className="mono" style={{ cursor: 'text', display: 'block', textAlign: 'right' }}
                        onClick={() => setEditingFatorPeso(e.id)}>
                        {(e.fator_peso ?? 1).toLocaleString('pt-BR')}
                      </span>
                    )}
                  </td>
                ),
                valorVinculado: (
                  <td key="valorVinculado" className="num mono" style={{ textAlign: 'right', fontSize: 12, color: valorVinculadoMap[e.id] ? 'var(--text)' : 'var(--text-faint)' }}>
                    {valorVinculadoMap[e.id] ? fmtBRL(valorVinculadoMap[e.id]) : '—'}
                  </td>
                ),
                custoReal: (
                  <td key="custoReal" className="num" style={{ textAlign: 'right' }} onClick={ev => ev.stopPropagation()}>
                    {e.isGroup ? (
                      <span className="mono" style={{ fontSize: 12, fontWeight: 700 }}>
                        {fmtBRL(etapas.filter(c => c.parentId === e.id).reduce((s, c) => s + (c.custoRealizado || 0), 0))}
                      </span>
                    ) : readOnly ? (
                      <span className="mono" style={{ fontSize: 12, display: 'block', textAlign: 'right' }}>{fmtBRL(e.custoRealizado || 0)}</span>
                    ) : editingCusto === e.id + '_real' ? (
                      <input autoFocus type="number" min="0" defaultValue={e.custoRealizado || 0}
                        style={{ width: 100, textAlign: 'right', border: 'none', outline: '2px solid var(--brand)', borderRadius: 4, padding: '2px 6px', fontSize: 12, fontFamily: 'var(--font-mono)', background: 'var(--surface)', boxSizing: 'border-box' }}
                        onBlur={ev => { handleCellSave(e.id, 'custoRealizado', ev.target.value); setEditingCusto(null); }}
                        onKeyDown={ev => { ev.stopPropagation(); if (ev.key === 'Enter') { handleCellSave(e.id, 'custoRealizado', ev.target.value); setEditingCusto(null); } if (ev.key === 'Escape') setEditingCusto(null); }}
                      />
                    ) : (
                      <span className="mono" style={{ fontSize: 12, cursor: 'text', display: 'block', textAlign: 'right' }}
                        onClick={() => setEditingCusto(e.id + '_real')}>{fmtBRL(e.custoRealizado || 0)}</span>
                    )}
                  </td>
                ),
                saldo: (
                  <td key="saldo" className="num mono" style={{ textAlign: 'right', fontSize: 12 }}>
                    {(() => {
                      const prev = custoEf(e, gv);
                      const real = e.isGroup
                        ? etapas.filter(c => c.parentId === e.id).reduce((s, c) => s + (c.custoRealizado || 0), 0)
                        : (e.custoRealizado || 0);
                      const saldo = prev - real;
                      return <span style={{ color: saldo < 0 ? 'var(--danger)' : 'inherit' }}>{fmtBRL(saldo)}</span>;
                    })()}
                  </td>
                ),
                resp: (
                  <td key="resp" onClick={ev => ev.stopPropagation()}>
                    {e.isGroup ? null : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {e.responsavel && (
                          <span className="avatar" style={{ width: 26, height: 26, flex: '0 0 26px', fontSize: 11, background: respColor(e.responsavel) }}>
                            {respInitials(e.responsavel)}
                          </span>
                        )}
                        <EditableCell value={e.responsavel || ''} onSave={v => handleCellSave(e.id, 'responsavel', v)} readOnly={readOnly} style={{ fontSize: 12.5 }} />
                      </div>
                    )}
                  </td>
                ),
                dep: (
                  <td key="dep" onClick={ev => ev.stopPropagation()}>
                    {e.isGroup ? null : editingDep === e.id ? (
                      <input autoFocus defaultValue={formatDepList(e.dep, etapas)}
                        style={{ width: '100%', border: 'none', outline: '2px solid var(--brand)', borderRadius: 4, padding: '2px 6px', fontSize: 12, fontFamily: 'var(--font-mono)', background: 'var(--surface)', boxSizing: 'border-box' }}
                        onBlur={ev => { handleCellSave(e.id, 'dep', ev.target.value); setEditingDep(null); }}
                        onKeyDown={ev => { ev.stopPropagation(); if (ev.key === 'Enter') { handleCellSave(e.id, 'dep', ev.target.value); setEditingDep(null); } if (ev.key === 'Escape') setEditingDep(null); }} />
                    ) : (() => {
                      const parts = formatDepList(e.dep, etapas).split(',').map(s => s.trim()).filter(p => p && p !== '—');
                      return (
                        <div onClick={() => !readOnly && setEditingDep(e.id)} style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', cursor: readOnly ? 'default' : 'text', minHeight: 20 }}>
                          {parts.length ? parts.map(p => <span key={p} className="dep-chip">{p}</span>) : <span className="text-faint">—</span>}
                        </div>
                      );
                    })()}
                  </td>
                ),
                succ: (
                  <td key="succ">
                    {e.isGroup ? null : (() => {
                      const ss = (succMap[e.id] || []).map(id => idToDisplayId[id] ?? id);
                      return ss.length
                        ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{ss.map(s => <span key={s} className="dep-chip">{s}</span>)}</div>
                        : <span className="text-faint">—</span>;
                    })()}
                  </td>
                ),
                status: (
                  <td key="status">
                    {!e.isGroup && (
                      <span className={'badge ' + statusBadgeClass(effStatus(e))}>{statusLabel(effStatus(e))}</span>
                    )}
                  </td>
                ),
                restricao: (
                  <td key="restricao" onClick={ev => ev.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                    {e.isGroup ? <span className="text-faint">—</span> : (
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <select style={{ width: '100%', height: 30, fontSize: 12, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-soft)', background: 'var(--surface)' }}
                          value={e.restricaoTipo || 'asap'}
                          onChange={ev => handleCellSave(e.id, 'restricaoTipo', ev.target.value)}
                          onClick={ev => ev.stopPropagation()}>
                          <option value="asap">O mais cedo possível</option>
                          <option value="snet">Não iniciar antes de</option>
                          <option value="snlt">Não iniciar depois de</option>
                          <option value="fnet">Não terminar antes de</option>
                          <option value="fnlt">Não terminar depois de</option>
                          <option value="mso">Deve iniciar em</option>
                          <option value="mfo">Deve terminar em</option>
                        </select>
                        {e.restricaoTipo && e.restricaoTipo !== 'asap' && (
                          <input type="date" style={{ height: 26, fontSize: 11 }}
                            value={e.restricaoData || ''}
                            onChange={ev => handleCellSave(e.id, 'restricaoData', ev.target.value)}
                            onClick={ev => ev.stopPropagation()} />
                        )}
                      </div>
                    )}
                  </td>
                ),
                participa: (
                  <td key="participa" onClick={ev => ev.stopPropagation()} style={{ textAlign: 'center' }}>
                    {!e.isGroup && (
                      <input type="checkbox"
                        checked={e.showInDist === true}
                        style={{ width: 14, height: 14, cursor: 'pointer', accentColor: 'var(--brand)' }}
                        onChange={ev => {
                          const novas = etapas.map(t =>
                            t.id === e.id ? { ...t, showInDist: ev.target.checked } : t
                          );
                          onCommit(novas, { silent: true });
                        }}
                      />
                    )}
                  </td>
                ),
              };

              return (
                <tr key={e.id}
                  data-taskid={e.id}
                  className={[
                    isSelected ? 'lista-row-selected' : e.isGroup ? 'lista-row-group' : '',
                    dragOverId === e.id ? 'drag-over-row' : '',
                  ].filter(Boolean).join(' ')}
                  onContextMenu={(ev) => { ev.preventDefault(); setCtxMenu({ x: ev.clientX, y: ev.clientY, kind: 'row', taskId: e.id }); }}
                  onClick={(ev) => {
                    // Acabou de mover a linha pela borda: não alterna a seleção neste clique
                    if (rowDragMovedRef.current) { rowDragMovedRef.current = false; return; }
                    if (ev.ctrlKey || ev.metaKey) {
                      ev.preventDefault();
                      setMultiSel(ms => ms.includes(e.id) ? ms.filter(id => id !== e.id) : [...ms, e.id]);
                    } else {
                      setSelectedId(id => id === e.id ? null : e.id);
                      setMultiSel([]);
                    }
                  }}
                  onMouseEnter={() => {
                    hoverRowRef.current = e.id;
                    if (dragRowRef.current != null) setDragOverId(e.id);
                  }}
                  onMouseMove={(ev) => {
                    if (readOnly || dragRowRef.current != null) return;
                    const tr = ev.currentTarget;
                    const rect = tr.getBoundingClientRect();
                    // Perto da borda superior/inferior de uma linha selecionada: modo "mover" (estilo Excel)
                    const nearBorder = (ev.clientY - rect.top <= 5) || (rect.bottom - ev.clientY <= 5);
                    const canMove = nearBorder && (selectedId === e.id || multiSel.includes(e.id));
                    tr.style.cursor = canMove ? 'move' : 'grab';
                  }}
                  onMouseLeave={(ev) => { ev.currentTarget.style.cursor = 'grab'; }}
                  onMouseDown={(ev) => {
                    if (readOnly) return;
                    const rect = ev.currentTarget.getBoundingClientRect();
                    const nearBorder = (ev.clientY - rect.top <= 5) || (rect.bottom - ev.clientY <= 5);
                    if (!nearBorder || !(selectedId === e.id || multiSel.includes(e.id))) return;
                    // Arraste manual da linha pela borda (evita o DnD nativo, que era instável)
                    ev.preventDefault();
                    isSelectingRef.current = false; // cancela seleção de intervalo de células
                    dragRowRef.current = e.id;
                    rowDragMovedRef.current = false;
                    const onMove = () => {
                      rowDragMovedRef.current = true;
                      if (hoverRowRef.current != null) setDragOverId(hoverRowRef.current);
                    };
                    const onUp = () => {
                      document.removeEventListener('mousemove', onMove);
                      document.removeEventListener('mouseup', onUp);
                      const dragged = dragRowRef.current;
                      const target  = hoverRowRef.current;
                      dragRowRef.current = null;
                      setDragOverId(null);
                      if (dragged != null && target != null && dragged !== target) {
                        onCommit(moveTaskBlock(etapas, dragged, target, true));
                      } else {
                        rowDragMovedRef.current = false; // não moveu: deixa o clique agir normalmente
                      }
                    };
                    document.addEventListener('mousemove', onMove);
                    document.addEventListener('mouseup', onUp);
                  }}
                  style={{ cursor: 'grab', fontWeight: e.isGroup ? 600 : undefined, '--lista-row-h': (rowHeights[e.id] ?? rowH) + 'px' }}
                >
                  {/* Calha: número da linha (estilo Excel/Project) — clique seleciona a linha */}
                  <td
                    onMouseDown={(ev) => {
                      ev.stopPropagation(); ev.preventDefault();
                      const cols = visibleColIds();
                      if (!cols.length) return;
                      rowSelectingRef.current = true;
                      rowSelAnchorRef.current = e.id;
                      isSelectingRef.current = false;
                      setSelAnchor({ taskId: e.id, colId: cols[0] });
                      setSelectedCell({ taskId: e.id, colId: cols[cols.length - 1] });
                      setSelectedId(e.id);
                      setMultiSel([]);
                      listaScrollRef.current?.focus?.({ preventScroll: true });
                    }}
                    onMouseEnter={() => {
                      if (!rowSelectingRef.current) return;
                      const cols = visibleColIds();
                      if (!cols.length) return;
                      setSelAnchor({ taskId: rowSelAnchorRef.current, colId: cols[0] });
                      setSelectedCell({ taskId: e.id, colId: cols[cols.length - 1] });
                    }}
                    title="Clique e arraste para selecionar linhas"
                    style={{
                      position: 'sticky', left: 0, zIndex: 2, background: frozenBg,
                      width: GUTTER_W, minWidth: GUTTER_W, textAlign: 'center',
                      cursor: 'pointer', userSelect: 'none', color: 'var(--text-faint)',
                      fontSize: 11, fontFamily: 'var(--font-mono, monospace)',
                    }}
                  >
                    {rowIdx + 1}
                  </td>
                  {colOrder.filter(c => !hiddenCols.has(c)).map(colId => decorateCell(cells[colId], colId, e.id, e.fmt, rangeEdges.get(e.id + '|' + colId)))}

                  {/* Colunas personalizadas */}
                  {customCols.filter(col => !hiddenCols.has(col.id)).map(col => {
                    const cellVal = (e.customCols || {})[col.id] || '';
                    let cell;
                    if (col.type === 'boolean') cell = (
                      <td key={col.id} onClick={ev => ev.stopPropagation()}>
                        <select className="input" disabled={readOnly} style={{ height: 26, fontSize: 11, padding: '0 4px' }}
                          value={cellVal} onChange={ev => handleCellSave(e.id, col.id, ev.target.value)}>
                          <option value="">—</option>
                          <option value="sim">Sim</option>
                          <option value="não">Não</option>
                        </select>
                      </td>
                    );
                    else if (col.type === 'list') cell = (
                      <td key={col.id} onClick={ev => ev.stopPropagation()}>
                        <select className="input" disabled={readOnly} style={{ height: 26, fontSize: 11, padding: '0 4px' }}
                          value={cellVal} onChange={ev => handleCellSave(e.id, col.id, ev.target.value)}>
                          <option value="">—</option>
                          {(col.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </td>
                    );
                    else if (col.type === 'currency') cell = (
                      <td key={col.id} onClick={ev => ev.stopPropagation()} className="num" style={{ textAlign: 'right' }}>
                        <EditableCell type="number" value={cellVal} onSave={v => handleCellSave(e.id, col.id, v)}
                          readOnly={readOnly} style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }} />
                      </td>
                    );
                    else if (col.type === 'percent') cell = (
                      <td key={col.id} onClick={ev => ev.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <EditableCell type="number" value={cellVal} onSave={v => handleCellSave(e.id, col.id, v)} readOnly={readOnly} />
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>%</span>
                        </div>
                      </td>
                    );
                    else if (col.type === 'duration') cell = (
                      <td key={col.id} onClick={ev => ev.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <EditableCell type="number" value={cellVal} onSave={v => handleCellSave(e.id, col.id, v)} readOnly={readOnly} />
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>d</span>
                        </div>
                      </td>
                    );
                    else cell = (
                      <td key={col.id} onClick={ev => ev.stopPropagation()}>
                        <EditableCell type={col.type} value={cellVal} onSave={v => handleCellSave(e.id, col.id, v)} readOnly={readOnly} />
                      </td>
                    );
                    return decorateCell(cell, col.id, e.id, e.fmt, rangeEdges.get(e.id + '|' + col.id));
                  })}

                  <td></td>
                </tr>
              );
            })}

            {/* Linhas em branco (estilo Project/Excel): digitar o nome cria a tarefa.
               Só quando editável e sem filtro; caso contrário mostra a mensagem de estado vazio. */}
            {(() => {
              const semFiltro = !busca && !filtroStatus && !filtroResp;
              const visCols = colOrder.filter(c => !hiddenCols.has(c));
              const visCustom = customCols.filter(col => !hiddenCols.has(col.id));
              const blankFrozen = (colId) => ({ position: 'sticky', left: frozenLeft[colId], zIndex: 1, background: 'var(--surface)' });
              if (!readOnly && semFiltro) {
                const nBlanks = Math.max(4, 25 - filtrada.length);
                return Array.from({ length: nBlanks }).map((_, k) => (
                  <tr key={'blank-' + k} className="lista-row-blank" style={{ '--lista-row-h': rowH + 'px' }}>
                    <td style={{ position: 'sticky', left: 0, zIndex: 2, background: 'var(--surface)', width: GUTTER_W, minWidth: GUTTER_W, textAlign: 'center', color: 'var(--text-faint)', fontSize: 11, fontFamily: 'var(--font-mono, monospace)' }}>
                      {filtrada.length + k + 1}
                    </td>
                    {visCols.map(colId => {
                      if (colId === 'etapa') return (
                        <td key="etapa" style={{ ...blankFrozen('etapa'), padding: 0 }}>
                          <input
                            className="lista-blank-input"
                            placeholder={k === 0 ? 'Nova tarefa…' : ''}
                            onKeyDown={(ev) => { if (ev.key === 'Enter') { const v = ev.currentTarget.value; ev.currentTarget.value = ''; createFromBlank(v); } }}
                            onBlur={(ev) => { const v = ev.currentTarget.value; if (v.trim()) { ev.currentTarget.value = ''; createFromBlank(v); } }}
                            style={{ width: '100%', height: '100%', border: 'none', outline: 'none', background: 'transparent', font: 'inherit', fontSize: 13, color: 'var(--text)', padding: '0 10px 0 30px' }}
                          />
                        </td>
                      );
                      if (colId === 'wbs' || colId === 'id') return <td key={colId} style={blankFrozen(colId)} />;
                      return <td key={colId} />;
                    })}
                    {visCustom.map(col => <td key={col.id} />)}
                    <td />
                  </tr>
                ));
              }
              if (filtrada.length === 0) {
                return (
                  <tr>
                    <td colSpan={visCols.length + visCustom.length + 2} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-faint)', fontSize: 13 }}>
                      {visible.length === 0
                        ? 'Nenhuma tarefa cadastrada'
                        : 'Nenhuma tarefa corresponde aos filtros aplicados'}
                    </td>
                  </tr>
                );
              }
              return null;
            })()}
          </tbody>
          <tfoot>
            {(() => {
              // Rodapé alinhado célula-a-célula à ordem/visibilidade atual das colunas.
              const leaves = etapas.filter(x => !x.isGroup);
              const w = (x) => hasVinculos ? (valorVinculadoMap[x.id] || 0) : (x.custo || 0);
              const tp = leaves.reduce((s, x) => s + w(x), 0);
              const totalPct = !tp
                ? (leaves.length ? Math.round(leaves.reduce((s, x) => s + (x.avanco || 0), 0) / leaves.length) : 0)
                : Math.round(leaves.reduce((s, x) => s + (x.avanco || 0) * w(x), 0) / tp);
              const footSaldo = totalCustoEf - totalReal; // usa o mesmo custo efetivo do total (consistente com vínculos)
              const footBg = 'var(--surface-muted)';
              const stick = (cid, extra) => ({ position: 'sticky', left: frozenLeft[cid], background: footBg, zIndex: 1, ...extra });
              const num = { textAlign: 'right', fontWeight: 700, fontSize: 12 };
              const foot = {
                wbs: <td key="wbs" style={stick('wbs')} />,
                id: <td key="id" style={stick('id')} />,
                etapa: <td key="etapa" style={stick('etapa', { fontWeight: 700, fontSize: 12.5, color: 'var(--text)', boxShadow: '1px 0 0 var(--border)' })}>Total do cronograma</td>,
                avanco: <td key="avanco"><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ flex: 1, minWidth: 40 }}><div className="progress"><span style={{ width: totalPct + '%' }} /></div></div><span className="num" style={{ fontWeight: 700, fontSize: 12.5, minWidth: 34, textAlign: 'right' }}>{totalPct}%</span></div></td>,
                peso: <td key="peso" className="num mono" style={num}>100%</td>,
                custo: <td key="custo" className="num mono" style={num}>{fmtBRL(totalCustoEf)}</td>,
                custoReal: <td key="custoReal" className="num mono" style={num}>{fmtBRL(totalReal)}</td>,
                saldo: <td key="saldo" className="num mono" style={{ ...num, color: totalSaldo < 0 ? 'var(--danger)' : 'inherit' }}>{fmtBRL(totalSaldo)}</td>,
              };
              return (
                <tr style={{ fontWeight: 600, borderTop: '2px solid var(--border)', background: footBg, height: 48 }}>
                  <td style={{ position: 'sticky', left: 0, zIndex: 2, background: footBg, width: GUTTER_W, minWidth: GUTTER_W }} />
                  {colOrder.filter(c => !hiddenCols.has(c)).map(c => {
                    const cell = foot[c] || <td key={c} />;
                    if (dragOverCol?.id !== c) return cell;
                    const cls = [cell.props.className, `drag-over-col-${dragOverCol.side}`].filter(Boolean).join(' ');
                    return React.cloneElement(cell, { className: cls });
                  })}
                  {customCols.filter(col => !hiddenCols.has(col.id)).map(col => <td key={col.id} />)}
                  <td />
                </tr>
              );
            })()}
          </tfoot>
        </table>
        {marquee && (
          <div className="copy-marquee" style={{ position: 'absolute', left: marquee.left, top: marquee.top, width: marquee.width, height: marquee.height, pointerEvents: 'none', zIndex: 4 }} />
        )}
      </div>

      {showAddCol && <AddColModal onClose={() => setShowAddCol(false)} onAdd={handleAddCol} />}

      {showRowHDialog && (
        <RowHeightModal
          value={rowHeights[rowHDialogTargets[0]] ?? rowH}
          min={ROW_H_MIN} max={ROW_H_MAX}
          count={rowHDialogTargets.length}
          onApply={(v) => setRowHeights(prev => {
            const next = { ...prev };
            rowHDialogTargets.forEach(id => { next[id] = v; });
            return next;
          })}
          onClose={() => setShowRowHDialog(false)}
        />
      )}

      {/* Modal de confirmação de exclusão */}
      {deleteConfirm && (() => {
        const et = etapas.find(e => e.id === deleteConfirm);
        const childCount = deleteTask(deleteConfirm, etapas).length < etapas.length
          ? etapas.length - deleteTask(deleteConfirm, etapas).length - 1
          : 0;
        return (
          <Modal
            title="Excluir tarefa"
            onClose={() => setDeleteConfirm(null)}
            footer={
              <>
                <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)}>Cancelar</button>
                <button className="btn" style={{ background: 'var(--danger)', color: 'white' }} onClick={confirmDelete}>
                  Excluir{childCount > 0 ? ` (+ ${childCount} subtarefa${childCount > 1 ? 's' : ''})` : ''}
                </button>
              </>
            }
          >
            <p style={{ fontSize: 14, marginBottom: 4 }}>
              Tem certeza que deseja excluir <strong>{et ? et.etapa : deleteConfirm}</strong>?
            </p>
            {childCount > 0 && (
              <p style={{ fontSize: 13, color: 'var(--danger)', marginTop: 8 }}>
                Esta tarefa possui {childCount} subtarefa{childCount > 1 ? 's' : ''} que também serão removida{childCount > 1 ? 's' : ''}.
              </p>
            )}
          </Modal>
        );
      })()}

      {/* Modal de inserção de pavimentos */}
      {showPavimentos && (
        <PavimentosModal
          etapas={etapas}
          customCols={customCols}
          onCommit={onCommit}
          onClose={() => setShowPavimentos(false)}
        />
      )}

      {/* Menu de contexto — botão direito na linha */}
      {ctxMenu?.kind !== 'col' && ctxMenu && !readOnly && (
        <div className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
          <button onClick={() => { insertTask(ctxMenu.taskId, 'above'); setCtxMenu(null); }}>
            ↑ Inserir linha acima
          </button>
          <button onClick={() => { insertTask(ctxMenu.taskId, 'below'); setCtxMenu(null); }}>
            ↓ Inserir linha abaixo
          </button>
          <hr />
          <button onClick={() => {
            const ids = selectedRowIds();
            ids.add(ctxMenu.taskId); // inclui a linha clicada
            setRowHDialogTargets([...ids]);
            setShowRowHDialog(true);
            setCtxMenu(null);
          }}>
            Altura da linha…
          </button>
          <hr />
          <button className="danger" onClick={() => { setDeleteConfirm(ctxMenu.taskId); setCtxMenu(null); }}>
            Excluir tarefa
          </button>
        </div>
      )}

      {/* Menu de contexto — botão direito no cabeçalho de coluna */}
      {ctxMenu?.kind === 'col' && (
        <div className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
          <button onClick={() => { selectColumn(ctxMenu.colId); setCtxMenu(null); }}>
            Selecionar coluna
          </button>
          {!LISTA_FROZEN.includes(ctxMenu.colId) && (
            <button onClick={() => { toggleColVisibility(ctxMenu.colId); setCtxMenu(null); }}>
              Ocultar coluna
            </button>
          )}
          {hiddenCols.size > 0 && (
            <>
              <hr />
              <button onClick={() => { setHiddenCols(new Set()); setCtxMenu(null); }}>
                Reexibir todas
              </button>
            </>
          )}
        </div>
      )}
    </div>
    </>
  );
};

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
async function salvarCronograma(obraId, etapas, customCols, baselines, reprogramacoes) {
  const nowISO = new Date().toISOString();
  const payload = { etapas, custom_cols: customCols, baselines, reprogramacoes, updated_at: nowISO };
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
    .select('etapas, custom_cols, baselines, reprogramacoes, updated_at')
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
