import { supabase } from './supabase';

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
    if (error) { console.error('[pavimentos_obra] falha ao listar', error); return []; }
    return (data || []).map(r => r.nome);
  },

  // Salva (upsert) novos pavimentos na obra; ignora duplicados por (obra_id, nome).
  async salvar(obraId, nomes) {
    const lista = (Array.isArray(nomes) ? nomes : [nomes]).map(n => String(n || '').trim()).filter(Boolean);
    if (!obraId || !lista.length) return;
    const { error } = await supabase
      .from('pavimentos_obra')
      .upsert(lista.map(nome => ({ obra_id: obraId, nome })), { onConflict: 'obra_id,nome', ignoreDuplicates: true });
    if (error) console.error('[pavimentos_obra] falha ao salvar', error);
  },
};
