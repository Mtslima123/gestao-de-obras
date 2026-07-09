import React from 'react';
import { Icon } from '../../components/Icons';
import { AppData } from '../../utils/data';
import { Modal, ObraFormModal } from '../../components/Modals';
import { supabase } from '../../services/supabase';
import { offsetToISO } from '../cronograma/ganttUtils';
import { moduloSomenteLeitura } from '../../utils/permissions';

// Obras — lista completa em cards
const ObrasList = ({ onOpenObra, obras, onObraCreate, onObraUpdate, onObraDelete, userProfile }) => {
  const D = AppData;
  const { brl } = D;
  const readOnly = moduloSomenteLeitura(userProfile, 'obras');
  const [filter,         setFilter]        = React.useState('todos');
  const [search,         setSearch]        = React.useState('');
  const [showNovaObra,   setShowNovaObra]  = React.useState(false);
  const [showEditObra,   setShowEditObra]  = React.useState(null);
  const [deleteObra,     setDeleteObra]    = React.useState(null);
  const [deleteStep,     setDeleteStep]    = React.useState(1);
  const [cronFinal,      setCronFinal]     = React.useState({}); // { [obraId]: 'YYYY-MM-DD' | null } — data final do cronograma, sempre calculada das etapas reais

  // Recalcula a data final do cronograma de cada obra a cada vez que a lista é aberta/atualizada
  React.useEffect(() => {
    const ids = obras.map(o => o.id);
    if (ids.length === 0) { setCronFinal({}); return; }
    supabase.from('cronogramas').select('obra_id, etapas').in('obra_id', ids).then(({ data }) => {
      const map = {};
      (data || []).forEach(row => {
        const etapas = row.etapas || [];
        if (!etapas.length) { map[row.obra_id] = null; return; }
        const fimMax = Math.max(...etapas.map(e => (e.inicio || 0) + (e.dur || 0)));
        map[row.obra_id] = offsetToISO(fimMax);
      });
      setCronFinal(map);
    });
  }, [obras]);

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
            {obras.length} obras cadastradas
          </div>
        </div>
        {!readOnly && (
          <div className="page-actions">
            <button className="btn btn-primary" onClick={() => setShowNovaObra(true)}>
              <Icon name="plus" size={15} /> Nova Obra
            </button>
          </div>
        )}
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

      {showNovaObra && (
        <ObraFormModal
          obra={null}
          onClose={() => setShowNovaObra(false)}
          onSave={async (nova) => { if (await onObraCreate(nova)) setShowNovaObra(false); }}
        />
      )}
      {showEditObra && (
        <ObraFormModal
          obra={showEditObra}
          onClose={() => setShowEditObra(null)}
          onSave={async (updated) => { if (await onObraUpdate(updated)) setShowEditObra(null); }}
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
                  {o.sigla && o.sigla !== o.id && <div className="obra-card-id">{o.sigla}</div>}
                  <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)', marginBottom: 3 }}>
                    ID: {o.id.length > 12 ? o.id.slice(0, 12) + '…' : o.id}
                  </div>
                  <div className="obra-card-name">{o.nome}</div>
                </div>
                <span className={'badge ' + (o.status === 'concluida' ? 'success' : 'info')} style={{ flexShrink: 0 }}>
                  {o.status === 'concluida' ? 'Concluída' : 'Em execução'}
                </span>
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

              <div className="obra-card-foot">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="row" style={{ gap: 5, fontSize: 12, color: 'var(--text-muted)' }} title="Entrega ao cliente">
                    <Icon name="calendar" size={12} />
                    <span className="mono">{o.previsto.split('-').reverse().join('/')}</span>
                  </span>
                  <span className="row" style={{ gap: 5, fontSize: 12, color: 'var(--text-muted)' }} title="Término previsto do cronograma">
                    <Icon name="flag" size={12} />
                    <span className="mono">{cronFinal[o.id] ? cronFinal[o.id].split('-').reverse().join('/') : '—'}</span>
                  </span>
                </div>
                {o.alertas > 0 && (
                  <div className="row" style={{ gap: 6, fontSize: 12, color: 'var(--danger)' }}>
                    <Icon name="alert" size={12} />
                    <span className="mono num">{o.alertas}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
    </>
  );
};

export { ObrasList };
