import { supabase } from '../../services/supabase';

export const controleService = {
  fotos: {
    listar: (obraId) =>
      supabase.from('fotos_obra').select('*').eq('obra_id', obraId),

    criar: (dados) =>
      supabase.from('fotos_obra').insert([dados]),

    atualizar: (id, metadados) =>
      supabase.from('fotos_obra').update(metadados).eq('id', id),

    excluir: (foto) =>
      Promise.all([
        supabase.storage.from('obras-images').remove([foto.storage_path]),
        supabase.from('fotos_obra').delete().eq('id', foto.id),
      ]),
  },
};
