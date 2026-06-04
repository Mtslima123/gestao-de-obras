import { supabase } from '../../services/supabase';

export const usuariosService = {
  listar: () =>
    supabase.from('user_profiles').select('*, user_obras(obra_id)').order('created_at', { ascending: false }),

  buscarPorId: (id) =>
    supabase.from('user_profiles').select('*, user_obras(obra_id)').eq('id', id).single(),

  criar: (dados) =>
    supabase.from('user_profiles').insert([dados]).select().single(),

  atualizar: (id, dados) =>
    supabase.from('user_profiles').update({ ...dados, updated_at: new Date().toISOString() }).eq('id', id),

  excluir: (id) =>
    supabase.from('user_profiles').delete().eq('id', id),

  vincularObras: (userId, obraIds) =>
    supabase.from('user_obras').insert(obraIds.map(obra_id => ({ user_id: userId, obra_id }))),

  desvincularObras: (userId) =>
    supabase.from('user_obras').delete().eq('user_id', userId),

  registrarAuditoria: (entry) =>
    supabase.from('audit_logs').insert([entry]),
};
