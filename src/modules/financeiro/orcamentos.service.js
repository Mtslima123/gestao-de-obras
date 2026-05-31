import { supabase } from '../../services/supabase';

export const orcamentosService = {
  listar: () =>
    supabase.from('orcamentos').select('*').order('created_at', { ascending: false }),

  buscarPorId: (id) =>
    supabase.from('orcamentos').select('*').eq('id', id).single(),

  criar: (dados, userId) =>
    supabase.from('orcamentos').insert([{ ...dados, user_id: userId }]),

  atualizar: (id, dados) =>
    supabase.from('orcamentos').update(dados).eq('id', id),

  excluir: (id) =>
    supabase.from('orcamentos').delete().eq('id', id),

  itens: {
    listar: (orcamentoId) =>
      supabase.from('orcamento_itens').select('*').eq('orcamento_id', orcamentoId).order('codigo'),

    criar: (itens) =>
      supabase.from('orcamento_itens').insert(itens),
  },
};
