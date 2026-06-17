import React from 'react';
import { fluxoService } from './fluxo.service';

const GROUP_PALETTE = [
  '#2563eb', '#ef4444', '#16a34a', '#7c3aed',
  '#d97706', '#0891b2', '#ec4899', '#374151',
];

const BRAND = '#014386'; // azul institucional (alinhado ao var(--brand) do app)
const DEP_TIPOS = [
  { v: 'TI', l: 'Término → Início (TI)' },
  { v: 'II', l: 'Início → Início (II)' },
  { v: 'TT', l: 'Término → Término (TT)' },
  { v: 'IT', l: 'Início → Término (IT)' },
];

const CARD_W   = 280;
const CARD_H   = 168;
const CANVAS_W = 4000;
const CANVAS_H = 3000;

const PORTS = ['top', 'right', 'bottom', 'left'];

const getConnPoint = (card, port) => {
  if (port === 'top')    return { x: card.x + CARD_W / 2, y: card.y };
  if (port === 'right')  return { x: card.x + CARD_W,     y: card.y + CARD_H / 2 };
  if (port === 'bottom') return { x: card.x + CARD_W / 2, y: card.y + CARD_H };
  return                        { x: card.x,               y: card.y + CARD_H / 2 };
};

const portStyle = (port) => {
  if (port === 'top')    return { left: CARD_W / 2 - 7, top: -7 };
  if (port === 'right')  return { right: -7, top: CARD_H / 2 - 7 };
  if (port === 'bottom') return { left: CARD_W / 2 - 7, bottom: -7 };
  return                        { left: -7, top: CARD_H / 2 - 7 };
};

const getBestPorts = (sc, tc) => {
  const dx = (tc.x + CARD_W / 2) - (sc.x + CARD_W / 2);
  const dy = (tc.y + CARD_H / 2) - (sc.y + CARD_H / 2);
  if (Math.abs(dx) >= Math.abs(dy))
    return dx >= 0 ? { sp: 'right', tp: 'left' } : { sp: 'left', tp: 'right' };
  return dy >= 0 ? { sp: 'bottom', tp: 'top' } : { sp: 'top', tp: 'bottom' };
};

// Retorna pontos de controle do bezier, com offset opcional para ajuste da curva
const getBezierPoints = (sp, s, tp, t, bendOffset = { dx: 0, dy: 0 }) => {
  const off = Math.max(50, (Math.abs(t.x - s.x) + Math.abs(t.y - s.y)) * 0.38);
  const cp1 = {
    x: s.x + (sp === 'right' ? off : sp === 'left' ? -off : 0) + bendOffset.dx,
    y: s.y + (sp === 'bottom' ? off : sp === 'top' ? -off : 0) + bendOffset.dy,
  };
  const cp2 = {
    x: t.x + (tp === 'left' ? -off : tp === 'right' ? off : 0) + bendOffset.dx,
    y: t.y + (tp === 'top' ? -off : tp === 'bottom' ? off : 0) + bendOffset.dy,
  };
  return { p0: s, cp1, cp2, p3: t };
};

const makeBezierD = ({ p0, cp1, cp2, p3 }) =>
  `M ${p0.x} ${p0.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p3.x} ${p3.y}`;

// Porta do card mais próxima de um ponto (cx, cy) em coordenadas do canvas
const getNearestPort = (card, cx, cy) => {
  const pts = {
    top:    { x: card.x + CARD_W / 2, y: card.y },
    right:  { x: card.x + CARD_W,     y: card.y + CARD_H / 2 },
    bottom: { x: card.x + CARD_W / 2, y: card.y + CARD_H },
    left:   { x: card.x,              y: card.y + CARD_H / 2 },
  };
  return Object.entries(pts).reduce((best, [port, pos]) => {
    const d = Math.hypot(cx - pos.x, cy - pos.y);
    return d < best.d ? { port, d } : best;
  }, { port: 'right', d: Infinity }).port;
};

// Ponto médio de bezier cúbica em t=0.5
const bezierMid = ({ p0, cp1, cp2, p3 }) => ({
  x: 0.125 * p0.x + 0.375 * cp1.x + 0.375 * cp2.x + 0.125 * p3.x,
  y: 0.125 * p0.y + 0.375 * cp1.y + 0.375 * cp2.y + 0.125 * p3.y,
});

const DonutProgress = ({ pct, color }) => {
  const r = 26, circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0 }}>
      {/* pointerEvents:none para não interceptar eventos de drag na área do card */}
      <svg width={68} height={68} viewBox="0 0 68 68" style={{ pointerEvents: 'none' }}>
        <circle cx={34} cy={34} r={r} fill="none" stroke="#e5e7eb" strokeWidth={7} />
        {pct > 0 && (
          <circle cx={34} cy={34} r={r} fill="none" stroke={color} strokeWidth={7}
            strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
            style={{ transform: 'rotate(-90deg)', transformOrigin: '34px 34px' }} />
        )}
        <text x={34} y={38} textAnchor="middle" fontSize={12} fontWeight="700"
          fill={pct > 0 ? color : '#9ca3af'}>{pct}%</text>
      </svg>
      <span style={{ fontSize: 9.5, color: '#9ca3af' }}>Concluído</span>
    </div>
  );
};

function statusLabel(s) {
  return s === 'done' ? 'Concluída' : s === 'late' ? 'Atrasada' : s === 'upcoming' ? 'Futura' : 'Em andamento';
}

export const FluxoExecutivo = ({ etapas, onCommit, obraId }) => {
  const [cards, setCards] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem(`fluxo_cards_${obraId}`) || '[]'); }
    catch { return []; }
  });

  const [pan,         setPan]         = React.useState({ x: 80, y: 60 });
  const [zoom,        setZoom]        = React.useState(0.9);
  const [dragging,    setDragging]    = React.useState(null);
  const [panning,     setPanning]     = React.useState(null);
  const [connecting,  setConnecting]  = React.useState(null);
  const [selCard,     setSelCard]     = React.useState(null);
  const [hoveredCard, setHoveredCard] = React.useState(null);
  const [selLink,     setSelLink]     = React.useState(null); // { sourceId, targetId }
  const [cardMenu,    setCardMenu]    = React.useState(null); // taskId com menu aberto
  const [cardEdit,    setCardEdit]    = React.useState(null); // { taskId, etapa, avanco, dur, status }
  const [eapSearch,   setEapSearch]   = React.useState('');
  const [selTab,       setSelTab]      = React.useState('resumo'); // 'resumo' | 'subtarefas' | 'dependencias'
  const [linkOffsets,  setLinkOffsets] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem(`fluxo_offsets_${obraId}`) || '{}'); }
    catch { return {}; }
  });
  const [linkPorts,    setLinkPorts]   = React.useState(() => {
    try { return JSON.parse(localStorage.getItem(`fluxo_ports_${obraId}`) || '{}'); }
    catch { return {}; }
  });
  const [draggingLink, setDraggingLink] = React.useState(null); // { key, sx, sy, odx, ody }
  const [autoLinkSel,  setAutoLinkSel]  = React.useState(() => new Set()); // subtarefas marcadas p/ vínculo

  // Resetar aba e seleção de subtarefas ao trocar o card selecionado
  React.useEffect(() => {
    setSelTab('resumo');
    setAutoLinkSel(new Set(etapas.filter(e => e.parentId === selCard).map(e => e.id)));
  }, [selCard]); // eslint-disable-line react-hooks/exhaustive-deps

  const containerRef = React.useRef(null);

  // Refs com os valores atuais: deixam os listeners globais (mousemove/up) com deps
  // estáveis, evitando re-subscrever a cada frame durante drag/pan.
  const zoomRef         = React.useRef(zoom);
  const panRef          = React.useRef(pan);
  const cardsRef        = React.useRef(cards);
  const etapasRef       = React.useRef(etapas);
  const draggingRef     = React.useRef(dragging);
  const panningRef      = React.useRef(panning);
  const connectingRef   = React.useRef(connecting);
  const draggingLinkRef = React.useRef(draggingLink);
  const createLinkRef   = React.useRef(null);
  zoomRef.current         = zoom;
  panRef.current          = pan;
  cardsRef.current        = cards;
  etapasRef.current       = etapas;
  draggingRef.current     = dragging;
  panningRef.current      = panning;
  connectingRef.current   = connecting;
  draggingLinkRef.current = draggingLink;

  // Persiste offsets de curva e portas no localStorage
  React.useEffect(() => {
    try { localStorage.setItem(`fluxo_offsets_${obraId}`, JSON.stringify(linkOffsets)); }
    catch {}
  }, [linkOffsets, obraId]);

  React.useEffect(() => {
    try { localStorage.setItem(`fluxo_ports_${obraId}`, JSON.stringify(linkPorts)); }
    catch {}
  }, [linkPorts, obraId]);

  React.useEffect(() => {
    try { localStorage.setItem(`fluxo_cards_${obraId}`, JSON.stringify(cards)); }
    catch {}
  }, [cards, obraId]);

  // ── Persistência no banco (Supabase); localStorage segue como cache/fallback ──
  // Se a tabela ainda não existir (migration não aplicada pelo TI), os erros são
  // ignorados e tudo continua funcionando só no localStorage.
  const dbLoadedRef = React.useRef(false);
  React.useEffect(() => {
    dbLoadedRef.current = false;
    let cancel = false;
    fluxoService.carregar(obraId).then(({ data, error }) => {
      if (cancel) return;
      if (!error && data) {
        if (Array.isArray(data.cards)) setCards(data.cards);
        if (data.link_offsets) setLinkOffsets(data.link_offsets);
        if (data.link_ports) setLinkPorts(data.link_ports);
      }
      dbLoadedRef.current = true;
    }).catch(() => { dbLoadedRef.current = true; });
    return () => { cancel = true; };
  }, [obraId]);

  React.useEffect(() => {
    if (!dbLoadedRef.current) return; // não grava antes de carregar do banco
    const t = setTimeout(() => {
      fluxoService.salvar(obraId, { cards, linkOffsets, linkPorts }).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [cards, linkOffsets, linkPorts, obraId]);

  React.useEffect(() => {
    const ids = new Set(etapas.map(e => e.id));
    setCards(prev => prev.filter(c => ids.has(c.taskId)));
  }, [etapas]);

  // Fechar menu suspenso ao clicar fora
  React.useEffect(() => {
    if (!cardMenu) return;
    const close = () => setCardMenu(null);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [cardMenu]);

  // Delete/Backspace remove link selecionado
  React.useEffect(() => {
    const onKey = (ev) => {
      if ((ev.key === 'Delete' || ev.key === 'Backspace') && selLink && ev.target === document.body) {
        removeLink(selLink.sourceId, selLink.targetId);
        setSelLink(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selLink, etapas]);

  const cardIds      = React.useMemo(() => new Set(cards.map(c => c.taskId)), [cards]);
  const summaryTasks = React.useMemo(() => etapas.filter(e => e.isGroup), [etapas]);

  const groupColorMap = React.useMemo(() => {
    const byId = {};
    etapas.forEach(e => { byId[e.id] = e; });
    const groupColor = {};
    let ci = 0;
    etapas.forEach(e => { if (e.isGroup) groupColor[e.id] = GROUP_PALETTE[ci++ % GROUP_PALETTE.length]; });
    const result = {};
    etapas.forEach(e => {
      if (groupColor[e.id] !== undefined) { result[e.id] = groupColor[e.id]; return; }
      let cur = byId[e.parentId];
      const seen = new Set([e.id]);
      while (cur && !seen.has(cur.id)) {
        seen.add(cur.id);
        if (groupColor[cur.id] !== undefined) { result[e.id] = groupColor[cur.id]; return; }
        cur = byId[cur.parentId];
      }
      result[e.id] = GROUP_PALETTE[ci++ % GROUP_PALETTE.length];
    });
    return result;
  }, [etapas]);

  const links = React.useMemo(() => {
    const result = [];
    etapas.forEach(e => {
      if (!cardIds.has(e.id)) return;
      (e.dep || []).forEach(d => {
        if (cardIds.has(d.id)) result.push({ sourceId: d.id, targetId: e.id });
      });
    });
    return result;
  }, [etapas, cardIds]);

  const cardById = React.useMemo(() => new Map(cards.map(c => [c.taskId, c])), [cards]);
  const taskById = React.useMemo(() => new Map(etapas.map(e => [e.id, e])), [etapas]);
  const getCard = (id) => cardById.get(id);
  const getTask = (id) => taskById.get(id);

  const clientToCanvas = (cx, cy) => {
    const rect = containerRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
    return { x: (cx - rect.left - pan.x) / zoom, y: (cy - rect.top - pan.y) / zoom };
  };

  const addCard = (taskId) => {
    if (cardIds.has(taskId)) {
      setSelCard(taskId);
      const c = getCard(taskId);
      if (c && containerRef.current) {
        const cW = containerRef.current.clientWidth;
        const cH = containerRef.current.clientHeight;
        setPan({ x: cW / 2 - (c.x + CARD_W / 2) * zoom, y: cH / 2 - (c.y + CARD_H / 2) * zoom });
      }
      return;
    }
    const rect = containerRef.current?.getBoundingClientRect() ?? { width: 800, height: 600 };
    const cx = (rect.width  / 2 - pan.x) / zoom;
    const cy = (rect.height / 2 - pan.y) / zoom;
    const existing = cards.length;
    setCards(prev => [...prev, { taskId, x: cx - CARD_W / 2 + existing * 24, y: cy - CARD_H / 2 + existing * 24 }]);
    setSelCard(taskId);
  };

  const removeCard = (taskId) => {
    setCards(prev => prev.filter(c => c.taskId !== taskId));
    if (selCard === taskId) setSelCard(null);
    setCardMenu(null);
  };

  const openEditCard = (taskId) => {
    const task = getTask(taskId);
    if (!task) return;
    setCardEdit({ taskId, etapa: task.etapa, avanco: task.avanco ?? 0, dur: task.dur ?? 1, status: task.status ?? 'ongoing' });
    setCardMenu(null);
  };

  const saveEditCard = () => {
    if (!cardEdit) return;
    const avanco = Math.min(100, Math.max(0, parseInt(cardEdit.avanco) || 0));
    const dur    = Math.max(1, parseInt(cardEdit.dur) || 1);
    onCommit(etapas.map(e =>
      e.id === cardEdit.taskId
        ? { ...e, etapa: cardEdit.etapa.trim() || e.etapa, avanco, dur, status: cardEdit.status }
        : e
    ));
    setCardEdit(null);
  };

  const createLink = (sourceId, targetId) => {
    if (sourceId === targetId) return;
    const eps = etapasRef.current;
    const target = eps.find(e => e.id === targetId);
    if (!target) return;
    if ((target.dep || []).some(d => d.id === sourceId)) return;
    onCommit(eps.map(e =>
      e.id === targetId ? { ...e, dep: [...(e.dep || []), { id: sourceId, tipo: 'TI', lag: 0 }] } : e
    ));
  };
  createLinkRef.current = createLink;

  const removeLink = (sourceId, targetId) => {
    const key = `${sourceId}→${targetId}`;
    setLinkOffsets(prev => { const n = { ...prev }; delete n[key]; return n; });
    setLinkPorts(prev => { const n = { ...prev }; delete n[key]; return n; });
    onCommit(etapas.map(e =>
      e.id === targetId ? { ...e, dep: (e.dep || []).filter(d => d.id !== sourceId) } : e
    ));
  };

  const lkKey = (sourceId, targetId) => `${sourceId}→${targetId}`;

  // Geometria de cada link calculada uma vez e reaproveitada pelas duas camadas SVG.
  const linkGeoms = React.useMemo(() => links.map(lk => {
    const sc = cardById.get(lk.sourceId), tc = cardById.get(lk.targetId);
    if (!sc || !tc) return null;
    const key = lkKey(lk.sourceId, lk.targetId);
    const { sp, tp } = linkPorts[key] || getBestPorts(sc, tc);
    const sr = getConnPoint(sc, sp), tl = getConnPoint(tc, tp);
    const bend = linkOffsets[key] || { dx: 0, dy: 0 };
    return { lk, key, d: makeBezierD(getBezierPoints(sp, sr, tp, tl, bend)) };
  }).filter(Boolean), [links, cardById, linkPorts, linkOffsets]);

  React.useEffect(() => {
    let raf = null, lastEv = null;
    const apply = () => {
      raf = null;
      const ev = lastEv; if (!ev) return;
      const zoom = zoomRef.current;
      const dragging = draggingRef.current, panning = panningRef.current;
      const connecting = connectingRef.current, draggingLink = draggingLinkRef.current;
      if (dragging) {
        const dx = (ev.clientX - dragging.sx) / zoom;
        const dy = (ev.clientY - dragging.sy) / zoom;
        setCards(prev => prev.map(c =>
          c.taskId === dragging.cardId ? { ...c, x: dragging.ox + dx, y: dragging.oy + dy } : c
        ));
      }
      if (panning) setPan({ x: panning.opx + (ev.clientX - panning.sx), y: panning.opy + (ev.clientY - panning.sy) });
      if (connecting) setConnecting(prev => prev ? { ...prev, cx: ev.clientX, cy: ev.clientY } : null);
      if (draggingLink) {
        const dx = (ev.clientX - draggingLink.sx) / zoom;
        const dy = (ev.clientY - draggingLink.sy) / zoom;
        setLinkOffsets(prev => ({ ...prev, [draggingLink.key]: { dx: draggingLink.odx + dx, dy: draggingLink.ody + dy } }));
      }
    };
    const onMove = (ev) => {
      if (!draggingRef.current && !panningRef.current && !connectingRef.current && !draggingLinkRef.current) return;
      lastEv = ev;
      if (raf == null) raf = requestAnimationFrame(apply);
    };
    const onUp = (ev) => {
      if (raf != null) { cancelAnimationFrame(raf); raf = null; }
      const connecting = connectingRef.current;
      draggingRef.current = null; panningRef.current = null; draggingLinkRef.current = null;
      setDragging(null); setPanning(null); setDraggingLink(null);
      if (connecting) {
        // Snap-to-card: converte posição do mouse para coordenadas do canvas
        const zoom = zoomRef.current, pan = panRef.current, cards = cardsRef.current;
        const rect = containerRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
        const cx = (ev.clientX - rect.left - pan.x) / zoom;
        const cy = (ev.clientY - rect.top  - pan.y) / zoom;
        const PAD = 40; // pixels de tolerância além da borda do card
        let snapTarget = null, minDist = Infinity;
        cards.forEach(c => {
          if (c.taskId === connecting.sourceId) return;
          if (cx >= c.x - PAD && cx <= c.x + CARD_W + PAD && cy >= c.y - PAD && cy <= c.y + CARD_H + PAD) {
            const dist = Math.hypot(cx - (c.x + CARD_W / 2), cy - (c.y + CARD_H / 2));
            if (dist < minDist) { minDist = dist; snapTarget = c.taskId; }
          }
        });
        if (snapTarget) {
          const tc = cards.find(c => c.taskId === snapTarget);
          const tp = getNearestPort(tc, cx, cy);  // porta do destino mais próxima do mouse
          const sp = connecting.sourcePort || 'right';
          const key = lkKey(connecting.sourceId, snapTarget);
          setLinkPorts(prev => ({ ...prev, [key]: { sp, tp } }));
          createLinkRef.current(connecting.sourceId, snapTarget);
        } else {
          // Fallback: porta exata se o usuário acertou o ponto de conexão diretamente
          const el = document.elementFromPoint(ev.clientX, ev.clientY);
          const target = el?.closest('[data-conn-in]');
          if (target) createLinkRef.current(connecting.sourceId, target.getAttribute('data-conn-in'));
        }
        setConnecting(null);
      }
    };
    window.addEventListener('pointermove',   onMove);
    window.addEventListener('pointerup',     onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove',   onMove);
      window.removeEventListener('pointerup',     onUp);
      window.removeEventListener('pointercancel', onUp);
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onWheel = React.useCallback((ev) => {
    ev.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
    const factor = ev.deltaY < 0 ? 1.1 : 0.9;
    setZoom(z => {
      const nz = Math.min(2, Math.max(0.2, z * factor));
      setPan(p => ({ x: mx - (mx - p.x) * (nz / z), y: my - (my - p.y) * (nz / z) }));
      return nz;
    });
  }, []);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  const autoLayout = (dir) => {
    if (dir === 'dep') { autoLayoutDeps(); return; }
    const gap = dir === 'h' ? CARD_W + 80 : CARD_H + 60;
    setCards(prev => prev.map((c, i) => ({
      ...c, x: dir === 'h' ? 80 + i * gap : 80, y: dir === 'h' ? 80 : 80 + i * gap,
    })));
  };

  // Layout em camadas: nível = caminho mais longo a partir das raízes (topológico),
  // x por nível e y por ordem dentro do nível. Protegido contra ciclos.
  const autoLayoutDeps = () => {
    const ids = cards.map(c => c.taskId);
    const idSet = new Set(ids);
    const preds = {};
    ids.forEach(id => { preds[id] = []; });
    links.forEach(l => { if (idSet.has(l.sourceId) && idSet.has(l.targetId)) preds[l.targetId].push(l.sourceId); });
    const level = {}, visiting = new Set();
    const calcLevel = (id) => {
      if (level[id] !== undefined) return level[id];
      if (visiting.has(id)) return 0; // ciclo: corta
      visiting.add(id);
      const ps = preds[id] || [];
      const lv = ps.length ? Math.max(...ps.map(p => calcLevel(p) + 1)) : 0;
      visiting.delete(id);
      level[id] = lv;
      return lv;
    };
    ids.forEach(calcLevel);
    const byLevel = {};
    ids.forEach(id => { (byLevel[level[id]] = byLevel[level[id]] || []).push(id); });
    const COL = CARD_W + 90, ROW = CARD_H + 50, pos = {};
    Object.keys(byLevel).map(Number).sort((a, b) => a - b).forEach(lv => {
      byLevel[lv].forEach((id, row) => { pos[id] = { x: 80 + lv * COL, y: 60 + row * ROW }; });
    });
    setCards(prev => prev.map(c => pos[c.taskId] ? { ...c, x: pos[c.taskId].x, y: pos[c.taskId].y } : c));
  };

  const fitToScreen = () => {
    if (!cards.length || !containerRef.current) return;
    const minX = Math.min(...cards.map(c => c.x)), minY = Math.min(...cards.map(c => c.y));
    const maxX = Math.max(...cards.map(c => c.x + CARD_W)), maxY = Math.max(...cards.map(c => c.y + CARD_H));
    const cW = containerRef.current.clientWidth, cH = containerRef.current.clientHeight;
    const nz = Math.min(1.2, Math.min(cW / (maxX - minX + 120), cH / (maxY - minY + 120)));
    setZoom(nz);
    setPan({ x: -minX * nz + 60, y: -minY * nz + 40 });
  };

  const selTask  = selCard ? getTask(selCard) : null;
  const subtasks = selTask ? etapas.filter(e => e.parentId === selTask.id) : [];
  const outLinks = selTask ? links.filter(l => l.sourceId === selTask.id) : [];
  const inLinks  = selTask ? links.filter(l => l.targetId === selTask.id) : [];

  // Cria dependências TI encadeando as subtarefas selecionadas na ordem da lista
  const vincularSequencia = () => {
    const ordered = subtasks.filter(s => autoLinkSel.has(s.id));
    if (ordered.length < 2) return;
    let novas = etapas, count = 0;
    for (let i = 1; i < ordered.length; i++) {
      const src = ordered[i - 1].id, tgt = ordered[i].id;
      const t = novas.find(e => e.id === tgt);
      if ((t.dep || []).some(d => d.id === src)) continue;
      novas = novas.map(e => e.id === tgt ? { ...e, dep: [...(e.dep || []), { id: src, tipo: 'TI', lag: 0 }] } : e);
      count++;
    }
    if (count > 0) onCommit(novas);
  };

  // Lê / atualiza tipo e folga (lag) de uma dependência existente
  const getDep = (sourceId, targetId) => {
    const t = taskById.get(targetId);
    return (t?.dep || []).find(d => d.id === sourceId) || { tipo: 'TI', lag: 0 };
  };
  const updateLink = (sourceId, targetId, patch) => {
    onCommit(etapasRef.current.map(e =>
      e.id === targetId ? { ...e, dep: (e.dep || []).map(d => d.id === sourceId ? { ...d, ...patch } : d) } : e
    ));
  };

  const tempArrow = (() => {
    if (!connecting) return null;
    const sc = getCard(connecting.sourceId);
    if (!sc) return null;
    const sp = connecting.sourcePort || 'right';
    const sr = getConnPoint(sc, sp);
    const tp = clientToCanvas(connecting.cx, connecting.cy);
    const off = Math.max(50, (Math.abs(tp.x - sr.x) + Math.abs(tp.y - sr.y)) * 0.38);
    const cpSx = sr.x + (sp === 'right' ? off : sp === 'left' ? -off : 0);
    const cpSy = sr.y + (sp === 'bottom' ? off : sp === 'top' ? -off : 0);
    return `M ${sr.x} ${sr.y} C ${cpSx} ${cpSy}, ${tp.x} ${tp.y}, ${tp.x} ${tp.y}`;
  })();

  const filteredSummary = summaryTasks.filter(t =>
    t.etapa.toLowerCase().includes(eapSearch.toLowerCase())
  );

  const menuItemStyle = {
    display: 'block', width: '100%', padding: '8px 14px',
    border: 'none', background: 'none', cursor: 'pointer',
    textAlign: 'left', fontSize: 12.5, color: 'var(--text)',
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 210px)', minHeight: 400, gap: 8, padding: 8 }}>

      {/* ── Painel EAP esquerdo ──────────────────────────────────── */}
      <div style={{ width: 240, flexShrink: 0, background: 'var(--surface)', display: 'flex', flexDirection: 'column', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ padding: '13px 14px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13.5, color: 'var(--text)' }}>
          Adicionar Card
        </div>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--surface-muted)', borderRadius: 8, padding: '6px 10px', border: '1px solid var(--border)' }}>
            <svg width={13} height={13} viewBox="0 0 20 20" fill="none" stroke="var(--text-faint)" strokeWidth={2.2}>
              <circle cx={8} cy={8} r={6} /><path d="M14 14l4 4" strokeLinecap="round" />
            </svg>
            <input value={eapSearch} onChange={e => setEapSearch(e.target.value)} placeholder="Digite para buscar..."
              style={{ border: 'none', background: 'none', outline: 'none', fontSize: 12, color: 'var(--text)', width: '100%' }} />
          </div>
        </div>
        <div style={{ padding: '7px 14px 3px', fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Tarefas Resumo (EAP)
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {filteredSummary.map((task, idx) => {
            const gc = groupColorMap[task.id] || '#014386';
            const onCanvas = cardIds.has(task.id);
            return (
              <div key={task.id} onClick={() => addCard(task.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 8px', borderRadius: 9, border: `1px solid ${gc}28`, borderLeft: `3px solid ${gc}`, padding: '8px 10px 8px 12px', cursor: 'pointer', background: onCanvas ? `${gc}08` : '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', transition: 'all 0.12s' }}
                onMouseEnter={e => { e.currentTarget.style.background = `${gc}14`; e.currentTarget.style.boxShadow = '0 2px 7px rgba(0,0,0,0.09)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = onCanvas ? `${gc}08` : '#fff'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'; }}>
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {idx + 1}. {task.etapa}
                </span>
                <div style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: onCanvas ? gc : 'transparent', border: `1.5px solid ${onCanvas ? gc : 'var(--border)'}`, color: onCanvas ? '#fff' : gc, fontSize: onCanvas ? 12 : 16, fontWeight: 700, transition: 'all 0.15s' }}>
                  {onCanvas ? '✓' : '+'}
                </div>
              </div>
            );
          })}
          {filteredSummary.length === 0 && (
            <div style={{ padding: '24px 14px', fontSize: 12, color: 'var(--text-faint)', textAlign: 'center' }}>Nenhuma tarefa encontrada</div>
          )}
        </div>
        <div style={{ padding: '9px 12px', borderTop: '1px solid var(--border)', background: 'var(--surface-muted)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <span style={{ color: '#014386', fontSize: 12, flexShrink: 0 }}>ℹ</span>
          <span style={{ fontSize: 11, color: '#014386', lineHeight: 1.4 }}>Selecione uma tarefa resumo para adicionar ao fluxo</span>
        </div>
      </div>

      {/* ── Canvas area ──────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 600 }}>Organizar:</span>
          <button className="btn btn-ghost" style={{ fontSize: 12, height: 28 }} onClick={() => autoLayout('h')}>→ Horizontal</button>
          <button className="btn btn-ghost" style={{ fontSize: 12, height: 28 }} onClick={() => autoLayout('v')}>↓ Vertical</button>
          <button className="btn btn-ghost" style={{ fontSize: 12, height: 28 }} onClick={() => autoLayout('dep')}>⤳ Por dependências</button>
          <div style={{ flex: 1 }} />
          {cards.length > 0 && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{cards.length} cards · {links.length} conexões</span>}
          {selLink && <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>Conexão selecionada — pressione Delete para remover</span>}
          <button className="btn btn-ghost" style={{ fontSize: 12, height: 28 }} onClick={fitToScreen}>⊡ Ajustar tela</button>
          <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', height: 28 }}>
            <button onClick={() => setZoom(z => Math.max(0.2, +(z - 0.1).toFixed(2)))} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '0 8px', fontSize: 15, color: 'var(--text)', height: '100%' }}>−</button>
            <span style={{ fontSize: 11, minWidth: 38, textAlign: 'center', color: 'var(--text-faint)', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)', padding: '0 4px', lineHeight: '28px' }}>{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(2, +(z + 0.1).toFixed(2)))} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '0 8px', fontSize: 15, color: 'var(--text)', height: '100%' }}>+</button>
          </div>
        </div>

        {/* Canvas */}
        <div ref={containerRef}
          style={{ flex: 1, overflow: 'hidden', position: 'relative', background: '#f0f4f9', cursor: panning ? 'grabbing' : connecting ? 'crosshair' : 'grab', touchAction: 'none' }}
          onPointerDown={(ev) => {
            if (ev.button !== 0 || connecting) return;
            const tag = ev.target.tagName;
            if (ev.target === containerRef.current || tag === 'svg' || tag === 'rect') {
              setSelCard(null);
              setSelLink(null);
              setCardMenu(null);
              const p = { sx: ev.clientX, sy: ev.clientY, opx: pan.x, opy: pan.y };
              panningRef.current = p;
              setPanning(p);
            }
          }}
        >
          {/* Dot grid */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            <defs>
              <pattern id="fe-grid" x={pan.x % (24 * zoom)} y={pan.y % (24 * zoom)} width={24 * zoom} height={24 * zoom} patternUnits="userSpaceOnUse">
                <circle cx={1} cy={1} r={0.9} fill="rgba(0,0,0,0.09)" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#fe-grid)" />
          </svg>

          {cards.length === 0 && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <div style={{ fontSize: 42, marginBottom: 12, opacity: 0.18 }}>⬡</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-faint)', marginBottom: 6 }}>Canvas vazio</div>
              <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>Clique no "+" do painel esquerdo para adicionar tarefas</div>
            </div>
          )}

          {/* Transform layer */}
          <div style={{ position: 'absolute', transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', width: CANVAS_W, height: CANVAS_H }}>

            {/* SVG visual (setas, pointerEvents:none) */}
            <svg style={{ position: 'absolute', top: 0, left: 0, width: CANVAS_W, height: CANVAS_H, overflow: 'visible', pointerEvents: 'none' }}>
              <defs>
                <marker id="fe-arrow" markerWidth="9" markerHeight="9" refX="7" refY="3.5" orient="auto">
                  <path d="M0,0 L0,7 L9,3.5 z" fill="#9ca3af" />
                </marker>
                <marker id="fe-arrow-sel" markerWidth="9" markerHeight="9" refX="7" refY="3.5" orient="auto">
                  <path d="M0,0 L0,7 L9,3.5 z" fill="#014386" />
                </marker>
                <marker id="fe-arrow-del" markerWidth="9" markerHeight="9" refX="7" refY="3.5" orient="auto">
                  <path d="M0,0 L0,7 L9,3.5 z" fill="#ef4444" />
                </marker>
              </defs>
              {linkGeoms.map(({ lk, key, d }) => {
                const isLinkSel = selLink?.sourceId === lk.sourceId && selLink?.targetId === lk.targetId;
                const isCardSel = selCard === lk.sourceId || selCard === lk.targetId;
                const stroke = isLinkSel ? '#ef4444' : isCardSel ? '#014386' : '#9ca3af';
                const marker = isLinkSel ? 'url(#fe-arrow-del)' : isCardSel ? 'url(#fe-arrow-sel)' : 'url(#fe-arrow)';
                return (
                  <path key={key} d={d} fill="none"
                    stroke={stroke} strokeWidth={isLinkSel || isCardSel ? 2.5 : 2}
                    markerEnd={marker} />
                );
              })}
              {tempArrow && (
                <path d={tempArrow} fill="none" stroke="#014386"
                  strokeWidth={2} strokeDasharray="7 4" markerEnd="url(#fe-arrow-sel)" />
              )}
            </svg>

            {/* SVG hitbox (setas clicáveis, área ampla transparente) */}
            <svg style={{ position: 'absolute', top: 0, left: 0, width: CANVAS_W, height: CANVAS_H, overflow: 'visible' }}>
              {linkGeoms.map(({ lk, key, d }) => (
                <path key={key} d={d} fill="none"
                  stroke="rgba(0,0,0,0)" strokeWidth={18}
                  style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                  onPointerDown={(ev) => { ev.stopPropagation(); }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    const isAlreadySel = selLink?.sourceId === lk.sourceId && selLink?.targetId === lk.targetId;
                    setSelLink(isAlreadySel ? null : { sourceId: lk.sourceId, targetId: lk.targetId });
                    setSelCard(null);
                  }}
                />
              ))}
            </svg>

            {/* Handle de ajuste de curva + botão X (visíveis quando seta está selecionada) */}
            {selLink && (() => {
              const sc = getCard(selLink.sourceId), tc = getCard(selLink.targetId);
              if (!sc || !tc) return null;
              const stored = linkPorts[lkKey(selLink.sourceId, selLink.targetId)];
              const { sp, tp } = stored || getBestPorts(sc, tc);
              const sr = getConnPoint(sc, sp), tl = getConnPoint(tc, tp);
              const bend = linkOffsets[lkKey(selLink.sourceId, selLink.targetId)] || { dx: 0, dy: 0 };
              const pts  = getBezierPoints(sp, sr, tp, tl, bend);
              const mid  = bezierMid(pts);
              const key  = lkKey(selLink.sourceId, selLink.targetId);
              const hasBend = bend.dx !== 0 || bend.dy !== 0;
              return (
                <>
                  {/* Handle azul arrastável para ajustar a curva */}
                  <div
                    title="Arraste para ajustar a curva"
                    style={{ position: 'absolute', left: mid.x - 11, top: mid.y - 11, width: 22, height: 22, borderRadius: '50%', background: '#014386', border: '2.5px solid #fff', cursor: 'move', zIndex: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(1,67,134,0.45)', userSelect: 'none', touchAction: 'none' }}
                    onPointerDown={(ev) => {
                      ev.stopPropagation();
                      const dl = { key, sx: ev.clientX, sy: ev.clientY, odx: bend.dx, ody: bend.dy };
                      draggingLinkRef.current = dl;
                      setDraggingLink(dl);
                    }}
                    onDoubleClick={(ev) => {
                      // Duplo clique reseta a curva para o padrão
                      ev.stopPropagation();
                      setLinkOffsets(prev => { const n = { ...prev }; delete n[key]; return n; });
                    }}
                  >
                    <svg width={10} height={10} viewBox="0 0 10 10" style={{ pointerEvents: 'none' }}>
                      <circle cx={5} cy={5} r={3} fill="none" stroke="#fff" strokeWidth={1.5} />
                    </svg>
                  </div>
                  {/* Botão × para remover — posicionado 20px acima do handle */}
                  <div
                    title="Remover conexão"
                    style={{ position: 'absolute', left: mid.x + 14, top: mid.y - 22, width: 20, height: 20, borderRadius: '50%', background: '#ef4444', cursor: 'pointer', zIndex: 23, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13, boxShadow: '0 2px 6px rgba(239,68,68,0.4)', userSelect: 'none' }}
                    onPointerDown={(ev) => ev.stopPropagation()}
                    onClick={(ev) => { ev.stopPropagation(); removeLink(selLink.sourceId, selLink.targetId); setSelLink(null); }}
                  >×</div>
                  {/* Indicador visual de que a curva foi ajustada */}
                  {hasBend && (
                    <div
                      title="Duplo clique no handle para resetar"
                      style={{ position: 'absolute', left: mid.x - 4, top: mid.y + 15, fontSize: 9, color: '#014386', background: 'var(--surface-muted)', borderRadius: 4, padding: '1px 4px', pointerEvents: 'none', whiteSpace: 'nowrap', fontWeight: 600 }}>
                      ajustado
                    </div>
                  )}
                </>
              );
            })()}

            {/* Cards */}
            {cards.map(card => {
              const task = getTask(card.taskId);
              if (!task) return null;
              const gc        = groupColorMap[card.taskId] || '#014386';
              const subs      = etapas.filter(e => e.parentId === card.taskId);
              const subGroups = subs.filter(e => e.isGroup);
              const isSel     = selCard === card.taskId;
              const isHov     = hoveredCard === card.taskId;
              const showPorts = isSel || isHov || connecting?.sourceId === card.taskId;
              const groupNum  = summaryTasks.findIndex(t => t.id === card.taskId) + 1;
              const isMenuOpen = cardMenu === card.taskId;

              return (
                <div key={card.taskId}
                  style={{ position: 'absolute', left: card.x, top: card.y, width: CARD_W, height: CARD_H, background: '#fff', borderRadius: 14, border: `1.5px solid ${isSel ? gc : `${gc}50`}`, boxShadow: isSel ? `0 0 0 3px ${gc}20, 0 6px 20px rgba(0,0,0,0.10)` : '0 2px 12px rgba(0,0,0,0.07)', userSelect: 'none', cursor: 'grab', overflow: 'visible', transition: 'border-color 0.15s, box-shadow 0.15s', touchAction: 'none' }}
                  onMouseEnter={() => setHoveredCard(card.taskId)}
                  onMouseLeave={() => setHoveredCard(null)}
                  onPointerDown={(ev) => {
                    if (ev.button !== 0) return;
                    ev.stopPropagation();
                    setSelLink(null);
                    const c = getCard(card.taskId);
                    const d = { cardId: card.taskId, sx: ev.clientX, sy: ev.clientY, ox: c.x, oy: c.y };
                    draggingRef.current = d;
                    setDragging(d);
                    setSelCard(card.taskId);
                  }}
                  onClick={(ev) => { ev.stopPropagation(); setSelCard(card.taskId); }}
                >
                  {/* Header pastel */}
                  <div style={{ background: `${gc}16`, borderRadius: '12px 12px 0 0', borderBottom: `1px solid ${gc}28`, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 9, height: 52 }}>
                    {/* Número dentro do quadrado colorido */}
                    <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: gc, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 14, letterSpacing: '-0.5px' }}>
                      {groupNum}
                    </div>
                    <span style={{ flex: 1, fontWeight: 700, fontSize: 12.5, color: gc, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {task.etapa}
                    </span>
                    {/* Menu suspenso ⋮ */}
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <button
                        onPointerDown={(ev) => ev.stopPropagation()}
                        onClick={(ev) => { ev.stopPropagation(); setCardMenu(isMenuOpen ? null : card.taskId); }}
                        style={{ border: 'none', background: isMenuOpen ? `${gc}20` : 'none', cursor: 'pointer', padding: '3px 5px', color: `${gc}cc`, fontSize: 16, lineHeight: 1, borderRadius: 5 }}
                        title="Opções">⋮</button>
                      {isMenuOpen && (
                        <div
                          onPointerDown={(ev) => ev.stopPropagation()}
                          style={{ position: 'absolute', right: 0, top: '110%', background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 6px 18px rgba(0,0,0,0.13)', zIndex: 50, minWidth: 170, padding: '4px 0', overflow: 'hidden' }}>
                          {/* --- Ações de edição --- */}
                          <div style={{ padding: '4px 12px 2px', fontSize: 10, color: 'var(--text-faint)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Editar</div>
                          <button style={menuItemStyle}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-muted)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'none'}
                            onClick={(ev) => { ev.stopPropagation(); openEditCard(card.taskId); }}>
                            ✏ Editar tarefa
                          </button>
                          <button style={menuItemStyle}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-muted)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'none'}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              const t = getTask(card.taskId);
                              if (t) { setCardEdit({ taskId: card.taskId, etapa: t.etapa, avanco: t.avanco ?? 0, dur: t.dur ?? 1, status: t.status ?? 'ongoing', _focusField: 'avanco' }); }
                              setCardMenu(null);
                            }}>
                            📊 Atualizar progresso
                          </button>
                          <button style={menuItemStyle}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-muted)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'none'}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              const t = getTask(card.taskId);
                              if (t) { setCardEdit({ taskId: card.taskId, etapa: t.etapa, avanco: t.avanco ?? 0, dur: t.dur ?? 1, status: t.status ?? 'ongoing', _focusField: 'status' }); }
                              setCardMenu(null);
                            }}>
                            🔄 Alterar status
                          </button>
                          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                          {/* --- Ações de visualização --- */}
                          <div style={{ padding: '4px 12px 2px', fontSize: 10, color: 'var(--text-faint)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Visualizar</div>
                          <button style={menuItemStyle}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-muted)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'none'}
                            onClick={(ev) => { ev.stopPropagation(); setSelCard(card.taskId); setCardMenu(null); }}>
                            🔍 Detalhes
                          </button>
                          <button style={menuItemStyle}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-muted)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'none'}
                            onClick={(ev) => { ev.stopPropagation(); fitToScreen(); setCardMenu(null); }}>
                            ⊡ Ajustar tela
                          </button>
                          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                          <button style={{ ...menuItemStyle, color: '#ef4444' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                            onMouseLeave={e => e.currentTarget.style.background = 'none'}
                            onClick={(ev) => { ev.stopPropagation(); removeCard(card.taskId); }}>
                            🗑 Remover do canvas
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Body */}
                  <div style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 8, height: CARD_H - 52 }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#4b5563' }}>
                        <svg viewBox="0 0 16 16" width={13} height={13} fill="#9ca3af" style={{ pointerEvents: 'none' }}>
                          <path d="M2 14V6l6-4 6 4v8H2zm4-4h4v4H6v-4z" />
                        </svg>
                        <span>{subGroups.length} {subGroups.length === 1 ? 'pavimento' : 'pavimentos'}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#4b5563' }}>
                        <svg viewBox="0 0 16 16" width={13} height={13} fill="#9ca3af" style={{ pointerEvents: 'none' }}>
                          <path d="M2 2h12v2H2zm0 4h12v2H2zm0 4h8v2H2z" />
                        </svg>
                        <span>{subs.length} {subs.length === 1 ? 'tarefa' : 'tarefas'}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#4b5563' }}>
                        <svg viewBox="0 0 16 16" width={13} height={13} fill="#9ca3af" style={{ pointerEvents: 'none' }}>
                          <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2a5 5 0 110 10A5 5 0 018 3zm.5 2H7v4l3 2 .75-1.3L8.5 8.5V5z" />
                        </svg>
                        <span>{task.dur} dias</span>
                      </div>
                    </div>
                    <DonutProgress pct={task.avanco} color={gc} />
                  </div>

                  {/* 4 pontos de conexão */}
                  {PORTS.map(port => (
                    <div key={port} data-conn-in={card.taskId}
                      style={{ position: 'absolute', ...portStyle(port), width: 14, height: 14, borderRadius: '50%', background: '#fff', border: `2.5px solid ${gc}`, zIndex: 5, cursor: 'crosshair', boxShadow: `0 1px 5px ${gc}44`, opacity: showPorts ? 1 : 0, transform: showPorts ? 'scale(1)' : 'scale(0.4)', transition: 'opacity 0.15s, transform 0.15s', pointerEvents: showPorts ? 'auto' : 'none', touchAction: 'none' }}
                      onPointerDown={(ev) => {
                        ev.stopPropagation();
                        const c = { sourceId: card.taskId, sourcePort: port, cx: ev.clientX, cy: ev.clientY };
                        connectingRef.current = c;
                        setConnecting(c);
                      }}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Modal de edição de tarefa ───────────────────────────── */}
      {cardEdit && (() => {
        const gc = groupColorMap[cardEdit.taskId] || '#014386';
        const STATUS_OPTS = [
          { v: 'ongoing',  l: 'Em andamento' },
          { v: 'done',     l: 'Concluída'     },
          { v: 'late',     l: 'Atrasada'      },
          { v: 'upcoming', l: 'Futura'        },
        ];
        const fieldStyle = {
          width: '100%', padding: '7px 10px', borderRadius: 7, border: '1.5px solid var(--border)',
          fontSize: 13, color: 'var(--text)', background: 'var(--surface)', outline: 'none',
          boxSizing: 'border-box',
        };
        const labelStyle = { fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 };
        return (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.38)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onPointerDown={() => setCardEdit(null)}>
            <div
              onPointerDown={ev => ev.stopPropagation()}
              style={{ background: '#fff', borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.18)', width: 360, overflow: 'hidden' }}>
              {/* Header do modal */}
              <div style={{ background: `${gc}14`, borderBottom: `2px solid ${gc}30`, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: gc, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
                  {summaryTasks.findIndex(t => t.id === cardEdit.taskId) + 1}
                </div>
                <span style={{ fontWeight: 700, fontSize: 14, color: gc, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Editar Tarefa</span>
                <button onPointerDown={ev => ev.stopPropagation()} onClick={() => setCardEdit(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-faint)', lineHeight: 1, padding: 0 }}>×</button>
              </div>
              {/* Campos */}
              <div style={{ padding: '18px 18px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Nome da tarefa</label>
                  <input
                    style={fieldStyle}
                    autoFocus={!cardEdit._focusField}
                    value={cardEdit.etapa}
                    onChange={ev => setCardEdit(p => ({ ...p, etapa: ev.target.value }))}
                    onFocus={ev => ev.target.style.borderColor = gc}
                    onBlur={ev => ev.target.style.borderColor = 'var(--border)'}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Progresso (%)</label>
                    <input
                      type="number" min={0} max={100}
                      style={fieldStyle}
                      autoFocus={cardEdit._focusField === 'avanco'}
                      value={cardEdit.avanco}
                      onChange={ev => setCardEdit(p => ({ ...p, avanco: ev.target.value }))}
                      onFocus={ev => ev.target.style.borderColor = gc}
                      onBlur={ev => ev.target.style.borderColor = 'var(--border)'}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Duração (dias)</label>
                    <input
                      type="number" min={1}
                      style={fieldStyle}
                      value={cardEdit.dur}
                      onChange={ev => setCardEdit(p => ({ ...p, dur: ev.target.value }))}
                      onFocus={ev => ev.target.style.borderColor = gc}
                      onBlur={ev => ev.target.style.borderColor = 'var(--border)'}
                    />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Status</label>
                  <select
                    style={{ ...fieldStyle, cursor: 'pointer' }}
                    autoFocus={cardEdit._focusField === 'status'}
                    value={cardEdit.status}
                    onChange={ev => setCardEdit(p => ({ ...p, status: ev.target.value }))}>
                    {STATUS_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                </div>
                {/* Barra de preview do progresso */}
                <div>
                  <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, Math.max(0, parseInt(cardEdit.avanco) || 0))}%`, height: '100%', background: gc, borderRadius: 3, transition: 'width 0.2s' }} />
                  </div>
                </div>
              </div>
              {/* Botões */}
              <div style={{ padding: '0 18px 16px', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setCardEdit(null)}
                  style={{ padding: '8px 18px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-faint)', fontWeight: 600 }}>
                  Cancelar
                </button>
                <button onClick={saveEditCard}
                  style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: gc, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, boxShadow: `0 2px 8px ${gc}50` }}>
                  Salvar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Painel lateral direito ──────────────────────────────── */}
      {selTask && (() => {
        const gc       = groupColorMap[selCard] || '#014386';
        const groupNum = summaryTasks.findIndex(t => t.id === selCard) + 1;
        const STATUS_COLORS = { done: '#16a34a', late: '#ef4444', upcoming: '#9ca3af', ongoing: '#014386' };
        const sColor   = STATUS_COLORS[selTask.status] || '#014386';
        const TABS     = [{ id: 'resumo', label: 'Resumo' }, { id: 'subtarefas', label: 'Subtarefas' }, { id: 'dependencias', label: 'Dependências' }];
        const statRow  = (label, value, valueColor) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-faint)' }}>{label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: valueColor || 'var(--text)' }}>{value}</span>
          </div>
        );
        return (
          <div style={{ width: 300, background: 'var(--surface)', display: 'flex', flexDirection: 'column', flexShrink: 0, borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            {/* Header */}
            <div style={{ padding: '14px 14px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 2 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: gc, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>
                  {groupNum}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selTask.etapa}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>Tarefa resumo vinculada</div>
                </div>
                <button onClick={() => setSelCard(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-faint)', lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
              </div>
            </div>

            {/* Abas */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              {TABS.map(tab => (
                <button key={tab.id}
                  onClick={() => setSelTab(tab.id)}
                  style={{ flex: 1, padding: '9px 4px', border: 'none', borderBottom: selTab === tab.id ? `2.5px solid ${gc}` : '2.5px solid transparent', background: 'none', cursor: 'pointer', fontSize: 12, fontWeight: selTab === tab.id ? 700 : 500, color: selTab === tab.id ? gc : 'var(--text-faint)', transition: 'all 0.12s' }}>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Conteúdo das abas */}
            <div style={{ flex: 1, overflowY: 'auto' }}>

              {/* ── Aba Resumo ── */}
              {selTab === 'resumo' && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {statRow('Subtarefas', subtasks.length)}
                  {statRow('Pavimentos', subtasks.filter(e => e.isGroup).length)}
                  {statRow('Duração Total', `${selTask.dur} dias`)}
                  {statRow('Concluído', `${selTask.avanco}%`, gc)}
                  <div style={{ display: 'flex', alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-faint)' }}>Status</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: sColor, background: `${sColor}15`, border: `1px solid ${sColor}40`, borderRadius: 6, padding: '2px 8px' }}>{statusLabel(selTask.status)}</span>
                  </div>

                  {/* Subtarefas para vínculo automático */}
                  {subtasks.length > 0 && (() => {
                    const allSel = autoLinkSel.size === subtasks.length && subtasks.length > 0;
                    const toggleAll = () => setAutoLinkSel(allSel ? new Set() : new Set(subtasks.map(s => s.id)));
                    const toggleOne = (id) => setAutoLinkSel(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
                    const box = (on) => (
                      <div style={{ width: 16, height: 16, borderRadius: 4, background: on ? gc : 'transparent', border: `1.5px solid ${on ? gc : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {on && <svg width={10} height={10} viewBox="0 0 10 10" fill="none" style={{ pointerEvents: 'none' }}><path d="M1.5 5l2.5 2.5 5-5" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></svg>}
                      </div>
                    );
                    return (
                    <div style={{ padding: '10px 14px 4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Subtarefas para vínculo automático</span>
                      </div>
                      {/* Selecionar todas */}
                      <div onClick={toggleAll} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)', marginBottom: 4, cursor: 'pointer' }}>
                        {box(allSel)}
                        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>Selecionar todas</span>
                        <span style={{ fontSize: 11.5, color: 'var(--text-faint)', background: 'var(--surface-muted)', borderRadius: 5, padding: '1px 6px' }}>{autoLinkSel.size}/{subtasks.length}</span>
                      </div>
                      {subtasks.slice(0, 10).map(s => (
                        <div key={s.id} onClick={() => toggleOne(s.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', cursor: 'pointer' }}>
                          {box(autoLinkSel.has(s.id))}
                          <span style={{ flex: 1, fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.etapa}</span>
                        </div>
                      ))}
                      {subtasks.length > 10 && (
                        <div style={{ fontSize: 11.5, color: 'var(--text-faint)', padding: '4px 0 2px', textAlign: 'center' }}>... +{subtasks.length - 10} mais</div>
                      )}
                      <button onClick={vincularSequencia} disabled={autoLinkSel.size < 2}
                        style={{ width: '100%', marginTop: 8, padding: '8px', borderRadius: 8, border: 'none', background: autoLinkSel.size < 2 ? 'var(--surface-muted)' : gc, color: autoLinkSel.size < 2 ? 'var(--text-faint)' : '#fff', cursor: autoLinkSel.size < 2 ? 'default' : 'pointer', fontSize: 12, fontWeight: 700 }}>
                        Vincular selecionadas em sequência
                      </button>
                    </div>
                    );
                  })()}

                  {/* Dependências resumo */}
                  <div style={{ padding: '10px 14px 4px', marginTop: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Dependências</div>
                    <div style={{ display: 'flex', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                      <svg viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="#9ca3af" strokeWidth={1.8} style={{ marginRight: 8, pointerEvents: 'none' }}>
                        <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-faint)' }}>Geradas</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: outLinks.length > 0 ? gc : 'var(--text-faint)' }}>{outLinks.length}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', padding: '6px 0' }}>
                      <svg viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="#9ca3af" strokeWidth={1.8} style={{ marginRight: 8, pointerEvents: 'none' }}>
                        <path d="M13 8H3M7 4L3 8l4 4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-faint)' }}>Recebidas</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: inLinks.length > 0 ? '#9ca3af' : 'var(--text-faint)' }}>{inLinks.length}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Aba Subtarefas ── */}
              {selTab === 'subtarefas' && (
                <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {subtasks.length === 0 && (
                    <div style={{ padding: '24px 14px', fontSize: 12, color: 'var(--text-faint)', textAlign: 'center' }}>Nenhuma subtarefa vinculada</div>
                  )}
                  {subtasks.map(s => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: groupColorMap[s.id] || '#9ca3af', flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>{s.etapa}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: gc }}>{s.avanco}%</span>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Aba Dependências ── */}
              {selTab === 'dependencias' && (
                <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '4px 2px 6px' }}>Geradas ({outLinks.length})</div>
                    {outLinks.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: '4px 2px' }}>Nenhuma dependência gerada</div>}
                    {outLinks.map(l => { const t = getTask(l.targetId); if (!t) return null; const dep = getDep(l.sourceId, l.targetId); return (
                      <div key={l.targetId} style={{ padding: '7px 10px', borderRadius: 8, background: 'var(--surface-muted)', border: '1px solid var(--border)', marginBottom: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: '#014386', fontSize: 13, fontWeight: 700 }}>→</span>
                          <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.etapa}</span>
                          <button onClick={() => removeLink(l.sourceId, l.targetId)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                          <select value={dep.tipo || 'TI'} onChange={e => updateLink(l.sourceId, l.targetId, { tipo: e.target.value })}
                            style={{ fontSize: 11, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}>
                            {DEP_TIPOS.map(o => <option key={o.v} value={o.v}>{o.v}</option>)}
                          </select>
                          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>folga</span>
                          <input type="number" value={dep.lag ?? 0} onChange={e => updateLink(l.sourceId, l.targetId, { lag: parseInt(e.target.value) || 0 })}
                            style={{ width: 54, fontSize: 11, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }} />
                          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>dias</span>
                        </div>
                      </div>
                    ); })}
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '4px 2px 6px' }}>Recebidas ({inLinks.length})</div>
                    {inLinks.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: '4px 2px' }}>Nenhuma predecessora</div>}
                    {inLinks.map(l => { const s = getTask(l.sourceId); return s ? (
                      <div key={l.sourceId} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderRadius: 8, background: 'var(--surface-muted)', border: '1px solid var(--border)', marginBottom: 4 }}>
                        <span style={{ color: '#9ca3af', fontSize: 13, fontWeight: 700 }}>←</span>
                        <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.etapa}</span>
                      </div>
                    ) : null; })}
                  </div>
                </div>
              )}
            </div>

            {/* Botão Remover */}
            <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              <button
                onClick={() => removeCard(selCard)}
                style={{ width: '100%', padding: '9px', border: '1.5px solid #ef4444', borderRadius: 9, color: '#ef4444', background: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, transition: 'background 0.12s' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
                Remover Card do Fluxo
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
