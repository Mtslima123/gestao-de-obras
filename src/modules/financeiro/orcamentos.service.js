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
      supabase.from('orcamento_itens').select('*').eq('orcamento_id', orcamentoId).order('ordem').order('codigo'),

    criar: (itens) =>
      supabase.from('orcamento_itens').insert(itens),

    atualizar: (id, dados) =>
      supabase.from('orcamento_itens').update(dados).eq('id', id),

    excluir: (id) =>
      supabase.from('orcamento_itens').delete().eq('id', id),

    excluirVarios: (ids) =>
      supabase.from('orcamento_itens').delete().in('id', ids),

    upsert: (itens) =>
      supabase.from('orcamento_itens').upsert(itens, { onConflict: 'id' }),
  },
};
