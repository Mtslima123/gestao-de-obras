// Obra detalhe na casca mobile (modules/mobile/full/obras/obraDetalhePure): indicadores do topo, textos de apoio e
// resumo do cronograma.
import { describe, it, expect } from 'vitest';
import { dateToOffset } from '../modules/cronograma/cronogramaDateUtils';
import {
  dataBR, statusDaObra, mesesDoCronograma, resumoDoCronograma, indicadoresDaObra, abasDaObraMobile,
} from '../modules/mobile/full/obras/obraDetalhePure';

const off = (iso) => dateToOffset(iso);
const tarefa = (inicioISO, dur, extra = {}) => ({ isGroup: false, inicio: off(inicioISO), dur, ...extra });

describe('datas e situação', () => {
  it('data em formato brasileiro; vazio vira traço', () => {
    expect(dataBR('2026-11-05')).toBe('05/11/2026');
    expect(dataBR('2026-11-05T10:00:00Z')).toBe('05/11/2026');
    expect(dataBR('')).toBe('—');
    expect(dataBR(null)).toBe('—');
    expect(dataBR(undefined)).toBe('—');
  });
  it('situação da obra: concluída ou em execução (qualquer outro valor)', () => {
    expect(statusDaObra('concluida')).toEqual({ rotulo: 'Concluída', tom: 'success' });
    expect(statusDaObra('em_andamento')).toEqual({ rotulo: 'Em execução', tom: 'info' });
    expect(statusDaObra(undefined).rotulo).toBe('Em execução');
  });
});

describe('resumo do cronograma', () => {
  it('meses do primeiro início ao último término, contando os dois', () => {
    // 02/03/2026 a 27/03/2026: um mês só
    expect(mesesDoCronograma([tarefa('2026-03-02', 20)])).toBe(1);
    // de março a maio (término em maio): três meses
    expect(mesesDoCronograma([tarefa('2026-03-02', 10), tarefa('2026-05-04', 10)])).toBe(3);
  });
  it('grupo não puxa o início: só as folhas contam quando existem', () => {
    const g = { isGroup: true, inicio: 0, dur: 5 };
    expect(mesesDoCronograma([g, tarefa('2026-03-02', 10)])).toBe(1);
  });
  it('sem folhas usa os grupos; sem nada, zero', () => {
    expect(mesesDoCronograma([{ isGroup: true, inicio: off('2026-03-02'), dur: 40 }])).toBe(2);
    expect(mesesDoCronograma([])).toBe(0);
  });
  it('texto com singular e plural', () => {
    expect(resumoDoCronograma([])).toBe('Nenhuma etapa cadastrada');
    expect(resumoDoCronograma([tarefa('2026-03-02', 5)])).toBe('1 etapa · 1 mês');
    expect(resumoDoCronograma([tarefa('2026-03-02', 10), tarefa('2026-05-04', 10)])).toBe('2 etapas · 3 meses');
  });
});

describe('indicadores do topo', () => {
  const base = { obra: { dataFimObra: '2027-03-30', previsto: '2027-04-15' }, avancoFisico: 12.5, planejadoHoje: 15.2, financeiroPct: 9.87, cronFinalISO: '2027-03-12', etapasLoaded: true };
  it('cinco indicadores, na ordem do desktop', () => {
    expect(indicadoresDaObra(base).map(i => i.id)).toEqual(['avanco', 'financeiro', 'fim-cronograma', 'fim-obra', 'entrega']);
  });
  it('avanço físico com planejado da linha de base e barra', () => {
    const [a] = indicadoresDaObra(base);
    expect(a.valor).toBe('12,50%');
    expect(a.meta).toBe('vs planejado 15,20% (linha de base)');
    expect(a.progresso).toBe(12.5);
    expect(a.planejado).toBe(15.2);
    expect(a.destaque).toBe(true);
  });
  it('sem linha de base avisa, e enquanto carrega diz que carrega', () => {
    expect(indicadoresDaObra({ ...base, planejadoHoje: null })[0].meta).toBe('Sem linha de base');
    expect(indicadoresDaObra({ ...base, planejadoHoje: null, etapasLoaded: false })[0].meta).toBe('Carregando…');
    expect(indicadoresDaObra({ ...base, planejadoHoje: null })[0].planejado).toBeNull();
  });
  it('barra nunca passa de 0 a 100', () => {
    expect(indicadoresDaObra({ ...base, avancoFisico: 140, planejadoHoje: -3 })[0].progresso).toBe(100);
    expect(indicadoresDaObra({ ...base, avancoFisico: -5 })[0].progresso).toBe(0);
    expect(indicadoresDaObra({ ...base, planejadoHoje: 130 })[0].planejado).toBe(100);
  });
  it('financeiro: valor do último fechamento ou traço com aviso', () => {
    expect(indicadoresDaObra(base)[1]).toMatchObject({ valor: '9,87%', meta: null });
    expect(indicadoresDaObra({ ...base, financeiroPct: null })[1]).toMatchObject({ valor: '—', meta: 'Sem fechamento importado' });
    expect(indicadoresDaObra({ ...base, financeiroPct: 0 })[1].valor).toBe('0,00%');
  });
  it('fim do cronograma: data, ou aviso de carregando e de sem cronograma', () => {
    expect(indicadoresDaObra(base)[2]).toMatchObject({ valor: '12/03/2027', meta: null });
    expect(indicadoresDaObra({ ...base, cronFinalISO: null })[2]).toMatchObject({ valor: '—', meta: 'Sem cronograma' });
    expect(indicadoresDaObra({ ...base, cronFinalISO: null, etapasLoaded: false })[2].meta).toBe('Carregando…');
  });
  it('datas da obra e da entrega; ausentes viram traço', () => {
    const l = indicadoresDaObra(base);
    expect(l[3].valor).toBe('30/03/2027');
    expect(l[4].valor).toBe('15/04/2027');
    const vazio = indicadoresDaObra({ ...base, obra: {} });
    expect(vazio[3].valor).toBe('—');
    expect(vazio[4].valor).toBe('—');
  });
});

describe('abas', () => {
  it('só Fotos abre o modo foco; permissões seguem como vieram', () => {
    const abas = abasDaObraMobile([{ id: 'cronograma', label: 'Cronograma', locked: false }, { id: 'fotos', label: 'Fotos', locked: true }]);
    expect(abas.map(a => a.abreFoco)).toEqual([false, true]);
    expect(abas[1].locked).toBe(true);
  });
});
