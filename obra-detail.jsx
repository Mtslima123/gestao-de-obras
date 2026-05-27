// Obra Detail Page
const { brl: brlD } = window.AppData;

// ----- Gantt -----
const Gantt = ({ etapas }) => {
  const totalMonths = 26;
  const months = ['Mar/24','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez','Jan/25','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez','Jan/26','Fev','Mar','Abr'];
  return (
    <div className="gantt">
      <div className="gantt-head">
        <div style={{ padding: '8px 14px', fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>ETAPA</div>
        <div className="gantt-month-row" style={{ gridTemplateColumns: `repeat(${totalMonths}, 1fr)` }}>
          {months.slice(0, totalMonths).map((m, i) => <div key={i} className="gantt-month">{m}</div>)}
        </div>
      </div>
      {etapas.map((e, i) => (
        <div className="gantt-row" key={i}>
          <div className="gantt-label">{e.etapa}</div>
          <div className="gantt-track">
            <div
              className={'gantt-bar ' + e.status}
              style={{
                left: `calc(${(e.inicio / totalMonths) * 100}% + 2px)`,
                width: `calc(${(e.dur / totalMonths) * 100}% - 4px)`,
              }}
            >
              <div className="fill" style={{ width: e.avanco + '%' }}></div>
              <span style={{ position: 'relative', zIndex: 1 }}>{e.avanco > 0 ? e.avanco + '%' : ''}</span>
            </div>
          </div>
        </div>
      ))}
      {/* hoje line */}
    </div>
  );
};

// ----- Visão Geral tab -----
const VisaoGeral = ({ obra }) => {
  const D = window.AppData;
  const o = obra || D.obraAtual;
  return (
    <div className="stack">
      <div className="grid-cols-3-2">
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
            <div className="card-title">Indicadores chave</div>
            <button className="icon-btn"><Icon name="dots" size={16} /></button>
          </div>
          <div className="card-body">
            <div className="stack" style={{ gap: 14 }}>
              <MiniIndicator label="SPI — Índice de prazo" value="0,94" detail="4% atrasada" tone="warning" />
              <MiniIndicator label="CPI — Índice de custo" value="1,02" detail="2% abaixo do orçado" tone="success" />
              <MiniIndicator label="Desvio do orçamento" value="-R$ 1,2 mi" detail="Tendência: estabilizada" tone="success" />
              <MiniIndicator label="Acidentes (LTI)" value="0" detail="412 dias sem afastamento" tone="success" />
              <MiniIndicator label="Não-conformidades abertas" value="7" detail="3 críticas" tone="warning" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid-cols-3-2">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Cronograma resumido</div>
              <div className="card-subtitle">10 etapas principais</div>
            </div>
            <button className="btn btn-sm btn-subtle">Ver cronograma completo<Icon name="arrow-right" size={13} /></button>
          </div>
          <div className="card-body" style={{ padding: '4px 0 0' }}>
            <Gantt etapas={D.cronograma[o.id] || []} />
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Atividades recentes</div>
            <button className="icon-btn"><Icon name="dots" size={16} /></button>
          </div>
          <div className="card-body" style={{ padding: '4px 20px' }}>
            <div className="activity">
              {[
                { icon: 'check', tone: 'success', title: 'Medição 12 aprovada por Vértice', meta: 'R$ 4,86 mi liberados', time: '2h' },
                { icon: 'alert-triangle', tone: 'danger', title: 'Atraso em alvenaria — pavimento 6', meta: '4 dias atrás do cronograma', time: '5h' },
                { icon: 'box', tone: 'warning', title: 'Brita 1 abaixo do estoque mínimo', meta: '38 m³ disponíveis · pedido sugerido: 120 m³', time: '8h' },
                { icon: 'file', tone: 'info', title: 'Aditivo 03 anexado ao contrato', meta: 'Concretix Suprimentos · R$ 240 mil', time: 'ontem' },
                { icon: 'users', tone: 'info', title: '12 novos colaboradores integrados', meta: 'Equipe de revestimento', time: 'ontem' },
                { icon: 'shield', tone: 'success', title: 'DDS realizado — 47 presentes', meta: 'Tema: trabalho em altura', time: '2d' },
              ].map((a, i) => (
                <div className="activity-item" key={i}>
                  <div className={'activity-dot ' + a.tone}><Icon name={a.icon} size={14} /></div>
                  <div>
                    <div className="activity-title">{a.title}</div>
                    <div className="activity-meta">{a.meta}</div>
                  </div>
                  <div className="activity-time">{a.time}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const MiniIndicator = ({ label, value, detail, tone }) => (
  <div>
    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
      <span className="text-sm text-muted fw-600">{label}</span>
      <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text)' }} className="num">{value}</span>
    </div>
    <div className="row" style={{ gap: 8 }}>
      <div style={{
        height: 4, flex: 1, borderRadius: 2,
        background: tone === 'success' ? 'var(--success-bg)' : tone === 'warning' ? 'var(--warning-bg)' : 'var(--danger-bg)',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: tone === 'success' ? 'var(--success)' : tone === 'warning' ? 'var(--warning)' : 'var(--danger)',
          width: tone === 'success' ? '88%' : tone === 'warning' ? '62%' : '42%',
          borderRadius: 2,
        }}></div>
      </div>
      <span className="text-xs text-muted">{detail}</span>
    </div>
  </div>
);

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

// ----- Medições tab -----
const Medicoes = ({ onNovaMedicao }) => {
  const D = window.AppData;
  const total = D.medicoes.reduce((a, m) => a + m.medido, 0);
  return (
    <div className="stack">
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <KPISmall label="Acumulado medido" value={brlD(D.medicoes[0].acumulado, { compact: true })} sub="60% do orçamento total" />
        <KPISmall label="Última medição" value={brlD(D.medicoes[0].medido, { compact: true })} sub={`Boletim nº ${D.medicoes[0].num} · aprovada`} tone="success" />
        <KPISmall label="A medir no mês" value={brlD(5340000, { compact: true })} sub="Previsto até 30/05" />
        <KPISmall label="Retenção contratual" value={brlD(2561500, { compact: true })} sub="5% do realizado" />
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Boletins de medição</div>
            <div className="card-subtitle">Histórico completo de medições aprovadas</div>
          </div>
          <div className="card-actions">
            <button className="chip">2026 <Icon name="chevron-down" size={12} className="caret" /></button>
            <button className="btn btn-sm btn-ghost"><Icon name="download" size={13} />CSV</button>
            <button className="btn btn-sm btn-primary" onClick={onNovaMedicao}><Icon name="plus" size={13} />Nova medição</button>
          </div>
        </div>
        <div className="card-body flush">
          <table className="tbl">
            <thead>
              <tr>
                <th>Boletim</th>
                <th>Período</th>
                <th className="right">Contratual</th>
                <th className="right">Medido</th>
                <th className="right">Variação</th>
                <th className="right">Acumulado</th>
                <th>Status</th>
                <th>Aprovação</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {D.medicoes.map((m, i) => {
                const dif = m.medido - m.contratual;
                const pct = (dif / m.contratual) * 100;
                return (
                  <tr key={i}>
                    <td className="strong mono">#{m.num}</td>
                    <td>{m.periodo}</td>
                    <td className="right num">{brlD(m.contratual, { compact: true })}</td>
                    <td className="right strong num">{brlD(m.medido, { compact: true })}</td>
                    <td className="right">
                      <span className={'badge ' + (dif >= 0 ? 'success' : 'danger')}>
                        <Icon name={dif >= 0 ? 'arrow-up' : 'arrow-down'} size={10} stroke={2.5} />
                        {pct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="right num text-soft">{brlD(m.acumulado, { compact: true })}</td>
                    <td><span className="badge success"><Icon name="check" size={10} stroke={3} />Aprovada</span></td>
                    <td className="mono text-sm text-muted">{m.data}</td>
                    <td><button className="icon-btn" style={{ width: 28, height: 28 }}><Icon name="dots" size={14} /></button></td>
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

const KPISmall = ({ label, value, sub, tone }) => (
  <div className="kpi" style={{ padding: '14px 18px' }}>
    <div className="kpi-label">{label}</div>
    <div className="kpi-value num" style={{ fontSize: 22, marginTop: 6 }}>{value}</div>
    <div className="kpi-foot" style={{ marginTop: 6 }}>
      <span className="kpi-foot-text" style={{ color: tone === 'success' ? 'var(--success)' : 'var(--text-muted)' }}>{sub}</span>
    </div>
  </div>
);

// ----- Insumos tab -----
const Insumos = ({ onSolicitarCompra }) => {
  const D = window.AppData;
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Controle de insumos</div>
          <div className="card-subtitle">Consumo acumulado, estoque atual e nível mínimo</div>
        </div>
        <div className="card-actions">
          <input className="input input-search" placeholder="Buscar insumo…" style={{ minWidth: 220 }} />
          <button className="chip">Categoria <Icon name="chevron-down" size={12} className="caret" /></button>
          <button className="btn btn-sm btn-primary"><Icon name="plus" size={13} />Solicitar compra</button>
        </div>
      </div>
      <div className="card-body flush">
        <table className="tbl">
          <thead>
            <tr>
              <th>Insumo</th>
              <th>Un.</th>
              <th className="right">Consumo acum.</th>
              <th className="right">Estoque</th>
              <th className="right">Mínimo</th>
              <th>Nível</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {D.insumos.map((it, i) => {
              const ratio = Math.min(1.2, it.estoque / it.minimo);
              const cls = it.status === 'critico' ? 'danger' : it.status === 'baixo' ? 'warning' : 'success';
              return (
                <tr key={i}>
                  <td className="strong">{it.item}</td>
                  <td className="mono text-muted">{it.un}</td>
                  <td className="right num">{it.consumo.toLocaleString('pt-BR')}</td>
                  <td className="right strong num">{it.estoque.toLocaleString('pt-BR')}</td>
                  <td className="right num text-muted">{it.minimo.toLocaleString('pt-BR')}</td>
                  <td style={{ minWidth: 130 }}>
                    <div className={'progress ' + cls}>
                      <span style={{ width: Math.min(100, (ratio / 1.2) * 100) + '%' }}></span>
                    </div>
                  </td>
                  <td>
                    <span className={'badge ' + cls}><span className="dot"></span>
                      {it.status === 'critico' ? 'Crítico' : it.status === 'baixo' ? 'Abaixo do mínimo' : 'Normal'}
                    </span>
                  </td>
                  <td><button className="btn btn-sm btn-ghost" onClick={() => onSolicitarCompra && onSolicitarCompra(it)}>Pedir</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ----- Fornecedores tab -----
const Fornecedores = () => {
  const D = window.AppData;
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Fornecedores contratados</div>
          <div className="card-subtitle">{D.fornecedores.length} fornecedores · R$ 21,07 mi em contratos vigentes</div>
        </div>
        <div className="card-actions">
          <input className="input input-search" placeholder="Buscar fornecedor…" style={{ minWidth: 220 }} />
          <button className="btn btn-sm btn-primary"><Icon name="plus" size={13} />Novo fornecedor</button>
        </div>
      </div>
      <div className="card-body flush">
        <table className="tbl">
          <thead>
            <tr>
              <th>Fornecedor</th>
              <th>Categoria</th>
              <th className="right">Volume contratado</th>
              <th>Avaliação</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {D.fornecedores.map((f, i) => (
              <tr key={i}>
                <td>
                  <div className="strong" style={{ marginBottom: 2 }}>{f.nome}</div>
                  <div className="text-xs text-muted mono">{f.cnpj}</div>
                </td>
                <td>{f.categoria}</td>
                <td className="right strong num">{brlD(f.volume, { compact: true })}</td>
                <td>
                  <span className="row" style={{ gap: 4 }}>
                    <Icon name="star" size={13} style={{ color: '#d1a73a', fill: '#d1a73a' }} />
                    <span className="mono num fw-600">{f.avaliacao.toFixed(1)}</span>
                  </span>
                </td>
                <td>
                  <span className={'badge ' + (f.status === 'ativo' ? 'success' : 'warning')}>
                    <span className="dot"></span>
                    {f.status === 'ativo' ? 'Ativo' : 'Pendência'}
                  </span>
                </td>
                <td><button className="icon-btn" style={{ width: 28, height: 28 }}><Icon name="dots" size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ----- Equipe tab -----
const Equipe = () => {
  const D = window.AppData;
  return (
    <div className="stack">
      <div className="kpi-grid">
        <KPISmall label="Mão de obra total" value="142" sub="Diretos + terceirizados" />
        <KPISmall label="Funcionários diretos" value="68" sub="48% do total" />
        <KPISmall label="HH trabalhadas (mês)" value="22.460" sub="-3% vs mês anterior" />
        <KPISmall label="Dias sem afastamento" value="412" sub="Meta: 500 dias" tone="success" />
      </div>

      <div className="grid-cols-3-2">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Equipe técnica</div>
            <button className="btn btn-sm btn-primary"><Icon name="plus" size={13} />Adicionar</button>
          </div>
          <div className="card-body flush">
            <table className="tbl">
              <thead>
                <tr><th>Membro</th><th>Cargo</th><th>HH (mês)</th><th></th></tr>
              </thead>
              <tbody>
                {D.equipe.map((p, i) => (
                  <tr key={i}>
                    <td>
                      <div className="row" style={{ gap: 10 }}>
                        <div className={'avatar md ' + p.cor}>{p.iniciais}</div>
                        <span className="strong">{p.nome}</span>
                      </div>
                    </td>
                    <td className="text-soft">{p.cargo}</td>
                    <td className="mono num">{(160 + i * 8).toString()}</td>
                    <td><button className="icon-btn" style={{ width: 28, height: 28 }}><Icon name="dots" size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Distribuição por especialidade</div>
            <button className="icon-btn"><Icon name="dots" size={16} /></button>
          </div>
          <div className="card-body">
            <div className="stack" style={{ gap: 14 }}>
              {[
                { label: 'Estrutura / Armação', value: 38, color: 'var(--brand)' },
                { label: 'Alvenaria', value: 32, color: 'var(--brand-500)' },
                { label: 'Instalações elétricas', value: 22, color: '#1f8b5c' },
                { label: 'Instalações hidráulicas', value: 18, color: '#3d7fc9' },
                { label: 'Acabamento', value: 16, color: '#b3711a' },
                { label: 'Apoio e administração', value: 16, color: '#8a95ad' },
              ].map((d, i) => (
                <div key={i}>
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: 5 }}>
                    <span className="text-sm text-soft">{d.label}</span>
                    <span className="mono num text-sm fw-600">{d.value}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-muted)' }}>
                    <div style={{ height: '100%', width: (d.value / 38 * 100) + '%', background: d.color, borderRadius: 3 }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ----- Lightbox de foto -----
const FotoLightbox = ({ fotos, idx, onNavigate, onClose }) => {
  const foto = fotos[idx];

  React.useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowLeft'  && idx > 0)               onNavigate(idx - 1);
      if (e.key === 'ArrowRight' && idx < fotos.length - 1) onNavigate(idx + 1);
      if (e.key === 'Escape')                               onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [idx, fotos.length]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.92)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}
         onClick={onClose}>
      <button className="icon-btn"
        style={{ position: 'absolute', top: 16, right: 16, color: '#fff', background: 'rgba(255,255,255,0.15)', width: 40, height: 40 }}
        onClick={onClose}><Icon name="x" size={20} /></button>

      {idx > 0 && (
        <button className="icon-btn"
          style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#fff', background: 'rgba(255,255,255,0.15)', width: 44, height: 44 }}
          onClick={e => { e.stopPropagation(); onNavigate(idx - 1); }}>
          <Icon name="chevron-left" size={24} />
        </button>
      )}

      <img src={foto.url} alt={foto.descricao || ''}
        style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: 8, userSelect: 'none' }}
        onClick={e => e.stopPropagation()} />

      {idx < fotos.length - 1 && (
        <button className="icon-btn"
          style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', color: '#fff', background: 'rgba(255,255,255,0.15)', width: 44, height: 44 }}
          onClick={e => { e.stopPropagation(); onNavigate(idx + 1); }}>
          <Icon name="chevron-right" size={24} />
        </button>
      )}

      <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
                    color: '#fff', textAlign: 'center', fontSize: 13, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
        {foto.pavimento && <div style={{ fontWeight: 600 }}>{foto.pavimento}</div>}
        {foto.data      && <div style={{ opacity: 0.7 }}>{foto.data}</div>}
        {foto.descricao && <div style={{ opacity: 0.6, marginTop: 2 }}>{foto.descricao}</div>}
        <div style={{ opacity: 0.4, marginTop: 4, fontSize: 11.5 }}>{idx + 1} / {fotos.length}</div>
      </div>
    </div>
  );
};

// ----- Fotos tab -----
const Fotos = ({ obra }) => {
  const toast = useToast();
  const [fotos,        setFotos]        = React.useState([]);
  const [loading,      setLoading]      = React.useState(true);
  const [showUpload,   setShowUpload]   = React.useState(false);
  const [editando,     setEditando]     = React.useState(null);
  const [filtroData,   setFiltroData]   = React.useState('');
  const [filtroMes,    setFiltroMes]    = React.useState('');
  const [lightboxIdx,  setLightboxIdx]  = React.useState(null);

  const carregarFotos = async () => {
    setLoading(true);
    const { data, error } = await window.sb.from('fotos_obra')
      .select('*').eq('obra_id', obra.id).order('created_at', { ascending: false });
    if (!error && data) setFotos(data);
    setLoading(false);
  };

  React.useEffect(() => { carregarFotos(); }, [obra.id]);

  const salvarFoto = async (metadados, file) => {
    const path = `obras/${obra.id}/fotos/${Date.now()}.jpg`;
    const blob = await compressImagem(file, 1200, 0.82);
    const { error: upErr } = await window.sb.storage.from('obras-images').upload(path, blob, { contentType: 'image/jpeg' });
    if (upErr) { toast('Erro no upload: ' + upErr.message, { tone: 'danger' }); return; }
    const { data: { publicUrl } } = window.sb.storage.from('obras-images').getPublicUrl(path);
    const { error: dbErr } = await window.sb.from('fotos_obra').insert([{ obra_id: obra.id, url: publicUrl, storage_path: path, ...metadados }]);
    if (dbErr) { toast('Erro ao salvar foto', { tone: 'danger' }); return; }
    toast('Foto salva', { tone: 'success', icon: 'check' });
    carregarFotos();
  };

  const atualizarFoto = async (id, metadados) => {
    const { error } = await window.sb.from('fotos_obra').update(metadados).eq('id', id);
    if (!error) { toast('Foto atualizada', { tone: 'success', icon: 'check' }); carregarFotos(); }
  };

  const excluirFoto = async (foto) => {
    await window.sb.storage.from('obras-images').remove([foto.storage_path]);
    await window.sb.from('fotos_obra').delete().eq('id', foto.id);
    setFotos(f => f.filter(x => x.id !== foto.id));
    toast('Foto excluída', { tone: 'neutral' });
  };

  const fotosFiltradas = fotos.filter(f => {
    if (filtroData && f.data !== filtroData) return false;
    if (filtroMes  && !(f.data || '').startsWith(filtroMes)) return false;
    return true;
  });

  return (
    <>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <div className="card-title">Registro fotográfico</div>
          <div className="card-subtitle">{fotos.length} foto{fotos.length !== 1 ? 's' : ''} cadastrada{fotos.length !== 1 ? 's' : ''}</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowUpload(true)}>
          <Icon name="upload" size={15} />Upload
        </button>
      </div>

      {!loading && fotos.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ margin: 0 }}>
            <label style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>Data</label>
            <input type="date" value={filtroData}
              onChange={e => { setFiltroData(e.target.value); setFiltroMes(''); }}
              style={{ height: 34, fontSize: 13 }} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>Mês</label>
            <input type="month" value={filtroMes}
              onChange={e => { setFiltroMes(e.target.value); setFiltroData(''); }}
              style={{ height: 34, fontSize: 13 }} />
          </div>
          {(filtroData || filtroMes) && (
            <button className="btn btn-ghost" style={{ height: 34 }}
              onClick={() => { setFiltroData(''); setFiltroMes(''); }}>
              <Icon name="x" size={13} />Limpar
            </button>
          )}
        </div>
      )}

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
                    <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4 }}>
                      <button className="icon-btn" style={{ background: 'rgba(0,0,0,0.5)', color: '#fff', width: 28, height: 28 }}
                        onClick={e => { e.stopPropagation(); setEditando(f); }}><Icon name="edit" size={13} /></button>
                      <button className="icon-btn" style={{ background: 'rgba(0,0,0,0.5)', color: '#fff', width: 28, height: 28 }}
                        onClick={e => { e.stopPropagation(); excluirFoto(f); }}><Icon name="trash" size={13} /></button>
                    </div>
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

  const onFileChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleSave = async () => {
    if (!file) return;
    setSaving(true);
    await onSave(form, file);
    setSaving(false);
    onClose();
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
  const inputRef = React.useRef();

  const handleFile = async (file) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      toast('Formato não suportado. Use JPG, PNG ou WEBP.', { tone: 'error' });
      return;
    }
    setUploading(true);
    const blob = await compressImagem(file);
    const path = `obras/${obra.id}/capa.jpg`;
    const { error } = await window.sb.storage.from('obras-images').upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
    if (error) {
      toast('Erro no upload: ' + error.message, { tone: 'danger' });
      setUploading(false);
      return;
    }
    const { data } = window.sb.storage.from('obras-images').getPublicUrl(path);
    onObraUpdate({ ...obra, imageUrl: data.publicUrl });
    toast('Imagem salva com sucesso', { tone: 'success', icon: 'check' });
    setUploading(false);
  };

  const src = obra.imageUrl;
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
const ObraDetail = ({ obra, onBack, onNovaMedicao, onSolicitarCompra, onObraUpdate, onObraDelete, onOpenCronograma }) => {
  const [tab, setTab] = React.useState('visao');
  const [showEdit,   setShowEdit]   = React.useState(false);
  const [deleteStep, setDeleteStep] = React.useState(0);
  const D = window.AppData;
  const o = obra || D.obraAtual;
  const margem = ((o.orcamento - o.gasto) / o.orcamento * 100).toFixed(1);

  const tabs = [
    { id: 'visao', label: 'Visão geral' },
    { id: 'cronograma', label: 'Cronograma', count: 10 },
    { id: 'equipe', label: 'Equipe', count: o.equipe },
    { id: 'fotos', label: 'Fotos', count: 84 },
  ];

  return (
    <>
      <div className="page-header" style={{ marginBottom: 18 }}>
        <div>
          <div className="row" style={{ gap: 8, marginBottom: 6 }}>
            <button className="btn btn-sm btn-ghost" onClick={onBack}><Icon name="chevron-left" size={13} />Voltar</button>
            <span className="badge info"><span className="dot"></span>Em execução</span>
            <RiskBadge risk={o.risco} />
          </div>
        </div>
        {onObraUpdate && onObraDelete && (
          <div className="page-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setShowEdit(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Editar
            </button>
            <button className="btn btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setDeleteStep(1)}>
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
            <span className="code">{o.id}</span>
            <span>·</span>
            <span>{o.tipo}</span>
            <span>·</span>
            <span className="row" style={{ gap: 4 }}><Icon name="map-pin" size={12} /> {o.endereco}</span>
          </div>
          <h1 className="hero-title">{o.nome}</h1>
          <div className="hero-sub">
            <span className="row" style={{ gap: 6 }}>
              <span className="avatar av-1 sm">CM</span>
              <span style={{ color: 'var(--text-soft)' }}>{o.responsavel}</span>
            </span>
            <span>·</span>
            <span>Cliente: <span style={{ color: 'var(--text-soft)', fontWeight: 600 }}>{o.cliente}</span></span>
          </div>
          <div className="hero-stats">
            <div className="hero-stat">
              <div className="label">Avanço físico</div>
              <div className="value num" style={{ color: 'var(--brand)' }}>{o.avancoFisico}%</div>
              <div className="meta">vs planejado 65%</div>
            </div>
            <div className="hero-stat">
              <div className="label">Orçamento</div>
              <div className="value num">{brlD(o.orcamento, { compact: true })}</div>
              <div className="meta">Realizado {brlD(o.gasto, { compact: true })}</div>
            </div>
            <div className="hero-stat">
              <div className="label">Margem prevista</div>
              <div className="value num" style={{ color: 'var(--success)' }}>{margem}%</div>
              <div className="meta">{brlD(o.orcamento - o.gasto, { compact: true })} a executar</div>
            </div>
            <div className="hero-stat">
              <div className="label">Entrega</div>
              <div className="value num">30/09/26</div>
              <div className="meta">128 dias para conclusão</div>
            </div>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="tabs">
        {tabs.map(t => (
          <button key={t.id} className={'tab' + (tab === t.id ? ' active' : '')} onClick={() => setTab(t.id)}>
            {t.label}
            {t.count != null && <span className="tab-count">{t.count}</span>}
          </button>
        ))}
      </div>

      {tab === 'visao' && <VisaoGeral obra={o} />}
      {tab === 'cronograma' && (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Cronograma físico</div>
              <div className="card-subtitle">{(D.cronograma[o.id] || []).length} etapas · 28 meses</div>
            </div>
            <div className="card-actions">
              <button className="chip active">Gantt</button>
              <button className="chip">Lista</button>
              <button className="btn btn-sm btn-primary" onClick={() => onOpenCronograma && onOpenCronograma(o.id)}>
                <Icon name="arrow-right" size={13} />Ir para Cronograma
              </button>
            </div>
          </div>
          <div className="card-body" style={{ padding: '4px 0 0' }}>
            <Gantt etapas={D.cronograma[o.id] || []} />
          </div>
        </div>
      )}
      {tab === 'equipe' && <Equipe />}
      {tab === 'fotos' && <Fotos obra={o} />}

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
              Tem certeza que deseja excluir a obra <strong>{o.nome}</strong> ({o.id})?
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

window.ObraDetail = ObraDetail;
