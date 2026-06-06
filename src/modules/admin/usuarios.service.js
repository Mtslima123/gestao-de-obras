import { supabase } from '../../services/supabase';
import { auditoriaService } from './auditoria.service';

const registrar = async (campos) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return;
  const u = session.user;
  auditoriaService.registrar({ userId: u.id, userNome: u.email, userPerfil: 'usuario', ...campos });
};

export const usuariosService = {
  listar: () =>
    supabase
      .from('user_profiles')
      .select('*, user_obras(obra_id)')
      .order('created_at', { ascending: false }),

  buscarPorId: (id) =>
    supabase
      .from('user_profiles')
      .select('*, user_obras(obra_id)')
      .eq('id', id)
      .single(),

  criar: async (dados) => {
    const res = await supabase
      .from('user_profiles')
      .insert([{ ...dados, modulos_ids: dados.modulos_ids ?? [], abas_ids: dados.abas_ids ?? [] }])
      .select()
      .single();
    if (!res.error) registrar({
      modulo: 'usuarios', acao: 'criou',
      entidadeTipo: 'usuario', entidadeId: String(res.data?.id || ''),
      descricao: `Criou o usuário "${dados.nome}" (${dados.perfil})`,
      valorNovo: { nome: dados.nome, perfil: dados.perfil, status: dados.status },
      criticidade: 'alta',
    });
    return res;
  },

  atualizar: async (id, dados) => {
    const res = await supabase
      .from('user_profiles')
      .update({ ...dados, modulos_ids: dados.modulos_ids ?? [], abas_ids: dados.abas_ids ?? [], updated_at: new Date().toISOString() })
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
};
