// Físico Financeiro — funções puras (sem state, sem JSX, sem I/O). Mesmo padrão de
// separação de medicaoMensalPure.js: cálculos testáveis, consumidos pela tela em
// ./FisicoFinanceiroDetail.jsx e pelo service em ./fisicoFinanceiro.service.js.
//
// Cada item (linha da planilha) carrega os 17 campos numéricos na mesma ordem da
// planilha de origem — 1 linha por disciplina (código com ponto, ex. "001.01") mais
// 1 linha de total da obra (código sem ponto, ex. "001").
//
// ATENÇÃO (mesma nota de medicaoMensalPure.js): os percentuais aqui já vêm na escala
// 0-100 (extraídos da célula já formatada pelo Excel, ver parsePtBR) — não usar
// formatPct de utils/formatters.js, que espera fração 0-1.

// Normaliza um header de planilha para comparação: minúsculo, sem acento, espaços
// colapsados. Ex.: "Gasto (%)" -> "gasto (%)"; "Executado Físico (%)" -> "executado fisico (%)".
export function normalizarHeader(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Regras de reconhecimento das 19 colunas da planilha, da mais específica para a mais
// genérica — a ordem importa para `mapearColunas`: variantes "- REAL" (ganhosInccReal,
// savingReal) precisam ser testadas ANTES das variantes sem REAL (ganhosIncc, saving),
// senão uma célula "Ganhos (Atualização de INCC) - REAL" seria capturada pela regra
// genérica de "Ganhos (Atualização de INCC)" antes de chegar na regra certa.
// Cada teste usa startsWith/includes (nunca igualdade exata do texto inteiro) — o
// rótulo exato varia entre exportações reais da mesma ferramenta de origem (ex.: uma
// exportação trouxe "Código da Tarefa", outra do mesmo relatório trouxe só "Código";
// mesma lógica aplicada às demais colunas por segurança, já que só "Código"/"Nome"
// foram de fato conferidas variando).
export const CAMPOS_FECHAMENTO = [
  { chave: 'codigo',                   teste: (h) => h.startsWith('codigo') },
  { chave: 'nome',                     teste: (h) => h === 'nome' || h.startsWith('nome ') || h.startsWith('descric') },
  { chave: 'valorOrcamentoBase',       teste: (h) => h.includes('valor orcamento') && !h.includes('atualizado') },
  { chave: 'valorInccBase',            teste: (h) => h.includes('incc') && h.includes('base') },
  { chave: 'valorOrcamentoAtualizado', teste: (h) => h.includes('valor orcamento') && h.includes('atualizado') },
  { chave: 'previstoLinhaBase',        teste: (h) => h.includes('previsto') && h.includes('linha') },
  { chave: 'executadoFisico',          teste: (h) => h.includes('executado') && h.includes('fisico') },
  { chave: 'gastoPct',                 teste: (h) => h.startsWith('gasto') && h.includes('%') },
  { chave: 'gastoIncc',                teste: (h) => h.startsWith('gasto') && h.includes('incc') },
  { chave: 'gastoReal',                teste: (h) => h.startsWith('gasto') && h.includes('r$') },
  { chave: 'tendencia',                teste: (h) => h.startsWith('tendencia') },
  { chave: 'creditoModificacoes',      teste: (h) => h.includes('credito') && h.includes('modificaco') },
  { chave: 'ganhosInccReal',           teste: (h) => h.includes('ganhos') && h.includes('incc') && h.includes('real') },
  { chave: 'ganhosIncc',               teste: (h) => h.includes('ganhos') && h.includes('incc') },
  { chave: 'savingReal',               teste: (h) => h.includes('saving') && h.includes('real') },
  { chave: 'saving',                   teste: (h) => h.includes('saving') },
  { chave: 'reservaFinanceira',        teste: (h) => h.includes('reserva') && h.includes('financeira') },
  { chave: 'saldoDistribuirReal',      teste: (h) => h.includes('saldo') && h.includes('distribuir') && h.includes('r$') },
  { chave: 'saldoDistribuirIncc',      teste: (h) => h.includes('saldo') && h.includes('distribuir') && h.includes('incc') },
];

const CAMPOS_NUMERICOS = CAMPOS_FECHAMENTO
  .map(c => c.chave)
  .filter(c => c !== 'codigo' && c !== 'nome');

// Código de WBS válido: dígitos separados por ponto ("1", "001.01", "001.02.03") — mesma
// regra já usada em Orçamentos.jsx pra validar código de item importado — MAS excluindo
// quem começa "0." (ex. "0.01", "0.0576"): isso nunca é um código de WBS de verdade
// nesse domínio (zero-ponto só aparece quando um valor percentual cru — ver parseCampo —
// vira string por coincidir de cair na coluna de código de uma linha de resumo/rodapé, ex.
// "0.01" de um "Saving (R$): 0,01%"). Um código de WBS com zero à esquerda sempre tem mais
// um dígito antes do ponto ("001.01"), nunca só "0".
const CODIGO_WBS_RE = /^\d+(\.\d+)*$/;
const PARECE_FRACAO_RESIDUAL_RE = /^0\.\d/;
const codigoEhWbsValido = (codigo) => CODIGO_WBS_RE.test(codigo) && !PARECE_FRACAO_RESIDUAL_RE.test(codigo);

// Acha a linha de cabeçalho real dentro do AOA (array-of-arrays) bruto, sem assumir
// índice fixo — a planilha de origem tem uma linha 0 mesclada ("Orçamento" /
// "Acumulado até .../Fechamento") ANTES do cabeçalho de verdade. Conta, por linha,
// quantas células reconhecem alguma das 19 regras acima; a linha com mais acertos é
// o cabeçalho (a linha mesclada bate ~0, porque seus rótulos não casam com regra nenhuma).
export function detectarHeaderRowIndex(aoa) {
  let melhorIdx = -1;
  let melhorScore = 0;
  (aoa || []).forEach((row, idx) => {
    const score = (row || []).filter((cell) => {
      const h = normalizarHeader(cell);
      return h && CAMPOS_FECHAMENTO.some(c => c.teste(h));
    }).length;
    if (score > melhorScore) { melhorScore = score; melhorIdx = idx; }
  });
  return melhorIdx;
}

// Mapeia cada célula da linha de cabeçalho para a chave interna correspondente,
// respeitando a ordem de CAMPOS_FECHAMENTO (mais específica primeiro) e sem deixar
// uma chave já preenchida ser sobrescrita por uma segunda célula parecida.
export function mapearColunas(headerRow) {
  const cols = {};
  (headerRow || []).forEach((raw, idx) => {
    const h = normalizarHeader(raw);
    if (!h) return;
    const campo = CAMPOS_FECHAMENTO.find(c => !(c.chave in cols) && c.teste(h));
    if (campo) cols[campo.chave] = idx;
  });
  return cols;
}

// "1.234,56" -> 1234.56; "22,80%" -> 22.8; "-133.352,81" -> -133352.81; "R$ 1,00" -> 1.
// Só pra célula de TEXTO (planilha .htm de "Salvar como > Página da Web": todo valor
// chega como string já formatada em pt-BR, ex. "22,80%", "57.508.397,12" — ver
// parseCampo abaixo pra célula numérica de verdade, caso bem diferente).
export function parsePtBR(raw) {
  if (raw == null || raw === '') return 0;
  if (typeof raw === 'number') return raw;
  let s = String(raw).trim();
  if (!s) return 0;
  const negativo = /^-/.test(s) || /^\(.*\)$/.test(s);
  s = s.replace(/^-/, '').replace(/^\(|\)$/g, '');
  s = s.replace(/r\$/i, '').replace(/%/g, '').trim();
  s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  return negativo ? -n : n;
}

// As 3 colunas que representam percentual (previsto/executado/gasto) — únicas onde
// "célula numérica de verdade" precisa de ×100 (ver parseCampo).
const CAMPOS_PERCENTUAL = new Set(['previstoLinhaBase', 'executadoFisico', 'gastoPct']);

// Dispatcher usado na leitura de cada campo — a MESMA aba "Físico Financeiro" chega de
// dois jeitos bem diferentes conforme a exportação de origem (confirmado com arquivos
// reais desta obra):
//  (a) .htm de "Salvar como > Página da Web": toda célula é TEXTO já formatado em
//      pt-BR ("22,80%", "57.508.397,12") — cai em parsePtBR, sem ×100 (o texto já
//      mostra a escala certa).
//  (b) .xlsx de verdade: célula é NÚMERO cru — moeda/INCC já vem no valor final
//      (63697430.34), mas percentual vem como FRAÇÃO do Excel (0.228 pra 22,80%,
//      porque o formato "0.00%" da célula assume fração — é assim que o Excel guarda
//      qualquer percentual, sempre). Doc `w` (texto formatado) dessa mesma célula NÃO
//      dá pra usar: o SheetJS gera esse texto em convenção EN-US (vírgula de milhar,
//      ponto decimal — "57,508,397.12"), não pt-BR — tentar ler isso com parsePtBR
//      (que assume ponto=milhar) trunca o número (pegava só "57.508" de
//      "57,508,397.12"). Por isso aqui SEMPRE usa o valor cru (`cell.v`, que
//      sheet_to_json bota na célula da matriz quando raw:true) pra número, nunca o
//      texto formatado.
export function parseCampo(raw, isPercentual) {
  if (raw == null || raw === '') return 0;
  if (typeof raw === 'number') return isPercentual ? raw * 100 : raw;
  return parsePtBR(raw);
}

// Lê o AOA (XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }) — raw:
// TRUE, célula numérica chega como number de verdade, não texto formatado; ver
// parseCampo) e devolve os itens (uma linha por disciplina + a linha de total da
// obra), mais erros bloqueantes e avisos. Não separa a linha de total das demais —
// quem precisa dela usa `getLinhaTotal`, do mesmo jeito que a tela vai renderizar
// tudo junto.
export function parseFechamentoSheet(aoa) {
  const headerIdx = detectarHeaderRowIndex(aoa);
  if (headerIdx === -1) {
    return { itens: [], erros: ['Não foi possível reconhecer o cabeçalho da planilha.'], avisos: [] };
  }
  const cols = mapearColunas(aoa[headerIdx]);
  if (cols.codigo == null || cols.nome == null) {
    return { itens: [], erros: ['Colunas obrigatórias "Código da Tarefa" e/ou "Nome" não encontradas.'], avisos: [] };
  }

  const linhasBrutas = (aoa.slice(headerIdx + 1) || []).filter(r => (r || []).some(c => String(c ?? '').trim()));
  const val = (row, chave) => (cols[chave] != null ? row[cols[chave]] : '');

  const avisos = [];
  CAMPOS_NUMERICOS.forEach((chave) => {
    if (cols[chave] == null) {
      const label = CAMPOS_FECHAMENTO.find(c => c.chave === chave)?.chave || chave;
      avisos.push(`Coluna "${label}" não encontrada na planilha — valores tratados como 0.`);
    }
  });

  const itens = [];
  for (let i = 0; i < linhasBrutas.length; i++) {
    const row = linhasBrutas[i];
    const codigo = String(val(row, 'codigo') ?? '').trim();
    // Algumas exportações trazem um bloco-resumo (rótulo/valor) DEPOIS da grade
    // principal, na mesma planilha — ex.: "Delta (%) Físico × Financeiro", "Saving
    // (R$)". Só aceita código de WBS de verdade: dígitos separados por ponto (mesma
    // regra já usada em Orçamentos.jsx para validar código importado) — mas um valor
    // percentual pequeno lido cru (0.01, 5.76 — ver parseCampo) TAMBÉM bate nesse
    // formato por coincidência, então checar o formato sozinho não basta. A grade de
    // WBS é sempre um bloco contíguo (total + disciplinas, sem buraco no meio): assim
    // que a sequência de códigos válidos quebra, o resto da planilha (se houver) é
    // esse bloco-resumo, não mais grade — para de vez em vez de só pular a linha.
    if (!codigo || !codigoEhWbsValido(codigo)) {
      if (itens.length) break;
      continue;
    }
    const nome = String(val(row, 'nome') ?? '').trim();
    if (!nome) avisos.push(`Linha ${headerIdx + i + 2}: nome vazio para o código "${codigo}".`);
    const item = { codigo, nome };
    CAMPOS_NUMERICOS.forEach((chave) => { item[chave] = parseCampo(val(row, chave), CAMPOS_PERCENTUAL.has(chave)); });
    itens.push(item);
  }

  const erros = [];
  if (!itens.length) erros.push('Nenhuma linha de dado reconhecida abaixo do cabeçalho.');
  else if (!getLinhaTotal(itens)) avisos.push('Linha de total da obra (código sem ponto, ex. "001") não encontrada — os KPIs do topo ficarão vazios.');

  return { itens, erros, avisos };
}

// Linha de total da obra: a única cujo código não contém "." (ex. "001", vs. "001.01").
export function getLinhaTotal(itens) {
  return (itens || []).find(it => it.codigo && !it.codigo.includes('.')) || null;
}

// Linhas de disciplina (todo o resto), ordenadas por código — mesmo critério de
// ordenação de medicaoMensalPure.js/detectarDefasagem.
export function getDisciplinas(itens) {
  return (itens || [])
    .filter(it => it.codigo && it.codigo.includes('.'))
    .sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
}

// Cor semântica ('success'|'warning'|'danger'|'neutral', mesmos sufixos de .badge/
// .progress em globals.css) do par Executado Físico × Gasto: gasto crescendo mais
// rápido que o físico é sinal de alerta (obra gastando à frente do que produziu).
export function corGasto(executadoFisico, gastoPct) {
  if (!executadoFisico && !gastoPct) return 'neutral';
  const diff = (gastoPct || 0) - (executadoFisico || 0);
  if (diff >= 10) return 'danger';
  if (diff > 0) return 'warning';
  return 'success';
}

// Cor semântica da Tendência (forecast de fechamento) frente ao Orçamento Atualizado.
export function corTendencia(tendencia, valorOrcamentoAtualizado) {
  if (!tendencia && !valorOrcamentoAtualizado) return 'neutral';
  return tendencia > valorOrcamentoAtualizado ? 'danger' : 'success';
}

// Cor semântica por sinal — usada em Saving, Ganhos (INCC normal e REAL), Saving REAL
// e Reserva Financeira: negativo é sempre uma leitura desfavorável nessas colunas.
export function corPorSinal(n) {
  if (n > 0) return 'success';
  if (n < 0) return 'danger';
  return 'neutral';
}

// KPIs de resumo (cards do topo da tela) a partir da linha de total já extraída —
// separado de computeKPIs pra poder alimentar tanto uma obra (getLinhaTotal de verdade)
// quanto a carteira inteira (um total sintético, ver somarTotaisCarteira): as duas
// situações usam exatamente a mesma fórmula, nunca podem divergir em como calculam a
// mesma métrica.
export function computeKPIsFromTotal(total) {
  if (!total) return null;
  // Delta (%) Físico × Financeiro = Executado Físico − Gasto (o quanto a produção
  // está à frente ou atrás do gasto, em pontos percentuais); em R$, esse delta
  // aplicado sobre o Orçamento Atualizado — mesma definição já usada no relatório de
  // origem (conferido: bate com o "Delta (%) Físico × Financeiro" que a planilha real
  // desta obra traz no bloco-resumo, fora da grade de 19 colunas que este módulo lê).
  const deltaFisicoFinanceiroPct = (total.executadoFisico || 0) - (total.gastoPct || 0);
  const deltaFisicoFinanceiroReal = (deltaFisicoFinanceiroPct / 100) * (total.valorOrcamentoAtualizado || 0);
  // Saving (%) = Saving - REAL (R$) ÷ Orçamento Atualizado — usa o campo "REAL"
  // (savingReal), não o "Saving" cru (confirmado: savingReal bate com o "Saving (R$)"
  // que o bloco-resumo da planilha real desta obra já mostra: R$ 4.143,20 / 0,01%).
  const savingRealPct = total.valorOrcamentoAtualizado ? ((total.savingReal || 0) / total.valorOrcamentoAtualizado) * 100 : 0;
  // Ganhos em INCC (%) = Ganhos (Atualização de INCC) - REAL ÷ Orçamento Atualizado.
  const ganhosInccRealPct = total.valorOrcamentoAtualizado ? ((total.ganhosInccReal || 0) / total.valorOrcamentoAtualizado) * 100 : 0;
  // Tendência de Fechamento (%) = 1 − (Tendência ÷ Orçamento Atualizado); em R$, esse %
  // aplicado sobre o Orçamento Atualizado (equivale a Orçamento Atualizado − Tendência).
  const tendenciaFechamentoPct = total.valorOrcamentoAtualizado ? (1 - (total.tendencia || 0) / total.valorOrcamentoAtualizado) * 100 : 0;
  const tendenciaFechamentoReal = (tendenciaFechamentoPct / 100) * (total.valorOrcamentoAtualizado || 0);
  return {
    valorOrcamentoAtualizado: total.valorOrcamentoAtualizado,
    executadoFisico: total.executadoFisico,
    gastoPct: total.gastoPct,
    gastoReal: total.gastoReal,
    gapGasto: (total.gastoPct || 0) - (total.executadoFisico || 0),
    corGasto: corGasto(total.executadoFisico, total.gastoPct),
    deltaFisicoFinanceiroPct,
    deltaFisicoFinanceiroReal,
    corDeltaFisicoFinanceiro: corPorSinal(deltaFisicoFinanceiroPct),
    savingReal: total.savingReal,
    savingRealPct,
    corSavingReal: corPorSinal(total.savingReal),
    ganhosInccReal: total.ganhosInccReal,
    ganhosInccRealPct,
    corGanhosInccReal: corPorSinal(total.ganhosInccReal),
    tendencia: total.tendencia,
    corTendencia: corTendencia(total.tendencia, total.valorOrcamentoAtualizado),
    tendenciaFechamentoPct,
    tendenciaFechamentoReal,
    saldoDistribuirReal: total.saldoDistribuirReal,
    reservaFinanceira: total.reservaFinanceira,
  };
}

// KPIs de uma obra, a partir dos itens importados (linha de total extraída por dentro).
export function computeKPIs(itens) {
  return computeKPIsFromTotal(getLinhaTotal(itens));
}

// Combina as linhas de total de várias obras (cada uma já extraída via getLinhaTotal)
// num total sintético da carteira, pra alimentar computeKPIsFromTotal. executadoFisico
// e gastoPct são percentuais — não dá pra somar direto, ponderam pelo orçamento
// atualizado de cada obra (mesma técnica já usada em avancoDaCarteira, em
// carteiraPure.js — e a mesma razão: usar sempre a coluna de % como autoritativa,
// nunca re-derivar de outra coluna, é a convenção já validada no resto do módulo).
// Com 1 obra só a média ponderada degenera pro valor dela mesma, então
// computeKPIsFromTotal(somarTotaisCarteira([total])) sempre bate com computeKPIs
// daquela obra sozinha — testado em fisicoFinanceiroPure.test.js.
export function somarTotaisCarteira(totais) {
  const lista = (totais || []).filter(Boolean);
  if (!lista.length) return null;
  const somar = (campo) => lista.reduce((s, t) => s + (t[campo] || 0), 0);
  const somaOrc = somar('valorOrcamentoAtualizado');
  const ponderado = (campo) => (somaOrc
    ? lista.reduce((s, t) => s + (t[campo] || 0) * (t.valorOrcamentoAtualizado || 0), 0) / somaOrc
    : 0);
  return {
    valorOrcamentoAtualizado: somaOrc,
    executadoFisico: ponderado('executadoFisico'),
    gastoPct: ponderado('gastoPct'),
    gastoReal: somar('gastoReal'),
    savingReal: somar('savingReal'),
    ganhosInccReal: somar('ganhosInccReal'),
    tendencia: somar('tendencia'),
    saldoDistribuirReal: somar('saldoDistribuirReal'),
    reservaFinanceira: somar('reservaFinanceira'),
  };
}
