import React from 'react';
import { Icon } from '../../components/Icons';
import { AppData } from '../../utils/data';

const MOCK_USUARIOS = [
  { id: 'USR-001', nome: 'Administrador Sistema', email: 'admin@empresa.com.br', telefone: '', perfil: 'admin', obrasIds: [], status: 'ativo', dataCadastro: '10/01/2024', ultimoAcesso: '24/05/2024 09:15' },
  { id: 'USR-002', nome: 'João da Silva', email: 'joao.silva@empresa.com.br', telefone: '(11) 99999-0001', perfil: 'usuario', obrasIds: ['OB-001', 'OB-002'], status: 'ativo', dataCadastro: '15/01/2024', ultimoAcesso: '23/05/2024 16:40' },
  { id: 'USR-003', nome: 'Maria Oliveira', email: 'maria.oliveira@empresa.com.br', telefone: '(11) 99999-0002', perfil: 'usuario', obrasIds: ['OB-001', 'OB-003', 'OB-004'], status: 'ativo', dataCadastro: '20/01/2024', ultimoAcesso: '22/05/2024 11:30' },
  { id: 'USR-004', nome: 'Carlos Souza', email: 'carlos.souza@empresa.com.br', telefone: '(11) 99999-0003', perfil: 'usuario', obrasIds: ['OB-002'], status: 'inativo', dataCadastro: '05/02/2024', ultimoAcesso: '10/05/2024 08:20' },
  { id: 'USR-005', nome: 'Fernanda Lima', email: 'fernanda.lima@empresa.com.br', telefone: '(11) 99999-0004', perfil: 'usuario', obrasIds: ['OB-001', 'OB-002', 'OB-003', 'OB-005'], status: 'ativo', dataCadastro: '12/02/2024', ultimoAcesso: '24/05/2024 07:50' },
];

const FORM_VAZIO = { nome: '', email: '', telefone: '', status: 'ativo', perfil: 'usuario', obrasIds: [] };
const PER_PAGE = 10;

const BadgePerfil = ({ perfil }) => (
  <span style={{
    display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
    background: perfil === 'admin' ? 'var(--brand-tint)' : '#f1f5f9',
    color: perfil === 'admin' ? 'var(--brand)' : '#64748b',
    border: `1px solid ${perfil === 'admin' ? 'var(--brand)' : '#e2e8f0'}`,
  }}>
    {perfil === 'admin' ? 'Administrador' : 'Usuário'}
  </span>
);

const BadgeStatus = ({ status }) => (
  <span style={{
    display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
    background: status === 'ativo' ? '#dcfce7' : '#fee2e2',
    color: status === 'ativo' ? '#15803d' : '#b91c1c',
  }}>
    {status === 'ativo' ? 'Ativo' : 'Inativo'}
  </span>
);

const UsuariosScreen = ({ obras = [] }) => {
  const listaObras = obras.length > 0 ? obras : AppData.obras;

  const [usuarios, setUsuarios] = React.useState(MOCK_USUARIOS);
  const [editando, setEditando] = React.useState(null);
  const [search, setSearch] = React.useState('');
  const [filterStatus, setFilterStatus] = React.useState('todos');
  const [pagina, setPagina] = React.useState(1);
  const [form, setForm] = React.useState(FORM_VAZIO);
  const [obraSearch, setObraSearch] = React.useState('');
  const [salvando, setSalvando] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(null);
  const formRef = React.useRef(null);

  const filtrados = React.useMemo(() =>
    usuarios
      .filter(u => filterStatus === 'todos' || u.status === filterStatus)
      .filter(u => !search || (u.nome + u.email).toLowerCase().includes(search.toLowerCase())),
    [usuarios, filterStatus, search]
  );

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / PER_PAGE));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const paginados = filtrados.slice((paginaAtual - 1) * PER_PAGE, paginaAtual * PER_PAGE);

  React.useEffect(() => { setPagina(1); }, [search, filterStatus]);

  const obrasFiltradas = React.useMemo(() =>
    obraSearch ? listaObras.filter(o => o.nome.toLowerCase().includes(obraSearch.toLowerCase())) : listaObras,
    [listaObras, obraSearch]
  );

  const todasSelecionadas = obrasFiltradas.length > 0 && obrasFiltradas.every(o => form.obrasIds.includes(o.id));

  const abrirForm = (usuario) => {
    if (usuario === 'novo') {
      setForm(FORM_VAZIO);
    } else {
      setForm({ nome: usuario.nome, email: usuario.email, telefone: usuario.telefone || '', status: usuario.status, perfil: usuario.perfil, obrasIds: [...(usuario.obrasIds || [])] });
    }
    setEditando(usuario);
    setObraSearch('');
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  const fecharForm = () => { setEditando(null); setForm(FORM_VAZIO); setObraSearch(''); };

  const handleSalvar = async () => {
    if (!form.nome.trim() || !form.email.trim()) return;
    setSalvando(true);
    await new Promise(r => setTimeout(r, 350));
    if (editando === 'novo') {
      setUsuarios(prev => [{
        ...form,
        id: 'USR-' + String(Date.now()).slice(-4),
        dataCadastro: new Date().toLocaleDateString('pt-BR'),
        ultimoAcesso: '—',
      }, ...prev]);
    } else {
      setUsuarios(prev => prev.map(u => u.id === editando.id ? { ...u, ...form } : u));
    }
    setSalvando(false);
    fecharForm();
  };

  const handleExcluir = (u) => {
    setUsuarios(prev => prev.filter(x => x.id !== u.id));
    setConfirmDelete(null);
    if (editando && editando !== 'novo' && editando.id === u.id) fecharForm();
  };

  const toggleObra = (obraId) => {
    setForm(f => ({
      ...f,
      obrasIds: f.obrasIds.includes(obraId) ? f.obrasIds.filter(id => id !== obraId) : [...f.obrasIds, obraId],
    }));
  };

  const toggleTodas = () => {
    const ids = obrasFiltradas.map(o => o.id);
    setForm(f => ({
      ...f,
      obrasIds: todasSelecionadas ? f.obrasIds.filter(id => !ids.includes(id)) : [...new Set([...f.obrasIds, ...ids])],
    }));
  };

  const obrasLabel = (u) => {
    if (u.perfil === 'admin') return 'Todas as obras';
    const n = (u.obrasIds || []).length;
    return n === 0 ? 'Nenhuma' : n === 1 ? '1 obra' : `${n} obras`;
  };

  return (
    <div>
      {/* Cabeçalho */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--brand-tint)', color: 'var(--brand)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Icon name="user" size={22} />
          </div>
          <div>
            <h1 className="page-title">Configurações / Usuários</h1>
            <div className="page-subtitle">Gerencie os usuários do sistema e defina o acesso às obras.</div>
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => abrirForm('novo')}>
            <Icon name="plus" size={15} /> Novo Usuário
          </button>
        </div>
      </div>

      {/* Lista */}
      <div className="card" style={{ marginBottom: 24, padding: '24px 24px' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600 }}>Lista de Usuários</h3>
        <div className="row" style={{ gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220, maxWidth: 380 }}>
            <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input className="input" style={{ paddingLeft: 32, width: '100%' }} placeholder="Buscar por nome ou e-mail..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="input" style={{ width: 180 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="todos">Todos os status</option>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </select>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                {['Nome', 'E-mail', 'Perfil', 'Obras Liberadas', 'Status', 'Data de Cadastro', 'Último Acesso', 'Ações'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 12.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginados.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '48px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>Nenhum usuário encontrado.</td></tr>
              ) : paginados.map((u, i) => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.012)' }}>
                  <td style={{ padding: '11px 12px', fontWeight: 500 }}>{u.nome}</td>
                  <td style={{ padding: '11px 12px', color: 'var(--text-muted)' }}>{u.email}</td>
                  <td style={{ padding: '11px 12px' }}><BadgePerfil perfil={u.perfil} /></td>
                  <td style={{ padding: '11px 12px', color: 'var(--text-muted)' }}>{obrasLabel(u)}</td>
                  <td style={{ padding: '11px 12px' }}><BadgeStatus status={u.status} /></td>
                  <td style={{ padding: '11px 12px', color: 'var(--text-muted)' }}>{u.dataCadastro}</td>
                  <td style={{ padding: '11px 12px', color: 'var(--text-muted)' }}>{u.ultimoAcesso}</td>
                  <td style={{ padding: '11px 12px' }}>
                    <div className="row" style={{ gap: 4 }}>
                      <button className="icon-btn" title="Editar" onClick={() => abrirForm(u)}>
                        <Icon name="edit" size={15} style={{ color: 'var(--brand)' }} />
                      </button>
                      <button className="icon-btn" title="Excluir" onClick={() => setConfirmDelete(u)}>
                        <Icon name="trash" size={15} style={{ color: '#b91c1c' }} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 14, flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Mostrando {filtrados.length === 0 ? 0 : (paginaAtual - 1) * PER_PAGE + 1}–{Math.min(paginaAtual * PER_PAGE, filtrados.length)} de {filtrados.length} usuário{filtrados.length !== 1 ? 's' : ''}
          </span>
          {totalPaginas > 1 && (
            <div className="row" style={{ gap: 4 }}>
              <button className="icon-btn" disabled={paginaAtual === 1} onClick={() => setPagina(1)}><Icon name="chevron-left" size={13} /><Icon name="chevron-left" size={13} style={{ marginLeft: -6 }} /></button>
              <button className="icon-btn" disabled={paginaAtual === 1} onClick={() => setPagina(p => p - 1)}><Icon name="chevron-left" size={14} /></button>
              {Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => {
                const pg = Math.max(1, Math.min(totalPaginas - 4, paginaAtual - 2)) + i;
                if (pg > totalPaginas) return null;
                return (
                  <button key={pg} onClick={() => setPagina(pg)}
                    style={{ minWidth: 32, height: 32, borderRadius: 6, border: '1px solid var(--border)', background: pg === paginaAtual ? 'var(--brand)' : 'transparent', color: pg === paginaAtual ? '#fff' : 'var(--text)', cursor: 'pointer', fontSize: 13, fontWeight: pg === paginaAtual ? 600 : 400 }}>
                    {pg}
                  </button>
                );
              })}
              <button className="icon-btn" disabled={paginaAtual === totalPaginas} onClick={() => setPagina(p => p + 1)}><Icon name="chevron-right" size={14} /></button>
              <button className="icon-btn" disabled={paginaAtual === totalPaginas} onClick={() => setPagina(totalPaginas)}><Icon name="chevron-right" size={13} /><Icon name="chevron-right" size={13} style={{ marginLeft: -6 }} /></button>
            </div>
          )}
        </div>
      </div>

      {/* Formulário Cadastro / Edição */}
      {editando && (
        <div ref={formRef} className="card" style={{ padding: '24px 24px' }}>
          <h3 style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 600 }}>
            {editando === 'novo' ? 'Cadastro de Usuário' : 'Edição de Usuário'}
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 1fr 260px', gap: 20, alignItems: 'start' }}>

            {/* Coluna 1 — Dados Básicos */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '20px 18px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>Dados Básicos</div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 5 }}>Nome <span style={{ color: '#b91c1c' }}>*</span></label>
                <input className="input" style={{ width: '100%' }} placeholder="Nome completo" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 5 }}>E-mail <span style={{ color: '#b91c1c' }}>*</span></label>
                <input className="input" style={{ width: '100%' }} type="email" placeholder="email@empresa.com.br" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 5 }}>
                  Telefone <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 11 }}>(opcional)</span>
                </label>
                <input className="input" style={{ width: '100%' }} placeholder="(00) 00000-0000" value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 5 }}>Status <span style={{ color: '#b91c1c' }}>*</span></label>
                <select className="input" style={{ width: '100%' }} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </div>
            </div>

            {/* Coluna 2 — Perfil de Acesso */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '20px 18px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>Perfil de Acesso</div>
              {[
                { value: 'admin', icon: 'shield', label: 'Administrador', desc: 'Acesso total ao sistema. Visualiza todas as obras, módulos e configurações, poderá gerenciar usuários.' },
                { value: 'usuario', icon: 'user', label: 'Usuário', desc: 'Acesso restrito às obras liberadas. Selecione as obras que o usuário poderá acessar.' },
              ].map(opt => (
                <div key={opt.value} onClick={() => setForm(f => ({ ...f, perfil: opt.value }))}
                  style={{ border: `2px solid ${form.perfil === opt.value ? 'var(--brand)' : 'var(--border)'}`, borderRadius: 10, padding: '14px 16px', marginBottom: 10, cursor: 'pointer', background: form.perfil === opt.value ? 'var(--brand-tint)' : 'var(--surface)', transition: 'border-color 0.15s, background 0.15s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${form.perfil === opt.value ? 'var(--brand)' : 'var(--border)'}`, background: form.perfil === opt.value ? 'var(--brand)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {form.perfil === opt.value && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                    </div>
                    <Icon name={opt.icon} size={16} style={{ color: form.perfil === opt.value ? 'var(--brand)' : 'var(--text-muted)' }} />
                    <strong style={{ fontSize: 14, color: form.perfil === opt.value ? 'var(--brand)' : 'var(--text)' }}>{opt.label}</strong>
                  </div>
                  <p style={{ margin: '0 0 0 28px', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>{opt.desc}</p>
                </div>
              ))}
            </div>

            {/* Coluna 3 — Obras Permitidas */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '20px 18px', opacity: form.perfil === 'admin' ? 0.45 : 1, pointerEvents: form.perfil === 'admin' ? 'none' : 'auto', transition: 'opacity 0.2s' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                Obras Permitidas
                {form.perfil === 'admin' && <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--brand)', textTransform: 'none' }}>— Todas (admin)</span>}
              </div>
              <div style={{ position: 'relative', marginBottom: 10 }}>
                <Icon name="search" size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input className="input" style={{ paddingLeft: 28, width: '100%' }} placeholder="Buscar obra..." value={obraSearch} onChange={e => setObraSearch(e.target.value)} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                  <input type="checkbox" checked={todasSelecionadas} onChange={toggleTodas} style={{ cursor: 'pointer', accentColor: 'var(--brand)' }} />
                  Selecionar todas
                </label>
                <button style={{ background: 'none', border: 'none', color: 'var(--brand)', fontSize: 12.5, cursor: 'pointer', padding: 0, fontWeight: 500 }} onClick={() => setForm(f => ({ ...f, obrasIds: [] }))}>
                  Limpar seleção
                </button>
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', maxHeight: 280, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '8px 10px', width: 36, textAlign: 'center', fontWeight: 600, color: 'var(--text-muted)', fontSize: 12 }}>Sel.</th>
                      <th style={{ padding: '8px 10px', width: 80, fontWeight: 600, color: 'var(--text-muted)', fontSize: 12 }}>Código</th>
                      <th style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--text-muted)', fontSize: 12 }}>Obra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {obrasFiltradas.length === 0 ? (
                      <tr><td colSpan={3} style={{ padding: '20px 10px', textAlign: 'center', color: 'var(--text-muted)' }}>Nenhuma obra encontrada.</td></tr>
                    ) : obrasFiltradas.map((o, i) => {
                      const sel = form.obrasIds.includes(o.id);
                      return (
                        <tr key={o.id} onClick={() => toggleObra(o.id)}
                          style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)', cursor: 'pointer', background: sel ? 'var(--brand-tint)' : 'transparent' }}>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                            <input type="checkbox" checked={sel} onChange={() => toggleObra(o.id)} onClick={e => e.stopPropagation()} style={{ cursor: 'pointer', accentColor: 'var(--brand)' }} />
                          </td>
                          <td style={{ padding: '8px 10px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 12 }}>{o.id}</td>
                          <td style={{ padding: '8px 10px', fontWeight: sel ? 500 : 400 }}>{o.nome}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {form.obrasIds.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--brand)', marginTop: 6, fontWeight: 500 }}>
                  {form.obrasIds.length} obra{form.obrasIds.length !== 1 ? 's' : ''} selecionada{form.obrasIds.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>

            {/* Coluna 4 — Painel informativo */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', background: '#f8fafc' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <Icon name="shield" size={16} style={{ color: 'var(--brand)' }} />
                  <strong style={{ fontSize: 13 }}>Regras de Acesso</strong>
                </div>
                <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-muted)' }}>
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>Administrador</div>
                    Acessa todas as obras e todos os módulos sem restrições.
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>Usuário</div>
                    Acessa apenas as obras selecionadas. As obras não autorizadas não aparecerão em nenhum módulo.
                  </div>
                </div>
              </div>

              <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', background: '#f8fafc' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <Icon name="mail" size={16} style={{ color: 'var(--brand)' }} />
                  <strong style={{ fontSize: 13 }}>Fluxo de Convite</strong>
                </div>
                <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.9 }}>
                  <li>Cadastre o usuário informando o e-mail.</li>
                  <li>Defina o perfil e as obras permitidas.</li>
                  <li>Salve o cadastro.</li>
                  <li>O sistema envia um convite por e-mail.</li>
                  <li>O usuário cria a senha no primeiro acesso.</li>
                </ol>
              </div>

              <div style={{ border: '1px solid #fde68a', borderRadius: 10, padding: '14px 16px', background: '#fffbeb' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <Icon name="alert" size={16} style={{ color: '#d97706' }} />
                  <strong style={{ fontSize: 13, color: '#92400e' }}>Auditoria</strong>
                </div>
                <div style={{ fontSize: 12.5, color: '#92400e', lineHeight: 1.6 }}>
                  Todas as alterações são registradas:
                  <ul style={{ margin: '6px 0 0', paddingLeft: 16, lineHeight: 1.9 }}>
                    <li>Usuário criado, editado ou desativado</li>
                    <li>Obras adicionadas ou removidas</li>
                    <li>Perfil alterado</li>
                    <li>Responsável, data e hora da alteração</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Rodapé do formulário */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-ghost" onClick={fecharForm}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSalvar} disabled={salvando || !form.nome.trim() || !form.email.trim()}>
              {salvando
                ? <><span className="login-spinner" style={{ width: 14, height: 14 }} /> Salvando...</>
                : <><Icon name="check" size={15} /> Salvar Usuário</>
              }
            </button>
          </div>
        </div>
      )}

      {/* Modal de confirmação de exclusão */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '28px 32px', maxWidth: 420, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 17 }}>Excluir usuário?</h3>
            <p style={{ margin: '0 0 22px', color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6 }}>
              O usuário <strong>{confirmDelete.nome}</strong> será removido permanentemente do sistema. Esta ação não pode ser desfeita.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Cancelar</button>
              <button className="btn" style={{ background: '#b91c1c', color: '#fff', borderColor: '#b91c1c' }} onClick={() => handleExcluir(confirmDelete)}>
                <Icon name="trash" size={14} /> Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export { UsuariosScreen };
