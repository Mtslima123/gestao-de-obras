// ListaInterativa — grade/tabela editável (EAP) do Cronograma. Extraído de
// Cronograma.jsx (movimento verbatim). Recebe etapas/callbacks via props.

import React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Icon } from '../../components/Icons';
import { Modal, useToast } from '../../components/Modals';
import { computeValorVinculadoMap, computeCustoOrcadoMap } from './ganttUtils';
import { offsetToDate, offsetToISO, isoToBR, todayOffset, workEnd, taskEnd, dateToOffset } from './cronogramaDateUtils';
import {
  fmtBRL, computeAllWBS, indentTasks, outdentTasks, computeSuccessors,
  effStatus, getVisibleEtapas, nextEtapaId, nextDisplayId, emptyCustomCols,
  createGroup, deleteTask, autoScheduleFromDeps, formatDepList, parseDep,
  computeGroupValues, moveTaskBlock, RESCHEDULE_FIELDS, applyFieldToEtapa, commitFieldChange,
  reprogramarRestante,
} from './scheduleEngine';
import { AddColModal, RowHeightModal, PavimentosModal, ImportarEAPModal } from './cronogramaModais';
import { TaskFormPanel } from './TaskFormPanel';
import { OrtografiaModal } from './OrtografiaModal';
import { substituirTokens } from './spellcheckPure';
import {
  EditableCell, ColorMenu, LISTA_COL_DEFS, LISTA_BAND_LABELS, LISTA_DEFAULT_ORDER,
  LISTA_FROZEN, GUTTER_W, ROW_DRAG_COLS, VIRT_MIN,
  ColumnHeaderFilterMenu, resolveColType, FILTER_BLANK_KEY,
  buildTaskFilterPredicate, FILTRO_PRESETS, TaskMultiSelectFilter,
} from './cronogramaShared';

// Fallback estável para a prop `hiddenCols` (evita recriar um Set novo a cada render
// quando o componente é usado sem o estado ligado ao Cronograma, ex.: testes isolados).
const EMPTY_HIDDEN_COLS = new Set();

export const ListaInterativa = ({ etapas, onCommit, customCols, onCustomColsChange, hiddenCols = EMPTY_HIDDEN_COLS, onHiddenColsChange, obraId, undo, redo, canUndo = true, canRedo = true, vinculos = [], orcamentoItensMap = {}, readOnly = false, isAdmin = false,
  baselines = [], reprogramacoes = [], onCriarBaseline, onGerenciarBaselines, onSalvarRep, onGerenciarReps, onFeriados, onOutlineLevel, onProjectInfo,
  pavimentosSalvos = [], onPavimentosCriados, onPavimentoExcluir,
  obraNome = 'Projeto', showProjSummary = false, showSummaryTasks = true, onToggleProjSummary, onToggleSummaryTasks,
  filtroResp = '', setFiltroResp,
  filtroPreset = '', setFiltroPreset, filtroPresetRange = { de: '', ate: '' }, setFiltroPresetRange,
  filtroTaskIds = [], setFiltroTaskIds,
  filtroTexto = '', setFiltroTexto, filtroVinculo = '', setFiltroVinculo, vinculadoIds,
  focusTaskId = null }) => {
  const toast = useToast();
  const [selectedId,     setSelectedId]     = React.useState(null);
  const [showTaskForm,   setShowTaskForm]   = React.useState(false); // painel "Formulário de Tarefa" (estilo Project)
  const [showAddCol,     setShowAddCol]     = React.useState(false);
  const [deleteConfirm,  setDeleteConfirm]  = React.useState(null); // array de ids a excluir (ou null)
  const [showPavimentos, setShowPavimentos] = React.useState(false);
  const [showImportEAP, setShowImportEAP] = React.useState(false);
  const [showRowHDialog, setShowRowHDialog] = React.useState(false); // caixa "Altura da linha"
  const [rowHDialogTargets, setRowHDialogTargets] = React.useState([]); // linhas alvo da altura
  const [pendingFontSize, setPendingFontSize] = React.useState(null); // tamanho armado p/ texto novo
  const [pendingFontFamily, setPendingFontFamily] = React.useState(null); // fonte armada p/ texto novo
  // Recolher o ribbon inteiro. Chave nova (não reaproveita 'ls_crono_fmt_collapsed') para
  // começar expandido — senão quem tinha a barra de formatação recolhida abriria com todas as ações ocultas.
  const [ribbonCollapsed, setRibbonCollapsed] = React.useState(() => localStorage.getItem('ls_crono_ribbon_collapsed') === '1');
  React.useEffect(() => {
    try { localStorage.setItem('ls_crono_ribbon_collapsed', ribbonCollapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [ribbonCollapsed]);
  // Aba ativa do menu (ribbon): Tarefa | Inserir | Exibir. Persistida por sessão.
  const [activeTab, setActiveTab] = React.useState(() => localStorage.getItem('ls_crono_ribbon_tab') || 'tarefa');
  React.useEffect(() => {
    try { localStorage.setItem('ls_crono_ribbon_tab', activeTab); } catch { /* ignore */ }
  }, [activeTab]);
  const [multiSel,       setMultiSel]       = React.useState([]);   // seleção ordenada para Ctrl+F2
  const [multiSelCols,   setMultiSelCols]   = React.useState([]);   // colunas selecionadas via Ctrl+clique no cabeçalho
  const [editingCusto,   setEditingCusto]   = React.useState(null); // 'id_custo' | 'id_real'
  const [editingFatorPeso, setEditingFatorPeso] = React.useState(null); // id da tarefa em edição
  const [editingDep,     setEditingDep]     = React.useState(null); // id da tarefa com predecessora em edição
  const [editingSucc,    setEditingSucc]    = React.useState(null); // id da tarefa com sucessora em edição
  const [showLocalizar,  setShowLocalizar]  = React.useState(false); // modal Localizar (Ctrl+L)
  const [showOrtografia, setShowOrtografia] = React.useState(false); // modal Ortografia (F7)
  const [localizarTermo, setLocalizarTermo] = React.useState('');
  const localizarIdxRef = React.useRef(-1);
  const [openModoMenu,   setOpenModoMenu]   = React.useState(null); // id da tarefa com o menu de Modo aberto
  const modoMenuRef = React.useRef(null);
  React.useEffect(() => {
    if (!openModoMenu) return;
    const h = (e) => { if (modoMenuRef.current && !modoMenuRef.current.contains(e.target)) setOpenModoMenu(null); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [openModoMenu]);
  // Linha "Nova tarefa" (k) que está só SELECIONADA (clicou, ainda não digitou nada) —
  // mostra destaque de seleção sem cursor piscando, até a primeira tecla de verdade.
  const [blankSelectedIdx, setBlankSelectedIdx] = React.useState(null);
  const [ctxMenu,        setCtxMenu]        = React.useState(null); // { x, y, taskId }
  const [ctxMenuPos,     setCtxMenuPos]     = React.useState(null); // { left, top } já ajustado pra caber na tela
  const ctxMenuRef = React.useRef(null);
  React.useLayoutEffect(() => {
    if (!ctxMenu) { setCtxMenuPos(null); return; }
    const el = ctxMenuRef.current;
    if (!el) { setCtxMenuPos({ left: ctxMenu.x, top: ctxMenu.y }); return; }
    const rect = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(ctxMenu.x, window.innerWidth - rect.width - 8));
    const top  = Math.max(8, Math.min(ctxMenu.y, window.innerHeight - rect.height - 8));
    setCtxMenuPos({ left, top });
  }, [ctxMenu]);
  // Submenu-flyout "Colar" (colar especial) do menu de contexto: fecha junto com o menu pai
  // e recalcula o lado (direita/esquerda) para não estourar a borda da janela. Estado
  // pasteFlyoutOpen/pasteFlyoutCloseTimer só é declarado mais abaixo (perto do clipboard
  // interno) — os efeitos que os usam ficam depois dessa declaração, ver mais abaixo.
  const pasteSubmenuRef = React.useRef(null);
  const [pasteSubmenuFlip, setPasteSubmenuFlip] = React.useState(false);
  const [dragOverId,     setDragOverId]     = React.useState(null);
  const [showColPanel,   setShowColPanel]   = React.useState(false);
  const [selectedCell,   setSelectedCell]   = React.useState(null); // { taskId, colId } — foco ativo (planilha)
  const [selAnchor,      setSelAnchor]      = React.useState(null); // { taskId, colId } — âncora do intervalo
  const [marquee,        setMarquee]        = React.useState(null); // retângulo "marching ants" da cópia
  const [painterOn,      setPainterOn]      = React.useState(false); // pincel de formatação ativo
  const painterRef = React.useRef(null); // fmt capturado pelo pincel
  const isSelectingRef = React.useRef(false); // arraste de seleção de intervalo em andamento
  const blankFirstRef = React.useRef(null);   // input da 1ª linha em branco
  const blankFocusPending = React.useRef(false); // após criar da linha em branco, foca a linha abaixo (blank-0)
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
      // getBoundingClientRect dá altura fracionária real; Math.ceil garante inteiro >= real
      // (offsetHeight arredondava e abria a fresta por onde o corpo aparecia rolando).
      const h = Math.ceil(bandRowRef.current.getBoundingClientRect().height);
      if (h && h !== bandH) setBandH(h);
    }
  }); // sem deps: mede após cada render (leitura barata; auto-estabiliza pelo guard acima)
  // Onde a linha de nomes gruda: 1px acima de bandH para sobrepor a banda e cobrir a costura.
  const bandTop = Math.max(0, bandH - 1);

  // Fixa o bloco (formatação+banda+cabeçalho+tabela) sob a topbar ao rolar a página.
  // sticky não serve aqui (o card é o último elemento e preenche a viewport), então
  // usamos um sentinela + position:fixed via JS. `listaPinned` = null (fluxo normal) ou
  // { left, width } (fixado). Um espaçador preserva a altura para não haver salto.
  const listaSentinelRef = React.useRef(null);
  const [listaPinned, setListaPinned] = React.useState(null);
  // Offset do topo do card no documento (topbar + abas + ribbon acima dele). Usado para a
  // altura do card caber na viewport sem estourar a página (barra de rolagem interna própria).
  const [listaDocTop, setListaDocTop] = React.useState(null);
  React.useEffect(() => {
    let raf = 0;
    const check = () => {
      raf = 0;
      const s = listaSentinelRef.current;
      if (!s) return;
      const r = s.getBoundingClientRect();
      const dt = Math.round(r.top + window.scrollY);
      setListaDocTop(prev => (prev === dt ? prev : dt));
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
  const rowClickHandledRef = React.useRef(false); // mousedown de célula/calha já tratou a seleção deste clique
  const colPanelRef  = React.useRef(null);
  const cellClipRef  = React.useRef(null); // clipboard interno de célula { value, kind, fmt }
  const rowClipRef   = React.useRef(null); // clipboard interno de LINHA (clone da tarefa copiada)
  // Recorte pendente (Ctrl+X): { type: 'cell', cellList } ou { type: 'row', ids }. Consumido no
  // próximo colar bem-sucedido (limpa a origem); zerado por uma nova cópia/recorte ou Escape.
  const cutPendingRef = React.useRef(null);
  const [pasteFlyoutOpen, setPasteFlyoutOpen] = React.useState(false); // submenu "Colar" do menu de contexto
  const pasteFlyoutCloseTimer = React.useRef(null);
  // Fecha o submenu junto com o menu de contexto pai e recalcula o lado (direita/esquerda,
  // via pasteSubmenuFlip lá em cima) para não estourar a borda da janela.
  React.useEffect(() => { if (!ctxMenu) setPasteFlyoutOpen(false); }, [ctxMenu]);
  React.useLayoutEffect(() => {
    if (!pasteFlyoutOpen) { setPasteSubmenuFlip(false); return; }
    const el = pasteSubmenuRef.current;
    if (!el) return;
    setPasteSubmenuFlip(el.getBoundingClientRect().right > window.innerWidth - 8);
  }, [pasteFlyoutOpen]);
  const listaScrollRef = React.useRef(null); // container rolável da lista (foco p/ navegação por setas)

  // Altura das linhas da lista (ajustável na UI, estilo MS Project), persistida no navegador.
  const ROW_H_MIN = 20, ROW_H_MAX = 120;
  // Chave versionada (_v2): o padrão passou de 34 para 21px; a chave antiga já tinha 34
  // gravado no 1º render de todos, então bumpar a chave faz todos caírem no novo padrão.
  const [rowH, setRowH] = React.useState(() => {
    const v = parseInt(localStorage.getItem('ls_crono_row_h_v2') || '', 10);
    return Number.isFinite(v) ? Math.min(ROW_H_MAX, Math.max(ROW_H_MIN, v)) : 21;
  });
  React.useEffect(() => {
    try { localStorage.setItem('ls_crono_row_h_v2', String(rowH)); } catch { /* ignore */ }
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
  // Sugestões (datalist) das colunas "Lista com sugestão automática": valores já digitados em
  // qualquer linha da mesma coluna, sem restringir a digitação a essa lista (livre, não fixa).
  const autocompleteOptionsByCol = React.useMemo(() => {
    const out = {};
    customCols.filter(c => c.type === 'autocomplete').forEach(c => {
      out[c.id] = [...new Set(etapas.map(e => (e.customCols || {})[c.id]).filter(Boolean))];
    });
    return out;
  }, [etapas, customCols]);
  // Sugestões da coluna "Pavimento": primeiro os pavimentos pré-cadastrados (cadastro da obra),
  // depois os valores já digitados nas etapas. Continua aceitando texto livre.
  const pavimentoOptions = React.useMemo(
    () => [...new Set([...pavimentosSalvos, ...etapas.map(e => e.pavimento).filter(Boolean)])],
    [pavimentosSalvos, etapas]
  );
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
  // Custo Orçado (novo peso do Avanço Físico): Valor Vinculado + Custo Real de cada
  // etapa, somados sempre. Cobre folhas e grupos via bubble-up.
  const custoOrcadoMap = React.useMemo(
    () => computeCustoOrcadoMap(etapas, valorVinculadoMap),
    [etapas, valorVinculadoMap]
  );
  const totalCustoOrcado = totalValorVinculado + totalReal;
  const groupVals   = React.useMemo(() => computeGroupValues(etapas, custoOrcadoMap), [etapas, custoOrcadoMap]);

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
  // Sanitiza a ordem salva: remove colunas que não existem mais (ex.: "saldo" removida)
  // para não gerar célula sem cabeçalho em quem já tinha a ordem no localStorage.
  React.useEffect(() => {
    setColOrder(prev => {
      const valid = prev.filter(c => LISTA_COL_DEFS[c] || customCols.some(cc => cc.id === c));
      return valid.length === prev.length ? prev : valid;
    });
  }, [customCols]);
  const [colWidths, setColWidths] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem(`ls_widths_${obraId}`) || 'null') || {}; }
    catch { return {}; }
  });
  // Filtro por coluna (seta do cabeçalho, estilo Project): { [colId]: { excluded: string[] } }.
  // A presença da chave indica filtro ativo; 'excluded' guarda os valores DESMARCADOS.
  const [columnFilters, setColumnFilters] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem(`ls_filters_${obraId}`) || 'null') || {}; }
    catch { return {}; }
  });
  // Ordenação por coluna (seta do cabeçalho): um único critério ativo por vez, como no Project.
  const [sortSpec, setSortSpec] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem(`ls_sort_${obraId}`) || 'null'); }
    catch { return null; }
  });

  // Valor bruto ("raw", para ordenar/comparar) + rótulo exibido ("label", para filtrar) de
  // uma coluna — mesma resolução usada nas células interativas e nos exports, reaproveitada
  // pelo menu de ordenar/filtrar do cabeçalho (seta estilo Project).
  const colFilterValue = React.useCallback((e, colId) => {
    const gv  = e.isGroup ? groupVals[e.id] : null;
    const ini = gv ? gv.inicio : e.inicio;
    const dur = gv ? gv.dur    : e.dur;
    const realCst = e.isGroup
      ? etapas.filter(c => c.parentId === e.id).reduce((s, c) => s + (c.custoRealizado || 0), 0)
      : (e.custoRealizado || 0);
    switch (colId) {
      case 'wbs':   { const v = wbsMap[e.id] || ''; return { raw: v, label: v }; }
      case 'id':    { const v = String(e.displayId ?? e.id); return { raw: v, label: v }; }
      case 'etapa': return { raw: e.etapa || '', label: e.etapa || '' };
      case 'modo':  { const v = e.isGroup ? '' : (e.modo === 'manual' ? 'Manual' : 'Automático'); return { raw: v, label: v }; }
      case 'inicio': { const d = offsetToDate(ini); return { raw: d, label: isoToBR(offsetToISO(ini)) }; }
      case 'fim':    { const d = offsetToDate(ini + dur); return { raw: d, label: isoToBR(offsetToISO(ini + dur)) }; }
      case 'restricao': return e.restricaoData
        ? { raw: offsetToDate(dateToOffset(e.restricaoData)), label: isoToBR(e.restricaoData) }
        : { raw: null, label: '' };
      case 'duracao': return { raw: dur, label: `${dur}d` };
      case 'avanco':  { const v = gv ? gv.avanco : e.avanco; return { raw: v, label: `${v}%` }; }
      case 'status':  { const v = e.isGroup ? '' : (effStatus(e) === 'done' ? 'Concluída' : effStatus(e) === 'late' ? 'Atrasada' : 'Futura'); return { raw: v, label: v }; }
      case 'peso': {
        if (e.isGroup) return { raw: null, label: '' };
        const pct = totalCustoOrcado > 0 ? (custoOrcadoMap[e.id] || 0) / totalCustoOrcado : 0;
        return { raw: pct * 100, label: (pct * 100).toFixed(1) + '%' };
      }
      case 'fatorPeso': { const v = e.isGroup ? null : (e.fator_peso ?? 1); return { raw: v, label: v == null ? '' : v.toLocaleString('pt-BR') }; }
      case 'valorVinculado': { const v = valorVinculadoMap[e.id]; return { raw: v || null, label: v ? fmtBRL(v) : '' }; }
      case 'custo':     { const v = custoEf(e, gv); return { raw: v, label: fmtBRL(v) }; }
      case 'custoReal': return { raw: realCst, label: fmtBRL(realCst) };
      case 'custoOrcado': { const v = custoOrcadoMap[e.id] || 0; return { raw: v, label: fmtBRL(v) }; }
      case 'saldo':     { const v = custoEf(e, gv) - realCst; return { raw: v, label: fmtBRL(v) }; }
      case 'dep':  { const v = e.isGroup ? '' : formatDepList(e.dep, etapas); return { raw: v, label: v === '—' ? '' : v }; }
      case 'succ': { const v = e.isGroup ? '' : (succMap[e.id] || []).map(id => idToDisplayId[id] ?? id).join('; '); return { raw: v, label: v }; }
      case 'resp': { const v = e.isGroup ? '' : (e.responsavel || ''); return { raw: v, label: v }; }
      case 'pavimento': { const v = e.isGroup ? '' : (e.pavimento || ''); return { raw: v, label: v }; }
      case 'participa': { if (e.isGroup) return { raw: null, label: '' }; const v = e.showInDist ? 'Sim' : 'Não'; return { raw: v, label: v }; }
      default: {
        const cc = customCols.find(c => c.id === colId);
        const raw = (e.customCols || {})[colId] ?? '';
        if (!cc) return { raw, label: String(raw) };
        if (cc.type === 'boolean') { const v = raw === 'sim' ? 'Sim' : raw === 'não' ? 'Não' : ''; return { raw: v, label: v }; }
        if (cc.type === 'date') return raw ? { raw: offsetToDate(dateToOffset(raw)), label: isoToBR(raw) } : { raw: null, label: '' };
        if (cc.type === 'currency' || cc.type === 'number') { const n = Number(raw); return { raw: Number.isFinite(n) ? n : null, label: raw === '' ? '' : String(raw) }; }
        if (cc.type === 'percent')  { const n = Number(raw); return { raw: Number.isFinite(n) ? n : null, label: raw === '' ? '' : `${raw}%` }; }
        if (cc.type === 'duration') { const n = Number(raw); return { raw: Number.isFinite(n) ? n : null, label: raw === '' ? '' : `${raw}d` }; }
        return { raw, label: String(raw) };
      }
    }
  }, [groupVals, etapas, wbsMap, hasVinculos, totalValorVinculado, totalCusto, valorVinculadoMap, custoOrcadoMap, totalCustoOrcado, succMap, idToDisplayId, customCols]);

  const filterKeyOf = React.useCallback((colId, e) => {
    const type = resolveColType(colId, customCols);
    const { raw, label } = colFilterValue(e, colId);
    if (type === 'date') return raw ? `${raw.getFullYear()}-${raw.getMonth() + 1}-${raw.getDate()}` : FILTER_BLANK_KEY;
    return (label === '' || label == null) ? FILTER_BLANK_KEY : label;
  }, [colFilterValue, customCols]);

  const passesColumnFilters = React.useCallback((e) =>
    Object.entries(columnFilters).every(([colId, f]) =>
      !f?.excluded?.length || !f.excluded.includes(filterKeyOf(colId, e))),
  [columnFilters, filterKeyOf]);

  // Comparador por tipo resolvido — em branco sempre por último, nas duas direções.
  const compareByType = (type) => (a, b) => {
    const aNull = a === null || a === undefined || a === '';
    const bNull = b === null || b === undefined || b === '';
    if (aNull && bNull) return 0;
    if (aNull) return 1;
    if (bNull) return -1;
    if (type === 'date')   return a.getTime() - b.getTime();
    if (type === 'number') return a - b;
    return String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' });
  };

  // Ordena só os IRMÃOS dentro de cada grupo-pai, preservando a estrutura EAP — nunca achata
  // a hierarquia. Um grupo cujo pai foi filtrado vira uma "raiz" pseudo, junto com as raízes reais.
  const applySiblingSort = (rows, spec) => {
    if (!spec || rows.length < 2) return rows;
    const cmp = compareByType(resolveColType(spec.colId, customCols));
    const present = new Set(rows.map(r => r.id));
    const byParent = new Map();
    rows.forEach(r => {
      const key = (r.parentId && present.has(r.parentId)) ? r.parentId : '__root__';
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(r);
    });
    const sortSiblings = (arr) => arr
      .map((r, i) => ({ r, i, raw: colFilterValue(r, spec.colId).raw }))
      .sort((a, b) => {
        const c = cmp(a.raw, b.raw);
        const bothReal = a.raw != null && a.raw !== '' && b.raw != null && b.raw !== '';
        const signed = bothReal && spec.dir === 'desc' ? -c : c;
        return signed !== 0 ? signed : a.i - b.i;
      })
      .map(x => x.r);
    const out = [];
    const visit = (key) => sortSiblings(byParent.get(key) || []).forEach(r => {
      out.push(r);
      if (byParent.has(r.id)) visit(r.id);
    });
    visit('__root__');
    return out;
  };

  // Valores distintos elegíveis para o menu de uma coluna, considerando os OUTROS filtros já
  // ativos (cross-filter, estilo Excel) — assim a lista não mostra opção que já daria zero linhas.
  const buildDomainEntries = React.useCallback((colId) => {
    const rest = Object.fromEntries(Object.entries(columnFilters).filter(([cid]) => cid !== colId));
    const passesGlobal = buildTaskFilterPredicate({ filtroResp, filtroPreset, filtroPresetRange, filtroTaskIds, filtroTexto, filtroVinculo, vinculadoIds, etapas });
    const rows = visible.filter(e =>
      (showSummaryTasks || !e.isGroup) &&
      passesGlobal(e) &&
      Object.entries(rest).every(([cid, f]) => !f?.excluded?.length || !f.excluded.includes(filterKeyOf(cid, e)))
    );
    return rows.map(e => colFilterValue(e, colId));
  }, [columnFilters, visible, showSummaryTasks, filtroResp, filtroPreset, filtroPresetRange, filtroTaskIds, filtroTexto, filtroVinculo, vinculadoIds, etapas, filterKeyOf, colFilterValue]);

  const dragColRef = React.useRef(null);
  const [dragOverCol, setDragOverCol] = React.useState(null); // { id, side: 'before' | 'after' }
  const listaRef   = React.useRef(null);
  const [exportingPDF, setExportingPDF] = React.useState(false);
  const [pdfFormat, setPdfFormat] = React.useState('a3');

  React.useEffect(() => {
    if (obraId) localStorage.setItem(`ls_cols_${obraId}`, JSON.stringify(colOrder));
  }, [colOrder, obraId]);
  React.useEffect(() => {
    if (obraId) localStorage.setItem(`ls_widths_${obraId}`, JSON.stringify(colWidths));
  }, [colWidths, obraId]);
  React.useEffect(() => {
    if (obraId) localStorage.setItem(`ls_filters_${obraId}`, JSON.stringify(columnFilters));
  }, [columnFilters, obraId]);
  React.useEffect(() => {
    if (obraId) localStorage.setItem(`ls_sort_${obraId}`, JSON.stringify(sortSpec));
  }, [sortSpec, obraId]);

  const toggleColVisibility = (colId) => {
    onHiddenColsChange(prev => {
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
  // Arraste da borda inferior da calha (estilo Excel): redimensiona a altura só desta linha.
  const startRowResize = (ev, taskId) => {
    ev.preventDefault(); ev.stopPropagation();
    const startY = ev.clientY;
    const startH = rowHeights[taskId] ?? rowH;
    const onMove = (e2) => setRowHeights(prev => ({ ...prev, [taskId]: Math.min(ROW_H_MAX, Math.max(ROW_H_MIN, startH + e2.clientY - startY)) }));
    const onUp   = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };
  // Duplo clique na borda da coluna (estilo Excel): ajusta a largura ao maior conteúdo
  // visível, medindo o texto num <canvas> fora da tela — colFilterValue já resolve o
  // rótulo de exibição de QUALQUER coluna (padrão ou personalizada).
  const autoFitColumn = (colId) => {
    const col = LISTA_COL_DEFS[colId];
    const cc = customCols.find(c => c.id === colId);
    const label = col?.label || cc?.label || '';
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const fontFamily = getComputedStyle(document.body).fontFamily || 'sans-serif';
    ctx.font = `700 10.5px ${fontFamily}`;
    let max = ctx.measureText(label.toUpperCase()).width + 30; // espaço da seta/redimensionar do cabeçalho
    filtrada.forEach(e => {
      const text = String(colFilterValue(e, colId)?.label ?? '');
      // A coluna TAREFA tem indentação da árvore (10 + nível*20) + o botão de recolher (20px),
      // que precisam entrar na largura, senão os nomes ficam cortados. Fonte maior/negrito no grupo.
      let lead = 0;
      if (colId === 'etapa') {
        lead = 30 + (e.nivel || 0) * 20;
        ctx.font = e.isGroup ? `700 12px ${fontFamily}` : `400 11px ${fontFamily}`;
      } else {
        ctx.font = `11px ${fontFamily}`;
      }
      const w = lead + ctx.measureText(text).width;
      if (w > max) max = w;
    });
    setColWidths(prev => ({ ...prev, [colId]: Math.max(50, Math.ceil(max) + 24) }));
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
        title={col.label}
        className={dragOverCol?.id === colId ? `drag-over-col-${dragOverCol.side}` : undefined}
        style={{
          width: w, minWidth: w,
          position: 'sticky', top: bandTop, zIndex: isFrozen ? 6 : 3,
          ...(isFrozen ? { left: frozenLeft[colId] } : {}),
          cursor: !isFrozen ? 'grab' : undefined,
          userSelect: 'none',
          textAlign: 'left',
          // Faixa opaca 1px abaixo do cabeçalho: veda a costura sub-pixel por onde o corpo aparecia rolando.
          boxShadow: '0 1px 0 0 var(--brand)',
          ...(multiSelCols.includes(colId) ? { background: 'color-mix(in srgb, white 22%, var(--brand))' } : {}),
        }}
        draggable={!isFrozen}
        onClick={(ev) => { if (ev.target.closest('[data-colmenu]')) return; selectColumn(colId, ev); }}
        onContextMenu={(ev) => { if (ev.target.closest('[data-colmenu]')) return; ev.preventDefault(); setCtxMenu({ x: ev.clientX, y: ev.clientY, kind: 'col', colId }); }}
        onDragStart={!isFrozen ? (ev) => { if (ev.target.closest('[data-colmenu]')) { ev.preventDefault(); return; } onColDragStart(ev, colId); } : undefined}
        onDragOver={!isFrozen ? (ev) => onColDragOver(ev, colId) : undefined}
        onDragLeave={!isFrozen ? () => setDragOverCol(prev => prev?.id === colId ? null : prev) : undefined}
        onDragEnd={!isFrozen ? () => { dragColRef.current = null; setDragOverCol(null); } : undefined}
        onDrop={!isFrozen ? (ev) => onColDrop(ev, colId) : undefined}
      >
        <span style={{ display: 'block', paddingRight: 24, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.label}</span>
        <span data-colmenu
          style={{ position: 'absolute', right: 4, top: 0, bottom: 0, zIndex: 4, display: 'flex', alignItems: 'center', paddingLeft: 2, background: 'var(--brand)' }}>
          <ColumnHeaderFilterMenu
            label={col.label}
            type={resolveColType(colId, customCols)}
            activeFilter={columnFilters[colId] || null}
            sortDir={sortSpec?.colId === colId ? sortSpec.dir : null}
            onSort={(dir) => setSortSpec({ colId, dir })}
            onApplyFilter={(excluded) => setColumnFilters(prev => {
              if (!excluded.length) { const n = { ...prev }; delete n[colId]; return n; }
              return { ...prev, [colId]: { excluded } };
            })}
            onClearFilter={() => setColumnFilters(prev => { const n = { ...prev }; delete n[colId]; return n; })}
            getDomainEntries={() => buildDomainEntries(colId)}
          />
        </span>
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 5, cursor: 'col-resize', zIndex: 5 }}
          draggable={false} onClick={(ev) => ev.stopPropagation()} onMouseDown={(ev) => { ev.stopPropagation(); startColResize(ev, colId); }}
          onDoubleClick={(ev) => { ev.stopPropagation(); autoFitColumn(colId); }} />
      </th>
    );
  };

  // Aplica filtros sobre as linhas visíveis
  const filtrada = React.useMemo(() => {
    const passesGlobal = buildTaskFilterPredicate({ filtroResp, filtroPreset, filtroPresetRange, filtroTaskIds, filtroTexto, filtroVinculo, vinculadoIds, etapas });
    const base = visible.filter(e =>
      (showSummaryTasks || !e.isGroup) &&
      passesGlobal(e) &&
      passesColumnFilters(e)
    );
    return applySiblingSort(base, sortSpec);
  }, [visible, filtroResp, filtroPreset, filtroPresetRange, filtroTaskIds, filtroTexto, filtroVinculo, vinculadoIds, etapas, showSummaryTasks, columnFilters, sortSpec, passesColumnFilters]); // eslint-disable-line react-hooks/exhaustive-deps

  // Virtualização (windowing) da Lista — ativa só acima de VIRT_MIN. Abaixo, renderiza
  // todas as linhas (comportamento atual). Altura variável (rowH + overrides por linha)
  // é MEDIDA de verdade via measureElement (o height do <td> funciona como min-height).
  const virtualize = filtrada.length > VIRT_MIN;
  const rowVirt = useVirtualizer({
    count: filtrada.length,
    getScrollElement: () => listaScrollRef.current,
    estimateSize: (i) => rowHeights[filtrada[i]?.id] ?? rowH,
    overscan: 24, // buffer maior: rolagem rápida (inércia) não expõe as linhas de spacer (em branco)
    getItemKey: (i) => filtrada[i]?.id ?? i,
  });
  const vItems  = rowVirt.getVirtualItems();
  // Rede de segurança: se a janela virtual ficar vazia por um instante (relayout ao editar/
  // confirmar ou ao fixar o card), renderiza a lista inteira neste frame para nunca ficar em
  // branco nem perder a marcação da célula; measureElement repovoa a janela no frame seguinte.
  const winRows = !virtualize
    ? filtrada.map((e, i) => [e, i])
    : (vItems.length ? vItems.map(vi => [filtrada[vi.index], vi.index]) : filtrada.map((e, i) => [e, i]));
  const topPad  = virtualize && vItems.length ? vItems[0].start : 0;
  const botPad  = virtualize && vItems.length ? rowVirt.getTotalSize() - vItems[vItems.length - 1].end : 0;
  // Conjunto de ids que são pai de alguém — evita o scan O(n) por linha (etapas.some(...))
  // dentro do render de cada linha, que alonga o commit e piora o branco na rolagem rápida.
  const parentIdSet = React.useMemo(
    () => new Set(etapas.map(e => e.parentId).filter(Boolean)),
    [etapas]
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
    restricao: { kind: 'date',   get: e => e.restricaoData || '',            field: 'restricao' },
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
    cutPendingRef.current = null; // uma cópia nova cancela um recorte pendente (mesma regra do Excel)
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
  // mode: 'all' (padrão, valores+formatação) | 'values' (só valores) | 'format' (só formatação) —
  // usado pelo submenu "Colar" (colar especial) do menu de contexto.
  const pasteCell = (mode = 'all') => {
    if (readOnly || !selectedCell) return;
    const clip = cellClipRef.current;
    if (!clip || !clip.grid) return;
    const rows = filtrada.map(x => x.id);
    const cols = visibleColIds();
    const r0 = rows.indexOf(selectedCell.taskId);
    const c0 = cols.indexOf(selectedCell.colId);
    if (r0 < 0 || c0 < 0) return;
    const edits = [];
    const destKeys = new Set();
    clip.grid.forEach((gr, dr) => {
      const taskId = rows[r0 + dr];
      if (!taskId) return;
      gr.forEach((cellData, dc) => {
        const colId = cols[c0 + dc];
        if (!colId) return;
        destKeys.add(`${taskId}|${colId}`);
        const spec = cellSpec(colId);
        const compat = spec && cellData.value != null && (spec.kind === 'text' || cellData.kind == null || cellData.kind === spec.kind);
        edits.push({
          taskId, colId,
          ...(mode !== 'format' && compat ? { field: spec.field, rawValue: cellData.value } : {}),
          ...(mode !== 'values' ? { fmt: cellData.fmt || null } : {}), // cola a formatação da origem (limpa se origem não tinha)
        });
      });
    });
    // Recorte pendente (Ctrl+X): limpa as células de origem no MESMO commit, exceto as que
    // coincidem com o destino colado (evita apagar o que acabou de colar quando as duas áreas
    // se sobrepõem).
    if (cutPendingRef.current?.type === 'cell') {
      cutPendingRef.current.cellList.forEach(({ taskId, colId }) => {
        if (destKeys.has(`${taskId}|${colId}`)) return;
        const spec = cellSpec(colId);
        if (!spec) return;
        edits.push({ taskId, colId, field: spec.field, rawValue: '', fmt: null });
      });
      cutPendingRef.current = null;
    }
    applyBlockEdits(edits);
  };
  // Fábrica de tarefa-folha com valores padrão — usada sempre que colar precisa CRIAR uma
  // tarefa nova (grade vazia, ou colar ultrapassando o fim da lista). `base` é o array de
  // tarefas já existente + as já criadas nesta mesma operação, pra id/displayId não colidirem.
  const newLeafTask = (base, etapa) => ({
    id: nextEtapaId(base), displayId: nextDisplayId(base), etapa,
    nivel: 0, parentId: null, isGroup: false, collapsed: false,
    inicio: todayOffset(), dur: 1, avanco: 0, status: 'upcoming',
    dep: [], milestone: false, responsavel: '',
    customCols: emptyCustomCols(customCols), custo: 0,
    restricaoTipo: 'asap', restricaoData: '', fator_peso: 1, modo: 'auto',
  });
  // Cola texto vindo de FORA do app (Excel, outro programa etc.) — sem formatação,
  // só valores. Mesma estrutura de pasteCell(), lendo de um texto TSV em vez de cellClipRef.
  // Linhas coladas que ultrapassam o fim da lista viram tarefas NOVAS (em vez de descartadas).
  const pasteExternalText = (text) => {
    if (readOnly || !selectedCell) return;
    const rows = filtrada.map(x => x.id);
    const cols = visibleColIds();
    const r0 = rows.indexOf(selectedCell.taskId);
    const c0 = cols.indexOf(selectedCell.colId);
    if (r0 < 0 || c0 < 0) return;
    const grid = text.replace(/\r/g, '').split('\n').map(line => line.split('\t'));
    const etapaDc = cols.indexOf('etapa') - c0; // posição de 'etapa' dentro da linha colada, se houver
    const edits = [];
    const novos = [];
    grid.forEach((gr, dr) => {
      const taskId = rows[r0 + dr];
      if (taskId) {
        gr.forEach((val, dc) => {
          const colId = cols[c0 + dc];
          if (!colId) return;
          const spec = cellSpec(colId);
          if (!spec) return;
          edits.push({ taskId, colId, field: spec.field, rawValue: val });
        });
        return;
      }
      // Ultrapassou as tarefas existentes: cria uma tarefa nova pra essa linha colada,
      // em vez de descartar a informação.
      const nome = (etapaDc >= 0 && etapaDc < gr.length ? gr[etapaDc] : '').trim();
      let novo = newLeafTask([...etapas, ...novos], nome);
      gr.forEach((val, dc) => {
        const colId = cols[c0 + dc];
        if (!colId || colId === 'etapa') return; // etapa já tratado acima
        const spec = cellSpec(colId);
        if (!spec || !spec.field) return;
        novo = applyFieldToEtapa(novo, spec.field, val, [...etapas, ...novos]);
      });
      novos.push(novo);
    });
    if (!edits.length && !novos.length) return;
    // Edições em tarefas existentes + tarefas novas, num único commit (dois onCommit
    // seguidos se sobrescreveriam, já que `etapas` só atualiza no próximo render).
    const byTask = new Map();
    edits.forEach(ed => { if (!byTask.has(ed.taskId)) byTask.set(ed.taskId, []); byTask.get(ed.taskId).push(ed); });
    let reschedule = false;
    const editadas = etapas.map(e => {
      const list = byTask.get(e.id);
      if (!list) return e;
      let ne = e;
      list.forEach(ed => {
        ne = applyFieldToEtapa(ne, ed.field, ed.rawValue, etapas);
        if (RESCHEDULE_FIELDS.includes(ed.field)) reschedule = true;
      });
      return ne;
    });
    const novas = [...editadas, ...novos];
    onCommit(reschedule ? autoScheduleFromDeps(novas) : novas, { silent: true });
  };
  // Cola criando tarefas NOVAS a partir do zero (grade sem nenhuma linha ainda, ou nenhuma
  // seleção) — uma tarefa por linha colada, mapeando as colunas na mesma ordem/campo que
  // pasteExternalText usa, só que a partir de 'etapa' (não há coluna selecionada como âncora).
  const pasteCreateTasks = (text) => {
    if (readOnly) return;
    const grid = text.replace(/\r/g, '').split('\n').map(line => line.split('\t'));
    const cols = visibleColIds();
    const c0 = cols.indexOf('etapa');
    if (c0 < 0) return;
    const novos = [];
    grid.forEach((row) => {
      const nome = (row[0] ?? '').trim(); // primeira coluna colada cai em 'etapa' (cols[c0])
      if (!nome) return; // ignora linha totalmente em branco
      let novo = newLeafTask([...etapas, ...novos], nome);
      row.forEach((val, dc) => {
        if (dc === 0) return; // já usado como nome
        const colId = cols[c0 + dc];
        if (!colId) return;
        const spec = cellSpec(colId);
        if (!spec || !spec.field) return;
        novo = applyFieldToEtapa(novo, spec.field, val, [...etapas, ...novos]);
      });
      novos.push(novo);
    });
    if (!novos.length) return;
    onCommit([...etapas, ...novos], { silent: true });
    setSelectedId(novos[0].id);
  };
  // Colar (Ctrl+V), via evento nativo `paste` — cobre tanto colar interno (Ctrl+C dentro
  // do app, preserva formatação) quanto externo (Excel/outro programa, só valores).
  const handlePasteEvent = (ev) => {
    if (readOnly) return;
    const tag = ev.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return; // deixa o navegador colar no input
    const text = ev.clipboardData?.getData('text/plain') ?? '';
    if (!text) return;
    // Sem NENHUMA tarefa ainda: nada a selecionar, cria tarefas novas a partir do texto colado.
    if (!etapas.length) { ev.preventDefault(); pasteCreateTasks(text); return; }
    if (!selectedCell && !selectedId) return;
    ev.preventDefault();
    const clip = cellClipRef.current;
    const internalText = clip?.grid ? clip.grid.map(gr => gr.map(c => c.value ?? '').join('\t')).join('\n') : null;
    // Limpa a moldura tracejada (marching ants) do recorte/cópia ao colar — senão ela
    // fica "presa" na posição antiga na tela mesmo depois do colar concluído, porque só
    // o atalho Ctrl++ limpava (ver handleListKeyDown).
    if (selectedCell && internalText === text) { pasteCell(); setMarquee(null); return; } // veio de um Ctrl+C interno recente
    if (!selectedCell) { pasteRow(); setMarquee(null); return; }
    pasteExternalText(text);
    setMarquee(null);
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
  // Foco externo (undo/redo, "Editar tarefa"): seleciona a tarefa e rola até ela
  React.useEffect(() => {
    if (!focusTaskId?.id) return;
    const alvo = etapas.find(e => e.id === focusTaskId.id);
    if (!alvo) return;
    requestAnimationFrame(() => {
      const cell = { taskId: alvo.id, colId: 'etapa' };
      setSelectedCell(cell); setSelAnchor(cell); setSelectedId(alvo.id);
      scrollRowIntoView(alvo.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTaskId?.nonce]);
  const moveSelCell = (key, extend) => {
    const rows = filtrada.map(x => x.id);
    const cols = [
      ...colOrder.filter(c => !hiddenCols.has(c)),
      ...customCols.filter(c => !hiddenCols.has(c.id)).map(c => c.id),
    ];
    let r = rows.indexOf(selectedCell.taskId);
    let c = cols.indexOf(selectedCell.colId);
    if (r < 0 || c < 0) return;
    // Seta pra baixo na última tarefa real: desce para a 1ª linha em branco do rodapé
    // (fora do modelo de célula — segue seu próprio fluxo de foco via <input>).
    if (key === 'ArrowDown' && r === rows.length - 1 && !extend && blankFirstRef.current) {
      blankFirstRef.current.focus();
      return;
    }
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
  // Avança a seleção uma linha para baixo (mesma coluna), estilo Excel, SEM cair no
  // input de "Nova tarefa" (na última linha mantém a seleção) — evita travar a grade.
  const advanceCellDown = (fromCell) => {
    if (!fromCell) return;
    const rows = filtrada.map(x => x.id);
    const r = rows.indexOf(fromCell.taskId);
    if (r < 0 || r >= rows.length - 1) return; // última linha: não move, não foca o branco
    const next = { taskId: rows[r + 1], colId: fromCell.colId };
    setSelectedCell(next); setSelAnchor(next); setSelectedId(rows[r + 1]);
    scrollRowIntoView(next.taskId);
  };
  // Ao sair da edição de uma célula (EditableCell): refoca a grade e, se confirmou com
  // Enter, desce a célula ativa uma linha (estilo Excel).
  const exitEdit = (via) => {
    listaScrollRef.current?.focus?.({ preventScroll: true });
    if (via === 'enter') advanceCellDown(selectedCell);
  };
  // ── Copiar/inserir LINHA (quando uma linha está selecionada, sem célula) ─────
  const copyRow = (idOverride) => {
    const id = idOverride ?? selectedId;
    if (!id) return;
    cutPendingRef.current = null; // uma cópia nova cancela um recorte pendente (mesma regra do Excel)
    const e = etapas.find(x => x.id === id);
    if (!e) return;
    rowClipRef.current = [JSON.parse(JSON.stringify(e))]; // array (uma linha)
  };
  const pasteRow = (idOverride) => {
    const id = idOverride ?? selectedId;
    if (readOnly || !id) return;
    const idx = etapas.findIndex(x => x.id === id);
    if (idx < 0) return;
    const ref = etapas[idx];
    const clips = rowClipRef.current;
    if (clips && clips.length) {
      if (cutPendingRef.current?.type === 'row') {
        // Recortar+colar MOVE a(s) linha(s) original(is) pra nova posição — mantém id,
        // displayId, dep (predecessora), pavimento, formatação, tudo. Clonar com id novo
        // (como no copiar/colar) quebraria a própria predecessora da linha movida E a
        // de qualquer outra tarefa que apontava pro id antigo dela como predecessora
        // (a sucessora ficaria "órfã", apontando pra um id que não existe mais).
        const cutIds = new Set(cutPendingRef.current.ids);
        if (cutIds.has(id)) { // colou em cima de uma das linhas recortadas: no-op
          cutPendingRef.current = null;
          rowClipRef.current = null;
          return;
        }
        const moving = etapas.filter(e => cutIds.has(e.id))
          .map(e => ({ ...e, nivel: ref.nivel, parentId: ref.parentId }));
        const rest = etapas.filter(e => !cutIds.has(e.id));
        const restIdx = rest.findIndex(e => e.id === id);
        const novas = [...rest.slice(0, restIdx), ...moving, ...rest.slice(restIdx)];
        onCommit(novas, { silent: true });
        setSelectedId(moving[0]?.id ?? id);
        rowClipRef.current = null;
        cutPendingRef.current = null;
        return;
      }
      // Copiar+colar: insere N CÓPIAS (uma por linha copiada) ACIMA da linha selecionada,
      // estilo Excel — id/displayId novos e dep zerado (a cópia não deve arrastar sozinha
      // a mesma predecessora do original sem o usuário decidir isso).
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
      let novas = [...etapas];
      novas.splice(idx, 0, ...clones);
      onCommit(novas, { silent: true });
      setSelectedId(clones[0].id);
      rowClipRef.current = null; // cópia de uso único
    } else {
      // Nada copiado: insere N linhas em branco (N = nº de linhas do intervalo, ou 1)
      const n = Math.max(1, new Set(rangeCellList().map(x => x.taskId)).size);
      insertBlankRows(id, 'above', n);
    }
  };
  // Recortar (Ctrl+X): marca a origem para ser limpa/removida no PRÓXIMO colar bem-sucedido
  // (ver pasteCell/pasteRow). Uma nova cópia/recorte, ou Escape, cancela o recorte pendente
  // sem apagar nada — igual ao Excel.
  // rowIdOverride: usado pelo menu de contexto para recortar a linha CLICADA quando não há
  // seleção de célula ativa (o botão direito não altera a seleção corrente — mesmo motivo
  // pelo qual "Copiar"/"Colar" do menu de contexto recebem `ctxMenu.taskId`).
  //
  // ATENÇÃO: clicar na CALHA (o jeito normal de selecionar uma linha inteira) TAMBÉM seta
  // `selectedCell` (um intervalo cobrindo da 1ª à última coluna) — não dá pra usar
  // `!!selectedCell` sozinho pra decidir "célula" vs "linha inteira", senão recortar uma
  // linha selecionada pela calha cai no ramo de célula e o Ctrl++/Colar duplica a linha em
  // vez de mover (a limpeza da origem só existe no ramo de linha). Por isso o critério aqui
  // é `isWholeRowSelection()`, o mesmo já usado pelo Delete/Shift+Espaço.
  const cutSelection = (rowIdOverride) => {
    if (readOnly) return;
    if (rowIdOverride != null) {
      copyRow(rowIdOverride);
      cutPendingRef.current = { type: 'row', ids: [rowIdOverride] };
    } else if (selectedCell && isWholeRowSelection()) {
      copyCell(); // já clona a(s) linha(s) inteira(s) do intervalo em rowClipRef
      cutPendingRef.current = { type: 'row', ids: (rowClipRef.current || []).map(r => r.id) };
    } else if (selectedCell) {
      copyCell();
      cutPendingRef.current = { type: 'cell', cellList: rangeCellList() };
    } else {
      copyRow();
      cutPendingRef.current = { type: 'row', ids: selectedId != null ? [selectedId] : [] };
    }
    showMarquee();
  };
  // Decide entre colar célula-a-célula (paste-special) ou inserir/mover a linha inteira,
  // usado por todo botão/menu "Colar" (ribbon, menu de contexto e seu submenu). Um recorte
  // de LINHA pendente sempre vai para pasteRow — é o único caminho que sabe limpar a
  // origem —, mesmo que a seleção atual no momento de colar seja uma célula específica.
  const pasteSmart = (mode, rowIdOverride) => {
    const recorteDeLinha = cutPendingRef.current?.type === 'row';
    if (!recorteDeLinha && selectedCell && !isWholeRowSelection() && cellClipRef.current?.grid) {
      pasteCell(mode);
    } else {
      pasteRow(rowIdOverride);
    }
    // Limpa a moldura tracejada do recorte/cópia — botão/menu "Colar" é outro caminho
    // que não passava por aqui (só o atalho Ctrl++ limpava, ver handleListKeyDown).
    setMarquee(null);
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
  // Converte o alinhamento (fmt.align) em justifyContent, pras células com layout flex interno
  // (texto puro já usa fmtToCss/textAlign no <td> — essas precisam do próprio flex).
  const alignJC = (a) => a === 'center' ? 'center' : a === 'right' ? 'flex-end' : 'flex-start';
  // alvo atual: colunas multi-selecionadas (Ctrl+clique no cabeçalho) senão célula, senão a linha
  const fmtTarget = () => {
    if (multiSelCols.length) {
      const rows = filtrada.map(x => x.id);
      if (!rows.length) return null;
      return { taskId: rows[0], key: multiSelCols[0] };
    }
    if (selectedCell) return { taskId: selectedCell.taskId, key: selectedCell.colId };
    if (selectedId)   return { taskId: selectedId, key: '__row' };
    return null;
  };
  // Todas as células (todas as linhas × todas as colunas marcadas via Ctrl+clique no cabeçalho)
  const multiColCellList = () => {
    const rows = filtrada.map(x => x.id);
    const list = [];
    rows.forEach(taskId => multiSelCols.forEach(colId => { if (!ROW_DRAG_COLS.has(colId)) list.push({ taskId, colId }); }));
    return list;
  };
  // Colunas visíveis na ordem atual (para calcular o retângulo de seleção)
  const visibleColIds = () => [
    ...colOrder.filter(c => !hiddenCols.has(c)),
    ...customCols.filter(c => !hiddenCols.has(c.id)).map(c => c.id),
  ];
  // Lista de células do intervalo (retângulo entre âncora e foco); ignora colunas-pegada
  // Seleciona a COLUNA inteira (todas as linhas visíveis) — reaproveita o range de seleção,
  // então a coluna fica selecionada/formatável/pintável como no Excel.
  const selectColumn = (colId, ev) => {
    const rows = filtrada.map(x => x.id);
    if (!rows.length) return;
    if (ev?.ctrlKey || ev?.metaKey) {
      setMultiSelCols(cols => cols.includes(colId) ? cols.filter(c => c !== colId) : [...cols, colId]);
      listaScrollRef.current?.focus?.({ preventScroll: true });
      return;
    }
    setMultiSelCols([colId]); // já conta como selecionada — um Ctrl+clique seguinte soma a partir dela
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

  // "Linha inteira selecionada": multiSel (Ctrl+clique em linhas) ou o intervalo de
  // células cobre da primeira à última coluna visível (mesmo critério de Shift+Espaço
  // e do arraste pela calha — ambos produzem esse formato de seleção de propósito).
  const isWholeRowSelection = () => {
    if (multiSel.length) return true;
    if (!selectedCell || !selAnchor) return false;
    const cols = visibleColIds();
    if (!cols.length) return false;
    const c1 = cols.indexOf(selAnchor.colId), c2 = cols.indexOf(selectedCell.colId);
    if (c1 < 0 || c2 < 0) return false;
    return (c1 === 0 && c2 === cols.length - 1) || (c2 === 0 && c1 === cols.length - 1);
  };

  // Cria uma tarefa raiz a partir de uma linha em branco (estilo Project: digitar o nome cria a tarefa).
  const createFromBlank = (nome, blankIndex = 0) => {
    const name = (nome || '').trim();
    if (!name || readOnly) return;
    // Fábrica de tarefa-folha; recebe `base` para gerar id/displayId únicos ao criar
    // várias de uma vez (evita colisão de id).
    const mk = (base, etapa) => ({
      id: nextEtapaId(base), displayId: nextDisplayId(base), etapa,
      nivel: 0, parentId: null, isGroup: false, collapsed: false,
      inicio: todayOffset(), dur: 1, avanco: 0, status: 'upcoming',
      dep: [], milestone: false, responsavel: '',
      customCols: emptyCustomCols(customCols), custo: 0,
      restricaoTipo: 'asap', restricaoData: '', fator_peso: 1, modo: 'auto',
    });
    // Preserva a linha onde foi digitado: cria tarefas de nome vazio para as linhas
    // em branco puladas (blankIndex) ANTES da tarefa nomeada.
    let base = etapas;
    const novos = [];
    for (let i = 0; i < blankIndex; i++) { const t = mk(base, ''); novos.push(t); base = [...base, t]; }
    const novo = mk(base, name);
    // Texto novo herda o tamanho/tipo de fonte "armados" na barra (aplicado na célula do nome).
    const etapaFmt = {};
    if (pendingFontSize) etapaFmt.fontSize = pendingFontSize;
    if (pendingFontFamily) etapaFmt.fontFamily = pendingFontFamily;
    if (Object.keys(etapaFmt).length) novo.fmt = { etapa: etapaFmt };
    novos.push(novo);
    onCommit([...etapas, ...novos], { silent: true });
    setSelectedId(novo.id);
    // Cursor desce para a linha logo ABAIXO da tarefa criada (1ª linha em branco = blank-0),
    // em vez de ficar preso no input digitado (que salta k+1 linhas ao criar as vazias).
    blankFocusPending.current = true;
  };
  // Move o foco para o 1º input em branco após criar a partir de uma linha em branco.
  React.useEffect(() => {
    if (blankFocusPending.current) {
      blankFocusPending.current = false;
      blankFirstRef.current?.focus();
    }
  }, [etapas]);

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
  // ── Barra de status estilo Excel (Contagem / Soma / Média da seleção) ───────
  // Colunas numéricas embutidas e o "tipo" de cada uma (define o formato do resultado).
  const NUM_COL_KIND = {
    duracao: 'number', fatorPeso: 'number',
    avanco: 'percent', peso: 'percent',
    custo: 'currency', custoReal: 'currency', saldo: 'currency', valorVinculado: 'currency',
    custoOrcado: 'currency',
  };
  const colNumericKind = (colId) => {
    if (NUM_COL_KIND[colId]) return NUM_COL_KIND[colId];
    const cc = customCols.find(c => c.id === colId);
    if (cc) {
      if (cc.type === 'currency') return 'currency';
      if (cc.type === 'percent')  return 'percent';
      if (cc.type === 'duration' || cc.type === 'number') return 'number';
    }
    return null;
  };
  // Valor numérico de uma célula, com a MESMA resolução do getCellVal (grupos e derivados).
  const cellNumericValue = (e, colId) => {
    const gv = e.isGroup ? groupVals[e.id] : null;
    const realCst = () => e.isGroup
      ? etapas.filter(c => c.parentId === e.id).reduce((s, c) => s + (c.custoRealizado || 0), 0)
      : (e.custoRealizado || 0);
    switch (colId) {
      case 'duracao':  return gv ? gv.dur : e.dur;
      case 'avanco':   return (gv ? gv.avanco : e.avanco) / 100;
      case 'custo':    return custoEf(e, gv);
      case 'custoReal': return realCst();
      case 'saldo':    return custoEf(e, gv) - realCst();
      case 'custoOrcado': return custoOrcadoMap[e.id] || 0;
      case 'peso':
        if (e.isGroup) return null;
        return totalCustoOrcado > 0 ? (custoOrcadoMap[e.id] || 0) / totalCustoOrcado : 0;
      case 'fatorPeso':      return e.isGroup ? null : (e.fator_peso ?? 1);
      case 'valorVinculado': { const v = valorVinculadoMap[e.id]; return Number.isFinite(v) ? v : null; }
      default: {
        if (colNumericKind(colId)) { const n = Number(e.customCols?.[colId]); return Number.isFinite(n) ? n : null; }
        return null;
      }
    }
  };
  // Agrega a seleção atual: Contagem/Soma/Média das células numéricas (>= 2 células).
  const selectionStats = () => {
    const cells = rangeCellList();
    if (cells.length < 2) return null;
    const kinds = new Set();
    let count = 0, sum = 0;
    for (const { taskId, colId } of cells) {
      if (!colNumericKind(colId)) continue;
      const e = etapas.find(x => x.id === taskId);
      if (!e) continue;
      const v = cellNumericValue(e, colId);
      if (v === null || v === undefined || !Number.isFinite(v)) continue;
      count++; sum += v; kinds.add(colNumericKind(colId));
    }
    if (!count) return null;
    const kind = kinds.size === 1 ? [...kinds][0] : 'number';
    const fmt = (v) => kind === 'currency' ? fmtBRL(v)
      : kind === 'percent' ? (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%'
      : v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    return { count, soma: fmt(sum), media: fmt(sum / count) };
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
    if (multiSelCols.length) { applyFmtToCells(multiColCellList(), patch); return; }
    if (selectedCell) { applyFmtToCells(rangeCellList(), patch); return; }
    if (selectedId)   { handleCellFormat(selectedId, '__row', patch); }
  };
  // Tamanho da fonte: aplica SÓ nas células selecionadas (nunca em __row, que vazaria para a linha
  // toda) e "arma" o tamanho para valer no próximo texto novo (linhas em branco).
  const applyFontSize = (fs) => {
    if (!readOnly) {
      if (multiSelCols.length) applyFmtToCells(multiColCellList(), { fontSize: fs });
      else if (selectedCell) applyFmtToCells(rangeCellList(), { fontSize: fs });
      else if (selectedId) applyFmtToCells(visibleColIds().map(colId => ({ taskId: selectedId, colId })), { fontSize: fs });
    }
    setPendingFontSize(fs);
  };
  // Tipo da fonte: mesma lógica do tamanho (só nas células selecionadas + arma p/ texto novo).
  // ff = string da família, ou false para voltar ao padrão.
  const applyFontFamily = (ff) => {
    if (!readOnly) {
      const patch = { fontFamily: ff || false };
      if (multiSelCols.length) applyFmtToCells(multiColCellList(), patch);
      else if (selectedCell) applyFmtToCells(rangeCellList(), patch);
      else if (selectedId) applyFmtToCells(visibleColIds().map(colId => ({ taskId: selectedId, colId })), patch);
    }
    setPendingFontFamily(ff || null);
  };
  const clearFmt = () => {
    if (readOnly) return;
    if (multiSelCols.length || selectedCell) {
      const byTask = {};
      (multiSelCols.length ? multiColCellList() : rangeCellList()).forEach(({ taskId, colId }) => { (byTask[taskId] = byTask[taskId] || []).push(colId); });
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
    if (ev.key === 'Escape') { setMarquee(null); cutPendingRef.current = null; return; } // limpa marching ants e recorte pendente
    // Ctrl/Cmd + Shift + ←/→ : recuar/avançar a seleção. Vem ANTES da navegação por
    // seta (senão a seta moveria a célula) e ANTES do guard de seleção (funciona também
    // com multiSel puro). handleIndent/handleOutdent já usam selectedRowIds().
    if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft')) {
      if (readOnly) return;
      ev.preventDefault();
      if (ev.key === 'ArrowRight') handleIndent(); else handleOutdent();
      return;
    }
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
    if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'x' || ev.key === 'X')) {
      if (editingNow || readOnly) return; // deixa o navegador recortar o texto do input em edição
      cutSelection();
      return;
    }
    // Colar (Ctrl+V) é tratado pelo evento nativo `onPaste` (handlePasteEvent) — cobre
    // tanto colar interno (Ctrl+C dentro do app) quanto externo (Excel etc.).
    // Ctrl + '+' (estilo Excel): insere item (cópia da linha se houver, senão linha em
    // branco). preventDefault impede o zoom do navegador. Cobre '+', '=' e o + do numpad.
    if ((ev.ctrlKey || ev.metaKey) && (ev.key === '+' || ev.key === '=' || ev.code === 'NumpadAdd')) {
      if (editingNow || readOnly) return;
      ev.preventDefault();
      const ids = [...selectedRowIds()];
      const idxs = ids.map(id => etapas.findIndex(x => x.id === id)).filter(i => i >= 0).sort((a, b) => a - b);
      if (idxs.length) {
        const pivotId = etapas[idxs[0]].id;
        if (rowClipRef.current && rowClipRef.current.length) {
          pasteRow(pivotId); // cola a cópia (Ctrl+C) ou move a linha (Ctrl+X) — uso único
        } else {
          insertBlankRows(pivotId, 'above', idxs.length); // nada copiado: linha(s) em branco
        }
      }
      setMarquee(null);
      return;
    }
    if (editingNow) return;
    // Ctrl/Cmd + Shift + baixo/cima (estilo Excel): estende a selecao ate a ultima (ou
    // primeira) celula COM informacao na coluna atual. Antes a seta com Ctrl caia na
    // navegacao comum e andava so uma linha. Percorre da ponta para tras, entao um
    // buraco no meio da coluna nao interrompe a selecao.
    if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp')) {
      if (!selectedCell) return;
      ev.preventDefault();
      const rows = filtrada.map(x => x.id);
      const rAtual = rows.indexOf(selectedCell.taskId);
      if (rAtual < 0) return;
      const temInfo = (id) => {
        const e = etapas.find(x => x.id === id);
        if (!e) return false;
        const v = colFilterValue(e, selectedCell.colId);
        return v != null && v.label !== '' && v.label != null;
      };
      let alvo = rAtual;
      if (ev.key === 'ArrowDown') {
        for (let r = rows.length - 1; r > rAtual; r--) if (temInfo(rows[r])) { alvo = r; break; }
      } else {
        for (let r = 0; r < rAtual; r++) if (temInfo(rows[r])) { alvo = r; break; }
      }
      if (alvo === rAtual) return;
      setSelAnchor(selAnchor || selectedCell);   // a ancora fica onde estava
      setSelectedCell({ taskId: rows[alvo], colId: selectedCell.colId });
      scrollRowIntoView(rows[alvo]);
      return;
    }
    // Ctrl+B / Ctrl+I / Ctrl+U : negrito / italico / sublinhado na selecao (estilo editor).
    if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && !ev.altKey && ['b', 'i', 'u'].includes(ev.key.toLowerCase())) {
      if (readOnly) return;
      ev.preventDefault();
      const k = ev.key.toLowerCase();
      if (k === 'b') applyFmt({ bold: !activeFmt.bold });
      else if (k === 'i') applyFmt({ italic: !activeFmt.italic });
      else applyFmt({ underline: !activeFmt.underline });
      return;
    }
    // Ctrl+D (estilo Excel): preenche pra baixo — repete o valor da linha do TOPO do
    // intervalo selecionado nas demais linhas, coluna a coluna.
    if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && !ev.altKey && ev.key.toLowerCase() === 'd') {
      if (readOnly || !selectedCell) return;
      ev.preventDefault();
      const rows = filtrada.map(x => x.id);
      const cols = visibleColIds();
      const a = selAnchor || selectedCell;
      let r1 = rows.indexOf(a.taskId), r2 = rows.indexOf(selectedCell.taskId);
      let c1 = cols.indexOf(a.colId), c2 = cols.indexOf(selectedCell.colId);
      if (r1 < 0 || r2 < 0 || c1 < 0 || c2 < 0) return;
      if (r1 > r2) [r1, r2] = [r2, r1];
      if (c1 > c2) [c1, c2] = [c2, c1];
      if (r1 === r2) return; // só uma linha selecionada, nada pra replicar
      const topTask = etapas.find(x => x.id === rows[r1]);
      if (!topTask) return;
      const edits = [];
      for (let c = c1; c <= c2; c++) {
        const colId = cols[c];
        if (ROW_DRAG_COLS.has(colId)) continue;
        const spec = cellSpec(colId);
        if (!spec) continue;
        const topVal = spec.get(topTask);
        for (let r = r1 + 1; r <= r2; r++) {
          edits.push({ taskId: rows[r], colId, field: spec.field, rawValue: topVal });
        }
      }
      applyBlockEdits(edits);
      return;
    }
    // Delete (estilo Excel/MS Project): só age quando a seleção cobre a LINHA INTEIRA
    // (todas as colunas visíveis — mesmo critério do Shift+Espaço/drag na calha, ou
    // multiSel). Uma célula ou um intervalo parcial de colunas não faz nada. Sempre
    // pede confirmação (mesmo sem subtarefas) antes de excluir.
    if (ev.key === 'Delete' && !readOnly && isAdmin) {
      if (!isWholeRowSelection()) return;
      ev.preventDefault();
      const ids = [...selectedRowIds()];
      if (!ids.length) return;
      setDeleteConfirm(ids);
      return;
    }
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
      ev.preventDefault(); // evita a rolagem
      // F2 (estilo Excel): abre a célula selecionada para digitação.
      // Só F2 puro — com Ctrl/Alt/Meta não abre (Ctrl+F2 é o atalho de vincular em cadeia).
      if (ev.key === 'F2' && selectedCell && !readOnly && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        const { taskId, colId } = selectedCell;
        const task = filtrada.find(x => x.id === taskId);
        const leaf = task && !task.isGroup;
        if      (colId === 'custo'     && leaf) setEditingCusto(taskId + '_custo');
        else if (colId === 'custoReal' && leaf && !valorVinculadoMap[taskId]) setEditingCusto(taskId + '_real');
        else if (colId === 'fatorPeso' && leaf && effStatus(task) !== 'done') setEditingFatorPeso(taskId);
        else if (colId === 'dep'       && leaf) setEditingDep(taskId);
        else if (colId === 'succ'      && leaf) setEditingSucc(taskId);
        else {
          // Demais colunas (etapa, datas, duração, avanço, responsável, personalizadas)
          // usam EditableCell: dispara o mesmo caminho do duplo-clique.
          const sc = listaScrollRef.current;
          const td = sc?.querySelector(`td[data-ck="${taskId}|${colId}"]`);
          td?.querySelector('[title="Duplo-clique para editar"]')
            ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
        }
      } else if (ev.key === 'Enter' && selectedCell) {
        // Enter (estilo Excel): desce a célula ativa uma linha.
        moveSelCell('ArrowDown', false);
      }
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
    if (f.align)    style.textAlign = f.align;
    return { style: Object.keys(style).length ? style : null, classes };
  };
  // Borda externa do intervalo (só nas arestas do retângulo, estilo Excel) via box-shadow —
  // sem preencher o fundo das células (senão cada linha vira uma "caixa" contra a borda
  // padrão da tabela, em vez de um único retângulo de seleção). Colunas congeladas mantêm
  // o próprio fundo opaco de sempre (definido em stickyStyle/frozenBg) — não ganham tom
  // extra, senão a seleção de intervalo fica com preenchimento em vez de só a borda.
  const rangeSelStyle = (edges) => {
    if (!edges) return null;
    const sh = [];
    if (edges.t) sh.push('inset 0 1px 0 0 var(--brand)');
    if (edges.b) sh.push('inset 0 -1px 0 0 var(--brand)');
    if (edges.l) sh.push('inset 1px 0 0 0 var(--brand)');
    if (edges.r) sh.push('inset -1px 0 0 0 var(--brand)');
    return { boxShadow: sh.join(', ') };
  };
  const decorateCell = (cell, colId, taskId, fmt, edges, rowIdx = 0, isLastRow = true) => {
    if (!cell) return null;
    const eff = { ...(fmt?.__row || {}), ...(fmt?.[colId] || {}) };
    const dragCls = dragOverCol?.id === colId ? `drag-over-col-${dragOverCol.side}` : '';
    const { style: fmtStyle, classes: fmtClasses } = fmtToCss(eff);
    const cls     = [cell.props.className, dragCls, ...fmtClasses].filter(Boolean).join(' ');
    const selStyle = rangeSelStyle(edges);
    // Coluna inteira marcada via Ctrl+clique no cabeçalho: só a borda externa do retângulo
    // (topo da 1ª linha, base da última, laterais em toda a coluna) — sem preencher o fundo
    // das células, estilo Excel — recua se a célula já tem cor própria.
    const colMultiSelStyle = (multiSelCols.includes(colId) && !eff.bg)
      ? { boxShadow: [
          rowIdx === 0 && 'inset 0 1px 0 0 var(--brand)',
          isLastRow    && 'inset 0 -1px 0 0 var(--brand)',
          'inset 1px 0 0 0 var(--brand)',
          'inset -1px 0 0 0 var(--brand)',
        ].filter(Boolean).join(', ') } : null;
    const styled = { ...(cell.props.style || {}), ...(fmtStyle || {}), ...(colMultiSelStyle || {}), ...(selStyle || {}) };
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
        // Clicar em qualquer célula sai do modo "coluna selecionada" (Ctrl+clique no cabeçalho) —
        // a partir daqui a seleção passa a ser de célula/linha, não mais de coluna inteira.
        if (multiSelCols.length) setMultiSelCols([]);
        // Pincel de formatação ativo: aplica a formatação capturada nesta célula e desliga
        if (painterOn && painterRef.current) {
          ev.preventDefault();
          applyFmtToCells([{ taskId, colId }], painterRef.current);
          setPainterOn(false);
          setSelectedCell({ taskId, colId }); setSelAnchor({ taskId, colId });
          if (!ev.ctrlKey && !ev.metaKey) setSelectedId(taskId);
          rowClickHandledRef.current = true;
          listaScrollRef.current?.focus?.({ preventScroll: true });
          return;
        }
        setSelectedCell({ taskId, colId });
        setSelAnchor({ taskId, colId });
        isSelectingRef.current = true; // inicia possível arraste de intervalo
        // Seleciona a linha também — tratado aqui (não delegado ao onClick do <tr>, que nem
        // sempre é alcançado: várias células param a propagação do clique).
        if (ev.ctrlKey || ev.metaKey) {
          ev.preventDefault();
          setMultiSel(ms => ms.includes(taskId) ? ms.filter(id => id !== taskId) : [...ms, taskId]);
        } else {
          setSelectedId(taskId);
          setMultiSel([]);
        }
        rowClickHandledRef.current = true;
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

  // Insere `count` tarefas em branco acima ou abaixo da tarefa de referência, todas
  // de uma vez (um único onCommit) — necessário para count > 1, já que onCommit
  // sucessivos a partir do mesmo `etapas` (closure) se sobrescreveriam.
  const insertBlankRows = (referenceId, position, count = 1, milestone = false) => {
    const refIdx = etapas.findIndex(e => e.id === referenceId);
    if (refIdx < 0) return;
    const ref = etapas[refIdx];
    let base = [...etapas];
    const blanks = Array.from({ length: count }, () => {
      const blank = {
        id:            nextEtapaId(base),
        displayId:     nextDisplayId(base),
        etapa:         milestone ? 'Novo Marco' : 'Nova Tarefa',
        inicio:        todayOffset(),
        dur:           milestone ? 0 : 1,
        avanco:        0,
        status:        'upcoming',
        dep:           [],
        milestone,
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
        modo:          'auto',
        customCols:    emptyCustomCols(customCols),
      };
      base = [...base, blank];
      return blank;
    });
    const novas = [...etapas];
    novas.splice(position === 'above' ? refIdx : refIdx + 1, 0, ...blanks);
    onCommit(novas, { silent: true });
    setSelectedId(blanks[0].id);
  };
  // Insere uma nova tarefa (ou marco, se milestone=true) acima ou abaixo da tarefa de referência
  const insertTask = (referenceId, position, milestone = false) => insertBlankRows(referenceId, position, 1, milestone);

  // Fecha menu de contexto ao clicar fora ou pressionar Escape
  React.useEffect(() => {
    if (!ctxMenu) return;
    const onDown = (ev) => { if (!ev.target.closest('.ctx-menu')) setCtxMenu(null); };
    const onKey  = (ev) => { if (ev.key === 'Escape') setCtxMenu(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [ctxMenu]);

  // Atalho Ctrl+L — abre o "Localizar" (estilo Excel/Project). preventDefault: o navegador
  // usaria Ctrl+L para a barra de endereços.
  React.useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        setShowLocalizar(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Atalho F7 — abre "Verificar ortografia" (estilo Word/Project). preventDefault:
  // Chrome/Edge/Firefox usam F7 nativamente para "navegação por cursor" (caret browsing)
  // e abririam um pop-up do navegador por cima da caixa.
  React.useEffect(() => {
    if (readOnly) return;
    const handler = (e) => {
      if (e.key === 'F7' && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        setShowOrtografia(v => !v);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [readOnly]);

  // Navega para a próxima tarefa que casa com o termo (nome, WBS ou ID), em ciclo.
  const norm2 = (s) => String(s ?? '').toLowerCase();
  const localizarProximo = () => {
    const q = localizarTermo.trim().toLowerCase();
    if (!q) return;
    const matches = filtrada.filter(e =>
      norm2(e.etapa).includes(q) || norm2(wbsMap[e.id]).includes(q) || String(e.displayId ?? '').includes(q)
    );
    if (!matches.length) { toast('Nenhuma tarefa encontrada', { tone: 'neutral', icon: 'search' }); return; }
    localizarIdxRef.current = (localizarIdxRef.current + 1) % matches.length;
    const alvo = matches[localizarIdxRef.current];
    const cell = { taskId: alvo.id, colId: 'etapa' };
    setSelectedCell(cell); setSelAnchor(cell); setSelectedId(alvo.id);
    scrollRowIntoView(alvo.id);
  };

  // ── Verificador ortográfico (F7) ─────────────────────────────────────────────
  const focarTarefaOrtografia = (taskId) => {
    const alvo = filtrada.find(e => e.id === taskId);
    if (!alvo) return;
    const cell = { taskId: alvo.id, colId: 'etapa' };
    setSelectedCell(cell); setSelAnchor(cell); setSelectedId(alvo.id);
    scrollRowIntoView(alvo.id);
  };
  // "Alterar" (uma ocorrência): reusa handleCellSave, que já tem o guard de no-op e vira
  // 1 passo de undo.
  const alterarPalavraOrtografia = (taskId, inicio, fim, nova) => {
    const alvo = etapas.find(e => e.id === taskId);
    if (!alvo) return;
    const texto = alvo.etapa || '';
    handleCellSave(taskId, 'etapa', texto.slice(0, inicio) + nova + texto.slice(fim));
  };
  // "Alterar todas": troca o token em todos os nomes de tarefa de uma vez, num único
  // commit (não usa handleCellSave tarefa por tarefa, que geraria N passos de undo).
  const alterarPalavraOrtografiaEmTodas = (palavra, nova) => {
    const novas = etapas.map(e => {
      const t = substituirTokens(e.etapa || '', palavra, nova);
      return t === e.etapa ? e : { ...e, etapa: t };
    });
    if (novas.every((e, i) => e === etapas[i])) return;
    onCommit(novas, { silent: true });
  };

  // Atalho Ctrl+F2 — cria vínculos em cadeia entre tarefas de multiSel (na ordem de clique)
  React.useEffect(() => {
    const handler = (e) => {
      if (readOnly) return;
      if (e.ctrlKey && e.key === 'F2') {
        e.preventDefault();
        // Ctrl+clique define a ordem da cadeia; senão usa a seleção (calha/célula-range)
        // na ordem visual (de cima para baixo).
        const sel = selectedRowIds();
        const cadeia = multiSel.length >= 2 ? multiSel : filtrada.filter(t => sel.has(t.id)).map(t => t.id);
        if (cadeia.length < 2) { toast('Selecione ao menos 2 tarefas (Ctrl+clique ou pela calha)', { tone: 'warning', icon: 'alert-triangle' }); return; }
        const novas = etapas.map(et => ({ ...et }));
        for (let i = 1; i < cadeia.length; i++) {
          const succ = novas.find(et => et.id === cadeia[i]);
          const predId = cadeia[i - 1];
          if (succ && !(succ.dep || []).some(d => (typeof d === 'string' ? d : d.id) === predId)) {
            succ.dep = [...(succ.dep || []), { id: predId, tipo: 'TI', lag: 0 }];
          }
        }
        onCommit(autoScheduleFromDeps(novas));
        setMultiSel([]);
        toast(`${cadeia.length - 1} vínculo(s) criado(s)`, { tone: 'success', icon: 'check' });
      }
      // Insert — insere linha abaixo da tarefa selecionada
      if (e.key === 'Insert' && selectedId) {
        e.preventDefault();
        insertTask(selectedId, 'below');
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [multiSel, etapas, selectedId, selectedCell, selAnchor, filtrada]);

  // ── Atualização de campo ────────────────────────────────────────────────────
  // RESCHEDULE_FIELDS/applyFieldToEtapa vêm de scheduleEngine.js — compartilhados com o
  // Formulário de Tarefa do Gantt, que precisa da mesma conversão de valor por campo.
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
          ne = applyFieldToEtapa(ne, ed.field, ed.rawValue, etapas);
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

    // No-op guard: se o valor não mudou de verdade (ex.: abrir/fechar a célula sem editar,
    // ou digitar o mesmo número), não commita — senão empilha uma entrada idêntica no undo
    // e o Ctrl+Z "desfaz" para um estado igual (parece que não faz nada).
    const cur = etapas.find(e => e.id === id);
    if (cur) {
      const next = applyFieldToEtapa(cur, field, rawValue, etapas);
      if (JSON.stringify(cur) === JSON.stringify(next)) return;
    }
    onCommit(commitFieldChange(etapas, id, field, rawValue), { silent: true });
  };

  // Sucessora exibida como texto (estilo Project): displayId + tipo(≠TI) + lag,
  // lidos do link reverso (a predecessora que a etapa sucessora tem apontando para taskId).
  const formatSucc = (taskId) => (succMap[taskId] || []).map(sid => {
    const s = etapas.find(x => x.id === sid);
    const link = (s?.dep || []).find(d => (typeof d === 'string' ? d : d.id) === taskId);
    const disp = idToDisplayId[sid] ?? sid;
    const tipo = link && typeof link !== 'string' && link.tipo && link.tipo !== 'TI' ? link.tipo : '';
    const lag  = link && typeof link !== 'string' && link.lag ? ((link.lag > 0 ? '+' : '') + link.lag + 'd') : '';
    return disp + tipo + lag;
  }).join('; ');

  // Exibição das colunas Pred./Suces. com o NOME da tarefa (a edição continua por código).
  const depTipoLag = (d) => {
    if (!d || typeof d === 'string') return '';
    const t = d.tipo && d.tipo !== 'TI' ? d.tipo : '';
    const l = d.lag ? ((d.lag > 0 ? '+' : '') + d.lag + 'd') : '';
    return [t, l].filter(Boolean).join(' ');
  };
  const nomeDaTarefa = (id) => etapas.find(x => x.id === id)?.etapa || (idToDisplayId[id] ?? id);
  const formatDepNames = (dep) => (dep || []).map(d => {
    const id = typeof d === 'string' ? d : d.id;
    const tl = depTipoLag(d);
    return nomeDaTarefa(id) + (tl ? ` (${tl})` : '');
  }).join('; ');
  const formatSuccNames = (taskId) => (succMap[taskId] || []).map(sid => {
    const s = etapas.find(x => x.id === sid);
    const link = (s?.dep || []).find(d => (typeof d === 'string' ? d : d.id) === taskId);
    const tl = depTipoLag(link);
    return nomeDaTarefa(sid) + (tl ? ` (${tl})` : '');
  }).join('; ');

  // Edita a Sucessora escrevendo o vínculo reverso (predecessora) nas outras tarefas.
  const handleSuccSave = (taskId, raw) => {
    const alvos  = parseDep(raw, etapas);                 // [{id: idDoSucessor, tipo, lag}]
    const novoSet = new Map(alvos.filter(a => a.id !== taskId).map(a => [a.id, a]));
    const antigos = new Set(succMap[taskId] || []);
    const novas = etapas.map(e => {
      if (e.id === taskId) return e;
      const alvo = novoSet.get(e.id);
      const era  = antigos.has(e.id);
      if (!alvo && !era) return e;
      let dep = (e.dep || []).filter(d => (typeof d === 'string' ? d : d.id) !== taskId);
      if (alvo) dep = [...dep, { id: taskId, tipo: alvo.tipo, lag: alvo.lag }];
      return { ...e, dep };
    });
    const reprog = autoScheduleFromDeps(novas);
    if (JSON.stringify(reprog) === JSON.stringify(etapas)) return; // sem mudança real
    onCommit(reprog);
  };

  const handleToggleCollapse = (id) => {
    const novas = etapas.map(e => e.id === id ? { ...e, collapsed: !e.collapsed } : e);
    onCommit(novas, { silent: true, skipHistory: true });
  };

  // ── Ações (usadas pelo ribbon, menu de contexto e atalhos) ───────────────────
  const handleAddGroup   = () => onCommit(createGroup(selectedId, etapas, customCols), { silent: true });

  const handleDelete = () => {
    if (!selectedId) return;
    setDeleteConfirm([selectedId]);
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

  // Define o modo (auto/manual) de toda a seleção; reagenda em seguida (auto recalcula na hora).
  const setModoSelecao = (modo) => {
    const ids = new Set([...selectedRowIds()]);
    if (!ids.size) return;
    const novas = etapas.map(t => (ids.has(t.id) && !t.isGroup ? { ...t, modo } : t));
    onCommit(autoScheduleFromDeps(novas));
  };
  // Modo comum da seleção (para realçar o botão ativo); null quando misto/sem seleção.
  const modoSelecao = (() => {
    const ids = [...selectedRowIds()].filter(id => !etapas.find(e => e.id === id)?.isGroup);
    if (!ids.length) return null;
    const modos = new Set(ids.map(id => etapas.find(e => e.id === id)?.modo || 'auto'));
    return modos.size === 1 ? [...modos][0] : null;
  })();

  const selForIndent = selectedRowIds();
  const canIndent  = [...selForIndent].some(id => etapas.findIndex(e => e.id === id) > 0);
  const canOutdent = [...selForIndent].some(id => (etapas.find(e => e.id === id)?.nivel || 0) > 0);

  // Atalho Ctrl+Shift+←/→ (recuar/avançar) é tratado dentro do handleListKeyDown,
  // antes da navegação por seta — senão a seta move a célula e "rouba" o atalho.

  const confirmDelete = () => {
    if (!deleteConfirm?.length) return;
    const novas = deleteConfirm.reduce((acc, id) => deleteTask(id, acc), etapas);
    const count = etapas.length - novas.length;
    onCommit(novas, { silent: true });
    setSelectedId(null);
    setSelectedCell(null);
    setDeleteConfirm(null);
    toast(`${count} tarefa${count > 1 ? 's removidas' : ' removida'}`, { tone: 'neutral', icon: 'check' });
  };

  const handleAddCol = (colDef) => {
    const newCols = [...customCols, colDef];
    const novas = etapas.map(e => ({ ...e, customCols: { ...(e.customCols || {}), [colDef.id]: '' } }));
    // Coluna + dados num único ponto de histórico (Ctrl+Z desfaz os dois juntos).
    onCommit(novas, { silent: true, customCols: newCols });
    toast(`Coluna "${colDef.label}" adicionada`, { tone: 'success', icon: 'check' });
  };

  // Exclui uma coluna PERSONALIZADA (não as padrão): remove a definição e o dado em todas as etapas.
  const handleDeleteCol = (colId) => {
    const col = customCols.find(c => c.id === colId);
    if (!col) return;
    const newCols = customCols.filter(c => c.id !== colId);
    const novas = etapas.map(e => {
      const cc = { ...(e.customCols || {}) };
      delete cc[colId];
      return { ...e, customCols: cc };
    });
    // Coluna + dados + visibilidade num único ponto de histórico (Ctrl+Z recria a coluna com os dados).
    const newHidden = new Set(hiddenCols); newHidden.delete(colId);
    onCommit(novas, { silent: true, customCols: newCols, hiddenCols: [...newHidden] });
    setMultiSelCols(prev => prev.filter(c => c !== colId));
    toast(`Coluna "${col.label}" excluída`, { tone: 'neutral', icon: 'check' });
  };

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
        if (['custo', 'custoReal', 'saldo', 'custoOrcado'].includes(cid)) { colFmts[i] = '#,##0.00'; return; }
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
          return totalCustoOrcado > 0 ? (custoOrcadoMap[e.id] || 0) / totalCustoOrcado : 0;
        }
        if (cid === 'fatorPeso')      return e.isGroup ? '' : (e.fator_peso ?? 1);
        if (cid === 'valorVinculado') return valorVinculadoMap[e.id] || '';
        if (cid === 'custoReal') return realCst;
        if (cid === 'custoOrcado') return custoOrcadoMap[e.id] || 0;
        if (cid === 'saldo')    return cst - realCst;
        if (cid === 'resp')     return e.responsavel || '';
        if (cid === 'dep')      return e.isGroup ? '' : formatDepList(e.dep, etapas);
        if (cid === 'succ')     return (succMap[e.id] || []).map(id => idToDisplayId[id] ?? id).join('; ');
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
          if (cid === 'custoOrcado') return totalCustoOrcado;
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
      const doc   = new jsPDF({ orientation: 'landscape', unit: 'mm', format: pdfFormat });
      const BRAND = [1, 67, 134];
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();
      doc.setFontSize(13); doc.text('Lista de Tarefas', 14, 14);
      doc.setFontSize(8);  doc.setTextColor(130);
      doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, 14, 20);
      doc.setTextColor(0);
      const visCols    = colOrder.filter(c => !hiddenCols.has(c));
      const getLabel   = (cid) => LISTA_COL_DEFS[cid]?.label ?? (customCols.find(c => c.id === cid)?.label ?? cid);
      const RIGHT_C    = new Set(['custo', 'custoReal', 'saldo', 'peso', 'avanco', 'duracao', 'id', 'fatorPeso', 'valorVinculado', 'custoOrcado']);
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
          return totalCustoOrcado > 0 ? ((custoOrcadoMap[e.id] || 0) / totalCustoOrcado * 100).toFixed(1) + '%' : '0.0%';
        }
        if (cid === 'fatorPeso')      return e.isGroup ? '—' : (e.fator_peso ?? 1).toLocaleString('pt-BR');
        if (cid === 'valorVinculado') return valorVinculadoMap[e.id] ? fmtBRL(valorVinculadoMap[e.id]) : '—';
        if (cid === 'custoReal') return fmtBRL(realCst);
        if (cid === 'custoOrcado') return fmtBRL(custoOrcadoMap[e.id] || 0);
        if (cid === 'saldo')     return fmtBRL(cst - realCst);
        if (cid === 'resp')      return e.responsavel || '';
        if (cid === 'dep')       return e.isGroup ? '' : formatDepList(e.dep, etapas);
        if (cid === 'succ')      return (succMap[e.id] || []).map(id => idToDisplayId[id] ?? id).join('; ');
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
        if (cid === 'custoOrcado') return fmtBRL(totalCustoOrcado);
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
  // Altura única do card (não depende de `listaDocTop`) — assim o documento sempre tem
  // espaço de rolagem suficiente pra levar o topo do card até o gatilho de congelamento,
  // não importa quão alta seja a seção de cards de indicador acima (se dependesse de
  // docTop, a altura pré-scroll encolheria conforme os cards ficassem mais altos, quase
  // zerando a rolagem disponível).
  const listaCardH = `calc(100vh - ${topbarH + 10}px)`;

  // Linha clicada com botão direito — controla se "Reprogramar restante" aparece no menu
  // de contexto (só para folha com avanço parcial, 1–99%).
  const ctxMenuTask     = ctxMenu ? etapas.find(e => e.id === ctxMenu.taskId) : null;
  const podeReprogramar = !!ctxMenuTask && !ctxMenuTask.isGroup && ctxMenuTask.avanco >= 1 && ctxMenuTask.avanco <= 99;

  return (
    <>
    {/* Sentinela: marca onde o card fixo começa (para detectar quando prender) */}
    <div ref={listaSentinelRef} aria-hidden="true" style={{ height: 0 }} />
    {/* Espaçador: preserva a altura do fluxo quando o card fixo sai do fluxo (position:fixed) */}
    {listaPinned && <div aria-hidden="true" style={{ marginTop: 8, height: listaCardH }} />}

    {/* Card FIXO: menu em abas (ribbon) + banda + cabeçalho + tabela; congela sob a topbar */}
    <div ref={listaRef} className="card"
      style={listaPinned
        ? { position: 'fixed', top: topbarH + 10, left: listaPinned.left, width: listaPinned.width, height: listaCardH, zIndex: 5, margin: 0, display: 'flex', flexDirection: 'column' }
        : { marginTop: 8, height: listaCardH, display: 'flex', flexDirection: 'column' }
      }>

      {/* ── Menu em abas (ribbon estilo MS Project): Tarefa | Inserir | Exibir ─── */}
      {(() => {
        const hasTarget = !!(selectedCell || selectedId);
        const temFiltro = !!(filtroResp || filtroPreset || filtroTaskIds.length || filtroTexto || filtroVinculo || Object.keys(columnFilters).length || sortSpec);
        const limparFiltros = () => {
          setFiltroResp('');
          setFiltroPreset?.(''); setFiltroPresetRange?.({ de: '', ate: '' }); setFiltroTaskIds?.([]);
          setFiltroTexto?.(''); setFiltroVinculo?.('');
          setColumnFilters({}); setSortSpec(null);
        };
        const tglStyle = (on) => ({
          ...btnStyle, height: 28, padding: '2px 9px', fontWeight: 700,
          background: on ? 'var(--brand)' : 'var(--surface)', color: on ? '#fff' : 'var(--text)',
          border: '1px solid var(--border)', borderRadius: 6,
        });
        const size = activeFmt.fontSize || pendingFontSize || 11;
        const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36];
        const sizeOpts = FONT_SIZES.includes(size) ? FONT_SIZES : [...FONT_SIZES, size].sort((a, b) => a - b);
        const div = () => <span style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 2px' }} />;
        const iconBtn = { ...btnStyle, height: 28, width: 30, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6 };
        // Botão de comando com rótulo (estilo ribbon)
        const cmdBtn = { ...btnStyle, height: 28, fontSize: 12, padding: '2px 10px', display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer' };
        // Estilos dos grupos estilo ribbon (Excel)
        const groupBox = { display: 'inline-flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', padding: '4px 6px 2px', flexShrink: 0 };
        // minHeight >= altura real de 2 linhas (selects podem passar de 26px em alguns
        // navegadores, ~60px no total). Com margem, TODO grupo (1 ou 2 linhas) fica com a
        // mesma altura, então a faixa não varia entre as abas.
        const groupContent = { display: 'flex', flexDirection: 'column', gap: 4, flex: 1, justifyContent: 'center', minHeight: 64 };
        const rowStyle = { display: 'flex', alignItems: 'center', gap: 4 };
        const caption = { textAlign: 'center', fontSize: 9.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 3 };
        const tabBtn = (on) => ({ padding: '6px 15px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', border: 'none', background: on ? 'var(--surface)' : 'transparent', color: on ? 'var(--brand)' : 'var(--text-muted)', borderBottom: on ? '2px solid var(--brand)' : '2px solid transparent' });

        // Abas: Tarefa/Inserir só quando editável; Exibir, Filtro e Cadastro sempre.
        const tabs = readOnly
          ? [{ id: 'exibir', label: 'Exibir' }, { id: 'filtro', label: 'Filtro' }, { id: 'cadastro', label: 'Cadastro' }, { id: 'exportar', label: 'Exportar' }]
          : [{ id: 'tarefa', label: 'Tarefa' }, { id: 'inserir', label: 'Inserir' }, { id: 'exibir', label: 'Exibir' }, { id: 'filtro', label: 'Filtro' }, { id: 'cadastro', label: 'Cadastro' }, { id: 'exportar', label: 'Exportar' }];
        const curTab = tabs.some(t => t.id === activeTab) ? activeTab : tabs[0].id;

        return (
          <>
            {/* Tira de abas + status + recolher */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)', padding: '0 6px' }}>
              {tabs.map(t => (
                <button key={t.id} style={tabBtn(t.id === curTab)} onClick={() => setActiveTab(t.id)}>{t.label}</button>
              ))}
              <div style={{ flex: 1 }} />
              {multiSel.length > 0 && (
                <span style={{ fontSize: 11.5, color: 'var(--brand)', fontWeight: 600, padding: '3px 10px', background: 'var(--brand-tint)', borderRadius: 20 }}>
                  {multiSel.length} selecionadas · Ctrl+F2 para vincular
                </span>
              )}
              {selectedId && !multiSel.length && (
                <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{selectedId} selecionado</span>
              )}
              <span style={{ fontSize: 11.5, color: 'var(--text-faint)', marginLeft: 8 }}>{visible.length} de {etapas.length} tarefas</span>
              <button
                onClick={() => setRibbonCollapsed(v => !v)}
                title={ribbonCollapsed ? 'Mostrar menu' : 'Ocultar menu'}
                style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0 }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: ribbonCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .12s' }}><polyline points="6 9 12 15 18 9"/></svg>
              </button>
            </div>

            {/* Corpo do ribbon (aba ativa). flexWrap sem overflow: os grupos quebram em telas
               estreitas em vez de gerar um container de scroll (que recortaria o popover de Colunas). */}
            {!ribbonCollapsed && (
              <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, flexWrap: 'wrap', padding: '6px 8px', minHeight: 62 }}>

                {/* ══ Aba TAREFA ══ */}
                {curTab === 'tarefa' && !readOnly && (
                  <>
                    {/* Grupos de formatação — atenuados quando não há alvo (exceto pincel) */}
                    <div style={{ display: 'inline-flex', alignItems: 'stretch', gap: 8, opacity: hasTarget ? 1 : 0.5, pointerEvents: hasTarget || painterOn ? 'auto' : 'none' }}>
                      {/* Fonte */}
                      <div style={groupBox}>
                        <div style={groupContent}>
                          <div style={rowStyle}>
                            <select
                              value={activeFmt.fontFamily || pendingFontFamily || ''}
                              onChange={(ev) => applyFontFamily(ev.target.value || false)}
                              title="Tipo da fonte"
                              style={{ height: 26, fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', padding: '0 4px', width: 118, flexShrink: 0, cursor: 'pointer' }}
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
                            <select
                              value={size}
                              onChange={(ev) => applyFontSize(Number(ev.target.value))}
                              title="Tamanho da fonte"
                              style={{ height: 26, width: 56, fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', padding: '0 4px', flexShrink: 0, cursor: 'pointer' }}
                            >
                              {sizeOpts.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                          <div style={rowStyle}>
                            <button style={tglStyle(activeFmt.bold)} onClick={() => applyFmt({ bold: !activeFmt.bold })} title="Negrito (Ctrl+B)">N</button>
                            <button style={{ ...tglStyle(activeFmt.italic), fontStyle: 'italic' }} onClick={() => applyFmt({ italic: !activeFmt.italic })} title="Itálico (Ctrl+I)">I</button>
                            <button style={{ ...tglStyle(activeFmt.underline), textDecoration: 'underline' }} onClick={() => applyFmt({ underline: !activeFmt.underline })} title="Sublinhado (Ctrl+U)">S</button>
                            {div()}
                            <button style={tglStyle(activeFmt.align === 'left')} onClick={() => applyFmt({ align: activeFmt.align === 'left' ? false : 'left' })} title="Alinhar à esquerda">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="15" y2="12" /><line x1="3" y1="18" x2="18" y2="18" /></svg>
                            </button>
                            <button style={tglStyle(activeFmt.align === 'center')} onClick={() => applyFmt({ align: activeFmt.align === 'center' ? false : 'center' })} title="Centralizar">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="6" y1="12" x2="18" y2="12" /><line x1="5" y1="18" x2="19" y2="18" /></svg>
                            </button>
                            <button style={tglStyle(activeFmt.align === 'right')} onClick={() => applyFmt({ align: activeFmt.align === 'right' ? false : 'right' })} title="Alinhar à direita">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="9" y1="12" x2="21" y2="12" /><line x1="6" y1="18" x2="21" y2="18" /></svg>
                            </button>
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

                      {/* Recuo */}
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

                      {/* Formatação */}
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

                    {/* Modo da tarefa (auto/manual) — aplica à seleção */}
                    <div style={{ ...groupBox, opacity: hasTarget ? 1 : 0.5, pointerEvents: hasTarget ? 'auto' : 'none' }}>
                      <div style={{ ...groupContent, justifyContent: 'center' }}>
                        <div style={rowStyle}>
                          <button style={{ ...cmdBtn, width: '100%', color: modoSelecao === 'auto' ? 'var(--brand)' : undefined, background: modoSelecao === 'auto' ? 'var(--brand-tint)' : undefined }}
                            onClick={() => setModoSelecao('auto')} title="Agendamento automático: datas calculadas pelas dependências">
                            <Icon name="clock" size={13} /> Automático
                          </button>
                        </div>
                        <div style={rowStyle}>
                          <button style={{ ...cmdBtn, width: '100%', color: modoSelecao === 'manual' ? 'var(--brand)' : undefined, background: modoSelecao === 'manual' ? 'var(--brand-tint)' : undefined }}
                            onClick={() => setModoSelecao('manual')} title="Agendamento manual: datas fixas, não reagenda por dependências nem arraste">
                            <Icon name="pin" size={13} /> Manual
                          </button>
                        </div>
                      </div>
                      <div style={caption}>Modo</div>
                    </div>

                    {/* Área de transferência (Recortar/Copiar/Colar) */}
                    <div style={groupBox}>
                      <div style={{ ...groupContent, justifyContent: 'center' }}>
                        <div style={rowStyle}>
                          <button style={cmdBtn} onClick={() => cutSelection()} title="Recortar (Ctrl+X)">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
                            Recortar
                          </button>
                          <button style={cmdBtn} onClick={() => (selectedCell ? copyCell() : copyRow())} title="Copiar (Ctrl+C)">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                            Copiar
                          </button>
                          <button style={cmdBtn} onClick={() => pasteSmart('all')} title="Colar (Ctrl+V)">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
                            Colar
                          </button>
                        </div>
                      </div>
                      <div style={caption}>Área de transferência</div>
                    </div>

                    {/* Edição (sempre ativa; Excluir depende de seleção) */}
                    <div style={groupBox}>
                      <div style={{ ...groupContent, justifyContent: 'center' }}>
                        <div style={{ ...rowStyle, justifyContent: 'space-between' }}>
                          <button style={{ ...iconBtn, opacity: canUndo ? 1 : 0.5 }} onClick={undo} disabled={!canUndo} title="Desfazer (Ctrl+Z)">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M3 13C5.5 8 10 5 15 5c4 0 7 2.5 7 6s-3 6-7 6H12"/></svg>
                          </button>
                          <button style={{ ...iconBtn, opacity: canRedo ? 1 : 0.5 }} onClick={redo} disabled={!canRedo} title="Refazer (Ctrl+Y)">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"/><path d="M21 13C18.5 8 14 5 9 5c-4 0-7 2.5-7 6s3 6 7 6H12"/></svg>
                          </button>
                        </div>
                        {isAdmin && (
                          <div style={rowStyle}>
                            <button style={{ ...cmdBtn, width: '100%', color: selectedId ? 'var(--danger)' : undefined, opacity: selectedId ? 1 : 0.5 }} onClick={handleDelete} disabled={!selectedId} title="Excluir a tarefa selecionada (Delete)">
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                              Excluir
                            </button>
                          </div>
                        )}
                      </div>
                      <div style={caption}>Edição</div>
                    </div>

                    {/* Revisão (verificador ortográfico, estilo Word/Project) */}
                    <div style={groupBox}>
                      <div style={{ ...groupContent, justifyContent: 'center' }}>
                        <div style={rowStyle}>
                          <button style={cmdBtn} onClick={() => setShowOrtografia(true)} title="Verificar ortografia dos nomes das tarefas (F7)">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20 9 4h2l5 16"/><path d="M6 14h8"/><circle cx="19" cy="18" r="2.5"/><path d="M19 12v3.5"/></svg>
                            Ortografia
                          </button>
                        </div>
                      </div>
                      <div style={caption}>Revisão</div>
                    </div>
                  </>
                )}

                {/* ══ Aba INSERIR ══ */}
                {curTab === 'inserir' && !readOnly && (
                  <>
                    <div style={groupBox}>
                      <div style={{ ...groupContent, justifyContent: 'center' }}>
                        <div style={rowStyle}>
                          <button style={{ ...cmdBtn, opacity: selectedId ? 1 : 0.5 }} onClick={() => insertTask(selectedId, 'above')} disabled={!selectedId} title="Inserir linha acima da selecionada">↑ Acima</button>
                          <button style={{ ...cmdBtn, opacity: selectedId ? 1 : 0.5 }} onClick={() => insertTask(selectedId, 'below')} disabled={!selectedId} title="Inserir linha abaixo da selecionada">↓ Abaixo</button>
                          <button style={{ ...cmdBtn, opacity: selectedId ? 1 : 0.5 }} onClick={() => insertTask(selectedId, 'below', true)} disabled={!selectedId} title="Inserir um marco (evento de duração zero) abaixo da tarefa selecionada">◆ Marco</button>
                        </div>
                      </div>
                      <div style={caption}>Tarefas</div>
                    </div>

                    <div style={groupBox}>
                      <div style={{ ...groupContent, justifyContent: 'center' }}>
                        <div style={rowStyle}>
                          <button style={iconBtn} onClick={() => setShowPavimentos(true)} title="Inserir pavimentos automaticamente como subtarefas">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="4" rx="1"/><rect x="3" y="17" width="18" height="4" rx="1"/></svg>
                          </button>
                        </div>
                      </div>
                      <div style={caption}>Estrutura</div>
                    </div>

                    <div style={groupBox}>
                      <div style={{ ...groupContent, justifyContent: 'center' }}>
                        <div style={rowStyle}>
                          <button style={cmdBtn} onClick={() => setShowImportEAP(true)} title="Importar uma EAP pronta de planilha Excel/CSV">
                            <Icon name="upload" size={13} /> Importar EAP
                          </button>
                        </div>
                      </div>
                      <div style={caption}>EAP</div>
                    </div>

                    <div style={groupBox}>
                      <div style={{ ...groupContent, justifyContent: 'center' }}>
                        <div style={rowStyle}>
                          <button style={cmdBtn} onClick={() => setShowAddCol(true)} title="Adicionar coluna personalizada">
                            <Icon name="plus" size={13} /> Nova coluna
                          </button>
                        </div>
                      </div>
                      <div style={caption}>Colunas</div>
                    </div>
                  </>
                )}

                {/* ══ Aba EXIBIR ══ (conjunto inicial; refinar depois) */}
                {curTab === 'exibir' && (
                  <>
                    {/* Colunas (mostrar/ocultar) com popover ancorado */}
                    <div style={groupBox}>
                      <div style={{ ...groupContent, justifyContent: 'center' }}>
                        <div style={rowStyle}>
                          <div ref={colPanelRef} style={{ position: 'relative' }}>
                            <button style={{ ...cmdBtn, position: 'relative' }} onClick={() => setShowColPanel(v => !v)} title="Mostrar/ocultar colunas">
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
                              Colunas{hiddenCols.size > 0 && <span style={{ marginLeft: 4, background: 'var(--brand)', color: 'white', borderRadius: 10, fontSize: 10, padding: '0 5px' }}>{hiddenCols.size}</span>}
                            </button>
                            {showColPanel && (
                              <div style={{
                                position: 'absolute', left: 0, top: '100%', marginTop: 4,
                                background: 'var(--surface)', border: '1px solid var(--border)',
                                borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.13)',
                                padding: '8px 0', zIndex: 9999, minWidth: 200,
                                maxHeight: 340, overflowY: 'auto',
                              }}>
                                <div style={{ padding: '4px 14px 8px', fontSize: 11, fontWeight: 600, color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid var(--border-subtle)' }}>
                                  Visibilidade das colunas
                                </div>
                                {colOrder.filter(c => !LISTA_FROZEN.includes(c)).map(colId => {
                                  const col = LISTA_COL_DEFS[colId];
                                  if (!col) return null;
                                  const colVis = !hiddenCols.has(colId);
                                  return (
                                    <label key={colId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, color: colVis ? 'var(--text)' : 'var(--text-faint)' }}
                                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover, rgba(0,0,0,0.04))'}
                                      onMouseLeave={e => e.currentTarget.style.background = ''}>
                                      <input type="checkbox" checked={colVis} onChange={() => toggleColVisibility(colId)}
                                        style={{ accentColor: 'var(--brand)', width: 14, height: 14, cursor: 'pointer' }} />
                                      {col.label}
                                    </label>
                                  );
                                })}
                                {customCols.length > 0 && customCols.map(col => {
                                  const colVis = !hiddenCols.has(col.id);
                                  return (
                                    <label key={col.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, color: colVis ? 'var(--text)' : 'var(--text-faint)' }}
                                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover, rgba(0,0,0,0.04))'}
                                      onMouseLeave={e => e.currentTarget.style.background = ''}>
                                      <input type="checkbox" checked={colVis} onChange={() => toggleColVisibility(col.id)}
                                        style={{ accentColor: 'var(--brand)', width: 14, height: 14, cursor: 'pointer' }} />
                                      {col.label}
                                    </label>
                                  );
                                })}
                                {hiddenCols.size > 0 && (
                                  <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '6px 14px 2px' }}>
                                    <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 0', color: 'var(--brand)' }}
                                      onClick={() => onHiddenColsChange(new Set())}>
                                      Mostrar todas
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div style={caption}>Colunas</div>
                    </div>

                    {/* Exibição (altura da linha) */}
                    {!readOnly && (
                      <div style={groupBox}>
                        <div style={{ ...groupContent, justifyContent: 'center' }}>
                          <div style={rowStyle}>
                            <button style={cmdBtn} title="Altura da(s) linha(s) selecionada(s), ou de todas se nada estiver selecionado"
                              onClick={() => { const ids = [...selectedRowIds()]; setRowHDialogTargets(ids.length ? ids : filtrada.map(t => t.id)); setShowRowHDialog(true); }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="12" x2="3" y2="12"/><line x1="21" y1="18" x2="3" y2="18"/></svg>
                              Altura da linha
                            </button>
                          </div>
                        </div>
                        <div style={caption}>Exibição</div>
                      </div>
                    )}

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

                    {/* Mostrar/Ocultar (estilo MS Project) */}
                    <div style={groupBox}>
                      <div style={{ ...groupContent, justifyContent: 'center', alignItems: 'flex-start', gap: 7 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          <input type="checkbox" checked={showProjSummary} onChange={() => onToggleProjSummary?.()} style={{ accentColor: 'var(--brand)' }} />
                          Tarefa Resumo do Projeto
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          <input type="checkbox" checked={showSummaryTasks} onChange={() => onToggleSummaryTasks?.()} style={{ accentColor: 'var(--brand)' }} />
                          Tarefas Resumo
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          <input type="checkbox" checked={showTaskForm} onChange={() => setShowTaskForm(v => !v)} style={{ accentColor: 'var(--brand)' }} />
                          Detalhes
                        </label>
                      </div>
                      <div style={caption}>Mostrar/Ocultar</div>
                    </div>
                  </>
                )}

                {/* ══ Aba FILTRO ══ */}
                {curTab === 'filtro' && (
                  <>
                    {/* Filtros rápidos: responsável, tarefa pai (mostra pai + toda a descendência) */}
                    <div style={groupBox}>
                      <div style={{ ...groupContent, justifyContent: 'center' }}>
                        <div style={rowStyle}>
                          <input className="input" style={{ height: 26, fontSize: 12, minWidth: 130 }}
                            placeholder="Responsável..." value={filtroResp} onChange={e => setFiltroResp(e.target.value)} />
                          <select className="input" style={{ height: 26, fontSize: 12, width: 140 }}
                            value={filtroVinculo} onChange={e => setFiltroVinculo?.(e.target.value)}>
                            <option value="">Todas (vínculo)</option>
                            <option value="vinculado">Vinculadas</option>
                            <option value="nao_vinculado">Não vinculadas</option>
                          </select>
                        </div>
                        <div style={rowStyle}>
                          <input className="input" style={{ height: 26, fontSize: 12, minWidth: 150 }}
                            placeholder="Buscar tarefa..." value={filtroTexto} onChange={e => setFiltroTexto?.(e.target.value)} />
                          <TaskMultiSelectFilter
                            etapas={etapas} wbsMap={wbsMap}
                            selectedIds={filtroTaskIds} onApply={ids => setFiltroTaskIds?.(ids)}
                            buttonStyle={{ width: 140 }}
                          />
                        </div>
                        {temFiltro && (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{filtrada.length} de {visible.length} exibidas</span>
                        )}
                      </div>
                      <div style={caption}>Filtros rápidos</div>
                    </div>

                    {/* Filtros predefinidos, estilo MS Project */}
                    <div style={groupBox}>
                      <div style={{ ...groupContent, justifyContent: 'center' }}>
                        <div style={rowStyle}>
                          <select className="input" style={{ height: 26, fontSize: 12, minWidth: 170 }}
                            value={filtroPreset} onChange={e => setFiltroPreset?.(e.target.value)}>
                            {FILTRO_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                          </select>
                        </div>
                        {filtroPreset === 'intervalo' && (
                          <div style={rowStyle}>
                            <input type="date" className="input" style={{ height: 26, fontSize: 12 }}
                              value={filtroPresetRange?.de || ''}
                              onChange={e => setFiltroPresetRange?.(r => ({ ...(r || {}), de: e.target.value }))} />
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>até</span>
                            <input type="date" className="input" style={{ height: 26, fontSize: 12 }}
                              value={filtroPresetRange?.ate || ''}
                              onChange={e => setFiltroPresetRange?.(r => ({ ...(r || {}), ate: e.target.value }))} />
                          </div>
                        )}
                      </div>
                      <div style={caption}>Filtros predefinidos</div>
                    </div>

                    {/* Dados (limpar filtros) */}
                    <div style={groupBox}>
                      <div style={{ ...groupContent, justifyContent: 'center' }}>
                        <div style={rowStyle}>
                          <button style={{ ...cmdBtn, opacity: temFiltro ? 1 : 0.5 }} disabled={!temFiltro} onClick={limparFiltros} title="Limpar todos os filtros">
                            <Icon name="filter" size={13} /> Limpar filtros
                          </button>
                        </div>
                      </div>
                      <div style={caption}>Dados</div>
                    </div>
                  </>
                )}

                {/* ══ Aba EXPORTAR ══ */}
                {curTab === 'exportar' && (
                  <div style={groupBox}>
                    <div style={{ ...groupContent, justifyContent: 'center' }}>
                      <div style={rowStyle}>
                        <button style={cmdBtn} onClick={exportExcelLista} title="Exportar para Excel (.xlsx)">
                          <Icon name="download" size={13} /> Excel
                        </button>
                        <select value={pdfFormat} onChange={e => setPdfFormat(e.target.value)} title="Tamanho da folha do PDF"
                          style={{ fontSize: 12, height: 28, padding: '0 4px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}>
                          <option value="a4">A4</option>
                          <option value="a3">A3</option>
                          <option value="a2">A2</option>
                          <option value="a1">A1</option>
                        </select>
                        <button style={{ ...cmdBtn, minWidth: 70 }} onClick={exportPDFLista} disabled={exportingPDF} title="Exportar para PDF">
                          <Icon name="download" size={13} /> {exportingPDF ? 'Gerando…' : 'PDF'}
                        </button>
                      </div>
                    </div>
                    <div style={caption}>Exportar</div>
                  </div>
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
                    <div style={groupBox}>
                      <div style={{ ...groupContent, justifyContent: 'center' }}>
                        <div style={rowStyle}>
                          <button style={cmdBtn} onClick={onProjectInfo} title="Ver o resumo do projeto (somente leitura)">
                            <Icon name="file" size={13} /> Informações do projeto
                          </button>
                        </div>
                      </div>
                      <div style={caption}>Projeto</div>
                    </div>
                  </>
                )}

              </div>
            )}
          </>
        );
      })()}

      {/* ── Tabela ───────────────────────────────────────────────────────── */}
      <div ref={listaScrollRef} tabIndex={-1} onKeyDown={handleListKeyDown} onPaste={handlePasteEvent} onScroll={() => { if (marquee) setMarquee(null); }} style={{ overflow: 'auto', flex: 1, minHeight: 0, outline: 'none', userSelect: 'none', WebkitUserSelect: 'none', position: 'relative' }}>
        <table className="tbl tbl-lista" style={{ minWidth: 1780 + GUTTER_W, tableLayout: 'fixed', '--lista-row-h': rowH + 'px' }}>
          {/* Larguras autoritativas por coluna. Com table-layout: fixed as larguras vêm do
              colgroup (não do conteúdo montado), então as colunas param de "dançar" ao rolar
              com a virtualização. Mesma ordem e contagem que o corpo emite. */}
          <colgroup>
            <col style={{ width: GUTTER_W }} />
            {colOrder.filter(c => !hiddenCols.has(c)).map(colId => (
              <col key={colId} style={{ width: getColW(colId) }} />
            ))}
            {customCols.filter(col => !hiddenCols.has(col.id)).map(col => (
              <col key={col.id} style={{ width: getColW(col.id) || 110 }} />
            ))}
            <col style={{ width: 36 }} />
          </colgroup>
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
                    <th colSpan={frozenVis.length} className="band-th" title={LISTA_BAND_LABELS.etapa} style={{ position: 'sticky', top: 0, left: GUTTER_W, zIndex: 6, width: frozenW, minWidth: frozenW }}>
                      {LISTA_BAND_LABELS.etapa}
                    </th>
                  )}
                  {runs.map((r, i) => (
                    <th key={'band-' + i} colSpan={r.cols.length} className="band-th" title={LISTA_BAND_LABELS[r.band] || ''}>{LISTA_BAND_LABELS[r.band] || ''}</th>
                  ))}
                  {custVis.length > 0 && <th colSpan={custVis.length} className="band-th" title={LISTA_BAND_LABELS.custom}>{LISTA_BAND_LABELS.custom}</th>}
                  <th className="band-th" />
                </tr>
              );
            })()}
            <tr>
              <th onClick={selectAll} title="Selecionar tudo" style={{ width: GUTTER_W, minWidth: GUTTER_W, position: 'sticky', top: bandTop, left: 0, zIndex: 7, userSelect: 'none', cursor: 'pointer', boxShadow: '0 1px 0 0 var(--brand)' }} />
              {colOrder.filter(c => !hiddenCols.has(c)).map(colId => renderTh(colId))}
              {customCols.filter(col => !hiddenCols.has(col.id)).map(col => (
                <th key={col.id} style={{ minWidth: getColW(col.id) || 110, position: 'sticky', top: bandTop, zIndex: 3, userSelect: 'none', cursor: 'pointer', textAlign: 'left', boxShadow: '0 1px 0 0 var(--brand)',
                    ...(multiSelCols.includes(col.id) ? { background: 'color-mix(in srgb, white 22%, var(--brand))' } : {}) }}
                  onClick={(ev) => { if (ev.target.closest('[data-colmenu]')) return; selectColumn(col.id, ev); }}
                  onContextMenu={(ev) => { if (ev.target.closest('[data-colmenu]')) return; ev.preventDefault(); setCtxMenu({ x: ev.clientX, y: ev.clientY, kind: 'col', colId: col.id }); }}>
                  <span style={{ display: 'block', paddingRight: 24, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.label}</span>
                  <span data-colmenu
                    style={{ position: 'absolute', right: 4, top: 0, bottom: 0, zIndex: 4, display: 'flex', alignItems: 'center', paddingLeft: 2 }}>
                    <ColumnHeaderFilterMenu
                      label={col.label}
                      type={resolveColType(col.id, customCols)}
                      activeFilter={columnFilters[col.id] || null}
                      sortDir={sortSpec?.colId === col.id ? sortSpec.dir : null}
                      onSort={(dir) => setSortSpec({ colId: col.id, dir })}
                      onApplyFilter={(excluded) => setColumnFilters(prev => {
                        if (!excluded.length) { const n = { ...prev }; delete n[col.id]; return n; }
                        return { ...prev, [col.id]: { excluded } };
                      })}
                      onClearFilter={() => setColumnFilters(prev => { const n = { ...prev }; delete n[col.id]; return n; })}
                      getDomainEntries={() => buildDomainEntries(col.id)}
                    />
                  </span>
                  <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 5, cursor: 'col-resize', zIndex: 5 }}
                    onClick={(ev) => ev.stopPropagation()} onMouseDown={(ev) => { ev.stopPropagation(); startColResize(ev, col.id); }}
                    onDoubleClick={(ev) => { ev.stopPropagation(); autoFitColumn(col.id); }} />
                </th>
              ))}
              <th style={{ width: 36, padding: '0 8px', textAlign: 'center', position: 'sticky', top: bandTop, zIndex: 3 }}>
                <button
                  onClick={() => setShowAddCol(true)}
                  title="Adicionar coluna personalizada"
                  style={{ color: 'var(--text-faint)', fontSize: 18, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontWeight: 300 }}
                >+</button>
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Tarefa Resumo do Projeto: linha 0 sintética que agrega a obra inteira (só leitura) */}
            {showProjSummary && (() => {
              const leaves = etapas.filter(x => !x.isGroup);
              const projInicio = leaves.length ? Math.min(...leaves.map(x => x.inicio)) : 0;
              const projFim    = leaves.length ? Math.max(...leaves.map(x => taskEnd(x))) : 0;
              const projDur    = Math.max(0, projFim - projInicio);
              const w  = (x) => custoOrcadoMap[x.id] || 0;
              const tp = leaves.reduce((s, x) => s + w(x), 0);
              const projAvanco = !tp
                ? (leaves.length ? leaves.reduce((s, x) => s + (x.avanco || 0), 0) / leaves.length : 0)
                : leaves.reduce((s, x) => s + (x.avanco || 0) * w(x), 0) / tp;
              const bg   = 'color-mix(in srgb, var(--brand) 14%, var(--surface))';
              const num  = { textAlign: 'right', fontWeight: 700, fontSize: 12 };
              const stick = (cid, extra) => ({ position: 'sticky', left: frozenLeft[cid], background: bg, zIndex: 1, isolation: 'isolate', ...extra });
              const fmtDt = (o) => offsetToDate(o).toLocaleDateString('pt-BR');
              const cellFor = {
                wbs:   <td key="wbs" style={stick('wbs')} />,
                id:    <td key="id" style={stick('id')} />,
                etapa: <td key="etapa" style={stick('etapa', { fontWeight: 700, fontSize: 12.5, color: 'var(--brand)', boxShadow: '1px 0 0 var(--border)' })}><span style={{ paddingLeft: 10 }}>{obraNome}</span></td>,
                inicio: <td key="inicio" className="mono text-sm">{leaves.length ? fmtDt(projInicio) : ''}</td>,
                fim:    <td key="fim" className="mono text-sm">{leaves.length ? fmtDt(projFim) : ''}</td>,
                duracao: <td key="duracao" className="mono num" style={{ textAlign: 'center' }}><span className="mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{projDur}d</span></td>,
                avanco: <td key="avanco"><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ flex: 1, minWidth: 50 }}><div className="progress groupbar"><span style={{ width: projAvanco + '%' }} /></div></div><span className="num" style={{ fontWeight: 700, fontSize: 12.5, minWidth: 34, textAlign: 'right' }}>{projAvanco.toFixed(2)}%</span></div></td>,
                peso:   <td key="peso" className="num mono" style={num}>100%</td>,
                valorVinculado: <td key="valorVinculado" className="num mono" style={num}>{totalValorVinculado ? fmtBRL(totalValorVinculado) : '—'}</td>,
                custo:  <td key="custo" className="num mono" style={num}>{fmtBRL(totalCustoEf)}</td>,
                custoReal: <td key="custoReal" className="num mono" style={num}>{fmtBRL(totalReal)}</td>,
                custoOrcado: <td key="custoOrcado" className="num mono" style={num}>{fmtBRL(totalCustoOrcado)}</td>,
                saldo:  <td key="saldo" className="num mono" style={{ ...num, color: totalSaldo < 0 ? 'var(--danger)' : 'inherit' }}>{fmtBRL(totalCustoEf - totalReal)}</td>,
              };
              return (
                <tr style={{ fontWeight: 600, borderBottom: '2px solid var(--border)', background: bg, height: 40 }}>
                  <td style={{ position: 'sticky', left: 0, zIndex: 2, background: bg, isolation: 'isolate', width: GUTTER_W, minWidth: GUTTER_W, borderLeft: '3px solid var(--brand)' }} />
                  {colOrder.filter(c => !hiddenCols.has(c)).map(c => cellFor[c] || <td key={c} />)}
                  {customCols.filter(col => !hiddenCols.has(col.id)).map(col => <td key={col.id} />)}
                  <td />
                </tr>
              );
            })()}
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
              const hasChildren = parentIdSet.has(e.id);
              const gv          = e.isGroup ? groupVals[e.id] : null;
              const isMultiSel  = multiSel.includes(e.id);
              const eInicio     = gv ? gv.inicio : e.inicio;
              const eDur        = gv ? gv.dur    : e.dur;
              const eAvanco     = gv ? gv.avanco : e.avanco;

              // Background explícito para células sticky (colunas congeladas).
              // var(--brand-tint) em vez de color-mix(): color-mix é calculado em tempo de
              // pintura e, numa célula sticky recém-reordenada no DOM (recortar/colar), o
              // navegador podia deixar de repintar o fundo corretamente até a linha ser
              // deselecionada — variável simples não tem esse problema.
              // Tarefa-pai dentro de outra tarefa-pai: tom mais forte pro nível mais alto (raiz
              // da EAP), enfraquecendo a cada nível mais fundo — mesma escala usada no Gantt e na
              // Curva Física, pra não cair todo grupo no mesmo azul plano.
              const groupLvl = e.nivel || 0;
              const groupTint = groupLvl <= 0 ? 'var(--brand-100)' : groupLvl === 1 ? 'var(--brand-50)' : 'var(--brand-tint)';
              const groupLevelClass = e.isGroup ? (groupLvl <= 0 ? 'lista-row-group-l0' : groupLvl === 1 ? 'lista-row-group-l1' : 'lista-row-group-l2') : '';
              const frozenBg = (isSelected || isMultiSel)
                ? 'var(--brand-tint)'
                : e.isGroup ? groupTint : 'var(--surface)';
              // A calha (número da linha) não passa por decorateCell/rangeSelStyle como as
              // demais colunas, mas segue a mesma regra: seleção de intervalo não pinta o
              // fundo, só a borda (feita pela célula da 1ª coluna do intervalo).
              const gutterBg = frozenBg;
              // isolation: a coluna congelada ganha seu próprio contexto de empilhamento, então
              // seu z-index só compete com o que está DENTRO dela — sem isso, o navegador pode
              // ocasionalmente deixar o conteúdo das colunas normais (datas, duração, valores)
              // vazar por cima da coluna congelada em vez de rolar escondido por baixo dela.
              const stickyStyle = (colId) => ({
                position: 'sticky', left: frozenLeft[colId], zIndex: 1, background: frozenBg,
                isolation: 'isolate',
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
                      {/* Indentação da hierarquia (acima) fica fixa; só o texto do nome
                         responde ao alinhamento, pra não quebrar a leitura da EAP. */}
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: alignJC(effFmt(e, 'etapa').align) }}>
                        <EditableCell value={e.etapa} onSave={v => v.trim() && handleCellSave(e.id, 'etapa', v)}
                          readOnly={readOnly} style={{ fontWeight: e.isGroup ? 700 : 400, fontSize: e.isGroup ? 12 : 11 }}
                          onExitEdit={exitEdit} />
                      </div>
                    </div>
                  </td>
                ),
                inicio: (
                  <td key="inicio" className="mono text-sm" onClick={ev => ev.stopPropagation()}>
                    <EditableCell type="date" value={offsetToISO(eInicio)}
                      onSave={v => handleCellSave(e.id, 'inicio', v)} readOnly={readOnly || e.isGroup}
                      onExitEdit={exitEdit} />
                  </td>
                ),
                fim: (
                  <td key="fim" className="mono text-sm" onClick={ev => ev.stopPropagation()}>
                    <EditableCell type="date" value={offsetToISO(e.isGroup ? eInicio + eDur : workEnd(eInicio, eDur))}
                      onSave={v => handleCellSave(e.id, 'fim', v)} readOnly={readOnly || e.isGroup}
                      onExitEdit={exitEdit} />
                  </td>
                ),
                duracao: (
                  <td key="duracao" className="mono num" style={{ textAlign: 'center' }} onClick={ev => ev.stopPropagation()}>
                    {e.isGroup ? (
                      <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{eDur}d</span>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'center' }}>
                        {/* Largura fixa no wrapper (não no input): o input do EditableCell usa
                           width:100% ao editar, então sem isso ele estica até a borda da coluna
                           e empurra o "d" pra longe — o 100% precisa resolver contra uma caixa
                           pequena, não contra a linha toda. */}
                        <div style={{ width: 32, flexShrink: 0 }}>
                          <EditableCell type="number" value={String(e.dur)}
                            onSave={v => handleCellSave(e.id, 'duracaoDias', v)} readOnly={readOnly}
                            onExitEdit={exitEdit} />
                        </div>
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
                          style={{ fontFamily: 'var(--font-mono)', fontSize: 12, minWidth: 28 }}
                          onExitEdit={exitEdit} />
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
                        onKeyDown={ev => {
                          ev.stopPropagation();
                          if (ev.key === 'Enter') { ev.preventDefault(); ev.currentTarget.blur(); listaScrollRef.current?.focus?.({ preventScroll: true }); advanceCellDown(selectedCell); }
                          if (ev.key === 'Escape') { setEditingCusto(null); listaScrollRef.current?.focus?.({ preventScroll: true }); }
                        }}
                      />
                    ) : (
                      <span className="mono" style={{ fontSize: 12, cursor: 'text', display: 'block', textAlign: 'right' }}
                        onDoubleClick={() => setEditingCusto(e.id + '_custo')}>{fmtBRL(e.custo || 0)}</span>
                    )}
                  </td>
                ),
                peso: (
                  <td key="peso" className="num mono" style={{ textAlign: 'right', fontSize: 12, fontWeight: e.isGroup ? 700 : 400, color: e.isGroup ? 'var(--text)' : 'var(--text-muted)' }}>
                    {(() => {
                      const val = custoOrcadoMap[e.id] || 0;
                      return totalCustoOrcado > 0 ? (val / totalCustoOrcado * 100).toFixed(1) + '%' : '—';
                    })()}
                  </td>
                ),
                fatorPeso: (
                  <td key="fatorPeso" className="num" style={{ textAlign: 'right', fontSize: 12 }} onClick={ev => ev.stopPropagation()}>
                    {e.isGroup ? (
                      <span className="text-faint">—</span>
                    ) : readOnly || effStatus(e) === 'done' ? (
                      <span className="mono" style={{ display: 'block', textAlign: 'right' }}
                        title={!readOnly ? 'Tarefa concluída — peso e valor travados' : undefined}>{(e.fator_peso ?? 1).toLocaleString('pt-BR')}</span>
                    ) : editingFatorPeso === e.id ? (
                      <input
                        autoFocus type="number" min="0" step="any"
                        defaultValue={e.fator_peso ?? 1}
                        style={{ width: 72, textAlign: 'right', border: 'none', outline: '2px solid var(--brand)', borderRadius: 4, padding: '2px 6px', fontSize: 12, fontFamily: 'var(--font-mono)', background: 'var(--surface)', boxSizing: 'border-box' }}
                        onBlur={ev => { handleCellSave(e.id, 'fator_peso', ev.target.value); setEditingFatorPeso(null); }}
                        onKeyDown={ev => {
                          ev.stopPropagation();
                          if (ev.key === 'Enter') { ev.preventDefault(); ev.currentTarget.blur(); listaScrollRef.current?.focus?.({ preventScroll: true }); advanceCellDown(selectedCell); }
                          if (ev.key === 'Escape') { setEditingFatorPeso(null); listaScrollRef.current?.focus?.({ preventScroll: true }); }
                        }}
                      />
                    ) : (
                      <span className="mono" style={{ cursor: 'text', display: 'block', textAlign: 'right' }}
                        onDoubleClick={() => setEditingFatorPeso(e.id)}>
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
                    ) : valorVinculadoMap[e.id] ? (
                      <span className="mono" style={{ fontSize: 12, display: 'block', textAlign: 'right', cursor: 'not-allowed', color: 'var(--text-muted)' }}
                        title="Não é possível editar: esta tarefa tem valor vinculado ao orçamento. O custo real é derivado do vínculo.">
                        {fmtBRL(e.custoRealizado || 0)}
                      </span>
                    ) : editingCusto === e.id + '_real' ? (
                      <input autoFocus type="number" min="0" defaultValue={e.custoRealizado || 0}
                        style={{ width: 100, textAlign: 'right', border: 'none', outline: '2px solid var(--brand)', borderRadius: 4, padding: '2px 6px', fontSize: 12, fontFamily: 'var(--font-mono)', background: 'var(--surface)', boxSizing: 'border-box' }}
                        onBlur={ev => { handleCellSave(e.id, 'custoRealizado', ev.target.value); setEditingCusto(null); }}
                        onKeyDown={ev => {
                          ev.stopPropagation();
                          if (ev.key === 'Enter') { ev.preventDefault(); ev.currentTarget.blur(); listaScrollRef.current?.focus?.({ preventScroll: true }); advanceCellDown(selectedCell); }
                          if (ev.key === 'Escape') { setEditingCusto(null); listaScrollRef.current?.focus?.({ preventScroll: true }); }
                        }}
                      />
                    ) : (
                      <span className="mono" style={{ fontSize: 12, cursor: 'text', display: 'block', textAlign: 'right' }}
                        onDoubleClick={() => setEditingCusto(e.id + '_real')}>{fmtBRL(e.custoRealizado || 0)}</span>
                    )}
                  </td>
                ),
                custoOrcado: (
                  <td key="custoOrcado" className="num mono" style={{ textAlign: 'right', fontSize: 12 }}>
                    {fmtBRL(custoOrcadoMap[e.id] || 0)}
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
                      <EditableCell value={e.responsavel || ''} onSave={v => handleCellSave(e.id, 'responsavel', v)} readOnly={readOnly} style={{ fontSize: 12.5 }}
                        onExitEdit={exitEdit} />
                    )}
                  </td>
                ),
                pavimento: (
                  <td key="pavimento" onClick={ev => ev.stopPropagation()}>
                    {e.isGroup ? null : (
                      <EditableCell value={e.pavimento || ''} listId="dl-pavimento"
                        onSave={v => handleCellSave(e.id, 'pavimento', v)} readOnly={readOnly} style={{ fontSize: 12.5 }}
                        onExitEdit={exitEdit} />
                    )}
                  </td>
                ),
                dep: (
                  <td key="dep" onClick={ev => ev.stopPropagation()}>
                    {e.isGroup ? null : editingDep === e.id ? (
                      <input autoFocus defaultValue={formatDepList(e.dep, etapas)}
                        style={{ width: '100%', border: 'none', outline: '2px solid var(--brand)', borderRadius: 4, padding: '2px 6px', fontSize: 12, fontFamily: 'var(--font-mono)', background: 'var(--surface)', boxSizing: 'border-box' }}
                        onBlur={ev => { handleCellSave(e.id, 'dep', ev.target.value); setEditingDep(null); }}
                        onKeyDown={ev => {
                          ev.stopPropagation();
                          if (ev.key === 'Enter') { ev.preventDefault(); ev.currentTarget.blur(); listaScrollRef.current?.focus?.({ preventScroll: true }); advanceCellDown(selectedCell); }
                          if (ev.key === 'Escape') { setEditingDep(null); listaScrollRef.current?.focus?.({ preventScroll: true }); }
                        }} />
                    ) : (() => {
                      const txt = formatDepList(e.dep, etapas);
                      return (
                        <div onDoubleClick={() => !readOnly && setEditingDep(e.id)} className="mono" style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: readOnly ? 'default' : 'text', minHeight: 20 }} title={formatDepNames(e.dep) || undefined}>
                          {txt || <span className="text-faint">—</span>}
                        </div>
                      );
                    })()}
                  </td>
                ),
                succ: (
                  <td key="succ" onClick={ev => ev.stopPropagation()}>
                    {e.isGroup ? null : editingSucc === e.id ? (
                      <input autoFocus defaultValue={formatSucc(e.id)}
                        style={{ width: '100%', border: 'none', outline: '2px solid var(--brand)', borderRadius: 4, padding: '2px 6px', fontSize: 12, fontFamily: 'var(--font-mono)', background: 'var(--surface)', boxSizing: 'border-box' }}
                        onBlur={ev => { handleSuccSave(e.id, ev.target.value); setEditingSucc(null); }}
                        onKeyDown={ev => {
                          ev.stopPropagation();
                          if (ev.key === 'Enter') { ev.preventDefault(); ev.currentTarget.blur(); listaScrollRef.current?.focus?.({ preventScroll: true }); advanceCellDown(selectedCell); }
                          if (ev.key === 'Escape') { setEditingSucc(null); listaScrollRef.current?.focus?.({ preventScroll: true }); }
                        }} />
                    ) : (() => {
                      const txt = formatSucc(e.id);
                      return (
                        <div onDoubleClick={() => !readOnly && setEditingSucc(e.id)} className="mono" style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: readOnly ? 'default' : 'text', minHeight: 20 }} title={formatSuccNames(e.id) || undefined}>
                          {txt || <span className="text-faint">—</span>}
                        </div>
                      );
                    })()}
                  </td>
                ),
                modo: (
                  <td key="modo" onClick={ev => ev.stopPropagation()} style={{ textAlign: 'center', position: 'relative', overflow: 'visible' }}>
                    {!e.isGroup && (() => {
                      const manual = e.modo === 'manual';
                      return (
                        <div ref={openModoMenu === e.id ? modoMenuRef : undefined} style={{ position: 'relative', display: 'inline-block' }}>
                          <button
                            title={manual ? 'Agendada Manualmente (datas fixas)' : 'Agendada Automaticamente (calculada por dependências)'}
                            onClick={ev => { ev.stopPropagation(); if (readOnly) return; setOpenModoMenu(openModoMenu === e.id ? null : e.id); }}
                            style={{ boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 18, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', cursor: readOnly ? 'default' : 'pointer', color: manual ? 'var(--brand)' : 'var(--text-muted)' }}>
                            <Icon name={manual ? 'pin' : 'clock'} size={12} />
                          </button>
                          {openModoMenu === e.id && !readOnly && (
                            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 60, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 10px 30px rgba(0,0,0,0.18)', padding: 4, minWidth: 210, textAlign: 'left' }}>
                              {[
                                { v: 'auto', ic: 'clock', label: 'Agendada Automaticamente' },
                                { v: 'manual', ic: 'pin', label: 'Agendada Manualmente' },
                              ].map(opt => (
                                <button key={opt.v}
                                  onClick={() => { setOpenModoMenu(null); handleCellSave(e.id, 'modo', opt.v); }}
                                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', border: 'none', background: (e.modo || 'auto') === opt.v ? 'var(--brand-tint)' : 'none', color: 'var(--text)', cursor: 'pointer', fontSize: 12.5, padding: '7px 10px', borderRadius: 6 }}
                                  onMouseEnter={ev => { if ((e.modo || 'auto') !== opt.v) ev.currentTarget.style.background = 'var(--surface-muted)'; }}
                                  onMouseLeave={ev => { if ((e.modo || 'auto') !== opt.v) ev.currentTarget.style.background = 'none'; }}>
                                  <Icon name={opt.ic} size={14} /> {opt.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                ),
                restricao: (
                  <td key="restricao" className="mono text-sm" onClick={ev => ev.stopPropagation()}>
                    {!e.isGroup && (
                      <EditableCell type="date" value={e.restricaoData || ''}
                        onSave={v => handleCellSave(e.id, 'restricao', v)}
                        readOnly={readOnly}
                        style={{ fontSize: 12.5 }}
                        onExitEdit={exitEdit} />
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
                    (isSelected || isMultiSel) ? 'lista-row-selected' : e.isGroup ? `lista-row-group ${groupLevelClass}` : '',
                    rowIdx % 2 === 1 ? 'lista-row-alt' : '',
                    dragOverId === e.id ? 'drag-over-row' : '',
                  ].filter(Boolean).join(' ')}
                  onContextMenu={(ev) => { ev.preventDefault(); setCtxMenu({ x: ev.clientX, y: ev.clientY, kind: 'row', taskId: e.id }); }}
                  onClick={(ev) => {
                    // Acabou de mover a linha pela borda: não alterna a seleção neste clique
                    if (rowDragMovedRef.current) { rowDragMovedRef.current = false; return; }
                    // O mousedown de uma célula ou da calha já tratou a seleção deste clique
                    // (fallback só para cliques que não passaram por nenhum <td> decorado).
                    const alreadyHandled = rowClickHandledRef.current;
                    rowClickHandledRef.current = false;
                    if (alreadyHandled) return;
                    if (ev.shiftKey) {
                      // Shift+clique: estende a seleção da última âncora (linha selecionada ou
                      // última do multiSel) até a linha clicada, na ordem visível (filtrada).
                      ev.preventDefault();
                      const rows = filtrada.map(x => x.id);
                      const anchorId = selectedId ?? (multiSel.length ? multiSel[multiSel.length - 1] : null);
                      const i1 = anchorId != null ? rows.indexOf(anchorId) : -1;
                      const i2 = rows.indexOf(e.id);
                      if (i1 === -1 || i2 === -1) {
                        setSelectedId(e.id);
                        setMultiSel([]);
                      } else {
                        const [lo, hi] = i1 <= i2 ? [i1, i2] : [i2, i1];
                        setMultiSel(rows.slice(lo, hi + 1));
                      }
                    } else if (ev.ctrlKey || ev.metaKey) {
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
                      if (multiSelCols.length) setMultiSelCols([]);
                      if (ev.shiftKey && selAnchor) {
                        // Shift+clique na calha: estende da âncora atual até esta linha — mesmo
                        // intervalo de células que o arraste já produz, só que num clique só.
                        setSelectedCell({ taskId: e.id, colId: cols[cols.length - 1] });
                        rowClickHandledRef.current = true;
                        listaScrollRef.current?.focus?.({ preventScroll: true });
                        return;
                      }
                      rowSelectingRef.current = true;
                      rowSelAnchorRef.current = e.id;
                      isSelectingRef.current = false;
                      setSelAnchor({ taskId: e.id, colId: cols[0] });
                      setSelectedCell({ taskId: e.id, colId: cols[cols.length - 1] });
                      if (ev.ctrlKey || ev.metaKey) {
                        setMultiSel(ms => ms.includes(e.id) ? ms.filter(id => id !== e.id) : [...ms, e.id]);
                      } else {
                        setSelectedId(e.id);
                        setMultiSel([]);
                      }
                      rowClickHandledRef.current = true;
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
                      position: 'sticky', left: 0, zIndex: 2, background: gutterBg, isolation: 'isolate',
                      width: GUTTER_W, minWidth: GUTTER_W, textAlign: 'center',
                      cursor: 'pointer', userSelect: 'none', color: 'var(--text-faint)',
                      fontSize: 11, fontFamily: 'var(--font-mono, monospace)',
                    }}
                  >
                    {rowIdx + 1}
                    {/* Borda inferior da calha: arraste para redimensionar só esta linha (estilo Excel) */}
                    <div title="Arraste para ajustar a altura da linha"
                      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 5, cursor: 'row-resize', zIndex: 3 }}
                      onMouseDown={(ev) => startRowResize(ev, e.id)} />
                  </td>
                  {colOrder.filter(c => !hiddenCols.has(c)).map(colId => decorateCell(cells[colId], colId, e.id, e.fmt, rangeEdges.get(e.id + '|' + colId), rowIdx, rowIdx === filtrada.length - 1))}

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
                          readOnly={readOnly} style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
                          onExitEdit={exitEdit} />
                      </td>
                    );
                    else if (col.type === 'percent') cell = (
                      <td key={col.id} onClick={ev => ev.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: alignJC(effFmt(e, col.id).align) }}>
                          <div style={{ width: 50, flexShrink: 0 }}>
                            <EditableCell type="number" value={cellVal} onSave={v => handleCellSave(e.id, col.id, v)} readOnly={readOnly}
                              onExitEdit={exitEdit} />
                          </div>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>%</span>
                        </div>
                      </td>
                    );
                    else if (col.type === 'duration') cell = (
                      <td key={col.id} onClick={ev => ev.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: alignJC(effFmt(e, col.id).align) }}>
                          <div style={{ width: 50, flexShrink: 0 }}>
                            <EditableCell type="number" value={cellVal} onSave={v => handleCellSave(e.id, col.id, v)} readOnly={readOnly}
                              onExitEdit={exitEdit} />
                          </div>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>d</span>
                        </div>
                      </td>
                    );
                    else if (col.type === 'autocomplete') cell = (
                      <td key={col.id} onClick={ev => ev.stopPropagation()}>
                        <EditableCell type="text" value={cellVal} listId={`dl-${col.id}`}
                          onSave={v => handleCellSave(e.id, col.id, v)} readOnly={readOnly}
                          onExitEdit={exitEdit} />
                      </td>
                    );
                    else cell = (
                      <td key={col.id} onClick={ev => ev.stopPropagation()}>
                        <EditableCell type={col.type} value={cellVal} onSave={v => handleCellSave(e.id, col.id, v)} readOnly={readOnly}
                          onExitEdit={exitEdit} />
                      </td>
                    );
                    return decorateCell(cell, col.id, e.id, e.fmt, rangeEdges.get(e.id + '|' + col.id), rowIdx, rowIdx === filtrada.length - 1);
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
              const semFiltro = !filtroResp && !filtroPreset && !filtroTaskIds.length && !filtroTexto && !filtroVinculo && !Object.keys(columnFilters).length;
              const visCols = colOrder.filter(c => !hiddenCols.has(c));
              const visCustom = customCols.filter(col => !hiddenCols.has(col.id));
              const blankFrozen = (colId) => ({ position: 'sticky', left: frozenLeft[colId], zIndex: 1, background: 'var(--surface)', isolation: 'isolate' });
              if (!readOnly && semFiltro) {
                const nBlanks = Math.max(4, 25 - filtrada.length);
                return Array.from({ length: nBlanks }).map((_, k) => (
                  <tr key={'blank-' + k} className="lista-row-blank" style={{ '--lista-row-h': rowH + 'px' }}>
                    <td style={{ position: 'sticky', left: 0, zIndex: 2, background: 'var(--surface)', isolation: 'isolate', width: GUTTER_W, minWidth: GUTTER_W, textAlign: 'center', color: 'var(--text-faint)', fontSize: 11, fontFamily: 'var(--font-mono, monospace)' }}>
                      {filtrada.length + k + 1}
                    </td>
                    {visCols.map(colId => {
                      if (colId === 'etapa') return (
                        <td key="etapa" style={{ ...blankFrozen('etapa'), padding: 0 }}
                          onMouseDown={(ev) => { if (ev.target.tagName !== 'INPUT') ev.currentTarget.querySelector('input')?.focus(); }}>
                          <input
                            ref={k === 0 ? blankFirstRef : undefined}
                            className="lista-blank-input"
                            placeholder={k === 0 ? 'Nova tarefa…' : ''}
                            onFocus={() => setBlankSelectedIdx(k)}
                            onKeyDown={(ev) => {
                              // Só "selecionada" (sem digitar ainda): qualquer tecla de verdade vira
                              // edição normal — as setas continuam navegando entre linhas, não contam.
                              if (blankSelectedIdx === k && ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') {
                                setBlankSelectedIdx(null);
                              }
                              if (ev.key === 'ArrowDown') {
                                ev.preventDefault();
                                ev.currentTarget.closest('tr')?.nextElementSibling?.querySelector('input.lista-blank-input')?.focus();
                                return;
                              }
                              if (ev.key === 'ArrowUp') {
                                ev.preventDefault();
                                const prevInput = ev.currentTarget.closest('tr')?.previousElementSibling?.querySelector('input.lista-blank-input');
                                if (prevInput) { prevInput.focus(); return; }
                                // 1ª linha em branco: volta o foco pra grade real (última linha).
                                if (!selectedCell) {
                                  const rows = filtrada.map(x => x.id);
                                  if (rows.length) setSelectedCell({ taskId: rows[rows.length - 1], colId: 'etapa' });
                                }
                                listaScrollRef.current?.focus?.({ preventScroll: true });
                                return;
                              }
                              if (ev.key !== 'Enter') return;
                              const v = ev.currentTarget.value;
                              if (v.trim()) { ev.currentTarget.value = ''; createFromBlank(v, k); return; }
                              // Linha vazia: Enter só desce para a próxima linha em branco (estilo Excel).
                              ev.preventDefault();
                              ev.currentTarget.closest('tr')?.nextElementSibling?.querySelector('input.lista-blank-input')?.focus();
                            }}
                            onBlur={(ev) => {
                              setBlankSelectedIdx(idx => idx === k ? null : idx);
                              const v = ev.currentTarget.value;
                              if (v.trim()) { ev.currentTarget.value = ''; createFromBlank(v, k); }
                            }}
                            style={{
                              width: '100%', height: '100%', border: 'none', background: 'transparent',
                              font: 'inherit', fontSize: 11, color: 'var(--text)', padding: '0 10px 0 30px',
                              outline: blankSelectedIdx === k ? '2px solid var(--brand)' : 'none', outlineOffset: -2,
                              caretColor: blankSelectedIdx === k ? 'transparent' : 'auto',
                            }}
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
              const w = (x) => custoOrcadoMap[x.id] || 0;
              const tp = leaves.reduce((s, x) => s + w(x), 0);
              const totalPct = !tp
                ? (leaves.length ? Math.round(leaves.reduce((s, x) => s + (x.avanco || 0), 0) / leaves.length) : 0)
                : Math.round(leaves.reduce((s, x) => s + (x.avanco || 0) * w(x), 0) / tp);
              const footSaldo = totalCustoEf - totalReal; // usa o mesmo custo efetivo do total (consistente com vínculos)
              const footBg = 'var(--surface-muted)';
              const stick = (cid, extra) => ({ position: 'sticky', left: frozenLeft[cid], background: footBg, zIndex: 1, isolation: 'isolate', ...extra });
              const num = { textAlign: 'right', fontWeight: 700, fontSize: 12 };
              const foot = {
                wbs: <td key="wbs" style={stick('wbs')} />,
                id: <td key="id" style={stick('id')} />,
                etapa: <td key="etapa" style={stick('etapa', { fontWeight: 700, fontSize: 12.5, color: 'var(--text)', boxShadow: '1px 0 0 var(--border)' })}>Total do cronograma</td>,
                avanco: <td key="avanco"><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ flex: 1, minWidth: 40 }}><div className="progress"><span style={{ width: totalPct + '%' }} /></div></div><span className="num" style={{ fontWeight: 700, fontSize: 12.5, minWidth: 34, textAlign: 'right' }}>{totalPct}%</span></div></td>,
                peso: <td key="peso" className="num mono" style={num}>100%</td>,
                custo: <td key="custo" className="num mono" style={num}>{fmtBRL(totalCustoEf)}</td>,
                custoReal: <td key="custoReal" className="num mono" style={num}>{fmtBRL(totalReal)}</td>,
                custoOrcado: <td key="custoOrcado" className="num mono" style={num}>{fmtBRL(totalCustoOrcado)}</td>,
                saldo: <td key="saldo" className="num mono" style={{ ...num, color: totalSaldo < 0 ? 'var(--danger)' : 'inherit' }}>{fmtBRL(totalSaldo)}</td>,
              };
              return (
                <tr style={{ fontWeight: 600, borderTop: '2px solid var(--border)', background: footBg, height: 48 }}>
                  <td style={{ position: 'sticky', left: 0, zIndex: 2, background: footBg, isolation: 'isolate', width: GUTTER_W, minWidth: GUTTER_W }} />
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
        {Object.entries(autocompleteOptionsByCol).map(([colId, opts]) => (
          <datalist key={colId} id={`dl-${colId}`}>
            {opts.map(o => <option key={o} value={o} />)}
          </datalist>
        ))}
        <datalist id="dl-pavimento">
          {pavimentoOptions.map(o => <option key={o} value={o} />)}
        </datalist>
        {marquee && (
          <div className="copy-marquee" style={{ position: 'absolute', left: marquee.left, top: marquee.top, width: marquee.width, height: marquee.height, pointerEvents: 'none', zIndex: 4 }} />
        )}
      </div>

      {/* Barra de status estilo Excel: Contagem/Soma/Média da seleção (só com 2+ células numéricas) */}
      {(() => {
        const st = selectionStats();
        if (!st) return null;
        const item = { display: 'inline-flex', gap: 5, alignItems: 'baseline' };
        const val = { color: 'var(--text)', fontWeight: 700 };
        return (
          <div style={{
            flexShrink: 0, height: 24, borderTop: '1px solid var(--border)', background: 'var(--surface)',
            color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
            gap: 20, padding: '0 16px', fontSize: 11.5, fontVariantNumeric: 'tabular-nums',
          }}>
            <span style={item}>Contagem:<span style={val}>{st.count}</span></span>
            <span style={item}>Soma:<span style={val}>{st.soma}</span></span>
            <span style={item}>Média:<span style={val}>{st.media}</span></span>
          </div>
        );
      })()}

      {showTaskForm && (() => {
        // Navega pela lista NÃO filtrada (visible) — assim editar a tarefa aberta (ex. nome,
        // status) e ela deixar de bater com um filtro ativo não desabilita Anterior/Próxima.
        const idx = visible.findIndex(e => e.id === selectedId);
        return (
          <TaskFormPanel
            task={idx >= 0 ? visible[idx] : null}
            etapas={etapas}
            onCommit={onCommit}
            readOnly={readOnly}
            canPrev={idx > 0}
            canNext={idx >= 0 && idx < visible.length - 1}
            onPrev={() => { if (idx > 0) setSelectedId(visible[idx - 1].id); }}
            onNext={() => { if (idx >= 0 && idx < visible.length - 1) setSelectedId(visible[idx + 1].id); }}
          />
        );
      })()}

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
      {deleteConfirm?.length > 0 && (() => {
        const novas = deleteConfirm.reduce((acc, id) => deleteTask(id, acc), etapas);
        const totalRemovido = etapas.length - novas.length;
        const extraCount = Math.max(0, totalRemovido - deleteConfirm.length);
        const et = deleteConfirm.length === 1 ? etapas.find(e => e.id === deleteConfirm[0]) : null;
        return (
          <Modal
            title="Excluir tarefa"
            size="sm"
            onClose={() => setDeleteConfirm(null)}
            footer={
              <>
                <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)}>Cancelar</button>
                <button className="btn" style={{ background: 'var(--danger)', color: 'white' }} onClick={confirmDelete}>
                  Excluir
                </button>
              </>
            }
          >
            <p style={{ fontSize: 14, marginBottom: 4 }}>
              {deleteConfirm.length === 1
                ? <>Tem certeza que deseja excluir <strong>{et ? et.etapa : deleteConfirm[0]}</strong>?</>
                : <>Tem certeza que deseja excluir as <strong>{deleteConfirm.length} tarefas selecionadas</strong>?</>}
            </p>
            {extraCount > 0 && (
              <p style={{ fontSize: 13, color: 'var(--danger)', marginTop: 8 }}>
                {deleteConfirm.length === 1
                  ? `Esta tarefa possui ${extraCount} subtarefa${extraCount > 1 ? 's' : ''} que também ${extraCount > 1 ? 'serão removidas' : 'será removida'}.`
                  : `Isso inclui mais ${extraCount} subtarefa${extraCount > 1 ? 's' : ''} removida${extraCount > 1 ? 's' : ''} em cascata.`}
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
          pavimentosSalvos={pavimentosSalvos}
          onPavimentosCriados={onPavimentosCriados}
          onPavimentoExcluir={onPavimentoExcluir}
          isAdmin={isAdmin}
          onClose={() => setShowPavimentos(false)}
        />
      )}

      {/* Modal de importação de EAP (Excel/CSV) */}
      {showImportEAP && (
        <ImportarEAPModal
          etapas={etapas}
          customCols={customCols}
          onCommit={onCommit}
          onClose={() => setShowImportEAP(false)}
        />
      )}

      {/* Localizar (Ctrl+L) — navega pelas tarefas por nome, WBS ou ID */}
      {showLocalizar && (
        <Modal title="Localizar" subtitle="Buscar tarefa por nome, WBS ou ID" size="sm" draggable overlay={false}
          onClose={() => setShowLocalizar(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setShowLocalizar(false)}>Fechar</button>
              <button className="btn btn-primary" onClick={localizarProximo} disabled={!localizarTermo.trim()}>Localizar próxima</button>
            </>
          }>
          <input autoFocus className="input" placeholder="Digite e pressione Enter…"
            value={localizarTermo}
            onChange={e => { setLocalizarTermo(e.target.value); localizarIdxRef.current = -1; }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); localizarProximo(); } }}
            style={{ width: '100%' }} />
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
            Enter ou "Localizar próxima" percorre os resultados; a tarefa encontrada é selecionada e rolada até a vista.
          </div>
        </Modal>
      )}

      {/* Ortografia (F7) */}
      {showOrtografia && (
        <OrtografiaModal
          etapas={etapas}
          filtrada={filtrada}
          cursorInicial={selectedCell?.taskId ?? selectedId ?? null}
          onAlterarUma={alterarPalavraOrtografia}
          onAlterarTodas={alterarPalavraOrtografiaEmTodas}
          onFocarTarefa={focarTarefaOrtografia}
          onClose={() => setShowOrtografia(false)}
        />
      )}

      {/* Menu de contexto — botão direito na linha */}
      {ctxMenu?.kind !== 'col' && ctxMenu && !readOnly && (
        <div ref={ctxMenuRef} className="ctx-menu" style={{ left: ctxMenuPos?.left ?? ctxMenu.x, top: ctxMenuPos?.top ?? ctxMenu.y }}>
          <button onClick={() => { insertTask(ctxMenu.taskId, 'above'); setCtxMenu(null); }}>
            ↑ Inserir linha acima
          </button>
          <button onClick={() => { insertTask(ctxMenu.taskId, 'below'); setCtxMenu(null); }}>
            ↓ Inserir linha abaixo
          </button>
          <button onClick={() => { insertTask(ctxMenu.taskId, 'below', true); setCtxMenu(null); }}>
            ◆ Inserir marco
          </button>
          <hr />
          <button onClick={() => { cutSelection(ctxMenu.taskId); setCtxMenu(null); }}>
            Recortar
          </button>
          <button onClick={() => { if (selectedCell) copyCell(); else copyRow(ctxMenu.taskId); showMarquee(); setCtxMenu(null); }}>
            Copiar
          </button>
          <div className="ctx-submenu-wrap"
            onMouseEnter={() => { clearTimeout(pasteFlyoutCloseTimer.current); setPasteFlyoutOpen(true); }}
            onMouseLeave={() => { pasteFlyoutCloseTimer.current = setTimeout(() => setPasteFlyoutOpen(false), 150); }}>
            <button onClick={() => { pasteSmart('all', ctxMenu.taskId); setCtxMenu(null); }}>
              Colar <span aria-hidden="true">›</span>
            </button>
            {pasteFlyoutOpen && (
              <div ref={pasteSubmenuRef} className="ctx-menu ctx-submenu" style={pasteSubmenuFlip ? { right: '100%' } : { left: '100%' }}>
                <button onClick={() => { pasteSmart('all', ctxMenu.taskId); setCtxMenu(null); }}>
                  Colar
                </button>
                <button disabled={!cellClipRef.current?.grid || !!cutPendingRef.current}
                  onClick={() => { pasteCell('values'); setCtxMenu(null); }}>
                  Colar somente valores
                </button>
                <button disabled={!cellClipRef.current?.grid || !!cutPendingRef.current}
                  onClick={() => { pasteCell('format'); setCtxMenu(null); }}>
                  Colar formatação
                </button>
              </div>
            )}
          </div>
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
            const ids = selectedRowIds(); ids.add(ctxMenu.taskId);
            onCommit(autoScheduleFromDeps(etapas.map(t => (ids.has(t.id) && !t.isGroup) ? { ...t, modo: 'auto' } : t)));
            setCtxMenu(null);
          }}>
            <Icon name="clock" size={13} style={{ marginRight: 6 }} />Agendar Automático
          </button>
          <button onClick={() => {
            const ids = selectedRowIds(); ids.add(ctxMenu.taskId);
            onCommit(autoScheduleFromDeps(etapas.map(t => (ids.has(t.id) && !t.isGroup) ? { ...t, modo: 'manual' } : t)));
            setCtxMenu(null);
          }}>
            <Icon name="pin" size={13} style={{ marginRight: 6 }} />Agendar Manual
          </button>
          {podeReprogramar && (
            <>
              <hr />
              <button onClick={() => { onCommit(reprogramarRestante(ctxMenu.taskId, etapas)); setCtxMenu(null); }}>
                <Icon name="calendar" size={13} style={{ marginRight: 6 }} />Reprogramar restante
              </button>
            </>
          )}
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
          <button className="danger" onClick={() => {
            const ids = selectedRowIds(); ids.add(ctxMenu.taskId);
            setDeleteConfirm([...ids]); setCtxMenu(null);
          }}>
            Excluir tarefa
          </button>
        </div>
      )}

      {/* Menu de contexto — botão direito no cabeçalho de coluna */}
      {ctxMenu?.kind === 'col' && (
        <div ref={ctxMenuRef} className="ctx-menu" style={{ left: ctxMenuPos?.left ?? ctxMenu.x, top: ctxMenuPos?.top ?? ctxMenu.y }}>
          <button onClick={() => { selectColumn(ctxMenu.colId); setCtxMenu(null); }}>
            Selecionar coluna
          </button>
          {multiSelCols.length > 1 ? (
            <button onClick={() => {
              onHiddenColsChange(prev => new Set([...prev, ...multiSelCols.filter(c => !LISTA_FROZEN.includes(c))]));
              setMultiSelCols([]);
              setCtxMenu(null);
            }}>
              Ocultar {multiSelCols.length} colunas selecionadas
            </button>
          ) : !LISTA_FROZEN.includes(ctxMenu.colId) && (
            <button onClick={() => { toggleColVisibility(ctxMenu.colId); setCtxMenu(null); }}>
              Ocultar coluna
            </button>
          )}
          {hiddenCols.size > 0 && (
            <>
              <hr />
              <button onClick={() => { onHiddenColsChange(new Set()); setCtxMenu(null); }}>
                Reexibir todas
              </button>
            </>
          )}
          <hr />
          <button onClick={() => { setShowAddCol(true); setCtxMenu(null); }}>
            Inserir coluna
          </button>
          {isAdmin && customCols.some(c => c.id === ctxMenu.colId) && (
            <button style={{ color: 'var(--danger)' }}
              onClick={() => { handleDeleteCol(ctxMenu.colId); setCtxMenu(null); }}>
              Excluir coluna
            </button>
          )}
        </div>
      )}
    </div>
    </>
  );
};
