import React from 'react';
import { Icon } from '../../../../components/Icons';
import { SCurveChart } from '../../../cronograma/SCurveChart';
import { SCurveChart2 } from '../../../cronograma/SCurveChart2';
import { computeCustoOrcadoMap } from '../../../cronograma/ganttUtils';
import { fmtBRL } from '../../../cronograma/scheduleEngine';
import { defaultRepId } from '../../../cronograma/curvaFisica';
import { larguraDoRotulo } from './linhaDoTempoPure';
import {
  montarCurva, propsDosGraficos, linhasDoResumo, producaoDoMes, resumoDaComparacao, tomDoValor, mesVizinho, linhasDaDistribuicao,
  rodapeDaDistribuicao, fundoDaDistribuicao, textoPct, textoDif, textoPctDoMes, larguraDaColuna, alturaDaMatriz,
} from './usoCurvaPure';
import { MatrizMobile } from './MatrizMobile';
import { FolhaMeses } from './FolhaMeses';

const OPCOES_INICIAIS = { bl: true, rep: true, real: true, barras: true, linhas: true };
const L_MES = 64;

// Curva Física na casca mobile: comparar com linha de base e reprogramação, a Curva S (os mesmos gráficos do desktop,
// numa área que rola na horizontal), a produção do mês de referência, o Resumo Mensal e a Distribuição por tarefa.
// Os números vêm das mesmas funções do desktop e do Dashboard (montarCurva); aqui só muda a apresentação. Tela só de
// leitura. Exportar (Excel e PDF) continua no desktop.
const CurvaFisicaMobile = ({
  etapas, months, monthlyDist, valorVinculadoMap = {}, baselines = [], blVisivelId, onSelectBaseline,
  reprogramacoes = [], repVisivelId, onSelectReprogramacao, selMonKey, setSelMonKey,
}) => {
  const [curvaSel, setCurvaSel] = React.useState('c1');
  const [opcoes, setOpcoes] = React.useState({ c1: { ...OPCOES_INICIAIS }, c2: { ...OPCOES_INICIAIS } });
  const [abertaId, setAbertaId] = React.useState(null);
  const [comparando, setComparando] = React.useState(false);
  const repTocada = React.useRef(false);
  const graficoRef = React.useRef(null);
  const [larguraTela, setLarguraTela] = React.useState(() => (typeof window !== 'undefined' ? window.innerWidth : 375));
  React.useEffect(() => {
    const ao = () => setLarguraTela(window.innerWidth);
    window.addEventListener('resize', ao);
    return () => window.removeEventListener('resize', ao);
  }, []);

  const c = React.useMemo(
    () => montarCurva({ months, monthlyDist, valorVinculadoMap, baselines, blVisivelId, reprogramacoes, repVisivelId, selMonKey }),
    [months, monthlyDist, valorVinculadoMap, baselines, blVisivelId, reprogramacoes, repVisivelId, selMonKey],
  );
  const custoOrcadoMap = React.useMemo(() => computeCustoOrcadoMap(etapas, valorVinculadoMap), [etapas, valorVinculadoMap]);

  // Como no desktop: sem reprogramação escolhida (e sem o usuário ter mexido no seletor), usa a mais recente salva antes
  // do mês de referência.
  React.useEffect(() => {
    if (!reprogramacoes.length) return;
    if (repVisivelId || repTocada.current) return;
    const alvo = defaultRepId(reprogramacoes, selMonKey);
    if (alvo !== repVisivelId) onSelectReprogramacao?.(alvo);
  }, [selMonKey, reprogramacoes, repVisivelId]); // eslint-disable-line react-hooks/exhaustive-deps

  // O gráfico abre no mês de hoje (ou no de referência, se hoje está fora da obra). O SVG ajusta a largura um instante
  // depois de montar, por isso a rolagem espera um pouco.
  React.useEffect(() => {
    const el = graficoRef.current;
    if (!el || !c.temDados) return undefined;
    const N = c.months.length || 1;
    const idx = c.todayIdx >= 0 ? c.todayIdx : c.selIdx;
    const t = setTimeout(() => { el.scrollLeft = Math.max(0, Math.round((idx + 0.5) / N * el.scrollWidth - el.clientWidth / 2)); }, 150);
    return () => clearTimeout(t);
  }, [curvaSel, c.months.length, c.temDados]); // eslint-disable-line react-hooks/exhaustive-deps

  const op = opcoes[curvaSel];
  const alternarOpcao = (k) => setOpcoes(o => ({ ...o, [curvaSel]: { ...o[curvaSel], [k]: !o[curvaSel][k] } }));
  const larguraRotulo = larguraDoRotulo(larguraTela - 24);

  // ---- Resumo Mensal ----
  const linhasResumo = React.useMemo(() => linhasDoResumo(c), [c]);
  const colunasMeses = React.useMemo(() => months.map(m => ({ id: m.key, rotulo: m.label, w: L_MES })), [months]);
  const resumoMatriz = linhasResumo.map(l => {
    const celulas = {};
    months.forEach((m, i) => {
      const v = l.valores[i];
      celulas[m.key] = { texto: l.formato === 'dif' ? textoDif(v) : textoPct(v), tom: tomDoValor(l.tom, v), forte: !!l.acumulado };
    });
    return { id: l.id, rotulo: l.rotulo, faixa: l.faixa, fundo: l.acumulado ? 'var(--surface-muted)' : null, celulas };
  });

  // ---- Distribuição por tarefa ----
  const linhasDist = React.useMemo(
    () => linhasDaDistribuicao({ etapas, months, monthlyDist, custoOrcadoMap, total: c.total, selIdx: c.selIdx }),
    [etapas, months, monthlyDist, custoOrcadoMap, c.total, c.selIdx],
  );
  const rodapeDist = React.useMemo(
    () => rodapeDaDistribuicao({ months, planned: c.planned, total: c.total, selIdx: c.selIdx }),
    [months, c.planned, c.total, c.selIdx],
  );
  const larguraValor = larguraDaColuna([c.total > 0 ? fmtBRL(c.total) : 'R$ 0,00', 'Valor (R$)']);
  const colunasDist = React.useMemo(() => [
    { id: 'valor', rotulo: 'Valor (R$)', w: larguraValor },
    { id: 'peso', rotulo: 'Peso %', w: 66 },
    { id: 'conc', rotulo: 'Conc. %', w: 70 },
    ...months.map(m => ({ id: m.key, rotulo: m.label, w: L_MES })),
    { id: 'total', rotulo: 'Total', w: 62 },
  ], [months, larguraValor]);
  const tomDaConc = (v) => (Math.round(v) >= 100 ? 'positivo' : v > 0.005 ? 'marca' : 'apagado');
  const distMatriz = linhasDist.map(l => {
    const celulas = {
      valor: { texto: l.custo > 0 ? fmtBRL(l.custo) : '—', forte: l.e.isGroup },
      peso: { texto: l.peso != null ? textoPct(l.peso, { zeroVazio: false }) : '—', forte: l.e.isGroup },
      conc: { texto: l.conc > 0.005 ? textoPct(l.conc) : '—', tom: tomDaConc(l.conc), forte: true },
      total: { texto: l.custo > 0 ? '100%' : '—', forte: true },
    };
    months.forEach((m, i) => { celulas[m.key] = { texto: textoPctDoMes(l.pctMeses[i]), calor: !l.e.isGroup && l.pctMeses[i] > 0.5, forte: l.e.isGroup }; });
    return { id: l.e.id, rotulo: l.e.etapa, nivel: l.nivel, grupo: l.e.isGroup, fundo: fundoDaDistribuicao(l.e), celulas };
  });
  const rodapeDistMatriz = React.useMemo(() => {
    const celulas = {
      valor: { texto: fmtBRL(rodapeDist.custo), forte: true },
      peso: { texto: '100%', forte: true },
      conc: { texto: rodapeDist.conc > 0.005 ? textoPct(rodapeDist.conc) : '—', tom: 'positivo', forte: true },
      total: { texto: '100%', forte: true },
    };
    months.forEach((m, i) => { celulas[m.key] = { texto: textoPct(rodapeDist.pctMeses[i]), tom: rodapeDist.pctMeses[i] > 0.005 ? 'marca' : 'apagado', forte: true }; });
    return [{ id: 'geral', rotulo: 'Total geral', fundo: 'var(--surface-muted)', celulas }];
  }, [months, rodapeDist]);

  if (!c.temDados) {
    return (
      <div className="card mfs-curva-vazia">
        <Icon name="trending-up" size={36} />
        <h3>Curva S — Produção física planejada</h3>
        <p>Adicione tarefas com datas e custos no cronograma para gerar a Curva S automaticamente.</p>
      </div>
    );
  }

  const graficos = propsDosGraficos(c, { show: { bl: op.bl, rep: op.rep, real: op.real }, showBarras: op.barras, showLinhas: op.linhas });
  const mesRef = months[c.selIdx];
  const anterior = mesVizinho(months, c.selIdx, -1);
  const seguinte = mesVizinho(months, c.selIdx, 1);
  const serie = (k, rotulo, habilitada, classe) => (
    <button
      key={k} type="button" className={'chip mfs-curva-serie ' + classe + (habilitada && op[k] ? ' active' : '')}
      aria-pressed={habilitada && op[k]} disabled={!habilitada} onClick={() => alternarOpcao(k)}
      title={habilitada ? undefined : 'Escolha uma opção em "Comparar com" para usar esta série'}
    >{rotulo}</button>
  );

  const aberta = abertaId ? linhasDist.find(l => l.e.id === abertaId) : null;

  return (
    <div className="mfs-curva">
      <section className="mfs-curva-card" aria-label="Comparar com">
        <button type="button" className="mfs-curva-comparar" aria-expanded={comparando} onClick={() => setComparando(v => !v)}>
          <span className="mfs-curva-comparar-textos">
            <strong>Comparar com</strong>
            <span>{resumoDaComparacao(c, mesRef?.label)}</span>
          </span>
          <Icon name={comparando ? 'chevron-up' : 'chevron-down'} size={18} />
        </button>
        {comparando && (
          <div className="mfs-curva-selects">
            <label>
              <span>Linha de base</span>
              <select className="input" value={blVisivelId || ''} onChange={(e) => onSelectBaseline?.(e.target.value || null)}>
                <option value="">Sem linha de base</option>
                {baselines.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
              </select>
            </label>
            <label>
              <span>Reprogramação</span>
              <select className="input" value={repVisivelId || ''} onChange={(e) => { repTocada.current = true; onSelectReprogramacao?.(e.target.value || null); }}>
                <option value="">Sem reprogramação</option>
                {reprogramacoes.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
              </select>
            </label>
            <label>
              <span>Mês de referência</span>
              <select className="input" value={mesRef?.key || ''} onChange={(e) => setSelMonKey(e.target.value)}>
                {months.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </label>
          </div>
        )}
      </section>

      <section className="mfs-curva-card" aria-label="Curva S">
        <div className="mfs-curva-cabeca">
          <h3 className="mfs-curva-titulo">Curva S · produção física acumulada</h3>
          <div className="mfs-segmentado" role="group" aria-label="Qual curva exibir">
            <button type="button" aria-pressed={curvaSel === 'c1'} onClick={() => setCurvaSel('c1')}>Curva 1</button>
            <button type="button" aria-pressed={curvaSel === 'c2'} onClick={() => setCurvaSel('c2')}>Curva 2</button>
          </div>
        </div>
        <div className="mfs-curva-series">
          {serie('real', 'Real', true, 'real')}
          {serie('rep', 'Reprogramado', c.temRep, 'rep')}
          {serie('bl', 'Linha de Base', c.temLB, 'bl')}
          {serie('barras', 'Barras', true, 'neutra')}
          {serie('linhas', 'Linhas', true, 'neutra')}
        </div>
        <div className="mfs-curva-grafico" ref={graficoRef}>
          {curvaSel === 'c1' ? <SCurveChart {...graficos.curva1} /> : <SCurveChart2 {...graficos.curva2} />}
        </div>
        <p className="mfs-nota">Deslize para o lado para ver todos os meses. Toque nos pontos e nas barras para ver os valores.</p>
      </section>

      <section className="mfs-curva-card" aria-label="Produção do mês">
        <div className="mfs-curva-mes">
          <button type="button" className="mfs-acao mfs-curva-passo" aria-label="Mês anterior" disabled={!anterior} onClick={() => anterior && setSelMonKey(anterior)}>
            <Icon name="chevron-left" size={18} />
          </button>
          <div className="mfs-curva-mes-nome">
            <span>Produção em</span>
            <strong>{mesRef?.label}</strong>
          </div>
          <button type="button" className="mfs-acao mfs-curva-passo" aria-label="Próximo mês" disabled={!seguinte} onClick={() => seguinte && setSelMonKey(seguinte)}>
            <Icon name="chevron-right" size={18} />
          </button>
        </div>
        <div className="mfs-curva-blocos">
          {producaoDoMes(c).map(g => (
            <div key={g.id} className={'mfs-curva-bloco faixa-' + g.faixa}>
              <div className="mfs-curva-bloco-titulo">{g.titulo}</div>
              {g.linhas.map(l => (
                <div key={l.rotulo} className="mfs-curva-bloco-linha">
                  <span>{l.rotulo}</span>
                  <b className={l.sinal ? (l.sinal > 0 ? 'mfs-tom-positivo' : 'mfs-tom-negativo') : undefined}>{l.valor}</b>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="mfs-curva-card" aria-label="Resumo mensal">
        <h3 className="mfs-curva-titulo">Resumo mensal</h3>
        <MatrizMobile
          nomeAcessivel="Resumo mensal da Curva Física" rotuloDoCanto="Série" larguraRotulo={larguraRotulo}
          colunas={colunasMeses} linhas={resumoMatriz} colunaAtiva={mesRef?.key}
          alturaLinha={36} altura={alturaDaMatriz({ linhas: resumoMatriz.length, alturaLinha: 36, maxima: 400 })}
        />
        <p className="mfs-nota">LB = Linha de Base · Rep. = Reprogramação · Real = Real + Reprogramado · Dif. = diferença do acumulado, em pontos percentuais.</p>
      </section>

      <section className="mfs-curva-card" aria-label="Distribuição por tarefa">
        <h3 className="mfs-curva-titulo">Distribuição por tarefa</h3>
        <p className="mfs-nota mfs-nota-topo">% do custo de cada tarefa alocado por mês. Toque numa linha para ver os meses dela.</p>
        <MatrizMobile
          nomeAcessivel="Distribuição por tarefa e por mês" rotuloDoCanto="Atividade" larguraRotulo={larguraRotulo}
          colunas={colunasDist} linhas={distMatriz} rodape={rodapeDistMatriz} colunaAtiva={mesRef?.key}
          alturaLinha={40} altura={alturaDaMatriz({ linhas: distMatriz.length, alturaLinha: 40, rodape: 1, maxima: 460 })}
          linhaAbertaId={abertaId} aoTocarLinha={(l) => setAbertaId(l.id)}
          vazio={'Nenhuma tarefa marcada. Ative a coluna "Curva" na Lista.'}
        />
      </section>

      {aberta && (
        <FolhaMeses
          titulo={aberta.e.isGroup ? 'Grupo' : 'Tarefa'}
          subtitulo={aberta.e.etapa}
          resumo={[
            { rotulo: 'Valor (R$)', valor: aberta.custo > 0 ? fmtBRL(aberta.custo) : '—' },
            { rotulo: 'Peso na obra', valor: aberta.peso != null ? textoPct(aberta.peso, { zeroVazio: false }) : '—' },
            { rotulo: `Conclusão até ${mesRef?.label}`, valor: aberta.conc > 0.005 ? textoPct(aberta.conc) : '—', tom: tomDaConc(aberta.conc) },
          ]}
          tituloMeses="% do custo por mês"
          meses={months
            .map((m, i) => ({ m, pct: aberta.pctMeses[i] }))
            .filter(x => x.pct > 0.5)
            .map(({ m, pct }) => ({ key: m.key, rotulo: m.label, principal: textoPct(pct, { zeroVazio: false }), secundario: fmtBRL(aberta.dist[m.key] || 0) }))}
          vazio="Esta linha não tem custo distribuído nos meses."
          onClose={() => setAbertaId(null)}
        />
      )}
    </div>
  );
};

export { CurvaFisicaMobile };
