import React from 'react';
import { Icon } from '../../components/Icons';
import { auditoriaService } from './auditoria.service';

const CRIT = {
  critica: { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5', label: 'Crítica' },
  alta:    { bg: '#fef3c7', text: '#d97706', border: '#fde68a', label: 'Alta'    },
  media:   { bg: '#dbeafe', text: '#1d4ed8', border: '#bfdbfe', label: 'Média'   },
  baixa:   { bg: '#dcfce7', text: '#15803d', border: '#bbf7d0', label: 'Baixa'   },
};

const MOD_COLORS = {
  usuarios:      '#7c3aed',
  obras:         '#0891b2',
  cronograma:    '#2563eb',
  orcamentos:    '#16a34a',
  medicoes:      '#d97706',
  contratos:     '#ea580c',
  autenticacao:  '#374151',
  ia:            '#6d28d9',
};

const ACOES = ['criou', 'editou', 'excluiu', 'aprovou', 'reprovou', 'login', 'logout', 'importou', 'exportou'];
const MODULOS = ['usuarios', 'obras', 'cronograma', 'orcamentos', 'medicoes', 'contratos', 'autenticacao'];

const MOCK_LOGS = [
  { id: 'm1', created_at: new Date(Date.now()-3*60000).toISOString(), user_nome: 'Administrador', user_perfil: 'admin', modulo: 'usuarios', acao: 'editou', entidade_tipo: 'usuario', entidade_id: '25', descricao: 'Alterou o perfil do usuário João da Silva de Usuário para Administrador', obra_nome: 'Todas as Obras', ip: '177.68.32.10', criticidade: 'critica', valor_anterior: { Perfil: 'Usuário', Status: 'Ativo' }, valor_novo: { Perfil: 'Administrador', Status: 'Ativo' }, sessao_id: '5f8d9...', duracao_ms: 842 },
  { id: 'm2', created_at: new Date(Date.now()-29*60000).toISOString(), user_nome: 'Maria Oliveira', user_perfil: 'usuario', modulo: 'cronograma', acao: 'editou', entidade_tipo: 'tarefa', entidade_id: '1587', descricao: 'Alterou a data inicial da tarefa Fundação Bloco A', obra_nome: 'Residencial Alfa', ip: '191.54.21.33', criticidade: 'alta', valor_anterior: { data_inicio: '2026-06-10' }, valor_novo: { data_inicio: '2026-06-15' } },
  { id: 'm3', created_at: new Date(Date.now()-52*60000).toISOString(), user_nome: 'João da Silva', user_perfil: 'usuario', modulo: 'orcamentos', acao: 'editou', entidade_tipo: 'item_orcamento', entidade_id: '2456', descricao: 'Alterou o valor unitário do item Concreto FCK 30', obra_nome: 'Torre Norte', ip: '179.189.12.55', criticidade: 'alta', valor_anterior: { valor_unitario: 'R$ 380,00' }, valor_novo: { valor_unitario: 'R$ 420,00' } },
  { id: 'm4', created_at: new Date(Date.now()-82*60000).toISOString(), user_nome: 'Maria Oliveira', user_perfil: 'usuario', modulo: 'medicoes', acao: 'aprovou', entidade_tipo: 'medicao', entidade_id: '782', descricao: 'Aprovou a medição nº 05/2026', obra_nome: 'Residencial Alfa', ip: '191.54.21.33', criticidade: 'alta' },
  { id: 'm5', created_at: new Date(Date.now()-111*60000).toISOString(), user_nome: 'Carlos Souza', user_perfil: 'usuario', modulo: 'obras', acao: 'criou', entidade_tipo: 'obra', entidade_id: '12', descricao: 'Criou a obra Shopping Beta', obra_nome: 'Shopping Beta', ip: '189.41.72.19', criticidade: 'media' },
  { id: 'm6', created_at: new Date(Date.now()-142*60000).toISOString(), user_nome: 'Sistema', user_perfil: 'sistema', modulo: 'autenticacao', acao: 'login', entidade_tipo: 'sessao', entidade_id: '5f8d9...', descricao: 'Login realizado com sucesso', ip: '189.41.72.19', criticidade: 'baixa' },
];

const fmt = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const CritBadge = ({ crit }) => {
  const c = CRIT[crit] || CRIT.media;
  return (
    <span style={{ padding: '2px 9px', borderRadius: 6, fontSize: 11.5, fontWeight: 700, background: c.bg, color: c.text, border: `1px solid ${c.border}`, whiteSpace: 'nowrap' }}>
      {c.label}
    </span>
  );
};

const ModBadge = ({ modulo }) => {
  const cor = MOD_COLORS[modulo] || '#6b7280';
  const label = modulo?.charAt(0).toUpperCase() + modulo?.slice(1);
  return (
    <span style={{ padding: '2px 9px', borderRadius: 6, fontSize: 11.5, fontWeight: 600, background: cor + '18', color: cor, border: `1px solid ${cor}30`, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
};

const AcaoBadge = ({ acao }) => {
  const cores = { criou: '#16a34a', editou: '#2563eb', excluiu: '#b91c1c', aprovou: '#16a34a', reprovou: '#b91c1c', login: '#6b7280', logout: '#6b7280' };
  const cor = cores[acao] || '#6b7280';
  return (
    <span style={{ padding: '2px 9px', borderRadius: 6, fontSize: 11.5, fontWeight: 600, background: cor + '15', color: cor, border: `1px solid ${cor}30`, whiteSpace: 'nowrap' }}>
      {acao?.charAt(0).toUpperCase() + acao?.slice(1)}
    </span>
  );
};

const Avatar = ({ nome }) => {
  const letra = (nome || '?')[0].toUpperCase();
  const cores = ['#2563eb', '#7c3aed', '#16a34a', '#d97706', '#0891b2', '#ec4899'];
  const cor = cores[letra.charCodeAt(0) % cores.length];
  return (
    <div style={{ width: 30, height: 30, borderRadius: '50%', background: cor, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
      {letra}
    </div>
  );
};

const KpiCard = ({ icon, label, value, sub, color }) => (
  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: 14, flex: 1, minWidth: 160 }}>
    <div style={{ width: 44, height: 44, borderRadius: 10, background: (color || '#2563eb') + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Icon name={icon} size={20} style={{ color: color || '#2563eb' }} />
    </div>
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 3 }}>{sub}</div>
    </div>
  </div>
);

const FILTROS_VAZIOS = { dataInicio: '', dataFim: '', userId: '', obraId: '', modulo: '', acao: '', criticidade: '', busca: '', entidade: '', ip: '' };
const PER_PAGE = 10;

export const AuditoriaScreen = ({ obras = [], user }) => {
  const [logs,        setLogs]        = React.useState([]);
  const [total,       setTotal]       = React.useState(0);
  const [loading,     setLoading]     = React.useState(true);
  const [kpis,        setKpis]        = React.useState({ totalEventos: 0, eventosCriticos: 0, ultimaAtualizacao: null });
  const [usandoMock,  setUsandoMock]  = React.useState(false);
  const [filtros,     setFiltros]     = React.useState(FILTROS_VAZIOS);
  const [aplicados,   setAplicados]   = React.useState(FILTROS_VAZIOS);
  const [pagina,      setPagina]      = React.useState(1);
  const [aba,         setAba]         = React.useState('timeline');
  const [evento,      setEvento]      = React.useState(null);
  const [regBusca,    setRegBusca]    = React.useState({ tipo: '', id: '' });
  const [regLogs,     setRegLogs]     = React.useState([]);
  const [regLoading,  setRegLoading]  = React.useState(false);
  const [criticosCount, setCriticosCount] = React.useState(0);

  const carregarKpis = React.useCallback(async () => {
    const k = await auditoriaService.kpis();
    setKpis(k);
  }, []);

  const carregarLogs = React.useCallback(async (filt = aplicados, pg = pagina) => {
    setLoading(true);
    const critFilt = aba === 'criticos' ? 'critica' : filt.criticidade;
    const { data, count, error } = await auditoriaService.listar({ ...filt, criticidade: critFilt, page: pg, perPage: PER_PAGE });
    if (error || !data) {
      setLogs(MOCK_LOGS);
      setTotal(MOCK_LOGS.length);
      setUsandoMock(true);
      const critCount = MOCK_LOGS.filter(l => l.criticidade === 'critica').length;
      setCriticosCount(critCount);
      setKpis({ totalEventos: MOCK_LOGS.length, eventosCriticos: critCount, ultimaAtualizacao: MOCK_LOGS[0]?.created_at });
    } else {
      setLogs(data);
      setTotal(count ?? 0);
      setUsandoMock(false);
      if (aba !== 'criticos') {
        const { count: cc } = await auditoriaService.listar({ criticidade: 'critica', perPage: 1 });
        setCriticosCount(cc ?? 0);
      }
    }
    setLoading(false);
  }, [aplicados, pagina, aba]);

  React.useEffect(() => { carregarKpis(); }, [carregarKpis]);
  React.useEffect(() => { carregarLogs(); }, [carregarLogs]);
  React.useEffect(() => { setPagina(1); }, [aba, aplicados]);

  const aplicarFiltros = () => { setAplicados({ ...filtros }); setPagina(1); };
  const limparFiltros  = () => { setFiltros(FILTROS_VAZIOS); setAplicados(FILTROS_VAZIOS); setPagina(1); };

  const exportarCSV = () => {
    const headers = ['Data/Hora', 'Usuário', 'Perfil', 'Módulo', 'Ação', 'Entidade', 'ID', 'Descrição', 'Obra', 'IP', 'Criticidade'];
    const rows = logs.map(l => [
      fmt(l.created_at), l.user_nome, l.user_perfil, l.modulo, l.acao,
      l.entidade_tipo, l.entidade_id, l.descricao, l.obra_nome, l.ip, l.criticidade
    ].map(v => `"${(v || '').toString().replace(/"/g, '""')}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `auditoria_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  };

  const buscarRegistro = async () => {
    if (!regBusca.tipo || !regBusca.id) return;
    setRegLoading(true);
    const { data } = await auditoriaService.historicoPorRegistro(regBusca.tipo, regBusca.id);
    setRegLogs(data || []);
    setRegLoading(false);
  };

  const totalPaginas = Math.max(1, Math.ceil(total / PER_PAGE));
  const inputStyle = { padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 12.5, color: 'var(--text)', outline: 'none', width: '100%' };
  const ABAS = [
    { id: 'timeline',   label: 'Linha do Tempo' },
    { id: 'criticos',   label: 'Eventos Críticos', badge: criticosCount },
    { id: 'registro',   label: 'Histórico por Registro' },
    { id: 'relatorios', label: 'Relatórios de Auditoria' },
  ];

  return (
    <div>
      {/* Cabeçalho */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#ede9fe', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Icon name="shield" size={22} style={{ color: '#7c3aed' }} />
          </div>
          <div>
            <h1 className="page-title">Auditoria do Sistema</h1>
            <div className="page-subtitle">Acompanhe e consulte todas as ações realizadas no sistema de forma centralizada.</div>
          </div>
        </div>
        {usandoMock && <span style={{ fontSize: 11.5, color: '#d97706', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, padding: '4px 10px' }}>Dados de demonstração — execute o SQL para ativar</span>}
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <KpiCard icon="file" label="Total de Eventos" value={kpis.totalEventos.toLocaleString('pt-BR')} sub="Todos os registros" color="#2563eb" />
        <KpiCard icon="alert" label="Eventos Críticos" value={kpis.eventosCriticos} sub="Últimos 7 dias" color="#b91c1c" />
        <KpiCard icon="clock" label="Última Atualização" value={kpis.ultimaAtualizacao ? new Date(kpis.ultimaAtualizacao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'} sub={kpis.ultimaAtualizacao ? new Date(kpis.ultimaAtualizacao).toLocaleDateString('pt-BR') : '—'} color="#0891b2" />
        <KpiCard icon="calendar" label="Período Retido" value="5 anos" sub="Política atual" color="#16a34a" />
      </div>

      {/* Filtros */}
      <div className="card" style={{ padding: '18px 20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="filter" size={15} style={{ color: 'var(--text-muted)' }} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>Filtros</span>
          </div>
          <button onClick={exportarCSV} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 7, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 500, color: 'var(--text)' }}>
            <Icon name="download" size={13} /> Exportar CSV
          </button>
        </div>

        {/* Linha 1 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10, alignItems: 'end' }}>
          <div>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Período — de</label>
            <input type="date" style={{ ...inputStyle, width: 140 }} value={filtros.dataInicio} onChange={e => setFiltros(f => ({ ...f, dataInicio: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>até</label>
            <input type="date" style={{ ...inputStyle, width: 140 }} value={filtros.dataFim} onChange={e => setFiltros(f => ({ ...f, dataFim: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Módulo</label>
            <select style={inputStyle} value={filtros.modulo} onChange={e => setFiltros(f => ({ ...f, modulo: e.target.value }))}>
              <option value="">Todos os módulos</option>
              {MODULOS.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Ação</label>
            <select style={inputStyle} value={filtros.acao} onChange={e => setFiltros(f => ({ ...f, acao: e.target.value }))}>
              <option value="">Todas as ações</option>
              {ACOES.map(a => <option key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Criticidade</label>
            <select style={inputStyle} value={filtros.criticidade} onChange={e => setFiltros(f => ({ ...f, criticidade: e.target.value }))}>
              <option value="">Todas</option>
              {Object.entries(CRIT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Obra</label>
            <select style={inputStyle} value={filtros.obraId} onChange={e => setFiltros(f => ({ ...f, obraId: e.target.value }))}>
              <option value="">Todas as obras</option>
              {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </select>
          </div>
        </div>

        {/* Linha 2 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Entidade / ID</label>
            <input style={inputStyle} placeholder="Buscar entidade..." value={filtros.entidade} onChange={e => setFiltros(f => ({ ...f, entidade: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>IP</label>
            <input style={inputStyle} placeholder="Buscar IP..." value={filtros.ip} onChange={e => setFiltros(f => ({ ...f, ip: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Busca livre</label>
            <input style={inputStyle} placeholder="Buscar na descrição..." value={filtros.busca} onChange={e => setFiltros(f => ({ ...f, busca: e.target.value }))} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={limparFiltros} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
            Limpar filtros
          </button>
          <button onClick={aplicarFiltros} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--brand)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="filter" size={13} /> Aplicar filtros
          </button>
        </div>
      </div>

      {/* Conteúdo principal + painel de detalhes — altura fixa, alinhamento pelo fundo */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', height: 500 }}>
        <div className="card" style={{ padding: 0, flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Abas */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 4px', flexShrink: 0 }}>
            {ABAS.map(a => (
              <button key={a.id} onClick={() => setAba(a.id)}
                style={{ padding: '13px 16px', border: 'none', borderBottom: aba === a.id ? '2.5px solid var(--brand)' : '2.5px solid transparent', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: aba === a.id ? 700 : 500, color: aba === a.id ? 'var(--brand)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}>
                {a.label}
                {a.badge > 0 && <span style={{ background: '#fee2e2', color: '#b91c1c', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{a.badge}</span>}
              </button>
            ))}
          </div>

          {/* Aba: Linha do Tempo / Eventos Críticos */}
          {(aba === 'timeline' || aba === 'criticos') && (
            <>
              <div style={{ flex: 1, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid var(--border)' }}>
                      {['Data / Hora', 'Usuário', 'Módulo', 'Ação', 'Entidade', 'Descrição', 'Obra', 'IP', 'Criticidade', ''].map(h => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Carregando...</td></tr>
                    ) : logs.length === 0 ? (
                      <tr><td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Nenhum registro encontrado.</td></tr>
                    ) : logs.map((l, i) => (
                      <tr key={l.id} style={{ borderBottom: '1px solid var(--border)', background: evento?.id === l.id ? 'var(--brand-tint)' : i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.012)', cursor: 'pointer' }}
                        onClick={() => setEvento(evento?.id === l.id ? null : l)}>
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: 12 }}>{fmt(l.created_at)}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <Avatar nome={l.user_nome} />
                            <div>
                              <div style={{ fontWeight: 500, fontSize: 12.5 }}>{l.user_nome || '—'}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l.user_perfil || ''}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px' }}><ModBadge modulo={l.modulo} /></td>
                        <td style={{ padding: '10px 12px' }}><AcaoBadge acao={l.acao} /></td>
                        <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)' }}>
                          {l.entidade_tipo && <div>{l.entidade_tipo}</div>}
                          {l.entidade_id && (
                            <div
                              title="Clique para ver histórico completo desta entidade"
                              onClick={(e) => {
                                e.stopPropagation();
                                const tipo = l.entidade_tipo || '';
                                const id   = l.entidade_id;
                                setRegBusca({ tipo, id });
                                setAba('registro');
                                setRegLoading(true);
                                auditoriaService.historicoPorRegistro(tipo, id).then(({ data }) => {
                                  setRegLogs(data || []);
                                  setRegLoading(false);
                                });
                              }}
                              style={{ fontSize: 11, color: 'var(--brand)', cursor: 'pointer', textDecoration: 'underline' }}
                            >
                              ID: {l.entidade_id.length > 8 ? l.entidade_id.slice(0, 8) + '…' : l.entidade_id}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', maxWidth: 240 }}>
                          <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.descricao || '—'}</div>
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{l.obra_nome || '—'}</td>
                        <td style={{ padding: '10px 12px', fontSize: 11.5, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{l.ip || '—'}</td>
                        <td style={{ padding: '10px 12px' }}><CritBadge crit={l.criticidade} /></td>
                        <td style={{ padding: '10px 12px' }}>
                          <Icon name="chevron-right" size={15} style={{ color: 'var(--text-muted)' }} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Paginação — fixa na base */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: 8, flexShrink: 0 }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Mostrando {total === 0 ? 0 : (pagina - 1) * PER_PAGE + 1}–{Math.min(pagina * PER_PAGE, total)} de {total.toLocaleString('pt-BR')} registros
                </span>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <button onClick={() => setPagina(1)} disabled={pagina === 1} style={{ width: 32, height: 32, border: '1px solid var(--border)', borderRadius: 6, background: 'none', cursor: pagina === 1 ? 'default' : 'pointer', opacity: pagina === 1 ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>«</button>
                  <button onClick={() => setPagina(p => p - 1)} disabled={pagina === 1} style={{ width: 32, height: 32, border: '1px solid var(--border)', borderRadius: 6, background: 'none', cursor: pagina === 1 ? 'default' : 'pointer', opacity: pagina === 1 ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
                  {Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => {
                    const pg = Math.max(1, Math.min(totalPaginas - 4, pagina - 2)) + i;
                    if (pg > totalPaginas) return null;
                    return (
                      <button key={pg} onClick={() => setPagina(pg)} style={{ width: 32, height: 32, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: pg === pagina ? 'var(--brand)' : 'none', color: pg === pagina ? '#fff' : 'var(--text)', fontWeight: pg === pagina ? 700 : 400, fontSize: 13 }}>{pg}</button>
                    );
                  })}
                  <button onClick={() => setPagina(p => p + 1)} disabled={pagina === totalPaginas} style={{ width: 32, height: 32, border: '1px solid var(--border)', borderRadius: 6, background: 'none', cursor: pagina === totalPaginas ? 'default' : 'pointer', opacity: pagina === totalPaginas ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
                  <button onClick={() => setPagina(totalPaginas)} disabled={pagina === totalPaginas} style={{ width: 32, height: 32, border: '1px solid var(--border)', borderRadius: 6, background: 'none', cursor: pagina === totalPaginas ? 'default' : 'pointer', opacity: pagina === totalPaginas ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>»</button>
                </div>
              </div>
            </>
          )}

          {/* Aba: Histórico por Registro */}
          {aba === 'registro' && (
            <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
              <p style={{ fontSize: 13.5, color: 'var(--text-muted)', marginBottom: 16 }}>Consulte o histórico completo de qualquer registro do sistema informando o tipo e ID da entidade.</p>
              <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                <select style={{ ...inputStyle, width: 180 }} value={regBusca.tipo} onChange={e => setRegBusca(b => ({ ...b, tipo: e.target.value }))}>
                  <option value="">Tipo de entidade…</option>
                  {['usuario', 'obra', 'tarefa', 'item_orcamento', 'medicao', 'contrato'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input style={{ ...inputStyle, width: 180 }} placeholder="ID da entidade..." value={regBusca.id} onChange={e => setRegBusca(b => ({ ...b, id: e.target.value }))} />
                <button onClick={buscarRegistro} style={{ padding: '7px 18px', borderRadius: 7, border: 'none', background: 'var(--brand)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Buscar histórico</button>
              </div>
              {regLoading && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Buscando...</div>}
              {!regLoading && regLogs.length === 0 && regBusca.tipo && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nenhum histórico encontrado para esta entidade.</div>}
              {regLogs.map((l, i) => (
                <div key={l.id} style={{ display: 'flex', gap: 14, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ width: 3, background: CRIT[l.criticidade]?.text || '#9ca3af', borderRadius: 2, flexShrink: 0, alignSelf: 'stretch' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmt(l.created_at)}</span>
                      <ModBadge modulo={l.modulo} />
                      <AcaoBadge acao={l.acao} />
                    </div>
                    <div style={{ fontSize: 13 }}>{l.descricao}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 3 }}>{l.user_nome} · {l.ip || 'IP não disponível'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Aba: Relatórios */}
          {aba === 'relatorios' && (
            <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {[
                { icon: 'file', color: '#2563eb', title: 'Auditoria Completa', desc: 'Registra todas as ações críticas em todos os módulos do sistema de forma automática.' },
                { icon: 'clock', color: '#16a34a', title: 'Histórico por Registro', desc: 'Consulte o histórico completo de qualquer registro do sistema de forma detalhada.' },
                { icon: 'shield', color: '#7c3aed', title: 'Segurança e Compliance', desc: 'Logs imutáveis, criptografados e protegidos contra alterações ou exclusões.' },
                { icon: 'alert', color: '#d97706', title: 'Alertas Inteligentes', desc: 'Seja notificado sobre eventos críticos e atividades suspeitas em tempo real.' },
                { icon: 'chart', color: '#0891b2', title: 'Relatórios e Exportação', desc: 'Gere relatórios personalizados e exporte os dados em Excel, PDF ou CSV.' },
              ].map(f => (
                <div key={f.title} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '18px', display: 'flex', gap: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: f.color + '15', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <Icon name={f.icon} size={20} style={{ color: f.color }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6, color: f.color }}>{f.title}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Painel de detalhes — mesma altura do card, alinhado pelo fundo */}
        {evento && (
          <div style={{ width: 340, flexShrink: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>Detalhes do Evento</span>
              <button onClick={() => setEvento(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)', lineHeight: 1, padding: 0 }}>×</button>
            </div>
            <div style={{ padding: '14px 16px', overflowY: 'auto', flex: 1 }}>
              <CritBadge crit={evento.criticidade} />
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
                {[
                  ['Data/Hora',  fmt(evento.created_at)],
                  ['Usuário',    `${evento.user_nome || '—'} (${evento.user_perfil || '—'})`],
                  ['Módulo',     evento.modulo],
                  ['Ação',       evento.acao],
                  ['Entidade',   evento.entidade_tipo ? `${evento.entidade_tipo} (ID: ${evento.entidade_id || '—'})` : '—'],
                  ['Obra',       evento.obra_nome || '—'],
                  ['IP',         evento.ip || '—'],
                  ['Navegador',  evento.navegador || '—'],
                  ['Sistema',    evento.sistema || '—'],
                  ['Origem',     evento.origem || 'Web'],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', gap: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 80, flexShrink: 0 }}>{k}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 500, wordBreak: 'break-all' }}>{v}</span>
                  </div>
                ))}
              </div>

              {evento.descricao && (
                <div style={{ marginTop: 14, padding: '10px', background: 'var(--surface-muted)', borderRadius: 8 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Descrição</div>
                  <div style={{ fontSize: 13, lineHeight: 1.5 }}>{evento.descricao}</div>
                </div>
              )}

              {(evento.valor_anterior || evento.valor_novo) && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Alterações</div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ padding: '7px 10px', background: '#fef2f2', fontSize: 11.5, fontWeight: 700, color: '#b91c1c', borderRight: '1px solid var(--border)' }}>Valor Anterior</div>
                      <div style={{ padding: '7px 10px', background: '#f0fdf4', fontSize: 11.5, fontWeight: 700, color: '#15803d' }}>Valor Novo</div>
                    </div>
                    {(() => {
                      const ant = evento.valor_anterior || {};
                      const nov = evento.valor_novo || {};
                      const keys = [...new Set([...Object.keys(ant), ...Object.keys(nov)])];
                      return keys.map(k => (
                        <div key={k} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ padding: '6px 10px', fontSize: 12, borderRight: '1px solid var(--border)' }}>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{k}</div>
                            <div style={{ color: '#b91c1c' }}>{ant[k] ?? '—'}</div>
                          </div>
                          <div style={{ padding: '6px 10px', fontSize: 12 }}>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{k}</div>
                            <div style={{ color: '#15803d' }}>{nov[k] ?? '—'}</div>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              )}

              {(evento.sessao_id || evento.duracao_ms) && (
                <div style={{ marginTop: 14, padding: '10px', background: 'var(--surface-muted)', borderRadius: 8 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Informações Adicionais</div>
                  {evento.sessao_id && <div style={{ fontSize: 12, marginBottom: 4 }}><span style={{ color: 'var(--text-muted)' }}>ID da Sessão: </span><span style={{ fontFamily: 'monospace', fontSize: 11 }}>{evento.sessao_id}</span></div>}
                  {evento.duracao_ms && <div style={{ fontSize: 12 }}><span style={{ color: 'var(--text-muted)' }}>Duração da Ação: </span>{(evento.duracao_ms / 1000).toFixed(3)}s</div>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom feature cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginTop: 20 }}>
        {[
          { icon: 'file',    color: '#2563eb', title: 'Auditoria Completa',    desc: 'Registra todas as ações críticas em todos os módulos do sistema de forma automática.' },
          { icon: 'clock',   color: '#16a34a', title: 'Histórico por Registro', desc: 'Consulte o histórico completo de qualquer registro do sistema de forma detalhada e organizada.' },
          { icon: 'shield',  color: '#7c3aed', title: 'Segurança e Compliance', desc: 'Logs imutáveis, criptografados e protegidos contra alterações ou exclusões.' },
          { icon: 'alert',   color: '#d97706', title: 'Alertas Inteligentes',   desc: 'Seja notificado sobre eventos críticos e atividades suspeitas em tempo real.' },
          { icon: 'chart',   color: '#0891b2', title: 'Relatórios e Exportação', desc: 'Gere relatórios personalizados e exporte os dados em Excel, PDF ou CSV.' },
        ].map(f => (
          <div key={f.title} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px', display: 'flex', gap: 12 }}>
            <Icon name={f.icon} size={20} style={{ color: f.color, flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: f.color, marginBottom: 5 }}>{f.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{f.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
