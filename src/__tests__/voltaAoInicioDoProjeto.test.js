// Tarefa que perde a última predecessora volta ao início do projeto (estilo MS Project).
// Antes ficava na data que a ligação lhe tinha dado: o agendador não recalcula tarefa livre.
import { describe, it, expect, beforeEach } from 'vitest';
import { setWorkCal, dateToOffset } from '../modules/cronograma/cronogramaDateUtils';
import {
  commitFieldChange, deleteTask, autoScheduleFromDeps, voltarAoInicioDoProjeto,
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

// Cadeia por pavimento (caso Sprinkler da ÍON): A -> B -> C, e S depende de C.
const cadeia = () => autoScheduleFromDeps([
  t('A', 1),
  t('B', 2, { dep: [dep('A')] }),
  t('C', 3, { dep: [dep('B')] }),
  t('S', 4, { dep: [dep('C')] }),
]);
const inicioDe = (etapas, id) => etapas.find(e => e.id === id).inicio;

describe('voltarAoInicioDoProjeto', () => {
  it('remover a única predecessora: a tarefa volta ao início do projeto e a sucessora dela acompanha', () => {
    const antes = cadeia();
    expect(inicioDe(antes, 'C')).toBeGreaterThan(INICIO); // empurrada pela ligação
    const sInicioAntes = inicioDe(antes, 'S');

    const editada = commitFieldChange(antes, 'C', 'dep', '');           // apaga a célula Predecessora
    expect(inicioDe(editada, 'C')).toBe(inicioDe(antes, 'C'));          // o agendador sozinho NÃO move (era o bug)

    const depois = voltarAoInicioDoProjeto(antes, editada);
    expect(inicioDe(depois, 'C')).toBe(INICIO);
    expect(inicioDe(depois, 'S')).toBeLessThan(sInicioAntes);           // a sucessora puxou junto
    expect(inicioDe(depois, 'S')).toBe(INICIO + 7);                     // 5 dias úteis depois (fim de semana no meio)
  });

  it('remover uma de duas predecessoras: nada muda', () => {
    const antes = autoScheduleFromDeps([
      t('A', 1), t('B', 2),
      t('C', 3, { dep: [dep('A'), dep('B')] }),
    ]);
    const editada = commitFieldChange(antes, 'C', 'dep', '1');          // mantém só a A
    expect(voltarAoInicioDoProjeto(antes, editada)).toBe(editada);
  });

  it('predecessora EXCLUÍDA (não só a ligação removida): a data não muda', () => {
    const antes = cadeia();
    const semB = deleteTask('B', antes);                                // C perde o dep porque B sumiu
    expect(semB.find(e => e.id === 'C').dep).toEqual([]);
    expect(voltarAoInicioDoProjeto(antes, semB)).toBe(semB);
  });

  it('não mexe em grupo, tarefa manual, concluída nem tarefa com restrição de data', () => {
    const base = () => autoScheduleFromDeps([
      t('A', 1),
      t('G', 2, { isGroup: true, inicio: INICIO + 20, dep: [dep('A')] }),
      t('M', 3, { modo: 'manual', inicio: INICIO + 20, dep: [dep('A')] }),
      t('D', 4, { avanco: 100, inicio: INICIO + 20, dep: [dep('A')] }),
      t('R', 5, { restricaoTipo: 'snet', restricaoData: '2026-09-15', dep: [dep('A')] }),
      t('F', 6, { restricaoTipo: 'snlt', restricaoData: '2026-10-30', inicio: INICIO + 20, dep: [dep('A')] }),
    ]);
    const antes = base();
    const depois = antes.map(e => (e.id === 'A' ? e : { ...e, dep: [] }));
    expect(voltarAoInicioDoProjeto(antes, depois)).toBe(depois);
  });

  it('tarefa com restrição SNET continua indo para a data da restrição (já era assim, pelo agendador)', () => {
    const antes = autoScheduleFromDeps([
      t('A', 1, { dur: 30 }),
      t('R', 2, { restricaoTipo: 'snet', restricaoData: '2026-09-15', dep: [dep('A')] }),
    ]);
    const editada = commitFieldChange(antes, 'R', 'dep', '');
    expect(inicioDe(editada, 'R')).toBe(dateToOffset('2026-09-15'));
    expect(voltarAoInicioDoProjeto(antes, editada)).toBe(editada);
  });

  it('tarefa já no início do projeto, ou sem mudança de dependência: devolve o mesmo array', () => {
    const antes = autoScheduleFromDeps([t('A', 1), t('B', 2, { dep: [dep('A')] })]);
    expect(voltarAoInicioDoProjeto(antes, antes)).toBe(antes);          // nenhuma dependência mudou
    const livre = [t('A', 1), t('B', 2, { inicio: INICIO + 30 })];      // sem predecessora desde sempre
    expect(voltarAoInicioDoProjeto(livre, livre)).toBe(livre);          // datas digitadas à mão ficam
    const noInicio = [t('A', 1), t('B', 2, { dep: [dep('A')] })];
    const semDep = noInicio.map(e => (e.id === 'B' ? { ...e, dep: [], inicio: INICIO } : e));
    expect(voltarAoInicioDoProjeto(noInicio, semDep)).toBe(semDep);     // já estava no início
  });

  it('tarefa nova (sem estado anterior) e antes vazio não quebram', () => {
    const depois = [t('A', 1), t('NOVA', 2, { inicio: INICIO + 10 })];
    expect(voltarAoInicioDoProjeto(undefined, depois)).toBe(depois);
    expect(voltarAoInicioDoProjeto([], depois)).toBe(depois);
  });

  it('dependência no formato antigo (texto) também conta', () => {
    const antes = autoScheduleFromDeps([t('A', 1), t('B', 2, { dep: ['A'], inicio: INICIO + 40 })]);
    const depois = antes.map(e => (e.id === 'B' ? { ...e, dep: [] } : e));
    const out = voltarAoInicioDoProjeto(antes, depois);
    expect(inicioDe(out, 'B')).toBe(INICIO);
  });

  it('caso real reduzido (Sprinkler da ÍON): a 319 ligada à 318 volta ao início ao remover a ligação', () => {
    const antes = autoScheduleFromDeps([
      t('P315', 315, { inicio: INICIO }),
      t('P316', 316, { dep: [dep('P315')] }),
      t('P317', 317, { dep: [dep('P316')] }),
      t('P318', 318, { dep: [dep('P317')] }),
      t('P319', 319, { dep: [dep('P318')] }),
    ]);
    const posicaoLigada = inicioDe(antes, 'P319');
    const editada = commitFieldChange(antes, 'P319', 'dep', '');
    expect(inicioDe(editada, 'P319')).toBe(posicaoLigada);              // antes da correção: ficava aqui
    const depois = voltarAoInicioDoProjeto(antes, editada);
    expect(inicioDe(depois, 'P319')).toBe(INICIO);                      // agora: volta
    expect(inicioDe(depois, 'P318')).toBe(inicioDe(antes, 'P318'));     // as outras não se mexem
  });
});
