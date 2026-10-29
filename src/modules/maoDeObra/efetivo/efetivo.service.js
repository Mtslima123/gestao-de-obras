import { supabase } from '../../../services/supabase';
import { logger } from '../../../services/logger';
import { mensagemErroEfetivo } from './efetivoErro';

// Mão de Obra > Efetivo. Não há backend próprio: cada endpoint do handoff (api/contrato.md)
// é uma função SQL mo_* chamada por supabase.rpc (migration 20261010000002). As travas
// (previsto trancado, apropriação lançada) e as permissões são conferidas no banco; aqui só
// se traduz o resultado. Todo método devolve { data, error }, como os outros services; em
// erro, `error.mensagem` já é o texto em português para o toast e `error.code` mantém o
// código do banco (PT409 = tela desatualizada, ver efetivoErro.ehConflito).

// Erro do banco -> { data: null, error } com a mensagem em português (e o código preservado).
const falhou = (acao, origem, error, ctx) => {
  logger.error(`falha em ${origem}`, { module: 'maoDeObra', action: acao, ...ctx, err: error });
  const mensagem = mensagemErroEfetivo(error);
  return { data: null, error: Object.assign(new Error(mensagem), { code: error.code, mensagem }) };
};

const chamar = async (acao, fn, args, ctx = {}) => {
  const { data, error } = await supabase.rpc(fn, args);
  return error ? falhou(acao, fn, error, ctx) : { data, error: null };
};

const itemPrevisto = (p) => ({ funcaoId: p.funcaoId, qtdMes: p.qtdMes, inicio: p.inicio, termino: p.termino });
const itemApropriacao = (i) => ({
  funcaoId: i.funcaoId,
  totalEfetivo: i.totalEfetivo ?? null, trabAdm: i.trabAdm ?? null, inssSeguro: i.inssSeguro ?? null,
  ferias: i.ferias ?? null, emprestManut: i.emprestManut ?? null, destino: i.destino ?? null,
  recebidoOutraObra: i.recebidoOutraObra ?? null, origem: i.origem ?? null,
});

export const efetivoService = {
  // EfetivoState completo da obra (obra, funcoes, classificacoes, previsto, apropriacoes).
  carregar: (obraId) => chamar('carregar', 'mo_efetivo_estado', { p_obra: obraId }, { obraId }),

  // Painel de apropriações: leitura direta (sem RPC), de todas as obras de uma vez. Quem decide o
  // que cada pessoa enxerga é a regra do banco (can_access_obra): admin lê todas as obras e os
  // demais só as liberadas para eles. Uma quinzena que ninguém salvou ainda não tem linha.
  listarApropriacoesDoMes: async (ano, mes) => {
    const { data, error } = await supabase.from('mo_apropriacao')
      .select('obra_id, ano, mes, quinzena, status, lancada_em, lancada_por')
      .eq('ano', ano).eq('mes', mes);
    return error ? falhou('listarApropriacoesDoMes', 'mo_apropriacao', error, { ano, mes }) : { data: data ?? [], error: null };
  },
  // Início e término das obras no Efetivo (valem mais que o cadastro da obra); só para o painel
  // saber quando o mês está fora do período.
  listarConfigsObras: async () => {
    const { data, error } = await supabase.from('mo_obra_config').select('obra_id, inicio_obra, termino_obra');
    return error ? falhou('listarConfigsObras', 'mo_obra_config', error, {}) : { data: data ?? [], error: null };
  },

  // Cadastros globais (só admin; o banco recusa os demais com PT403).
  criarFuncao: (nome, grupoId) => chamar('criarFuncao', 'mo_funcao_criar', { p_nome: nome, p_grupo: grupoId }),
  // patch: { grupoId?, classificacao? } — classificacao: null = volta a ser a própria função.
  alterarFuncao: (id, patch) => chamar('alterarFuncao', 'mo_funcao_alterar', { p_id: id, p_patch: patch }, { funcaoId: id }),
  // Função à parte de alterarFuncao: a antiga ignoraria o nome em silêncio num banco sem a
  // migration 20261029000001. Devolve { id, nome } com o nome já aparado pelo banco.
  renomearFuncao: (id, nome) => chamar('renomearFuncao', 'mo_funcao_renomear', { p_id: id, p_nome: nome }, { funcaoId: id }),
  excluirFuncao: (id) => chamar('excluirFuncao', 'mo_funcao_excluir', { p_id: id }, { funcaoId: id }),
  criarClassificacao: (nome) => chamar('criarClassificacao', 'mo_classificacao_criar', { p_nome: nome }),
  removerClassificacao: (nome) => chamar('removerClassificacao', 'mo_classificacao_remover', { p_nome: nome }),

  // Lista de funções DA OBRA (não do cadastro): remover tira a função só desta obra, sem mexer no
  // cadastro nem nas outras obras, e restaurar a devolve. Quem edita o previsto pode. O banco
  // recusa (PT409) com o previsto trancado e, ao remover, se a obra já tem apropriação dela.
  removerFuncaoDaObra: (obraId, funcaoId) =>
    chamar('removerFuncaoDaObra', 'mo_obra_funcao_remover', { p_obra: obraId, p_funcao: funcaoId }, { obraId, funcaoId }),
  restaurarFuncaoNaObra: (obraId, funcaoId) =>
    chamar('restaurarFuncaoNaObra', 'mo_obra_funcao_restaurar', { p_obra: obraId, p_funcao: funcaoId }, { obraId, funcaoId }),

  // Previsto: salvar grava início e término da obra e tranca; destrancar = "Editar previsto".
  // itens: [{ funcaoId, qtdMes, inicio, termino }].
  salvarPrevisto: (obraId, inicioObra, terminoObra, itens) =>
    chamar('salvarPrevisto', 'mo_previsto_salvar', { p_obra: obraId, p_termino_obra: terminoObra, p_itens: itens.map(itemPrevisto), p_inicio_obra: inicioObra }, { obraId }),
  destrancarPrevisto: (obraId) => chamar('destrancarPrevisto', 'mo_previsto_destrancar', { p_obra: obraId }, { obraId }),

  // Apropriação por obra/mês/quinzena (1 ou 2). salvar = rascunho; lançar tranca; reabrir destranca.
  salvarApropriacao: (obraId, ano, mes, quinzena, itens) =>
    chamar('salvarApropriacao', 'mo_apropriacao_salvar',
      { p_obra: obraId, p_ano: ano, p_mes: mes, p_quinzena: quinzena, p_itens: itens.map(itemApropriacao) }, { obraId, ano, mes, quinzena }),
  lancar: (obraId, ano, mes, quinzena) =>
    chamar('lancar', 'mo_apropriacao_lancar', { p_obra: obraId, p_ano: ano, p_mes: mes, p_quinzena: quinzena }, { obraId, ano, mes, quinzena }),
  reabrir: (obraId, ano, mes, quinzena) =>
    chamar('reabrir', 'mo_apropriacao_reabrir', { p_obra: obraId, p_ano: ano, p_mes: mes, p_quinzena: quinzena }, { obraId, ano, mes, quinzena }),
  copiarDaPrimeira: (obraId, ano, mes) =>
    chamar('copiarDaPrimeira', 'mo_apropriacao_copiar_da_1', { p_obra: obraId, p_ano: ano, p_mes: mes }, { obraId, ano, mes }),

  // Meses liberados para apropriação além do mês atual e dos que já têm apropriação (só admin; o
  // banco recusa os demais com PT403). Remover só vale para mês sem apropriação (PT409).
  habilitarMes: (obraId, ano, mes) =>
    chamar('habilitarMes', 'mo_mes_habilitar', { p_obra: obraId, p_ano: ano, p_mes: mes }, { obraId, ano, mes }),
  desabilitarMes: (obraId, ano, mes) =>
    chamar('desabilitarMes', 'mo_mes_desabilitar', { p_obra: obraId, p_ano: ano, p_mes: mes }, { obraId, ano, mes }),

  // Fechar trava a edição de um mês que já tem apropriação (só admin; PT409 se o mês não tem
  // apropriação). Reabrir o mês devolve a edição.
  // Exclui o mês da lista: só vale se nenhuma quinzena tem dado preenchido (PT409 se tiver).
  excluirMes: (obraId, ano, mes) =>
    chamar('excluirMes', 'mo_mes_excluir', { p_obra: obraId, p_ano: ano, p_mes: mes }, { obraId, ano, mes }),
  fecharMes: (obraId, ano, mes) =>
    chamar('fecharMes', 'mo_mes_fechar', { p_obra: obraId, p_ano: ano, p_mes: mes }, { obraId, ano, mes }),
  reabrirMes: (obraId, ano, mes) =>
    chamar('reabrirMes', 'mo_mes_reabrir', { p_obra: obraId, p_ano: ano, p_mes: mes }, { obraId, ano, mes }),
};
