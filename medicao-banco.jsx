// Medição Banco — boletins de medição para liberação de parcelas de financiamento bancário
const { brl: brlMB } = window.AppData;

// ========= MOCK DATA =========
const MB_OBRAS = window.AppData.obras.filter(o => o.status === 'em_andamento').slice(0, 4);

const MB_AGENTES = [
  { id: 'CEF',     nome: 'Caixa Econômica Federal', tipo: 'Apoio Produção' },
  { id: 'ITAU',    nome: 'Itaú Unibanco',           tipo: 'Plano Empresário' },
  { id: 'BRADESCO',nome: 'Bradesco',                tipo: 'Plano Empresário' },
  { id: 'SANT',    nome: 'Santander',               tipo: 'Plano Empresário' },
];

// Medições bancárias por obra (cronograma físico-financeiro contratado)
const MB_MEDICOES = [
  { num: '08', obra: 'OB-001', periodo: '01/04/26 — 30/04/26', envio: '02/05/26', vistoria: '08/05/26', liberacao: '14/05/26',
    avancoFisicoAcum: 62, avancoFisicoMes: 4, valorMedido: 5320000, valorLiberado: 5054000, retencao: 266000,
    status: 'liberada', agente: 'CEF', vistoriador: 'Eng. Vistoriador 01' },
  { num: '07', obra: 'OB-001', periodo: '01/03/26 — 31/03/26', envio: '02/04/26', vistoria: '08/04/26', liberacao: '15/04/26',
    avancoFisicoAcum: 58, avancoFisicoMes: 5, valorMedido: 6180000, valorLiberado: 5871000, retencao: 309000,
    status: 'liberada', agente: 'CEF', vistoriador: 'Eng. Vistoriador 01' },
  { num: '06', obra: 'OB-001', periodo: '01/02/26 — 28/02/26', envio: '02/03/26', vistoria: '09/03/26', liberacao: '16/03/26',
    avancoFisicoAcum: 53, avancoFisicoMes: 5, valorMedido: 5840000, valorLiberado: 5548000, retencao: 292000,
    status: 'liberada', agente: 'CEF', vistoriador: 'Eng. Vistoriador 01' },
  { num: '05', obra: 'OB-001', periodo: '01/01/26 — 31/01/26', envio: '03/02/26', vistoria: '10/02/26', liberacao: '17/02/26',
    avancoFisicoAcum: 48, avancoFisicoMes: 5, valorMedido: 5720000, valorLiberado: 5434000, retencao: 286000,
    status: 'liberada', agente: 'CEF', vistoriador: 'Eng. Vistoriador 01' },

  { num: '09', obra: 'OB-001', periodo: '01/05/26 — 31/05/26', envio: '01/06/26', vistoria: '08/06/26', liberacao: null,
    avancoFisicoAcum: 67, avancoFisicoMes: 5, valorMedido: 5680000, valorLiberado: 0, retencao: 0,
    status: 'em_vistoria', agente: 'CEF', vistoriador: 'Eng. Vistoriador 01' },

  { num: '04', obra: 'OB-002', periodo: '01/04/26 — 30/04/26', envio: '02/05/26', vistoria: '09/05/26', liberacao: '17/05/26',
    avancoFisicoAcum: 28, avancoFisicoMes: 6, valorMedido: 8420000, valorLiberado: 8000000, retencao: 420000,
    status: 'liberada', agente: 'ITAU', vistoriador: 'Eng. Vistoriador 02' },
  { num: '05', obra: 'OB-002', periodo: '01/05/26 — 31/05/26', envio: '02/06/26', vistoria: null, liberacao: null,
    avancoFisicoAcum: 33, avancoFisicoMes: 5, valorMedido: 7140000, valorLiberado: 0, retencao: 0,
    status: 'enviada', agente: 'ITAU', vistoriador: 'Eng. Vistoriador 02' },

  { num: '11', obra: 'OB-003', periodo: '01/04/26 — 30/04/26', envio: '02/05/26', vistoria: '07/05/26', liberacao: '13/05/26',
    avancoFisicoAcum: 94, avancoFisicoMes: 3, valorMedido: 2820000, valorLiberado: 2679000, retencao: 141000,
    status: 'liberada', agente: 'BRADESCO', vistoriador: 'Eng. Vistoriador 03' },

  { num: '06', obra: 'OB-004', periodo: '01/05/26 — 31/05/26', envio: '02/06/26', vistoria: null, liberacao: null,
    avancoFisicoAcum: 74, avancoFisicoMes: 4, valorMedido: 3420000, valorLiberado: 0, retencao: 0,
    status: 'rascunho', agente: 'SANT', vistoriador: 'Eng. Vistoriador 04' },
  { num: '05', obra: 'OB-004', periodo: '01/04/26 — 30/04/26', envio: '03/05/26', vistoria: '10/05/26', liberacao: null,
    avancoFisicoAcum: 70, avancoFisicoMes: 4, valorMedido: 3680000, valorLiberado: 0, retencao: 0,
    status: 'glosa', agente: 'SANT', vistoriador: 'Eng. Vistoriador 04',
    glosa: { valor: 412000, motivo: 'Acabamento pavto 6 não comprovado em vistoria — refazer apresentação' } },
];

const MB_STATUS_MAP = {
  rascunho:    { label: 'Rascunho',    cls: 'neutral' },
  enviada:     { label: 'Enviada',     cls: 'info' },
  em_vistoria: { label: 'Em vistoria', cls: 'warning' },
  glosa:       { label: 'Com glosa',   cls: 'danger' },
  liberada:    { label: 'Liberada',    cls: 'success' },
};

// ========= MAIN SCREEN =========
const MedicaoBancoScreen = () => {
  const toast = window.useToast ? window.useToast() : null;
  const [obraSel, setObraSel] = React.useState('todas');
  const [statusFilter, setStatusFilter] = React.useState('todas');
  const [agenteFilter, setAgenteFilter] = React.useState('todos');
  const [showModal, setShowModal] = React.useState(false);
  const [openMed, setOpenMed] = React.useState(null);

  const filtered = MB_MEDICOES
    .filter(m => obraSel === 'todas' ? true : m.obra === obraSel)
    .filter(m => statusFilter === 'todas' ? true : m.status === statusFilter)
    .filter(m => agenteFilter === 'todos' ? true : m.agente === agenteFilter)
    .sort((a, b) => (a.envio < b.envio ? 1 : -1));

  const liberadas = MB_MEDICOES.filter(m => m.status === 'liberada');
  const totalLiberado = liberadas.reduce((s, m) => s + m.valorLiberado, 0);
  const totalRetencao = liberadas.reduce((s, m) => s + m.retencao, 0);
  const aguardando = MB_MEDICOES.filter(m => m.status === 'enviada' || m.status === 'em_vistoria');
  const totalAguardando = aguardando.reduce((s, m) => s + m.valorMedido, 0);
  const comGlosa = MB_MEDICOES.filter(m => m.status === 'glosa');
  const totalGlosa = comGlosa.reduce((s, m) => s + (m.glosa?.valor || 0), 0);

  if (openMed) {
    return <MedicaoBancoDetalhe med={openMed} onBack={() => setOpenMed(null)} />;
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Medição Banco</h1>
          <div className="page-subtitle">Boletins de medição para liberação de parcelas de financiamento bancário</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost"><Icon name="download" size={15} />Exportar</button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Icon name="plus" size={15} />Nova medição bancária
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="kpi">
          <div className="kpi-label">
            <div className="kpi-icon"><Icon name="check-circle" size={16} /></div>
            Liberado acumulado
          </div>
          <div className="kpi-value num" style={{ fontSize: 24, marginTop: 8, color: 'var(--success)' }}>{brlMB(totalLiberado, { compact: true })}</div>
          <div className="kpi-foot" style={{ marginTop: 6 }}>
            <span className="kpi-foot-text">{liberadas.length} medições liberadas</span>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">
            <div className="kpi-icon"><Icon name="clock" size={16} /></div>
            Aguardando vistoria
          </div>
          <div className="kpi-value num" style={{ fontSize: 24, marginTop: 8 }}>{brlMB(totalAguardando, { compact: true })}</div>
          <div className="kpi-foot" style={{ marginTop: 6 }}>
            <span className="kpi-foot-text">{aguardando.length} processos em andamento</span>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">
            <div className="kpi-icon" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}><Icon name="shield" size={16} /></div>
            Retenção contratual
          </div>
          <div className="kpi-value num" style={{ fontSize: 24, marginTop: 8 }}>{brlMB(totalRetencao, { compact: true })}</div>
          <div className="kpi-foot" style={{ marginTop: 6 }}>
            <span className="kpi-foot-text">5% sobre valor liberado</span>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">
            <div className="kpi-icon" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}><Icon name="alert-triangle" size={16} /></div>
            Glosas no período
          </div>
          <div className="kpi-value num" style={{ fontSize: 24, marginTop: 8, color: 'var(--danger)' }}>{brlMB(totalGlosa, { compact: true })}</div>
          <div className="kpi-foot" style={{ marginTop: 6 }}>
            <span className="kpi-foot-text">{comGlosa.length} medição(ões) com pendência</span>
          </div>
        </div>
      </div>

      {/* FILTROS */}
      <div className="card" style={{ marginTop: 'var(--gap)', padding: '14px 18px' }}>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div className="filters" style={{ flex: 1 }}>
            {[
              { id: 'todas', label: 'Todas', count: MB_MEDICOES.length },
              ...Object.entries(MB_STATUS_MAP).map(([id, m]) => ({
                id, label: m.label, count: MB_MEDICOES.filter(x => x.status === id).length,
              })),
            ].map(f => (
              <button key={f.id} className={'chip' + (statusFilter === f.id ? ' active' : '')} onClick={() => setStatusFilter(f.id)}>
                {f.label} <span style={{ color: 'var(--text-faint)' }}>·</span> {f.count}
              </button>
            ))}
          </div>
          <select className="input" value={obraSel} onChange={e => setObraSel(e.target.value)} style={{ minWidth: 180 }}>
            <option value="todas">Todas as obras</option>
            {MB_OBRAS.map(o => (<option key={o.id} value={o.id}>{o.nome}</option>))}
          </select>
          <select className="input" value={agenteFilter} onChange={e => setAgenteFilter(e.target.value)} style={{ minWidth: 180 }}>
            <option value="todos">Todos os agentes</option>
            {MB_AGENTES.map(a => (<option key={a.id} value={a.id}>{a.nome}</option>))}
          </select>
        </div>
      </div>

      {/* TABELA */}
      <div className="card" style={{ marginTop: 'var(--gap)' }}>
        <div className="card-header">
          <div>
            <div className="card-title">Boletins de medição</div>
            <div className="card-subtitle">{filtered.length} de {MB_MEDICOES.length} medições</div>
          </div>
        </div>
        <div className="card-body flush" style={{ overflow: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Boletim</th>
                <th>Obra</th>
                <th>Agente</th>
                <th>Período</th>
                <th className="center">% Físico</th>
                <th className="right">Valor medido</th>
                <th className="right">Liberado</th>
                <th>Status</th>
                <th>Vistoria</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m, i) => {
                const obra = MB_OBRAS.find(o => o.id === m.obra) || { nome: m.obra };
                const agente = MB_AGENTES.find(a => a.id === m.agente);
                const st = MB_STATUS_MAP[m.status];
                return (
                  <tr key={i} onClick={() => setOpenMed(m)}>
                    <td className="strong mono">#{m.num}</td>
                    <td>
                      <div className="strong" style={{ fontSize: 13 }}>{obra.nome}</div>
                      <div className="text-xs text-muted mono">{m.obra}</div>
                    </td>
                    <td>
                      <span className="badge neutral mono">{agente?.id}</span>
                    </td>
                    <td className="mono text-sm text-soft">{m.periodo}</td>
                    <td className="center">
                      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                        <span className="mono num fw-700" style={{ color: 'var(--brand)' }}>{m.avancoFisicoAcum}%</span>
                        <span className="text-xs text-muted mono">+{m.avancoFisicoMes}pp mês</span>
                      </div>
                    </td>
                    <td className="right strong num">{brlMB(m.valorMedido, { compact: true })}</td>
                    <td className="right mono num" style={{ color: m.valorLiberado > 0 ? 'var(--success)' : 'var(--text-faint)', fontWeight: 600 }}>
                      {m.valorLiberado > 0 ? brlMB(m.valorLiberado, { compact: true }) : '—'}
                    </td>
                    <td><span className={'badge ' + st.cls}><span className="dot"></span>{st.label}</span></td>
                    <td className="mono text-sm text-muted">{m.vistoria || '—'}</td>
                    <td><button className="icon-btn" style={{ width: 28, height: 28 }} onClick={(e) => e.stopPropagation()}><Icon name="dots" size={14} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* CRONOGRAMA DE LIBERAÇÃO */}
      <div className="grid-cols-3-2" style={{ marginTop: 'var(--gap)' }}>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Cronograma de liberações</div>
              <div className="card-subtitle">Por obra · valor liberado mensalmente pelo agente bancário</div>
            </div>
            <button className="icon-btn"><Icon name="dots" size={16} /></button>
          </div>
          <div className="card-body">
            <CronogramaLiberacao medicoes={MB_MEDICOES} />
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Distribuição por agente</div>
          </div>
          <div className="card-body">
            <div className="stack" style={{ gap: 12 }}>
              {MB_AGENTES.map((a, i) => {
                const obrasAgente = MB_MEDICOES.filter(m => m.agente === a.id);
                const valorLiberado = obrasAgente.filter(m => m.status === 'liberada').reduce((s, m) => s + m.valorLiberado, 0);
                const maxVal = Math.max(...MB_AGENTES.map(ag =>
                  MB_MEDICOES.filter(m => m.agente === ag.id && m.status === 'liberada').reduce((s, m) => s + m.valorLiberado, 0)
                )) || 1;
                return (
                  <div key={a.id}>
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                      <span className="row" style={{ gap: 8 }}>
                        <span className="badge neutral mono">{a.id}</span>
                        <span className="text-sm text-soft" style={{ fontWeight: 500 }}>{a.tipo}</span>
                      </span>
                      <span className="mono num fw-700" style={{ fontSize: 13 }}>{brlMB(valorLiberado, { compact: true })}</span>
                    </div>
                    <div className="progress" style={{ height: 6 }}>
                      <span style={{ width: ((valorLiberado / maxVal) * 100) + '%' }}></span>
                    </div>
                    <div className="text-xs text-muted" style={{ marginTop: 3 }}>{obrasAgente.length} boletim(ns)</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {showModal && <NovaMedicaoBancoModal onClose={() => setShowModal(false)} onSave={() => {
        if (toast) toast('Boletim enviado para o agente bancário', { tone: 'success', icon: 'check' });
        setShowModal(false);
      }} />}
    </>
  );
};

// ========= DETALHE =========
const MedicaoBancoDetalhe = ({ med, onBack }) => {
  const obra = MB_OBRAS.find(o => o.id === med.obra) || { nome: med.obra };
  const agente = MB_AGENTES.find(a => a.id === med.agente);
  const st = MB_STATUS_MAP[med.status];

  const etapas = [
    { id: 'rascunho',    label: 'Boletim elaborado',     done: true,                       data: '01/' + med.envio.slice(3) },
    { id: 'enviada',     label: 'Enviada ao agente',     done: ['enviada','em_vistoria','glosa','liberada'].includes(med.status), data: med.envio },
    { id: 'em_vistoria', label: 'Vistoria realizada',    done: ['em_vistoria','glosa','liberada'].includes(med.status), data: med.vistoria },
    { id: 'aprovacao',   label: 'Aprovação técnica',     done: ['liberada'].includes(med.status), data: med.liberacao },
    { id: 'liberacao',   label: 'Recurso liberado',      done: ['liberada'].includes(med.status), data: med.liberacao },
  ];

  // composição da medição
  const composicao = [
    { etapa: 'Estrutura',              pct: 28, vlr: med.valorMedido * 0.28 },
    { etapa: 'Alvenaria',              pct: 18, vlr: med.valorMedido * 0.18 },
    { etapa: 'Instalações elétricas',  pct: 14, vlr: med.valorMedido * 0.14 },
    { etapa: 'Instalações hidráulicas',pct: 11, vlr: med.valorMedido * 0.11 },
    { etapa: 'Revestimentos',          pct: 12, vlr: med.valorMedido * 0.12 },
    { etapa: 'Esquadrias',             pct: 8,  vlr: med.valorMedido * 0.08 },
    { etapa: 'Outros',                 pct: 9,  vlr: med.valorMedido * 0.09 },
  ];

  return (
    <>
      <div className="page-header" style={{ marginBottom: 12 }}>
        <div>
          <button className="btn btn-sm btn-ghost" onClick={onBack} style={{ marginBottom: 8 }}>
            <Icon name="chevron-left" size={13} />Medição Banco
          </button>
          <div className="row" style={{ gap: 10 }}>
            <h1 className="page-title">Boletim #{med.num}</h1>
            <span className={'badge ' + st.cls}><span className="dot"></span>{st.label}</span>
            <span className="badge neutral mono">{agente?.id}</span>
          </div>
          <div className="page-subtitle">{obra.nome} · Período {med.periodo}</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost"><Icon name="download" size={15} />Baixar PDF</button>
          {med.status === 'glosa' && <button className="btn btn-primary"><Icon name="edit" size={15} />Reapresentar</button>}
          {med.status === 'rascunho' && <button className="btn btn-primary"><Icon name="arrow-right" size={15} />Enviar ao banco</button>}
        </div>
      </div>

      {/* Stepper */}
      <div className="card">
        <div className="card-body" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {etapas.map((e, i) => (
              <React.Fragment key={e.id}>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    margin: '0 auto 8px',
                    background: e.done ? 'var(--brand)' : 'var(--surface-muted)',
                    color: e.done ? '#fff' : 'var(--text-muted)',
                    display: 'grid', placeItems: 'center',
                    fontWeight: 700, fontSize: 13,
                    border: '2px solid ' + (e.done ? 'var(--brand)' : 'var(--border-strong)'),
                  }}>
                    {e.done ? <Icon name="check" size={14} stroke={3} /> : i + 1}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: e.done ? 'var(--text)' : 'var(--text-muted)' }}>{e.label}</div>
                  <div className="text-xs text-muted mono" style={{ marginTop: 2 }}>{e.data || '—'}</div>
                </div>
                {i < etapas.length - 1 && (
                  <div style={{
                    flex: 0.4,
                    height: 2,
                    marginTop: -28,
                    background: etapas[i + 1].done ? 'var(--brand)' : 'var(--border-strong)',
                  }}></div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Valores */}
      <div className="kpi-grid" style={{ marginTop: 'var(--gap)', gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="kpi">
          <div className="kpi-label">Avanço físico acumulado</div>
          <div className="kpi-value num" style={{ fontSize: 24, marginTop: 8, color: 'var(--brand)' }}>{med.avancoFisicoAcum}<span className="unit">%</span></div>
          <div className="kpi-foot" style={{ marginTop: 6 }}>
            <span className="kpi-foot-text">+{med.avancoFisicoMes} pp no mês</span>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Valor medido</div>
          <div className="kpi-value num" style={{ fontSize: 24, marginTop: 8 }}>{brlMB(med.valorMedido, { compact: true })}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Valor liberado</div>
          <div className="kpi-value num" style={{ fontSize: 24, marginTop: 8, color: med.valorLiberado > 0 ? 'var(--success)' : 'var(--text-faint)' }}>
            {med.valorLiberado > 0 ? brlMB(med.valorLiberado, { compact: true }) : '—'}
          </div>
          {med.retencao > 0 && (
            <div className="kpi-foot" style={{ marginTop: 6 }}>
              <span className="kpi-foot-text">Retenção {brlMB(med.retencao, { compact: true })}</span>
            </div>
          )}
        </div>
        <div className="kpi">
          <div className="kpi-label">Saldo a liberar</div>
          <div className="kpi-value num" style={{ fontSize: 24, marginTop: 8 }}>
            {brlMB(med.valorMedido - med.valorLiberado - (med.glosa?.valor || 0), { compact: true })}
          </div>
        </div>
      </div>

      {/* Glosa (se houver) */}
      {med.glosa && (
        <div className="card" style={{ marginTop: 'var(--gap)', borderColor: 'var(--danger)', borderWidth: '1px', background: 'var(--danger-bg)' }}>
          <div className="card-body" style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--danger)', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Icon name="alert-triangle" size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--danger)' }}>Glosa registrada — {brlMB(med.glosa.valor)}</div>
              <div className="text-sm" style={{ marginTop: 4, color: 'var(--text)' }}>{med.glosa.motivo}</div>
              <div className="text-xs text-muted" style={{ marginTop: 6 }}>
                Vistoria: {med.vistoria} · Vistoriador: {med.vistoriador}
              </div>
            </div>
            <button className="btn btn-sm btn-primary"><Icon name="edit" size={13} />Recurso</button>
          </div>
        </div>
      )}

      {/* Composição + Documentos */}
      <div className="grid-cols-3-2" style={{ marginTop: 'var(--gap)' }}>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Composição da medição</div>
              <div className="card-subtitle">Distribuição do valor medido por etapa</div>
            </div>
          </div>
          <div className="card-body flush">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Etapa</th>
                  <th className="right">Valor</th>
                  <th className="right">% do total</th>
                  <th style={{ width: 200 }}>Participação</th>
                </tr>
              </thead>
              <tbody>
                {composicao.map((c, i) => (
                  <tr key={i}>
                    <td className="strong">{c.etapa}</td>
                    <td className="right mono num">{brlMB(c.vlr, { compact: true })}</td>
                    <td className="right mono num text-muted">{c.pct}%</td>
                    <td>
                      <div className="progress" style={{ height: 5 }}>
                        <span style={{ width: ((c.pct / 28) * 100) + '%' }}></span>
                      </div>
                    </td>
                  </tr>
                ))}
                <tr style={{ background: 'var(--brand-tint)' }}>
                  <td className="strong" style={{ color: 'var(--brand)' }}>TOTAL</td>
                  <td className="right mono num strong" style={{ color: 'var(--brand)' }}>{brlMB(med.valorMedido, { compact: true })}</td>
                  <td className="right mono num strong" style={{ color: 'var(--brand)' }}>100%</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Documentos anexados</div>
            <button className="btn btn-sm btn-ghost"><Icon name="plus" size={13} />Upload</button>
          </div>
          <div className="card-body">
            <div className="stack" style={{ gap: 8 }}>
              {[
                { nome: 'Boletim de medição #' + med.num + '.pdf', tam: '1,8 MB' },
                { nome: 'Memorial descritivo do mês.pdf', tam: '2,4 MB' },
                { nome: 'Relatório fotográfico — pavto 7-8.pdf', tam: '12,4 MB' },
                { nome: 'ART do engenheiro responsável.pdf', tam: '180 KB' },
                { nome: 'Cronograma físico atualizado.xlsx', tam: '320 KB' },
                { nome: 'Notas fiscais — período.zip', tam: '8,7 MB' },
              ].map((f, i) => (
                <div key={i} className="row" style={{
                  padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, gap: 10,
                  background: 'var(--surface)',
                }}>
                  <div style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--brand-tint)', color: 'var(--brand)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <Icon name="file" size={14} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="strong" style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nome}</div>
                    <div className="text-xs text-muted mono">{f.tam}</div>
                  </div>
                  <button className="icon-btn" style={{ width: 28, height: 28 }}><Icon name="download" size={13} /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

// ========= CRONOGRAMA LIBERACAO CHART =========
const CronogramaLiberacao = ({ medicoes }) => {
  // Group by month
  const byMonth = {};
  medicoes.filter(m => m.status === 'liberada').forEach(m => {
    const month = m.liberacao.slice(3, 8); // MM/YY
    if (!byMonth[month]) byMonth[month] = { mes: month, valor: 0, count: 0 };
    byMonth[month].valor += m.valorLiberado;
    byMonth[month].count++;
  });
  const arr = Object.values(byMonth).sort((a, b) => {
    const [ma, ya] = a.mes.split('/');
    const [mb, yb] = b.mes.split('/');
    return (ya + ma).localeCompare(yb + mb);
  });

  const w = 660, h = 220;
  const pad = { l: 56, r: 16, t: 16, b: 32 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const maxV = Math.max(...arr.map(d => d.valor)) || 1;
  const niceMax = Math.ceil(maxV / 2000000) * 2000000;
  const stepX = innerW / arr.length;
  const barW = stepX * 0.6;
  const yOf = v => pad.t + innerH - (v / niceMax) * innerH;

  return (
    <svg className="chart-svg" viewBox={`0 0 ${w} ${h}`}>
      <g className="chart-grid">
        {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
          <line key={i} x1={pad.l} x2={w - pad.r}
            y1={pad.t + innerH * (1 - t)} y2={pad.t + innerH * (1 - t)}
            strokeDasharray={t === 0 ? '0' : '3 3'} />
        ))}
      </g>
      <g className="chart-axis">
        {[0, 0.5, 1].map((t, i) => (
          <text key={i} x={pad.l - 6} y={pad.t + innerH * (1 - t) + 3} textAnchor="end">
            {brlMB(niceMax * t, { compact: true })}
          </text>
        ))}
        {arr.map((d, i) => (
          <text key={i} x={pad.l + stepX * (i + 0.5)} y={h - pad.b + 14} textAnchor="middle">{d.mes}</text>
        ))}
      </g>
      {arr.map((d, i) => {
        const x = pad.l + stepX * (i + 0.5) - barW / 2;
        const y = yOf(d.valor);
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={pad.t + innerH - y} rx="3" fill="var(--brand)" />
            <text x={x + barW / 2} y={y - 6} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="var(--brand)" fontFamily="var(--font-mono)">
              {brlMB(d.valor, { compact: true })}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

// ========= NOVA MEDIÇÃO MODAL =========
const NovaMedicaoBancoModal = ({ onClose, onSave }) => {
  const [obra, setObra] = React.useState('OB-001');
  const [agente, setAgente] = React.useState('CEF');
  const [avanco, setAvanco] = React.useState(67);
  const [valor, setValor] = React.useState(5680000);
  return (
    <Modal
      title="Nova medição bancária"
      subtitle="Elaborar boletim para envio ao agente financeiro"
      onClose={onClose}
      size="lg"
      footer={
        <>
          <div className="spacer"></div>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-ghost">Salvar rascunho</button>
          <button className="btn btn-primary" onClick={onSave}><Icon name="arrow-right" size={14} />Enviar ao banco</button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label>Obra <span className="req">*</span></label>
          <select value={obra} onChange={e => setObra(e.target.value)}>
            {MB_OBRAS.map(o => (<option key={o.id} value={o.id}>{o.nome}</option>))}
          </select>
        </div>
        <div className="field">
          <label>Agente financeiro <span className="req">*</span></label>
          <select value={agente} onChange={e => setAgente(e.target.value)}>
            {MB_AGENTES.map(a => (<option key={a.id} value={a.id}>{a.nome}</option>))}
          </select>
        </div>
        <div className="field">
          <label>Período inicial</label>
          <input type="date" defaultValue="2026-05-01" />
        </div>
        <div className="field">
          <label>Período final</label>
          <input type="date" defaultValue="2026-05-31" />
        </div>
        <div className="field full">
          <label>Avanço físico acumulado: {avanco}%</label>
          <input type="range" min="0" max="100" value={avanco}
            onChange={e => setAvanco(+e.target.value)}
            style={{ width: '100%', accentColor: 'var(--brand)', marginTop: 6 }} />
          <div className="row" style={{ justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
            <span>Início</span><span>Anterior: 62%</span><span>Conclusão</span>
          </div>
        </div>
        <div className="field">
          <label>Valor a medir (R$)</label>
          <div className="field-prefix">
            <span className="prefix">R$</span>
            <input
              value={valor.toLocaleString('pt-BR')}
              onChange={e => setValor(parseFloat(e.target.value.replace(/\D/g, '')) || 0)}
            />
          </div>
        </div>
        <div className="field">
          <label>Retenção contratual (%)</label>
          <input defaultValue="5,0" />
        </div>
        <div className="field full">
          <label>Vistoriador designado</label>
          <select>
            <option>Eng. Vistoriador 01 — CREA 0001234</option>
            <option>Eng. Vistoriador 02 — CREA 0005678</option>
            <option>Eng. Vistoriador 03 — CREA 0009012</option>
          </select>
        </div>
        <div className="field full">
          <label>Observações</label>
          <textarea placeholder="Notas sobre o boletim, justificativas..."></textarea>
        </div>
      </div>
    </Modal>
  );
};

window.MedicaoBancoScreen = MedicaoBancoScreen;
