// Efetivo — gestão de mão de obra (headcount, presença, distribuição, custo)
const { brl: brlEF } = window.AppData;

// ============ MOCK DATA ============
const EF_OBRAS = window.AppData.obras.filter(o => o.status === 'em_andamento').slice(0, 4);

const EF_CATEGORIAS = [
  { id: 'estrutura',    label: 'Estrutura / Armação',     prev: 42, pres: 38, falta: 4, custoHora: 32, cor: '#014386' },
  { id: 'alvenaria',    label: 'Alvenaria',                prev: 32, pres: 30, falta: 2, custoHora: 28, cor: '#1858a3' },
  { id: 'eletrica',     label: 'Inst. elétrica',           prev: 22, pres: 22, falta: 0, custoHora: 36, cor: '#3d7fc9' },
  { id: 'hidraulica',   label: 'Inst. hidráulica',         prev: 18, pres: 16, falta: 2, custoHora: 34, cor: '#5a98d8' },
  { id: 'acabamento',   label: 'Acabamento',               prev: 16, pres: 14, falta: 2, custoHora: 30, cor: '#1f8b5c' },
  { id: 'apoio',        label: 'Apoio e administração',    prev: 12, pres: 11, falta: 1, custoHora: 24, cor: '#8a95ad' },
];

const EF_VINCULOS = [
  { tipo: 'Diretos CLT',     qtd: 68, cor: 'var(--brand)' },
  { tipo: 'Terceirizados',   qtd: 58, cor: 'var(--brand-400)' },
  { tipo: 'Subempreitada',   qtd: 12, cor: '#b3711a' },
  { tipo: 'Estágio / Jovem', qtd:  4, cor: '#1f8b5c' },
];

const EF_COLABORADORES = [
  { id: '0001', nome: 'Colaborador 01', cargo: 'Pedreiro',           cat: 'alvenaria',  vinculo: 'CLT',          admissao: '12/03/2024', cracha: '0001', avatar: 'av-1', presente: true,  hh: 184 },
  { id: '0002', nome: 'Colaborador 02', cargo: 'Armador',            cat: 'estrutura',  vinculo: 'CLT',          admissao: '05/04/2024', cracha: '0002', avatar: 'av-2', presente: true,  hh: 192 },
  { id: '0003', nome: 'Colaborador 03', cargo: 'Eletricista',        cat: 'eletrica',   vinculo: 'Terceirizado', admissao: '18/08/2024', cracha: '0003', avatar: 'av-3', presente: true,  hh: 176 },
  { id: '0004', nome: 'Colaborador 04', cargo: 'Encanador',          cat: 'hidraulica', vinculo: 'Terceirizado', admissao: '22/09/2024', cracha: '0004', avatar: 'av-4', presente: false, hh: 168 },
  { id: '0005', nome: 'Colaborador 05', cargo: 'Carpinteiro',        cat: 'estrutura',  vinculo: 'CLT',          admissao: '10/01/2025', cracha: '0005', avatar: 'av-5', presente: true,  hh: 188 },
  { id: '0006', nome: 'Colaborador 06', cargo: 'Servente',           cat: 'apoio',      vinculo: 'CLT',          admissao: '14/02/2025', cracha: '0006', avatar: 'av-6', presente: true,  hh: 174 },
  { id: '0007', nome: 'Colaborador 07', cargo: 'Pintor',             cat: 'acabamento', vinculo: 'Subempreitada',admissao: '20/04/2025', cracha: '0007', avatar: 'av-1', presente: true,  hh: 182 },
  { id: '0008', nome: 'Colaborador 08', cargo: 'Pedreiro',           cat: 'alvenaria',  vinculo: 'Terceirizado', admissao: '08/05/2025', cracha: '0008', avatar: 'av-2', presente: true,  hh: 186 },
  { id: '0009', nome: 'Colaborador 09', cargo: 'Eletricista chefe',  cat: 'eletrica',   vinculo: 'CLT',          admissao: '15/03/2023', cracha: '0009', avatar: 'av-3', presente: true,  hh: 196 },
  { id: '0010', nome: 'Colaborador 10', cargo: 'Mestre de obras',    cat: 'apoio',      vinculo: 'CLT',          admissao: '01/02/2023', cracha: '0010', avatar: 'av-4', presente: true,  hh: 200 },
  { id: '0011', nome: 'Colaborador 11', cargo: 'Ajudante geral',     cat: 'apoio',      vinculo: 'Terceirizado', admissao: '12/06/2025', cracha: '0011', avatar: 'av-5', presente: false, hh: 156 },
  { id: '0012', nome: 'Colaborador 12', cargo: 'Ceramista',          cat: 'acabamento', vinculo: 'Subempreitada',admissao: '03/07/2025', cracha: '0012', avatar: 'av-6', presente: true,  hh: 178 },
];

const EF_SERIE = [
  { m: 'Jun/25', dir: 58, ter: 42, sub: 8,  total: 108 },
  { m: 'Jul/25', dir: 60, ter: 44, sub: 8,  total: 112 },
  { m: 'Ago/25', dir: 62, ter: 48, sub: 10, total: 120 },
  { m: 'Set/25', dir: 64, ter: 50, sub: 10, total: 124 },
  { m: 'Out/25', dir: 66, ter: 52, sub: 10, total: 128 },
  { m: 'Nov/25', dir: 66, ter: 54, sub: 11, total: 131 },
  { m: 'Dez/25', dir: 64, ter: 50, sub: 9,  total: 123 },
  { m: 'Jan/26', dir: 65, ter: 52, sub: 10, total: 127 },
  { m: 'Fev/26', dir: 66, ter: 54, sub: 11, total: 131 },
  { m: 'Mar/26', dir: 67, ter: 56, sub: 12, total: 135 },
  { m: 'Abr/26', dir: 68, ter: 58, sub: 12, total: 138 },
  { m: 'Mai/26', dir: 68, ter: 58, sub: 12, total: 142 },
];

const EF_PRESENCA_14D = [
  { d: '07', pres: 128, prev: 142, falta: 14 },
  { d: '08', pres: 134, prev: 142, falta: 8  },
  { d: '09', pres: 0,   prev: 0,   falta: 0  }, // sabado
  { d: '10', pres: 0,   prev: 0,   falta: 0  }, // domingo
  { d: '11', pres: 136, prev: 142, falta: 6  },
  { d: '12', pres: 138, prev: 142, falta: 4  },
  { d: '13', pres: 132, prev: 142, falta: 10 },
  { d: '14', pres: 124, prev: 142, falta: 18 },
  { d: '15', pres: 139, prev: 142, falta: 3  },
  { d: '16', pres: 0,   prev: 0,   falta: 0  },
  { d: '17', pres: 0,   prev: 0,   falta: 0  },
  { d: '18', pres: 130, prev: 142, falta: 12 },
  { d: '19', pres: 137, prev: 142, falta: 5  },
  { d: '20', pres: 131, prev: 142, falta: 11 },
];

// ============ MAIN SCREEN ============
const EfetivoScreen = () => {
  const [obraSel, setObraSel] = React.useState('OB-001');
  const [view, setView] = React.useState('panorama'); // panorama | colaboradores | apontamento
  const [busca, setBusca] = React.useState('');
  const [catFilter, setCatFilter] = React.useState('todas');

  const obra = EF_OBRAS.find(o => o.id === obraSel) || EF_OBRAS[0];
  const totalPrev = EF_CATEGORIAS.reduce((s, c) => s + c.prev, 0);
  const totalPres = EF_CATEGORIAS.reduce((s, c) => s + c.pres, 0);
  const totalFalta = EF_CATEGORIAS.reduce((s, c) => s + c.falta, 0);
  const pctPres = (totalPres / totalPrev) * 100;
  const custoDia = EF_CATEGORIAS.reduce((s, c) => s + c.pres * c.custoHora * 8, 0);

  const colabFiltered = EF_COLABORADORES
    .filter(c => catFilter === 'todas' ? true : c.cat === catFilter)
    .filter(c => !busca || (c.nome + c.cargo + c.cracha).toLowerCase().includes(busca.toLowerCase()));

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Efetivo</h1>
          <div className="page-subtitle">Mão de obra · presença, distribuição e custo direto</div>
        </div>
        <div className="page-actions">
          <select className="input" value={obraSel} onChange={e => setObraSel(e.target.value)} style={{ minWidth: 220 }}>
            {EF_OBRAS.map(o => (<option key={o.id} value={o.id}>{o.nome} ({o.id})</option>))}
          </select>
          <div className="segmented">
            <button className={view === 'panorama' ? 'active' : ''} onClick={() => setView('panorama')}>Panorama</button>
            <button className={view === 'colaboradores' ? 'active' : ''} onClick={() => setView('colaboradores')}>Colaboradores</button>
            <button className={view === 'apontamento' ? 'active' : ''} onClick={() => setView('apontamento')}>Apontamento</button>
          </div>
          <button className="btn btn-ghost"><Icon name="download" size={15} />Exportar</button>
          <button className="btn btn-primary"><Icon name="plus" size={15} />Admitir colaborador</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
        <EfKPI label="Efetivo total" value={totalPrev} unit="prev." icon="users" foot={`${totalPres} presentes`} />
        <EfKPI label="Presença do dia" value={pctPres.toFixed(1)} unit="%" icon="check-circle" foot={`${totalFalta} faltas`} tone={pctPres >= 90 ? 'success' : 'warning'} />
        <EfKPI label="HH trabalhadas (mês)" value="22.460" unit="h" icon="clock" foot="-3% vs mês ant." />
        <EfKPI label="Custo direto / dia" value={brlEF(custoDia, { compact: true })} icon="wallet" foot="Salário + encargos" />
        <EfKPI label="Turnover (12m)" value="8,4" unit="%" icon="trending-up" foot="Meta < 12%" tone="success" />
        <EfKPI label="Dias sem afastamento" value="412" icon="shield" foot="Meta: 500 dias" />
      </div>

      {view === 'panorama' && (
        <>
          {/* Distribuição por categoria + vínculo */}
          <div className="grid-cols-3-2" style={{ marginTop: 'var(--gap)' }}>
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Distribuição por especialidade</div>
                  <div className="card-subtitle">Presença atual vs previsto contratual</div>
                </div>
                <button className="icon-btn"><Icon name="dots" size={16} /></button>
              </div>
              <div className="card-body flush">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Especialidade</th>
                      <th className="center">Previsto</th>
                      <th className="center">Presente</th>
                      <th className="center">Faltas</th>
                      <th className="right">Custo/dia</th>
                      <th style={{ width: 180 }}>Cobertura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {EF_CATEGORIAS.map((c, i) => {
                      const pct = (c.pres / c.prev) * 100;
                      const custo = c.pres * c.custoHora * 8;
                      return (
                        <tr key={i}>
                          <td>
                            <span className="row" style={{ gap: 8 }}>
                              <span style={{ width: 10, height: 10, borderRadius: 2, background: c.cor }}></span>
                              <span className="strong">{c.label}</span>
                            </span>
                          </td>
                          <td className="center mono num">{c.prev}</td>
                          <td className="center mono num strong">{c.pres}</td>
                          <td className="center">
                            {c.falta === 0 ? <span className="text-faint">—</span> :
                              <span className={'badge ' + (c.falta >= 3 ? 'danger' : 'warning')}>{c.falta}</span>}
                          </td>
                          <td className="right mono num">{brlEF(custo, { compact: true })}</td>
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
                    <tr style={{ background: 'var(--brand-tint)' }}>
                      <td className="strong" style={{ color: 'var(--brand)' }}>TOTAL</td>
                      <td className="center mono num strong" style={{ color: 'var(--brand)' }}>{totalPrev}</td>
                      <td className="center mono num strong" style={{ color: 'var(--brand)' }}>{totalPres}</td>
                      <td className="center mono num strong" style={{ color: 'var(--brand)' }}>{totalFalta}</td>
                      <td className="right mono num strong" style={{ color: 'var(--brand)' }}>{brlEF(custoDia, { compact: true })}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <div className="card-title">Por tipo de vínculo</div>
                <button className="icon-btn"><Icon name="dots" size={16} /></button>
              </div>
              <div className="card-body">
                <div className="stack" style={{ gap: 14 }}>
                  {EF_VINCULOS.map((v, i) => {
                    const pctV = (v.qtd / totalPrev) * 100;
                    return (
                      <div key={i}>
                        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 5 }}>
                          <span className="text-sm text-soft fw-600">{v.tipo}</span>
                          <span className="mono num fw-700">{v.qtd}<span className="text-xs text-muted" style={{ marginLeft: 4 }}>({pctV.toFixed(0)}%)</span></span>
                        </div>
                        <div className="progress" style={{ height: 6 }}>
                          <span style={{ width: pctV + '%', background: v.cor }}></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 22, padding: 14, background: 'var(--surface-muted)', borderRadius: 8 }}>
                  <div className="text-xs text-muted fw-600" style={{ letterSpacing: '0.06em', textTransform: 'uppercase' }}>Razão direto/indireto</div>
                  <div className="row" style={{ gap: 12, marginTop: 6, alignItems: 'baseline' }}>
                    <span className="mono num" style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>0,92</span>
                    <span className="text-xs text-muted">68 diretos / 74 indiretos</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Histórico de efetivo + presença 14 dias */}
          <div className="grid-cols-3-2" style={{ marginTop: 'var(--gap)' }}>
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Evolução do efetivo (12 meses)</div>
                  <div className="card-subtitle">Diretos · Terceirizados · Subempreitada</div>
                </div>
                <div className="card-actions">
                  <div className="legend">
                    <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--brand)' }}></span>Diretos</span>
                    <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--brand-400)' }}></span>Terceirizados</span>
                    <span className="legend-item"><span className="legend-swatch" style={{ background: '#b3711a' }}></span>Subempreitada</span>
                  </div>
                </div>
              </div>
              <div className="card-body">
                <EfetivoSerieChart serie={EF_SERIE} />
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Presença — últimos 14 dias</div>
                  <div className="card-subtitle">Cobertura sobre o efetivo previsto</div>
                </div>
              </div>
              <div className="card-body">
                <Presenca14DChart serie={EF_PRESENCA_14D} />
              </div>
            </div>
          </div>
        </>
      )}

      {view === 'colaboradores' && (
        <div className="card" style={{ marginTop: 'var(--gap)' }}>
          <div className="card-header">
            <div className="filters" style={{ flex: 1 }}>
              <button className={'chip' + (catFilter === 'todas' ? ' active' : '')} onClick={() => setCatFilter('todas')}>
                Todas <span style={{ color: 'var(--text-faint)' }}>·</span> {EF_COLABORADORES.length}
              </button>
              {EF_CATEGORIAS.map(c => (
                <button key={c.id} className={'chip' + (catFilter === c.id ? ' active' : '')} onClick={() => setCatFilter(c.id)}>
                  {c.label} <span style={{ color: 'var(--text-faint)' }}>·</span> {EF_COLABORADORES.filter(co => co.cat === c.id).length}
                </button>
              ))}
            </div>
            <div className="card-actions">
              <input className="input input-search" placeholder="Buscar colaborador, cargo ou crachá…"
                value={busca} onChange={e => setBusca(e.target.value)} style={{ minWidth: 280 }} />
            </div>
          </div>
          <div className="card-body flush">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Crachá</th>
                  <th>Colaborador</th>
                  <th>Cargo</th>
                  <th>Especialidade</th>
                  <th>Vínculo</th>
                  <th className="center">Admissão</th>
                  <th className="right">HH (mês)</th>
                  <th className="center">Status hoje</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {colabFiltered.map(c => {
                  const cat = EF_CATEGORIAS.find(ct => ct.id === c.cat);
                  return (
                    <tr key={c.id}>
                      <td className="strong mono">#{c.cracha}</td>
                      <td>
                        <div className="row" style={{ gap: 10 }}>
                          <div className={'avatar md ' + c.avatar}>{c.nome.slice(-2)}</div>
                          <span className="strong">{c.nome}</span>
                        </div>
                      </td>
                      <td className="text-soft">{c.cargo}</td>
                      <td>
                        <span className="row" style={{ gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 2, background: cat?.cor }}></span>
                          {cat?.label}
                        </span>
                      </td>
                      <td><span className="badge neutral">{c.vinculo}</span></td>
                      <td className="center mono text-sm text-muted">{c.admissao}</td>
                      <td className="right mono num strong">{c.hh}</td>
                      <td className="center">
                        {c.presente ? (
                          <span className="badge success"><Icon name="check" size={10} stroke={3} />Presente</span>
                        ) : (
                          <span className="badge danger"><span className="dot"></span>Ausente</span>
                        )}
                      </td>
                      <td><button className="icon-btn" style={{ width: 28, height: 28 }}><Icon name="dots" size={14} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === 'apontamento' && (
        <ApontamentoDiario />
      )}
    </>
  );
};

// ===== KPI =====
const EfKPI = ({ label, value, unit, icon, foot, tone }) => (
  <div className="kpi" style={{ padding: '14px 16px' }}>
    <div className="kpi-label" style={{ fontSize: 10.5 }}>
      <div className="kpi-icon" style={{
        width: 26, height: 26,
        background: tone === 'success' ? 'var(--success-bg)' : tone === 'warning' ? 'var(--warning-bg)' : 'var(--brand-tint)',
        color: tone === 'success' ? 'var(--success)' : tone === 'warning' ? 'var(--warning)' : 'var(--brand)',
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

// ===== APONTAMENTO DIÁRIO =====
const ApontamentoDiario = () => {
  const [data, setData] = React.useState('2026-05-20');
  const [presencas, setPresencas] = React.useState(
    EF_COLABORADORES.reduce((acc, c) => ({ ...acc, [c.id]: c.presente }), {})
  );
  const toggle = (id) => setPresencas(p => ({ ...p, [id]: !p[id] }));
  const totalPres = Object.values(presencas).filter(Boolean).length;

  return (
    <div className="stack" style={{ marginTop: 'var(--gap)' }}>
      <div className="card" style={{ background: 'linear-gradient(90deg, var(--brand-tint), var(--surface) 70%)', borderColor: 'var(--brand-100)' }}>
        <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <div className="row" style={{ gap: 14 }}>
            <div style={{ width: 56, height: 56, borderRadius: 12, background: 'var(--brand)', color: 'white', display: 'grid', placeItems: 'center', boxShadow: 'var(--shadow-brand)' }}>
              <Icon name="users" size={26} />
            </div>
            <div>
              <div className="text-xs text-muted fw-600" style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>Apontamento de presença</div>
              <div style={{ fontSize: 17, fontWeight: 600, marginTop: 2 }}>20/05/2026 · Quarta-feira</div>
              <div className="text-sm text-muted">{totalPres} de {EF_COLABORADORES.length} marcados como presentes</div>
            </div>
          </div>
          <div className="spacer" style={{ flex: 1 }}></div>
          <input type="date" className="input" value={data} onChange={e => setData(e.target.value)} style={{ width: 180 }} />
          <button className="btn btn-ghost" onClick={() => setPresencas(EF_COLABORADORES.reduce((a, c) => ({ ...a, [c.id]: true }), {}))}>
            <Icon name="check" size={13} />Marcar todos
          </button>
          <button className="btn btn-primary">
            <Icon name="check" size={14} />Salvar apontamento
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Lista de colaboradores</div>
            <div className="card-subtitle">Toque no switch para marcar presença · turno único 07:00 — 17:00</div>
          </div>
        </div>
        <div className="card-body flush">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 80 }} className="center">Presente</th>
                <th>Colaborador</th>
                <th>Cargo</th>
                <th>Especialidade</th>
                <th className="center">Entrada</th>
                <th className="center">Saída</th>
                <th className="right">HH</th>
                <th>Observação</th>
              </tr>
            </thead>
            <tbody>
              {EF_COLABORADORES.map(c => {
                const cat = EF_CATEGORIAS.find(ct => ct.id === c.cat);
                const presente = presencas[c.id];
                return (
                  <tr key={c.id} style={!presente ? { opacity: 0.55 } : null}>
                    <td className="center">
                      <div className={'switch' + (presente ? ' on' : '')} onClick={() => toggle(c.id)} style={{ margin: '0 auto' }}></div>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 10 }}>
                        <div className={'avatar md ' + c.avatar}>{c.nome.slice(-2)}</div>
                        <div>
                          <div className="strong">{c.nome}</div>
                          <div className="text-xs text-muted mono">#{c.cracha}</div>
                        </div>
                      </div>
                    </td>
                    <td className="text-soft">{c.cargo}</td>
                    <td className="text-sm">
                      <span className="row" style={{ gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: cat?.cor }}></span>
                        {cat?.label}
                      </span>
                    </td>
                    <td className="center mono num">{presente ? '07:00' : '—'}</td>
                    <td className="center mono num">{presente ? '17:00' : '—'}</td>
                    <td className="right mono num strong">{presente ? '8,0' : '—'}</td>
                    <td>
                      <input className="input" style={{ height: 30, fontSize: 12 }}
                        placeholder={presente ? 'Sem observações' : 'Motivo da ausência…'}
                        defaultValue={presente ? '' : (c.id === '0004' ? 'Atestado médico' : c.id === '0011' ? 'Falta justificada' : '')} />
                    </td>
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

// ===== Series chart (stacked area) =====
const EfetivoSerieChart = ({ serie }) => {
  const w = 660, h = 240;
  const pad = { l: 36, r: 16, t: 16, b: 28 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const max = Math.max(...serie.map(d => d.dir + d.ter + d.sub));
  const niceMax = Math.ceil(max / 30) * 30;
  const stepX = innerW / (serie.length - 1);
  const yOf = v => pad.t + innerH - (v / niceMax) * innerH;
  const xOf = i => pad.l + i * stepX;

  // build stacked area paths
  const dirTop = serie.map((d, i) => [xOf(i), yOf(d.dir)]);
  const terTop = serie.map((d, i) => [xOf(i), yOf(d.dir + d.ter)]);
  const subTop = serie.map((d, i) => [xOf(i), yOf(d.dir + d.ter + d.sub)]);

  const areaPath = (top, bottom) => {
    const t = top.map((p, i) => (i === 0 ? 'M' : 'L') + p[0] + ',' + p[1]).join(' ');
    const b = [...bottom].reverse().map(p => 'L' + p[0] + ',' + p[1]).join(' ');
    return t + ' ' + b + ' Z';
  };
  const bottomLine = serie.map((_, i) => [xOf(i), pad.t + innerH]);

  return (
    <svg className="chart-svg" viewBox={`0 0 ${w} ${h}`}>
      <g className="chart-grid">
        {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
          <line key={i} x1={pad.l} x2={w - pad.r}
            y1={pad.t + innerH * (1 - t)} y2={pad.t + innerH * (1 - t)}
            strokeDasharray={t === 0 ? '0' : '3 3'} />
        ))}
      </g>
      <g className="chart-axis">
        {[0, niceMax / 2, niceMax].map((t, i) => (
          <text key={i} x={pad.l - 8} y={pad.t + innerH * (1 - t / niceMax) + 3} textAnchor="end">{t}</text>
        ))}
        {serie.map((d, i) => i % 2 === 0 && (
          <text key={i} x={xOf(i)} y={h - pad.b + 14} textAnchor="middle">{d.m}</text>
        ))}
      </g>

      <path d={areaPath(dirTop, bottomLine)} fill="var(--brand)" fillOpacity="0.85" />
      <path d={areaPath(terTop, dirTop)} fill="var(--brand-400)" fillOpacity="0.85" />
      <path d={areaPath(subTop, terTop)} fill="#b3711a" fillOpacity="0.85" />

      {/* line on top */}
      <path d={subTop.map((p, i) => (i === 0 ? 'M' : 'L') + p[0] + ',' + p[1]).join(' ')}
        fill="none" stroke="#fff" strokeWidth="1.5" opacity="0.7" />

      {/* last total label */}
      <circle cx={xOf(serie.length - 1)} cy={yOf(serie[serie.length - 1].total)} r="4" fill="var(--brand)" stroke="white" strokeWidth="2" />
      <text x={xOf(serie.length - 1) - 6} y={yOf(serie[serie.length - 1].total) - 10} fontSize="11" fontWeight="700"
        textAnchor="end" fill="var(--brand)" fontFamily="var(--font-mono)">
        {serie[serie.length - 1].total}
      </text>
    </svg>
  );
};

// ===== Presença 14 dias chart =====
const Presenca14DChart = ({ serie }) => {
  const w = 360, h = 220;
  const pad = { l: 28, r: 12, t: 12, b: 28 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const maxV = Math.max(...serie.map(d => d.prev)) || 1;
  const niceMax = Math.ceil(maxV / 50) * 50;
  const stepX = innerW / serie.length;
  const barW = stepX * 0.5;
  const yOf = v => pad.t + innerH - (v / niceMax) * innerH;

  return (
    <svg className="chart-svg" viewBox={`0 0 ${w} ${h}`}>
      <g className="chart-grid">
        {[0, 0.5, 1].map((t, i) => (
          <line key={i} x1={pad.l} x2={w - pad.r}
            y1={pad.t + innerH * (1 - t)} y2={pad.t + innerH * (1 - t)}
            strokeDasharray={t === 0 ? '0' : '3 3'} />
        ))}
      </g>
      <g className="chart-axis">
        {[0, niceMax / 2, niceMax].map((t, i) => (
          <text key={i} x={pad.l - 4} y={pad.t + innerH * (1 - t / niceMax) + 3} textAnchor="end">{t}</text>
        ))}
        {serie.map((d, i) => i % 2 === 0 && (
          <text key={i} x={pad.l + stepX * (i + 0.5)} y={h - pad.b + 14} textAnchor="middle">{d.d}</text>
        ))}
      </g>
      {serie.map((d, i) => {
        const x = pad.l + stepX * (i + 0.5) - barW / 2;
        if (d.prev === 0) {
          return (
            <text key={i} x={x + barW / 2} y={pad.t + innerH - 4} textAnchor="middle"
              fontSize="9" fill="var(--text-faint)" fontFamily="var(--font-mono)">·</text>
          );
        }
        const yPrev = yOf(d.prev);
        const yPres = yOf(d.pres);
        return (
          <g key={i}>
            <rect x={x} y={yPrev} width={barW} height={pad.t + innerH - yPrev} rx="2" fill="var(--surface-muted)" stroke="var(--border)" />
            <rect x={x} y={yPres} width={barW} height={pad.t + innerH - yPres} rx="2" fill="var(--brand)" />
          </g>
        );
      })}
    </svg>
  );
};

window.EfetivoScreen = EfetivoScreen;
