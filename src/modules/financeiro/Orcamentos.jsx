import React from 'react';
import { Icon } from '../../components/Icons';
import { AppData } from '../../utils/data';
import { Modal } from '../../components/Modals';
import { StatusBadge } from '../../components/StatusBadge';
import { orcamentosService } from './orcamentos.service';

// Orçamentos — lista + detalhe com composição
const { brl: brlOR } = AppData;


const OrcamentoLista = ({ onOpen, onNovo, obras = [] }) => {
  const [orcamentos, setOrcamentos] = React.useState(AppData.orcamentosLista);
  const [filter, setFilter] = React.useState('todos');

  React.useEffect(() => {
    orcamentosService.listar().then(({ data, error }) => {
      if (!error && data && data.length > 0) {
        // Enriquece cada orçamento com o nome da obra para exibição na tabela
        const enriched = data.map(o => ({
          ...o,
          obra: obras.find(ob => ob.id === o.obra_id)?.nome || o.obra_id,
        }));
        setOrcamentos(enriched);
      }
    });
  }, []);

  const filtered = filter === 'todos' ? orcamentos : orcamentos.filter(o => o.status === filter);
  const totalAprovado = orcamentos.filter(o => o.status === 'aprovado').reduce((a, b) => a + b.valor, 0);
  const totalPendente = orcamentos.filter(o => o.status === 'pendente').reduce((a, b) => a + b.valor, 0);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Orçamentos</h1>
          <div className="page-subtitle">{orcamentos.length} orçamentos · {brlOR(totalAprovado + totalPendente, { compact: true })} em valor total</div>
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
              { id: 'todos', label: 'Todos', count: orcamentos.length },
              { id: 'aprovado', label: 'Aprovados', count: orcamentos.filter(o => o.status === 'aprovado').length },
              { id: 'pendente', label: 'Em aprovação', count: orcamentos.filter(o => o.status === 'pendente').length },
              { id: 'rascunho', label: 'Rascunhos', count: orcamentos.filter(o => o.status === 'rascunho').length },
              { id: 'rejeitado', label: 'Rejeitados', count: orcamentos.filter(o => o.status === 'rejeitado').length },
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
              {filtered.map((o) => (
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
                  <td><button className="icon-btn" style={{ width: 28, height: 28 }} onClick={(e) => e.stopPropagation()}><Icon name="dots" size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

const OrcamentoDetalhe = ({ orcamento, onBack }) => {
  const [rawItems, setRawItems] = React.useState(AppData.orcamentoItens);
  const [openGroups, setOpenGroups] = React.useState(['01', '02', '03']);

  React.useEffect(() => {
    orcamentosService.itens.listar(orcamento.id).then(({ data, error }) => {
      if (!error && data && data.length > 0) setRawItems(data);
    });
  }, [orcamento.id]);

  // Adapter: normaliza nomes de coluna do DB para os campos usados no JSX
  const items = rawItems.map(it => ({
    ...it,
    unit: it.unit_cost ?? it.unit ?? 0,
    bdi: it.is_bdi ?? it.bdi ?? false,
  }));

  const total = items.filter(i => i.nivel === 0).reduce((a, b) => a + b.total, 0);
  const totalDireto = items.filter(i => i.nivel === 0 && !i.bdi).reduce((a, b) => a + b.total, 0);
  const totalBdi = items.find(i => i.bdi)?.total || 0;
  const bdiPct = totalDireto > 0 ? (totalBdi / totalDireto * 100).toFixed(1) : '0.0';

  const toggle = (codigo) => {
    setOpenGroups(g => g.includes(codigo) ? g.filter(x => x !== codigo) : [...g, codigo]);
  };

  return (
    <>
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
          <button className="btn btn-ghost"><Icon name="download" size={15} />Exportar PDF</button>
          <button className="btn btn-ghost"><Icon name="edit" size={15} />Editar</button>
          {orcamento.status === 'pendente' && (
            <button className="btn btn-primary"><Icon name="check" size={15} />Aprovar</button>
          )}
        </div>
      </div>

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
          <div className="kpi-value num" style={{ fontSize: 20, marginTop: 6, color: 'var(--brand)' }}>{brlOR(total, { compact: true })}</div>
        </div>
        <div className="kpi" style={{ padding: '14px 18px' }}>
          <div className="kpi-label">Valor por m²</div>
          <div className="kpi-value num" style={{ fontSize: 20, marginTop: 6 }}>{brlOR(total / 18420, { compact: true }).replace('R$ ', 'R$ ')}</div>
          <div className="kpi-foot" style={{ marginTop: 4 }}>
            <span className="kpi-foot-text">Base: 18.420 m²</span>
          </div>
        </div>
      </div>

      <div className="grid-cols-3-2" style={{ marginTop: 'var(--gap)' }}>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Composição orçamentária</div>
              <div className="card-subtitle">Estrutura analítica por grupos e subitens</div>
            </div>
            <div className="card-actions">
              <button className="chip">SINAPI <Icon name="chevron-down" size={12} className="caret" /></button>
              <button className="btn btn-sm btn-ghost"><Icon name="download" size={13} />Excel</button>
            </div>
          </div>
          <div className="card-body flush">
            <div className="tree-row head">
              <div className="cell">Item</div>
              <div className="cell">Un.</div>
              <div className="cell right">Quant.</div>
              <div className="cell right">Unitário</div>
              <div className="cell right">Total</div>
              <div className="cell right">Peso</div>
            </div>
            {items.map((it, i) => {
              if (it.nivel === 1 && !openGroups.includes(it.codigo.split('.')[0])) return null;
              return (
                <div key={i} className={'tree-row level-' + it.nivel}>
                  <div className="cell" style={{ paddingLeft: it.nivel === 1 ? 36 : 12 }}>
                    {it.nivel === 0 && !it.bdi && (
                      <button className={'tree-toggle' + (openGroups.includes(it.codigo) ? ' open' : '')}
                        onClick={() => toggle(it.codigo)} style={{ verticalAlign: 'middle' }}>
                        <Icon name="chevron-right" size={14} />
                      </button>
                    )}
                    <span className="tree-code">{it.codigo}</span>
                    {it.item}
                  </div>
                  <div className="cell">{it.un}</div>
                  <div className="cell right mono num">{it.quant === 1 && it.nivel === 0 ? '—' : Number(it.quant).toLocaleString('pt-BR')}</div>
                  <div className="cell right mono num">{it.unit > 0 ? brlOR(it.unit) : '—'}</div>
                  <div className="cell right mono num" style={{ fontWeight: it.nivel === 0 ? 600 : 500 }}>{brlOR(it.total, { compact: true })}</div>
                  <div className="cell right mono num text-muted">{Number(it.peso).toFixed(1)}%</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-header">
              <div className="card-title">Curva ABC</div>
              <button className="icon-btn"><Icon name="dots" size={16} /></button>
            </div>
            <div className="card-body">
              <div className="stack" style={{ gap: 11 }}>
                {items.filter(i => i.nivel === 0 && !i.bdi).slice(0, 8).sort((a,b) => b.peso - a.peso).map((it, i) => (
                  <div key={i}>
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                      <span className="text-sm">
                        <span className="mono text-muted" style={{ marginRight: 6 }}>{it.codigo}</span>
                        {it.item}
                      </span>
                      <span className="mono num fw-600 text-sm">{Number(it.peso).toFixed(1)}%</span>
                    </div>
                    <div className="progress" style={{ height: 5 }}>
                      <span style={{ width: (it.peso / 22 * 100) + '%' }}></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">Composição do BDI</div>
            </div>
            <div className="card-body">
              <div className="stack" style={{ gap: 9, fontSize: 13 }}>
                {[
                  { label: 'Administração central', value: '4,2%' },
                  { label: 'Despesas financeiras', value: '1,1%' },
                  { label: 'Seguros e garantias', value: '0,8%' },
                  { label: 'Risco do empreendimento', value: '2,0%' },
                  { label: 'Lucro bruto', value: '8,0%' },
                  { label: 'Tributos (PIS/COFINS/ISS)', value: '6,4%' },
                  { label: 'CPRB', value: '4,5%' },
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

// Top-level Orçamentos screen with internal state
const OrcamentosScreen = ({ onNovoOrcamento, obras = [] }) => {
  const [selected, setSelected] = React.useState(null);
  if (selected) return <OrcamentoDetalhe orcamento={selected} onBack={() => setSelected(null)} />;
  return <OrcamentoLista onOpen={setSelected} onNovo={onNovoOrcamento} obras={obras} />;
};

export { OrcamentosScreen, OrcamentoDetalhe, OrcamentoLista };
