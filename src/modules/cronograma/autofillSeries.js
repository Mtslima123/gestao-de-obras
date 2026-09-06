// ─── autofillSeries ────────────────────────────────────────────────────────────
// Alça de preenchimento estilo Excel: a partir de uma ou mais células de origem
// (em ordem, de cima para baixo), gera os próximos `targetCount` valores.

/** "Teto tipo 1" → { prefix: "Teto tipo ", num: 1, padLen: 1 }. Sem dígito no final: num null. */
function parseSeriesToken(value) {
  const s = String(value ?? '');
  const m = s.match(/^(.*?)(\d+)$/s);
  if (!m) return { prefix: s, num: null, padLen: 0 };
  return { prefix: m[1], num: parseInt(m[2], 10), padLen: m[2].length };
}

function formatToken(prefix, num, padLen) {
  const digits = padLen > 1 ? String(num).padStart(padLen, '0') : String(num);
  return prefix + digits;
}

/**
 * @param {string[]} sourceValues - valores de origem, na ordem das linhas (topo → base)
 * @param {number}   targetCount  - quantas linhas preencher a seguir
 * @returns {string[]} os `targetCount` valores a aplicar, na ordem
 */
export function computeAutofillSeries(sourceValues, targetCount) {
  if (!sourceValues?.length || targetCount <= 0) return [];

  if (sourceValues.length === 1) {
    const tok = parseSeriesToken(sourceValues[0]);
    // Texto puro (sem número) ou número isolado sem prefixo: Excel repete o valor.
    if (tok.num == null || tok.prefix === '') {
      return Array.from({ length: targetCount }, () => sourceValues[0]);
    }
    return Array.from({ length: targetCount }, (_, i) => formatToken(tok.prefix, tok.num + i + 1, tok.padLen));
  }

  const tokens = sourceValues.map(parseSeriesToken);
  const samePrefix = tokens.every(t => t.num != null && t.prefix === tokens[0].prefix);
  if (!samePrefix) {
    // Sem padrão numérico reconhecível: cicla o bloco original (fallback do Excel).
    return Array.from({ length: targetCount }, (_, i) => sourceValues[i % sourceValues.length]);
  }

  const diffs = tokens.slice(1).map((t, i) => t.num - tokens[i].num);
  const step = diffs.every(d => d === diffs[0]) ? diffs[0] : Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length);
  const last = tokens[tokens.length - 1];
  return Array.from({ length: targetCount }, (_, i) => formatToken(last.prefix, last.num + step * (i + 1), last.padLen));
}
