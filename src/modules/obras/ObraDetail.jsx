import React from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../components/Icons';
import { AppData } from '../../utils/data';
import { supabase } from '../../services/supabase';
import { logger } from '../../services/logger';
import { Modal, ObraFormModal, useToast } from '../../components/Modals';
import { podeVerAba, moduloSomenteLeitura, isAdmin, abaSomenteLeitura } from '../../utils/permissions';
import { migrateEtapas, offsetToISO, offsetToDate, dateToOffset, computeValorVinculadoMap, computeCustoOrcadoMap } from '../cronograma/ganttUtils';
import { isoToBR, taskEnd } from '../cronograma/cronogramaDateUtils';
import { getMonthRange, computeMonthlyDist, computeGroupValues, computeAvancoFisico, effStatus } from '../cronograma/scheduleEngine';
import { SCurveChart2 } from '../cronograma/SCurveChart2';
import { pavimentosService } from '../../services/pavimentos.service';
import { vinculoService, itemValor } from '../financeiro/vinculoService';
import { capaCache } from '../../services/capaCache';

// Obra Detail Page
const { brl: brlD } = AppData;

// ----- Gantt -----
const MES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

// Janela de meses: começa no mês da tarefa-folha mais antiga (sem folga vazia à esquerda) e
// vai até o término (dias úteis, taskEnd) da última folha.
function computeJanela(etapasAll) {
  const folhas = etapasAll.filter(e => !e.isGroup);
  const base = folhas.length ? folhas : etapasAll;
  if (!base.length) return null;
  const inicioMin = Math.min(...base.map(e => e.inicio || 0));
  const fimMax    = Math.max(...base.map(e => taskEnd(e)));
  const dIni = offsetToDate(inicioMin);
  const anchor = new Date(dIni.getFullYear(), dIni.getMonth(), 1); // começa no mês da 1ª tarefa (sem folga vazia)
  const dFim = offsetToDate(fimMax);
  const totalMeses = (dFim.getFullYear() * 12 + dFim.getMonth()) - (anchor.getFullYear() * 12 + anchor.getMonth()) + 1;

  const primeiroDia = (y, m) => `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const inicioDias = dateToOffset(primeiroDia(anchor.getFullYear(), anchor.getMonth()));
  const fimDias    = dateToOffset(primeiroDia(dFim.getFullYear(), dFim.getMonth() + 1));

  const meses = Array.from({ length: totalMeses }, (_, i) => {
    const d = new Date(anchor.getFullYear(), anchor.getMonth() + i, 1);
    const nome = MES_ABREV[d.getMonth()];
    return (i === 0 || d.getMonth() === 0) ? `${nome}/${String(d.getFullYear()).slice(-2)}` : nome;
  });
  // Dias reais de cada mês — colunas proporcionais (28-31), como no Gantt do Cronograma,
  // para as barras (posicionadas por dia) baterem exatamente com os cabeçalhos dos meses.
  const mesesDias = Array.from({ length: totalMeses }, (_, i) => {
    const d = new Date(anchor.getFullYear(), anchor.getMonth() + i, 1);
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  });

  return { meses, mesesDias, inicioDias, spanDias: fimDias - inicioDias, totalMeses };
}

const Gantt = ({ etapas, resumoOnly = false, maxHeight }) => {
  const rows = resumoOnly && etapas.some(e => e.isGroup)
    ? etapas.filter(e => e.isGroup)
    : etapas; // sem grupos definidos: mostra tudo, evita card vazio

  // Recolher grupos (só faz sentido na visão completa — resumoOnly já mostra só os grupos).
  const [collapsed, setCollapsed] = React.useState(() => new Set());
  const maxGroupNivel = React.useMemo(
    () => rows.filter(e => e.isGroup).reduce((m, e) => Math.max(m, e.nivel || 0), 0),
    [rows]
  );
  const collapseToLevel = (maxNivel) => {
    if (maxNivel < 0) { setCollapsed(new Set()); return; }
    setCollapsed(new Set(rows.filter(e => e.isGroup && (e.nivel || 0) === maxNivel).map(e => e.id)));
  };
  const visibleRows = React.useMemo(() => {
    if (resumoOnly || !collapsed.size) return rows;
    const out = [];
    let hideUntil = null;
    rows.forEach(e => {
      const niv = e.nivel || 0;
      if (hideUntil !== null) {
        if (niv > hideUntil) return; // ainda dentro do grupo recolhido
        hideUntil = null;
      }
      if (e.isGroup && collapsed.has(e.id)) hideUntil = niv;
      out.push(e);
    });
    return out;
  }, [rows, collapsed, resumoOnly]);

  // Valores de grupo por rollup (mesmo cálculo do Gantt real): início/fim/avanço agregados.
  const groupVals = React.useMemo(() => computeGroupValues(etapas), [etapas]);
  const janela = computeJanela(etapas);
  if (!janela) {
    return <div className="text-muted" style={{ padding: '24px 20px', textAlign: 'center', fontSize: 13 }}>Nenhuma etapa cadastrada.</div>;
  }
  const { meses: janelaMeses, mesesDias: janelaMesesDias, inicioDias: janelaInicioDias, spanDias: janelaSpanDias } = janela;
  const totalMonths = janelaMeses.length;

  // Início/fim efetivos: grupos usam o envelope calculado; folhas usam o término por dias úteis.
  const effVals = (e) => {
    const gv = e.isGroup ? groupVals[e.id] : null;
    const ini = gv ? gv.inicio : e.inicio;
    const fim = gv ? gv.inicio + gv.dur : taskEnd(e);
    return { ini, fim, avanco: gv ? gv.avanco : e.avanco };
  };
  const barLeftPct  = (v) => ((v.ini - janelaInicioDias) / janelaSpanDias) * 100;
  const barWidthPct = (v) => ((v.fim - v.ini) / janelaSpanDias) * 100;

  const hojeDias = dateToOffset(new Date().toISOString().slice(0, 10));
  const hojePct  = ((hojeDias - janelaInicioDias) / janelaSpanDias) * 100;
  const mostrarHoje = hojePct >= 0 && hojePct <= 100;

  return (
    <div className="gantt" style={{ overflowX: 'auto', ...(maxHeight ? { maxHeight, overflowY: 'auto' } : null) }}>
      <div style={{ minWidth: 220 + totalMonths * 70, position: 'relative', paddingTop: 12 }}>
        <div className="gantt-head">
          <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>ETAPA</span>
            {!resumoOnly && rows.some(e => e.isGroup) && (
              <span style={{ display: 'flex', gap: 2 }}>
                {Array.from({ length: maxGroupNivel + 1 }, (_, nivel) => (
                  <button key={nivel} className="orca-row-btn" title={`Mostrar até nível ${nivel + 1}`}
                    style={{ width: 22, height: 20, fontSize: 10, fontWeight: 600 }}
                    onClick={() => collapseToLevel(nivel)}>
                    N{nivel + 1}
                  </button>
                ))}
                <button className="orca-row-btn" title="Expandir tudo"
                  style={{ width: 22, height: 20, fontSize: 10, fontWeight: 600 }}
                  onClick={() => collapseToLevel(-1)}>≡</button>
              </span>
            )}
          </div>
          <div className="gantt-month-row" style={{ gridTemplateColumns: janelaMesesDias.map(d => `${d}fr`).join(' ') }}>
            {janelaMeses.map((m, i) => <div key={i} className="gantt-month">{m}</div>)}
          </div>
        </div>
        {visibleRows.map((e, i) => {
          const v = effVals(e);
          return (
            <div className="gantt-row" key={i}>
              <div className="gantt-label" style={{ paddingLeft: 14 + (e.nivel || 0) * 14, fontWeight: e.isGroup ? 700 : 400 }}>
                {e.isGroup && !resumoOnly && (
                  <span onClick={() => setCollapsed(prev => { const n = new Set(prev); n.has(e.id) ? n.delete(e.id) : n.add(e.id); return n; })}
                    title={collapsed.has(e.id) ? 'Expandir' : 'Recolher'}
                    style={{ color: 'var(--text-muted)', marginRight: 5, fontSize: 10, cursor: 'pointer', userSelect: 'none' }}>
                    {collapsed.has(e.id) ? '▸' : '▾'}
                  </span>
                )}
                {e.etapa}
              </div>
              <div className="gantt-track">
                <div
                  className={'gantt-bar ' + (e.isGroup ? 'is-group ' : '') + effStatus(e)}
                  style={{
                    left: `calc(${barLeftPct(v)}% + 2px)`,
                    width: `calc(${barWidthPct(v)}% - 4px)`,
                  }}
                >
                  <div className="fill" style={{ width: v.avanco + '%' }}></div>
                  <span style={{ position: 'relative', zIndex: 1 }}>{!e.isGroup && v.avanco > 0 ? v.avanco + '%' : ''}</span>
                </div>
              </div>
            </div>
          );
        })}
        {!resumoOnly && mostrarHoje && (
          <div className="gantt-today-line" style={{ left: `calc(220px + (100% - 220px) * ${hojePct / 100})` }}>
            <span className="gantt-today-label" style={{ top: 0 }}>Hoje</span>
          </div>
        )}
      </div>
      {!resumoOnly && (
        <div className="row" style={{ gap: 14, padding: '10px 14px', fontSize: 11.5, color: 'var(--text-muted)' }}>
          <span className="row" style={{ gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--success)', display: 'inline-block' }} />Concluído</span>
          <span className="row" style={{ gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--danger)', display: 'inline-block' }} />Atrasado</span>
          <span className="row" style={{ gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--brand-400)', display: 'inline-block' }} />Planejado</span>
        </div>
      )}
    </div>
  );
};

// ----- Visão Geral tab -----
const VisaoGeral = ({ etapas, etapasLoaded, baselines = [] }) => {
  // Card "Cronograma resumido" gruda sob a topbar ao rolar, mesmo padrão do card
  // "Cronograma físico" (aba Cronograma) e da toolbar da aba Fotos: STICKY_TOP =
  // topbar 60px + 32px de respiro. O corpo (mini-Gantt) ganha scroll próprio limitado
  // ao espaço restante da viewport, pro cabeçalho do card ficar sempre visível.
  const RESUMO_STICKY_TOP = 92;
  const resumoHeaderRef = React.useRef(null);
  const [resumoBodyMaxH, setResumoBodyMaxH] = React.useState(null);
  React.useLayoutEffect(() => {
    const recompute = () => {
      const H = resumoHeaderRef.current?.offsetHeight || 0;
      setResumoBodyMaxH(Math.max(200, window.innerHeight - RESUMO_STICKY_TOP - H - 24));
    };
    recompute();
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  }, [etapas.length]);

  // "Previsto" = a linha de base mais antiga da obra (plano original aprovado), a mesma
  // fonte usada como "Linha de Base" no Cronograma → Curva Física.
  const baseline = React.useMemo(() => (
    baselines.length
      ? [...baselines].sort((a, b) => (a.criadaEm || '').localeCompare(b.criadaEm || ''))[0]
      : null
  ), [baselines]);

  // Curva S faseada (mesma lógica do Cronograma → Curva Física, "Real + Reprogramado"):
  // uma única distribuição acumulada do cronograma AO VIVO (peso = duração de cada folha),
  // colorida verde (Executado) até o mês atual e azul (Replanejado) dali em diante, comparada
  // com o "Previsto" (linha de base), quando existir.
  const curva = React.useMemo(() => {
    const months = getMonthRange(etapas);
    if (!months.length) return { months: [], acumulado: [], previsto: null, todayIdx: -1 };
    const durW = {};
    etapas.forEach(e => { if (!e.isGroup) durW[e.id] = Math.max(1, e.dur || 1); });
    const distPlan = computeMonthlyDist(etapas, durW); // { folhaId: { mês: dias no mês } }
    const pMon = {};
    months.forEach(m => { pMon[m.key] = 0; });
    Object.values(distPlan).forEach(d => {
      months.forEach(m => { pMon[m.key] += d[m.key] || 0; });
    });
    const grand = months.reduce((s, m) => s + pMon[m.key], 0) || 1;
    let accP = 0;
    const acumulado = months.map(m => { accP += pMon[m.key]; return accP / grand * 100; });

    let previsto = null;
    if (baseline?.etapas?.length) {
      const durWB = {};
      baseline.etapas.forEach(e => { if (!e.isGroup) durWB[e.id] = Math.max(1, e.dur || 1); });
      const distB = computeMonthlyDist(baseline.etapas, durWB);
      const bMon = {};
      months.forEach(m => { bMon[m.key] = 0; });
      Object.values(distB).forEach(d => {
        months.forEach(m => { bMon[m.key] += d[m.key] || 0; });
      });
      const grandB = months.reduce((s, m) => s + bMon[m.key], 0) || 1;
      let accB = 0;
      previsto = months.map(m => { accB += bMon[m.key]; return accB / grandB * 100; });
    }

    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    // Fora da janela: obra já concluída (hoje depois do fim) conta tudo como Executado;
    // obra ainda não iniciada (hoje antes do início) conta tudo como Replanejado.
    let todayIdx = months.findIndex(m => m.key === todayKey);
    if (todayIdx === -1) todayIdx = todayKey > months[months.length - 1].key ? months.length - 1 : -1;
    return { months, acumulado, previsto, todayIdx };
  }, [etapas, baseline]);

  return (
    <div className="stack">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Curva S — Real x Replanejado</div>
            </div>
            <div className="card-actions" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div className="legend">
                <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--brand)' }}></span>Real</span>
                {curva.previsto && (
                  <span className="legend-item"><span style={{ display: 'inline-block', width: 16, height: 0, borderTop: '2px dashed #94a3b8', marginRight: 4, verticalAlign: 'middle' }}></span>Previsto</span>
                )}
              </div>
            </div>
          </div>
          <div className="card-body" style={{ overflowX: 'auto' }}>
            {!etapasLoaded ? (
              <div className="text-muted" style={{ padding: '24px 20px', textAlign: 'center', fontSize: 13 }}>Carregando cronograma…</div>
            ) : curva.months.length ? (
              <SCurveChart2 months={curva.months} selIdx={curva.todayIdx}
                execA={curva.acumulado} replanA={curva.acumulado} baselineA={curva.previsto}
                show={{ bl: !!curva.previsto, rep: true, real: true }} showBarras={false}
                execColor="var(--brand)" />
            ) : (
              <div className="text-muted" style={{ padding: '24px 20px', textAlign: 'center', fontSize: 13 }}>Sem cronograma com datas para exibir a curva.</div>
            )}
          </div>
        </div>

        <div className="card" style={{ position: 'sticky', top: RESUMO_STICKY_TOP, zIndex: 2 }}>
          <div className="card-header" ref={resumoHeaderRef}>
            <div>
              <div className="card-title">Cronograma resumido</div>
              <div className="card-subtitle">10 etapas principais</div>
            </div>
          </div>
          <div className="card-body" style={{ padding: '4px 0 0' }}>
            {!etapasLoaded ? (
              <div className="text-muted" style={{ padding: '24px 20px', textAlign: 'center', fontSize: 13 }}>
                Carregando cronograma…
              </div>
            ) : (
              <Gantt etapas={etapas} resumoOnly maxHeight={resumoBodyMaxH} />
            )}
          </div>
        </div>
    </div>
  );
};

// ----- Curve S chart with planned baseline -----
const CurveS = ({ series }) => {
  const w = 720, h = 240;
  const pad = { l: 36, r: 16, t: 16, b: 28 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const xs = series.map((_, i) => pad.l + (i / (series.length - 1)) * innerW);
  const max = 100;
  const yOf = (v) => pad.t + innerH - (v / max) * innerH;
  // planned baseline (slightly ahead)
  const planned = series.map((d) => Math.min(100, d.fis + 3));
  const lineFis = series.map((d, i) => (i === 0 ? 'M' : 'L') + xs[i] + ',' + yOf(d.fis)).join(' ');
  const lineFin = series.map((d, i) => (i === 0 ? 'M' : 'L') + xs[i] + ',' + yOf(d.fin)).join(' ');
  const linePlan = planned.map((v, i) => (i === 0 ? 'M' : 'L') + xs[i] + ',' + yOf(v)).join(' ');
  const yTicks = [0, 25, 50, 75, 100];

  return (
    <svg className="chart-svg" viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <linearGradient id="cs-fis" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.18"/>
          <stop offset="100%" stopColor="var(--brand)" stopOpacity="0"/>
        </linearGradient>
      </defs>
      <g className="chart-grid">
        {yTicks.map((t, i) => <line key={i} x1={pad.l} x2={w - pad.r} y1={yOf(t)} y2={yOf(t)} strokeDasharray={t === 0 ? '0' : '3 3'} />)}
      </g>
      <g className="chart-axis">
        {yTicks.map((t, i) => <text key={i} x={pad.l - 8} y={yOf(t) + 3} textAnchor="end">{t}%</text>)}
        {series.map((d, i) => i % 2 === 0 && <text key={i} x={xs[i]} y={h - pad.b + 16} textAnchor="middle">{d.m}</text>)}
      </g>
      <path d={lineFis + ` L ${xs[xs.length - 1]},${pad.t + innerH} L ${xs[0]},${pad.t + innerH} Z`} fill="url(#cs-fis)" />
      <path d={linePlan} fill="none" stroke="var(--text-faint)" strokeWidth="1.5" strokeDasharray="4 4" />
      <path d={lineFin} fill="none" stroke="#1f8b5c" strokeWidth="2" />
      <path d={lineFis} fill="none" stroke="var(--brand)" strokeWidth="2.2" />
      <circle cx={xs[xs.length - 1]} cy={yOf(series[series.length - 1].fis)} r="4" fill="var(--brand)" stroke="white" strokeWidth="2" />
    </svg>
  );
};

// ----- Lightbox de foto com zoom e pan -----
const FotoLightbox = ({ fotos, idx, onNavigate, onClose, onDownload, urlOriginal, onRequestOriginal }) => {
  const foto = fotos[idx];
  const [scale,      setScale]     = React.useState(1);
  const [translate,  setTranslate] = React.useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = React.useState(false);
  const containerRef  = React.useRef(null);
  const isDraggingRef = React.useRef(false);
  const dragOriginRef = React.useRef({ x: 0, y: 0 });
  const dragStartRef  = React.useRef({ x: 0, y: 0 });

  // Reset zoom/pan ao trocar de foto
  React.useEffect(() => { setScale(1); setTranslate({ x: 0, y: 0 }); }, [idx]);

  // A foto que vem no array pode ser um thumbnail (galeria paginada, ex: aba Fotos de
  // Obras) — pede a resolução original assim que essa foto específica é aberta, sem
  // depender do chamador ter resolvido isso pra todas de uma vez. Opcional: quem não
  // usa thumbnail (ex: aba Anexos) simplesmente não passa essas props.
  React.useEffect(() => { onRequestOriginal?.(foto); }, [foto?.id]);

  // Teclado: setas e Escape
  React.useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowLeft'  && idx > 0)               onNavigate(idx - 1);
      if (e.key === 'ArrowRight' && idx < fotos.length - 1) onNavigate(idx + 1);
      if (e.key === 'Escape')                               onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [idx, fotos.length]);

  // Wheel para zoom — passive:false para permitir preventDefault
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.25 : -0.25;
      setScale(s => Math.min(4, Math.max(0.5, +(s + delta).toFixed(2))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onDblClick = (e) => {
    e.stopPropagation();
    if (scale !== 1) { setScale(1); setTranslate({ x: 0, y: 0 }); }
    else setScale(2);
  };

  const onMouseDown = (e) => {
    if (scale <= 1) return;
    e.preventDefault();
    isDraggingRef.current = true;
    setIsDragging(true);
    dragOriginRef.current = { x: e.clientX, y: e.clientY };
    dragStartRef.current  = { x: translate.x, y: translate.y };
  };
  const onMouseMove = (e) => {
    if (!isDraggingRef.current) return;
    setTranslate({
      x: dragStartRef.current.x + (e.clientX - dragOriginRef.current.x),
      y: dragStartRef.current.y + (e.clientY - dragOriginRef.current.y),
    });
  };
  const onMouseUp = () => { isDraggingRef.current = false; setIsDragging(false); };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.95)',
               display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={() => { if (scale <= 1) onClose(); }}
    >
      {/* Botão fechar */}
      <button className="icon-btn"
        style={{ position: 'absolute', top: 16, right: 16, color: '#fff', background: 'rgba(255,255,255,0.15)', width: 40, height: 40, zIndex: 10 }}
        onClick={e => { e.stopPropagation(); onClose(); }}>
        <Icon name="x" size={20} />
      </button>

      {/* Botão baixar */}
      {onDownload && (
        <button className="icon-btn" title="Baixar"
          style={{ position: 'absolute', top: 16, right: 64, color: '#fff', background: 'rgba(255,255,255,0.15)', width: 40, height: 40, zIndex: 10 }}
          onClick={e => { e.stopPropagation(); onDownload(foto); }}>
          <Icon name="download" size={18} />
        </button>
      )}

      {/* Navegar para foto anterior */}
      {idx > 0 && (
        <button className="icon-btn"
          style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#fff', background: 'rgba(255,255,255,0.15)', width: 44, height: 44, zIndex: 10 }}
          onClick={e => { e.stopPropagation(); onNavigate(idx - 1); }}>
          <Icon name="chevron-left" size={24} />
        </button>
      )}

      {/* Container da imagem: isola overflow e captura eventos de mouse */}
      <div
        ref={containerRef}
        style={{
          width: '95vw', height: '95vh',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
          cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
          userSelect: 'none',
        }}
        onClick={e => e.stopPropagation()}
        onDoubleClick={onDblClick}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <img
          src={urlOriginal || foto.url}
          alt={foto.descricao || ''}
          draggable={false}
          style={{
            maxWidth: '95vw',
            maxHeight: '95vh',
            objectFit: 'contain',
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            transition: isDragging ? 'none' : 'transform 0.15s ease',
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Navegar para foto seguinte */}
      {idx < fotos.length - 1 && (
        <button className="icon-btn"
          style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', color: '#fff', background: 'rgba(255,255,255,0.15)', width: 44, height: 44, zIndex: 10 }}
          onClick={e => { e.stopPropagation(); onNavigate(idx + 1); }}>
          <Icon name="chevron-right" size={24} />
        </button>
      )}

      {/* Controles de zoom + metadados da foto — empilhados num único bloco pra nunca colidir,
          em vez de dois blocos com bottom fixo (o de metadados varia de 1 a 4 linhas). */}
      <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, zIndex: 10 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="icon-btn"
            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', width: 36, height: 36 }}
            onClick={e => { e.stopPropagation(); setScale(s => Math.max(0.5, +(s - 0.5).toFixed(2))); }}>
            <Icon name="zoom-out" size={16} />
          </button>
          <span style={{ color: '#fff', fontSize: 12, minWidth: 40, textAlign: 'center', opacity: 0.85 }}>
            {Math.round(scale * 100)}%
          </span>
          <button className="icon-btn"
            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', width: 36, height: 36 }}
            onClick={e => { e.stopPropagation(); setScale(s => Math.min(4, +(s + 0.5).toFixed(2))); }}>
            <Icon name="zoom-in" size={16} />
          </button>
          {scale !== 1 && (
            <button className="icon-btn"
              style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', width: 36, height: 36 }}
              onClick={e => { e.stopPropagation(); setScale(1); setTranslate({ x: 0, y: 0 }); }}>
              <Icon name="maximize" size={16} />
            </button>
          )}
        </div>

        <div style={{ color: '#fff', textAlign: 'center', fontSize: 13, pointerEvents: 'none', whiteSpace: 'nowrap', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
          {foto.pavimento && <div style={{ fontWeight: 600 }}>{foto.pavimento}</div>}
          {foto.data      && <div style={{ opacity: 0.8 }}>{isoToBR(foto.data)}</div>}
          {foto.descricao && <div style={{ opacity: 0.7, marginTop: 2 }}>{foto.descricao}</div>}
          <div style={{ opacity: 0.5, marginTop: 4, fontSize: 11.5 }}>{idx + 1} / {fotos.length}</div>
        </div>
      </div>
    </div>
  );
};

// ----- Seletor de mês/ano (substitui o <input type="month"> nativo, cujo popup do
// navegador não permite trocar de ano de forma confiável em todos os ambientes) -----
const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const MesAnoInput = ({ value, onChange }) => {
  const [open, setOpen] = React.useState(false);
  const [rect, setRect] = React.useState(null);
  const hoje = new Date();
  const [anoExibido, setAnoExibido] = React.useState(() => value ? Number(value.slice(0, 4)) : hoje.getFullYear());
  const wrapRef = React.useRef(null);
  const btnRef = React.useRef(null);
  const menuRef = React.useRef(null);

  const abrir = () => {
    setAnoExibido(value ? Number(value.slice(0, 4)) : hoje.getFullYear());
    const el = btnRef.current;
    if (!el) { setOpen(true); return; }
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 224) });
    setOpen(true);
  };

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    // O menu é posicionado em pixels fixos no momento de abrir e não acompanha o
    // scroll da página — em vez de deixar flutuando no lugar errado, fecha ao rolar.
    const onWheel = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('wheel', onWheel);
    };
  }, [open]);

  const anoSel = value ? Number(value.slice(0, 4)) : null;
  const mesSel = value ? Number(value.slice(5, 7)) : null;

  const escolherMes = (mesIdx1) => {
    onChange(`${anoExibido}-${String(mesIdx1).padStart(2, '0')}`);
    setOpen(false);
  };

  const label = value ? `${MESES_ABREV[mesSel - 1]} de ${anoSel}` : 'Filtrar por mês';

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button type="button" ref={btnRef} onClick={() => (open ? setOpen(false) : abrir())}
        style={{ height: 32, fontSize: 13, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)',
                 color: value ? 'var(--text)' : 'var(--text-muted)', padding: '0 8px', cursor: 'pointer', fontWeight: 400,
                 display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <Icon name="calendar" size={14} />{label}
      </button>
      {open && rect && createPortal(
        <div ref={menuRef} style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width, zIndex: 300,
                                     background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
                                     boxShadow: '0 10px 30px rgba(0,0,0,0.14)', padding: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <button type="button" className="icon-btn" onClick={() => setAnoExibido(a => a - 1)} title="Ano anterior">
              <Icon name="chevron-left" size={15} />
            </button>
            <span style={{ fontWeight: 700, fontSize: 13.5 }}>{anoExibido}</span>
            <button type="button" className="icon-btn" onClick={() => setAnoExibido(a => a + 1)} title="Próximo ano">
              <Icon name="chevron-right" size={15} />
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
            {MESES_ABREV.map((m, i) => {
              const ativo = anoSel === anoExibido && mesSel === i + 1;
              return (
                <button key={m} type="button" onClick={() => escolherMes(i + 1)}
                  className={'btn btn-sm' + (ativo ? ' btn-primary' : ' btn-ghost')}
                  style={{ fontSize: 12.5, padding: '6px 0', justifyContent: 'center' }}>
                  {m}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { onChange(''); setOpen(false); }}>Limpar</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
              onChange(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`);
              setOpen(false);
            }}>Este mês</button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

// ----- Fotos tab -----
const FOTOS_POR_LOTE = 32;

// "YYYY-MM" -> intervalo [ini, fim) em ISO date, pro filtro de mês virar .gte/.lt no
// servidor. new Date(y, m, 1) usa o mês (1-indexado) como índice 0-indexado do PRÓXIMO
// mês, e o JS Date normaliza sozinho a virada de ano (mês 12 -> ano seguinte).
function mesRangeISO(mesStr) {
  const [y, m] = mesStr.split('-').map(Number);
  const ini = `${mesStr}-01`;
  const d = new Date(y, m, 1);
  const fim = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  return { ini, fim };
}

const Fotos = ({ obra, readOnly = false, isAdmin = false }) => {
  const toast = useToast();
  const [fotos,        setFotos]        = React.useState([]);
  const [loading,      setLoading]      = React.useState(true);
  const [loadingMore,  setLoadingMore]  = React.useState(false);
  const [hasMore,      setHasMore]      = React.useState(true);
  const [totalCount,   setTotalCount]   = React.useState(0);
  const [showUpload,   setShowUpload]   = React.useState(false);
  const [editando,     setEditando]     = React.useState(null);
  const [filtroMes,    setFiltroMes]    = React.useState('');
  const [filtroPavimento, setFiltroPavimento] = React.useState('');
  const [lightboxIdx,  setLightboxIdx]  = React.useState(null);
  const [deleteFoto,   setDeleteFoto]   = React.useState(null);
  const [pavimentosComFoto, setPavimentosComFoto] = React.useState([]);
  // id -> signed URL da imagem ORIGINAL, resolvida sob demanda (lightbox/download),
  // porque o que vem no lote é o thumbnail (ou a original, como fallback — ver carregarLote).
  const [originalUrls, setOriginalUrls] = React.useState({});
  // Toolbar gruda sob a topbar ao rolar (mesmo padrão do card "Cronograma físico" logo
  // acima, e de Orcamentos.jsx: STICKY_TOP = topbar 60px + 32px de respiro); a galeria
  // ganha scroll próprio limitado ao espaço restante da viewport, pra toolbar continuar
  // sempre visível e o restante rolar por dentro — esse mesmo container é o "root" do
  // IntersectionObserver do scroll infinito, mais abaixo.
  const FOTOS_STICKY_TOP = 92;
  const fotosHeaderRef = React.useRef(null);
  const [fotosBodyMaxH, setFotosBodyMaxH] = React.useState(null);
  const scrollContainerRef = React.useRef(null);
  const sentinelRef = React.useRef(null);

  // Bookkeeping de paginação em refs: precisa ser lido de forma síncrona dentro do
  // callback do IntersectionObserver (recriado só quando hasMore/loading mudam) e
  // logo após cada await dentro de carregarLote — state só reflete no próximo render.
  const requestIdRef   = React.useRef(0); // geração da requisição em curso — descarta resposta obsoleta se o filtro mudar antes dela voltar
  const paginaRef      = React.useRef(0); // próximo índice de lote a buscar
  const loadedRef      = React.useRef(0); // quantas fotos já foram acumuladas nesta sequência de filtro
  const totalRef       = React.useRef(0); // total que bate com o filtro atual (do count:'exact' do reset)
  const hasMoreRef     = React.useRef(true);
  const loadingMoreRef = React.useRef(false);
  React.useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  React.useEffect(() => { loadingMoreRef.current = loadingMore; }, [loadingMore]);

  // Pavimentos cadastrados na obra — abastecem o dropdown do campo Pavimento nos modais
  const [pavimentos,   setPavimentos]   = React.useState([]);
  React.useEffect(() => { pavimentosService.listar(obra.id).then(setPavimentos); }, [obra.id]);
  const registrarPavimento = (nome) => {
    const n = String(nome || '').trim();
    if (!n || pavimentos.includes(n)) return;
    setPavimentos(prev => [...new Set([...prev, n])].sort());
    pavimentosService.salvar(obra.id, [n]);
  };

  // Lista de pavimentos que TÊM foto, pro filtro — query própria e leve (só a coluna
  // pavimento, sem imagem/URL assinada). Com paginação, `fotos` só tem o que já foi
  // carregado, não dá mais pra derivar isso em memória sem perder pavimentos que só
  // apareceriam num lote mais adiante.
  const carregarPavimentosComFoto = React.useCallback(async () => {
    const { data } = await supabase.from('fotos_obra').select('pavimento').eq('obra_id', obra.id);
    setPavimentosComFoto([...new Set((data || []).map(f => f.pavimento).filter(Boolean))].sort());
  }, [obra.id]);
  React.useEffect(() => { carregarPavimentosComFoto(); }, [carregarPavimentosComFoto]);

  const carregarLote = React.useCallback(async ({ reset }) => {
    if (reset) {
      requestIdRef.current += 1;
      paginaRef.current = 0;
      loadedRef.current = 0;
      setLoading(true);
      setHasMore(true);
      hasMoreRef.current = true;
    } else {
      if (!hasMoreRef.current || loadingMoreRef.current) return;
      setLoadingMore(true);
      loadingMoreRef.current = true;
    }
    const meuId = requestIdRef.current;
    const pageIndex = paginaRef.current;
    try {
      let q = supabase.from('fotos_obra')
        .select('*', reset ? { count: 'exact' } : undefined)
        .eq('obra_id', obra.id);
      if (filtroPavimento) q = q.eq('pavimento', filtroPavimento);
      if (filtroMes) {
        const { ini, fim } = mesRangeISO(filtroMes);
        q = q.gte('data', ini).lt('data', fim);
      }
      q = q.order('data', { ascending: false, nullsFirst: false })
           .order('created_at', { ascending: false })
           .range(pageIndex * FOTOS_POR_LOTE, pageIndex * FOTOS_POR_LOTE + FOTOS_POR_LOTE - 1);
      const { data, error, count } = await q;
      if (meuId !== requestIdRef.current) return; // filtro mudou enquanto isso corria — descarta
      if (error) throw error;
      const rows = data || [];
      // Bucket privado: exibe via URL assinada gerada do thumbnail (ou da própria
      // imagem, se a foto ainda não tiver thumbnail_path — fotos antigas, ou upload
      // cujo thumbnail falhou). A coluna `url` legada fica só como fallback final.
      const paths = rows.map(f => f.thumbnail_path || f.storage_path).filter(Boolean);
      const signed = {};
      if (paths.length) {
        const { data: urls } = await supabase.storage.from('obras-images').createSignedUrls(paths, 3600);
        (urls || []).forEach(u => { if (u.signedUrl && !u.error) signed[u.path] = u.signedUrl; });
      }
      if (meuId !== requestIdRef.current) return;
      const comUrl = rows.map(f => ({ ...f, url: signed[f.thumbnail_path || f.storage_path] || f.url }));
      setFotos(prev => reset ? comUrl : [...prev, ...comUrl]);
      paginaRef.current = pageIndex + 1;
      loadedRef.current += comUrl.length;
      if (reset && typeof count === 'number') { totalRef.current = count; setTotalCount(count); }
      const novoHasMore = loadedRef.current < totalRef.current;
      setHasMore(novoHasMore);
      hasMoreRef.current = novoHasMore;
    } catch (err) {
      logger.error('falha ao carregar fotos', { module: 'obra', action: 'carregarLote', err });
    } finally {
      if (meuId === requestIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
        loadingMoreRef.current = false;
      }
    }
  }, [obra.id, filtroMes, filtroPavimento]);

  const carregarProximoLoteRef = React.useRef(() => {});
  carregarProximoLoteRef.current = () => carregarLote({ reset: false });

  // Reinicia a paginação sempre que a obra ou os filtros mudam
  React.useEffect(() => { carregarLote({ reset: true }); }, [carregarLote]);

  // Scroll infinito: sentinela dentro do mesmo container que já tem overflow próprio
  // (toolbar sticky). root customizado (não a window) porque quem rola aqui é essa div.
  // useEffect, não callback ref: refs de filhos são anexados antes do ref do pai
  // durante o commit, então só depois do efeito é garantido que o container já não é
  // nulo. Depende de [hasMore, loading] pra reconectar sempre que a sentinela aparece/
  // some do DOM (ela só existe quando !loading && hasMore).
  React.useEffect(() => {
    const root = scrollContainerRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) carregarProximoLoteRef.current();
    }, { root, rootMargin: '600px 0px' });
    io.observe(sentinel);
    return () => io.disconnect();
  }, [hasMore, loading]);

  // Upload em lote: metadados (data/pavimento/descrição) compartilhados por todas as fotos
  // selecionadas de uma vez; insere tudo num único insert e recarrega a galeria uma só vez.
  const salvarFotos = async (metadados, files) => {
    const rows = [];
    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) {
        toast(`"${file.name}" muito grande (máx. 5 MB) — não foi enviada`, { tone: 'danger' });
        continue;
      }
      // Sufixo aleatório além do timestamp: evita colisão de path quando várias fotos
      // do mesmo lote caem no mesmo milissegundo.
      const path = `obras/${obra.id}/fotos/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
      const thumbPath = path.replace(/\.jpg$/, '_thumb.jpg');
      const [blob, thumbBlob] = await Promise.all([
        compressImagem(file, 1200, 0.82),
        compressImagem(file, 600, 0.82),
      ]);
      const { error: upErr } = await supabase.storage.from('obras-images').upload(path, blob, { contentType: 'image/jpeg' });
      if (upErr) { toast(`Erro no upload de "${file.name}": ${upErr.message}`, { tone: 'danger' }); continue; }
      // Thumbnail é "best effort": se falhar, a foto ainda é salva (thumbnail_path nulo
      // cai no fallback pra imagem original, em carregarLote) — não vale a pena
      // descartar o upload inteiro por causa só da miniatura.
      let thumbnailPath = null;
      const { error: thumbErr } = await supabase.storage.from('obras-images').upload(thumbPath, thumbBlob, { contentType: 'image/jpeg' });
      if (!thumbErr) thumbnailPath = thumbPath;
      else logger.error('falha ao subir thumbnail, segue só com a original', { module: 'obra', action: 'salvarFotos', err: thumbErr });
      // Bucket privado: a exibição é por URL assinada gerada do storage_path. A coluna
      // `url` é legada e NOT NULL — guardamos o próprio path (não geramos mais URL pública).
      rows.push({ obra_id: obra.id, url: path, storage_path: path, thumbnail_path: thumbnailPath, ...metadados });
    }
    if (rows.length === 0) return;
    const { error: dbErr } = await supabase.from('fotos_obra').insert(rows);
    if (dbErr) { toast('Erro ao salvar fotos', { tone: 'danger' }); return; }
    registrarPavimento(metadados.pavimento);
    toast(rows.length === 1 ? 'Foto salva' : `${rows.length} fotos salvas`, { tone: 'success', icon: 'check' });
    carregarLote({ reset: true });
    carregarPavimentosComFoto();
  };

  const atualizarFoto = async (id, metadados) => {
    const { error } = await supabase.from('fotos_obra').update(metadados).eq('id', id);
    if (!error) {
      registrarPavimento(metadados.pavimento);
      toast('Foto atualizada', { tone: 'success', icon: 'check' });
      carregarLote({ reset: true });
      carregarPavimentosComFoto();
    }
  };

  const excluirFoto = async (foto) => {
    const paths = [foto.storage_path, foto.thumbnail_path].filter(Boolean);
    await supabase.storage.from('obras-images').remove(paths);
    await supabase.from('fotos_obra').delete().eq('id', foto.id);
    setFotos(f => f.filter(x => x.id !== foto.id));
    setTotalCount(c => Math.max(0, c - 1));
    toast('Foto excluída', { tone: 'neutral' });
    carregarPavimentosComFoto();
  };

  // Resolve a URL assinada da imagem ORIGINAL (não o thumbnail) sob demanda — só quando
  // a foto é aberta no lightbox, nunca pro lote inteiro de uma vez.
  const garantirUrlOriginal = React.useCallback((foto) => {
    if (!foto || !foto.thumbnail_path || originalUrls[foto.id]) return; // sem thumbnail: foto.url já É a original
    supabase.storage.from('obras-images').createSignedUrl(foto.storage_path, 3600).then(({ data, error }) => {
      if (!error && data?.signedUrl) setOriginalUrls(prev => ({ ...prev, [foto.id]: data.signedUrl }));
    });
  }, [originalUrls]);

  // f.url no grid pode ser o thumbnail — baixar sempre a original, resolvendo/cacheando
  // a signed URL se ainda não tiver sido pedida (ex: baixou direto do card, sem passar
  // pelo lightbox antes). Busca o blob primeiro em vez de <a download> direto: a URL é
  // de outro domínio (Supabase Storage), e o atributo download não é confiável entre origens.
  const baixarFoto = async (foto) => {
    try {
      let url = foto.thumbnail_path ? originalUrls[foto.id] : foto.url;
      if (!url) {
        const { data, error } = await supabase.storage.from('obras-images').createSignedUrl(foto.storage_path, 3600);
        if (error || !data?.signedUrl) throw error || new Error('sem url');
        url = data.signedUrl;
        if (foto.thumbnail_path) setOriginalUrls(prev => ({ ...prev, [foto.id]: url }));
      }
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const el = document.createElement('a');
      el.href = blobUrl;
      el.download = foto.storage_path?.split('/').pop() || `foto-${foto.id}.jpg`;
      document.body.appendChild(el);
      el.click();
      el.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch {
      toast('Falha ao baixar a foto.', { tone: 'danger', icon: 'alert' });
    }
  };

  React.useLayoutEffect(() => {
    const recompute = () => {
      const H = fotosHeaderRef.current?.offsetHeight || 0;
      setFotosBodyMaxH(Math.max(200, window.innerHeight - FOTOS_STICKY_TOP - H - 24));
    };
    recompute();
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  }, [totalCount, filtroMes, filtroPavimento, pavimentosComFoto.length]);

  const semFiltro = !filtroMes && !filtroPavimento;

  return (
    <>
      <div ref={fotosHeaderRef} className="card" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '12px 16px', marginBottom: 16, flexWrap: 'wrap',
                                     position: 'sticky', top: FOTOS_STICKY_TOP, zIndex: 2 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--surface-2)',
                       padding: '3px 10px', borderRadius: 20, fontWeight: 500 }}>
          {totalCount} foto{totalCount !== 1 ? 's' : ''}
        </span>
        {!loading && (totalCount > 0 || !semFiltro) && (
          <>
            <MesAnoInput value={filtroMes} onChange={setFiltroMes} />
            {pavimentosComFoto.length > 0 && (
              <div style={{ position: 'relative', display: 'inline-flex' }}>
                <select value={filtroPavimento} onChange={e => setFiltroPavimento(e.target.value)}
                  title="Filtrar por pavimento"
                  style={{ height: 32, fontSize: 13, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)',
                           color: 'var(--text)', padding: '0 26px 0 8px', cursor: 'pointer',
                           appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none' }}>
                  <option value="">Todos os pavimentos</option>
                  {pavimentosComFoto.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <Icon name="chevron-down" size={13}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }} />
              </div>
            )}
            {!semFiltro && (
              <button className="btn btn-ghost" style={{ height: 32 }}
                onClick={() => { setFiltroMes(''); setFiltroPavimento(''); }}>
                <Icon name="x" size={13} />Limpar
              </button>
            )}
          </>
        )}
        {!readOnly && (
          <div style={{ marginLeft: 'auto' }}>
            <button className="btn btn-primary" onClick={() => setShowUpload(true)}>
              <Icon name="upload" size={15} />Upload
            </button>
          </div>
        )}
      </div>

      {loading
        ? <div className="text-muted" style={{ padding: 48, textAlign: 'center' }}>Carregando…</div>
        : fotos.length === 0
          ? semFiltro
            ? <div className="card" style={{ padding: '64px 24px', textAlign: 'center' }}>
                <Icon name="image" size={40} style={{ color: 'var(--text-faint)' }} />
                <div className="text-muted" style={{ marginTop: 12 }}>Nenhuma foto cadastrada.<br/>Clique em Upload para adicionar a primeira foto.</div>
              </div>
            : <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }}>
                <Icon name="search" size={32} style={{ color: 'var(--text-faint)' }} />
                <div className="text-muted" style={{ marginTop: 12 }}>Nenhuma foto encontrada para o filtro selecionado.</div>
              </div>
          : <div ref={scrollContainerRef} style={{ maxHeight: fotosBodyMaxH || undefined, overflowY: 'auto' }}>
              <div className="gallery">
                {fotos.map((f, i) => (
                  <div key={f.id} className="photo" style={{ position: 'relative', overflow: 'hidden', cursor: 'zoom-in' }}
                       onClick={() => setLightboxIdx(i)}>
                    <img src={f.url} alt={f.descricao || ''} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.8))', padding: '20px 10px 8px', color: '#fff', fontSize: 11.5, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                      {f.pavimento && <div style={{ fontWeight: 600 }}>{f.pavimento}</div>}
                      {f.data && <div style={{ opacity: 0.85, fontSize: 11 }}>{isoToBR(f.data)}</div>}
                      {f.descricao && <div style={{ opacity: 0.8, marginTop: 2 }}>{f.descricao}</div>}
                    </div>
                    <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4 }}>
                      <button className="icon-btn" title="Baixar foto" style={{ background: 'rgba(0,0,0,0.5)', color: '#fff', width: 28, height: 28 }}
                        onClick={e => { e.stopPropagation(); baixarFoto(f); }}><Icon name="download" size={13} /></button>
                      {!readOnly && (
                        <button className="icon-btn" style={{ background: 'rgba(0,0,0,0.5)', color: '#fff', width: 28, height: 28 }}
                          onClick={e => { e.stopPropagation(); setEditando(f); }}><Icon name="edit" size={13} /></button>
                      )}
                      {!readOnly && isAdmin && (
                        <button className="icon-btn" style={{ background: 'rgba(0,0,0,0.5)', color: '#fff', width: 28, height: 28 }}
                          onClick={e => { e.stopPropagation(); setDeleteFoto(f); }}><Icon name="trash" size={13} /></button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
              {loadingMore && <div className="text-muted" style={{ padding: '16px 0', textAlign: 'center', fontSize: 13 }}>Carregando mais fotos…</div>}
            </div>
      }
      {showUpload && <UploadFotoModal obra={obra} pavimentos={pavimentos} onSave={salvarFotos} onClose={() => setShowUpload(false)} />}
      {editando && <EditFotoModal foto={editando} pavimentos={pavimentos} onSave={(m) => { atualizarFoto(editando.id, m); setEditando(null); }} onClose={() => setEditando(null)} />}
      {lightboxIdx !== null && (
        <FotoLightbox
          fotos={fotos}
          idx={lightboxIdx}
          onNavigate={(novoIdx) => {
            setLightboxIdx(novoIdx);
            if (novoIdx >= fotos.length - 5) carregarProximoLoteRef.current();
          }}
          onClose={() => setLightboxIdx(null)}
          onDownload={baixarFoto}
          urlOriginal={originalUrls[fotos[lightboxIdx]?.id]}
          onRequestOriginal={garantirUrlOriginal}
        />
      )}
      {deleteFoto && (
        <Modal title="Excluir foto" onClose={() => setDeleteFoto(null)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setDeleteFoto(null)}>Cancelar</button>
            <button className="btn" style={{ background: 'var(--danger)', color: '#fff', fontWeight: 600 }}
              onClick={() => { excluirFoto(deleteFoto); setDeleteFoto(null); }}>
              Sim, excluir
            </button>
          </>}>
          <p style={{ fontSize: 14 }}>Tem certeza que deseja excluir esta foto? Essa ação não pode ser desfeita.</p>
        </Modal>
      )}
    </>
  );
};

// ----- Helper de compressão de imagens -----
function compressImagem(file, maxW = 1200, quality = 0.82) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(resolve, 'image/jpeg', quality);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Campo Pavimento: combobox que lista os pavimentos cadastrados na obra (mesma fonte do
// cronograma) e permite digitar livremente um novo.
const PavimentoInput = ({ value, onChange, options = [] }) => {
  const [open, setOpen] = React.useState(false);
  const [rect, setRect] = React.useState(null);
  const wrapRef = React.useRef(null);
  const inputRef = React.useRef(null);
  const menuRef = React.useRef(null);

  // Dropdown renderizado em portal (position fixed) para NÃO ficar dentro do corpo que rola do
  // modal — evita a "segunda barra de rolagem" e o conflito de fechar ao clicar na barra externa.
  // Limita a altura ao espaço disponível e abre para cima se não couber embaixo (não ultrapassa a tela).
  const abrir = () => {
    const el = inputRef.current;
    if (!el) { setOpen(true); return; }
    const r = el.getBoundingClientRect();
    const margem = 10, desejada = 240;
    const espacoAbaixo = window.innerHeight - r.bottom - margem;
    const espacoAcima  = r.top - margem;
    const paraBaixo = espacoAbaixo >= 140 || espacoAbaixo >= espacoAcima;
    const maxHeight = Math.max(80, Math.min(desejada, paraBaixo ? espacoAbaixo : espacoAcima));
    const top = paraBaixo ? r.bottom + 4 : r.top - 4 - maxHeight;
    setRect({ top, left: r.left, width: r.width, maxHeight });
    setOpen(true);
  };

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    // O menu é posicionado em pixels fixos no momento de abrir e não acompanha o
    // scroll da página — em vez de deixar flutuando no lugar errado, fecha ao rolar.
    const onWheel = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('wheel', onWheel);
    };
  }, [open]);

  const q = (value || '').toLowerCase();
  const filtered = q ? options.filter(o => o.toLowerCase().includes(q)) : options;

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input ref={inputRef} placeholder="Selecione ou digite" value={value}
        onChange={e => { onChange(e.target.value); abrir(); }}
        onFocus={abrir} style={{ width: '100%' }} />
      {open && rect && filtered.length > 0 && createPortal(
        <div ref={menuRef} style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width, zIndex: 300, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: rect.maxHeight, overflowY: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,0.14)' }}>
          {filtered.map(o => (
            <div key={o} onMouseDown={() => { onChange(o); setOpen(false); }}
              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-muted)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = ''; }}>
              {o}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
};

// ----- Modal: Upload de Foto -----
const UploadFotoModal = ({ obra, pavimentos = [], onSave, onClose }) => {
  const [files,   setFiles]   = React.useState([]); // [{ file, preview }]
  const [saving,  setSaving]  = React.useState(false);
  const [form,    setForm]    = React.useState({ data: '', pavimento: '', descricao: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const filesRef = React.useRef(files);
  filesRef.current = files;

  // Revoga todos os objectURLs no unmount (usa ref pra pegar a lista mais recente,
  // já que o array final só é conhecido no momento do cleanup)
  React.useEffect(() => {
    return () => { filesRef.current.forEach(f => URL.revokeObjectURL(f.preview)); };
  }, []);

  const onFileChange = (e) => {
    const picked = Array.from(e.target.files || []);
    if (!picked.length) return;
    const novos = picked.map(f => ({ file: f, preview: URL.createObjectURL(f) }));
    setFiles(prev => [...prev, ...novos]);
    e.target.value = ''; // permite reselecionar o mesmo arquivo depois de removido
  };

  const removerArquivo = (idx) => {
    setFiles(prev => {
      const alvo = prev[idx];
      if (alvo) URL.revokeObjectURL(alvo.preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const [erros, setErros] = React.useState({});

  const handleSave = async () => {
    const novosErros = {};
    if (!files.length) novosErros.arquivo = 'Selecione ao menos uma foto.';
    if (!form.data) novosErros.data = 'Preencha a data.';
    if (!form.pavimento.trim()) novosErros.pavimento = 'Preencha o pavimento.';
    setErros(novosErros);
    if (Object.keys(novosErros).length) return;
    setSaving(true);
    try {
      await onSave(form, files.map(f => f.file));
      onClose();
    } catch (e) {
      // onSave normalmente já exibe o toast de erro; mantém o modal aberto para nova tentativa
      logger.error('falha ao salvar foto', { module: 'obra', action: 'salvarFoto', err: e });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Upload de Foto" onClose={onClose} draggable overlay={false}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          <Icon name="upload" size={14} />{saving ? 'Salvando…' : (files.length > 1 ? `Salvar ${files.length} fotos` : 'Salvar foto')}
        </button>
      </>}
    >
      <div className="stack">
        {files.length === 0
          ? <label style={{ display: 'block', border: '2px dashed ' + (erros.arquivo ? 'var(--danger)' : 'var(--border)'), borderRadius: 8, padding: '40px 24px', textAlign: 'center', cursor: 'pointer' }}>
              <Icon name="image" size={32} />
              <div style={{ marginTop: 8, color: 'var(--text-muted)' }}>Clique para selecionar uma ou mais imagens</div>
              {erros.arquivo && <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--danger)' }}>{erros.arquivo}</div>}
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple style={{ display: 'none' }} onChange={e => { onFileChange(e); setErros(er => ({ ...er, arquivo: undefined })); }} />
            </label>
          : (
            <div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                {files.map((f, i) => (
                  <div key={i} style={{ position: 'relative', width: 72, height: 72 }}>
                    <img src={f.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
                    <button type="button" className="icon-btn"
                      style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, background: 'var(--danger)', color: '#fff' }}
                      onClick={() => removerArquivo(i)}>
                      <Icon name="x" size={11} />
                    </button>
                  </div>
                ))}
                <label style={{ width: 72, height: 72, border: '2px dashed var(--border)', borderRadius: 8,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)' }}>
                  <Icon name="plus" size={18} />
                  <input type="file" accept="image/jpeg,image/png,image/webp" multiple style={{ display: 'none' }} onChange={onFileChange} />
                </label>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {files.length} foto{files.length !== 1 ? 's' : ''} selecionada{files.length !== 1 ? 's' : ''} — mesma descrição e pavimento serão aplicados a todas.
              </div>
            </div>
          )
        }
        <div className="form-grid">
          <div className="field">
            <label>Data <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input type="date" value={form.data} onChange={e => { set('data', e.target.value); setErros(er => ({ ...er, data: undefined })); }} />
            {erros.data && <div style={{ fontSize: 11.5, color: 'var(--danger)', marginTop: 3 }}>{erros.data}</div>}
          </div>
          <div className="field">
            <label>Pavimento <span style={{ color: 'var(--danger)' }}>*</span></label>
            <PavimentoInput value={form.pavimento} onChange={v => { set('pavimento', v); setErros(er => ({ ...er, pavimento: undefined })); }} options={pavimentos} />
            {erros.pavimento && <div style={{ fontSize: 11.5, color: 'var(--danger)', marginTop: 3 }}>{erros.pavimento}</div>}
          </div>
          <div className="field full">
            <label>Descrição</label>
            <input placeholder="Descreva o que aparece na foto" value={form.descricao} onChange={e => set('descricao', e.target.value)} />
          </div>
        </div>
      </div>
    </Modal>
  );
};

// ----- Modal: Editar Foto -----
const EditFotoModal = ({ foto, pavimentos = [], onSave, onClose }) => {
  const [form, setForm] = React.useState({ data: foto.data || '', pavimento: foto.pavimento || '', descricao: foto.descricao || '' });
  const [erros, setErros] = React.useState({});
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const handleSave = () => {
    const novosErros = {};
    if (!form.data) novosErros.data = 'Preencha a data.';
    if (!form.pavimento.trim()) novosErros.pavimento = 'Preencha o pavimento.';
    setErros(novosErros);
    if (Object.keys(novosErros).length) return;
    onSave(form);
    onClose();
  };
  return (
    <Modal title="Editar informações da foto" onClose={onClose} draggable overlay={false}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={handleSave}>
          <Icon name="check" size={14} />Salvar
        </button>
      </>}
    >
      <div className="form-grid">
        <div className="field">
          <label>Data <span style={{ color: 'var(--danger)' }}>*</span></label>
          <input type="date" value={form.data} onChange={e => { set('data', e.target.value); setErros(er => ({ ...er, data: undefined })); }} />
          {erros.data && <div style={{ fontSize: 11.5, color: 'var(--danger)', marginTop: 3 }}>{erros.data}</div>}
        </div>
        <div className="field">
          <label>Pavimento <span style={{ color: 'var(--danger)' }}>*</span></label>
          <PavimentoInput value={form.pavimento} onChange={v => { set('pavimento', v); setErros(er => ({ ...er, pavimento: undefined })); }} options={pavimentos} />
          {erros.pavimento && <div style={{ fontSize: 11.5, color: 'var(--danger)', marginTop: 3 }}>{erros.pavimento}</div>}
        </div>
        <div className="field full">
          <label>Descrição</label>
          <input placeholder="Descreva o que aparece na foto" value={form.descricao} onChange={e => set('descricao', e.target.value)} />
        </div>
      </div>
    </Modal>
  );
};

// ----- Hero Image com upload -----
const HeroImage = ({ obra, onObraUpdate, isAdmin = false }) => {
  const toast = useToast();
  const [uploading, setUploading] = React.useState(false);
  // Já nasce com a URL assinada da miniatura da lista de Obras, se tiver sido buscada
  // há pouco (capaCache) — evita mostrar o placeholder vazio e rebaixar pra uma URL
  // nova (que quebraria o cache HTTP da imagem já baixada) toda vez que a pessoa clica
  // num card pra abrir a obra.
  const [heroSrc, setHeroSrc]     = React.useState(() => capaCache.get(obra.id));
  const [confirmRemover, setConfirmRemover] = React.useState(false);
  // Ajuste de qual pedaço da foto aparece na miniatura (cards da lista de Obras — essa
  // miniatura é pequena e sempre corta a foto; a capa grande aqui na página não corta
  // mais nada, então serve de "área de trabalho" pra escolher o ponto focal do corte.
  const [adjustMode, setAdjustMode] = React.useState(false);
  const [pos, setPos] = React.useState({ x: obra.capaPos?.x ?? 50, y: obra.capaPos?.y ?? 50 });
  const [frameSize, setFrameSize] = React.useState({ w: 480, h: 340 });
  const inputRef = React.useRef();
  const frameRef = React.useRef();
  const isDraggingRef = React.useRef(false);
  const dragOriginRef = React.useRef({ x: 0, y: 0 });
  const dragStartPosRef = React.useRef({ x: 50, y: 50 });

  React.useEffect(() => {
    if (adjustMode) return;
    setPos({ x: obra.capaPos?.x ?? 50, y: obra.capaPos?.y ?? 50 });
  }, [obra.id, obra.capaPos?.x, obra.capaPos?.y, adjustMode]);

  // Mede o quadro (a foto agora tem tamanho natural, não fixo) pra posicionar/dimensionar
  // a janela de recorte proporcionalmente, e acompanha se ele mudar de tamanho.
  React.useEffect(() => {
    if (!adjustMode) return;
    const el = frameRef.current;
    if (!el) return;
    const update = () => { const r = el.getBoundingClientRect(); setFrameSize({ w: r.width, h: r.height }); };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [adjustMode]);

  const iniciarAjuste = () => { setPos({ x: obra.capaPos?.x ?? 50, y: obra.capaPos?.y ?? 50 }); setAdjustMode(true); };
  const cancelarAjuste = () => { setPos({ x: obra.capaPos?.x ?? 50, y: obra.capaPos?.y ?? 50 }); setAdjustMode(false); };
  const salvarAjuste = () => {
    onObraUpdate({ ...obra, capaPos: pos });
    setAdjustMode(false);
    toast('Posição da miniatura salva', { tone: 'success', icon: 'check' });
  };

  // Janela de recorte: mesma proporção aproximada da miniatura da lista de Obras
  // (.obra-card-img, 164px de altura por um card mais largo). Sempre a maior possível
  // dentro do quadro (só encolhe no eixo que precisa, pra caber).
  const WIN_ASPECT = 1.7;
  let winW = frameSize.w;
  let winH = winW / WIN_ASPECT;
  if (winH > frameSize.h) { winH = frameSize.h; winW = winH * WIN_ASPECT; }
  // `pos.x/y` guarda o MESMO valor usado como object-position na miniatura (0-100%,
  // igual ao CSS) — não o centro da janela. As duas coisas só coincidem quando a janela
  // é pequena; aqui ela costuma ocupar quase o quadro todo, então a diferença é grande.
  // object-position X% == "X% da folga (quadro - janela) fica escondida antes da janela
  // começar" — por isso a posição da janela vem da FOLGA, não do quadro inteiro.
  const excessW = Math.max(0, frameSize.w - winW);
  const excessH = Math.max(0, frameSize.h - winH);
  const winLeft = (pos.x / 100) * excessW;
  const winTop  = (pos.y / 100) * excessH;

  // Arrasta a JANELA de recorte (a foto fica parada) — mais direto que arrastar a foto
  // por baixo de uma janela fixa, e mais fácil de acompanhar visualmente.
  const onWindowMouseDown = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    isDraggingRef.current = true;
    dragOriginRef.current = { x: ev.clientX, y: ev.clientY };
    dragStartPosRef.current = { ...pos };
  };
  const onFrameMouseMove = (ev) => {
    if (!isDraggingRef.current) return;
    const dx = ev.clientX - dragOriginRef.current.x;
    const dy = ev.clientY - dragOriginRef.current.y;
    const nx = excessW > 0 ? Math.min(100, Math.max(0, dragStartPosRef.current.x + (dx / excessW) * 100)) : dragStartPosRef.current.x;
    const ny = excessH > 0 ? Math.min(100, Math.max(0, dragStartPosRef.current.y + (dy / excessH) * 100)) : dragStartPosRef.current.y;
    setPos({ x: nx, y: ny });
  };
  const onFrameMouseUp = () => { isDraggingRef.current = false; };

  // Bucket privado: a capa é exibida via URL assinada do caminho determinístico.
  React.useEffect(() => {
    let alive = true;
    if (!obra.imageUrl) { setHeroSrc(null); return; }
    const cached = capaCache.get(obra.id);
    if (cached) { setHeroSrc(cached); return; }
    supabase.storage.from('obras-images')
      .createSignedUrl(`obras/${obra.id}/capa.jpg`, 3600)
      .then(({ data }) => {
        if (!alive) return;
        setHeroSrc(data?.signedUrl || null);
        if (data?.signedUrl) capaCache.set(obra.id, data.signedUrl);
      })
      .catch(err => logger.error('falha ao carregar capa', { module: 'obra', action: 'carregarCapa', err }));
    return () => { alive = false; };
  }, [obra.id, obra.imageUrl]);

  const handleFile = async (file) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      toast('Formato não suportado. Use JPG, PNG ou WEBP.', { tone: 'error' });
      return;
    }
    // Limite generoso: a imagem é comprimida (compressImagem) antes do upload, então o
    // tamanho final salvo é bem menor que o arquivo original — só barra algo fora do razoável.
    if (file.size > 20 * 1024 * 1024) {
      toast('Imagem muito grande. Máximo: 20 MB', { tone: 'danger' });
      return;
    }
    setUploading(true);
    const blob = await compressImagem(file);
    const path = `obras/${obra.id}/capa.jpg`;
    const { error } = await supabase.storage.from('obras-images').upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
    if (error) {
      toast('Erro no upload: ' + error.message, { tone: 'danger' });
      setUploading(false);
      return;
    }
    const { data: signed } = await supabase.storage.from('obras-images').createSignedUrl(path, 3600);
    setHeroSrc(signed?.signedUrl || null);
    if (signed?.signedUrl) capaCache.set(obra.id, signed.signedUrl);
    // Guarda o caminho (marcador de "tem capa"); a exibição sempre re-assina.
    onObraUpdate({ ...obra, imageUrl: path });
    toast('Imagem salva com sucesso', { tone: 'success', icon: 'check' });
    setUploading(false);
  };

  const removerCapa = async () => {
    setUploading(true);
    const path = `obras/${obra.id}/capa.jpg`;
    await supabase.storage.from('obras-images').remove([path]);
    setHeroSrc(null);
    capaCache.clear(obra.id);
    onObraUpdate({ ...obra, imageUrl: null });
    toast('Imagem da capa removida', { tone: 'neutral' });
    setUploading(false);
    setConfirmRemover(false);
  };

  const src = heroSrc;
  const canUpload = isAdmin && !!onObraUpdate;

  return (
    <div
      ref={frameRef}
      className={'hero-img' + (src ? ' has-img' : '') + (uploading ? ' hero-img-uploading' : '')}
      onClick={() => !adjustMode && canUpload && !uploading && inputRef.current?.click()}
      onMouseMove={onFrameMouseMove}
      onMouseUp={onFrameMouseUp}
      onMouseLeave={onFrameMouseUp}
      style={{ cursor: adjustMode ? 'default' : (canUpload ? 'pointer' : 'default') }}
    >
      {src && <img src={src} alt={obra.nome} draggable={false} />}
      {!src && <span>1280 × 720</span>}
      {canUpload && !adjustMode && (
        <>
          <div className="hero-img-overlay">
            {uploading ? (
              <span>Processando…</span>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <span>{src ? 'Alterar imagem' : 'Adicionar imagem'}</span>
              </>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]); e.target.value = ''; }}
          />
        </>
      )}
      {canUpload && src && !uploading && !adjustMode && (
        <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6, zIndex: 2 }}>
          <button type="button" className="icon-btn"
            style={{ background: 'rgba(0,0,0,0.55)', color: '#fff', width: 28, height: 28 }}
            onClick={e => { e.stopPropagation(); iniciarAjuste(); }} title="Ajustar miniatura">
            <Icon name="move" size={13} />
          </button>
          <button type="button" className="icon-btn"
            style={{ background: 'rgba(0,0,0,0.55)', color: '#fff', width: 28, height: 28 }}
            onClick={e => { e.stopPropagation(); setConfirmRemover(true); }} title="Remover capa">
            <Icon name="trash" size={13} />
          </button>
        </div>
      )}
      {adjustMode && (
        <>
          <div
            onMouseDown={onWindowMouseDown}
            style={{
              position: 'absolute', left: winLeft, top: winTop, width: winW, height: winH,
              border: '2px solid #fff', borderRadius: 6,
              boxShadow: '0 0 0 2000px rgba(0,0,0,0.55)',
              cursor: isDraggingRef.current ? 'grabbing' : 'grab',
              zIndex: 3,
            }}
          />
          <div onMouseDown={e => e.stopPropagation()}
            style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 4,
                     background: 'rgba(0,0,0,0.75)', padding: '5px 10px', borderRadius: 8, maxWidth: '92%' }}>
            <span style={{ color: '#fff', fontSize: 11.5, whiteSpace: 'nowrap' }}>Arraste para ajustar</span>
          </div>
          <div onMouseDown={e => e.stopPropagation()}
            style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 4,
                     display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.75)', padding: '8px 10px', borderRadius: 10 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={cancelarAjuste}>Cancelar</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={salvarAjuste}>Salvar</button>
          </div>
        </>
      )}
      {confirmRemover && (
        <Modal title="Remover capa" onClose={() => setConfirmRemover(false)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setConfirmRemover(false)}>Cancelar</button>
            <button className="btn" style={{ background: 'var(--danger)', color: '#fff', fontWeight: 600 }} onClick={removerCapa}>
              Sim, remover
            </button>
          </>}>
          <p style={{ fontSize: 14 }}>Tem certeza que deseja remover a imagem de capa desta obra?</p>
        </Modal>
      )}
    </div>
  );
};

// ----- Main ObraDetail -----
const ObraDetail = ({ obra, userProfile, onBack, onObraUpdate, onObraDelete, onOpenCronograma }) => {
  // Sempre abre em "Visão geral" ao entrar numa obra — antes ficava salvo em
  // sessionStorage sem distinguir qual obra, então abrir a obra B na aba "Fotos"
  // reaproveitava a aba que tinha ficado selecionada na obra A.
  const [tab, setTab] = React.useState('visao');
  const [cronoView, setCronoView] = React.useState('gantt');
  const [cronoCollapsed, setCronoCollapsed] = React.useState(() => new Set()); // grupos recolhidos na mini-Lista
  const [showEdit,   setShowEdit]   = React.useState(false);
  const [deleteStep, setDeleteStep] = React.useState(0);
  const D = AppData;
  const o = obra || D.obraAtual;
  const readOnly = moduloSomenteLeitura(userProfile, 'obras');

  // Busca as etapas do cronograma da obra — não depende de o usuário já ter aberto o módulo Cronograma
  const [etapasObra, setEtapasObra] = React.useState(() => AppData.cronograma[o.id] || []);

  // Card "Cronograma físico" gruda sob a topbar ao rolar (mesmo padrão de Orcamentos.jsx:
  // STICKY_TOP = topbar 60px + 32px de respiro); o corpo (Gantt/Lista) ganha scroll próprio
  // limitado ao espaço restante da viewport, para o cabeçalho do card ficar sempre visível.
  const CRONO_STICKY_TOP = 92;
  const cronoHeaderRef = React.useRef(null);
  const [cronoBodyMaxH, setCronoBodyMaxH] = React.useState(null);
  React.useLayoutEffect(() => {
    const recompute = () => {
      const H = cronoHeaderRef.current?.offsetHeight || 0;
      setCronoBodyMaxH(Math.max(200, window.innerHeight - CRONO_STICKY_TOP - H - 24));
    };
    recompute();
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  }, [etapasObra.length, cronoView]);
  const [etapasLoaded, setEtapasLoaded] = React.useState(!!AppData.cronograma[o.id]?.length);
  // Linhas de base do cronograma — usadas na Curva S da Visão Geral como "Previsto".
  const [baselinesObra, setBaselinesObra] = React.useState([]);

  React.useEffect(() => {
    let cancelled = false;
    // Pinta o cache imediatamente para não piscar, mas SEMPRE rebusca do banco
    // (fonte da verdade). Assim edições/exclusões feitas no módulo Cronograma
    // se refletem aqui ao reabrir a obra, sem ficar "fixo" num cache antigo.
    const cache = AppData.cronograma[o.id];
    if (cache?.length) { setEtapasObra(cache); setEtapasLoaded(true); }
    else setEtapasLoaded(false);
    // maybeSingle: cronograma inexistente/apagado retorna data=null (sem erro)
    supabase.from('cronogramas').select('etapas, baselines').eq('obra_id', o.id).maybeSingle().then(({ data, error }) => {
      if (cancelled) return;
      if (error) { setEtapasLoaded(true); return; } // falha de rede: mantém o que já havia
      const etapas = data?.etapas ? migrateEtapas(data.etapas) : []; // apagado = vazio (não volta pro cache)
      AppData.cronograma[o.id] = etapas; // mantém o cache compartilhado com o módulo Cronograma
      setEtapasObra(etapas);
      setBaselinesObra(data?.baselines || []);
      setEtapasLoaded(true);
    });
    return () => { cancelled = true; };
  }, [o.id]);

  // Vínculos orçamento × cronograma — mesmo peso usado pelo Cronograma no cálculo do avanço
  // físico (ver Cronograma.jsx `avancoTotal`), senão o % daqui diverge do módulo Cronograma
  // sempre que a obra tiver itens de orçamento vinculados a etapas.
  const [vinculosObra, setVinculosObra] = React.useState([]);
  const [orcamentoItensMapObra, setOrcamentoItensMapObra] = React.useState({});
  React.useEffect(() => {
    let cancelled = false;
    vinculoService.listarPorObra(o.id).then(({ data }) => {
      if (cancelled) return;
      if (!data?.length) { setVinculosObra([]); setOrcamentoItensMapObra({}); return; }
      setVinculosObra(data);
      const m = {};
      data.forEach(v => { if (v.orcamento_itens) m[v.orcamento_item_id] = itemValor(v.orcamento_itens); });
      setOrcamentoItensMapObra(m);
    });
    return () => { cancelled = true; };
  }, [o.id]);

  const cronFinalISO = etapasObra.length
    ? offsetToISO(Math.max(...etapasObra.map(e => (e.inicio || 0) + (e.dur || 0))))
    : null;

  // Avanço físico real + planejado acumulado até hoje (para o cabeçalho da obra).
  // Mesmo critério físico da Curva: distribuição por duração das tarefas.
  const custoOrcadoMapObra = React.useMemo(() => {
    const valorVinculadoMapObra = computeValorVinculadoMap(etapasObra, vinculosObra, orcamentoItensMapObra);
    return computeCustoOrcadoMap(etapasObra, valorVinculadoMapObra);
  }, [etapasObra, vinculosObra, orcamentoItensMapObra]);
  const heroStats = React.useMemo(() => {
    const avancoFisico = computeAvancoFisico(etapasObra, custoOrcadoMapObra);
    const months = getMonthRange(etapasObra);
    let planejadoHoje = 0;
    if (months.length) {
      const durW = {}; etapasObra.forEach(e => { if (!e.isGroup) durW[e.id] = Math.max(1, e.dur || 1); });
      const dist = computeMonthlyDist(etapasObra, durW);
      const t = {}; months.forEach(m => { t[m.key] = 0; });
      Object.values(dist).forEach(d => months.forEach(m => { t[m.key] += (d[m.key] || 0); }));
      const grand = months.reduce((s, m) => s + t[m.key], 0) || 1;
      const now = new Date();
      const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      let acc = 0;
      for (const m of months) { acc += t[m.key]; if (m.key >= todayKey) break; }
      planejadoHoje = acc / grand * 100;
    }
    return { avancoFisico, planejadoHoje };
  }, [etapasObra, custoOrcadoMapObra]);

  // Valores agregados dos grupos (avanço/início/dur a partir dos filhos) — para a mini-Lista.
  const groupValsObra = React.useMemo(() => computeGroupValues(etapasObra, custoOrcadoMapObra), [etapasObra, custoOrcadoMapObra]);

  // Nível máximo de grupo (para os botões N1/N2/... de recolher por nível na mini-Lista).
  const maxGroupNivelObra = React.useMemo(
    () => etapasObra.filter(e => e.isGroup).reduce((m, e) => Math.max(m, e.nivel || 0), 0),
    [etapasObra]
  );
  const collapseToLevelObra = (maxNivel) => {
    if (maxNivel < 0) { setCronoCollapsed(new Set()); return; }
    setCronoCollapsed(new Set(etapasObra.filter(e => e.isGroup && (e.nivel || 0) === maxNivel).map(e => e.id)));
  };

  const tabs = [
    { id: 'visao',      label: 'Visão geral' },
    { id: 'cronograma', label: 'Cronograma'  },
    { id: 'fotos',      label: 'Fotos'       },
  ].map(t => ({ ...t, locked: !podeVerAba(userProfile, 'obras', t.id) }));
  const tabsLiberadas = tabs.filter(t => !t.locked);

  // Se a aba salva não estiver liberada para este usuário, cai na primeira permitida
  React.useEffect(() => {
    if (tabsLiberadas.length && !tabsLiberadas.some(t => t.id === tab)) setTab(tabsLiberadas[0].id);
  }, [tabsLiberadas, tab]);

  return (
    <>
      <div className="page-header" style={{ marginBottom: 18 }}>
        <div>
          <div className="row" style={{ gap: 8, marginBottom: 6 }}>
            <button className="btn btn-sm btn-ghost" onClick={onBack}><Icon name="chevron-left" size={13} />Voltar</button>
            <span className={'badge ' + (o.status === 'concluida' ? 'success' : 'info')}>
              <span className="dot"></span>{o.status === 'concluida' ? 'Concluída' : 'Em execução'}
            </span>
          </div>
        </div>
        {onObraUpdate && onObraDelete && !readOnly && isAdmin(userProfile) && (
          <div className="page-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setShowEdit(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Editar
            </button>
            {isAdmin(userProfile) && (
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setDeleteStep(1)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
                Excluir
              </button>
            )}
          </div>
        )}
      </div>

      {/* HERO */}
      <div className="hero" style={{ marginBottom: 20 }}>
        <HeroImage obra={o} onObraUpdate={onObraUpdate} isAdmin={isAdmin(userProfile)} />
        <div className="hero-body">
          <div className="hero-meta">
            <span className="code">{o.sigla || o.id}</span>
            <span>·</span>
            <span className="row" style={{ gap: 4 }}><Icon name="map-pin" size={12} /> {o.endereco}</span>
          </div>
          <h1 className="hero-title">{o.nome}</h1>
          <div className="hero-stats">
            <div className="hero-stat">
              <div className="label">Avanço físico</div>
              <div className="value num" style={{ color: 'var(--brand)' }}>{heroStats.avancoFisico.toFixed(2)}%</div>
              <div className="meta">vs planejado {heroStats.planejadoHoje.toFixed(2)}%</div>
            </div>
            <div className="hero-stat">
              <div className="label">Fim do cronograma</div>
              <div className="value num">{cronFinalISO ? cronFinalISO.split('-').reverse().join('/') : '—'}</div>
              {(!etapasLoaded || !cronFinalISO) && (
                <div className="meta">{!etapasLoaded ? 'Carregando…' : 'Sem cronograma'}</div>
              )}
            </div>
            <div className="hero-stat">
              <div className="label">Data fim da obra</div>
              <div className="value num">{o.dataFimObra ? o.dataFimObra.split('-').reverse().join('/') : '—'}</div>
            </div>
            <div className="hero-stat">
              <div className="label">Entrega (cliente)</div>
              <div className="value num">{o.previsto ? o.previsto.split('-').reverse().join('/') : '—'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="tabs">
        {tabs.map(t => {
          const ativo = tab === t.id;
          return (
            <button
              key={t.id}
              className={'tab' + (ativo ? ' active' : '') + (t.locked ? ' locked' : '')}
              title={t.locked ? 'Sem acesso a esta aba. Fale com o administrador.' : undefined}
              aria-disabled={t.locked || undefined}
              onClick={t.locked ? undefined : () => setTab(t.id)}
              style={ativo ? { background: 'var(--brand)', color: '#fff', borderRadius: 8, borderBottomColor: 'transparent' } : undefined}>
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'visao' && <VisaoGeral etapas={etapasObra} etapasLoaded={etapasLoaded} baselines={baselinesObra} />}
      {tab === 'cronograma' && (
        <div className="card" style={{ position: 'sticky', top: CRONO_STICKY_TOP, zIndex: 2 }}>
          <div className="card-header" ref={cronoHeaderRef}>
            <div>
              <div className="card-title">Cronograma físico</div>
              <div className="card-subtitle">
                {etapasObra.length} etapas{etapasObra.length ? ` · ${computeJanela(etapasObra)?.totalMeses ?? 0} meses` : ''}
              </div>
            </div>
            <div className="card-actions">
              <button className={'chip' + (cronoView === 'gantt' ? ' active' : '')} onClick={() => setCronoView('gantt')}
                style={cronoView === 'gantt' ? { background: 'var(--brand)', borderColor: 'var(--brand)', color: '#fff' } : undefined}>Gantt</button>
              <button className={'chip' + (cronoView === 'lista' ? ' active' : '')} onClick={() => setCronoView('lista')}
                style={cronoView === 'lista' ? { background: 'var(--brand)', borderColor: 'var(--brand)', color: '#fff' } : undefined}>Lista</button>
              <button className="btn btn-sm btn-primary" onClick={() => onOpenCronograma && onOpenCronograma(o.id)}>
                <Icon name="arrow-right" size={13} />Ir para Cronograma
              </button>
            </div>
          </div>
          <div className="card-body" style={{ padding: '4px 0 0' }}>
            {cronoView === 'gantt' && <Gantt etapas={etapasObra} maxHeight={cronoBodyMaxH} />}
            {cronoView === 'lista' && (() => {
              const thS = { padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600,
                            color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em',
                            position: 'sticky', top: 0, zIndex: 1, background: 'var(--brand)' };
              const tdS = { padding: '10px 12px', fontSize: 13, borderBottom: '1px solid var(--border-subtle)' };
              return (
                <div style={{ overflowX: 'auto', maxHeight: cronoBodyMaxH || undefined, overflowY: 'auto' }}>
                  {etapasObra.some(e => e.isGroup) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nível:</span>
                      <span style={{ display: 'flex', gap: 2 }}>
                        {Array.from({ length: maxGroupNivelObra + 1 }, (_, nivel) => (
                          <button key={nivel} className="orca-row-btn" title={`Mostrar até nível ${nivel + 1}`}
                            style={{ width: 22, height: 20, fontSize: 10, fontWeight: 600 }}
                            onClick={() => collapseToLevelObra(nivel)}>
                            N{nivel + 1}
                          </button>
                        ))}
                        <button className="orca-row-btn" title="Expandir tudo"
                          style={{ width: 22, height: 20, fontSize: 10, fontWeight: 600 }}
                          onClick={() => collapseToLevelObra(-1)}>≡</button>
                      </span>
                    </div>
                  )}
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={thS}>Etapa</th>
                        <th style={thS}>Início</th>
                        <th style={thS}>Término</th>
                        <th style={thS}>Duração</th>
                        <th style={thS}>Avanço</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        // Linha de Resumo do Projeto (agrega toda a obra)
                        const rows = [];
                        if (etapasObra.length) {
                          const ini = Math.min(...etapasObra.map(e => e.inicio || 0));
                          const fim = Math.max(...etapasObra.map(e => (e.inicio || 0) + (e.dur || 0)));
                          const av = Math.round(computeAvancoFisico(etapasObra, custoOrcadoMapObra));
                          rows.push(
                            <tr key="resumo-projeto" style={{ background: 'var(--brand-50)' }}>
                              <td style={{ ...tdS, fontWeight: 800, color: 'var(--brand)' }}>Resumo do projeto</td>
                              <td style={tdS}>{isoToBR(offsetToISO(ini))}</td>
                              <td style={tdS}>{isoToBR(offsetToISO(fim))}</td>
                              <td style={tdS}>{fim - ini}d</td>
                              <td style={tdS}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 100 }}>
                                  <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2 }}>
                                    <div style={{ width: av + '%', height: '100%', background: 'var(--brand)', borderRadius: 2 }} />
                                  </div>
                                  <span style={{ minWidth: 32, textAlign: 'right', fontWeight: 800 }}>{av}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        }
                        // Aplica recolhimento: esconde descendentes de grupos recolhidos
                        let hideUntil = null;
                        etapasObra.forEach((e, i) => {
                          const niv = e.nivel || 0;
                          if (hideUntil !== null) {
                            if (niv > hideUntil) return;   // ainda dentro do grupo recolhido
                            hideUntil = null;
                          }
                          const isPai = !!e.isGroup;
                          const colapsado = isPai && cronoCollapsed.has(e.id);
                          if (isPai && colapsado) hideUntil = niv;
                          const gv = isPai ? groupValsObra[e.id] : null;
                          const av = Math.round(gv ? gv.avanco : (e.avanco || 0)); // pai = rollup dos filhos
                          const rowBg = isPai ? 'var(--brand-50)' : undefined;
                          const tdPai = isPai ? { ...tdS, fontWeight: 700 } : tdS;
                          rows.push(
                            <tr key={i} style={{ background: rowBg }}>
                              <td style={{ ...tdPai, paddingLeft: 12 + niv * 14, color: isPai ? 'var(--brand)' : undefined }}>
                                {isPai
                                  ? <span onClick={() => setCronoCollapsed(prev => { const n = new Set(prev); n.has(e.id) ? n.delete(e.id) : n.add(e.id); return n; })}
                                      title={colapsado ? 'Expandir' : 'Recolher'}
                                      style={{ color: 'var(--text-muted)', marginRight: 5, fontSize: 10, cursor: 'pointer', userSelect: 'none' }}>{colapsado ? '▸' : '▾'}</span>
                                  : null}
                                {e.etapa}
                              </td>
                              <td style={tdPai}>{isoToBR(offsetToISO(e.inicio))}</td>
                              <td style={tdPai}>{isoToBR(offsetToISO((e.inicio || 0) + (e.dur || 0)))}</td>
                              <td style={tdPai}>{e.dur}d</td>
                              <td style={tdPai}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 100 }}>
                                  <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2 }}>
                                    <div style={{ width: av + '%', height: '100%', background: 'var(--brand)', borderRadius: 2 }} />
                                  </div>
                                  <span style={{ minWidth: 32, textAlign: 'right' }}>{av}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        });
                        return rows;
                      })()}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        </div>
      )}
      {tab === 'fotos' && <Fotos obra={o} readOnly={readOnly || abaSomenteLeitura(userProfile, 'obras', 'fotos')} isAdmin={isAdmin(userProfile)} />}

      {showEdit && (
        <ObraFormModal
          obra={o}
          onClose={() => setShowEdit(false)}
          onSave={(updated) => { onObraUpdate(updated); setShowEdit(false); }}
        />
      )}

      {deleteStep > 0 && (
        <Modal
          title={deleteStep === 1 ? 'Excluir obra' : 'Confirmação final'}
          onClose={() => setDeleteStep(0)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setDeleteStep(0)}>Cancelar</button>
              <button
                className="btn"
                style={{ background: 'var(--danger)', color: 'white', fontWeight: 600 }}
                onClick={() => {
                  if (deleteStep === 1) { setDeleteStep(2); return; }
                  onObraDelete(o.id);
                }}
              >
                {deleteStep === 1 ? 'Sim, excluir' : 'Confirmar exclusão'}
              </button>
            </>
          }
        >
          {deleteStep === 1 ? (
            <p style={{ fontSize: 14 }}>
              Tem certeza que deseja excluir a obra <strong>{o.nome}</strong> ({o.sigla || o.id})?
            </p>
          ) : (
            <div>
              <p style={{ fontSize: 14, marginBottom: 10 }}>
                Esta ação é <strong style={{ color: 'var(--danger)' }}>irreversível</strong>. Todos os dados da obra serão removidos.
              </p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Obra: <strong>{o.nome}</strong>
              </p>
              <p style={{ fontSize: 14, marginTop: 12, fontWeight: 600 }}>Deseja realmente continuar?</p>
            </div>
          )}
        </Modal>
      )}
    </>
  );
};

export { ObraDetail, FotoLightbox };
