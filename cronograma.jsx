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
    milestone: false,
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
    customCols: emptyCustomCols(customCols),
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
    customCols: emptyCustomCols(customCols),
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
    customCols: emptyCustomCols(customCols),
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

// ─── GanttInterativo ─────────────────────────────────────────────────────────
const GanttInterativo = ({ etapas, onCommit, undo, redo }) => {
  const [selected,    setSel]  = React.useState(new Set());
  const [editMode,    setEdit] = React.useState(true);
  const [lockDone,    setLock] = React.useState(true);
  const [tooltip,     setTip]  = React.useState(null);
  const [draft,       setDraft]= React.useState(null);

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
          onClick={() => setEdit(v => !v)}
        >
          <Icon name="edit" size={12} />{editMode ? 'Editando' : 'Somente leitura'}
        </button>

        <button
          className="btn btn-ghost"
          style={{ fontSize: 12, padding: '4px 12px', height: 30, gap: 5, color: lockDone ? 'var(--success)' : 'var(--text-muted)' }}
          onClick={() => setLock(v => !v)}
        >
          <Icon name="shield" size={12} />{lockDone ? 'Concluídas bloqueadas' : 'Concluídas livres'}
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

// ─── ListaInterativa ──────────────────────────────────────────────────────────
const ListaInterativa = ({ etapas, onCommit, customCols, onCustomColsChange }) => {
  const toast = useToast();
  const [selectedId,  setSelectedId]  = React.useState(null);
  const [showAddCol,  setShowAddCol]  = React.useState(false);

  const wbsMap  = React.useMemo(() => computeAllWBS(etapas), [etapas]);
  const succMap = React.useMemo(() => computeSuccessors(etapas), [etapas]);
  const visible = React.useMemo(() => getVisibleEtapas(etapas), [etapas]);

  // Limpa seleção se o item selecionado for excluído
  React.useEffect(() => {
    if (selectedId && !etapas.find(e => e.id === selectedId)) setSelectedId(null);
  }, [etapas, selectedId]);

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
  const handleDelete     = () => {
    if (!selectedId) return;
    const novas = deleteTask(selectedId, etapas);
    const count = etapas.length - novas.length;
    onCommit(novas, { silent: true });
    setSelectedId(null);
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

        {selectedId && (
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
              const isSelected  = selectedId === e.id;
              const indent      = (e.nivel || 0) * 20;
              const hasChildren = etapas.some(x => x.parentId === e.id);

              return (
                <tr
                  key={e.id}
                  className={isSelected ? 'lista-row-selected' : e.isGroup ? 'lista-row-group' : ''}
                  onClick={() => setSelectedId(id => id === e.id ? null : e.id)}
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
                    </div>
                  </td>

                  {/* Início */}
                  <td className="mono text-sm" onClick={ev => ev.stopPropagation()}>
                    <EditableCell
                      type="date"
                      value={offsetToISO(e.inicio)}
                      onSave={v => handleCellSave(e.id, 'inicio', v)}
                      readOnly={e.isGroup}
                    />
                  </td>

                  {/* Término */}
                  <td className="mono text-sm" onClick={ev => ev.stopPropagation()}>
                    <EditableCell
                      type="date"
                      value={offsetToISO(e.inicio + e.dur)}
                      onSave={v => handleCellSave(e.id, 'fim', v)}
                      readOnly={e.isGroup}
                    />
                  </td>

                  {/* Duração em dias (aprox) */}
                  <td className="mono num" onClick={ev => ev.stopPropagation()}>
                    {e.isGroup ? (
                      <span className="text-muted">—</span>
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
                          <span style={{ width: e.avanco + '%' }}></span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <EditableCell
                          type="number"
                          value={String(e.avanco)}
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

// ─── CronogramaFull ──────────────────────────────────────────────────────────
const CronogramaFull = () => {
  const D    = window.AppData;
  const toast = useToast();

  const [obraSel,    setObraSel]    = React.useState('OB-001');
  const [view,       setView]       = React.useState('gantt');
  const [etapas,     setEtapas]     = React.useState(() => migrateEtapas(D.cronograma));
  const [customCols, setCustomCols] = React.useState(() => D.cronogramaCustomCols || []);

  // Histórico de undo/redo unificado (Lista + Gantt)
  const histRef = React.useRef([etapas.map(e => ({ ...e }))]);
  const hidxRef = React.useRef(0);
  const undoRef = React.useRef(null);
  const redoRef = React.useRef(null);

  const obra       = D.obras.find(o => o.id === obraSel) || D.obras[0];
  const concluidas = etapas.filter(e => e.status === 'done').length;
  const atrasadas  = etapas.filter(e => e.status === 'late').length;

  // ── Commit (fonte única de verdade) ────────────────────────────────────────
  const commit = (novas, opts = {}) => {
    const clean = novas.map(e => ({ ...e }));
    const h = histRef.current.slice(0, hidxRef.current + 1);
    h.push(clean);
    histRef.current = h;
    hidxRef.current = h.length - 1;
    setEtapas(clean);
    D.cronograma = clean;
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
    D.cronograma = snap;
    toast('Ação desfeita', { tone: 'neutral', icon: 'check' });
  };

  const redo = () => {
    if (hidxRef.current >= histRef.current.length - 1) { toast('Nada para refazer', { tone: 'neutral', icon: 'alert' }); return; }
    hidxRef.current++;
    const snap = histRef.current[hidxRef.current].map(e => ({ ...e }));
    setEtapas(snap);
    D.cronograma = snap;
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
          <button className="btn btn-ghost"><Icon name="download" size={15} />Exportar</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="kpi" style={{ padding: '14px 18px' }}>
          <div className="kpi-label">Avanço físico</div>
          <div className="kpi-value num" style={{ fontSize: 22, marginTop: 6 }}>{obra.avancoFisico}<span className="unit">%</span></div>
          <div className="kpi-foot" style={{ marginTop: 6 }}><span className="kpi-foot-text">vs planejado 65%</span></div>
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
              </div>
            </div>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <GanttInterativo etapas={etapas} onCommit={commit} undo={undo} redo={redo} />
          </div>
        </div>
      )}

      {view === 'curva' && <CurvaFisicaView obra={obra} />}

      {view === 'lista' && (
        <ListaInterativa
          etapas={etapas}
          onCommit={commit}
          customCols={customCols}
          onCustomColsChange={setCustomCols}
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
    </>
  );
};

Object.assign(window, { CronogramaFull, GanttInterativo, GanttElegante: GanttInterativo });
