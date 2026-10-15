// Painel de apropriações por obra (Mão de Obra > Efetivo > Painel), sem React nem Supabase, para
// teste. Junta a lista de obras com as linhas de mo_apropriacao de UM mês e diz, por obra, o estado
// da 1ª e da 2ª quinzena. "OK" = quinzena LANCADA (botão "Lançar apropriação"); fechar o mês, que
// só o admin faz, é outra coisa e não entra aqui.
//
// Cada quinzena é lida sozinha: o banco não exige a 1ª lançada para lançar a 2ª (essa ordem é só
// da tela de Apropriação), então a 2ª pode estar OK com a 1ª pendente.
import { mesAbs } from './regras';
import { mesDeAbs, rotuloObra } from './efetivoStore';

// Quanto o seletor de mês olha para trás, no máximo: protege de uma data de início errada
// (ex.: ano 1900) gerar uma lista enorme.
const MAX_MESES_ATRAS = 120;

// Pendentes primeiro (é o que o painel existe para mostrar), depois as completas, e por último
// as obras que não têm o mês no período.
const ORDEM_SITUACAO = { pendente: 0, completa: 1, fora: 2 };

// Para a busca: sem acento nem caixa.
const chave = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Período da obra no Efetivo. Mesma ordem do banco (mo_efetivo_estado): a configuração do Efetivo
// vale mais que o cadastro da obra. Datas 'AAAA-MM-DD' ou null (período desconhecido).
export const periodoDaObra = (obra, config) => ({
  inicio: config?.inicio_obra || obra?.inicio || null,
  termino: config?.termino_obra || obra?.dataFimObra || obra?.previsto || null,
});

// `m` = { abs }. Período desconhecido (início ou término faltando) conta como dentro.
export const mesForaDoPeriodo = (periodo, m) =>
  !!((periodo.inicio && m.abs < mesAbs(periodo.inicio)) || (periodo.termino && m.abs > mesAbs(periodo.termino)));

// 'lancada' | 'rascunho' | 'pendente' | 'fora'. Quinzena sem linha no banco = ninguém salvou nada.
export const estadoQuinzena = (linha, fora) => {
  if (linha) return linha.status === 'LANCADA' ? 'lancada' : 'rascunho';
  return fora ? 'fora' : 'pendente';
};

// Uma linha por obra, já ordenada. `linhas`: [{ obra_id, ano, mes, quinzena, status, lancada_em,
// lancada_por }]; `configs`: [{ obra_id, inicio_obra, termino_obra }]; `mes`: { ano, mes, abs }.
// Linha de outro mês é ignorada (uma resposta atrasada não suja o mês escolhido).
export const montarPainel = ({ obras = [], linhas = [], configs = [], mes }) => {
  const config = new Map(configs.map((c) => [c.obra_id, c]));
  const doMes = new Map();
  for (const l of linhas) if (l.ano === mes.ano && l.mes === mes.mes) doMes.set(`${l.obra_id}|${l.quinzena}`, l);

  const rows = obras.map((o) => {
    const l1 = doMes.get(`${o.id}|1`), l2 = doMes.get(`${o.id}|2`);
    // Mês fora do período só vale para obra sem nenhuma quinzena salva nele: dado salvo sempre aparece.
    const fora = !l1 && !l2 && mesForaDoPeriodo(periodoDaObra(o, config.get(o.id)), mes);
    const q = (l) => {
      const lancada = l?.status === 'LANCADA';
      return { estado: estadoQuinzena(l, fora), lancadaEm: lancada ? l.lancada_em ?? null : null, lancadaPor: lancada ? l.lancada_por ?? null : null };
    };
    const q1 = q(l1), q2 = q(l2);
    const situacao = fora ? 'fora' : (q1.estado === 'lancada' && q2.estado === 'lancada' ? 'completa' : 'pendente');
    return { obraId: o.id, rotulo: rotuloObra(o), concluida: o.status === 'concluida', q1, q2, situacao };
  });

  return rows.sort((a, b) => ORDEM_SITUACAO[a.situacao] - ORDEM_SITUACAO[b.situacao] || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
};

// Contagens para o resumo e para os filtros.
export const resumoPainel = (rows) => ({
  total: rows.length,
  completas: rows.filter((r) => r.situacao === 'completa').length,
  pendentes: rows.filter((r) => r.situacao === 'pendente').length,
  fora: rows.filter((r) => r.situacao === 'fora').length,
});

// situacao: 'todas' | 'pendentes' | 'completas'. Obra concluída fica de fora, a não ser que se peça.
export const filtrarPainel = (rows, { situacao = 'todas', busca = '', mostrarConcluidas = false } = {}) => {
  const termo = chave(busca);
  return rows.filter((r) =>
    (mostrarConcluidas || !r.concluida)
    && (!termo || chave(r.rotulo).includes(termo))
    && (situacao === 'todas' || (situacao === 'pendentes' ? r.situacao === 'pendente' : r.situacao === 'completa')));
};

// Meses do seletor, do mais novo (o atual) para trás até o início da obra mais antiga. Sem nenhum
// início conhecido, só o mês atual. Nunca passa do mês atual: mês futuro não tem o que acompanhar.
export const mesesDoPainel = ({ obras = [], configs = [], mesAtualAbs }) => {
  const config = new Map(configs.map((c) => [c.obra_id, c]));
  let menor = mesAtualAbs;
  for (const o of obras) {
    const { inicio } = periodoDaObra(o, config.get(o.id));
    const a = inicio ? mesAbs(inicio) : NaN;
    if (Number.isFinite(a)) menor = Math.min(menor, a);
  }
  menor = Math.max(menor, mesAtualAbs - (MAX_MESES_ATRAS - 1));
  return Array.from({ length: mesAtualAbs - menor + 1 }, (_, k) => mesDeAbs(mesAtualAbs - k));
};
