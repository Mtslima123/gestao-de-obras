import { supabase } from '../../services/supabase';
import { auditoriaService } from '../admin/auditoria.service';

const registrar = async (campos) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return;
  const u = session.user;
  auditoriaService.registrar({ userId: u.id, userNome: u.email, userPerfil: 'usuario', ...campos });
};

export const orcamentosService = {
  listar: () =>
    supabase.from('orcamentos').select('*').order('created_at', { ascending: false }),

  buscarPorId: (id) =>
    supabase.from('orcamentos').select('*').eq('id', id).single(),

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

  excluir: async (id) => {
    const res = await supabase.from('orcamentos').delete().eq('id', id);
    if (!res.error) registrar({
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
