import React from 'react';
import { Icon } from '../../components/Icons';
import { AppData } from '../../utils/data';
import { supabase } from '../../services/supabase';
import { logger } from '../../services/logger';
import { notificacoesService } from '../../services/notificacoes.service';
import { orcamentosService } from '../financeiro/orcamentos.service';
import { vinculoService, itemValor } from '../financeiro/vinculoService';
import { migrateEtapas, offsetToISO, computeValorVinculadoMap, computeCustoOrcadoMap } from '../cronograma/ganttUtils';
import { computeAvancoFisico, computeMonthlyDist } from '../cronograma/scheduleEngine';
import { tempoRelativo, mesCurto } from '../../utils/formatters';
import {
  orcamentoDaCarteira, avancoDaCarteira, curvaPrevista,
  indiceDoMes, distribuicaoPorStatus, pendenciasDaCarteira,
} from './carteiraPure';

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

// ----- Donut de distribuição -----
const Donut = React.memo(({ data, size = 170 }) => {
  const total = data.reduce((a, b) => a + b.value, 0);
  const r = size / 2 - 8;
  const r2 = r - 22;
  const cx = size / 2, cy = size / 2;
  if (!total) return <div style={{ width: size, height: size, display: 'grid', placeItems: 'center', color: 'var(--text-faint)', fontSize: 12 }}>sem obras</div>;
  let ang = -Math.PI / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {data.map((d, i) => {
        const frac = d.value / total;
        const ini = ang, fim = ang + frac * Math.PI * 2;
        ang = fim;
        // Fatia única (100%): o arco degenera porque início e fim coincidem — desenha o anel inteiro
        if (frac >= 0.9999) {
          return <circle key={i} cx={cx} cy={cy} r={(r + r2) / 2} fill="none" stroke={d.color} strokeWidth={r - r2} />;
        }
        const p = (raio, a) => [cx + raio * Math.cos(a), cy + raio * Math.sin(a)];
        const [x1, y1] = p(r, ini), [x2, y2] = p(r, fim);
        const [x3, y3] = p(r2, fim), [x4, y4] = p(r2, ini);
        const grande = fim - ini > Math.PI ? 1 : 0;
        return (
          <path key={i} fill={d.color}
            d={`M${x1},${y1} A${r},${r} 0 ${grande} 1 ${x2},${y2} L${x3},${y3} A${r2},${r2} 0 ${grande} 0 ${x4},${y4} Z`} />
        );
      })}
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize="24" fontWeight="700" fill="var(--text)">{total}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize="9" fill="var(--text-muted)" letterSpacing="1">OBRAS</text>
    </svg>
  );
});

// ----- Dashboard main -----
const Dashboard = ({ obras = [], onOpenObra }) => {
  const [carga, setCarga] = React.useState({ loading: true, erro: null });
  const [atualizadoEm, setAtualizadoEm] = React.useState(null);

  const obrasKey = obras.map(o => o.id).join(',');

  React.useEffect(() => {
    const ids = obras.map(o => o.id);
    if (!ids.length) { setCarga({ loading: false, erro: null, vazio: true }); return; }
    let cancelado = false;
    setCarga(c => ({ ...c, loading: true }));

    Promise.all([
      supabase.from('cronogramas').select('obra_id, etapas').in('obra_id', ids),
      vinculoService.listarPorObras(ids),
      orcamentosService.listar(ids),
      notificacoesService.listar(8),
    ]).then(([cronRes, vincRes, orcRes, notifRes]) => {
      if (cancelado) return;
      const erro = cronRes.error || vincRes.error || orcRes.error;
      if (erro) {
        logger.error('falha ao carregar o dashboard', { module: 'dashboard', err: erro });
        setCarga({ loading: false, erro });
        return;
      }

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
      const porObra = obras.map(o => {
        const etapas = migrateEtapas(cronPorObra[o.id] || []);
        const vincMap = computeValorVinculadoMap(etapas, vincPorObra[o.id] || [], itensMapPorObra[o.id] || {});
        const custoMap = computeCustoOrcadoMap(etapas, vincMap);
        const folhas = etapas.filter(e => !e.isGroup);
        const peso = folhas.reduce((s, e) => s + (custoMap[e.id] || 0), 0);
        const valorVinculado = folhas.reduce((s, e) => s + (vincMap[e.id] || 0), 0);
        if (etapas.length) dists.push(computeMonthlyDist(etapas, custoMap));
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
          fimCronograma: etapas.length
            ? offsetToISO(Math.max(...etapas.map(e => (e.inicio || 0) + (e.dur || 0))))
            : null,
        };
      });

      const curva = curvaPrevista(dists);
      setCarga({
        loading: false, erro: null,
        porObra,
        curva,
        hojeIdx: indiceDoMes(curva),
        orcamentoTotal,
        vinculadoTotal: porObra.reduce((s, o) => s + o.valorVinculado, 0),
        avanco: avancoDaCarteira(porObra),
        distribuicao: distribuicaoPorStatus(obras),
        pendencias: pendenciasDaCarteira(porObra),
        notificacoes: notifRes.error ? [] : (notifRes.data || []),
      });
      setAtualizadoEm(new Date());
    });

    return () => { cancelado = true; };
    // obrasKey em vez de `obras`: a identidade do array muda a cada render do App
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obrasKey]);

  const {
    loading, erro, vazio, porObra = [], curva = [], hojeIdx = -1,
    orcamentoTotal = 0, vinculadoTotal = 0, avanco = 0,
    distribuicao = [], pendencias = [], notificacoes = [],
  } = carga;

  const ativas = obras.filter(o => o.status === 'em_andamento').length;
  const comOrcamento = porObra.filter(o => o.orcamento > 0).length;
  const comCronograma = porObra.filter(o => o.temCronograma).length;
  const cobertura = orcamentoTotal > 0 ? (vinculadoTotal / orcamentoTotal) * 100 : 0;
  // Notificação real primeiro; pendência derivada da carteira completa a lista
  const alertas = [
    ...notificacoes.map(n => ({
      tipo: n.tipo || 'info', titulo: n.titulo, sub: n.subtitulo || '', tempo: tempoRelativo(n.created_at),
    })),
    ...pendencias.map(p => ({ ...p, tempo: '' })),
  ].slice(0, 8);

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
          <div className="kpi-grid">
            <KPI label="Obras ativas" value={ativas} unit={ativas === 1 ? 'em execução' : 'em execução'}
                 icon="building"
                 foot={`${obras.length} ${obras.length === 1 ? 'obra na carteira' : 'obras na carteira'}`} />
            <KPI label="Orçamento contratado" value={loading ? '—' : brl(orcamentoTotal, { compact: true })}
                 icon="briefcase"
                 foot={loading ? 'carregando…' : `${comOrcamento} de ${obras.length} ${obras.length === 1 ? 'obra com orçamento' : 'obras com orçamento'}`} />
            <KPI label="Avanço físico da carteira" value={loading ? '—' : avanco.toFixed(2)} unit={loading ? '' : '%'}
                 icon="trending-up"
                 foot={loading ? 'carregando…' : `ponderado pelo orçamento · ${comCronograma} com cronograma`} />
            <KPI label="Orçamento vinculado" value={loading ? '—' : cobertura.toFixed(1)} unit={loading ? '' : '%'}
                 icon="wallet"
                 foot={loading ? 'carregando…' : `${brl(vinculadoTotal, { compact: true })} amarrados ao cronograma`} />
          </div>

          {/* Curva + distribuição */}
          <div className="grid-cols-3-2" style={{ marginBottom: 'var(--gap)' }}>
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Físico previsto acumulado</div>
                  <div className="card-subtitle">
                    Distribuição mensal do orçamento vinculado ao cronograma — carteira consolidada
                  </div>
                </div>
                <div className="card-actions">
                  <div className="legend">
                    <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--brand)' }}></span>Previsto</span>
                  </div>
                </div>
              </div>
              <div className="card-body">
                {loading
                  ? <div style={{ height: 200, display: 'grid', placeItems: 'center', color: 'var(--text-faint)', fontSize: 13 }}>Carregando…</div>
                  : <CurvaPrevista curva={curva} hojeIdx={hojeIdx} />}
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Distribuição da carteira</div>
                  <div className="card-subtitle">Por situação</div>
                </div>
              </div>
              <div className="card-body">
                <div className="donut-wrap">
                  <Donut data={distribuicao} size={170} />
                  <div className="donut-legend">
                    {distribuicao.map((d) => (
                      <div className="row" key={d.status} style={{ justifyContent: 'space-between' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <span className="sw" style={{ background: d.color }}></span>
                          <span style={{ color: 'var(--text-soft)' }}>{d.label}</span>
                        </span>
                        <span className="mono num" style={{ color: 'var(--text)', fontWeight: 600 }}>{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Obras + alertas */}
          <div className="grid-cols-3-2">
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Obras da carteira</div>
                  <div className="card-subtitle">Clique em uma obra para abrir o detalhamento</div>
                </div>
              </div>
              <div className="card-body flush" style={{ overflow: 'auto' }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Obra</th>
                      <th>Avanço físico</th>
                      <th className="right">Orçamento</th>
                      <th className="right">Vinculado</th>
                      <th className="right">Tarefas</th>
                      <th>Fim do cronograma</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && (
                      <tr><td colSpan={6} style={{ color: 'var(--text-faint)', fontSize: 13 }}>Carregando…</td></tr>
                    )}
                    {!loading && porObra.map((o) => {
                      const obraOriginal = obras.find(x => x.id === o.id);
                      return (
                        <tr key={o.id} onClick={() => obraOriginal && onOpenObra(obraOriginal)}
                            role="button" tabIndex={0}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); obraOriginal && onOpenObra(obraOriginal); } }}>
                          <td>
                            <div className="strong" style={{ marginBottom: 2 }}>{o.nome}</div>
                            <div className="text-xs text-muted mono">{o.sigla}</div>
                          </td>
                          <td style={{ minWidth: 160 }}>
                            <div className="progress-row">
                              <div className={'progress' + (o.avanco >= 100 ? ' success' : '')}>
                                <span style={{ width: Math.min(100, o.avanco) + '%' }}></span>
                              </div>
                              <span className="pct">{o.avanco.toFixed(1)}%</span>
                            </div>
                          </td>
                          <td className="right strong num">{o.orcamento ? brl(o.orcamento, { compact: true }) : '—'}</td>
                          <td className="right num">{o.valorVinculado ? brl(o.valorVinculado, { compact: true }) : '—'}</td>
                          <td className="right num mono text-sm">{o.tarefas || '—'}</td>
                          <td className="mono text-sm text-soft">
                            {o.fimCronograma ? o.fimCronograma.split('-').reverse().join('/') : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Alertas e pendências</div>
                  <div className="card-subtitle">
                    {loading ? 'carregando…'
                      : alertas.length === 0 ? 'nada pendente'
                      : `${alertas.length} ${alertas.length === 1 ? 'item requer' : 'itens requerem'} atenção`}
                  </div>
                </div>
              </div>
              <div className="card-body flush">
                {!loading && alertas.length === 0 && (
                  <div style={{ padding: '14px 16px', color: 'var(--text-faint)', fontSize: 13 }}>
                    Nenhuma notificação e nenhuma lacuna de cadastro na carteira.
                  </div>
                )}
                {alertas.map((a, i) => (
                  <div className={'alert-item ' + a.tipo} key={i}>
                    <div className={'alert-pill ' + a.tipo}></div>
                    <div className="alert-icon">
                      <Icon name={a.tipo === 'danger' ? 'alert-triangle' : a.tipo === 'warning' ? 'alert' : 'flag'} size={15} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="alert-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.titulo}</div>
                      <div className="alert-sub">{a.sub}</div>
                    </div>
                    <div className="alert-time">{a.tempo}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export { Dashboard };
