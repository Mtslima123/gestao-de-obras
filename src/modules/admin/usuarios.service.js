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
  listar: ({ page = 1, perPage = 10, busca = '', status = '' } = {}) => {
    const pp = Math.min(Math.max(1, Number(perPage) || 10), 100);
    let q = supabase
      .from('user_profiles')
      .select('*, user_obras(obra_id)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * pp, page * pp - 1);
    if (status && status !== 'todos') q = q.eq('status', status);
    if (busca) q = q.or(`nome.ilike.%${busca}%,email.ilike.%${busca}%`);
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
        deve_alterar_senha: false,
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
      .update({ ...dados, modulos_ids: dados.modulos_ids ?? [], abas_ids: dados.abas_ids ?? [], modulos_readonly_ids: dados.modulos_readonly_ids ?? [], updated_at: new Date().toISOString() })
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

  redefinirSenha: async (email, novaSenha) => {
    const { data, error } = await supabase.functions.invoke('convidar-usuario', {
      body: { modo: 'redefinir-senha', email, password: novaSenha },
    });
    if (error) return { error };
    if (data?.error) return { error: { message: data.error } };
    registrar({
      modulo: 'usuarios', acao: 'editou',
      entidadeTipo: 'usuario', entidadeId: email,
      descricao: `Admin redefiniu a senha do usuário "${email}"`,
      criticidade: 'critica',
    });
    return { error: null };
  },
};
