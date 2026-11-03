import { supabase } from './supabase';
import { logger } from './logger';
import { colunaAusente, funcaoAusente } from '../utils/pavimentos';

// Pavimentos cadastrados por obra (tabela pavimentos_obra). Compartilhado entre o
// Cronograma (inserção automática de pavimentos) e as Fotos da obra, para que um
// pavimento cadastrado em qualquer lugar fique disponível na obra inteira.
//
// Ordem: coluna `ordem` (migration 20261103000001, aplicada à parte), gravada pelo botão
// "Ordem dos pavimentos" da Medição. Enquanto ela não existir no banco, a lista segue a
// ordem de cadastro (id) e só o reordenar avisa que depende da atualização.
export const pavimentosService = {
  // Lista os nomes de pavimentos da obra, pela ordem manual (sem ordem por último) e, no
  // empate, pela ordem de cadastro. Nunca alfabética: "nome" é texto livre, ex.
  // "1".."10".."11" — ordenar por nome intercalaria "10"/"11" entre "1" e "2", já que
  // compara caractere a caractere, não como número. `id` é a sequência real de inserção,
  // então preserva a ordem que a obra cadastrou.
  // Devolve { data, error }: quem chama precisa distinguir "obra sem pavimentos" de falha
  // de rede (sem rede o Cronograma usa a lista guardada no aparelho, ver offlineCache).
  async listar(obraId) {
    if (!obraId) return { data: [], error: null };
    let { data, error } = await supabase
      .from('pavimentos_obra')
      .select('nome')
      .eq('obra_id', obraId)
      .order('ordem', { ascending: true, nullsFirst: false })
      .order('id');
    if (colunaAusente(error)) {
      ({ data, error } = await supabase
        .from('pavimentos_obra')
        .select('nome')
        .eq('obra_id', obraId)
        .order('id'));
    }
    if (error) {
      logger.error('falha ao listar pavimentos', { module: 'pavimentos', action: 'listar', obraId, err: error });
      return { data: [], error };
    }
    return { data: (data || []).map(r => r.nome), error: null };
  },

  // Salva (upsert) novos pavimentos na obra; ignora duplicados por (obra_id, nome).
  async salvar(obraId, nomes) {
    const lista = (Array.isArray(nomes) ? nomes : [nomes]).map(n => String(n || '').trim()).filter(Boolean);
    if (!obraId || !lista.length) return;
    const { error } = await supabase
      .from('pavimentos_obra')
      .upsert(lista.map(nome => ({ obra_id: obraId, nome })), { onConflict: 'obra_id,nome', ignoreDuplicates: true });
    if (error) logger.error('falha ao salvar pavimentos', { module: 'pavimentos', action: 'salvar', obraId, err: error });
  },

  // Grava a ordem inteira da obra de uma vez (função do banco, numa transação só). Pavimentos
  // que ainda não estão no cadastro entram nele, já na posição certa.
  // { ok, pendenteTI }: pendenteTI = a função ainda não existe no banco (migration pendente).
  async reordenar(obraId, nomes) {
    if (!obraId || !nomes?.length) return { ok: true };
    const { data, error } = await supabase.rpc('reordenar_pavimentos_obra', { p_obra_id: obraId, p_nomes: nomes });
    if (funcaoAusente(error)) return { ok: false, pendenteTI: true };
    if (error) {
      logger.error('falha ao reordenar pavimentos', { module: 'pavimentos', action: 'reordenar', obraId, err: error });
      return { ok: false, error };
    }
    // 0 linhas sem erro: o RLS filtrou a gravação (sem permissão de editar na obra).
    if (!data) return { ok: false, error: new Error('Sem permissão para reordenar os pavimentos.') };
    return { ok: true };
  },

  // Remove um pavimento do cadastro da obra.
  async excluir(obraId, nome) {
    const n = String(nome || '').trim();
    if (!obraId || !n) return;
    const { error } = await supabase
      .from('pavimentos_obra')
      .delete()
      .eq('obra_id', obraId)
      .eq('nome', n);
    if (error) logger.error('falha ao excluir pavimento', { module: 'pavimentos', action: 'excluir', obraId, err: error });
  },
};
