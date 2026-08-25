import React from 'react';
import { Icon } from '../../components/Icons';
import { AppData } from '../../utils/data';
import { Modal, ObraFormModal } from '../../components/Modals';
import { supabase } from '../../services/supabase';
import { logger } from '../../services/logger';
import { offsetToISO, migrateEtapas, computeValorVinculadoMap, computeCustoOrcadoMap } from '../cronograma/ganttUtils';
import { computeAvancoFisico } from '../cronograma/scheduleEngine';
import { isAdmin } from '../../utils/permissions';
import { vinculoService, itemValor } from '../financeiro/vinculoService';

// Cache por módulo (persiste enquanto o app está aberto) — evita o delay de recalcular
// término/avanço e reassinar capas toda vez que a lista de Obras é reaberta.
const _obrasResumoCache = { cronFinal: {}, avancoMap: {}, capaUrls: {} };

// Obras — lista completa em cards
const ObrasList = ({ onOpenObra, obras, onObraCreate, onObraUpdate, onObraDelete, userProfile }) => {
  const D = AppData;
  const { brl } = D;
  const [filter,         setFilter]        = React.useState('todos');
  const [search,         setSearch]        = React.useState('');
  const [showNovaObra,   setShowNovaObra]  = React.useState(false);
  const [showEditObra,   setShowEditObra]  = React.useState(null);
  const [deleteObra,     setDeleteObra]    = React.useState(null);
  const [deleteStep,     setDeleteStep]    = React.useState(1);
  const [cronFinal,      setCronFinal]     = React.useState(_obrasResumoCache.cronFinal); // { [obraId]: 'YYYY-MM-DD' | null } — data final do cronograma
  const [avancoMap,      setAvancoMap]     = React.useState(_obrasResumoCache.avancoMap); // { [obraId]: % } — avanço físico calculado do cronograma
  const [capaUrls,       setCapaUrls]      = React.useState(_obrasResumoCache.capaUrls);  // { [obraId]: signedUrl } — capa via URL assinada (bucket privado)

  // Recalcula a data final e o avanço físico do cronograma de cada obra ao abrir/atualizar a lista.
  // Avanço físico = mesmo cálculo do Cronograma: ponderado pelo Custo Orçado (valor vinculado
  // ao orçamento + custo real de cada etapa, somados — ver Cronograma.jsx `avancoTotal`).
  React.useEffect(() => {
    const ids = obras.map(o => o.id);
    if (ids.length === 0) { _obrasResumoCache.cronFinal = {}; _obrasResumoCache.avancoMap = {}; setCronFinal({}); setAvancoMap({}); return; }
    let cancelled = false;
    Promise.all([
      supabase.from('cronogramas').select('obra_id, etapas').in('obra_id', ids),
      vinculoService.listarPorObras(ids),
    ]).then(([{ data }, { data: vinculosData }]) => {
      if (cancelled) return;
      // Agrupa vínculos + mapa de valor do item de orçamento por obra (mesma lógica do
      // efeito de vínculos em Cronograma.jsx, só que para várias obras de uma vez).
      const vinculosPorObra = {}, itensMapPorObra = {};
      (vinculosData || []).forEach(v => {
        (vinculosPorObra[v.obra_id] = vinculosPorObra[v.obra_id] || []).push(v);
        if (v.orcamento_itens) {
          const m = itensMapPorObra[v.obra_id] = itensMapPorObra[v.obra_id] || {};
          m[v.orcamento_item_id] = itemValor(v.orcamento_itens);
        }
      });
      const fimMap = {}, avMap = {};
      (data || []).forEach(row => {
        try {
          const etapas = migrateEtapas(row.etapas || []);
          if (!etapas.length) { fimMap[row.obra_id] = null; avMap[row.obra_id] = 0; return; }
          fimMap[row.obra_id] = offsetToISO(Math.max(...etapas.map(e => (e.inicio || 0) + (e.dur || 0))));
          const vinculosObra = vinculosPorObra[row.obra_id] || [];
          const valorVinculadoMapObra = computeValorVinculadoMap(etapas, vinculosObra, itensMapPorObra[row.obra_id] || {});
          const custoOrcadoMapObra = computeCustoOrcadoMap(etapas, valorVinculadoMapObra);
          avMap[row.obra_id] = computeAvancoFisico(etapas, custoOrcadoMapObra);
        } catch (e) { logger.error('falha ao calcular avanco/termino', { module: 'obras', action: 'resumo', obraId: row.obra_id, err: e }); }
      });
      _obrasResumoCache.cronFinal = fimMap; _obrasResumoCache.avancoMap = avMap;
      setCronFinal(fimMap); setAvancoMap(avMap);
    }).catch(err => logger.error('falha ao carregar cronogramas', { module: 'obras', action: 'carregarCronogramas', err }));
    return () => { cancelled = true; };
  }, [obras]);

  // Capas via URL assinada (bucket obras-images privado). Path determinístico: obras/<id>/capa.jpg
  React.useEffect(() => {
    const comCapa = obras.filter(o => o.imageUrl);
    if (!comCapa.length) { _obrasResumoCache.capaUrls = {}; setCapaUrls({}); return; }
    let cancelled = false;
    const pathToId = {};
    comCapa.forEach(o => { pathToId[`obras/${o.id}/capa.jpg`] = o.id; });
    supabase.storage.from('obras-images').createSignedUrls(Object.keys(pathToId), 3600).then(({ data }) => {
      if (cancelled) return;
      const map = {};
      (data || []).forEach(u => { if (u.signedUrl && !u.error && pathToId[u.path]) map[pathToId[u.path]] = u.signedUrl; });
      _obrasResumoCache.capaUrls = map;
      setCapaUrls(map);
    }).catch(err => logger.error('falha ao carregar capas', { module: 'obras', action: 'carregarCapas', err }));
    return () => { cancelled = true; };
  }, [obras]);

  const filtered = React.useMemo(() =>
    obras
      .filter(o => filter === 'todos' ? true : filter === 'em_andamento' ? o.status === 'em_andamento' : o.status === filter)
      .filter(o => !search || (o.nome + o.cliente + o.id).toLowerCase().includes(search.toLowerCase()))
      // Mais recente primeiro — independe da ordem do array recebido (obra criada na
      // sessão atual é anexada no fim pelo App.jsx, então não dá pra confiar só na ordem
      // de chegada da carga inicial).
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
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
        {isAdmin(userProfile) && (
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
          {filtered.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '48px 16px', color: 'var(--text-muted)', fontSize: 14 }}>
              {obras.length === 0 ? 'Nenhuma obra cadastrada.' : 'Nenhuma obra encontrada para os filtros atuais.'}
            </div>
          )}
          {filtered.map((o) => (
            <div key={o.id} className="obra-card" onClick={() => onOpenObra(o)}
                 role="button" tabIndex={0}
                 onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenObra(o); } }}>
              <div className="obra-card-img">
                {capaUrls[o.id]
                  ? <img src={capaUrls[o.id]} alt={o.nome} />
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
                  {/* Sempre reserva a linha da sigla (mesmo vazia) — senão os cards sem sigla
                     ficam com o nome/avanço/datas mais alto que os cards com sigla. */}
                  <div className="obra-card-id">{(o.sigla && o.sigla !== o.id) ? o.sigla : ' '}</div>
                  <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)', marginBottom: 3 }}>
                    ID: {o.id.length > 12 ? o.id.slice(0, 12) + '…' : o.id}
                  </div>
                  <div className="obra-card-name">{o.nome}</div>
                </div>
                <span className={'badge ' + (o.status === 'concluida' ? 'success' : 'info')} style={{ flexShrink: 0 }}>
                  {o.status === 'concluida' ? 'Concluída' : 'Em execução'}
                </span>
              </div>

              {(() => {
                const av = avancoMap[o.id] ?? o.avancoFisico ?? 0;
                return (
                  <div>
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                      <span className="text-xs text-muted fw-600" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>Avanço físico</span>
                      <span className="mono num fw-700" style={{ fontSize: 13, color: 'var(--brand)' }}>{av.toFixed(2)}%</span>
                    </div>
                    <div className={'progress' + (o.risco === 'alto' ? ' danger' : av >= 95 ? ' success' : '')}>
                      <span style={{ width: av + '%' }}></span>
                    </div>
                  </div>
                );
              })()}

              <div className="obra-card-foot">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="row" style={{ gap: 5, fontSize: 12, color: 'var(--text-muted)' }} title="Data fim do cronograma">
                    <Icon name="flag" size={12} />
                    <span className="mono">{cronFinal[o.id] ? cronFinal[o.id].split('-').reverse().join('/') : '—'}</span>
                  </span>
                  <span className="row" style={{ gap: 5, fontSize: 12, color: 'var(--text-muted)' }} title="Entrega (cliente)">
                    <Icon name="calendar" size={12} />
                    <span className="mono">{o.previsto ? o.previsto.split('-').reverse().join('/') : '—'}</span>
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
