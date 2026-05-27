import React from 'react';
import { Icon } from '../../components/Icons';
import { AppData } from '../../utils/data';

// Resumo de obras — visão executiva consolidada
const { brl: brlRS } = AppData;

const ResumoObrasScreen = () => {
  const D = AppData;
  const obras = D.obras;
  const ativas = obras.filter(o => o.status === 'em_andamento');

  // ===== Agregados =====
  const totalOrcado = ativas.reduce((s, o) => s + o.orcamento, 0);
  const totalRealizado = ativas.reduce((s, o) => s + o.gasto, 0);
  const totalConcluidas = obras.filter(o => o.status === 'concluida').length;
  const pctMedioFisico = ativas.reduce((s, o) => s + o.avancoFisico, 0) / ativas.length;
  const pctMedioFin = ativas.reduce((s, o) => s + o.avancoFinanceiro, 0) / ativas.length;
  const obrasRiscoAlto = ativas.filter(o => o.risco === 'alto').length;
  const obrasRiscoMedio = ativas.filter(o => o.risco === 'medio').length;
  const equipeTotal = ativas.reduce((s, o) => s + o.equipe, 0);
  const alertasTotal = ativas.reduce((s, o) => s + o.alertas, 0);

  // Variância orçamentária: realizado/orçado vs avanço físico esperado
  const variancia = ativas.map(o => {
    const exec = o.gasto / o.orcamento;
    const esperado = o.avancoFisico / 100;
    return { ...o, variancia: ((exec - esperado) * 100), exec, esperado };
  });

  const [orderBy, setOrderBy] = React.useState('avancoFisico');
  const sortedObras = [...ativas].sort((a, b) => {
    if (orderBy === 'avancoFisico') return b.avancoFisico - a.avancoFisico;
    if (orderBy === 'orcamento') return b.orcamento - a.orcamento;
    if (orderBy === 'risco') {
      const order = { alto: 0, medio: 1, baixo: 2 };
      return order[a.risco] - order[b.risco];
    }
    return 0;
  });

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Resumo de obras</h1>
          <div className="page-subtitle">Visão consolidada da carteira · {ativas.length} obras ativas · atualizado às 14:23</div>
        </div>
        <div className="page-actions">
          <select className="input" defaultValue="ano">
            <option value="ano">2026</option>
            <option value="trim">Trimestre atual</option>
            <option value="todos">Todo o histórico</option>
          </select>
          <button className="btn btn-ghost"><Icon name="download" size={15} />Exportar PDF</button>
        </div>
      </div>

      {/* ===== KPIs agregados ===== */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
        <RKPI label="Carteira ativa" value={ativas.length} unit="obras" icon="building" foot={`${totalConcluidas} concluídas`} />
        <RKPI label="Orçamento total" value={brlRS(totalOrcado, { compact: true })} icon="wallet" foot={`Realizado ${brlRS(totalRealizado, { compact: true })}`} />
        <RKPI label="Avanço físico médio" value={pctMedioFisico.toFixed(1)} unit="%" icon="trending-up" foot={`Financeiro ${pctMedioFin.toFixed(1)}%`} trendDir={pctMedioFisico >= pctMedioFin ? 'up' : 'down'} />
        <RKPI label="Equipe alocada" value={equipeTotal} icon="users" foot="diretos + terceirizados" />
        <RKPI label="Obras em risco" value={obrasRiscoAlto + obrasRiscoMedio} unit={`/ ${ativas.length}`} icon="alert-triangle" foot={`${obrasRiscoAlto} alto · ${obrasRiscoMedio} médio`} tone={obrasRiscoAlto > 0 ? 'warning' : null} />
        <RKPI label="Alertas abertos" value={alertasTotal} icon="bell" foot="requerem atenção" tone={alertasTotal > 5 ? 'danger' : null} />
      </div>

      {/* ===== COMPARATIVO PRINCIPAL ===== */}
      <div className="card" style={{ marginTop: 'var(--gap)' }}>
        <div className="card-header">
          <div>
            <div className="card-title">Quadro comparativo — avanço físico × financeiro</div>
            <div className="card-subtitle">Posição atual de cada obra · barras espelhadas para comparação direta</div>
          </div>
          <div className="card-actions">
            <div className="legend">
              <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--brand)' }}></span>Físico</span>
              <span className="legend-item"><span className="legend-swatch" style={{ background: '#1f8b5c' }}></span>Financeiro</span>
            </div>
            <div className="segmented">
              <button className={orderBy === 'avancoFisico' ? 'active' : ''} onClick={() => setOrderBy('avancoFisico')}>Avanço</button>
              <button className={orderBy === 'orcamento' ? 'active' : ''} onClick={() => setOrderBy('orcamento')}>Valor</button>
              <button className={orderBy === 'risco' ? 'active' : ''} onClick={() => setOrderBy('risco')}>Risco</button>
            </div>
          </div>
        </div>
        <div className="card-body" style={{ padding: '20px 24px' }}>
          <div className="stack" style={{ gap: 12 }}>
            {sortedObras.map(o => (<ComparativoRow key={o.id} obra={o} />))}
          </div>
        </div>
      </div>

      {/* ===== VARIÂNCIA + DISTRIBUIÇÃO ===== */}
      <div className="grid-cols-3-2" style={{ marginTop: 'var(--gap)' }}>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Variância orçamentária</div>
              <div className="card-subtitle">Realizado / orçado vs. avanço físico esperado — desvios positivos indicam consumo acima do esperado</div>
            </div>
          </div>
          <div className="card-body" style={{ padding: '14px 22px' }}>
            <VarianciaChart data={variancia} />
            <div className="text-xs text-muted" style={{ marginTop: 12, display: 'flex', gap: 18, fontFamily: 'var(--font-mono)' }}>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, background: 'var(--success)', borderRadius: 2, marginRight: 5 }}></span>Abaixo do esperado (positivo)</span>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, background: 'var(--danger)', borderRadius: 2, marginRight: 5 }}></span>Acima do esperado (atenção)</span>
            </div>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-header">
              <div className="card-title">Distribuição por risco</div>
            </div>
            <div className="card-body">
              <div className="stack" style={{ gap: 12 }}>
                {[
                  { label: 'Risco baixo',  qt: ativas.filter(o => o.risco === 'baixo').length,  cls: 'success', color: 'var(--success)' },
                  { label: 'Risco médio',  qt: obrasRiscoMedio,                                  cls: 'warning', color: 'var(--warning)' },
                  { label: 'Risco alto',   qt: obrasRiscoAlto,                                   cls: 'danger',  color: 'var(--danger)' },
                ].map((r, i) => (
                  <div key={i}>
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 5 }}>
                      <span className="text-sm" style={{ color: 'var(--text-soft)', fontWeight: 500 }}>{r.label}</span>
                      <span className="mono num fw-700">{r.qt}</span>
                    </div>
                    <div className="progress" style={{ height: 6 }}>
                      <span style={{ width: (r.qt / ativas.length * 100) + '%', background: r.color }}></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">Top performers</div>
              <div className="card-subtitle">Maior avanço relativo</div>
            </div>
            <div className="card-body" style={{ padding: '8px 14px' }}>
              {ativas.slice().sort((a, b) => b.avancoFisico - a.avancoFisico).slice(0, 3).map((o, i) => (
                <div key={o.id} className="row" style={{ padding: '10px 8px', borderBottom: i < 2 ? '1px solid var(--border)' : 'none', gap: 12 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 7,
                    background: i === 0 ? 'var(--brand)' : 'var(--brand-tint)',
                    color: i === 0 ? '#fff' : 'var(--brand)',
                    display: 'grid', placeItems: 'center',
                    fontWeight: 700, fontSize: 12,
                  }}>{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="strong" style={{ fontSize: 13 }}>{o.nome}</div>
                    <div className="text-xs text-muted mono">{o.id}</div>
                  </div>
                  <div className="mono num fw-700" style={{ fontSize: 14, color: 'var(--brand)' }}>{o.avancoFisico}%</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ===== TABELA COMPLETA ===== */}
      <div className="card" style={{ marginTop: 'var(--gap)' }}>
        <div className="card-header">
          <div>
            <div className="card-title">Detalhamento por obra</div>
            <div className="card-subtitle">Todas as métricas lado a lado</div>
          </div>
          <button className="btn btn-sm btn-ghost"><Icon name="download" size={13} />CSV</button>
        </div>
        <div className="card-body flush" style={{ overflow: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Obra</th>
                <th className="right">Orçamento</th>
                <th className="right">Realizado</th>
                <th className="right">Saldo</th>
                <th className="right">% Físico</th>
                <th className="right">% Financ.</th>
                <th className="right">Gap</th>
                <th>Risco</th>
                <th className="center">Equipe</th>
                <th className="center">Alertas</th>
                <th>Entrega</th>
              </tr>
            </thead>
            <tbody>
              {sortedObras.map(o => {
                const saldo = o.orcamento - o.gasto;
                const gap = o.avancoFisico - o.avancoFinanceiro;
                return (
                  <tr key={o.id}>
                    <td>
                      <div className="strong" style={{ marginBottom: 2 }}>{o.nome}</div>
                      <div className="text-xs text-muted mono">{o.id} · {o.tipo}</div>
                    </td>
                    <td className="right strong num">{brlRS(o.orcamento, { compact: true })}</td>
                    <td className="right num">{brlRS(o.gasto, { compact: true })}</td>
                    <td className="right mono num text-soft">{brlRS(saldo, { compact: true })}</td>
                    <td className="right">
                      <span className="mono num fw-700" style={{ color: 'var(--brand)' }}>{o.avancoFisico}%</span>
                    </td>
                    <td className="right mono num">{o.avancoFinanceiro}%</td>
                    <td className="right">
                      <span className={'badge ' + (Math.abs(gap) <= 2 ? 'success' : gap > 0 ? 'info' : 'warning')}>
                        {gap > 0 ? '+' : ''}{gap}pp
                      </span>
                    </td>
                    <td>
                      <span className={'badge ' + (o.risco === 'alto' ? 'danger' : o.risco === 'medio' ? 'warning' : 'success')}>
                        <span className="dot"></span>{o.risco === 'alto' ? 'Alto' : o.risco === 'medio' ? 'Médio' : 'Baixo'}
                      </span>
                    </td>
                    <td className="center mono num">{o.equipe}</td>
                    <td className="center">
                      {o.alertas === 0 ? <span className="text-faint">—</span> :
                        <span className={'badge ' + (o.alertas >= 3 ? 'danger' : 'warning')}>{o.alertas}</span>}
                    </td>
                    <td className="mono text-sm text-soft">{o.previsto.split('-').reverse().join('/')}</td>
                  </tr>
                );
              })}
              <tr style={{ background: 'var(--brand-tint)' }}>
                <td className="strong" style={{ color: 'var(--brand)' }}>TOTAL CARTEIRA</td>
                <td className="right mono num strong" style={{ color: 'var(--brand)' }}>{brlRS(totalOrcado, { compact: true })}</td>
                <td className="right mono num strong" style={{ color: 'var(--brand)' }}>{brlRS(totalRealizado, { compact: true })}</td>
                <td className="right mono num strong" style={{ color: 'var(--brand)' }}>{brlRS(totalOrcado - totalRealizado, { compact: true })}</td>
                <td className="right mono num strong" style={{ color: 'var(--brand)' }}>{pctMedioFisico.toFixed(1)}%</td>
                <td className="right mono num strong" style={{ color: 'var(--brand)' }}>{pctMedioFin.toFixed(1)}%</td>
                <td></td>
                <td></td>
                <td className="center mono num strong" style={{ color: 'var(--brand)' }}>{equipeTotal}</td>
                <td className="center mono num strong" style={{ color: 'var(--brand)' }}>{alertasTotal}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

// ============ KPI compacto ============
const RKPI = ({ label, value, unit, icon, foot, tone, trendDir }) => (
  <div className="kpi" style={{ padding: '14px 16px' }}>
    <div className="kpi-label" style={{ fontSize: 10.5 }}>
      <div className="kpi-icon" style={{
        width: 26, height: 26,
        background: tone === 'danger' ? 'var(--danger-bg)' : tone === 'warning' ? 'var(--warning-bg)' : 'var(--brand-tint)',
        color: tone === 'danger' ? 'var(--danger)' : tone === 'warning' ? 'var(--warning)' : 'var(--brand)',
      }}>
        <Icon name={icon} size={14} />
      </div>
      {label}
    </div>
    <div className="kpi-value num" style={{ fontSize: 22, marginTop: 8 }}>
      {value}{unit && <span className="unit" style={{ fontSize: 11.5, marginLeft: 4 }}>{unit}</span>}
    </div>
    {foot && (
      <div className="kpi-foot" style={{ marginTop: 6 }}>
        <span className="kpi-foot-text">{foot}</span>
      </div>
    )}
  </div>
);

// ============ Comparativo row ============
const ComparativoRow = ({ obra }) => {
  const gap = obra.avancoFisico - obra.avancoFinanceiro;
  const gapColor = Math.abs(gap) <= 2 ? 'var(--text-muted)' : gap > 0 ? 'var(--info)' : 'var(--warning)';
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '240px 1fr 80px',
      gap: 16,
      alignItems: 'center',
    }}>
      <div style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 8 }}>
          <span className="mono text-xs text-muted">{obra.id}</span>
          <span className={'badge ' + (obra.risco === 'alto' ? 'danger' : obra.risco === 'medio' ? 'warning' : 'success')} style={{ fontSize: 10 }}>
            <span className="dot"></span>{obra.risco}
          </span>
        </div>
        <div className="strong" style={{ fontSize: 13.5, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {obra.nome}
        </div>
        <div className="text-xs text-muted">{brlRS(obra.orcamento, { compact: true })} · {obra.equipe} colab.</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <ComparativoBar pct={obra.avancoFisico} color="var(--brand)" label="Físico" />
        <ComparativoBar pct={obra.avancoFinanceiro} color="#1f8b5c" label="Financ." />
      </div>

      <div style={{ textAlign: 'right' }}>
        <div className="mono num fw-700" style={{ fontSize: 15, color: gapColor, letterSpacing: '-0.01em' }}>
          {gap > 0 ? '+' : ''}{gap}<span style={{ fontSize: 10, marginLeft: 1 }}>pp</span>
        </div>
        <div className="text-xs text-muted">gap fis-fin</div>
      </div>
    </div>
  );
};

const ComparativoBar = ({ pct, color, label }) => (
  <div className="row" style={{ gap: 10, fontSize: 11 }}>
    <span style={{ width: 50, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: 10 }}>{label}</span>
    <div style={{ flex: 1, height: 12, background: 'var(--surface-muted)', borderRadius: 3, position: 'relative', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: pct + '%',
        background: color,
        borderRadius: 3,
        transition: 'width 0.4s ease',
      }}></div>
    </div>
    <span className="mono num fw-700" style={{ width: 42, textAlign: 'right', color: 'var(--text)', fontSize: 12 }}>{pct}%</span>
  </div>
);

// ============ Variancia chart ============
const VarianciaChart = ({ data }) => {
  const w = 720, h = 260;
  const pad = { l: 140, r: 24, t: 16, b: 24 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const center = pad.l + innerW / 2;
  const stepY = innerH / data.length;
  const barH = stepY * 0.5;

  const maxAbs = Math.max(...data.map(d => Math.abs(d.variancia))) || 1;
  const niceMax = Math.ceil(maxAbs / 5) * 5;
  const scale = (innerW / 2) / niceMax;

  return (
    <svg className="chart-svg" viewBox={`0 0 ${w} ${h}`}>
      {/* center line */}
      <line x1={center} x2={center} y1={pad.t} y2={pad.t + innerH} stroke="var(--border-strong)" strokeWidth="1.2" />
      {/* axis grid */}
      {[-niceMax, -niceMax / 2, niceMax / 2, niceMax].map((t, i) => (
        <g key={i}>
          <line x1={center + t * scale} x2={center + t * scale} y1={pad.t} y2={pad.t + innerH}
            stroke="var(--border)" strokeDasharray="3 3" />
          <text x={center + t * scale} y={h - 8} textAnchor="middle" fontSize="10" fill="var(--text-muted)" fontFamily="var(--font-mono)">
            {t > 0 ? '+' : ''}{t}pp
          </text>
        </g>
      ))}
      <text x={center} y={h - 8} textAnchor="middle" fontSize="10" fill="var(--text-muted)" fontFamily="var(--font-mono)">0</text>

      {data.map((d, i) => {
        const y = pad.t + stepY * i + (stepY - barH) / 2;
        const v = d.variancia;
        const len = Math.abs(v) * scale;
        const x = v >= 0 ? center : center - len;
        const fill = v >= 0 ? 'var(--danger)' : 'var(--success)';
        return (
          <g key={d.id}>
            <text x={pad.l - 8} y={y + barH / 2 + 4} textAnchor="end" fontSize="11.5" fill="var(--text-soft)" fontWeight="500">
              {d.nome}
            </text>
            <rect x={x} y={y} width={len} height={barH} rx="2" fill={fill} fillOpacity="0.9" />
            <text
              x={v >= 0 ? x + len + 6 : x - 6}
              y={y + barH / 2 + 4}
              textAnchor={v >= 0 ? 'start' : 'end'}
              fontSize="11"
              fontWeight="600"
              fill={fill}
              fontFamily="var(--font-mono)"
            >
              {v > 0 ? '+' : ''}{v.toFixed(1)}pp
            </text>
          </g>
        );
      })}
    </svg>
  );
};

export { ResumoObrasScreen };
