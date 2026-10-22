// Tarefa sem predecessora e sem restrição fica no início do projeto (como no Project):
//  - voltarAoInicioDoProjeto leva ao início quem ACABA de ficar livre (ou nasce livre fora do início);
//  - data digitada ou arrastada numa tarefa livre vira a restrição "não iniciar antes de" (SNET);
//  - as que já eram livres e fora do início não mudam sozinhas: ficam na lista de revisão.
import { describe, it, expect, beforeEach } from 'vitest';
import { setWorkCal, dateToOffset, offsetToISO } from '../modules/cronograma/cronogramaDateUtils';
import {
  voltarAoInicioDoProjeto, ehTarefaLivre, tarefasLivresForaDoInicio, comInicioFixado,
  applyFieldToEtapa, commitFieldChange, autoScheduleFromDeps,
} from '../modules/cronograma/scheduleEngine';

beforeEach(() => setWorkCal({ dias: [], sabadoUtil: false }));

const INICIO = dateToOffset('2026-09-01'); // início do projeto = menor início entre as tarefas
const t = (id, displayId, extra = {}) => ({
  id, displayId, etapa: `Tarefa ${id}`, nivel: 0, parentId: null, isGroup: false, collapsed: false,
  inicio: INICIO, dur: 5, avanco: 0, status: 'upcoming', dep: [],
  milestone: false, responsavel: '', customCols: {}, custo: 0, custoRealizado: 0,
  restricaoTipo: 'asap', restricaoData: '', fator_peso: 1, valorVinculadoFixo: null, modo: 'auto', showInDist: false, pavimento: '',
  ...extra,
});
const dep = (id, tipo = 'TI', lag = 0) => ({ id, tipo, lag });
const inicioDe = (lista, id) => lista.find(e => e.id === id).inicio;
const LONGE = INICIO + 60;

describe('ehTarefaLivre', () => {
  it('folha automática, abaixo de 100%, sem predecessora e sem restrição com data', () => {
    expect(ehTarefaLivre(t('A', 1))).toBe(true);
    expect(ehTarefaLivre(t('A', 1, { modo: undefined }))).toBe(true);           // sem o campo modo (criada pelo Gantt)
    expect(ehTarefaLivre(t('A', 1, { restricaoTipo: 'snet', restricaoData: '' }))).toBe(true); // tipo sem data conta como asap
  });

  it('não é livre: grupo, manual, concluída, com predecessora ou com restrição com data', () => {
    expect(ehTarefaLivre(t('G', 1, { isGroup: true }))).toBe(false);
    expect(ehTarefaLivre(t('M', 1, { modo: 'manual' }))).toBe(false);
    expect(ehTarefaLivre(t('D', 1, { avanco: 100 }))).toBe(false);
    expect(ehTarefaLivre(t('P', 1, { dep: [dep('X')] }))).toBe(false);
    for (const tipo of ['snet', 'snlt', 'fnet', 'fnlt', 'mso', 'mfo']) {
      expect(ehTarefaLivre(t('R', 1, { restricaoTipo: tipo, restricaoData: '2026-10-05' }))).toBe(false);
    }
    expect(ehTarefaLivre(undefined)).toBe(false);
  });
});

describe('voltarAoInicioDoProjeto: quem acaba de ficar livre', () => {
  const base = () => [t('A', 1), t('X', 2, { inicio: LONGE, restricaoTipo: 'snet', restricaoData: offsetToISO(LONGE) })];

  it('restrição de data apagada: a tarefa vai ao início do projeto', () => {
    const antes = base();
    const depois = antes.map(e => (e.id === 'X' ? { ...e, restricaoTipo: 'asap', restricaoData: '' } : e));
    expect(inicioDe(voltarAoInicioDoProjeto(antes, depois), 'X')).toBe(INICIO);
  });

  it('manual para automático: vai ao início do projeto', () => {
    const antes = [t('A', 1), t('X', 2, { inicio: LONGE, modo: 'manual' })];
    const depois = antes.map(e => (e.id === 'X' ? { ...e, modo: 'auto' } : e));
    expect(inicioDe(voltarAoInicioDoProjeto(antes, depois), 'X')).toBe(INICIO);
  });

  it('tarefa NOVA com data herdada (linha copiada e colada): vai ao início do projeto', () => {
    const antes = [t('A', 1), t('X', 2, { inicio: LONGE })];            // X já era livre e fora do início
    const copia = t('X2', 3, { inicio: LONGE });
    const depois = voltarAoInicioDoProjeto(antes, [...antes, copia]);
    expect(inicioDe(depois, 'X2')).toBe(INICIO);
    expect(inicioDe(depois, 'X')).toBe(LONGE);                          // a antiga não mexe
  });

  it('tarefa nova que já nasce com restrição (colada com data): fica onde está', () => {
    const antes = [t('A', 1)];
    const nova = t('N', 2, { inicio: LONGE, restricaoTipo: 'snet', restricaoData: offsetToISO(LONGE) });
    const depois = [...antes, nova];
    expect(voltarAoInicioDoProjeto(antes, depois)).toBe(depois);
  });

  it('tarefa que já era livre e fora do início não é tocada por uma edição qualquer', () => {
    const antes = [t('A', 1), t('L', 2, { inicio: LONGE })];
    const depois = antes.map(e => (e.id === 'A' ? { ...e, etapa: 'Renomeada' } : e));
    expect(voltarAoInicioDoProjeto(antes, depois)).toBe(depois);
  });

  it('as sucessoras da tarefa que voltou acompanham', () => {
    const antes = autoScheduleFromDeps([t('A', 1), t('X', 2, { inicio: LONGE, restricaoTipo: 'snet', restricaoData: offsetToISO(LONGE) }), t('S', 3, { dep: [dep('X')] })]);
    const sAntes = inicioDe(antes, 'S');
    const depois = voltarAoInicioDoProjeto(antes, antes.map(e => (e.id === 'X' ? { ...e, restricaoTipo: 'asap', restricaoData: '' } : e)));
    expect(inicioDe(depois, 'X')).toBe(INICIO);
    expect(inicioDe(depois, 'S')).toBeLessThan(sAntes);
  });
});

describe('comInicioFixado e a data digitada (applyFieldToEtapa)', () => {
  const lista = () => [t('A', 1), t('X', 2, { inicio: INICIO })];

  it('tarefa livre: a data digitada depois do início do projeto vira SNET naquela data', () => {
    const x = applyFieldToEtapa(lista()[1], 'inicio', offsetToISO(LONGE), lista());
    expect(x.inicio).toBe(LONGE);
    expect(x.restricaoTipo).toBe('snet');
    expect(x.restricaoData).toBe(offsetToISO(LONGE));
  });

  it('data digitada em formato brasileiro (colar do Excel) também vira SNET', () => {
    const x = applyFieldToEtapa(lista()[1], 'inicio', '15/10/2026', lista());
    expect(x.restricaoTipo).toBe('snet');
    expect(x.restricaoData).toBe('2026-10-15');
  });

  it('a data fica depois de reagendar: não volta ao início do projeto', () => {
    const antes = lista();
    const depois = commitFieldChange(antes, 'X', 'inicio', offsetToISO(LONGE));
    expect(inicioDe(depois, 'X')).toBe(LONGE);
    expect(inicioDe(autoScheduleFromDeps(depois), 'X')).toBe(LONGE);
  });

  it('SNET que já existia é atualizado para a nova data', () => {
    const x0 = t('X', 2, { inicio: LONGE, restricaoTipo: 'snet', restricaoData: offsetToISO(LONGE) });
    const novo = applyFieldToEtapa(x0, 'inicio', offsetToISO(LONGE + 10), [t('A', 1), x0]);
    expect(novo.restricaoData).toBe(offsetToISO(LONGE + 10));
  });

  it('data no início do projeto: sem restrição, e um SNET que existia é limpo', () => {
    const semRestricao = applyFieldToEtapa(lista()[1], 'inicio', offsetToISO(INICIO), lista());
    expect(semRestricao.restricaoTipo).toBe('asap');
    const x0 = t('X', 2, { inicio: LONGE, restricaoTipo: 'snet', restricaoData: offsetToISO(LONGE) });
    const limpo = applyFieldToEtapa(x0, 'inicio', offsetToISO(INICIO), [t('A', 1), x0]);
    expect(limpo.restricaoTipo).toBe('asap');
    expect(limpo.restricaoData).toBe('');
  });

  it('com predecessora a data digitada continua só gravando o início (o agendador manda)', () => {
    const x0 = t('X', 2, { dep: [dep('A')] });
    const novo = applyFieldToEtapa(x0, 'inicio', offsetToISO(LONGE), [t('A', 1), x0]);
    expect(novo.inicio).toBe(LONGE);
    expect(novo.restricaoTipo).toBe('asap');
  });

  it('tarefa manual, concluída e restrição de outro tipo ficam como estão', () => {
    const outros = [
      t('M', 2, { modo: 'manual' }),
      t('D', 3, { avanco: 100 }),
      t('O', 4, { restricaoTipo: 'mso', restricaoData: '2026-10-01' }),
    ];
    for (const x0 of outros) {
      const novo = applyFieldToEtapa(x0, 'inicio', offsetToISO(LONGE), [t('A', 1), x0]);
      expect(novo.inicio).toBe(LONGE);
      expect(novo.restricaoTipo).toBe(x0.restricaoTipo);
      expect(novo.restricaoData).toBe(x0.restricaoData);
    }
  });

  it('data inválida não altera nada (mesma tarefa de volta)', () => {
    const x0 = lista()[1];
    expect(applyFieldToEtapa(x0, 'inicio', 'abc', lista())).toBe(x0);
  });

  it('comInicioFixado sem início do projeto conhecido só grava o início', () => {
    const novo = comInicioFixado(t('X', 2), LONGE, NaN);
    expect(novo.inicio).toBe(LONGE);
    expect(novo.restricaoTipo).toBe('asap');
  });
});

describe('tarefasLivresForaDoInicio (lista de revisão)', () => {
  it('lista só as livres que começam depois do início do projeto', () => {
    const etapas = [
      t('A', 1),                                                              // no início
      t('L1', 2, { inicio: LONGE }),                                         // livre fora do início
      t('L2', 3, { inicio: LONGE + 7 }),                                     // livre fora do início
      t('P', 4, { inicio: LONGE, dep: [dep('A')] }),                         // tem predecessora
      t('R', 5, { inicio: LONGE, restricaoTipo: 'snet', restricaoData: offsetToISO(LONGE) }), // restrição
      t('M', 6, { inicio: LONGE, modo: 'manual' }),
      t('D', 7, { inicio: LONGE, avanco: 100 }),
      t('G', 8, { inicio: LONGE, isGroup: true }),
    ];
    expect(tarefasLivresForaDoInicio(etapas).map(e => e.id)).toEqual(['L1', 'L2']);
  });

  it('cronograma sem tarefa livre fora do início: lista vazia', () => {
    expect(tarefasLivresForaDoInicio([t('A', 1), t('B', 2)])).toEqual([]);
  });

  it('"Manter a data" (SNET) e "levar ao início" tiram a tarefa da lista', () => {
    const etapas = [t('A', 1), t('L1', 2, { inicio: LONGE }), t('L2', 3, { inicio: LONGE })];
    const mantida = etapas.map(e => (e.id === 'L1' ? { ...e, restricaoTipo: 'snet', restricaoData: offsetToISO(e.inicio) } : e));
    const movida = mantida.map(e => (e.id === 'L2' ? { ...e, inicio: INICIO } : e));
    expect(tarefasLivresForaDoInicio(mantida).map(e => e.id)).toEqual(['L2']);
    expect(tarefasLivresForaDoInicio(movida)).toEqual([]);
    expect(inicioDe(autoScheduleFromDeps(movida), 'L1')).toBe(LONGE);          // a mantida continua onde estava
  });
});
