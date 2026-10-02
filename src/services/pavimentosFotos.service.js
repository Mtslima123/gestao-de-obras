import { supabase } from './supabase';
import { logger } from './logger';

// Pavimentos cadastrados para as Fotos da obra (tabela pavimentos_fotos_obra). Lista
// própria da aba Fotos, independente do cadastro do Cronograma (pavimentos_obra).
// Diferente de pavimentos.service, criar/excluir devolvem { ok, error } para a tela
// avisar o usuário quando a gravação falhar (ex.: sem permissão).
export const pavimentosFotosService = {
  // Nomes na ordem de cadastro (não alfabética: "10" intercalaria entre "1" e "2").
  async listar(obraId) {
    if (!obraId) return [];
    const { data, error } = await supabase
      .from('pavimentos_fotos_obra')
      .select('nome')
      .eq('obra_id', obraId)
      .order('id');
    if (error) { logger.error('falha ao listar pavimentos das fotos', { module: 'pavimentosFotos', action: 'listar', obraId, err: error }); return []; }
    return (data || []).map(r => r.nome);
  },

  async criar(obraId, nome) {
    const n = String(nome || '').trim();
    if (!obraId || !n) return { ok: false, error: new Error('Informe o nome do pavimento.') };
    const { error } = await supabase.from('pavimentos_fotos_obra').insert({ obra_id: obraId, nome: n });
    if (error) { logger.error('falha ao criar pavimento das fotos', { module: 'pavimentosFotos', action: 'criar', obraId, err: error }); return { ok: false, error }; }
    return { ok: true };
  },

  // Renomeia no cadastro E nas fotos da obra que usam o nome antigo (fotos_obra.pavimento é
  // texto sem FK): sem isso as fotos já enviadas ficariam com um nome fora do cadastro. Se
  // a atualização das fotos falhar, desfaz o cadastro para não deixar as duas partes
  // divergentes.
  async renomear(obraId, nomeAntigo, nomeNovo) {
    const de = String(nomeAntigo || '').trim();
    const para = String(nomeNovo || '').trim();
    if (!obraId || !de || !para) return { ok: false, error: new Error('Informe o nome do pavimento.') };
    if (de === para) return { ok: true };
    const { data, error } = await supabase
      .from('pavimentos_fotos_obra')
      .update({ nome: para })
      .eq('obra_id', obraId)
      .eq('nome', de)
      .select('id');
    if (error) {
      logger.error('falha ao renomear pavimento das fotos', { module: 'pavimentosFotos', action: 'renomear', obraId, err: error });
      const duplicado = error.code === '23505';
      return { ok: false, error: duplicado ? new Error('Esse pavimento já está cadastrado.') : error };
    }
    if (!data?.length) return { ok: false, error: new Error('Sem permissão para alterar este pavimento.') };
    const { error: fotosErr } = await supabase
      .from('fotos_obra')
      .update({ pavimento: para })
      .eq('obra_id', obraId)
      .eq('pavimento', de);
    if (fotosErr) {
      logger.error('falha ao atualizar fotos ao renomear pavimento', { module: 'pavimentosFotos', action: 'renomear', obraId, err: fotosErr });
      await supabase.from('pavimentos_fotos_obra').update({ nome: de }).eq('obra_id', obraId).eq('nome', para);
      return { ok: false, error: fotosErr };
    }
    return { ok: true };
  },

  async excluir(obraId, nome) {
    const n = String(nome || '').trim();
    if (!obraId || !n) return { ok: false, error: new Error('Pavimento inválido.') };
    // .select() devolve as linhas apagadas: o RLS faz DELETE sem permissão virar 0 linhas, sem erro.
    const { data, error } = await supabase
      .from('pavimentos_fotos_obra')
      .delete()
      .eq('obra_id', obraId)
      .eq('nome', n)
      .select('id');
    if (error) { logger.error('falha ao excluir pavimento das fotos', { module: 'pavimentosFotos', action: 'excluir', obraId, err: error }); return { ok: false, error }; }
    if (!data?.length) return { ok: false, error: new Error('Sem permissão para excluir este pavimento.') };
    return { ok: true };
  },
};
