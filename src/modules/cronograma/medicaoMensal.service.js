import { supabase } from '../../services/supabase';
import { logger } from '../../services/logger';

// Boletins de medição mensal (tabela medicoes_mensais), por obra + mês de referência.
// Se a tabela ainda não existir (migration não aplicada pelo TI), as chamadas
// retornam erro e a tela continua funcionando só em memória, sem persistir.

// perc_previsto_acumulado (migration 20260913000001) pode ainda não existir em produção
// (aplicada pelo TI à parte) — PostgREST devolve PGRST204 ("column ... not found in the
// schema cache") pra uma coluna desconhecida no payload. Mesmo padrão de degradação
// graciosa já usado noutro lugar do app pra RPC ainda não migrada (PGRST202).
const colunaAusente = (error) =>
  !!error && (error.code === 'PGRST204' || /column .* (of .* )?(does not exist|not found)/i.test(error.message || ''));

// Tenta o upsert com o payload cheio; se a coluna nova ainda não existir no banco,
// tenta de novo sem `camposNovos` — assim abrir/fechar medição continua funcionando
// (só sem congelar o previsto) até a migration ser aplicada, em vez de quebrar de vez.
async function upsertComFallback(payloadCompleto, camposNovos) {
  let resp = await supabase.from('medicoes_mensais').upsert(payloadCompleto, { onConflict: 'obra_id,mes_referencia' }).select().maybeSingle();
  if (resp.error && colunaAusente(resp.error) && camposNovos.length) {
    const payloadReduzido = { ...payloadCompleto };
    camposNovos.forEach(k => delete payloadReduzido[k]);
    resp = await supabase.from('medicoes_mensais').upsert(payloadReduzido, { onConflict: 'obra_id,mes_referencia' }).select().maybeSingle();
  }
  return resp;
}

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
  //
  // aprovada_em/aprovada_por (migration 20260922000001) podem ainda não existir em
  // produção — sem o fallback, um SELECT pedindo coluna inexistente falha por inteiro
  // (PGRST204) e listarMeses degradaria pra [], apagando o histórico/estado de TODOS os
  // meses da tela até a migration ser aplicada, não só a aprovação. Mesmo padrão de
  // degradação graciosa de upsertComFallback, abaixo, só que pro lado do SELECT.
  async listarMeses(obraId) {
    if (!obraId) return [];
    const colunasCompletas = 'mes_referencia, status, updated_at, fechada_em, fechada_por, aprovada_em, aprovada_por, perc_medido, valor_total_medido';
    const colunasSemAprovacao = 'mes_referencia, status, updated_at, fechada_em, fechada_por, perc_medido, valor_total_medido';
    let { data, error } = await supabase
      .from('medicoes_mensais')
      .select(colunasCompletas)
      .eq('obra_id', obraId)
      .order('mes_referencia', { ascending: false });
    if (error && colunaAusente(error)) {
      ({ data, error } = await supabase
        .from('medicoes_mensais')
        .select(colunasSemAprovacao)
        .eq('obra_id', obraId)
        .order('mes_referencia', { ascending: false }));
    }
    if (error) {
      logger.error('falha ao listar medições da obra', { module: 'medicaoMensal', action: 'listarMeses', obraId, err: error });
      return [];
    }
    return data || [];
  },

  // `previstoCongelado` ({ percPrevisto, percPrevistoAcumulado }) só vem preenchido na
  // ABERTURA do mês (ver abrirMedicao/MedicaoMensal.jsx) — os autosaves seguintes
  // (editar % medido etc.) chamam sem esse argumento, então essas duas colunas ficam
  // de fora do upsert e o valor congelado na abertura nunca é sobrescrito depois.
  async salvarRascunho(obraId, mesReferencia, itens, previstoCongelado) {
    const payload = {
      obra_id: obraId,
      mes_referencia: mesReferencia,
      status: 'rascunho',
      itens: itens.map(i => ({
        id: i.id,
        percMedido: i.percMedido,
        ...(i.foraDoMes ? { manual: true } : {}),
        ...(i.observacao ? { observacao: i.observacao } : {}),
      })),
      ...(previstoCongelado ? {
        perc_previsto: previstoCongelado.percPrevisto,
        perc_previsto_acumulado: previstoCongelado.percPrevistoAcumulado,
      } : {}),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await upsertComFallback(payload, ['perc_previsto', 'perc_previsto_acumulado']);
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
      perc_previsto_acumulado: snapshot.percPrevistoAcumulado,
      fechada_em: new Date().toISOString(),
      fechada_por: fechadaPor || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await upsertComFallback(payload, ['perc_previsto_acumulado']);
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

  // Aprova uma medição já fechada: libera a abertura do mês seguinte (ver
  // anteriorNaoAprovada em MedicaoMensal.jsx). Mesmo motivo de reabrir() pra precisar de
  // RPC (SECURITY DEFINER, supabase/migrations/20260922000001) em vez de update direto —
  // a RESTRICTIVE "medicoes_mensais_no_edit_fechada" só libera UPDATE partindo de
  // rascunho, então fechada->aprovada também seria filtrada silenciosamente.
  async aprovar(obraId, mesReferencia, aprovadaPor) {
    const { data, error } = await supabase
      .rpc('aprovar_medicao_mensal', { p_obra_id: obraId, p_mes_referencia: mesReferencia, p_aprovada_por: aprovadaPor || null })
      .maybeSingle();
    if (error) {
      logger.error('falha ao aprovar medição mensal', { module: 'medicaoMensal', action: 'aprovar', obraId, mesReferencia, err: error });
      return { data: null, error };
    }
    return { data, error: null };
  },

  // Desfaz a aprovação: volta pra 'fechada' (não pra 'rascunho' direto — reabrir() é o
  // passo seguinte, separado, se também precisar destravar o % medido). Mesma RPC
  // dedicada, mesmo motivo.
  async desaprovar(obraId, mesReferencia) {
    const { data, error } = await supabase
      .rpc('desaprovar_medicao_mensal', { p_obra_id: obraId, p_mes_referencia: mesReferencia })
      .maybeSingle();
    if (error) {
      logger.error('falha ao desaprovar medição mensal', { module: 'medicaoMensal', action: 'desaprovar', obraId, mesReferencia, err: error });
      return { data: null, error };
    }
    return { data, error: null };
  },

  // Apaga o boletim inteiro (a linha da tabela) — diferente de salvarRascunho com itens
  // vazios, que continuaria contando como "medição aberta". Sem policy própria por status:
  // a RESTRICTIVE de DELETE (medicoes_mensais_ro_del) só olha pro modo somente-leitura do
  // módulo, então isso apaga tanto rascunho quanto fechada — a tela só oferece o botão pra
  // medição em rascunho (ver `bloqueado` em MedicaoMensal.jsx).
  async excluir(obraId, mesReferencia) {
    const { data, error } = await supabase
      .from('medicoes_mensais')
      .delete()
      .eq('obra_id', obraId)
      .eq('mes_referencia', mesReferencia)
      .select();
    if (error) {
      logger.error('falha ao excluir medição mensal', { module: 'medicaoMensal', action: 'excluir', obraId, mesReferencia, err: error });
      return { data: null, error };
    }
    return { data, error: null };
  },
};
