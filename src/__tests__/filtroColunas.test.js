// Filtros de coluna da Medição: mesma regra da Lista (lista marcada ou condição) aplicada a uma linha.
import { describe, it, expect } from 'vitest';
import { passaFiltrosDeColuna, chaveDoValor } from '../modules/cronograma/filtroColunasPure';
import { FILTER_BLANK_KEY } from '../modules/cronograma/cronogramaShared';

const TIPOS = { descricao: 'text', inicio: 'date', medido: 'number' };
const tipoDe = (c) => TIPOS[c];
const linha = (descricao, inicioIso, medido) => (colId) => ({
  descricao: { raw: descricao, label: descricao },
  inicio: { raw: inicioIso ? new Date(`${inicioIso}T00:00:00`) : null, label: inicioIso || '' },
  medido: { raw: medido, label: medido == null ? '' : `${medido},00%` },
}[colId]);
const passa = (filtros, l, ignorar) => passaFiltrosDeColuna(filtros, l, tipoDe, ignorar);

describe('chaveDoValor', () => {
  it('data vira AAAA-M-D, vazio vira a chave de em branco, o resto usa o texto exibido', () => {
    expect(chaveDoValor('date', { raw: new Date('2026-10-05T00:00:00'), label: '05/10/2026' })).toBe('2026-10-5');
    expect(chaveDoValor('date', { raw: null, label: '' })).toBe(FILTER_BLANK_KEY);
    expect(chaveDoValor('text', { raw: 'Piso', label: 'Piso' })).toBe('Piso');
    expect(chaveDoValor('number', { raw: null, label: '' })).toBe(FILTER_BLANK_KEY);
  });
});

describe('passaFiltrosDeColuna', () => {
  it('sem filtros tudo passa', () => {
    expect(passa({}, linha('A', '2026-10-01', 10))).toBe(true);
    expect(passa(undefined, linha('A', '2026-10-01', 10))).toBe(true);
  });

  it('lista marcada: só passa quem está marcado', () => {
    const f = { descricao: { excluded: ['Piso'], included: ['Teto'] } };
    expect(passa(f, linha('Teto', '2026-10-01', 0))).toBe(true);
    expect(passa(f, linha('Piso', '2026-10-01', 0))).toBe(false);
  });

  it('data na lista marcada compara por dia, e o mês marcado vale para os dias dele', () => {
    const f = { inicio: { excluded: [], included: ['2026-10'] } };
    expect(passa(f, linha('A', '2026-10-17', 0))).toBe(true);
    expect(passa(f, linha('A', '2026-11-02', 0))).toBe(false);
  });

  it('condição de número: maior que', () => {
    const f = { medido: { condicoes: [{ op: 'maior', valor: '50' }], juncao: 'E' } };
    expect(passa(f, linha('A', null, 80))).toBe(true);
    expect(passa(f, linha('A', null, 50))).toBe(false);
  });

  it('condição de texto: contém, sem diferenciar acento nem maiúscula', () => {
    const f = { descricao: { condicoes: [{ op: 'contem', valor: 'ELETRICA' }], juncao: 'E' } };
    expect(passa(f, linha('Instalação elétrica', null, 0))).toBe(true);
    expect(passa(f, linha('Alvenaria', null, 0))).toBe(false);
  });

  it('vários filtros se somam (E entre colunas)', () => {
    const f = {
      descricao: { condicoes: [{ op: 'comeca', valor: 'Estrutura' }], juncao: 'E' },
      medido: { condicoes: [{ op: 'igual', valor: '100' }], juncao: 'E' },
    };
    expect(passa(f, linha('Estrutura - Piso', null, 100))).toBe(true);
    expect(passa(f, linha('Estrutura - Piso', null, 40))).toBe(false);
    expect(passa(f, linha('Alvenaria', null, 100))).toBe(false);
  });

  it('`ignorar` tira a própria coluna da conta (para listar os valores do menu dela)', () => {
    const f = { medido: { condicoes: [{ op: 'igual', valor: '100' }], juncao: 'E' } };
    expect(passa(f, linha('A', null, 40))).toBe(false);
    expect(passa(f, linha('A', null, 40), 'medido')).toBe(true);
  });
});
