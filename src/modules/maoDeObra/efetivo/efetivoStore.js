// Seletores calculados do módulo Efetivo (porte de react/store.ts do handoff). As fórmulas
// vêm de ./regras.ts; aqui só se navega pelo estado devolvido por mo_efetivo_estado.
//
// Diferença deliberada do store.ts do handoff: o EFETIVO DO MÊS só conta quinzenas LANCADAS
// (é o que a view vw_mo_efetivo_mes faz no banco). O handoff somava também rascunho; assim
// front e banco divergiam. A aba Apropriação, que precisa mostrar o rascunho, pede
// incluirRascunho.
import { ativos, efetivoDoMes, mesAbs, mesesEntre, orcado, previstoNoMes, temValor, trabCanteiro } from './regras';

export const GRUPOS = [
  { id: 'ADM_TEC', nome: 'Administrativo e técnico', ordem: 1 },
  { id: 'LIDERANCA', nome: 'Liderança de campo', ordem: 2 },
  { id: 'OFICIAL', nome: 'Oficial', ordem: 3 },
  { id: 'MEIO_OFICIAL', nome: 'Meio-oficial', ordem: 4 },
  { id: 'SERVENTE', nome: 'Servente', ordem: 5 },
  { id: 'EQUIPAMENTOS', nome: 'Operação de equipamentos', ordem: 6 },
  { id: 'APOIO', nome: 'Apoio', ordem: 7 },
];

const ML = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export const mesDeAbs = (abs) => {
  const ano = Math.floor(abs / 12), mes = (abs % 12) + 1;
  return { ano, mes, abs, label: `${ML[mes - 1]}/${String(ano).slice(2)}`, iso: `${ano}-${String(mes).padStart(2, '0')}-01` };
};

// Meses do início ao término da obra, inclusive. Obra sem início ou sem término = [].
export const mesesDaObra = (o) => {
  if (!o?.inicio || !o?.termino) return [];
  const a = mesAbs(o.inicio), b = mesAbs(o.termino);
  return Array.from({ length: Math.max(0, b - a + 1) }, (_, k) => mesDeAbs(a + k));
};

export const ultimoDia = (ano, mes) => new Date(ano, mes, 0).getDate();
export const fimDoMesIso = (m) => `${m.ano}-${String(m.mes).padStart(2, '0')}-${ultimoDia(m.ano, m.mes)}`;

export const prevDe = (s, funcaoId) => s.previsto.find((p) => p.funcaoId === funcaoId);
export const previstoMes = (s, funcaoId, m) => { const p = prevDe(s, funcaoId); return p ? previstoNoMes(p, m.ano, m.mes) : 0; };
export const orcadoFuncao = (s, funcaoId) => { const p = prevDe(s, funcaoId); return p ? orcado(p) : 0; };
export const mesesFuncao = (s, funcaoId) => { const p = prevDe(s, funcaoId); return p ? mesesEntre(p.inicio, p.termino) : 0; };

export const apropDe = (s, m, q) => s.apropriacoes.find((a) => a.ano === m.ano && a.mes === m.mes && a.quinzena === q);
export const itemDe = (a, funcaoId) => a?.itens.find((i) => i.funcaoId === funcaoId);

// "Total efetivo" da tela = trab. ADM + trab. canteiro + emprest./manut. Calculado, não se digita.
export const totalEfetivoTela = (i) => (i && temValor(i) ? (i.trabAdm ?? 0) + trabCanteiro(i) + (i.emprestManut ?? 0) : null);

// Edição de uma linha da apropriação. "Trab. no canteiro" é digitado (patch.canteiro) e o
// "Total efetivo" da tela é calculado (totalEfetivoTela). O banco guarda total_efetivo
// bruto (canteiro + ADM + INSS + férias + emprest.), de onde o canteiro sai pela fórmula de
// sempre (regras.trabCanteiro). Por isso, ao mexer em ADM, INSS, férias ou emprest., o total
// bruto é refeito para o canteiro digitado não mudar sozinho.
const CAMPOS_DO_TOTAL = ['canteiro', 'trabAdm', 'inssSeguro', 'ferias', 'emprestManut'];
export const aplicarPatchItem = (base, patch) => {
  const { canteiro, ...resto } = patch;
  const novo = { ...base, ...resto };
  if (!CAMPOS_DO_TOTAL.some((k) => k in patch)) return novo;
  const can = 'canteiro' in patch ? canteiro : (temValor(base) ? Math.max(0, trabCanteiro(base)) : null);
  const outros = [novo.trabAdm, novo.inssSeguro, novo.ferias, novo.emprestManut];
  novo.totalEfetivo = can == null && outros.every((v) => v == null) ? null : (can ?? 0) + outros.reduce((a, v) => a + (v ?? 0), 0);
  return novo;
};

// ATIVOS da função na quinzena. Só quinzena LANCADA, salvo incluirRascunho.
export const ativosQ = (s, funcaoId, m, q, incluirRascunho = false) => {
  const a = apropDe(s, m, q);
  if (!a || (!incluirRascunho && a.status !== 'LANCADA')) return null;
  const it = itemDe(a, funcaoId);
  return it ? ativos(it) : null;
};

// Efetivo do mês = última quinzena LANCADA (2ª se lançada, senão a 1ª). Nunca média.
export const efetivoMes = (s, funcaoId, m) => efetivoDoMes(ativosQ(s, funcaoId, m, 1), ativosQ(s, funcaoId, m, 2));

// Consumido (pessoa-mês) do início da obra até o mês selecionado, inclusive.
export const consumidoAte = (s, funcaoId, ate) =>
  mesesDaObra(s.obra).filter((m) => m.abs <= ate.abs).reduce((a, m) => a + (efetivoMes(s, funcaoId, m) ?? 0), 0);

// Saldo acumulado vs plano = Σ (previsto − efetivo) nos meses com apropriação lançada até o mês selecionado.
export const saldoAcumulado = (s, funcaoId, ate) => {
  let acc = 0, tem = false;
  for (const m of mesesDaObra(s.obra)) {
    if (m.abs > ate.abs) break;
    const e = efetivoMes(s, funcaoId, m);
    if (e != null) { acc += previstoMes(s, funcaoId, m) - e; tem = true; }
  }
  return tem ? acc : null;
};

// Meses em que a obra aceita apropriação: o mês atual, os que já têm apropriação e os que um
// admin habilitou. Mesma regra de mo_exigir_mes_habilitado no banco. `meses` é a lista da obra.
export const mesApropriavel = (s, m, mesAtualAbs) =>
  m.abs === mesAtualAbs
  || s.apropriacoes.some((a) => a.ano === m.ano && a.mes === m.mes)
  || (s.mesesHabilitados ?? []).some((h) => h.ano === m.ano && h.mes === m.mes);
export const mesesApropriaveis = (s, meses, mesAtualAbs) => meses.filter((m) => mesApropriavel(s, m, mesAtualAbs));
export const mesesParaHabilitar = (s, meses, mesAtualAbs) => meses.filter((m) => !mesApropriavel(s, m, mesAtualAbs));
// Habilitados por admin que ainda não têm apropriação: são os que dá para remover.
export const habilitadosRemoviveis = (s, meses) =>
  meses.filter((m) => (s.mesesHabilitados ?? []).some((h) => h.ano === m.ano && h.mes === m.mes)
    && !s.apropriacoes.some((a) => a.ano === m.ano && a.mes === m.mes));

// Meses da obra com apropriação feita, para o seletor de período da Análise. "Feita" = ao menos
// uma quinzena LANCADA: a Análise só conta quinzena lançada (rascunho não tem efetivo ali), então
// um mês só com rascunho abriria vazio. `meses` é a lista da obra, e a ordem dela é mantida.
export const mesesComApropriacao = (s, meses) =>
  meses.filter((m) => s.apropriacoes.some((a) => a.ano === m.ano && a.mes === m.mes && a.status === 'LANCADA'));

// Mês fechado pelo admin: só consulta, mesmo com apropriação lançada. A trava de verdade é do
// gatilho do banco (mo_apropriacao e mo_apropriacao_item).
export const mesFechado = (s, m) => (s.mesesFechados ?? []).some((f) => f.ano === m.ano && f.mes === m.mes);
// Meses com apropriação, do mais antigo ao mais novo: são os únicos que dá para fechar/reabrir.
export const mesesFechaveis = (s) =>
  [...new Set(s.apropriacoes.map((a) => a.ano * 12 + a.mes - 1))].sort((a, b) => a - b).map(mesDeAbs);

// Mês sem nenhum dado: toda apropriação dele é rascunho e sem linhas, e o mês não está fechado.
// É o único que o admin pode excluir (o banco confere de novo em mo_mes_excluir).
export const mesSemDados = (s, m) => {
  const as = s.apropriacoes.filter((a) => a.ano === m.ano && a.mes === m.mes);
  return as.length > 0 && !mesFechado(s, m) && as.every((a) => a.status !== 'LANCADA' && a.itens.length === 0);
};

// Quantidade por mês do previsto, digitada com vírgula ou ponto: número >= 0 com até 2 casas
// (pode ser quebrada, ex.: 2,5 pessoas). Vazio ou inválido vira 0.
export const lerQtd = (v) => {
  const n = Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};

export const funcoesAtivas = (s) =>s.funcoes.filter((f) => f.ativo);
export const funcoesDoGrupo = (s, g) => funcoesAtivas(s).filter((f) => f.grupoId === g);

// Funções da obra que já têm apropriação (rascunho ou lançada, qualquer quinzena): não podem ser
// removidas da lista da obra. Só conta valor de verdade: o "Lançar" grava uma linha zerada para
// toda função ativa, e essa não é apropriação. Mesma regra de mo_obra_funcao_remover; o banco
// confere de novo e é ele quem vale (aqui só serve para desabilitar o botão).
const temDado = (i) =>
  [i.totalEfetivo, i.trabAdm, i.inssSeguro, i.ferias, i.emprestManut, i.recebidoOutraObra].some((v) => (v ?? 0) !== 0)
  || !!i.destino?.trim() || !!i.origem?.trim();
export const funcoesComApropriacao = (s) =>
  new Set(s.apropriacoes.flatMap((a) => a.itens.filter(temDado).map((i) => i.funcaoId)));

// Ordem do cadastro (a mesma que o banco devolve) ao devolver uma função à lista da obra.
export const porOrdemDoCadastro = (a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || Number(a.id) - Number(b.id);
