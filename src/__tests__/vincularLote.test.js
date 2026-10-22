// Modal Vincular tarefas: além de SOMAR vínculos novos, altera os que a sucessora já tem (trocar a
// predecessora, mudar tipo e folga, remover). aplicarVinculosEmLote faz tudo de uma vez.
import { describe, it, expect } from 'vitest';
import { aplicarVinculosEmLote } from '../modules/cronograma/scheduleEngine';

const dep = (id, tipo = 'TI', lag = 0) => ({ id, tipo, lag });
const t = (id, extra = {}) => ({ id, etapa: id, isGroup: false, dep: [], ...extra });
const base = () => [
  t('A'), t('B'), t('C'), t('D'),
  t('S', { dep: [dep('A'), dep('B', 'TT', 2)] }),   // sucessora com dois vínculos atuais
  t('U', { dep: [dep('C')] }),
];
const depDe = (lista, id) => lista.find(e => e.id === id).dep;

describe('aplicarVinculosEmLote: vínculos novos (como antes)', () => {
  it('soma o vínculo novo com tipo e folga do meta, e conta o criado', () => {
    const r = aplicarVinculosEmLote(base(), { novos: [['U', 'D']], meta: { U: { tipo: 'II', lag: 3 } } });
    expect(depDe(r.etapas, 'U')).toEqual([dep('C'), dep('D', 'II', 3)]);
    expect(r).toMatchObject({ criados: 1, alterados: 0, removidos: 0, ignorados: 0 });
  });

  it('padrão TI e folga 0 sem meta', () => {
    const r = aplicarVinculosEmLote(base(), { novos: [['U', 'D']] });
    expect(depDe(r.etapas, 'U')).toEqual([dep('C'), dep('D')]);
  });

  it('par que já existe é ignorado e não muda nada', () => {
    const antes = base();
    const r = aplicarVinculosEmLote(antes, { novos: [['U', 'C']] });
    expect(r.ignorados).toBe(1);
    expect(r.criados).toBe(0);
    expect(r.etapas).toBe(antes);
  });

  it('nunca liga a tarefa a ela mesma', () => {
    const antes = base();
    const r = aplicarVinculosEmLote(antes, { novos: [['U', 'U']] });
    expect(r.etapas).toBe(antes);
    expect(r.criados).toBe(0);
  });
});

describe('aplicarVinculosEmLote: alterar os vínculos atuais', () => {
  it('trocar a predecessora mantém tipo e folga', () => {
    const r = aplicarVinculosEmLote(base(), { edicoes: { S: { B: { predId: 'D' } } } });
    expect(depDe(r.etapas, 'S')).toEqual([dep('A'), dep('D', 'TT', 2)]);
    expect(r).toMatchObject({ alterados: 1, removidos: 0, criados: 0 });
  });

  it('mudar tipo e folga do vínculo atual', () => {
    const r = aplicarVinculosEmLote(base(), { edicoes: { S: { A: { tipo: 'II', lag: 5 } } } });
    expect(depDe(r.etapas, 'S')).toEqual([dep('A', 'II', 5), dep('B', 'TT', 2)]);
    expect(r.alterados).toBe(1);
  });

  it('remover um vínculo atual', () => {
    const r = aplicarVinculosEmLote(base(), { edicoes: { S: { A: { remover: true } } } });
    expect(depDe(r.etapas, 'S')).toEqual([dep('B', 'TT', 2)]);
    expect(r).toMatchObject({ removidos: 1, alterados: 0 });
  });

  it('remover o último vínculo deixa a tarefa sem predecessora', () => {
    const r = aplicarVinculosEmLote(base(), { edicoes: { U: { C: { remover: true } } } });
    expect(depDe(r.etapas, 'U')).toEqual([]);
  });

  it('trocar uma e criar um novo na mesma sucessora, num único passo', () => {
    const r = aplicarVinculosEmLote(base(), { novos: [['S', 'C']], edicoes: { S: { A: { predId: 'D' }, B: { remover: true } } } });
    expect(depDe(r.etapas, 'S')).toEqual([dep('D'), dep('C')]);
    expect(r).toMatchObject({ criados: 1, alterados: 1, removidos: 1 });
  });

  it('trocar a predecessora para uma que a tarefa já tem em outro vínculo não duplica', () => {
    const r = aplicarVinculosEmLote(base(), { edicoes: { S: { B: { predId: 'A' } } } });
    expect(depDe(r.etapas, 'S')).toEqual([dep('A')]);
    expect(r.removidos).toBe(1);
  });

  it('trocar a predecessora para a própria tarefa descarta o vínculo (nunca autoligação)', () => {
    const r = aplicarVinculosEmLote(base(), { edicoes: { S: { A: { predId: 'S' } } } });
    expect(depDe(r.etapas, 'S')).toEqual([dep('B', 'TT', 2)]);
  });

  it('dep no formato antigo (texto) é normalizado ao editar', () => {
    const antes = [t('A'), t('B'), t('S', { dep: ['A'] })];
    const r = aplicarVinculosEmLote(antes, { edicoes: { S: { A: { tipo: 'TT' } } } });
    expect(depDe(r.etapas, 'S')).toEqual([dep('A', 'TT', 0)]);
  });

  it('editar com o valor de origem não conta como alteração', () => {
    const antes = base();
    const r = aplicarVinculosEmLote(antes, { edicoes: { S: { A: { tipo: 'TI', lag: 0 } } } });
    expect(r).toMatchObject({ alterados: 0, removidos: 0, criados: 0 });
    expect(r.etapas).toBe(antes);
  });
});

describe('aplicarVinculosEmLote: o que não deve mudar', () => {
  it('sem novos nem edições devolve o mesmo array', () => {
    const antes = base();
    expect(aplicarVinculosEmLote(antes, {}).etapas).toBe(antes);
    expect(aplicarVinculosEmLote(antes).etapas).toBe(antes);
  });

  it('só as tarefas afetadas ganham objeto novo', () => {
    const antes = base();
    const r = aplicarVinculosEmLote(antes, { edicoes: { S: { A: { remover: true } } } });
    expect(r.etapas.find(e => e.id === 'S')).not.toBe(antes.find(e => e.id === 'S'));
    for (const id of ['A', 'B', 'C', 'D', 'U']) {
      expect(r.etapas.find(e => e.id === id)).toBe(antes.find(e => e.id === id));
    }
  });

  it('não altera o array recebido nem os dep originais', () => {
    const antes = base();
    const snapshot = JSON.stringify(antes);
    aplicarVinculosEmLote(antes, { novos: [['U', 'D']], edicoes: { S: { A: { remover: true }, B: { lag: 9 } } } });
    expect(JSON.stringify(antes)).toBe(snapshot);
  });
});
