import { supabase } from '../../services/supabase';

export const auditoriaService = {
  // Busca logs paginados com filtros opcionais
  listar: async ({ dataInicio, dataFim, userId, obraId, modulo, acao, criticidade, busca, entidade, page = 1, perPage = 10 } = {}) => {
    let q = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * perPage, page * perPage - 1);

    if (dataInicio) q = q.gte('created_at', dataInicio + 'T00:00:00Z');
    if (dataFim)    q = q.lte('created_at', dataFim   + 'T23:59:59Z');
    if (userId)     q = q.eq('user_id', userId);
    if (obraId)     q = q.eq('obra_id', obraId);
    if (modulo)     q = q.eq('modulo', modulo);
    if (acao)       q = q.eq('acao', acao);
    if (criticidade) q = q.eq('criticidade', criticidade);
    if (busca)      q = q.ilike('descricao', `%${busca}%`);
    if (entidade)   q = q.or(`entidade_tipo.ilike.%${entidade}%,entidade_id.ilike.%${entidade}%,descricao.ilike.%${entidade}%`);

    return q;
  },

  // KPIs consolidados
  kpis: async () => {
    const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) + 'T00:00:00Z';

    const [totalRes, criticosRes, ultimoRes] = await Promise.all([
      supabase.from('audit_logs').select('*', { count: 'exact', head: true }),
      supabase.from('audit_logs').select('*', { count: 'exact', head: true })
        .eq('criticidade', 'critica').gte('created_at', seteDiasAtras),
      supabase.from('audit_logs').select('created_at, user_id')
        .order('created_at', { ascending: false }).limit(1),
    ]);

    return {
      totalEventos:      totalRes.count   ?? 0,
      eventosCriticos:   criticosRes.count ?? 0,
      ultimaAtualizacao: ultimoRes.data?.[0]?.created_at ?? null,
    };
  },

  // Histórico de uma entidade específica
  historicoPorRegistro: (entidadeTipo, entidadeId) =>
    supabase
      .from('audit_logs')
      .select('*')
      .eq('entidade_tipo', entidadeTipo)
      .eq('entidade_id', entidadeId)
      .order('created_at', { ascending: false }),

  // Registra um evento de auditoria (chamado pelos outros módulos)
  registrar: async (evento) => {
    const { data, error } = await supabase.from('audit_logs').insert([{
      user_id:        evento.userId        ?? null,
      user_nome:      evento.userNome      ?? null,
      user_perfil:    evento.userPerfil    ?? null,
      obra_id:        evento.obraId        ?? null,
      obra_nome:      evento.obraNome      ?? null,
      modulo:         evento.modulo,
      acao:           evento.acao,
      entidade_tipo:  evento.entidadeTipo  ?? null,
      entidade_id:    String(evento.entidadeId ?? ''),
      descricao:      evento.descricao     ?? null,
      valor_anterior: evento.valorAnterior ?? null,
      valor_novo:     evento.valorNovo     ?? null,
      criticidade:    evento.criticidade   ?? 'media',
      origem:         'Web',
    }]);
    if (error) console.error('[Auditoria] ERRO:', error.message, error.code, evento);
    else console.log('[Auditoria] OK:', evento.modulo, evento.acao);
    return { data, error };
  },
};
