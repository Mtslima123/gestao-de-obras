import React from 'react';
import { Icon } from '../../components/Icons';
import { AppData } from '../../utils/data';
import { RiskBadge } from '../../components/RiskBadge';

// Dashboard Executivo
const { brl } = AppData;

// ----- Sparkline (mini chart in KPI cards) -----
const Sparkline = React.memo(({ data, color = 'var(--brand)', area = true }) => {
  const w = 90, h = 36;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const stepX = w / (data.length - 1);
  const pts = data.map((v, i) => [i * stepX, h - 4 - ((v - min) / range) * (h - 8)]);
  const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const areaPath = path + ` L ${w},${h} L 0,${h} Z`;
  const id = 'sg-' + Math.random().toString(36).slice(2, 8);
  return (
    <svg className="kpi-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      {area && <path d={areaPath} fill={`url(#${id})`} />}
      <path d={path} stroke={color} strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {pts.slice(-1).map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="2.4" fill={color} />)}
    </svg>
  );
});

// ----- KPI card -----
const KPI = React.memo(({ label, value, unit, trend, trendDir = 'up', trendText, icon, spark, sparkColor }) => (
  <div className="kpi">
    <div className="kpi-label">
      <div className="kpi-icon"><Icon name={icon} size={16} /></div>
      {label}
    </div>
    <div className="kpi-value">
      <span className="num">{value}</span>
      {unit && <span className="unit">{unit}</span>}
    </div>
    <div className="kpi-foot">
      <span className={'kpi-trend ' + trendDir}>
        <Icon name={trendDir === 'up' ? 'arrow-up' : trendDir === 'down' ? 'arrow-down' : 'arrow-right'} size={11} stroke={2.5} />
        {trend}
      </span>
      <span className="kpi-foot-text">{trendText}</span>
    </div>
    {spark && <Sparkline data={spark} color={sparkColor || 'var(--brand)'} />}
  </div>
));

// ----- Area chart — Avanço Físico vs Financeiro -----
const AreaChart = React.memo(({ series }) => {
  const w = 720, h = 260;
  const pad = { l: 36, r: 16, t: 16, b: 28 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const xs = series.map((_, i) => pad.l + (i / (series.length - 1)) * innerW);
  const max = 100;
  const yOf = (v) => pad.t + innerH - (v / max) * innerH;

  const linePath = (key) => series.map((d, i) => (i === 0 ? 'M' : 'L') + xs[i].toFixed(1) + ',' + yOf(d[key]).toFixed(1)).join(' ');
  const areaPath = (key) => linePath(key) + ` L ${xs[xs.length - 1]},${pad.t + innerH} L ${xs[0]},${pad.t + innerH} Z`;

  const yTicks = [0, 25, 50, 75, 100];

  return (
    <svg className="chart-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="grad-fis" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.22"/>
          <stop offset="100%" stopColor="var(--brand)" stopOpacity="0"/>
        </linearGradient>
        <linearGradient id="grad-fin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1f8b5c" stopOpacity="0.18"/>
          <stop offset="100%" stopColor="#1f8b5c" stopOpacity="0"/>
        </linearGradient>
      </defs>

      {/* grid */}
      <g className="chart-grid">
        {yTicks.map((t, i) => <line key={i} x1={pad.l} x2={w - pad.r} y1={yOf(t)} y2={yOf(t)} strokeDasharray={t === 0 ? '0' : '3 3'} />)}
      </g>
      {/* y axis labels */}
      <g className="chart-axis">
        {yTicks.map((t, i) => <text key={i} x={pad.l - 8} y={yOf(t) + 3} textAnchor="end">{t}%</text>)}
      </g>
      {/* x axis labels */}
      <g className="chart-axis">
        {series.map((d, i) => i % 2 === 0 && <text key={i} x={xs[i]} y={h - pad.b + 16} textAnchor="middle">{d.m}</text>)}
      </g>

      {/* areas */}
      <path d={areaPath('fis')} fill="url(#grad-fis)" />
      <path d={areaPath('fin')} fill="url(#grad-fin)" />

      {/* lines */}
      <path d={linePath('fis')} fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d={linePath('fin')} fill="none" stroke="#1f8b5c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="0" />

      {/* dots last */}
      <circle cx={xs[xs.length - 1]} cy={yOf(series[series.length - 1].fis)} r="4" fill="var(--brand)" stroke="white" strokeWidth="2" />
      <circle cx={xs[xs.length - 1]} cy={yOf(series[series.length - 1].fin)} r="4" fill="#1f8b5c" stroke="white" strokeWidth="2" />
    </svg>
  );
});

// ----- Bar chart — Faturamento -----
const BarChart = React.memo(({ series }) => {
  const w = 720, h = 220;
  const pad = { l: 36, r: 16, t: 16, b: 28 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const max = Math.max(...series.map(d => d.v));
  const niceMax = Math.ceil(max / 5) * 5;
  const barW = innerW / series.length * 0.55;
  const gap = innerW / series.length;
  const yOf = (v) => pad.t + innerH - (v / niceMax) * innerH;
  const yTicks = [0, niceMax / 4, niceMax / 2, (3 * niceMax) / 4, niceMax];

  return (
    <svg className="chart-svg" viewBox={`0 0 ${w} ${h}`}>
      <g className="chart-grid">
        {yTicks.map((t, i) => <line key={i} x1={pad.l} x2={w - pad.r} y1={yOf(t)} y2={yOf(t)} strokeDasharray={t === 0 ? '0' : '3 3'} />)}
      </g>
      <g className="chart-axis">
        {yTicks.map((t, i) => <text key={i} x={pad.l - 8} y={yOf(t) + 3} textAnchor="end">{t.toFixed(0)}</text>)}
        {series.map((d, i) => <text key={i} x={pad.l + gap * (i + 0.5)} y={h - pad.b + 16} textAnchor="middle">{d.m}</text>)}
      </g>
      {series.map((d, i) => {
        const x = pad.l + gap * (i + 0.5) - barW / 2;
        const y = yOf(d.v);
        const isLast = i === series.length - 1;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={pad.t + innerH - y} rx="3"
              fill={isLast ? 'var(--brand)' : 'var(--brand-100)'} />
            {isLast && <text x={x + barW / 2} y={y - 6} textAnchor="middle" fontSize="10.5" fontFamily="var(--font-mono)" fill="var(--brand)" fontWeight="600">{d.v.toFixed(1)}</text>}
          </g>
        );
      })}
    </svg>
  );
});

// ----- Donut -----
const Donut = ({ data, size = 160 }) => {
  const total = data.reduce((a, b) => a + b.value, 0);
  const cx = size / 2, cy = size / 2;
  const r = size / 2 - 8;
  const r2 = r - 22;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {data.map((d, i) => {
        const start = (acc / total) * Math.PI * 2 - Math.PI / 2;
        acc += d.value;
        const end = (acc / total) * Math.PI * 2 - Math.PI / 2;
        const large = (end - start) > Math.PI ? 1 : 0;
        const x1 = cx + Math.cos(start) * r;
        const y1 = cy + Math.sin(start) * r;
        const x2 = cx + Math.cos(end) * r;
        const y2 = cy + Math.sin(end) * r;
        const x3 = cx + Math.cos(end) * r2;
        const y3 = cy + Math.sin(end) * r2;
        const x4 = cx + Math.cos(start) * r2;
        const y4 = cy + Math.sin(start) * r2;
        const path = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${r2} ${r2} 0 ${large} 0 ${x4} ${y4} Z`;
        return <path key={i} d={path} fill={d.color} />;
      })}
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="22" fontWeight="700" fill="var(--text)" letterSpacing="-0.02em">{total}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize="10.5" fill="var(--text-muted)" letterSpacing="0.06em">OBRAS</text>
    </svg>
  );
};

// ----- Status badge for obra -----

// ----- Dashboard main -----
const Dashboard = ({ onOpenObra, onAcao }) => {
  const D = AppData;
  const [periodo, setPeriodo] = React.useState('12m');

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard Executivo</h1>
          <div className="page-subtitle">Visão consolidada de obras, financeiro e operação · atualizado às 14:23</div>
        </div>
        <div className="page-actions">
          <div className="filters">
            {['Hoje', '30d', '90d', '12m', 'YTD'].map(p => (
              <button key={p} className={'chip' + ((p.toLowerCase() === periodo) || (p === '12m' && periodo === '12m') ? ' active' : '')}
                onClick={() => setPeriodo(p.toLowerCase())}>
                {p}
              </button>
            ))}
          </div>
          <button className="btn btn-ghost"><Icon name="download" size={15} />Exportar</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid">
        <KPI label="Obras ativas" value="14" unit="em execução"
             trend="+2" trendDir="up" trendText="vs trimestre anterior"
             icon="building" spark={[10,11,11,12,12,13,13,14,14,14,14,14]} />
        <KPI label="Faturamento (12m)" value="R$ 213,4" unit="mi"
             trend="+18,4%" trendDir="up" trendText="vs período anterior"
             icon="wallet" spark={D.faturamentoSerie.map(d => d.v)} sparkColor="#1f8b5c" />
        <KPI label="Orçamento contratado" value="R$ 432,6" unit="mi"
             trend="+R$ 48 mi" trendDir="up" trendText="novos contratos no trimestre"
             icon="briefcase" spark={[260,275,290,310,330,360,380,395,410,418,425,432]} />
        <KPI label="Margem operacional" value="14,6" unit="%"
             trend="-0,8 p.p." trendDir="down" trendText="custos de insumos em alta"
             icon="trending-up" spark={[16.2,16.0,15.8,15.4,15.2,15.0,14.9,15.1,15.0,14.8,14.7,14.6]} sparkColor="#b3711a" />
      </div>

      {/* Charts row */}
      <div className="grid-cols-3-2" style={{ marginBottom: 'var(--gap)' }}>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Avanço físico × financeiro</div>
              <div className="card-subtitle">Carteira consolidada de obras ativas — últimos 12 meses</div>
            </div>
            <div className="card-actions">
              <div className="legend">
                <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--brand)' }}></span>Físico</span>
                <span className="legend-item"><span className="legend-swatch" style={{ background: '#1f8b5c' }}></span>Financeiro</span>
              </div>
              <button className="icon-btn"><Icon name="dots" size={16} /></button>
            </div>
          </div>
          <div className="card-body">
            <AreaChart series={D.avancoSerie} />
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Distribuição da carteira</div>
              <div className="card-subtitle">Por situação</div>
            </div>
            <button className="icon-btn"><Icon name="dots" size={16} /></button>
          </div>
          <div className="card-body">
            <div className="donut-wrap">
              <Donut data={D.distribuicaoStatus} size={170} />
              <div className="donut-legend">
                {D.distribuicaoStatus.map((d, i) => (
                  <div className="row" key={i} style={{ justifyContent: 'space-between' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span className="sw" style={{ background: d.color }}></span>
                      <span style={{ color: 'var(--text-soft)' }}>{d.label}</span>
                    </span>
                    <span className="mono num" style={{ color: 'var(--text)', fontWeight: 600 }}>{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Faturamento + alertas */}
      <div className="grid-cols-3-2" style={{ marginBottom: 'var(--gap)' }}>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Faturamento mensal</div>
              <div className="card-subtitle">Valores em R$ milhões — todas as obras</div>
            </div>
            <div className="card-actions">
              <button className="chip">Por obra <Icon name="chevron-down" size={12} className="caret" /></button>
              <button className="icon-btn"><Icon name="dots" size={16} /></button>
            </div>
          </div>
          <div className="card-body">
            <BarChart series={D.faturamentoSerie} />
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Alertas e pendências</div>
              <div className="card-subtitle">{D.alertas.length} itens requerem atenção</div>
            </div>
            <button className="btn btn-sm btn-subtle">Ver todos</button>
          </div>
          <div className="card-body flush">
            {D.alertas.map((a, i) => (
              <div className={'alert-item ' + a.tipo} key={i}>
                <div className={'alert-pill ' + a.tipo}></div>
                <div className="alert-icon">
                  <Icon name={a.tipo === 'danger' ? 'alert-triangle' : a.tipo === 'warning' ? 'alert' : 'flag'} size={15} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="alert-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.titulo}</div>
                  <div className="alert-sub">{a.sub}</div>
                </div>
                <div className="alert-time">{a.tempo}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top obras + eventos */}
      <div className="grid-cols-3-2">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Obras em execução</div>
              <div className="card-subtitle">Clique em uma obra para abrir o detalhamento</div>
            </div>
            <div className="card-actions">
              <button className="chip"><Icon name="filter" size={12} /> Filtros</button>
              <button className="chip">Todos os tipos <Icon name="chevron-down" size={12} className="caret" /></button>
            </div>
          </div>
          <div className="card-body flush" style={{ overflow: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Obra</th>
                  <th>Avanço</th>
                  <th className="right">Orçamento</th>
                  <th className="right">Realizado</th>
                  <th>Risco</th>
                  <th>Equipe</th>
                  <th>Entrega</th>
                </tr>
              </thead>
              <tbody>
                {D.obras.filter(o => o.status === 'em_andamento').slice(0, 6).map((o) => (
                  <tr key={o.id} onClick={() => onOpenObra(o)}
                      role="button" tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenObra(o); } }}>
                    <td>
                      <div className="strong" style={{ marginBottom: 2 }}>{o.nome}</div>
                      <div className="text-xs text-muted mono">{o.sigla || o.id} · {o.tipo}</div>
                    </td>
                    <td style={{ minWidth: 160 }}>
                      <div className="progress-row">
                        <div className={'progress' + (o.risco === 'alto' ? ' danger' : o.avancoFisico > 80 ? ' success' : '')}>
                          <span style={{ width: o.avancoFisico + '%' }}></span>
                        </div>
                        <span className="pct">{o.avancoFisico}%</span>
                      </div>
                    </td>
                    <td className="right strong num">{brl(o.orcamento, { compact: true })}</td>
                    <td className="right num">{brl(o.gasto, { compact: true })}</td>
                    <td><RiskBadge risk={o.risco} /></td>
                    <td>
                      <span className="row" style={{ gap: 6 }}>
                        <Icon name="users" size={14} style={{ color: 'var(--text-muted)' }} />
                        <span className="mono num text-sm">{o.equipe}</span>
                      </span>
                    </td>
                    <td className="mono text-sm text-soft">{o.previsto.split('-').reverse().join('/')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Próximos eventos</div>
              <div className="card-subtitle">Agenda da semana</div>
            </div>
            <button className="btn btn-sm btn-subtle">Agenda</button>
          </div>
          <div className="card-body" style={{ padding: '8px 8px' }}>
            {D.eventos.map((e, i) => (
              <div className="row" key={i} style={{ padding: '10px 12px', borderBottom: i < D.eventos.length - 1 ? '1px dashed var(--border)' : 'none', alignItems: 'flex-start', gap: 14 }}>
                <div style={{
                  width: 44, height: 48,
                  borderRadius: 8,
                  background: 'var(--brand-tint)',
                  display: 'grid', placeItems: 'center',
                  textAlign: 'center',
                  flexShrink: 0,
                }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--brand)', letterSpacing: '-0.02em', lineHeight: 1 }}>{e.dia}</div>
                  <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--brand)', letterSpacing: '0.06em', marginTop: 1 }}>{e.mes}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{e.titulo}</div>
                  <div className="text-xs text-muted mono" style={{ marginTop: 2 }}>{e.hora}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export { Dashboard };
