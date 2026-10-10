// Regras de negócio — Módulo Mão de Obra › Efetivo
// Funções puras, sem dependência de framework. Exatamente as regras definidas no protótipo.

import type { ApropriacaoItem, Funcao, PrevistoFuncao, Status } from './types';

/* ---------- Datas / meses ---------- */

/** Índice absoluto de mês (ano*12 + mês-1) a partir de 'YYYY-MM-DD'. */
export const mesAbs = (iso: string) => { const [y, m] = iso.split('-').map(Number); return y * 12 + (m - 1); };

/** Meses de uma função = meses-calendário entre início e término, inclusive. 15/03→10/05 = 3. */
export const mesesEntre = (inicio: string, termino: string) => Math.max(0, mesAbs(termino) - mesAbs(inicio) + 1);

/** Ao alterar o INÍCIO, o término é mantido e os meses são recalculados (mínimo 1). */
/** O término não pode ser anterior ao início (validar no form e no backend). */

/* ---------- Apropriação (linha da planilha) ---------- */

const n = (v: number | null | undefined) => v ?? 0;

export const trabCanteiro = (i: ApropriacaoItem) =>
  n(i.totalEfetivo) - n(i.trabAdm) - n(i.inssSeguro) - n(i.ferias) - n(i.emprestManut);
// Pode dar negativo → exibir em vermelho (#b42318) e bloquear o lançamento (recomendado).

export const temValor = (i: ApropriacaoItem) =>
  [i.totalEfetivo, i.trabAdm, i.inssSeguro, i.ferias, i.emprestManut, i.recebidoOutraObra].some(v => v != null);

/** ATIVOS = trab. ADM + trab. canteiro + recebido outra obra. É o número comparado ao previsto. */
export const ativos = (i: ApropriacaoItem): number | null =>
  temValor(i) ? n(i.trabAdm) + trabCanteiro(i) + n(i.recebidoOutraObra) : null;

/** Ao LANÇAR, campos vazios viram 0. Após lançada a quinzena fica trancada; "Reabrir" volta para RASCUNHO. */

/* ---------- Previsto ---------- */

export const previstoNoMes = (p: PrevistoFuncao, ano: number, mes: number) => {
  const m = ano * 12 + (mes - 1);
  return m >= mesAbs(p.inicio) && m <= mesAbs(p.termino) ? p.qtdMes : 0;
};

/** Orçado total da função em pessoa-mês. */
export const orcado = (p: PrevistoFuncao) => p.qtdMes * mesesEntre(p.inicio, p.termino);

/* ---------- Efetivo do mês ---------- */

/**
 * Efetivo do mês = ÚLTIMA apropriação lançada (2ª quinzena se existir, senão a 1ª).
 * Nunca média — o resultado é sempre inteiro.
 */
export const efetivoDoMes = (q1: number | null, q2: number | null) => (q2 != null ? q2 : q1);

/* ---------- Status / cores ---------- */

/** Até 100% do previsto = verde (ok). Acima de 100% = vermelho. Sem previsto e com efetivo = vermelho. */
export const status = (previsto: number, valor: number | null): Status => {
  if (valor == null) return 'pend';
  if (previsto === 0) return valor > 0 ? 'sem' : 'ok';
  return valor <= previsto ? 'ok' : 'acima';
};

export const STATUS_UI: Record<Status, { cor: string; fundo: string; rotulo: string }> = {
  ok:    { cor: '#0f7a3d', fundo: '#e7f6ed', rotulo: 'No previsto' },
  acima: { cor: '#b42318', fundo: '#fdecea', rotulo: 'Acima do previsto' },
  sem:   { cor: '#b42318', fundo: '#fdecea', rotulo: 'Sem previsão' },
  pend:  { cor: '#5b6b80', fundo: '#eef2f6', rotulo: 'Pendente' },
};

export const usoPct = (valor: number, previsto: number) => (previsto > 0 ? Math.round((valor / previsto) * 100) : null);

/* ---------- Saldo ---------- */

/** Saldo do período = previsto − utilizado. Positivo = vaga prevista não utilizada (azul #014386). Negativo = excedido (vermelho). */
export const saldo = (previsto: number, utilizado: number) => previsto - utilizado;
export const corSaldo = (v: number) => (v > 0.05 ? '#014386' : v < -0.05 ? '#b42318' : '#5b6b80');

/** Consumido (pessoa-mês) até o mês selecionado, inclusive = Σ efetivoDoMes de cada mês. */
export const consumido = (efetivosMensais: (number | null)[]) => efetivosMensais.reduce<number>((a, v) => a + (v ?? 0), 0);

/** Saldo do orçamento da função = orçado − consumido. */
export const saldoOrcamento = (p: PrevistoFuncao, consumidoAteMes: number) => orcado(p) - consumidoAteMes;

/** Saldo acumulado vs plano (Análise) = Σ (previsto do mês − efetivo do mês) para meses com apropriação, do início da obra até o mês selecionado. */

/* ---------- Média restante / projeção ---------- */

/**
 * Meses restantes = meses APÓS o mês selecionado até o TÉRMINO DA OBRA (não da função).
 * Ex.: selecionado Out/26, término da obra Out/27 → 12.
 */
export const mesesRestantes = (mesSelecionadoIso: string, terminoObraIso: string) =>
  Math.max(0, mesAbs(terminoObraIso) - mesAbs(mesSelecionadoIso));

/** Média restante = saldo ÷ meses restantes. Cor: azul se > qtd/mês, verde se =, vermelho se < (precisa reduzir). */
export const mediaRestante = (saldoV: number, restantes: number) => (restantes > 0 ? saldoV / restantes : null);
export const corMediaRestante = (media: number | null, qtdMes: number) =>
  media == null ? '#5b6b80' : media < qtdMes - 0.05 ? '#b42318' : media > qtdMes + 0.05 ? '#014386' : '#0f7a3d';

/* ---------- Classificação ---------- */

/** Classificação efetiva: se a função não tem classificação, ela é a sua própria (nome da função). */
export const classificacaoEfetiva = (f: Funcao) => f.classificacao ?? f.nome;

/** Agrupa ids de funções por classificação efetiva (para somar previsto/efetivo/saldo juntos). */
export const porClassificacao = (funcoes: Funcao[]) => {
  const m = new Map<string, string[]>();
  for (const f of funcoes) { const k = classificacaoEfetiva(f); m.set(k, [...(m.get(k) ?? []), f.id]); }
  return m;
};

/* ---------- Gráfico realizado × projeção (Análise) ---------- */

export interface PontoGrafico { ano: number; mes: number; valor: number; previsto: number; tipo: 'realizado' | 'projecao' }

/**
 * Para a classificação escolhida (soma das funções dela):
 *  - meses ≤ selecionado: valor = Σ efetivoDoMes (realizado)
 *  - meses > selecionado até término da obra: valor = max(0, saldo ÷ meses restantes) (projeção, constante)
 *  - previsto = Σ previstoNoMes (marcador preto na barra)
 */
