// Regras puras do Dashboard na casca mobile (sem React, sem Supabase), para poderem ser testadas.
//
// ATENÇÃO: o preparo dos dados por obra (montarCarteira) repete o que o efeito de carga do Dashboard do
// desktop faz (modules/dashboard/Dashboard.jsx). Foi copiado de propósito para não alterar o desktop. As contas
// em si continuam sendo as mesmas funções do cronograma (computeAvancoFisico, computeValorVinculadoMap etc.);
// aqui só se orquestra. Se a regra mudar no Dashboard do desktop, conferir aqui também.
import { migrateEtapas, offsetToISO, computeValorVinculadoMap, computeCustoOrcadoMap } from '../../../cronograma/ganttUtils';
import { computeAvancoFisico } from '../../../cronograma/scheduleEngine';
import { orcamentoDaCarteira } from '../../../dashboard/carteiraPure';
import { getLinhaTotal, corPorSinal } from '../../../fisicoFinanceiro/fisicoFinanceiroPure';

// Obra concluída some do Dashboard inteiro; só existem 2 status (em_andamento e concluida).
export const obrasAtivasDe = (obras) => (obras || []).filter(o => o.status !== 'concluida');

// Junta o que as 4 consultas devolveram, por obra. `itemValor` vem de vinculoService e entra por parâmetro
// para este arquivo não puxar o cliente do Supabase (assim dá para testar sem rede nem variáveis de ambiente).
export const montarCarteira = ({ obrasAtivas = [], cronogramas = [], vinculos = [], orcamentos = [], fechamentos = [], itemValor }) => {
  // Último fechamento importado de cada obra (não um mês fixo), igual à tela de Físico Financeiro.
  const fechamentosPorObra = {}, mesFechamentoPorObra = {};
  fechamentos.forEach(r => {
    fechamentosPorObra[r.obra_id] = r.itens || [];
    mesFechamentoPorObra[r.obra_id] = r.mes_referencia;
  });

  const vincPorObra = {}, itensMapPorObra = {};
  vinculos.forEach(v => {
    (vincPorObra[v.obra_id] = vincPorObra[v.obra_id] || []).push(v);
    if (v.orcamento_itens) {
      const m = itensMapPorObra[v.obra_id] = itensMapPorObra[v.obra_id] || {};
      m[v.orcamento_item_id] = itemValor(v.orcamento_itens);
    }
  });

  const { total: orcamentoTotal } = orcamentoDaCarteira(orcamentos);
  const cronPorObra = {};
  cronogramas.forEach(r => { cronPorObra[r.obra_id] = r; });

  const curvaPorObra = {};
  const porObra = obrasAtivas.map(o => {
    const cron = cronPorObra[o.id];
    const etapas = migrateEtapas(cron?.etapas || []);
    const vincMap = computeValorVinculadoMap(etapas, vincPorObra[o.id] || [], itensMapPorObra[o.id] || {});
    const custoMap = computeCustoOrcadoMap(etapas, vincMap);
    curvaPorObra[o.id] = {
      etapas, valorVinculadoMap: vincMap, custoOrcadoMap: custoMap,
      baselines: cron?.baselines || [], reprogramacoes: cron?.reprogramacoes || [],
    };
    return {
      id: o.id,
      nome: o.nome,
      sigla: o.sigla || o.id,
      status: o.status,
      dataFimObra: o.dataFimObra || null,
      avanco: etapas.length ? computeAvancoFisico(etapas, custoMap) : 0,
      area: Number(o.area) || 0,
      // -1: (inicio+dur) é o offset EXCLUSIVO (dia seguinte ao término). Em dias corridos, de propósito:
      // esta tela agrega várias obras e o calendário de feriados é estado de módulo único.
      fimCronograma: etapas.length
        ? offsetToISO(Math.max(...etapas.map(e => (e.inicio || 0) + (e.dur || 0))) - 1)
        : null,
    };
  });

  return { porObra, curvaPorObra, orcamentoTotal, fechamentosPorObra, mesFechamentoPorObra };
};

// Da obra que termina primeiro para a última. Término = "Data fim da obra" do cadastro; sem ela, o fim do
// cronograma. Obra sem nenhuma das duas vai para o fim. Empate desempata pelo nome.
export const terminoDe = (o) => o.dataFimObra || o.fimCronograma || null;
export const ordenarPorTermino = (porObra) => [...(porObra || [])].sort((a, b) => {
  const ta = terminoDe(a), tb = terminoDe(b);
  if (ta !== tb) {
    if (!ta) return 1;
    if (!tb) return -1;
    return ta < tb ? -1 : 1;
  }
  return a.nome.localeCompare(b.nome, 'pt-BR');
});

// Obra mostrada no Físico Financeiro e na Curva S: a escolhida, se ainda estiver na lista; senão a primeira que
// já tem fechamento importado; senão a primeira da lista.
export const escolherObraFF = ({ obrasAtivas = [], obraFiltro = null, fechamentosPorObra = {} }) => (
  obrasAtivas.some(o => o.id === obraFiltro)
    ? obraFiltro
    : (obrasAtivas.find(o => fechamentosPorObra[o.id]) || obrasAtivas[0])?.id ?? ''
);

// Execução física, gasto e delta (pontos percentuais) do último fechamento de uma obra. null = sem fechamento.
export const resumoFisicoFinanceiro = (itensFechamento) => {
  const total = itensFechamento ? getLinhaTotal(itensFechamento) : null;
  if (!total) return null;
  const execFisico = total.executadoFisico || 0;
  const gastoPct = total.gastoPct || 0;
  const delta = execFisico - gastoPct;
  return { execFisico, gastoPct, delta, cor: corPorSinal(delta) };
};

// Os 4 indicadores do Físico Financeiro (mesmos do desktop), prontos para virar cartões.
const INDICADORES_FF = [
  { chave: 'delta',     rotulo: 'Delta Físico × Financeiro', icone: 'measure',     pct: 'deltaFisicoFinanceiroPct', real: 'deltaFisicoFinanceiroReal', cor: 'corDeltaFisicoFinanceiro' },
  { chave: 'saving',    rotulo: 'Saving',                    icone: 'briefcase',   pct: 'savingRealPct',            real: 'savingReal',                cor: 'corSavingReal' },
  { chave: 'incc',      rotulo: 'Ganhos em INCC',            icone: 'trending-up', pct: 'ganhosInccRealPct',        real: 'ganhosInccReal',            cor: 'corGanhosInccReal' },
  { chave: 'tendencia', rotulo: 'Tendência de Fechamento',   icone: 'flag',        pct: 'tendenciaFechamentoPct',   real: 'tendenciaFechamentoReal',   cor: 'corTendencia' },
];
export const indicadoresFF = (kpis) => (kpis
  ? INDICADORES_FF.map(i => ({ chave: i.chave, rotulo: i.rotulo, icone: i.icone, pct: kpis[i.pct], real: kpis[i.real], cor: kpis[i.cor] }))
  : []);

// Cor CSS de um sinal semântico ('success' | 'warning' | 'danger' | 'neutral').
export const corCss = (sem) => (sem === 'neutral' || !sem ? 'var(--text-muted)' : `var(--${sem})`);
