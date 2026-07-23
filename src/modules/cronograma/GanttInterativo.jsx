// GanttInterativo — grade de barras (Gantt) do Cronograma. Extraído de
// Cronograma.jsx (movimento verbatim). Recebe etapas/callbacks via props.

import React from 'react';
import { Icon } from '../../components/Icons';
import { useToast, Modal } from '../../components/Modals';
import { buildCalendarMonths, buildCalendarQuarters, buildCalendarYears,
         buildCalendarWeeks, buildCalendarDays } from './ganttUtils';
import { offsetToDate, offsetToISO, isoToBR, dateToOffset, workEnd, taskEnd } from './cronogramaDateUtils';
import { fmtBRL, computeAllWBS, effStatus, getVisibleEtapas, propagateDrag,
         updateParentBounds, formatDepList, verificarRestricoes, computeGroupValues,
         indentTasks, outdentTasks, createGroup, deleteTask,
         nextEtapaId, nextDisplayId, emptyCustomCols } from './scheduleEngine';
import { PavimentosModal } from './cronogramaModais';
import { useVirtualizer } from '@tanstack/react-virtual';
import { GM_START_YEAR, GM_START_MONTH, GM_TOTAL, GM_DAY_W, GM_BAR_H, GM_ROW_H,
         GM_ROW_ANO, GM_ROW_TRI, GM_ROW_MES, GM_ROW_FINE, ZOOM_PX_DIA, GM_REF_DATE,
         GM_MN, gmCalcToday, gmMonthLabel, gmConflicts, VIRT_MIN } from './cronogramaShared';

export const GanttInterativo = ({ etapas, onCommit, undo, redo, baselineEtapas, obraId, feriadosCfg = { dias: [], sabadoUtil: false }, onTaskSelect, readOnly = false, customCols = [],
  baselines = [], reprogramacoes = [], onCriarBaseline, onGerenciarBaselines, onSalvarRep, onGerenciarReps, onFeriados, onOutlineLevel }) => {
  const toast = useToast();
  const [selected,    setSel]      = React.useState(new Set());
  const [editModeRaw, setEdit]     = React.useState(() => { try { const c = JSON.parse(localStorage.getItem(`gantt_cfg_${obraId}`) || '{}'); return c.editMode   ?? true; } catch { return true; } });
  const editMode = readOnly ? false : editModeRaw;
  const [lockDone,    setLock]     = React.useState(() => { try { const c = JSON.parse(localStorage.getItem(`gantt_cfg_${obraId}`) || '{}'); return c.lockDone   ?? true; } catch { return true; } });
  const [replanAuto,  setReplan]   = React.useState(() => { try { const c = JSON.parse(localStorage.getItem(`gantt_cfg_${obraId}`) || '{}'); return c.replanAuto ?? true; } catch { return true; } });
  const [labelWidth,  setLabelW]   = React.useState(() => { try { const s = localStorage.getItem(`gantt_lw_${obraId}`); return s ? Math.max(150, Math.min(500, parseInt(s, 10))) : 220; } catch { return 220; } });
  const [zoom,        setZoom]     = React.useState('mes');
  const [search]      = React.useState(''); // busca removida do Gantt; mantido p/ matchesSearch (sempre passa)
  const [showBaseline, setShowBaseline] = React.useState(true);   // toggle "Linha de base"
  const [showCritical, setShowCritical] = React.useState(false);  // toggle "Caminho crítico"
  // Faixa (ribbon) em abas — mesma da Lista. Aba compartilha a chave com a Lista.
  const [activeTab, setActiveTab] = React.useState(() => localStorage.getItem('ls_crono_ribbon_tab') || 'tarefa');
  React.useEffect(() => { try { localStorage.setItem('ls_crono_ribbon_tab', activeTab); } catch { /* ignore */ } }, [activeTab]);
  const [ribbonCollapsed, setRibbonCollapsed] = React.useState(() => localStorage.getItem('ls_crono_ribbon_collapsed') === '1');
  React.useEffect(() => { try { localStorage.setItem('ls_crono_ribbon_collapsed', ribbonCollapsed ? '1' : '0'); } catch { /* ignore */ } }, [ribbonCollapsed]);
  const [showPavimentos, setShowPavimentos] = React.useState(false);
  const [deleteConfirm,  setDeleteConfirm]  = React.useState(null); // id do alvo de exclusão
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
  // Índice por id no conjunto VISÍVEL (para as setas de dependência casarem com as barras
  // mesmo com grupos recolhidos — antes usava o índice em `etapas`, um bug latente).
  const visIdx = React.useMemo(() => new Map(visible.map((e, i) => [e.id, i])), [visible]);
  // Virtualização (windowing) das linhas do Gantt — altura uniforme GM_ROW_H.
  // Ativa só acima de VIRT_MIN; abaixo renderiza todas (comportamento atual).
  const rowVirt = useVirtualizer({
    count: visible.length,
    getScrollElement: () => cRef.current,
    estimateSize: () => GM_ROW_H,
    overscan: 24, // buffer maior: rolagem rápida não expõe os spacers (linhas em branco)
    getItemKey: (i) => visible[i]?.id ?? i,
  });
  const virtualize = visible.length > VIRT_MIN;
  const vItems  = rowVirt.getVirtualItems();
  const winRows = virtualize ? vItems.map(vi => [visible[vi.index], vi.index]) : visible.map((e, i) => [e, i]);
  const topPad  = virtualize && vItems.length ? vItems[0].start : 0;
  const botPad  = virtualize && vItems.length ? rowVirt.getTotalSize() - vItems[vItems.length - 1].end : 0;

  const handleToggleCollapse = (id) => {
    const novas = etapas.map(e => e.id === id ? { ...e, collapsed: !e.collapsed } : e);
    onCommit(novas, { silent: true });
  };

  // ── Ações da faixa (mesma lógica da Lista, sobre a seleção em Set) ───────────
  const selIds     = () => [...selected];
  const primaryId  = () => selIds()[0] || null;
  const hasSel     = selected.size > 0;
  const canIndent  = selIds().some(id => etapas.findIndex(e => e.id === id) > 0);
  const canOutdent = selIds().some(id => (etapas.find(e => e.id === id)?.nivel || 0) > 0);

  const handleIndent  = () => { const ids = selIds(); if (ids.length) onCommit(indentTasks(etapas, ids)); };
  const handleOutdent = () => { const ids = selIds(); if (ids.length) onCommit(outdentTasks(etapas, ids)); };
  const handleAddGroup = () => onCommit(createGroup(primaryId(), etapas, customCols), { silent: true });

  // Insere nova tarefa acima/abaixo da referência (porta o helper da Lista).
  const insertTask = (referenceId, position) => {
    const idx = etapas.findIndex(e => e.id === referenceId);
    const ref = idx >= 0 ? etapas[idx] : null;
    const novo = {
      id: nextEtapaId(etapas), displayId: nextDisplayId(etapas), etapa: 'Nova Tarefa',
      nivel: ref ? (ref.nivel || 0) : 0, parentId: ref ? (ref.parentId ?? null) : null,
      isGroup: false, collapsed: false, inicio: ref ? ref.inicio : 0, dur: 1, avanco: 0,
      status: 'upcoming', dep: [], milestone: false, responsavel: '',
      customCols: emptyCustomCols(customCols), custo: 0,
      restricaoTipo: 'asap', restricaoData: '', fator_peso: 1,
    };
    const novas = [...etapas];
    novas.splice(idx < 0 ? etapas.length : (position === 'below' ? idx + 1 : idx), 0, novo);
    onCommit(novas, { silent: true });
    setSel(new Set([novo.id]));
  };

  const handleDelete = () => {
    const alvo = primaryId();
    if (!alvo || readOnly) return;
    if (etapas.some(x => x.parentId === alvo)) { setDeleteConfirm(alvo); return; }
    const novas = deleteTask(alvo, etapas);
    const count = etapas.length - novas.length;
    onCommit(novas, { silent: true });
    setSel(new Set());
    toast(`${count} tarefa${count > 1 ? 's removidas' : ' removida'}`, { tone: 'neutral', icon: 'check' });
  };
  const confirmDelete = () => {
    if (!deleteConfirm) return;
    const novas = deleteTask(deleteConfirm, etapas);
    const count = etapas.length - novas.length;
    onCommit(novas, { silent: true });
    setSel(new Set());
    setDeleteConfirm(null);
    toast(`${count} tarefa${count > 1 ? 's removidas' : ' removida'}`, { tone: 'neutral', icon: 'check' });
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

      {/* ── Faixa (ribbon) em abas — mesma da Lista; travada acima do scroller ── */}
      {(() => {
        const darkToggle = (active) => ({
          fontSize: 12, padding: '4px 12px', height: 32, gap: 6, fontWeight: 600,
          borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
          border: active ? '1px solid #1e293b' : '1px solid var(--border)',
          background: active ? '#1e293b' : 'var(--surface)',
          color: active ? '#fff' : 'var(--text-muted)',
          transition: 'background 0.12s, color 0.12s, border-color 0.12s',
        });
        // ── Estilos da faixa (espelham a Lista) ──────────────────────────────
        const btnBase = { fontSize: 12, padding: '4px 10px', height: 30, gap: 5, display: 'flex', alignItems: 'center' };
        const tglStyle = (on) => ({ ...btnBase, height: 28, padding: '2px 9px', fontWeight: 700, background: on ? 'var(--brand)' : 'var(--surface)', color: on ? '#fff' : 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer' });
        const iconBtn = { ...btnBase, height: 28, width: 30, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer' };
        const cmdBtn = { ...btnBase, height: 28, fontSize: 12, padding: '2px 10px', display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer' };
        const groupBox = { display: 'inline-flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', padding: '4px 6px 2px', flexShrink: 0 };
        const disabledGroup = { ...groupBox, opacity: 0.4, pointerEvents: 'none' };
        const groupContent = { display: 'flex', flexDirection: 'column', gap: 4, flex: 1, justifyContent: 'center', minHeight: 64 };
        const rowStyle = { display: 'flex', alignItems: 'center', gap: 4 };
        const caption = { textAlign: 'center', fontSize: 9.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 3 };
        const tabBtn = (on) => ({ padding: '6px 15px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', border: 'none', background: on ? 'var(--surface)' : 'transparent', color: on ? 'var(--brand)' : 'var(--text-muted)', borderBottom: on ? '2px solid var(--brand)' : '2px solid transparent' });
        const divg = () => <span style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 2px' }} />;
        const tabs = readOnly ? [{ id: 'exibir', label: 'Exibir' }, { id: 'cadastro', label: 'Cadastro' }] : [{ id: 'tarefa', label: 'Tarefa' }, { id: 'inserir', label: 'Inserir' }, { id: 'exibir', label: 'Exibir' }, { id: 'cadastro', label: 'Cadastro' }];
        const curTab = tabs.some(t => t.id === activeTab) ? activeTab : tabs[0].id;
        return (
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        {/* Tira de abas + status + recolher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)', padding: '0 8px' }}>
          {tabs.map(t => (
            <button key={t.id} style={tabBtn(t.id === curTab)} onClick={() => setActiveTab(t.id)}>{t.label}</button>
          ))}
          <div style={{ flex: 1 }} />
          {selected.size > 0 && (
            <span style={{ fontSize: 11.5, color: 'var(--brand)', fontWeight: 600, padding: '3px 10px', background: 'var(--brand-tint)', borderRadius: 20 }}>
              {selected.size} selecionada{selected.size > 1 ? 's' : ''}
            </span>
          )}
          {conflictIds.size > 0 && (
            <span style={{ fontSize: 11.5, color: '#d97706', fontWeight: 600, padding: '3px 10px', background: '#fef3c7', borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 6 }}>
              <Icon name="alert-triangle" size={11} /> Conflito
            </span>
          )}
          <button onClick={() => setRibbonCollapsed(v => !v)} title={ribbonCollapsed ? 'Mostrar menu' : 'Ocultar menu'}
            style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: ribbonCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .12s' }}><polyline points="6 9 12 15 18 9"/></svg>
          </button>
        </div>

        {/* Corpo da faixa */}
        {!ribbonCollapsed && (
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, flexWrap: 'wrap', padding: '6px 8px', minHeight: 62 }}>

            {/* ══ Aba TAREFA ══ */}
            {curTab === 'tarefa' && !readOnly && (
              <>
                {/* Fonte (não se aplica ao Gantt) */}
                <div style={disabledGroup} title="Não disponível no Gantt (as barras não têm células de texto)">
                  <div style={groupContent}>
                    <div style={rowStyle}>
                      <button disabled style={{ ...cmdBtn, height: 26, width: 110, justifyContent: 'space-between' }}>Padrão ▾</button>
                      <button disabled style={{ ...cmdBtn, height: 26, width: 46, justifyContent: 'space-between' }}>11 ▾</button>
                    </div>
                    <div style={rowStyle}>
                      <button disabled style={tglStyle(false)}>N</button>
                      <button disabled style={{ ...tglStyle(false), fontStyle: 'italic' }}>I</button>
                      <button disabled style={{ ...tglStyle(false), textDecoration: 'underline' }}>S</button>
                      {divg()}
                      <button disabled style={{ ...iconBtn, fontWeight: 800 }}>A</button>
                      <button disabled style={iconBtn}><Icon name="edit" size={13} /></button>
                    </div>
                  </div>
                  <div style={caption}>Fonte</div>
                </div>

                {/* Recuo (funcional) */}
                <div style={groupBox}>
                  <div style={{ ...groupContent, justifyContent: 'center' }}>
                    <div style={rowStyle}>
                      <button style={{ ...iconBtn, opacity: canOutdent ? 1 : 0.4 }} onClick={handleOutdent} disabled={!canOutdent}
                        title="Promover — subir um nível hierárquico">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="7 8 3 12 7 16"/><line x1="21" y1="6" x2="11" y2="6"/><line x1="21" y1="12" x2="11" y2="12"/><line x1="21" y1="18" x2="11" y2="18"/></svg>
                      </button>
                      <button style={{ ...iconBtn, opacity: canIndent ? 1 : 0.4 }} onClick={handleIndent} disabled={!canIndent}
                        title="Recuar — tornar subtarefa da linha acima">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 8 7 12 3 16"/><line x1="21" y1="6" x2="11" y2="6"/><line x1="21" y1="12" x2="11" y2="12"/><line x1="21" y1="18" x2="11" y2="18"/></svg>
                      </button>
                    </div>
                  </div>
                  <div style={caption}>Recuo</div>
                </div>

                {/* Formatação (não se aplica ao Gantt) */}
                <div style={disabledGroup} title="Não disponível no Gantt">
                  <div style={{ ...groupContent, justifyContent: 'center' }}>
                    <div style={rowStyle}>
                      <button disabled style={iconBtn}><Icon name="edit" size={14} /></button>
                      <button disabled style={iconBtn}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7V4h16v3"/><path d="M5 20h6"/><path d="M13 4 8 20"/><line x1="15" y1="15" x2="20" y2="20"/><line x1="20" y1="15" x2="15" y2="20"/></svg></button>
                    </div>
                  </div>
                  <div style={caption}>Formatação</div>
                </div>

                {/* Edição (funcional) */}
                <div style={groupBox}>
                  <div style={{ ...groupContent, justifyContent: 'center' }}>
                    <div style={rowStyle}>
                      <button style={{ ...cmdBtn, color: hasSel ? 'var(--danger)' : undefined, opacity: hasSel ? 1 : 0.5 }} onClick={handleDelete} disabled={!hasSel} title="Excluir a tarefa selecionada">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                        Excluir
                      </button>
                      {divg()}
                      <button style={iconBtn} onClick={undo} title="Desfazer (Ctrl+Z)">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M3 13C5.5 8 10 5 15 5c4 0 7 2.5 7 6s-3 6-7 6H12"/></svg>
                      </button>
                      <button style={iconBtn} onClick={redo} title="Refazer (Ctrl+Y)">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"/><path d="M21 13C18.5 8 14 5 9 5c-4 0-7 2.5-7 6s3 6 7 6H12"/></svg>
                      </button>
                    </div>
                  </div>
                  <div style={caption}>Edição</div>
                </div>

                {/* Modo (comportamento de edição do Gantt) */}
                <div style={groupBox}>
                  <div style={groupContent}>
                    <div style={rowStyle}>
                      <button style={tglStyle(editModeRaw)} onClick={() => { const nv = !editModeRaw; saveGanttCfg({ editMode: nv }); setEdit(nv); }}>
                        <Icon name="edit" size={12} />{editModeRaw ? 'Editando' : 'Leitura'}
                      </button>
                      <button style={tglStyle(lockDone)} onClick={() => { const nv = !lockDone; saveGanttCfg({ lockDone: nv }); setLock(nv); }} title="Bloquear edição de tarefas concluídas">
                        <Icon name="shield" size={12} />Concluídas
                      </button>
                    </div>
                    <div style={rowStyle}>
                      <button style={tglStyle(replanAuto)} onClick={() => { const nv = !replanAuto; saveGanttCfg({ replanAuto: nv }); setReplan(nv); }} title="Arrastar uma barra move as sucessoras automaticamente">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                        {replanAuto ? 'Replan. auto' : 'Replan. manual'}
                      </button>
                    </div>
                  </div>
                  <div style={caption}>Modo</div>
                </div>
              </>
            )}

            {/* ══ Aba INSERIR ══ */}
            {curTab === 'inserir' && !readOnly && (
              <>
                <div style={groupBox}>
                  <div style={groupContent}>
                    <div style={rowStyle}>
                      <button style={{ ...cmdBtn, opacity: hasSel ? 1 : 0.5 }} onClick={() => insertTask(primaryId(), 'above')} disabled={!hasSel} title="Inserir linha acima da selecionada">↑ Acima</button>
                      <button style={{ ...cmdBtn, opacity: hasSel ? 1 : 0.5 }} onClick={() => insertTask(primaryId(), 'below')} disabled={!hasSel} title="Inserir linha abaixo da selecionada">↓ Abaixo</button>
                    </div>
                    <div style={rowStyle}>
                      <button style={{ ...cmdBtn, opacity: hasSel ? 1 : 0.5 }} onClick={handleAddGroup} disabled={!hasSel} title="Agrupar a seleção num grupo (resumo)">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                        Grupo
                      </button>
                    </div>
                  </div>
                  <div style={caption}>Tarefas</div>
                </div>

                <div style={groupBox}>
                  <div style={{ ...groupContent, justifyContent: 'center' }}>
                    <div style={rowStyle}>
                      <button style={cmdBtn} onClick={() => setShowPavimentos(true)} title="Inserir pavimentos automaticamente como subtarefas">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="4" rx="1"/><rect x="3" y="17" width="18" height="4" rx="1"/></svg>
                        Pavimentos
                      </button>
                    </div>
                  </div>
                  <div style={caption}>Estrutura</div>
                </div>

                <div style={disabledGroup} title="Não disponível no Gantt">
                  <div style={{ ...groupContent, justifyContent: 'center' }}>
                    <div style={rowStyle}>
                      <button disabled style={cmdBtn}><Icon name="plus" size={13} /> Nova coluna</button>
                    </div>
                  </div>
                  <div style={caption}>Colunas</div>
                </div>
              </>
            )}

            {/* ══ Aba EXIBIR ══ */}
            {curTab === 'exibir' && (
              <>
                {/* Visão — escala de tempo + ajustar */}
                <div style={groupBox}>
                  <div style={{ ...groupContent, justifyContent: 'center' }}>
                    <div style={rowStyle}>
                      <div style={{ display: 'inline-flex', background: 'var(--surface-muted)', border: '1px solid var(--border)', borderRadius: 6, padding: 2, gap: 2 }}>
                        {[{ key: 'dia', label: 'Dia' }, { key: 'semana', label: 'Semana' }, { key: 'mes', label: 'Mês' }, { key: 'trimestre', label: 'Trimestre' }].map(z => (
                          <button key={z.key} onClick={() => setZoom(z.key)}
                            style={{ fontSize: 12, padding: '3px 10px', border: 'none', borderRadius: 5, cursor: 'pointer', fontWeight: zoom === z.key ? 600 : 500, background: zoom === z.key ? 'var(--brand)' : 'transparent', color: zoom === z.key ? '#fff' : 'var(--text-muted)' }}>
                            {z.label}
                          </button>
                        ))}
                      </div>
                      <button style={cmdBtn} onClick={onAjustar} title="Reenquadrar a timeline no período com tarefas">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>
                        Ajustar
                      </button>
                    </div>
                  </div>
                  <div style={caption}>Visão</div>
                </div>

                {/* Realce */}
                <div style={groupBox}>
                  <div style={{ ...groupContent, justifyContent: 'center' }}>
                    <div style={rowStyle}>
                      <button onClick={() => setShowBaseline(v => !v)} style={darkToggle(showBaseline)} title={baselineEtapas ? 'Mostrar/ocultar barras da linha de base' : 'Nenhuma linha de base salva'}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="6" y1="4" x2="6" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="18" y1="4" x2="18" y2="20"/></svg>
                        Linha de base
                      </button>
                      <button onClick={() => setShowCritical(v => !v)} style={darkToggle(showCritical)} title="Destacar a cadeia condutora (caminho crítico)">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l10 10-10 10L2 12z"/></svg>
                        Caminho crítico
                      </button>
                    </div>
                  </div>
                  <div style={caption}>Realce</div>
                </div>

                {/* Colunas (não se aplica ao Gantt) */}
                <div style={disabledGroup} title="Não disponível no Gantt">
                  <div style={{ ...groupContent, justifyContent: 'center' }}>
                    <div style={rowStyle}>
                      <button disabled style={cmdBtn}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
                        Colunas
                      </button>
                    </div>
                  </div>
                  <div style={caption}>Colunas</div>
                </div>

                {/* Exibição / altura (não se aplica ao Gantt) */}
                <div style={disabledGroup} title="Não disponível no Gantt (altura de linha fixa)">
                  <div style={{ ...groupContent, justifyContent: 'center' }}>
                    <div style={rowStyle}>
                      <button disabled style={cmdBtn}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="12" x2="3" y2="12"/><line x1="21" y1="18" x2="3" y2="18"/></svg>
                        Altura da linha
                      </button>
                    </div>
                  </div>
                  <div style={caption}>Exibição</div>
                </div>

                {/* Estrutura de tópicos (expandir/recolher por nível) */}
                <div style={groupBox}>
                  <div style={{ ...groupContent, justifyContent: 'center' }}>
                    <div style={rowStyle}>
                      <select defaultValue="" title="Expandir/recolher a estrutura por nível"
                        onChange={e => { const v = e.target.value; e.target.value = ''; if (v !== '') onOutlineLevel?.(Number(v)); }}
                        style={{ height: 28, fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', padding: '0 6px', cursor: 'pointer' }}>
                        <option value="" disabled>Estrutura…</option>
                        <option value="0">Expandir tudo</option>
                        <option value="1">Recolher tudo</option>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => <option key={n} value={n}>Nível {n}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={caption}>Estrutura</div>
                </div>

                {/* Exportar */}
                <div style={groupBox}>
                  <div style={{ ...groupContent, justifyContent: 'center' }}>
                    <div style={rowStyle}>
                      <button style={cmdBtn} onClick={exportExcelGantt} title="Exportar para Excel (.xlsx)">
                        <Icon name="download" size={13} /> Excel
                      </button>
                      <select value={pdfFormat} onChange={e => setPdfFormat(e.target.value)} title="Formato do PDF"
                        style={{ fontSize: 12, height: 28, padding: '0 4px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}>
                        <option value="a3">A3</option>
                        <option value="a2">A2</option>
                        <option value="a1">A1</option>
                        <option value="a0">A0</option>
                      </select>
                      <button style={cmdBtn} onClick={exportPDFGantt} disabled={exportingPDF} title="Exportar para PDF">
                        <Icon name="download" size={13} /> {exportingPDF ? 'Gerando…' : 'PDF'}
                      </button>
                    </div>
                  </div>
                  <div style={caption}>Exportar</div>
                </div>
              </>
            )}

            {/* ══ Aba CADASTRO ══ */}
            {curTab === 'cadastro' && (
              <>
                {!readOnly && (
                  <div style={groupBox}>
                    <div style={groupContent}>
                      <div style={rowStyle}>
                        <button style={cmdBtn} onClick={onCriarBaseline} title="Salvar o estado atual como linha de base">
                          <Icon name="flag" size={13} /> Criar linha de base
                        </button>
                      </div>
                      <div style={rowStyle}>
                        <button style={{ ...cmdBtn, opacity: baselines.length ? 1 : 0.5 }} disabled={!baselines.length} onClick={onGerenciarBaselines} title="Gerenciar linhas de base">
                          <Icon name="layers" size={13} /> Gerenciar
                        </button>
                      </div>
                    </div>
                    <div style={caption}>Linha de base</div>
                  </div>
                )}
                {!readOnly && (
                  <div style={groupBox}>
                    <div style={groupContent}>
                      <div style={rowStyle}>
                        <button style={cmdBtn} onClick={onSalvarRep} title="Salvar o estado atual como reprogramação">
                          <Icon name="clock" size={13} /> Salvar reprogramação
                        </button>
                      </div>
                      <div style={rowStyle}>
                        <button style={{ ...cmdBtn, opacity: reprogramacoes.length ? 1 : 0.5 }} disabled={!reprogramacoes.length} onClick={onGerenciarReps} title="Gerenciar reprogramações">
                          <Icon name="layers" size={13} /> Gerenciar
                        </button>
                      </div>
                    </div>
                    <div style={caption}>Reprogramação</div>
                  </div>
                )}
                <div style={groupBox}>
                  <div style={{ ...groupContent, justifyContent: 'center' }}>
                    <div style={rowStyle}>
                      <button style={cmdBtn} onClick={onFeriados} title="Cadastrar feriados / dias não trabalhados">
                        <Icon name="calendar" size={13} /> Feriados
                      </button>
                    </div>
                  </div>
                  <div style={caption}>Calendário</div>
                </div>
              </>
            )}

          </div>
        )}
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
          // Viewport de altura limitada: o Gantt ganha scroll vertical próprio (necessário
          // para a virtualização). Tunável conforme a topbar/cabeçalho do card.
          maxHeight: 'calc(100vh - 300px)',
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

          {/* ── Linhas das etapas (virtualizadas acima de VIRT_MIN) ───────── */}
          {topPad > 0 && <div style={{ gridColumn: '1 / -1', height: topPad }} />}
          {winRows.map(([e, i]) => {
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
          {botPad > 0 && <div style={{ gridColumn: '1 / -1', height: botPad }} />}

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
            {visible.map((e, i) =>
              (e.dep || []).map(depObj => {
                const dId  = typeof depObj === 'string' ? depObj : depObj.id;
                const tipo = typeof depObj === 'string' ? 'TI' : (depObj.tipo || 'TI');
                const lag  = typeof depObj === 'string' ? 0 : (depObj.lag || 0);
                const depIdx = visIdx.get(dId);
                if (depIdx === undefined) return null; // predecessor recolhido: sem seta
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

                const fy  = depIdx * GM_ROW_H + GM_ROW_H / 2;
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

      {/* Modal de inserção de pavimentos */}
      {showPavimentos && (
        <PavimentosModal
          etapas={etapas}
          customCols={customCols}
          onCommit={onCommit}
          onClose={() => setShowPavimentos(false)}
        />
      )}

      {/* Confirmação de exclusão (grupo com subtarefas) */}
      {deleteConfirm && (() => {
        const et = etapas.find(e => e.id === deleteConfirm);
        const childCount = deleteTask(deleteConfirm, etapas).length < etapas.length
          ? etapas.length - deleteTask(deleteConfirm, etapas).length - 1
          : 0;
        return (
          <Modal
            title="Excluir tarefa"
            size="sm"
            onClose={() => setDeleteConfirm(null)}
            footer={
              <>
                <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)}>Cancelar</button>
                <button className="btn" style={{ background: 'var(--danger)', color: 'white' }} onClick={confirmDelete}>Excluir</button>
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
    </div>
  );
};
