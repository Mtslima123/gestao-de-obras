import { supabase } from '../../services/supabase';

export const vinculoService = {
  // Busca todos os vínculos de uma obra com dados do item do orçamento
  listarPorObra: (obraId) =>
    supabase
      .from('orcamento_cronograma_vinculos')
      .select('*, orcamento_itens(id, codigo, nome, valor_total, quantidade, valor_unitario, orcamento_id)')
      .eq('obra_id', obraId),

  // Cria um vínculo entre um item do orçamento e uma etapa do cronograma
  criar: (dados, userId) =>
    supabase
      .from('orcamento_cronograma_vinculos')
      .insert([{ ...dados, user_id: userId }]),

  // Remove um vínculo pelo id
  excluir: (id) =>
    supabase
      .from('orcamento_cronograma_vinculos')
      .delete()
      .eq('id', id),

  // Busca todos os itens de orçamento de uma obra (dois passos para compatibilidade)
  itensPorObra: async (obraId) => {
    const { data: orcamentos, error } = await supabase
      .from('orcamentos')
      .select('id')
      .eq('obra_id', obraId);

    if (error || !orcamentos?.length) return { data: [], error };

    const ids = orcamentos.map((o) => o.id);
    return supabase
      .from('orcamento_itens')
      .select('*')
      .in('orcamento_id', ids)
      .order('codigo');
  },
};
