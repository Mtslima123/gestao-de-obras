// Regras puras da Linha do tempo (o Gantt da casca mobile, sem React): escala de datas, onde fica cada barra,
// cabeçalho, feriados, caminho crítico e quais linhas desenhar. Quem lê e grava os dados continua sendo o
// CronogramaFull; aqui só se calcula posição. Mesma leitura de datas do Gantt do desktop (offsets em dias desde o
// marco fixo do projeto, término por dias úteis via taskEnd).
import {
  dateToOffset, offsetToDate, offsetToISO, taskEnd, taskEndDisplay, todayOffset,
} from '../../../cronograma/cronogramaDateUtils';
import {
  buildCalendarMonths, buildCalendarYears, buildCalendarWeeks, buildCalendarDays,
} from '../../../cronograma/ganttUtils';
import { classificarConflitos } from '../../../cronograma/conflitosOkPure';

// px por dia de cada escala: os mesmos valores do Gantt do desktop (o trimestre fica de fora: num celular a barra
// some). O padrão é o mês porque dá a visão da obra inteira; semana e dia servem para conferir uma etapa.
export const ZOOMS_DA_LINHA = [
  { id: 'dia', rotulo: 'Dia', pxPorDia: 16 },
  { id: 'semana', rotulo: 'Semana', pxPorDia: 7 },
  { id: 'mes', rotulo: 'Mês', pxPorDia: 1.8 },
];
export const ZOOM_PADRAO = 'mes';
export const pxPorDiaDoZoom = (id) => (ZOOMS_DA_LINHA.find(z => z.id === id) || ZOOMS_DA_LINHA.find(z => z.id === ZOOM_PADRAO)).pxPorDia;

// Alvo de toque de 44px por linha; o cabeçalho tem duas faixas de 22px.
export const ALTURA_LINHA = 44;
export const ALTURA_FAIXA = 22;
export const ALTURA_CABECALHO = ALTURA_FAIXA * 2;
// Folga em dias depois do último término, para a barra final não encostar na borda.
const FOLGA_FINAL_DIAS = 30;

// Largura da coluna de rótulos: cerca de um terço da tela, nem apertada demais nem engolindo o gráfico.
export const larguraDoRotulo = (larguraDaTela) => {
  const l = Math.round((Number(larguraDaTela) || 0) * 0.36);
  return Math.max(112, Math.min(230, l || 132));
};

// ---- Caminho crítico (cadeia condutora) ----
// Mesma regra do toggle "Caminho crítico" do Gantt do desktop: parte da folha de término mais tardio e volta pela
// predecessora que determina o início de cada etapa. (O desktop não exporta a função, por isso a cópia.)
export const caminhoCritico = (etapas = []) => {
  const folhas = etapas.filter(e => !e.isGroup);
  if (!folhas.length) return new Set();
  const byId = Object.fromEntries(etapas.map(e => [e.id, e]));
  const preds = (e) => (e.dep || [])
    .map(d => (typeof d === 'string' ? d : d.id))
    .map(id => byId[id])
    .filter(p => p && !p.isGroup);
  let fim = folhas[0];
  folhas.forEach(e => { if (taskEnd(e) > taskEnd(fim)) fim = e; });
  const conjunto = new Set();
  let atual = fim;
  while (atual && !conjunto.has(atual.id)) {
    conjunto.add(atual.id);
    const ps = preds(atual);
    if (!ps.length) break;
    let condutora = ps[0];
    ps.forEach(p => { if (taskEnd(p) > taskEnd(condutora)) condutora = p; });
    atual = condutora;
  }
  return conjunto;
};

// Tarefas em violação de precedência que ainda avisam (as com "OK" dado não entram), como o contorno laranja do desktop.
export const idsEmConflito = (etapas = []) => {
  const { ativos } = classificarConflitos(etapas);
  return new Set(ativos.flatMap(c => [c.pred, c.succ]));
};

// ---- Escala ----
const isoDoPrimeiroDia = (offset) => {
  const d = offsetToDate(offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

// Janela de datas da linha do tempo. Começa no dia 1 do mês da tarefa (folha) mais antiga, e da linha de base se
// ela for mais antiga, e termina um mês depois do último término. `larguraGrafico` (px da área do gráfico) garante
// que nunca sobre faixa em branco à direita.
export const escalaDaLinhaDoTempo = ({ etapas = [], groupVals = {}, baselineEtapas = null, zoomId = ZOOM_PADRAO, larguraGrafico = 0 }) => {
  const pxPorDia = pxPorDiaDoZoom(zoomId);
  const comDatas = (lista) => lista.filter(e => !e.isGroup && Number.isFinite(e.inicio));
  const folhas = comDatas(etapas);
  const folhasBase = baselineEtapas ? comDatas(baselineEtapas) : [];
  const todas = [...folhas, ...folhasBase];

  let inicioOffset;
  let fimDasTarefas;
  if (todas.length) {
    inicioOffset = Math.max(0, dateToOffset(isoDoPrimeiroDia(Math.min(...todas.map(e => e.inicio)))));
    fimDasTarefas = Math.max(...todas.map(e => taskEnd(e)));
  } else {
    inicioOffset = Math.max(0, dateToOffset(isoDoPrimeiroDia(todayOffset())));
    fimDasTarefas = inicioOffset;
  }
  // Um grupo pode terminar depois das folhas (grupo vazio ou degenerado): o maior término vale.
  Object.values(groupVals || {}).forEach(g => { if (g && Number.isFinite(g.inicio) && Number.isFinite(g.dur)) fimDasTarefas = Math.max(fimDasTarefas, g.inicio + g.dur); });

  const preencher = larguraGrafico > 0 ? Math.ceil(larguraGrafico / pxPorDia) : 0;
  const totalDias = Math.max(30, fimDasTarefas - inicioOffset + FOLGA_FINAL_DIAS, preencher);
  return { zoomId, pxPorDia, inicioOffset, totalDias, larguraTotal: Math.round(totalDias * pxPorDia), fimDasTarefas };
};

// Posição X (px, dentro do gráfico) de um offset de dia. Antes do início da janela fica em 0, para uma tarefa de data
// antiga nunca sumir para a esquerda.
export const xDoOffset = (escala, offset) => Math.max(0, offset - escala.inicioOffset) * escala.pxPorDia;

// ---- Barra de cada linha ----
// Grupo usa o envelope dos filhos (groupVals); tarefa, os próprios campos. Marco é um ponto (x é o centro).
// O comprimento vai do início ao término por dias úteis (taskEnd), então fim de semana entra na barra.
export const geometriaDaBarra = (e, escala, groupVals = {}) => {
  const gv = e.isGroup ? groupVals[e.id] : null;
  const inicio = gv ? gv.inicio : e.inicio;
  const dur = gv ? gv.dur : e.dur;
  const x = xDoOffset(escala, inicio);
  if (e.milestone && !e.isGroup) return { tipo: 'marco', x, w: 0 };
  const fim = taskEnd({ ...e, inicio, dur });
  return { tipo: e.isGroup ? 'grupo' : 'tarefa', x: x + 3, w: Math.max((fim - inicio) * escala.pxPorDia - 6, 10) };
};

// Barra fina da linha de base logo abaixo da atual. Marco não tem. (O desktop mede a base pela duração em dias úteis,
// o que a deixa mais curta que a barra atual mesmo sem atraso; aqui usa o término real, como a barra de cima.)
export const geometriaDaBase = (bl, escala) => {
  if (!bl || bl.milestone || !Number.isFinite(bl.inicio)) return null;
  return { x: xDoOffset(escala, bl.inicio) + 3, w: Math.max((taskEnd(bl) - bl.inicio) * escala.pxPorDia - 6, 10) };
};

// Linha de base de uma tarefa lida para a folha: datas e quantos dias o término mudou (positivo = depois da base).
export const comparacaoComBase = (e, bl, groupVals = {}) => {
  if (!bl || !Number.isFinite(bl.inicio)) return null;
  const gv = e.isGroup ? groupVals[e.id] : null;
  const atual = { ...e, inicio: gv ? gv.inicio : e.inicio, dur: gv ? gv.dur : e.dur };
  const fimAtual = taskEndDisplay(atual);
  const fimBase = taskEndDisplay(bl);
  return {
    inicioISO: offsetToISO(bl.inicio),
    fimISO: offsetToISO(fimBase),
    variacaoDias: fimAtual - fimBase,
  };
};

export const textoDaVariacao = (dias) => {
  if (!dias) return 'no prazo da base';
  const n = Math.abs(dias);
  return `${n} dia${n === 1 ? '' : 's'} ${dias > 0 ? 'depois' : 'antes'} da base`;
};

// ---- Cabeçalho e grade ----
const rotuloDoMes = (m, largura) => (largura >= 60 ? `${m.short}/${String(m.year).slice(2)}` : m.short);

// Faixas do cabeçalho e linhas da grade de fundo para a escala. Mês: ano em cima, mês embaixo. Semana: mês em cima,
// dia da segunda-feira embaixo. Dia: mês em cima, dia do mês embaixo (fim de semana marcado). Rótulo que não cabe
// na célula vira vazio.
export const cabecalhoDaEscala = (escala) => {
  const { zoomId, pxPorDia: px, inicioOffset, totalDias } = escala;
  const referencia = offsetToDate(inicioOffset);
  const meses = buildCalendarMonths(referencia, totalDias);
  const celulaMes = (m) => ({ rotulo: rotuloDoMes(m, m.days * px), x: m.startOffset * px, w: m.days * px });
  const cabe = (rotulo, w, minimo) => (w >= minimo ? rotulo : '');

  if (zoomId === 'dia') {
    const dias = buildCalendarDays(referencia, totalDias);
    return {
      superior: meses.map(celulaMes),
      inferior: dias.map(d => ({ rotulo: cabe(String(d.day), px, 14), x: d.offset * px, w: px, fimDeSemana: d.isWeekend })),
      grade: dias.map(d => ({ x: d.offset * px, forte: d.isMonthStart })),
    };
  }
  if (zoomId === 'semana') {
    const semanas = buildCalendarWeeks(referencia, totalDias);
    const iniciosDeMes = meses.map(m => m.startOffset);
    return {
      superior: meses.map(celulaMes),
      inferior: semanas.map(s => ({
        rotulo: cabe(String(offsetToDate(inicioOffset + s.startOffset).getDate()), s.days * px, 18),
        x: s.startOffset * px, w: s.days * px, fimDeSemana: false,
      })),
      grade: semanas.map(s => ({ x: s.startOffset * px, forte: iniciosDeMes.some(mo => mo >= s.startOffset && mo < s.startOffset + s.days) })),
    };
  }
  const anos = buildCalendarYears(meses);
  return {
    superior: anos.map(a => ({ rotulo: String(a.year), x: a.startOffset * px, w: a.days * px })),
    inferior: meses.map(m => ({ rotulo: cabe(m.short, m.days * px, 28), x: m.startOffset * px, w: m.days * px, fimDeSemana: false })),
    grade: meses.map(m => ({ x: m.startOffset * px, forte: m.isQ })),
  };
};

// Feriados cadastrados que caem dentro da janela (faixa vertical destacada, como no desktop).
export const feriadosNaJanela = (feriadosCfg, escala) => {
  const fora = escala.inicioOffset + escala.totalDias;
  return (feriadosCfg?.dias || [])
    .map(d => ({ offset: dateToOffset(d.data), descricao: d.descricao || 'Feriado' }))
    .filter(f => f.offset >= escala.inicioOffset && f.offset < fora)
    .map(f => ({ x: (f.offset - escala.inicioOffset) * escala.pxPorDia, w: Math.max(escala.pxPorDia, 2), descricao: f.descricao }));
};

// X da linha de hoje dentro do gráfico, ou null se hoje está fora da janela.
export const xDeHoje = (escala, hoje = todayOffset()) => {
  if (hoje < escala.inicioOffset || hoje > escala.inicioOffset + escala.totalDias) return null;
  return (hoje - escala.inicioOffset) * escala.pxPorDia;
};

// ---- Rolagem ----
// Qual faixa de linhas desenhar. Só as visíveis (mais uma folga de cada lado) entram na tela: um cronograma passa de
// mil linhas. `rolagemY` é o scrollTop da área de linhas; `alturaVisivel`, a altura que sobra abaixo do cabeçalho.
export const janelaDeLinhas = ({ rolagemY = 0, alturaVisivel = 0, total = 0, alturaLinha = ALTURA_LINHA, folga = 6 }) => {
  if (total <= 0) return { de: 0, ate: 0 };
  const de = Math.max(0, Math.floor(Math.max(0, rolagemY) / alturaLinha) - folga);
  const ate = Math.min(total, Math.ceil((Math.max(0, rolagemY) + Math.max(0, alturaVisivel)) / alturaLinha) + folga);
  return { de: Math.min(de, total), ate: Math.max(ate, de) };
};

// scrollLeft que põe um offset de dia a `fracao` da largura da área do gráfico (a coluna de rótulos fica por cima do
// começo do scroll, então a conta é só sobre a área do gráfico). Nunca negativo.
export const rolagemParaOffset = (escala, offset, larguraGrafico, fracao = 0.3) =>
  Math.max(0, Math.round(xDoOffset(escala, offset) - larguraGrafico * fracao));

// Onde a tela abre: hoje, se hoje cai dentro do cronograma; senão o começo da primeira tarefa.
export const offsetInicialDaRolagem = (escala, etapas = [], hoje = todayOffset()) => {
  const inicios = etapas.filter(e => !e.isGroup && Number.isFinite(e.inicio)).map(e => e.inicio);
  const primeiro = inicios.length ? Math.min(...inicios) : escala.inicioOffset;
  return hoje >= primeiro && hoje <= escala.fimDasTarefas ? hoje : primeiro;
};
