import { supabase } from '../../../services/supabase';
import { logger } from '../../../services/logger';
import { mensagemErroEfetivo } from './efetivoErro';

// Mão de Obra > Efetivo. Não há backend próprio: cada endpoint do handoff (api/contrato.md)
// é uma função SQL mo_* chamada por supabase.rpc (migration 20261010000002). As travas
// (previsto trancado, apropriação lançada) e as permissões são conferidas no banco; aqui só
// se traduz o resultado. Todo método devolve { data, error }, como os outros services; em
// erro, `error.mensagem` já é o texto em português para o toast e `error.code` mantém o
// código do banco (PT409 = tela desatualizada, ver efetivoErro.ehConflito).

const chamar = async (acao, fn, args, ctx = {}) => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    logger.error(`falha em ${fn}`, { module: 'maoDeObra', action: acao, ...ctx, err: error });
    return { data: null, error: Object.assign(new Error(mensagemErroEfetivo(error)), { code: error.code, mensagem: mensagemErroEfetivo(error) }) };
  }
  return { data, error: null };
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

  // Cadastros globais (só admin; o banco recusa os demais com PT403).
  criarFuncao: (nome, grupoId) => chamar('criarFuncao', 'mo_funcao_criar', { p_nome: nome, p_grupo: grupoId }),
  // patch: { grupoId?, classificacao? } — classificacao: null = volta a ser a própria função.
  alterarFuncao: (id, patch) => chamar('alterarFuncao', 'mo_funcao_alterar', { p_id: id, p_patch: patch }, { funcaoId: id }),
  excluirFuncao: (id) => chamar('excluirFuncao', 'mo_funcao_excluir', { p_id: id }, { funcaoId: id }),
  criarClassificacao: (nome) => chamar('criarClassificacao', 'mo_classificacao_criar', { p_nome: nome }),
  removerClassificacao: (nome) => chamar('removerClassificacao', 'mo_classificacao_remover', { p_nome: nome }),

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
};
