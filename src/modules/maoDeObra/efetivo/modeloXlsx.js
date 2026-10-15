// Planilhas-modelo do Importar (Previsto e Apropriação): o arquivo padrão que o usuário baixa,
// completa e importa de volta. O formato é o MESMO que importXlsxPure.js lê (cabeçalhos, ordem
// das colunas, DATA/OBRA acima do cabeçalho), já com as funções da obra listadas por grupo e com
// o que a obra já tem preenchido. Os construtores são puros (matriz de linhas) para o teste de
// ida e volta com os leitores reais; o Excel (xlsx-js-style) só é carregado no clique.
import { GRUPOS } from './efetivoStore';

const NOTA_PREVISTO = 'Preencha QTD/MÊS (e, se quiser, INÍCIO e TÉRMINO no formato dd/mm/aaaa). Linhas sem quantidade são ignoradas; início e término em branco usam as datas da obra.';
const NOTA_EFETIVO = 'Preencha só as funções que tiverem dados; linhas sem valor são ignoradas. Trab. no canteiro e Ativos são calculados pelo sistema. Total efetivo é o total bruto (canteiro + ADM + INSS/seguro + férias + emprest./manut.).';

export const CAB_PREVISTO = ['FUNÇÃO', 'QTD/MÊS', 'INÍCIO', 'TÉRMINO'];
export const CAB_EFETIVO = ['FUNÇÃO', 'TOTAL EFETIVO', 'TRAB. NA ADM', 'TRAB. NO CANTEIRO', 'INSS/SEGURO', 'FÉRIAS', 'EMPREST./MANUT.', 'DESTINO', 'RECEBIDO OUTRA OBRA', 'ORIGEM', 'ATIVOS'];
const LARGURAS_PREVISTO = [38, 12, 14, 14];
const LARGURAS_EFETIVO = [38, 14, 14, 18, 14, 10, 17, 24, 20, 24, 10];

// Data como TEXTO dd/mm/aaaa: o leitor (paraIso) entende, e evita o dia a menos que o xlsx-js-style
// causa quando recebe um Date em fuso negativo (mesmo cuidado de excelDateExport.test.js).
const isoParaBr = (iso) => (iso ? iso.split('-').reverse().join('/') : null);

// Título de grupo (linha só com o nome) seguido das funções dele. O leitor ignora a linha que não
// tem nenhum valor, então título de grupo e função não preenchida não viram "não encontrada".
const porGrupo = (funcoes, linhaDaFuncao, nCols) => {
  const linhas = [], linhasGrupo = [];
  for (const g of GRUPOS) {
    const fs = funcoes.filter((f) => f.ativo !== false && f.grupoId === g.id);
    if (!fs.length) continue;
    linhasGrupo.push(linhas.length);
    linhas.push([g.nome, ...Array(nCols - 1).fill(null)]);
    for (const f of fs) linhas.push(linhaDaFuncao(f));
  }
  return { linhas, linhasGrupo };
};

// Previsto: FUNÇÃO | QTD/MÊS | INÍCIO | TÉRMINO. Quem já tem previsto na obra vem preenchido;
// quem não tem fica com a linha inteira em branco (data sem quantidade seria recusada).
export const linhasModeloPrevisto = ({ funcoes, previsto = [] }) => {
  const topo = [['Modelo de orçamento do previsto de efetivo'], [NOTA_PREVISTO], []];
  const { linhas, linhasGrupo } = porGrupo(funcoes, (f) => {
    const p = previsto.find((x) => x.funcaoId === f.id);
    return [f.nome, p ? p.qtdMes : null, p ? isoParaBr(p.inicio) : null, p ? isoParaBr(p.termino) : null];
  }, CAB_PREVISTO.length);
  const linhaCabecalho = topo.length;
  return {
    linhas: [...topo, CAB_PREVISTO, ...linhas],
    linhaCabecalho,
    linhasGrupo: linhasGrupo.map((i) => linhaCabecalho + 1 + i),
    larguras: LARGURAS_PREVISTO,
  };
};

// Apropriação: OBRA e DATA (dia 01 ou 16, que é o que avisosDeContexto confere) acima do cabeçalho
// de 11 colunas. Preenche com o rascunho/lançamento da quinzena (`apropriacao`, pode ser undefined).
// TOTAL EFETIVO sai no valor bruto do banco, que é o que o importador espera.
export const linhasModeloEfetivo = ({ funcoes, apropriacao, obraNome, obraCodigo, ano, mes, quinzena }) => {
  const dia = quinzena === 1 ? '01' : '16';
  const topo = [
    ['Modelo de apropriação de efetivo'],
    [NOTA_EFETIVO],
    ['OBRA', obraNome || obraCodigo || ''],
    ['DATA', `${dia}/${String(mes).padStart(2, '0')}/${ano}`],
    [],
  ];
  const { linhas, linhasGrupo } = porGrupo(funcoes, (f) => {
    const it = apropriacao?.itens.find((i) => i.funcaoId === f.id);
    return [f.nome, it?.totalEfetivo ?? null, it?.trabAdm ?? null, null, it?.inssSeguro ?? null, it?.ferias ?? null,
      it?.emprestManut ?? null, it?.destino ?? null, it?.recebidoOutraObra ?? null, it?.origem ?? null, null];
  }, CAB_EFETIVO.length);
  const linhaCabecalho = topo.length;
  return {
    linhas: [...topo, CAB_EFETIVO, ...linhas],
    linhaCabecalho,
    linhasGrupo: linhasGrupo.map((i) => linhaCabecalho + 1 + i),
    larguras: LARGURAS_EFETIVO,
  };
};

const slug = (v) => String(v || 'obra').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'obra';
export const nomeModeloPrevisto = ({ obraCodigo }) => `modelo-previsto-${slug(obraCodigo)}.xlsx`;
export const nomeModeloEfetivo = ({ obraCodigo, ano, mes, quinzena }) =>
  `modelo-apropriacao-${slug(obraCodigo)}-${ano}-${String(mes).padStart(2, '0')}-${quinzena}a.xlsx`;

// ---- Excel -----------------------------------------------------------------------------------
const escrever = async ({ linhas, linhaCabecalho, linhasGrupo, larguras }, aba, arquivo) => {
  const mod = await import('xlsx-js-style');
  const XLSX = mod.utils ? mod : mod.default; // interop: xlsx-js-style não expõe named exports estáticos como o `xlsx`
  // Estilos e helper compartilhados com os outros exports; carregados aqui para não entrarem no
  // pacote da aba antes do clique.
  const { XLSX_HEADER_STYLE, XLSX_GROUP_ROW_STYLE, XLSX_TITLE_STYLE, XLSX_SUBTITLE_STYLE, aplicarEstiloLinha } =
    await import('../../cronograma/cronogramaShared');

  const nCols = larguras.length;
  const ws = XLSX.utils.aoa_to_sheet(linhas);
  ws['!cols'] = larguras.map((wch) => ({ wch }));
  ws.A1.s = { ...XLSX_TITLE_STYLE };
  ws.A2.s = { ...XLSX_SUBTITLE_STYLE };
  aplicarEstiloLinha(XLSX, ws, linhaCabecalho, nCols, XLSX_HEADER_STYLE);
  linhasGrupo.forEach((r) => aplicarEstiloLinha(XLSX, ws, r, nCols, XLSX_GROUP_ROW_STYLE));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, aba);
  XLSX.writeFile(wb, arquivo);
};

export const baixarModeloPrevisto = (dados) => escrever(linhasModeloPrevisto(dados), 'Previsto', nomeModeloPrevisto(dados));
export const baixarModeloEfetivo = (dados) => escrever(linhasModeloEfetivo(dados), 'Apropriação', nomeModeloEfetivo(dados));
