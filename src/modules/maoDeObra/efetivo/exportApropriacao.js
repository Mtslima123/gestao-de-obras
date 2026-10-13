// Exportação da aba Apropriação (PDF e Excel). Recebe os grupos e o total que a própria tela
// já calculou, para o arquivo bater com o que se vê: nada é recalculado aqui. O que sai é a
// quinzena aberta, agrupada como estiver na tela (e com a busca, se houver), com os grupos
// sempre expandidos. jspdf e xlsx-js-style só são carregados no clique, como nos outros
// exports do app.
import { STATUS_UI, corSaldo, status, usoPct } from './regras';

const BRAND = [28, 69, 132]; // #1C4584 (identidade Soter)
const r2 = (v) => Math.round(v * 100) / 100;

// `tipo` define o formato: 'texto' sai como veio, 'num' com vírgula decimal e 'saldo' com sinal.
// larguraPdf em mm: soma exatamente os 277 úteis do A4 paisagem (conferido em teste). Menos que
// isso o autotable esticaria a tabela e avisaria no console que "sobrou largura"; mais que isso
// estouraria a página. larguraXls em caracteres.
export const COLUNAS = [
  { id: 'nome',         rotulo: 'Função',              tipo: 'texto', alinha: 'left',   larguraPdf: 56, larguraXls: 34 },
  { id: 'prev',         rotulo: 'Previsto (mês)',      tipo: 'num',   alinha: 'center', larguraPdf: 14, larguraXls: 10 },
  { id: 'totalEfetivo', rotulo: 'Total efetivo',       tipo: 'num',   alinha: 'center', larguraPdf: 14, larguraXls: 10 },
  { id: 'trabAdm',      rotulo: 'Trab. na ADM',        tipo: 'num',   alinha: 'center', larguraPdf: 13, larguraXls: 10 },
  { id: 'canteiro',     rotulo: 'Trab. no canteiro',   tipo: 'num',   alinha: 'center', larguraPdf: 14, larguraXls: 10 },
  { id: 'inssSeguro',   rotulo: 'INSS/ Seguro',        tipo: 'num',   alinha: 'center', larguraPdf: 13, larguraXls: 10 },
  { id: 'ferias',       rotulo: 'Férias',              tipo: 'num',   alinha: 'center', larguraPdf: 12, larguraXls: 8 },
  { id: 'emprestManut', rotulo: 'Emprest./ Manut.',    tipo: 'num',   alinha: 'center', larguraPdf: 14, larguraXls: 10 },
  { id: 'destino',      rotulo: 'Destino',             tipo: 'texto', alinha: 'left',   larguraPdf: 30, larguraXls: 22 },
  { id: 'recebido',     rotulo: 'Recebido outra obra', tipo: 'num',   alinha: 'center', larguraPdf: 15, larguraXls: 12 },
  { id: 'origem',       rotulo: 'Origem',              tipo: 'texto', alinha: 'left',   larguraPdf: 30, larguraXls: 22 },
  { id: 'ativos',       rotulo: 'Ativos',              tipo: 'num',   alinha: 'center', larguraPdf: 12, larguraXls: 8 },
  { id: 'saldo',        rotulo: 'Saldo',               tipo: 'saldo', alinha: 'right',  larguraPdf: 12, larguraXls: 8 },
  { id: 'status',       rotulo: 'Status',              tipo: 'texto', alinha: 'left',   larguraPdf: 28, larguraXls: 20 },
];

// Linha de um grupo ou do total: `o` é a soma que a tela monta (prev, totalEfetivo, trabAdm,
// can, inssSeguro, ferias, emprestManut, recebidoOutraObra, at, any). Sem nenhum valor
// apropriado, saldo e status ficam em branco, como o "—" da tela.
const linhaDeSoma = (tipo, nome, o) => {
  const saldo = o.any ? r2(o.prev - o.at) : null;
  const pct = o.any ? usoPct(o.at, o.prev) : null;
  return {
    tipo, nome,
    prev: r2(o.prev), totalEfetivo: o.totalEfetivo, trabAdm: o.trabAdm, canteiro: o.can,
    inssSeguro: o.inssSeguro, ferias: o.ferias, emprestManut: o.emprestManut,
    destino: '', recebido: o.recebidoOutraObra, origem: '',
    ativos: o.any ? o.at : null, saldo,
    status: o.any ? `${pct ?? '-'}%` : '',
    corSaldo: o.any ? corSaldo(saldo) : null,
    corStatus: o.any ? STATUS_UI[status(o.prev, o.at)].cor : null,
  };
};

// Linha de uma função: `r` é a linha da tela ({ f, it, pv, at, can, tot }).
const linhaDeFuncao = ({ f, it, pv, at, can, tot }) => {
  const ui = STATUS_UI[status(pv, at)];
  const saldo = at == null ? null : r2(pv - at);
  return {
    tipo: 'funcao', nome: f.nome,
    prev: r2(pv), totalEfetivo: tot, trabAdm: it?.trabAdm ?? null, canteiro: can,
    inssSeguro: it?.inssSeguro ?? null, ferias: it?.ferias ?? null, emprestManut: it?.emprestManut ?? null,
    destino: it?.destino ?? '', recebido: it?.recebidoOutraObra ?? null, origem: it?.origem ?? '',
    ativos: at, saldo,
    status: ui.rotulo,
    corSaldo: saldo == null ? null : corSaldo(saldo),
    corStatus: ui.cor,
  };
};

// `grupos` = [{ nome, rows, G }] e `total` = TOT, ambos como a tela os calcula.
export const montarLinhas = ({ grupos, total }) => ({
  linhas: grupos.flatMap((g) => [linhaDeSoma('grupo', g.nome, g.G), ...g.rows.map(linhaDeFuncao)]),
  total: linhaDeSoma('total', 'TOTAL', total),
});

const hojeBr = () => new Date().toLocaleDateString('pt-BR');
const rgbDe = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// Título e subtítulo iguais nos dois formatos. `busca` entra no subtítulo para o arquivo não
// parecer completo quando saiu filtrado.
export const titulo = (d) => `Apropriação de Efetivo · ${d.obraNome || d.obraCodigo}`;
export const subtitulo = (d) => [
  d.mesLabel,
  `${d.quinzena}ª apropriação (${d.periodo})`,
  d.situacao,
  d.busca ? `Busca: "${d.busca}"` : null,
].filter(Boolean).join(' · ');

export const nomeArquivo = (d, ext) => {
  const cod = String(d.obraCodigo || 'obra').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'obra';
  return `apropriacao-efetivo-${cod}-${d.ano}-${String(d.mes).padStart(2, '0')}-${d.quinzena}a.${ext}`;
};

// ---- PDF -------------------------------------------------------------------------------------
// Texto de uma célula no PDF. O sinal do saldo é o hífen comum: a fonte padrão do jsPDF não
// tem o "−" (U+2212) que a tela usa.
const textoPdf = (col, v) => {
  if (v == null || v === '') return '';
  if (col.tipo === 'texto') return String(v);
  const x = r2(v);
  const n = String(Math.abs(x)).replace('.', ',');
  if (col.tipo === 'saldo') return x > 0 ? `+${n}` : x < 0 ? `-${n}` : '0';
  return String(x).replace('.', ',');
};

export const exportarPDF = async (d) => {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const { linhas, total } = montarLinhas(d);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  doc.setFontSize(14); doc.setTextColor(...BRAND);
  doc.text(titulo(d), 10, 13);
  doc.setFontSize(9); doc.setTextColor(60);
  doc.text(subtitulo(d), 10, 19);
  doc.setFontSize(8); doc.setTextColor(130);
  doc.text(`Gerado em ${hojeBr()}`, 10, 24);
  doc.setTextColor(0);

  const colSaldo = COLUNAS.findIndex((c) => c.id === 'saldo');
  const colStatus = COLUNAS.findIndex((c) => c.id === 'status');
  autoTable(doc, {
    startY: 28,
    head: [COLUNAS.map((c) => c.rotulo)],
    body: linhas.map((l) => COLUNAS.map((c) => textoPdf(c, l[c.id]))),
    foot: [COLUNAS.map((c) => textoPdf(c, total[c.id]))],
    showFoot: 'lastPage',
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.5, textColor: 40, lineColor: [215, 220, 230] },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold', fontSize: 6.5, halign: 'center', valign: 'middle' },
    footStyles: { fillColor: [225, 232, 242], textColor: 20, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 249, 250] },
    columnStyles: Object.fromEntries(COLUNAS.map((c, i) => [i, { halign: c.alinha, cellWidth: c.larguraPdf }])),
    margin: { top: 28, right: 10, bottom: 12, left: 10 },
    didParseCell: (data) => {
      if (data.section === 'head') return;
      const l = data.section === 'foot' ? total : linhas[data.row.index];
      if (!l) return;
      if (l.tipo === 'grupo') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [232, 240, 252];
        data.cell.styles.textColor = 20;
      }
      // Função recuada sob o grupo, como na tela.
      if (l.tipo === 'funcao' && data.column.index === 0) data.cell.styles.cellPadding = { top: 1.5, right: 1.5, bottom: 1.5, left: 5 };
      const cor = data.column.index === colSaldo ? l.corSaldo : data.column.index === colStatus ? l.corStatus : null;
      if (cor) data.cell.styles.textColor = rgbDe(cor);
    },
    didDrawPage: ({ pageNumber }) => {
      doc.setFontSize(8); doc.setTextColor(150);
      doc.text(`Página ${pageNumber}`, W - 24, H - 6);
      doc.setTextColor(0);
    },
  });
  doc.save(nomeArquivo(d, 'pdf'));
};

// ---- Excel -----------------------------------------------------------------------------------
export const exportarExcel = async (d) => {
  const mod = await import('xlsx-js-style');
  const XLSX = mod.utils ? mod : mod.default; // interop: xlsx-js-style não expõe named exports estáticos como o `xlsx`
  // Estilos e helper compartilhados com os outros exports; carregados aqui para não entrarem
  // no pacote da aba antes do clique.
  const { XLSX_HEADER_STYLE, XLSX_GROUP_ROW_STYLE, XLSX_TOTAL_ROW_STYLE, XLSX_TITLE_STYLE, XLSX_SUBTITLE_STYLE, aplicarEstiloLinha } =
    await import('../../cronograma/cronogramaShared');

  const { linhas, total } = montarLinhas(d);
  const HEADER_ROW = 3;
  const nCols = COLUNAS.length;
  // Números crus (nunca texto formatado) para o Excel poder somar e ordenar.
  const celulas = (l) => COLUNAS.map((c) => (c.tipo === 'texto' ? (l[c.id] ?? '') : (l[c.id] ?? null)));
  const rows = [
    [titulo(d)],
    [`${subtitulo(d)} · Gerado em ${hojeBr()}`],
    [],
    COLUNAS.map((c) => c.rotulo.replace('/ ', '/')),
    ...linhas.map(celulas),
    celulas(total),
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = COLUNAS.map((c) => ({ wch: c.larguraXls }));
  // Sem painel congelado de propósito: o xlsx-js-style não grava (o '!freeze' dos outros
  // exports do app é ignorado, conferido no XML gerado).
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: nCols - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: nCols - 1 } },
  ];
  ws.A1.s = { ...XLSX_TITLE_STYLE };
  ws.A2.s = { ...XLSX_SUBTITLE_STYLE };
  aplicarEstiloLinha(XLSX, ws, HEADER_ROW, nCols, XLSX_HEADER_STYLE);

  // Linhas de grupo e de total levam o estilo da faixa inteira; função só recebe o recuo do
  // nome. Depois, saldo e status ganham a cor da tela (azul/vermelho/cinza, verde/vermelho).
  const colSaldo = COLUNAS.findIndex((c) => c.id === 'saldo');
  const colStatus = COLUNAS.findIndex((c) => c.id === 'status');
  const pintar = (r, c, hex, negrito) => {
    const addr = XLSX.utils.encode_cell({ r, c });
    if (!ws[addr] || !hex) return;
    ws[addr].s = { ...(ws[addr].s || {}), font: { bold: negrito, color: { rgb: hex.slice(1).toUpperCase() } } };
  };
  const todas = [...linhas, total];
  todas.forEach((l, i) => {
    const r = HEADER_ROW + 1 + i;
    const faixa = l.tipo === 'total';
    if (l.tipo === 'grupo') aplicarEstiloLinha(XLSX, ws, r, nCols, XLSX_GROUP_ROW_STYLE);
    else if (faixa) aplicarEstiloLinha(XLSX, ws, r, nCols, XLSX_TOTAL_ROW_STYLE);
    else if (ws[XLSX.utils.encode_cell({ r, c: 0 })]) ws[XLSX.utils.encode_cell({ r, c: 0 })].s = { alignment: { horizontal: 'left', indent: 1 } };
    const negrito = l.tipo !== 'funcao';
    pintar(r, colSaldo, l.corSaldo, negrito);
    pintar(r, colStatus, l.corStatus, negrito);
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `${d.quinzena}ª apropriação`);
  XLSX.writeFile(wb, nomeArquivo(d, 'xlsx'));
};
