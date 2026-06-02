import React from 'react';
import { Icon } from '../../components/Icons';
import { AppData } from '../../utils/data';
import { supabase } from '../../services/supabase';
import { Modal, useToast } from '../../components/Modals';
import { formatBRL as formatBRLUtil } from '../../utils/formatters';
import { vinculoService } from '../financeiro/vinculoService';
import { computeValorVinculadoMap as _computeValorVinculadoMap } from './ganttUtils';
// ganttUtils exporta as funções puras do Gantt — disponíveis para testes e reutilização
export { gmConflicts, computeAllWBS, recomputeHierarchy, computeSuccessors, getVisibleEtapas,
         computeMonthlyDist, computeRealizedDist, getGroupMonthlyDist, verificarRestricoes,
         computeGroupValues, migrateEtapas, formatDepList, parseDep,
         computeValorVinculadoMap } from './ganttUtils';
// Alias local para uso interno neste módulo
const computeValorVinculadoMap = _computeValorVinculadoMap;

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

// Converte "YYYY-MM-DD" → "DD/MM/AAAA" para exibição
function isoToBR(iso) {
  if (!iso || iso.length < 10) return iso || '';
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
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
    milestone: false, custo: 0, showInDist: false,
    restricaoTipo: 'asap', restricaoData: '',
    fator_peso: 1,
    ...e,
    showInDist: e.showInDist ?? false,
    fator_peso: e.fator_peso ?? 1,
    dep: (e.dep || []).map(d =>
      typeof d === 'string' ? { id: d, tipo: 'TI', lag: 0 } : d
    ),
  }));
  // Atribui displayId permanente às tarefas que ainda não possuem
  const maxDid = arr.reduce((m, e) => Math.max(m, e.displayId || 0), 0);
  let nextDid = maxDid + 1;
  return arr.map(e => e.displayId ? e : { ...e, displayId: nextDid++ });
}

const fmtBRL   = (n) => formatBRLUtil(n);
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
    restricaoTipo: 'asap', restricaoData: '', fator_peso: 1,
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
    restricaoTipo: 'asap', restricaoData: '', fator_peso: 1,
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
    restricaoTipo: 'asap', restricaoData: '', fator_peso: 1,
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

// Agenda tarefas automaticamente com base nas dependências (tipo MS Project)
// Só empurra para frente; respeita restrições fixas (mso, mfo, snet, snlt, fnet, fnlt)
function autoScheduleFromDeps(etapas) {
  const map = {};
  etapas.forEach(e => { map[e.id] = e; });

  // Grau de entrada e lista de sucessoras para ordenação topológica
  const inDeg = {};
  const succsOf = {};
  etapas.forEach(e => {
    inDeg[e.id] = inDeg[e.id] || 0;
    (e.dep || []).forEach(d => {
      const pid = typeof d === 'string' ? d : d.id;
      if (!map[pid]) return;
      inDeg[e.id]++;
      succsOf[pid] = succsOf[pid] || [];
      if (!succsOf[pid].includes(e.id)) succsOf[pid].push(e.id);
    });
  });

  // Kahn's algorithm — garante que predecessores são processados antes das sucessoras
  const queue = etapas.filter(e => !inDeg[e.id]).map(e => e.id);
  const order = [];
  const seen  = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id); order.push(id);
    (succsOf[id] || []).forEach(sid => {
      inDeg[sid]--;
      if (inDeg[sid] <= 0 && !seen.has(sid)) queue.push(sid);
    });
  }
  etapas.forEach(e => { if (!seen.has(e.id)) order.push(e.id); }); // ciclos → sem mover

  // Propaga datas — só move para frente
  const upd = {};
  etapas.forEach(e => { upd[e.id] = { ...e }; });

  order.forEach(id => {
    const e = upd[id];
    if (!e || e.isGroup) return;

    const tipo   = e.restricaoTipo;
    const isAsap = !tipo || tipo === 'asap';
    const deps   = e.dep || [];

    // Sem dependências e sem restrição com data: nada a mover
    if (!deps.length && (isAsap || !e.restricaoData)) return;

    let minStart = 0;

    deps.forEach(d => {
      const pid  = typeof d === 'string' ? d : d.id;
      const dt   = typeof d === 'string' ? 'TI' : (d.tipo || 'TI');
      const lag  = typeof d === 'string' ? 0    : (d.lag  || 0);
      const pred = upd[pid];
      if (!pred) return;
      let req;
      if      (dt === 'TI') req = pred.inicio + pred.dur + lag;
      else if (dt === 'TT') req = pred.inicio + pred.dur + lag - e.dur;
      else if (dt === 'II') req = pred.inicio + lag;
      else if (dt === 'IT') req = pred.inicio + lag - e.dur;
      else                  req = pred.inicio + pred.dur + lag;
      if (req > minStart) minStart = req;
    });

    // Aplica restrições hard — forçam data mínima ou exata de início/fim
    // snlt e fnlt são soft (só avisam via verificarRestricoes, não forçam movimento)
    if (tipo && e.restricaoData) {
      const cd = dateToOffset(e.restricaoData);
      if (tipo === 'snet') minStart = Math.max(minStart, cd);
      if (tipo === 'mso')  minStart = cd;
      if (tipo === 'mfo')  minStart = cd - e.dur;
      if (tipo === 'fnet') minStart = Math.max(minStart, cd - e.dur);
    }

    const novoInicio = Math.max(0, minStart);
    if (novoInicio !== e.inicio) {
      upd[id] = { ...e, inicio: novoInicio };
    }
  });

  return etapas.map(e => upd[e.id] || e);
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

const formatBRL2 = v =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);

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

// Distribui o custo realizado (avanco × custo) de cada tarefa pelos meses passados até hoje
function computeRealizedDist(etapas) {
  const todayDate = new Date();
  const result = {};
  etapas.forEach(e => {
    if (e.isGroup) return;
    const custo = e.custo || 0;
    const avanco = e.avanco || 0;
    if (custo === 0 || avanco === 0) return;
    const realized = (avanco / 100) * custo;
    const s = offsetToDate(e.inicio);
    const taskEnd = offsetToDate(e.inicio + Math.max(e.dur, 1));
    const f = new Date(Math.min(taskEnd.getTime(), todayDate.getTime()));
    if (f <= s) return;
    const totalDays = Math.max(1, (f - s) / 86400000);
    let cur = new Date(s.getFullYear(), s.getMonth(), 1);
    while (cur <= f) {
      const mStart = new Date(Math.max(cur.getTime(), s.getTime()));
      const mEnd   = new Date(Math.min(new Date(cur.getFullYear(), cur.getMonth() + 1, 1).getTime(), f.getTime()));
      const days   = Math.max(0, (mEnd - mStart) / 86400000);
      if (days > 0) {
        const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`;
        result[key] = (result[key] || 0) + (realized * days) / totalDays;
      }
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
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

// Computa valores consolidados para linhas de grupo processando de baixo para cima,
// garantindo que sub-grupos já tenham valores corretos antes de computar o pai.
function computeGroupValues(etapas) {
  const result = {};

  // Determina a profundidade de cada tarefa para ordenar do mais profundo para o mais raso
  const depthOf = {};
  const getDepth = (id, visited = new Set()) => {
    if (depthOf[id] !== undefined) return depthOf[id];
    if (visited.has(id)) return 0;
    visited.add(id);
    const e = etapas.find(x => x.id === id);
    depthOf[id] = e && e.parentId ? 1 + getDepth(e.parentId, visited) : 0;
    return depthOf[id];
  };
  etapas.forEach(e => getDepth(e.id));

  // Processa grupos do mais profundo para o mais raso
  const groups = etapas.filter(e => e.isGroup)
    .slice()
    .sort((a, b) => (depthOf[b.id] || 0) - (depthOf[a.id] || 0));

  groups.forEach(g => {
    const children = etapas.filter(e => e.parentId === g.id);
    if (!children.length) return;

    // Para filhos que são grupos, usa os valores já calculados nesta passagem
    const childVals = children.map(c => result[c.id] || { inicio: c.inicio, dur: c.dur, avanco: c.avanco, custo: c.custo || 0 });

    const totalCusto = childVals.reduce((s, c) => s + (c.custo || 0), 0);
    const avanco = totalCusto > 0
      ? childVals.reduce((s, c) => s + (c.avanco || 0) * (c.custo || 0), 0) / totalCusto
      : childVals.reduce((s, c) => s + (c.avanco || 0), 0) / childVals.length;
    const inicio = Math.min(...childVals.map(c => c.inicio));
    const fim    = Math.max(...childVals.map(c => c.inicio + c.dur));
    result[g.id] = {
      avanco:  Math.round(avanco),
      inicio,
      dur:     Math.max(1, fim - inicio),
      custo:   totalCusto,
    };
  });
  return result;
}

// Move um bloco de tarefas (tarefa + todos os descendentes) para nova posição no array.
// O parentId das tarefas movidas não é alterado — apenas a ordem no array muda.
function moveTaskBlock(etapas, draggedId, targetId, insertAfter) {
  const descIds = new Set();
  const collect = (id) => {
    descIds.add(id);
    etapas.filter(e => e.parentId === id).forEach(c => collect(c.id));
  };
  collect(draggedId);
  const block  = etapas.filter(e => descIds.has(e.id));
  const rest   = etapas.filter(e => !descIds.has(e.id));
  const tgtIdx = rest.findIndex(e => e.id === targetId);
  if (tgtIdx < 0) return etapas;
  rest.splice(insertAfter ? tgtIdx + 1 : tgtIdx, 0, ...block);
  return rest;
}

// ─── GanttInterativo ─────────────────────────────────────────────────────────
const GanttInterativo = ({ etapas, onCommit, undo, redo, baselineEtapas, obraId }) => {
  const toast = useToast();
  const [selected,    setSel]      = React.useState(new Set());
  const [editMode,    setEdit]     = React.useState(() => { try { const c = JSON.parse(localStorage.getItem(`gantt_cfg_${obraId}`) || '{}'); return c.editMode   ?? true; } catch { return true; } });
  const [lockDone,    setLock]     = React.useState(() => { try { const c = JSON.parse(localStorage.getItem(`gantt_cfg_${obraId}`) || '{}'); return c.lockDone   ?? true; } catch { return true; } });
  const [replanAuto,  setReplan]   = React.useState(() => { try { const c = JSON.parse(localStorage.getItem(`gantt_cfg_${obraId}`) || '{}'); return c.replanAuto ?? true; } catch { return true; } });
  const [labelWidth,  setLabelW]   = React.useState(() => { try { const s = localStorage.getItem(`gantt_lw_${obraId}`); return s ? Math.max(150, Math.min(500, parseInt(s, 10))) : 220; } catch { return 220; } });

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
    const alvoPx = labelWidth + alvo * GM_DAY_W;
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

  const barColor = (e, isConf) =>
    isConf                    ? '#d97706'
    : e.status === 'done'     ? '#1b8f5e'
    : e.status === 'late'     ? '#c0281f'
    : e.status === 'upcoming' ? '#3d7fc9'
    : 'var(--brand)';

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
          e.isGroup ? '' : (e.status === 'done' ? 'Concluída' : e.status === 'late' ? 'Atrasada' : 'Futura'),
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
        if (e.status === 'done') return [27, 143, 94];
        if (e.status === 'late') return [192, 40, 31];
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
            e.isGroup ? '' : (e.status === 'done' ? 'Concluída' : e.status === 'late' ? 'Atrasada' : 'Futura'),
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
  const tlW = dynTotal * GM_MONTH_W;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div ref={ganttRef} style={{ position: 'relative' }}>

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

        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px', height: 30, gap: 5 }}
          onClick={exportExcelGantt} title="Exportar para Excel (.xlsx)">
          <Icon name="download" size={13} /> Excel
        </button>
        <select
          value={pdfFormat}
          onChange={e => setPdfFormat(e.target.value)}
          style={{ fontSize: 12, height: 30, padding: '0 6px', borderRadius: 6,
                   border: '1px solid var(--border)', background: 'var(--surface)',
                   color: 'var(--text)', cursor: 'pointer' }}
          title="Formato do PDF">
          <option value="a3">A3</option>
          <option value="a2">A2</option>
          <option value="a1">A1</option>
          <option value="a0">A0</option>
        </select>
        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px', height: 30, gap: 5 }}
          onClick={exportPDFGantt} disabled={exportingPDF} title="Exportar para PDF">
          <Icon name="download" size={13} /> {exportingPDF ? 'Gerando…' : 'PDF'}
        </button>
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
          gridTemplateColumns: `${labelWidth}px ${tlW}px`,
          minWidth: labelWidth + tlW,
          position: 'relative',
        }}>

          {/* ── Cabeçalho rótulo ──────────────────────────────────────────── */}
          <div style={{
            height: GM_HEADER_H, borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)',
            display: 'flex', alignItems: 'flex-end', padding: '0 18px 12px',
            fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em',
            color: 'var(--text-soft)', background: 'var(--surface)',
            position: 'sticky', left: 0, zIndex: 5, overflow: 'visible',
          }}>
            ETAPA
            <div
              onMouseDown={onDividerDown}
              style={{
                position: 'absolute', right: 0, top: 0, bottom: 0,
                width: 5, cursor: 'col-resize', zIndex: 10,
                background: 'transparent',
              }}
            />
          </div>

          {/* ── Cabeçalho linha do tempo ──────────────────────────────────── */}
          <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
            {/* Trimestres */}
            <div style={{ display: 'flex', height: 28, borderBottom: '1px solid var(--border)' }}>
              {dynQuarters.map((q, qi) => (
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
              {dynMonths.map((m, mi) => (
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
          {visible.map((e, i) => {
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
                  {e.isGroup
                    ? <button
                        onClick={ev => { ev.stopPropagation(); handleToggleCollapse(e.id); }}
                        style={{ width: 18, height: 18, flexShrink: 0, display: 'flex', alignItems: 'center',
                                 justifyContent: 'center', border: 'none', background: 'none',
                                 cursor: 'pointer', color: 'var(--text-soft)', fontSize: 10, padding: 0 }}
                      >{e.collapsed ? '▶' : '▼'}</button>
                    : <span style={{ width: 18, flexShrink: 0 }} />
                  }
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
                  {dynMonths.map((m, mi) => (
                    <div key={mi} style={{
                      position: 'absolute', left: mi * GM_MONTH_W, top: 0, bottom: 0, width: 1,
                      background: 'var(--border)', opacity: m.isQ ? 0.8 : 0.35,
                    }} />
                  ))}

                  {/* Sombreamento do passado */}
                  <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: Math.min(today, dynTotal * 30) * GM_DAY_W,
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
            left: labelWidth + Math.min(today, dynTotal * 30) * GM_DAY_W,
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
            position: 'absolute', top: GM_HEADER_H, left: labelWidth,
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
    const raw     = value !== undefined && value !== null && value !== '' ? value : null;
    const display = type === 'date' && raw ? isoToBR(raw) : raw;
    return <span style={style}>{display ?? <span style={{ color: 'var(--text-faint)' }}>—</span>}</span>;
  }

  if (!editing) {
    const raw     = value !== undefined && value !== null && value !== '' ? value : null;
    const display = type === 'date' && raw ? isoToBR(raw) : raw;
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
  peso:           { label: 'Peso %',          defWidth: 68,  align: 'right' },
  fatorPeso:      { label: 'Fator Peso',      defWidth: 90,  align: 'right' },
  valorVinculado: { label: 'Valor Vinculado', defWidth: 130, align: 'right' },
  custoReal: { label: 'Custo Real',    defWidth: 130, align: 'right' },
  saldo:     { label: 'Saldo',         defWidth: 110, align: 'right' },
  resp:      { label: 'Responsável',   defWidth: 130 },
  dep:       { label: 'Predecessoras', defWidth: 130 },
  succ:      { label: 'Sucessoras',    defWidth: 110 },
  status:    { label: 'Status',        defWidth: 105 },
  restricao: { label: 'Restrição',     defWidth: 200 },
  participa:  { label: 'Curva',         defWidth: 54, align: 'center' },
};
const LISTA_DEFAULT_ORDER = Object.keys(LISTA_COL_DEFS);
const LISTA_FROZEN = ['wbs', 'id', 'etapa'];

// ─── ListaInterativa ──────────────────────────────────────────────────────────
const ListaInterativa = ({ etapas, onCommit, customCols, onCustomColsChange, obraId, undo, redo, vinculos = [], orcamentoItensMap = {} }) => {
  const toast = useToast();
  const [selectedId,     setSelectedId]     = React.useState(null);
  const [showAddCol,     setShowAddCol]     = React.useState(false);
  const [deleteConfirm,  setDeleteConfirm]  = React.useState(null); // id da tarefa a excluir
  const [showPavimentos, setShowPavimentos] = React.useState(false);
  const [multiSel,       setMultiSel]       = React.useState([]);   // seleção ordenada para Ctrl+F2
  const [editingCusto,   setEditingCusto]   = React.useState(null); // 'id_custo' | 'id_real'
  const [editingFatorPeso, setEditingFatorPeso] = React.useState(null); // id da tarefa em edição
  const [busca,          setBusca]          = React.useState('');
  const [filtroStatus,   setFiltroStatus]   = React.useState('');
  const [filtroResp,     setFiltroResp]     = React.useState('');
  const [ctxMenu,        setCtxMenu]        = React.useState(null); // { x, y, taskId }
  const [dragOverId,     setDragOverId]     = React.useState(null);
  const [showColPanel,   setShowColPanel]   = React.useState(false);
  const dragRowRef   = React.useRef(null);
  const colPanelRef  = React.useRef(null);

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
    onCommit(novas);
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
      if (field === 'fator_peso') {
        const v = parseFloat(rawValue);
        return { ...e, fator_peso: isNaN(v) ? 1 : Math.max(0, v) };
      }
      if (field.startsWith('cc_')) {
        return { ...e, customCols: { ...(e.customCols || {}), [field]: rawValue } };
      }
      return { ...e, [field]: rawValue };
    });

    const reescalonar = ['dep', 'inicio', 'fim', 'duracaoDias', 'restricaoTipo', 'restricaoData'];
    onCommit(reescalonar.includes(field) ? autoScheduleFromDeps(novas) : novas, { silent: true });
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
        const cst     = gv ? (gv.custo || 0) : (e.custo || 0);
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
        if (cid === 'status')   return e.isGroup ? '' : (e.status === 'done' ? 'Concluída' : e.status === 'late' ? 'Atrasada' : 'Futura');
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
          if (cid === 'custo')    return totalCusto;
          if (cid === 'custoReal') return totalReal;
          if (cid === 'saldo')    return totalSaldo;
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
        const cst     = gv ? (gv.custo || 0) : (e.custo || 0);
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
        if (cid === 'status')    return e.isGroup ? '' : (e.status === 'done' ? 'Concluída' : e.status === 'late' ? 'Atrasada' : 'Futura');
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
        if (cid === 'custo')     return fmtBRL(totalCusto);
        if (cid === 'custoReal') return fmtBRL(totalReal);
        if (cid === 'saldo')     return fmtBRL(totalSaldo);
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
    <div ref={listaRef} className="card" style={{ marginTop: 'var(--gap)' }}>

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 8, padding: '10px 16px', alignItems: 'center',
        flexWrap: 'wrap', background: 'var(--surface-muted)',
        borderBottom: '1px solid var(--border)',
      }}>
        <button className="btn btn-ghost" style={btnStyle} onClick={handleAddTask}>
          <Icon name="plus" size={13} /> Adicionar tarefa
        </button>

        <button className="btn btn-ghost"
          style={{ ...btnStyle, opacity: selectedId ? 1 : 0.45 }}
          onClick={() => selectedId && insertTask(selectedId, 'above')}
          disabled={!selectedId}
          title="Inserir linha acima da selecionada (botão direito na linha também funciona)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><polyline points="5 12 12 5 19 12"/>
          </svg>
          Ins. acima
        </button>

        <button className="btn btn-ghost"
          style={{ ...btnStyle, opacity: selectedId ? 1 : 0.45 }}
          onClick={() => selectedId && insertTask(selectedId, 'below')}
          disabled={!selectedId}
          title="Inserir linha abaixo da selecionada (atalho: Insert)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
          </svg>
          Ins. abaixo
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

      {/* ── Tabela ───────────────────────────────────────────────────────── */}
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl tbl-lista" style={{ minWidth: 1780 }}>
          <thead>
            <tr>
              {colOrder.filter(c => !hiddenCols.has(c)).map(colId => renderTh(colId))}
              {customCols.filter(col => !hiddenCols.has(col.id)).map(col => (
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
                    {e.isGroup ? '—' : (() => {
                      if (hasVinculos && totalValorVinculado > 0)
                        return ((valorVinculadoMap[e.id] || 0) / totalValorVinculado * 100).toFixed(1) + '%';
                      return totalCusto > 0 ? ((e.custo || 0) / totalCusto * 100).toFixed(1) + '%' : '—';
                    })()}
                  </td>
                ),
                fatorPeso: (
                  <td key="fatorPeso" className="num" style={{ textAlign: 'right', fontSize: 12 }} onClick={ev => ev.stopPropagation()}>
                    {e.isGroup ? (
                      <span className="text-faint">—</span>
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
                  className={[
                    isSelected ? 'lista-row-selected' : e.isGroup ? 'lista-row-group' : '',
                    dragOverId === e.id ? 'drag-over-row' : '',
                  ].filter(Boolean).join(' ')}
                  draggable
                  onDragStart={(ev) => {
                    dragRowRef.current = e.id;
                    ev.dataTransfer.effectAllowed = 'move';
                    ev.stopPropagation();
                  }}
                  onDragOver={(ev) => { ev.preventDefault(); ev.stopPropagation(); setDragOverId(e.id); }}
                  onDragLeave={() => setDragOverId(prev => prev === e.id ? null : prev)}
                  onDrop={(ev) => {
                    ev.preventDefault(); ev.stopPropagation();
                    const dragged = dragRowRef.current;
                    if (dragged && dragged !== e.id) {
                      onCommit(moveTaskBlock(etapas, dragged, e.id, true));
                    }
                    dragRowRef.current = null;
                    setDragOverId(null);
                  }}
                  onDragEnd={() => { dragRowRef.current = null; setDragOverId(null); }}
                  onContextMenu={(ev) => { ev.preventDefault(); setCtxMenu({ x: ev.clientX, y: ev.clientY, taskId: e.id }); }}
                  onClick={(ev) => {
                    if (ev.ctrlKey || ev.metaKey) {
                      ev.preventDefault();
                      setMultiSel(ms => ms.includes(e.id) ? ms.filter(id => id !== e.id) : [...ms, e.id]);
                    } else {
                      setSelectedId(id => id === e.id ? null : e.id);
                      setMultiSel([]);
                    }
                  }}
                  style={{ cursor: 'grab', fontWeight: e.isGroup ? 600 : undefined }}
                >
                  {colOrder.filter(c => !hiddenCols.has(c)).map(colId => cells[colId] || null)}

                  {/* Colunas personalizadas */}
                  {customCols.filter(col => !hiddenCols.has(col.id)).map(col => {
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

      {/* Menu de contexto — botão direito na linha */}
      {ctxMenu && (
        <div className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
          <button onClick={() => { insertTask(ctxMenu.taskId, 'above'); setCtxMenu(null); }}>
            ↑ Inserir linha acima
          </button>
          <button onClick={() => { insertTask(ctxMenu.taskId, 'below'); setCtxMenu(null); }}>
            ↓ Inserir linha abaixo
          </button>
          <hr />
          <button className="danger" onClick={() => { setDeleteConfirm(ctxMenu.taskId); setCtxMenu(null); }}>
            Excluir tarefa
          </button>
        </div>
      )}
    </div>
  );
};

// ─── UsoTarefaView ───────────────────────────────────────────────────────────
const USO_COL_KEYS    = ['id', 'wbs', 'nome', 'inicio', 'fim', 'dur', 'avanco', 'custo'];
const USO_COL_LABELS  = ['ID', 'EAP', 'Nome da Tarefa', 'Início', 'Término', 'Dur.', '%', 'R$'];
const USO_COL_DEFAULT = { id: 44, wbs: 52, nome: 200, inicio: 88, fim: 88, dur: 54, avanco: 44, custo: 94 };
const USO_COL_ALIGN   = { id: 'right', wbs: 'left', nome: 'left', inicio: 'left', fim: 'left', dur: 'right', avanco: 'right', custo: 'right' };

const UsoTarefaView = ({ etapas, months, monthlyDist, obraId }) => {
  const [selectedId, setSelectedId] = React.useState(null);
  const [detalhe,    setDetalhe]    = React.useState('custo');
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
            isoToBR(offsetToISO(e.inicio + e.dur)),
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
        <span style={{ fontSize: 13, color: 'var(--text-soft)' }}>Detalhe:</span>
        <select className="input" value={detalhe} onChange={e => setDetalhe(e.target.value)}
          style={{ fontSize: 13, padding: '4px 10px', minWidth: 130 }}>
          <option value="custo">Custo (R$)</option>
        </select>
        <span style={{ fontSize: 12, color: 'var(--text-faint)', marginLeft: 8 }}>
          Clique em uma tarefa para destacar na grade
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
                const fimText  = isoToBR(offsetToISO(e.inicio + e.dur));
                const durText  = `${e.dur}d`;
                const avText   = `${e.avanco}%`;
                const cusText  = e.isGroup ? '—' : formatBRL2(e.custo || 0);
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
                    <td style={{ ...tdSt, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} title={cusText}>
                      {cusText}
                    </td>
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
              <col style={{ width: 80 }} />
              {months.map(m => <col key={m.key} style={{ width: 110 }} />)}
              <col style={{ width: 110 }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ ...thSt, textAlign: 'left' }}>Detalhe</th>
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
                      const txt = v > 0 ? formatBRL2(v) : '—';
                      return (
                        <td key={m.key} style={{ ...tdSt, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: v > 0 ? 'var(--text)' : 'var(--text-faint)' }} title={v > 0 ? txt : undefined}>
                          {txt}
                        </td>
                      );
                    })}
                    <td style={{ ...tdSt, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }} title={total > 0 ? formatBRL2(total) : undefined}>
                      {total > 0 ? formatBRL2(total) : '—'}
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

// ─── CurvaFisicaView — Curva S + Histograma ──────────────────────────────────
const CurvaFisicaView = ({ etapas, months, monthlyDist, realizedTotals, baselines, blVisivelId, onCommit }) => {
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
      const vRep = filteredPlanned[m.key] || 0;
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
      const totalCusto = folhas.reduce((s, e) => s + (e.custo || 0), 0);
      const avancoGeral = totalCusto > 0
        ? folhas.reduce((s, e) => s + (e.avanco || 0) * (e.custo || 0), 0) / totalCusto : 0;

      const cabDist = ['Atividade', 'Valor (R$)', 'Peso %', 'Conc. %', ...cabMeses, 'Total'];
      const dist = [cabDist];
      distRows.forEach(e => {
        const gv = e.isGroup ? (groupValsExp[e.id] || {}) : {};
        const taskCusto  = e.isGroup ? (gv.custo || 0) : (e.custo || 0);
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
          <svg viewBox={`0 0 ${svgW} ${svgH}`} width="100%" height={svgH}
            style={{ display: 'block', minWidth: Math.max(600, N * 36) }}>

            {/* Linhas de grade Y */}
            {[0, 20, 40, 60, 80, 100].map(pct => (
              <g key={pct}>
                <line x1={pL} y1={yS(pct)} x2={pL + chartW} y2={yS(pct)}
                  stroke="var(--border)" strokeWidth="1" strokeDasharray={pct === 0 || pct === 100 ? undefined : '3,4'} />
                <text x={pL - 6} y={yS(pct) + 4} textAnchor="end" fontSize="10"
                  fill="var(--text-muted)" fontFamily="var(--font-mono)">{pct}%</text>
              </g>
            ))}

            {/* Barras histograma mensal */}
            {months.map((m, i) => {
              const v = filteredPlanned[m.key] || 0;
              const pct = total > 0 ? v / total * 100 : 0;
              const bh = (pct / 100) * chartH;
              return (
                <rect key={m.key}
                  x={xC(i) - barW / 2} y={yS(0) - bh}
                  width={barW} height={bh}
                  fill="#e2e8f0" rx="2" />
              );
            })}

            {/* Marcador HOJE */}
            {todayIdx >= 0 && (
              <line x1={xC(todayIdx)} y1={pT} x2={xC(todayIdx)} y2={pT + chartH}
                stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4,3" opacity="0.7" />
            )}

            {/* Área sob curva planejada */}
            <path d={areaPath} fill="var(--brand)" opacity="0.07" />

            {/* Linha planejada acumulada */}
            <polyline points={ptsPlan} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinejoin="round" />

            {/* Pontos planejados */}
            {seriesPlanned.map((v, i) => (
              <circle key={i} cx={xC(i)} cy={yS(v)} r="3" fill="var(--brand)" />
            ))}

            {/* Linha realizada acumulada */}
            {realPts && (
              <polyline points={realPts} fill="none" stroke="#16a34a" strokeWidth="2"
                strokeDasharray="5,3" strokeLinejoin="round" />
            )}

            {/* Rótulos X */}
            {months.map((m, i) => {
              if (N > 18 && i % 2 !== 0) return null;
              if (N > 30 && i % 3 !== 0) return null;
              return (
                <text key={m.key} x={xC(i)} y={pT + chartH + 18}
                  textAnchor="middle" fontSize="9.5" fill="var(--text-muted)"
                  fontFamily="var(--font-sans)">{m.label}</text>
              );
            })}

            {/* Eixo X base */}
            <line x1={pL} y1={pT + chartH} x2={pL + chartW} y2={pT + chartH}
              stroke="var(--border)" strokeWidth="1" />
          </svg>
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
              const vRep = filteredPlanned[m.key] || 0;
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
            const grpHdrGray = { ...grpHdrBlue, background: '#4b5563' };

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
                    <td colSpan={totalCols} style={grpHdrBlue}>
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
                      Reprogramação Mês Anterior
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
                    <td colSpan={totalCols} style={{ ...grpHdrBlue, borderTop: '2px solid rgba(255,255,255,0.2)' }}>
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
        const totalCustoFolha = folhas.reduce((s, e) => s + (e.custo || 0), 0);
        const avancoGeral = totalCustoFolha > 0
          ? folhas.reduce((s, e) => s + (e.avanco || 0) * (e.custo || 0), 0) / totalCustoFolha
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
                    const taskCusto  = e.isGroup ? (gv?.custo || 0) : (e.custo || 0);
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
                          return (
                            <td key={m.key} style={{
                              ...tdBase, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                              color: pct > 0.005 ? (e.isGroup ? 'var(--brand)' : 'var(--text)') : 'var(--text-faint)',
                              fontWeight: e.isGroup ? 600 : 400,
                              background: m.key === todayKey ? 'rgba(1,67,134,0.04)' : undefined,
                              fontSize: 10.5,
                            }}>
                              {fmt(pct)}
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

// ─── Modal: Salvar Linha de Base ─────────────────────────────────────────────
const CriarLinhaModal = ({ baselines, totalEtapas, onClose, onCreate, onUpdate }) => {
  const temExistentes = baselines.length > 0;
  const [modo,     setModo]     = React.useState('nova');  // 'nova' | 'sobrescrever'
  const [nome,     setNome]     = React.useState(`Linha de Base ${baselines.length + 1}`);
  const [targetId, setTargetId] = React.useState(temExistentes ? baselines[0].id : '');

  const targetBL = baselines.find(b => b.id === targetId);
  const labelBtn = modo === 'nova' ? 'Criar' : 'Sobrescrever';
  const disabled = modo === 'nova' ? !nome.trim() : !targetId;

  const handleConfirm = () => {
    if (modo === 'nova' && nome.trim()) { onCreate(nome.trim()); onClose(); }
    else if (modo === 'sobrescrever' && targetId) { onUpdate(targetId, targetBL?.nome || nome.trim()); onClose(); }
  };

  const radioSt = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
    cursor: 'pointer', padding: '8px 12px', borderRadius: 6,
    border: '1px solid var(--border)', marginBottom: 6 };

  return (
    <Modal title="Salvar Linha de Base" onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={disabled} onClick={handleConfirm}>
            <Icon name="check" size={14} />{labelBtn}
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        {/* Modo: nova ou sobrescrever */}
        {temExistentes && (
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-soft)', display: 'block', marginBottom: 8 }}>
              Ação
            </label>
            <label style={{ ...radioSt, background: modo === 'nova' ? 'var(--brand-tint, #eef4fb)' : undefined }}>
              <input type="radio" name="bl-modo" value="nova" checked={modo === 'nova'}
                onChange={() => setModo('nova')} style={{ accentColor: 'var(--brand)' }} />
              Criar nova linha de base
            </label>
            <label style={{ ...radioSt, background: modo === 'sobrescrever' ? 'var(--brand-tint, #eef4fb)' : undefined }}>
              <input type="radio" name="bl-modo" value="sobrescrever" checked={modo === 'sobrescrever'}
                onChange={() => setModo('sobrescrever')} style={{ accentColor: 'var(--brand)' }} />
              Sobrescrever linha existente
            </label>
          </div>
        )}

        {/* Nova: campo de nome */}
        {modo === 'nova' && (
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-soft)', display: 'block', marginBottom: 6 }}>
              Nome
            </label>
            <input className="input" value={nome} autoFocus
              onChange={e => setNome(e.target.value)}
              placeholder="Ex: Planejamento Inicial"
              style={{ width: '100%' }}
            />
          </div>
        )}

        {/* Sobrescrever: select */}
        {modo === 'sobrescrever' && (
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-soft)', display: 'block', marginBottom: 6 }}>
              Linha de base a sobrescrever
            </label>
            <select className="input" value={targetId} onChange={e => setTargetId(e.target.value)}
              style={{ width: '100%' }}>
              {baselines.map(b => (
                <option key={b.id} value={b.id}>{b.nome} — {b.criadaEm}</option>
              ))}
            </select>
            <p style={{ fontSize: 12, color: '#b45309', margin: '8px 0 0' }}>
              O conteúdo atual substituirá os dados salvos. Esta ação não pode ser desfeita.
            </p>
          </div>
        )}

        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>
          O estado atual do cronograma ({totalEtapas} etapas) será salvo na linha de base selecionada.
        </p>
      </div>
    </Modal>
  );
};

// ─── Modal: Gerenciar Linhas de Base ─────────────────────────────────────────
const GerenciarLinhasModal = ({ baselines, blVisivelId, onSelect, onDuplicar, onExcluir, onClose }) => {
  const [confirmId, setConfirmId] = React.useState(null); // id aguardando 2ª confirmação

  return (
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
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button className="btn btn-sm btn-ghost" onClick={() => { onDuplicar(b.id); setConfirmId(null); }}>Duplicar</button>

                      {confirmId === b.id ? (
                        /* — 2ª confirmação — */
                        <>
                          <span style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            Excluir definitivamente?
                          </span>
                          <button className="btn btn-sm"
                            style={{ background: 'var(--danger)', color: 'white', fontWeight: 700 }}
                            onClick={() => { onExcluir(b.id); setConfirmId(null); }}>
                            Sim, excluir
                          </button>
                          <button className="btn btn-sm btn-ghost" onClick={() => setConfirmId(null)}>
                            Cancelar
                          </button>
                        </>
                      ) : (
                        /* — 1ª confirmação — */
                        <button className="btn btn-sm" style={{ color: 'var(--danger)' }}
                          onClick={() => setConfirmId(b.id)}>
                          Excluir
                        </button>
                      )}
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
};

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
    vinculoService.listarPorObra(obraSel).then(({ data }) => {
      if (!data?.length) { setVinculos([]); setOrcamentoItensMap({}); return; }
      setVinculos(data);
      const m = {};
      data.forEach(v => {
        if (v.orcamento_itens) m[v.orcamento_item_id] = v.orcamento_itens.valor_total || 0;
      });
      setOrcamentoItensMap(m);
    });
  }, [obraSel]);

  // Recarrega etapas, histórico e baselines ao trocar de obra (Supabase first, fallback para mock)
  React.useEffect(() => {
    let cancelled = false;
    async function carregar() {
      if (!obraSel) { setLoadedObraId(null); return; }
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
      } else {
        const mock = sanitizarERecuperar(migrateEtapas(D.cronograma[obraSel] || []));
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

  const atualizarLinha = (id, nome) => {
    const novas = baselines.map(b =>
      b.id === id
        ? { ...b, nome, criadaEm: new Date().toISOString().slice(0, 10), etapas: etapas.map(e => ({ ...e })) }
        : b
    );
    setBaselines(novas);
    salvarBaselines(obraSel, novas);
    salvarCronograma(obraSel, etapas, customCols, novas);
    toast(`Linha de base "${nome}" atualizada`, { tone: 'success', icon: 'check' });
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

  // Pesos vinculados ao orçamento — quando existem, substituem custo na Curva S
  const valorVinculadoMapFull = React.useMemo(
    () => computeValorVinculadoMap(etapas, vinculos, orcamentoItensMap),
    [etapas, vinculos, orcamentoItensMap]
  );
  const weightOverride = vinculos.length > 0 ? valorVinculadoMapFull : null;

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
  const realizedTotals = React.useMemo(() => computeRealizedDist(etapas), [etapas]);

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
                            restricaoTipo: 'asap', restricaoData: '', fator_peso: 1 }]);
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

              {view === 'curva' && (
                <CurvaFisicaView
                  etapas={etapas}
                  months={months}
                  monthlyDist={monthlyDist}
                  realizedTotals={realizedTotals}
                  baselines={baselines}
                  blVisivelId={blVisivelId}
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
                />
              )}

              {view === 'uso' && (
                <UsoTarefaView etapas={etapas} months={months} monthlyDist={monthlyDist} obraId={obraSel} />
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
    </>
  );
};

export { CronogramaFull, GanttInterativo };
export { GanttInterativo as GanttElegante };
