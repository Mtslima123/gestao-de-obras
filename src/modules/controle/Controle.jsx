import React from 'react';
import { Icon } from '../../components/Icons';
import { AppData } from '../../utils/data';

// Controle de Obras — operação diária e acompanhamento de campo
const { brl: brlCO } = AppData;

const CONTROLE_DATA = {
  // Frentes de trabalho ativas
  frentes: [
    { id: 'F-12', titulo: 'Alvenaria — Pavimento 7', responsavel: 'Encarregado 03', equipe: 18, planejado: 22, avanco: 72, status: 'em_andamento', meta: 'Concluir até 24/05', alerta: null },
    { id: 'F-08', titulo: 'Concretagem — Laje 8º pavto', responsavel: 'Encarregado 01', equipe: 14, planejado: 12, avanco: 38, status: 'em_andamento', meta: 'Bombear 86 m³ hoje', alerta: 'critica' },
    { id: 'F-15', titulo: 'Instalação elétrica — Pavto 5-6', responsavel: 'Encarregado 04', equipe: 9, planejado: 10, avanco: 64, status: 'em_andamento', meta: 'Tubulação seca · 60% completo', alerta: null },
    { id: 'F-17', titulo: 'Revestimento cerâmico — Áreas comuns', responsavel: 'Encarregado 02', equipe: 6, planejado: 8, avanco: 22, status: 'em_andamento', meta: 'Hall e corredores G1', alerta: null },
    { id: 'F-04', titulo: 'Impermeabilização — Cobertura',  responsavel: 'Encarregado 05', equipe: 4, planejado: 4, avanco: 90, status: 'finalizando', meta: 'Testes de estanqueidade', alerta: null },
    { id: 'F-19', titulo: 'Fachada — Andaime nível 4', responsavel: 'Encarregado 06', equipe: 0, planejado: 6, avanco: 0, status: 'parada', meta: 'Aguardando liberação NR-18', alerta: 'pendencia' },
  ],

  // Último RDO + histórico recente
  rdos: [
    { num: '142', data: '20/05/2026', status: 'aberto',    autor: 'Engenheiro de campo 01', frentes: 6, hh: 1124, clima: 'parcial', ocorrencias: 2 },
    { num: '141', data: '19/05/2026', status: 'aprovado',  autor: 'Engenheiro de campo 01', frentes: 6, hh: 1148, clima: 'sol',     ocorrencias: 0 },
    { num: '140', data: '18/05/2026', status: 'aprovado',  autor: 'Engenheiro de campo 02', frentes: 5, hh: 1086, clima: 'sol',     ocorrencias: 1 },
    { num: '139', data: '17/05/2026', status: 'aprovado',  autor: 'Engenheiro de campo 02', frentes: 5, hh: 1024, clima: 'chuva',   ocorrencias: 3 },
    { num: '138', data: '16/05/2026', status: 'aprovado',  autor: 'Engenheiro de campo 01', frentes: 6, hh: 1198, clima: 'sol',     ocorrencias: 0 },
    { num: '137', data: '15/05/2026', status: 'aprovado',  autor: 'Engenheiro de campo 01', frentes: 6, hh: 1212, clima: 'parcial', ocorrencias: 1 },
  ],

  // Produção dos últimos 14 dias (HH x produção)
  producaoSerie: [
    { d: '07/05', hh: 1080, p: 92 }, { d: '08/05', hh: 1124, p: 96 }, { d: '09/05', hh: 0,    p: 0 },
    { d: '10/05', hh: 0,    p: 0 }, { d: '11/05', hh: 1156, p: 98 }, { d: '12/05', hh: 1198, p: 105 },
    { d: '13/05', hh: 1142, p: 92 }, { d: '14/05', hh: 1024, p: 78 }, { d: '15/05', hh: 1212, p: 108 },
    { d: '16/05', hh: 1198, p: 104 }, { d: '17/05', hh: 1024, p: 72 }, { d: '18/05', hh: 1086, p: 88 },
    { d: '19/05', hh: 1148, p: 102 }, { d: '20/05', hh: 1124, p: 94 },
  ],

  // Equipe — presença
  equipePresenca: [
    { categoria: 'Estrutura / Armação',  prev: 42, pres: 38, falta: 4 },
    { categoria: 'Alvenaria',            prev: 32, pres: 30, falta: 2 },
    { categoria: 'Inst. elétrica',       prev: 22, pres: 22, falta: 0 },
    { categoria: 'Inst. hidráulica',     prev: 18, pres: 16, falta: 2 },
    { categoria: 'Acabamento',           prev: 16, pres: 14, falta: 2 },
    { categoria: 'Apoio e administração',prev: 12, pres: 11, falta: 1 },
  ],

  // Ocorrências
  ocorrencias: [
    { tipo: 'seguranca', titulo: 'Quase-acidente — Frente F-08', sub: 'Material caiu de 2m, sem vítimas. NR-35 reforçada no DDS.', tempo: '2h', frente: 'F-08' },
    { tipo: 'clima',     titulo: 'Chuva forte — parada parcial', sub: 'Concretagem da laje 8 transferida para amanhã 06h', tempo: '4h', frente: 'F-08' },
    { tipo: 'logistica', titulo: 'Atraso na entrega — Insumo 02', sub: 'Aço CA-50: previsão atualizada para 22/05', tempo: 'hoje', frente: '—' },
    { tipo: 'qualidade', titulo: 'NC aberta — Esquadria Pavto 4', sub: 'Vão fora de prumo. Retrabalho programado.', tempo: 'ontem', frente: 'F-15' },
    { tipo: 'seguranca', titulo: 'DDS realizado — Trabalho em altura', sub: '47 colaboradores presentes. Frequência aprovada.', tempo: 'ontem', frente: '—' },
  ],

  // Clima previsto 7 dias
  clima: [
    { d: 'Hoje',  ic: 'parcial', tmin: 17, tmax: 23, chuva: 30 },
    { d: 'Qui',   ic: 'sol',     tmin: 16, tmax: 25, chuva: 5  },
    { d: 'Sex',   ic: 'sol',     tmin: 17, tmax: 27, chuva: 0  },
    { d: 'Sáb',   ic: 'sol',     tmin: 18, tmax: 28, chuva: 10 },
    { d: 'Dom',   ic: 'parcial', tmin: 17, tmax: 24, chuva: 45 },
    { d: 'Seg',   ic: 'chuva',   tmin: 15, tmax: 19, chuva: 85 },
    { d: 'Ter',   ic: 'parcial', tmin: 16, tmax: 22, chuva: 35 },
  ],
};

const ControleObrasScreen = () => {
  const [obraSel, setObraSel] = React.useState('OB-001');
  const obras = AppData.obras.filter(o => o.status === 'em_andamento');
  const obra = obras.find(o => o.id === obraSel) || obras[0];

  const hhDia = CONTROLE_DATA.rdos[0].hh;
  const hhMedia = Math.round(CONTROLE_DATA.rdos.slice(0, 5).reduce((s, r) => s + r.hh, 0) / 5);
  const produtividadeDia = CONTROLE_DATA.producaoSerie[CONTROLE_DATA.producaoSerie.length - 1].p;
  const frentesAtivas = CONTROLE_DATA.frentes.filter(f => f.status === 'em_andamento').length;
  const presencaTotal = CONTROLE_DATA.equipePresenca.reduce((s, e) => s + e.pres, 0);
  const previstoTotal = CONTROLE_DATA.equipePresenca.reduce((s, e) => s + e.prev, 0);
  const pctPresenca = (presencaTotal / previstoTotal) * 100;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Controle de obras</h1>
          <div className="page-subtitle">Operação diária · acompanhamento de frentes, produção, equipe e ocorrências</div>
        </div>
        <div className="page-actions">
          <select className="input" value={obraSel} onChange={e => setObraSel(e.target.value)} style={{ minWidth: 220 }}>
            {obras.map(o => (<option key={o.id} value={o.id}>{o.nome} ({o.id})</option>))}
          </select>
          <button className="btn btn-ghost"><Icon name="download" size={15} />Exportar RDO</button>
          <button className="btn btn-primary"><Icon name="plus" size={15} />Novo RDO</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
        <CtrKPI label="Frentes ativas" value={frentesAtivas} unit={`/ ${CONTROLE_DATA.frentes.length}`} icon="hard-hat" />
        <CtrKPI label="HH do dia" value={hhDia.toLocaleString('pt-BR')} unit="h" icon="clock" trend={`${(((hhDia - hhMedia) / hhMedia) * 100).toFixed(1)}%`} trendDir={hhDia >= hhMedia ? 'up' : 'down'} />
        <CtrKPI label="Equipe presente" value={presencaTotal} unit={`/ ${previstoTotal}`} icon="users" trend={`${pctPresenca.toFixed(1)}%`} trendDir={pctPresenca >= 90 ? 'up' : 'down'} />
        <CtrKPI label="Produtividade" value={produtividadeDia} unit="pts" icon="trending-up" trend="+8" trendDir="up" />
        <CtrKPI label="RDOs no mês" value="20" unit={`/ ${22}`} icon="file" />
        <CtrKPI label="Dias sem afastamento" value="412" unit="dias" icon="shield" trend="meta 500" trendDir="flat" />
      </div>

      {/* HOJE summary banner */}
      <div className="card" style={{ marginTop: 'var(--gap)', background: 'linear-gradient(90deg, var(--brand-tint), var(--surface) 60%)', borderColor: 'var(--brand-100)' }}>
        <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 56, height: 56, borderRadius: 12, background: 'var(--brand)', color: 'white', display: 'grid', placeItems: 'center', boxShadow: 'var(--shadow-brand)' }}>
              <div style={{ textAlign: 'center', lineHeight: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>20</div>
                <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.10em', marginTop: 2, opacity: 0.85 }}>MAI</div>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Resumo do dia · quarta-feira</div>
              <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.01em', marginTop: 2 }}>{obra.nome}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>RDO #142 em aberto · responsável {CONTROLE_DATA.rdos[0].autor}</div>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 220, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 28 }}>
            <ClimaIcon ic="parcial" size={36} />
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>17° / 23°</div>
              <div className="text-xs text-muted">Probabilidade de chuva: 30%</div>
            </div>
            <div style={{ width: 1, height: 36, background: 'var(--border)' }}></div>
            <div>
              <div className="text-xs text-muted" style={{ fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Ocorrências hoje</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <span className="badge danger"><span className="dot"></span>2 segurança</span>
                <span className="badge warning"><span className="dot"></span>1 clima</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FRENTES + PRODUÇÃO */}
      <div className="grid-cols-3-2" style={{ marginTop: 'var(--gap)' }}>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Frentes de trabalho</div>
              <div className="card-subtitle">{frentesAtivas} ativas · 1 parada · 1 em finalização</div>
            </div>
            <div className="card-actions">
              <button className="chip active">Todas</button>
              <button className="chip">Ativas</button>
              <button className="chip">Paradas</button>
              <button className="btn btn-sm btn-primary"><Icon name="plus" size={13} />Nova frente</button>
            </div>
          </div>
          <div className="card-body" style={{ padding: 14 }}>
            <div className="stack" style={{ gap: 10 }}>
              {CONTROLE_DATA.frentes.map(f => (<FrenteCard key={f.id} f={f} />))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Produção × HH (14 dias)</div>
              <div className="card-subtitle">Pontos de produtividade por dia</div>
            </div>
            <button className="icon-btn"><Icon name="dots" size={16} /></button>
          </div>
          <div className="card-body">
            <ProducaoChart serie={CONTROLE_DATA.producaoSerie} />
            <div className="legend" style={{ marginTop: 12, justifyContent: 'center' }}>
              <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--brand)' }}></span>HH trabalhadas</span>
              <span className="legend-item"><span className="legend-swatch" style={{ background: '#1f8b5c' }}></span>Produtividade (pts)</span>
            </div>
          </div>
        </div>
      </div>

      {/* EQUIPE + OCORRENCIAS */}
      <div className="grid-cols-3-2" style={{ marginTop: 'var(--gap)' }}>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Equipe — presença do dia</div>
              <div className="card-subtitle">{presencaTotal} de {previstoTotal} presentes ({pctPresenca.toFixed(1)}%)</div>
            </div>
            <div className="card-actions">
              <button className="btn btn-sm btn-ghost">Apontar presença</button>
              <button className="btn btn-sm btn-ghost"><Icon name="download" size={13} />CSV</button>
            </div>
          </div>
          <div className="card-body flush">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Especialidade</th>
                  <th className="center">Previsto</th>
                  <th className="center">Presente</th>
                  <th className="center">Faltas</th>
                  <th style={{ width: 200 }}>Cobertura</th>
                </tr>
              </thead>
              <tbody>
                {CONTROLE_DATA.equipePresenca.map((e, i) => {
                  const pct = (e.pres / e.prev) * 100;
                  return (
                    <tr key={i}>
                      <td className="strong">{e.categoria}</td>
                      <td className="center mono num">{e.prev}</td>
                      <td className="center mono num strong">{e.pres}</td>
                      <td className="center">
                        {e.falta === 0 ? <span className="text-faint">—</span> :
                          <span className={'badge ' + (e.falta >= 3 ? 'danger' : 'warning')}>{e.falta}</span>}
                      </td>
                      <td>
                        <div className="progress-row">
                          <div className={'progress ' + (pct >= 95 ? 'success' : pct >= 85 ? '' : 'warning')}>
                            <span style={{ width: pct + '%' }}></span>
                          </div>
                          <span className="pct">{pct.toFixed(0)}%</span>
                        </div>
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
              <div className="card-title">Ocorrências recentes</div>
              <div className="card-subtitle">{CONTROLE_DATA.ocorrencias.length} registros</div>
            </div>
            <button className="btn btn-sm btn-subtle">Ver todas</button>
          </div>
          <div className="card-body flush">
            {CONTROLE_DATA.ocorrencias.map((o, i) => {
              const tone = o.tipo === 'seguranca' ? 'danger' : o.tipo === 'qualidade' ? 'warning' : o.tipo === 'clima' ? 'info' : 'info';
              const icon = o.tipo === 'seguranca' ? 'shield' : o.tipo === 'qualidade' ? 'alert-triangle' : o.tipo === 'clima' ? 'alert' : 'truck';
              return (
                <div key={i} className={'alert-item ' + tone}>
                  <div className={'alert-pill ' + tone}></div>
                  <div className="alert-icon"><Icon name={icon} size={14} /></div>
                  <div style={{ minWidth: 0 }}>
                    <div className="alert-title">{o.titulo}</div>
                    <div className="alert-sub">{o.sub}</div>
                  </div>
                  <div className="alert-time">{o.tempo}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* RDOs + CLIMA */}
      <div className="grid-cols-3-2" style={{ marginTop: 'var(--gap)' }}>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Relatórios diários (RDO)</div>
              <div className="card-subtitle">Últimos 6 dias trabalhados</div>
            </div>
            <div className="card-actions">
              <button className="btn btn-sm btn-ghost"><Icon name="filter" size={13} />Filtros</button>
              <button className="btn btn-sm btn-primary"><Icon name="plus" size={13} />Novo RDO</button>
            </div>
          </div>
          <div className="card-body flush">
            <table className="tbl">
              <thead>
                <tr>
                  <th>RDO</th>
                  <th>Data</th>
                  <th>Responsável</th>
                  <th className="center">Frentes</th>
                  <th className="right">HH</th>
                  <th className="center">Clima</th>
                  <th className="center">Ocorr.</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {CONTROLE_DATA.rdos.map((r, i) => (
                  <tr key={i}>
                    <td className="strong mono">#{r.num}</td>
                    <td className="mono text-sm">{r.data}</td>
                    <td className="text-soft">{r.autor}</td>
                    <td className="center mono num">{r.frentes}</td>
                    <td className="right mono num strong">{r.hh.toLocaleString('pt-BR')}</td>
                    <td className="center"><ClimaIcon ic={r.clima} size={18} /></td>
                    <td className="center">
                      {r.ocorrencias === 0 ? <span className="text-faint">—</span> :
                        <span className={'badge ' + (r.ocorrencias >= 3 ? 'danger' : 'warning')}>{r.ocorrencias}</span>}
                    </td>
                    <td>
                      <span className={'badge ' + (r.status === 'aprovado' ? 'success' : 'warning')}>
                        <span className="dot"></span>{r.status === 'aprovado' ? 'Aprovado' : 'Em aberto'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Clima — próximos 7 dias</div>
              <div className="card-subtitle">Previsão para o canteiro</div>
            </div>
            <button className="icon-btn"><Icon name="dots" size={16} /></button>
          </div>
          <div className="card-body">
            <div className="stack" style={{ gap: 6 }}>
              {CONTROLE_DATA.clima.map((c, i) => (
                <div key={i} className="row" style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: i === 0 ? 'var(--brand-tint)' : 'var(--surface-muted)',
                  border: '1px solid ' + (i === 0 ? 'var(--brand-100)' : 'var(--border)'),
                  gap: 12,
                }}>
                  <span className="mono fw-600" style={{ minWidth: 36, fontSize: 12.5, color: i === 0 ? 'var(--brand)' : 'var(--text-soft)' }}>{c.d}</span>
                  <ClimaIcon ic={c.ic} size={20} />
                  <span className="text-sm" style={{ flex: 1, color: 'var(--text-soft)' }}>
                    <span className="num fw-700" style={{ color: 'var(--text)' }}>{c.tmax}°</span>
                    <span className="text-faint"> / {c.tmin}°</span>
                  </span>
                  <span className="row" style={{ gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                    <Icon name="alert" size={12} />
                    <span className="mono num">{c.chuva}%</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

// ----- KPI compacto -----
const CtrKPI = ({ label, value, unit, icon, trend, trendDir }) => (
  <div className="kpi" style={{ padding: '14px 16px' }}>
    <div className="kpi-label" style={{ fontSize: 10.5 }}>
      <div className="kpi-icon" style={{ width: 26, height: 26 }}><Icon name={icon} size={14} /></div>
      {label}
    </div>
    <div className="kpi-value num" style={{ fontSize: 22, marginTop: 8 }}>
      {value}{unit && <span className="unit" style={{ fontSize: 11.5, marginLeft: 4 }}>{unit}</span>}
    </div>
    {trend && (
      <div className="kpi-foot" style={{ marginTop: 6 }}>
        <span className={'kpi-trend ' + (trendDir || 'flat')}>
          {trendDir === 'up' && <Icon name="arrow-up" size={10} stroke={2.5} />}
          {trendDir === 'down' && <Icon name="arrow-down" size={10} stroke={2.5} />}
          {trend}
        </span>
      </div>
    )}
  </div>
);

// ----- Frente card -----
const FrenteCard = ({ f }) => {
  const cover = (f.equipe / f.planejado) * 100;
  return (
    <div style={{
      border: '1px solid var(--border)',
      borderLeft: '3px solid ' + (f.alerta === 'critica' ? 'var(--danger)' : f.alerta === 'pendencia' ? 'var(--warning)' : f.status === 'finalizando' ? 'var(--success)' : 'var(--brand)'),
      borderRadius: 8,
      padding: '12px 14px',
      background: 'var(--surface)',
      transition: 'border-color 0.12s',
    }}>
      <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <span className="mono text-xs text-muted">{f.id}</span>
            <span className="strong" style={{ fontSize: 13.5 }}>{f.titulo}</span>
            {f.status === 'parada' && <span className="badge danger"><span className="dot"></span>Parada</span>}
            {f.status === 'finalizando' && <span className="badge success"><span className="dot"></span>Finalizando</span>}
          </div>
          <div className="text-xs text-muted" style={{ marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span className="row" style={{ gap: 4 }}>
              <Icon name="hard-hat" size={11} />{f.responsavel}
            </span>
            <span className="row" style={{ gap: 4 }}>
              <Icon name="users" size={11} />
              <span className="mono num">{f.equipe}</span>
              <span className="text-faint">/ {f.planejado}</span>
            </span>
            <span>· {f.meta}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="mono num fw-700" style={{ fontSize: 16, color: 'var(--brand)', letterSpacing: '-0.01em' }}>{f.avanco}%</div>
          <div className="text-xs text-muted">avanço</div>
        </div>
      </div>
      <div className="progress" style={{ marginTop: 10, height: 4 }}>
        <span style={{ width: f.avanco + '%' }}></span>
      </div>
    </div>
  );
};

// ----- Producao chart (combo bar + line) -----
const ProducaoChart = ({ serie }) => {
  const w = 460, h = 220, pad = { l: 32, r: 24, t: 16, b: 28 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const maxHH = Math.max(...serie.map(d => d.hh)) || 1;
  const maxP  = Math.max(...serie.map(d => d.p))  || 1;
  const niceMaxHH = Math.ceil(maxHH / 300) * 300;
  const niceMaxP  = Math.ceil(maxP / 30) * 30;
  const stepX = innerW / serie.length;
  const barW = stepX * 0.5;

  const yHH = v => pad.t + innerH - (v / niceMaxHH) * innerH;
  const yP  = v => pad.t + innerH - (v / niceMaxP)  * innerH;

  const linePoints = serie.map((d, i) => `${pad.l + stepX * (i + 0.5)},${yP(d.p)}`).join(' ');

  return (
    <svg className="chart-svg" viewBox={`0 0 ${w} ${h}`}>
      <g className="chart-grid">
        {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
          <line key={i} x1={pad.l} x2={w - pad.r}
            y1={pad.t + innerH * (1 - t)}
            y2={pad.t + innerH * (1 - t)}
            strokeDasharray={t === 0 ? '0' : '3 3'} />
        ))}
      </g>
      <g className="chart-axis">
        {[0, 0.5, 1].map((t, i) => (
          <text key={i} x={pad.l - 6} y={pad.t + innerH * (1 - t) + 3} textAnchor="end">
            {Math.round(niceMaxHH * t).toLocaleString('pt-BR')}
          </text>
        ))}
        {serie.map((d, i) => i % 2 === 0 && (
          <text key={i} x={pad.l + stepX * (i + 0.5)} y={h - pad.b + 14} textAnchor="middle">{d.d}</text>
        ))}
      </g>
      {serie.map((d, i) => {
        if (d.hh === 0) return null;
        return <rect key={i}
          x={pad.l + stepX * (i + 0.5) - barW / 2}
          y={yHH(d.hh)}
          width={barW}
          height={pad.t + innerH - yHH(d.hh)}
          rx="2"
          fill="var(--brand-100)" />;
      })}
      <polyline
        points={linePoints}
        fill="none"
        stroke="#1f8b5c"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round" />
      {serie.map((d, i) => d.p > 0 && (
        <circle key={i} cx={pad.l + stepX * (i + 0.5)} cy={yP(d.p)} r="3" fill="#1f8b5c" stroke="white" strokeWidth="1.5" />
      ))}
    </svg>
  );
};

// ----- Clima icons (SVG simples) -----
const ClimaIcon = ({ ic, size = 18 }) => {
  const s = { width: size, height: size };
  if (ic === 'sol') return (
    <svg {...s} viewBox="0 0 24 24" fill="none" stroke="#d18d2e" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" fill="#fcd97a" stroke="#d18d2e" />
      <line x1="12" y1="2" x2="12" y2="5" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="2" y1="12" x2="5" y2="12" />
      <line x1="19" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="4.93" x2="6.7" y2="6.7" />
      <line x1="17.3" y1="17.3" x2="19.07" y2="19.07" />
      <line x1="4.93" y1="19.07" x2="6.7" y2="17.3" />
      <line x1="17.3" y1="6.7" x2="19.07" y2="4.93" />
    </svg>
  );
  if (ic === 'parcial') return (
    <svg {...s} viewBox="0 0 24 24" fill="none" stroke="#8a95ad" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="3" fill="#fcd97a" stroke="#d18d2e" />
      <path d="M17 18a4 4 0 0 0 0-8 6 6 0 0 0-11.2-1.4" fill="#e6eaf0" stroke="#8a95ad" />
    </svg>
  );
  // chuva
  return (
    <svg {...s} viewBox="0 0 24 24" fill="none" stroke="#3d7fc9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 13a4 4 0 0 0 0-8 6 6 0 0 0-11.2 1.4" fill="#c8d6e8" stroke="#3d7fc9" />
      <line x1="8" y1="17" x2="7" y2="21" />
      <line x1="12" y1="17" x2="11" y2="21" />
      <line x1="16" y1="17" x2="15" y2="21" />
    </svg>
  );
};

export { ControleObrasScreen };
