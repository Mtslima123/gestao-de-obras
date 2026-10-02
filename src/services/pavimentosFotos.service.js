import { supabase } from './supabase';
import { logger } from './logger';

// Pavimentos cadastrados para as Fotos da obra (tabela pavimentos_fotos_obra). Lista
// própria da aba Fotos, independente do cadastro do Cronograma (pavimentos_obra).
// Diferente de pavimentos.service, criar/excluir devolvem { ok, error } para a tela
// avisar o usuário quando a gravação falhar (ex.: sem permissão).
//
// Ordem: coluna `ordem` (migration 20261002000001, aplicada pelo TI à parte), gravada pelos
// botões subir/descer/duplicar do modal Pavimentos. Enquanto ela não existir no banco, a
// lista segue a ordem de cadastro (id) e só o reordenar avisa que depende do TI.
const colunaAusente = (error) =>
  !!error && (error.code === 'PGRST204' || error.code === '42703' || /column .* (of .* )?(does not exist|not found)/i.test(error.message || ''));
const funcaoAusente = (error) =>
  !!error && (error.code === 'PGRST202' || /function .* does not exist/i.test(error.message || ''));

// Pela ordem manual (sem ordem por último) e, no empate, pela ordem de cadastro.
const comOrdem = (q) => q.order('ordem', { ascending: true, nullsFirst: false }).order('id');

export const pavimentosFotosService = {
  // Nomes na ordem de cadastro (não alfabética: "10" intercalaria entre "1" e "2").
  // { data, error }: sem rede a aba Fotos usa a lista guardada no aparelho em vez de
  // mostrar "Nenhum pavimento cadastrado" (que travava a foto, pavimento é obrigatório).
  async listar(obraId) {
    if (!obraId) return { data: [], error: null };
    let { data, error } = await comOrdem(supabase.from('pavimentos_fotos_obra').select('nome').eq('obra_id', obraId));
    if (colunaAusente(error)) {
      ({ data, error } = await supabase.from('pavimentos_fotos_obra').select('nome').eq('obra_id', obraId).order('id'));
    }
    if (error) {
      logger.error('falha ao listar pavimentos das fotos', { module: 'pavimentosFotos', action: 'listar', obraId, err: error });
      return { data: [], error };
    }
    return { data: (data || []).map(r => r.nome), error: null };
  },

  // Várias obras numa consulta só: { [obraId]: nomes } (obra sem pavimento fica com []).
  // Usado pra guardar no aparelho os pavimentos de todas as obras da tela de atalhos, e
  // assim a pessoa conseguir tirar foto sem internet numa obra cujas Fotos ainda não abriu.
  async listarPorObras(obraIds) {
    const ids = [...new Set((obraIds || []).filter(Boolean))];
    if (!ids.length) return { data: {}, error: null };
    let { data, error } = await comOrdem(supabase.from('pavimentos_fotos_obra').select('obra_id, nome').in('obra_id', ids));
    if (colunaAusente(error)) {
      ({ data, error } = await supabase.from('pavimentos_fotos_obra').select('obra_id, nome').in('obra_id', ids).order('id'));
    }
    if (error) return { data: {}, error };
    const porObra = Object.fromEntries(ids.map(id => [id, []]));
    (data || []).forEach(r => { (porObra[r.obra_id] ||= []).push(r.nome); });
    return { data: porObra, error: null };
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

  // Grava a ordem inteira da obra de uma vez (função do banco, numa transação só).
  // { ok, pendenteTI }: pendenteTI = a função ainda não existe no banco (migration com o TI).
  async reordenar(obraId, nomes) {
    if (!obraId || !nomes?.length) return { ok: true };
    const { data, error } = await supabase.rpc('reordenar_pavimentos_fotos', { p_obra_id: obraId, p_nomes: nomes });
    if (funcaoAusente(error)) return { ok: false, pendenteTI: true };
    if (error) {
      logger.error('falha ao reordenar pavimentos das fotos', { module: 'pavimentosFotos', action: 'reordenar', obraId, err: error });
      return { ok: false, error };
    }
    // 0 linhas sem erro: o RLS filtrou a gravação (sem permissão de editar na obra).
    if (!data) return { ok: false, error: new Error('Sem permissão para reordenar os pavimentos.') };
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
