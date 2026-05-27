import { supabase } from '../../services/supabase';

export const obrasService = {
  listar: () =>
    supabase.from('obras').select('*').order('created_at', { ascending: false }),

  buscarPorId: (id) =>
    supabase.from('obras').select('*').eq('id', id).single(),

  criar: (dados, userId) =>
    supabase.from('obras').insert([{ ...dados, user_id: userId }]),

  atualizar: (id, dados) =>
    supabase.from('obras').update(dados).eq('id', id),

  excluir: (id) =>
    supabase.from('obras').delete().eq('id', id),
};
