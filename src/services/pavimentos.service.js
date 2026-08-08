import { supabase } from './supabase';
import { logger } from './logger';

// Pavimentos cadastrados por obra (tabela pavimentos_obra). Compartilhado entre o
// Cronograma (inserção automática de pavimentos) e as Fotos da obra, para que um
// pavimento cadastrado em qualquer lugar fique disponível na obra inteira.
export const pavimentosService = {
  // Lista os nomes de pavimentos da obra, ordenados.
  async listar(obraId) {
    if (!obraId) return [];
    const { data, error } = await supabase
      .from('pavimentos_obra')
      .select('nome')
      .eq('obra_id', obraId)
      .order('nome');
    if (error) { logger.error('falha ao listar pavimentos', { module: 'pavimentos', action: 'listar', obraId, err: error }); return []; }
    return (data || []).map(r => r.nome);
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
