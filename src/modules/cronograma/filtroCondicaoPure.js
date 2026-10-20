// Filtros por condição no menu do cabeçalho da Lista (estilo Excel: "Filtros de Número/Texto/Data"):
// igual a, diferente de, maior que, contém, entre... com até duas condições ligadas por E / OU.
// Convive com o filtro de lista marcada (checklist): uma coluna tem um OU outro, e aplicar um
// substitui o outro, como no Excel. Guardado em columnFilters[colId] = { condicoes, juncao }.

const NUM_DATA = [
  { id: 'igual', rotulo: 'Igual a' },
  { id: 'diferente', rotulo: 'Diferente de' },
  { id: 'maior', rotulo: 'Maior que' },
  { id: 'maiorIgual', rotulo: 'Maior ou igual a' },
  { id: 'menor', rotulo: 'Menor que' },
  { id: 'menorIgual', rotulo: 'Menor ou igual a' },
  { id: 'entre', rotulo: 'Entre' },
];
const DATA_ROTULOS = { maior: 'Depois de', maiorIgual: 'Depois ou igual a', menor: 'Antes de', menorIgual: 'Antes ou igual a' };

export const OPERADORES_FILTRO = {
  number: NUM_DATA,
  date: NUM_DATA.map(o => ({ ...o, rotulo: DATA_ROTULOS[o.id] || o.rotulo })),
  text: [
    { id: 'igual', rotulo: 'Igual a' },
    { id: 'diferente', rotulo: 'Diferente de' },
    { id: 'comeca', rotulo: 'Começa com' },
    { id: 'termina', rotulo: 'Termina com' },
    { id: 'contem', rotulo: 'Contém' },
    { id: 'naoContem', rotulo: 'Não contém' },
  ],
};
export const TITULO_FILTRO_CONDICAO = { number: 'Filtros de Número', text: 'Filtros de Texto', date: 'Filtros de Data' };

/** Só número, texto e data têm filtro por condição (lista, modo e Sim/Não ficam só na lista marcada). */
export const tipoTemCondicoes = (tipo) => !!OPERADORES_FILTRO[tipo];

/** Número digitado em pt-BR: "1.234,56", "R$ 1.000", "50%", "12d" ou "0.5". null se não for número. */
export function parseNumeroBR(txt) {
  if (typeof txt === 'number') return Number.isFinite(txt) ? txt : null;
  let s = String(txt ?? '').trim().replace(/R\$|%|d$/gi, '').replace(/\s+/g, '');
  if (!s || !/^[-+]?[\d.,]+$/.test(s)) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');          // 1.234,56 -> 1234.56
  else if (/^[-+]?[1-9]\d{0,2}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');   // 1.000 -> 1000 (milhar); 0.250 segue decimal
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// "2026-10-20" ou Date -> 20261020 (compara por dia, sem hora nem fuso)
const diaNum = (v) => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getFullYear() * 10000 + (v.getMonth() + 1) * 100 + v.getDate();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ''));
  return m ? Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]) : null;
};
// minúsculas e sem acento: "Estrutura" casa com "estrutura" e "ESTRUTURA"
const norm = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const arred2 = (n) => Math.round(n * 100) / 100;

const comparar = (op, v, a, b) => {
  switch (op) {
    case 'igual': return v === a;
    case 'diferente': return v !== a;
    case 'maior': return v > a;
    case 'maiorIgual': return v >= a;
    case 'menor': return v < a;
    case 'menorIgual': return v <= a;
    case 'entre': return v >= Math.min(a, b) && v <= Math.max(a, b);
    default: return true;
  }
};

/** Valor(es) digitado(s) de uma condição já no formato de comparação; null se incompleta/inválida. */
export function alvoDaCondicao(c, tipo) {
  if (!c || !c.op) return null;
  const precisaDois = c.op === 'entre';
  if (tipo === 'text') return String(c.valor ?? '').trim() === '' ? null : { a: norm(c.valor) };
  const conv = tipo === 'date' ? diaNum : parseNumeroBR;
  const a = conv(c.valor);
  if (a === null) return null;
  if (!precisaDois) return { a };
  const b = conv(c.valor2);
  return b === null ? null : { a, b };
}

/** Condições completas e válidas (as linhas em branco do diálogo saem). */
export const condicoesValidas = (condicoes, tipo) => (condicoes || []).filter(c => alvoDaCondicao(c, tipo));

function avaliar(c, tipo, raw, label) {
  const alvo = alvoDaCondicao(c, tipo);
  if (!alvo) return true;                       // condição incompleta não restringe nada
  if (tipo === 'text') {
    const t = norm(label ?? raw);
    switch (c.op) {
      case 'igual': return t === alvo.a;
      case 'diferente': return t !== alvo.a;
      case 'comeca': return t.startsWith(alvo.a);
      case 'termina': return t.endsWith(alvo.a);
      case 'contem': return t.includes(alvo.a);
      case 'naoContem': return !t.includes(alvo.a);
      default: return true;
    }
  }
  const v = tipo === 'date' ? diaNum(raw) : parseNumeroBR(raw);
  if (v === null) return c.op === 'diferente';  // em branco só passa em "diferente de", como no Excel
  if (tipo === 'number' && (c.op === 'igual' || c.op === 'diferente')) return comparar(c.op, arred2(v), arred2(alvo.a));
  return comparar(c.op, v, alvo.a, alvo.b);
}

/** A linha passa no filtro por condição? `raw` e `label` vêm de colFilterValue (ListaInterativa). */
export function passaCondicoes(filtro, { tipo, raw, label }) {
  const conds = condicoesValidas(filtro?.condicoes, tipo);
  if (!conds.length) return true;
  const res = conds.map(c => avaliar(c, tipo, raw, label));
  return filtro.juncao === 'OU' ? res.some(Boolean) : res.every(Boolean);
}
