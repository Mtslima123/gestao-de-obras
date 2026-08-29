// Motor de agenda do Cronograma — funções puras de dados/hierarquia/distribuição.
// Extraídas de Cronograma.jsx (movimento verbatim, comportamento idêntico) para
// reduzir o tamanho do componente. Operam sobre `etapas` (offset em DIAS) e não
// têm state, JSX nem efeitos colaterais. Datas/dias úteis vêm de ./cronogramaDateUtils.

import { formatBRL as formatBRLUtil } from '../../utils/formatters';
import { offsetToDate, offsetToISO, dateToOffset, taskEnd, workStart, workDur, todayOffset, nextMonthStartOffset } from './cronogramaDateUtils';

// ─── Funções puras de dados ──────────────────────────────────────────────────

export function migrateEtapas(raw) {
  const arr = (raw || []).map(e => ({
    nivel: 0, parentId: null, isGroup: false,
    collapsed: false, responsavel: '', pavimento: '', customCols: {},
    milestone: false, custo: 0, showInDist: false,
    restricaoTipo: 'asap', restricaoData: '',
    fator_peso: 1, valorVinculadoFixo: null, modo: 'auto',
    ...e,
    showInDist: e.showInDist ?? false,
    fator_peso: e.fator_peso ?? 1,
    valorVinculadoFixo: e.valorVinculadoFixo ?? null,
    modo: e.modo === 'manual' ? 'manual' : 'auto',
    dep: (e.dep || []).map(d =>
      typeof d === 'string' ? { id: d, tipo: 'TI', lag: 0 } : d
    ),
  }));
  // Atribui displayId permanente às tarefas que ainda não possuem
  const maxDid = arr.reduce((m, e) => Math.max(m, e.displayId || 0), 0);
  let nextDid = maxDid + 1;
  return arr.map(e => e.displayId ? e : { ...e, displayId: nextDid++ });
}

export const fmtBRL   = (n) => formatBRLUtil(n);
export const parseBRL  = s => { const n = parseFloat(String(s).replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.')); return isNaN(n) ? 0 : Math.max(0, n); };

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

// Recalcula nivel (da cadeia parentId) e isGroup (tem filhos diretos) após mudança de hierarquia
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

    const nivelAtual = e.nivel || 0;
    // pai correto = tarefa-irmã imediatamente acima (mesmo nível atual);
    // sobe a lista parando se encontrar um ancestral (nível menor) antes de uma irmã
    let above = null;
    for (let i = idx - 1; i >= 0; i--) {
      if (selSet.has(etapas[i].id)) continue; // ignora o próprio bloco selecionado (recua todos sob a mesma irmã)
      const n = etapas[i].nivel || 0;
      if (n < nivelAtual) break;            // chegou ao pai sem achar irmã -> não recua
      if (n === nivelAtual) { above = etapas[i]; break; }
      // n > nivelAtual: descendente de uma irmã anterior -> continua subindo
    }
    if (!above) return e;                   // sem irmã acima -> recuo inválido
    if (above.id === e.parentId) return e;  // já é filho da tarefa acima
    if (isDescendant(above.id, e.id)) return e; // evita ciclo
    return { ...e, parentId: above.id };
  });

  return recomputeHierarchy(novas);
}

// Promove as tarefas selecionadas — remove um nível hierárquico (filho → irmão do pai)
export function outdentTasks(etapas, selectedIds) {
  const selSet = new Set(selectedIds);
  const map = new Map(etapas.map(e => [e.id, e]));

  const novas = etapas.map(e => {
    if (!selSet.has(e.id)) return e;
    if (!e.parentId) return e; // já é raiz
    if (selSet.has(e.parentId)) return e; // a própria pai também vai subir — a filha acompanha, sem subir ela mesma
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

// Status efetivo para EXIBIÇÃO/contagem: tarefa em 100% conta como concluída (verde),
// mesmo que o status salvo ainda seja outro. Não altera o dado persistido.
// Grupos não flipam aqui (o avanço do grupo é calculado à parte, não vive em e.avanco).
export const effStatus = (e) => (!e?.isGroup && (e?.avanco ?? 0) >= 100 ? 'done' : e?.status);

export function getVisibleEtapas(etapas) {
  const collapsed = new Set(etapas.filter(e => e.isGroup && e.collapsed).map(e => e.id));
  if (collapsed.size === 0) return etapas;
  // Mapa id -> etapa: sem isso, cada subida na cadeia de pais fazia um etapas.find()
  // (varredura linear) — com EAPs de milhares de tarefas e vários níveis de profundidade
  // isso vira O(n² × profundidade). Com o mapa, cada subida é O(1).
  const byId = new Map(etapas.map(e => [e.id, e]));
  return etapas.filter(e => {
    let cur = e;
    while (cur.parentId) {
      if (collapsed.has(cur.parentId)) return false;
      cur = byId.get(cur.parentId) || { parentId: null };
    }
    return true;
  });
}

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
    inicio: todayOffset(),
    dur: 30, avanco: 0, status: 'upcoming',
    dep: [], milestone: false, responsavel: '',
    customCols: emptyCustomCols(customCols), custo: 0,
    restricaoTipo: 'asap', restricaoData: '', fator_peso: 1, modo: 'auto',
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
    inicio: todayOffset(), dur: 30, avanco: 0, status: 'upcoming',
    dep: [], milestone: false, responsavel: '',
    customCols: emptyCustomCols(customCols), custo: 0,
    restricaoTipo: 'asap', restricaoData: '', fator_peso: 1, modo: 'auto',
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
    inicio: todayOffset(),
    dur: 30, avanco: 0, status: 'upcoming',
    dep: [], milestone: false, responsavel: '',
    customCols: emptyCustomCols(customCols), custo: 0,
    restricaoTipo: 'asap', restricaoData: '', fator_peso: 1, modo: 'auto',
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

// Propaga delta de arrastar para todas as tarefas sucessoras (BFS)
// endDeltaMap: { [id]: deltaDias } — quanto o FIM de cada barra moveu
// startDeltaMap: { [id]: deltaDias } — quanto o INÍCIO de cada barra moveu
// Para TI/TT: propaga end_delta; para II/IT: propaga start_delta
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
      // Sucessora manual (Modo da Tarefa): datas fixas — não é empurrada nem propaga adiante.
      if (etapas.find(x => x.id === sid)?.modo === 'manual') { visited.add(sid); continue; }
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
export function autoScheduleFromDeps(etapas) {
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
    // Tarefa manual (Modo da Tarefa): datas fixas pelo usuário — não é reagendada.
    // Ainda serve de predecessora pelas próprias datas (permanece em `upd`).
    if (!e || e.isGroup || e.modo === 'manual') return;

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
      const predFim = taskEnd(pred); // término do predecessor em dias úteis (folha) / envelope (grupo)
      // TT/IT agendam por TÉRMINO: o início que faz a tarefa terminar no alvo é o
      // reverso em DIAS ÚTEIS (workStart), não `alvo - dur` em dias corridos.
      if      (dt === 'TI') req = predFim + lag;
      else if (dt === 'TT') req = workStart(predFim + lag, e.dur);
      else if (dt === 'II') req = pred.inicio + lag;
      else if (dt === 'IT') req = workStart(pred.inicio + lag, e.dur);
      else                  req = predFim + lag;
      if (req > minStart) minStart = req;
    });

    // Aplica restrições hard — forçam data mínima ou exata de início/fim
    // snlt e fnlt são soft (só avisam via verificarRestricoes, não forçam movimento)
    if (tipo && e.restricaoData) {
      const cd = dateToOffset(e.restricaoData);
      // mfo/fnet miram um TÉRMINO (cd): o início é o reverso em dias úteis (workStart).
      if (tipo === 'snet') minStart = Math.max(minStart, cd);
      if (tipo === 'mso')  minStart = cd;
      if (tipo === 'mfo')  minStart = workStart(cd, e.dur);
      if (tipo === 'fnet') minStart = Math.max(minStart, workStart(cd, e.dur));
    }

    const novoInicio = Math.max(0, minStart);
    if (novoInicio !== e.inicio) {
      upd[id] = { ...e, inicio: novoInicio };
    }
  });

  return etapas.map(e => upd[e.id] || e);
}

// Recalcula inicio/dur dos grupos com base nos filhos diretos (de baixo para cima)
export function updateParentBounds(etapas) {
  let result = etapas.map(e => ({ ...e }));
  const groups = result.filter(e => e.isGroup).reverse();
  for (const g of groups) {
    const children = result.filter(c => c.parentId === g.id);
    if (!children.length) continue;
    const inicio = Math.min(...children.map(c => c.inicio));
    const fim    = Math.max(...children.map(c => taskEnd(c)));
    result = result.map(e => e.id === g.id ? { ...e, inicio, dur: Math.max(1, fim - inicio) } : e);
  }
  return result;
}

// Reprograma o restante de uma tarefa parcialmente executada: a fatia já feita
// (avanco%) vira uma tarefa fechada (100%) onde a tarefa já estava; o que falta
// vira uma tarefa nova começando no dia 1 do mês seguinte a hoje, com data fixa
// (mso). A tarefa original vira um grupo — sucessoras que já apontavam pro id
// dela continuam apontando pro grupo (que passa a cobrir até o fim do
// restante via updateParentBounds); nenhuma outra tarefa da obra é tocada.
export function reprogramarRestante(etapaId, etapas) {
  const idx = etapas.findIndex(e => e.id === etapaId);
  if (idx < 0) return etapas;
  const target = etapas[idx];
  if (target.isGroup) return etapas;
  const perc = Math.round(target.avanco || 0);
  if (perc < 1 || perc > 99) return etapas;

  const fechadoId   = nextEtapaId(etapas);
  const fechadoDisp = nextDisplayId(etapas);
  const base2       = [...etapas, { id: fechadoId, displayId: fechadoDisp }];
  const restanteId   = nextEtapaId(base2);
  const restanteDisp = nextDisplayId(base2);

  const dur            = target.dur || 1;
  const custo          = target.custo || 0;
  const custoRealizado = target.custoRealizado || 0;
  const fechadoDur    = Math.max(1, Math.round(dur * perc / 100));
  const restanteDur   = Math.max(1, dur - fechadoDur);
  const fechadoCusto  = Math.round(custo * perc / 100);
  const restanteCusto = Math.max(0, custo - fechadoCusto);
  const fechadoCustoRealizado  = Math.round(custoRealizado * perc / 100);
  const restanteCustoRealizado = Math.max(0, custoRealizado - fechadoCustoRealizado);
  const fechadoFim = taskEnd({ isGroup: false, inicio: target.inicio, dur: fechadoDur });
  const proxMes    = nextMonthStartOffset(fechadoFim);
  const proxMesISO = offsetToISO(proxMes);
  const cloneDep   = () => (target.dep || []).map(d => ({ ...d }));

  const fechado = {
    ...target,
    id: fechadoId, displayId: fechadoDisp,
    etapa: `${target.etapa} (executado)`,
    parentId: target.id, nivel: (target.nivel || 0) + 1,
    isGroup: false,
    inicio: target.inicio, dur: fechadoDur,
    avanco: 100, status: 'done',
    dep: cloneDep(),
    custo: fechadoCusto, custoRealizado: fechadoCustoRealizado,
    fator_peso: perc, valorVinculadoFixo: null,
    modo: target.modo,
    customCols: { ...(target.customCols || {}) },
  };

  const restante = {
    ...target,
    id: restanteId, displayId: restanteDisp,
    etapa: `${target.etapa} (restante)`,
    parentId: target.id, nivel: (target.nivel || 0) + 1,
    isGroup: false,
    inicio: proxMes, dur: restanteDur,
    avanco: 0, status: 'upcoming',
    dep: cloneDep(),
    restricaoTipo: 'mso', restricaoData: proxMesISO,
    custo: restanteCusto, custoRealizado: restanteCustoRealizado,
    fator_peso: Math.max(0, 100 - perc), valorVinculadoFixo: null,
    modo: 'auto',
    customCols: { ...(target.customCols || {}) },
  };

  const grupo = { ...target, isGroup: true, collapsed: false };
  const spliced = [...etapas.slice(0, idx), grupo, fechado, restante, ...etapas.slice(idx + 1)];

  let novas = recomputeHierarchy(spliced);
  novas = updateParentBounds(novas);
  novas = autoScheduleFromDeps(novas);
  novas = updateParentBounds(novas);
  return novas;
}

// Converte dep[] para string exibível usando displayId: "1, 2TT+3d"
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
  }).join('; ');
}

// Converte string "1; 2TT+3d" para dep[] resolvendo SEMPRE por displayId (o número
// simples exibido na coluna ID/Predecessora/Sucessora) — nunca pelo id interno
// (ex.: "TSK-078"), que não aparece em lugar nenhum da tela e só confundiria quem
// for digitar uma predecessora.
// Aceita separador ';' ou ',' e lag no formato "+3d" ou "+3 dias" (colado do Project).
export function parseDep(raw, etapas) {
  return String(raw).split(/[;,]/).map(s => s.trim()).filter(Boolean).map(token => {
    const norm = token.replace(/\s+/g, '').replace(/dias?$/i, 'd');
    const m = norm.match(/^(\d+)(TI|TT|II|IT)?([+-]\d+d?)?$/);
    if (!m) return null;
    const ref  = m[1];
    const tipo = m[2] || 'TI';
    const lag  = m[3] ? parseInt(m[3]) : 0;
    const found = etapas.find(x => String(x.displayId) === ref);
    if (!found) return null;
    return { id: found.id, tipo, lag };
  }).filter(Boolean);
}

// ─── Atualização de campo (Lista e Formulário de Tarefa) ─────────────────────
// Campos que exigem reprogramação (recalcular datas via dependências)
export const RESCHEDULE_FIELDS = ['dep', 'inicio', 'fim', 'duracaoDias', 'restricao', 'restricaoTipo', 'restricaoData', 'modo'];

// Aplica um único campo a uma etapa (conversões de valor). Reutilizado pela Lista
// (célula editável, colar em bloco) e pelo Formulário de Tarefa do Gantt.
// NÃO trata 'id' (caso especial de renomeação, tratado no chamador).
export function applyFieldToEtapa(e, field, rawValue, etapas) {
  if (field === 'inicio')      { return { ...e, inicio: Math.round(dateToOffset(rawValue)) }; }
  if (field === 'fim')         { const offset = Math.round(dateToOffset(rawValue)); return { ...e, dur: workDur(e.inicio, offset) }; }
  if (field === 'duracaoDias') { return { ...e, dur: Math.max(1, parseInt(rawValue) || 1) }; }
  if (field === 'avanco')      { return { ...e, avanco: Math.min(100, Math.max(0, parseInt(rawValue) || 0)) }; }
  if (field === 'dep')         { return { ...e, dep: parseDep(rawValue, etapas) }; }
  if (field === 'restricao') {
    // Campo virtual da coluna simplificada (estilo Project): só uma data, sem tipo à escolha.
    // Preenchida = "não iniciar antes de" (snet); vazia = sem restrição (asap).
    const v = (rawValue || '').trim();
    return v ? { ...e, restricaoTipo: 'snet', restricaoData: v } : { ...e, restricaoTipo: 'asap', restricaoData: '' };
  }
  if (field === 'restricaoTipo') { return { ...e, restricaoTipo: rawValue }; }
  if (field === 'restricaoData') { return { ...e, restricaoData: rawValue }; }
  if (field === 'custo' || field === 'custoRealizado') { return { ...e, [field]: parseBRL(rawValue) }; }
  if (field === 'fator_peso')  {
    if ((e.avanco ?? 0) >= 100) return e; // tarefa concluída: peso travado, não altera
    const v = parseFloat(rawValue); return { ...e, fator_peso: isNaN(v) ? 1 : Math.max(0, v) };
  }
  if (field.startsWith('cc_')) { return { ...e, customCols: { ...(e.customCols || {}), [field]: rawValue } }; }
  return { ...e, [field]: rawValue };
}

// Aplica um campo e já decide se reprograma (mesma regra de RESCHEDULE_FIELDS) — usado
// diretamente pelo Formulário de Tarefa; a Lista usa applyFieldToEtapa por célula/lote
// e decide o reagendamento ela mesma (autoScheduleFromDeps sobre o array inteiro).
export function commitFieldChange(etapas, id, field, rawValue) {
  const novas = etapas.map(e => (e.id !== id ? e : applyFieldToEtapa(e, field, rawValue, etapas)));
  return RESCHEDULE_FIELDS.includes(field) ? autoScheduleFromDeps(novas) : novas;
}

// ─── Utilitários de formatação ───────────────────────────────────────────────
export const formatBRL = v =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0);

export const formatBRL2 = v =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);

// ─── Uso da Tarefa — funções de distribuição mensal ──────────────────────────

// Fim (EXCLUSIVO) da janela de rateio mensal: o término REAL da tarefa, em dias úteis.
//
// Antes as três funções abaixo usavam `inicio + max(dur, 1)`, tratando `dur` como dias
// corridos — mas `dur` é dias ÚTEIS (workEnd). A janela fechava antes do término exibido,
// então as fatias dos últimos meses da tarefa não existiam e ela desaparecia da Medição
// desses meses (uma tarefa 27/10 → 13/01 não aparecia em Janeiro). O custo total sempre
// foi preservado; o que estava errado era a distribuição no tempo.
//
// workEnd é exclusivo, igual a inicio+dur, então a troca preserva a convenção. O mínimo
// de 1 dia mantém os marcos (dur = 0) com fatia, como o max(dur, 1) fazia.
const distEndOffset = (e) => Math.max(taskEnd(e), e.inicio + 1);

// Retorna array de meses cobertos por qualquer tarefa: [{ key:"YYYY-MM", label:"Abr/26" }, ...]
export function getMonthRange(etapas) {
  const set = new Set();
  etapas.forEach(e => {
    const s = offsetToDate(e.inicio);
    const f = offsetToDate(distEndOffset(e));
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

// Distribui o custo de cada tarefa folha proporcionalmente pelos dias em cada mês.
// weightOverride: { [etapaId]: valor } — quando há vínculos, substitui e.custo (peso do orçamento).
export function computeMonthlyDist(etapas, weightOverride = null) {
  const result = {};
  etapas.forEach(e => {
    if (e.isGroup) return;
    const custo = weightOverride ? (weightOverride[e.id] ?? 0) : (e.custo || 0);
    const s = offsetToDate(e.inicio);
    const f = offsetToDate(distEndOffset(e));
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

// Distribui o custo realizado (avanco × custo) de cada tarefa pelos meses passados até `ateDate`.
// weightOverride: usa o valor vinculado como peso quando há vínculos (consistente com o planejado).
export function computeRealizedDistAte(etapas, ateDate, weightOverride = null) {
  const result = {};
  etapas.forEach(e => {
    if (e.isGroup) return;
    const custo = weightOverride ? (weightOverride[e.id] ?? 0) : (e.custo || 0);
    const avanco = e.avanco || 0;
    if (custo === 0 || avanco === 0) return;
    const realized = (avanco / 100) * custo;
    const s = offsetToDate(e.inicio);
    const taskEndDate = offsetToDate(distEndOffset(e));
    const f = new Date(Math.min(taskEndDate.getTime(), ateDate.getTime()));
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

// Mesmo cálculo, travado em "hoje" — usado pela Curva Física (mês corrente fixo).
export function computeRealizedDist(etapas, weightOverride = null) {
  return computeRealizedDistAte(etapas, new Date(), weightOverride);
}

// Agrega distribuição mensal de todos os descendentes folha de um grupo
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

// Verifica restrições e retorna lista de violações
export function verificarRestricoes(etapas) {
  const violacoes = [];
  etapas.forEach(e => {
    if (!e.restricaoTipo || e.restricaoTipo === 'asap' || !e.restricaoData) return;
    const d = dateToOffset(e.restricaoData);
    const ini = e.inicio, fim = taskEnd(e);
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
export function computeGroupValues(etapas, weightOverride = null) {
  const result = {};

  // Mapa id -> etapa e mapa parentId -> filhos, montados 1x: sem eles, getDepth fazia um
  // etapas.find() por subida na cadeia de pais e o loop de grupos refazia um etapas.filter()
  // completo pra cada grupo — em EAPs de milhares de tarefas com vários grupos isso vira
  // O(n² ) (ou pior, com a profundidade). Com os mapas, cada acesso é O(1).
  const byId = new Map(etapas.map(e => [e.id, e]));
  const childrenOf = new Map();
  etapas.forEach(e => {
    if (e.parentId) {
      if (!childrenOf.has(e.parentId)) childrenOf.set(e.parentId, []);
      childrenOf.get(e.parentId).push(e);
    }
  });

  // Determina a profundidade de cada tarefa para ordenar do mais profundo para o mais raso
  const depthOf = {};
  const getDepth = (id, visited = new Set()) => {
    if (depthOf[id] !== undefined) return depthOf[id];
    if (visited.has(id)) return 0;
    visited.add(id);
    const e = byId.get(id);
    depthOf[id] = e && e.parentId ? 1 + getDepth(e.parentId, visited) : 0;
    return depthOf[id];
  };
  etapas.forEach(e => getDepth(e.id));

  // Processa grupos do mais profundo para o mais raso
  const groups = etapas.filter(e => e.isGroup)
    .slice()
    .sort((a, b) => (depthOf[b.id] || 0) - (depthOf[a.id] || 0));

  groups.forEach(g => {
    const children = childrenOf.get(g.id) || [];
    if (!children.length) return;

    // Para filhos que são grupos, usa os valores já calculados nesta passagem
    const childVals = children.map(c => ({ id: c.id, ...(result[c.id] || { inicio: c.inicio, dur: c.dur, avanco: c.avanco, custo: c.custo || 0 }) }));

    const w = (c) => weightOverride ? (weightOverride[c.id] || 0) : (c.custo || 0);
    const totalCusto = childVals.reduce((s, c) => s + w(c), 0);
    const avanco = totalCusto > 0
      ? childVals.reduce((s, c) => s + (c.avanco || 0) * w(c), 0) / totalCusto
      : childVals.reduce((s, c) => s + (c.avanco || 0), 0) / childVals.length;
    const inicio = Math.min(...childVals.map(c => c.inicio));
    // Término do filho: grupo → envelope já calculado (result); folha → dias úteis (taskEnd).
    const fim    = Math.max(...children.map(c => { const v = result[c.id]; return v ? v.inicio + v.dur : taskEnd(c); }));
    result[g.id] = {
      avanco:  Math.round(avanco),
      inicio,
      dur:     Math.max(1, fim - inicio),
      custo:   totalCusto,
    };
  });
  return result;
}

// Avanço físico da obra: média do avanço das folhas ponderada pelo custo/valor de cada uma.
// weightOverride (valor vinculado do orçamento) substitui e.custo quando há vínculos.
// Sem custo/valor, cai na média simples do avanço (evita 0% quando o custo é 0).
// Retorna o valor "cru" (sem arredondar) — quem exibe decide a casa decimal.
export function computeAvancoFisico(etapas, weightOverride = null) {
  const folhas = (etapas || []).filter(e => !e.isGroup);
  if (!folhas.length) return 0;
  const w = (e) => weightOverride ? (weightOverride[e.id] || 0) : (e.custo || 0);
  const totalW = folhas.reduce((s, e) => s + w(e), 0);
  if (totalW > 0) return folhas.reduce((s, e) => s + (e.avanco || 0) * w(e), 0) / totalW;
  return folhas.reduce((s, e) => s + (e.avanco || 0), 0) / folhas.length;
}

// Move um bloco de tarefas (tarefa + todos os descendentes) para nova posição no array.
// O parentId das tarefas movidas não é alterado — apenas a ordem no array muda.
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

// Retorna o Set de ids de uma tarefa-pai + todos os seus descendentes (grupos e folhas),
// usado pelo filtro "Tarefa Pai" (Lista/Gantt) para manter a hierarquia EAP visível.
export function collectDescendantIds(parentId, etapas) {
  const ids = new Set([parentId]);
  const collect = (id) => {
    etapas.filter(e => e.parentId === id).forEach(c => { ids.add(c.id); collect(c.id); });
  };
  collect(parentId);
  return ids;
}
