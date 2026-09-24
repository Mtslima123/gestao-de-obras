import React from 'react';
import { Icon } from '../../components/Icons';
import { AppData } from '../../utils/data';
import { supabase } from '../../services/supabase';
import { logger } from '../../services/logger';
import { orcamentosService } from '../financeiro/orcamentos.service';
import { vinculoService, itemValor } from '../financeiro/vinculoService';
import { migrateEtapas, offsetToISO, computeValorVinculadoMap, computeCustoOrcadoMap } from '../cronograma/ganttUtils';
import { computeAvancoFisico } from '../cronograma/scheduleEngine';
import { mesCurto, formatBRL, formatNum } from '../../utils/formatters';
import { orcamentoDaCarteira } from './carteiraPure';
import { CurvaSObra } from './CurvaSObra';
import { fisicoFinanceiroService } from '../fisicoFinanceiro/fisicoFinanceiro.service';
import {
  getLinhaTotal, computeKPIs, corPorSinal,
} from '../fisicoFinanceiro/fisicoFinanceiroPure';

const corCss = (sem) => (sem === 'neutral' ? 'var(--text-muted)' : `var(--${sem})`);
// Mesmas cores de banda de FisicoFinanceiroDetail.jsx — cabeçalho em 2 linhas
// (grupo + coluna) formando um bloco contínuo de cor por grupo.
const BANDA_CLARA  = { background: '#c3d3ea', color: 'var(--brand)' };
const BANDA_ESCURA = { background: 'var(--brand)', color: '#ffffff' };

// ─── Dashboard Executivo ──────────────────────────────────────────────────────
// Todo número desta tela sai do banco. O que não tem lastro foi removido em vez de
// exibido com valor inventado: faturamento, margem operacional e agenda não existem
// como tabela, e avanço financeiro acumulado não é calculado em nenhum lugar do
// sistema (ver 20260830000001_obras_delta_e_tendencia.sql). Antes, este arquivo
// mostrava tudo isso a partir de série mock de utils/data.js.
const { brl } = AppData;

// ----- KPI card -----
// Sem trend/sparkline: não existe base de comparação histórica no banco, e a série
// que ficava aqui era inventada. O rodapé descreve a composição do próprio número.
const KPI = React.memo(({ label, value, unit, icon, foot }) => (
  <div className="kpi">
    <div className="kpi-label">
      <div className="kpi-icon"><Icon name={icon} size={16} /></div>
      {label}
    </div>
    <div className="kpi-value">
      <span className="num">{value}</span>
      {unit && <span className="unit">{unit}</span>}
    </div>
    {foot && <div className="kpi-foot"><span className="kpi-foot-text">{foot}</span></div>}
  </div>
));

// ----- Dashboard main -----
const Dashboard = ({ obras = [] }) => {
  const [carga, setCarga] = React.useState({ loading: true, erro: null });
  const [obraFiltro, setObraFiltro] = React.useState(null);

  // Obra concluída some do Dashboard inteiro — KPIs, tabelas e as seções de Físico
  // Financeiro abaixo. Só existem 2 status no sistema (em_andamento/concluida), então
  // "ativa" aqui é só "não concluída".
  const obrasAtivas = obras.filter(o => o.status !== 'concluida');

  const obrasKey = obrasAtivas.map(o => o.id).join(',');

  React.useEffect(() => {
    const ids = obrasAtivas.map(o => o.id);
    if (!ids.length) { setCarga({ loading: false, erro: null, vazio: true }); return; }
    let cancelado = false;
    setCarga(c => ({ ...c, loading: true }));

    Promise.all([
      supabase.from('cronogramas').select('obra_id, etapas, baselines, reprogramacoes').in('obra_id', ids),
      vinculoService.listarPorObras(ids),
      orcamentosService.listar(ids),
      fisicoFinanceiroService.buscarUltimosPorObras(ids),
    ]).then(([cronRes, vincRes, orcRes, ffRes]) => {
      if (cancelado) return;
      const erro = cronRes.error || vincRes.error || orcRes.error;
      if (erro) {
        logger.error('falha ao carregar o dashboard', { module: 'dashboard', err: erro });
        setCarga({ loading: false, erro });
        return;
      }

      // Último fechamento importado de cada obra (não um mês fixo) — mesmo critério da
      // tela de Físico Financeiro, que abre sempre no mês mais recente.
      const fechamentosPorObra = {}, mesFechamentoPorObra = {};
      (ffRes.data || []).forEach(r => {
        fechamentosPorObra[r.obra_id] = r.itens || [];
        mesFechamentoPorObra[r.obra_id] = r.mes_referencia;
      });

      // Vínculos e valores dos itens, agrupados por obra — mesmo preparo da ObrasList
      const vincPorObra = {}, itensMapPorObra = {};
      (vincRes.data || []).forEach(v => {
        (vincPorObra[v.obra_id] = vincPorObra[v.obra_id] || []).push(v);
        if (v.orcamento_itens) {
          const m = itensMapPorObra[v.obra_id] = itensMapPorObra[v.obra_id] || {};
          m[v.orcamento_item_id] = itemValor(v.orcamento_itens);
        }
      });

      const { total: orcamentoTotal, porObra: orcPorObra } = orcamentoDaCarteira(orcRes.data);
      const cronPorObra = {};
      (cronRes.data || []).forEach(r => { cronPorObra[r.obra_id] = r; });

      // Insumos da Curva S por obra (o cálculo das séries fica em CurvaSObra, só pra
      // obra selecionada).
      const curvaPorObra = {};
      const porObra = obrasAtivas.map(o => {
        const cron = cronPorObra[o.id];
        const etapas = migrateEtapas(cron?.etapas || []);
        const vincMap = computeValorVinculadoMap(etapas, vincPorObra[o.id] || [], itensMapPorObra[o.id] || {});
        const custoMap = computeCustoOrcadoMap(etapas, vincMap);
        const folhas = etapas.filter(e => !e.isGroup);
        const peso = folhas.reduce((s, e) => s + (custoMap[e.id] || 0), 0);
        const valorVinculado = folhas.reduce((s, e) => s + (vincMap[e.id] || 0), 0);
        curvaPorObra[o.id] = {
          etapas, valorVinculadoMap: vincMap, custoOrcadoMap: custoMap,
          baselines: cron?.baselines || [], reprogramacoes: cron?.reprogramacoes || [],
        };
        return {
          id: o.id,
          nome: o.nome,
          sigla: o.sigla || o.id,
          status: o.status,
          previsto: o.previsto,
          temCronograma: etapas.length > 0,
          tarefas: folhas.length,
          avanco: etapas.length ? computeAvancoFisico(etapas, custoMap) : 0,
          peso,
          valorVinculado,
          orcamento: orcPorObra[o.id] || 0,
          area: Number(o.area) || 0,
          // -1: (inicio+dur) é o offset EXCLUSIVO (dia seguinte ao término). Mantido em
          // dias corridos (sem workEnd/taskEnd) de propósito: esta tela agrega várias
          // obras de uma vez e WORK_CAL é um estado de módulo único — usar o calendário
          // de feriados aqui misturaria a config de uma obra com a de outra.
          fimCronograma: etapas.length
            ? offsetToISO(Math.max(...etapas.map(e => (e.inicio || 0) + (e.dur || 0))) - 1)
            : null,
        };
      });

      setCarga({
        loading: false, erro: null,
        porObra,
        curvaPorObra,
        orcamentoTotal,
        fechamentosPorObra,
        mesFechamentoPorObra,
      });
    });

    return () => { cancelado = true; };
    // obrasKey em vez de `obras`: a identidade do array muda a cada render do App
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obrasKey]);

  const {
    loading, erro, vazio, porObra = [], curvaPorObra = {},
    orcamentoTotal = 0, fechamentosPorObra = {}, mesFechamentoPorObra = {},
  } = carga;

  const ativas = obrasAtivas.length;
  const areaTotal = porObra.reduce((s, o) => s + (o.area || 0), 0);

  // ── Físico Financeiro e Curva S: sempre de UMA obra (sem visão consolidada
  // da carteira). Sem escolha explícita (ou se a obra escolhida saiu da lista), cai na
  // primeira obra que já tem fechamento importado; sem nenhuma, na primeira da lista.
  const obraFiltroEfetivo = obrasAtivas.some(o => o.id === obraFiltro)
    ? obraFiltro
    : (obrasAtivas.find(o => fechamentosPorObra[o.id]) || obrasAtivas[0])?.id ?? '';
  const obraSelecionadaFF = obrasAtivas.find(o => o.id === obraFiltroEfetivo) || null;
  const kpisFF = computeKPIs(fechamentosPorObra[obraFiltroEfetivo] || []);
  const curvaObra = curvaPorObra[obraFiltroEfetivo];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard Executivo</h1>
        </div>
      </div>

      {erro && (
        <div className="card" style={{ marginBottom: 'var(--gap)' }}>
          <div className="card-body" style={{ color: 'var(--danger)', fontSize: 13 }}>
            Não foi possível carregar os dados da carteira: {erro.message}
          </div>
        </div>
      )}

      {vazio ? (
        <div className="card">
          <div className="card-body" style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Nenhuma obra liberada para o seu usuário. Peça ao administrador para vincular as obras ao seu perfil.
          </div>
        </div>
      ) : (
        <>
          {/* KPIs — todos derivados do banco */}
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
            <KPI label="Obras ativas" value={ativas} unit={ativas === 1 ? 'em execução' : 'em execução'}
                 icon="building" />
            <KPI label="Orçamento Total" value={loading ? '—' : brl(orcamentoTotal, { compact: true })}
                 icon="briefcase" />
            <KPI label="Área construída" value={loading ? '—' : formatNum(areaTotal)} unit={loading ? '' : 'm²'}
                 icon="maximize" />
          </div>

          {/* Físico Financeiro — último fechamento mensal importado da obra selecionada */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Físico Financeiro</h2>
            {obraSelecionadaFF && mesFechamentoPorObra[obraFiltroEfetivo] && (
              <span className="text-xs text-muted">Fechamento de {mesCurto(mesFechamentoPorObra[obraFiltroEfetivo])}</span>
            )}
            <div style={{ marginLeft: 'auto' }}>
              <select className="input" value={obraFiltroEfetivo} onChange={(e) => setObraFiltro(e.target.value)}>
                {obrasAtivas.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
              </select>
            </div>
          </div>
          <div className="kpi-grid">
            {!kpisFF ? (
              <div className="card" style={{ gridColumn: '1 / -1' }}>
                <div className="card-body" style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                  {loading ? 'Carregando…' : obraSelecionadaFF
                    ? `${obraSelecionadaFF.nome} ainda não tem fechamento importado.`
                    : 'Nenhuma obra disponível.'}
                </div>
              </div>
            ) : (
              <>
                <div className="kpi">
                  <div className="kpi-label"><span className="kpi-icon"><Icon name="measure" size={16} /></span>Delta (%) Físico × Financeiro</div>
                  <div className="kpi-value" style={{ color: corCss(kpisFF.corDeltaFisicoFinanceiro) }}>
                    <span className="num">{formatNum(kpisFF.deltaFisicoFinanceiroPct)}</span><span className="unit">%</span>
                  </div>
                  <div className="kpi-foot"><span className="kpi-foot-text">{formatBRL(kpisFF.deltaFisicoFinanceiroReal)}</span></div>
                </div>
                <div className="kpi">
                  <div className="kpi-label"><span className="kpi-icon"><Icon name="briefcase" size={16} /></span>Saving</div>
                  <div className="kpi-value" style={{ color: corCss(kpisFF.corSavingReal) }}>
                    <span className="num">{formatNum(kpisFF.savingRealPct)}</span><span className="unit">%</span>
                  </div>
                  <div className="kpi-foot"><span className="kpi-foot-text">{formatBRL(kpisFF.savingReal)}</span></div>
                </div>
                <div className="kpi">
                  <div className="kpi-label"><span className="kpi-icon"><Icon name="trending-up" size={16} /></span>Ganhos em INCC</div>
                  <div className="kpi-value" style={{ color: corCss(kpisFF.corGanhosInccReal) }}>
                    <span className="num">{formatNum(kpisFF.ganhosInccRealPct)}</span><span className="unit">%</span>
                  </div>
                  <div className="kpi-foot"><span className="kpi-foot-text">{formatBRL(kpisFF.ganhosInccReal)}</span></div>
                </div>
                <div className="kpi">
                  <div className="kpi-label"><span className="kpi-icon"><Icon name="flag" size={16} /></span>Tendência de Fechamento</div>
                  <div className="kpi-value" style={{ color: corCss(kpisFF.corTendencia) }}>
                    <span className="num">{formatNum(kpisFF.tendenciaFechamentoPct)}</span><span className="unit">%</span>
                  </div>
                  <div className="kpi-foot"><span className="kpi-foot-text">{formatBRL(kpisFF.tendenciaFechamentoReal)}</span></div>
                </div>
              </>
            )}
          </div>

          {/* Curva S da obra selecionada — mesmo gráfico da aba Curva Física do Cronograma */}
          <div style={{ marginBottom: 'var(--gap)' }}>
            {loading ? (
              <div className="card">
                <div className="card-body" style={{ height: 200, display: 'grid', placeItems: 'center', color: 'var(--text-faint)', fontSize: 13 }}>Carregando…</div>
              </div>
            ) : (
              <CurvaSObra key={obraFiltroEfetivo} obraId={obraFiltroEfetivo} {...(curvaObra || {})} />
            )}
          </div>

          {/* Avanço Físico × Financeiro — cronograma ao lado do último fechamento importado */}
          <div style={{ marginBottom: 'var(--gap)' }}>
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Avanço Físico × Financeiro</div>
                </div>
              </div>
              <div className="card-body flush" style={{ overflow: 'auto' }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th colSpan={2} style={{ ...BANDA_CLARA, textAlign: 'center' }}>Cronograma</th>
                      <th colSpan={4} style={{ ...BANDA_ESCURA, textAlign: 'center', borderLeft: '2px solid var(--brand)' }}>Físico Financeiro</th>
                    </tr>
                    <tr>
                      <th className="center" style={BANDA_CLARA}>Obra</th>
                      <th className="center" style={BANDA_CLARA}>Avanço físico</th>
                      <th className="center" style={{ ...BANDA_ESCURA, borderLeft: '2px solid var(--brand)' }}>Exec. físico</th>
                      <th className="center" style={BANDA_ESCURA}>Gasto</th>
                      <th className="center" style={BANDA_ESCURA}>Delta</th>
                      <th className="center" style={BANDA_ESCURA}>Mês</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && (
                      <tr><td colSpan={6} style={{ color: 'var(--text-faint)', fontSize: 13 }}>Carregando…</td></tr>
                    )}
                    {!loading && porObra.map((o) => {
                      const totalObra = fechamentosPorObra[o.id] ? getLinhaTotal(fechamentosPorObra[o.id]) : null;
                      const delta = totalObra ? (totalObra.executadoFisico || 0) - (totalObra.gastoPct || 0) : null;
                      return (
                        <tr key={o.id}>
                          <td>
                            <div className="strong" style={{ marginBottom: 2 }}>{o.nome}</div>
                            <div className="text-xs text-muted mono">{o.sigla}</div>
                          </td>
                          <td style={{ minWidth: 150 }}>
                            <div className="progress-row">
                              <div className={'progress' + (o.avanco >= 100 ? ' success' : '')}>
                                <span style={{ width: Math.min(100, o.avanco) + '%' }}></span>
                              </div>
                              <span className="pct">{formatNum(o.avanco)}%</span>
                            </div>
                          </td>
                          <td className="right num">
                            {totalObra ? `${formatNum(totalObra.executadoFisico)}%` : <span style={{ color: 'var(--text-faint)' }}>—</span>}
                          </td>
                          <td className="right num">
                            {totalObra ? `${formatNum(totalObra.gastoPct)}%` : <span style={{ color: 'var(--text-faint)' }}>—</span>}
                          </td>
                          <td className="right num" style={delta == null ? undefined : { color: corCss(corPorSinal(delta)), fontWeight: 600 }}>
                            {delta == null ? <span style={{ color: 'var(--text-faint)' }}>—</span> : `${delta >= 0 ? '+' : ''}${formatNum(delta)}%`}
                          </td>
                          <td className="center">
                            {totalObra
                              ? <span className="badge info">{mesCurto(mesFechamentoPorObra[o.id])}</span>
                              : <span className="badge neutral">Sem fechamento</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export { Dashboard };
