import { supabase } from '../../services/supabase';
import { auditoriaService } from '../admin/auditoria.service';

const registrar = async (campos) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return;
  const u = session.user;
  auditoriaService.registrar({ userId: u.id, userNome: u.email, userPerfil: 'usuario', ...campos });
};

export const orcamentosService = {
  // Lista completa (usada pelo modal de novo orçamento p/ saber quais obras já têm orçamento).
  // Ordena pela coluna "Data" exibida na tela (o.data), não por created_at — são campos
  // diferentes (data do orçamento vs. quando a linha foi criada) e podiam divergir,
  // fazendo a lista parecer fora de ordem mesmo "ordenada". created_at como critério de
  // desempate quando duas linhas têm a mesma data.
  // obraIds: null (admin, sem restrição) ou array de obra_id liberadas pro usuário
  // (obrasPermitidas() do userProfile) — evita depender só do RLS pra não vazar
  // orçamento de obra não liberada (a policy orcamentos_own, por autoria, não
  // reflete a obra atual do usuário; ver migration 20260825000002).
  listar: (obraIds = null) => {
    let q = supabase.from('orcamentos').select('*')
      .order('data', { ascending: false })
      .order('created_at', { ascending: false });
    if (obraIds) q = q.in('obra_id', obraIds);
    return q;
  },

  // Paginado no servidor (tela de listagem). Teto de 100 por página.
  listarPaginado: ({ page = 1, perPage = 12, obraIds = null } = {}) => {
    const pp = Math.min(Math.max(1, Number(perPage) || 12), 100);
    let q = supabase.from('orcamentos').select('*', { count: 'exact' });
    if (obraIds) q = q.in('obra_id', obraIds);
    return q
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })
      .range((page - 1) * pp, page * pp - 1);
  },

  buscarPorId: (id) =>
    supabase.from('orcamentos').select('*').eq('id', id).single(),

  // Usado pra bloquear a exclusão do orçamento: se já tem itens na composição,
  // não pode ser apagado (evita perder a composição sem aviso).
  existemItens: async (id) => {
    const { count, error } = await supabase
      .from('orcamento_itens')
      .select('id', { count: 'exact', head: true })
      .eq('orcamento_id', id);
    return { existe: (count || 0) > 0, error };
  },

  criar: async (dados, userId) => {
    const res = await supabase.from('orcamentos').insert([{ ...dados, user_id: userId }]);
    if (!res.error) registrar({
      modulo: 'orcamentos', acao: 'criou',
      entidadeTipo: 'orcamento', entidadeId: String(dados.obra_id || ''),
      obraId: dados.obra_id,
      descricao: `Criou orçamento "${dados.nome || dados.descricao || 'novo'}"`,
      valorNovo: { nome: dados.nome, obra_id: dados.obra_id },
      criticidade: 'media',
    });
    return res;
  },

  atualizar: async (id, dados) => {
    const res = await supabase.from('orcamentos').update(dados).eq('id', id);
    if (!res.error) registrar({
      modulo: 'orcamentos', acao: 'editou',
      entidadeTipo: 'orcamento', entidadeId: String(id),
      obraId: dados.obra_id,
      descricao: `Atualizou orçamento ID ${id}`,
      criticidade: 'media',
    });
    return res;
  },

  // .select() é necessário pra saber se algo foi de fato apagado: a policy de DELETE
  // (orcamentos_own) só libera a linha quando auth.uid() = user_id (só quem criou o
  // orçamento pode excluí-lo) — se não for o dono, o Postgres filtra a linha em
  // silêncio (0 linhas afetadas) e retorna sucesso sem erro. Sem checar `data`, o app
  // mostrava "Orçamento excluído" mesmo sem excluir nada (mesma classe de bug já
  // corrigida em "Reabrir medição", ver commit f743067).
  excluir: async (id) => {
    const res = await supabase.from('orcamentos').delete().eq('id', id).select();
    if (!res.error && res.data?.length) registrar({
      modulo: 'orcamentos', acao: 'excluiu',
      entidadeTipo: 'orcamento', entidadeId: String(id),
      descricao: `Excluiu orçamento ID ${id}`,
      criticidade: 'alta',
    });
    return res;
  },

  itens: {
    listar: (orcamentoId) =>
      supabase.from('orcamento_itens').select('*').eq('orcamento_id', orcamentoId)
        .order('ordem', { ascending: true, nullsFirst: false })
        .order('codigo', { ascending: true }),

    criar: async (itens) => {
      const res = await supabase.from('orcamento_itens').insert(itens);
      if (!res.error) registrar({
        modulo: 'orcamentos', acao: 'criou',
        entidadeTipo: 'item_orcamento', entidadeId: String(itens[0]?.orcamento_id || ''),
        descricao: `Adicionou ${itens.length} item(ns) ao orçamento`,
        criticidade: 'baixa',
      });
      return res;
    },

    atualizar: async (id, dados) => {
      const res = await supabase.from('orcamento_itens').update(dados).eq('id', id);
      if (!res.error) registrar({
        modulo: 'orcamentos', acao: 'editou',
        entidadeTipo: 'item_orcamento', entidadeId: String(id),
        descricao: `Atualizou item de orçamento ID ${id}`,
        valorNovo: { valor_unitario: dados.valor_unitario, quantidade: dados.quantidade },
        criticidade: 'baixa',
      });
      return res;
    },

    excluir: async (id) => {
      const res = await supabase.from('orcamento_itens').delete().eq('id', id);
      if (!res.error) registrar({
        modulo: 'orcamentos', acao: 'excluiu',
        entidadeTipo: 'item_orcamento', entidadeId: String(id),
        descricao: `Excluiu item de orçamento ID ${id}`,
        criticidade: 'baixa',
      });
      return res;
    },

    excluirVarios: async (ids) => {
      const res = await supabase.from('orcamento_itens').delete().in('id', ids);
      if (!res.error) registrar({
        modulo: 'orcamentos', acao: 'excluiu',
        entidadeTipo: 'item_orcamento', entidadeId: ids.join(','),
        descricao: `Excluiu ${ids.length} itens de orçamento`,
        criticidade: 'media',
      });
      return res;
    },

    upsert: (itens) =>
      supabase.from('orcamento_itens').upsert(itens, { onConflict: 'id' }),
  },
};
