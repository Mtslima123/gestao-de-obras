// Funções puras do Gantt — sem state, sem JSX, sem efeitos colaterais
// Extraídas de Cronograma.jsx para facilitar testes e leitura

// ─── Constantes de referência temporal ──────────────────────────────────────
export const GM_START_YEAR  = 2024;
export const GM_START_MONTH = 2; // março (0-indexed)

const GM_REF = new Date(GM_START_YEAR, GM_START_MONTH, 1);

// ─── Utilitários de data ─────────────────────────────────────────────────────

export function offsetToDate(days) {
  const d = new Date(GM_REF);
  d.setDate(d.getDate() + Math.round(days));
  return d;
}

export function offsetToISO(days) {
  const d   = offsetToDate(days);
  const y   = d.getFullYear();
  const mo  = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

export function isoToBR(iso) {
  if (!iso || iso.length < 10) return iso || '';
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export function dateToOffset(iso) {
  if (!iso) return 0;
  const parts = iso.split('-');
  if (parts.length < 3) return 0;
  const dt = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  return Math.max(0, Math.round((dt - GM_REF) / 86400000));
}

const MES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MS_DIA = 86400000;

// ─── Grade de calendário real (usada pelo header/zoom do Gantt) ─────────────
// Ao contrário de offsetToDate (dia exato), estas funções constroem a grade de
// meses/trimestres/semanas/dias com durações reais de calendário (28-31 dias),
// para o cabeçalho e a grade de fundo do Gantt refletirem datas de verdade.

export function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // segunda=0 ... domingo=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // quinta-feira da semana ISO
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const isoWeek = 1 + Math.round(
    ((d - firstThursday) / MS_DIA - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7
  );
  return { isoYear: d.getUTCFullYear(), isoWeek };
}

export function buildCalendarMonths(refDate, totalDays) {
  const out = [];
  let cursor = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
  let dayCount = 0;
  while (dayCount < totalDays) {
    const y = cursor.getFullYear(), mo = cursor.getMonth();
    const daysInMonth = new Date(y, mo + 1, 0).getDate();
    const days = Math.min(daysInMonth, totalDays - dayCount);
    out.push({ year: y, month: mo, short: MES_ABREV[mo], isQ: mo % 3 === 0, startOffset: dayCount, days });
    dayCount += days;
    cursor = new Date(y, mo + 1, 1);
  }
  return out;
}

export function buildCalendarQuarters(calMonths) {
  const out = [];
  calMonths.forEach(m => {
    const last = out[out.length - 1];
    const q = Math.floor(m.month / 3) + 1;
    if (last && last.year === m.year && last.q === q) { last.days += m.days; }
    else { out.push({ label: `T${q}/${m.year}`, year: m.year, q, startOffset: m.startOffset, days: m.days }); }
  });
  return out;
}

export function buildCalendarYears(calMonths) {
  const out = [];
  calMonths.forEach(m => {
    const last = out[out.length - 1];
    if (last && last.year === m.year) { last.days += m.days; }
    else { out.push({ year: m.year, startOffset: m.startOffset, days: m.days }); }
  });
  return out;
}

export function buildCalendarWeeks(refDate, totalDays) {
  const out = [];
  let dayCount = 0;
  while (dayCount < totalDays) {
    const date = new Date(refDate);
    date.setDate(date.getDate() + dayCount);
    const weekday = (date.getDay() + 6) % 7; // segunda=0 ... domingo=6
    const days = Math.min(7 - weekday, totalDays - dayCount);
    const { isoYear, isoWeek } = getISOWeek(date);
    out.push({ isoYear, isoWeek, startOffset: dayCount, days });
    dayCount += days;
  }
  return out;
}

export function buildCalendarDays(refDate, totalDays) {
  const out = [];
  for (let i = 0; i < totalDays; i++) {
    const date = new Date(refDate);
    date.setDate(date.getDate() + i);
    const weekday = date.getDay(); // domingo=0
    out.push({
      offset: i,
      day: date.getDate(),
      weekday,
      isWeekend: weekday === 0 || weekday === 6,
      isMonthStart: date.getDate() === 1,
    });
  }
  return out;
}

// ─── Detecção de conflitos ───────────────────────────────────────────────────

export const gmConflicts = (etapas, overrides) => {
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

// ─── Migração e normalização ─────────────────────────────────────────────────

export function migrateEtapas(raw) {
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
  const maxDid = arr.reduce((m, e) => Math.max(m, e.displayId || 0), 0);
  let nextDid = maxDid + 1;
  return arr.map(e => e.displayId ? e : { ...e, displayId: nextDid++ });
}

// ─── WBS e hierarquia ────────────────────────────────────────────────────────

export function computeAllWBS(etapas) {
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

export function recomputeHierarchy(arr) {
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

export function indentTasks(etapas, selectedIds) {
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
    if (above.id === e.parentId) return e;
    if (isDescendant(above.id, e.id)) return e;
    return { ...e, parentId: above.id };
  });

  return recomputeHierarchy(novas);
}

export function outdentTasks(etapas, selectedIds) {
  const selSet = new Set(selectedIds);
  const map = new Map(etapas.map(e => [e.id, e]));

  const novas = etapas.map(e => {
    if (!selSet.has(e.id)) return e;
    if (!e.parentId) return e;
    const pai = map.get(e.parentId);
    return { ...e, parentId: pai ? pai.parentId : null };
  });

  return recomputeHierarchy(novas);
}

export function computeSuccessors(etapas) {
  const r = {};
  etapas.forEach(e => { r[e.id] = []; });
  etapas.forEach(e => (e.dep || []).forEach(d => {
    const pid = typeof d === 'string' ? d : d.id;
    if (r[pid]) r[pid].push(e.id);
  }));
  return r;
}

export function getVisibleEtapas(etapas) {
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

// ─── Criação e manipulação de tarefas ────────────────────────────────────────

export function nextEtapaId(etapas) {
  const nums = etapas.map(e => parseInt(e.id.replace(/\D/g, '')) || 0);
  return 'TSK-' + String(Math.max(0, ...nums) + 1).padStart(3, '0');
}

export function nextDisplayId(etapas) {
  return etapas.reduce((m, e) => Math.max(m, e.displayId || 0), 0) + 1;
}

export function emptyCustomCols(customCols) {
  return Object.fromEntries((customCols || []).map(c => [c.id, '']));
}

export function createTask(afterId, etapas, customCols) {
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

export function createSubtask(parentId, etapas, customCols) {
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

export function createGroup(afterId, etapas, customCols) {
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

export function deleteTask(id, etapas) {
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

export function moveTaskBlock(etapas, draggedId, targetId, insertAfter) {
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

// ─── Agendamento e propagação ─────────────────────────────────────────────────

export function propagateDrag(etapas, endDeltaMap, startDeltaMap = {}) {
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
      const deps = getDepsOf(sid);
      const depOnId = deps.find(d => d.id === id);
      const tipo = depOnId?.tipo || 'TI';
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

export function autoScheduleFromDeps(etapas) {
  const map = {};
  etapas.forEach(e => { map[e.id] = e; });

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
  etapas.forEach(e => { if (!seen.has(e.id)) order.push(e.id); });

  const upd = {};
  etapas.forEach(e => { upd[e.id] = { ...e }; });

  order.forEach(id => {
    const e = upd[id];
    if (!e || e.isGroup) return;

    const tipo   = e.restricaoTipo;
    const isAsap = !tipo || tipo === 'asap';
    const deps   = e.dep || [];

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

export function updateParentBounds(etapas) {
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

// ─── Formatação de dependências ──────────────────────────────────────────────

export function formatDepList(dep, etapas) {
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

export function parseDep(raw, etapas) {
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

// ─── Distribuição mensal ─────────────────────────────────────────────────────

export function getMonthRange(etapas) {
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

// weightOverride: { [etapaId]: valor } — quando fornecido, substitui e.custo no cálculo.
// Usado quando vínculos com o orçamento estão ativos para refletir pesos corretos na Curva S.
export function computeMonthlyDist(etapas, weightOverride = null) {
  const result = {};
  etapas.forEach(e => {
    if (e.isGroup) return;
    const custo = weightOverride
      ? (weightOverride[e.id] ?? 0)
      : (e.custo || 0);
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

export function computeRealizedDist(etapas) {
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

export function getGroupMonthlyDist(groupId, etapas, monthlyDist) {
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

// ─── Restrições e valores de grupo ───────────────────────────────────────────

export function verificarRestricoes(etapas) {
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

export function computeGroupValues(etapas) {
  const result = {};

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

  const groups = etapas.filter(e => e.isGroup)
    .slice()
    .sort((a, b) => (depthOf[b.id] || 0) - (depthOf[a.id] || 0));

  groups.forEach(g => {
    const children = etapas.filter(e => e.parentId === g.id);
    if (!children.length) return;

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

// ─── Integração Orçamento × Cronograma ───────────────────────────────────────

/**
 * Calcula o valor vinculado de cada etapa a partir dos vínculos com o orçamento.
 *
 * Vínculos podem apontar para tarefas-resumo (grupos) ou folhas.
 * Quando apontam para um grupo, o valor total vinculado é distribuído recursivamente
 * entre os descendentes folha usando fator_peso.
 * O mapa retornado inclui tanto folhas (valor distribuído) quanto grupos (soma dos filhos),
 * permitindo exibição em qualquer nível da EAP.
 *
 * @param {Array}  etapas             - Lista completa de etapas do cronograma
 * @param {Array}  vinculos           - Vínculos [{etapa_id, orcamento_item_id}]
 * @param {Object} orcamentoItensMap  - { [orcamento_item_id]: valor_total }
 * @returns {Object} { [etapa_id]: valor }
 */
export function computeValorVinculadoMap(etapas, vinculos, orcamentoItensMap) {
  if (!vinculos?.length) return {};

  const etapaMap = new Map(etapas.map(e => [e.id, e]));

  // Soma os valores dos itens diretamente vinculados por etapa
  const directValues = {};
  vinculos.forEach(v => {
    const val = orcamentoItensMap[v.orcamento_item_id] || 0;
    directValues[v.etapa_id] = (directValues[v.etapa_id] || 0) + val;
  });

  const leafValues = {};

  // Distribui recursivamente o valor de um nó até suas folhas pelo fator_peso
  function distributeToLeaves(etapaId, value) {
    const children = etapas.filter(e => e.parentId === etapaId);
    if (children.length === 0) {
      leafValues[etapaId] = (leafValues[etapaId] || 0) + value;
      return;
    }
    const totalFator = children.reduce((s, c) => s + (c.fator_peso ?? 1), 0);
    if (totalFator <= 0) return;
    children.forEach(c => {
      distributeToLeaves(c.id, value * ((c.fator_peso ?? 1) / totalFator));
    });
  }

  Object.entries(directValues).forEach(([id, val]) => {
    if (val > 0) distributeToLeaves(id, val);
  });

  // Propaga valores das folhas para os grupos (bubble-up, do mais profundo para o mais raso)
  const result = { ...leafValues };
  [...etapas]
    .sort((a, b) => (b.nivel || 0) - (a.nivel || 0))
    .forEach(e => {
      if (e.parentId && result[e.id]) {
        result[e.parentId] = (result[e.parentId] || 0) + result[e.id];
      }
    });

  return result;
}
