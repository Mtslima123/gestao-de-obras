// ListaInterativa — grade/tabela editável (EAP) do Cronograma. Extraído de
// Cronograma.jsx (movimento verbatim). Recebe etapas/callbacks via props.

import React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Icon } from '../../components/Icons';
import { AppData } from '../../utils/data';
import { Modal, useToast } from '../../components/Modals';
import { computeValorVinculadoMap } from './ganttUtils';
import { offsetToDate, offsetToISO, isoToBR, dateToOffset, workEnd, workDur, taskEnd } from './cronogramaDateUtils';
import {
  fmtBRL, parseBRL, computeAllWBS, indentTasks, outdentTasks, computeSuccessors,
  effStatus, getVisibleEtapas, nextEtapaId, nextDisplayId, emptyCustomCols,
  createGroup, deleteTask, autoScheduleFromDeps, formatDepList, parseDep,
  computeGroupValues, moveTaskBlock,
} from './scheduleEngine';
import { AddColModal, RowHeightModal, PavimentosModal } from './cronogramaModais';
import {
  EditableCell, ColorMenu, LISTA_COL_DEFS, LISTA_BAND_LABELS, LISTA_DEFAULT_ORDER,
  LISTA_FROZEN, GUTTER_W, ROW_DRAG_COLS, respInitials, respColor, VIRT_MIN,
} from './cronogramaShared';

export const ListaInterativa = ({ etapas, onCommit, customCols, onCustomColsChange, obraId, undo, redo, vinculos = [], orcamentoItensMap = {}, readOnly = false }) => {
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

  // Virtualização (windowing) da Lista — ativa só acima de VIRT_MIN. Abaixo, renderiza
  // todas as linhas (comportamento atual). Altura variável (rowH + overrides por linha)
  // é MEDIDA de verdade via measureElement (o height do <td> funciona como min-height).
  const virtualize = filtrada.length > VIRT_MIN;
  const rowVirt = useVirtualizer({
    count: filtrada.length,
    getScrollElement: () => listaScrollRef.current,
    estimateSize: (i) => rowHeights[filtrada[i]?.id] ?? rowH,
    overscan: 10,
    getItemKey: (i) => filtrada[i]?.id ?? i,
  });
  const vItems  = rowVirt.getVirtualItems();
  const winRows = virtualize ? vItems.map(vi => [filtrada[vi.index], vi.index]) : filtrada.map((e, i) => [e, i]);
  const topPad  = virtualize && vItems.length ? vItems[0].start : 0;
  const botPad  = virtualize && vItems.length ? rowVirt.getTotalSize() - vItems[vItems.length - 1].end : 0;

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
    if (!tr) {
      // Fora da janela virtual: a linha não está no DOM. Rola por índice.
      // 'center' garante que o alvo caia claramente abaixo do cabeçalho fixo
      // (evita parar parcialmente sob o thead sticky).
      const idx = filtrada.findIndex(x => x.id === taskId);
      if (idx >= 0) rowVirt.scrollToIndex(idx, { align: 'center' });
      return;
    }
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
        if (ev.button !== 0) return; // só o clique esquerdo mexe na seleção; o direito abre o menu
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

  // Recuar/Avançar operam sobre TODA a seleção (calha/célula-range, multiSel ou linha única).
  const handleIndent = () => {
    const ids = [...selectedRowIds()];
    if (!ids.length) return;
    onCommit(indentTasks(etapas, ids));
  };

  const handleOutdent = () => {
    const ids = [...selectedRowIds()];
    if (!ids.length) return;
    onCommit(outdentTasks(etapas, ids));
  };

  const selForIndent = selectedRowIds();
  const canIndent  = [...selForIndent].some(id => etapas.findIndex(e => e.id === id) > 0);
  const canOutdent = [...selForIndent].some(id => (etapas.find(e => e.id === id)?.nivel || 0) > 0);

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
  }, [selectedId, multiSel, selectedCell, selAnchor, etapas, readOnly]);

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
            {virtualize && topPad > 0 && (
              <tr aria-hidden="true"><td colSpan={99} style={{ height: topPad, padding: 0, border: 'none' }} /></tr>
            )}
            {winRows.map(([e, rowIdx]) => {
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
                  data-index={rowIdx}
                  ref={virtualize ? rowVirt.measureElement : undefined}
                  className={[
                    isSelected ? 'lista-row-selected' : e.isGroup ? 'lista-row-group' : '',
                    rowIdx % 2 === 1 ? 'lista-row-alt' : '',
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
                    if (ev.button !== 0) return; // direito preserva a seleção (abre o menu)
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
                      if (ev.button !== 0) return; // direito preserva a seleção (abre o menu)
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
            {virtualize && botPad > 0 && (
              <tr aria-hidden="true"><td colSpan={99} style={{ height: botPad, padding: 0, border: 'none' }} /></tr>
            )}

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
            const ids = selectedRowIds(); ids.add(ctxMenu.taskId);
            onCommit(indentTasks(etapas, [...ids])); setCtxMenu(null);
          }}>
            → Recuar (subtarefa)
          </button>
          <button onClick={() => {
            const ids = selectedRowIds(); ids.add(ctxMenu.taskId);
            onCommit(outdentTasks(etapas, [...ids])); setCtxMenu(null);
          }}>
            ← Avançar (promover)
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
