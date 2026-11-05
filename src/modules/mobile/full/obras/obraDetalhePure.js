// Regras puras da Obra detalhe na casca mobile (sem React): o que cada indicador do topo mostra, o texto de apoio de
// cada um e o resumo do cronograma. Os valores (avanço físico, planejado, financeiro, fim do cronograma) já chegam
// calculados pela ObraDetail, com as mesmas fontes do desktop; aqui só se decide como aparecem.
import { offsetToDate, taskEnd } from '../../../cronograma/cronogramaDateUtils';
import { textoPct } from '../cronograma/usoCurvaPure';

// "2026-11-05" -> "05/11/2026". Vazio ou ausente vira traço.
export const dataBR = (iso) => (iso && String(iso).length >= 10 ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—');

// Mesmos dois estados do selo do desktop: concluída ou em execução.
export const statusDaObra = (status) => (
  status === 'concluida' ? { rotulo: 'Concluída', tom: 'success' } : { rotulo: 'Em execução', tom: 'info' }
);

// Quantos meses o cronograma ocupa, do mês da tarefa (folha) mais antiga ao mês do último término. Mesma conta da
// janela do Gantt do desktop (computeJanela). Sem etapas, 0.
export const mesesDoCronograma = (etapas = []) => {
  const folhas = etapas.filter(e => !e.isGroup);
  const base = folhas.length ? folhas : etapas;
  if (!base.length) return 0;
  const inicioMin = Math.min(...base.map(e => e.inicio || 0));
  const fimMax = Math.max(...base.map(e => taskEnd(e)));
  const dIni = offsetToDate(inicioMin);
  const dFim = offsetToDate(fimMax);
  return (dFim.getFullYear() * 12 + dFim.getMonth()) - (dIni.getFullYear() * 12 + dIni.getMonth()) + 1;
};

export const resumoDoCronograma = (etapas = []) => {
  const n = etapas.length;
  if (!n) return 'Nenhuma etapa cadastrada';
  return `${n} ${n === 1 ? 'etapa' : 'etapas'} · ${mesesDoCronograma(etapas)} ${mesesDoCronograma(etapas) === 1 ? 'mês' : 'meses'}`;
};

const limitar = (v) => Math.max(0, Math.min(100, Number(v) || 0));

// Os cinco indicadores do cabeçalho da obra, com os mesmos textos de apoio do desktop. O primeiro (avanço físico) leva a
// barra de progresso e, quando há linha de base, a marca de quanto ela previa até hoje.
export const indicadoresDaObra = ({ obra = {}, avancoFisico = 0, planejadoHoje = null, financeiroPct = null, cronFinalISO = null, etapasLoaded = true }) => {
  const pct = (v) => textoPct(v, { zeroVazio: false });
  return [
    {
      id: 'avanco', rotulo: 'Avanço físico', valor: pct(avancoFisico), destaque: true,
      progresso: limitar(avancoFisico), planejado: planejadoHoje != null ? limitar(planejadoHoje) : null,
      meta: planejadoHoje != null
        ? `vs planejado ${pct(planejadoHoje)} (linha de base)`
        : (etapasLoaded ? 'Sem linha de base' : 'Carregando…'),
    },
    {
      id: 'financeiro', rotulo: 'Financeiro', valor: financeiroPct != null ? pct(financeiroPct) : '—',
      meta: financeiroPct == null ? 'Sem fechamento importado' : null,
    },
    {
      id: 'fim-cronograma', rotulo: 'Fim do cronograma', valor: dataBR(cronFinalISO),
      meta: !etapasLoaded ? 'Carregando…' : (!cronFinalISO ? 'Sem cronograma' : null),
    },
    { id: 'fim-obra', rotulo: 'Data fim da obra', valor: dataBR(obra.dataFimObra), meta: null },
    { id: 'entrega', rotulo: 'Entrega (cliente)', valor: dataBR(obra.previsto), meta: null },
  ];
};

// Abas da obra na casca mobile. Cronograma fica na própria tela; Fotos abre o modo foco que já existe (câmera e envio
// em tela cheia). Aba sem permissão aparece travada, como no desktop.
export const abasDaObraMobile = (abas = []) => abas.map(a => ({ ...a, abreFoco: a.id === 'fotos' }));
