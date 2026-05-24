// Cronograma full — Gantt elegante com dependências, marcos e linha do hoje
const CronogramaFull = () => {
  const D = window.AppData;
  const [obraSel, setObraSel] = React.useState('OB-001');
  const [view, setView] = React.useState('gantt');
  const obra = D.obras.find(o => o.id === obraSel) || D.obras[0];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Cronogramas</h1>
          <div className="page-subtitle">Planejamento físico das obras · Gantt com dependências e caminho crítico</div>
        </div>
        <div className="page-actions">
          <select className="input" value={obraSel} onChange={e => setObraSel(e.target.value)} style={{ minWidth: 200 }}>
            {D.obras.filter(o => o.status === 'em_andamento').map(o => (
              <option key={o.id} value={o.id}>{o.nome} ({o.id})</option>
            ))}
          </select>
          <div className="segmented">
            <button className={view === 'gantt' ? 'active' : ''} onClick={() => setView('gantt')}>Gantt</button>
            <button className={view === 'curva' ? 'active' : ''} onClick={() => setView('curva')}>Curva Física</button>
            <button className={view === 'lista' ? 'active' : ''} onClick={() => setView('lista')}>Lista</button>
            <button className={view === 'calendario' ? 'active' : ''} onClick={() => setView('calendario')}>Calendário</button>
          </div>
          <button className="btn btn-ghost"><Icon name="download" size={15} />Exportar</button>
          <button className="btn btn-primary"><Icon name="plus" size={15} />Nova etapa</button>
        </div>
      </div>

      {/* Resumo da obra */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="kpi" style={{ padding: '14px 18px' }}>
          <div className="kpi-label">Avanço físico</div>
          <div className="kpi-value num" style={{ fontSize: 22, marginTop: 6 }}>{obra.avancoFisico}<span className="unit">%</span></div>
          <div className="kpi-foot" style={{ marginTop: 6 }}>
            <span className="kpi-foot-text">vs planejado 65%</span>
          </div>
        </div>
        <div className="kpi" style={{ padding: '14px 18px' }}>
          <div className="kpi-label">Etapas concluídas</div>
          <div className="kpi-value num" style={{ fontSize: 22, marginTop: 6 }}>3<span className="unit">/ 11</span></div>
        </div>
        <div className="kpi" style={{ padding: '14px 18px' }}>
          <div className="kpi-label">Etapas atrasadas</div>
          <div className="kpi-value num" style={{ fontSize: 22, marginTop: 6, color: 'var(--danger)' }}>3</div>
          <div className="kpi-foot" style={{ marginTop: 6 }}>
            <span className="kpi-foot-text">Caminho crítico afetado</span>
          </div>
        </div>
        <div className="kpi" style={{ padding: '14px 18px' }}>
          <div className="kpi-label">Folga total</div>
          <div className="kpi-value num" style={{ fontSize: 22, marginTop: 6 }}>11<span className="unit">dias</span></div>
        </div>
      </div>

      {view === 'gantt' && (
        <div className="card" style={{ marginTop: 'var(--gap)' }}>
          <div className="card-header">
            <div>
              <div className="card-title">{obra.nome} · Gantt</div>
              <div className="card-subtitle">11 etapas · 26 meses · marcos críticos destacados</div>
            </div>
            <div className="card-actions">
              <div className="legend">
                <span className="legend-item"><span className="legend-swatch" style={{ background: '#1f8b5c' }}></span>Concluída</span>
                <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--brand)' }}></span>Em execução</span>
                <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--danger)' }}></span>Atrasada</span>
                <span className="legend-item"><span className="legend-swatch" style={{ background: '#3d7fc9' }}></span>Futura</span>
                <span className="legend-item"><span className="legend-swatch" style={{ width: 10, height: 10, background: 'var(--brand)', transform: 'rotate(45deg)', borderRadius: 0 }}></span>Marco</span>
              </div>
            </div>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <GanttElegante etapas={D.cronograma} today={14.5} />
          </div>
        </div>
      )}

      {view === 'curva' && <CurvaFisicaView obra={obra} />}

      {view === 'lista' && (
        <div className="card" style={{ marginTop: 'var(--gap)' }}>
          <div className="card-header">
            <div className="card-title">Etapas — visualização em lista</div>
          </div>
          <div className="card-body flush">
            <table className="tbl">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Etapa</th>
                  <th>Início</th>
                  <th>Duração</th>
                  <th>Avanço</th>
                  <th>Status</th>
                  <th>Dependências</th>
                  <th>Folga</th>
                </tr>
              </thead>
              <tbody>
                {D.cronograma.map((e, i) => (
                  <tr key={e.id}>
                    <td className="mono strong">{e.id}</td>
                    <td className="strong">{e.etapa}</td>
                    <td className="mono num text-muted">M+{e.inicio}</td>
                    <td className="mono num">{e.dur} meses</td>
                    <td style={{ minWidth: 140 }}>
                      <div className="progress-row">
                        <div className={'progress' + (e.status === 'done' ? ' success' : e.status === 'late' ? ' danger' : '')}>
                          <span style={{ width: e.avanco + '%' }}></span>
                        </div>
                        <span className="pct">{e.avanco}%</span>
                      </div>
                    </td>
                    <td>
                      <span className={'badge ' + (e.status === 'done' ? 'success' : e.status === 'late' ? 'danger' : e.status === 'upcoming' ? 'info' : 'neutral')}>
                        <span className="dot"></span>
                        {e.status === 'done' ? 'Concluída' : e.status === 'late' ? 'Atrasada' : 'Futura'}
                      </span>
                    </td>
                    <td className="mono text-sm text-muted">{e.dep.length ? e.dep.join(', ') : '—'}</td>
                    <td className="mono num">{Math.max(0, 24 - e.inicio - e.dur)}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === 'calendario' && (
        <div className="card" style={{ marginTop: 'var(--gap)', padding: 40, textAlign: 'center' }}>
          <Icon name="calendar" size={40} style={{ color: 'var(--text-faint)' }} />
          <h3 style={{ marginTop: 12, fontSize: 16, color: 'var(--text-soft)' }}>Visualização em calendário</h3>
          <p className="text-muted" style={{ maxWidth: 380, margin: '6px auto 0', fontSize: 13 }}>
            Em breve: visualize etapas e marcos em uma grade mensal interativa.
          </p>
        </div>
      )}
    </>
  );
};

// Elegant Gantt with today line, dependencies and milestones
const GanttElegante = ({ etapas, today = 14.5 }) => {
  const totalMonths = 26;
  const monthW = 36; // px per month for the timeline area
  const labelW = 280;
  const timelineW = totalMonths * monthW;
  const rowH = 42;
  const headerH = 56;
  const height = headerH + etapas.length * rowH;

  // months labels with year separators
  const months = [];
  let y = 24, mo = 2; // start: Mar/24
  for (let i = 0; i < totalMonths; i++) {
    const monthNames = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    months.push({ short: monthNames[mo], year: y, isYearStart: mo === 0 });
    mo++;
    if (mo === 12) { mo = 0; y++; }
  }

  // Quarters
  const quarters = [];
  for (let q = 0; q < 9; q++) {
    const startM = q * 3;
    if (startM >= totalMonths) break;
    const endM = Math.min(startM + 3, totalMonths);
    quarters.push({ label: `T${(q % 4) + 1} ${24 + Math.floor(q / 4)}`, start: startM, end: endM });
  }

  // Find bar position for a given etapa id
  const findEtapa = (id) => etapas.find(e => e.id === id);
  const etapaIndex = (id) => etapas.findIndex(e => e.id === id);

  return (
    <div style={{ overflow: 'auto', maxWidth: '100%' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `${labelW}px ${timelineW}px`,
        minWidth: labelW + timelineW,
        position: 'relative',
      }}>
        {/* HEADER */}
        <div style={{
          height: headerH,
          borderBottom: '1px solid var(--border)',
          borderRight: '1px solid var(--border)',
          display: 'flex', alignItems: 'flex-end',
          padding: '0 18px 12px',
          fontSize: 11, fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.06em',
          color: 'var(--text-muted)',
          background: 'var(--surface-muted)',
        }}>ETAPA</div>
        <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-muted)', position: 'relative' }}>
          {/* Quarter row */}
          <div style={{ display: 'flex', height: 26, borderBottom: '1px solid var(--border)' }}>
            {quarters.map((q, i) => (
              <div key={i} style={{
                width: (q.end - q.start) * monthW,
                fontSize: 10.5,
                fontWeight: 700,
                color: 'var(--text-soft)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                padding: '6px 10px',
                borderRight: '1px solid var(--border)',
                background: i % 2 === 0 ? 'var(--surface-muted)' : 'transparent',
              }}>{q.label}</div>
            ))}
          </div>
          {/* Months row */}
          <div style={{ display: 'flex', height: 30 }}>
            {months.map((m, i) => (
              <div key={i} style={{
                width: monthW,
                fontSize: 10,
                color: 'var(--text-muted)',
                textAlign: 'center',
                padding: '8px 0',
                borderRight: i % 3 === 2 ? '1px solid var(--border)' : '1px solid var(--border-strong, transparent)',
                fontFamily: 'var(--font-mono)',
              }}>{m.short}</div>
            ))}
          </div>
        </div>

        {/* ROWS */}
        {etapas.map((e, i) => (
          <React.Fragment key={e.id}>
            <div style={{
              height: rowH,
              padding: '0 14px 0 18px',
              borderBottom: '1px solid var(--border)',
              borderRight: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 10,
              fontSize: 13,
              color: 'var(--text)',
              fontWeight: 500,
            }}>
              <span className="mono text-xs text-muted" style={{ minWidth: 26 }}>{e.id}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.etapa}</span>
            </div>
            <div style={{ position: 'relative', borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-muted)' }}>
              {/* month grid lines */}
              {months.map((_, mi) => (
                <div key={mi} style={{
                  position: 'absolute',
                  left: mi * monthW,
                  top: 0, bottom: 0,
                  width: 1,
                  background: mi % 3 === 0 ? 'var(--border)' : 'var(--border)',
                  opacity: mi % 3 === 0 ? 1 : 0.5,
                }}></div>
              ))}
              {/* the bar */}
              {!e.milestone ? (
                <div
                  className={'gantt-bar ' + e.status}
                  style={{
                    left: e.inicio * monthW + 3,
                    width: e.dur * monthW - 6,
                    height: 22,
                  }}
                  title={`${e.etapa} · ${e.avanco}% concluído`}
                >
                  <div className="fill" style={{ width: e.avanco + '%' }}></div>
                  <span style={{ position: 'relative', zIndex: 1, paddingLeft: 6 }}>
                    {e.avanco > 0 ? e.avanco + '%' : ''}
                  </span>
                </div>
              ) : (
                <div className="gantt-milestone" style={{ left: e.inicio * monthW }} title={e.etapa}></div>
              )}
            </div>
          </React.Fragment>
        ))}

        {/* TODAY LINE — absolute over the grid */}
        <div style={{
          position: 'absolute',
          left: labelW + today * monthW,
          top: 0,
          bottom: 0,
          width: 0,
          borderLeft: '1.5px dashed var(--danger)',
          zIndex: 4,
          pointerEvents: 'none',
        }}>
          <div className="gantt-today-label" style={{ top: 4 }}>HOJE</div>
        </div>

        {/* DEPENDENCY ARROWS (svg overlay) */}
        <svg style={{
          position: 'absolute',
          top: headerH,
          left: labelW,
          width: timelineW,
          height: etapas.length * rowH,
          pointerEvents: 'none',
        }}>
          <defs>
            <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="var(--text-faint)" />
            </marker>
          </defs>
          {etapas.map((e, i) => (
            e.dep.map((depId, di) => {
              const dep = findEtapa(depId);
              if (!dep) return null;
              const fromX = (dep.inicio + dep.dur) * monthW - 3;
              const fromY = etapaIndex(depId) * rowH + rowH / 2;
              const toX = e.inicio * monthW + 3;
              const toY = i * rowH + rowH / 2;
              const midX = (fromX + toX) / 2;
              const path = `M ${fromX} ${fromY} L ${midX} ${fromY} L ${midX} ${toY} L ${toX - 4} ${toY}`;
              return (
                <path
                  key={`${e.id}-${depId}-${di}`}
                  d={path}
                  fill="none"
                  stroke="var(--text-faint)"
                  strokeWidth="1.3"
                  strokeDasharray="3 3"
                  markerEnd="url(#arrow)"
                />
              );
            })
          ))}
        </svg>
      </div>
    </div>
  );
};

Object.assign(window, { CronogramaFull, GanttElegante });