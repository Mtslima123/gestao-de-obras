import React from 'react';
import { Icon } from '../../components/Icons';
import { useToast } from '../../components/Modals';
import { supabase } from '../../services/supabase';
import { vinculoService } from './vinculoService';
import { formatBRL } from '../../utils/formatters';

// ─── OrcamentoCronogramaScreen ────────────────────────────────────────────────
// Tela de vinculação muitos-para-muitos entre itens do orçamento e tarefas do cronograma.
// Os vínculos criados aqui alimentam o cálculo automático de pesos físicos no Cronograma.

const OrcamentoCronogramaScreen = ({ obras = [], user }) => {
  const toast = useToast();

  const [obraSel,    setObraSel]    = React.useState('');
  const [vinculos,   setVinculos]   = React.useState([]);
  const [itens,      setItens]      = React.useState([]);
  const [etapas,     setEtapas]     = React.useState([]);
  const [loading,    setLoading]    = React.useState(false);
  const [saving,     setSaving]     = React.useState(false);

  // Filtros da tabela de vínculos
  const [filtroItem,  setFiltroItem]  = React.useState('');
  const [filtroEtapa, setFiltroEtapa] = React.useState('');

  // Seleção para novo vínculo
  const [selItem,  setSelItem]  = React.useState('');
  const [selEtapa, setSelEtapa] = React.useState('');

  // Carrega dados quando a obra muda
  React.useEffect(() => {
    if (!obraSel) {
      setVinculos([]); setItens([]); setEtapas([]);
      return;
    }
    setLoading(true);
    Promise.all([
      vinculoService.listarPorObra(obraSel),
      vinculoService.itensPorObra(obraSel),
      supabase.from('cronogramas').select('etapas').eq('obra_id', obraSel).single(),
    ]).then(([vincRes, itensRes, cronRes]) => {
      setVinculos(vincRes.data || []);
      setItens(itensRes.data || []);
      setEtapas(cronRes.data?.etapas || []);
      setLoading(false);
    });
  }, [obraSel]);

  // ── Adicionar vínculo ──────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!selItem || !selEtapa) return;
    if (vinculos.some(v => v.orcamento_item_id === selItem && v.etapa_id === selEtapa)) {
      toast('Este vínculo já existe', { tone: 'warning', icon: 'alert' });
      return;
    }
    setSaving(true);
    const { error } = await vinculoService.criar({
      obra_id: obraSel,
      orcamento_item_id: selItem,
      etapa_id: selEtapa,
    }, user?.id);

    if (error) {
      toast('Erro ao criar vínculo: ' + error.message, { tone: 'danger', icon: 'alert-triangle' });
      setSaving(false);
      return;
    }

    const { data } = await vinculoService.listarPorObra(obraSel);
    setVinculos(data || []);
    setSelItem('');
    setSelEtapa('');
    setSaving(false);
    toast('Vínculo criado com sucesso', { tone: 'success', icon: 'check' });
  };

  // ── Remover vínculo ────────────────────────────────────────────────────────
  const handleRemove = async (id) => {
    const { error } = await vinculoService.excluir(id);
    if (error) {
      toast('Erro ao remover vínculo: ' + error.message, { tone: 'danger', icon: 'alert-triangle' });
      return;
    }
    setVinculos(v => v.filter(x => x.id !== id));
    toast('Vínculo removido', { tone: 'neutral', icon: 'check' });
  };

  // ── Filtros ────────────────────────────────────────────────────────────────
  const filtrados = vinculos.filter(v => {
    const itemNome  = (v.orcamento_itens?.nome || '').toLowerCase();
    const etapaNome = (etapas.find(e => e.id === v.etapa_id)?.etapa || '').toLowerCase();
    return (
      (!filtroItem  || itemNome.includes(filtroItem.toLowerCase()))  &&
      (!filtroEtapa || etapaNome.includes(filtroEtapa.toLowerCase()))
    );
  });

  const totalVinculado = filtrados.reduce((s, v) => s + (v.orcamento_itens?.valor_total || 0), 0);

  // ── Helpers de exibição ───────────────────────────────────────────────────
  const indentEtapa = (e) => ' '.repeat((e.nivel || 0) * 3) + (e.isGroup ? '▸ ' : '') + e.etapa;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Orçamento × Cronograma</h1>
          <div className="page-subtitle">
            Vincule itens do orçamento às tarefas do cronograma para calcular pesos físicos automaticamente
          </div>
        </div>
        <div className="page-actions">
          <select
            className="input"
            value={obraSel}
            onChange={e => setObraSel(e.target.value)}
            style={{ minWidth: 240 }}
          >
            <option value="">Selecione uma obra…</option>
            {obras.map(o => (
              <option key={o.id} value={o.id}>{o.nome}</option>
            ))}
          </select>
        </div>
      </div>

      {!obraSel && (
        <div className="card" style={{ marginTop: 'var(--gap)', padding: '72px 24px', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--brand-tint)', color: 'var(--brand)', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
            <Icon name="link" size={28} />
          </div>
          <h2 style={{ margin: '0 0 6px', fontSize: 18 }}>Nenhuma obra selecionada</h2>
          <div className="text-muted" style={{ maxWidth: 400, margin: '0 auto', fontSize: 13.5 }}>
            Selecione uma obra para gerenciar os vínculos entre orçamento e cronograma.
          </div>
        </div>
      )}

      {obraSel && loading && (
        <div style={{ padding: 64, textAlign: 'center' }} className="text-muted">Carregando…</div>
      )}

      {obraSel && !loading && (
        <>
          {/* ── Adicionar novo vínculo ──────────────────────────────────────── */}
          <div className="card" style={{ marginTop: 'var(--gap)' }}>
            <div className="card-header">
              <div className="card-title">Adicionar vínculo</div>
              <div className="card-subtitle">
                Relacione um item do orçamento com uma tarefa do cronograma
              </div>
            </div>
            <div className="card-body">
              {itens.length === 0 && (
                <div className="text-muted" style={{ fontSize: 13, marginBottom: 12 }}>
                  Nenhum item de orçamento encontrado para esta obra. Crie um orçamento primeiro.
                </div>
              )}
              {etapas.length === 0 && (
                <div className="text-muted" style={{ fontSize: 13, marginBottom: 12 }}>
                  Nenhuma tarefa de cronograma encontrada para esta obra. Crie um cronograma primeiro.
                </div>
              )}
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 280px', minWidth: 200 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    Item do Orçamento
                  </label>
                  <select
                    className="input"
                    value={selItem}
                    onChange={e => setSelItem(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    <option value="">— Selecione um item —</option>
                    {itens.map(it => (
                      <option key={it.id} value={it.id}>
                        {it.codigo} — {it.nome} ({formatBRL(it.valor_total)})
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ flex: '1 1 280px', minWidth: 200 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    Tarefa do Cronograma
                  </label>
                  <select
                    className="input"
                    value={selEtapa}
                    onChange={e => setSelEtapa(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    <option value="">— Selecione uma tarefa —</option>
                    {etapas.map(et => (
                      <option key={et.id} value={et.id}>{indentEtapa(et)}</option>
                    ))}
                  </select>
                </div>

                <button
                  className="btn btn-primary"
                  onClick={handleAdd}
                  disabled={!selItem || !selEtapa || saving}
                  style={{ flexShrink: 0 }}
                >
                  <Icon name="plus" size={15} />
                  {saving ? 'Salvando…' : 'Adicionar'}
                </button>
              </div>

              {selItem && selEtapa && (() => {
                const item  = itens.find(it => it.id === selItem);
                const etapa = etapas.find(e => e.id === selEtapa);
                if (!item || !etapa) return null;
                return (
                  <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--brand-tint)', borderRadius: 8, fontSize: 13, color: 'var(--brand)' }}>
                    <strong>{item.codigo} — {item.nome}</strong>
                    <span style={{ margin: '0 8px', opacity: 0.6 }}>→</span>
                    <strong>{etapa.etapa}</strong>
                    <span style={{ marginLeft: 8, opacity: 0.7 }}>({formatBRL(item.valor_total)})</span>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* ── Tabela de vínculos ────────────────────────────────────────────── */}
          <div className="card" style={{ marginTop: 'var(--gap)' }}>
            <div className="card-header">
              <div>
                <div className="card-title">
                  Vínculos cadastrados
                  <span style={{ marginLeft: 8, background: 'var(--surface-muted)', borderRadius: 12, padding: '2px 8px', fontSize: 12, fontWeight: 400 }}>
                    {filtrados.length}
                  </span>
                  {vinculos.length > 0 && (
                    <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--success)', fontWeight: 400 }}>
                      · Pesos automáticos ativos
                    </span>
                  )}
                </div>
                {filtrados.length > 0 && (
                  <div className="card-subtitle">
                    Total vinculado: <strong>{formatBRL(totalVinculado)}</strong>
                  </div>
                )}
              </div>
              <div className="card-actions">
                <input
                  className="input"
                  placeholder="Filtrar por item…"
                  value={filtroItem}
                  onChange={e => setFiltroItem(e.target.value)}
                  style={{ width: 190 }}
                />
                <input
                  className="input"
                  placeholder="Filtrar por tarefa…"
                  value={filtroEtapa}
                  onChange={e => setFiltroEtapa(e.target.value)}
                  style={{ width: 190 }}
                />
                {(filtroItem || filtroEtapa) && (
                  <button className="btn btn-ghost" onClick={() => { setFiltroItem(''); setFiltroEtapa(''); }}>
                    <Icon name="x" size={14} />Limpar
                  </button>
                )}
              </div>
            </div>

            <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>Código</th>
                    <th>Item do Orçamento</th>
                    <th>Tarefa do Cronograma</th>
                    <th style={{ width: 60, textAlign: 'center' }}>Nível</th>
                    <th style={{ textAlign: 'right', width: 140 }}>Valor (R$)</th>
                    <th style={{ width: 48 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '32px 24px', color: 'var(--text-faint)' }}>
                        {vinculos.length === 0
                          ? 'Nenhum vínculo cadastrado. Adicione o primeiro acima.'
                          : 'Nenhum resultado para os filtros aplicados.'}
                      </td>
                    </tr>
                  )}
                  {filtrados.map(v => {
                    const etapa = etapas.find(e => e.id === v.etapa_id);
                    return (
                      <tr key={v.id}>
                        <td className="mono text-sm" style={{ color: 'var(--text-muted)' }}>
                          {v.orcamento_itens?.codigo || '—'}
                        </td>
                        <td>{v.orcamento_itens?.nome || <span className="text-faint">Item removido</span>}</td>
                        <td>
                          {etapa ? (
                            <span>
                              {' '.repeat((etapa.nivel || 0) * 2)}
                              {etapa.isGroup && <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>▸</span>}
                              {etapa.etapa}
                            </span>
                          ) : (
                            <span className="text-faint">Tarefa removida ({v.etapa_id})</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
                          {etapa ? (etapa.isGroup ? 'Grupo' : `N${etapa.nivel || 0}`) : '—'}
                        </td>
                        <td className="mono" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {formatBRL(v.orcamento_itens?.valor_total || 0)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            className="icon-btn"
                            title="Remover vínculo"
                            onClick={() => handleRemove(v.id)}
                            style={{ color: 'var(--danger)' }}
                          >
                            <Icon name="trash" size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                {filtrados.length > 0 && (
                  <tfoot>
                    <tr style={{ fontWeight: 600 }}>
                      <td colSpan={4} style={{ textAlign: 'right', fontSize: 13 }}>Total vinculado</td>
                      <td className="mono" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {formatBRL(totalVinculado)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* ── Resumo por tarefa ─────────────────────────────────────────────── */}
          {vinculos.length > 0 && (
            <ResumoVinculos vinculos={vinculos} etapas={etapas} />
          )}
        </>
      )}
    </>
  );
};

// ─── ResumoVinculos — mostra o valor total vinculado por tarefa do cronograma ─
const ResumoVinculos = ({ vinculos, etapas }) => {
  // Agrupa por etapa_id
  const porEtapa = {};
  vinculos.forEach(v => {
    if (!porEtapa[v.etapa_id]) porEtapa[v.etapa_id] = { itens: [], total: 0 };
    porEtapa[v.etapa_id].itens.push(v);
    porEtapa[v.etapa_id].total += v.orcamento_itens?.valor_total || 0;
  });

  const etapasComVinculo = etapas.filter(e => porEtapa[e.id]);
  if (etapasComVinculo.length === 0) return null;

  return (
    <div className="card" style={{ marginTop: 'var(--gap)' }}>
      <div className="card-header">
        <div className="card-title">Resumo por tarefa</div>
        <div className="card-subtitle">Valor total recebido do orçamento por tarefa vinculada</div>
      </div>
      <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Tarefa</th>
              <th style={{ textAlign: 'center', width: 80 }}>Itens</th>
              <th style={{ textAlign: 'right', width: 150 }}>Valor Vinculado</th>
            </tr>
          </thead>
          <tbody>
            {etapasComVinculo.map(e => (
              <tr key={e.id}>
                <td>
                  {' '.repeat((e.nivel || 0) * 2)}
                  {e.isGroup && <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>▸</span>}
                  {e.etapa}
                </td>
                <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
                  {porEtapa[e.id].itens.length}
                </td>
                <td className="mono" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                  {formatBRL(porEtapa[e.id].total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export { OrcamentoCronogramaScreen };
