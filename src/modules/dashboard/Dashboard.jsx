import React from 'react';
import { Icon } from '../../components/Icons';
import { AppData } from '../../utils/data';
import { supabase } from '../../services/supabase';
import { logger } from '../../services/logger';
import { orcamentosService } from '../financeiro/orcamentos.service';
import { vinculoService, itemValor } from '../financeiro/vinculoService';
import { migrateEtapas, offsetToISO, computeValorVinculadoMap, computeCustoOrcadoMap } from '../cronograma/ganttUtils';
import { computeAvancoFisico, computeMonthlyDist } from '../cronograma/scheduleEngine';
import { mesCurto, formatBRL, formatNum } from '../../utils/formatters';
import { orcamentoDaCarteira, curvaPrevista, indiceDoMes } from './carteiraPure';
import { fisicoFinanceiroService } from '../fisicoFinanceiro/fisicoFinanceiro.service';
import {
  getLinhaTotal, computeKPIs, computeKPIsFromTotal, somarTotaisCarteira, corPorSinal,
} from '../fisicoFinanceiro/fisicoFinanceiroPure';

const mesAtualISO = () => new Date().toISOString().slice(0, 7);
const corCss = (sem) => (sem === 'neutral' ? 'var(--text-muted)' : `var(--${sem})`);
// Mesmas cores de banda de FisicoFinanceiroDetail.jsx — cabeçalho em 2 linhas
// (grupo + coluna) formando um bloco contínuo de cor por grupo.
const BANDA_CLARA  = { background: '#c3d3ea', color: 'var(--brand)' };
const BANDA_ESCURA = { background: 'var(--brand)', color: '#ffffff' };
const badgeNovo = { background: 'var(--brand)', color: '#fff' };

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

// ----- Curva do previsto acumulado -----
// Uma série só. O previsto vem da distribuição mensal do orçamento vinculado ao
// cronograma; não há série de realizado financeiro para comparar.
const CurvaPrevista = React.memo(({ curva, hojeIdx }) => {
  const w = 720, h = 260;
  const pad = { l: 40, r: 16, t: 16, b: 30 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  if (curva.length < 2) {
    return (
      <div style={{ height: 200, display: 'grid', placeItems: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
        Cronograma insuficiente para montar a curva.
      </div>
    );
  }
  const x = (i) => pad.l + (i / (curva.length - 1)) * innerW;
  const y = (v) => pad.t + innerH - (v / 100) * innerH;
  const linha = curva.map((p, i) => (i === 0 ? 'M' : 'L') + x(i).toFixed(1) + ',' + y(p.pct).toFixed(1)).join(' ');
  const area = `${linha} L ${x(curva.length - 1).toFixed(1)},${pad.t + innerH} L ${pad.l},${pad.t + innerH} Z`;
  // Rótulos a cada N meses: com 24+ meses de cronograma todos juntos ficam ilegíveis
  const passo = Math.max(1, Math.ceil(curva.length / 8));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto' }}>
      <defs>
        <linearGradient id="curva-prev" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 25, 50, 75, 100].map(t => (
        <g key={t}>
          <line x1={pad.l} y1={y(t)} x2={w - pad.r} y2={y(t)} stroke="var(--border)" strokeDasharray="3 3" />
          <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="10" fill="var(--text-muted)">{t}%</text>
        </g>
      ))}
      {hojeIdx >= 0 && (
        <g>
          <line x1={x(hojeIdx)} y1={pad.t} x2={x(hojeIdx)} y2={pad.t + innerH} stroke="var(--danger)" strokeDasharray="4 3" strokeWidth="1.2" />
          <text x={x(hojeIdx) + 4} y={pad.t + 10} fontSize="9.5" fill="var(--danger)">hoje</text>
        </g>
      )}
      <path d={area} fill="url(#curva-prev)" />
      <path d={linha} stroke="var(--brand)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {curva.map((p, i) => (i % passo === 0 || i === curva.length - 1) && (
        <text key={p.mes} x={x(i)} y={h - 10} textAnchor="middle" fontSize="10" fill="var(--text-muted)">{mesCurto(p.mes)}</text>
      ))}
    </svg>
  );
});

// ----- Dashboard main -----
const Dashboard = ({ obras = [] }) => {
  const [carga, setCarga] = React.useState({ loading: true, erro: null });
  const [atualizadoEm, setAtualizadoEm] = React.useState(null);
  const [obraFiltro, setObraFiltro] = React.useState('carteira');

  // Obra concluída some do Dashboard inteiro — KPIs, tabelas e as seções de Físico
  // Financeiro abaixo. Só existem 2 status no sistema (em_andamento/concluida), então
  // "ativa" aqui é só "não concluída".
  const obrasAtivas = obras.filter(o => o.status !== 'concluida');
  const mesRefFF = mesAtualISO();

  const obrasKey = obrasAtivas.map(o => o.id).join(',');

  React.useEffect(() => {
    const ids = obrasAtivas.map(o => o.id);
    if (!ids.length) { setCarga({ loading: false, erro: null, vazio: true }); return; }
    let cancelado = false;
    setCarga(c => ({ ...c, loading: true }));

    Promise.all([
      supabase.from('cronogramas').select('obra_id, etapas').in('obra_id', ids),
      vinculoService.listarPorObras(ids),
      orcamentosService.listar(ids),
      fisicoFinanceiroService.buscarPorObras(ids, mesAtualISO()),
    ]).then(([cronRes, vincRes, orcRes, ffRes]) => {
      if (cancelado) return;
      const erro = cronRes.error || vincRes.error || orcRes.error;
      if (erro) {
        logger.error('falha ao carregar o dashboard', { module: 'dashboard', err: erro });
        setCarga({ loading: false, erro });
        return;
      }

      const fechamentosPorObra = {};
      (ffRes.data || []).forEach(r => { fechamentosPorObra[r.obra_id] = r.itens || []; });

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
      (cronRes.data || []).forEach(r => { cronPorObra[r.obra_id] = r.etapas; });

      const dists = [];
      const distsPorObra = {};
      const porObra = obrasAtivas.map(o => {
        const etapas = migrateEtapas(cronPorObra[o.id] || []);
        const vincMap = computeValorVinculadoMap(etapas, vincPorObra[o.id] || [], itensMapPorObra[o.id] || {});
        const custoMap = computeCustoOrcadoMap(etapas, vincMap);
        const folhas = etapas.filter(e => !e.isGroup);
        const peso = folhas.reduce((s, e) => s + (custoMap[e.id] || 0), 0);
        const valorVinculado = folhas.reduce((s, e) => s + (vincMap[e.id] || 0), 0);
        if (etapas.length) {
          const dist = computeMonthlyDist(etapas, custoMap);
          dists.push(dist);
          distsPorObra[o.id] = dist;
        }
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
          // -1: (inicio+dur) é o offset EXCLUSIVO (dia seguinte ao término). Mantido em
          // dias corridos (sem workEnd/taskEnd) de propósito: esta tela agrega várias
          // obras de uma vez e WORK_CAL é um estado de módulo único — usar o calendário
          // de feriados aqui misturaria a config de uma obra com a de outra.
          fimCronograma: etapas.length
            ? offsetToISO(Math.max(...etapas.map(e => (e.inicio || 0) + (e.dur || 0))) - 1)
            : null,
        };
      });

      const curva = curvaPrevista(dists);
      setCarga({
        loading: false, erro: null,
        porObra,
        curva,
        hojeIdx: indiceDoMes(curva),
        distsPorObra,
        orcamentoTotal,
        fechamentosPorObra,
      });
      setAtualizadoEm(new Date());
    });

    return () => { cancelado = true; };
    // obrasKey em vez de `obras`: a identidade do array muda a cada render do App
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obrasKey]);

  const {
    loading, erro, vazio, porObra = [], curva = [], hojeIdx = -1, distsPorObra = {},
    orcamentoTotal = 0, fechamentosPorObra = {},
  } = carga;

  const ativas = obrasAtivas.length;
  const comOrcamento = porObra.filter(o => o.orcamento > 0).length;

  // ── Físico Financeiro da carteira (ou de 1 obra, via obraFiltro) ──────────────
  const obraSelecionadaFF = obraFiltro !== 'carteira' ? obrasAtivas.find(o => o.id === obraFiltro) : null;
  const kpisFF = obraFiltro === 'carteira'
    ? computeKPIsFromTotal(somarTotaisCarteira(
        Object.values(fechamentosPorObra).map(itens => getLinhaTotal(itens)),
      ))
    : computeKPIs(fechamentosPorObra[obraFiltro] || []);
  const distsParaCurva = obraFiltro === 'carteira'
    ? Object.values(distsPorObra)
    : (distsPorObra[obraFiltro] ? [distsPorObra[obraFiltro]] : []);
  const curvaExibida = obraFiltro === 'carteira' ? curva : curvaPrevista(distsParaCurva);
  const hojeIdxExibido = obraFiltro === 'carteira' ? hojeIdx : indiceDoMes(curvaExibida);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard Executivo</h1>
          <div className="page-subtitle">
            Carteira de obras, orçamento e cronograma
            {atualizadoEm && ` · atualizado às ${atualizadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
          </div>
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
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
            <KPI label="Obras ativas" value={ativas} unit={ativas === 1 ? 'em execução' : 'em execução'}
                 icon="building"
                 foot={`${obrasAtivas.length} ${obrasAtivas.length === 1 ? 'obra na carteira' : 'obras na carteira'}`} />
            <KPI label="Orçamento contratado" value={loading ? '—' : brl(orcamentoTotal, { compact: true })}
                 icon="briefcase"
                 foot={loading ? 'carregando…' : `${comOrcamento} de ${obrasAtivas.length} ${obrasAtivas.length === 1 ? 'obra com orçamento' : 'obras com orçamento'}`} />
          </div>

          {/* Físico Financeiro — consolidado dos fechamentos mensais importados */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Físico Financeiro da carteira</h2>
            <span className="badge" style={badgeNovo}>Novo</span>
            <div style={{ marginLeft: 'auto' }}>
              <select className="input" value={obraFiltro} onChange={(e) => setObraFiltro(e.target.value)}>
                <option value="carteira">Toda a carteira</option>
                {obrasAtivas.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
              </select>
            </div>
          </div>
          <div className="kpi-grid">
            {!kpisFF ? (
              <div className="card" style={{ gridColumn: '1 / -1' }}>
                <div className="card-body" style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                  {loading ? 'Carregando…' : obraSelecionadaFF
                    ? `${obraSelecionadaFF.nome} ainda não tem fechamento de ${mesCurto(mesRefFF)} importado.`
                    : `Nenhuma obra da carteira tem fechamento de ${mesCurto(mesRefFF)} importado ainda.`}
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

          {/* Físico previsto acumulado */}
          <div style={{ marginBottom: 'var(--gap)' }}>
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Físico previsto acumulado</div>
                  <div className="card-subtitle">
                    Distribuição mensal do orçamento vinculado ao cronograma — carteira consolidada
                  </div>
                </div>
                <div className="card-actions">
                  <select className="input" value={obraFiltro} onChange={(e) => setObraFiltro(e.target.value)} style={{ marginRight: 10 }}>
                    <option value="carteira">Toda a carteira</option>
                    {obrasAtivas.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                  </select>
                  <div className="legend">
                    <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--brand)' }}></span>Previsto</span>
                  </div>
                </div>
              </div>
              <div className="card-body">
                {loading
                  ? <div style={{ height: 200, display: 'grid', placeItems: 'center', color: 'var(--text-faint)', fontSize: 13 }}>Carregando…</div>
                  : <CurvaPrevista curva={curvaExibida} hojeIdx={hojeIdxExibido} />}
              </div>
            </div>
          </div>

          {/* Avanço Físico × Financeiro — cronograma ao lado do último fechamento importado */}
          <div style={{ marginBottom: 'var(--gap)' }}>
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Avanço Físico × Financeiro por obra <span className="badge" style={{ ...badgeNovo, marginLeft: 8 }}>Novo</span></div>
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
                              <span className="pct">{o.avanco.toFixed(1)}%</span>
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
                              ? <span className="badge info">{mesCurto(mesRefFF)}</span>
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
