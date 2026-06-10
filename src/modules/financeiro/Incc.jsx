import React from 'react';
import { Icon } from '../../components/Icons';

// INCC — Índice Nacional de Custo da Construção
// Fonte vinculada: https://sindusconpr.com.br/incc-di-fgv-310-p

const INCC_SOURCE_URL = 'https://sindusconpr.com.br/incc-di-fgv-310-p';
const BCB_INCC_URL    = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.192/dados/ultimos/25?formato=json';
const INCC_CACHE_KEY  = 'incc_cache_v1';
const INCC_CACHE_TTL  = 6 * 60 * 60 * 1000; // 6 horas

// Série histórica do INCC-DI (FGV) — base julho/94 = 100 — usada como âncora e fallback
const INCC_SERIE = [
  { m: 'Mai/25', v: 1191.327, var: 0.58, varAno: 2.74, var12m: 7.24 },
  { m: 'Jun/25', v: 1199.509, var: 0.69, varAno: 3.45, var12m: 7.21 },
  { m: 'Jul/25', v: 1210.471, var: 0.91, varAno: 4.39, var12m: 7.41 },
  { m: 'Ago/25', v: 1216.706, var: 0.52, varAno: 4.93, var12m: 7.22 },
  { m: 'Set/25', v: 1218.747, var: 0.17, varAno: 5.11, var12m: 6.78 },
  { m: 'Out/25', v: 1222.356, var: 0.30, varAno: 5.42, var12m: 6.37 },
  { m: 'Nov/25', v: 1225.633, var: 0.27, varAno: 5.70, var12m: 6.23 },
  { m: 'Dez/25', v: 1228.161, var: 0.21, varAno: 5.92, var12m: 5.92 },
  { m: 'Jan/26', v: 1237.036, var: 0.72, varAno: 0.72, var12m: 5.81 },
  { m: 'Fev/26', v: 1240.481, var: 0.28, varAno: 1.00, var12m: 5.68 },
  { m: 'Mar/26', v: 1247.181, var: 0.54, varAno: 1.55, var12m: 5.84 },
  { m: 'Abr/26', v: 1259.652, var: 1.00, varAno: 2.56, var12m: 6.35 },
];

const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Converte "01/05/2025" (BCB) → "Mai/25"
function bcbDateToLabel(dateStr) {
  const [, m, y] = dateStr.split('/');
  return MESES_PT[parseInt(m, 10) - 1] + '/' + y.slice(2);
}

// Reconstrói série completa mesclando dados do BCB com a série hardcoded.
// Usa o último valor absoluto conhecido como âncora para encadear meses novos.
function buildSerieFromBCB(bcbData, hardcoded) {
  const labelSet = new Set(hardcoded.map(e => e.m));
  const novosMeses = bcbData.filter(e => !labelSet.has(bcbDateToLabel(e.data)));
  if (novosMeses.length === 0) return hardcoded;

  const extended = [...hardcoded];

  novosMeses.forEach(entry => {
    const varPct  = parseFloat(entry.valor);
    const ultimo  = extended[extended.length - 1];
    const novoV   = parseFloat((ultimo.v * (1 + varPct / 100)).toFixed(3));
    const label   = bcbDateToLabel(entry.data);
    const ano     = label.slice(4); // "26", "27"...

    // varAno: produto encadeado de todos os meses do mesmo ano até este
    const mesesAno = extended.filter(e => e.m.endsWith('/' + ano)).concat([{ var: varPct }]);
    const varAno = parseFloat(
      ((mesesAno.reduce((acc, e) => acc * (1 + e.var / 100), 1) - 1) * 100).toFixed(2)
    );

    // var12m: produto encadeado dos 12 meses anteriores + este
    const historia = extended.slice(-11).map(e => e.var).concat(varPct);
    const var12m = parseFloat(
      ((historia.reduce((acc, v) => acc * (1 + v / 100), 1) - 1) * 100).toFixed(2)
    );

    extended.push({ m: label, v: novoV, var: varPct, varAno, var12m });
  });

  return extended;
}

const INCCScreen = () => {
  const [serie, setSerie]     = React.useState(INCC_SERIE);
  const [loading, setLoading] = React.useState(false);
  const [lastSync, setLastSync] = React.useState(null);

  const fetchBCB = React.useCallback((force = false) => {
    if (!force) {
      try {
        const cached = localStorage.getItem(INCC_CACHE_KEY);
        if (cached) {
          const { ts, data } = JSON.parse(cached);
          if (Date.now() - ts < INCC_CACHE_TTL) {
            setSerie(data);
            setLastSync(new Date(ts));
            return;
          }
        }
      } catch (_) {}
    }

    setLoading(true);
    fetch(BCB_INCC_URL)
      .then(r => r.json())
      .then(bcbData => {
        const nova = buildSerieFromBCB(bcbData, INCC_SERIE);
        if (nova.length >= INCC_SERIE.length) {
          setSerie(nova);
          const now = Date.now();
          try {
            localStorage.setItem(INCC_CACHE_KEY, JSON.stringify({ ts: now, data: nova }));
          } catch (_) {}
          setLastSync(new Date(now));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => { fetchBCB(false); }, [fetchBCB]);

  const atual = serie[serie.length - 1];
  const dez   = serie.find(e => e.m.startsWith('Dez')) || serie[serie.length - 1];

  // Calculadora
  const [valor, setValor]   = React.useState(1000000);
  const [mesIni, setMesIni] = React.useState(0);
  const [mesFim, setMesFim] = React.useState(serie.length - 1);

  React.useEffect(() => {
    setMesFim(serie.length - 1);
  }, [serie.length]);

  const safeIni = Math.min(mesIni, serie.length - 1);
  const safeFim = Math.min(mesFim, serie.length - 1);
  const iniVal  = serie[safeIni].v;
  const fimVal  = serie[safeFim].v;
  const fator   = fimVal / iniVal;
  const corrigido   = valor * fator;
  const correcao    = corrigido - valor;
  const pctVariacao = (fator - 1) * 100;

  const syncLabel = loading
    ? 'Buscando dados atualizados…'
    : `Exibindo ${serie[0]?.m} – ${serie[serie.length - 1]?.m}${lastSync ? ' · atualizado ' + lastSync.toLocaleDateString('pt-BR') : ''}`;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">INCC <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500, marginLeft: 8 }}>Índice Nacional de Custo da Construção</span></h1>
          <div className="page-subtitle">
            Dados oficiais de{' '}
            <a href={INCC_SOURCE_URL} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 500 }}>
              Sinduscon-PR (FGV)
            </a>
            {' · '}{syncLabel}
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost" onClick={() => fetchBCB(true)} disabled={loading} title="Forçar atualização">
            <Icon name="refresh-cw" size={14} />
            {loading ? 'Buscando…' : 'Atualizar'}
          </button>
          <a className="btn btn-primary" href={INCC_SOURCE_URL} target="_blank" rel="noopener noreferrer">
            <Icon name="arrow-right" size={15} />
            Ver no Sinduscon-PR
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
            {atual.var12m.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<span className="unit">%</span>
          </div>
          <div className="kpi-foot" style={{ marginTop: 10 }}>
            <span className="kpi-foot-text">{serie.length >= 12 ? serie[serie.length - 12].m : serie[0].m} → {atual.m}</span>
          </div>
        </div>

        <div className="kpi">
          <div className="kpi-label">
            <div className="kpi-icon"><Icon name="chart" size={16} /></div>
            Acumulado {dez.m.slice(4) === atual.m.slice(4) ? atual.m.slice(4) : dez.m.slice(4)}
          </div>
          <div className="kpi-value num" style={{ fontSize: 28, marginTop: 10 }}>
            {(dez.m.slice(4) === atual.m.slice(4) ? atual : dez).varAno.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<span className="unit">%</span>
          </div>
          <div className="kpi-foot" style={{ marginTop: 10 }}>
            <span className="kpi-foot-text">Jan/{dez.m.slice(4)} a {dez.m.slice(4) === atual.m.slice(4) ? atual.m : dez.m}</span>
          </div>
        </div>

        <div className="kpi">
          <div className="kpi-label">
            <div className="kpi-icon"><Icon name="check-circle" size={16} /></div>
            Fonte de dados
          </div>
          <div className="kpi-value num" style={{ fontSize: 14, marginTop: 10, lineHeight: 1.4 }}>
            BCB · SGS 192
          </div>
          <div className="kpi-foot" style={{ marginTop: 10 }}>
            <span className="kpi-foot-text">{loading ? 'Atualizando…' : lastSync ? 'Auto · ' + lastSync.toLocaleDateString('pt-BR') : 'Dados locais'}</span>
          </div>
        </div>
      </div>

      {/* Gráfico principal */}
      <div className="card" style={{ marginTop: 'var(--gap)' }}>
        <div className="card-header">
          <div>
            <div className="card-title">Variação mensal do INCC-DI</div>
            <div className="card-subtitle">Percentual de variação mês a mês · {serie[0].m} a {serie[serie.length - 1].m}</div>
          </div>
        </div>
        <div className="card-body">
          <INCCChart serie={serie} />
        </div>
      </div>

      {/* Série mensal + Sobre o índice */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--gap)', marginTop: 'var(--gap)' }}>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Série mensal — {serie[0].m} a {serie[serie.length - 1].m}</div>
              <div className="card-subtitle">Atualizado automaticamente via API do Banco Central (SGS 192)</div>
            </div>
          </div>
          <div className="card-body flush">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Mês</th>
                  <th className="right">INCC</th>
                  <th className="right">Var % mês</th>
                  <th className="right">Var % no ano</th>
                  <th className="right">Var % 12m</th>
                </tr>
              </thead>
              <tbody>
                {[...serie].reverse().map((d, i) => {
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
                      <td className="right mono num" style={{ fontSize: 12 }}>
                        +{d.varAno.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                      </td>
                      <td className="right mono num" style={{ fontSize: 12 }}>
                        +{d.var12m.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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

      {/* CALCULADORA DE CORREÇÃO */}
      <div className="card" style={{ marginTop: 'var(--gap)' }}>
        <div className="card-header">
          <div>
            <div className="card-title">Calculadora de correção pelo INCC</div>
            <div className="card-subtitle">Aplique o reajuste a qualquer valor entre dois meses da série</div>
          </div>
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
              <select value={safeIni} onChange={e => setMesIni(+e.target.value)}>
                {serie.map((d, i) => (
                  <option key={i} value={i}>{d.m} — {d.v.toFixed(3)}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Mês final</label>
              <select value={safeFim} onChange={e => setMesFim(+e.target.value)}>
                {serie.map((d, i) => (
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
            <div className="text-xs text-muted" style={{ fontFamily: 'var(--font-mono)' }}>
              {serie[safeIni].m} ({serie[safeIni].v.toFixed(3)}) → {serie[safeFim].m} ({serie[safeFim].v.toFixed(3)}) ·
              correção bruta: <span style={{ color: 'var(--brand)', fontWeight: 600 }}>R$ {correcao.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <button className="btn btn-sm btn-primary" onClick={() => { setValor(1000000); setMesIni(0); setMesFim(serie.length - 1); }}>
              <Icon name="x" size={13} />Limpar simulação
            </button>
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
  const [sel, setSel] = React.useState(null);

  const w = 1080, h = 210;
  const pad = { l: 56, r: 16, t: 28, b: 44 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;

  const maxVar = Math.max(...serie.map(d => d.var));
  const minVar = Math.min(...serie.map(d => d.var));
  const niceMax = Math.ceil(maxVar / 0.5) * 0.5;
  const stepX = innerW / serie.length;
  const barW = Math.max(8, stepX * 0.58);
  const yOf = v => pad.t + innerH - (v / niceMax) * innerH;
  const xOf = i => pad.l + stepX * (i + 0.5);

  const mediaVar = serie.reduce((s, d) => s + d.var, 0) / serie.length;
  const yTicks = [0, niceMax / 4, niceMax / 2, (niceMax * 3) / 4, niceMax];

  const barOpacity = v => 0.40 + 0.60 * ((v - minVar) / (maxVar - minVar || 1));

  return (
    <svg className="chart-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="bar-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3d7fc9" />
          <stop offset="100%" stopColor="#014386" />
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
        {serie.map((d, i) => (
          <text key={i} x={xOf(i)} y={h - pad.b + 14} textAnchor="middle" fontSize="10">{d.m}</text>
        ))}
      </g>

      {/* Bars */}
      {serie.map((d, i) => {
        const y = yOf(d.var);
        const isSelected = sel === i;
        return (
          <g key={i} style={{ cursor: 'pointer' }} onClick={() => setSel(sel === i ? null : i)}>
            <rect
              x={xOf(i) - barW / 2}
              y={y}
              width={barW}
              height={pad.t + innerH - y}
              rx="3"
              fill="url(#bar-grad)"
              fillOpacity={isSelected ? 1 : barOpacity(d.var)}
            />
            {isSelected && (
              <>
                <rect
                  x={xOf(i) - 24} y={y - 22}
                  width={48} height={18}
                  rx="4" fill="#014386"
                />
                <text x={xOf(i)} y={y - 9} textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff" fontFamily="var(--font-mono)">
                  {d.var.toFixed(2).replace('.', ',')}%
                </text>
              </>
            )}
          </g>
        );
      })}

      {/* Average line */}
      <line
        x1={pad.l} x2={w - pad.r}
        y1={yOf(mediaVar)} y2={yOf(mediaVar)}
        stroke="var(--danger)"
        strokeWidth="1.4"
        strokeDasharray="5 4" />
      <rect x={pad.l + 4} y={yOf(mediaVar) - 18} width={82} height={15} rx="3" fill="var(--danger)" />
      <text x={pad.l + 45} y={yOf(mediaVar) - 7} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#fff" letterSpacing="0.04em">
        MÉDIA {mediaVar.toFixed(2).replace('.', ',')}%
      </text>
    </svg>
  );
};

export { INCCScreen };
