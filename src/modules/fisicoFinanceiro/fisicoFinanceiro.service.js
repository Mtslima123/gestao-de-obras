import { supabase } from '../../services/supabase';
import { logger } from '../../services/logger';
import { auditoriaService } from '../admin/auditoria.service';

// Fechamentos físico-financeiros mensais (tabela fechamentos_mensais), por obra + mês
// de referência. Sem lifecycle de status (diferente de medicoes_mensais): reimportar o
// mesmo mês simplesmente sobrescreve via upsert — não há RPC nem policy RESTRICTIVE por
// status aqui, só a de somente-leitura por módulo ("fisico-financeiro").

export const fisicoFinanceiroService = {
  // Cabeçalho de todos os meses já importados da obra (sem `itens` — o JSONB é grande e
  // aqui só interessa alimentar o seletor de mês), mais recente primeiro.
  async listarMeses(obraId) {
    if (!obraId) return { data: [], error: null };
    const { data, error } = await supabase
      .from('fechamentos_mensais')
      .select('mes_referencia, nome_arquivo, imported_at, imported_by, updated_at')
      .eq('obra_id', obraId)
      .order('mes_referencia', { ascending: false });
    if (error) {
      logger.error('falha ao listar fechamentos da obra', { module: 'fisicoFinanceiro', action: 'listarMeses', obraId, err: error });
      return { data: [], error };
    }
    return { data: data || [], error: null };
  },

  // Fechamento MAIS RECENTE de cada obra, numa só ida ao banco por etapa (usado pelo
  // Dashboard Executivo pra visão de carteira, sem 1 query por obra) — mesmo critério da tela
  // de detalhe, que abre sempre no último mês importado. Duas etapas: primeiro só os
  // cabeçalhos (leves, sem `itens`) pra descobrir o último mês de cada obra, depois
  // busca o JSONB apenas desses pares obra+mês, em vez de trazer o histórico inteiro.
  async buscarUltimosPorObras(obraIds) {
    if (!obraIds?.length) return { data: [], error: null };
    const { data: cabecalhos, error: errCab } = await supabase
      .from('fechamentos_mensais')
      .select('obra_id, mes_referencia')
      .in('obra_id', obraIds)
      .order('mes_referencia', { ascending: false });
    if (errCab) {
      logger.error('falha ao listar últimos fechamentos da carteira', { module: 'fisicoFinanceiro', action: 'buscarUltimosPorObras', err: errCab });
      return { data: [], error: errCab };
    }
    const ultimoPorObra = {};
    (cabecalhos || []).forEach(c => { if (!ultimoPorObra[c.obra_id]) ultimoPorObra[c.obra_id] = c.mes_referencia; });
    const pares = Object.entries(ultimoPorObra);
    if (!pares.length) return { data: [], error: null };
    const filtro = pares.map(([obra, mes]) => `and(obra_id.eq.${obra},mes_referencia.eq.${mes})`).join(',');
    const { data, error } = await supabase
      .from('fechamentos_mensais')
      .select('obra_id, mes_referencia, itens')
      .or(filtro);
    if (error) {
      logger.error('falha ao buscar últimos fechamentos da carteira', { module: 'fisicoFinanceiro', action: 'buscarUltimosPorObras', err: error });
      return { data: [], error };
    }
    return { data: data || [], error: null };
  },

  async buscarPorMes(obraId, mesReferencia) {
    if (!obraId || !mesReferencia) return { data: null, error: null };
    const { data, error } = await supabase
      .from('fechamentos_mensais')
      .select('*')
      .eq('obra_id', obraId)
      .eq('mes_referencia', mesReferencia)
      .maybeSingle();
    if (error) {
      logger.error('falha ao buscar fechamento mensal', { module: 'fisicoFinanceiro', action: 'buscarPorMes', obraId, mesReferencia, err: error });
      return { data: null, error };
    }
    return { data: data || null, error: null };
  },

  // Upsert simples (onConflict obra_id+mes_referencia) — reimportar o mesmo mês
  // sobrescreve o que já existia. `meta` = { nomeArquivo, obraNome }.
  async salvarImportacao(obraId, mesReferencia, itens, meta = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    const payload = {
      obra_id: obraId,
      mes_referencia: mesReferencia,
      itens,
      nome_arquivo: meta.nomeArquivo || null,
      imported_at: new Date().toISOString(),
      imported_by: session?.user?.email || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('fechamentos_mensais')
      .upsert(payload, { onConflict: 'obra_id,mes_referencia' })
      .select()
      .maybeSingle();
    if (error) {
      logger.error('falha ao salvar importação de fechamento mensal', { module: 'fisicoFinanceiro', action: 'salvarImportacao', obraId, mesReferencia, err: error });
      return { data: null, error };
    }
    // Dado financeiro real da obra — fica rastreado no mesmo log de auditoria que o
    // resto do sistema usa (mesma convenção de registrar() em obras.service.js).
    if (session?.user) {
      auditoriaService.registrar({
        userId: session.user.id, userNome: session.user.email, userPerfil: 'usuario',
        modulo: 'fisico-financeiro', acao: 'importou',
        entidadeTipo: 'fechamento_mensal', entidadeId: `${obraId}/${mesReferencia}`,
        obraId, obraNome: meta.obraNome,
        descricao: `Importou fechamento de ${mesReferencia}${meta.nomeArquivo ? ` ("${meta.nomeArquivo}")` : ''}`,
        criticidade: 'media',
      });
    }
    return { data, error: null };
  },

  async excluir(obraId, mesReferencia, meta = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    const { data, error } = await supabase
      .from('fechamentos_mensais')
      .delete()
      .eq('obra_id', obraId)
      .eq('mes_referencia', mesReferencia)
      .select();
    if (error) {
      logger.error('falha ao excluir fechamento mensal', { module: 'fisicoFinanceiro', action: 'excluir', obraId, mesReferencia, err: error });
      return { data: null, error };
    }
    // Exclusão de dado financeiro real — criticidade 'alta' (mesmo padrão de
    // obras.service.js: excluir é mais grave que criar/atualizar).
    if (session?.user) {
      auditoriaService.registrar({
        userId: session.user.id, userNome: session.user.email, userPerfil: 'usuario',
        modulo: 'fisico-financeiro', acao: 'excluiu',
        entidadeTipo: 'fechamento_mensal', entidadeId: `${obraId}/${mesReferencia}`,
        obraId, obraNome: meta.obraNome,
        descricao: `Excluiu o fechamento de ${mesReferencia}`,
        criticidade: 'alta',
      });
    }
    return { data, error: null };
  },
};
