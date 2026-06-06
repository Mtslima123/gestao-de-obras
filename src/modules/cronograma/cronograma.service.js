import { supabase } from '../../services/supabase';
import { auditoriaService } from '../admin/auditoria.service';

const registrar = async (campos) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return;
  const u = session.user;
  auditoriaService.registrar({ userId: u.id, userNome: u.email, userPerfil: 'usuario', ...campos });
};

export const cronogramaService = {
  salvar: async (obraId, dados) => {
    const res = await supabase.from('cronogramas').upsert({ obra_id: obraId, dados });
    if (!res.error) registrar({
      modulo: 'cronograma', acao: 'editou',
      entidadeTipo: 'cronograma', entidadeId: String(obraId),
      obraId: obraId,
      descricao: `Atualizou o cronograma da obra ID ${obraId}`,
      criticidade: 'alta',
    });
    return res;
  },

  carregar: (obraId) =>
    supabase.from('cronogramas').select('*').eq('obra_id', obraId).single(),
};
