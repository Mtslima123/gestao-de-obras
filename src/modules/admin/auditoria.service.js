import { supabase } from '../../services/supabase';
import { logger } from '../../services/logger';

// IP público do navegador, resolvido uma vez por sessão (evita repetir a chamada externa
// a cada evento de auditoria) e reaproveitado em todo insert seguinte. Falha (rede,
// bloqueador etc.) não impede o registro do evento — só fica sem IP, como já era.
let ipCache = null;
let ipPromise = null;
const obterIp = () => {
  if (ipCache) return Promise.resolve(ipCache);
  if (!ipPromise) {
    ipPromise = fetch('https://api.ipify.org?format=json')
      .then(r => r.json())
      .then(d => { ipCache = d?.ip || null; return ipCache; })
      .catch(() => null);
  }
  return ipPromise;
};

export const auditoriaService = {
  // Busca logs paginados com filtros opcionais
  listar: async ({ dataInicio, dataFim, userId, obraId, modulo, acao, criticidade, busca, entidade, origem, ip, page = 1, perPage = 10 } = {}) => {
    // 🔒 SEGURANÇA [VULN-8]: teto de 100 registros por página — previne dump completo (CWE-400)
    const safePerPage = Math.min(Math.max(1, Number(perPage) || 10), 100);
    let q = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * safePerPage, page * safePerPage - 1);

    if (dataInicio) q = q.gte('created_at', dataInicio + 'T00:00:00Z');
    if (dataFim)    q = q.lte('created_at', dataFim   + 'T23:59:59Z');
    if (userId)     q = q.eq('user_id', userId);
    if (obraId)     q = q.eq('obra_id', obraId);
    if (modulo)     q = q.eq('modulo', modulo);
    if (acao)       q = q.eq('acao', acao);
    if (criticidade) q = q.eq('criticidade', criticidade);
    if (busca)      q = q.ilike('descricao', `%${busca}%`);
    if (entidade)   q = q.or(`entidade_tipo.ilike.%${entidade}%,entidade_id.ilike.%${entidade}%,descricao.ilike.%${entidade}%`);
    if (origem)     q = q.eq('origem', origem);
    if (ip)         q = q.ilike('ip', `%${ip}%`);

    return q;
  },

  // KPIs consolidados. `origem` deve refletir a mesma aba (Operação/Segurança/Todos)
  // selecionada na Linha do Tempo — sem isso, "Total de Eventos" contava a mesma ação
  // duas vezes (a versão 'Web' legível + a versão 'DB-trigger' crua que o banco grava
  // automaticamente pra obras/orçamentos/itens/usuários/fotos), inflando o número pra
  // quase o dobro do que a lista filtrada (padrão: só Operação) realmente mostra.
  kpis: async (origem) => {
    const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) + 'T00:00:00Z';

    let totalQ = supabase.from('audit_logs').select('*', { count: 'exact', head: true });
    let criticosQ = supabase.from('audit_logs').select('*', { count: 'exact', head: true })
      .eq('criticidade', 'critica').gte('created_at', seteDiasAtras);
    let ultimoQ = supabase.from('audit_logs').select('created_at, user_id')
      .order('created_at', { ascending: false }).limit(1);
    if (origem) {
      totalQ    = totalQ.eq('origem', origem);
      criticosQ = criticosQ.eq('origem', origem);
      ultimoQ   = ultimoQ.eq('origem', origem);
    }

    const [totalRes, criticosRes, ultimoRes] = await Promise.all([totalQ, criticosQ, ultimoQ]);

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
    const ip = await obterIp();
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
      ip,
    }]);
    // A auditoria era 100% fire-and-forget: se o insert falhava, o evento (às vezes
    // crítico, ex.: redefinição de senha) sumia sem rastro. Agora deixa registro no log.
    if (error) logger.error('falha ao registrar auditoria', { module: 'auditoria', action: evento.acao, err: error });
    return { data, error };
  },
};
