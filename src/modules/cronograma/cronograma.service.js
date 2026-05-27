import { supabase } from '../../services/supabase';

export const cronogramaService = {
  salvar: (obraId, dados) =>
    supabase.from('cronogramas').upsert({ obra_id: obraId, dados }),

  carregar: (obraId) =>
    supabase.from('cronogramas').select('*').eq('obra_id', obraId).single(),
};
