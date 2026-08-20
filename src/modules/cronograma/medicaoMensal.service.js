import { supabase } from '../../services/supabase';
import { logger } from '../../services/logger';

// Boletins de medição mensal (tabela medicoes_mensais), por obra + mês de referência.
// Se a tabela ainda não existir (migration não aplicada pelo TI), as chamadas
// retornam erro e a tela continua funcionando só em memória, sem persistir.
export const medicaoMensalService = {
  async buscarPorMes(obraId, mesReferencia) {
    if (!obraId || !mesReferencia) return null;
    const { data, error } = await supabase
      .from('medicoes_mensais')
      .select('*')
      .eq('obra_id', obraId)
      .eq('mes_referencia', mesReferencia)
      .maybeSingle();
    if (error) {
      logger.error('falha ao buscar medição mensal', { module: 'medicaoMensal', action: 'buscarPorMes', obraId, mesReferencia, err: error });
      return null;
    }
    return data || null;
  },

  async salvarRascunho(obraId, mesReferencia, itens) {
    const payload = {
      obra_id: obraId,
      mes_referencia: mesReferencia,
      status: 'rascunho',
      itens: itens.map(i => ({ id: i.id, percMedido: i.percMedido })),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('medicoes_mensais')
      .upsert(payload, { onConflict: 'obra_id,mes_referencia' })
      .select()
      .maybeSingle();
    if (error) {
      logger.error('falha ao salvar rascunho de medição', { module: 'medicaoMensal', action: 'salvarRascunho', obraId, mesReferencia, err: error });
      return { data: null, error };
    }
    return { data, error: null };
  },

  async fechar(obraId, mesReferencia, itens, fechadaPor) {
    const payload = {
      obra_id: obraId,
      mes_referencia: mesReferencia,
      status: 'fechada',
      itens: itens.map(i => ({ id: i.id, percMedido: i.percMedido })),
      fechada_em: new Date().toISOString(),
      fechada_por: fechadaPor || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('medicoes_mensais')
      .upsert(payload, { onConflict: 'obra_id,mes_referencia' })
      .select()
      .maybeSingle();
    if (error) {
      logger.error('falha ao fechar medição mensal', { module: 'medicaoMensal', action: 'fechar', obraId, mesReferencia, err: error });
      return { data: null, error };
    }
    return { data, error: null };
  },
};
