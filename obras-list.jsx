// Obras — lista completa com variação de layout (cards x tabela)
const ObrasList = ({ onOpenObra, layout = 'tabela' }) => {
  const D = window.AppData;
  const { brl } = D;
  const [filter, setFilter] = React.useState('todos');
  const [search, setSearch] = React.useState('');
  const [internalLayout, setInternalLayout] = React.useState(layout);
  React.useEffect(() => { setInternalLayout(layout); }, [layout]);

  const filtered = D.obras
    .filter(o => filter === 'todos' ? true : filter === 'em_andamento' ? o.status === 'em_andamento' : o.status === filter)
    .filter(o => !search || (o.nome + o.cliente + o.id).toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Obras</h1>
          <div className="page-subtitle">
            {D.obras.length} obras cadastradas · {brl(D.obras.filter(o => o.status === 'em_andamento').reduce((a, b) => a + b.orcamento, 0), { compact: true })} em valor contratado
          </div>
        </div>
        <div className="page-actions">
          <div className="segmented">
            <button className={internalLayout === 'tabela' ? 'active' : ''} onClick={() => setInternalLayout('tabela')}>
              <Icon name="dashboard" size={13} style={{ transform: 'rotate(90deg)' }} />
            </button>
            <button className={internalLayout === 'cards' ? 'active' : ''} onClick={() => setInternalLayout('cards')}>
              <Icon name="box" size={13} />
            </button>
          </div>
          <button className="btn btn-ghost"><Icon name="filter" size={15} />Filtros</button>
          <button className="btn btn-ghost"><Icon name="download" size={15} />Exportar</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 'var(--gap)', padding: '14px 18px' }}>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div className="filters" style={{ flex: 1 }}>
            {[
              { id: 'todos', label: 'Todas', count: D.obras.length },
              { id: 'em_andamento', label: 'Em execução', count: D.obras.filter(o => o.status === 'em_andamento').length },
              { id: 'concluida', label: 'Concluídas', count: D.obras.filter(o => o.status === 'concluida').length },
            ].map(f => (
              <button key={f.id} className={'chip' + (filter === f.id ? ' active' : '')} onClick={() => setFilter(f.id)}>
                {f.label} <span style={{ color: 'var(--text-faint)' }}>·</span> {f.count}
              </button>
            ))}
            <button className="chip">Tipo <Icon name="chevron-down" size={12} className="caret" /></button>
            <button className="chip">Risco <Icon name="chevron-down" size={12} className="caret" /></button>
          </div>
          <input
            className="input input-search"
            placeholder="Buscar obra, cliente ou código…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ minWidth: 260 }}
          />
        </div>
      </div>

      {internalLayout === 'tabela' && (
        <div className="card">
          <div className="card-body flush" style={{ overflow: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Obra</th>
                  <th>Cliente</th>
                  <th>Avanço</th>
                  <th className="right">Orçamento</th>
                  <th className="right">Realizado</th>
                  <th>Risco</th>
                  <th>Etapa atual</th>
                  <th>Entrega</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.id} onClick={() => onOpenObra(o)}>
                    <td>
                      <div className="strong" style={{ marginBottom: 2 }}>{o.nome}</div>
                      <div className="text-xs text-muted mono">{o.id} · {o.tipo}</div>
                    </td>
                    <td className="text-soft">{o.cliente}</td>
                    <td style={{ minWidth: 160 }}>
                      <div className="progress-row">
                        <div className={'progress' + (o.risco === 'alto' ? ' danger' : o.avancoFisico >= 95 ? ' success' : '')}>
                          <span style={{ width: o.avancoFisico + '%' }}></span>
                        </div>
                        <span className="pct">{o.avancoFisico}%</span>
                      </div>
                    </td>
                    <td className="right strong num">{brl(o.orcamento, { compact: true })}</td>
                    <td className="right num">{brl(o.gasto, { compact: true })}</td>
                    <td><RiskBadge risk={o.risco} /></td>
                    <td className="text-sm text-soft">{o.etapaAtual}</td>
                    <td className="mono text-sm text-soft">{o.previsto.split('-').reverse().join('/')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {internalLayout === 'cards' && (
        <div className="obra-card-grid">
          {filtered.map((o) => (
            <div key={o.id} className="obra-card" onClick={() => onOpenObra(o)}>
              <div className="obra-card-head">
                <div style={{ flex: 1 }}>
                  <div className="obra-card-id">{o.id}</div>
                  <div className="obra-card-name">{o.nome}</div>
                  <div className="obra-card-meta">
                    <Icon name="building" size={12} />
                    {o.tipo}
                  </div>
                </div>
                <RiskBadge risk={o.risco} />
              </div>

              <div className="text-xs text-muted row" style={{ gap: 5 }}>
                <Icon name="users" size={12} />
                <span>{o.cliente}</span>
              </div>

              <div>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                  <span className="text-xs text-muted fw-600" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>Avanço físico</span>
                  <span className="mono num fw-700" style={{ fontSize: 13, color: 'var(--brand)' }}>{o.avancoFisico}%</span>
                </div>
                <div className={'progress' + (o.risco === 'alto' ? ' danger' : o.avancoFisico >= 95 ? ' success' : '')}>
                  <span style={{ width: o.avancoFisico + '%' }}></span>
                </div>
              </div>

              <div className="obra-card-stats">
                <div className="obra-card-stat">
                  <div className="lbl">Orçamento</div>
                  <div className="val num">{brl(o.orcamento, { compact: true })}</div>
                </div>
                <div className="obra-card-stat">
                  <div className="lbl">Realizado</div>
                  <div className="val num">{brl(o.gasto, { compact: true })}</div>
                </div>
              </div>

              <div className="obra-card-foot">
                <div className="row" style={{ gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                  <Icon name="calendar" size={12} />
                  <span className="mono">{o.previsto.split('-').reverse().join('/')}</span>
                </div>
                <div className="row" style={{ gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                  <Icon name="users" size={12} />
                  <span className="mono num">{o.equipe}</span>
                  {o.alertas > 0 && (
                    <>
                      <span style={{ color: 'var(--text-faint)' }}>·</span>
                      <Icon name="alert" size={12} style={{ color: 'var(--danger)' }} />
                      <span className="mono num" style={{ color: 'var(--danger)' }}>{o.alertas}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

window.ObrasList = ObrasList;
