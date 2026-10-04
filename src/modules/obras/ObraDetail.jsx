import React from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../components/Icons';
import { AppData } from '../../utils/data';
import { supabase } from '../../services/supabase';
import { logger } from '../../services/logger';
import { friendlyError } from '../../utils/friendlyError';
import { formatBytes } from '../../utils/formatters';
import { Modal, ObraFormModal, useToast } from '../../components/Modals';
import { podeVerAba, moduloSomenteLeitura, isAdmin, abaSomenteLeitura } from '../../utils/permissions';
import { useIsMobile } from '../../utils/useIsMobile';
import { migrateEtapas, offsetToISO, offsetToDate, dateToOffset, computeValorVinculadoMap, computeCustoOrcadoMap } from '../cronograma/ganttUtils';
import { isoToBR, taskEnd, taskEndDisplay } from '../cronograma/cronogramaDateUtils';
import { computeGroupValues, computeAvancoFisico, effStatus } from '../cronograma/scheduleEngine';
import { fisicoFinanceiroService } from '../fisicoFinanceiro/fisicoFinanceiro.service';
import { getLinhaTotal } from '../fisicoFinanceiro/fisicoFinanceiroPure';
import { distDeRetrato, defaultBlId, carregarBlVisivel, percentualPlanejadoAte } from '../cronograma/curvaFisica';

import { pavimentosFotosService } from '../../services/pavimentosFotos.service';
import { offlineCache } from '../../services/offlineCache';
import { offlineQueue } from '../../services/offlineQueue';
import { fotosService } from './fotos.service';
import { useSemRede, useRetryOnReconnect, connectivity, isNetworkError } from '../../utils/connectivity';
import { ehFalhaPassageira } from '../../utils/offlinePure';
import { AvisoOffline } from '../../components/OfflineFallback';
import { ordenarFotosPorPavimento, posicaoPavimento, moverNaLista, nomeDaCopia, inserirDepois, nomeArquivoFoto, nomesUnicos } from '../../utils/pavimentos';
import { zipSync } from 'fflate';
import { vinculoService, itemValor } from '../financeiro/vinculoService';import { capaCache } from '../../services/capaCache';

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

const LABEL_W_KEY = 'obra_gantt_label_w';
const LABEL_W_PADRAO = 220, LABEL_W_MIN = 160, LABEL_W_MAX = 600;

const Gantt = ({ etapas, resumoOnly = false, maxHeight }) => {
  // "Cronograma resumido" mostra só o Nível 1 (grupos de topo, nivel 0) — antes pegava
  // TODOS os grupos (isGroup), inclusive subgrupos aninhados (ex.: "BL2" dentro de
  // "FUNDAÇÃO", "CHAPISCO EXTERNO" dentro de "REVESTIMENTO EXTERNO"), fugindo do resumo.
  // Cai pra "todo grupo" ou "tudo" se a EAP não tiver nenhum grupo de nivel 0, pra nunca
  // deixar o card vazio.
  const gruposTopo = etapas.filter(e => e.isGroup && (e.nivel || 0) === 0);
  const gruposTodos = etapas.filter(e => e.isGroup);
  const rows = resumoOnly
    ? (gruposTopo.length ? gruposTopo : gruposTodos.length ? gruposTodos : etapas)
    : etapas;

  // Recolher grupos (só faz sentido na visão completa — resumoOnly já mostra só os grupos).
  const [collapsed, setCollapsed] = React.useState(() => new Set());
  const maxGroupNivel = React.useMemo(
    () => rows.filter(e => e.isGroup).reduce((m, e) => Math.max(m, e.nivel || 0), 0),
    [rows]
  );
  // Último nível escolhido no select — só para o select mostrar o que foi aplicado (em vez
  // de sempre voltar a "Nível…"). Some de novo assim que um chevron é clicado à mão, porque
  // nesse momento deixa de ser verdade que a árvore inteira está naquele nível só.
  const [nivelSelecionado, setNivelSelecionado] = React.useState('');
  const collapseToLevel = (maxNivel) => {
    setNivelSelecionado(String(maxNivel));
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

  // Largura da coluna de nomes (ETAPA) — arrastável pela borda direita do cabeçalho e
  // lembrada entre visitas, pra nomes longos ("Limpeza de terreno + ...") não ficarem cortados.
  const [labelW, setLabelW] = React.useState(() => {
    let w = NaN;
    try { w = Number(localStorage.getItem(LABEL_W_KEY)); } catch {}
    return w >= LABEL_W_MIN && w <= LABEL_W_MAX ? w : LABEL_W_PADRAO;
  });
  const iniciarResize = (ev) => {
    ev.preventDefault();
    const x0 = ev.clientX, w0 = labelW;
    let atual = w0;
    const mover = (e) => {
      atual = Math.min(LABEL_W_MAX, Math.max(LABEL_W_MIN, w0 + e.clientX - x0));
      setLabelW(atual);
    };
    const soltar = () => {
      window.removeEventListener('mousemove', mover);
      window.removeEventListener('mouseup', soltar);
      document.body.style.cursor = '';
      try { localStorage.setItem(LABEL_W_KEY, String(atual)); } catch {}
    };
    document.body.style.cursor = 'col-resize';
    window.addEventListener('mousemove', mover);
    window.addEventListener('mouseup', soltar);
  };
  const gridCols = { gridTemplateColumns: `${labelW}px 1fr` };

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
      <div style={{ minWidth: labelW + totalMonths * 70, position: 'relative', paddingTop: 12 }}>
        <div className="gantt-head" style={gridCols}>
          <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>ETAPA</span>
            {/* Select em vez de um botão por nível: com EAPs profundas (N1..N9+) a fileira de
                botões passava da coluna de 220px reservada pra "ETAPA" e vazava visualmente
                sobre a coluna de meses. O select tem largura fixa, não importa quantos níveis
                existam — mesmo padrão "Estrutura…" já usado na Lista/Gantt/Uso da Tarefa/Medição. */}
            {!resumoOnly && rows.some(e => e.isGroup) && (
              <select value={nivelSelecionado} title="Expandir ou recolher a estrutura por nível"
                onChange={e => collapseToLevel(Number(e.target.value))}
                style={{ height: 20, fontSize: 10, fontWeight: 600, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', color: 'var(--text)', padding: '0 3px', cursor: 'pointer' }}>
                <option value="" disabled>Nível…</option>
                <option value="-1">Expandir tudo</option>
                {Array.from({ length: maxGroupNivel + 1 }, (_, nivel) => (
                  <option key={nivel} value={nivel}>Nível {nivel + 1}</option>
                ))}
              </select>
            )}
            <div onMouseDown={iniciarResize} onDoubleClick={() => { setLabelW(LABEL_W_PADRAO); try { localStorage.removeItem(LABEL_W_KEY); } catch {} }}
              title="Arraste para ajustar a largura da coluna (duplo clique volta ao padrão)"
              style={{ position: 'absolute', top: 0, bottom: 0, right: -4, width: 8, cursor: 'col-resize', zIndex: 2 }} />
          </div>
          <div className="gantt-month-row" style={{ gridTemplateColumns: janelaMesesDias.map(d => `${d}fr`).join(' ') }}>
            {janelaMeses.map((m, i) => <div key={i} className="gantt-month">{m}</div>)}
          </div>
        </div>
        {visibleRows.map((e, i) => {
          const v = effVals(e);
          return (
            <div className="gantt-row" key={i} style={gridCols}>
              <div className="gantt-label" style={{ paddingLeft: 14 + (e.nivel || 0) * 14, fontWeight: e.isGroup ? 700 : 400 }}>
                {/* Nome (com chevron do grupo) num span flex:1 próprio — trunca com "…" sem
                    afetar o badge de %, que fica FORA daqui como segundo item do flex, sempre
                    encostado na borda direita da coluna (não mais logo depois do texto). */}
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.isGroup && !resumoOnly && (
                    <span onClick={() => { setNivelSelecionado(''); setCollapsed(prev => { const n = new Set(prev); n.has(e.id) ? n.delete(e.id) : n.add(e.id); return n; }); }}
                      title={collapsed.has(e.id) ? 'Expandir' : 'Recolher'}
                      style={{ color: 'var(--text-muted)', marginRight: 5, fontSize: 10, cursor: 'pointer', userSelect: 'none' }}>
                      {collapsed.has(e.id) ? '▸' : '▾'}
                    </span>
                  )}
                  {e.etapa}
                </span>
                {/* % no canto direito da coluna, não mais dentro da barra (ficava
                    espremido/cortado em barras curtas, ex.: "BL2 (executado)") nem colado no
                    nome (variava de posição conforme o tamanho do nome da tarefa). */}
                {!e.isGroup && v.avanco > 0 && (
                  <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: 'var(--success)', flexShrink: 0 }}>{v.avanco}%</span>
                )}
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
                </div>
              </div>
            </div>
          );
        })}
        {!resumoOnly && mostrarHoje && (
          <div className="gantt-today-line" style={{ left: `calc(${labelW}px + (100% - ${labelW}px) * ${hojePct / 100})` }}>
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
      style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 1000, background: 'rgba(0,0,0,0.95)',
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

// Rede "sem sinal" deixa a requisição pendente em vez de falhar: resolve com erro de tempo
// esgotado depois de `ms` (o mesmo limite de 8s das outras telas).
const comLimiteDeRede = (promessa, ms = 8000) => Promise.race([
  promessa,
  new Promise((resolve) => setTimeout(() => resolve({ data: null, error: { timeout: true, message: 'tempo esgotado esperando a rede' } }), ms)),
]);
const semRedeAgora = () => typeof navigator !== 'undefined' && navigator.onLine === false;

const Fotos = ({ obra, readOnly = false, isAdmin = false, hideChrome = false }) => {
  const toast = useToast();
  const isMobile = useIsMobile();
  // O design mobile (cabeçalho/grade 2 colunas/FAB) só vale dentro do "modo foco" do
  // Mobile Gate (hideChrome) — "Acessar sistema completo" sempre mostra a grade
  // clássica, não importa a largura real da tela.
  const mobileView = isMobile && hideChrome;
  const [fotos,        setFotos]        = React.useState([]);
  const [loading,      setLoading]      = React.useState(true);
  const [totalCount,   setTotalCount]   = React.useState(0);
  const [tamanhoTotal, setTamanhoTotal] = React.useState(null);
  const [pagina,       setPagina]       = React.useState(1);
  const [showUpload,   setShowUpload]   = React.useState(false);
  // Captura direta pelo FAB: o input de câmera fica fora do modal (sempre montado) —
  // o .click() sincronizado ao toque no FAB abre a câmera na hora, sem mostrar o
  // modal por trás. O modal só aparece DEPOIS da foto tirada, já com ela carregada
  // (pendingFiles) — cancelar a câmera (files vazio) não abre nada.
  const fabCameraInputRef = React.useRef(null);
  const [pendingFiles, setPendingFiles] = React.useState(null);
  const onFabCapture = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    if (!picked.length) return;
    setPendingFiles(picked.map(f => ({ file: f, preview: URL.createObjectURL(f) })));
    setShowUpload(true);
  };
  const [editando,     setEditando]     = React.useState(null);
  const [filtroMes,    setFiltroMes]    = React.useState('');
  const [filtroPavimento, setFiltroPavimento] = React.useState('');
  const [lightboxIdx,  setLightboxIdx]  = React.useState(null);
  const [deleteFoto,   setDeleteFoto]   = React.useState(null);
  const [pavimentosComFoto, setPavimentosComFoto] = React.useState([]);
  // id -> signed URL da imagem ORIGINAL, resolvida sob demanda (lightbox/download),
  // porque o que vem na página é o thumbnail (ou a original, como fallback — ver carregarPagina).
  const [originalUrls, setOriginalUrls] = React.useState({});
  // Toolbar gruda sob a topbar ao rolar (mesmo padrão do card "Cronograma físico" logo
  // acima, e de Orcamentos.jsx: STICKY_TOP = topbar 60px + 32px de respiro); a galeria
  // ganha scroll próprio limitado ao espaço restante da viewport, pra toolbar continuar
  // sempre visível e o restante rolar por dentro.
  const FOTOS_STICKY_TOP = 92;
  const fotosHeaderRef = React.useRef(null);
  const [fotosBodyMaxH, setFotosBodyMaxH] = React.useState(null);

  // Descarta resposta obsoleta se o filtro ou a página mudar antes dela voltar.
  const requestIdRef = React.useRef(0);

  // Pavimentos cadastrados para as Fotos desta obra — abastecem a lista suspensa do campo
  // Pavimento nos modais. O cadastro é feito no modal "Pavimentos" (showPavimentos).
  const [pavimentos,   setPavimentos]   = React.useState([]);
  const [showPavimentos, setShowPavimentos] = React.useState(false);
  // Ordem usada pela galeria. Com o modal Pavimentos aberto ela fica na de quando ele abriu:
  // cada subir/descer/cadastro recarregava todas as fotos e baixava as miniaturas de novo
  // (dados móveis da obra), com a galeria piscando atrás do modal. Ao fechar, recarrega
  // uma vez só, já na ordem nova; se fechou porque a rede caiu, espera ela voltar (ver o
  // efeito depois de semRede), senão a recarga sem rede apagava as fotos que estavam na tela.
  const [pavimentosAoAbrir, setPavimentosAoAbrir] = React.useState(null);
  const abrirPavimentos = () => { setPavimentosAoAbrir(pavimentos); setShowPavimentos(true); };
  const pavimentosGaleria = pavimentosAoAbrir ?? pavimentos;
  // Gravação em andamento no cadastro de pavimentos. Fica aqui, não no modal: fechar e
  // reabrir no meio de uma gravação lenta começava outra com a lista antiga ainda em voo.
  const gravandoPavimentosRef = React.useRef(false);
  const [gravandoPavimentos, setGravandoPavimentos] = React.useState(false);
  // A galeria só carrega depois do cadastro: a ordem das fotos depende dele (ver carregarPagina).
  const [pavimentosPronto, setPavimentosPronto] = React.useState(false);
  // Sem rede a lista vem do aparelho (offlineCache, gravada a cada carga com internet no
  // modo foco e na tela de atalhos, ver App.jsx): é o que permite escolher o pavimento e
  // guardar a foto em campo. Nesse caso não há cadastro (precisa do servidor).
  const [pavimentosDoAparelho, setPavimentosDoAparelho] = React.useState(false);
  // Lista confirmada pelo servidor nesta abertura: só com ela o cadastro aparece. Com
  // "sem sinal" a resposta demora até 8s, e nesse meio tempo o cadastro aparecia.
  const [pavimentosConfirmados, setPavimentosConfirmados] = React.useState(false);
  const [pavimentosRetry, setPavimentosRetry] = React.useState(0);
  React.useEffect(() => {
    let ativo = true;
    setPavimentosPronto(false);
    setPavimentosConfirmados(false);
    (async () => {
      // A lista guardada aparece na hora, sem esperar a rede; o servidor substitui depois.
      const guardado = await offlineCache.ler('pavimentosFotos', obra.id);
      if (!ativo) return;
      if (guardado) setPavimentos(guardado.dados);
      const r = semRedeAgora()
        ? { data: [], error: { offline: true } }
        : await comLimiteDeRede(pavimentosFotosService.listar(obra.id));
      if (!ativo) return;
      if (!r.error) {
        setPavimentos(r.data);
        setPavimentosDoAparelho(false);
        setPavimentosConfirmados(true);
        connectivity.reportSuccess();
      } else {
        // Avisa o connectivity: assim a 1ª requisição que der certo depois (qualquer tela,
        // ou a fila) dispara o retry de reconexão abaixo, mesmo sem o evento `online`.
        if (r.error.timeout || r.error.offline || isNetworkError(r.error)) connectivity.reportError({ message: 'Failed to fetch' });
        if (!guardado) setPavimentos([]);
        setPavimentosDoAparelho(true);
      }
      setPavimentosPronto(true);
    })();
    return () => { ativo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obra.id, pavimentosRetry]);
  // Guarda no aparelho a cada mudança confirmada pelo servidor, inclusive cadastrar,
  // renomear e excluir no modal Pavimentos: senão o pavimento recém-cadastrado não
  // aparecia na próxima abertura sem internet.
  React.useEffect(() => {
    if (hideChrome && pavimentosConfirmados) offlineCache.gravar('pavimentosFotos', obra.id, pavimentos);
  }, [pavimentos, pavimentosConfirmados, hideChrome, obra.id]);

  // Galeria do servidor sem rede: some o "Nenhuma foto cadastrada" falso (ver render).
  const [galeriaOffline, setGaleriaOffline] = React.useState(false);
  const semRedeHook = useSemRede();
  const semRede = semRedeHook || pavimentosDoAparelho || galeriaOffline;
  const semRedeRef = React.useRef(semRede);
  semRedeRef.current = semRede;
  // Cadastrar/renomear/excluir pavimento precisa do servidor: só com a lista confirmada.
  const podeCadastrarPavimentos = pavimentosConfirmados && !semRede;
  // A rede caiu com o cadastro aberto: fecha, ele não conseguiria gravar.
  React.useEffect(() => { if (!podeCadastrarPavimentos) setShowPavimentos(false); }, [podeCadastrarPavimentos]);
  // Solta a ordem congelada da galeria (ver pavimentosGaleria) com o modal fechado e rede.
  React.useEffect(() => { if (!showPavimentos && !semRede) setPavimentosAoAbrir(null); }, [showPavimentos, semRede]);

  // Lista de pavimentos que TÊM foto, pro filtro — query própria e leve (só a coluna
  // pavimento, sem imagem/URL assinada). Com paginação, `fotos` só tem o que já foi
  // carregado, não dá mais pra derivar isso em memória sem perder pavimentos que só
  // apareceriam num lote mais adiante.
  const carregarPavimentosComFoto = React.useCallback(async () => {
    if (semRedeAgora()) return;
    const { data } = await comLimiteDeRede(supabase.from('fotos_obra').select('pavimento').eq('obra_id', obra.id));
    setPavimentosComFoto([...new Set((data || []).map(f => f.pavimento).filter(Boolean))]);
  }, [obra.id]);
  React.useEffect(() => { carregarPavimentosComFoto(); }, [carregarPavimentosComFoto]);
  // Opções do filtro na ordem de cadastro; as fora do cadastro vêm depois, em ordem natural.
  const pavimentosFiltro = React.useMemo(() => {
    const pos = posicaoPavimento(pavimentos);
    return [...pavimentosComFoto].sort((a, b) => (pos(a) - pos(b)) || a.localeCompare(b, 'pt-BR', { numeric: true }));
  }, [pavimentosComFoto, pavimentos]);

  // Tamanho total ocupado pelas fotos desta obra (original + thumbnail de cada uma) —
  // não tem coluna de tamanho em fotos_obra (nunca foi salvo), mas o Storage já guarda
  // o tamanho de cada arquivo sozinho, então lista direto do bucket em vez de precisar
  // de migration/backfill. `limit` alto porque 64 fotos já viram 128 arquivos (original
  // + thumb) — o padrão do list() é só 100.
  const carregarTamanhoTotal = React.useCallback(async () => {
    if (semRedeAgora()) return;
    const { data, error } = await comLimiteDeRede(supabase.storage.from('obras-images').list(`obras/${obra.id}/fotos`, { limit: 1000 }));
    if (error?.timeout) return;
    if (error) { logger.error('falha ao calcular tamanho total das fotos', { module: 'obra', action: 'carregarTamanhoTotal', err: error }); return; }
    setTamanhoTotal((data || []).reduce((s, f) => s + (f.metadata?.size || 0), 0));
  }, [obra.id]);
  React.useEffect(() => { carregarTamanhoTotal(); }, [carregarTamanhoTotal]);

  // Busca a página pedida (1-indexed) já filtrada/ordenada — sempre TROCA o conteúdo
  // da galeria pelo da página, nunca acumula com a anterior (isso é o que torna
  // possível paginar por número em vez de rolagem infinita).
  //
  // Ordem: data (mais recente primeiro) > pavimento na ordem de CADASTRO > foto mais
  // recente. O servidor não conhece a ordem do cadastro (fotos_obra.pavimento é texto sem
  // FK), então a posição de cada foto sai de uma consulta leve (só as colunas de ordenação,
  // sem imagem/URL assinada), ordenada aqui; a página é fatiada dessa lista e só as 32
  // fotos dela são buscadas por completo. Assim a ordem vale entre páginas, não só dentro de uma.
  const carregarPagina = React.useCallback(async (pag) => {
    requestIdRef.current += 1;
    const meuId = requestIdRef.current;
    if (semRedeAgora()) {
      setFotos([]); setTotalCount(0); setGaleriaOffline(true); setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const LOTE_ORDEM = 1000; // limite de linhas por consulta do Supabase (max_rows)
      const leves = [];
      for (let de = 0; ; de += LOTE_ORDEM) {
        let q = supabase.from('fotos_obra')
          .select('id, data, pavimento, created_at')
          .eq('obra_id', obra.id);
        if (filtroPavimento) q = q.eq('pavimento', filtroPavimento);
        if (filtroMes) {
          const { ini, fim } = mesRangeISO(filtroMes);
          q = q.gte('data', ini).lt('data', fim);
        }
        // Ordem estável só para a paginação desta consulta não repetir/pular linha; a ordem
        // de verdade é aplicada logo abaixo.
        q = q.order('data', { ascending: false, nullsFirst: false })
             .order('created_at', { ascending: false })
             .order('id', { ascending: true })
             .range(de, de + LOTE_ORDEM - 1);
        const { data, error } = await comLimiteDeRede(q);
        if (meuId !== requestIdRef.current) return; // filtro/página mudou enquanto isso corria — descarta
        if (error) throw error;
        leves.push(...(data || []));
        if ((data || []).length < LOTE_ORDEM) break;
      }
      const ordenadas = ordenarFotosPorPavimento(leves, pavimentosGaleria);
      const idsDaPagina = ordenadas.slice((pag - 1) * FOTOS_POR_LOTE, pag * FOTOS_POR_LOTE).map(f => f.id);
      let rows = [];
      if (idsDaPagina.length) {
        const { data, error } = await comLimiteDeRede(supabase.from('fotos_obra').select('*').in('id', idsDaPagina));
        if (meuId !== requestIdRef.current) return;
        if (error) throw error;
        const porId = new Map((data || []).map(f => [f.id, f]));
        rows = idsDaPagina.map(id => porId.get(id)).filter(Boolean);
      }
      // Bucket privado: exibe via URL assinada gerada do thumbnail (ou da própria
      // imagem, se a foto ainda não tiver thumbnail_path — fotos antigas, ou upload
      // cujo thumbnail falhou). A coluna `url` legada fica só como fallback final.
      const paths = rows.map(f => f.thumbnail_path || f.storage_path).filter(Boolean);
      const signed = {};
      if (paths.length) {
        const { data: urls } = await comLimiteDeRede(supabase.storage.from('obras-images').createSignedUrls(paths, 3600));
        (urls || []).forEach(u => { if (u.signedUrl && !u.error) signed[u.path] = u.signedUrl; });
      }
      if (meuId !== requestIdRef.current) return;
      setFotos(rows.map(f => ({ ...f, url: signed[f.thumbnail_path || f.storage_path] || f.url })));
      setTotalCount(ordenadas.length);
      setGaleriaOffline(false);
      connectivity.reportSuccess();
    } catch (err) {
      if (ehFalhaPassageira(err)) {
        if (err?.timeout || isNetworkError(err)) connectivity.reportError({ message: 'Failed to fetch' });
        if (meuId === requestIdRef.current) { setFotos([]); setTotalCount(0); setGaleriaOffline(true); }
      } else {
        logger.error('falha ao carregar fotos', { module: 'obra', action: 'carregarPagina', err });
      }
    } finally {
      if (meuId === requestIdRef.current) setLoading(false);
    }
  }, [obra.id, filtroMes, filtroPavimento, pavimentosGaleria]);

  // Troca de obra ou de filtro sempre volta pra primeira página
  React.useEffect(() => { setPagina(1); }, [obra.id, filtroMes, filtroPavimento]);
  // Só carrega com o cadastro de pavimentos pronto (a ordem depende dele); mudar o cadastro
  // recria carregarPagina e reordena a galeria sozinho (ao fechar o modal, ver pavimentosGaleria).
  React.useEffect(() => { if (pavimentosPronto) carregarPagina(pagina); }, [pagina, carregarPagina, pavimentosPronto]);

  // Upload em lote: metadados (data/pavimento/descrição) compartilhados por todas as fotos
  // selecionadas de uma vez. Cada foto é comprimida e guardada primeiro no aparelho (fila de
  // envio, ver fotos.service.js), e o envio sai de lá: na hora, com internet, ou quando a
  // conexão voltar. Antes, sem rede, as fotos escolhidas eram descartadas ao fechar o modal.
  // Comprime uma de cada vez: várias fotos de câmera ao mesmo tempo estouram a memória do
  // celular. O aviso de "enviada" vem da fila (ver efeito da fila abaixo).
  const salvarFotos = async (metadados, files) => {
    const lote = [];
    for (const file of files) {
      try {
        const blob = await compressImagem(file, 1200, 0.82);
        // Limite no arquivo JÁ reduzido: antes era no original, e foto de câmera boa era
        // recusada sem precisar.
        if (blob.size > 5 * 1024 * 1024) {
          toast(`"${file.name}" muito grande mesmo depois de reduzida (máx. 5 MB): não foi guardada`, { tone: 'danger' });
          continue;
        }
        // Miniatura a partir da já reduzida: decodificar a original de novo é o mais pesado.
        const thumbBlob = await compressImagem(blob, 600, 0.82);
        lote.push({ blob, thumbBlob });
      } catch (err) {
        logger.error('falha ao preparar foto', { module: 'obra', action: 'salvarFotos', err });
        toast(`Não foi possível ler "${file.name}".`, { tone: 'danger' });
      }
    }
    if (!lote.length) return;
    let r;
    try {
      r = await fotosService.enfileirar(obra.id, metadados, lote);
    } catch (err) {
      // A gravação do lote é tudo ou nada: nada ficou guardado, então tentar de novo não duplica.
      toast('Não foi possível guardar as fotos neste aparelho. Tente de novo.', { tone: 'danger' });
      throw err; // mantém o modal aberto com as fotos escolhidas (ver UploadFotoModal.handleSave)
    }
    // Aparelho não deixou guardar e as fotos subiram direto (ver fotosService.enfileirar).
    if (!r.guardadas) {
      if (r.enviadasDireto) {
        toast(r.enviadasDireto === 1 ? 'Foto salva' : `${r.enviadasDireto} fotos salvas`, { tone: 'success', icon: 'check' });
        aoEnviarRef.current?.();
      }
      if (r.falharam) toast(`${r.falharam} foto(s) não foram enviadas. Tente de novo.`, { tone: 'danger' });
      return;
    }
    if (semRedeRef.current) {
      toast(lote.length === 1
        ? 'Foto guardada neste aparelho. Será enviada quando a internet voltar.'
        : `${lote.length} fotos guardadas neste aparelho. Serão enviadas quando a internet voltar.`,
        { tone: 'warning', icon: 'wifi-off' });
    }
  };

  // Fotos desta obra ainda no aparelho (fila de envio), no topo da galeria até subirem.
  const [naFila, setNaFila] = React.useState([]);
  const [estadoFila, setEstadoFila] = React.useState(() => offlineQueue.estado());
  const [descartandoFila, setDescartandoFila] = React.useState(null);
  const idsNaFilaRef = React.useRef(new Set());
  const statusNaFilaRef = React.useRef(new Map());
  // Enviadas desta obra na passada em andamento: um aviso e uma recarga da galeria no fim
  // da passada, e não um por foto.
  const enviadasNaPassadaRef = React.useRef(0);
  // Sempre a versão atual (o efeito da fila só se inscreve uma vez por obra).
  const aoEnviarRef = React.useRef(null);
  aoEnviarRef.current = () => {
    if (pagina === 1) carregarPagina(1); else setPagina(1);
    carregarPavimentosComFoto();
    carregarTamanhoTotal();
    if (pavimentosDoAparelho) setPavimentosRetry(t => t + 1); // a rede voltou: traz o cadastro de volta
  };
  React.useEffect(() => {
    let ativo = true;
    idsNaFilaRef.current = new Set();
    enviadasNaPassadaRef.current = 0;
    const atualizar = async (evento) => {
      // Só conta como enviada o que a fila confirma (evento.enviados). Sumir da lista não
      // basta: o Sair com "apagar" e a queda da sessão também esvaziam a lista.
      if (evento?.enviados) {
        enviadasNaPassadaRef.current += evento.enviados.filter(id => idsNaFilaRef.current.has(id)).length;
      }
      const itens = (await offlineQueue.listar('foto').catch(() => [])).filter(i => i.payload?.obraId === obra.id);
      if (!ativo) return;
      // Acabou de ser recusada pelo servidor: avisa uma vez (o selo na miniatura fica).
      const recusadas = itens.filter(i => i.status === 'revisar' && statusNaFilaRef.current.get(i.id) === 'pendente');
      idsNaFilaRef.current = new Set(itens.map(i => i.id));
      statusNaFilaRef.current = new Map(itens.map(i => [i.id, i.status]));
      const estado = offlineQueue.estado();
      setNaFila(itens);
      setEstadoFila(estado);
      if (!estado.enviando && enviadasNaPassadaRef.current) {
        const n = enviadasNaPassadaRef.current;
        enviadasNaPassadaRef.current = 0;
        toast(n === 1 ? 'Foto enviada' : `${n} fotos enviadas`, { tone: 'success', icon: 'check' });
        aoEnviarRef.current?.();
      }
      if (recusadas.length) toast(`Foto não enviada: ${recusadas[0].ultimoErro || 'recusada pelo servidor'}`, { tone: 'danger' });
    };
    atualizar();
    const sair = offlineQueue.subscribe(atualizar);
    return () => { ativo = false; sair(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obra.id]);
  // Miniatura de cada foto da fila direto do blob guardado (ainda não existe no servidor).
  const urlsFila = React.useMemo(
    () => new Map(naFila.map(i => [i.id, URL.createObjectURL(i.payload.thumbBlob || i.payload.blob)])),
    [naFila]
  );
  React.useEffect(() => () => urlsFila.forEach(u => URL.revokeObjectURL(u)), [urlsFila]);
  const confirmarDescarte = async () => {
    const item = descartandoFila;
    setDescartandoFila(null);
    if (!item) return;
    await offlineQueue.descartar(item.id);
  };

  // Conexão voltou: relê o que veio do aparelho ou não carregou.
  useRetryOnReconnect(() => {
    if (pavimentosDoAparelho) setPavimentosRetry(t => t + 1);
    if (galeriaOffline) carregarPagina(pagina);
  });

  const atualizarFoto = async (id, metadados) => {
    const { error } = await supabase.from('fotos_obra').update(metadados).eq('id', id);
    if (error) {
      logger.error('erro ao atualizar foto', { module: 'obra', action: 'atualizarFoto', err: error });
      toast('Erro ao atualizar foto. ' + friendlyError(error), { tone: 'danger' });
      return false;
    }
    toast('Foto atualizada', { tone: 'success', icon: 'check' });
    carregarPagina(pagina);
    carregarPavimentosComFoto();
    return true;
  };

  const excluirFoto = async (foto) => {
    const paths = [foto.storage_path, foto.thumbnail_path].filter(Boolean);
    const { error: errStorage } = await supabase.storage.from('obras-images').remove(paths);
    const { error: errDb } = await supabase.from('fotos_obra').delete().eq('id', foto.id);
    // O que importa pro usuário é o registro (fotos_obra): se ele não foi excluído, a foto
    // continua aparecendo na galeria — precisa avisar. Falha só no storage (arquivo já não
    // existia etc.) não impede seguir, já que o registro em si foi removido com sucesso.
    if (errDb) {
      logger.error('erro ao excluir foto', { module: 'obra', action: 'excluirFoto', err: errDb });
      toast('Erro ao excluir foto. ' + friendlyError(errDb), { tone: 'danger' });
      return;
    }
    if (errStorage) {
      logger.error('falha ao remover arquivo da foto no storage (registro já excluído)', { module: 'obra', action: 'excluirFoto', err: errStorage });
    }
    toast('Foto excluída', { tone: 'neutral' });
    carregarPavimentosComFoto();
    carregarTamanhoTotal();
    // Era a última foto desta página (e não é a 1ª página): volta uma página em vez de
    // ficar numa página vazia.
    if (pagina > 1 && fotos.length === 1) setPagina(p => p - 1);
    else carregarPagina(pagina);
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
      // Nome "Pavimento - dd-mm-aaaa" (fotos do mesmo dia e pavimento o navegador numera sozinho).
      const ext = (foto.storage_path?.split('.').pop() || '').toLowerCase();
      el.download = nomeArquivoFoto(foto, /^[a-z0-9]{2,5}$/.test(ext) ? ext : (blob.type.split('/')[1] || 'jpg'));
      document.body.appendChild(el);
      el.click();
      el.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch {
      toast('Falha ao baixar a foto.', { tone: 'danger', icon: 'alert' });
    }
  };

  // Baixa num .zip TODAS as fotos do filtro ativo (mês, pavimento ou os dois),
  // não só as da página aberta: refaz a consulta sem paginação, assina as URLs das originais
  // e monta o zip no navegador. Sem compressão (level 0): JPG/PNG já vêm comprimidos.
  const [zipProgresso, setZipProgresso] = React.useState(null); // { feitas, total } enquanto gera
  const baixarZipDoFiltro = async () => {
    if ((!filtroMes && !filtroPavimento) || zipProgresso) return;
    setZipProgresso({ feitas: 0, total: 0 });
    try {
      const LOTE = 1000;
      const lista = [];
      for (let de = 0; ; de += LOTE) {
        let q = supabase.from('fotos_obra')
          .select('id, data, pavimento, created_at, storage_path')
          .eq('obra_id', obra.id);
        if (filtroMes) {
          const { ini, fim } = mesRangeISO(filtroMes);
          q = q.gte('data', ini).lt('data', fim);
        }
        if (filtroPavimento) q = q.eq('pavimento', filtroPavimento);
        q = q.order('data', { ascending: true }).order('created_at', { ascending: true }).order('id', { ascending: true })
             .range(de, de + LOTE - 1);
        const { data, error } = await q;
        if (error) throw error;
        lista.push(...(data || []));
        if ((data || []).length < LOTE) break;
      }
      const fotosZip = lista.filter(f => f.storage_path);
      if (!fotosZip.length) { toast('Nenhuma foto neste filtro para baixar.', { tone: 'warning', icon: 'alert' }); return; }
      setZipProgresso({ feitas: 0, total: fotosZip.length });

      const urls = {};
      for (let i = 0; i < fotosZip.length; i += 100) {
        const paths = fotosZip.slice(i, i + 100).map(f => f.storage_path);
        const { data, error } = await supabase.storage.from('obras-images').createSignedUrls(paths, 3600);
        if (error) throw error;
        (data || []).forEach(u => { if (u.signedUrl && !u.error) urls[u.path] = u.signedUrl; });
      }

      // Baixa 4 por vez: rápido sem estourar conexões nem a memória do navegador.
      const blobs = new Array(fotosZip.length).fill(null);
      let proxima = 0, feitas = 0;
      const trabalhador = async () => {
        while (proxima < fotosZip.length) {
          const i = proxima++;
          const url = urls[fotosZip[i].storage_path];
          if (url) {
            try { const r = await fetch(url); if (r.ok) blobs[i] = new Uint8Array(await r.arrayBuffer()); } catch {}
          }
          feitas += 1;
          setZipProgresso({ feitas, total: fotosZip.length });
        }
      };
      await Promise.all(Array.from({ length: 4 }, trabalhador));

      const ok = fotosZip.map((f, i) => ({ f, bytes: blobs[i] })).filter(x => x.bytes);
      if (!ok.length) throw new Error('nenhuma foto baixada');
      const nomes = nomesUnicos(ok.map(({ f }) => {
        const ext = (f.storage_path.split('.').pop() || '').toLowerCase();
        return nomeArquivoFoto(f, /^[a-z0-9]{2,5}$/.test(ext) ? ext : 'jpg');
      }));
      const arquivos = {};
      ok.forEach(({ bytes }, i) => { arquivos[nomes[i]] = [bytes, { level: 0 }]; });
      const zip = zipSync(arquivos);

      const [ano, mes] = filtroMes ? filtroMes.split('-') : [];
      const limpa = (t) => String(t || '').replace(/[\\/:*?"<>|]+/g, '-').trim();
      const nomeZip = [limpa(obra.nome) || 'Obra', filtroMes ? `Fotos ${mes}-${ano}` : 'Fotos', filtroPavimento && limpa(filtroPavimento)].filter(Boolean).join(' - ') + '.zip';
      const blobUrl = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
      const el = document.createElement('a');
      el.href = blobUrl;
      el.download = nomeZip;
      document.body.appendChild(el);
      el.click();
      el.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);

      const falhas = fotosZip.length - ok.length;
      if (falhas) toast(`${falhas} foto${falhas > 1 ? 's' : ''} não ${falhas > 1 ? 'puderam' : 'pôde'} ser baixada${falhas > 1 ? 's' : ''} e ficou fora do zip.`, { tone: 'warning', icon: 'alert' });
    } catch (err) {
      logger.error('falha ao gerar zip das fotos', { module: 'obra', action: 'baixarZipDoFiltro', err });
      toast('Falha ao gerar o zip das fotos.', { tone: 'danger', icon: 'alert' });
    } finally {
      setZipProgresso(null);
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
  const totalPaginas = Math.max(1, Math.ceil(totalCount / FOTOS_POR_LOTE));

  return (
    <>
      {!mobileView && (
      <div ref={fotosHeaderRef} className="card" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '12px 16px', marginBottom: 16, flexWrap: 'wrap',
                                     position: 'sticky', top: FOTOS_STICKY_TOP, zIndex: 2 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--surface-2)',
                       padding: '3px 10px', borderRadius: 20, fontWeight: 500 }}>
          {totalCount} foto{totalCount !== 1 ? 's' : ''}{tamanhoTotal != null && ` · ${formatBytes(tamanhoTotal)}`}
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
                  {pavimentosFiltro.map(p => <option key={p} value={p}>{p}</option>)}
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
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {!semFiltro && totalCount > 0 && !loading && (
            <button className="btn btn-ghost" onClick={baixarZipDoFiltro} disabled={!!zipProgresso}
              title="Baixar todas as fotos do filtro (mês e/ou pavimento) em um arquivo .zip">
              <Icon name="download" size={15} />
              {zipProgresso
                ? (zipProgresso.total ? `Baixando ${zipProgresso.feitas}/${zipProgresso.total}…` : 'Preparando…')
                : `Baixar ${filtroMes && filtroPavimento ? 'filtro' : filtroMes ? 'mês' : 'pavimento'} (.zip)`}
            </button>
          )}
          {!readOnly && podeCadastrarPavimentos && (
            <button className="btn btn-ghost" onClick={abrirPavimentos}>
              <Icon name="layers" size={15} />Pavimentos
            </button>
          )}
          {!readOnly && (
            <button className="btn btn-primary" onClick={() => setShowUpload(true)}>
              <Icon name="upload" size={15} />Upload
            </button>
          )}
        </div>
      </div>
      )}

      {mobileView && (
      <div className="fotos-mobile-header">
        <div>
          <div className="fotos-mobile-eyebrow">{obra.nome}</div>
          <div className="fotos-mobile-title">Fotos</div>
        </div>

        {!readOnly && (
          <div className="mm-mobile-actions-row">
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }}
              onClick={() => setShowUpload(true)}>
              <Icon name="image" size={15} />Galeria
            </button>
            {podeCadastrarPavimentos && (
              <button type="button" className="btn btn-ghost" style={{ flex: 1 }}
                onClick={abrirPavimentos}>
                <Icon name="layers" size={15} />Pavimentos
              </button>
            )}
          </div>
        )}

        {!loading && (totalCount > 0 || !semFiltro) && (
          <div className="mm-mobile-filters-row">
            {pavimentosComFoto.length > 0 && (
              <div style={{ position: 'relative', display: 'inline-flex', flex: 1 }}>
                <select className="input" value={filtroPavimento} onChange={e => setFiltroPavimento(e.target.value)} style={{ width: '100%' }}
                  title="Filtrar por pavimento">
                  <option value="">Todos os pavimentos</option>
                  {pavimentosFiltro.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            )}
            <MesAnoInput value={filtroMes} onChange={setFiltroMes} />
          </div>
        )}
        {!semFiltro && (
          <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-start' }}
            onClick={() => { setFiltroMes(''); setFiltroPavimento(''); }}>
            <Icon name="x" size={13} />Limpar filtro
          </button>
        )}

        <span className="fotos-mobile-count">
          {totalCount} foto{totalCount !== 1 ? 's' : ''}{tamanhoTotal != null && ` · ${formatBytes(tamanhoTotal)}`}
          {naFila.length > 0 && ` · ${naFila.length} no aparelho`}
        </span>
      </div>
      )}

      {semRede && (
        <AvisoOffline texto={naFila.length
          ? 'Sem internet. As fotos guardadas neste aparelho serão enviadas quando a conexão voltar.'
          : 'Sem internet. Pode tirar fotos: elas ficam guardadas neste aparelho e são enviadas quando a conexão voltar.'} />
      )}
      {!semRede && estadoFila.semSessao && naFila.length > 0 && (
        <AvisoOffline texto="Entre de novo com internet para enviar as fotos guardadas neste aparelho." />
      )}
      {naFila.length > 0 && (
        <div className={'gallery' + (mobileView ? ' gallery-mobile' : '')} style={{ marginBottom: 12 }}>
          {naFila.map(item => (
            <div key={item.id} className="photo photo-na-fila">
              <img src={urlsFila.get(item.id)} alt="" />
              {item.status !== 'revisar' && (
                <button type="button" className="icon-btn photo-na-fila-x" title="Descartar foto" onClick={() => setDescartandoFila(item)}>
                  <Icon name="x" size={13} />
                </button>
              )}
              <div className="photo-na-fila-info">
                <span className={'photo-na-fila-selo' + (item.status === 'revisar' ? ' revisar' : '')}>
                  {item.status === 'revisar' ? 'Não enviada' : estadoFila.enviando ? 'Enviando…' : semRede ? 'Aguardando internet' : 'Na fila de envio'}
                </span>
                {item.payload.pavimento && <div style={{ fontWeight: 600 }}>{item.payload.pavimento}</div>}
                {item.payload.data && <div style={{ opacity: 0.85, fontSize: 11 }}>{isoToBR(item.payload.data)}</div>}
                {item.status === 'revisar' && (
                  <>
                    {item.ultimoErro && <div className="photo-na-fila-erro">{item.ultimoErro}</div>}
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <button type="button" className="photo-na-fila-acao" onClick={() => offlineQueue.tentarDeNovo(item.id)}>Tentar de novo</button>
                      <button type="button" className="photo-na-fila-acao" onClick={() => setDescartandoFila(item)}>Descartar</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {loading
        ? <div className="text-muted" style={{ padding: 48, textAlign: 'center' }}>Carregando…</div>
        : galeriaOffline
          ? <div className="card" style={{ padding: '40px 24px', textAlign: 'center' }}>
              <Icon name="wifi-off" size={32} style={{ color: 'var(--text-faint)' }} />
              <div className="text-muted" style={{ marginTop: 12 }}>Galeria indisponível sem internet.</div>
              <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => { carregarPagina(pagina); if (pavimentosDoAparelho) setPavimentosRetry(t => t + 1); }}>
                <Icon name="refresh-cw" size={14} />Tentar novamente
              </button>
            </div>
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
          : <div style={{ maxHeight: fotosBodyMaxH || undefined, overflowY: 'auto' }}>
              <div className={'gallery' + (mobileView ? ' gallery-mobile' : '')}>
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
              {totalPaginas > 1 && (
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'center', padding: '16px 0' }}>
                  <button onClick={() => setPagina(1)} disabled={pagina === 1}
                    style={{ width: 32, height: 32, border: '1px solid var(--border)', borderRadius: 6, background: 'none', cursor: pagina === 1 ? 'default' : 'pointer', opacity: pagina === 1 ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>«</button>
                  <button onClick={() => setPagina(p => p - 1)} disabled={pagina === 1}
                    style={{ width: 32, height: 32, border: '1px solid var(--border)', borderRadius: 6, background: 'none', cursor: pagina === 1 ? 'default' : 'pointer', opacity: pagina === 1 ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
                  {Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => {
                    const pg = Math.max(1, Math.min(totalPaginas - 4, pagina - 2)) + i;
                    if (pg > totalPaginas) return null;
                    return (
                      <button key={pg} onClick={() => setPagina(pg)}
                        style={{ width: 32, height: 32, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: pg === pagina ? 'var(--brand)' : 'none', color: pg === pagina ? '#fff' : 'var(--text)', fontWeight: pg === pagina ? 700 : 400, fontSize: 13 }}>{pg}</button>
                    );
                  })}
                  <button onClick={() => setPagina(p => p + 1)} disabled={pagina === totalPaginas}
                    style={{ width: 32, height: 32, border: '1px solid var(--border)', borderRadius: 6, background: 'none', cursor: pagina === totalPaginas ? 'default' : 'pointer', opacity: pagina === totalPaginas ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
                  <button onClick={() => setPagina(totalPaginas)} disabled={pagina === totalPaginas}
                    style={{ width: 32, height: 32, border: '1px solid var(--border)', borderRadius: 6, background: 'none', cursor: pagina === totalPaginas ? 'default' : 'pointer', opacity: pagina === totalPaginas ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>»</button>
                </div>
              )}
            </div>
      }
      {mobileView && !readOnly && (
        <>
          <input
            ref={fabCameraInputRef} type="file" accept="image/*" capture="environment"
            style={{ display: 'none' }} onChange={onFabCapture}
          />
          <button
            type="button" className="fab-camera" title="Tirar foto"
            onClick={() => fabCameraInputRef.current?.click()}
          >
            <Icon name="camera" size={22} />
          </button>
        </>
      )}
      {showUpload && (
        <UploadFotoModal
          obra={obra} pavimentos={pavimentos}
          onGerenciarPavimentos={podeCadastrarPavimentos ? abrirPavimentos : undefined}
          semRede={semRede}
          initialFiles={pendingFiles}
          mobileView={mobileView}
          onSave={salvarFotos}
          onClose={() => { setShowUpload(false); setPendingFiles(null); }}
        />
      )}
      {showPavimentos && (
        <PavimentosFotosModal obraId={obra.id} pavimentos={pavimentos} setPavimentos={setPavimentos}
          gravacao={{ trava: gravandoPavimentosRef, ativa: gravandoPavimentos, definir: setGravandoPavimentos }}
          isAdmin={isAdmin} onClose={() => setShowPavimentos(false)}
          onRenomeado={(antigo, novo) => {
            if (filtroPavimento === antigo) setFiltroPavimento(novo);
            setPavimentosAoAbrir(prev => prev && prev.map(x => (x === antigo ? novo : x)));
            carregarPavimentosComFoto();
          }} />
      )}
      {editando && <EditFotoModal foto={editando} pavimentos={pavimentos} onGerenciarPavimentos={podeCadastrarPavimentos ? abrirPavimentos : undefined} mobileView={mobileView} onSave={async (m) => { if (await atualizarFoto(editando.id, m)) setEditando(null); }} onClose={() => setEditando(null)} />}
      {lightboxIdx !== null && (
        <FotoLightbox
          fotos={fotos}
          idx={lightboxIdx}
          onNavigate={setLightboxIdx}
          onClose={() => setLightboxIdx(null)}
          onDownload={baixarFoto}
          urlOriginal={originalUrls[fotos[lightboxIdx]?.id]}
          onRequestOriginal={garantirUrlOriginal}
        />
      )}
      {descartandoFila && (
        <Modal title="Descartar foto" onClose={() => setDescartandoFila(null)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setDescartandoFila(null)}>Cancelar</button>
            <button className="btn btn-danger" onClick={confirmarDescarte}>Descartar</button>
          </>}>
          <p style={{ fontSize: 14 }}>Esta foto ainda não foi enviada. Descartar apaga ela deste aparelho.</p>
        </Modal>
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
// Aceita File ou Blob (a miniatura sai do blob já reduzido). Rejeita em vez de ficar
// pendurada: arquivo que não decodifica deixava o botão em "Salvando…" pra sempre.
function compressImagem(file, maxW = 1200, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('falha ao ler a imagem'));
    reader.onload = ev => {
      const img = new Image();
      img.onerror = () => reject(new Error('imagem inválida'));
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('falha ao comprimir a imagem'))), 'image/jpeg', quality);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Campo Pavimento: lista suspensa FECHADA com os pavimentos cadastrados para as Fotos da
// obra (modal "Pavimentos"). Não aceita texto livre. `atual` é o valor já gravado na foto
// (edição): se não estiver mais no cadastro, entra como opção para não ser perdido ao salvar.
// Sem rede (onGerenciar ausente, semRede) mostra só a lista guardada no aparelho: o
// cadastro precisa do servidor.
const PavimentoSelect = ({ value, onChange, options = [], atual = '', onGerenciar, semRede = false }) => {
  const lista = atual && !options.includes(atual) ? [...options, atual] : options;
  return (
    <>
      <select className="input" value={value} onChange={e => onChange(e.target.value)} style={{ width: '100%' }}>
        <option value="">{lista.length ? 'Selecione o pavimento' : semRede ? 'Nenhum pavimento guardado neste aparelho' : 'Nenhum pavimento cadastrado'}</option>
        {lista.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      {onGerenciar && lista.length === 0 && (
        <button type="button" className="btn btn-ghost" style={{ marginTop: 6, height: 28, fontSize: 12 }} onClick={onGerenciar}>
          <Icon name="plus" size={12} />Cadastrar pavimentos
        </button>
      )}
      {semRede && lista.length === 0 && (
        <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--text-muted)' }}>
          Com internet, abra as Fotos desta obra uma vez para guardar os pavimentos neste aparelho.
        </div>
      )}
    </>
  );
};

// Modal de cadastro de pavimentos das Fotos. Qualquer um que edita Fotos cadastra, renomeia,
// reposiciona e duplica; excluir é só admin (RLS também exige). Excluir do cadastro não altera
// fotos já gravadas; renomear atualiza também as fotos da obra que usam o nome antigo (ver
// pavimentosFotosService.renomear).
const PavimentosFotosModal = ({ obraId, pavimentos, setPavimentos, gravacao, isAdmin = false, onRenomeado, onClose }) => {
  const toast = useToast();
  const [nome, setNome] = React.useState('');
  // Uma gravação por vez, travada já no toque: `busy` só vale no render seguinte e o Enter
  // dos campos não passa pelo botão desabilitado. Sem isso, um cadastro feito durante um
  // subir/duplicar lento sumia da tela quando o outro terminava. A trava vem do pai (ver
  // gravandoPavimentosRef) pra continuar valendo se o modal for fechado e reaberto.
  const { trava: travaRef, ativa: busy, definir: setBusy } = gravacao;
  const [confirmar, setConfirmar] = React.useState(null);
  const [erro, setErro] = React.useState('');
  const [editando, setEditando] = React.useState(null); // nome original do pavimento em edição
  // Cópia ainda não gravada (Duplicar): { origem }. Só vai pro banco no Salvar: um toque
  // errado não deixa pavimento sobrando, que quem não é admin nem conseguiria excluir.
  const [copia, setCopia] = React.useState(null);
  const [rascunho, setRascunho] = React.useState('');
  const [erroEdicao, setErroEdicao] = React.useState('');

  const executar = async (fn) => {
    if (travaRef.current) return;
    travaRef.current = true;
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      logger.error('falha no cadastro de pavimentos das fotos', { module: 'pavimentosFotos', action: 'modal', obraId, err });
      toast('Erro ao salvar. ' + friendlyError(err), { tone: 'danger' });
    } finally {
      travaRef.current = false;
      setBusy(false);
    }
  };

  // Outro pavimento com o mesmo nome (sem diferenciar maiúscula); `exceto` = o próprio, na edição.
  const jaCadastrado = (n, exceto) => pavimentos.some(p => p !== exceto && p.toLowerCase() === n.toLowerCase());

  const adicionar = () => {
    const n = nome.trim();
    if (!n) { setErro('Informe o nome do pavimento.'); return; }
    if (jaCadastrado(n)) { setErro('Esse pavimento já está cadastrado.'); return; }
    executar(async () => {
      const r = await pavimentosFotosService.criar(obraId, n);
      if (!r.ok) { toast('Erro ao cadastrar pavimento. ' + friendlyError(r.error), { tone: 'danger' }); return; }
      setPavimentos(prev => (prev.includes(n) ? prev : [...prev, n]));
      setNome(''); setErro('');
    });
  };

  const iniciarEdicao = (p) => {
    if (travaRef.current) return;
    setEditando(p); setCopia(null); setRascunho(p); setErroEdicao(''); setConfirmar(null);
  };
  const cancelarEdicao = () => { setEditando(null); setCopia(null); setErroEdicao(''); };
  const salvarEdicao = () => {
    const n = rascunho.trim();
    if (!n) { setErroEdicao('Informe o nome do pavimento.'); return; }
    const antigo = editando;
    if (n === antigo) { cancelarEdicao(); return; }
    // Mudar só a maiúscula do próprio é permitido.
    if (jaCadastrado(n, antigo)) { setErroEdicao('Esse pavimento já está cadastrado.'); return; }
    executar(async () => {
      const r = await pavimentosFotosService.renomear(obraId, antigo, n);
      if (!r.ok) { toast('Erro ao renomear pavimento. ' + friendlyError(r.error), { tone: 'danger' }); return; }
      setPavimentos(prev => prev.map(x => (x === antigo ? n : x))); // mantém a posição
      onRenomeado?.(antigo, n);
      toast('Pavimento renomeado', { tone: 'success', icon: 'check' });
      cancelarEdicao();
    });
  };

  const pedirExclusao = (p) => { if (!travaRef.current) setConfirmar(p); };
  const excluir = (p) => executar(async () => {
    const r = await pavimentosFotosService.excluir(obraId, p);
    setConfirmar(null);
    if (!r.ok) { toast('Erro ao excluir pavimento. ' + friendlyError(r.error), { tone: 'danger' }); return; }
    setPavimentos(prev => prev.filter(x => x !== p));
  });

  const avisoPendenteTI = 'Reposicionar pavimentos ainda não foi liberado no banco: aguardando o TI aplicar a atualização.';

  // Grava a ordem a partir da lista ATUAL do banco, não da tela: outra pessoa pode ter
  // cadastrado, renomeado ou reposicionado com este modal aberto, e a função do banco só
  // posiciona os nomes enviados (os outros ficariam empatados numa posição qualquer).
  // `ordenar(lista)` devolve a ordem nova, ou null quando o pedido já não cabe na lista
  // (pavimento renomeado/excluído por outra pessoa, ou já na ponta). Devolve { ok } ou
  // { ok: false, aviso, tone, telaAtualizada }; com telaAtualizada a tela já mostra o banco.
  const gravarOrdem = async (ordenar) => {
    const atual = await pavimentosFotosService.listar(obraId);
    if (atual.error) return { ok: false, aviso: friendlyError(atual.error), tone: 'danger', telaAtualizada: false };
    // Vazia com pavimentos na tela: quase sempre a sessão caiu (a requisição sai anônima e o
    // RLS devolve 0 linhas, sem erro). Usar essa lista apagava a da tela e a guardada no
    // aparelho, e sem internet a foto não teria pavimento pra escolher.
    if (!atual.data.length && pavimentos.length) {
      return { ok: false, aviso: 'Não foi possível conferir a lista no servidor. Tente de novo.', tone: 'danger', telaAtualizada: false };
    }
    const nova = ordenar(atual.data);
    if (!nova) {
      setPavimentos(atual.data);
      return { ok: false, aviso: 'A lista foi alterada por outra pessoa. Confira a ordem e tente de novo.', tone: 'warning', telaAtualizada: true };
    }
    const r = await pavimentosFotosService.reordenar(obraId, nova);
    if (!r.ok) {
      setPavimentos(atual.data);
      return r.pendenteTI
        ? { ok: false, aviso: avisoPendenteTI, tone: 'warning', telaAtualizada: true }
        : { ok: false, aviso: friendlyError(r.error), tone: 'danger', telaAtualizada: true };
    }
    setPavimentos(nova);
    return { ok: true };
  };

  // Subir/descer: muda na tela na hora e a gravação confirma (ou corrige pelo banco).
  const mover = (p, delta) => {
    if (travaRef.current) return;
    const otimista = moverNaLista(pavimentos, pavimentos.indexOf(p), delta);
    if (otimista === pavimentos) return; // já na ponta
    const anterior = pavimentos;
    executar(async () => {
      setPavimentos(otimista);
      const r = await gravarOrdem(lista => {
        const nova = moverNaLista(lista, lista.indexOf(p), delta);
        return nova === lista ? null : nova;
      });
      if (r.ok) return;
      if (!r.telaAtualizada) setPavimentos(cur => (cur === otimista ? anterior : cur));
      toast(r.tone === 'danger' ? 'Erro ao reposicionar pavimento. ' + r.aviso : r.aviso, { tone: r.tone });
    });
  };

  // Duplicar: abre logo abaixo do original um "X (cópia)" pra renomear (do "1º Tipo" sai o
  // "2º Tipo" sem digitar tudo de novo). Só grava no Salvar.
  const duplicar = (p) => {
    if (travaRef.current) return;
    setEditando(null); setConfirmar(null);
    setCopia({ origem: p });
    setRascunho(nomeDaCopia(p, pavimentos)); setErroEdicao('');
  };
  const salvarCopia = () => {
    const n = rascunho.trim();
    if (!n) { setErroEdicao('Informe o nome do pavimento.'); return; }
    if (jaCadastrado(n)) { setErroEdicao('Esse pavimento já está cadastrado.'); return; }
    const { origem } = copia;
    executar(async () => {
      const r = await pavimentosFotosService.criar(obraId, n);
      if (!r.ok) { toast('Erro ao duplicar pavimento. ' + friendlyError(r.error), { tone: 'danger' }); return; }
      cancelarEdicao();
      // Recém-criado ele fica no fim (sem posição no banco); daí vai pra baixo do original.
      setPavimentos(prev => (prev.includes(n) ? prev : [...prev, n]));
      const ro = await gravarOrdem(lista => inserirDepois(lista.filter(x => x !== n), origem, n));
      if (!ro.ok) toast('Pavimento criado no fim da lista. ' + ro.aviso, { tone: 'warning' });
    });
  };

  // Linha com campo de nome: renomear um pavimento ou dar nome à cópia.
  const linhaDeNome = (rotulo, onSalvar) => (
    <tr>
      <td colSpan={2}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input className="input" style={{ flex: 1 }} value={rascunho} maxLength={60} autoFocus
            aria-label={rotulo}
            onChange={e => { setRascunho(e.target.value); setErroEdicao(''); }}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); onSalvar(); }
              if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelarEdicao(); }
            }} />
          <button className="icon-btn" title="Salvar" disabled={busy} onClick={onSalvar}>
            <Icon name="check" size={14} />
          </button>
          <button className="icon-btn" title="Cancelar" disabled={busy} onClick={cancelarEdicao}>
            <Icon name="x" size={14} />
          </button>
        </div>
        {erroEdicao && <div style={{ fontSize: 11.5, color: 'var(--danger)', marginTop: 3 }}>{erroEdicao}</div>}
      </td>
    </tr>
  );

  return (
    <Modal title="Pavimentos das fotos" subtitle="Lista usada no campo Pavimento do upload" onClose={onClose} size="compact" draggable resizable overlay={false}
      footer={<button className="btn btn-primary" onClick={onClose}>Fechar</button>}>
      <div className="stack">
        <div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" style={{ flex: 1 }} placeholder="Ex.: Térreo, 1º Pav. Tipo, Cobertura" value={nome} maxLength={60}
              onChange={e => { setNome(e.target.value); setErro(''); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionar(); } }} />
            <button className="btn btn-primary" onClick={adicionar} disabled={busy}>
              <Icon name="plus" size={14} />Adicionar
            </button>
          </div>
          {erro && <div style={{ fontSize: 11.5, color: 'var(--danger)', marginTop: 3 }}>{erro}</div>}
        </div>
        {pavimentos.length === 0 && !copia
          ? <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nenhum pavimento cadastrado nesta obra.</div>
          : (
            <table className="tbl pav-lista">
              <tbody>
                {pavimentos.map((p, i) => (
                  <React.Fragment key={p}>
                    {editando === p
                      ? linhaDeNome(`Novo nome de ${p}`, salvarEdicao)
                      : (
                        <tr>
                          <td style={{ padding: '6px 8px', wordBreak: 'break-word' }}>{p}</td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap', padding: '6px 8px', width: 1 }}>
                            {confirmar === p
                              ? (
                                <>
                                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirmar(null)}>Cancelar</button>
                                  <button className="btn btn-sm" style={{ background: 'var(--danger)', color: '#fff', fontWeight: 600, marginLeft: 6 }}
                                    disabled={busy} onClick={() => excluir(p)}>Sim, excluir</button>
                                </>
                              )
                              : (
                                // aria-disabled em vez de disabled: botão desabilitado perde o foco, e quem
                                // usa o teclado parava a cada Subir/Descer (o foco ia pro corpo da página).
                                // Os handlers ignoram o toque enquanto uma gravação está em andamento.
                                <div className="pav-acoes">
                                  <button className="icon-btn" title="Subir" aria-label={`Subir ${p}`} aria-disabled={busy || i === 0} onClick={() => mover(p, -1)}>
                                    <Icon name="chevron-up" size={14} />
                                  </button>
                                  <button className="icon-btn" title="Descer" aria-label={`Descer ${p}`} aria-disabled={busy || i === pavimentos.length - 1} onClick={() => mover(p, 1)}>
                                    <Icon name="chevron-down" size={14} />
                                  </button>
                                  <button className="icon-btn" title="Duplicar pavimento" aria-label={`Duplicar ${p}`} aria-disabled={busy} onClick={() => duplicar(p)}>
                                    <Icon name="copy" size={14} />
                                  </button>
                                  <button className="icon-btn" title="Editar pavimento" aria-label={`Editar ${p}`} aria-disabled={busy} onClick={() => iniciarEdicao(p)}>
                                    <Icon name="edit" size={14} />
                                  </button>
                                  {isAdmin && (
                                    <button className="icon-btn" title="Excluir pavimento" aria-label={`Excluir ${p}`} aria-disabled={busy} onClick={() => pedirExclusao(p)}>
                                      <Icon name="trash" size={14} />
                                    </button>
                                  )}
                                </div>
                              )}
                          </td>
                        </tr>
                      )}
                    {copia?.origem === p && linhaDeNome(`Nome da cópia de ${p}`, salvarCopia)}
                  </React.Fragment>
                ))}
                {/* Original renomeado/excluído com a cópia aberta: ela continua, no fim. */}
                {copia && !pavimentos.includes(copia.origem) && linhaDeNome('Nome da cópia', salvarCopia)}
              </tbody>
            </table>
          )}
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
          Editar o nome também atualiza as fotos já enviadas com esse pavimento.
          {isAdmin ? ' Excluir do cadastro não altera as fotos.' : ''}
        </div>
      </div>
    </Modal>
  );
};

// ----- Modal: Upload de Foto -----
const MAX_FOTOS = 7;

const UploadFotoModal = ({ obra, pavimentos = [], onGerenciarPavimentos, semRede = false, initialFiles = null, mobileView = false, onSave, onClose }) => {
  const toast = useToast();
  // initialFiles: foto já tirada pelo FAB antes do modal abrir (ver onFabCapture em
  // Fotos) — chega pronta, sem precisar de outro clique em "Tirar foto agora".
  const [files,   setFiles]   = React.useState(() => initialFiles || []); // [{ file, preview }]
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
    const espacoRestante = MAX_FOTOS - filesRef.current.length;
    if (espacoRestante <= 0) {
      toast(`Máximo de ${MAX_FOTOS} fotos por envio.`, { tone: 'danger', icon: 'alert' });
      e.target.value = '';
      return;
    }
    const aceitos = picked.slice(0, espacoRestante);
    if (picked.length > aceitos.length) {
      toast(`Só ${aceitos.length} foto(s) foram adicionadas — máximo de ${MAX_FOTOS} por envio.`, { tone: 'danger', icon: 'alert' });
    }
    const novos = aceitos.map(f => ({ file: f, preview: URL.createObjectURL(f) }));
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
  const hojeISO = new Date().toISOString().slice(0, 10);

  const handleSave = async () => {
    const novosErros = {};
    if (!files.length) novosErros.arquivo = 'Selecione ao menos uma foto.';
    if (!form.data) novosErros.data = 'Preencha a data.';
    else if (form.data > hojeISO) novosErros.data = 'A data não pode ser no futuro.';
    if (!form.pavimento.trim()) novosErros.pavimento = 'Selecione o pavimento.';
    setErros(novosErros);
    if (Object.keys(novosErros).length) return;
    setSaving(true);
    try {
      await onSave(form, files.map(f => f.file));
      onClose();
    } catch (e) {
      // onSave já exibe o toast de erro; mantém o modal aberto (com as fotos) para nova tentativa
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
          <Icon name="upload" size={14} />{saving ? 'Guardando…' : (files.length > 1 ? `Salvar ${files.length} fotos` : 'Salvar foto')}
        </button>
      </>}
    >
      <div className="stack">
        {files.length === 0
          ? (
            <div style={{ display: 'flex', gap: 10 }}>
              <label style={{ flex: 1, display: 'block', border: '2px dashed ' + (erros.arquivo ? 'var(--danger)' : 'var(--border)'), borderRadius: 8, padding: '40px 24px', textAlign: 'center', cursor: 'pointer' }}>
                <Icon name="image" size={32} />
                <div style={{ marginTop: 8, color: 'var(--text-muted)' }}>Clique para selecionar uma ou mais imagens</div>
                {erros.arquivo && <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--danger)' }}>{erros.arquivo}</div>}
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple style={{ display: 'none' }} onChange={e => { onFileChange(e); setErros(er => ({ ...er, arquivo: undefined })); }} />
              </label>
              {/* capture="environment" abre a câmera traseira do tablet/celular direto (em vez
                  do seletor de galeria) — suportado em browsers móveis; em desktop cai de volta
                  no seletor de arquivo normal, sem quebrar nada. */}
              <label style={{ flex: 1, display: 'block', border: '2px dashed ' + (erros.arquivo ? 'var(--danger)' : 'var(--border)'), borderRadius: 8, padding: '40px 24px', textAlign: 'center', cursor: 'pointer' }}>
                <Icon name="camera" size={32} />
                <div style={{ marginTop: 8, color: 'var(--text-muted)' }}>Tirar foto agora</div>
                <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => { onFileChange(e); setErros(er => ({ ...er, arquivo: undefined })); }} />
              </label>
            </div>
          )
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
                {files.length < MAX_FOTOS && (
                  <>
                    <label style={{ width: 72, height: 72, border: '2px dashed var(--border)', borderRadius: 8,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)' }}
                      title="Adicionar da galeria">
                      <Icon name="plus" size={18} />
                      <input type="file" accept="image/jpeg,image/png,image/webp" multiple style={{ display: 'none' }} onChange={onFileChange} />
                    </label>
                    <label style={{ width: 72, height: 72, border: '2px dashed var(--border)', borderRadius: 8,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)' }}
                      title="Tirar foto agora">
                      <Icon name="camera" size={18} />
                      <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onFileChange} />
                    </label>
                  </>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {files.length} de {MAX_FOTOS} foto{MAX_FOTOS !== 1 ? 's' : ''} selecionada{files.length !== 1 ? 's' : ''} — mesma descrição e pavimento serão aplicados a todas.
              </div>
            </div>
          )
        }
        <div className={'form-grid' + (mobileView ? ' form-grid-mobile' : '')}>
          <div className="field">
            <label>Data <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input type="date" value={form.data} max={hojeISO} onChange={e => { set('data', e.target.value); setErros(er => ({ ...er, data: undefined })); }} />
            {erros.data && <div style={{ fontSize: 11.5, color: 'var(--danger)', marginTop: 3 }}>{erros.data}</div>}
          </div>
          <div className="field">
            <label>Pavimento <span style={{ color: 'var(--danger)' }}>*</span></label>
            <PavimentoSelect value={form.pavimento} onChange={v => { set('pavimento', v); setErros(er => ({ ...er, pavimento: undefined })); }} options={pavimentos} onGerenciar={onGerenciarPavimentos} semRede={semRede} />
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
const EditFotoModal = ({ foto, pavimentos = [], onGerenciarPavimentos, mobileView = false, onSave, onClose }) => {
  const [form, setForm] = React.useState({ data: foto.data || '', pavimento: foto.pavimento || '', descricao: foto.descricao || '' });
  const [erros, setErros] = React.useState({});
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const hojeISO = new Date().toISOString().slice(0, 10);
  const handleSave = () => {
    const novosErros = {};
    if (!form.data) novosErros.data = 'Preencha a data.';
    else if (form.data > hojeISO) novosErros.data = 'A data não pode ser no futuro.';
    if (!form.pavimento.trim()) novosErros.pavimento = 'Selecione o pavimento.';
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
      <div className={'form-grid' + (mobileView ? ' form-grid-mobile' : '')}>
        <div className="field">
          <label>Data <span style={{ color: 'var(--danger)' }}>*</span></label>
          <input type="date" value={form.data} max={hojeISO} onChange={e => { set('data', e.target.value); setErros(er => ({ ...er, data: undefined })); }} />
          {erros.data && <div style={{ fontSize: 11.5, color: 'var(--danger)', marginTop: 3 }}>{erros.data}</div>}
        </div>
        <div className="field">
          <label>Pavimento <span style={{ color: 'var(--danger)' }}>*</span></label>
          <PavimentoSelect value={form.pavimento} onChange={v => { set('pavimento', v); setErros(er => ({ ...er, pavimento: undefined })); }} options={pavimentos} atual={foto.pavimento || ''} onGerenciar={onGerenciarPavimentos} />
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
      logger.error('erro no upload da capa', { module: 'obra', action: 'uploadCapa', err: error });
      toast('Erro no upload. ' + friendlyError(error), { tone: 'danger' });
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
const ObraDetail = ({ obra, userProfile, onBack, onObraUpdate, onObraDelete, onOpenCronograma, initialTab, hideChrome = false }) => {
  // Sempre abre em "Cronograma" ao entrar numa obra — antes ficava salvo em
  // sessionStorage sem distinguir qual obra, então abrir a obra B na aba "Fotos"
  // reaproveitava a aba que tinha ficado selecionada na obra A. `initialTab` é a
  // única exceção de propósito: só o Mobile Gate passa isso, pra abrir direto em
  // Fotos — sem a prop, o comportamento acima continua intacto (default 'cronograma').
  const [tab, setTab] = React.useState(initialTab || 'cronograma');
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
    // ResizeObserver no cabeçalho: reage a qualquer mudança de altura dele (fonte
    // carregando, ícone assentando etc.), não só quando etapasObra/cronoView mudam —
    // sem isso, o congelamento só "destravava" depois de trocar Lista/Gantt uma vez.
    const el = cronoHeaderRef.current;
    const ro = el ? new ResizeObserver(recompute) : null;
    ro?.observe(el);
    window.addEventListener('resize', recompute);
    return () => { ro?.disconnect(); window.removeEventListener('resize', recompute); };
  }, [etapasObra.length, cronoView]);
  // `position: sticky` de CSS não é confiável pra esse card (mesma lição já documentada em
  // Cronograma.jsx pro ganttPinned/distPinned: a topbar também é sticky, não fixed, e dois
  // sticky independentes no scroll do documento podem ficar com o cálculo desatualizado até
  // um reflow forçado acontecer — era por isso que só "destravava" trocando de aba Lista/Gantt).
  // Troca pro mesmo mecanismo em JS (sentinela + position:fixed) já usado lá.
  const cronoSentinelRef = React.useRef(null);
  const cronoCardRef = React.useRef(null);
  const [cronoPinned, setCronoPinned] = React.useState(null);
  React.useEffect(() => {
    let raf = 0;
    const check = () => {
      raf = 0;
      const s = cronoSentinelRef.current;
      if (!s) return;
      const r = s.getBoundingClientRect();
      if (r.top <= CRONO_STICKY_TOP) {
        setCronoPinned(prev => {
          if (prev) {
            return (Math.abs(prev.left - r.left) < 0.5 && Math.abs(prev.width - r.width) < 0.5) ? prev : { ...prev, left: r.left, width: r.width };
          }
          // transição solto -> fixo: captura a altura natural do card ANTES de fixá-lo
          return { left: r.left, width: r.width, height: cronoCardRef.current?.offsetHeight || 0 };
        });
      } else {
        setCronoPinned(prev => (prev ? null : prev));
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(check); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    check();
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
  }, []);
  const [etapasLoaded, setEtapasLoaded] = React.useState(!!AppData.cronograma[o.id]?.length);
  // Linhas de base do cronograma — referência do "vs planejado" do cabeçalho.
  const [baselinesObra, setBaselinesObra] = React.useState([]);

  React.useEffect(() => {
    // Modo foco Fotos (hideChrome): cronograma, vínculos e financeiro não aparecem, e o
    // cronograma tem vários MB que disputariam a banda com o envio das fotos.
    if (hideChrome) return undefined;
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
    if (hideChrome) return undefined; // ver efeito do cronograma acima
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

  // Financeiro (%) do cabeçalho = Gasto (%) do último fechamento físico-financeiro
  // importado desta obra (mesma fonte que alimenta a tabela "Avanço Físico × Financeiro"
  // do Dashboard) — não é mais um valor digitado à mão.
  const [financeiroPct, setFinanceiroPct] = React.useState(null);
  React.useEffect(() => {
    if (hideChrome) return undefined; // ver efeito do cronograma acima
    let cancelled = false;
    setFinanceiroPct(null);
    fisicoFinanceiroService.buscarUltimosPorObras([o.id]).then(({ data }) => {
      if (cancelled) return;
      const itens = data?.[0]?.itens;
      const total = itens ? getLinhaTotal(itens) : null;
      setFinanceiroPct(total ? total.gastoPct : null);
    });
    return () => { cancelled = true; };
  }, [o.id]);

  const cronFinalISO = etapasObra.length
    ? offsetToISO(Math.max(...etapasObra.map(e => taskEndDisplay({ isGroup: e.isGroup, inicio: e.inicio || 0, dur: e.dur || 0 }))))
    : null;

  // Avanço físico real + planejado acumulado até hoje (para o cabeçalho da obra) e peso
  // da Curva S da Visão Geral — mesmo Custo Orçado (valor vinculado + custo real) usado
  // pelo Cronograma → Curva Física / Dashboard (ver cronograma/curvaFisica.js), senão os
  // % divergem dos números oficiais mostrados nessas duas telas.
  const valorVinculadoMapObra = React.useMemo(
    () => computeValorVinculadoMap(etapasObra, vinculosObra, orcamentoItensMapObra),
    [etapasObra, vinculosObra, orcamentoItensMapObra]
  );
  const custoOrcadoMapObra = React.useMemo(
    () => computeCustoOrcadoMap(etapasObra, valorVinculadoMapObra),
    [etapasObra, valorVinculadoMapObra]
  );
  // "vs planejado" = quanto a LINHA DE BASE previa até hoje, com o mesmo peso de Custo
  // Orçado do avanço físico (antes pesava por duração e usava o cronograma ao vivo, então
  // não era comparável). Mesma linha de base que a Curva Física / Dashboard mostram
  // (seleção visível da obra, senão a mais recente); mês atual entra proporcional aos dias.
  // Sem linha de base, null — o cabeçalho avisa em vez de inventar um número.
  const heroStats = React.useMemo(() => {
    const avancoFisico = computeAvancoFisico(etapasObra, custoOrcadoMapObra);
    const blId = carregarBlVisivel(o.id) ?? defaultBlId(baselinesObra);
    const bl = baselinesObra.find(b => b.id === blId) || null;
    const planejadoHoje = bl?.etapas ? percentualPlanejadoAte(distDeRetrato(bl.etapas, valorVinculadoMapObra)) : null;
    return { avancoFisico, planejadoHoje };
  }, [etapasObra, custoOrcadoMapObra, baselinesObra, valorVinculadoMapObra, o.id]);

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
      {!hideChrome && (
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
              <div className="meta">{heroStats.planejadoHoje != null
                ? `vs planejado ${heroStats.planejadoHoje.toFixed(2)}% (linha de base)`
                : (etapasLoaded ? 'Sem linha de base' : 'Carregando…')}</div>
            </div>
            <div className="hero-stat">
              <div className="label">Financeiro</div>
              <div className="value num">{financeiroPct != null ? `${financeiroPct.toFixed(2)}%` : '—'}</div>
              {financeiroPct == null && <div className="meta">Sem fechamento importado</div>}
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
      </>
      )}

      {tab === 'cronograma' && (
        <>
          <div ref={cronoSentinelRef} aria-hidden="true" style={{ height: 0 }} />
          {cronoPinned && <div aria-hidden="true" style={{ height: cronoPinned.height }} />}
          <div ref={cronoCardRef} className="card" style={cronoPinned
            ? { position: 'fixed', top: CRONO_STICKY_TOP, left: cronoPinned.left, width: cronoPinned.width, zIndex: 5 }
            : undefined}>
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
              const thS = { padding: '6px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600,
                            color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em',
                            position: 'sticky', top: 0, zIndex: 1, background: 'var(--brand)' };
              const tdS = { padding: '5px 12px', fontSize: 13, borderBottom: '1px solid var(--border-subtle)' };
              // Fora da área com scroll de propósito: fica dentro do próprio scroll (horizontal
              // e vertical) ela rolava junto com a tabela, escondendo o filtro de nível.
              const temGrupo = etapasObra.some(e => e.isGroup);
              const NIVEL_ROW_H = 34;
              return (
                <>
                  {temGrupo && (
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
                  <div style={{ overflowX: 'auto', maxHeight: cronoBodyMaxH ? cronoBodyMaxH - (temGrupo ? NIVEL_ROW_H : 0) : undefined, overflowY: 'auto' }}>
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
                          // fim continua EXCLUSIVO (dia seguinte ao último trabalhado): alimenta
                          // a duração "fim - ini" abaixo, que precisa do offset cru. O -1 entra
                          // só na exibição da data (isoToBR mais abaixo).
                          const fim = Math.max(...etapasObra.map(e => taskEnd({ isGroup: e.isGroup, inicio: e.inicio || 0, dur: e.dur || 0 })));
                          const av = Math.round(computeAvancoFisico(etapasObra, custoOrcadoMapObra));
                          rows.push(
                            <tr key="resumo-projeto" style={{ background: 'var(--brand-50)' }}>
                              <td style={{ ...tdS, fontWeight: 800, color: 'var(--brand)' }}>Resumo do projeto</td>
                              <td style={tdS}>{isoToBR(offsetToISO(ini))}</td>
                              <td style={tdS}>{isoToBR(offsetToISO(fim - 1))}</td>
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
                              <td style={tdPai}>{isoToBR(offsetToISO(taskEndDisplay({ isGroup: e.isGroup, inicio: e.inicio || 0, dur: e.dur || 0 })))}</td>
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
                </>
              );
            })()}
          </div>
          </div>
        </>
      )}
      {tab === 'fotos' && <Fotos obra={o} readOnly={readOnly || abaSomenteLeitura(userProfile, 'obras', 'fotos')} isAdmin={isAdmin(userProfile)} hideChrome={hideChrome} />}

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
