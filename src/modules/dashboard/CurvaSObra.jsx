import React from 'react';
import { SCurveChart } from '../cronograma/SCurveChart';
import { SCurveChart2 } from '../cronograma/SCurveChart2';
import { getMonthRange, computeMonthlyDist } from '../cronograma/scheduleEngine';
import {
  agregarDist, distDeRetrato, computeCurvaSeries, defaultRepId, defaultBlId,
  carregarBlVisivel, carregarRepVisivel, carregarMesRef, mesAtualKey,
} from '../cronograma/curvaFisica';

// Curva S de UMA obra no Dashboard Executivo — mesmo gráfico e mesmas séries da aba
// Curva Física do Cronograma (fórmula em cronograma/curvaFisica.js). Linha de Base,
// Reprogramação e mês de referência seguem a mesma seleção que o usuário deixou salva
// no Cronograma daquela obra (ou o padrão, se nunca escolheu).
export const CurvaSObra = ({ obraId, etapas = [], valorVinculadoMap = {}, custoOrcadoMap = {}, baselines = [], reprogramacoes = [] }) => {
  const [curvaSel, setCurvaSel] = React.useState('c1');
  const [showSerie, setShowSerie] = React.useState({ bl: true, rep: true, real: true });
  const [showBarras, setShowBarras] = React.useState(true);
  const [showLinhas, setShowLinhas] = React.useState(true);

  const dados = React.useMemo(() => {
    const months = getMonthRange(etapas);
    const planned = agregarDist(computeMonthlyDist(etapas, custoOrcadoMap));
    const selMonKey = carregarMesRef(obraId) || mesAtualKey();
    const blId = carregarBlVisivel(obraId) ?? defaultBlId(baselines);
    const repId = carregarRepVisivel(obraId) ?? defaultRepId(reprogramacoes, selMonKey);
    const activeBL = baselines.find(b => b.id === blId) || null;
    const activeRep = reprogramacoes.find(r => r.id === repId) || null;
    const baselineDist = distDeRetrato(activeBL?.etapas || null, valorVinculadoMap);
    const repDist = distDeRetrato(activeRep?.etapas || null, valorVinculadoMap);
    const series = computeCurvaSeries({ months, planned, baselineDist, repDist });
    const idxSel = months.findIndex(m => m.key === selMonKey);
    return {
      months, series, hasBL: !!baselineDist, hasRep: !!repDist,
      hasData: months.length > 0 && Object.values(planned).some(v => v > 0),
      todayIdx: months.findIndex(m => m.key === mesAtualKey()),
      selIdx: idxSel >= 0 ? idxSel : months.length - 1,
    };
  }, [obraId, etapas, valorVinculadoMap, custoOrcadoMap, baselines, reprogramacoes]);

  const { months, series, hasBL, hasRep, hasData, todayIdx, selIdx } = dados;
  const toggleSerie = (k) => setShowSerie(s => ({ ...s, [k]: !s[k] }));

  const legItem = (k, cor, tracejado, label, enabled = true) => (
    <label key={k} title={enabled ? 'Marque/desmarque para mostrar/ocultar' : 'Sem dados para comparar'}
      style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, whiteSpace: 'nowrap',
        cursor: enabled ? 'pointer' : 'default',
        color: enabled ? 'var(--text-soft)' : 'var(--text-faint)',
        opacity: enabled ? 1 : 0.5 }}>
      <input type="checkbox" checked={enabled && showSerie[k]} disabled={!enabled}
        onChange={() => toggleSerie(k)} style={{ accentColor: 'var(--brand)', cursor: enabled ? 'pointer' : 'default' }} />
      <span style={{ width: 18, height: tracejado ? 2 : 3, background: tracejado ? 'none' : cor,
        borderTop: tracejado ? `2px dashed ${cor}` : undefined, display: 'inline-block', borderRadius: 2 }} />
      {label}
    </label>
  );

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select value={curvaSel} onChange={e => setCurvaSel(e.target.value)} title="Escolher qual curva exibir"
              style={{ height: 26, fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', padding: '0 6px', cursor: 'pointer' }}>
              <option value="c1">Curva 1</option>
              <option value="c2">Curva 2</option>
            </select>
            <div className="card-title">Curva S — Produção física acumulada</div>
          </div>
        </div>
        {hasData && (
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'center', flex: 1, flexWrap: 'wrap', fontSize: 12 }}>
            {legItem('real', '#16a34a', false, 'Real')}
            {legItem('rep', 'var(--brand)', false, 'Reprogramado', hasRep)}
            {legItem('bl', '#94a3b8', true, 'Linha de Base', hasBL)}
            <label title="Mostrar/ocultar as barras de % de cada mês"
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer', color: 'var(--text-soft)' }}>
              <input type="checkbox" checked={showBarras} onChange={() => setShowBarras(v => !v)} style={{ accentColor: 'var(--brand)', cursor: 'pointer' }} />
              <span style={{ width: 14, height: 12, background: '#cbd5e1', display: 'inline-block', borderRadius: 2 }} />
              Barras
            </label>
            <label title="Mostrar/ocultar as linhas acumuladas"
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer', color: 'var(--text-soft)' }}>
              <input type="checkbox" checked={showLinhas} onChange={() => setShowLinhas(v => !v)} style={{ accentColor: 'var(--brand)', cursor: 'pointer' }} />
              <span style={{ width: 18, height: 3, background: 'var(--text-soft)', display: 'inline-block', borderRadius: 2 }} />
              Linhas
            </label>
          </div>
        )}
      </div>
      <div className="card-body" style={{ padding: '12px 16px 0', overflowX: 'auto' }}>
        {!hasData ? (
          <div style={{ height: 200, display: 'grid', placeItems: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
            Adicione tarefas com datas e custos no cronograma desta obra para gerar a Curva S.
          </div>
        ) : curvaSel === 'c1' ? (
          <SCurveChart
            months={months}
            reprogramado={hasRep ? series.repA : []}
            real={series.rrA}
            baseline={hasBL ? series.blA : null}
            monthlyPct={series.repM}
            previstoM={series.blM}
            replanM={hasRep ? series.repM : []}
            execM={series.rrM}
            showBarras={showBarras}
            showLines={showLinhas}
            todayIdx={todayIdx}
            show={showSerie}
          />
        ) : (
          <SCurveChart2
            months={months}
            selIdx={selIdx}
            previstoM={series.blM}
            execM={series.rrM}
            replanM={series.rrM}
            baselineA={hasBL ? series.blA : null}
            execA={series.rrA}
            replanA={series.rrA}
            show={showSerie}
            showBarras={showBarras}
            showLines={showLinhas}
          />
        )}
      </div>
    </div>
  );
};
