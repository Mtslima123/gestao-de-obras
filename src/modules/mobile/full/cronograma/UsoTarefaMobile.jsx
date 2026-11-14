import React from 'react';
import { fmtBRL } from '../../../cronograma/scheduleEngine';
import { isoToBR } from '../../../cronograma/cronogramaDateUtils';
import { formatarPercentual } from './cronogramaMobilePure';
import { larguraDoRotulo } from './linhaDoTempoPure';
import {
  OPCOES_DE_ESTRUTURA, colapsadosAteNivel, linhasDoUso, totaisDoUso, textoValor, textoPct, larguraDaColuna,
  mesesDaDistribuicao, resumoDaTarefaNoUso,
} from './usoCurvaPure';
import { MatrizMobile } from './MatrizMobile';
import { FolhaMeses } from './FolhaMeses';
import { useAlturaDaArea } from './useAlturaDaArea';

// Fundo da linha de grupo pelo nível da EAP, o mesmo do Uso do desktop (azul mais forte na raiz).
const fundoDoGrupo = (nivel) => (nivel <= 0 ? 'var(--brand-100)' : nivel === 1 ? 'var(--brand-50)' : 'var(--brand-tint)');

// Uso da Tarefa na casca mobile: o custo (R$) previsto de cada tarefa em cada mês, com os totais fixos embaixo.
// Mesmos números do desktop (a distribuição mensal já vem calculada pelo CronogramaFull); aqui só muda a apresentação:
// coluna de tarefas e cabeçalho fixos, totais colados no rodapé e uma folha de leitura ao tocar numa linha. Recolher e
// expandir é só desta tela (não mexe no cronograma). Exportar para Excel e PDF continua no desktop.
const UsoTarefaMobile = ({ etapas, months, monthlyDist, wbsMap = {} }) => {
  const [colapsados, setColapsados] = React.useState(() => new Set());
  const [nivel, setNivel] = React.useState('');
  const [abertaId, setAbertaId] = React.useState(null);
  const [areaRef, altura] = useAlturaDaArea({});
  const [larguraTela, setLarguraTela] = React.useState(() => (typeof window !== 'undefined' ? window.innerWidth : 375));
  React.useEffect(() => {
    const ao = () => setLarguraTela(window.innerWidth);
    window.addEventListener('resize', ao);
    return () => window.removeEventListener('resize', ao);
  }, []);

  const totais = React.useMemo(() => totaisDoUso(months, monthlyDist), [months, monthlyDist]);
  const linhasUso = React.useMemo(
    () => linhasDoUso({ etapas, colapsados, months, monthlyDist }),
    [etapas, colapsados, months, monthlyDist],
  );

  // Largura das colunas de valor pelo maior número da tela (R$ 1.234.567,89 é bem mais largo que R$ 120,00).
  const { larguraMes, larguraTotal } = React.useMemo(() => {
    let maiorCelula = 0;
    let maiorLinha = 0;
    Object.values(monthlyDist || {}).forEach(d => {
      let soma = 0;
      months.forEach(m => { const v = d[m.key] || 0; soma += v; if (v > maiorCelula) maiorCelula = v; });
      if (soma > maiorLinha) maiorLinha = soma;
    });
    months.forEach(m => { if ((totais.porMes[m.key] || 0) > maiorCelula) maiorCelula = totais.porMes[m.key]; });
    return {
      larguraMes: larguraDaColuna([textoValor(maiorCelula), 'Mmm/00']),
      larguraTotal: larguraDaColuna([textoValor(Math.max(maiorLinha, totais.geral)), 'Total']),
    };
  }, [months, monthlyDist, totais]);

  const colunas = React.useMemo(
    () => [...months.map(m => ({ id: m.key, rotulo: m.label, w: larguraMes })), { id: 'total', rotulo: 'Total', w: larguraTotal }],
    [months, larguraMes, larguraTotal],
  );

  const linhas = linhasUso.map(({ e, nivel: n, temFilhos, aberto, dist, total }) => {
    const celulas = { total: { texto: textoValor(total), forte: e.isGroup } };
    months.forEach(m => {
      const v = dist[m.key] || 0;
      celulas[m.key] = { texto: textoValor(v), calor: !e.isGroup && v >= 1, forte: e.isGroup };
    });
    return {
      id: e.id, rotulo: e.etapa, wbs: wbsMap[e.id] || '', nivel: n, grupo: e.isGroup, temFilhos, aberto,
      fundo: e.isGroup ? fundoDoGrupo(n) : null, celulas,
    };
  });

  // Rodapé: as três linhas de total do desktop (Total geral em R$, % do total e % acumulado).
  const pct = (v) => textoPct(v, { zeroVazio: false });
  const rodape = React.useMemo(() => {
    const g = totais.geral;
    const monta = (id, rotulo, porMes, doTotal) => {
      const celulas = { total: { texto: doTotal, forte: true } };
      months.forEach((m, i) => { celulas[m.key] = { texto: porMes(m, i), forte: true }; });
      return { id, rotulo, fundo: 'var(--surface-muted)', celulas };
    };
    return [
      monta('geral', 'Total geral', (m) => textoValor(totais.porMes[m.key]), g > 0 ? textoValor(g) : '—'),
      monta('pct', '% do total', (m) => (g > 0 ? pct(totais.porMes[m.key] / g * 100) : '—'), g > 0 ? '100%' : '—'),
      monta('acum', '% acumulado', (m, i) => (g > 0 ? pct(totais.acumuladoPct[i] * 100) : '—'), g > 0 ? '100%' : '—'),
    ];
  }, [months, totais]);

  const alternar = (l) => {
    setNivel('');
    setColapsados(s => { const n = new Set(s); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); return n; });
  };
  const aoEscolherNivel = (v) => {
    if (v === '') return;
    setNivel(v);
    setColapsados(colapsadosAteNivel(etapas, Number(v)));
  };

  const aberta = abertaId ? etapas.find(e => e.id === abertaId) : null;
  const linhaAberta = abertaId ? linhasUso.find(l => l.e.id === abertaId) : null;
  const detalhe = aberta ? resumoDaTarefaNoUso(aberta) : null;

  if (!months.length) {
    return <div className="card"><div className="card-body mfs-aviso">Adicione tarefas com datas e custos no cronograma para ver o custo previsto por mês.</div></div>;
  }

  return (
    <div className="mfs-uso">
      <div className="mfs-uso-controles">
        <select
          className="input mfs-uso-estrutura" aria-label="Expandir ou recolher a estrutura" value={nivel}
          onChange={(e) => aoEscolherNivel(e.target.value)}
        >
          <option value="" disabled>Estrutura…</option>
          {OPCOES_DE_ESTRUTURA.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
        </select>
        <div className="mfs-uso-total">
          <span>Custo previsto · R$</span>
          <strong>{totais.geral > 0 ? fmtBRL(totais.geral) : '—'}</strong>
        </div>
      </div>

      <div ref={areaRef}>
        <MatrizMobile
          nomeAcessivel="Custo previsto por tarefa e por mês"
          larguraRotulo={larguraDoRotulo(larguraTela - 24)}
          colunas={colunas} linhas={linhas} rodape={rodape} altura={altura}
          linhaAbertaId={abertaId}
          aoTocarLinha={(l) => setAbertaId(l.id)} aoAlternar={alternar}
        />
      </div>

      {aberta && linhaAberta && (
        <FolhaMeses
          titulo={`${aberta.isGroup ? 'Grupo' : 'Tarefa'} ${wbsMap[aberta.id] || ''}`.trim()}
          subtitulo={aberta.etapa}
          resumo={[
            { rotulo: 'Início', valor: isoToBR(detalhe.inicioISO) },
            { rotulo: 'Término', valor: isoToBR(detalhe.fimISO) },
            { rotulo: 'Duração', valor: `${detalhe.dur} d` },
            { rotulo: 'Avanço', valor: formatarPercentual(detalhe.avanco) },
            { rotulo: 'Custo previsto', valor: linhaAberta.total > 0 ? fmtBRL(linhaAberta.total) : '—' },
            { rotulo: '% do total da obra', valor: totais.geral > 0 && linhaAberta.total > 0 ? textoPct(linhaAberta.total / totais.geral * 100) : '—' },
          ]}
          tituloMeses="Custo previsto por mês"
          meses={mesesDaDistribuicao(months, linhaAberta.dist, linhaAberta.total).map(m => ({
            key: m.key, rotulo: m.rotulo, principal: fmtBRL(m.valor),
            secundario: `${textoPct(m.pct, { zeroVazio: false })} da tarefa`, terciario: `acumulado ${textoPct(m.acumPct, { zeroVazio: false })}`,
          }))}
          vazio="Esta linha não tem custo previsto nos meses."
          onClose={() => setAbertaId(null)}
        />
      )}
    </div>
  );
};

export { UsoTarefaMobile };
