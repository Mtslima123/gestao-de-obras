import { supabase } from '../../services/supabase';

// Valor de um item de orçamento. Fonte única: valor_total persistido costuma ser 0,
// pois é calculado em tela (quantidade × valor_unitário) no módulo de Orçamentos.
export const itemValor = (it) =>
  it?.valor_total || (it?.quantidade || 0) * (it?.valor_unitario || 0);

export const vinculoService = {
  // Busca todos os vínculos de uma obra com dados do item do orçamento
  listarPorObra: (obraId) =>
    supabase
      .from('orcamento_cronograma_vinculos')
      .select('*, orcamento_itens(id, codigo, nome, valor_total, quantidade, valor_unitario, orcamento_id)')
      .eq('obra_id', obraId),

  // Versão em lote de listarPorObra — usada por telas que listam várias obras de uma vez
  // (ex.: cards de Obras), evitando uma query por obra.
  listarPorObras: (obraIds) =>
    supabase
      .from('orcamento_cronograma_vinculos')
      .select('*, orcamento_itens(id, codigo, nome, valor_total, quantidade, valor_unitario, orcamento_id)')
      .in('obra_id', obraIds),

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

  // Existe algum vínculo orçamento×cronograma pra QUALQUER item deste orçamento?
  // Usado para bloquear a exclusão de um orçamento vinculado — apagar a linha
  // deixaria o cronograma referenciando um orçamento_item_id que não existe mais,
  // além de perder o rastro de qual valor cobria qual etapa.
  existeVinculoParaOrcamento: async (orcamentoId) => {
    const { data, error } = await supabase
      .from('orcamento_cronograma_vinculos')
      .select('id, orcamento_itens!inner(orcamento_id)')
      .eq('orcamento_itens.orcamento_id', orcamentoId)
      .limit(1);
    return { existe: !!data?.length, error };
  },

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
