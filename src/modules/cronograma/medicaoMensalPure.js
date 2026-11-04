// Medição Mensal — funções puras (sem state, sem JSX, sem I/O). Mesmo padrão de
// separação de taskDetailPure.js: cálculos testáveis, consumidos pela tela em
// ./MedicaoMensal.jsx e pelo service em ./medicaoMensal.service.js.
//
// Convenção de "valor" do item: cada ItemMedicao carrega o valor JÁ FATIADO para o
// mês de referência (monthlyDist[etapaId][mesRefKey], a mesma distribuição por-dia
// usada em Uso da Tarefa/Curva Física — computeMonthlyDist já aplica o peso vinculado
// do orçamento quando há vínculos). Por isso "previsto do mês" é sempre 100%: o valor
// do item para o mês é, por definição, o que estava programado para ser produzido
// naquele mês — a meta é entregar 100% dele até o fim do mês.
//
// Itens FORA DO MÊS (idsExtras em buildItensMedicao): tarefas sem fatia no mês de
// referência, escolhidas manualmente na tela (ver listarTarefasForaDoMes) para medir
// trabalho feito adiantado. A regra é "soma ao realizado, não soma ao previsto" — por
// isso carregam o valor CHEIO da tarefa (não têm fatia deste mês) e ficam fora do
// denominador `valorTotalBase`, que continua sendo só o previsto do mês. Consequência
// esperada: com elas na tela, "% executado" passa de 100%, que é exatamente a leitura
// desejada (produziu-se além do programado).
//
// ATENÇÃO: não usar formatPct de utils/formatters.js aqui — ela espera fração 0-1
// e todos os percentuais desta tela já estão na escala 0-100. Usar fmtPct100.

import { formatNum } from '../../utils/formatters';
import { offsetToISO, isoToBR, taskEnd } from './cronogramaDateUtils';
import { chavePavimento, ordenarPavimentos } from '../../utils/pavimentos';

// Regras de nome/ordem de pavimento vivem em utils/pavimentos (compartilhadas com as Fotos).
export { chavePavimento, ordenarPavimentos };

// dd/mm/aaaa — isoToBR já é o formato de exibição padrão do projeto.
const fmtData = (off) => isoToBR(offsetToISO(off));

// Duas casas decimais: medição é documento financeiro, e 0,1pp em obra de milhões
// já é dinheiro suficiente para não arredondar. O Excel exportado já usava '0.00%'.
export const fmtPct100 = (v) => `${formatNum(v, 2)}%`;

// Sobe por parentId até a raiz, devolvendo a cadeia de ancestrais do mais alto para o
// mais próximo. O `visited` protege contra ciclo de parentId (dado corrompido).
function cadeiaAncestrais(id, mapaEtapas) {
  const cadeia = [];
  let cur = mapaEtapas.get(id);
  const visited = new Set();
  while (cur?.parentId && !visited.has(cur.id)) {
    visited.add(cur.id);
    const pai = mapaEtapas.get(cur.parentId);
    if (!pai) break;
    cadeia.unshift(pai);
    cur = pai;
  }
  return cadeia;
}

// Para cada etapa, sobe por parentId até o ancestral raiz (nível 0) e usa esse grupo
// como "disciplina" — reaproveita a hierarquia N1/N2/N3 já existente no cronograma
// em vez de exigir um campo novo.
export function computeDisciplinaInfo(etapas, wbsMap) {
  const mapaEtapas = new Map(etapas.map(e => [e.id, e]));
  const result = {};
  etapas.forEach(e => {
    const raiz = cadeiaAncestrais(e.id, mapaEtapas)[0] || e;
    result[e.id] = { disciplina: raiz.etapa || '—', disciplinaCodigo: wbsMap[raiz.id] || '0' };
  });
  return result;
}

// Folha tem fatia no mês de referência? Mesma janela de dias já usada por
// computeMonthlyDist — garante que "quais itens aparecem" e "qual valor cada um
// carrega" vêm da mesma fonte.
const noMes = (e, monthlyDist, mesRefKey) => !!(monthlyDist[e.id] && mesRefKey in monthlyDist[e.id]);

// Valor cheio da tarefa (fora da fatia do mês): Custo Orçado = valor vinculado ao
// orçamento + custo real, somados sempre (mesmo peso usado pelo Avanço Físico).
const valorCheio = (e, valorVinculadoMap) => (valorVinculadoMap?.[e.id] || 0) + (e.custoRealizado || 0);

// Tarefa tem alguma fatia DEPOIS do mês de referência? "Fora do mês" existe pra trazer
// trabalho feito ADIANTADO (ver nota no topo do arquivo) — tarefa cuja fatia é toda no
// passado não é adiantada, é atrasada, e não deve aparecer como opção de inclusão manual.
const temFatiaFutura = (e, monthlyDist, mesRefKey) => {
  const dist = monthlyDist[e.id];
  return !!dist && Object.keys(dist).some(k => k > mesRefKey);
};

// Itens do cronograma agendados no mês de referência, mais as folhas escolhidas
// manualmente em `idsExtras` (tarefas sem fatia no mês, trazidas para medir trabalho
// feito adiantado — ver nota no topo do arquivo).
export function buildItensMedicao(etapas, mesRefKey, {
  monthlyDist, wbsMap, disciplinaInfo,
  idsExtras = new Set(), valorVinculadoMap = null,
}) {
  return etapas
    .filter(e => !e.isGroup && (noMes(e, monthlyDist, mesRefKey) || idsExtras.has(e.id)))
    .map(e => {
      const info = disciplinaInfo[e.id] || { disciplina: '—', disciplinaCodigo: '0' };
      const percExecutado = e.avanco || 0;
      const foraDoMes = !noMes(e, monthlyDist, mesRefKey);
      const terminoOff = taskEnd(e);
      return {
        id: e.id,
        parentId: e.parentId ?? null,
        nivel: e.nivel || 0,
        wbs: wbsMap[e.id] || '',
        descricao: e.etapa || '',
        pavimento: e.pavimento || '—',
        disciplina: info.disciplina,
        disciplinaCodigo: info.disciplinaCodigo,
        // Offsets crus: o filtro por intervalo e a ordenação precisam deles — as strings
        // dataInicio/dataTermino são só exibição. terminoOff continua EXCLUSIVO (dia
        // seguinte ao último dia trabalhado); dataTermino usa -1 pra mostrar o último
        // dia de fato.
        inicioOff: e.inicio,
        terminoOff,
        dataInicio: fmtData(e.inicio),
        dataTermino: fmtData(terminoOff - 1),
        duracaoDias: e.dur,
        valor: foraDoMes ? valorCheio(e, valorVinculadoMap) : (monthlyDist[e.id][mesRefKey] || 0),
        foraDoMes,
        percExecutado,
        percMedido: percExecutado, // default; mergePercMedido sobrepõe com o que estiver salvo
        status: undefined,
      };
    });
}

// Candidatas para a tela de "incluir tarefa fora do mês": folhas do cronograma sem
// fatia no mês de referência — a lista que o usuário escolhe manualmente para trazer
// para a medição (ver buildItensMedicao/idsExtras).
export function listarTarefasForaDoMes(etapas, mesRefKey, { monthlyDist, wbsMap, disciplinaInfo, valorVinculadoMap = null }) {
  return etapas
    .filter(e => !e.isGroup && !noMes(e, monthlyDist, mesRefKey) && temFatiaFutura(e, monthlyDist, mesRefKey))
    .map(e => {
      const info = disciplinaInfo[e.id] || { disciplina: '—', disciplinaCodigo: '0' };
      return {
        id: e.id,
        wbs: wbsMap[e.id] || '',
        descricao: e.etapa || '',
        disciplina: info.disciplina,
        pavimento: e.pavimento || '—',
        valor: valorCheio(e, valorVinculadoMap),
      };
    })
    .sort((a, b) => a.wbs.localeCompare(b.wbs, 'pt-BR', { numeric: true }));
}

// Injeta as linhas de grupo ancestrais das candidatas de "Incluir tarefa fora do mês" —
// mesma ideia de computeArvoreMedicao (grupo só aparece se tiver folha candidata dentro),
// sem a agregação financeira dela: aqui é só pra mostrar a hierarquia no modal de seleção.
export function computeArvoreForaDoMes(candidatas, etapas) {
  const mapaEtapas = new Map(etapas.map(e => [e.id, e]));
  const porId = new Map(candidatas.map(c => [c.id, c]));
  const folhasDoGrupo = new Set();
  candidatas.forEach(c => {
    cadeiaAncestrais(c.id, mapaEtapas).forEach(g => folhasDoGrupo.add(g.id));
  });
  const linhas = [];
  etapas.forEach(e => {
    if (folhasDoGrupo.has(e.id)) {
      linhas.push({ tipo: 'grupo', id: e.id, nivel: e.nivel || 0, descricao: e.etapa || '' });
      return;
    }
    const c = porId.get(e.id);
    if (c) linhas.push({ tipo: 'item', nivel: e.nivel || 0, ...c });
  });
  return linhas;
}

// Parse do input "% medido": aceita vírgula ou ponto, remove lixo, clamp 0-100.
export function parsePercInput(raw) {
  const limpo = Number(String(raw).replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(limpo) ? Math.max(0, Math.min(100, limpo)) : 0;
}

// Deriva o status quando a API/etapa não traz um valor explícito. "Atrasada" nunca
// é derivada automaticamente — só aparece se vier setada explicitamente no item.
export function derivarStatus(item) {
  if (item.status) return item.status;
  if (item.percExecutado <= 0) return 'pendente';
  if (item.percExecutado >= 100) return 'concluida';
  return 'andamento';
}

// Média ponderada por valor — como grupo e total agregam %executado/%medido.
//
// exec/med do grupo continuam sendo taxa PRÓPRIA (média ponderada sobre as suas folhas):
// é o "quanto deste grupo foi executado", leitura padrão de tarefa-resumo. Já `peso` é
// participação no previsto do mês, e por isso ignora os itens fora do mês — eles somam ao
// realizado, não ao previsto. `valorPrevisto` é essa soma sem os extras.
function agregar(rows, valorTotalBase) {
  const valor = rows.reduce((s, r) => s + r.valor, 0);
  const valorPrevisto = rows.reduce((s, r) => s + (r.foraDoMes ? 0 : r.valor), 0);
  return {
    valor,
    valorPrevisto,
    exec: valor ? rows.reduce((s, r) => s + r.valor * r.percExecutado, 0) / valor : 0,
    med:  valor ? rows.reduce((s, r) => s + r.valor * r.percMedido, 0) / valor : 0,
    peso: valorTotalBase ? (valorPrevisto / valorTotalBase) * 100 : 0,
  };
}

// Árvore real do cronograma (N1/N2/N3), em vez de faixas por disciplina: percorre as
// etapas na ordem do cronograma e devolve uma lista PLANA de linhas
// { tipo: 'grupo' | 'item' }, mantendo só os grupos que têm alguma folha medível dentro.
// É isso que permite indentar por nível e recolher grupo, como na Lista.
//
// `collapsed` é um Set de ids de grupo. Diferente da Lista, que grava `e.collapsed` no
// cronograma, aqui o estado é local da tela — a Medição é leitura sobre o cronograma.
export function computeArvoreMedicao(itens, etapas, valorTotalBase, collapsed = new Set()) {
  const porId = new Map(itens.map(i => [i.id, i]));
  if (!porId.size) return [];

  const mapaEtapas = new Map(etapas.map(e => [e.id, e]));

  // Folhas de cada grupo (para agregar) e o conjunto de grupos que devem aparecer.
  const folhasDoGrupo = new Map();
  itens.forEach(i => {
    cadeiaAncestrais(i.id, mapaEtapas).forEach(g => {
      if (!folhasDoGrupo.has(g.id)) folhasDoGrupo.set(g.id, []);
      folhasDoGrupo.get(g.id).push(i);
    });
  });

  // Um grupo recolhido esconde toda a sua descendência, em qualquer profundidade.
  const escondido = (id) => cadeiaAncestrais(id, mapaEtapas).some(a => collapsed.has(a.id));

  const linhas = [];
  etapas.forEach(e => {
    if (escondido(e.id)) return;
    if (folhasDoGrupo.has(e.id)) {
      linhas.push({
        tipo: 'grupo',
        id: e.id,
        nivel: e.nivel || 0,
        wbs: '',
        descricao: e.etapa || '',
        temFilhos: true,
        colapsado: collapsed.has(e.id),
        // Prazo/duração do grupo vêm do próprio envelope da tarefa-resumo no cronograma
        // (inicio/dur já rolam pra cima a partir dos filhos — mesmo dado que a Lista e o
        // Gantt mostram), não de agregar(): esse só soma valor/exec/med das folhas.
        dataInicio: fmtData(e.inicio),
        dataTermino: fmtData(taskEnd(e) - 1),
        duracaoDias: e.dur,
        // Offsets brutos (além das strings pré-formatadas acima) — o export em Excel
        // (linhasExport em MedicaoMensal.jsx) precisa de um Date de verdade pra usar o
        // formato de data nativo da célula, não texto.
        inicioOff: e.inicio,
        terminoOff: taskEnd(e), // exclusivo, mesma convenção do resto do arquivo
        ...agregar(folhasDoGrupo.get(e.id), valorTotalBase),
      });
      return;
    }
    const item = porId.get(e.id);
    if (item) linhas.push({ tipo: 'item', temFilhos: false, ...item });
  });
  return linhas;
}

// Ids de todos os grupos da árvore que estão em nível >= (nivelAlvo - 1). Espelha a
// semântica de applyOutlineLevel do Cronograma: 0 expande tudo, N recolhe do nível N-1
// para baixo — só que aqui o resultado é um Set local, sem gravar no cronograma.
export function gruposParaNivel(linhas, nivelAlvo) {
  if (!nivelAlvo || nivelAlvo <= 0) return new Set();
  return new Set(linhas.filter(l => l.tipo === 'grupo' && l.nivel >= nivelAlvo - 1).map(l => l.id));
}

// Totais gerais: numerador sobre os itens filtrados, denominador (valorTotalBase)
// sobre a base NÃO filtrada — para o total não se distorcer quando um filtro é aplicado.
// Itens fora do mês entram no numerador (realizado) mas não no denominador (previsto),
// então `exec` e `med` podem passar de 100% quando se produziu além do programado.
export function computeTotaisMedicao(itensFiltrados, valorTotalBase) {
  const valor = itensFiltrados.reduce((s, i) => s + i.valor, 0);
  // Previsto: só o que estava programado para o mês. É o numerador do peso — sem isso o
  // peso do total passava de 100% (os extras entravam no numerador e não no denominador).
  const valorPrevisto = itensFiltrados.reduce((s, i) => s + (i.foraDoMes ? 0 : i.valor), 0);
  const exec = valorTotalBase ? itensFiltrados.reduce((s, i) => s + i.valor * i.percExecutado, 0) / valorTotalBase : 0;
  const med = valorTotalBase ? itensFiltrados.reduce((s, i) => s + i.valor * i.percMedido, 0) / valorTotalBase : 0;
  const peso = valorTotalBase ? (valorPrevisto / valorTotalBase) * 100 : 0;
  const valorAMedir = itensFiltrados.reduce((s, i) => s + (i.valor * i.percMedido) / 100, 0);
  return { valor, valorPrevisto, exec, med, peso, valorAMedir, qtd: itensFiltrados.length };
}

// Resumo financeiro/físico do mês: meta programada (% do valor da obra que este mês
// representa), previsto acumulado (% do valor da obra até o fim do mês), executado do mês
// (`executadoMesPct`, o que foi medido nesta tela em R$ como fração da OBRA INTEIRA — não do
// valor deste mês; por isso o card "Executado do mês" nunca passa do "Previsto do mês", que
// é a mesma escala) e executado acumulado (soma direta, sem dividir de novo: previsto
// acumulado recalculado com corte no MÊS ANTERIOR + executadoMesPct).
export function computeResumo({ monthlyTotals, mesRefKey, valorMedidoMes = 0 }) {
  const totalPlan = Object.values(monthlyTotals).reduce((s, v) => s + v, 0);
  const planAteMes = Object.entries(monthlyTotals).reduce((s, [k, v]) => (k <= mesRefKey ? s + v : s), 0);
  const planAteMesAnterior = Object.entries(monthlyTotals).reduce((s, [k, v]) => (k < mesRefKey ? s + v : s), 0);
  const previstoAcumuladoMesAnterior = totalPlan > 0 ? (planAteMesAnterior / totalPlan) * 100 : 0;
  const executadoMesPct = totalPlan > 0 ? (valorMedidoMes / totalPlan) * 100 : 0;
  return {
    valorObra: totalPlan,
    metaProgramada: totalPlan > 0 ? ((monthlyTotals[mesRefKey] || 0) / totalPlan) * 100 : 0,
    previstoAcumulado: totalPlan > 0 ? (planAteMes / totalPlan) * 100 : 0,
    executadoMesPct,
    // Sem valor total da obra, não tem % de nada — nem o que o mês atual mediu sozinho.
    executadoAcumulado: totalPlan > 0 ? previstoAcumuladoMesAnterior + executadoMesPct : 0,
  };
}

// Previsto (mês e acumulado) congelado na abertura x o que o cronograma indica hoje. Só vale pra
// medição ABERTA: numa fechada/aprovada o previsto é parte do documento fechado e só muda pelo
// Reabrir. Devolve null quando não há o que oferecer (sem registro, não é rascunho, nada
// congelado nesse campo, ou a diferença nem aparece nos 2 decimais da tela); senão
// { acumulado, mes } com { congelado, atual } em cada campo que mudou (o outro fica null).
// `aoVivo` = { percPrevisto, percPrevistoAcumulado }; percPrevisto null = ainda não dá pra
// comparar o mês (lista de itens ainda carregando), então só o acumulado conta.
export function previstoDefasado(registro, aoVivo, tolerancia = 0.005) {
  if (!registro || registro.status !== 'rascunho' || !aoVivo) return null;
  const mudou = (congelado, atual) => {
    if (congelado == null || atual == null) return null;
    const c = Number(congelado);
    const a = Number(atual);
    return Math.abs(c - a) >= tolerancia ? { congelado: c, atual: a } : null;
  };
  const acumulado = mudou(registro.perc_previsto_acumulado, aoVivo.percPrevistoAcumulado);
  const mes = mudou(registro.perc_previsto, aoVivo.percPrevisto);
  return acumulado || mes ? { acumulado, mes } : null;
}

// Anotação livre da medição (medicoes_mensais.anotacoes): um texto por obra + mês, além da
// observação de cada tarefa. Só se edita com a medição aberta.
// O limite conta só o texto que se vê (as marcas de negrito e cor não entram).
export const LIMITE_ANOTACAO = 4000;

// Cores do texto da anotação. `padrao` é a cor normal do campo (sem marca nenhuma no texto gravado);
// as demais são as únicas cores aceitas ao ler. Todas legíveis no PDF (fundo branco).
export const PALETA_ANOTACAO = [
  { id: 'padrao', nome: 'Padrão', hex: null },
  { id: 'vermelho', nome: 'Vermelho', hex: '#C62828' },
  { id: 'azul', nome: 'Azul', hex: '#1C4584' },
  { id: 'verde', nome: 'Verde', hex: '#2E7D32' },
  { id: 'laranja', nome: 'Laranja', hex: '#E65100' },
];
const CORES_ANOTACAO = new Set(PALETA_ANOTACAO.filter(c => c.hex).map(c => c.hex));

// Formato gravado: texto com só quatro marcas, `<b>…</b>` e `<span style="color:#RRGGBB">…</span>`, e
// `&amp; &lt; &gt;` para esses três símbolos; a quebra de linha é `\n`. Texto simples de antes lê igual.
// A leitura é feita por este interpretador (nunca vira HTML na tela): marca que não for uma dessas
// quatro, e cor fora da paleta, são tratadas como texto comum ou como cor padrão.
const MARCA_ANOTACAO = /<b>|<\/b>|<span style="color:(#[0-9A-Fa-f]{6})">|<\/span>|&amp;|&lt;|&gt;|\n/g;
const ENTIDADES_ANOTACAO = { '&amp;': '&', '&lt;': '<', '&gt;': '>' };

// Junta trechos vizinhos de mesmo formato e descarta os vazios.
function compactarTrechos(trechos) {
  const saida = [];
  trechos.forEach(t => {
    if (!t.texto) return;
    const ult = saida[saida.length - 1];
    if (ult && ult.negrito === t.negrito && ult.cor === t.cor) ult.texto += t.texto;
    else saida.push({ texto: t.texto, negrito: t.negrito, cor: t.cor });
  });
  return saida;
}

// Texto gravado -> parágrafos, cada um uma lista de trechos { texto, negrito, cor }. Parágrafo vazio
// (linha em branco) é lista vazia. Marca de fechamento sem abertura é ignorada; marca aberta e não
// fechada vale até o fim do texto.
export function lerAnotacao(texto) {
  const s = String(texto ?? '').replace(/\r\n?/g, '\n');
  const paragrafos = [[]];
  let negrito = 0;
  const cores = []; // pilha de <span>: cor da paleta, ou null (cor fora da paleta = padrão)
  const poe = (t) => {
    if (t) paragrafos[paragrafos.length - 1].push({ texto: t, negrito: negrito > 0, cor: cores.length ? cores[cores.length - 1] : null });
  };
  let fim = 0;
  MARCA_ANOTACAO.lastIndex = 0;
  for (let m = MARCA_ANOTACAO.exec(s); m; m = MARCA_ANOTACAO.exec(s)) {
    poe(s.slice(fim, m.index));
    fim = m.index + m[0].length;
    const marca = m[0];
    if (marca === '\n') paragrafos.push([]);
    else if (marca === '<b>') negrito += 1;
    else if (marca === '</b>') negrito = Math.max(0, negrito - 1);
    else if (marca === '</span>') cores.pop();
    else if (marca.startsWith('<span')) { const hex = m[1].toUpperCase(); cores.push(CORES_ANOTACAO.has(hex) ? hex : null); }
    else poe(ENTIDADES_ANOTACAO[marca]);
  }
  poe(s.slice(fim));
  return paragrafos.map(compactarTrechos);
}

const escaparAnotacao = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Parágrafos -> texto gravado. Cada trecho leva as suas próprias marcas (o que lerAnotacao devolve volta
// igual): negrito por fora, cor por dentro.
export function escreverAnotacao(paragrafos) {
  return (paragrafos || []).map(p => compactarTrechos(p).map(t => {
    let x = escaparAnotacao(t.texto);
    if (t.cor && CORES_ANOTACAO.has(String(t.cor).toUpperCase())) x = `<span style="color:${String(t.cor).toUpperCase()}">${x}</span>`;
    if (t.negrito) x = `<b>${x}</b>`;
    return x;
  }).join('')).join('\n');
}

// O que a pessoa vê, sem marcas: para a dica do botão, a contagem de caracteres e a altura da linha
// do Excel.
export function textoPuroDaAnotacao(texto) {
  return lerAnotacao(texto).map(p => p.map(t => t.texto).join('')).join('\n');
}

// Algum trecho tem negrito ou cor? (sem isso, a exportação segue o caminho de texto simples)
export function anotacaoTemFormato(paragrafos) {
  return (paragrafos || []).some(p => p.some(t => t.negrito || t.cor));
}

// Texto como vai pro banco: quebras de linha unificadas (o Windows manda \r\n), sem espaço ou linha
// sobrando nas pontas e dentro do limite de caracteres visíveis, sem partir uma marca ao meio. Vazio =
// sem anotação. Texto simples sai como entrou (só `& < >` viram `&amp; &lt; &gt;`).
export function normalizarAnotacao(texto) {
  // Pontas: tira linhas em branco e espaço do começo e do fim (o espaço no meio fica como a pessoa pôs).
  const aparar = (paras) => {
    const vazio = (p) => p.every(t => !t.texto.trim());
    while (paras.length && vazio(paras[0])) paras.shift();
    while (paras.length && vazio(paras[paras.length - 1])) paras.pop();
    if (!paras.length) return paras;
    const primeiro = paras[0];
    while (primeiro.length) {
      const ini = primeiro[0].texto.trimStart();
      if (ini) { primeiro[0].texto = ini; break; }
      primeiro.shift();
    }
    const ultimo = paras[paras.length - 1];
    while (ultimo.length) {
      const fimT = ultimo[ultimo.length - 1].texto.trimEnd();
      if (fimT) { ultimo[ultimo.length - 1].texto = fimT; break; }
      ultimo.pop();
    }
    return paras;
  };
  const paras = aparar(lerAnotacao(texto).map(p => p.map(t => ({ ...t }))));
  // Limite: cada quebra de linha conta como 1 caractere, como no texto simples.
  let restante = LIMITE_ANOTACAO;
  const cortadas = [];
  for (let i = 0; i < paras.length; i += 1) {
    if (i > 0) { restante -= 1; if (restante < 0) break; }
    const p = [];
    for (const t of paras[i]) {
      if (restante <= 0) break;
      const texto = t.texto.slice(0, restante);
      restante -= texto.length;
      p.push({ ...t, texto });
    }
    cortadas.push(p);
  }
  // O corte pode deixar linha em branco ou espaço sobrando no fim.
  return escreverAnotacao(aparar(cortadas));
}

// Quebra a anotação em linhas que cabem em `larguraMax` (mesma unidade que devolve `medir`), para o
// PDF: cada linha é uma lista de trechos { texto, negrito, cor }. `medir(texto, negrito)` dá a largura de
// um pedaço de texto (no PDF, a do jsPDF com a fonte normal ou negrito). Respeita as quebras de linha
// digitadas (linha em branco vira linha vazia), quebra em espaço quando dá e corta palavra maior que a linha.
export function quebrarRunsEmLinhas(paragrafos, larguraMax, medir) {
  const limite = Math.max(0, larguraMax);
  const linhas = [];
  (paragrafos || []).forEach(p => {
    let linha = [];
    let largura = 0;
    const fechar = () => {
      while (linha.length && !linha[linha.length - 1].texto.trim()) linha.pop(); // espaço no fim da linha não conta
      linhas.push(compactarTrechos(linha));
      linha = [];
      largura = 0;
    };
    p.forEach(t => {
      t.texto.split(/(\s+)/).filter(Boolean).forEach(pedaco => {
        const espaco = /^\s+$/.test(pedaco);
        const base = { negrito: t.negrito, cor: t.cor };
        if (espaco) {
          if (linha.length) { linha.push({ ...base, texto: pedaco }); largura += medir(pedaco, t.negrito); }
          return; // espaço no começo da linha some
        }
        let resto = pedaco;
        while (resto) {
          const w = medir(resto, t.negrito);
          if (largura + w <= limite || (!linha.length && limite <= 0)) { linha.push({ ...base, texto: resto }); largura += w; resto = ''; break; }
          if (linha.length) { fechar(); continue; } // não coube: recomeça numa linha nova
          // palavra maior que a linha inteira: corta no último caractere que cabe (no mínimo 1)
          let n = 1;
          while (n < resto.length && medir(resto.slice(0, n + 1), t.negrito) <= limite) n += 1;
          linha.push({ ...base, texto: resto.slice(0, n) });
          largura += medir(resto.slice(0, n), t.negrito);
          resto = resto.slice(n);
          fechar();
        }
      });
    });
    fechar(); // fecha o parágrafo (vazio = linha em branco)
  });
  return linhas;
}

// Texto formatado do Excel para a anotação: o `<si>` da tabela de textos compartilhados do .xlsx, com
// um trecho (`<r>`) por pedaço de formato. `prefixo` entra em negrito antes do texto ("Anotações: ").
// Quebra de linha vira \n dentro do trecho (a célula precisa de quebra automática). O Excel aceita as
// propriedades do trecho em qualquer ordem.
export function siRicoDoExcel(paragrafos, prefixo = '') {
  const xml = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const trecho = (texto, negrito, cor) => (
    `<r><rPr>${negrito ? '<b/>' : ''}<sz val="10"/>${cor ? `<color rgb="FF${cor.replace('#', '').toUpperCase()}"/>` : ''}<rFont val="Calibri"/></rPr>`
    + `<t xml:space="preserve">${xml(texto)}</t></r>`
  );
  const partes = [];
  if (prefixo) partes.push(trecho(prefixo, true, null));
  (paragrafos || []).forEach((p, i) => {
    if (i > 0) partes.push(trecho('\n', false, null));
    compactarTrechos(p).forEach(t => partes.push(trecho(t.texto, t.negrito, t.cor)));
  });
  return `<si>${partes.join('')}</si>`;
}

// Troca, dentro de um .xlsx já gerado (zip), a célula que leva `marcador` pelo texto formatado
// `siXml`. O .xlsx precisa ter sido escrito com tabela de textos compartilhados (bookSST). `fflate` é
// recebido de fora ({ unzipSync, zipSync, strFromU8, strToU8 }) para esta função não carregar a
// biblioteca. Devolve os bytes do novo arquivo; se não achar o marcador, lança erro (quem chama
// exporta o texto simples).
export function aplicarTextoRicoNoXlsx(bytes, marcador, siXml, fflate) {
  const { unzipSync, zipSync, strFromU8, strToU8 } = fflate;
  const arquivos = unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  const caminho = 'xl/sharedStrings.xml';
  if (!arquivos[caminho]) throw new Error('xlsx sem tabela de textos compartilhados');
  const xml = strFromU8(arquivos[caminho]);
  const alvo = new RegExp(`<si><t(?: xml:space="preserve")?>${marcador.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</t></si>`);
  if (!alvo.test(xml)) throw new Error('marcador da anotação não encontrado');
  arquivos[caminho] = strToU8(xml.replace(alvo, () => siXml));
  return zipSync(arquivos);
}

// Quebra a anotação em linhas de no máximo `colunas` caracteres, respeitando as quebras que a
// pessoa digitou e quebrando em espaço quando dá (palavra maior que a linha é cortada). Serve pra
// estimar a altura da linha mesclada do Excel, onde o texto quebra sozinho; no PDF quem quebra é o
// jsPDF (splitTextToSize). Sem texto, nenhuma linha.
export function linhasDaAnotacao(texto, colunas) {
  const largura = Math.max(1, Math.floor(colunas) || 1);
  const limpo = String(texto ?? '').replace(/\r\n?/g, '\n');
  if (!limpo.trim()) return [];
  const saida = [];
  limpo.split('\n').forEach(paragrafo => {
    let linha = '';
    paragrafo.split(/\s+/).filter(Boolean).forEach(inteira => {
      let palavra = inteira;
      while (palavra.length > largura) {
        if (linha) { saida.push(linha); linha = ''; }
        saida.push(palavra.slice(0, largura));
        palavra = palavra.slice(largura);
      }
      const prox = linha ? `${linha} ${palavra}` : palavra;
      if (prox.length > largura) { saida.push(linha); linha = palavra; } else linha = prox;
    });
    saida.push(linha); // parágrafo vazio vira linha em branco (a pessoa deixou uma linha livre)
  });
  return saida;
}

// Bloqueia o fechamento se algum item tiver %medido acima do %executado da tarefa. Tarefa
// atravessando o mês (início e término em meses diferentes) NÃO bloqueia mais aqui — fechar
// o mês salva o que foi medido até ali, mesmo com o cronograma da tarefa se estendendo pro
// mês seguinte; essa checagem virou responsabilidade de validarAbertura, abaixo (mira o mês
// sendo aberto, não o que está sendo fechado — ver motivo 'atravessa').
export function validarFechamento(itens) {
  const violacoes = itens.filter(i => i.percMedido > i.percExecutado);
  return { ok: violacoes.length === 0, violacoes };
}

// Meses que fazem parte da cadeia da medição: do mês inicial da obra em diante
// (obras.medicao_mes_inicial). Em obra com lançamento retroativo os meses antes dele
// ficam fora — não precisam ser abertos/aprovados pra liberar o primeiro mês real.
// Sem mês inicial (null), vale o cronograma inteiro, como sempre foi.
export function mesesDaMedicao(months, mesInicial) {
  if (!mesInicial) return months;
  return months.filter(m => m.key >= mesInicial);
}

// Meses do seletor da Medição: com início definido, os anteriores a ele saem da lista (não há
// medição ali). Exceção: mês anterior que JÁ tem medição no banco (`statusPorMes[mes]`, de
// quando o início era outro) continua listado, para não deixar um registro sem como abrir.
// Sem início, lista tudo. Diferente de mesesDaMedicao, que é a cadeia de aprovação e não
// inclui esses meses.
export function mesesDoSeletor(months, mesInicial, statusPorMes = {}) {
  if (!mesInicial) return months;
  return months.filter(m => m.key >= mesInicial || !!statusPorMes[m.key]);
}

// Bloqueia a abertura se alguma folha com término num mês anterior a mesRefKey ainda não
// chegou a 100% de avanço — abrir o mês seguinte com pendência do passado escondia que a
// tarefa precisa ser reprogramada. Só folhas (grupo é média dos filhos, não é reprogramável)
// e só olha pro passado: término no próprio mesRefKey (ou depois) ainda está em andamento,
// não é atraso.
export function validarAbertura(etapas, mesRefKey, wbsMap) {
  const porTermino = etapas
    .filter(e => !e.isGroup && (e.avanco || 0) < 100)
    .map(e => ({ e, terminoMes: offsetToISO(taskEnd(e) - 1).slice(0, 7) }))
    .filter(({ terminoMes }) => terminoMes < mesRefKey)
    .map(({ e, terminoMes }) => ({
      id: e.id, wbs: wbsMap[e.id] || '', descricao: e.etapa || '',
      avanco: e.avanco || 0, motivo: 'termino', terminoMes,
    }));
  // Tarefa que já devia estar em andamento (início num mês anterior ao que está sendo
  // aberto) mas segue em 0% — mesmo com término ainda no próprio mês ou depois, passar o
  // mês inteiro sem nenhuma execução registrada também tem que travar a abertura do
  // próximo mês (senão o mês fica "fechado" com a tarefa intocada, escondendo o atraso).
  const porInicioZerado = etapas
    .filter(e => !e.isGroup && (e.avanco || 0) === 0)
    .map(e => ({ e, inicioMes: offsetToISO(e.inicio).slice(0, 7) }))
    .filter(({ inicioMes }) => inicioMes < mesRefKey)
    .map(({ e, inicioMes }) => ({
      id: e.id, wbs: wbsMap[e.id] || '', descricao: e.etapa || '',
      avanco: 0, motivo: 'zerada', inicioMes,
    }));
  const jaListados = new Set([...porTermino, ...porInicioZerado].map(p => p.id));
  // Tarefa que começou antes do mês sendo aberto e cujo término ainda cai dentro dele (ou
  // depois) — cronograma "sujo" que precisa ser separado (Reprogramar restante) ou corrigido
  // (ajustar término) antes de abrir. Cobre tanto avanço parcial (sobra "restante" pra
  // separar) quanto 100% com término desalinhado (não sobra restante, mas a data ainda
  // empurra uma fatia indevida pro previsto do mês sendo aberto). avanco===0 já é coberto
  // por porInicioZerado acima, então fica de fora daqui pra não duplicar a pendência.
  const porAtravessaMes = etapas
    .filter(e => !e.isGroup && !jaListados.has(e.id) && (e.avanco || 0) > 0)
    .map(e => ({ e, inicioMes: offsetToISO(e.inicio).slice(0, 7), terminoMes: offsetToISO(taskEnd(e) - 1).slice(0, 7) }))
    .filter(({ inicioMes, terminoMes }) => inicioMes < mesRefKey && terminoMes >= mesRefKey)
    .map(({ e, inicioMes }) => ({
      id: e.id, wbs: wbsMap[e.id] || '', descricao: e.etapa || '',
      avanco: e.avanco || 0, motivo: 'atravessa', inicioMes,
    }));
  const pendentes = [...porTermino, ...porInicioZerado, ...porAtravessaMes]
    .sort((a, b) => a.wbs.localeCompare(b.wbs, 'pt-BR', { numeric: true }));
  return { ok: pendentes.length === 0, pendentes };
}

// Compara o snapshot CONGELADO de uma medição fechada/aprovada com o que o cronograma
// diria hoje — sem isso, mudar uma data/duração/vínculo depois de fechar fica invisível
// pra quem está olhando a medição (ela é um documento, não recalcula sozinha, ver
// gerarMedicao em MedicaoMensal.jsx). idsExtras é inferido do próprio snapshot (itens
// com foraDoMes:true), mesma convenção que mergePercMedido já usa, pra comparar maçã com
// maçã: as mesmas tarefas "fora do mês" que estavam na medição continuam entrando no
// recálculo ao vivo.
//
// Só os campos que vêm do CRONOGRAMA entram na comparação (data/duração/valor/%executado)
// — percMedido nunca, é o dado que o usuário digitou e tem que ficar como está até alguém
// mexer de propósito (Reabrir, ou o próprio "Atualizar valores" preserva o que já foi
// digitado, ver atualizarValores em MedicaoMensal.jsx).
const CAMPOS_DEFASAGEM = ['dataInicio', 'dataTermino', 'duracaoDias', 'valor', 'percExecutado'];

export function detectarDefasagem(itensCongelados, etapas, mesRefKey, { monthlyDist, wbsMap, disciplinaInfo, valorVinculadoMap = null } = {}) {
  if (!itensCongelados?.length) return [];
  const idsExtras = new Set(itensCongelados.filter(i => i.foraDoMes).map(i => i.id));
  const aoVivo = buildItensMedicao(etapas, mesRefKey, { monthlyDist, wbsMap, disciplinaInfo, idsExtras, valorVinculadoMap });
  const porIdVivo = new Map(aoVivo.map(i => [i.id, i]));
  const porIdCongelado = new Map(itensCongelados.map(i => [i.id, i]));

  const mudancas = [];
  porIdCongelado.forEach((congelado, id) => {
    const vivo = porIdVivo.get(id);
    if (!vivo) {
      mudancas.push({ id, wbs: congelado.wbs, descricao: congelado.descricao, tipo: 'removido' });
      return;
    }
    const campos = CAMPOS_DEFASAGEM.filter(c => congelado[c] !== vivo[c]);
    if (campos.length) mudancas.push({ id, wbs: congelado.wbs, descricao: congelado.descricao, tipo: 'alterado', campos });
  });
  porIdVivo.forEach((vivo, id) => {
    if (!porIdCongelado.has(id)) mudancas.push({ id, wbs: vivo.wbs, descricao: vivo.descricao, tipo: 'novo' });
  });

  return mudancas.sort((a, b) => a.wbs.localeCompare(b.wbs, 'pt-BR', { numeric: true }));
}

// Aplica o %medido salvo (registro do banco) por id; itens sem registro salvo mantêm
// o default (percExecutado) já aplicado em buildItensMedicao.
export function mergePercMedido(itensBase, registroItens) {
  if (!registroItens?.length) return itensBase;
  const salvos = new Map(registroItens.map(r => [r.id, r]));
  return itensBase.map(i => {
    const r = salvos.get(i.id);
    if (!r) return i;
    return { ...i, percMedido: r.percMedido, ...(r.observacao ? { observacao: r.observacao } : {}), ...(r.visto ? { visto: true } : {}) };
  });
}

// Snapshot gravado no fechamento: congela o que foi medido para que o histórico não
// mude quando o cronograma mudar depois (custo, datas, vínculo de orçamento). Sem isso
// os R$ de uma medição "fechada" seriam recalculados na releitura.
//
// `previstoCongelado` ({ percPrevisto, percPrevistoAcumulado }) já vem congelado desde
// a ABERTURA do mês (ver abrirMedicao/MedicaoMensal.jsx) — só é recalculado aqui como
// último recurso, para uma medição aberta antes desse campo existir e fechada só agora.
export function buildSnapshotFechamento(itens, totais, previstoCongelado = {}) {
  return {
    valorTotalMedido: totais.valorAMedir,
    percMedido: totais.med,
    percPrevisto: previstoCongelado.percPrevisto,
    percPrevistoAcumulado: previstoCongelado.percPrevistoAcumulado,
    itens: itens.map(i => ({
      id: i.id,
      wbs: i.wbs,
      descricao: i.descricao,
      pavimento: i.pavimento,
      valor: i.valor,
      foraDoMes: !!i.foraDoMes,
      percExecutado: i.percExecutado,
      percMedido: i.percMedido,
      ...(i.observacao ? { observacao: i.observacao } : {}),
      ...(i.visto ? { visto: true } : {}),
      // Campos de exibição também congelam: sem eles a tela de uma medição fechada
      // teria que voltar ao cronograma para montar a árvore e as datas, e mudaria
      // junto com ele.
      nivel: i.nivel ?? 0,
      parentId: i.parentId ?? null,
      dataInicio: i.dataInicio,
      dataTermino: i.dataTermino,
      duracaoDias: i.duracaoDias,
    })),
  };
}

// Reconstrói as linhas de uma medição FECHADA a partir do snapshot gravado, sem
// consultar o cronograma. Snapshots antigos não têm os campos de exibição (nivel,
// parentId, datas, duração): só nesses casos cai no cronograma, e apenas para eles —
// os valores financeiros vêm sempre do snapshot.
export function hidratarSnapshot(registroItens, etapas, { wbsMap = {}, disciplinaInfo = {} } = {}) {
  if (!registroItens?.length) return [];
  const porId = new Map(etapas.map(e => [e.id, e]));
  return registroItens.map(i => {
    const e = porId.get(i.id);
    const info = disciplinaInfo[i.id] || {};
    return {
      id: i.id,
      parentId: i.parentId ?? e?.parentId ?? null,
      nivel: i.nivel ?? e?.nivel ?? 0,
      wbs: i.wbs || wbsMap[i.id] || '',
      descricao: i.descricao || e?.etapa || '',
      pavimento: i.pavimento || e?.pavimento || '—',
      disciplina: info.disciplina || '—',
      disciplinaCodigo: info.disciplinaCodigo || '0',
      inicioOff: e?.inicio,
      terminoOff: e ? taskEnd(e) : undefined, // exclusivo, ver buildItensMedicao
      dataInicio: i.dataInicio || (e ? fmtData(e.inicio) : ''),
      dataTermino: i.dataTermino || (e ? fmtData(taskEnd(e) - 1) : ''),
      duracaoDias: i.duracaoDias ?? e?.dur,
      valor: i.valor || 0,
      foraDoMes: !!i.foraDoMes,
      percExecutado: i.percExecutado || 0,
      percMedido: i.percMedido || 0,
      observacao: i.observacao || '',
      visto: !!i.visto,
      status: undefined,
    };
  });
}

// ── Rascunho guardado no aparelho (fila de envio, ver medicaoSync.js) ────────────────
// Em vez da lista inteira, o aparelho guarda só o que a pessoa mudou, campo a campo, com
// o valor que o BANCO tinha quando ela mexeu (base). No envio, aplica essas mudanças por
// cima do que está no banco AGORA: o que outra pessoa mudou em outras tarefas fica, e só
// é conflito quando os dois mudaram o mesmo campo da mesma tarefa para valores diferentes.
// Antes o rascunho inteiro era regravado por cima (o último a salvar apagava o resto).

// Mesma forma que o banco guarda (salvarRascunho): campo ausente vale o padrão.
export function normalizarCampoRascunho(campo, v) {
  if (campo === 'percMedido') return v == null || v === '' ? null : Number(v);
  if (campo === 'observacao') return String(v || '').trim();
  if (campo === 'visto') return !!v;
  return v ?? null;
}

// Linhas da tela -> itens como o banco guarda em medicoes_mensais.itens.
export const serializarItensRascunho = (itens) => itens.map(i => ({
  id: i.id,
  percMedido: i.percMedido,
  ...(i.foraDoMes ? { manual: true } : {}),
  ...(i.observacao ? { observacao: i.observacao } : {}),
  ...(i.visto ? { visto: true } : {}),
}));

// Junta mudanças novas nas já guardadas. `mudancas`: [{ id, campos: { percMedido, visto,
// observacao }, percMedidoTela }]; `baseItens`: itens do registro do banco em que a
// pessoa está mexendo. A base de cada campo é fixada na 1ª mudança: é ela que diz se o
// banco mudou "por baixo" depois.
export function registrarAlteracoes(alteracoes, mudancas, baseItens) {
  const base = new Map((baseItens || []).map(i => [String(i.id), i]));
  const prox = { ...(alteracoes || {}) };
  for (const { id, campos, percMedidoTela } of mudancas) {
    const chave = String(id);
    const noBanco = base.get(chave);
    const atual = { id, campos: { ...(prox[chave]?.campos || {}) } };
    const todos = { ...campos };
    // Tarefa que ainda não está na lista do banco nasce lá com o % da tela: senão um
    // "visto" sozinho criaria item sem % medido.
    if (!noBanco && !('percMedido' in todos) && !('percMedido' in atual.campos) && percMedidoTela !== undefined) {
      todos.percMedido = percMedidoTela;
    }
    for (const [campo, valor] of Object.entries(todos)) {
      const baseValor = campo in atual.campos ? atual.campos[campo].base : normalizarCampoRascunho(campo, noBanco?.[campo]);
      atual.campos[campo] = { base: baseValor, valor: normalizarCampoRascunho(campo, valor) };
    }
    prox[chave] = atual;
  }
  return prox;
}

const definirCampo = (item, campo, valor) => {
  if (campo === 'percMedido') { item.percMedido = valor ?? 0; return; }
  if (campo === 'observacao') { if (valor) item.observacao = valor; else delete item.observacao; return; }
  if (campo === 'visto') { if (valor) item.visto = true; else delete item.visto; }
};

// Mostra na tela o que está guardado no aparelho por cima do registro (do banco ou do cache).
export function aplicarAlteracoes(linhas, alteracoes) {
  if (!alteracoes || !Object.keys(alteracoes).length) return linhas;
  return linhas.map(l => {
    const alt = alteracoes[String(l.id)];
    if (!alt) return l;
    const prox = { ...l };
    for (const [campo, { valor }] of Object.entries(alt.campos)) {
      if (campo === 'percMedido') prox.percMedido = valor ?? 0;
      else if (campo === 'observacao') prox.observacao = valor;
      else if (campo === 'visto') prox.visto = !!valor;
    }
    return prox;
  });
}

// Aplica as mudanças guardadas sobre os itens que estão no banco agora. Devolve os itens
// a gravar e os conflitos ({ id, campo, meu, sistema }). forcarMeus: a pessoa escolheu
// "usar os meus" depois de ver o conflito.
export function mesclarRascunho(itensDoBanco, alteracoes, { forcarMeus = false } = {}) {
  const itens = (itensDoBanco || []).map(i => ({ ...i }));
  const porId = new Map(itens.map(i => [String(i.id), i]));
  const conflitos = [];
  for (const [chave, alt] of Object.entries(alteracoes || {})) {
    let item = porId.get(chave);
    // A tarefa existia no banco quando a pessoa mexeu (base diferente do padrão) e agora
    // não existe mais (ex.: tarefa manual removida): não recria, nem acusa conflito.
    if (!item && Object.entries(alt.campos).some(([campo, c]) => c.base !== normalizarCampoRascunho(campo, undefined))) continue;
    // Item novo no banco só nasce com % medido (sem ele a tela não teria o que mostrar).
    if (!item && !('percMedido' in alt.campos)) continue;
    for (const [campo, { base, valor }] of Object.entries(alt.campos)) {
      const sistema = normalizarCampoRascunho(campo, item?.[campo]);
      if (sistema === valor) continue; // já está assim (ex.: envio anterior que chegou)
      if (sistema !== base && !forcarMeus) { conflitos.push({ id: alt.id, campo, meu: valor, sistema }); continue; }
      if (!item) { item = { id: alt.id }; itens.push(item); porId.set(chave, item); }
      definirCampo(item, campo, valor);
    }
  }
  return { itens, conflitos };
}

// Depois de um envio que deu certo: tira o que já foi (mesmo valor) e, no que a pessoa
// mudou DURANTE o envio, passa a base pro valor enviado (agora é o que o banco tem). Sem
// isso a próxima mudança da mesma tarefa acusaria conflito com a própria edição.
export function rebaseAlteracoes(alteracoes, enviadas) {
  const prox = {};
  for (const [chave, alt] of Object.entries(alteracoes || {})) {
    const env = enviadas?.[chave]?.campos || {};
    const campos = {};
    for (const [campo, c] of Object.entries(alt.campos)) {
      if (!(campo in env)) { campos[campo] = c; continue; }
      if (env[campo].valor === c.valor) continue;
      campos[campo] = { base: env[campo].valor, valor: c.valor };
    }
    if (Object.keys(campos).length) prox[chave] = { id: alt.id, campos };
  }
  return prox;
}

// "Usar os do sistema": esquece só os campos em conflito.
export function descartarCampos(alteracoes, conflitos) {
  const tirar = new Set((conflitos || []).map(c => `${String(c.id)}|${c.campo}`));
  const prox = {};
  for (const [chave, alt] of Object.entries(alteracoes || {})) {
    const campos = Object.fromEntries(Object.entries(alt.campos).filter(([campo]) => !tirar.has(`${chave}|${campo}`)));
    if (Object.keys(campos).length) prox[chave] = { id: alt.id, campos };
  }
  return prox;
}

// O que está no banco agora, pra decidir se ainda dá pra aplicar as mudanças guardadas.
// 'excluida': não existe mais, ou foi excluída e aberta de novo (id novo) — as mudanças
// eram para outra medição. 'fechada': fechada ou aprovada no meio.
export function classificarMedicaoNoBanco(registro, baseId) {
  if (!registro) return 'excluida';
  if (baseId != null && String(registro.id) !== String(baseId)) return 'excluida';
  if (registro.status !== 'rascunho') return 'fechada';
  return 'rascunho';
}
