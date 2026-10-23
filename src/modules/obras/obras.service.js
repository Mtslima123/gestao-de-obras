import { supabase } from '../../services/supabase';
import { auditoriaService } from '../admin/auditoria.service';
import { friendlyError } from '../../utils/friendlyError';

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

// Traduz o erro de FK do Postgres ao excluir uma obra pra uma mensagem que diz o que
// fazer, em vez do texto cru ("update or delete on table \"obras\" violates foreign
// key constraint..."). As únicas tabelas com FK bloqueando a exclusão de `obras` hoje
// são orcamentos e orcamento_cronograma_vinculos (conferido via information_schema) —
// cronogramas/medições/fotos não têm FK formal e não bloqueiam.
export const obraDeleteErrorMessage = (error) => {
  if (error?.code === '23503') {
    if (error.message?.includes('orcamentos_obra_id_fkey')) {
      return 'Não é possível excluir: esta obra tem orçamento(s) cadastrado(s). Exclua os orçamentos da obra antes de excluir a obra.';
    }
    if (error.message?.includes('orcamento_cronograma_vinculos_obra_id_fkey')) {
      return 'Não é possível excluir: esta obra tem vínculos entre orçamento e cronograma. Remova os vínculos antes de excluir a obra.';
    }
    if (/mo_(obra_config|previsto|apropriacao)_obra_id_fkey/.test(error.message || '')) {
      return 'Não é possível excluir: esta obra tem efetivo (previsto ou apropriações) em Mão de Obra. Fale com o TI para remover esses dados antes de excluir a obra.';
    }
    return 'Não é possível excluir: esta obra ainda tem dados vinculados em outro cadastro. Remova-os antes de excluir a obra.';
  }
  return 'Erro ao excluir obra. ' + friendlyError(error);
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

  // `dados` são SÓ os campos alterados (ver obraPatchPure.camposAlterados), nunca a linha
  // inteira: gravar a linha toda a partir de estado velho desfazia mudanças de outras telas
  // (BUG-016). Devolve a linha atual (`data`), que quem chama usa para atualizar a tela.
  // `.single()` também faz um UPDATE que não alcançou nenhuma linha (RLS) virar erro, em vez
  // de sucesso falso.
  atualizar: async (id, dados) => {
    const res = await supabase.from('obras').update(dados).eq('id', id).select().single();
    const nome = res.data?.nome || dados.nome;
    if (!res.error) registrar({
      modulo: 'obras', acao: 'editou',
      entidadeTipo: 'obra', entidadeId: String(id),
      obraId: id, obraNome: nome,
      descricao: `Atualizou dados da obra "${nome || id}"`,
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
