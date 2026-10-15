// PDF da aba Análise. Reaproveita os cálculos da própria aba (analisePure.js) e deixa o usuário
// escolher o que entra: gráfico de realizado e projeção (da função/classificação escolhida na
// tela), evolução do efetivo e a tabela do mês. Os gráficos são DESENHADOS com retângulos e
// linhas do jsPDF (vetor, nítido, sem html2canvas). jspdf só é carregado no clique.
import { STATUS_UI, corSaldo, status, usoPct } from './regras';
import { TODOS, funcoesDaOpcao, serieProjecao } from './analisePure';

const BRAND = [28, 69, 132]; // #1C4584 (identidade Soter)
const CLARO = [211, 225, 244]; // previsto / projeção
const VERMELHO = '#b42318';
const AZUL = '#1C4584';

// Fonte padrão do jsPDF (Helvetica) não tem o "−" (U+2212) nem o travessão: sinal e vazio em ASCII.
const r1 = (v) => Math.round(v * 10) / 10;
export const fmt = (v) => (v == null ? '-' : r1(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 }));
export const sg = (v) => { const x = r1(v); return x > 0.05 ? '+' + fmt(x) : x < -0.05 ? '-' + fmt(-x) : '0'; };
const rgbDe = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// Dados do PDF, sem nada de desenho (testável). `linhas` e `evo` vêm prontos da aba, já com os
// filtros dela (por função/classificação, grupo, ordem); `opcao` é a função/classificação do
// gráfico de projeção (ou TODOS).
export const montarAnalise = ({ s, mesSel, meses, opcao, linhas, evo, nA, filtros = {}, obraNome, obraCodigo }) => {
  let projecao = null;
  if (opcao) {
    const { tot, cons, saldo, rest, proj, qtd, pts } = serieProjecao(s, funcoesDaOpcao(s, opcao), mesSel, meses);
    projecao = {
      opcao,
      subtitulo: opcao === TODOS ? 'Todas as funções somadas' : opcao,
      kpis: [
        { rotulo: 'Orçado', valor: fmt(tot), cor: null },
        { rotulo: `Realizado até ${mesSel.label}`, valor: fmt(cons), cor: AZUL },
        { rotulo: 'Saldo', valor: saldo < 0 ? '-' + fmt(Math.abs(saldo)) : fmt(saldo), cor: corSaldo(saldo) },
        { rotulo: `Projeção/mês (${rest} ${rest === 1 ? 'mês' : 'meses'})`, valor: rest ? fmt(proj) : '-', cor: rest && proj < qtd - 0.05 ? VERMELHO : null },
      ],
      pts: pts.map((p) => ({ label: p.m.label, v: p.v, prev: p.prev, past: p.past, atual: p.m.abs === mesSel.abs })),
    };
  }
  const evolucao = evo.map((x) => ({ label: x.m.label, p: x.p, e: x.e, atual: x.m.abs === mesSel.abs }));
  const tabela = {
    titulo: filtros.verPor === 'classificacao' ? 'Efetivo do mês por classificação' : 'Efetivo do mês por função',
    primeiraColuna: filtros.verPor === 'classificacao' ? 'Classificação' : 'Função',
    linhas: linhas.map((l) => {
      const st = status(l.p, l.m);
      const saldoMes = l.m == null ? null : l.p - l.m;
      return {
        nome: l.nome, sub: l.sub, p: l.p, a1: l.a1, a2: l.a2, m: l.m,
        saldoMes, uso: l.m == null ? null : usoPct(l.m, l.p), ac: l.ac,
        status: STATUS_UI[st].rotulo, corStatus: STATUS_UI[st].cor,
        corSaldoMes: saldoMes == null ? null : corSaldo(saldoMes), corAc: l.ac == null ? null : corSaldo(l.ac),
      };
    }),
  };
  const apropriada = nA === 2 ? 'usando a 2ª quinzena' : nA === 1 ? 'usando a 1ª quinzena' : 'sem apropriação lançada';
  return {
    obraNome, obraCodigo, ano: mesSel.ano, mes: mesSel.mes,
    mesLabel: mesSel.label.replace('/', '/20'),
    subtitulo: [mesSel.label.replace('/', '/20'), `Efetivo do mês = última apropriação lançada (${apropriada})`,
      filtros.grupoNome ? `Grupo: ${filtros.grupoNome}` : null, filtros.ordemRotulo ? `Ordem: ${filtros.ordemRotulo}` : null].filter(Boolean).join(' · '),
    projecao, evolucao, tabela,
  };
};

export const titulo = (d) => `Análise de Efetivo · ${d.obraNome || d.obraCodigo}`;
export const nomeArquivo = (d) => {
  const cod = String(d.obraCodigo || 'obra').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'obra';
  return `analise-efetivo-${cod}-${d.ano}-${String(d.mes).padStart(2, '0')}.pdf`;
};

// Larguras da tabela em mm: somam exatamente os 277 úteis do A4 paisagem (menos que isso o
// autotable estica e avisa no console; mais, estoura a página). Conferido em teste.
export const LARGURAS_TABELA = [66, 58, 20, 14, 14, 18, 22, 14, 22, 29];

// ---- desenho ---------------------------------------------------------------------------------
const M = 10; // margem lateral
const AREA_W = 277; // largura útil do A4 paisagem

const tituloDoBloco = (doc, texto, sub, y) => {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...BRAND);
  doc.text(texto, M, y);
  if (sub) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(110); doc.text(sub, M + AREA_W, y, { align: 'right' }); }
  doc.setTextColor(0);
};

const legenda = (doc, itens, y) => {
  let x = M;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
  for (const it of itens) {
    if (it.tipo === 'linha') { doc.setDrawColor(30); doc.setLineWidth(0.5); doc.line(x, y - 1, x + 4, y - 1); }
    else if (it.tipo === 'tracejado') { doc.setFillColor(...CLARO); doc.setDrawColor(...BRAND); doc.setLineWidth(0.2); doc.setLineDashPattern([0.6, 0.6], 0); doc.rect(x, y - 2.6, 3, 3, 'FD'); doc.setLineDashPattern([], 0); }
    else { doc.setFillColor(...it.cor); doc.rect(x, y - 2.6, 3, 3, 'F'); }
    doc.setTextColor(90); doc.text(it.texto, x + 5, y);
    x += 5 + doc.getTextWidth(it.texto) + 7;
  }
  doc.setTextColor(0);
};

// Eixo: baseline, rótulos dos meses e destaque do mês selecionado. Devolve a função que dá o x do
// centro de cada barra.
const eixo = (doc, { x, y, w, h }, labels, destaque) => {
  const slot = w / labels.length;
  labels.forEach((_, i) => {
    if (destaque[i]) { doc.setFillColor(232, 240, 252); doc.rect(x + i * slot, y - h - 6, slot, h + 6 + 7, 'F'); }
  });
  doc.setDrawColor(190); doc.setLineWidth(0.3); doc.line(x, y, x + w, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(labels.length > 20 ? 5.5 : 6.5);
  labels.forEach((l, i) => { doc.setTextColor(destaque[i] ? BRAND[0] : 120, destaque[i] ? BRAND[1] : 120, destaque[i] ? BRAND[2] : 120); doc.text(l, x + i * slot + slot / 2, y + 4, { align: 'center' }); });
  doc.setTextColor(0);
  return { slot, cx: (i) => x + i * slot + slot / 2 };
};

// Gráfico de realizado (barra cheia) e projeção (barra clara tracejada), com o previsto em traço.
const desenharProjecao = (doc, p, y0) => {
  tituloDoBloco(doc, 'Realizado e projeção até o término da obra', p.subtitulo, y0);
  const kw = (AREA_W - 3 * 4) / 4;
  p.kpis.forEach((k, i) => {
    const x = M + i * (kw + 4), y = y0 + 3;
    doc.setDrawColor(215, 220, 230); doc.setLineWidth(0.25); doc.roundedRect(x, y, kw, 13, 1.5, 1.5, 'S');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(110); doc.text(k.rotulo, x + 3, y + 4.5);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...(k.cor ? rgbDe(k.cor) : [20, 20, 20])); doc.text(k.valor, x + 3, y + 10.5);
  });
  doc.setTextColor(0);
  const area = { x: M, y: y0 + 3 + 13 + 8 + 44, w: AREA_W, h: 44 };
  const mx = Math.max(1, ...p.pts.map((q) => Math.max(q.v, q.prev))) * 1.12;
  const { slot, cx } = eixo(doc, area, p.pts.map((q) => q.label), p.pts.map((q) => q.atual));
  const bw = Math.min(slot * 0.6, 7);
  p.pts.forEach((q, i) => {
    const bh = (q.v / mx) * area.h, x = cx(i) - bw / 2;
    if (q.past) { doc.setFillColor(...BRAND); doc.rect(x, area.y - bh, bw, bh, 'F'); }
    else { doc.setFillColor(...CLARO); doc.setDrawColor(...BRAND); doc.setLineWidth(0.2); doc.setLineDashPattern([0.6, 0.6], 0); doc.rect(x, area.y - bh, bw, bh, 'FD'); doc.setLineDashPattern([], 0); }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6); doc.setTextColor(q.past ? 30 : BRAND[0], q.past ? 30 : BRAND[1], q.past ? 30 : BRAND[2]);
    doc.text(fmt(q.v), cx(i), area.y - bh - 1.2, { align: 'center' });
    if (q.prev > 0) { doc.setDrawColor(30); doc.setLineWidth(0.5); const py = area.y - (q.prev / mx) * area.h; doc.line(cx(i) - slot * 0.4, py, cx(i) + slot * 0.4, py); }
  });
  doc.setTextColor(0);
  legenda(doc, [{ tipo: 'cheio', cor: BRAND, texto: 'Realizado (última apropriação do mês)' }, { tipo: 'tracejado', texto: 'Projeção (saldo / meses restantes)' }, { tipo: 'linha', texto: 'Previsto do orçamento' }], area.y + 11);
  return area.y + 14;
};

// Evolução: previsto x efetivo de cada mês, do início da obra até o mês corrente.
const desenharEvolucao = (doc, evo, y0) => {
  tituloDoBloco(doc, 'Evolução do efetivo', null, y0);
  if (!evo.length) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110); doc.text('A obra ainda não começou.', M, y0 + 8); doc.setTextColor(0);
    return y0 + 12;
  }
  const area = { x: M, y: y0 + 3 + 6 + 34, w: AREA_W, h: 34 };
  const mx = Math.max(1, ...evo.map((x) => Math.max(x.p, x.e))) * 1.08;
  const { slot, cx } = eixo(doc, area, evo.map((x) => x.label), evo.map((x) => x.atual));
  const bw = Math.min(slot * 0.3, 7);
  evo.forEach((q, i) => {
    const hp = (q.p / mx) * area.h, he = (q.e / mx) * area.h;
    doc.setFillColor(...CLARO); doc.rect(cx(i) - bw - 0.3, area.y - hp, bw, hp, 'F');
    doc.setFillColor(...BRAND); doc.rect(cx(i) + 0.3, area.y - he, bw, he, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6); doc.setTextColor(30); doc.text(fmt(q.e), cx(i) + 0.3 + bw / 2, area.y - Math.max(hp, he) - 1.2, { align: 'center' });
  });
  doc.setTextColor(0);
  legenda(doc, [{ tipo: 'cheio', cor: CLARO, texto: 'Previsto' }, { tipo: 'cheio', cor: BRAND, texto: 'Efetivo' }], area.y + 11);
  return area.y + 14;
};

export const exportarAnalisePDF = async (d, blocos) => {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const H = doc.internal.pageSize.getHeight();

  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...BRAND); doc.text(titulo(d), M, 13);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60); doc.text(d.subtitulo, M, 19);
  doc.setFontSize(8); doc.setTextColor(130); doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, M, 24);
  doc.setTextColor(0);

  let y = 31;
  const cabe = (altura) => { if (y + altura > H - 12) { doc.addPage(); y = 14; } };
  if (blocos.projecao && d.projecao) { cabe(82); y = desenharProjecao(doc, d.projecao, y) + 6; }
  if (blocos.evolucao) { cabe(62); y = desenharEvolucao(doc, d.evolucao, y) + 6; }
  if (blocos.tabela) {
    cabe(45);
    tituloDoBloco(doc, d.tabela.titulo, null, y);
    if (!d.tabela.linhas.length) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110); doc.text('Nenhuma função com previsto ou efetivo neste mês.', M, y + 8); doc.setTextColor(0);
    } else {
      const col = (i) => ({ halign: i < 2 ? 'left' : i === 9 ? 'left' : 'right', cellWidth: LARGURAS_TABELA[i] });
      autoTable(doc, {
        startY: y + 3,
        head: [[d.tabela.primeiraColuna, 'Grupo / classificação', 'Previsto', '1ª', '2ª', 'Efetivo', 'Saldo mês', 'Uso', 'Saldo acum.', 'Status']],
        body: d.tabela.linhas.map((l) => [l.nome, l.sub, fmt(l.p), fmt(l.a1), fmt(l.a2), fmt(l.m), l.saldoMes == null ? '-' : sg(l.saldoMes), l.uso == null ? '-' : `${l.uso}%`, l.ac == null ? '-' : sg(l.ac), l.status]),
        theme: 'grid',
        styles: { fontSize: 7.5, cellPadding: 1.6, textColor: 40, lineColor: [215, 220, 230] },
        headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold', fontSize: 7, halign: 'center', valign: 'middle' },
        alternateRowStyles: { fillColor: [248, 249, 250] },
        columnStyles: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i, col(i)])),
        margin: { top: 14, right: M, bottom: 12, left: M },
        didParseCell: (data) => {
          if (data.section !== 'body') return;
          const l = d.tabela.linhas[data.row.index];
          const cor = { 6: l.corSaldoMes, 8: l.corAc, 9: l.corStatus }[data.column.index];
          if (cor) data.cell.styles.textColor = rgbDe(cor);
          if (data.column.index === 5) data.cell.styles.fontStyle = 'bold';
        },
      });
    }
  }

  // Rodapé com "Página N de M" em todas as páginas (as de gráfico não passam pelo autotable).
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(150);
    doc.text(`Página ${i} de ${n}`, M + AREA_W, H - 6, { align: 'right' }); doc.setTextColor(0);
  }
  doc.save(nomeArquivo(d));
};
