// Botão "Vincular 1 para 1" do modal Vincular tarefas: casa a 1ª predecessora com a 1ª sucessora, e
// assim por diante, pela ordem do cronograma, só quando as quantidades são iguais.
import { describe, it, expect } from 'vitest';
import { parearUmParaUm } from '../modules/cronograma/scheduleEngine';

const t = (id) => ({ id, etapa: id });
// Teto de cada pavimento (T*), depois Parede de cada pavimento (P*), na ordem do cronograma
const etapas = [t('T1'), t('T2'), t('T3'), t('P1'), t('P2'), t('P3'), t('X')];

describe('parearUmParaUm', () => {
  it('quantidades iguais: a 1ª predecessora com a 1ª sucessora, a 2ª com a 2ª...', () => {
    const { pares, semPar } = parearUmParaUm(etapas, ['T1', 'T2', 'T3'], ['P1', 'P2', 'P3']);
    expect(pares).toEqual({ P1: 'T1', P2: 'T2', P3: 'T3' });
    expect(semPar).toEqual([]);
  });

  it('a ordem é a do cronograma, não a em que as caixas foram marcadas', () => {
    const { pares } = parearUmParaUm(etapas, ['T3', 'T1', 'T2'], ['P2', 'P3', 'P1']);
    expect(pares).toEqual({ P1: 'T1', P2: 'T2', P3: 'T3' });
  });

  it('quantidades diferentes: nada é casado', () => {
    expect(parearUmParaUm(etapas, ['T1', 'T2', 'T3'], ['P1', 'P2'])).toEqual({ pares: {}, semPar: [] });
    expect(parearUmParaUm(etapas, ['T1'], ['P1', 'P2'])).toEqual({ pares: {}, semPar: [] });
  });

  it('listas vazias: nada é casado', () => {
    expect(parearUmParaUm(etapas, [], [])).toEqual({ pares: {}, semPar: [] });
  });

  it('a mesma tarefa nos dois lados na mesma posição não vira predecessora de si mesma', () => {
    const { pares, semPar } = parearUmParaUm(etapas, ['T1', 'T2'], ['T1', 'P1']);
    expect(pares).toEqual({ P1: 'T2' });
    expect(semPar).toEqual(['T1']);
  });

  it('predecessora e sucessora de posições diferentes na mesma tarefa: casa normalmente', () => {
    // T1 -> T2 e T2 -> T3 (cadeia dentro do mesmo grupo)
    const { pares, semPar } = parearUmParaUm(etapas, ['T1', 'T2'], ['T2', 'T3']);
    expect(pares).toEqual({ T2: 'T1', T3: 'T2' });
    expect(semPar).toEqual([]);
  });

  it('id marcado que não existe mais no cronograma: não casa nada em vez de casar errado', () => {
    expect(parearUmParaUm(etapas, ['T1', 'FANTASMA'], ['P1', 'P2'])).toEqual({ pares: {}, semPar: [] });
  });

  it('não altera os arrays recebidos', () => {
    const preds = ['T3', 'T1'];
    const succs = ['P2', 'P1'];
    parearUmParaUm(etapas, preds, succs);
    expect(preds).toEqual(['T3', 'T1']);
    expect(succs).toEqual(['P2', 'P1']);
  });
});
