import { supabase } from '../../services/supabase';
import { auditoriaService } from './auditoria.service';

const registrar = async (campos) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return;
  const u = session.user;
  auditoriaService.registrar({ userId: u.id, userNome: u.email, userPerfil: 'usuario', ...campos });
};

export const usuariosService = {
  // Paginado + busca/status no servidor (teto de 100 por página).
  // funcaoId: '' = todas, 'sem' = usuários sem função, ou o id de uma função. Só passar com a
  // migration de funções aplicada (a coluna funcao_id precisa existir).
  listar: ({ page = 1, perPage = 10, busca = '', status = '', funcaoId = '' } = {}) => {
    const pp = Math.min(Math.max(1, Number(perPage) || 10), 100);
    let q = supabase
      .from('user_profiles')
      .select('*, user_obras(obra_id)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * pp, page * pp - 1);
    if (status && status !== 'todos') q = q.eq('status', status);
    if (funcaoId === 'sem') q = q.is('funcao_id', null);
    else if (funcaoId) q = q.eq('funcao_id', funcaoId);
    if (busca) {
      // Sanitiza a busca antes de interpolar no filtro PostgREST: remove os
      // metacaracteres do grammar do .or() (vírgula, parênteses, aspas, barra) e
      // os curingas do LIKE (% *). Evita injeção/quebra do filtro. Nomes e e-mails
      // legítimos não usam esses caracteres.
      const termo = String(busca).replace(/[,()"\\%*]/g, ' ').trim();
      if (termo) q = q.or(`nome.ilike.%${termo}%,email.ilike.%${termo}%`);
    }
    return q;
  },

  buscarPorId: (id) =>
    supabase
      .from('user_profiles')
      .select('*, user_obras(obra_id)')
      .eq('id', id)
      .single(),

  criar: async (dados, obraIds = []) => {
    // Login é 100% SSO (Microsoft): não há senha. Aqui apenas autorizamos o e-mail
    // gravando o perfil. A conta de auth é criada pela Microsoft no 1º login e o
    // vínculo é feito por e-mail. O RLS profiles_admin_write permite ao admin inserir.
    const { data, error } = await supabase
      .from('user_profiles')
      .insert({
        nome: dados.nome,
        email: dados.email,
        telefone: dados.telefone,
        perfil: dados.perfil,
        status: dados.status,
        modulos_ids: dados.modulos_ids ?? [],
        abas_ids: dados.abas_ids ?? [],
        modulos_readonly_ids: dados.modulos_readonly_ids ?? [],
        abas_readonly_ids: dados.abas_readonly_ids ?? [],
        deve_alterar_senha: false,
        // Só vai no insert quando o chamador informa (a coluna só existe com a migration de funções
        // aplicada; sem ela, mandar a chave quebraria o cadastro inteiro).
        ...(dados.funcao_id !== undefined ? { funcao_id: dados.funcao_id } : {}),
      })
      .select()
      .single();
    if (error) return { data: null, error };
    // Vincula as obras autorizadas (usa o id gerado do novo perfil)
    if (obraIds.length) {
      const { error: vincErr } = await usuariosService.vincularObras(data.id, obraIds);
      if (vincErr) return { data, error: vincErr };
    }
    registrar({
      modulo: 'usuarios', acao: 'criou',
      entidadeTipo: 'usuario', entidadeId: String(data?.id || ''),
      descricao: `Autorizou o acesso de "${dados.nome}" (${dados.perfil}) via SSO`,
      valorNovo: { nome: dados.nome, perfil: dados.perfil, status: dados.status },
      criticidade: 'alta',
    });
    return { data, error: null };
  },

  atualizar: async (id, dados) => {
    const res = await supabase
      .from('user_profiles')
      .update({ ...dados, modulos_ids: dados.modulos_ids ?? [], abas_ids: dados.abas_ids ?? [], modulos_readonly_ids: dados.modulos_readonly_ids ?? [], abas_readonly_ids: dados.abas_readonly_ids ?? [], updated_at: new Date().toISOString() })
      .eq('id', id);
    if (!res.error) registrar({
      modulo: 'usuarios', acao: 'editou',
      entidadeTipo: 'usuario', entidadeId: String(id),
      descricao: `Atualizou o usuário "${dados.nome || id}"`,
      // alteração de perfil muda nível de acesso — criticidade elevada
      criticidade: dados.perfil ? 'critica' : 'media',
    });
    return res;
  },

  excluir: async (id) => {
    const res = await supabase.from('user_profiles').delete().eq('id', id);
    if (!res.error) registrar({
      modulo: 'usuarios', acao: 'excluiu',
      entidadeTipo: 'usuario', entidadeId: String(id),
      descricao: `Excluiu o usuário ID ${id}`,
      criticidade: 'critica',
    });
    return res;
  },

  vincularObras: (userId, obraIds) =>
    supabase
      .from('user_obras')
      .insert(obraIds.map(obra_id => ({ user_id: userId, obra_id }))),

  desvincularObras: (userId) =>
    supabase.from('user_obras').delete().eq('user_id', userId),

  // ── Catálogo de funções (Apontador, Engenheiro...): só rótulo, só administrador ──────────────
  // A regra do banco (funcoes_usuario_admin) deixa só admin ler e escrever. Escrita sem permissão
  // não dá erro no PostgREST: devolve zero linhas, por isso cada escrita pede .select() e quem
  // chama confere `data.length`. Sem a migration, listarFuncoes volta com erro e a tela esconde
  // o recurso em vez de quebrar.
  listarFuncoes: () => supabase.from('funcoes_usuario').select('id, nome').order('nome'),

  // Quantos usuários usam cada função (para avisar ao excluir). Lê só a coluna funcao_id.
  funcaoDosUsuarios: () => supabase.from('user_profiles').select('funcao_id').not('funcao_id', 'is', null),

  criarFuncao: async (nome) => {
    const res = await supabase.from('funcoes_usuario').insert({ nome }).select('id, nome');
    if (!res.error && res.data?.length) registrar({
      modulo: 'usuarios', acao: 'criou', entidadeTipo: 'funcao_usuario', entidadeId: String(res.data[0].id),
      descricao: `Criou a função de usuário "${nome}"`, valorNovo: { nome }, criticidade: 'media',
    });
    return res;
  },

  renomearFuncao: async (id, nome, nomeAnterior) => {
    const res = await supabase.from('funcoes_usuario').update({ nome }).eq('id', id).select('id, nome');
    if (!res.error && res.data?.length) registrar({
      modulo: 'usuarios', acao: 'editou', entidadeTipo: 'funcao_usuario', entidadeId: String(id),
      descricao: `Renomeou a função de usuário "${nomeAnterior}" para "${nome}"`,
      valorAnterior: { nome: nomeAnterior }, valorNovo: { nome }, criticidade: 'media',
    });
    return res;
  },

  excluirFuncao: async (id, nome) => {
    const res = await supabase.from('funcoes_usuario').delete().eq('id', id).select('id');
    if (!res.error && res.data?.length) registrar({
      modulo: 'usuarios', acao: 'excluiu', entidadeTipo: 'funcao_usuario', entidadeId: String(id),
      descricao: `Excluiu a função de usuário "${nome}"`, valorAnterior: { nome }, criticidade: 'media',
    });
    return res;
  },
};
