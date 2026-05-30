import React from 'react';
import { Icon } from '../../components/Icons';
import { AppData } from '../../utils/data';
import { supabase } from '../../services/supabase';
import { Modal, useToast } from '../../components/Modals';

// cronograma.jsx — Gantt interativo com drag & drop, undo/redo, tooltips e validação de dependências

// ─── Constantes de layout ────────────────────────────────────────────────────
const GM_START_YEAR  = 2024;
const GM_START_MONTH = 2;    // março (0-indexed)
const GM_TOTAL       = 28;   // meses na linha do tempo
const GM_MONTH_W     = 64;              // px por mês (mantido para compatibilidade do header)
const GM_DAY_W       = GM_MONTH_W / 30; // px por dia ≈ 2.133
const GM_LABEL_W     = 280;  // px da coluna de rótulos
const GM_ROW_H       = 44;   // altura por linha
const GM_HEADER_H    = 58;   // altura do cabeçalho
const GM_BAR_H       = 24;   // altura das barras

const GM_MN = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

const GM_MONTHS = (() => {
  const out = [];
  let y = GM_START_YEAR, mo = GM_START_MONTH;
  for (let i = 0; i < GM_TOTAL; i++) {
    out.push({ short: GM_MN[mo], year: y, isQ: mo % 3 === 0, idx: i });
    if (++mo === 12) { mo = 0; y++; }
  }
  return out;
})();

const GM_QUARTERS = (() => {
  const out = [];
  for (let q = 0; q * 3 < GM_TOTAL; q++) {
    const start = q * 3;
    const end   = Math.min(start + 3, GM_TOTAL);
    let mo = GM_START_MONTH + start, y = GM_START_YEAR;
    while (mo >= 12) { mo -= 12; y++; }
    out.push({ label: `T${(q % 4) + 1}/${y}`, start, end });
  }
  return out;
})();

// Retorna posição atual em DIAS a partir do início do projeto
const gmCalcToday = () => {
  const now = new Date();
  return ((now.getFullYear() - GM_START_YEAR) * 12
       + (now.getMonth() - GM_START_MONTH)) * 30
       + (now.getDate() - 1);
};

// Converte offset em DIAS para rótulo "Mês/AA"
const gmMonthLabel = (days) => {
  const months = Math.floor(days / 30);
  let mo = GM_START_MONTH + months;
  let y  = GM_START_YEAR;
  while (mo >= 12) { mo -= 12; y++; }
  return `${GM_MN[mo]}/${String(y).slice(2)}`;
};

// Detecta violações de dependência considerando tipo (TI/TT/II/IT) e lag
const gmConflicts = (etapas, overrides) => {
  const map = {};
  etapas.forEach(e => {
    map[e.id] = overrides && overrides[e.id] ? { ...e, ...overrides[e.id] } : e;
  });
  const out = [];
  Object.values(map).forEach(e => {
    (e.dep || []).forEach(depObj => {
      const dId = typeof depObj === 'string' ? depObj : depObj.id;
      const tipo = typeof depObj === 'string' ? 'TI' : (depObj.tipo || 'TI');
      const lag  = typeof depObj === 'string' ? 0 : (depObj.lag || 0);
      const d = map[dId];
      if (!d) return;
      let conflict = false;
      if (tipo === 'TI') conflict = e.inicio < d.inicio + d.dur + lag;
      if (tipo === 'TT') conflict = (e.inicio + e.dur) < (d.inicio + d.dur + lag);
      if (tipo === 'II') conflict = e.inicio < d.inicio + lag;
      if (tipo === 'IT') conflict = (e.inicio + e.dur) < (d.inicio + lag);
      if (conflict) out.push({ pred: dId, succ: e.id, tipo, lag });
    });
  });
  return out;
};

// ─── Utilitários de data ─────────────────────────────────────────────────────
const GM_REF = new Date(GM_START_YEAR, GM_START_MONTH, 1);

// Converte offset em DIAS para objeto Date
function offsetToDate(days) {
  const d = new Date(GM_REF);
  d.setDate(d.getDate() + Math.round(days));
  return d;
}

// Converte offset em DIAS para string ISO "YYYY-MM-DD"
function offsetToISO(days) {
  const d   = offsetToDate(days);
  const y   = d.getFullYear();
  const mo  = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

// Converte string ISO para offset em DIAS desde GM_REF
function dateToOffset(iso) {
  if (!iso) return 0;
  const parts = iso.split('-');
  if (parts.length < 3) return 0;
  const dt = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  return Math.max(0, Math.round((dt - GM_REF) / 86400000));
}

// ─── Funções puras de dados ──────────────────────────────────────────────────

function migrateEtapas(raw) {
  const arr = (raw || []).map(e => ({
    nivel: 0, parentId: null, isGroup: false,
    collapsed: false, responsavel: '', customCols: {},
    milestone: false, custo: 0,
    restricaoTipo: 'asap', restricaoData: '',
    ...e,
    dep: (e.dep || []).map(d =>
      typeof d === 'string' ? { id: d, tipo: 'TI', lag: 0 } : d
    ),
  }));
  // Atribui displayId permanente às tarefas que ainda não possuem
  const maxDid = arr.reduce((m, e) => Math.max(m, e.displayId || 0), 0);
  let nextDid = maxDid + 1;
  return arr.map(e => e.displayId ? e : { ...e, displayId: nextDid++ });
}

const fmtBRL   = n => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parseBRL  = s => { const n = parseFloat(String(s).replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.')); return isNaN(n) ? 0 : Math.max(0, n); };

function computeAllWBS(etapas) {
  const result = {}, counters = {};
  etapas.forEach(e => {
    const scope = e.parentId || '__root__';
    counters[scope] = (counters[scope] || 0) + 1;
    result[e.id] = e.parentId
      ? (result[e.parentId] || '?') + '.' + counters[scope]
      : String(counters[scope]);
  });
  return result;
}

// Recalcula nivel (da cadeia parentId) e isGroup (tem filhos diretos) após mudança de hierarquia
function recomputeHierarchy(arr) {
  const map = new Map(arr.map(e => [e.id, e]));

  function getNivel(id, visited = new Set()) {
    if (visited.has(id)) return 0;
    visited.add(id);
    const t = map.get(id);
    if (!t || !t.parentId) return 0;
    return 1 + getNivel(t.parentId, visited);
  }

  const childCount = new Map();
  arr.forEach(e => {
    if (e.parentId) childCount.set(e.parentId, (childCount.get(e.parentId) || 0) + 1);
  });

  const rebuilt = arr.map(e => ({
    ...e,
    nivel: getNivel(e.id),
    isGroup: (childCount.get(e.id) || 0) > 0,
  }));

  // Para tarefas resumo, recalcula avanco/inicio/dur a partir dos filhos diretos
  return rebuilt.map(e => {
    if (!e.isGroup) return e;
    const filhos = rebuilt.filter(f => f.parentId === e.id);
    if (filhos.length === 0) return e;
    const avanco = Math.round(filhos.reduce((s, f) => s + (f.avanco || 0), 0) / filhos.length);
    const inicio = Math.min(...filhos.map(f => f.inicio));
    const fim    = Math.max(...filhos.map(f => f.inicio + (f.dur || 0)));
    return { ...e, avanco, inicio, dur: Math.max(1, fim - inicio) };
  });
}

// Recua as tarefas selecionadas — cada uma passa a ser filha da tarefa imediatamente acima
function indentTasks(etapas, selectedIds) {
  const selSet = new Set(selectedIds);

  function isDescendant(id, targetId) {
    let cur = etapas.find(e => e.id === id);
    while (cur && cur.parentId) {
      if (cur.parentId === targetId) return true;
      cur = etapas.find(e => e.id === cur.parentId);
    }
    return false;
  }

  const novas = etapas.map((e, idx) => {
    if (!selSet.has(e.id)) return e;
    if (idx === 0) return e;
    const above = etapas[idx - 1];
    if (above.id === e.parentId) return e; // já é filho da tarefa acima
    if (isDescendant(above.id, e.id)) return e; // evita ciclo
    return { ...e, parentId: above.id };
  });

  return recomputeHierarchy(novas);
}

// Promove as tarefas selecionadas — remove um nível hierárquico (filho → irmão do pai)
function outdentTasks(etapas, selectedIds) {
  const selSet = new Set(selectedIds);
  const map = new Map(etapas.map(e => [e.id, e]));

  const novas = etapas.map(e => {
    if (!selSet.has(e.id)) return e;
    if (!e.parentId) return e; // já é raiz
    const pai = map.get(e.parentId);
    return { ...e, parentId: pai ? pai.parentId : null };
  });

  return recomputeHierarchy(novas);
}

function computeSuccessors(etapas) {
  const r = {};
  etapas.forEach(e => { r[e.id] = []; });
  etapas.forEach(e => (e.dep || []).forEach(d => {
    const pid = typeof d === 'string' ? d : d.id;
    if (r[pid]) r[pid].push(e.id);
  }));
  return r;
}

function getVisibleEtapas(etapas) {
  const collapsed = new Set(etapas.filter(e => e.isGroup && e.collapsed).map(e => e.id));
  if (collapsed.size === 0) return etapas;
  return etapas.filter(e => {
    let cur = e;
    while (cur.parentId) {
      if (collapsed.has(cur.parentId)) return false;
      cur = etapas.find(x => x.id === cur.parentId) || { parentId: null };
    }
    return true;
  });
}

function nextEtapaId(etapas) {
  const nums = etapas.map(e => parseInt(e.id.replace(/\D/g, '')) || 0);
  return 'TSK-' + String(Math.max(0, ...nums) + 1).padStart(3, '0');
}

function nextDisplayId(etapas) {
  return etapas.reduce((m, e) => Math.max(m, e.displayId || 0), 0) + 1;
}

function emptyCustomCols(customCols) {
  return Object.fromEntries((customCols || []).map(c => [c.id, '']));
}

function createTask(afterId, etapas, customCols) {
  const afterIdx = afterId ? etapas.findIndex(e => e.id === afterId) : etapas.length - 1;
  const idx      = Math.max(0, afterIdx);
  const after    = etapas[idx] || etapas[etapas.length - 1];
  const novo = {
    id: nextEtapaId(etapas), displayId: nextDisplayId(etapas), etapa: 'Nova tarefa',
    nivel: after ? after.nivel : 0, parentId: after ? after.parentId : null,
    isGroup: false, collapsed: false,
    inicio: after ? after.inicio + after.dur : 0,
    dur: 30, avanco: 0, status: 'upcoming',
    dep: [], milestone: false, responsavel: '',
    customCols: emptyCustomCols(customCols), custo: 0,
    restricaoTipo: 'asap', restricaoData: '',
  };
  return [...etapas.slice(0, idx + 1), novo, ...etapas.slice(idx + 1)];
}

function createSubtask(parentId, etapas, customCols) {
  const parentIdx = etapas.findIndex(e => e.id === parentId);
  if (parentIdx < 0) return etapas;
  const parent = etapas[parentIdx];
  let insertIdx = parentIdx;
  for (let i = parentIdx + 1; i < etapas.length; i++) {
    let cur = etapas[i], isDesc = false;
    while (cur.parentId) {
      if (cur.parentId === parentId) { isDesc = true; break; }
      cur = etapas.find(x => x.id === cur.parentId) || { parentId: null };
    }
    if (isDesc) insertIdx = i; else break;
  }
  const novo = {
    id: nextEtapaId(etapas), displayId: nextDisplayId(etapas), etapa: 'Nova subtarefa',
    nivel: (parent.nivel || 0) + 1, parentId,
    isGroup: false, collapsed: false,
    inicio: parent.inicio, dur: 30, avanco: 0, status: 'upcoming',
    dep: [], milestone: false, responsavel: '',
    customCols: emptyCustomCols(customCols), custo: 0,
    restricaoTipo: 'asap', restricaoData: '',
  };
  return [...etapas.slice(0, insertIdx + 1), novo, ...etapas.slice(insertIdx + 1)];
}

function createGroup(afterId, etapas, customCols) {
  const afterIdx = afterId ? etapas.findIndex(e => e.id === afterId) : etapas.length - 1;
  const idx      = Math.max(0, afterIdx);
  const after    = etapas[idx] || etapas[etapas.length - 1];
  const novo = {
    id: nextEtapaId(etapas), displayId: nextDisplayId(etapas), etapa: 'Novo grupo',
    nivel: after ? after.nivel : 0, parentId: after ? after.parentId : null,
    isGroup: true, collapsed: false,
    inicio: after ? after.inicio : 0,
    dur: 30, avanco: 0, status: 'upcoming',
    dep: [], milestone: false, responsavel: '',
    customCols: emptyCustomCols(customCols), custo: 0,
    restricaoTipo: 'asap', restricaoData: '',
  };
  return [...etapas.slice(0, idx + 1), novo, ...etapas.slice(idx + 1)];
}

function deleteTask(id, etapas) {
  const toRemove = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    etapas.forEach(e => {
      if (!toRemove.has(e.id) && e.parentId && toRemove.has(e.parentId)) {
        toRemove.add(e.id); changed = true;
      }
    });
  }
  return etapas
    .filter(e => !toRemove.has(e.id))
    .map(e => ({ ...e, dep: (e.dep || []).filter(d => !toRemove.has(typeof d === 'string' ? d : d.id)) }));
}

// Propaga delta de arrastar para todas as tarefas sucessoras (BFS)
// endDeltaMap: { [id]: deltaDias } — quanto o FIM de cada barra moveu
// startDeltaMap: { [id]: deltaDias } — quanto o INÍCIO de cada barra moveu
// Para TI/TT: propaga end_delta; para II/IT: propaga start_delta
function propagateDrag(etapas, endDeltaMap, startDeltaMap = {}) {
  const succs = computeSuccessors(etapas);
  const queue = [...Object.keys(endDeltaMap), ...Object.keys(startDeltaMap)];
  const visited = new Set(queue);
  const deltasBySucc = {};

  const getDepsOf = (id) => {
    const e = etapas.find(et => et.id === id);
    return (e?.dep || []).map(d => typeof d === 'string' ? { id: d, tipo: 'TI' } : d);
  };

  while (queue.length) {
    const id = queue.shift();
    for (const sid of (succs[id] || [])) {
      if (visited.has(sid)) continue;
      // Verifica o tipo da dependência que liga sid ao predecessor id
      const deps = getDepsOf(sid);
      const depOnId = deps.find(d => d.id === id);
      const tipo = depOnId?.tipo || 'TI';
      // TI/TT: propaga delta do fim do predecessor
      // II/IT: propaga delta do início do predecessor
      const idDelta = endDeltaMap[id] ?? deltasBySucc[id] ?? 0;
      const delta = (tipo === 'II' || tipo === 'IT')
        ? (startDeltaMap[id] ?? idDelta)
        : idDelta;
      if (delta !== 0) {
        deltasBySucc[sid] = delta;
        visited.add(sid);
        queue.push(sid);
      }
    }
  }

  if (!Object.keys(deltasBySucc).length) return etapas;
  return etapas.map(e =>
    deltasBySucc[e.id] !== undefined
      ? { ...e, inicio: Math.max(0, e.inicio + deltasBySucc[e.id]) }
      : e
  );
}

// Recalcula inicio/dur dos grupos com base nos filhos diretos (de baixo para cima)
function updateParentBounds(etapas) {
  let result = etapas.map(e => ({ ...e }));
  const groups = result.filter(e => e.isGroup).reverse();
  for (const g of groups) {
    const children = result.filter(c => c.parentId === g.id);
    if (!children.length) continue;
    const inicio = Math.min(...children.map(c => c.inicio));
    const fim    = Math.max(...children.map(c => c.inicio + c.dur));
    result = result.map(e => e.id === g.id ? { ...e, inicio, dur: Math.max(1, fim - inicio) } : e);
  }
  return result;
}

// Converte dep[] para string exibível usando displayId: "1, 2TT+3d"
function formatDepList(dep, etapas) {
  const idToDisp = etapas
    ? Object.fromEntries(etapas.map(e => [e.id, e.displayId ?? e.id]))
    : {};
  return (dep || []).map(d => {
    if (typeof d === 'string') return idToDisp[d] ?? d;
    const disp = idToDisp[d.id] ?? d.id;
    const t = (d.tipo && d.tipo !== 'TI') ? d.tipo : '';
    const l = d.lag ? ((d.lag > 0 ? '+' : '') + d.lag + 'd') : '';
    return disp + t + l;
  }).join(', ');
}

// Converte string "1, 2TT+3d" para dep[] resolvendo por displayId ou id interno
function parseDep(raw, etapas) {
  return String(raw).split(',').map(s => s.trim()).filter(Boolean).map(token => {
    const m = token.match(/^(\d+|[A-Za-z0-9\-]+)(TI|TT|II|IT)?([+-]\d+d?)?$/);
    if (!m) return null;
    const ref  = m[1];
    const tipo = m[2] || 'TI';
    const lag  = m[3] ? parseInt(m[3]) : 0;
    const found = etapas.find(x => String(x.displayId) === ref)
               || etapas.find(x => x.id === ref);
    if (!found) return null;
    return { id: found.id, tipo, lag };
  }).filter(Boolean);
}

// ─── Utilitários de formatação ───────────────────────────────────────────────
const formatBRL = v =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0);

// ─── Uso da Tarefa — funções de distribuição mensal ──────────────────────────

// Retorna array de meses cobertos por qualquer tarefa: [{ key:"YYYY-MM", label:"Abr/26" }, ...]
function getMonthRange(etapas) {
  const set = new Set();
  etapas.forEach(e => {
    const s = offsetToDate(e.inicio);
    const f = offsetToDate(e.inicio + Math.max(e.dur, 1));
    let cur = new Date(s.getFullYear(), s.getMonth(), 1);
    while (cur <= f) {
      set.add(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`);
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
  });
  const MES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return [...set].sort().map(key => {
    const [y, m] = key.split('-');
    return { key, label: `${MES[+m - 1]}/${String(y).slice(2)}` };
  });
}

// Distribui o custo de cada tarefa folha proporcionalmente pelos dias em cada mês
function computeMonthlyDist(etapas) {
  const result = {};
  etapas.forEach(e => {
    if (e.isGroup) return;
    const custo = e.custo || 0;
    const s = offsetToDate(e.inicio);
    const f = offsetToDate(e.inicio + Math.max(e.dur, 1));
    const totalDays = Math.max(1, (f - s) / 86400000);
    const dist = {};
    let cur = new Date(s.getFullYear(), s.getMonth(), 1);
    while (cur <= f) {
      const mStart = new Date(Math.max(cur, s));
      const mEnd   = new Date(Math.min(new Date(cur.getFullYear(), cur.getMonth() + 1, 1), f));
      const days   = Math.max(0, (mEnd - mStart) / 86400000);
      if (days > 0) {
        const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`;
        dist[key] = (custo * days) / totalDays;
      }
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    result[e.id] = dist;
  });
  return result;
}

// Agrega distribuição mensal de todos os descendentes folha de um grupo
function getGroupMonthlyDist(groupId, etapas, monthlyDist) {
  const total = {};
  const descend = (pid) => etapas
    .filter(e => e.parentId === pid)
    .forEach(e => {
      if (e.isGroup) { descend(e.id); }
      else { Object.entries(monthlyDist[e.id] || {}).forEach(([k, v]) => { total[k] = (total[k] || 0) + v; }); }
    });
  descend(groupId);
  return total;
}

// Verifica restrições e retorna lista de violações
function verificarRestricoes(etapas) {
  const violacoes = [];
  etapas.forEach(e => {
    if (!e.restricaoTipo || e.restricaoTipo === 'asap' || !e.restricaoData) return;
    const d = dateToOffset(e.restricaoData);
    const ini = e.inicio, fim = e.inicio + e.dur;
    let violou = false;
    let msg = '';
    if (e.restricaoTipo === 'snet' && ini < d)  { violou = true; msg = `Não deve iniciar antes de ${e.restricaoData}`; }
    if (e.restricaoTipo === 'snlt' && ini > d)  { violou = true; msg = `Não deve iniciar depois de ${e.restricaoData}`; }
    if (e.restricaoTipo === 'fnet' && fim < d)  { violou = true; msg = `Não deve terminar antes de ${e.restricaoData}`; }
    if (e.restricaoTipo === 'fnlt' && fim > d)  { violou = true; msg = `Não deve terminar depois de ${e.restricaoData}`; }
    if (e.restricaoTipo === 'mso'  && ini !== d){ violou = true; msg = `Deve iniciar exatamente em ${e.restricaoData}`; }
    if (e.restricaoTipo === 'mfo'  && fim !== d){ violou = true; msg = `Deve terminar exatamente em ${e.restricaoData}`; }
    if (violou) violacoes.push({ etapa: e.etapa, msg });
  });
  return violacoes;
}

// Computa valores consolidados para linhas de grupo (somando filhos diretos)
function computeGroupValues(etapas) {
  const result = {};
  etapas.filter(e => e.isGroup).forEach(g => {
    const children = etapas.filter(e => e.parentId === g.id);
    if (!children.length) return;
    const totalCusto = children.reduce((s, c) => s + (c.custo || 0), 0);
    const avanco = totalCusto > 0
      ? children.reduce((s, c) => s + (c.avanco || 0) * (c.custo || 0), 0) / totalCusto
      : children.reduce((s, c) => s + (c.avanco || 0), 0) / children.length;
    const inicio = Math.min(...children.map(c => c.inicio));
    const fim    = Math.max(...children.map(c => c.inicio + c.dur));
    result[g.id] = {
      avanco:  Math.round(avanco),
      inicio,
      dur:     Math.max(1, fim - inicio),
      custo:   totalCusto,
    };
  });
  return result;
}

// ─── GanttInterativo ─────────────────────────────────────────────────────────
const GanttInterativo = ({ etapas, onCommit, undo, redo, baselineEtapas, obraId }) => {
  const toast = useToast();
  const [selected,    setSel]      = React.useState(new Set());
  const [editMode,    setEdit]     = React.useState(() => { const c = JSON.parse(localStorage.getItem(`gantt_cfg_${obraId}`) || '{}'); return c.editMode   ?? true; });
  const [lockDone,    setLock]     = React.useState(() => { const c = JSON.parse(localStorage.getItem(`gantt_cfg_${obraId}`) || '{}'); return c.lockDone   ?? true; });
  const [replanAuto,  setReplan]   = React.useState(() => { const c = JSON.parse(localStorage.getItem(`gantt_cfg_${obraId}`) || '{}'); return c.replanAuto ?? true; });

  const saveGanttCfg = (patch) => {
    const curr = JSON.parse(localStorage.getItem(`gantt_cfg_${obraId}`) || '{}');
    localStorage.setItem(`gantt_cfg_${obraId}`, JSON.stringify({ ...curr, ...patch }));
  };
  const [tooltip,     setTip]      = React.useState(null);
  const [draft,       setDraft]    = React.useState(null);

  const cRef      = React.useRef(null);
  const etapasRef = React.useRef(etapas);  // ref para event handlers (evita closures stale)
  const dragged   = React.useRef(false);

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

  // Limpa seleção de IDs que não existem mais
  React.useEffect(() => {
    const ids = new Set(etapas.map(e => e.id));
    setSel(s => {
      const cleaned = new Set([...s].filter(id => ids.has(id)));
      return cleaned.size !== s.size ? cleaned : s;
    });
  }, [etapas]);

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
      const delta = Math.round((ev.clientX - sx) / GM_DAY_W);
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
    }
  };

  const getBar = (e) => draft && draft[e.id] ? { ...e, ...draft[e.id] } : e;
  const findEt = (id) => etapas.find(e => e.id === id);
  const idxEt  = (id) => etapas.findIndex(e => e.id === id);
  const tlW    = GM_TOTAL * GM_MONTH_W;

  const barColor = (e, isConf) =>
    isConf                    ? '#d97706'
    : e.status === 'done'     ? '#1b8f5e'
    : e.status === 'late'     ? '#c0281f'
    : e.status === 'upcoming' ? '#3d7fc9'
    : 'var(--brand)';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative' }}>

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 8, padding: '10px 16px', alignItems: 'center',
        flexWrap: 'wrap', background: 'var(--surface-muted)',
        borderBottom: '1px solid var(--border)', minHeight: 48,
      }}>
        <button
          className={'btn ' + (editMode ? 'btn-primary' : 'btn-ghost')}
          style={{ fontSize: 12, padding: '4px 12px', height: 30, gap: 5 }}
          onClick={() => { const nv = !editMode; saveGanttCfg({ editMode: nv }); setEdit(nv); }}
        >
          <Icon name="edit" size={12} />{editMode ? 'Editando' : 'Somente leitura'}
        </button>

        <button
          className="btn btn-ghost"
          style={{ fontSize: 12, padding: '4px 12px', height: 30, gap: 5, color: lockDone ? 'var(--success)' : 'var(--text-muted)' }}
          onClick={() => { const nv = !lockDone; saveGanttCfg({ lockDone: nv }); setLock(nv); }}
        >
          <Icon name="shield" size={12} />{lockDone ? 'Concluídas bloqueadas' : 'Concluídas livres'}
        </button>

        <button
          className="btn btn-ghost"
          style={{ fontSize: 12, padding: '4px 12px', height: 30, gap: 5, color: replanAuto ? 'var(--brand)' : 'var(--text-muted)' }}
          onClick={() => { const nv = !replanAuto; saveGanttCfg({ replanAuto: nv }); setReplan(nv); }}
          title="Quando ativo, arrastar uma barra move automaticamente todas as tarefas sucessoras"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
          </svg>
          {replanAuto ? 'Replan. automático' : 'Replan. manual'}
        </button>

        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px', height: 30, gap: 5 }} onClick={undo} title="Desfazer (Ctrl+Z)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v6h6"/><path d="M3 13C5.5 8 10 5 15 5c4 0 7 2.5 7 6s-3 6-7 6H12"/>
          </svg>
          Desfazer
        </button>

        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px', height: 30, gap: 5 }} onClick={redo} title="Refazer (Ctrl+Y)">
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
      </div>

      {/* ── Scroll container ──────────────────────────────────────────────── */}
      <div
        ref={cRef}
        style={{ overflow: 'auto', maxWidth: '100%', userSelect: 'none', cursor: editMode ? 'grab' : 'default' }}
        onMouseDown={onContDown}
        onClick={() => { if (!dragged.current) setSel(new Set()); }}
      >
        <div style={{
          display: 'grid',
          gridTemplateColumns: `${GM_LABEL_W}px ${tlW}px`,
          minWidth: GM_LABEL_W + tlW,
          position: 'relative',
        }}>

          {/* ── Cabeçalho rótulo ──────────────────────────────────────────── */}
          <div style={{
            height: GM_HEADER_H, borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)',
            display: 'flex', alignItems: 'flex-end', padding: '0 18px 12px',
            fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em',
            color: 'var(--text-soft)', background: 'var(--surface)',
            position: 'sticky', left: 0, zIndex: 5,
          }}>
            ETAPA
          </div>

          {/* ── Cabeçalho linha do tempo ──────────────────────────────────── */}
          <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
            {/* Trimestres */}
            <div style={{ display: 'flex', height: 28, borderBottom: '1px solid var(--border)' }}>
              {GM_QUARTERS.map((q, qi) => (
                <div key={qi} style={{
                  width: (q.end - q.start) * GM_MONTH_W,
                  fontSize: 10.5, fontWeight: 600, color: 'var(--text-soft)',
                  textTransform: 'uppercase', letterSpacing: '0.07em',
                  padding: '7px 10px', borderRight: '1px solid var(--border)',
                  background: qi % 2 === 0 ? 'rgba(0,0,0,0.02)' : 'transparent',
                }}>
                  {q.label}
                </div>
              ))}
            </div>
            {/* Meses */}
            <div style={{ display: 'flex', height: 30 }}>
              {GM_MONTHS.map((m, mi) => (
                <div key={mi} style={{
                  width: GM_MONTH_W, textAlign: 'center', padding: '8px 0', fontSize: 10,
                  borderRight: '1px solid var(--border)', fontFamily: 'var(--font-mono)',
                  color: m.isQ ? 'var(--text-soft)' : 'var(--text-muted)',
                  fontWeight: m.isQ ? 600 : 400,
                  background: m.isQ ? 'rgba(0,0,0,0.015)' : 'transparent',
                }}>
                  {m.short}
                </div>
              ))}
            </div>
          </div>

          {/* ── Linhas das etapas ────────────────────────────────────────── */}
          {etapas.map((e, i) => {
            const bar    = getBar(e);
            const isSel  = selected.has(e.id);
            const isConf = conflictIds.has(e.id);
            const isLock = lockDone && e.status === 'done';
            const bc     = barColor(e, isConf);
            const rowBg  = isSel ? 'rgba(0,85,160,0.04)' : i % 2 === 0 ? 'transparent' : 'var(--surface-muted)';
            const lblBg  = isSel ? 'rgba(0,85,160,0.06)' : i % 2 === 0 ? 'var(--surface)' : 'var(--surface-muted)';

            return (
              <React.Fragment key={e.id}>
                {/* Rótulo sticky */}
                <div
                  onClick={(ev) => onBarClick(ev, e.id)}
                  style={{
                    height: GM_ROW_H, padding: '0 14px 0 18px',
                    borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: 12.5, fontWeight: isSel ? 600 : (e.isGroup ? 600 : 500),
                    color: isSel ? 'var(--brand)' : 'var(--text)',
                    position: 'sticky', left: 0, zIndex: 2,
                    background: lblBg, cursor: 'default',
                    transition: 'background 0.12s, color 0.12s',
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-faint)', minWidth: 26, flexShrink: 0 }}>
                    {e.displayId ?? e.id}
                  </span>
                  <span style={{
                    flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    paddingLeft: (e.nivel || 0) * 12,
                  }}>
                    {e.etapa}
                  </span>
                  {isLock && <Icon name="shield" size={11} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />}
                </div>

                {/* Faixa da timeline */}
                <div style={{
                  position: 'relative', height: GM_ROW_H,
                  borderBottom: '1px solid var(--border)', background: rowBg,
                }}>
                  {/* Grade de meses */}
                  {GM_MONTHS.map((m, mi) => (
                    <div key={mi} style={{
                      position: 'absolute', left: mi * GM_MONTH_W, top: 0, bottom: 0, width: 1,
                      background: 'var(--border)', opacity: m.isQ ? 0.8 : 0.35,
                    }} />
                  ))}

                  {/* Sombreamento do passado */}
                  <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: Math.min(today, GM_TOTAL * 30) * GM_DAY_W,
                    background: 'rgba(0,0,0,0.011)', pointerEvents: 'none',
                  }} />

                  {/* Barra de linha de base — fina, atrás da barra atual */}
                  {blMap[e.id] && !e.milestone && (
                    <div style={{
                      position: 'absolute',
                      left: blMap[e.id].inicio * GM_DAY_W + 3,
                      width: Math.max(blMap[e.id].dur * GM_DAY_W - 6, 10),
                      top: '50%', transform: 'translateY(-50%)',
                      height: 6, borderRadius: 3,
                      background: 'rgba(107,120,144,0.45)',
                      zIndex: 0, pointerEvents: 'none',
                    }} />
                  )}

                  {/* Barra ou Marco */}
                  {!e.milestone ? (
                    <div
                      data-gb={e.id}
                      onClick={(ev) => onBarClick(ev, e.id)}
                      onMouseDown={editMode && !isLock ? (ev) => onBarDown(ev, e.id, 'move') : undefined}
                      onMouseEnter={(ev) => setTip({ etapa: e, x: ev.clientX, y: ev.clientY })}
                      onMouseLeave={() => setTip(null)}
                      style={{
                        position: 'absolute',
                        left: bar.inicio * GM_DAY_W + 3,
                        width: Math.max(bar.dur * GM_DAY_W - 6, 10),
                        top: '50%', transform: 'translateY(-50%)',
                        height: e.isGroup ? GM_BAR_H - 8 : GM_BAR_H,
                        background: e.isGroup ? 'rgba(1,67,134,0.65)' : bc, borderRadius: e.isGroup ? 4 : 7,
                        boxShadow: isSel
                          ? `0 0 0 2px white, 0 0 0 3.5px ${bc}, 0 3px 12px rgba(0,0,0,0.18)`
                          : '0 1px 4px rgba(0,0,0,0.14)',
                        display: 'flex', alignItems: 'center', overflow: 'hidden',
                        cursor: editMode && !isLock ? 'grab' : 'pointer',
                        transition: draft ? 'none' : 'left 0.15s ease, width 0.15s ease, box-shadow 0.12s',
                        zIndex: isSel ? 3 : 1,
                      }}
                    >
                      {/* Overlay de progresso */}
                      <div style={{
                        position: 'absolute', left: 0, top: 0, bottom: 0,
                        width: e.avanco + '%', background: 'rgba(255,255,255,0.22)', borderRadius: 7,
                      }} />
                      <span style={{
                        position: 'relative', zIndex: 1, paddingLeft: 10, paddingRight: 6,
                        fontSize: 10.5, fontWeight: 700,
                        color: 'rgba(255,255,255,0.95)',
                        textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                        whiteSpace: 'nowrap',
                      }}>
                        {e.avanco > 0 ? `${e.avanco}%` : ''}
                      </span>
                      {/* Ícone de restrição */}
                      {e.restricaoTipo && e.restricaoTipo !== 'asap' && (
                        <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2.5"
                          style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', flexShrink: 0 }}>
                          <circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                        </svg>
                      )}
                      {/* Handle resize esquerda */}
                      {editMode && !isLock && (
                        <div data-gb={e.id}
                          onMouseDown={(ev) => { ev.stopPropagation(); onBarDown(ev, e.id, 'resizeLeft'); }}
                          style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 8, cursor: 'ew-resize', zIndex: 5, background: 'rgba(0,0,0,0.12)', borderRadius: '7px 0 0 7px' }}
                        />
                      )}
                      {/* Handle resize direita */}
                      {editMode && !isLock && (
                        <div data-gb={e.id}
                          onMouseDown={(ev) => { ev.stopPropagation(); onBarDown(ev, e.id, 'resizeRight'); }}
                          style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 8, cursor: 'ew-resize', zIndex: 5, background: 'rgba(0,0,0,0.12)', borderRadius: '0 7px 7px 0' }}
                        />
                      )}
                    </div>
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
                        left: bar.inicio * GM_DAY_W - 11,
                        top: '50%', transform: 'translateY(-50%) rotate(45deg)',
                        width: 20, height: 20,
                        background: isConf ? '#d97706' : 'var(--brand)', borderRadius: 4,
                        boxShadow: isSel ? `0 0 0 2px white, 0 0 0 4px var(--brand)` : '0 2px 6px rgba(0,0,0,0.18)',
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
            left: GM_LABEL_W + Math.min(today, GM_TOTAL * 30) * GM_DAY_W,
            top: 0, bottom: 0, width: 0,
            borderLeft: '2px solid #e53935',
            zIndex: 10, pointerEvents: 'none',
          }}>
            <div style={{
              position: 'absolute', top: 5, left: 5,
              background: '#e53935', color: 'white',
              fontSize: 9, fontWeight: 800, letterSpacing: '0.1em',
              padding: '2px 6px', borderRadius: 3, whiteSpace: 'nowrap',
            }}>
              HOJE
            </div>
          </div>

          {/* ── SVG: setas de dependência tipadas (TI/TT/II/IT) ──────────── */}
          <svg style={{
            position: 'absolute', top: GM_HEADER_H, left: GM_LABEL_W,
            width: tlW, height: etapas.length * GM_ROW_H,
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
                if (tipo === 'TI') { fx = (dBar.inicio + dBar.dur) * GM_DAY_W; tx = eBar.inicio * GM_DAY_W + 4; }
                else if (tipo === 'TT') { fx = (dBar.inicio + dBar.dur) * GM_DAY_W; tx = (eBar.inicio + eBar.dur) * GM_DAY_W - 4; }
                else if (tipo === 'II') { fx = dBar.inicio * GM_DAY_W; tx = eBar.inicio * GM_DAY_W + 4; }
                else /* IT */           { fx = dBar.inicio * GM_DAY_W; tx = (eBar.inicio + eBar.dur) * GM_DAY_W - 4; }

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
          borderRadius: 10, boxShadow: '0 8px 28px rgba(0,0,0,0.13)',
          padding: '12px 16px', minWidth: 234, pointerEvents: 'none', fontSize: 12,
        }}>
          <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13, marginBottom: 9, paddingBottom: 9, borderBottom: '1px solid var(--border)' }}>
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
            <span style={{ fontSize: 11.5, fontWeight: 600, color: tooltip.etapa.status === 'done' ? '#1b8f5e' : tooltip.etapa.status === 'late' ? '#c0281f' : '#3d7fc9' }}>
              {tooltip.etapa.status === 'done' ? '✓ Concluída' : tooltip.etapa.status === 'late' ? '⚠ Atrasada' : '◷ Planejada'}
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
const EditableCell = ({ value, type = 'text', onSave, readOnly = false, style }) => {
  const [editing, setEditing] = React.useState(false);
  const [draft,   setDraft]   = React.useState(value);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
  }, [editing]);

  // Sincroniza draft quando value muda externamente (e não está editando)
  React.useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const save = () => {
    setEditing(false);
    if (String(draft ?? '') !== String(value ?? '')) onSave(draft ?? '');
  };
  const cancel = () => { setEditing(false); setDraft(value); };

  if (readOnly) {
    const display = value !== undefined && value !== null && value !== '' ? value : null;
    return <span style={style}>{display ?? <span style={{ color: 'var(--text-faint)' }}>—</span>}</span>;
  }

  if (!editing) {
    const display = value !== undefined && value !== null && value !== '' ? value : null;
    return (
      <span
        onClick={() => { setDraft(value); setEditing(true); }}
        style={{ cursor: 'text', display: 'block', minHeight: 20, ...style }}
      >
        {display ?? <span style={{ color: 'var(--text-faint)' }}>—</span>}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
      value={draft ?? ''}
      onChange={e => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); save(); }
        if (e.key === 'Escape') cancel();
        e.stopPropagation();
      }}
      style={{
        width: '100%', border: 'none', outline: '2px solid var(--brand)',
        borderRadius: 4, padding: '2px 6px', fontSize: 'inherit',
        background: 'var(--surface)', fontFamily: 'inherit',
        boxSizing: 'border-box',
      }}
    />
  );
};

// ─── AddColModal ──────────────────────────────────────────────────────────────
const AddColModal = ({ onClose, onAdd }) => {
  const [label,   setLabel]   = React.useState('');
  const [type,    setType]    = React.useState('text');
  const [options, setOptions] = React.useState('');

  const doAdd = () => {
    if (!label.trim()) return;
    const col = { id: 'cc_' + Date.now().toString(36), label: label.trim(), type };
    if (type === 'list' && options.trim()) col.options = options.split(',').map(o => o.trim()).filter(Boolean);
    onAdd(col);
    onClose();
  };

  return (
    <Modal
      title="Nova coluna personalizada"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!label.trim()} onClick={doAdd}>
            Adicionar coluna
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field full">
          <label>Nome da coluna</label>
          <input
            autoFocus className="input" value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Ex.: Nota Fiscal, Observações..."
            onKeyDown={e => { if (e.key === 'Enter') doAdd(); }}
          />
        </div>
        <div className="field">
          <label>Tipo de dados</label>
          <select className="input" value={type} onChange={e => setType(e.target.value)}>
            <option value="text">Texto</option>
            <option value="number">Número</option>
            <option value="currency">Moeda (R$)</option>
            <option value="percent">Percentual (%)</option>
            <option value="date">Data</option>
            <option value="duration">Duração (dias)</option>
            <option value="boolean">Sim / Não</option>
            <option value="list">Lista suspensa</option>
          </select>
        </div>
        {type === 'list' && (
          <div className="field full">
            <label>Opções (separadas por vírgula)</label>
            <input
              className="input" value={options}
              onChange={e => setOptions(e.target.value)}
              placeholder="Ex.: Baixo, Médio, Alto"
            />
          </div>
        )}
      </div>
    </Modal>
  );
};

// ─── PavimentosModal ─────────────────────────────────────────────────────────
const PavimentosModal = ({ etapas, customCols, onCommit, onClose }) => {
  const [step,          setStep]          = React.useState(1);
  const [floors,        setFloors]        = React.useState(['Térreo', 'Pavimento 1', 'Pavimento 2']);
  const [selectedTasks, setSelectedTasks] = React.useState([]);

  const validFloors = floors.filter(f => f.trim());

  const handleConfirm = () => {
    if (!validFloors.length || !selectedTasks.length) return;
    let novas = etapas.map(e => ({ ...e }));

    selectedTasks.forEach(taskId => {
      // Converter tarefa em grupo se ainda não for
      novas = novas.map(e => e.id === taskId ? { ...e, isGroup: true } : e);
      const task = novas.find(e => e.id === taskId);
      if (!task) return;

      // Encontra índice do último descendente para inserir subtarefas após ele
      let insertIdx = novas.findIndex(e => e.id === taskId);
      for (let i = insertIdx + 1; i < novas.length; i++) {
        let cur = novas[i], isDesc = false;
        while (cur && cur.parentId) {
          if (cur.parentId === taskId) { isDesc = true; break; }
          cur = novas.find(x => x.id === cur.parentId);
        }
        if (isDesc) insertIdx = i; else break;
      }

      // Cria subtarefas para cada pavimento
      const subDur = Math.max(1, Math.round(task.dur / validFloors.length));
      const toInsert = validFloors.map((nome, fi) => {
        const allSoFar = [...novas, ...validFloors.slice(0, fi).map((_, j) => ({ id: `_tmp${j}` }))];
        return {
          id:         nextEtapaId([...novas, ...validFloors.slice(0, fi).map((_, j) => ({ id: `E${9000 + j}` }))]),
          etapa:      nome,
          nivel:      (task.nivel || 0) + 1,
          parentId:   taskId,
          isGroup:    false, collapsed: false,
          inicio:     task.inicio + fi * subDur,
          dur:        subDur,
          avanco:     0, status: 'upcoming',
          dep:        [], milestone: false, responsavel: '',
          customCols: emptyCustomCols(customCols),
          custo:      0,
        };
      });

      // Gera IDs únicos sequencialmente
      const uniqueSubs = [];
      for (const sub of toInsert) {
        const base = [...novas, ...uniqueSubs];
        uniqueSubs.push({ ...sub, id: nextEtapaId(base), displayId: nextDisplayId(base) });
      }

      novas = [
        ...novas.slice(0, insertIdx + 1),
        ...uniqueSubs,
        ...novas.slice(insertIdx + 1),
      ];
    });

    onCommit(novas);
    onClose();
  };

  return (
    <Modal
      title="Inserção automática de pavimentos"
      subtitle={step === 1 ? 'Passo 1 de 2 — Definir pavimentos' : 'Passo 2 de 2 — Selecionar tarefas'}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={step === 1 ? onClose : () => setStep(1)}>
            {step === 1 ? 'Cancelar' : 'Voltar'}
          </button>
          {step === 1 ? (
            <button className="btn btn-primary" disabled={!validFloors.length} onClick={() => setStep(2)}>
              Próximo →
            </button>
          ) : (
            <button className="btn btn-primary" disabled={!selectedTasks.length} onClick={handleConfirm}>
              Criar {validFloors.length} pavimento{validFloors.length !== 1 ? 's' : ''} em {selectedTasks.length} tarefa{selectedTasks.length !== 1 ? 's' : ''}
            </button>
          )}
        </>
      }
    >
      {step === 1 && (
        <div>
          <p style={{ marginBottom: 14, fontSize: 13, color: 'var(--text-muted)' }}>
            Informe os nomes dos pavimentos. Eles serão criados como subtarefas das tarefas que você selecionar.
          </p>
          {floors.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <span style={{ width: 20, textAlign: 'right', fontSize: 12, color: 'var(--text-faint)', flexShrink: 0 }}>{i + 1}.</span>
              <input
                className="input"
                value={f}
                autoFocus={i === 0}
                onChange={ev => setFloors(fl => fl.map((x, j) => j === i ? ev.target.value : x))}
                placeholder={`Ex.: Pavimento ${i + 1}`}
                style={{ flex: 1 }}
                onKeyDown={ev => { if (ev.key === 'Enter') setFloors(fl => [...fl, '']); }}
              />
              {floors.length > 1 && (
                <button
                  className="btn btn-ghost"
                  style={{ width: 30, height: 30, padding: 0, fontSize: 16, lineHeight: 1 }}
                  onClick={() => setFloors(fl => fl.filter((_, j) => j !== i))}
                >×</button>
              )}
            </div>
          ))}
          <button className="btn btn-ghost" style={{ fontSize: 12, marginTop: 4, gap: 5 }} onClick={() => setFloors(fl => [...fl, ''])}>
            <Icon name="plus" size={12} /> Adicionar pavimento
          </button>
        </div>
      )}

      {step === 2 && (
        <div>
          <p style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-muted)' }}>
            Selecione as tarefas que receberão os pavimentos como subtarefas.
            Serão criados: <strong>{validFloors.join(', ')}</strong>.
          </p>
          <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
            {etapas.map(e => (
              <label key={e.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 14px', cursor: 'pointer',
                borderBottom: '1px solid var(--border)',
                background: selectedTasks.includes(e.id) ? 'var(--brand-tint)' : 'transparent',
              }}>
                <input
                  type="checkbox"
                  checked={selectedTasks.includes(e.id)}
                  onChange={ev => {
                    if (ev.target.checked) setSelectedTasks(ts => [...ts, e.id]);
                    else setSelectedTasks(ts => ts.filter(id => id !== e.id));
                  }}
                />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)', minWidth: 32 }}>{e.id}</span>
                <span style={{ paddingLeft: (e.nivel || 0) * 16, fontSize: 13, fontWeight: e.isGroup ? 600 : 400 }}>
                  {e.etapa}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
};

// ─── Definições de colunas da Lista ──────────────────────────────────────────
const LISTA_COL_DEFS = {
  wbs:       { label: 'WBS',           defWidth: 56,  frozen: true  },
  id:        { label: 'ID',            defWidth: 58,  frozen: true  },
  etapa:     { label: 'Etapa / Tarefa',defWidth: 240, frozen: true  },
  inicio:    { label: 'Início',        defWidth: 112 },
  fim:       { label: 'Término',       defWidth: 112 },
  duracao:   { label: 'Duração',       defWidth: 90  },
  avanco:    { label: '% Concluída',   defWidth: 150 },
  custo:     { label: 'Custo',         defWidth: 130, align: 'right' },
  peso:      { label: 'Peso %',        defWidth: 68,  align: 'right' },
  custoReal: { label: 'Custo Real',    defWidth: 130, align: 'right' },
  saldo:     { label: 'Saldo',         defWidth: 110, align: 'right' },
  resp:      { label: 'Responsável',   defWidth: 130 },
  dep:       { label: 'Predecessoras', defWidth: 130 },
  succ:      { label: 'Sucessoras',    defWidth: 110 },
  status:    { label: 'Status',        defWidth: 105 },
  restricao: { label: 'Restrição',     defWidth: 200 },
};
const LISTA_DEFAULT_ORDER = Object.keys(LISTA_COL_DEFS);
const LISTA_FROZEN = ['wbs', 'id', 'etapa'];

// ─── ListaInterativa ──────────────────────────────────────────────────────────
const ListaInterativa = ({ etapas, onCommit, customCols, onCustomColsChange, obraId }) => {
  const toast = useToast();
  const [selectedId,     setSelectedId]     = React.useState(null);
  const [showAddCol,     setShowAddCol]     = React.useState(false);
  const [deleteConfirm,  setDeleteConfirm]  = React.useState(null); // id da tarefa a excluir
  const [showPavimentos, setShowPavimentos] = React.useState(false);
  const [multiSel,       setMultiSel]       = React.useState([]);   // seleção ordenada para Ctrl+F2
  const [editingCusto,   setEditingCusto]   = React.useState(null); // 'id_custo' | 'id_real'
  const [busca,          setBusca]          = React.useState('');
  const [filtroStatus,   setFiltroStatus]   = React.useState('');
  const [filtroResp,     setFiltroResp]     = React.useState('');

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

  // ── Gerenciamento de colunas ────────────────────────────────────────────────
  const [colOrder, setColOrder] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem(`ls_cols_${obraId}`) || 'null') || LISTA_DEFAULT_ORDER; }
    catch { return LISTA_DEFAULT_ORDER; }
  });
  const [colWidths, setColWidths] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem(`ls_widths_${obraId}`) || 'null') || {}; }
    catch { return {}; }
  });
  const dragColRef = React.useRef(null);

  React.useEffect(() => {
    if (obraId) localStorage.setItem(`ls_cols_${obraId}`, JSON.stringify(colOrder));
  }, [colOrder, obraId]);
  React.useEffect(() => {
    if (obraId) localStorage.setItem(`ls_widths_${obraId}`, JSON.stringify(colWidths));
  }, [colWidths, obraId]);

  const getColW = (colId) => colWidths[colId] ?? LISTA_COL_DEFS[colId]?.defWidth ?? 100;

  const frozenLeft = React.useMemo(() => {
    const out = {}; let acc = 0;
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
  const onColDragOver  = (ev) => { ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; };
  const onColDrop      = (ev, targetColId) => {
    ev.preventDefault();
    const from = dragColRef.current;
    if (!from || from === targetColId || LISTA_FROZEN.includes(from) || LISTA_FROZEN.includes(targetColId)) return;
    setColOrder(prev => {
      const next = [...prev];
      const fi = next.indexOf(from), ti = next.indexOf(targetColId);
      if (fi < 0 || ti < 0) return prev;
      next.splice(fi, 1); next.splice(ti, 0, from);
      return next;
    });
    dragColRef.current = null;
  };

  const renderTh = (colId) => {
    const col = LISTA_COL_DEFS[colId];
    if (!col) return null;
    const isFrozen = col.frozen;
    const w = getColW(colId);
    return (
      <th key={colId}
        style={{
          width: w, minWidth: w, position: 'relative',
          ...(isFrozen ? { position: 'sticky', left: frozenLeft[colId], zIndex: 4 } : {}),
          cursor: !isFrozen ? 'grab' : undefined,
          userSelect: 'none',
          ...(col.align === 'right' ? { textAlign: 'right' } : {}),
        }}
        draggable={!isFrozen}
        onDragStart={!isFrozen ? (ev) => onColDragStart(ev, colId) : undefined}
        onDragOver={!isFrozen ? onColDragOver : undefined}
        onDrop={!isFrozen ? (ev) => onColDrop(ev, colId) : undefined}
      >
        {col.label}
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 5, cursor: 'col-resize', zIndex: 5 }}
          draggable={false} onMouseDown={(ev) => startColResize(ev, colId)} />
      </th>
    );
  };

  // Aplica filtros de busca sobre as linhas visíveis
  const filtrada = React.useMemo(() =>
    visible.filter(e =>
      (!busca || e.etapa.toLowerCase().includes(busca.toLowerCase())) &&
      (!filtroStatus || e.status === filtroStatus) &&
      (!filtroResp || (e.responsavel || '').toLowerCase().includes(filtroResp.toLowerCase()))
    ),
    [visible, busca, filtroStatus, filtroResp]
  );

  // Limpa seleção se o item selecionado for excluído
  React.useEffect(() => {
    if (selectedId && !etapas.find(e => e.id === selectedId)) setSelectedId(null);
    setMultiSel(ms => ms.filter(id => etapas.find(e => e.id === id)));
  }, [etapas, selectedId]);

  // Atalho Ctrl+F2 — cria vínculos em cadeia entre tarefas de multiSel (na ordem de clique)
  React.useEffect(() => {
    const handler = (e) => {
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
        onCommit(novas);
        setMultiSel([]);
        toast(`${multiSel.length - 1} vínculo(s) criado(s)`, { tone: 'success', icon: 'check' });
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [multiSel, etapas]);

  // ── Atualização de campo ────────────────────────────────────────────────────
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

    const novas = etapas.map(e => {
      if (e.id !== id) return e;
      if (field === 'inicio') {
        const offset = Math.round(dateToOffset(rawValue));
        return { ...e, inicio: offset };
      }
      if (field === 'fim') {
        const offset = Math.round(dateToOffset(rawValue));
        const newDur = Math.max(1, offset - e.inicio);
        return { ...e, dur: newDur };
      }
      if (field === 'duracaoDias') {
        return { ...e, dur: Math.max(1, parseInt(rawValue) || 1) };
      }
      if (field === 'avanco') {
        return { ...e, avanco: Math.min(100, Math.max(0, parseInt(rawValue) || 0)) };
      }
      if (field === 'dep') {
        return { ...e, dep: parseDep(rawValue, etapas) };
      }
      if (field === 'restricaoTipo') {
        return { ...e, restricaoTipo: rawValue };
      }
      if (field === 'restricaoData') {
        return { ...e, restricaoData: rawValue };
      }
      if (field === 'custo' || field === 'custoRealizado') {
        return { ...e, [field]: parseBRL(rawValue) };
      }
      if (field.startsWith('cc_')) {
        return { ...e, customCols: { ...(e.customCols || {}), [field]: rawValue } };
      }
      return { ...e, [field]: rawValue };
    });

    onCommit(novas, { silent: true });
  };

  const handleToggleCollapse = (id) => {
    const novas = etapas.map(e => e.id === id ? { ...e, collapsed: !e.collapsed } : e);
    onCommit(novas, { silent: true });
  };

  // ── Ações de toolbar ────────────────────────────────────────────────────────
  const handleAddTask    = () => onCommit(createTask(selectedId, etapas, customCols), { silent: true });
  const handleAddSubtask = () => { if (!selectedId) return; onCommit(createSubtask(selectedId, etapas, customCols), { silent: true }); };
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
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'ArrowRight') { e.preventDefault(); handleIndent(); }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'ArrowLeft')  { e.preventDefault(); handleOutdent(); }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [selectedId, etapas]);

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

  const btnStyle = { fontSize: 12, padding: '4px 10px', height: 30, gap: 5, display: 'flex', alignItems: 'center' };

  return (
    <div className="card" style={{ marginTop: 'var(--gap)' }}>

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 8, padding: '10px 16px', alignItems: 'center',
        flexWrap: 'wrap', background: 'var(--surface-muted)',
        borderBottom: '1px solid var(--border)',
      }}>
        <button className="btn btn-ghost" style={btnStyle} onClick={handleAddTask}>
          <Icon name="plus" size={13} /> Adicionar tarefa
        </button>

        <button className="btn btn-ghost" style={{ ...btnStyle, opacity: selectedId ? 1 : 0.45 }} onClick={handleAddSubtask} disabled={!selectedId}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 10 20 15 15 20"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/>
          </svg>
          Subtarefa
        </button>

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

        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

        <button
          className="btn btn-ghost"
          style={{ ...btnStyle, opacity: canIndent ? 1 : 0.4 }}
          onClick={handleIndent}
          title="Recuar tarefa — tornar subtarefa da linha acima (Ctrl+Shift+→)"
          disabled={!canIndent}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          Recuar
        </button>

        <button
          className="btn btn-ghost"
          style={{ ...btnStyle, opacity: canOutdent ? 1 : 0.4 }}
          onClick={handleOutdent}
          title="Promover tarefa — subir um nível hierárquico (Ctrl+Shift+←)"
          disabled={!canOutdent}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Promover
        </button>

        <div style={{ flex: 1 }} />

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

      {/* ── Tabela ───────────────────────────────────────────────────────── */}
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl tbl-lista" style={{ minWidth: 1780 }}>
          <thead>
            <tr>
              {colOrder.map(colId => renderTh(colId))}
              {customCols.map(col => (
                <th key={col.id} style={{ minWidth: getColW(col.id) || 110, position: 'relative', userSelect: 'none' }}>
                  {col.label}
                  <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 5, cursor: 'col-resize', zIndex: 5 }}
                    onMouseDown={(ev) => startColResize(ev, col.id)} />
                </th>
              ))}
              <th style={{ width: 36, padding: '0 8px', textAlign: 'center' }}>
                <button
                  onClick={() => setShowAddCol(true)}
                  title="Adicionar coluna personalizada"
                  style={{ color: 'var(--text-faint)', fontSize: 18, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontWeight: 300 }}
                >+</button>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtrada.map((e) => {
              const isSelected  = selectedId === e.id;
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
                ? 'color-mix(in srgb, var(--brand) 8%, transparent)'
                : e.isGroup ? 'var(--surface-muted)' : 'var(--surface)';
              const stickyStyle = (colId) => ({
                position: 'sticky', left: frozenLeft[colId], zIndex: 1, background: frozenBg,
              });

              // Mapa de células por colId — renderizadas na ordem de colOrder
              const cells = {
                wbs: (
                  <td key="wbs" className="mono text-sm text-muted" style={{ paddingRight: 4, ...stickyStyle('wbs') }}>
                    {wbsMap[e.id]}
                  </td>
                ),
                id: (
                  <td key="id" className="mono" style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', ...stickyStyle('id') }}>
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
                        style={{ fontWeight: e.isGroup ? 600 : 400 }} />
                      {isMultiSel && <span className="multi-sel-badge">{multiIdx + 1}</span>}
                    </div>
                  </td>
                ),
                inicio: (
                  <td key="inicio" className="mono text-sm" onClick={ev => ev.stopPropagation()}>
                    <EditableCell type="date" value={offsetToISO(eInicio)}
                      onSave={v => handleCellSave(e.id, 'inicio', v)} readOnly={e.isGroup} />
                  </td>
                ),
                fim: (
                  <td key="fim" className="mono text-sm" onClick={ev => ev.stopPropagation()}>
                    <EditableCell type="date" value={offsetToISO(eInicio + eDur)}
                      onSave={v => handleCellSave(e.id, 'fim', v)} readOnly={e.isGroup} />
                  </td>
                ),
                duracao: (
                  <td key="duracao" className="mono num" onClick={ev => ev.stopPropagation()}>
                    {e.isGroup ? (
                      <span className="text-muted mono" style={{ fontSize: 12 }}>{eDur}d</span>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <EditableCell type="number" value={String(e.dur)}
                          onSave={v => handleCellSave(e.id, 'duracaoDias', v)} style={{ minWidth: 32 }} />
                        <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>d</span>
                      </div>
                    )}
                  </td>
                ),
                avanco: (
                  <td key="avanco" onClick={ev => ev.stopPropagation()}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, minWidth: 50 }}>
                        <div className={'progress' + (e.status === 'done' ? ' success' : e.status === 'late' ? ' danger' : '')}>
                          <span style={{ width: eAvanco + '%' }}></span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <EditableCell type="number" value={String(eAvanco)}
                          onSave={v => handleCellSave(e.id, 'avanco', v)} readOnly={e.isGroup}
                          style={{ fontFamily: 'var(--font-mono)', fontSize: 12, minWidth: 28 }} />
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>%</span>
                      </div>
                    </div>
                  </td>
                ),
                custo: (
                  <td key="custo" className="num" style={{ textAlign: 'right' }} onClick={ev => ev.stopPropagation()}>
                    {e.isGroup ? (
                      <span className="text-muted mono" style={{ fontSize: 12 }}>{fmtBRL(gv?.custo || 0)}</span>
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
                  <td key="peso" className="num text-muted mono" style={{ textAlign: 'right', fontSize: 12 }}>
                    {!e.isGroup && totalCusto > 0 ? ((e.custo || 0) / totalCusto * 100).toFixed(1) + '%' : '—'}
                  </td>
                ),
                custoReal: (
                  <td key="custoReal" className="num" style={{ textAlign: 'right' }} onClick={ev => ev.stopPropagation()}>
                    {e.isGroup ? (
                      <span className="text-muted mono" style={{ fontSize: 12 }}>
                        {fmtBRL(etapas.filter(c => c.parentId === e.id).reduce((s, c) => s + (c.custoRealizado || 0), 0))}
                      </span>
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
                      const prev = e.isGroup ? (gv?.custo || 0) : (e.custo || 0);
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
                    <EditableCell value={e.responsavel || ''} onSave={v => handleCellSave(e.id, 'responsavel', v)} />
                  </td>
                ),
                dep: (
                  <td key="dep" className="mono text-sm" onClick={ev => ev.stopPropagation()}>
                    <EditableCell value={formatDepList(e.dep, etapas)} onSave={v => handleCellSave(e.id, 'dep', v)} readOnly={e.isGroup} />
                  </td>
                ),
                succ: (
                  <td key="succ" className="mono text-sm text-muted">
                    {(succMap[e.id] || []).map(id => idToDisplayId[id] ?? id).join(', ') || '—'}
                  </td>
                ),
                status: (
                  <td key="status">
                    <span className={'badge ' + statusBadgeClass(e.status)}>
                      <span className="dot"></span>{statusLabel(e.status)}
                    </span>
                  </td>
                ),
                restricao: (
                  <td key="restricao" onClick={ev => ev.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                    {e.isGroup ? <span className="text-faint">—</span> : (
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <select className="input" style={{ height: 26, fontSize: 11, padding: '0 4px' }}
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
              };

              return (
                <tr key={e.id}
                  className={isSelected ? 'lista-row-selected' : e.isGroup ? 'lista-row-group' : ''}
                  onClick={(ev) => {
                    if (ev.ctrlKey || ev.metaKey) {
                      ev.preventDefault();
                      setMultiSel(ms => ms.includes(e.id) ? ms.filter(id => id !== e.id) : [...ms, e.id]);
                    } else {
                      setSelectedId(id => id === e.id ? null : e.id);
                      setMultiSel([]);
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {colOrder.map(colId => cells[colId] || null)}

                  {/* Colunas personalizadas */}
                  {customCols.map(col => {
                    const cellVal = (e.customCols || {})[col.id] || '';
                    if (col.type === 'boolean') return (
                      <td key={col.id} onClick={ev => ev.stopPropagation()}>
                        <select className="input" style={{ height: 26, fontSize: 11, padding: '0 4px' }}
                          value={cellVal} onChange={ev => handleCellSave(e.id, col.id, ev.target.value)}>
                          <option value="">—</option>
                          <option value="sim">Sim</option>
                          <option value="não">Não</option>
                        </select>
                      </td>
                    );
                    if (col.type === 'list') return (
                      <td key={col.id} onClick={ev => ev.stopPropagation()}>
                        <select className="input" style={{ height: 26, fontSize: 11, padding: '0 4px' }}
                          value={cellVal} onChange={ev => handleCellSave(e.id, col.id, ev.target.value)}>
                          <option value="">—</option>
                          {(col.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </td>
                    );
                    if (col.type === 'currency') return (
                      <td key={col.id} onClick={ev => ev.stopPropagation()} className="num" style={{ textAlign: 'right' }}>
                        <EditableCell type="number" value={cellVal} onSave={v => handleCellSave(e.id, col.id, v)}
                          style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }} />
                      </td>
                    );
                    if (col.type === 'percent') return (
                      <td key={col.id} onClick={ev => ev.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <EditableCell type="number" value={cellVal} onSave={v => handleCellSave(e.id, col.id, v)} />
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>%</span>
                        </div>
                      </td>
                    );
                    if (col.type === 'duration') return (
                      <td key={col.id} onClick={ev => ev.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <EditableCell type="number" value={cellVal} onSave={v => handleCellSave(e.id, col.id, v)} />
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>d</span>
                        </div>
                      </td>
                    );
                    return (
                      <td key={col.id} onClick={ev => ev.stopPropagation()}>
                        <EditableCell type={col.type} value={cellVal} onSave={v => handleCellSave(e.id, col.id, v)} />
                      </td>
                    );
                  })}

                  <td></td>
                </tr>
              );
            })}

            {/* Linha de adição rápida */}
            {filtrada.length === 0 && (
              <tr>
                <td colSpan={16 + customCols.length + 1} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-faint)', fontSize: 13 }}>
                  {visible.length === 0
                    ? <>Nenhuma tarefa — clique em <strong>Adicionar tarefa</strong> para começar</>
                    : 'Nenhuma tarefa corresponde aos filtros aplicados'}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 600, borderTop: '2px solid var(--border)', background: 'var(--surface-raised)' }}>
              <td colSpan={7} style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-soft)', padding: '8px 8px 8px 0' }}>Total</td>
              <td className="num mono" style={{ textAlign: 'right', fontSize: 12, padding: '8px 4px' }}>{fmtBRL(totalCusto)}</td>
              <td className="num mono text-muted" style={{ textAlign: 'right', fontSize: 12, padding: '8px 4px' }}>100%</td>
              <td className="num mono" style={{ textAlign: 'right', fontSize: 12, padding: '8px 4px' }}>{fmtBRL(totalReal)}</td>
              <td className="num mono" style={{ textAlign: 'right', fontSize: 12, padding: '8px 4px' }}>
                <span style={{ color: totalSaldo < 0 ? 'var(--danger)' : 'inherit' }}>{fmtBRL(totalSaldo)}</span>
              </td>
              <td colSpan={5 + customCols.length + 1}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {showAddCol && <AddColModal onClose={() => setShowAddCol(false)} onAdd={handleAddCol} />}

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
    </div>
  );
};

// ─── UsoTarefaView ───────────────────────────────────────────────────────────
const UsoTarefaView = ({ etapas, months, monthlyDist }) => {
  const [selectedId, setSelectedId] = React.useState(null);
  const [detalhe,    setDetalhe]    = React.useState('custo');
  const leftRef  = React.useRef(null);
  const rightRef = React.useRef(null);
  const syncing  = React.useRef(false);

  React.useEffect(() => {
    const L = leftRef.current, R = rightRef.current;
    if (!L || !R) return;
    const sl = () => { if (!syncing.current) { syncing.current = true; R.scrollTop = L.scrollTop; syncing.current = false; } };
    const sr = () => { if (!syncing.current) { syncing.current = true; L.scrollTop = R.scrollTop; syncing.current = false; } };
    L.addEventListener('scroll', sl);
    R.addEventListener('scroll', sr);
    return () => { L.removeEventListener('scroll', sl); R.removeEventListener('scroll', sr); };
  }, []);

  const visible = React.useMemo(() => getVisibleEtapas(etapas), [etapas]);
  const wbsMap  = React.useMemo(() => computeAllWBS(etapas), [etapas]);

  const getDist = (e) =>
    e.isGroup
      ? getGroupMonthlyDist(e.id, etapas, monthlyDist)
      : (monthlyDist[e.id] || {});

  const rowBg = (e) =>
    selectedId === e.id
      ? 'color-mix(in srgb, var(--brand) 8%, transparent)'
      : e.isGroup ? 'var(--surface-muted)' : undefined;

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
    textAlign: 'left',
  };
  const tdSt = {
    padding: '0 10px',
    height: 36,
    fontSize: 13,
    whiteSpace: 'nowrap',
    borderBottom: '1px solid var(--border-subtle, rgba(0,0,0,0.06))',
    verticalAlign: 'middle',
  };

  if (!months.length) return (
    <div className="card" style={{ marginTop: 'var(--gap)', padding: 40, textAlign: 'center' }}>
      <p className="text-muted">Adicione tarefas com datas e valores para ver a distribuição.</p>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 280px)', marginTop: 'var(--gap)' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0', marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: 'var(--text-soft)' }}>Detalhe:</span>
        <select className="input" value={detalhe} onChange={e => setDetalhe(e.target.value)}
          style={{ fontSize: 13, padding: '4px 10px', minWidth: 130 }}>
          <option value="custo">Custo (R$)</option>
        </select>
        <span style={{ fontSize: 12, color: 'var(--text-faint)', marginLeft: 8 }}>
          Clique em uma tarefa para destacar na grade
        </span>
      </div>

      {/* Painel dividido */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)' }}>

        {/* Lado esquerdo — hierarquia */}
        <div ref={leftRef} style={{ width: 480, flexShrink: 0, overflowY: 'auto', overflowX: 'hidden', borderRight: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 44 }} />
              <col style={{ width: 52 }} />
              <col />
              <col style={{ width: 82 }} />
              <col style={{ width: 82 }} />
              <col style={{ width: 50 }} />
              <col style={{ width: 40 }} />
              <col style={{ width: 84 }} />
            </colgroup>
            <thead>
              <tr>
                {['ID','EAP','Nome da Tarefa','Início','Término','Dur.','%','R$'].map((h, i) => (
                  <th key={h} style={{ ...thSt, textAlign: i >= 5 ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map(e => (
                <tr key={e.id}
                  style={{ background: rowBg(e), cursor: 'pointer', height: 36 }}
                  onClick={() => setSelectedId(e.id === selectedId ? null : e.id)}>
                  <td style={{ ...tdSt, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-soft)' }}>
                    {e.displayId ?? e.id}
                  </td>
                  <td style={{ ...tdSt, color: 'var(--text-faint)', fontSize: 12 }}>{wbsMap[e.id] || ''}</td>
                  <td style={{ ...tdSt, paddingLeft: (e.nivel * 14 + 10) + 'px', fontWeight: e.isGroup ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {e.isGroup && <span style={{ marginRight: 5, color: 'var(--text-faint)', fontSize: 10 }}>▸</span>}
                    {e.etapa}
                  </td>
                  <td style={{ ...tdSt, color: 'var(--text-soft)', fontSize: 12 }}>{offsetToISO(e.inicio)}</td>
                  <td style={{ ...tdSt, color: 'var(--text-soft)', fontSize: 12 }}>{offsetToISO(e.inicio + e.dur)}</td>
                  <td style={{ ...tdSt, textAlign: 'right', color: 'var(--text-soft)' }}>{e.dur}d</td>
                  <td style={{ ...tdSt, textAlign: 'right' }}>{e.avanco}%</td>
                  <td style={{ ...tdSt, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {e.isGroup ? '—' : formatBRL(e.custo || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Lado direito — grade temporal */}
        <div ref={rightRef} style={{ flex: 1, overflowX: 'auto', overflowY: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 80 }} />
              {months.map(m => <col key={m.key} style={{ width: 110 }} />)}
              <col style={{ width: 110 }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ ...thSt }}>Detalhe</th>
                {months.map(m => (
                  <th key={m.key} style={{ ...thSt, textAlign: 'right' }}>{m.label}</th>
                ))}
                <th style={{ ...thSt, textAlign: 'right', color: 'var(--text)' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(e => {
                const dist  = getDist(e);
                const total = Object.values(dist).reduce((s, v) => s + v, 0);
                return (
                  <tr key={e.id}
                    style={{ background: rowBg(e), cursor: 'pointer', height: 36 }}
                    onClick={() => setSelectedId(e.id === selectedId ? null : e.id)}>
                    <td style={{ ...tdSt, color: 'var(--text-soft)', fontSize: 12, paddingLeft: 14 }}>Custo</td>
                    {months.map(m => {
                      const v = dist[m.key] || 0;
                      return (
                        <td key={m.key} style={{ ...tdSt, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: v > 0 ? 'var(--text)' : 'var(--text-faint)' }}>
                          {v > 0 ? formatBRL(v) : '—'}
                        </td>
                      );
                    })}
                    <td style={{ ...tdSt, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                      {total > 0 ? formatBRL(total) : '—'}
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

// ─── CurvaFisicaView — Curva S planejada ─────────────────────────────────────
const CurvaFisicaView = ({ months, monthlyTotals }) => {
  if (!months || !months.length || !Object.values(monthlyTotals || {}).some(v => v > 0)) return (
    <div className="card" style={{ marginTop: 'var(--gap)', padding: 40, textAlign: 'center' }}>
      <Icon name="trending-up" size={40} style={{ color: 'var(--text-faint)' }} />
      <h3 style={{ marginTop: 12, fontSize: 16, color: 'var(--text-soft)' }}>Curva S — Distribuição financeira planejada</h3>
      <p className="text-muted" style={{ maxWidth: 420, margin: '6px auto 0', fontSize: 13 }}>
        Adicione tarefas com datas e custos no cronograma para gerar a Curva S automaticamente.
      </p>
    </div>
  );

  const total = months.reduce((s, m) => s + (monthlyTotals[m.key] || 0), 0);
  let acum = 0;

  return (
    <div className="card" style={{ marginTop: 'var(--gap)' }}>
      <div className="card-header">
        <div>
          <div className="card-title">Curva S — Distribuição financeira planejada</div>
          <div className="card-subtitle">Custo previsto mensal e acumulado · calculado automaticamente pelo cronograma</div>
        </div>
      </div>
      <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface-muted)' }}>
              {['Mês', 'Previsto (R$)', '% Mensal', 'Acumulado (R$)', '% Acumulado', ''].map((h, i) => (
                <th key={i} style={{
                  padding: '10px 14px',
                  textAlign: i === 0 ? 'left' : 'right',
                  fontSize: 10.5, fontWeight: 600, letterSpacing: '0.07em',
                  textTransform: 'uppercase', color: 'var(--text-soft)',
                  borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {months.map((m, i) => {
              const v = monthlyTotals[m.key] || 0;
              acum += v;
              const pctMes  = total > 0 ? (v / total * 100) : 0;
              const pctAcum = total > 0 ? (acum / total * 100) : 0;
              const tdB = { padding: '9px 14px', borderBottom: '1px solid var(--border-subtle, rgba(0,0,0,0.06))', verticalAlign: 'middle' };
              return (
                <tr key={m.key} style={{ background: i % 2 === 0 ? undefined : 'rgba(0,0,0,0.013)' }}>
                  <td style={{ ...tdB, fontWeight: 500 }}>{m.label}</td>
                  <td style={{ ...tdB, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: v > 0 ? 'var(--text)' : 'var(--text-faint)' }}>
                    {v > 0 ? formatBRL(v) : '—'}
                  </td>
                  <td style={{ ...tdB, textAlign: 'right', color: 'var(--text-soft)' }}>
                    {pctMes > 0 ? pctMes.toFixed(1) + '%' : '—'}
                  </td>
                  <td style={{ ...tdB, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
                    {formatBRL(acum)}
                  </td>
                  <td style={{ ...tdB, textAlign: 'right', color: 'var(--text-soft)' }}>
                    {pctAcum.toFixed(1)}%
                  </td>
                  <td style={{ ...tdB, width: 180 }}>
                    <div style={{ background: 'var(--border)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                      <div style={{ width: pctAcum + '%', height: '100%', background: 'var(--brand)', borderRadius: 4 }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: 'var(--surface-muted)', fontWeight: 600 }}>
              <td style={{ padding: '10px 14px', borderTop: '2px solid var(--border)' }}>Total</td>
              <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderTop: '2px solid var(--border)' }}>{formatBRL(total)}</td>
              <td style={{ padding: '10px 14px', textAlign: 'right', borderTop: '2px solid var(--border)' }}>100%</td>
              <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderTop: '2px solid var(--border)' }}>{formatBRL(total)}</td>
              <td style={{ padding: '10px 14px', textAlign: 'right', borderTop: '2px solid var(--border)' }}>100%</td>
              <td style={{ padding: '10px 14px', borderTop: '2px solid var(--border)' }} />
            </tr>
          </tfoot>
        </table>
      </div>
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

async function salvarCronograma(obraId, etapas, customCols, baselines) {
  await supabase.from('cronogramas').upsert(
    { obra_id: obraId, etapas, custom_cols: customCols, baselines, updated_at: new Date().toISOString() },
    { onConflict: 'obra_id' }
  );
}

async function carregarCronogramaDB(obraId) {
  const { data, error } = await supabase.from('cronogramas')
    .select('etapas, custom_cols, baselines')
    .eq('obra_id', obraId)
    .single();
  return error ? null : data;
}

// ─── Modal: Criar Linha de Base ──────────────────────────────────────────────
const CriarLinhaModal = ({ totalExistentes, totalEtapas, onClose, onCreate }) => {
  const [nome, setNome] = React.useState(`Linha de Base ${totalExistentes + 1}`);
  return (
    <Modal title="Criar Linha de Base" onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!nome.trim()}
            onClick={() => { if (nome.trim()) { onCreate(nome.trim()); onClose(); } }}
          >
            <Icon name="check" size={14} />Criar
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        <div>
          <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-soft)', display: 'block', marginBottom: 6 }}>
            Nome da linha de base
          </label>
          <input className="input" value={nome} autoFocus
            onChange={e => setNome(e.target.value)}
            placeholder="Ex: Planejamento Inicial"
            style={{ width: '100%' }}
          />
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>
          O estado atual do cronograma ({totalEtapas} etapas) será salvo nesta linha de base e poderá ser comparado com versões futuras.
        </p>
      </div>
    </Modal>
  );
};

// ─── Modal: Gerenciar Linhas de Base ─────────────────────────────────────────
const GerenciarLinhasModal = ({ baselines, blVisivelId, onSelect, onDuplicar, onExcluir, onClose }) => (
  <Modal title="Gerenciar Linhas de Base" subtitle={`${baselines.length} linha${baselines.length !== 1 ? 's' : ''} de base`} size="lg" onClose={onClose}
    footer={<button className="btn btn-ghost" onClick={onClose}>Fechar</button>}
  >
    {baselines.length === 0
      ? <p style={{ fontSize: 13.5, color: 'var(--text-muted)', padding: '24px 0', textAlign: 'center' }}>
          Nenhuma linha de base cadastrada. Clique em "Criar Linha de Base" para começar.
        </p>
      : (
        <table className="tbl">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Criada em</th>
              <th className="right">Etapas</th>
              <th style={{ textAlign: 'center' }}>Visível</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {baselines.map(b => (
              <tr key={b.id}>
                <td className="strong">{b.nome}</td>
                <td className="mono text-muted">{b.criadaEm}</td>
                <td className="right num">{b.etapas.length}</td>
                <td style={{ textAlign: 'center' }}>
                  <input type="radio" name="bl-visivel"
                    checked={blVisivelId === b.id}
                    onChange={() => onSelect(blVisivelId === b.id ? null : b.id)}
                    style={{ cursor: 'pointer' }}
                  />
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => onDuplicar(b.id)}>Duplicar</button>
                    <button className="btn btn-sm" style={{ color: 'var(--danger)' }}
                      onClick={() => onExcluir(b.id)}>Excluir</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )
    }
  </Modal>
);

// ─── CronogramaFull ──────────────────────────────────────────────────────────
const CronogramaFull = ({ initialObraId }) => {
  const D    = AppData;
  const toast = useToast();

  // Escolhe a obra inicial sem usar OB-001 hardcoded
  const defaultObraId = initialObraId
    || D.obras.find(o => o.status === 'em_andamento')?.id
    || D.obras[0]?.id
    || null;

  const [obraSel,      setObraSel]      = React.useState(defaultObraId);
  const [view,         setView]         = React.useState('gantt');
  const [etapas,       setEtapas]       = React.useState([]);
  const [customCols,   setCustomCols]   = React.useState(() => D.cronogramaCustomCols || []);
  const [baselines,    setBaselines]    = React.useState(() => carregarBaselines(defaultObraId || ''));
  const [blVisivelId,  setBlVisivelId]  = React.useState(null);
  const [showCriar,    setShowCriar]    = React.useState(false);
  const [showGerenciar, setShowGerenciar] = React.useState(false);
  const [outlineOpen,  setOutlineOpen]  = React.useState(false);
  const [loadedObraId, setLoadedObraId] = React.useState(null);
  // isLoading derivado: true quando obraSel existe mas ainda não terminou de carregar seus dados
  const isLoading = !!(obraSel && loadedObraId !== obraSel);

  // Histórico de undo/redo unificado (Lista + Gantt)
  const histRef = React.useRef([etapas.map(e => ({ ...e }))]);
  const hidxRef = React.useRef(0);
  const undoRef        = React.useRef(null);
  const redoRef        = React.useRef(null);
  const applyOutlineRef = React.useRef(null);
  const saveTimerRef   = React.useRef(null);

  // Recarrega etapas, histórico e baselines ao trocar de obra (Supabase first, fallback para mock)
  React.useEffect(() => {
    let cancelled = false;
    async function carregar() {
      if (!obraSel) { setLoadedObraId(null); return; }
      // isLoading já é true sincronamente quando obraSel muda — sem necessidade de setState extra
      const db = await carregarCronogramaDB(obraSel);
      if (cancelled) return;
      if (db) {
        const etapasDB = migrateEtapas(db.etapas || []);
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
      } else {
        const mock = migrateEtapas(D.cronograma[obraSel] || []);
        setEtapas(mock);
        histRef.current = [mock.map(e => ({ ...e }))];
        hidxRef.current = 0;
        setBaselines(carregarBaselines(obraSel));
      }
      setBlVisivelId(null);
      setLoadedObraId(obraSel); // marca carga concluída — isLoading vira false
    }
    carregar();
    return () => { cancelled = true; };
  }, [obraSel]);

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
    salvarCronograma(obraSel, etapas, customCols, novas);
    toast(`Linha de base "${nome}" criada`, { tone: 'success', icon: 'check' });
  };

  const excluirLinha = (id) => {
    const novas = baselines.filter(b => b.id !== id);
    setBaselines(novas);
    salvarBaselines(obraSel, novas);
    salvarCronograma(obraSel, etapas, customCols, novas);
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
    salvarCronograma(obraSel, etapas, customCols, novas);
    toast(`"${copia.nome}" criada`, { tone: 'success', icon: 'check' });
  };

  const handleCustomColsChange = (novasCols) => {
    setCustomCols(novasCols);
    D.cronogramaCustomCols = novasCols;
    salvarCronograma(obraSel, etapas, novasCols, baselines);
  };

  // Etapas da baseline visível (null = nenhuma)
  const baselineEtapas = blVisivelId ? (baselines.find(b => b.id === blVisivelId)?.etapas || null) : null;

  const obra       = D.obras.find(o => o.id === obraSel) || D.obras[0];
  const concluidas = etapas.filter(e => e.status === 'done').length;
  const atrasadas  = etapas.filter(e => e.status === 'late').length;

  // Avanço ponderado pelo custo de cada etapa (folhas, não grupos)
  const avancoTotal = React.useMemo(() => {
    const folhas    = etapas.filter(e => !e.isGroup);
    if (!folhas.length) return 0;
    const totalCusto = folhas.reduce((s, e) => s + (e.custo || 0), 0);
    if (!totalCusto) return Math.round(folhas.reduce((s, e) => s + e.avanco, 0) / folhas.length);
    return Math.round(folhas.reduce((s, e) => s + e.avanco * (e.custo || 0), 0) / totalCusto);
  }, [etapas]);

  // Distribuição mensal de custos — alimenta Uso da Tarefa e Curva S
  const months      = React.useMemo(() => getMonthRange(etapas),      [etapas]);
  const monthlyDist = React.useMemo(() => computeMonthlyDist(etapas), [etapas]);
  const monthlyTotals = React.useMemo(() => {
    const t = {};
    Object.values(monthlyDist).forEach(d =>
      Object.entries(d).forEach(([k, v]) => { t[k] = (t[k] || 0) + v; })
    );
    return t;
  }, [monthlyDist]);

  // ── Commit (fonte única de verdade) ────────────────────────────────────────
  const commit = (novas, opts = {}) => {
    const clean = novas.map(e => ({ ...e }));
    const h = histRef.current.slice(0, hidxRef.current + 1);
    h.push(clean);
    histRef.current = h;
    hidxRef.current = h.length - 1;
    setEtapas(clean);
    D.cronograma[obraSel] = clean;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => salvarCronograma(obraSel, clean, customCols, baselines), 800);
    if (!opts.silent) {
      const cfls = gmConflicts(clean);
      if (cfls.length > 0) {
        toast(`Salvo com ${cfls.length} conflito(s) de precedência`, { tone: 'warning', icon: 'alert-triangle' });
      } else {
        toast('Cronograma atualizado', { tone: 'success', icon: 'check' });
      }
    }
  };

  const undo = () => {
    if (hidxRef.current <= 0) { toast('Nada para desfazer', { tone: 'neutral', icon: 'alert' }); return; }
    hidxRef.current--;
    const snap = histRef.current[hidxRef.current].map(e => ({ ...e }));
    setEtapas(snap);
    D.cronograma[obraSel] = snap;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => salvarCronograma(obraSel, snap, customCols, baselines), 800);
    toast('Ação desfeita', { tone: 'neutral', icon: 'check' });
  };

  const redo = () => {
    if (hidxRef.current >= histRef.current.length - 1) { toast('Nada para refazer', { tone: 'neutral', icon: 'alert' }); return; }
    hidxRef.current++;
    const snap = histRef.current[hidxRef.current].map(e => ({ ...e }));
    setEtapas(snap);
    D.cronograma[obraSel] = snap;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => salvarCronograma(obraSel, snap, customCols, baselines), 800);
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
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undoRef.current(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redoRef.current(); }
      if (e.altKey && e.shiftKey && e.key === '*') { e.preventDefault(); applyOutlineRef.current(0); }
      if (e.altKey && e.shiftKey && (e.key === '-' || e.key === '_')) { e.preventDefault(); applyOutlineRef.current(1); }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  React.useEffect(() => {
    if (!outlineOpen) return;
    const h = () => setOutlineOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [outlineOpen]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Cronogramas</h1>
          <div className="page-subtitle">Planejamento físico das obras · Gantt interativo com replanejamento direto</div>
        </div>
        <div className="page-actions">
          <select className="input" value={obraSel || ''} onChange={e => setObraSel(e.target.value)} style={{ minWidth: 200 }}>
            {!obraSel && <option value="">Selecione uma obra</option>}
            {D.obras.filter(o => o.status === 'em_andamento').map(o => (
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
            <button className={view === 'gantt' ? 'active' : ''} onClick={() => setView('gantt')}>Gantt</button>
            <button className={view === 'lista' ? 'active' : ''} onClick={() => setView('lista')}>Lista</button>
            <button className={view === 'uso'   ? 'active' : ''} onClick={() => setView('uso')}>Uso da Tarefa</button>
            <button className={view === 'curva' ? 'active' : ''} onClick={() => setView('curva')}>Curva Física</button>
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
          <button className="btn btn-ghost" onClick={() => setShowCriar(true)}>
            <Icon name="bookmark" size={15} />Criar Linha de Base
          </button>
          {baselines.length > 0 && (
            <button className="btn btn-ghost" onClick={() => setShowGerenciar(true)}>
              <Icon name="layers" size={15} />Gerenciar
            </button>
          )}
          <button className="btn btn-ghost"><Icon name="download" size={15} />Exportar</button>
        </div>
      </div>

      {isLoading
        ? <div className="text-muted" style={{ padding: 64, textAlign: 'center' }}>Carregando…</div>
        : !obraSel || etapas.length === 0
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
              {obraSel && (
                <button className="btn btn-primary" onClick={() => {
                  commit([{ id: 'TSK-001', etapa: 'Nova etapa', inicio: 0, dur: 30,
                            avanco: 0, status: 'upcoming', dep: [], milestone: false,
                            nivel: 0, parentId: null, isGroup: false, collapsed: false,
                            responsavel: '', customCols: {}, custo: 0,
                            restricaoTipo: 'asap', restricaoData: '' }]);
                  setView('lista');
                }}>
                  <Icon name="plus" size={15} />Criar cronograma
                </button>
              )}
            </div>
          )
          : (
            <>
              {/* KPIs */}
              <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
                <div className="kpi" style={{ padding: '14px 18px' }}>
                  <div className="kpi-label">Avanço físico</div>
                  <div className="kpi-value num" style={{ fontSize: 22, marginTop: 6 }}>{avancoTotal}<span className="unit">%</span></div>
                  <div className="kpi-foot" style={{ marginTop: 6 }}><span className="kpi-foot-text">ponderado pelo custo de cada etapa</span></div>
                </div>
                <div className="kpi" style={{ padding: '14px 18px' }}>
                  <div className="kpi-label">Custo previsto</div>
                  <div className="kpi-value num" style={{ fontSize: 18, marginTop: 6 }}>
                    {D.brl(etapas.filter(e => !e.isGroup).reduce((s, e) => s + (e.custo || 0), 0), { compact: true })}
                  </div>
                  <div className="kpi-foot" style={{ marginTop: 6 }}><span className="kpi-foot-text">soma das tarefas do cronograma</span></div>
                </div>
                <div className="kpi" style={{ padding: '14px 18px' }}>
                  <div className="kpi-label">Etapas concluídas</div>
                  <div className="kpi-value num" style={{ fontSize: 22, marginTop: 6 }}>{concluidas}<span className="unit">/ {etapas.length}</span></div>
                </div>
                <div className="kpi" style={{ padding: '14px 18px' }}>
                  <div className="kpi-label">Etapas atrasadas</div>
                  <div className="kpi-value num" style={{ fontSize: 22, marginTop: 6, color: 'var(--danger)' }}>{atrasadas}</div>
                  <div className="kpi-foot" style={{ marginTop: 6 }}><span className="kpi-foot-text">Caminho crítico afetado</span></div>
                </div>
                <div className="kpi" style={{ padding: '14px 18px' }}>
                  <div className="kpi-label">Folga total</div>
                  <div className="kpi-value num" style={{ fontSize: 22, marginTop: 6 }}>11<span className="unit">dias</span></div>
                </div>
              </div>

              {view === 'gantt' && (
                <div className="card" style={{ marginTop: 'var(--gap)' }}>
                  <div className="card-header">
                    <div>
                      <div className="card-title">{obra.nome} · Gantt interativo</div>
                      <div className="card-subtitle">{etapas.length} etapas · {GM_TOTAL} meses · arraste as barras para replanejar</div>
                    </div>
                    <div className="card-actions">
                      <div className="legend">
                        <span className="legend-item"><span className="legend-swatch" style={{ background: '#1b8f5e' }}></span>Concluída</span>
                        <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--brand)' }}></span>Em execução</span>
                        <span className="legend-item"><span className="legend-swatch" style={{ background: '#c0281f' }}></span>Atrasada</span>
                        <span className="legend-item"><span className="legend-swatch" style={{ background: '#3d7fc9' }}></span>Futura</span>
                        <span className="legend-item"><span className="legend-swatch" style={{ background: '#d97706' }}></span>Conflito</span>
                        <span className="legend-item"><span className="legend-swatch" style={{ width: 10, height: 10, background: 'var(--brand)', transform: 'rotate(45deg)', borderRadius: 0 }}></span>Marco</span>
                        {baselineEtapas && (
                          <span className="legend-item"><span className="legend-swatch" style={{ background: 'rgba(107,120,144,0.55)', height: 4 }}></span>Linha de base</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="card-body" style={{ padding: 0 }}>
                    <GanttInterativo key={obraSel} obraId={obraSel} etapas={etapas} onCommit={commit} undo={undo} redo={redo} baselineEtapas={baselineEtapas} />
                  </div>
                </div>
              )}

              {view === 'curva' && <CurvaFisicaView months={months} monthlyTotals={monthlyTotals} />}

              {view === 'lista' && (
                <ListaInterativa
                  etapas={etapas}
                  onCommit={commit}
                  customCols={customCols}
                  onCustomColsChange={handleCustomColsChange}
                  obraId={obraSel}
                />
              )}

              {view === 'uso' && (
                <UsoTarefaView etapas={etapas} months={months} monthlyDist={monthlyDist} />
              )}
            </>
          )
      }

      {showCriar && (
        <CriarLinhaModal
          totalExistentes={baselines.length}
          totalEtapas={etapas.length}
          onClose={() => setShowCriar(false)}
          onCreate={criarLinha}
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
    </>
  );
};

export { CronogramaFull, GanttInterativo };
export { GanttInterativo as GanttElegante };
