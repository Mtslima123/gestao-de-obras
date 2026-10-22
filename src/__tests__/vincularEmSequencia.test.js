// Botão "Vincular em sequência" do modal Vincular tarefas: a partir da primeira sucessora que já tem
// predecessora escolhida, cada sucessora seguinte recebe a predecessora seguinte da lista, até acabar.
import { describe, it, expect } from 'vitest';
import { parearEmSequencia } from '../modules/cronograma/scheduleEngine';

const t = (id) => ({ id, etapa: id });
// Teto de cada pavimento (T*), depois Parede de cada pavimento (P*), na ordem do cronograma
const etapas = [t('T1'), t('T2'), t('T3'), t('T4'), t('T5'), t('P1'), t('P2'), t('P3'), t('P4'), t('X')];
const preds = ['T1', 'T2', 'T3', 'T4', 'T5'];

describe('parearEmSequencia', () => {
  it('escolheu a 1ª sucessora com a 1ª predecessora: as seguintes vão na ordem', () => {
    const { pares, semPar } = parearEmSequencia(etapas, preds, ['P1', 'P2', 'P3'], { P1: 'T1' });
    expect(pares).toEqual({ P2: 'T2', P3: 'T3' });
    expect(semPar).toEqual([]);
  });

  it('com deslocamento: a 1ª sucessora ligada à 2ª predecessora leva as seguintes junto', () => {
    const { pares } = parearEmSequencia(etapas, preds, ['P1', 'P2', 'P3'], { P1: 'T2' });
    expect(pares).toEqual({ P2: 'T3', P3: 'T4' });
  });

  it('acabam as predecessoras antes das sucessoras: as que sobram ficam sem par', () => {
    const { pares, semPar } = parearEmSequencia(etapas, preds, ['P1', 'P2', 'P3', 'P4'], { P1: 'T4' });
    expect(pares).toEqual({ P2: 'T5' });
    expect(semPar).toEqual(['P3', 'P4']);
  });

  it('acabam as sucessoras antes das predecessoras: sobram predecessoras sem uso', () => {
    const { pares, semPar } = parearEmSequencia(etapas, preds, ['P1', 'P2'], { P1: 'T1' });
    expect(pares).toEqual({ P2: 'T2' });
    expect(semPar).toEqual([]);
  });

  it('a primeira escolha pode estar no meio: as de antes não mudam, as de depois seguem', () => {
    const { pares, semPar } = parearEmSequencia(etapas, preds, ['P1', 'P2', 'P3', 'P4'], { P2: 'T2' });
    expect(pares).toEqual({ P3: 'T3', P4: 'T4' });
    expect(semPar).toEqual([]);
    expect(pares.P1).toBeUndefined();
  });

  it('só vale a PRIMEIRA escolha na ordem do cronograma (as outras escolhas são substituídas)', () => {
    const { pares } = parearEmSequencia(etapas, preds, ['P1', 'P2', 'P3'], { P1: 'T1', P3: 'T5' });
    expect(pares).toEqual({ P2: 'T2', P3: 'T3' });
  });

  it('a ordem é a do cronograma, não a em que as caixas foram marcadas', () => {
    const { pares } = parearEmSequencia(etapas, ['T3', 'T1', 'T2'], ['P3', 'P1', 'P2'], { P1: 'T1' });
    expect(pares).toEqual({ P2: 'T2', P3: 'T3' });
  });

  it('sem nenhuma escolha feita: nada é casado', () => {
    expect(parearEmSequencia(etapas, preds, ['P1', 'P2'], {})).toEqual({ pares: {}, semPar: [] });
    expect(parearEmSequencia(etapas, preds, ['P1', 'P2'], { P1: '' })).toEqual({ pares: {}, semPar: [] });
  });

  it('escolha apontando para tarefa que não está entre as predecessoras marcadas: nada é casado', () => {
    expect(parearEmSequencia(etapas, ['T1', 'T2'], ['P1', 'P2'], { P1: 'T5' })).toEqual({ pares: {}, semPar: [] });
  });

  it('escolha na última sucessora: não há o que ligar depois', () => {
    expect(parearEmSequencia(etapas, preds, ['P1', 'P2'], { P2: 'T1' })).toEqual({ pares: {}, semPar: [] });
  });

  it('a mesma tarefa nos dois lados na mesma posição não vira predecessora de si mesma', () => {
    // T3 marcada como predecessora E como sucessora: a posição dela na sequência cairia nela mesma
    const { pares, semPar } = parearEmSequencia(etapas, ['T2', 'T3', 'T4'], ['T1', 'T3', 'P1'], { T1: 'T2' });
    expect(semPar).toEqual(['T3']);
    expect(pares).toEqual({ P1: 'T4' });
  });

  it('não altera os arrays nem o mapa de escolhas recebidos', () => {
    const p = ['T2', 'T1']; const s = ['P2', 'P1']; const l = { P1: 'T1' };
    parearEmSequencia(etapas, p, s, l);
    expect(p).toEqual(['T2', 'T1']);
    expect(s).toEqual(['P2', 'P1']);
    expect(l).toEqual({ P1: 'T1' });
  });
});
