// Predecessora e Sucessora mostram e aceitam o número da LINHA (calha cinza), como no MS Project; o ID
// da coluna "ID" continua permanente. O vínculo é guardado pelo id interno da tarefa, então mudar a
// calha (inserir, excluir, mover linha) só renumera o TEXTO dessas colunas, nunca quebra o vínculo.
import { describe, it, expect, beforeEach } from 'vitest';
import { setWorkCal, dateToOffset } from '../modules/cronograma/cronogramaDateUtils';
import {
  createTask, deleteTask, computeIdMap, computeRowNumberMap, computeSuccessors, formatDepList, parseDep,
  applyFieldToEtapa,
} from '../modules/cronograma/scheduleEngine';

beforeEach(() => setWorkCal({ dias: [], sabadoUtil: false }));

const t = (id, displayId, extra = {}) => ({
  id, displayId, etapa: `Tarefa ${id}`, nivel: 0, parentId: null, isGroup: false, collapsed: false,
  inicio: dateToOffset('2026-09-01'), dur: 5, avanco: 0, status: 'upcoming', dep: [],
  milestone: false, responsavel: '', customCols: {}, custo: 0, custoRealizado: 0,
  restricaoTipo: 'asap', restricaoData: '', fator_peso: 1, valorVinculadoFixo: null, modo: 'auto', showInDist: false, pavimento: '',
  ...extra,
});
const dep = (id, tipo = 'TI', lag = 0) => ({ id, tipo, lag });

// linhas 1, 2, 3 e a linha 4 depende da 3 (a tarefa C)
const cenario = () => [t('A', 1), t('B', 2), t('C', 3), t('D', 4, { dep: [dep('C')] })];
const textoPred = (lista, id) => {
  const e = lista.find(x => x.id === id);
  return formatDepList(e.dep, lista, computeRowNumberMap(lista));
};
const textoSucc = (lista, id) => {
  const linhas = computeRowNumberMap(lista);
  return (computeSuccessors(lista)[id] || []).map(s => linhas[s]).join('; ');
};

describe('inserir uma linha entre a 2 e a 3 (o exemplo do Project)', () => {
  const antes = cenario();
  const depois = createTask('B', antes, []);

  it('antes: a tarefa D mostra a linha 3 na Predecessora', () => {
    expect(textoPred(antes, 'D')).toBe('3');
  });

  it('depois: a antiga linha 3 vira 4 e a Predecessora de quem dependia dela passa a mostrar 4', () => {
    const linhas = computeRowNumberMap(depois);
    expect(linhas.C).toBe(4);
    expect(linhas.D).toBe(5);
    expect(textoPred(depois, 'D')).toBe('4');
  });

  it('o vínculo continua na MESMA tarefa (id interno), só o texto mudou', () => {
    expect(depois.find(e => e.id === 'D').dep[0].id).toBe('C');
  });

  it('a Sucessora da C também acompanha: mostra a nova linha da D', () => {
    expect(textoSucc(antes, 'C')).toBe('4');
    expect(textoSucc(depois, 'C')).toBe('5');
  });

  it('o ID permanente não muda: a antiga 3 continua com ID 3 e a linha nova recebe o próximo', () => {
    const ids = computeIdMap(depois);
    expect(ids.C).toBe(3);
    expect(ids.D).toBe(4);
    const nova = depois.find(e => !['A', 'B', 'C', 'D'].includes(e.id));
    expect(ids[nova.id]).toBe(5);
  });
});

describe('excluir e mover linhas renumeram o texto, não o vínculo', () => {
  it('excluir a linha 2: C vira linha 2, D vira 3 e mostra 2', () => {
    const out = deleteTask('B', cenario());
    expect(computeRowNumberMap(out).C).toBe(2);
    expect(textoPred(out, 'D')).toBe('2');
    expect(out.find(e => e.id === 'D').dep[0].id).toBe('C');
  });

  it('mover a C para a posição 2 (a ordem do array é a ordem da calha)', () => {
    const base = cenario();
    const movida = [base[0], base[2], base[1], base[3]]; // A, C, B, D
    expect(textoPred(movida, 'D')).toBe('2');
    expect(movida.find(e => e.id === 'D').dep[0].id).toBe('C');
  });
});

describe('digitar o número resolve pela linha da calha', () => {
  const lista = createTask('B', cenario(), []); // A1 B2 nova3 C4 D5

  it('"4" liga na tarefa que está na linha 4 (a C), não na de ID 4 (a D)', () => {
    expect(parseDep('4', lista)).toEqual([{ id: 'C', tipo: 'TI', lag: 0 }]);
  });

  it('pela célula: a Predecessora digitada na linha 5 com "3" liga na linha 3 (a nova)', () => {
    const d = lista.find(e => e.id === 'D');
    const nova = lista[2];
    expect(applyFieldToEtapa(d, 'dep', '3', lista).dep).toEqual([{ id: nova.id, tipo: 'TI', lag: 0 }]);
  });

  it('tipo e lag junto do número da linha: "2TT+3d"', () => {
    expect(parseDep('2TT+3d', lista)).toEqual([{ id: 'B', tipo: 'TT', lag: 3 }]);
    expect(formatDepList([dep('B', 'TT', 3)], lista)).toBe('2TT+3d');
  });

  it('a tarefa nunca vira predecessora dela mesma (digitar a própria linha)', () => {
    const d = lista.find(e => e.id === 'D');
    expect(applyFieldToEtapa(d, 'dep', '5', lista).dep).toEqual([]);
  });

  it('linha que não existe é ignorada', () => {
    expect(parseDep('99; 0', lista)).toEqual([]);
  });

  it('o grupo recolhido não atrapalha: a lista COMPLETA numera todas as linhas', () => {
    const comGrupo = [t('G', 1, { isGroup: true }), t('F', 2, { parentId: 'G', nivel: 1 }), t('X', 3)];
    expect(parseDep('2', comGrupo)).toEqual([{ id: 'F', tipo: 'TI', lag: 0 }]);
  });
});
