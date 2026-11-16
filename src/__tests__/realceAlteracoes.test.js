// Realce de alterações: depois de uma edição, só as células Início/Duração/Término que MUDARAM
// (da tarefa, das sucessoras recalculadas e dos resumos) entram no realce da Lista.
import { describe, it, expect, beforeEach } from 'vitest';
import { setWorkCal, dateToOffset, offsetToISO } from '../modules/cronograma/cronogramaDateUtils';
import { autoScheduleFromDeps } from '../modules/cronograma/scheduleEngine';
import { realcarAlteracoes } from '../modules/cronograma/realceAlteracoesPure';

beforeEach(() => setWorkCal({ dias: [], sabadoUtil: false }));

const INICIO = dateToOffset('2026-09-01'); // terça-feira
const t = (id, extra = {}) => ({
  id, displayId: id, etapa: `Tarefa ${id}`, nivel: 0, parentId: null, isGroup: false, collapsed: false,
  inicio: INICIO, dur: 5, avanco: 0, status: 'upcoming', dep: [],
  milestone: false, responsavel: '', customCols: {}, custo: 0, custoRealizado: 0,
  restricaoTipo: 'asap', restricaoData: '', fator_peso: 1, valorVinculadoFixo: null, modo: 'auto', showInDist: false, pavimento: '',
  ...extra,
});
const dep = (id) => ({ id, tipo: 'TI', lag: 0 });
const colunas = (realce, id) => [...(realce?.get(id) || [])].sort();

// Cenário parecido com o print do Project: A não depende de ninguém, B tem restrição de data,
// C e D vêm em cadeia depois de B, e todas ficam dentro do resumo G.
const base = () => [
  t('G', { isGroup: true, dur: 1 }),
  t('A', { nivel: 1, parentId: 'G' }),
  t('B', { nivel: 1, parentId: 'G', dur: 7, restricaoTipo: 'snet', restricaoData: offsetToISO(INICIO) }),
  t('C', { nivel: 1, parentId: 'G', dur: 7, dep: [dep('B')] }),
  t('D', { nivel: 1, parentId: 'G', dur: 19, dep: [dep('C')] }),
];
const agendado = (lista) => autoScheduleFromDeps(lista);
const comRestricaoDeB = (lista, offset) =>
  lista.map(e => (e.id === 'B' ? { ...e, restricaoTipo: 'snet', restricaoData: offsetToISO(offset) } : e));

describe('realcarAlteracoes', () => {
  it('mover a restrição de B realça Início e Término da própria tarefa, não a Duração', () => {
    const antes = agendado(base());
    const depois = agendado(comRestricaoDeB(base(), INICIO + 30));
    const realce = realcarAlteracoes(antes, depois);
    expect(colunas(realce, 'B')).toEqual(['fim', 'inicio']);
  });

  it('as sucessoras recalculadas são realçadas e quem não depende de B não', () => {
    const antes = agendado(base());
    const depois = agendado(comRestricaoDeB(base(), INICIO + 30));
    const realce = realcarAlteracoes(antes, depois);
    expect(colunas(realce, 'C')).toEqual(['fim', 'inicio']);
    expect(colunas(realce, 'D')).toEqual(['fim', 'inicio']);
    expect(realce.has('A')).toBe(false);
  });

  it('o resumo é realçado pelo envelope dos filhos: o início fica, a duração e o término mudam', () => {
    const antes = agendado(base());
    const depois = agendado(comRestricaoDeB(base(), INICIO + 30));
    const realce = realcarAlteracoes(antes, depois);
    expect(colunas(realce, 'G')).toEqual(['duracao', 'fim']);
  });

  it('mudar só a duração realça Duração e Término, não o Início', () => {
    const antes = agendado(base());
    const depois = agendado(base().map(e => (e.id === 'D' ? { ...e, dur: 25 } : e)));
    const realce = realcarAlteracoes(antes, depois);
    expect(colunas(realce, 'D')).toEqual(['duracao', 'fim']);
    expect(realce.has('B')).toBe(false);
    expect(realce.has('C')).toBe(false);
  });

  it('início adianta e a duração encolhe com o término igual: realça Início e Duração, não o Término', () => {
    // 5 dias úteis a partir de terça terminam na segunda; 4 a partir de quarta terminam no mesmo dia.
    const antes = [t('X', { inicio: INICIO, dur: 5 })];
    const depois = [t('X', { inicio: INICIO + 1, dur: 4 })];
    expect(colunas(realcarAlteracoes(antes, depois), 'X')).toEqual(['duracao', 'inicio']);
  });

  it('o resumo conta pelo que a Lista mostra, mesmo com os valores gravados nele velhos', () => {
    const antes = agendado(base());
    // D (a última a terminar) ganha 6 dias sem reagendar: o envelope de G cresce, o gravado em G não.
    const depois = antes.map(e => (e.id === 'D' ? { ...e, dur: e.dur + 6 } : e));
    const realce = realcarAlteracoes(antes, depois);
    expect(colunas(realce, 'G')).toEqual(['duracao', 'fim']);
    expect(depois.find(e => e.id === 'G').dur).toBe(antes.find(e => e.id === 'G').dur);
  });

  it('tarefa nova ou excluída não entra no realce', () => {
    const antes = agendado(base());
    const nova = t('N', { inicio: INICIO + 3 });
    const comNova = [...antes, nova];
    expect(realcarAlteracoes(antes, comNova)).toBeNull();
    expect(realcarAlteracoes(comNova, antes)).toBeNull();
  });

  it('reordenar linhas não realça nada', () => {
    const antes = agendado(base());
    const depois = [...antes].reverse();
    expect(realcarAlteracoes(antes, depois)).toBeNull();
  });

  it('mudança que não é de data (nome, avanço, custo) devolve null', () => {
    const antes = agendado(base());
    const depois = antes.map(e => (e.id === 'C' ? { ...e, etapa: 'Outro nome', avanco: 40, custo: 1000 } : e));
    expect(realcarAlteracoes(antes, depois)).toBeNull();
  });

  it('estados iguais ou vazios devolvem null', () => {
    const antes = agendado(base());
    expect(realcarAlteracoes(antes, antes.map(e => ({ ...e })))).toBeNull();
    expect(realcarAlteracoes([], antes)).toBeNull();
    expect(realcarAlteracoes(antes, [])).toBeNull();
    expect(realcarAlteracoes(null, antes)).toBeNull();
  });

  it('desfazer: comparar na ordem inversa realça as mesmas células que a edição realçou', () => {
    const antes = agendado(base());
    const depois = agendado(comRestricaoDeB(base(), INICIO + 30));
    const ida = realcarAlteracoes(antes, depois);
    const volta = realcarAlteracoes(depois, antes);
    expect([...volta.keys()].sort()).toEqual([...ida.keys()].sort());
    ida.forEach((cols, id) => expect(colunas(volta, id)).toEqual(colunas(ida, id)));
  });
});
