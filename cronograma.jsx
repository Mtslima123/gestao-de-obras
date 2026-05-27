// cronograma.jsx — Gantt interativo com drag & drop, undo/redo, tooltips e validação de dependências

// ─── Constantes de layout ────────────────────────────────────────────────────
const GM_START_YEAR  = 2024;
const GM_START_MONTH = 2;    // março (0-indexed)
const GM_TOTAL       = 28;   // meses na linha do tempo
const GM_MONTH_W     = 64;   // px por mês
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

const gmCalcToday = () => {
  const now = new Date();
  return (now.getFullYear() - GM_START_YEAR) * 12
       + (now.getMonth()    - GM_START_MONTH)
       + (now.getDate() - 1) / 30;
};

const gmMonthLabel = (offset) => {
  let mo = GM_START_MONTH + Math.floor(offset);
  let y  = GM_START_YEAR;
  while (mo >= 12) { mo -= 12; y++; }
  return `${GM_MN[mo]}/${String(y).slice(2)}`;
};

// Retorna pares {pred, succ} onde o successor começa antes do predecessor terminar
const gmConflicts = (etapas, overrides) => {
  const map = {};
  etapas.forEach(e => {
    map[e.id] = overrides && overrides[e.id] ? { ...e, ...overrides[e.id] } : e;
  });
  const out = [];
  Object.values(map).forEach(e => {
    (e.dep || []).forEach(dId => {
      const d = map[dId];
      if (d && e.inicio < d.inicio + d.dur) out.push({ pred: dId, succ: e.id });
    });
  });
  return out;
};

// ─── Utilitários de data ─────────────────────────────────────────────────────
const GM_REF = new Date(GM_START_YEAR, GM_START_MONTH, 1);

function offsetToDate(months) {
  const d = new Date(GM_REF);
  d.setMonth(d.getMonth() + Math.floor(months));
  const frac = months - Math.floor(months);
  if (frac > 0) d.setDate(d.getDate() + Math.round(frac * 30));
  return d;
}

function offsetToISO(months) {
  const d = offsetToDate(months);
  // Usa data local sem conversão UTC para evitar off-by-one de timezone
  const y   = d.getFullYear();
  const mo  = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

function dateToOffset(iso) {
  if (!iso) return 0;
  const parts = iso.split('-');
  if (parts.length < 3) return 0;
  const d     = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  const years  = d.getFullYear() - GM_REF.getFullYear();
  const months = d.getMonth()    - GM_REF.getMonth();
  const days   = d.getDate()     - GM_REF.getDate();
  return Math.max(0, years * 12 + months + days / 30);
}

// ─── Funções puras de dados ──────────────────────────────────────────────────

function migrateEtapas(raw) {
  return (raw || []).map(e => ({
    nivel: 0, parentId: null, isGroup: false,
    collapsed: false, responsavel: '', customCols: {},
    milestone: false, custo: 0,
    ...e,
  }));
}

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

function computeSuccessors(etapas) {
  const r = {};
  etapas.forEach(e => { r[e.id] = []; });
  etapas.forEach(e => (e.dep || []).forEach(pid => { if (r[pid]) r[pid].push(e.id); }));
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
  return 'E' + (Math.max(0, ...nums) + 1);
}

function emptyCustomCols(customCols) {
  return Object.fromEntries((customCols || []).map(c => [c.id, '']));
}

function createTask(afterId, etapas, customCols) {
  const afterIdx = afterId ? etapas.findIndex(e => e.id === afterId) : etapas.length - 1;
  const idx      = Math.max(0, afterIdx);
  const after    = etapas[idx] || etapas[etapas.length - 1];
  const novo = {
    id: nextEtapaId(etapas), etapa: 'Nova tarefa',
    nivel: after ? after.nivel : 0, parentId: after ? after.parentId : null,
    isGroup: false, collapsed: false,
    inicio: after ? after.inicio + after.dur : 0,
    dur: 1, avanco: 0, status: 'upcoming',
    dep: [], milestone: false, responsavel: '',
    customCols: emptyCustomCols(customCols), custo: 0,
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
    id: nextEtapaId(etapas), etapa: 'Nova subtarefa',
    nivel: (parent.nivel || 0) + 1, parentId,
    isGroup: false, collapsed: false,
    inicio: parent.inicio, dur: 1, avanco: 0, status: 'upcoming',
    dep: [], milestone: false, responsavel: '',
    customCols: emptyCustomCols(customCols), custo: 0,
  };
  return [...etapas.slice(0, insertIdx + 1), novo, ...etapas.slice(insertIdx + 1)];
}

function createGroup(afterId, etapas, customCols) {
  const afterIdx = afterId ? etapas.findIndex(e => e.id === afterId) : etapas.length - 1;
  const idx      = Math.max(0, afterIdx);
  const after    = etapas[idx] || etapas[etapas.length - 1];
  const novo = {
    id: nextEtapaId(etapas), etapa: 'Novo grupo',
    nivel: after ? after.nivel : 0, parentId: after ? after.parentId : null,
    isGroup: true, collapsed: false,
    inicio: after ? after.inicio : 0,
    dur: 1, avanco: 0, status: 'upcoming',
    dep: [], milestone: false, responsavel: '',
    customCols: emptyCustomCols(customCols), custo: 0,
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
    .map(e => ({ ...e, dep: (e.dep || []).filter(d => !toRemove.has(d)) }));
}

// Propaga delta de arrastar para todas as tarefas sucessoras (BFS)
// endDeltaMap: { [id]: deltaMeses } — quanto o FIM de cada barra moveu
// Modifica apenas os SUCESSORES (não as barras seed, que já estão corretas)
function propagateDrag(etapas, endDeltaMap) {
  const succs = computeSuccessors(etapas);
  const queue = Object.keys(endDeltaMap);
  const visited = new Set(queue);
  const deltasBySucc = {};

  while (queue.length) {
    const id = queue.shift();
    for (const sid of (succs[id] || [])) {
      if (!visited.has(sid)) {
        deltasBySucc[sid] = endDeltaMap[id];
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
      const delta = Math.round((ev.clientX - sx) / GM_MONTH_W);
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
      const novas = etapasRef.current.map(et => ({
        ...et, ...(movedIds.has(et.id) && cur[et.id] ? cur[et.id] : {}),
      }));

      // Replanejamento automático: cascata para sucessoras
      if (replanAuto && type !== 'resizeLeft') {
        const endDeltaMap = {};
        movedIds.forEach(mid => {
          if (!cur[mid] || !orig[mid]) return;
          const d = (cur[mid].inicio + cur[mid].dur) - (orig[mid].inicio + orig[mid].dur);
          if (d !== 0) endDeltaMap[mid] = d;
        });
        if (Object.keys(endDeltaMap).length) {
          onCommit(propagateDrag(novas, endDeltaMap));
          return;
        }
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
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
            color: 'var(--text-muted)', background: 'var(--surface-muted)',
            position: 'sticky', left: 0, zIndex: 5,
          }}>
            ETAPA
          </div>

          {/* ── Cabeçalho linha do tempo ──────────────────────────────────── */}
          <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
            {/* Trimestres */}
            <div style={{ display: 'flex', height: 28, borderBottom: '1px solid var(--border)' }}>
              {GM_QUARTERS.map((q, qi) => (
                <div key={qi} style={{
                  width: (q.end - q.start) * GM_MONTH_W,
                  fontSize: 10.5, fontWeight: 700, color: 'var(--text-soft)',
                  textTransform: 'uppercase', letterSpacing: '0.08em',
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
                    {e.id}
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
                    width: Math.min(today, GM_TOTAL) * GM_MONTH_W,
                    background: 'rgba(0,0,0,0.011)', pointerEvents: 'none',
                  }} />

                  {/* Barra de linha de base — fina, atrás da barra atual */}
                  {blMap[e.id] && !e.milestone && (
                    <div style={{
                      position: 'absolute',
                      left: blMap[e.id].inicio * GM_MONTH_W + 3,
                      width: Math.max(blMap[e.id].dur * GM_MONTH_W - 6, 10),
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
                        left: bar.inicio * GM_MONTH_W + 3,
                        width: Math.max(bar.dur * GM_MONTH_W - 6, 10),
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
                        left: bar.inicio * GM_MONTH_W - 11,
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
            left: GM_LABEL_W + Math.min(today, GM_TOTAL) * GM_MONTH_W,
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

          {/* ── SVG: setas de dependência ──────────────────────────────────── */}
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
              (e.dep || []).map(dId => {
                const dep = findEt(dId);
                if (!dep) return null;
                const dBar = getBar(dep);
                const eBar = getBar(e);
                const fx   = (dBar.inicio + dBar.dur) * GM_MONTH_W;
                const fy   = idxEt(dId) * GM_ROW_H + GM_ROW_H / 2;
                const tx   = eBar.inicio * GM_MONTH_W + 4;
                const ty   = i * GM_ROW_H + GM_ROW_H / 2;
                const cpx  = fx + Math.max((tx - fx) * 0.5, 20);
                const warn = conflictIds.has(e.id) || conflictIds.has(dId);
                return (
                  <path
                    key={`${e.id}-${dId}`}
                    d={`M ${fx} ${fy} C ${cpx} ${fy} ${cpx} ${ty} ${tx} ${ty}`}
                    fill="none"
                    stroke={warn ? '#d97706' : 'var(--text-faint)'}
                    strokeWidth={warn ? 1.8 : 1.2}
                    strokeDasharray="4 3"
                    markerEnd={warn ? 'url(#arr-warn)' : 'url(#arr-dep)'}
                  />
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
              ['Duração',  `${tooltip.etapa.dur} ${tooltip.etapa.dur === 1 ? 'mês' : 'meses'}`],
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
  const [label, setLabel] = React.useState('');
  const [type,  setType]  = React.useState('text');

  const doAdd = () => {
    if (!label.trim()) return;
    onAdd({ id: 'cc_' + Date.now().toString(36), label: label.trim(), type });
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
            <option value="date">Data</option>
          </select>
        </div>
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
        uniqueSubs.push({ ...sub, id: nextEtapaId([...novas, ...uniqueSubs]) });
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

// ─── ListaInterativa ──────────────────────────────────────────────────────────
const ListaInterativa = ({ etapas, onCommit, customCols, onCustomColsChange }) => {
  const toast = useToast();
  const [selectedId,     setSelectedId]     = React.useState(null);
  const [showAddCol,     setShowAddCol]     = React.useState(false);
  const [deleteConfirm,  setDeleteConfirm]  = React.useState(null); // id da tarefa a excluir
  const [showPavimentos, setShowPavimentos] = React.useState(false);
  const [multiSel,       setMultiSel]       = React.useState([]);   // seleção ordenada para Ctrl+F2

  const wbsMap   = React.useMemo(() => computeAllWBS(etapas), [etapas]);
  const succMap  = React.useMemo(() => computeSuccessors(etapas), [etapas]);
  const visible  = React.useMemo(() => getVisibleEtapas(etapas), [etapas]);
  const groupVals = React.useMemo(() => computeGroupValues(etapas), [etapas]);

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
          if (succ && !(succ.dep || []).includes(multiSel[i - 1])) {
            succ.dep = [...(succ.dep || []), multiSel[i - 1]];
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
        dep:      (e.dep || []).map(d => d === id ? newId : d),
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
        const days = Math.max(1, parseInt(rawValue) || 1);
        return { ...e, dur: Math.max(1, Math.round(days / 30)) };
      }
      if (field === 'avanco') {
        return { ...e, avanco: Math.min(100, Math.max(0, parseInt(rawValue) || 0)) };
      }
      if (field === 'dep') {
        const depList = String(rawValue).split(',').map(s => s.trim()).filter(s => s && etapas.find(x => x.id === s));
        return { ...e, dep: depList };
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
    window.AppData.cronogramaCustomCols = newCols;
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

      {/* ── Tabela ───────────────────────────────────────────────────────── */}
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl" style={{ minWidth: 1180 }}>
          <thead>
            <tr>
              <th style={{ width: 56, fontSize: 10.5 }}>WBS</th>
              <th style={{ width: 58, fontSize: 10.5 }}>ID</th>
              <th style={{ minWidth: 210 }}>Etapa / Tarefa</th>
              <th style={{ width: 112 }}>Início</th>
              <th style={{ width: 112 }}>Término</th>
              <th style={{ width: 90 }}>Duração</th>
              <th style={{ width: 150 }}>Avanço</th>
              <th style={{ width: 130 }}>Responsável</th>
              <th style={{ width: 110 }}>Predecessoras</th>
              <th style={{ width: 110 }}>Sucessoras</th>
              <th style={{ width: 105 }}>Status</th>
              {customCols.map(col => (
                <th key={col.id} style={{ minWidth: 110 }}>{col.label}</th>
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
            {visible.map((e) => {
              const isSelected   = selectedId === e.id;
              const indent       = (e.nivel || 0) * 20;
              const hasChildren  = etapas.some(x => x.parentId === e.id);
              const gv           = e.isGroup ? groupVals[e.id] : null;
              const multiIdx     = multiSel.indexOf(e.id); // -1 se não está na multi-seleção
              const isMultiSel   = multiIdx >= 0;

              // Início e término efetivos (grupo usa groupVals)
              const eInicio = gv ? gv.inicio : e.inicio;
              const eDur    = gv ? gv.dur    : e.dur;
              const eAvanco = gv ? gv.avanco : e.avanco;

              return (
                <tr
                  key={e.id}
                  className={isSelected ? 'lista-row-selected' : e.isGroup ? 'lista-row-group' : ''}
                  onClick={(ev) => {
                    if (ev.ctrlKey || ev.metaKey) {
                      // Ctrl+click: adiciona/remove da seleção ordenada
                      ev.preventDefault();
                      setMultiSel(ms => ms.includes(e.id) ? ms.filter(id => id !== e.id) : [...ms, e.id]);
                    } else {
                      setSelectedId(id => id === e.id ? null : e.id);
                      setMultiSel([]);
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {/* WBS */}
                  <td className="mono text-sm text-muted" style={{ paddingRight: 4 }}>
                    {wbsMap[e.id]}
                  </td>

                  {/* ID */}
                  <td className="mono strong" onClick={ev => ev.stopPropagation()}>
                    <EditableCell value={e.id} onSave={v => handleCellSave(e.id, 'id', v)} />
                  </td>

                  {/* Etapa com indent e toggle */}
                  <td onClick={ev => ev.stopPropagation()} style={{ paddingLeft: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 10 + indent }}>
                      {(e.isGroup || hasChildren) ? (
                        <button
                          className="lista-toggle"
                          onClick={ev => { ev.stopPropagation(); handleToggleCollapse(e.id); }}
                        >
                          {e.collapsed ? '▶' : '▼'}
                        </button>
                      ) : (
                        <span style={{ width: 20, flexShrink: 0, display: 'inline-block' }} />
                      )}
                      <EditableCell
                        value={e.etapa}
                        onSave={v => v.trim() && handleCellSave(e.id, 'etapa', v)}
                        style={{ fontWeight: e.isGroup ? 600 : 400 }}
                      />
                      {isMultiSel && (
                        <span className="multi-sel-badge">{multiIdx + 1}</span>
                      )}
                    </div>
                  </td>

                  {/* Início */}
                  <td className="mono text-sm" onClick={ev => ev.stopPropagation()}>
                    <EditableCell
                      type="date"
                      value={offsetToISO(eInicio)}
                      onSave={v => handleCellSave(e.id, 'inicio', v)}
                      readOnly={e.isGroup}
                    />
                  </td>

                  {/* Término */}
                  <td className="mono text-sm" onClick={ev => ev.stopPropagation()}>
                    <EditableCell
                      type="date"
                      value={offsetToISO(eInicio + eDur)}
                      onSave={v => handleCellSave(e.id, 'fim', v)}
                      readOnly={e.isGroup}
                    />
                  </td>

                  {/* Duração em dias (aprox) */}
                  <td className="mono num" onClick={ev => ev.stopPropagation()}>
                    {e.isGroup ? (
                      <span className="text-muted mono" style={{ fontSize: 12 }}>{eDur * 30}d</span>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <EditableCell
                          type="number"
                          value={String(e.dur * 30)}
                          onSave={v => handleCellSave(e.id, 'duracaoDias', v)}
                          style={{ minWidth: 32 }}
                        />
                        <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>d</span>
                      </div>
                    )}
                  </td>

                  {/* Avanço % com barra */}
                  <td onClick={ev => ev.stopPropagation()}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, minWidth: 50 }}>
                        <div className={'progress' + (e.status === 'done' ? ' success' : e.status === 'late' ? ' danger' : '')}>
                          <span style={{ width: eAvanco + '%' }}></span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <EditableCell
                          type="number"
                          value={String(eAvanco)}
                          onSave={v => handleCellSave(e.id, 'avanco', v)}
                          readOnly={e.isGroup}
                          style={{ fontFamily: 'var(--font-mono)', fontSize: 12, minWidth: 28 }}
                        />
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>%</span>
                      </div>
                    </div>
                  </td>

                  {/* Responsável */}
                  <td onClick={ev => ev.stopPropagation()}>
                    <EditableCell
                      value={e.responsavel || ''}
                      onSave={v => handleCellSave(e.id, 'responsavel', v)}
                    />
                  </td>

                  {/* Predecessoras */}
                  <td className="mono text-sm" onClick={ev => ev.stopPropagation()}>
                    <EditableCell
                      value={(e.dep || []).join(', ')}
                      onSave={v => handleCellSave(e.id, 'dep', v)}
                      readOnly={e.isGroup}
                    />
                  </td>

                  {/* Sucessoras (computed) */}
                  <td className="mono text-sm text-muted">
                    {(succMap[e.id] || []).join(', ') || '—'}
                  </td>

                  {/* Status badge */}
                  <td>
                    <span className={'badge ' + statusBadgeClass(e.status)}>
                      <span className="dot"></span>
                      {statusLabel(e.status)}
                    </span>
                  </td>

                  {/* Colunas personalizadas */}
                  {customCols.map(col => (
                    <td key={col.id} onClick={ev => ev.stopPropagation()}>
                      <EditableCell
                        type={col.type}
                        value={(e.customCols || {})[col.id] || ''}
                        onSave={v => handleCellSave(e.id, col.id, v)}
                      />
                    </td>
                  ))}

                  {/* Célula vazia da coluna "+" */}
                  <td></td>
                </tr>
              );
            })}

            {/* Linha de adição rápida */}
            {visible.length === 0 && (
              <tr>
                <td colSpan={11 + customCols.length + 1} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-faint)', fontSize: 13 }}>
                  Nenhuma tarefa — clique em <strong>Adicionar tarefa</strong> para começar
                </td>
              </tr>
            )}
          </tbody>
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

// ─── CurvaFisicaView (placeholder) ──────────────────────────────────────────
const CurvaFisicaView = ({ obra }) => (
  <div className="card" style={{ marginTop: 'var(--gap)', padding: 40, textAlign: 'center' }}>
    <Icon name="trending-up" size={40} style={{ color: 'var(--text-faint)' }} />
    <h3 style={{ marginTop: 12, fontSize: 16, color: 'var(--text-soft)' }}>Curva S — Avanço físico vs. planejado</h3>
    <p className="text-muted" style={{ maxWidth: 420, margin: '6px auto 0', fontSize: 13 }}>
      Visualização da curva S em desenvolvimento. Em breve: gráfico de avanço acumulado mensal.
    </p>
  </div>
);

// ─── Helpers de Linha de Base ────────────────────────────────────────────────
function carregarBaselines(obraId) {
  try { return JSON.parse(localStorage.getItem(`cronograma_baselines_${obraId}`)) || []; }
  catch { return []; }
}
function salvarBaselines(obraId, bls) {
  localStorage.setItem(`cronograma_baselines_${obraId}`, JSON.stringify(bls));
}

async function salvarCronograma(obraId, etapas, customCols, baselines) {
  await window.sb.from('cronogramas').upsert(
    { obra_id: obraId, etapas, custom_cols: customCols, baselines, updated_at: new Date().toISOString() },
    { onConflict: 'obra_id' }
  );
}

async function carregarCronogramaDB(obraId) {
  const { data, error } = await window.sb.from('cronogramas')
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
  const D    = window.AppData;
  const toast = useToast();

  const [obraSel,      setObraSel]      = React.useState(initialObraId || 'OB-001');
  const [view,         setView]         = React.useState('gantt');
  const [etapas,       setEtapas]       = React.useState(() => migrateEtapas(D.cronograma[initialObraId || 'OB-001'] || []));
  const [customCols,   setCustomCols]   = React.useState(() => D.cronogramaCustomCols || []);
  const [baselines,    setBaselines]    = React.useState(() => carregarBaselines(initialObraId || 'OB-001'));
  const [blVisivelId,  setBlVisivelId]  = React.useState(null);
  const [showCriar,    setShowCriar]    = React.useState(false);
  const [showGerenciar, setShowGerenciar] = React.useState(false);

  // Histórico de undo/redo unificado (Lista + Gantt)
  const histRef = React.useRef([etapas.map(e => ({ ...e }))]);
  const hidxRef = React.useRef(0);
  const undoRef    = React.useRef(null);
  const redoRef    = React.useRef(null);
  const saveTimerRef = React.useRef(null);

  // Recarrega etapas, histórico e baselines ao trocar de obra (Supabase first, fallback para mock)
  React.useEffect(() => {
    let cancelled = false;
    async function carregar() {
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

  // Refs para evitar closures stale no listener de teclado
  undoRef.current = undo;
  redoRef.current = redo;

  // Atalho Ctrl+Z / Ctrl+Y global (funciona em qualquer aba do módulo)
  React.useEffect(() => {
    const h = (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undoRef.current(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redoRef.current(); }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Cronogramas</h1>
          <div className="page-subtitle">Planejamento físico das obras · Gantt interativo com replanejamento direto</div>
        </div>
        <div className="page-actions">
          <select className="input" value={obraSel} onChange={e => setObraSel(e.target.value)} style={{ minWidth: 200 }}>
            {D.obras.filter(o => o.status === 'em_andamento').map(o => (
              <option key={o.id} value={o.id}>{o.nome} ({o.id})</option>
            ))}
          </select>
          <div className="segmented">
            <button className={view === 'gantt'      ? 'active' : ''} onClick={() => setView('gantt')}>Gantt</button>
            <button className={view === 'curva'      ? 'active' : ''} onClick={() => setView('curva')}>Curva Física</button>
            <button className={view === 'lista'      ? 'active' : ''} onClick={() => setView('lista')}>Lista</button>
            <button className={view === 'calendario' ? 'active' : ''} onClick={() => setView('calendario')}>Calendário</button>
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

      {/* KPIs */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="kpi" style={{ padding: '14px 18px' }}>
          <div className="kpi-label">Avanço físico</div>
          <div className="kpi-value num" style={{ fontSize: 22, marginTop: 6 }}>{avancoTotal}<span className="unit">%</span></div>
          <div className="kpi-foot" style={{ marginTop: 6 }}><span className="kpi-foot-text">ponderado pelo custo de cada etapa</span></div>
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

      {view === 'curva' && <CurvaFisicaView obra={obra} />}

      {view === 'lista' && (
        <ListaInterativa
          etapas={etapas}
          onCommit={commit}
          customCols={customCols}
          onCustomColsChange={handleCustomColsChange}
        />
      )}

      {view === 'calendario' && (
        <div className="card" style={{ marginTop: 'var(--gap)', padding: 40, textAlign: 'center' }}>
          <Icon name="calendar" size={40} style={{ color: 'var(--text-faint)' }} />
          <h3 style={{ marginTop: 12, fontSize: 16, color: 'var(--text-soft)' }}>Visualização em calendário</h3>
          <p className="text-muted" style={{ maxWidth: 380, margin: '6px auto 0', fontSize: 13 }}>
            Em breve: visualize etapas e marcos em uma grade mensal interativa.
          </p>
        </div>
      )}

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

Object.assign(window, { CronogramaFull, GanttInterativo, GanttElegante: GanttInterativo });
