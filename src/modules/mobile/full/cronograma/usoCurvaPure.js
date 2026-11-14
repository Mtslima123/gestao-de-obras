// Regras puras das abas Uso da Tarefa e Curva Física na casca mobile (sem React): o que cada linha mostra, como se
// formata e como as séries da Curva são montadas. Os números são os do desktop: usam as mesmas funções de
// distribuição mensal (computeMonthlyDist e companhia) e a mesma fórmula das séries (computeCurvaSeries, que também
// alimenta o Dashboard). Aqui só se organiza o que vira linha, coluna e cartão.
import { fmtBRL, computeAllGroupMonthlyDist } from '../../../cronograma/scheduleEngine';
import { offsetToISO, taskEndDisplay } from '../../../cronograma/cronogramaDateUtils';
import { agregarDist, distDeRetrato, computeCurvaSeries, mesAtualKey } from '../../../cronograma/curvaFisica';
import { formatNum } from '../../../../utils/formatters';

// ---- Estrutura (recolher e expandir) ----
// Recolher é só desta tela: não mexe no `collapsed` gravado no cronograma, como nas abas do desktop.
export const idsComFilhos = (etapas = []) => {
  const pais = new Set();
  etapas.forEach(e => { if (e.parentId) pais.add(e.parentId); });
  return pais;
};

// Linhas que ficam visíveis: some quem tem algum ancestral recolhido.
export const etapasVisiveis = (etapas = [], colapsados = new Set()) => {
  if (!colapsados.size) return etapas;
  const paiPorId = new Map(etapas.map(e => [e.id, e.parentId ?? null]));
  const escondido = (id) => {
    let p = paiPorId.get(id);
    const visto = new Set();
    while (p && !visto.has(p)) { if (colapsados.has(p)) return true; visto.add(p); p = paiPorId.get(p); }
    return false;
  };
  return etapas.filter(e => !escondido(e.id));
};

// Mesma conta do seletor "Estrutura" do desktop: 0 expande tudo; N recolhe os grupos de nível >= N-1 (1 = recolher tudo).
export const colapsadosAteNivel = (etapas = [], nivel = 0) =>
  (nivel > 0 ? new Set(etapas.filter(e => e.isGroup && (e.nivel || 0) >= nivel - 1).map(e => e.id)) : new Set());

export const OPCOES_DE_ESTRUTURA = [
  { valor: '0', rotulo: 'Expandir tudo' },
  { valor: '1', rotulo: 'Recolher tudo' },
  ...[2, 3, 4, 5, 6, 7, 8, 9].map(n => ({ valor: String(n), rotulo: `Nível ${n}` })),
];

// ---- Formatação ----
export const textoBRL = (v) => ((Number(v) || 0) < 1 ? '—' : fmtBRL(v));
// Valor de célula sem o "R$" (a tela avisa que os valores são em reais): cabe quase um mês a mais por tela.
export const textoValor = (v) => ((Number(v) || 0) < 1 ? '—' : formatNum(v, 2));
// 12.5 -> "12,50%". Zero e ausente viram "—" (como as células da Curva do desktop).
export const textoPct = (v, { zeroVazio = true } = {}) => {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  if (zeroVazio && Math.abs(v) < 0.005) return '—';
  return `${Number(v).toFixed(2).replace('.', ',')}%`;
};
// Diferença em pontos percentuais com sinal: +1,20% / -0,80%.
export const textoDif = (v) => {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  if (Math.abs(v) < 0.005) return '—';
  return `${v > 0 ? '+' : ''}${Number(v).toFixed(2).replace('.', ',')}%`;
};

// Largura de uma coluna de valores a partir do maior texto dela (R$ 1.234.567,89 precisa de bem mais que 5%).
export const larguraDaColuna = (textos = [], { minima = 72, porCaractere = 7.3, folga = 22 } = {}) => {
  const maior = textos.reduce((m, t) => Math.max(m, String(t ?? '').length), 0);
  return Math.max(minima, Math.ceil(maior * porCaractere + folga));
};

// Altura de uma matriz que não preenche a tela: cabeçalho + linhas + rodapé, no máximo `maxima`.
export const alturaDaMatriz = ({ linhas = 0, alturaLinha = 40, alturaCabecalho = 36, rodape = 0, maxima = 360 }) =>
  Math.min(maxima, alturaCabecalho + linhas * alturaLinha + rodape * alturaLinha + 2);

// ---- Uso da Tarefa ----
// Totais por mês somando todas as tarefas (folhas), o total geral e o % acumulado — as três linhas do rodapé do desktop.
export const totaisDoUso = (months = [], monthlyDist = {}) => {
  const porMes = {};
  months.forEach(m => { porMes[m.key] = 0; });
  Object.values(monthlyDist || {}).forEach(d => months.forEach(m => { porMes[m.key] += (d[m.key] || 0); }));
  const geral = months.reduce((s, m) => s + (porMes[m.key] || 0), 0);
  let acc = 0;
  const acumuladoPct = months.map(m => { acc += porMes[m.key] || 0; return geral > 0 ? acc / geral : 0; });
  return { porMes, geral, acumuladoPct };
};

// Linhas do Uso na ordem da EAP, já com a distribuição mensal e o total de cada uma. Grupo soma os filhos.
export const linhasDoUso = ({ etapas = [], colapsados = new Set(), months = [], monthlyDist = {} }) => {
  const comFilhos = idsComFilhos(etapas);
  const grupos = computeAllGroupMonthlyDist(etapas, monthlyDist);
  return etapasVisiveis(etapas, colapsados).map(e => {
    const dist = e.isGroup ? (grupos[e.id] || {}) : (monthlyDist[e.id] || {});
    return {
      e,
      nivel: e.nivel || 0,
      temFilhos: comFilhos.has(e.id),
      aberto: !colapsados.has(e.id),
      dist,
      total: months.reduce((s, m) => s + (dist[m.key] || 0), 0),
    };
  });
};

// Meses com valor de uma tarefa, para a folha de detalhe: valor, % do total da tarefa e % acumulado. Mesmo corte
// do desktop: abaixo de R$ 1 a célula fica vazia.
export const mesesDaDistribuicao = (months = [], dist = {}, total = 0) => {
  let acc = 0;
  const saida = [];
  months.forEach(m => {
    const v = dist[m.key] || 0;
    acc += v;
    if (v >= 1) saida.push({ key: m.key, rotulo: m.label, valor: v, pct: total > 0 ? v / total * 100 : 0, acumPct: total > 0 ? acc / total * 100 : 0 });
  });
  return saida;
};

// Datas e avanço de uma linha do Uso para a folha (o desktop usa os campos da própria linha, grupo inclusive).
export const resumoDaTarefaNoUso = (e) => ({
  inicioISO: offsetToISO(e.inicio),
  fimISO: offsetToISO(taskEndDisplay(e)),
  dur: e.dur,
  avanco: e.avanco ?? 0,
});

// ---- Curva Física ----
// Tudo o que a tela da Curva precisa, calculado como no desktop: plano ao vivo agregado, linha de base e
// reprogramação escolhidas (retratos congelados), as séries e os índices do mês de referência e de hoje.
export const montarCurva = ({
  months = [], monthlyDist = {}, valorVinculadoMap = {}, baselines = [], blVisivelId = null,
  reprogramacoes = [], repVisivelId = null, selMonKey = '', hojeKey = mesAtualKey(),
}) => {
  const planned = agregarDist(monthlyDist);
  const total = months.reduce((s, m) => s + (planned[m.key] || 0), 0);
  const temDados = months.length > 0 && Object.values(planned).some(v => v > 0);
  const lb = blVisivelId ? (baselines.find(b => b.id === blVisivelId) || null) : null;
  const rep = repVisivelId ? (reprogramacoes.find(r => r.id === repVisivelId) || null) : null;
  const baselineDist = lb?.etapas ? distDeRetrato(lb.etapas, valorVinculadoMap) : null;
  const temRep = !!rep?.etapas;
  const repDist = temRep ? distDeRetrato(rep.etapas, valorVinculadoMap) : null;
  const series = computeCurvaSeries({ months, planned, baselineDist, repDist });
  const indice = months.findIndex(m => m.key === selMonKey);
  return {
    months, planned, total, temDados,
    temLB: baselineDist != null, temRep,
    lbNome: lb?.nome || 'Linha de Base', repNome: rep?.nome || null,
    series,
    selIdx: indice >= 0 ? indice : months.length - 1,
    todayIdx: months.findIndex(m => m.key === hojeKey),
  };
};

// Props dos dois gráficos do desktop (SCurveChart e SCurveChart2), com o mesmo mapeamento da aba do desktop.
export const propsDosGraficos = (c, { show, showBarras, showLinhas }) => {
  const { blM, blA, repA, rrA, repM, rrM } = c.series;
  const baseline = c.temLB ? blA : null;
  return {
    curva1: {
      months: c.months, reprogramado: c.temRep ? repA : [], real: rrA, baseline, monthlyPct: repM, previstoM: blM,
      replanM: c.temRep ? repM : [], execM: rrM, showBarras, showLines: showLinhas, todayIdx: c.todayIdx, show,
    },
    curva2: {
      months: c.months, selIdx: c.selIdx, previstoM: blM, execM: rrM, replanM: rrM, baselineA: baseline,
      execA: rrA, replanA: rrA, show, showBarras, showLines: showLinhas,
    },
  };
};

// Linhas do Resumo Mensal (Linha de Base, Reprogramação, Real e Diferenças; mensal e acumulado). A Linha de Base só
// entra quando há uma escolhida. `tom`: cor do número; 'desvio' pinta de verde ou vermelho pelo sinal.
export const linhasDoResumo = (c) => {
  const { blM, blA, repM, repA, rrM, rrA, difBL, difRep } = c.series;
  const linhas = [];
  if (c.temLB) {
    linhas.push({ id: 'lb-m', rotulo: 'LB · Mensal', faixa: 'lb', valores: blM, formato: 'pct', tom: 'marca' });
    linhas.push({ id: 'lb-a', rotulo: 'LB · Acum.', faixa: 'lb', valores: blA, formato: 'pct', tom: 'marca', acumulado: true });
  }
  linhas.push({ id: 'rep-m', rotulo: 'Rep. · Mensal', faixa: 'rep', valores: repM, formato: 'pct', tom: 'texto' });
  linhas.push({ id: 'rep-a', rotulo: 'Rep. · Acum.', faixa: 'rep', valores: repA, formato: 'pct', tom: 'texto', acumulado: true });
  linhas.push({ id: 'rr-m', rotulo: 'Real · Mensal', faixa: 'real', valores: rrM, formato: 'pct', tom: 'positivo' });
  linhas.push({ id: 'rr-a', rotulo: 'Real · Acum.', faixa: 'real', valores: rrA, formato: 'pct', tom: 'positivo', acumulado: true });
  if (c.temLB) linhas.push({ id: 'dif-lb', rotulo: 'Dif. vs LB', faixa: 'dif', valores: difBL, formato: 'dif', tom: 'desvio' });
  linhas.push({ id: 'dif-rep', rotulo: 'Dif. vs Rep.', faixa: 'dif', valores: difRep, formato: 'dif', tom: 'desvio' });
  return linhas;
};

// "Linha de Base · LB 1", mas sem repetir a palavra quando o nome já a traz ("Linha de base 1" fica só assim).
const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const tituloComNome = (prefixo, nome) => {
  if (!nome) return prefixo;
  return semAcento(nome).includes(semAcento(prefixo)) ? nome : `${prefixo} · ${nome}`;
};

// Resumo de uma linha do que está sendo comparado (o cartão "Comparar com" fica fechado até tocar).
export const resumoDaComparacao = (c, mesRotulo = '') =>
  `Base: ${c.temLB ? c.lbNome : 'nenhuma'} · Reprogramação: ${c.temRep ? c.repNome : 'nenhuma'}${mesRotulo ? ` · Mês: ${mesRotulo}` : ''}`;

// Cartão "Produção do mês": os valores do mês de referência, agrupados como as faixas do Resumo.
export const producaoDoMes = (c, idx = c.selIdx) => {
  const { blM, blA, repM, repA, rrM, rrA, difBL, difRep } = c.series;
  const v = (arr) => (idx >= 0 ? arr[idx] : null);
  const grupos = [];
  if (c.temLB) grupos.push({ id: 'lb', faixa: 'lb', titulo: tituloComNome('Linha de Base', c.lbNome), linhas: [
    { rotulo: 'No mês', valor: textoPct(v(blM)) }, { rotulo: 'Acumulado', valor: textoPct(v(blA)) }] });
  grupos.push({ id: 'rep', faixa: 'rep', titulo: c.temRep ? tituloComNome('Reprogramação', c.repNome) : 'Reprogramação (plano atual)', linhas: [
    { rotulo: 'No mês', valor: textoPct(v(repM)) }, { rotulo: 'Acumulado', valor: textoPct(v(repA)) }] });
  grupos.push({ id: 'real', faixa: 'real', titulo: 'Real + Reprogramado', linhas: [
    { rotulo: 'No mês', valor: textoPct(v(rrM)) }, { rotulo: 'Acumulado', valor: textoPct(v(rrA)) }] });
  const difs = [];
  if (c.temLB) difs.push({ rotulo: 'vs Linha de Base (acum.)', valor: textoDif(v(difBL)), sinal: Math.sign(v(difBL) || 0) });
  difs.push({ rotulo: 'vs Reprogramado (acum.)', valor: textoDif(v(difRep)), sinal: Math.sign(v(difRep) || 0) });
  grupos.push({ id: 'dif', faixa: 'dif', titulo: 'Diferenças', linhas: difs });
  return grupos;
};

// Cor do número de uma célula do Resumo: zero e ausente ficam apagados; 'desvio' pinta de verde (à frente) ou vermelho
// (atrasado) pelo sinal; as demais usam a cor da própria linha.
export const tomDoValor = (tom, v) => {
  if (v == null || Math.abs(v) < 0.005) return 'apagado';
  if (tom === 'desvio') return v > 0 ? 'positivo' : 'negativo';
  return tom;
};

// Mês anterior ou seguinte ao de referência (para os botões ‹ ›), sem sair da lista.
export const mesVizinho = (months = [], selIdx = 0, passo = 1) => {
  const i = selIdx + passo;
  return i >= 0 && i < months.length ? months[i].key : null;
};

// Linhas da "Distribuição por tarefa": grupos de nível 0 e tarefas marcadas na coluna Curva da Lista, sempre do plano ao
// vivo. Cada linha traz valor, peso, conclusão até o mês de referência e o % do custo da tarefa em cada mês.
export const linhasDaDistribuicao = ({ etapas = [], months = [], monthlyDist = {}, custoOrcadoMap = {}, total = 0, selIdx = 0 }) => {
  const grupos = computeAllGroupMonthlyDist(etapas, monthlyDist);
  return etapas
    .filter(e => (e.isGroup && !(e.nivel > 0)) || e.showInDist === true)
    .map(e => {
      const dist = e.isGroup ? (grupos[e.id] || {}) : (monthlyDist[e.id] || {});
      const custo = custoOrcadoMap[e.id] || 0;
      const conc = custo > 0
        ? months.reduce((s, m, i) => (i <= selIdx ? s + (dist[m.key] || 0) : s), 0) / custo * 100
        : 0;
      return {
        e, nivel: e.nivel || 0, custo, dist,
        peso: total > 0 && custo > 0 ? custo / total * 100 : null,
        conc,
        pctMeses: months.map(m => (custo > 0 ? (dist[m.key] || 0) / custo * 100 : 0)),
      };
    });
};

// Rodapé "Total geral" da distribuição: valor total, 100%, conclusão geral até o mês de referência e o % de cada mês.
export const rodapeDaDistribuicao = ({ months = [], planned = {}, total = 0, selIdx = 0 }) => ({
  custo: total,
  conc: total > 0 ? months.reduce((s, m, i) => (i <= selIdx ? s + (planned[m.key] || 0) : s), 0) / total * 100 : 0,
  pctMeses: months.map(m => (total > 0 ? (planned[m.key] || 0) / total * 100 : 0)),
});

// Fundo da linha pelo nível da EAP: grupos de nível 0 e 1 em azul, nível 2 em cinza, o resto sem fundo (padrão da obra).
export const fundoDaDistribuicao = (e) => {
  if (!e.isGroup) return null;
  if ((e.nivel || 0) <= 1) return 'var(--dist-nivel-1)';
  if (e.nivel === 2) return 'var(--dist-nivel-2)';
  return null;
};

// Texto de uma célula de % da distribuição: abaixo de 0,5% fica vazia, como no desktop.
export const textoPctDoMes = (pct) => (pct <= 0.5 ? '—' : textoPct(pct));
