import { describe, it, expect } from 'vitest';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import XLSX from 'xlsx-js-style';
import {
  NIVEL_MAXIMO_EXCEL, niveisDeAgrupamento, aplicarAgrupamentoNaPlanilha, aplicarNivelDeLinhaNoXlsx,
} from '../modules/cronograma/excelAgrupamentoPure';
import { montarSomasDosGrupos } from '../modules/cronograma/excelSomaGrupos';

const fflate = { unzipSync, zipSync, strFromU8, strToU8 };

// Lista da obra MAESTRO (print do usuário), na ordem em que a Lista exporta. O nível esperado de cada linha está
// ao lado: resumo raiz 0, filhas 1, e assim por diante.
//   Resumo                       0
//     SERVIÇOS INICIAIS          1   (3 filhas, nível 2)
//     INFRAESTRUTURA             1
//       FUNDAÇÃO                 2   (3 filhas, nível 3)
//         Estacas                3   > Perfil metálico 4
//         Contenção              3   > Contenção 4
//         Fundação Blocos        3   (3 filhas, nível 4)
//         Cisterna               3   (2 filhas, nível 4)
const g = (id, parentId) => ({ id, parentId, isGroup: true });
const t = (id, parentId) => ({ id, parentId, isGroup: false });
const arvore = [
  g('resumo', null),
  g('servicos', 'resumo'), t('limpeza', 'servicos'), t('tapume', 'servicos'), t('barracao', 'servicos'),
  g('infra', 'resumo'),
  g('fundacao', 'infra'), t('locacao', 'fundacao'), t('escavacao', 'fundacao'), t('rebaixamento', 'fundacao'),
  g('estacas', 'fundacao'), t('perfil', 'estacas'),
  g('contencao', 'fundacao'), t('contencao1', 'contencao'),
  g('blocos', 'fundacao'), t('b1', 'blocos'), t('b2', 'blocos'), t('b3', 'blocos'),
  g('cisterna', 'fundacao'), t('lajeFundo', 'cisterna'), t('lajeTeto', 'cisterna'),
];
const niveisEsperados = [
  0,
  1, 2, 2, 2,
  1,
  2, 3, 3, 3,
  3, 4,
  3, 4,
  3, 4, 4, 4,
  3, 4, 4,
];

describe('niveisDeAgrupamento', () => {
  it('EAP do exemplo: resumo no 0, filhas no 1 e assim até o 4', () => {
    expect(niveisDeAgrupamento(arvore)).toEqual(niveisEsperados);
  });

  it('grupo recolhido na Lista: sai sem as filhas e os demais níveis não mudam', () => {
    const semFilhasDaFundacao = arvore.filter((e) => !['locacao', 'escavacao', 'rebaixamento', 'estacas', 'perfil', 'contencao', 'contencao1',
      'blocos', 'b1', 'b2', 'b3', 'cisterna', 'lajeFundo', 'lajeTeto'].includes(e.id));
    expect(semFilhasDaFundacao.map((e) => e.id)).toEqual(['resumo', 'servicos', 'limpeza', 'tapume', 'barracao', 'infra', 'fundacao']);
    expect(niveisDeAgrupamento(semFilhasDaFundacao)).toEqual([0, 1, 2, 2, 2, 1, 2]);
  });

  it('filtro ativo traz os pais de quem passa: a cadeia inteira mantém os níveis', () => {
    const filtrada = arvore.filter((e) => ['resumo', 'infra', 'fundacao', 'estacas', 'perfil'].includes(e.id));
    expect(niveisDeAgrupamento(filtrada)).toEqual([0, 1, 2, 3, 4]);
  });

  it('sem tarefas de resumo na planilha as folhas ficam sem agrupamento', () => {
    const soFolhas = arvore.filter((e) => !e.isGroup);
    expect(niveisDeAgrupamento(soFolhas).every((n) => n === 0)).toBe(true);
  });

  it('pai que não sai na planilha interrompe a cadeia (nunca abre um nível sem botão)', () => {
    expect(niveisDeAgrupamento([t('a', 'naoSai'), t('b', null)])).toEqual([0, 0]);
  });

  it('EAP mais funda que o limite do Excel fica achatada no 7', () => {
    const cadeia = Array.from({ length: 11 }, (_, i) => g(`n${i}`, i === 0 ? null : `n${i - 1}`));
    expect(niveisDeAgrupamento(cadeia)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 7, 7, 7]);
    expect(NIVEL_MAXIMO_EXCEL).toBe(7);
  });

  it('parentId em ciclo não trava e devolve números finitos', () => {
    const niveis = niveisDeAgrupamento([g('a', 'b'), g('b', 'a')]);
    expect(niveis).toHaveLength(2);
    expect(niveis.every(Number.isFinite)).toBe(true);
  });

  it('lista vazia ou ausente', () => {
    expect(niveisDeAgrupamento([])).toEqual([]);
    expect(niveisDeAgrupamento(undefined)).toEqual([]);
  });
});

describe('aplicarAgrupamentoNaPlanilha', () => {
  it('grava level só nas linhas com nível acima de 0, a partir da primeira linha de dados', () => {
    const ws = {};
    const maior = aplicarAgrupamentoNaPlanilha(ws, 4, [0, 1, 2, 1]);
    expect(maior).toBe(2);
    expect(ws['!rows'][4]).toBeUndefined(); // nível 0: fora do agrupamento
    expect(ws['!rows'][5]).toEqual({ level: 1 });
    expect(ws['!rows'][6]).toEqual({ level: 2 });
    expect(ws['!rows'][7]).toEqual({ level: 1 });
    expect(ws['!rows'][0]).toBeUndefined(); // título, cabeçalho e o que vier depois não entram
    expect(ws['!rows'][3]).toBeUndefined();
  });

  it('resumo acima dos detalhes: o botão +/- fica na linha do pai', () => {
    const ws = {};
    aplicarAgrupamentoNaPlanilha(ws, 4, [0, 1]);
    expect(ws['!outline'].above).toBe(true);
  });

  it('nunca esconde linha: a planilha abre expandida', () => {
    const ws = {};
    aplicarAgrupamentoNaPlanilha(ws, 4, niveisEsperados);
    expect(ws['!rows'].some((r) => r && (r.hidden || r.collapsed))).toBe(false);
  });

  it('preserva o que já existia em !rows e em !outline', () => {
    const ws = { '!rows': [], '!outline': { left: true } };
    ws['!rows'][5] = { hpt: 30 };
    aplicarAgrupamentoNaPlanilha(ws, 4, [0, 1]);
    expect(ws['!rows'][5]).toEqual({ hpt: 30, level: 1 });
    expect(ws['!outline']).toEqual({ left: true, above: true });
  });

  it('sem nenhum nível acima de 0 não mexe na planilha e devolve 0', () => {
    const ws = {};
    expect(aplicarAgrupamentoNaPlanilha(ws, 4, [0, 0, 0])).toBe(0);
    expect(aplicarAgrupamentoNaPlanilha(ws, 4, [])).toBe(0);
    expect(ws).toEqual({});
  });

  it('nível acima do limite do Excel é cortado em 7', () => {
    const ws = {};
    expect(aplicarAgrupamentoNaPlanilha(ws, 0, [9])).toBe(7);
    expect(ws['!rows'][0].level).toBe(7);
  });
});

// Monta a planilha como o exportExcelLista (4 linhas de cabeçalho, linhas da EAP, Total) com a biblioteca real.
function montarXlsxDoExemplo(lista = arvore, agrupar = true) {
  const HEADER_ROW = 3;
  const valores = lista.map((e, i) => (e.isGroup ? 0 : i + 1));
  const rows = [['Título'], ['Gerado em'], [], ['Etapa', 'Valor'], ...lista.map((e, i) => [e.id, valores[i]]), ['Total', '']];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const somas = montarSomasDosGrupos({ exportadas: lista, todas: lista, colunas: [1], primeiraLinhaExcel: HEADER_ROW + 2 });
  somas.porLinha.forEach((fs, i) => Object.entries(fs).forEach(([c, f]) => {
    ws[XLSX.utils.encode_cell({ r: HEADER_ROW + 1 + i, c: Number(c) })] = { t: 'n', v: 0, f };
  }));
  ws['!cols'] = [{ wch: 30 }, { wch: 14 }];
  const maior = agrupar ? aplicarAgrupamentoNaPlanilha(ws, HEADER_ROW + 1, niveisDeAgrupamento(lista)) : 0;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tarefas');
  const bytes = new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }));
  return { bytes, maior, HEADER_ROW };
}
const xmlDaPlanilha = (bytes) => strFromU8(unzipSync(bytes)['xl/worksheets/sheet1.xml']);

describe('aplicarNivelDeLinhaNoXlsx (planilha gravada com a biblioteca)', () => {
  it('grava outlineLevelRow no lugar certo do esquema e mantém o resto do arquivo', () => {
    const { bytes, maior } = montarXlsxDoExemplo();
    expect(maior).toBe(4);
    const novo = aplicarNivelDeLinhaNoXlsx(bytes, maior, fflate);
    const xml = xmlDaPlanilha(novo);
    expect(xml).toContain('<sheetFormatPr defaultRowHeight="15" outlineLevelRow="4"/>');
    // ordem do esquema: sheetPr, dimension, sheetViews, sheetFormatPr, cols, sheetData
    const pos = ['<sheetPr', '<dimension', '<sheetViews', '<sheetFormatPr', '<cols', '<sheetData'].map((tag) => xml.indexOf(tag));
    expect(pos.every((p) => p >= 0)).toBe(true);
    expect([...pos].sort((a, b) => a - b)).toEqual(pos);
    // o arquivo continua com as mesmas partes do original
    expect(Object.keys(unzipSync(novo)).sort()).toEqual(Object.keys(unzipSync(bytes)).sort());
  });

  it('resumo acima dos detalhes (summaryBelow="0") e nível por linha, nos níveis do exemplo', () => {
    const { bytes, maior, HEADER_ROW } = montarXlsxDoExemplo();
    const xml = xmlDaPlanilha(aplicarNivelDeLinhaNoXlsx(bytes, maior, fflate));
    expect(xml).toContain('summaryBelow="0"');
    // null = a linha nem existe no XML (a linha em branco de respiro não é gravada)
    const nivelDaLinha = (n) => {
      const m = new RegExp(`<row r="${n}"([^>]*)>`).exec(xml);
      if (!m) return null;
      const lv = /outlineLevel="(\d+)"/.exec(m[1]);
      return lv ? Number(lv[1]) : 0;
    };
    arvore.forEach((e, i) => {
      expect(nivelDaLinha(HEADER_ROW + 2 + i), `linha de ${e.id}`).toBe(niveisEsperados[i]);
    });
    // título, subtítulo, linha em branco, cabeçalho e Total ficam fora do agrupamento
    [1, 2, 3, HEADER_ROW + 1, HEADER_ROW + 2 + arvore.length].forEach((n) => expect(nivelDaLinha(n) ?? 0).toBe(0));
    expect(nivelDaLinha(HEADER_ROW + 1)).toBe(0); // o cabeçalho existe e não tem nível
  });

  it('nada fica escondido ou recolhido: abre expandida', () => {
    const { bytes, maior } = montarXlsxDoExemplo();
    const xml = xmlDaPlanilha(aplicarNivelDeLinhaNoXlsx(bytes, maior, fflate));
    expect(xml).not.toMatch(/\bhidden=/);
    expect(xml).not.toMatch(/\bcollapsed=/);
  });

  it('fórmulas de soma dos grupos continuam gravadas', () => {
    const { bytes, maior, HEADER_ROW } = montarXlsxDoExemplo();
    const novo = aplicarNivelDeLinhaNoXlsx(bytes, maior, fflate);
    const xml = xmlDaPlanilha(novo);
    // FUNDAÇÃO (linha 11 da planilha): soma das filhas diretas, espalhadas entre os subgrupos
    const linhaFundacao = HEADER_ROW + 2 + arvore.findIndex((e) => e.id === 'fundacao');
    const celula = new RegExp(`<c r="B${linhaFundacao}"[^>]*>.*?</c>`).exec(xml)[0];
    expect(celula).toContain('<f>SUM(');
    const lido = XLSX.read(novo, { cellFormula: true });
    expect(lido.Sheets.Tarefas[`B${linhaFundacao}`].f).toMatch(/^SUM\(/);
  });

  it('o agrupamento só acrescenta sheetPr, sheetFormatPr e outlineLevel: sem eles o XML é idêntico ao de antes', () => {
    const sem = montarXlsxDoExemplo(arvore, false);
    expect(sem.maior).toBe(0);
    const com = montarXlsxDoExemplo(arvore, true);
    const xmlCom = xmlDaPlanilha(aplicarNivelDeLinhaNoXlsx(com.bytes, com.maior, fflate));
    const semAgrupamento = xmlCom
      .replace(/<sheetPr>.*?<\/sheetPr>/, '')
      .replace(/<sheetFormatPr[^>]*\/>/, '')
      .replace(/ outlineLevel="\d+"/g, '');
    expect(semAgrupamento).toBe(xmlDaPlanilha(sem.bytes));
    // fórmulas, larguras de coluna e estilos moram no resto do arquivo: também não mudam
    const arqCom = unzipSync(aplicarNivelDeLinhaNoXlsx(com.bytes, com.maior, fflate));
    const arqSem = unzipSync(sem.bytes);
    ['xl/styles.xml', 'xl/workbook.xml', '[Content_Types].xml'].forEach((p) => {
      expect(strFromU8(arqCom[p]), p).toBe(strFromU8(arqSem[p]));
    });
  });

  it('releitura pela biblioteca devolve os mesmos níveis de linha', () => {
    const { bytes, maior, HEADER_ROW } = montarXlsxDoExemplo();
    const lido = XLSX.read(aplicarNivelDeLinhaNoXlsx(bytes, maior, fflate), { cellFormula: true, cellStyles: true });
    const rows = lido.Sheets.Tarefas['!rows'];
    arvore.forEach((e, i) => {
      expect(rows[HEADER_ROW + 1 + i]?.level ?? 0, e.id).toBe(niveisEsperados[i]);
    });
  });

  it('aceita ArrayBuffer e limita o nível ao máximo do Excel', () => {
    const { bytes } = montarXlsxDoExemplo();
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const novo = aplicarNivelDeLinhaNoXlsx(arrayBuffer, 12, fflate);
    expect(xmlDaPlanilha(novo)).toContain('outlineLevelRow="7"');
  });

  it('se a biblioteca já gravar sheetFormatPr, acerta só o atributo', () => {
    const base = '<worksheet><sheetViews><sheetView/></sheetViews><sheetFormatPr defaultRowHeight="20"/><sheetData/></worksheet>';
    const zip = zipSync({ 'xl/worksheets/sheet1.xml': strToU8(base) });
    const xml = xmlDaPlanilha(aplicarNivelDeLinhaNoXlsx(zip, 3, fflate));
    expect(xml).toContain('<sheetFormatPr outlineLevelRow="3" defaultRowHeight="20"/>');
    expect(xml.match(/<sheetFormatPr/g)).toHaveLength(1);
    // já com o atributo: fica o maior
    const zip2 = zipSync({ 'xl/worksheets/sheet1.xml': strToU8('<worksheet><sheetFormatPr defaultRowHeight="15" outlineLevelRow="5"/><sheetData/></worksheet>') });
    expect(xmlDaPlanilha(aplicarNivelDeLinhaNoXlsx(zip2, 3, fflate))).toContain('outlineLevelRow="5"');
  });

  it('sem larguras de coluna, o elemento entra antes de sheetData', () => {
    const zip = zipSync({ 'xl/worksheets/sheet1.xml': strToU8('<worksheet><sheetViews/><sheetData/></worksheet>') });
    expect(xmlDaPlanilha(aplicarNivelDeLinhaNoXlsx(zip, 2, fflate)))
      .toBe('<worksheet><sheetViews/><sheetFormatPr defaultRowHeight="15" outlineLevelRow="2"/><sheetData/></worksheet>');
  });

  it('arquivo sem planilha ou sem sheetData: lança erro (quem chama exporta o original)', () => {
    expect(() => aplicarNivelDeLinhaNoXlsx(zipSync({ 'a.xml': strToU8('<a/>') }), 2, fflate)).toThrow();
    expect(() => aplicarNivelDeLinhaNoXlsx(zipSync({ 'xl/worksheets/sheet1.xml': strToU8('<worksheet/>') }), 2, fflate)).toThrow();
  });
});
