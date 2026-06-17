import { supabase } from '../../services/supabase';

// Layout do Fluxo Executivo persistido por obra e por usuário (via RLS).
// Se a tabela ainda não existir (migration não aplicada pelo TI), as chamadas
// retornam erro e o componente continua funcionando só com o localStorage.
export const fluxoService = {
  carregar: (obraId) =>
    supabase.from('fluxo_layouts').select('*').eq('obra_id', obraId).maybeSingle(),

  salvar: async (obraId, { cards, linkOffsets, linkPorts }) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return { error: { message: 'sem sessão' } };
    return supabase.from('fluxo_layouts').upsert({
      obra_id:      obraId,
      user_id:      session.user.id,
      cards,
      link_offsets: linkOffsets,
      link_ports:   linkPorts,
      updated_at:   new Date().toISOString(),
    }, { onConflict: 'obra_id,user_id' });
  },
};
