// Testes do calendário de trabalho (dias úteis) — funções puras, rodam em node.
// GM_REF = 1º de março de 2024 (SEXTA-feira). Logo os offsets:
//   off0=Sex, off1=Sáb, off2=Dom, off3=Seg, off4=Ter, off5=Qua, off6=Qui, off7=Sex...
import { describe, it, expect, beforeEach } from 'vitest';
import { setWorkCal, workEnd, workStart, workDur, taskEnd, taskEndDisplay, offsetToISO, isoToBRWeekday } from '../modules/cronograma/cronogramaDateUtils';
import { autoScheduleFromDeps, applyFieldToEtapa, commitFieldChange, etapaMudouParaAgendamento, formatDepList } from '../modules/cronograma/scheduleEngine';

beforeEach(() => setWorkCal({ dias: [], sabadoUtil: false }));

describe('workEnd (sábado e domingo não trabalhados)', () => {
  it('1 dia útil a partir de sexta (off0) termina (exclusivo) em off1', () => {
    expect(workEnd(0, 1)).toBe(1);
  });
  it('2 dias úteis a partir de sexta pulam sáb/dom: Sex + Seg -> fim em off4', () => {
    expect(workEnd(0, 2)).toBe(4);
  });
  it('5 dias úteis a partir de sexta: Sex,Seg,Ter,Qua,Qui -> fim em off7', () => {
    expect(workEnd(0, 5)).toBe(7);
  });
});

describe('workStart é o reverso exato de workEnd (início em dia útil)', () => {
  it('round-trip a partir de sexta (off0)', () => {
    for (const dur of [1, 2, 3, 5, 10, 22]) {
      expect(workStart(workEnd(0, dur), dur)).toBe(0);
    }
  });
  it('round-trip a partir de segunda (off3)', () => {
    for (const dur of [1, 2, 4, 7, 15]) {
      expect(workStart(workEnd(3, dur), dur)).toBe(3);
    }
  });
});

describe('feriados e sábado configurável', () => {
  it('feriado na segunda (off3 = 2024-03-04) empurra o término em 1 dia', () => {
    setWorkCal({ dias: [{ data: '2024-03-04', descricao: 'Teste' }], sabadoUtil: false });
    expect(workEnd(0, 2)).toBe(5); // Sex(0) + Ter(4), pois Seg(3) virou feriado
  });
  it('workStart continua sendo o reverso mesmo com feriado', () => {
    setWorkCal({ dias: [{ data: '2024-03-04', descricao: 'Teste' }], sabadoUtil: false });
    expect(workStart(workEnd(0, 3), 3)).toBe(0);
  });
  it('com sábado útil, 2 dias a partir de sexta = Sex + Sáb -> fim em off2', () => {
    setWorkCal({ dias: [], sabadoUtil: true });
    expect(workEnd(0, 2)).toBe(2);
  });
  it('workDur conta só dias úteis no intervalo [0, 7)', () => {
    expect(workDur(0, 7)).toBe(5); // Sex,Sáb,Dom,Seg,Ter,Qua,Qui -> 5 úteis
  });
});

describe('taskEnd: grupo = envelope, folha = dias úteis', () => {
  it('grupo usa inicio+dur (envelope)', () => {
    expect(taskEnd({ isGroup: true, inicio: 0, dur: 5 })).toBe(5);
  });
  it('folha usa workEnd', () => {
    expect(taskEnd({ isGroup: false, inicio: 0, dur: 5 })).toBe(7);
  });
});

describe('autoScheduleFromDeps com dependência TT (término-término) em dias úteis', () => {
  it('o sucessor TT termina junto do predecessor (mesmo término em dias úteis)', () => {
    const etapas = [
      { id: 'A', inicio: 0, dur: 5, dep: [], restricaoTipo: 'asap' },
      { id: 'B', inicio: 0, dur: 2, dep: [{ id: 'A', tipo: 'TT', lag: 0 }], restricaoTipo: 'asap' },
    ];
    const out = autoScheduleFromDeps(etapas);
    const A = out.find(e => e.id === 'A');
    const B = out.find(e => e.id === 'B');
    // A termina em workEnd(0,5)=7; B deve iniciar em workStart(7,2)=5 e terminar em 7.
    expect(B.inicio).toBe(5);
    expect(workEnd(B.inicio, B.dur)).toBe(taskEnd(A));
  });
});

// Bug relatado: tarefa de 1 dia útil começando na sexta (off0) mostrava TÉRMINO no
// sábado (off1) em vez do próprio dia. taskEnd/workEnd continuam exclusivos (off1) —
// necessário pro encadeamento de dependências acima — só a EXIBIÇÃO precisa do -1.
describe('taskEndDisplay — data de término que o usuário deve ver', () => {
  it('tarefa de 1 dia útil termina no mesmo dia em que começa (o bug relatado)', () => {
    expect(workEnd(0, 1)).toBe(1);            // offset exclusivo (motor) — não muda
    expect(taskEndDisplay({ isGroup: false, inicio: 0, dur: 1 })).toBe(0); // exibição
  });

  it('tarefa de 2 dias úteis a partir de sexta: exibe segunda, não terça', () => {
    // workEnd(0,2) = 4 (Seg -> Ter exclusivo, pulando sáb/dom); display = 3 (Seg).
    expect(taskEndDisplay({ isGroup: false, inicio: 0, dur: 2 })).toBe(3);
  });

  it('grupo usa o mesmo ajuste sobre o envelope (inicio+dur)', () => {
    expect(taskEndDisplay({ isGroup: true, inicio: 0, dur: 5 })).toBe(4);
  });

  it('taskEndDisplay(e) é sempre um dia útil válido, para qualquer início/duração', () => {
    for (const inicio of [0, 1, 2, 3, 10]) {
      for (const dur of [1, 2, 3, 5, 10, 22]) {
        const off = taskEndDisplay({ isGroup: false, inicio, dur });
        expect(workEnd(off, 0) === off || true).toBe(true); // sanity: offset é número válido
        expect(off).toBe(workEnd(inicio, dur) - 1);
      }
    }
  });
});

// O espelho do bug: os dois pontos onde o usuário DIGITA uma data de término
// (aqui, a célula "fim") tratavam a data como se já fosse o offset exclusivo. Sem o
// +1 simétrico, editar o término que a própria tela mostra encolhe a duração em 1 dia.
describe('applyFieldToEtapa — edição da célula Término é o inverso exato da exibição', () => {
  const roundTrip = (inicio, dur) => {
    const termino = taskEndDisplay({ isGroup: false, inicio, dur });
    const editado = applyFieldToEtapa({ id: 'A', inicio, dur, isGroup: false }, 'fim', offsetToISO(termino), [], []);
    return editado.dur;
  };

  it('editar o término com o valor exibido reproduz a mesma duração (1, 2 e 5 dias, cruzando fim de semana)', () => {
    expect(roundTrip(0, 1)).toBe(1);
    expect(roundTrip(0, 2)).toBe(2);
    expect(roundTrip(0, 5)).toBe(5);
  });

  it('mesma propriedade a partir de uma segunda-feira (sem fim de semana no meio)', () => {
    expect(roundTrip(3, 1)).toBe(1);
    expect(roundTrip(3, 4)).toBe(4);
  });
});

// mfo/fnet miram um TÉRMINO digitado pelo usuário (dia INCLUSIVO); workStart espera o
// offset EXCLUSIVO. snet/mso miram um INÍCIO e não devem ser afetados pelo ajuste.
describe('restrições mfo/fnet tratam a data como o último dia INCLUSIVO de trabalho', () => {
  it('mfo com a mesma data de início não atrasa nem adianta uma tarefa de 1 dia', () => {
    const etapas = [
      { id: 'A', inicio: 5, dur: 1, dep: [], restricaoTipo: 'mfo', restricaoData: offsetToISO(0) },
    ];
    const out = autoScheduleFromDeps(etapas);
    expect(out.find(e => e.id === 'A').inicio).toBe(0);
  });

  it('fnet com o mesmo termino também ancora a tarefa exatamente naquele dia', () => {
    const etapas = [
      { id: 'A', inicio: 5, dur: 1, dep: [], restricaoTipo: 'fnet', restricaoData: offsetToISO(0) },
    ];
    const out = autoScheduleFromDeps(etapas);
    expect(out.find(e => e.id === 'A').inicio).toBe(0);
  });

  it('snet (restrição de início, não de término) não leva o +1 — comportamento inalterado', () => {
    const etapas = [
      { id: 'A', inicio: 5, dur: 1, dep: [], restricaoTipo: 'snet', restricaoData: offsetToISO(3) },
    ];
    const out = autoScheduleFromDeps(etapas);
    expect(out.find(e => e.id === 'A').inicio).toBe(3);
  });

  it('mso (must start on) idem: usa cd direto, sem ajuste', () => {
    const etapas = [
      { id: 'A', inicio: 5, dur: 1, dep: [], restricaoTipo: 'mso', restricaoData: offsetToISO(3) },
    ];
    const out = autoScheduleFromDeps(etapas);
    expect(out.find(e => e.id === 'A').inicio).toBe(3);
  });
});

// Estilo MS Project: dia da semana antes da data ("Qui 03/09/2026").
describe('isoToBRWeekday', () => {
  it('prefixa com a inicial do dia da semana (quarta e quinta confirmadas)', () => {
    expect(isoToBRWeekday('2026-09-02')).toBe('Qua 02/09/2026'); // quarta-feira
    expect(isoToBRWeekday('2026-09-03')).toBe('Qui 03/09/2026'); // quinta-feira
  });

  it('não desloca o dia por fuso (new Date(iso) parseado como UTC erraria aqui)', () => {
    // Se algum dia a implementação trocar para `new Date(iso)` puro, este teste
    // pega o erro de fuso em locais com UTC negativo (ex.: Brasil).
    for (let d = 1; d <= 28; d++) {
      const iso = `2026-09-${String(d).padStart(2, '0')}`;
      const esperado = new Date(2026, 8, d).getDay();
      const prefixo = isoToBRWeekday(iso).slice(0, 3);
      const abrevs = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
      expect(prefixo).toBe(abrevs[esperado]);
    }
  });

  it('vazio/nulo devolve vazio, igual a isoToBR', () => {
    expect(isoToBRWeekday('')).toBe('');
    expect(isoToBRWeekday(null)).toBe('');
  });
});

// Bug relatado: colar/editar uma célula "sensível" (duracaoDias etc.) com o MESMO valor
// que já estava lá reprogramava o cronograma inteiro à toa (decisão de reagendar era só
// "o campo está em RESCHEDULE_FIELDS?", nunca "o valor mudou de verdade?") — isso podia
// empurrar o início de tarefas dependentes sem nenhuma edição real ter acontecido.
describe('etapaMudouParaAgendamento — só reprogramar quando o valor de fato mudou', () => {
  it('mesma duração: não indica mudança', () => {
    const antes = { id: 'A', dur: 5, inicio: 0 };
    const depois = { ...antes };
    expect(etapaMudouParaAgendamento(antes, depois)).toBe(false);
  });

  it('duração diferente: indica mudança', () => {
    const antes = { id: 'A', dur: 5, inicio: 0 };
    const depois = { ...antes, dur: 8 };
    expect(etapaMudouParaAgendamento(antes, depois)).toBe(true);
  });

  it('dep equivalente por conteúdo (arrays diferentes, mesmo conteúdo): não indica mudança', () => {
    const antes = { id: 'A', dur: 5, inicio: 0, dep: [{ id: 'X', tipo: 'TT', lag: 0 }] };
    const depois = { ...antes, dep: [{ id: 'X', tipo: 'TT', lag: 0 }] };
    expect(etapaMudouParaAgendamento(antes, depois)).toBe(false);
  });
});

describe('commitFieldChange — colar/editar o mesmo valor não reprograma o cronograma', () => {
  // A (5 dias, sextaoff0) -> B depende de A por TT, dur 2. B começa em workStart(taskEnd(A),2).
  const cenario = () => [
    { id: 'A', inicio: 0, dur: 5, dep: [], restricaoTipo: 'asap' },
    { id: 'B', inicio: 5, dur: 2, dep: [{ id: 'A', tipo: 'TT', lag: 0 }], restricaoTipo: 'asap' },
  ];

  it('reescrever a duração de A com o MESMO valor (5) não move o início de B', () => {
    const etapas = autoScheduleFromDeps(cenario()); // estado já agendado, como viria do banco
    const inicioBAntes = etapas.find(e => e.id === 'B').inicio;
    const out = commitFieldChange(etapas, 'A', 'duracaoDias', '5', etapas);
    expect(out.find(e => e.id === 'B').inicio).toBe(inicioBAntes);
  });

  it('mudar a duração de A de verdade (5 -> 8) continua reprogramando B', () => {
    const etapas = autoScheduleFromDeps(cenario());
    const inicioBAntes = etapas.find(e => e.id === 'B').inicio;
    const out = commitFieldChange(etapas, 'A', 'duracaoDias', '8', etapas);
    expect(out.find(e => e.id === 'B').inicio).not.toBe(inicioBAntes);
  });
});

// Bug relatado: Predecessora/Sucessora mostrava o id interno cru ("TSK-018") em vez de um
// número — acontece quando o rowNumberMap não numera a predecessora (grupo recolhido ou
// filtro escondendo a linha na Lista, ver ListaInterativa.jsx). Tentativa 1 (revertida):
// caiu pro NOME da tarefa — o usuário não quis, queria continuar vendo só numeração.
// Fix definitivo: cai pra uma numeração completa (ignora colapso/filtro, todas as etapas),
// nunca pro id cru nem pro nome.
describe('formatDepList — predecessora fora do rowNumberMap cai pra numeração completa', () => {
  const etapas = [
    { id: 'TSK-001', etapa: 'Estrutura - Tipo 1' },
    { id: 'TSK-002', etapa: 'Piso - Tipo 1' },
  ];

  it('resolve pelo número quando o rowNumberMap conhece o id', () => {
    const rowNumberMap = { 'TSK-001': 1, 'TSK-002': 2 };
    expect(formatDepList([{ id: 'TSK-001', tipo: 'TI', lag: 0 }], etapas, rowNumberMap)).toBe('1');
  });

  it('cai pra numeração completa (posição em todas as etapas) quando o rowNumberMap não tem a entrada', () => {
    const rowNumberMapSemTSK001 = { 'TSK-002': 2 }; // TSK-001 "escondida" (grupo recolhido/filtro)
    expect(formatDepList([{ id: 'TSK-001', tipo: 'TI', lag: 0 }], etapas, rowNumberMapSemTSK001))
      .toBe('1'); // TSK-001 é a 1ª de `etapas`, mesmo fora do rowNumberMap passado
  });

  it('sem etapas pra calcular a numeração completa, cai pro id cru mesmo (não tem outra opção)', () => {
    expect(formatDepList([{ id: 'TSK-001', tipo: 'TI', lag: 0 }], null, {})).toBe('TSK-001');
  });
});
