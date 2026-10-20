// "OK" nos conflitos de precedência: some do aviso, vale para a obra toda (fica na etapa sucessora)
// e volta a avisar se o conflito desaparecer e reaparecer.
import { describe, it, expect, beforeEach } from 'vitest';
import { setWorkCal, dateToOffset } from '../modules/cronograma/cronogramaDateUtils';
import { gmConflicts } from '../modules/cronograma/cronogramaShared';
import {
  classificarConflitos, confirmarConflitos, desfazerConfirmacao, podarConfirmacoes,
} from '../modules/cronograma/conflitosOkPure';

beforeEach(() => setWorkCal({ dias: [], sabadoUtil: false }));

const INICIO = dateToOffset('2026-09-01');
const t = (id, extra = {}) => ({
  id, displayId: Number(id.replace(/\D/g, '')) || 1, etapa: `Tarefa ${id}`, nivel: 0, parentId: null,
  isGroup: false, inicio: INICIO, dur: 5, avanco: 0, dep: [], ...extra,
});
const dep = (id, tipo = 'TI', lag = 0) => ({ id, tipo, lag });
const QUEM = { por: 'Maria', em: '2026-10-20T12:00:00.000Z' };

// P termina depois do início de S (S depende do término de P): 1 conflito. Q igual: 2º conflito.
const cenario = () => [
  t('P', { inicio: INICIO + 20 }),
  t('Q', { inicio: INICIO + 20 }),
  t('S', { inicio: INICIO, dep: [dep('P')] }),
  t('U', { inicio: INICIO, dep: [dep('Q')] }),
];

describe('classificarConflitos', () => {
  it('sem OK: tudo é ativo', () => {
    const { ativos, confirmados } = classificarConflitos(cenario());
    expect(ativos.map(c => `${c.pred}>${c.succ}`)).toEqual(['P>S', 'Q>U']);
    expect(confirmados).toEqual([]);
  });

  it('com OK: o conflito sai dos ativos e vai para os confirmados, com quem e quando', () => {
    const etapas = confirmarConflitos(cenario(), [{ pred: 'P', succ: 'S', tipo: 'TI', lag: 0 }], QUEM);
    const { ativos, confirmados } = classificarConflitos(etapas);
    expect(ativos.map(c => c.succ)).toEqual(['U']);
    expect(confirmados).toHaveLength(1);
    expect(confirmados[0]).toMatchObject({ pred: 'P', succ: 'S', por: 'Maria', em: QUEM.em });
  });
});

describe('confirmarConflitos / desfazerConfirmacao', () => {
  it('OK em todos: confirma os dois de uma vez, só nas sucessoras', () => {
    const base = cenario();
    const etapas = confirmarConflitos(base, gmConflicts(base), QUEM);
    expect(classificarConflitos(etapas).ativos).toEqual([]);
    expect(etapas.find(e => e.id === 'P').conflitosOk).toBeUndefined();
    expect(etapas.find(e => e.id === 'S').conflitosOk).toEqual([{ pred: 'P', tipo: 'TI', lag: 0, ...QUEM }]);
  });

  it('não altera o array original e não duplica o mesmo OK', () => {
    const base = cenario();
    const c = gmConflicts(base);
    const uma = confirmarConflitos(base, c, QUEM);
    expect(base.every(e => e.conflitosOk === undefined)).toBe(true);
    expect(confirmarConflitos(uma, c, QUEM)).toBe(uma);                    // já tinha: mesmo array
  });

  it('desfazer: volta a avisar e a etapa fica idêntica à de antes (sem o campo)', () => {
    const base = cenario();
    const c = gmConflicts(base)[0];
    const comOk = confirmarConflitos(base, [c], QUEM);
    const desfeito = desfazerConfirmacao(comOk, c);
    expect(classificarConflitos(desfeito).ativos).toHaveLength(2);
    expect(JSON.stringify(desfeito)).toBe(JSON.stringify(base));
    expect(desfazerConfirmacao(desfeito, c)).toBe(desfeito);               // nada a desfazer
  });

  it('o OK de um conflito não vale para outra dependência da mesma tarefa', () => {
    const base = [
      t('P', { inicio: INICIO + 20 }),
      t('Q', { inicio: INICIO + 20 }),
      t('S', { inicio: INICIO, dep: [dep('P'), dep('Q')] }),
    ];
    const [cP, cQ] = gmConflicts(base);
    const etapas = confirmarConflitos(base, [cP], QUEM);
    const { ativos, confirmados } = classificarConflitos(etapas);
    expect(confirmados.map(c => c.pred)).toEqual(['P']);
    expect(ativos.map(c => c.pred)).toEqual(['Q']);
    expect(cQ.pred).toBe('Q');
  });
});

describe('podarConfirmacoes', () => {
  it('conflito que continua existindo mantém o OK e devolve o mesmo array', () => {
    const etapas = confirmarConflitos(cenario(), gmConflicts(cenario()), QUEM);
    expect(podarConfirmacoes(etapas)).toBe(etapas);
  });

  it('conflito corrigido: o OK é podado; se voltar a acontecer, avisa de novo', () => {
    const etapas = confirmarConflitos(cenario(), gmConflicts(cenario()), QUEM);
    // S passa a começar depois do término de P: o conflito P>S some
    const corrigido = etapas.map(e => (e.id === 'S' ? { ...e, inicio: INICIO + 40 } : e));
    const podado = podarConfirmacoes(corrigido);
    expect(podado.find(e => e.id === 'S').conflitosOk).toBeUndefined();
    expect(podado.find(e => e.id === 'U').conflitosOk).toHaveLength(1);    // o outro segue com OK
    // volta ao estado conflitante: já não há OK guardado, então avisa
    const voltou = podado.map(e => (e.id === 'S' ? { ...e, inicio: INICIO } : e));
    expect(classificarConflitos(voltou).ativos.map(c => c.succ)).toEqual(['S']);
  });

  it('ligação removida ou tarefa excluída: OK podado', () => {
    const etapas = confirmarConflitos(cenario(), gmConflicts(cenario()), QUEM);
    const semLigacao = etapas.map(e => (e.id === 'S' ? { ...e, dep: [] } : e));
    expect(podarConfirmacoes(semLigacao).find(e => e.id === 'S').conflitosOk).toBeUndefined();
    const semU = etapas.filter(e => e.id !== 'U');
    expect(podarConfirmacoes(semU).some(e => e.id === 'U')).toBe(false);
  });

  it('mudar o lag da ligação conta como outra dependência: o OK antigo não vale mais', () => {
    const etapas = confirmarConflitos(cenario(), gmConflicts(cenario()), QUEM);
    const lagNovo = etapas.map(e => (e.id === 'S' ? { ...e, dep: [dep('P', 'TI', 2)] } : e));
    const { ativos } = classificarConflitos(lagNovo);
    expect(ativos.map(c => c.succ)).toContain('S');
    expect(podarConfirmacoes(lagNovo).find(e => e.id === 'S').conflitosOk).toBeUndefined();
  });

  it('sem nenhum OK nas etapas: não faz trabalho e devolve o mesmo array', () => {
    const base = cenario();
    expect(podarConfirmacoes(base)).toBe(base);
  });
});
