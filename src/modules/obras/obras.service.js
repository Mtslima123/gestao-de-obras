import { supabase } from '../../services/supabase';
import { auditoriaService } from '../admin/auditoria.service';

const gerarIdUnico = async () => {
  for (let i = 0; i < 30; i++) {
    const candidato = `OB-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    const { data } = await supabase.from('obras').select('id').eq('id', candidato).maybeSingle();
    if (!data) return candidato;
  }
  throw new Error('Não foi possível gerar um ID único para a obra');
};

const registrar = async (campos) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return;
  const u = session.user;
  auditoriaService.registrar({ userId: u.id, userNome: u.email, userPerfil: 'usuario', ...campos });
};

export const obrasService = {
  listar: () =>
    supabase.from('obras').select('*').order('created_at', { ascending: false }),

  buscarPorId: (id) =>
    supabase.from('obras').select('*').eq('id', id).single(),

  criar: async (dados, userId) => {
    const id = dados.id || await gerarIdUnico();
    const res = await supabase.from('obras').insert([{ ...dados, id, user_id: userId }]).select().single();
    if (!res.error) registrar({
      modulo: 'obras', acao: 'criou',
      entidadeTipo: 'obra', entidadeId: String(res.data?.id || ''),
      obraId: res.data?.id, obraNome: res.data?.nome || dados.nome,
      descricao: `Criou a obra "${res.data?.nome || dados.nome}"`,
      valorNovo: { nome: dados.nome, status: dados.status },
      criticidade: 'media',
    });
    return res;
  },

  atualizar: async (id, dados) => {
    const res = await supabase.from('obras').update(dados).eq('id', id);
    if (!res.error) registrar({
      modulo: 'obras', acao: 'editou',
      entidadeTipo: 'obra', entidadeId: String(id),
      obraId: id, obraNome: dados.nome,
      descricao: `Atualizou dados da obra "${dados.nome || id}"`,
      criticidade: 'media',
    });
    return res;
  },

  excluir: async (id) => {
    const res = await supabase.from('obras').delete().eq('id', id);
    if (!res.error) registrar({
      modulo: 'obras', acao: 'excluiu',
      entidadeTipo: 'obra', entidadeId: String(id),
      obraId: id,
      descricao: `Excluiu a obra ID ${id}`,
      criticidade: 'alta',
    });
    return res;
  },
};
