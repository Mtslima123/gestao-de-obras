// ─── carteiraPure ─────────────────────────────────────────────────────────────
// Agregações de carteira do Dashboard Executivo. Ficam fora do componente para
// poderem ser testadas: são as contas que o painel afirma como verdade.
//
// O cálculo por obra continua sendo o do cronograma (computeAvancoFisico,
// computeMonthlyDist etc.); aqui só se junta o que já foi calculado por obra.

/**
 * Orçamento contratado da carteira: o orçamento MAIS RECENTE de cada obra.
 *
 * Somar a tabela toda contaria versões em dobro (a tabela guarda v1, v2… da mesma
 * obra), e filtrar por status 'aprovado' zeraria o total, porque hoje os orçamentos
 * reais estão todos em rascunho.
 *
 * @param {Array} orcamentos - linhas de `orcamentos`, já ordenadas por data desc
 * @returns {{ total: number, porObra: Object }}
 */
export function orcamentoDaCarteira(orcamentos) {
  const porObra = {};
  (orcamentos || []).forEach(o => {
    if (!o?.obra_id) return;
    const atual = porObra[o.obra_id];
    if (!atual || maisRecente(o, atual)) porObra[o.obra_id] = o;
  });
  const valores = {};
  let total = 0;
  Object.entries(porObra).forEach(([obraId, o]) => {
    const v = Number(o.valor) || 0;
    valores[obraId] = v;
    total += v;
  });
  return { total, porObra: valores };
}

const chaveData = (o) => `${o?.data || ''}|${o?.created_at || ''}`;
const maisRecente = (a, b) => chaveData(a) > chaveData(b);

/**
 * Avanço físico da carteira: média dos avanços das obras ponderada pelo peso
 * financeiro de cada uma (custo orçado). Sem peso nenhum, cai na média simples —
 * mesma regra de fallback do computeAvancoFisico, para não devolver 0% só porque
 * ninguém vinculou orçamento ainda.
 *
 * @param {Array} porObra - [{ avanco: %, peso: R$ }]
 */
export function avancoDaCarteira(porObra) {
  const linhas = (porObra || []).filter(o => Number.isFinite(o?.avanco));
  if (!linhas.length) return 0;
  const somaPeso = linhas.reduce((s, o) => s + (Number(o.peso) || 0), 0);
  if (somaPeso > 0) {
    return linhas.reduce((s, o) => s + o.avanco * (Number(o.peso) || 0), 0) / somaPeso;
  }
  return linhas.reduce((s, o) => s + o.avanco, 0) / linhas.length;
}

/**
 * Junta as distribuições mensais de várias obras numa curva acumulada.
 *
 * Entrada: um array de `computeMonthlyDist` (um por obra), cada um no formato
 * { [etapaId]: { 'YYYY-MM': R$ } }.
 *
 * @returns {Array<{ mes: string, valor: number, acumulado: number, pct: number }>}
 */
export function curvaPrevista(distsPorObra) {
  const porMes = {};
  (distsPorObra || []).forEach(dist => {
    Object.values(dist || {}).forEach(meses => {
      Object.entries(meses || {}).forEach(([mes, v]) => {
        porMes[mes] = (porMes[mes] || 0) + (Number(v) || 0);
      });
    });
  });
  const meses = Object.keys(porMes).sort();
  const total = meses.reduce((s, m) => s + porMes[m], 0);
  let acc = 0;
  return meses.map(mes => {
    acc += porMes[mes];
    return {
      mes,
      valor: porMes[mes],
      acumulado: acc,
      // Sem total não há percentual: 0/0 viraria NaN e quebraria o desenho da curva.
      pct: total > 0 ? (acc / total) * 100 : 0,
    };
  });
}

/** Índice do mês corrente na curva, para o marcador de "hoje". -1 se fora da janela. */
export function indiceDoMes(curva, agora = new Date()) {
  const chave = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
  return (curva || []).findIndex(p => p.mes === chave);
}

/**
 * Distribuição da carteira por situação. Só existem dois status no sistema
 * ('em_andamento' e 'concluida'), então qualquer outro valor cai em "Outras" em vez
 * de ser descartado em silêncio.
 */
export function distribuicaoPorStatus(obras) {
  const rotulos = { em_andamento: 'Em execução', concluida: 'Concluídas' };
  const cores = { em_andamento: 'var(--brand)', concluida: 'var(--success)' };
  const contagem = {};
  (obras || []).forEach(o => {
    const st = o?.status || 'outras';
    contagem[st] = (contagem[st] || 0) + 1;
  });
  return Object.entries(contagem)
    .sort((a, b) => b[1] - a[1])
    .map(([st, value]) => ({
      status: st,
      label: rotulos[st] || 'Outras',
      color: cores[st] || 'var(--text-faint)',
      value,
    }));
}

/**
 * Pendências derivadas do próprio dado carregado — obra sem orçamento, sem
 * cronograma, ou com cronograma sem nenhum vínculo com o orçamento. São as lacunas
 * que impedem o painel de mostrar número de verdade, então valem como alerta.
 */
export function pendenciasDaCarteira(porObra) {
  const out = [];
  (porObra || []).forEach(o => {
    if (!o.temCronograma) {
      out.push({ tipo: 'warning', obraId: o.id, titulo: `${o.nome} sem cronograma`, sub: 'Nenhuma etapa cadastrada — a obra não entra no avanço da carteira' });
      return;
    }
    if (!o.orcamento) {
      out.push({ tipo: 'warning', obraId: o.id, titulo: `${o.nome} sem orçamento`, sub: 'Sem orçamento cadastrado — não entra no valor contratado' });
    } else if (!o.valorVinculado) {
      out.push({ tipo: 'info', obraId: o.id, titulo: `${o.nome} sem vínculos`, sub: 'Orçamento não vinculado ao cronograma — o avanço não tem peso financeiro' });
    }
  });
  return out;
}
