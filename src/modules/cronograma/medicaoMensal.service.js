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

  // Todos os meses da obra que já têm medição, aberta (rascunho) ou fechada, mais
  // recente primeiro. Serve para duas coisas: marcar o estado de cada mês no seletor e
  // alimentar o histórico (as fechadas são um filtro em memória). Sem `itens` no select:
  // o JSONB é grande e aqui só interessa o cabeçalho de cada medição.
  async listarMeses(obraId) {
    if (!obraId) return [];
    const { data, error } = await supabase
      .from('medicoes_mensais')
      .select('mes_referencia, status, updated_at, fechada_em, fechada_por, perc_medido, valor_total_medido')
      .eq('obra_id', obraId)
      .order('mes_referencia', { ascending: false });
    if (error) {
      logger.error('falha ao listar medições da obra', { module: 'medicaoMensal', action: 'listarMeses', obraId, err: error });
      return [];
    }
    return data || [];
  },

  async salvarRascunho(obraId, mesReferencia, itens) {
    const payload = {
      obra_id: obraId,
      mes_referencia: mesReferencia,
      status: 'rascunho',
      itens: itens.map(i => ({ id: i.id, percMedido: i.percMedido, ...(i.foraDoMes ? { manual: true } : {}) })),
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

  // `snapshot` (buildSnapshotFechamento) congela os valores medidos: sem isso os R$ de
  // uma medição fechada seriam recalculados se o cronograma mudasse depois.
  async fechar(obraId, mesReferencia, snapshot, fechadaPor) {
    const payload = {
      obra_id: obraId,
      mes_referencia: mesReferencia,
      status: 'fechada',
      itens: snapshot.itens,
      valor_total_medido: snapshot.valorTotalMedido,
      perc_medido: snapshot.percMedido,
      perc_previsto: snapshot.percPrevisto,
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

  // Reabre uma medição fechada: volta pra rascunho e libera os % medido pra edição de
  // novo. Mantém os itens/valores congelados no fechamento como ponto de partida do
  // rascunho (o usuário ajusta a partir daí) e o histórico de quem/quando fechou por
  // último (fechada_em/fechada_por só são sobrescritos no próximo fechamento).
  //
  // Precisa ser via RPC (não um .update() direto): a policy RESTRICTIVE
  // "medicoes_mensais_no_edit_fechada" só libera UPDATE quando a linha já está em
  // rascunho — de propósito, pra proteger o snapshot congelado de uma medição fechada.
  // Um .update() aqui seria filtrado silenciosamente pelo RLS (0 linhas, sem erro) e
  // pareceria sucesso sem mudar nada. A função reabrir_medicao_mensal (SECURITY
  // DEFINER, ver supabase/migrations/20260823000001_reabrir_medicao_mensal.sql) é o
  // único caminho autorizado pra essa transição específica.
  async reabrir(obraId, mesReferencia) {
    const { data, error } = await supabase
      .rpc('reabrir_medicao_mensal', { p_obra_id: obraId, p_mes_referencia: mesReferencia })
      .maybeSingle();
    if (error) {
      logger.error('falha ao reabrir medição mensal', { module: 'medicaoMensal', action: 'reabrir', obraId, mesReferencia, err: error });
      return { data: null, error };
    }
    return { data, error: null };
  },
};
