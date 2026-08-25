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

export const PREVISTO_MES_PCT = 100;

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
        // dataInicio/dataTermino são só exibição.
        inicioOff: e.inicio,
        terminoOff,
        dataInicio: fmtData(e.inicio),
        dataTermino: fmtData(terminoOff),
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
    .filter(e => !e.isGroup && !noMes(e, monthlyDist, mesRefKey))
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
// representa), previsto e executado acumulados (% do valor da obra até o fim do mês).
export function computeResumo({ monthlyTotals, realizedTotalsAte, mesRefKey }) {
  const totalPlan = Object.values(monthlyTotals).reduce((s, v) => s + v, 0);
  const planAteMes = Object.entries(monthlyTotals).reduce((s, [k, v]) => (k <= mesRefKey ? s + v : s), 0);
  const realAteMes = Object.values(realizedTotalsAte).reduce((s, v) => s + v, 0);
  return {
    valorObra: totalPlan,
    metaProgramada: totalPlan > 0 ? ((monthlyTotals[mesRefKey] || 0) / totalPlan) * 100 : 0,
    previstoAcumulado: totalPlan > 0 ? (planAteMes / totalPlan) * 100 : 0,
    executadoAcumulado: totalPlan > 0 ? (realAteMes / totalPlan) * 100 : 0,
  };
}

// Bloqueia o fechamento se algum item tiver %medido acima do %executado da tarefa.
export function validarFechamento(itens) {
  const violacoes = itens.filter(i => i.percMedido > i.percExecutado);
  return { ok: violacoes.length === 0, violacoes };
}

// Aplica o %medido salvo (registro do banco) por id; itens sem registro salvo mantêm
// o default (percExecutado) já aplicado em buildItensMedicao.
export function mergePercMedido(itensBase, registroItens) {
  if (!registroItens?.length) return itensBase;
  const salvos = new Map(registroItens.map(r => [r.id, r.percMedido]));
  return itensBase.map(i => (salvos.has(i.id) ? { ...i, percMedido: salvos.get(i.id) } : i));
}

// Snapshot gravado no fechamento: congela o que foi medido para que o histórico não
// mude quando o cronograma mudar depois (custo, datas, vínculo de orçamento). Sem isso
// os R$ de uma medição "fechada" seriam recalculados na releitura.
export function buildSnapshotFechamento(itens, totais) {
  return {
    valorTotalMedido: totais.valorAMedir,
    percMedido: totais.med,
    percPrevisto: PREVISTO_MES_PCT,
    itens: itens.map(i => ({
      id: i.id,
      wbs: i.wbs,
      descricao: i.descricao,
      pavimento: i.pavimento,
      valor: i.valor,
      foraDoMes: !!i.foraDoMes,
      percExecutado: i.percExecutado,
      percMedido: i.percMedido,
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
      terminoOff: e ? taskEnd(e) : undefined,
      dataInicio: i.dataInicio || (e ? fmtData(e.inicio) : ''),
      dataTermino: i.dataTermino || (e ? fmtData(taskEnd(e)) : ''),
      duracaoDias: i.duracaoDias ?? e?.dur,
      valor: i.valor || 0,
      foraDoMes: !!i.foraDoMes,
      percExecutado: i.percExecutado || 0,
      percMedido: i.percMedido || 0,
      status: undefined,
    };
  });
}
