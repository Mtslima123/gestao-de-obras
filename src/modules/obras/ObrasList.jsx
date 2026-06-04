import React from 'react';
import { Icon } from '../../components/Icons';
import { AppData } from '../../utils/data';
import { Modal, ObraFormModal } from '../../components/Modals';
import { RiskBadge } from '../../components/RiskBadge';

// Obras — lista completa com variação de layout (cards x tabela)
const ObrasList = ({ onOpenObra, layout = 'tabela', obras, onObraCreate, onObraUpdate, onObraDelete }) => {
  const D = AppData;
  const { brl } = D;
  const [filter,         setFilter]        = React.useState('todos');
  const [search,         setSearch]        = React.useState('');
  const [internalLayout, setInternalLayout] = React.useState(layout);
  const [showNovaObra,   setShowNovaObra]  = React.useState(false);
  const [showEditObra,   setShowEditObra]  = React.useState(null);
  const [deleteObra,     setDeleteObra]    = React.useState(null);
  const [deleteStep,     setDeleteStep]    = React.useState(1);

  React.useEffect(() => { setInternalLayout(layout); }, [layout]);

  const filtered = React.useMemo(() =>
    obras
      .filter(o => filter === 'todos' ? true : filter === 'em_andamento' ? o.status === 'em_andamento' : o.status === filter)
      .filter(o => !search || (o.nome + o.cliente + o.id).toLowerCase().includes(search.toLowerCase())),
    [obras, filter, search]
  );

  const handleDeleteConfirm = () => {
    if (!deleteObra) return;
    if (deleteStep === 1) { setDeleteStep(2); return; }
    onObraDelete(deleteObra.id);
    setDeleteObra(null);
    setDeleteStep(1);
  };

  const handleDeleteCancel = () => { setDeleteObra(null); setDeleteStep(1); };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Obras</h1>
          <div className="page-subtitle">
            {obras.length} obras cadastradas · {brl(obras.filter(o => o.status === 'em_andamento').reduce((a, b) => a + b.orcamento, 0), { compact: true })} em valor contratado
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
          <button className="btn btn-primary" onClick={() => setShowNovaObra(true)}>
            <Icon name="plus" size={15} /> Nova Obra
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 'var(--gap)', padding: '14px 18px' }}>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div className="filters" style={{ flex: 1 }}>
            {[
              { id: 'todos', label: 'Todas', count: obras.length },
              { id: 'em_andamento', label: 'Em execução', count: obras.filter(o => o.status === 'em_andamento').length },
              { id: 'concluida', label: 'Concluídas', count: obras.filter(o => o.status === 'concluida').length },
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
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.id} onClick={() => onOpenObra(o)} style={{ cursor: 'pointer' }}>
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
                    <td onClick={ev => ev.stopPropagation()} style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <button
                        className="obras-row-actions btn btn-ghost"
                        style={{ width: 28, height: 28, padding: 0 }}
                        title={`Editar ${o.nome}`}
                        onClick={() => setShowEditObra(o)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button
                        className="obras-row-actions btn btn-ghost"
                        style={{ width: 28, height: 28, padding: 0, color: 'var(--danger)' }}
                        title={`Excluir ${o.nome}`}
                        onClick={() => { setDeleteObra(o); setDeleteStep(1); }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showNovaObra && (
        <ObraFormModal
          obra={null}
          onClose={() => setShowNovaObra(false)}
          onSave={(nova) => { onObraCreate(nova); setShowNovaObra(false); }}
        />
      )}
      {showEditObra && (
        <ObraFormModal
          obra={showEditObra}
          onClose={() => setShowEditObra(null)}
          onSave={(updated) => { onObraUpdate(updated); setShowEditObra(null); }}
        />
      )}

      {deleteObra && (
        <Modal
          title={deleteStep === 1 ? 'Excluir obra' : 'Confirmação final'}
          onClose={handleDeleteCancel}
          footer={
            <>
              <button className="btn btn-ghost" onClick={handleDeleteCancel}>Cancelar</button>
              <button
                className="btn"
                style={{ background: 'var(--danger)', color: 'white', fontWeight: 600 }}
                onClick={handleDeleteConfirm}
              >
                {deleteStep === 1 ? 'Sim, excluir' : 'Confirmar exclusão'}
              </button>
            </>
          }
        >
          {deleteStep === 1 ? (
            <p style={{ fontSize: 14 }}>
              Tem certeza que deseja excluir a obra <strong>{deleteObra.nome}</strong> ({deleteObra.id})?
            </p>
          ) : (
            <div>
              <p style={{ fontSize: 14, marginBottom: 10 }}>
                Esta ação é <strong style={{ color: 'var(--danger)' }}>irreversível</strong>. Todos os dados da obra serão removidos.
              </p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Obra: <strong>{deleteObra.nome}</strong> · Orçamento: <strong>{brl(deleteObra.orcamento, { compact: true })}</strong>
              </p>
              <p style={{ fontSize: 14, marginTop: 12, fontWeight: 600 }}>Deseja realmente continuar?</p>
            </div>
          )}
        </Modal>
      )}

      {internalLayout === 'cards' && (
        <div className="obra-card-grid">
          {filtered.map((o) => (
            <div key={o.id} className="obra-card" onClick={() => onOpenObra(o)}>
              <div className="obra-card-img">
                {o.imageUrl
                  ? <img src={o.imageUrl} alt={o.nome} />
                  : <div className="obra-card-img-ph">
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
                        <line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>
                      </svg>
                      <span>SEM IMAGEM</span>
                    </div>
                }
              </div>

              <div className="obra-card-head" style={{ paddingTop: 6 }}>
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
              {o.responsavel && (
                <div className="text-xs text-muted row" style={{ gap: 5 }}>
                  <Icon name="user" size={12} />
                  <span>{o.responsavel}</span>
                </div>
              )}

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

export { ObrasList };
