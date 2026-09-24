// Curva S (Curva Física) — cálculo das séries e escolha padrão de Linha de Base /
// Reprogramação, compartilhados entre a aba Curva Física do Cronograma e o Dashboard
// Executivo. Os dois precisam mostrar exatamente os mesmos números pra mesma obra,
// então a fórmula mora aqui, em um lugar só.
import { computeMonthlyDist } from './scheduleEngine';
import { computeCustoOrcadoMap } from './ganttUtils';

// Soma a distribuição mensal por tarefa ({ tarefaId: { 'AAAA-MM': valor } }) num total
// por mês ({ 'AAAA-MM': valor }).
export function agregarDist(distPorTarefa) {
  const agg = {};
  Object.values(distPorTarefa || {}).forEach(d =>
    Object.entries(d).forEach(([k, v]) => { agg[k] = (agg[k] || 0) + v; })
  );
  return agg;
}

// Distribuição mensal agregada de um retrato congelado do cronograma (Linha de Base ou
// Reprogramação), com o peso de Custo Orçado recalculado sobre as etapas do retrato.
export function distDeRetrato(etapasRetrato, valorVinculadoMap) {
  if (!etapasRetrato) return null;
  return agregarDist(computeMonthlyDist(etapasRetrato, computeCustoOrcadoMap(etapasRetrato, valorVinculadoMap)));
}

// Séries mensais (M) e acumuladas (A), em pontos percentuais 0..100:
//  bl  = Linha de Base (relativa ao total da própria linha de base)
//  rep = Reprogramado (sem reprogramação, cai no plano ao vivo)
//  rr  = Real + Reprogramado (plano ao vivo, igual ao Uso da Tarefa)
// `planned` é o plano ao vivo agregado por mês; `baselineDist`/`repDist` podem ser null.
export function computeCurvaSeries({ months, planned, baselineDist = null, repDist = null }) {
  const totalPlanned = months.reduce((s, m) => s + (planned[m.key] || 0), 0);
  const hasBL  = baselineDist != null;
  const hasRep = repDist != null;
  const baselineTotal = hasBL ? months.reduce((s, m) => s + (baselineDist[m.key] || 0), 0) : null;
  const refBLT = baselineTotal || totalPlanned || 1;
  const refRep = totalPlanned || 1;
  let apBL = 0, apRep = 0, apRR = 0;
  const blM = [], blA = [], repM = [], repA = [], rrM = [], rrA = [], difBL = [], difRep = [];
  months.forEach(m => {
    const vBL  = hasBL ? (baselineDist[m.key] || 0) : 0;
    const vRep = hasRep ? (repDist[m.key] || 0) : (planned[m.key] || 0);
    const vRR  = planned[m.key] || 0;
    apBL += vBL; apRep += vRep; apRR += vRR;
    blM.push(vBL  / refBLT * 100); blA.push(apBL / refBLT * 100);
    repM.push(vRep / refRep * 100); repA.push(apRep / refRep * 100);
    rrM.push(vRR  / refRep * 100); rrA.push(apRR  / refRep * 100);
    difBL.push(hasBL ? rrA[rrA.length - 1] - blA[blA.length - 1] : null);
    difRep.push(rrA[rrA.length - 1] - repA[repA.length - 1]);
  });
  return { blM, blA, repM, repA, rrM, rrA, difBL, difRep, baselineTotal };
}

// Entre as reprogramações anteriores ao mês atual, a mais recente; sem nenhuma
// anterior, a mais recente entre todas; lista vazia, null.
export function defaultRepId(reps, refMonthKey) {
  if (!reps.length) return null;
  const ref = refMonthKey || new Date().toISOString().slice(0, 7);
  const anteriores = reps.filter(r => r.criadaEm.slice(0, 7) < ref);
  const pool = anteriores.length ? anteriores : reps;
  return pool.reduce((best, r) => (!best || r.criadaEm > best.criadaEm) ? r : best, null)?.id ?? null;
}

// Entre as linhas de base, a mais recente por criadaEm; lista vazia, null. Não tem o
// conceito de "mês de referência" que a reprogramação tem (defaultRepId acima).
export function defaultBlId(baselines) {
  if (!baselines.length) return null;
  return baselines.reduce((best, b) => (!best || b.criadaEm > best.criadaEm) ? b : best, null)?.id ?? null;
}

// Seleção visível da Curva (Linha de Base / Reprogramação / mês de referência),
// persistida por obra no navegador.
export function carregarBlVisivel(obraId) {
  try { return localStorage.getItem('crono_bl_visivel_' + obraId) || null; } catch { return null; }
}
export function carregarRepVisivel(obraId) {
  try { return localStorage.getItem('crono_rep_visivel_' + obraId) || null; } catch { return null; }
}
export function carregarMesRef(obraId) {
  try { return localStorage.getItem('crono_mesref_' + obraId) || null; } catch { return null; }
}
export function mesAtualKey() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}
