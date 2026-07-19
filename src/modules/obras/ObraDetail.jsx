import React from 'react';
import { Icon } from '../../components/Icons';
import { AppData } from '../../utils/data';
import { supabase } from '../../services/supabase';
import { Modal, ObraFormModal, useToast } from '../../components/Modals';
import { podeVerAba, moduloSomenteLeitura } from '../../utils/permissions';
import { migrateEtapas, offsetToISO, offsetToDate, dateToOffset } from '../cronograma/ganttUtils';

// Obra Detail Page
const { brl: brlD } = AppData;

// ----- Gantt -----
const MES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

// Calcula a janela de meses (rótulos + referencial em dias) a partir do período real das linhas exibidas.
// inicio/dur das etapas estão em dias (mesmo referencial de ganttUtils.js/Cronograma.jsx) — nunca em "meses".
function computeJanela(rows) {
  if (!rows.length) return null;
  const inicioMin = Math.min(...rows.map(e => e.inicio || 0));
  const fimMax    = Math.max(...rows.map(e => (e.inicio || 0) + (e.dur || 0)));
  const dIni = offsetToDate(inicioMin);
  const dFim = offsetToDate(fimMax);
  const totalMeses = (dFim.getFullYear() * 12 + dFim.getMonth()) - (dIni.getFullYear() * 12 + dIni.getMonth()) + 1;

  const primeiroDia = (y, m) => `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const inicioDias = dateToOffset(primeiroDia(dIni.getFullYear(), dIni.getMonth()));
  const fimDias    = dateToOffset(primeiroDia(dFim.getFullYear(), dFim.getMonth() + 1));

  const meses = Array.from({ length: totalMeses }, (_, i) => {
    const d = new Date(dIni.getFullYear(), dIni.getMonth() + i, 1);
    const nome = MES_ABREV[d.getMonth()];
    return (i === 0 || d.getMonth() === 0) ? `${nome}/${String(d.getFullYear()).slice(-2)}` : nome;
  });

  return { meses, inicioDias, spanDias: fimDias - inicioDias, totalMeses };
}

const Gantt = ({ etapas, resumoOnly = false }) => {
  const rows = resumoOnly && etapas.some(e => e.isGroup)
    ? etapas.filter(e => e.isGroup)
    : etapas; // sem grupos definidos: mostra tudo, evita card vazio

  const janela = computeJanela(rows);
  if (!janela) {
    return <div className="text-muted" style={{ padding: '24px 20px', textAlign: 'center', fontSize: 13 }}>Nenhuma etapa cadastrada.</div>;
  }
  const { meses: janelaMeses, inicioDias: janelaInicioDias, spanDias: janelaSpanDias } = janela;
  const totalMonths = janelaMeses.length;

  const barLeftPct  = (e) => ((e.inicio - janelaInicioDias) / janelaSpanDias) * 100;
  const barWidthPct = (e) => (e.dur / janelaSpanDias) * 100;

  const hojeDias = dateToOffset(new Date().toISOString().slice(0, 10));
  const hojePct  = ((hojeDias - janelaInicioDias) / janelaSpanDias) * 100;
  const mostrarHoje = hojePct >= 0 && hojePct <= 100;

  return (
    <div className="gantt" style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 220 + totalMonths * 70, position: 'relative' }}>
        <div className="gantt-head">
          <div style={{ padding: '8px 14px', fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>ETAPA</div>
          <div className="gantt-month-row" style={{ gridTemplateColumns: `repeat(${totalMonths}, 1fr)` }}>
            {janelaMeses.map((m, i) => <div key={i} className="gantt-month">{m}</div>)}
          </div>
        </div>
        {rows.map((e, i) => (
          <div className="gantt-row" key={i}>
            <div className="gantt-label">{e.etapa}</div>
            <div className="gantt-track">
              <div
                className={'gantt-bar ' + e.status}
                style={{
                  left: `calc(${barLeftPct(e)}% + 2px)`,
                  width: `calc(${barWidthPct(e)}% - 4px)`,
                }}
              >
                <div className="fill" style={{ width: e.avanco + '%' }}></div>
                <span style={{ position: 'relative', zIndex: 1 }}>{e.avanco > 0 ? e.avanco + '%' : ''}</span>
              </div>
            </div>
          </div>
        ))}
        {!resumoOnly && mostrarHoje && (
          <div className="gantt-today-line" style={{ left: `calc(220px + (100% - 220px) * ${hojePct / 100})` }}>
            <span className="gantt-today-label">Hoje</span>
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
const VisaoGeral = ({ etapas, etapasLoaded }) => {
  const D = AppData;
  return (
    <div className="stack">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Curva S — Físico vs Financeiro</div>
              <div className="card-subtitle">Acompanhamento mensal acumulado</div>
            </div>
            <div className="card-actions">
              <div className="legend">
                <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--brand)' }}></span>Físico</span>
                <span className="legend-item"><span className="legend-swatch" style={{ background: '#1f8b5c' }}></span>Financeiro</span>
                <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--text-faint)', borderRadius: 999 }}></span>Planejado</span>
              </div>
            </div>
          </div>
          <div className="card-body">
            <CurveS series={D.avancoSerie} />
          </div>
        </div>

        <div className="card">
          <div className="card-header">
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
              <Gantt etapas={etapas} resumoOnly />
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
const FotoLightbox = ({ fotos, idx, onNavigate, onClose }) => {
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
          src={foto.url}
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

      {/* Controles de zoom */}
      <div style={{ position: 'absolute', bottom: 52, left: '50%', transform: 'translateX(-50%)',
                    display: 'flex', gap: 6, alignItems: 'center', zIndex: 10 }}>
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

      {/* Metadados da foto */}
      <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
                    color: '#fff', textAlign: 'center', fontSize: 13, pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 10 }}>
        {foto.pavimento && <div style={{ fontWeight: 600 }}>{foto.pavimento}</div>}
        {foto.data      && <div style={{ opacity: 0.7 }}>{foto.data}</div>}
        {foto.descricao && <div style={{ opacity: 0.6, marginTop: 2 }}>{foto.descricao}</div>}
        <div style={{ opacity: 0.4, marginTop: 4, fontSize: 11.5 }}>{idx + 1} / {fotos.length}</div>
      </div>
    </div>
  );
};

// ----- Fotos tab -----
const Fotos = ({ obra, readOnly = false }) => {
  const toast = useToast();
  const [fotos,        setFotos]        = React.useState([]);
  const [loading,      setLoading]      = React.useState(true);
  const [showUpload,   setShowUpload]   = React.useState(false);
  const [editando,     setEditando]     = React.useState(null);
  const [filtroMes,    setFiltroMes]    = React.useState('');
  const [lightboxIdx,  setLightboxIdx]  = React.useState(null);

  const carregarFotos = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('fotos_obra')
        .select('*').eq('obra_id', obra.id).order('created_at', { ascending: false });
      if (error) throw error;
      if (data) {
        // Bucket privado: exibe via URL assinada gerada do storage_path (funciona também
        // em bucket público, então não depende da ordem de deploy). A coluna `url` pública
        // fica só como fallback.
        const paths = data.map(f => f.storage_path).filter(Boolean);
        const signed = {};
        if (paths.length) {
          const { data: urls } = await supabase.storage.from('obras-images').createSignedUrls(paths, 3600);
          (urls || []).forEach(u => { if (u.signedUrl && !u.error) signed[u.path] = u.signedUrl; });
        }
        setFotos(data.map(f => ({ ...f, url: signed[f.storage_path] || f.url })));
      }
    } catch (err) {
      console.error('[obra] falha ao carregar fotos', err);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { carregarFotos(); }, [obra.id]);

  const salvarFoto = async (metadados, file) => {
    if (file.size > 5 * 1024 * 1024) {
      toast('Imagem muito grande. Máximo: 5 MB', { tone: 'danger' });
      return;
    }
    const path = `obras/${obra.id}/fotos/${Date.now()}.jpg`;
    const blob = await compressImagem(file, 1200, 0.82);
    const { error: upErr } = await supabase.storage.from('obras-images').upload(path, blob, { contentType: 'image/jpeg' });
    if (upErr) { toast('Erro no upload: ' + upErr.message, { tone: 'danger' }); return; }
    const { data: { publicUrl } } = supabase.storage.from('obras-images').getPublicUrl(path);
    const { error: dbErr } = await supabase.from('fotos_obra').insert([{ obra_id: obra.id, url: publicUrl, storage_path: path, ...metadados }]);
    if (dbErr) { toast('Erro ao salvar foto', { tone: 'danger' }); return; }
    toast('Foto salva', { tone: 'success', icon: 'check' });
    carregarFotos();
  };

  const atualizarFoto = async (id, metadados) => {
    const { error } = await supabase.from('fotos_obra').update(metadados).eq('id', id);
    if (!error) { toast('Foto atualizada', { tone: 'success', icon: 'check' }); carregarFotos(); }
  };

  const excluirFoto = async (foto) => {
    await supabase.storage.from('obras-images').remove([foto.storage_path]);
    await supabase.from('fotos_obra').delete().eq('id', foto.id);
    setFotos(f => f.filter(x => x.id !== foto.id));
    toast('Foto excluída', { tone: 'neutral' });
  };

  const fotosFiltradas = fotos.filter(f => {
    if (filtroMes && !(f.data || '').startsWith(filtroMes)) return false;
    return true;
  });

  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--surface-2)',
                       padding: '3px 10px', borderRadius: 20, fontWeight: 500 }}>
          {fotos.length} foto{fotos.length !== 1 ? 's' : ''}
        </span>
        {!loading && fotos.length > 0 && (
          <>
            <input type="month" value={filtroMes}
              onChange={e => setFiltroMes(e.target.value)}
              style={{ height: 32, fontSize: 13, borderRadius: 6 }} />
            {filtroMes && (
              <button className="btn btn-ghost" style={{ height: 32 }}
                onClick={() => setFiltroMes('')}>
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
          ? <div className="card" style={{ padding: '64px 24px', textAlign: 'center' }}>
              <Icon name="image" size={40} style={{ color: 'var(--text-faint)' }} />
              <div className="text-muted" style={{ marginTop: 12 }}>Nenhuma foto cadastrada.<br/>Clique em Upload para adicionar a primeira foto.</div>
            </div>
          : fotosFiltradas.length === 0
            ? <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }}>
                <Icon name="search" size={32} style={{ color: 'var(--text-faint)' }} />
                <div className="text-muted" style={{ marginTop: 12 }}>Nenhuma foto encontrada para o filtro selecionado.</div>
              </div>
            : <div className="gallery">
                {fotosFiltradas.map((f, i) => (
                  <div key={f.id} className="photo" style={{ position: 'relative', overflow: 'hidden', cursor: 'zoom-in' }}
                       onClick={() => setLightboxIdx(i)}>
                    <img src={f.url} alt={f.descricao || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.7))', padding: '20px 10px 8px', color: '#fff', fontSize: 11.5 }}>
                      {f.pavimento && <div style={{ fontWeight: 600 }}>{f.pavimento}</div>}
                      {f.data && <div style={{ opacity: 0.75, fontSize: 11 }}>{f.data}</div>}
                      {f.descricao && <div style={{ opacity: 0.65, marginTop: 2 }}>{f.descricao}</div>}
                    </div>
                    {!readOnly && (
                      <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4 }}>
                        <button className="icon-btn" style={{ background: 'rgba(0,0,0,0.5)', color: '#fff', width: 28, height: 28 }}
                          onClick={e => { e.stopPropagation(); setEditando(f); }}><Icon name="edit" size={13} /></button>
                        <button className="icon-btn" style={{ background: 'rgba(0,0,0,0.5)', color: '#fff', width: 28, height: 28 }}
                          onClick={e => { e.stopPropagation(); excluirFoto(f); }}><Icon name="trash" size={13} /></button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
      }
      {showUpload && <UploadFotoModal obra={obra} onSave={salvarFoto} onClose={() => setShowUpload(false)} />}
      {editando && <EditFotoModal foto={editando} onSave={(m) => { atualizarFoto(editando.id, m); setEditando(null); }} onClose={() => setEditando(null)} />}
      {lightboxIdx !== null && (
        <FotoLightbox fotos={fotosFiltradas} idx={lightboxIdx} onNavigate={setLightboxIdx} onClose={() => setLightboxIdx(null)} />
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

// ----- Modal: Upload de Foto -----
const UploadFotoModal = ({ obra, onSave, onClose }) => {
  const [file,    setFile]    = React.useState(null);
  const [preview, setPreview] = React.useState(null);
  const [saving,  setSaving]  = React.useState(false);
  const [form,    setForm]    = React.useState({ data: new Date().toISOString().slice(0, 10), pavimento: '', descricao: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Revoga o objectURL anterior sempre que o preview muda e no unmount (evita leak de blob)
  React.useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview); };
  }, [preview]);

  const onFileChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleSave = async () => {
    if (!file) return;
    setSaving(true);
    try {
      await onSave(form, file);
      onClose();
    } catch (e) {
      // onSave normalmente já exibe o toast de erro; mantém o modal aberto para nova tentativa
      console.error('[fotos] falha ao salvar foto', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Upload de Foto" onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={!file || saving}>
          <Icon name="upload" size={14} />{saving ? 'Salvando…' : 'Salvar foto'}
        </button>
      </>}
    >
      <div className="stack">
        {preview
          ? <img src={preview} alt="preview" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 8 }} />
          : <label style={{ display: 'block', border: '2px dashed var(--border)', borderRadius: 8, padding: '40px 24px', textAlign: 'center', cursor: 'pointer' }}>
              <Icon name="image" size={32} />
              <div style={{ marginTop: 8, color: 'var(--text-muted)' }}>Clique para selecionar imagem</div>
              <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={onFileChange} />
            </label>
        }
        {preview && (
          <label style={{ cursor: 'pointer', color: 'var(--brand)', fontSize: 13 }}>
            Trocar imagem
            <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={onFileChange} />
          </label>
        )}
        <div className="form-grid">
          <div className="field">
            <label>Data</label>
            <input type="date" value={form.data} onChange={e => set('data', e.target.value)} />
          </div>
          <div className="field">
            <label>Pavimento</label>
            <input placeholder="Ex.: 3º Pavimento, Térreo" value={form.pavimento} onChange={e => set('pavimento', e.target.value)} />
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
const EditFotoModal = ({ foto, onSave, onClose }) => {
  const [form, setForm] = React.useState({ data: foto.data || '', pavimento: foto.pavimento || '', descricao: foto.descricao || '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <Modal title="Editar informações da foto" onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={() => { onSave(form); onClose(); }}>
          <Icon name="check" size={14} />Salvar
        </button>
      </>}
    >
      <div className="form-grid">
        <div className="field">
          <label>Data</label>
          <input type="date" value={form.data} onChange={e => set('data', e.target.value)} />
        </div>
        <div className="field">
          <label>Pavimento</label>
          <input placeholder="Ex.: 3º Pavimento, Térreo" value={form.pavimento} onChange={e => set('pavimento', e.target.value)} />
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
const HeroImage = ({ obra, onObraUpdate }) => {
  const toast = useToast();
  const [uploading, setUploading] = React.useState(false);
  const [heroSrc, setHeroSrc]     = React.useState(null);
  const inputRef = React.useRef();

  // Bucket privado: a capa é exibida via URL assinada do caminho determinístico.
  React.useEffect(() => {
    let alive = true;
    if (!obra.imageUrl) { setHeroSrc(null); return; }
    supabase.storage.from('obras-images')
      .createSignedUrl(`obras/${obra.id}/capa.jpg`, 3600)
      .then(({ data }) => { if (alive) setHeroSrc(data?.signedUrl || null); })
      .catch(err => console.error('[obra] falha ao carregar capa', err));
    return () => { alive = false; };
  }, [obra.id, obra.imageUrl]);

  const handleFile = async (file) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      toast('Formato não suportado. Use JPG, PNG ou WEBP.', { tone: 'error' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast('Imagem muito grande. Máximo: 5 MB', { tone: 'danger' });
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
    // Guarda o caminho (marcador de "tem capa"); a exibição sempre re-assina.
    onObraUpdate({ ...obra, imageUrl: path });
    toast('Imagem salva com sucesso', { tone: 'success', icon: 'check' });
    setUploading(false);
  };

  const src = heroSrc;
  const canUpload = !!onObraUpdate;

  return (
    <div
      className={'hero-img' + (src ? ' has-img' : '') + (uploading ? ' hero-img-uploading' : '')}
      onClick={() => canUpload && !uploading && inputRef.current?.click()}
      style={{ cursor: canUpload ? 'pointer' : 'default' }}
    >
      {src && <img src={src} alt={obra.nome} />}
      {!src && <span>1280 × 720</span>}
      {canUpload && (
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
    </div>
  );
};

// ----- Main ObraDetail -----
const ObraDetail = ({ obra, userProfile, onBack, onObraUpdate, onObraDelete, onOpenCronograma }) => {
  const [tab, setTab] = React.useState(() => {
    const saved = sessionStorage.getItem('obra_tab');
    return ['visao', 'cronograma', 'fotos'].includes(saved) ? saved : 'visao';
  });
  React.useEffect(() => { sessionStorage.setItem('obra_tab', tab); }, [tab]);
  const [cronoView, setCronoView] = React.useState('gantt');
  const [showEdit,   setShowEdit]   = React.useState(false);
  const [deleteStep, setDeleteStep] = React.useState(0);
  const D = AppData;
  const o = obra || D.obraAtual;
  const readOnly = moduloSomenteLeitura(userProfile, 'obras');

  // Busca as etapas do cronograma da obra — não depende de o usuário já ter aberto o módulo Cronograma
  const [etapasObra, setEtapasObra] = React.useState(() => AppData.cronograma[o.id] || []);
  const [etapasLoaded, setEtapasLoaded] = React.useState(!!AppData.cronograma[o.id]?.length);

  React.useEffect(() => {
    let cancelled = false;
    // Pinta o cache imediatamente para não piscar, mas SEMPRE rebusca do banco
    // (fonte da verdade). Assim edições/exclusões feitas no módulo Cronograma
    // se refletem aqui ao reabrir a obra, sem ficar "fixo" num cache antigo.
    const cache = AppData.cronograma[o.id];
    if (cache?.length) { setEtapasObra(cache); setEtapasLoaded(true); }
    else setEtapasLoaded(false);
    // maybeSingle: cronograma inexistente/apagado retorna data=null (sem erro)
    supabase.from('cronogramas').select('etapas').eq('obra_id', o.id).maybeSingle().then(({ data, error }) => {
      if (cancelled) return;
      if (error) { setEtapasLoaded(true); return; } // falha de rede: mantém o que já havia
      const etapas = data?.etapas ? migrateEtapas(data.etapas) : []; // apagado = vazio (não volta pro cache)
      AppData.cronograma[o.id] = etapas; // mantém o cache compartilhado com o módulo Cronograma
      setEtapasObra(etapas);
      setEtapasLoaded(true);
    });
    return () => { cancelled = true; };
  }, [o.id]);

  const cronFinalISO = etapasObra.length
    ? offsetToISO(Math.max(...etapasObra.map(e => (e.inicio || 0) + (e.dur || 0))))
    : null;

  const tabs = [
    { id: 'visao',      label: 'Visão geral' },
    { id: 'cronograma', label: 'Cronograma'  },
    { id: 'fotos',      label: 'Fotos'       },
  ].filter(t => podeVerAba(userProfile, 'obras', t.id));

  // Se a aba salva não estiver liberada para este usuário, cai na primeira permitida
  React.useEffect(() => {
    if (tabs.length && !tabs.some(t => t.id === tab)) setTab(tabs[0].id);
  }, [tabs, tab]);

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
        {onObraUpdate && onObraDelete && !readOnly && (
          <div className="page-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setShowEdit(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Editar
            </button>
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setDeleteStep(1)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
              Excluir
            </button>
          </div>
        )}
      </div>

      {/* HERO */}
      <div className="hero" style={{ marginBottom: 20 }}>
        <HeroImage obra={o} onObraUpdate={onObraUpdate} />
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
              <div className="value num" style={{ color: 'var(--brand)' }}>{o.avancoFisico}%</div>
              <div className="meta">vs planejado 65%</div>
            </div>
            <div className="hero-stat">
              <div className="label">Entrega</div>
              <div className="value num">{o.previsto ? o.previsto.split('-').reverse().join('/') : '—'}</div>
            </div>
            <div className="hero-stat">
              <div className="label">Fim do cronograma</div>
              <div className="value num">{cronFinalISO ? cronFinalISO.split('-').reverse().join('/') : '—'}</div>
              {(!etapasLoaded || !cronFinalISO) && (
                <div className="meta">{!etapasLoaded ? 'Carregando…' : 'Sem cronograma'}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="tabs">
        {tabs.map(t => (
          <button key={t.id} className={'tab' + (tab === t.id ? ' active' : '')} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'visao' && <VisaoGeral etapas={etapasObra} etapasLoaded={etapasLoaded} />}
      {tab === 'cronograma' && (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Cronograma físico</div>
              <div className="card-subtitle">
                {etapasObra.length} etapas{etapasObra.length ? ` · ${computeJanela(etapasObra)?.totalMeses ?? 0} meses` : ''}
              </div>
            </div>
            <div className="card-actions">
              <button className={'chip' + (cronoView === 'gantt' ? ' active' : '')} onClick={() => setCronoView('gantt')}>Gantt</button>
              <button className={'chip' + (cronoView === 'lista' ? ' active' : '')} onClick={() => setCronoView('lista')}>Lista</button>
              <button className="btn btn-sm btn-primary" onClick={() => onOpenCronograma && onOpenCronograma(o.id)}>
                <Icon name="arrow-right" size={13} />Ir para Cronograma
              </button>
            </div>
          </div>
          <div className="card-body" style={{ padding: '4px 0 0' }}>
            {cronoView === 'gantt' && <Gantt etapas={etapasObra} />}
            {cronoView === 'lista' && (() => {
              const statusLabel = { done: 'Concluído', late: 'Atrasado', upcoming: 'Planejado' };
              const thS = { padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600,
                            color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' };
              const tdS = { padding: '10px 12px', fontSize: 13, borderBottom: '1px solid var(--border-subtle)' };
              return (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={thS}>Etapa</th>
                        <th style={thS}>Início</th>
                        <th style={thS}>Duração</th>
                        <th style={thS}>Avanço</th>
                        <th style={thS}>Status</th>
                        <th style={thS}>Responsável</th>
                      </tr>
                    </thead>
                    <tbody>
                      {etapasObra.map((e, i) => (
                        <tr key={i}>
                          <td style={tdS}>{e.etapa}</td>
                          <td style={tdS}>Mês {Math.floor(e.inicio / 30) + 1}</td>
                          <td style={tdS}>{e.dur}d</td>
                          <td style={tdS}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 100 }}>
                              <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2 }}>
                                <div style={{ width: e.avanco + '%', height: '100%', background: 'var(--brand)', borderRadius: 2 }} />
                              </div>
                              <span style={{ minWidth: 32, textAlign: 'right' }}>{e.avanco}%</span>
                            </div>
                          </td>
                          <td style={tdS}><span className={'badge badge-' + e.status}>{statusLabel[e.status] || e.status}</span></td>
                          <td style={tdS}>{e.responsavel || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        </div>
      )}
      {tab === 'fotos' && <Fotos obra={o} readOnly={readOnly} />}

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

export { ObraDetail };
