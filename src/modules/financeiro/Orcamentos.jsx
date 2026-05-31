import React from 'react';
import { Icon } from '../../components/Icons';
import { AppData } from '../../utils/data';
import { useToast } from '../../components/Modals';
import { StatusBadge } from '../../components/StatusBadge';
import { orcamentosService } from './orcamentos.service';

// Orçamentos — lista + detalhe com composição
const { brl: brlOR } = AppData;


// OrcamentoLista recebe orcamentos já buscados pelo screen pai
const OrcamentoLista = ({ onOpen, onNovo, orcamentos = [], loading = false }) => {
  const [filter, setFilter] = React.useState('todos');

  const filtered = filter === 'todos' ? orcamentos : orcamentos.filter(o => o.status === filter);
  const totalAprovado = orcamentos.filter(o => o.status === 'aprovado').reduce((a, b) => a + b.valor, 0);
  const totalPendente = orcamentos.filter(o => o.status === 'pendente').reduce((a, b) => a + b.valor, 0);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Orçamentos</h1>
          <div className="page-subtitle">
            {loading
              ? 'Carregando…'
              : `${orcamentos.length} orçamentos · ${brlOR(totalAprovado + totalPendente, { compact: true })} em valor total`}
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost"><Icon name="download" size={15} />Exportar</button>
          <button className="btn btn-primary" onClick={onNovo}><Icon name="plus" size={15} />Novo orçamento</button>
        </div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="kpi" style={{ padding: '14px 18px' }}>
          <div className="kpi-label">Aprovados</div>
          <div className="kpi-value num" style={{ fontSize: 22, marginTop: 6 }}>{brlOR(totalAprovado, { compact: true })}</div>
          <div className="kpi-foot" style={{ marginTop: 6 }}>
            <span className="kpi-foot-text">{orcamentos.filter(o => o.status === 'aprovado').length} contratos firmados</span>
          </div>
        </div>
        <div className="kpi" style={{ padding: '14px 18px' }}>
          <div className="kpi-label">Em aprovação</div>
          <div className="kpi-value num" style={{ fontSize: 22, marginTop: 6 }}>{brlOR(totalPendente, { compact: true })}</div>
          <div className="kpi-foot" style={{ marginTop: 6 }}>
            <span className="kpi-foot-text">{orcamentos.filter(o => o.status === 'pendente').length} aguardando cliente</span>
          </div>
        </div>
        <div className="kpi" style={{ padding: '14px 18px' }}>
          <div className="kpi-label">BDI médio</div>
          <div className="kpi-value num" style={{ fontSize: 22, marginTop: 6 }}>26,4<span className="unit">%</span></div>
          <div className="kpi-foot" style={{ marginTop: 6 }}>
            <span className="kpi-foot-text">Faixa típica: 24% – 28%</span>
          </div>
        </div>
        <div className="kpi" style={{ padding: '14px 18px' }}>
          <div className="kpi-label">Taxa de conversão (90d)</div>
          <div className="kpi-value num" style={{ fontSize: 22, marginTop: 6 }}>72<span className="unit">%</span></div>
          <div className="kpi-foot" style={{ marginTop: 6 }}>
            <span className="kpi-foot-text"><Icon name="arrow-up" size={11} stroke={2.5} />+8 p.p. vs trimestre anterior</span>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 'var(--gap)' }}>
        <div className="card-header">
          <div className="filters">
            {[
              { id: 'todos',    label: 'Todos',        count: orcamentos.length },
              { id: 'aprovado', label: 'Aprovados',    count: orcamentos.filter(o => o.status === 'aprovado').length },
              { id: 'pendente', label: 'Em aprovação', count: orcamentos.filter(o => o.status === 'pendente').length },
              { id: 'rascunho', label: 'Rascunhos',    count: orcamentos.filter(o => o.status === 'rascunho').length },
              { id: 'rejeitado',label: 'Rejeitados',   count: orcamentos.filter(o => o.status === 'rejeitado').length },
            ].map(f => (
              <button key={f.id} className={'chip' + (filter === f.id ? ' active' : '')} onClick={() => setFilter(f.id)}>
                {f.label} <span style={{ color: 'var(--text-faint)' }}>·</span> {f.count}
              </button>
            ))}
          </div>
          <div className="card-actions">
            <input className="input input-search" placeholder="Buscar orçamento…" style={{ minWidth: 220 }} />
          </div>
        </div>
        <div className="card-body flush">
          <table className="tbl">
            <thead>
              <tr>
                <th>Código</th>
                <th>Obra / Cliente</th>
                <th className="center">Versão</th>
                <th className="right">Valor</th>
                <th className="right">BDI</th>
                <th>Status</th>
                <th>Data</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} style={{ pointerEvents: 'none' }}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j}><div className="skeleton" style={{ height: 14 }} /></td>
                    ))}
                  </tr>
                ))
              ) : (
                filtered.map((o) => (
                  <tr key={o.id} onClick={() => onOpen(o)}>
                    <td className="strong mono">{o.id}</td>
                    <td>
                      <div className="strong">{o.obra}</div>
                      <div className="text-xs text-muted">{o.cliente}</div>
                    </td>
                    <td className="center mono text-muted">{o.versao}</td>
                    <td className="right strong num">{brlOR(o.valor, { compact: true })}</td>
                    <td className="right mono num">{Number(o.bdi).toFixed(1)}%</td>
                    <td><StatusBadge status={o.status} /></td>
                    <td className="mono text-sm text-muted">{o.data}</td>
                    <td>
                      <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={(e) => e.stopPropagation()}>
                        <Icon name="dots" size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

const OrcamentoDetalhe = ({ orcamento, onBack, onDelete, onCriarRevisao }) => {
  const toast         = useToast();
  const [items, setItems]           = React.useState([]);
  const [dirty, setDirty]           = React.useState(false);
  const [saving, setSaving]         = React.useState(false);
  const [collapsed, setCollapsed]   = React.useState(new Set());
  const [confirmDelete, setConfirm] = React.useState(false);
  const [deleting, setDeleting]     = React.useState(false);
  const [revisando, setRevisando]   = React.useState(false);

  React.useEffect(() => {
    orcamentosService.itens.listar(orcamento.id).then(({ data, error }) => {
      if (!error && data) setItems(data);
    });
  }, [orcamento.id]);

  // ── Utilitários de hierarquia ──────────────────────────────────────────────
  const getNivel = (codigo) => (codigo.match(/\./g) || []).length;

  const isParent = (codigo, list) =>
    list.some(it => it.codigo !== codigo && it.codigo.startsWith(codigo + '.'));

  // Calcula totais bottom-up: folha = qty × unit; grupo = soma dos filhos diretos
  const calcTotals = (list) => {
    const map = {};
    [...list]
      .sort((a, b) => getNivel(b.codigo) - getNivel(a.codigo))
      .forEach(it => {
        if (isParent(it.codigo, list)) {
          const children = list.filter(ch =>
            ch.codigo.startsWith(it.codigo + '.') &&
            getNivel(ch.codigo) === getNivel(it.codigo) + 1
          );
          map[it.codigo] = children.reduce((s, ch) => s + (map[ch.codigo] ?? 0), 0);
        } else {
          map[it.codigo] = (Number(it.quantidade) || 0) * (Number(it.valor_unitario) || 0);
        }
      });
    return list.map(it => ({ ...it, valor_total: map[it.codigo] ?? it.valor_total ?? 0 }));
  };

  const withTotals = calcTotals(items);

  // Próximo código de mesmo nível (irmão seguinte)
  const nextCode = (refCodigo, list) => {
    const parts  = refCodigo.split('.');
    const parent = parts.slice(0, -1).join('.');
    const nivel  = getNivel(refCodigo);
    const siblings = list
      .filter(it =>
        getNivel(it.codigo) === nivel &&
        it.codigo.split('.').slice(0, -1).join('.') === parent
      )
      .map(it => parseInt(it.codigo.split('.').pop(), 10))
      .filter(n => !isNaN(n));
    const next   = siblings.length ? Math.max(...siblings) + 1 : 1;
    const prefix = parent ? parent + '.' : '';
    return prefix + String(next).padStart(2, '0');
  };

  // Linha visível se nenhum ancestral estiver colapsado
  const isVisible = (codigo) => {
    const parts = codigo.split('.');
    for (let i = 1; i < parts.length; i++) {
      if (collapsed.has(parts.slice(0, i).join('.'))) return false;
    }
    return true;
  };

  // ── Operações de linha ─────────────────────────────────────────────────────
  const editCell = (id, field, value) => {
    setItems(prev => prev.map(it =>
      it.id === id ? { ...it, [field]: value, _dirty: true } : it
    ));
    setDirty(true);
  };

  const makeNewRow = (codigo, ordem) => ({
    id: 'tmp-' + Math.random().toString(36).slice(2),
    orcamento_id: orcamento.id,
    codigo,
    nome: '',
    quantidade: 0,
    unidade: 'UN',
    valor_unitario: 0,
    valor_total: 0,
    ordem,
    _new: true,
  });

  const addBelow = (refCodigo) => {
    const ref = items.find(it => it.codigo === refCodigo);
    const idx = items.findIndex(it => it.codigo === refCodigo);
    const newRow = makeNewRow(nextCode(refCodigo, items), (ref?.ordem ?? 0) + 1);
    setItems(prev => { const n = [...prev]; n.splice(idx + 1, 0, newRow); return n; });
    setDirty(true);
  };

  const addAbove = (refCodigo) => {
    const ref = items.find(it => it.codigo === refCodigo);
    const idx = items.findIndex(it => it.codigo === refCodigo);
    const newRow = makeNewRow(nextCode(refCodigo, items), (ref?.ordem ?? 1) - 1);
    setItems(prev => { const n = [...prev]; n.splice(idx, 0, newRow); return n; });
    setDirty(true);
  };

  const removeRow = (codigo) => {
    setItems(prev => prev.filter(it =>
      it.codigo !== codigo && !it.codigo.startsWith(codigo + '.')
    ));
    setDirty(true);
  };

  const discardChanges = () => {
    orcamentosService.itens.listar(orcamento.id).then(({ data }) => {
      if (data) setItems(data);
    });
    setDirty(false);
  };

  // ── Salvar no DB ───────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    const toUpsert = items
      .filter(it => it._new || it._dirty)
      .map(({ _new, _dirty, ...rest }) => ({
        ...rest,
        id: typeof rest.id === 'string' && rest.id.startsWith('tmp-') ? undefined : rest.id,
      }));
    if (toUpsert.length) {
      const { error } = await orcamentosService.itens.upsert(toUpsert);
      if (error) {
        toast('Erro ao salvar: ' + error.message, { tone: 'error', icon: 'alert' });
        setSaving(false);
        return;
      }
    }
    // Atualiza valor total do cabeçalho do orçamento
    const grandTotal = withTotals
      .filter(it => getNivel(it.codigo) === 0)
      .reduce((s, it) => s + it.valor_total, 0);
    await orcamentosService.atualizar(orcamento.id, { valor: grandTotal });
    const { data } = await orcamentosService.itens.listar(orcamento.id);
    if (data) setItems(data);
    setSaving(false);
    setDirty(false);
    toast('Itens salvos com sucesso', { tone: 'success', icon: 'check' });
  };

  // ── Excluir / Revisão ──────────────────────────────────────────────────────
  const handleDeleteClick = async () => {
    if (!confirmDelete) {
      setConfirm(true);
      setTimeout(() => setConfirm(false), 5000);
      return;
    }
    setDeleting(true);
    await onDelete(orcamento.id);
  };

  const handleCriarRevisao = async () => {
    setRevisando(true);
    await onCriarRevisao(orcamento);
    setRevisando(false);
  };

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const grandTotal  = withTotals.filter(it => getNivel(it.codigo) === 0).reduce((s, it) => s + it.valor_total, 0);
  const bdiNum      = parseFloat(String(orcamento.bdi).replace(',', '.')) || 0;
  const totalDireto = bdiNum > 0 ? grandTotal / (1 + bdiNum / 100) : grandTotal;
  const totalBdi    = grandTotal - totalDireto;
  const bdiPct      = bdiNum > 0 ? bdiNum.toFixed(1) : '0.0';

  // Seções de nível 1 para Curva ABC
  const secoes = withTotals.filter(it => getNivel(it.codigo) === 1);
  const maxSecaoTotal = Math.max(...secoes.map(s => s.valor_total), 1);

  return (
    <>
      {/* Cabeçalho */}
      <div className="page-header" style={{ marginBottom: 12 }}>
        <div>
          <button className="btn btn-sm btn-ghost" onClick={onBack} style={{ marginBottom: 8 }}>
            <Icon name="chevron-left" size={13} />Orçamentos
          </button>
          <div className="row" style={{ gap: 10 }}>
            <h1 className="page-title">{orcamento.id}</h1>
            <StatusBadge status={orcamento.status} />
            <span className="badge neutral mono">{orcamento.versao}</span>
          </div>
          <div className="page-subtitle">{orcamento.obra} · {orcamento.cliente} · atualizado em {orcamento.data}</div>
        </div>
        <div className="page-actions">
          <button
            className={'btn ' + (confirmDelete ? 'btn-danger' : 'btn-ghost')}
            onClick={handleDeleteClick}
            disabled={deleting}
          >
            <Icon name="trash" size={15} />
            {deleting ? 'Excluindo…' : confirmDelete ? 'Confirmar exclusão' : 'Excluir'}
          </button>
          <button className="btn btn-ghost" onClick={handleCriarRevisao} disabled={revisando}>
            <Icon name="file" size={15} />
            {revisando ? 'Criando…' : 'Criar revisão'}
          </button>
          <button className="btn btn-ghost"><Icon name="download" size={15} />Exportar PDF</button>
          {orcamento.status === 'pendente' && (
            <button className="btn btn-primary"><Icon name="check" size={15} />Aprovar</button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="kpi" style={{ padding: '14px 18px' }}>
          <div className="kpi-label">Custo direto</div>
          <div className="kpi-value num" style={{ fontSize: 20, marginTop: 6 }}>{brlOR(totalDireto, { compact: true })}</div>
        </div>
        <div className="kpi" style={{ padding: '14px 18px' }}>
          <div className="kpi-label">BDI ({bdiPct}%)</div>
          <div className="kpi-value num" style={{ fontSize: 20, marginTop: 6 }}>{brlOR(totalBdi, { compact: true })}</div>
        </div>
        <div className="kpi" style={{ padding: '14px 18px' }}>
          <div className="kpi-label">Valor total</div>
          <div className="kpi-value num" style={{ fontSize: 20, marginTop: 6, color: 'var(--brand)' }}>{brlOR(grandTotal, { compact: true })}</div>
        </div>
        <div className="kpi" style={{ padding: '14px 18px' }}>
          <div className="kpi-label">Itens cadastrados</div>
          <div className="kpi-value num" style={{ fontSize: 20, marginTop: 6 }}>{items.filter(it => !isParent(it.codigo, items)).length}</div>
          <div className="kpi-foot" style={{ marginTop: 4 }}>
            <span className="kpi-foot-text">{items.length} total (incluindo grupos)</span>
          </div>
        </div>
      </div>

      {/* Composição + Curva ABC */}
      <div className="grid-cols-3-2" style={{ marginTop: 'var(--gap)' }}>
        {/* Tabela de itens */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-header">
            <div>
              <div className="card-title">Composição orçamentária</div>
              <div className="card-subtitle">
                {items.length === 0
                  ? 'Nenhum item. Use + abaixo para adicionar.'
                  : `${items.length} itens · clique para editar`}
              </div>
            </div>
            <div className="card-actions">
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  const newRow = makeNewRow('001', items.length);
                  setItems(prev => [...prev, newRow]);
                  setDirty(true);
                }}
              >
                <Icon name="plus" size={13} />Novo item
              </button>
            </div>
          </div>
          <div className="card-body flush" style={{ overflowX: 'auto' }}>
            <table className="orca-table">
              <thead>
                <tr>
                  <th style={{ width: 140 }}>Código</th>
                  <th>Nome</th>
                  <th className="right" style={{ width: 100 }}>Quant.</th>
                  <th style={{ width: 60 }}>Un.</th>
                  <th className="right" style={{ width: 110 }}>Valor Unit.</th>
                  <th className="right" style={{ width: 120 }}>Valor Total</th>
                  <th style={{ width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {withTotals
                  .filter(it => isVisible(it.codigo))
                  .map((it) => {
                    const nivel     = getNivel(it.codigo);
                    const hasKids   = isParent(it.codigo, items);
                    const isOpen    = !collapsed.has(it.codigo);
                    const indent    = nivel * 18;

                    return (
                      <tr
                        key={it.id}
                        className={`orca-row level-${nivel}${hasKids ? ' is-group' : ''}`}
                      >
                        {/* Código */}
                        <td style={{ paddingLeft: indent + 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {hasKids ? (
                              <button
                                className={'orca-toggle' + (isOpen ? ' open' : '')}
                                onClick={() => setCollapsed(prev => {
                                  const next = new Set(prev);
                                  next.has(it.codigo) ? next.delete(it.codigo) : next.add(it.codigo);
                                  return next;
                                })}
                              >
                                <Icon name="chevron-right" size={12} />
                              </button>
                            ) : (
                              <span style={{ width: 16, flexShrink: 0 }} />
                            )}
                            <input
                              className="orca-cell-input"
                              value={it.codigo}
                              onChange={e => editCell(it.id, 'codigo', e.target.value)}
                              style={{ width: 90, fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5 }}
                            />
                          </div>
                        </td>

                        {/* Nome */}
                        <td>
                          <input
                            className="orca-cell-input"
                            value={it.nome || ''}
                            placeholder={hasKids ? 'Nome do grupo…' : 'Nome do item…'}
                            onChange={e => editCell(it.id, 'nome', e.target.value)}
                          />
                        </td>

                        {/* Quantidade */}
                        <td className="right">
                          {!hasKids ? (
                            <input
                              className="orca-cell-input right"
                              type="number"
                              value={it.quantidade || ''}
                              placeholder="0"
                              onChange={e => editCell(it.id, 'quantidade', parseFloat(e.target.value) || 0)}
                            />
                          ) : <span className="text-muted" style={{ fontSize: 11 }}>—</span>}
                        </td>

                        {/* Unidade */}
                        <td>
                          {!hasKids ? (
                            <input
                              className="orca-cell-input"
                              value={it.unidade || ''}
                              placeholder="UN"
                              maxLength={8}
                              onChange={e => editCell(it.id, 'unidade', e.target.value.toUpperCase())}
                              style={{ width: 52, textTransform: 'uppercase' }}
                            />
                          ) : null}
                        </td>

                        {/* Valor Unitário */}
                        <td className="right">
                          {!hasKids ? (
                            <input
                              className="orca-cell-input right"
                              type="number"
                              value={it.valor_unitario || ''}
                              placeholder="0,00"
                              onChange={e => editCell(it.id, 'valor_unitario', parseFloat(e.target.value) || 0)}
                            />
                          ) : <span className="text-muted" style={{ fontSize: 11 }}>—</span>}
                        </td>

                        {/* Valor Total (calculado) */}
                        <td className="right mono" style={{ fontWeight: hasKids ? 600 : 500, color: nivel === 0 ? 'var(--brand)' : 'inherit' }}>
                          {brlOR(it.valor_total, { compact: true })}
                        </td>

                        {/* Ações */}
                        <td>
                          <div className="orca-row-actions">
                            <button
                              className="orca-row-btn"
                              title="Inserir acima"
                              onClick={() => addAbove(it.codigo)}
                            >↑+</button>
                            <button
                              className="orca-row-btn"
                              title="Inserir abaixo"
                              onClick={() => addBelow(it.codigo)}
                            >↓+</button>
                            <button
                              className="orca-row-btn danger"
                              title="Remover linha"
                              onClick={() => removeRow(it.codigo)}
                            >×</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)' }}>
                      Nenhum item cadastrado. Clique em "Novo item" para começar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Barra de salvar sticky */}
            {dirty && (
              <div className="orca-save-bar">
                <button className="btn btn-ghost" onClick={discardChanges}>Descartar</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                  <Icon name="check" size={14} />
                  {saving ? 'Salvando…' : 'Salvar alterações'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Painéis laterais */}
        <div className="stack">
          {/* Curva ABC por seção */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Curva ABC — Seções</div>
            </div>
            <div className="card-body">
              <div className="stack" style={{ gap: 11 }}>
                {secoes.length === 0 && (
                  <div className="text-muted" style={{ fontSize: 13 }}>Adicione itens para ver a Curva ABC.</div>
                )}
                {secoes
                  .sort((a, b) => b.valor_total - a.valor_total)
                  .slice(0, 8)
                  .map((it, i) => {
                    const pct = grandTotal > 0 ? (it.valor_total / grandTotal * 100) : 0;
                    return (
                      <div key={i}>
                        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                          <span className="text-sm" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                            <span className="mono text-muted" style={{ marginRight: 6 }}>{it.codigo}</span>
                            {it.nome || '—'}
                          </span>
                          <span className="mono num fw-600 text-sm">{pct.toFixed(1)}%</span>
                        </div>
                        <div className="progress" style={{ height: 5 }}>
                          <span style={{ width: (it.valor_total / maxSecaoTotal * 100) + '%' }}></span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>

          {/* Composição do BDI */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Composição do BDI</div>
            </div>
            <div className="card-body">
              <div className="stack" style={{ gap: 9, fontSize: 13 }}>
                {[
                  { label: 'Administração central',     value: '4,2%' },
                  { label: 'Despesas financeiras',      value: '1,1%' },
                  { label: 'Seguros e garantias',       value: '0,8%' },
                  { label: 'Risco do empreendimento',   value: '2,0%' },
                  { label: 'Lucro bruto',               value: '8,0%' },
                  { label: 'Tributos (PIS/COFINS/ISS)', value: '6,4%' },
                  { label: 'CPRB',                      value: '4,5%' },
                ].map((b, i) => (
                  <div key={i} className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="text-soft">{b.label}</span>
                    <span className="mono num fw-600">{b.value}</span>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 9, marginTop: 4 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600 }}>Total BDI</span>
                    <span className="mono num" style={{ fontWeight: 700, color: 'var(--brand)' }}>{bdiPct}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

// Cache module-level: sobrevive a desmontagens do componente, resetado no F5
let _orcamentosCache = null;

// OrcamentosScreen gerencia o estado da lista e os handlers de ação
const OrcamentosScreen = ({ onNovoOrcamento, obras = [], refreshKey = 0, user }) => {
  const toast = useToast();
  const [selected, setSelected]     = React.useState(null);
  const [orcamentos, setOrcamentos] = React.useState(_orcamentosCache ?? []);
  const [loading, setLoading]       = React.useState(_orcamentosCache === null);

  const refetch = React.useCallback((invalidate = false) => {
    if (invalidate) _orcamentosCache = null;
    // Só exibe skeleton quando não há cache (primeira visita ou após mutação)
    if (_orcamentosCache === null) setLoading(true);
    orcamentosService.listar().then(({ data, error }) => {
      if (!error && data && data.length > 0) {
        const enriched = data.map(o => ({
          ...o,
          obra: obras.find(ob => ob.id === o.obra_id)?.nome || o.obra_id,
        }));
        _orcamentosCache = enriched;
        setOrcamentos(enriched);
      } else {
        // Fallback para mock quando tabela vazia ou sem autenticação (devMode)
        setOrcamentos(AppData.orcamentosLista);
      }
      setLoading(false);
    });
  }, [obras]);

  const prevRefreshKeyRef = React.useRef(refreshKey);
  React.useEffect(() => {
    const isCreation = refreshKey !== prevRefreshKeyRef.current;
    prevRefreshKeyRef.current = refreshKey;
    // Após criação invalida o cache; demais visitas fazem refresh em background
    refetch(isCreation);
  }, [refreshKey, refetch]);

  const handleDelete = async (id) => {
    const { error } = await orcamentosService.excluir(id);
    if (error) {
      toast('Erro ao excluir: ' + error.message, { tone: 'error', icon: 'alert' });
      return;
    }
    toast('Orçamento excluído', { tone: 'success', icon: 'check' });
    setSelected(null);
    refetch(true);
  };

  const handleCriarRevisao = async (orcamento) => {
    if (!orcamento.obra_id) {
      toast('Orçamento sem obra vinculada — não é possível criar revisão', { tone: 'error', icon: 'alert' });
      return;
    }
    const versaoNum = parseInt((orcamento.versao || 'v1').replace('v', ''), 10);
    const novaVersao = 'v' + (versaoNum + 1);
    const novoId = 'OR-' + String(Date.now()).slice(-4);

    const { error } = await orcamentosService.criar({
      id:      novoId,
      obra_id: orcamento.obra_id,
      cliente: orcamento.cliente,
      versao:  novaVersao,
      bdi:     orcamento.bdi,
      status:  'rascunho',
      valor:   orcamento.valor,
      data:    new Date().toISOString().slice(0, 10),
    }, user?.id);

    if (error) {
      toast('Erro ao criar revisão: ' + error.message, { tone: 'error', icon: 'alert' });
      return;
    }

    // Copia os itens do orçamento original para a nova revisão
    const { data: itens } = await orcamentosService.itens.listar(orcamento.id);
    if (itens && itens.length > 0) {
      const novosItens = itens.map(({ id, created_at, orcamento_id, ...rest }) => ({
        ...rest,
        orcamento_id: novoId,
      }));
      await orcamentosService.itens.criar(novosItens);
    }

    toast('Revisão ' + novaVersao + ' criada', { tone: 'success', icon: 'check' });
    refetch(true);
    setSelected({ ...orcamento, id: novoId, versao: novaVersao, status: 'rascunho', data: new Date().toLocaleDateString('pt-BR') });
  };

  if (selected) {
    return (
      <OrcamentoDetalhe
        orcamento={selected}
        onBack={() => setSelected(null)}
        onDelete={handleDelete}
        onCriarRevisao={handleCriarRevisao}
      />
    );
  }

  return (
    <OrcamentoLista
      onOpen={setSelected}
      onNovo={onNovoOrcamento}
      orcamentos={orcamentos}
      loading={loading}
    />
  );
};

export { OrcamentosScreen, OrcamentoDetalhe, OrcamentoLista };
