import React from 'react';
import { Icon } from '../../components/Icons';
import { useToast, Modal } from '../../components/Modals';
import { supabase } from '../../services/supabase';
import { vinculoService } from './vinculoService';
import { formatBRL } from '../../utils/formatters';
import { migrateEtapas, recomputeHierarchy, inferParentIds } from '../cronograma/ganttUtils';

const itemValor = (it) =>
  it?.valor_total || (it?.quantidade || 0) * (it?.valor_unitario || 0);

// ─── AutocompleteInput ────────────────────────────────────────────────────────
const AutocompleteInput = ({ value, onChange, placeholder, suggestions, style }) => {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  const filtered = React.useMemo(() => {
    if (!value) return suggestions.slice(0, 8);
    const q = value.toLowerCase();
    return suggestions.filter(s => s.toLowerCase().includes(q)).slice(0, 8);
  }, [value, suggestions]);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', ...style }}>
      <input
        className="input"
        placeholder={placeholder}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        style={{ width: '100%' }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
          maxHeight: 200, overflowY: 'auto', marginTop: 2,
        }}>
          {filtered.map(s => (
            <div
              key={s}
              onMouseDown={(e) => { e.preventDefault(); onChange(s); setOpen(false); }}
              style={{
                padding: '7px 12px', fontSize: 13, cursor: 'pointer',
                borderBottom: '1px solid var(--border-subtle)',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-muted)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── OrcamentoCronogramaScreen ────────────────────────────────────────────────
const OrcamentoCronogramaScreen = ({ obras = [], user }) => {
  const toast = useToast();

  const [obraSel,    setObraSel]    = React.useState('');
  const [vinculos,   setVinculos]   = React.useState([]);
  const [itens,      setItens]      = React.useState([]);
  const [etapas,     setEtapas]     = React.useState([]);
  const [loading,    setLoading]    = React.useState(false);
  const [saving,     setSaving]     = React.useState(false);

  const [filtroItem,  setFiltroItem]  = React.useState('');
  const [filtroEtapa, setFiltroEtapa] = React.useState('');

  const [selItens, setSelItens] = React.useState([]);
  const [selEtapa, setSelEtapa] = React.useState('');
  const [buscaItem, setBuscaItem] = React.useState('');

  // Estado do modal de edição de vínculos por tarefa
  const [editandoEtapaId,  setEditandoEtapaId]  = React.useState(null);
  const [buscaModalItem,   setBuscaModalItem]    = React.useState('');

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
      setEtapas(recomputeHierarchy(inferParentIds(migrateEtapas(cronRes.data?.etapas || []))));
      setLoading(false);
    });
  }, [obraSel]);

  const linkedEtapaIds = React.useMemo(
    () => new Set(vinculos.map(v => v.etapa_id)),
    [vinculos]
  );

  const toggleItem = (id) => {
    const sid = String(id);
    setSelItens(prev =>
      prev.includes(sid) ? prev.filter(x => x !== sid) : [...prev, sid]
    );
  };

  const itensFiltradosBusca = React.useMemo(() => {
    if (!buscaItem) return itens;
    const q = buscaItem.toLowerCase();
    return itens.filter(it =>
      it.nome?.toLowerCase().includes(q) || it.codigo?.toLowerCase().includes(q)
    );
  }, [itens, buscaItem]);

  // ── Adicionar vínculos (tela principal) ───────────────────────────────────
  const handleAdd = async () => {
    if (!selItens.length || !selEtapa) return;

    if (grupoIds.has(selEtapa)) {
      toast('Tarefas-resumo não podem receber vínculos. Selecione uma tarefa executável.', { tone: 'warning', icon: 'alert-triangle' });
      return;
    }

    setSaving(true);
    let criados = 0, erros = 0;

    for (const itemId of selItens) {
      const numId = Number(itemId);
      if (vinculos.some(v => v.orcamento_item_id === numId && v.etapa_id === selEtapa)) continue;
      const { error } = await vinculoService.criar({
        obra_id: obraSel, orcamento_item_id: numId, etapa_id: selEtapa,
      }, user?.id);
      if (error) erros++;
      else criados++;
    }

    if (erros > 0) toast(`${erros} vínculo(s) falharam ao salvar`, { tone: 'danger', icon: 'alert-triangle' });
    if (criados > 0) {
      const { data } = await vinculoService.listarPorObra(obraSel);
      setVinculos(data || []);
      setSelItens([]); setSelEtapa(''); setBuscaItem('');
      toast(
        criados === 1 ? 'Vínculo criado com sucesso' : `${criados} vínculos criados`,
        { tone: 'success', icon: 'check' }
      );
    }
    setSaving(false);
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

  // ── Adicionar vínculo via modal "Editar Itens Associados" ─────────────────
  const handleAddVinculoModal = async (itemId) => {
    if (!editandoEtapaId) return;
    if (grupoIds.has(editandoEtapaId)) {
      toast('Tarefas-resumo não podem receber vínculos. Selecione uma tarefa executável.', { tone: 'warning', icon: 'alert-triangle' });
      return;
    }
    const numId = Number(itemId);
    if (vinculos.some(v => v.orcamento_item_id === numId && v.etapa_id === editandoEtapaId)) return;
    setSaving(true);
    const { error } = await vinculoService.criar({
      obra_id: obraSel, orcamento_item_id: numId, etapa_id: editandoEtapaId,
    }, user?.id);
    if (error) {
      toast('Erro ao criar vínculo: ' + error.message, { tone: 'danger', icon: 'alert-triangle' });
    } else {
      const { data } = await vinculoService.listarPorObra(obraSel);
      setVinculos(data || []);
      toast('Item associado com sucesso', { tone: 'success', icon: 'check' });
    }
    setSaving(false);
  };

  // ── Filtros da tabela ──────────────────────────────────────────────────────
  const filtrados = vinculos.filter(v => {
    const itemNome  = (v.orcamento_itens?.nome || '').toLowerCase();
    const etapaNome = (etapas.find(e => e.id === v.etapa_id)?.etapa || '').toLowerCase();
    return (
      (!filtroItem  || itemNome.includes(filtroItem.toLowerCase()))  &&
      (!filtroEtapa || etapaNome.includes(filtroEtapa.toLowerCase()))
    );
  });

  const totalVinculado = filtrados.reduce((s, v) => s + itemValor(v.orcamento_itens), 0);

  const indentEtapa = (e) =>
    ' '.repeat((e.nivel || 0) * 3) + e.etapa;

  // Detecção de grupos por 3 sinais independentes — cobre todos os formatos de dados:
  // Sinal 1: parentId (a tarefa aparece como pai de outra)
  // Sinal 2: campo isGroup salvo no banco
  // Sinal 3: nivel (próxima tarefa na lista tem nivel maior → atual é grupo)
  const grupoIds = React.useMemo(() => {
    const ids = new Set();

    // DEBUG TEMPORÁRIO
    if (etapas.length > 0) {
      console.log('[DEBUG] total etapas:', etapas.length);
      etapas.forEach((e, i) => {
        console.log(`[DEBUG #${i}] "${e.etapa}" | id=${e.id} (${typeof e.id}) | nivel=${e.nivel} | parentId=${e.parentId} (${typeof e.parentId}) | isGroup=${e.isGroup}`);
      });
    }

    etapas.forEach(e => { if (e.parentId) ids.add(e.parentId); });
    etapas.forEach(e => { if (e.isGroup) ids.add(e.id); });
    etapas.forEach((e, i) => {
      if (i < etapas.length - 1 && (etapas[i + 1].nivel || 0) > (e.nivel || 0)) {
        ids.add(e.id);
      }
    });

    if (etapas.length > 0) {
      console.log('[DEBUG] grupoIds:', [...ids]);
    }

    return ids;
  }, [etapas]);

  // Etapas disponíveis: exclui já vinculadas E qualquer tarefa detectada como grupo
  const etapasDisponiveis = etapas.filter(et =>
    !linkedEtapaIds.has(et.id) && !grupoIds.has(et.id)
  );

  // Sugestões para autocomplete dos filtros
  const sugestoesItem = React.useMemo(
    () => [...new Set(vinculos.map(v => v.orcamento_itens?.nome).filter(Boolean))].sort(),
    [vinculos]
  );
  const sugestoesEtapa = React.useMemo(
    () => [...new Set(vinculos.map(v => etapas.find(e => e.id === v.etapa_id)?.etapa).filter(Boolean))].sort(),
    [vinculos, etapas]
  );

  // ── Dados do modal de edição ───────────────────────────────────────────────
  const editandoEtapa     = etapas.find(e => e.id === editandoEtapaId);
  const vinculosEtapa     = vinculos.filter(v => v.etapa_id === editandoEtapaId);
  const vinculadosItemIds = new Set(vinculosEtapa.map(v => v.orcamento_item_id));
  const itensNaoVinculados = itens.filter(it => {
    if (vinculadosItemIds.has(it.id)) return false;
    if (!buscaModalItem) return true;
    const q = buscaModalItem.toLowerCase();
    return it.nome?.toLowerCase().includes(q) || it.codigo?.toLowerCase().includes(q);
  });

  const fecharModal = () => { setEditandoEtapaId(null); setBuscaModalItem(''); };

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
                Selecione um ou mais itens do orçamento e a tarefa do cronograma que receberá os pesos
              </div>
            </div>
            <div className="card-body">
              {itens.length === 0 && (
                <div className="text-muted" style={{ fontSize: 13, marginBottom: 12 }}>
                  Nenhum item de orçamento encontrado para esta obra. Crie um orçamento primeiro.
                </div>
              )}
              {etapasDisponiveis.length === 0 && etapas.length === 0 && (
                <div className="text-muted" style={{ fontSize: 13, marginBottom: 12 }}>
                  Nenhuma tarefa de cronograma encontrada para esta obra. Crie um cronograma primeiro.
                </div>
              )}
              {etapasDisponiveis.length === 0 && etapas.length > 0 && (
                <div className="text-muted" style={{ fontSize: 13, marginBottom: 12, padding: '8px 12px', background: 'var(--surface-muted)', borderRadius: 6 }}>
                  Todas as tarefas executáveis já foram vinculadas.
                </div>
              )}

              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                {/* Multi-select de itens de orçamento */}
                <div style={{ flex: '1 1 300px', minWidth: 240 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    Itens do Orçamento
                    {selItens.length > 0 && (
                      <span style={{ marginLeft: 6, color: 'var(--brand)', fontWeight: 600 }}>
                        ({selItens.length} selecionado{selItens.length > 1 ? 's' : ''})
                      </span>
                    )}
                  </label>
                  <input
                    className="input"
                    placeholder="Buscar item…"
                    value={buscaItem}
                    onChange={e => setBuscaItem(e.target.value)}
                    style={{ width: '100%', marginBottom: 6 }}
                  />
                  <div style={{
                    maxHeight: 220,
                    overflowY: 'auto',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    background: 'var(--surface)',
                  }}>
                    {itensFiltradosBusca.length === 0 && (
                      <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--text-faint)' }}>
                        Nenhum item encontrado.
                      </div>
                    )}
                    {itensFiltradosBusca.map(it => {
                      const val = itemValor(it);
                      const sid = String(it.id);
                      const checked = selItens.includes(sid);
                      return (
                        <label
                          key={it.id}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 10,
                            padding: '8px 12px',
                            cursor: 'pointer',
                            borderBottom: '1px solid var(--border-subtle)',
                            background: checked ? 'var(--brand-tint)' : 'transparent',
                            transition: 'background 0.1s',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleItem(it.id)}
                            style={{ marginTop: 2, accentColor: 'var(--brand)', flexShrink: 0 }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: checked ? 600 : 400 }}>
                              <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>{it.codigo}</span>
                              {it.nome}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                              {formatBRL(val)}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  {selItens.length > 0 && (
                    <button
                      className="btn btn-ghost"
                      style={{ marginTop: 6, fontSize: 12 }}
                      onClick={() => setSelItens([])}
                    >
                      Limpar seleção
                    </button>
                  )}
                </div>

                {/* Select de tarefa do cronograma */}
                <div style={{ flex: '1 1 280px', minWidth: 200 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    Tarefa do Cronograma
                    <span style={{ marginLeft: 6, color: 'var(--text-faint)', fontWeight: 400, fontSize: 11 }}>
                      somente tarefas executáveis
                    </span>
                  </label>
                  <select
                    className="input"
                    value={selEtapa}
                    onChange={e => setSelEtapa(e.target.value)}
                    style={{ width: '100%' }}
                    disabled={etapasDisponiveis.length === 0}
                  >
                    <option value="">— Selecione uma tarefa —</option>
                    {etapasDisponiveis.map(et => (
                      <option key={et.id} value={et.id}>{indentEtapa(et)}</option>
                    ))}
                  </select>

                  {selItens.length > 0 && selEtapa && (() => {
                    const etapa = etapas.find(e => e.id === selEtapa);
                    const totalSel = selItens.reduce((s, sid) => {
                      const it = itens.find(i => String(i.id) === sid);
                      return s + (it ? itemValor(it) : 0);
                    }, 0);
                    return (
                      <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--brand-tint)', borderRadius: 8, fontSize: 13, color: 'var(--brand)' }}>
                        <strong>{selItens.length} item{selItens.length > 1 ? 's' : ''}</strong>
                        <span style={{ margin: '0 8px', opacity: 0.6 }}>→</span>
                        <strong>{etapa?.etapa}</strong>
                        <div style={{ marginTop: 4, opacity: 0.8 }}>
                          Total: {formatBRL(totalSel)}
                        </div>
                      </div>
                    );
                  })()}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                    <button
                      className="btn btn-primary"
                      onClick={handleAdd}
                      disabled={!selItens.length || !selEtapa || saving}
                    >
                      <Icon name="plus" size={15} />
                      {saving
                        ? 'Salvando…'
                        : selItens.length > 0
                          ? `Adicionar (${selItens.length} item${selItens.length > 1 ? 's' : ''})`
                          : 'Adicionar'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Tabela de vínculos ────────────────────────────────────────────── */}
          <div className="card" style={{ marginTop: 'var(--gap)' }}>
            <div className="card-header" style={{ overflow: 'visible' }}>
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
              <div className="card-actions" style={{ overflow: 'visible' }}>
                <AutocompleteInput
                  value={filtroItem}
                  onChange={setFiltroItem}
                  placeholder="Filtrar por item…"
                  suggestions={sugestoesItem}
                  style={{ width: 190 }}
                />
                <AutocompleteInput
                  value={filtroEtapa}
                  onChange={setFiltroEtapa}
                  placeholder="Filtrar por tarefa…"
                  suggestions={sugestoesEtapa}
                  style={{ width: 190 }}
                />
                {(filtroItem || filtroEtapa) && (
                  <button className="btn btn-ghost" onClick={() => { setFiltroItem(''); setFiltroEtapa(''); }}>
                    <Icon name="x" size={14} />Limpar
                  </button>
                )}
              </div>
            </div>

            {/* Corpo com altura fixa e scroll interno */}
            <div style={{ overflowX: 'auto' }}>
              <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 90, position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 2 }}>Código</th>
                      <th style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 2 }}>Item do Orçamento</th>
                      <th style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 2 }}>Tarefa do Cronograma</th>
                      <th style={{ width: 60, textAlign: 'center', position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 2 }}>Nível</th>
                      <th style={{ textAlign: 'right', width: 140, position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 2 }}>Valor (R$)</th>
                      <th style={{ width: 48, position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 2 }}></th>
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
                                {' '.repeat((etapa.nivel || 0) * 2)}
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
                            {formatBRL(itemValor(v.orcamento_itens))}
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
          </div>

          {/* ── Resumo por tarefa ─────────────────────────────────────────────── */}
          {vinculos.length > 0 && (
            <ResumoVinculos
              vinculos={vinculos}
              etapas={etapas}
              onEditarVinculos={setEditandoEtapaId}
            />
          )}
        </>
      )}

      {/* ── Modal: Editar Itens Associados ─────────────────────────────────── */}
      {editandoEtapaId && editandoEtapa && (
        <Modal
          title={`Editar Itens Associados — ${editandoEtapa.etapa}`}
          onClose={fecharModal}
          footer={
            <button className="btn btn-ghost" onClick={fecharModal}>Fechar</button>
          }
        >
          {/* Itens atualmente vinculados */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Itens vinculados ({vinculosEtapa.length})
            </div>
            {vinculosEtapa.length === 0 ? (
              <div style={{ color: 'var(--text-faint)', fontSize: 13, padding: '8px 0' }}>
                Nenhum item associado a esta tarefa.
              </div>
            ) : (
              <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                {vinculosEtapa.map(v => (
                  <div key={v.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)',
                  }}>
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)', flexShrink: 0, minWidth: 64, fontFamily: 'var(--font-mono)' }}>
                      {v.orcamento_itens?.codigo || '—'}
                    </span>
                    <span style={{ flex: 1, fontSize: 13 }}>
                      {v.orcamento_itens?.nome || <span style={{ color: 'var(--text-faint)' }}>Item removido</span>}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-soft)', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
                      {formatBRL(itemValor(v.orcamento_itens))}
                    </span>
                    <button
                      className="icon-btn"
                      title="Remover vínculo"
                      onClick={() => handleRemove(v.id)}
                      style={{ color: 'var(--danger)', flexShrink: 0 }}
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Adicionar novos itens */}
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Adicionar itens
            </div>
            <input
              className="input"
              placeholder="Buscar item do orçamento…"
              value={buscaModalItem}
              onChange={e => setBuscaModalItem(e.target.value)}
              style={{ width: '100%', marginBottom: 8 }}
            />
            <div style={{ border: '1px solid var(--border)', borderRadius: 6, maxHeight: 260, overflowY: 'auto' }}>
              {itensNaoVinculados.length === 0 ? (
                <div style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-faint)', textAlign: 'center' }}>
                  {buscaModalItem ? 'Nenhum item encontrado para essa busca.' : 'Todos os itens já estão vinculados a esta tarefa.'}
                </div>
              ) : (
                itensNaoVinculados.map(it => (
                  <div key={it.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)',
                  }}>
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)', flexShrink: 0, minWidth: 64, fontFamily: 'var(--font-mono)' }}>
                      {it.codigo}
                    </span>
                    <span style={{ flex: 1, fontSize: 13 }}>{it.nome}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-soft)', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
                      {formatBRL(itemValor(it))}
                    </span>
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 11.5, padding: '2px 10px', height: 26, flexShrink: 0, gap: 4 }}
                      onClick={() => handleAddVinculoModal(it.id)}
                      disabled={saving}
                    >
                      <Icon name="plus" size={12} />Vincular
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};

// ─── ResumoVinculos ───────────────────────────────────────────────────────────
const ResumoVinculos = ({ vinculos, etapas, onEditarVinculos }) => {
  const porEtapa = {};
  vinculos.forEach(v => {
    if (!porEtapa[v.etapa_id]) porEtapa[v.etapa_id] = { itens: [], total: 0 };
    porEtapa[v.etapa_id].itens.push(v);
    porEtapa[v.etapa_id].total += itemValor(v.orcamento_itens);
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
              <th style={{ textAlign: 'center', width: 70 }}>Itens</th>
              <th style={{ textAlign: 'right', width: 150 }}>Valor Vinculado</th>
              <th style={{ width: 140 }}></th>
            </tr>
          </thead>
          <tbody>
            {etapasComVinculo.map(e => (
              <tr key={e.id}>
                <td>
                  {' '.repeat((e.nivel || 0) * 2)}
                  {e.isGroup && <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>▸</span>}
                  {e.etapa}
                </td>
                <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
                  {porEtapa[e.id].itens.length}
                </td>
                <td className="mono" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                  {formatBRL(porEtapa[e.id].total)}
                </td>
                <td style={{ textAlign: 'right', paddingRight: 12 }}>
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 11.5, padding: '2px 10px', height: 26, gap: 4 }}
                    onClick={() => onEditarVinculos(e.id)}
                    title="Visualizar e editar itens associados a esta tarefa"
                  >
                    <Icon name="edit" size={12} />Editar Itens Associados
                  </button>
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
