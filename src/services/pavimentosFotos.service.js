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
