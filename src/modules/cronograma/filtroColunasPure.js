// Filtros de coluna fora da Lista (hoje a tabela da Medição Mensal). Cada filtro é o mesmo da Lista:
// lista de valores marcados ({ excluded, included }) ou por condição ({ condicoes, juncao }), vindos
// do menu do cabeçalho (ColumnHeaderFilterMenu). Sem cor: a Medição não tem formatação de célula.
import { passaCondicoes } from './filtroCondicaoPure';
import { passaFiltroColuna, FILTER_BLANK_KEY } from './cronogramaShared';

/** Chave da linha no checklist da coluna: dia 'AAAA-M-D' em data; nos demais, o texto exibido. */
export const chaveDoValor = (tipo, { raw, label }) => {
  if (tipo === 'date') return raw ? `${raw.getFullYear()}-${raw.getMonth() + 1}-${raw.getDate()}` : FILTER_BLANK_KEY;
  return (label === '' || label == null) ? FILTER_BLANK_KEY : label;
};

/**
 * A linha passa em TODOS os filtros de coluna ativos?
 * `valorDe(colId)` devolve { raw, label } da linha naquela coluna; `tipoDe(colId)` devolve
 * 'text' | 'number' | 'date'. `ignorar` tira uma coluna da conta (o menu dela lista os valores
 * possíveis considerando só os OUTROS filtros, como no Excel).
 */
export function passaFiltrosDeColuna(filtros, valorDe, tipoDe, ignorar = null) {
  return Object.entries(filtros || {}).every(([colId, f]) => {
    if (colId === ignorar) return true;
    const tipo = tipoDe(colId);
    const v = valorDe(colId);
    if (f?.condicoes) return passaCondicoes(f, { tipo, raw: v.raw, label: v.label });
    return passaFiltroColuna(f, chaveDoValor(tipo, v), tipo === 'date');
  });
}
