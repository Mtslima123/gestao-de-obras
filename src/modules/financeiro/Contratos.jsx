import React from 'react';
import { Icon } from '../../components/Icons';
import { AppData } from '../../utils/data';
import { Modal } from '../../components/Modals';

// Contratos — lista + detalhe com aditivos
const { brl: brlCT } = AppData;

const ContratosLista = ({ onOpen }) => {
  const D = AppData;
  const [filter, setFilter] = React.useState('todos');
  const filtered = filter === 'todos' ? D.contratos : D.contratos.filter(c => c.status === filter);
  const totalVigente = D.contratos.filter(c => c.status === 'vigente').reduce((a, b) => a + b.valor, 0);
  const totalAditivos = D.contratos.reduce((a, b) => a + b.aditivos, 0);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Contratos</h1>
          <div className="page-subtitle">{D.contratos.length} contratos · {brlCT(totalVigente, { compact: true })} em contratos vigentes</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost"><Icon name="download" size={15} />Exportar</button>
          <button className="btn btn-primary"><Icon name="plus" size={15} />Novo contrato</button>
        </div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="kpi" style={{ padding: '14px 18px' }}>
          <div className="kpi-label">Valor vigente</div>
          <div className="kpi-value num" style={{ fontSize: 22, marginTop: 6 }}>{brlCT(totalVigente, { compact: true })}</div>
          <div className="kpi-foot" style={{ marginTop: 6 }}>
            <span className="kpi-foot-text">{D.contratos.filter(c => c.status === 'vigente').length} contratos ativos</span>
          </div>
        </div>
        <div className="kpi" style={{ padding: '14px 18px' }}>
          <div className="kpi-label">Aditivos firmados</div>
          <div className="kpi-value num" style={{ fontSize: 22, marginTop: 6 }}>{totalAditivos}</div>
          <div className="kpi-foot" style={{ marginTop: 6 }}>
            <span className="kpi-foot-text">Média: 1,3 por contrato</span>
          </div>
        </div>
        <div className="kpi" style={{ padding: '14px 18px' }}>
          <div className="kpi-label">A vencer (90d)</div>
          <div className="kpi-value num" style={{ fontSize: 22, marginTop: 6 }}>2</div>
          <div className="kpi-foot" style={{ marginTop: 6 }}>
            <span className="kpi-trend down"><Icon name="clock" size={11} stroke={2.5} />Atenção</span>
          </div>
        </div>
        <div className="kpi" style={{ padding: '14px 18px' }}>
          <div className="kpi-label">Pendências jurídicas</div>
          <div className="kpi-value num" style={{ fontSize: 22, marginTop: 6 }}>1</div>
          <div className="kpi-foot" style={{ marginTop: 6 }}>
            <span className="kpi-foot-text">CT-SUB-041 · cláusula 7.2</span>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 'var(--gap)' }}>
        <div className="card-header">
          <div className="filters">
            {[
              { id: 'todos', label: 'Todos', count: D.contratos.length },
              { id: 'vigente', label: 'Vigentes', count: D.contratos.filter(c => c.status === 'vigente').length },
              { id: 'pendente', label: 'Pendentes', count: D.contratos.filter(c => c.status === 'pendente').length },
              { id: 'encerrado', label: 'Encerrados', count: D.contratos.filter(c => c.status === 'encerrado').length },
            ].map(f => (
              <button key={f.id} className={'chip' + (filter === f.id ? ' active' : '')} onClick={() => setFilter(f.id)}>
                {f.label} <span style={{ color: 'var(--text-faint)' }}>·</span> {f.count}
              </button>
            ))}
            <button className="chip">Tipo <Icon name="chevron-down" size={12} className="caret" /></button>
            <button className="chip">Período <Icon name="chevron-down" size={12} className="caret" /></button>
          </div>
          <div className="card-actions">
            <input className="input input-search" placeholder="Buscar por código, obra ou parte…" style={{ minWidth: 240 }} />
          </div>
        </div>
        <div className="card-body flush">
          <table className="tbl">
            <thead>
              <tr>
                <th>Código</th>
                <th>Obra</th>
                <th>Parte contratante</th>
                <th>Tipo</th>
                <th className="right">Valor</th>
                <th>Vigência</th>
                <th className="center">Aditivos</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} onClick={() => onOpen(c)}>
                  <td className="strong mono">{c.id}</td>
                  <td className="text-soft">{c.obra}</td>
                  <td className="strong">{c.parte}</td>
                  <td className="text-soft">{c.tipo}</td>
                  <td className="right strong num">{brlCT(c.valor, { compact: true })}</td>
                  <td className="mono text-sm text-muted">{c.vigencia}</td>
                  <td className="center">
                    {c.aditivos > 0 ? <span className="badge info">{c.aditivos}</span> : <span className="text-faint">—</span>}
                  </td>
                  <td><StatusBadge status={c.status} /></td>
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

const ContratoDetalhe = ({ contrato, onBack }) => {
  const [tab, setTab] = React.useState('resumo');
  const aditivos = [
    { num: '01', tipo: 'Prazo', valor: 0, dias: 45, motivo: 'Adequação de projeto estrutural', data: '15/09/2024', status: 'aprovado' },
    { num: '02', tipo: 'Valor', valor: 2840000, dias: 0, motivo: 'Aumento de escopo — fachada ventilada', data: '22/01/2025', status: 'aprovado' },
  ].slice(0, contrato.aditivos);
  const valorTotal = contrato.valor + aditivos.reduce((a, b) => a + b.valor, 0);

  return (
    <>
      <div className="page-header" style={{ marginBottom: 12 }}>
        <div>
          <button className="btn btn-sm btn-ghost" onClick={onBack} style={{ marginBottom: 8 }}>
            <Icon name="chevron-left" size={13} />Contratos
          </button>
          <div className="row" style={{ gap: 10 }}>
            <h1 className="page-title">{contrato.id}</h1>
            <StatusBadge status={contrato.status} />
          </div>
          <div className="page-subtitle">{contrato.tipo} · {contrato.parte}</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost"><Icon name="download" size={15} />PDF assinado</button>
          <button className="btn btn-ghost"><Icon name="edit" size={15} />Aditivo</button>
          <button className="btn btn-primary"><Icon name="check" size={15} />Registrar evento</button>
        </div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="kpi" style={{ padding: '14px 18px' }}>
          <div className="kpi-label">Valor original</div>
          <div className="kpi-value num" style={{ fontSize: 20, marginTop: 6 }}>{brlCT(contrato.valor, { compact: true })}</div>
        </div>
        <div className="kpi" style={{ padding: '14px 18px' }}>
          <div className="kpi-label">Aditivos</div>
          <div className="kpi-value num" style={{ fontSize: 20, marginTop: 6 }}>+{brlCT(aditivos.reduce((a, b) => a + b.valor, 0), { compact: true })}</div>
          <div className="kpi-foot" style={{ marginTop: 4 }}>
            <span className="kpi-foot-text">{contrato.aditivos} aditivo(s)</span>
          </div>
        </div>
        <div className="kpi" style={{ padding: '14px 18px' }}>
          <div className="kpi-label">Valor atualizado</div>
          <div className="kpi-value num" style={{ fontSize: 20, marginTop: 6, color: 'var(--brand)' }}>{brlCT(valorTotal, { compact: true })}</div>
        </div>
        <div className="kpi" style={{ padding: '14px 18px' }}>
          <div className="kpi-label">Vigência</div>
          <div className="kpi-value num" style={{ fontSize: 16, marginTop: 6 }}>{contrato.vigencia}</div>
        </div>
      </div>

      <div className="tabs" style={{ marginTop: 22 }}>
        {[
          { id: 'resumo', label: 'Resumo' },
          { id: 'aditivos', label: 'Aditivos', count: contrato.aditivos },
          { id: 'medicoes', label: 'Medições', count: 12 },
          { id: 'arquivos', label: 'Arquivos', count: 18 },
          { id: 'historico', label: 'Histórico' },
        ].map(t => (
          <button key={t.id} className={'tab' + (tab === t.id ? ' active' : '')} onClick={() => setTab(t.id)}>
            {t.label}
            {t.count != null && <span className="tab-count">{t.count}</span>}
          </button>
        ))}
      </div>

      {tab === 'resumo' && (
        <div className="grid-cols-3-2">
          <div className="card">
            <div className="card-header">
              <div className="card-title">Dados do contrato</div>
            </div>
            <div className="card-body">
              <div className="form-grid" style={{ gap: '16px 24px' }}>
                <Field label="Código">{contrato.id}</Field>
                <Field label="Obra vinculada">{contrato.obra}</Field>
                <Field label="Parte contratante">{contrato.parte}</Field>
                <Field label="Tipo">{contrato.tipo}</Field>
                <Field label="Data de assinatura">{contrato.vigencia.split(' — ')[0]}</Field>
                <Field label="Data de encerramento">{contrato.vigencia.split(' — ')[1]}</Field>
                <Field label="Forma de pagamento">Medições mensais · até 30 dias úteis</Field>
                <Field label="Reajuste">INCC-DI anual</Field>
                <Field label="Retenção">5% sobre o realizado</Field>
                <Field label="Multa por atraso">0,33% ao dia · limitada a 10%</Field>
                <Field label="Garantia">5% do valor contratual (caução)</Field>
                <Field label="Foro">Comarca da Cidade A</Field>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">Eventos e marcos</div>
            </div>
            <div className="card-body" style={{ padding: '4px 20px' }}>
              <div className="activity">
                {[
                  { icon: 'file', tone: 'info', t: 'Contrato assinado pelas partes', m: 'Versão 1.0 · ata 028/2024', d: '04/03/24' },
                  { icon: 'check-circle', tone: 'success', t: 'Garantia depositada', m: 'Caução em conta vinculada', d: '08/03/24' },
                  { icon: 'edit', tone: 'info', t: 'Aditivo 01 — prazo', m: '+45 dias úteis na entrega', d: '15/09/24' },
                  { icon: 'edit', tone: 'info', t: 'Aditivo 02 — valor', m: '+R$ 2,84 mi · fachada ventilada', d: '22/01/25' },
                  { icon: 'check', tone: 'success', t: 'Medição 12 paga', m: 'R$ 4,62 mi · líquido após retenção', d: '08/05/26' },
                ].map((e, i) => (
                  <div className="activity-item" key={i}>
                    <div className={'activity-dot ' + e.tone}><Icon name={e.icon} size={14} /></div>
                    <div>
                      <div className="activity-title">{e.t}</div>
                      <div className="activity-meta">{e.m}</div>
                    </div>
                    <div className="activity-time">{e.d}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'aditivos' && (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Aditivos contratuais</div>
              <div className="card-subtitle">{contrato.aditivos} aditivo(s) registrado(s)</div>
            </div>
            <button className="btn btn-sm btn-primary"><Icon name="plus" size={13} />Novo aditivo</button>
          </div>
          <div className="card-body flush">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Aditivo</th>
                  <th>Tipo</th>
                  <th className="right">Valor</th>
                  <th className="right">Dias</th>
                  <th>Motivo</th>
                  <th>Data</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {aditivos.length === 0 && (
                  <tr><td colSpan="7" style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>Nenhum aditivo registrado.</td></tr>
                )}
                {aditivos.map((a, i) => (
                  <tr key={i}>
                    <td className="strong mono">#{a.num}</td>
                    <td><span className={'badge ' + (a.tipo === 'Prazo' ? 'info' : 'warning')}>{a.tipo}</span></td>
                    <td className="right strong num">{a.valor > 0 ? '+' + brlCT(a.valor, { compact: true }) : '—'}</td>
                    <td className="right mono num">{a.dias > 0 ? '+' + a.dias : '—'}</td>
                    <td className="text-soft">{a.motivo}</td>
                    <td className="mono text-sm text-muted">{a.data}</td>
                    <td><StatusBadge status="aprovado" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'medicoes' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Medições vinculadas ao contrato</div>
          </div>
          <div className="card-body flush">
            <table className="tbl">
              <thead>
                <tr><th>Boletim</th><th>Período</th><th className="right">Valor</th><th>Status</th><th>Data</th></tr>
              </thead>
              <tbody>
                {AppData.medicoes.map((m, i) => (
                  <tr key={i}>
                    <td className="strong mono">#{m.num}</td>
                    <td>{m.periodo}</td>
                    <td className="right strong num">{brlCT(m.medido, { compact: true })}</td>
                    <td><span className="badge success"><Icon name="check" size={10} stroke={3} />Paga</span></td>
                    <td className="mono text-sm text-muted">{m.data}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'arquivos' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Documentos anexados</div>
            <button className="btn btn-sm btn-primary"><Icon name="plus" size={13} />Upload</button>
          </div>
          <div className="card-body">
            <div className="stack" style={{ gap: 8 }}>
              {[
                { nome: 'Contrato original assinado.pdf', tam: '2,4 MB', data: '04/03/24' },
                { nome: 'Aditivo 01 — prazo.pdf', tam: '880 KB', data: '15/09/24' },
                { nome: 'Aditivo 02 — valor.pdf', tam: '1,1 MB', data: '22/01/25' },
                { nome: 'Garantia bancária.pdf', tam: '420 KB', data: '08/03/24' },
                { nome: 'Cronograma físico-financeiro.xlsx', tam: '320 KB', data: '04/03/24' },
                { nome: 'Memorial descritivo.pdf', tam: '4,8 MB', data: '04/03/24' },
              ].map((f, i) => (
                <div key={i} className="row" style={{
                  padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 8,
                  background: 'var(--surface)', gap: 12,
                }}>
                  <div style={{ width: 36, height: 36, borderRadius: 7, background: 'var(--brand-tint)', color: 'var(--brand)', display: 'grid', placeItems: 'center' }}>
                    <Icon name="file" size={16} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="strong" style={{ fontSize: 13.5 }}>{f.nome}</div>
                    <div className="text-xs text-muted mono">{f.tam} · {f.data}</div>
                  </div>
                  <button className="btn btn-sm btn-ghost"><Icon name="eye" size={13} />Ver</button>
                  <button className="icon-btn" style={{ width: 30, height: 30 }}><Icon name="download" size={14} /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'historico' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Histórico de alterações</div>
          </div>
          <div className="card-body" style={{ padding: '4px 20px' }}>
            <div className="activity">
              {[
                'Aditivo 02 firmado por todas as partes', 'Aditivo 02 enviado para análise',
                'Aditivo 01 firmado por todas as partes', 'Aditivo 01 enviado para análise',
                'Contrato assinado · versão 1.0', 'Minuta enviada para revisão jurídica',
                'Proposta comercial aceita pelo cliente',
              ].map((t, i) => (
                <div key={i} className="activity-item">
                  <div className="activity-dot"><Icon name="clock" size={13} /></div>
                  <div><div className="activity-title">{t}</div></div>
                  <div className="activity-time">{['08/05','01/02','22/01','15/11','15/09','01/09','04/03','25/02'][i]}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const Field = ({ label, children }) => (
  <div className="field">
    <label style={{ fontSize: 10.5 }}>{label}</label>
    <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text)' }}>{children}</div>
  </div>
);

const ContratosScreen = () => {
  const [selected, setSelected] = React.useState(null);
  if (selected) return <ContratoDetalhe contrato={selected} onBack={() => setSelected(null)} />;
  return <ContratosLista onOpen={setSelected} />;
};

export { ContratosScreen, ContratosLista, ContratoDetalhe };
