// Agrupamento do Excel (estrutura de tópicos: botões +/- na margem e números 1, 2, 3 no canto) na exportação da
// Lista de Tarefas. Sem React e sem a biblioteca do xlsx, para poder testar.
//
// A biblioteca (xlsx-js-style) já grava o nível de cada linha (`ws['!rows'][i].level`) e o "resumo acima dos
// detalhes" (`ws['!outline'] = { above: true }`, que vira `summaryBelow="0"`). O que ela NÃO grava é
// `outlineLevelRow` em `sheetFormatPr`, que o Excel usa para desenhar a margem com os números dos níveis
// (XlsxWriter e openpyxl sempre gravam). Por isso o arquivo é remendado dentro do zip, o mesmo expediente
// de aplicarTextoRicoNoXlsx (medicaoMensalPure.js).

// O Excel aceita no máximo 7 níveis de agrupamento de linhas; EAP mais funda fica achatada no 7.
export const NIVEL_MAXIMO_EXCEL = 7;

// Nível de agrupamento de cada linha exportada: quantas tarefas-pai dela também saem na planilha. Resumo raiz = 0,
// filhas do resumo = 1, e assim por diante. Conta só os ancestrais EXPORTADOS (e não o `nivel` da EAP) porque o
// agrupamento só funciona entre linhas que existem na planilha: com "ocultar tarefas de resumo" as folhas ficam
// sem pai e voltam ao 0, em vez de abrir um nível sem botão; grupo recolhido na Lista sai sem as filhas, então
// só as linhas que saem entram na conta.
// exportadas: as linhas na ordem da planilha, [{ id, parentId }] (o pai precisa vir ACIMA das filhas, como na Lista).
// Pai ausente da lista interrompe a cadeia. parentId em ciclo não trava (o laço repetido conta como 0).
export function niveisDeAgrupamento(exportadas) {
  const porId = new Map((exportadas || []).map((e) => [e.id, e]));
  const memo = new Map();
  const emAndamento = new Set();
  const nivelDe = (e) => {
    if (memo.has(e.id)) return memo.get(e.id);
    if (emAndamento.has(e.id)) return 0; // ciclo: corta aqui
    emAndamento.add(e.id);
    const pai = e.parentId != null ? porId.get(e.parentId) : null;
    const nivel = pai ? nivelDe(pai) + 1 : 0;
    emAndamento.delete(e.id);
    memo.set(e.id, nivel);
    return nivel;
  };
  return (exportadas || []).map((e) => Math.min(NIVEL_MAXIMO_EXCEL, nivelDe(e)));
}

// Marca na planilha (objeto `ws` da biblioteca) o nível de cada linha e liga o "resumo acima dos detalhes", para o
// botão +/- aparecer na linha do pai. `primeiraLinha` é o índice (0 = primeira linha da planilha) da linha de
// niveis[0]. Só linhas com nível acima de 0 recebem `level`; as demais (título, cabeçalho, Total) ficam de fora do
// agrupamento. Mantém o que já houver em `!rows` (ex.: altura `hpt`) e em `!outline`. Nunca grava `hidden`: a planilha
// abre expandida. Devolve o maior nível aplicado (0 = nada agrupado e a planilha não foi tocada).
export function aplicarAgrupamentoNaPlanilha(ws, primeiraLinha, niveis) {
  const validos = (niveis || []).map((n) => Math.min(NIVEL_MAXIMO_EXCEL, Math.max(0, Math.floor(Number(n)) || 0)));
  const maior = validos.reduce((m, n) => Math.max(m, n), 0);
  if (maior <= 0) return 0;
  const linhas = ws['!rows'] || [];
  validos.forEach((n, i) => {
    if (n > 0) linhas[primeiraLinha + i] = { ...(linhas[primeiraLinha + i] || {}), level: n };
  });
  ws['!rows'] = linhas;
  ws['!outline'] = { ...(ws['!outline'] || {}), above: true };
  return maior;
}

// Grava `outlineLevelRow` (maior nível de linha da planilha) em `sheetFormatPr` dentro de um .xlsx já gerado (zip).
// `fflate` vem de fora ({ unzipSync, zipSync, strFromU8, strToU8 }) para este módulo não carregar a biblioteca.
// Devolve os bytes do novo arquivo; se o arquivo não tiver o formato esperado, lança erro (quem chama exporta o
// arquivo original, que já traz o agrupamento, só sem o `outlineLevelRow`).
export function aplicarNivelDeLinhaNoXlsx(bytes, maiorNivel, fflate) {
  const { unzipSync, zipSync, strFromU8, strToU8 } = fflate;
  const arquivos = unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  const caminho = Object.keys(arquivos).find((c) => /^xl\/worksheets\/sheet\d+\.xml$/.test(c));
  if (!caminho) throw new Error('xlsx sem planilha');
  const nivel = Math.min(NIVEL_MAXIMO_EXCEL, Math.max(1, Math.floor(Number(maiorNivel)) || 1));
  let xml = strFromU8(arquivos[caminho]);
  if (/<sheetFormatPr\b/.test(xml)) {
    // Uma versão futura da biblioteca pode passar a gravar o elemento: então só acerta o atributo.
    xml = /<sheetFormatPr\b[^>]*\boutlineLevelRow="(\d+)"/.test(xml)
      ? xml.replace(/(<sheetFormatPr\b[^>]*\boutlineLevelRow=")(\d+)(")/, (_, a, atual, c) => `${a}${Math.max(nivel, Number(atual))}${c}`)
      : xml.replace(/<sheetFormatPr\b/, `<sheetFormatPr outlineLevelRow="${nivel}"`);
  } else {
    // No esquema do Excel, sheetFormatPr vem logo antes de <cols> (ou de <sheetData>, sem larguras). defaultRowHeight
    // é obrigatório no elemento; 15 é a altura padrão da fonte Calibri 11 do arquivo.
    const alvo = /<cols\b|<sheetData\b/.exec(xml);
    if (!alvo) throw new Error('planilha sem sheetData');
    xml = `${xml.slice(0, alvo.index)}<sheetFormatPr defaultRowHeight="15" outlineLevelRow="${nivel}"/>${xml.slice(alvo.index)}`;
  }
  arquivos[caminho] = strToU8(xml);
  return zipSync(arquivos);
}
