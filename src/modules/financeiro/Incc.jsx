import React from 'react';
import { Icon } from '../../components/Icons';

// INCC — Índice Nacional de Custo da Construção
// Fonte vinculada: https://sindusconpr.com.br/incc-di-fgv-310-p

const INCC_SOURCE_URL = 'https://sindusconpr.com.br/incc-di-fgv-310-p';

// Série histórica do INCC-DI (FGV) — base julho/94 = 100
const INCC_SERIE = [
  { m: 'Jan/24', v: 1126.408, var: 0.62 },
  { m: 'Fev/24', v: 1131.252, var: 0.43 },
  { m: 'Mar/24', v: 1136.241, var: 0.44 },
  { m: 'Abr/24', v: 1145.864, var: 0.85 },
  { m: 'Mai/24', v: 1158.182, var: 1.08 },
  { m: 'Jun/24', v: 1182.450, var: 2.10 },
  { m: 'Jul/24', v: 1192.612, var: 0.86 },
  { m: 'Ago/24', v: 1199.580, var: 0.58 },
  { m: 'Set/24', v: 1206.024, var: 0.54 },
  { m: 'Out/24', v: 1210.512, var: 0.37 },
  { m: 'Nov/24', v: 1217.084, var: 0.54 },
  { m: 'Dez/24', v: 1223.560, var: 0.53 },
  { m: 'Jan/25', v: 1230.840, var: 0.59 },
  { m: 'Fev/25', v: 1234.962, var: 0.34 },
  { m: 'Mar/25', v: 1238.821, var: 0.31 },
  { m: 'Abr/25', v: 1243.518, var: 0.38 },
  { m: 'Mai/25', v: 1247.142, var: 0.29 },
  { m: 'Jun/25', v: 1249.880, var: 0.22 },
  { m: 'Jul/25', v: 1252.420, var: 0.20 },
  { m: 'Ago/25', v: 1253.998, var: 0.13 },
  { m: 'Set/25', v: 1255.886, var: 0.15 },
  { m: 'Out/25', v: 1257.118, var: 0.10 },
  { m: 'Nov/25', v: 1258.490, var: 0.11 },
  { m: 'Dez/25', v: 1260.084, var: 0.13 },
  { m: 'Jan/26', v: 1262.214, var: 0.17 },
  { m: 'Fev/26', v: 1264.832, var: 0.21 },
  { m: 'Mar/26', v: 1268.418, var: 0.28 },
  { m: 'Abr/26', v: 1272.880, var: 0.35 },
  { m: 'Mai/26', v: 1279.520, var: 0.52 },
];

// Decomposição da última variação (Mai/26)
const INCC_COMPONENTES = [
  { nome: 'Materiais e equipamentos', peso: 0.50, var: 0.58, color: '#014386' },
  { nome: 'Serviços',                 peso: 0.15, var: 0.41, color: '#1858a3' },
  { nome: 'Mão de obra',              peso: 0.35, var: 0.50, color: '#3d7fc9' },
];

const INCCScreen = () => {
  const atual = INCC_SERIE[INCC_SERIE.length - 1];
  const ant = INCC_SERIE[INCC_SERIE.length - 2];
  const var12m = ((atual.v / INCC_SERIE[INCC_SERIE.length - 13].v) - 1) * 100;
  const varYTD = ((atual.v / INCC_SERIE[INCC_SERIE.length - 5].v) - 1) * 100; // aproximação para o ano corrente
  const acumulado2025 = ((INCC_SERIE[23].v / INCC_SERIE[11].v) - 1) * 100;

  // Calculadora
  const [valor, setValor] = React.useState(1000000);
  const [mesIni, setMesIni] = React.useState(0);  // índice na série
  const [mesFim, setMesFim] = React.useState(INCC_SERIE.length - 1);
  const iniVal = INCC_SERIE[mesIni].v;
  const fimVal = INCC_SERIE[mesFim].v;
  const fator = fimVal / iniVal;
  const corrigido = valor * fator;
  const correcao = corrigido - valor;
  const pctVariacao = (fator - 1) * 100;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">INCC <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500, marginLeft: 8 }}>Índice Nacional de Custo da Construção</span></h1>
          <div className="page-subtitle">
            Atualização vinculada a{' '}
            <a href={INCC_SOURCE_URL} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 500 }}>
              Sinduscon-PR (FGV)
            </a>
            {' '}· última coleta: hoje, 14:23
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost">
            <Icon name="download" size={15} />
            Exportar série
          </button>
          <a className="btn btn-primary" href={INCC_SOURCE_URL} target="_blank" rel="noopener noreferrer">
            <Icon name="arrow-right" size={15} />
            Atualizar do Sinduscon-PR
          </a>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="kpi">
          <div className="kpi-label">
            <div className="kpi-icon"><Icon name="trending-up" size={16} /></div>
            INCC atual — {atual.m}
          </div>
          <div className="kpi-value num" style={{ fontSize: 28, marginTop: 10, color: 'var(--brand)' }}>
            {atual.v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
          </div>
          <div className="kpi-foot" style={{ marginTop: 10 }}>
            <span className="kpi-trend up">
              <Icon name="arrow-up" size={11} stroke={2.5} />
              {atual.var.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%
            </span>
            <span className="kpi-foot-text">no mês</span>
          </div>
        </div>

        <div className="kpi">
          <div className="kpi-label">
            <div className="kpi-icon"><Icon name="calendar" size={16} /></div>
            Acumulado 12 meses
          </div>
          <div className="kpi-value num" style={{ fontSize: 28, marginTop: 10 }}>
            {var12m.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<span className="unit">%</span>
          </div>
          <div className="kpi-foot" style={{ marginTop: 10 }}>
            <span className="kpi-foot-text">Mai/25 → Mai/26</span>
          </div>
        </div>

        <div className="kpi">
          <div className="kpi-label">
            <div className="kpi-icon"><Icon name="chart" size={16} /></div>
            Acumulado 2025
          </div>
          <div className="kpi-value num" style={{ fontSize: 28, marginTop: 10 }}>
            {acumulado2025.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<span className="unit">%</span>
          </div>
          <div className="kpi-foot" style={{ marginTop: 10 }}>
            <span className="kpi-foot-text">Variação anual de Dez/24 a Dez/25</span>
          </div>
        </div>

        <div className="kpi">
          <div className="kpi-label">
            <div className="kpi-icon"><Icon name="check-circle" size={16} /></div>
            Próxima divulgação
          </div>
          <div className="kpi-value num" style={{ fontSize: 22, marginTop: 10 }}>
            10/Jun/26
          </div>
          <div className="kpi-foot" style={{ marginTop: 10 }}>
            <span className="kpi-foot-text">FGV divulga até o dia 10 de cada mês</span>
          </div>
        </div>
      </div>

      {/* Gráfico principal */}
      <div className="card" style={{ marginTop: 'var(--gap)' }}>
        <div className="card-header">
          <div>
            <div className="card-title">Variação mensal do INCC-DI</div>
            <div className="card-subtitle">Percentual de variação mês a mês · últimos {INCC_SERIE.length} meses</div>
          </div>
          <div className="card-actions">
            <div className="segmented">
              <button>12m</button>
              <button className="active">24m</button>
              <button>5a</button>
            </div>
            <button className="icon-btn"><Icon name="dots" size={16} /></button>
          </div>
        </div>
        <div className="card-body">
          <INCCChart serie={INCC_SERIE} />
        </div>
      </div>

      {/* Composição + Tabela */}
      <div className="grid-cols-3-2" style={{ marginTop: 'var(--gap)' }}>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Série mensal — últimos {INCC_SERIE.length} meses</div>
              <div className="card-subtitle">Variação % e valor do índice</div>
            </div>
            <button className="btn btn-sm btn-ghost"><Icon name="download" size={13} />CSV</button>
          </div>
          <div className="card-body flush" style={{ maxHeight: 460, overflowY: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Mês</th>
                  <th className="right">Índice</th>
                  <th className="right">Variação %</th>
                  <th>Tendência</th>
                </tr>
              </thead>
              <tbody>
                {[...INCC_SERIE].reverse().map((d, i) => {
                  const isLatest = i === 0;
                  return (
                    <tr key={i} style={isLatest ? { background: 'var(--brand-tint)' } : null}>
                      <td className="strong" style={isLatest ? { color: 'var(--brand)' } : null}>{d.m}</td>
                      <td className="right mono num strong" style={isLatest ? { color: 'var(--brand)' } : null}>
                        {d.v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                      </td>
                      <td className="right">
                        <span className={'badge ' + (d.var > 0.5 ? 'warning' : 'success')}>
                          <Icon name="arrow-up" size={10} stroke={2.5} />
                          {d.var.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%
                        </span>
                      </td>
                      <td>
                        <div style={{
                          width: Math.min(100, d.var * 80),
                          height: 4,
                          borderRadius: 2,
                          background: 'linear-gradient(90deg, var(--brand-100), var(--brand))',
                        }}></div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Composição da variação</div>
                <div className="card-subtitle">{atual.m} · contribuição por grupo</div>
              </div>
            </div>
            <div className="card-body">
              <div className="stack" style={{ gap: 14 }}>
                {INCC_COMPONENTES.map((c, i) => {
                  const contrib = c.peso * c.var;
                  return (
                    <div key={i}>
                      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                        <span className="row" style={{ gap: 8 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 2, background: c.color }}></span>
                          <span className="text-sm text-soft fw-600">{c.nome}</span>
                          <span className="text-xs text-muted">· peso {(c.peso * 100).toFixed(0)}%</span>
                        </span>
                        <span className="mono num fw-700" style={{ fontSize: 13 }}>{c.var.toFixed(2)}%</span>
                      </div>
                      <div className="progress" style={{ height: 6 }}>
                        <span style={{ width: (c.var / 1.2 * 100) + '%', background: c.color }}></span>
                      </div>
                      <div className="text-xs text-muted" style={{ marginTop: 3, fontFamily: 'var(--font-mono)' }}>
                        Contribuição: +{contrib.toFixed(3)} p.p.
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Sobre o índice</div>
              </div>
            </div>
            <div className="card-body" style={{ fontSize: 12.5, color: 'var(--text-soft)', lineHeight: 1.6 }}>
              <p style={{ margin: 0, marginBottom: 8 }}>
                O <strong>INCC-DI</strong> (Disponibilidade Interna) é calculado pela <strong>FGV</strong> e mede a variação dos custos da construção habitacional no Brasil — incluindo materiais, equipamentos, serviços e mão de obra.
              </p>
              <p style={{ margin: 0, marginBottom: 12 }}>
                É a referência usada em <strong>reajustes contratuais</strong> da construção civil e na correção de orçamentos e financiamentos imobiliários durante a obra.
              </p>
              <a href={INCC_SOURCE_URL} target="_blank" rel="noopener noreferrer"
                className="row" style={{ gap: 6, fontWeight: 500, fontSize: 12.5, color: 'var(--brand)' }}>
                <Icon name="arrow-right" size={13} />
                Consultar fonte oficial — Sinduscon-PR
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* CALCULADORA DE CORREÇÃO */}
      <div className="card" style={{ marginTop: 'var(--gap)' }}>
        <div className="card-header">
          <div>
            <div className="card-title">Calculadora de correção pelo INCC</div>
            <div className="card-subtitle">Aplique o reajuste a qualquer valor entre dois meses da série</div>
          </div>
          <button className="btn btn-sm btn-ghost"><Icon name="edit" size={13} />Salvar simulação</button>
        </div>
        <div className="card-body">
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 18 }}>
            <div className="field">
              <label>Valor original (R$)</label>
              <div className="field-prefix">
                <span className="prefix">R$</span>
                <input
                  type="text"
                  value={valor.toLocaleString('pt-BR')}
                  onChange={e => setValor(parseFloat(e.target.value.replace(/\D/g, '')) || 0)}
                  className="num"
                />
              </div>
            </div>
            <div className="field">
              <label>Mês inicial</label>
              <select value={mesIni} onChange={e => setMesIni(+e.target.value)}>
                {INCC_SERIE.map((d, i) => (
                  <option key={i} value={i}>{d.m} — {d.v.toFixed(3)}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Mês final</label>
              <select value={mesFim} onChange={e => setMesFim(+e.target.value)}>
                {INCC_SERIE.map((d, i) => (
                  <option key={i} value={i}>{d.m} — {d.v.toFixed(3)}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 14,
            padding: '20px 22px',
            background: 'linear-gradient(90deg, var(--brand-tint) 0%, var(--surface) 70%)',
            borderRadius: 10,
            border: '1px solid var(--brand-100)',
          }}>
            <CalcCell label="Valor original" value={valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
            <CalcCell label="Fator de correção" value={fator.toFixed(6)} mono />
            <CalcCell label="Variação no período" value={pctVariacao.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'} tone={pctVariacao > 0 ? 'warning' : 'success'} />
            <CalcCell label="Valor corrigido" value={corrigido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} highlight />
          </div>
          <div className="text-xs text-muted" style={{ marginTop: 10, fontFamily: 'var(--font-mono)' }}>
            {INCC_SERIE[mesIni].m} ({INCC_SERIE[mesIni].v.toFixed(3)}) → {INCC_SERIE[mesFim].m} ({INCC_SERIE[mesFim].v.toFixed(3)}) ·
            correção bruta: <span style={{ color: 'var(--brand)', fontWeight: 600 }}>R$ {correcao.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>
    </>
  );
};

const CalcCell = ({ label, value, mono, highlight, tone }) => (
  <div>
    <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
    <div style={{
      fontSize: highlight ? 22 : 16,
      fontWeight: highlight ? 700 : 600,
      marginTop: 4,
      letterSpacing: '-0.015em',
      color: highlight ? 'var(--brand)' : tone === 'warning' ? 'var(--warning)' : tone === 'success' ? 'var(--success)' : 'var(--text)',
      fontFamily: mono ? 'var(--font-mono)' : 'inherit',
      fontVariantNumeric: 'tabular-nums',
    }}>{value}</div>
  </div>
);

// ===== INCC bar chart (variação %) =====
const INCCChart = ({ serie }) => {
  const w = 1080, h = 280;
  const pad = { l: 56, r: 24, t: 24, b: 40 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;

  const maxVar = Math.max(...serie.map(d => d.var));
  const niceMax = Math.ceil(maxVar / 0.5) * 0.5;
  const stepX = innerW / serie.length;
  const barW = Math.max(8, stepX * 0.62);
  const yOf = v => pad.t + innerH - (v / niceMax) * innerH;
  const xOf = i => pad.l + stepX * (i + 0.5);

  const mediaVar = serie.reduce((s, d) => s + d.var, 0) / serie.length;
  const yTicks = [0, niceMax / 4, niceMax / 2, (niceMax * 3) / 4, niceMax];

  // colour bar based on level vs media
  const barColor = (v) => {
    if (v >= niceMax * 0.66) return '#b3711a';
    if (v >= mediaVar) return 'var(--brand)';
    return 'var(--brand-400)';
  };

  const lastIdx = serie.length - 1;

  return (
    <svg className="chart-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="bar-grad-brand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--brand-500)" stopOpacity="1" />
          <stop offset="100%" stopColor="var(--brand)" stopOpacity="1" />
        </linearGradient>
        <linearGradient id="bar-grad-light" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--brand-400)" stopOpacity="0.95" />
          <stop offset="100%" stopColor="var(--brand-400)" stopOpacity="0.75" />
        </linearGradient>
        <linearGradient id="bar-grad-warn" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d18d2e" stopOpacity="1" />
          <stop offset="100%" stopColor="#b3711a" stopOpacity="1" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      <g className="chart-grid">
        {yTicks.map((t, i) => (
          <line key={i} x1={pad.l} x2={w - pad.r} y1={yOf(t)} y2={yOf(t)} strokeDasharray={i === 0 ? '0' : '3 3'} />
        ))}
      </g>
      <g className="chart-axis">
        {yTicks.map((t, i) => (
          <text key={i} x={pad.l - 8} y={yOf(t) + 3} textAnchor="end">{t.toFixed(2).replace('.', ',')}%</text>
        ))}
        {serie.map((d, i) => i % 2 === 0 && (
          <text key={i} x={xOf(i)} y={h - pad.b + 16} textAnchor="middle">{d.m}</text>
        ))}
      </g>

      {/* Average line */}
      <line
        x1={pad.l} x2={w - pad.r}
        y1={yOf(mediaVar)} y2={yOf(mediaVar)}
        stroke="var(--danger)"
        strokeWidth="1.4"
        strokeDasharray="5 4" />
      <rect x={w - pad.r - 86} y={yOf(mediaVar) - 21} width="82" height="16" rx="4" fill="var(--danger)" />
      <text x={w - pad.r - 45} y={yOf(mediaVar) - 9} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff" letterSpacing="0.04em">
        MÉDIA {mediaVar.toFixed(2).replace('.', ',')}%
      </text>

      {/* Bars */}
      {serie.map((d, i) => {
        const grad =
          d.var >= niceMax * 0.66 ? 'url(#bar-grad-warn)' :
          d.var >= mediaVar ? 'url(#bar-grad-brand)' :
          'url(#bar-grad-light)';
        const y = yOf(d.var);
        const isLast = i === lastIdx;
        return (
          <g key={i}>
            <rect
              x={xOf(i) - barW / 2}
              y={y}
              width={barW}
              height={pad.t + innerH - y}
              rx="3"
              fill={grad}
              stroke={isLast ? 'var(--text)' : 'none'}
              strokeWidth={isLast ? '0' : 0}
            />
            {isLast && (
              <>
                <rect
                  x={xOf(i) - barW / 2 - 1.5}
                  y={y - 1.5}
                  width={barW + 3}
                  height={pad.t + innerH - y + 1.5}
                  rx="4"
                  fill="none"
                  stroke="var(--text)"
                  strokeWidth="1.5"
                />
                <text x={xOf(i)} y={y - 8} textAnchor="middle" fontSize="11.5" fontWeight="700" fill="var(--text)" fontFamily="var(--font-mono)">
                  {d.var.toFixed(2).replace('.', ',')}%
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
};

export { INCCScreen };
