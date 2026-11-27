// Testes de qual grupo o atalho "Distribuir pesos" abre a partir da Lista. Executar: npm test
import { describe, it, expect } from 'vitest';
import { alvoDistribuicao } from '../modules/cronograma/distribuicaoAlvoPure';

// G1 (grupo) > F1, F2 (folhas); G2 (grupo) > G3 (grupo) > F3; F4 solta na raiz.
const etapas = [
  { id: 'G1', parentId: null, isGroup: true },
  { id: 'F1', parentId: 'G1', isGroup: false },
  { id: 'F2', parentId: 'G1', isGroup: false },
  { id: 'G2', parentId: null, isGroup: true },
  { id: 'G3', parentId: 'G2', isGroup: true },
  { id: 'F3', parentId: 'G3', isGroup: false },
  { id: 'F4', parentId: null, isGroup: false },
];
const vinc = (...ids) => (id) => ids.includes(id);

describe('alvoDistribuicao', () => {
  it('grupo com vínculo direto abre a própria distribuição', () => {
    expect(alvoDistribuicao({ etapas, id: 'G1', comVinculo: vinc('G1') })).toBe('G1');
  });

  it('folha abre a distribuição do grupo pai vinculado', () => {
    expect(alvoDistribuicao({ etapas, id: 'F2', comVinculo: vinc('G1') })).toBe('G1');
  });

  it('subgrupo sem vínculo próprio sobe até o grupo vinculado que reparte o peso dele', () => {
    expect(alvoDistribuicao({ etapas, id: 'G3', comVinculo: vinc('G2') })).toBe('G2');
  });

  it('folha de subgrupo sobe até o grupo vinculado, passando pelos grupos sem vínculo', () => {
    expect(alvoDistribuicao({ etapas, id: 'F3', comVinculo: vinc('G2') })).toBe('G2');
  });

  it('o grupo mais próximo ganha quando há vínculo em mais de um nível', () => {
    expect(alvoDistribuicao({ etapas, id: 'F3', comVinculo: vinc('G2', 'G3') })).toBe('G3');
    expect(alvoDistribuicao({ etapas, id: 'G3', comVinculo: vinc('G2', 'G3') })).toBe('G3');
  });

  it('folha com vínculo direto não conta como alvo: distribuição é de grupo', () => {
    expect(alvoDistribuicao({ etapas, id: 'F1', comVinculo: vinc('F1') })).toBeNull();
    expect(alvoDistribuicao({ etapas, id: 'F1', comVinculo: vinc('F1', 'G1') })).toBe('G1');
  });

  it('grupo sem nenhum vínculo da linha para cima não abre', () => {
    expect(alvoDistribuicao({ etapas, id: 'G2', comVinculo: vinc('G1') })).toBeNull();
    expect(alvoDistribuicao({ etapas, id: 'F3', comVinculo: vinc('G1') })).toBeNull();
  });

  it('um grupo vinculado não é alvo de linha que está fora dele', () => {
    expect(alvoDistribuicao({ etapas, id: 'F1', comVinculo: vinc('G2') })).toBeNull();
  });

  it('folha na raiz, sem pai, não tem o que abrir', () => {
    expect(alvoDistribuicao({ etapas, id: 'F4', comVinculo: vinc('G1', 'G2') })).toBeNull();
  });

  it('id que não existe devolve null', () => {
    expect(alvoDistribuicao({ etapas, id: 'XX', comVinculo: vinc('G1') })).toBeNull();
    expect(alvoDistribuicao({ etapas: [], id: 'G1', comVinculo: vinc('G1') })).toBeNull();
  });

  it('parentId em ciclo não trava', () => {
    const ciclo = [
      { id: 'A', parentId: 'B', isGroup: true },
      { id: 'B', parentId: 'A', isGroup: true },
    ];
    expect(alvoDistribuicao({ etapas: ciclo, id: 'A', comVinculo: vinc() })).toBeNull();
  });

  it('sem comVinculo informado, nada abre', () => {
    expect(alvoDistribuicao({ etapas, id: 'G1' })).toBeNull();
  });
});
