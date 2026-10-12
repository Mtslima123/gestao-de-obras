// Testes de filtrarComAncestrais: ao filtrar a Lista/Gantt, o grupo-pai de quem passa no
// filtro fica junto (contexto da EAP), mesmo que o próprio grupo não passe. O caso real: o
// início de um grupo é o da primeira filha, então filtrar "início em fevereiro" derrubava o
// grupo que começa em janeiro e deixava as filhas de fevereiro soltas, sem o separador.
import { describe, it, expect } from 'vitest';
import { filtrarComAncestrais, getVisibleEtapas } from '../modules/cronograma/scheduleEngine';
import { passaFiltroColuna, buildTaskFilterPredicate } from '../modules/cronograma/cronogramaShared';
import { dateToOffset, offsetToDate } from '../modules/cronograma/cronogramaDateUtils';

// A (grupo) > A1 (grupo) > A1a, A1b ; A > A2 ; B (grupo) > B1 ; C (folha na raiz)
const arvore = () => [
  { id: 'A',   parentId: null, isGroup: true },
  { id: 'A1',  parentId: 'A',  isGroup: true },
  { id: 'A1a', parentId: 'A1', isGroup: false },
  { id: 'A1b', parentId: 'A1', isGroup: false },
  { id: 'A2',  parentId: 'A',  isGroup: false },
  { id: 'B',   parentId: null, isGroup: true },
  { id: 'B1',  parentId: 'B',  isGroup: false },
  { id: 'C',   parentId: null, isGroup: false },
];
const ids = (arr) => arr.map(e => e.id);
const so = (...alvo) => (e) => alvo.includes(e.id);

describe('filtrarComAncestrais', () => {
  it('folha que passa traz a cadeia de grupos até a raiz, na ordem original', () => {
    const e = arvore();
    expect(ids(filtrarComAncestrais(e, e, so('A1b')))).toEqual(['A', 'A1', 'A1b']);
  });

  it('folhas em ramos diferentes: cada uma com os seus grupos, sem repetir o grupo comum', () => {
    const e = arvore();
    expect(ids(filtrarComAncestrais(e, e, so('A1a', 'A1b', 'B1')))).toEqual(['A', 'A1', 'A1a', 'A1b', 'B', 'B1']);
  });

  it('grupo que passa traz só os ancestrais dele, não as filhas', () => {
    const e = arvore();
    expect(ids(filtrarComAncestrais(e, e, so('A1')))).toEqual(['A', 'A1']);
  });

  it('irmãs e grupos sem resultado ficam de fora', () => {
    const e = arvore();
    const out = ids(filtrarComAncestrais(e, e, so('A2')));
    expect(out).toEqual(['A', 'A2']);
    expect(out).not.toContain('A1');
    expect(out).not.toContain('B');
  });

  it('folha na raiz passa sozinha (sem ancestral)', () => {
    const e = arvore();
    expect(ids(filtrarComAncestrais(e, e, so('C')))).toEqual(['C']);
  });

  it('ninguém passa: lista vazia', () => {
    const e = arvore();
    expect(filtrarComAncestrais(e, e, () => false)).toEqual([]);
  });

  it('todos passam: as mesmas linhas, na mesma ordem', () => {
    const e = arvore();
    expect(ids(filtrarComAncestrais(e, e, () => true))).toEqual(ids(e));
  });

  it('filha escondida por grupo recolhido que passa faz o grupo recolhido aparecer, sem a filha', () => {
    const e = arvore().map(x => x.id === 'A' ? { ...x, collapsed: true } : x);
    const linhas = getVisibleEtapas(e);
    expect(ids(linhas)).toEqual(['A', 'B', 'B1', 'C']); // A1, A1a, A1b e A2 estão escondidas
    expect(ids(filtrarComAncestrais(linhas, e, so('A1b')))).toEqual(['A']);
  });

  it('respeita as linhas elegíveis: sem "Tarefas Resumo", os grupos não voltam', () => {
    const e = arvore();
    const soFolhas = e.filter(x => !x.isGroup);
    expect(ids(filtrarComAncestrais(soFolhas, e, so('A1b')))).toEqual(['A1b']);
  });

  it('não altera os arrays de entrada', () => {
    const e = arvore();
    const antes = JSON.stringify(e);
    const linhas = [...e];
    filtrarComAncestrais(linhas, e, so('A1b'));
    expect(JSON.stringify(e)).toBe(antes);
    expect(ids(linhas)).toEqual(ids(e));
  });

  it('parentId em ciclo não prende o laço', () => {
    const ciclo = [
      { id: 'X', parentId: 'Y', isGroup: true },
      { id: 'Y', parentId: 'X', isGroup: true },
      { id: 'Z', parentId: 'X', isGroup: false },
    ];
    expect(ids(filtrarComAncestrais(ciclo, ciclo, so('Z')))).toEqual(['X', 'Y', 'Z']);
  });

  it('parentId apontando para um id que não existe não quebra', () => {
    const orfa = [{ id: 'O', parentId: 'FANTASMA', isGroup: false }];
    expect(ids(filtrarComAncestrais(orfa, orfa, so('O')))).toEqual(['O']);
  });
});

describe('cenário do print: filtro de início em fevereiro', () => {
  const jan = dateToOffset('2027-01-11');
  const fev = dateToOffset('2027-02-01');
  // G2 começa em janeiro (início do grupo = o da 1ª filha) mas tem uma filha que começa em fevereiro.
  const etapas = [
    { id: 'G2',  parentId: null, isGroup: true,  inicio: jan, dur: 40, etapa: 'ESTRUTURA' },
    { id: 'G2a', parentId: 'G2', isGroup: false, inicio: jan, dur: 5,  etapa: 'ESTRUTURA - Térreo' },
    { id: 'G2b', parentId: 'G2', isGroup: false, inicio: fev, dur: 10, etapa: 'ESTRUTURA - Tipo 3' },
    { id: 'G4',  parentId: null, isGroup: true,  inicio: fev, dur: 20, etapa: 'INSTALAÇÕES' },
    { id: 'G4a', parentId: 'G4', isGroup: false, inicio: fev, dur: 10, etapa: 'INSTALAÇÕES - Térreo' },
  ];

  // Mesma chave que filterKeyOf (ListaInterativa.jsx) monta para coluna de data: AAAA-M-D.
  const chaveInicio = (e) => { const d = offsetToDate(e.inicio); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const passaFev = (e) => passaFiltroColuna({ excluded: ['2027-1-11'], included: ['2027-2'] }, chaveInicio(e), true);

  it('sem o contexto, a filha de fevereiro ficava solta (comportamento anterior)', () => {
    expect(ids(etapas.filter(passaFev))).toEqual(['G2b', 'G4', 'G4a']); // G2 reprova: começa em janeiro
  });

  it('filtro de coluna (mês marcado): o grupo que começa em janeiro volta como separador', () => {
    expect(ids(filtrarComAncestrais(etapas, etapas, passaFev))).toEqual(['G2', 'G2b', 'G4', 'G4a']);
  });

  it('preset "Intervalo de datas": mesmo resultado', () => {
    const passa = buildTaskFilterPredicate({
      filtroResp: '', filtroPreset: 'intervalo', filtroPresetRange: { de: '2027-02-01', ate: '2027-02-28' },
      filtroTaskIds: [], filtroTexto: '', filtroVinculo: '', vinculadoIds: new Set(), etapas,
    });
    expect(ids(filtrarComAncestrais(etapas, etapas, passa))).toEqual(['G2', 'G2b', 'G4', 'G4a']);
  });

  it('vale para os outros filtros: busca por texto também mantém o grupo-pai', () => {
    const passa = buildTaskFilterPredicate({
      filtroResp: '', filtroPreset: '', filtroPresetRange: { de: '', ate: '' },
      filtroTaskIds: [], filtroTexto: 'tipo 3', filtroVinculo: '', vinculadoIds: new Set(), etapas,
    });
    expect(ids(filtrarComAncestrais(etapas, etapas, passa))).toEqual(['G2', 'G2b']);
  });
});
