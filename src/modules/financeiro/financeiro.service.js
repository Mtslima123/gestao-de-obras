import { supabase } from '../../services/supabase';

export const financeiroService = {
  estimativas: {
    listar: (tipo = 'estimativa') =>
      supabase.from('estimativas_base').select('id, dados').eq('tipo', tipo).order('id'),

    criar: (tipo, dados) =>
      supabase.from('estimativas_base').insert({ tipo, dados }),

    atualizar: (id, dados) =>
      supabase.from('estimativas_base').update({ dados }).eq('id', id),

    excluir: (id) =>
      supabase.from('estimativas_base').delete().eq('id', id),

    inscrever: (tipo, callback) =>
      supabase.channel('base_' + tipo)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'estimativas_base' }, callback)
        .subscribe(),
  },
};
