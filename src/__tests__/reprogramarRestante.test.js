// Testes de reprogramarRestante — fraciona uma tarefa parcialmente executada em
// duas: o pedaço já feito (100%, fica onde estava) e o restante (empurrado pro
// dia 1 do mês seguinte ao término do fragmento já executado, com "não iniciar antes de").
// Funções puras, rodam em node.
import { describe, it, expect, beforeEach } from 'vitest';
import { setWorkCal, dateToOffset, offsetToISO, taskEnd } from '../modules/cronograma/cronogramaDateUtils';
import { reprogramarRestante, commitFieldChange, computeMonthlyDist, computeSuccessors } from '../modules/cronograma/scheduleEngine';
import { computeValorVinculadoMap } from '../modules/cronograma/ganttUtils';
import { gmConflicts } from '../modules/cronograma/cronogramaShared';

beforeEach(() => {
  setWorkCal({ dias: [], sabadoUtil: false });
});

const baseTarefa = (over = {}) => ({
  id: 'T1', displayId: 1, etapa: 'Alvenaria', nivel: 0, parentId: null,
  isGroup: false, collapsed: false,
  inicio: 0, dur: 20, avanco: 50, status: 'upcoming', dep: [],
  milestone: false, responsavel: '', customCols: {}, custo: 1000, custoRealizado: 300,
  restricaoTipo: 'asap', restricaoData: '', fator_peso: 1, valorVinculadoFixo: null,
  modo: 'auto', showInDist: false, pavimento: '',
  ...over,
});

describe('reprogramarRestante', () => {
  it('vira a tarefa num grupo com 2 folhas, split proporcional ao avanço', () => {
    const out = reprogramarRestante('T1', [baseTarefa()]);
    const grupo = out.find(e => e.id === 'T1');
    expect(grupo.isGroup).toBe(true);

    const filhos = out.filter(e => e.parentId === 'T1');
    expect(filhos).toHaveLength(2);
    const fechado  = filhos.find(f => f.avanco === 100);
    const restante = filhos.find(f => f.avanco === 0);
    expect(fechado).toBeTruthy();
    expect(restante).toBeTruthy();

    expect(fechado.fator_peso).toBe(50);
    expect(restante.fator_peso).toBe(50);
    expect(fechado.custo).toBe(500);
    expect(restante.custo).toBe(500);
    expect(fechado.custoRealizado).toBe(150);
    expect(restante.custoRealizado).toBe(150);
    expect(fechado.dur).toBe(10);
    expect(restante.dur).toBe(10);
    expect(fechado.inicio).toBe(0); // mesma posição da tarefa original
    expect(fechado.status).toBe('done');
    expect(restante.status).toBe('upcoming');
    expect(fechado.valorVinculadoFixo).toBeNull();
    expect(restante.valorVinculadoFixo).toBeNull();
  });

  it('restante fica com "não iniciar antes de" (snet) no dia 1 do mês seguinte ao término do executado', () => {
    const out = reprogramarRestante('T1', [baseTarefa()]);
    const restante = out.find(e => e.parentId === 'T1' && e.avanco === 0);
    // inicio:0 (01/03/2024) + fechadoDur:10 dias úteis -> workEnd(0,10) = offset 14 = 15/03/2024.
    // Mês seguinte a março/2024 = abril/2024. Sem predecessora mais tardia, começa no dia 1º.
    expect(restante.restricaoTipo).toBe('snet');
    expect(restante.restricaoData).toBe('2024-04-01');
    expect(restante.inicio).toBe(dateToOffset('2024-04-01'));
  });

  it('restante cuja predecessora termina depois do dia 1º espera por ela, sem conflito (caso ÍON 706/707/710)', () => {
    // A 7ª depende (TI) da 6ª. Reprogramadas as duas no mesmo mês, os dois restantes caem no
    // dia 1º do mês seguinte. Com "deve iniciar em" o da 7ª ficava cravado no mesmo dia do da
    // 6ª e acusava conflito; com "não iniciar antes de" ele passa para depois do término do da 6ª.
    // A 7ª é dividida ANTES da 6ª (ordem do caso real), então o "(executado)" 100% da 7ª já existe
    // quando a 6ª é dividida: ele não pode ficar preso ao restante da 6ª (ver religarSucessoras).
    const sexta = baseTarefa({ id: 'T6', etapa: '6º Tipo II', inicio: dateToOffset('2024-03-01'), dur: 10, avanco: 50 });
    const setima = baseTarefa({ id: 'T7', etapa: '7º Tipo II', inicio: dateToOffset('2024-03-15'), dur: 10, avanco: 50, dep: [{ id: 'T6', tipo: 'TI', lag: 0 }] });
    const depoisDa7 = reprogramarRestante('T7', [sexta, setima]);
    const out = reprogramarRestante('T6', depoisDa7);

    const folha = (idPai, avanco) => out.find(e => e.parentId === idPai && e.avanco === avanco);
    const f6 = folha('T6', 100), r6 = folha('T6', 0);
    const f7 = folha('T7', 100), r7 = folha('T7', 0);
    expect(r6.inicio).toBe(dateToOffset('2024-04-01'));
    expect(r7.restricaoTipo).toBe('snet');
    // o restante da 7ª começa quando o da 6ª termina, e não no mesmo dia 1º
    expect(r7.inicio).toBeGreaterThanOrEqual(taskEnd(r6));
    // restante espera os dois pedaços da 6ª; o executado (100%) liga só ao executado da 6ª
    expect(r7.dep.map(d => d.id).sort()).toEqual([f6.id, r6.id].sort());
    expect(f7.dep.map(d => d.id)).toEqual([f6.id]);
    expect(gmConflicts(out)).toEqual([]);
  });

  it('o restante cai no mês seguinte ao INÍCIO da tarefa, mesmo quando o executado termina no último dia útil do mês (caso que pulava um mês)', () => {
    // Reproduz o caso real (BL2): início 25/09/2026 (sexta), dur 10, avanço 40% ->
    // fechadoDur 4 dias úteis -> último dia trabalhado 30/09 (quarta), fim exclusivo
    // 01/10 (cai bem no dia 1). Calcular o "próximo mês" a partir desse fim exclusivo
    // saltava pra novembro; a partir do início da tarefa (setembro) dá outubro, certo.
    const t = baseTarefa({ inicio: dateToOffset('2026-09-25'), dur: 10, avanco: 40 });
    const out = reprogramarRestante('T1', [t]);
    const restante = out.find(e => e.parentId === 'T1' && e.avanco === 0);
    expect(restante.restricaoData).toBe('2026-10-01');
    expect(restante.inicio).toBe(dateToOffset('2026-10-01'));
  });

  it('o executado não passa para o mês seguinte: o valor dele cai inteiro no mês medido (caso ÍON, Teto Cob)', () => {
    // Caso real: início sábado 26/09/2026 (sábado não é útil), 10 dias úteis, 35% executado,
    // Valor Real 222.018,56. A duração proporcional (35% de 10 = 4 dias úteis) terminava em
    // 01/10: 1/6 do valor do executado caía em outubro e a Medição de setembro mostrava
    // R$ 64.755,00 em vez de R$ 77.706,50. Agora o executado vai só até 30/09 (3 dias úteis).
    const t = baseTarefa({ inicio: dateToOffset('2026-09-26'), dur: 10, avanco: 35, custo: 0, custoRealizado: 222018.56 });
    const out = reprogramarRestante('T1', [t]);
    const fechado  = out.find(e => e.parentId === 'T1' && e.avanco === 100);
    const restante = out.find(e => e.parentId === 'T1' && e.avanco === 0);

    expect(fechado.dur).toBe(3);
    expect(taskEnd(fechado)).toBe(dateToOffset('2026-10-01')); // último dia trabalhado 30/09
    expect(restante.inicio).toBe(dateToOffset('2026-10-01'));  // sem sobrepor o executado
    expect(restante.dur).toBe(7);                              // a duração total continua 10

    // Valores em centavos: 35% exatos, e a soma das partes continua igual à original.
    expect(fechado.custoRealizado).toBe(77706.5);
    expect(restante.custoRealizado).toBe(144312.06);
    expect(fechado.custoRealizado + restante.custoRealizado).toBeCloseTo(222018.56, 2);

    // Mesma distribuição mensal que a Medição usa: todo o valor do executado fica em setembro.
    const dist = computeMonthlyDist(out, { [fechado.id]: fechado.custoRealizado });
    expect(dist[fechado.id]).toEqual({ '2026-09': 77706.5 });
  });

  it('com dias úteis de sobra no mês, a duração do executado continua proporcional ao %', () => {
    // 01/03/2024, 20 dias, 50%: 10 dias úteis cabem em março, nada muda.
    const out = reprogramarRestante('T1', [baseTarefa()]);
    expect(out.find(e => e.parentId === 'T1' && e.avanco === 100).dur).toBe(10);
  });

  it('as duas folhas novas herdam as predecessoras da tarefa original', () => {
    const etapas = [
      baseTarefa({ id: 'P', etapa: 'Predecessora', dur: 5, avanco: 100, dep: [] }),
      baseTarefa({ dep: [{ id: 'P', tipo: 'TI', lag: 0 }] }),
    ];
    const out = reprogramarRestante('T1', etapas);
    const filhos = out.filter(e => e.parentId === 'T1');
    filhos.forEach(f => {
      expect(f.dep).toHaveLength(1);
      expect(f.dep[0].id).toBe('P');
    });
  });

  it('o grupo criado (T1) fica sem Predecessora própria — quem carrega o vínculo herdado são as folhas', () => {
    // autoScheduleFromDeps nunca reagenda um grupo pelo próprio dep (ele só olha e.isGroup
    // e pula), então essa Predecessora original em T1 viraria dado morto — só serviria pra
    // acusar um "conflito" fantasma no Gantt/Lista sem nunca poder ser resolvido de verdade.
    const etapas = [
      baseTarefa({ id: 'P', etapa: 'Predecessora', dur: 5, avanco: 100, dep: [] }),
      baseTarefa({ dep: [{ id: 'P', tipo: 'TI', lag: 0 }] }),
    ];
    const out = reprogramarRestante('T1', etapas);
    const grupo = out.find(e => e.id === 'T1');
    expect(grupo.isGroup).toBe(true);
    expect(grupo.dep).toEqual([]);
  });

  it('sucessora que dependia da tarefa original é empurrada pro fim do grupo (que cobre até o restante)', () => {
    const etapas = [
      baseTarefa(),
      baseTarefa({ id: 'S', etapa: 'Sucessora', avanco: 0, dep: [{ id: 'T1', tipo: 'TI', lag: 0 }] }),
    ];
    const out = reprogramarRestante('T1', etapas);
    const grupo     = out.find(e => e.id === 'T1');
    const restante  = out.find(e => e.parentId === 'T1' && e.avanco === 0);
    const sucessora = out.find(e => e.id === 'S');
    expect(sucessora.inicio).toBe(taskEnd(grupo));
    // o grupo se estende pelo menos até o início do restante (empurrado pro mês seguinte)
    expect(taskEnd(grupo)).toBeGreaterThanOrEqual(restante.inicio);
  });

  it('editar a Restrição da folha "restante" depois (via commitFieldChange, mesmo caminho da célula da Lista) também reagenda a sucessora', () => {
    const etapas = [
      baseTarefa(),
      baseTarefa({ id: 'S', etapa: 'Sucessora', avanco: 0, dep: [{ id: 'T1', tipo: 'TI', lag: 0 }] }),
    ];
    const depoisDoBotao = reprogramarRestante('T1', etapas);
    const restanteAntes = depoisDoBotao.find(e => e.parentId === 'T1' && e.avanco === 0);
    const inicioSAntes  = depoisDoBotao.find(e => e.id === 'S').inicio;

    // Empurra a restrição da folha "restante" mais alguns dias pra frente, direto pelo
    // mesmo caminho que a célula "Restrição" da Lista usa (commitFieldChange).
    const novaData = offsetToISO(dateToOffset(restanteAntes.restricaoData) + 10);
    const out = commitFieldChange(depoisDoBotao, restanteAntes.id, 'restricao', novaData, depoisDoBotao);

    const grupoDepois = out.find(e => e.id === 'T1');
    const sucessoraDepois = out.find(e => e.id === 'S');
    expect(sucessoraDepois.inicio).toBeGreaterThan(inicioSAntes);
    expect(sucessoraDepois.inicio).toBe(taskEnd(grupoDepois));
  });

  it('não faz nada quando avanço está fora de [1,99] ou a tarefa já é grupo', () => {
    const etapas0 = [baseTarefa({ avanco: 0 })];
    expect(reprogramarRestante('T1', etapas0)).toBe(etapas0);

    const etapas100 = [baseTarefa({ avanco: 100 })];
    expect(reprogramarRestante('T1', etapas100)).toBe(etapas100);

    const etapasGrupo = [baseTarefa({ isGroup: true })];
    expect(reprogramarRestante('T1', etapasGrupo)).toBe(etapasGrupo);

    expect(reprogramarRestante('NAO_EXISTE', etapas0)).toBe(etapas0);
  });

  it('divide o valor vinculado de orçamento proporcionalmente ao avanço', () => {
    const vinculos = [{ etapa_id: 'T1', orcamento_item_id: 'item1' }];
    const orcamentoItensMap = { item1: 1000 };

    const out = reprogramarRestante('T1', [baseTarefa()]);
    const fechado  = out.find(e => e.parentId === 'T1' && e.avanco === 100);
    const restante = out.find(e => e.parentId === 'T1' && e.avanco === 0);

    const map = computeValorVinculadoMap(out, vinculos, orcamentoItensMap);
    expect(map[fechado.id]).toBeCloseTo(500);
    expect(map[restante.id]).toBeCloseTo(500);
    expect(map['T1']).toBeCloseTo(1000); // grupo (bubble-up) preserva o total

    // Simula o que commit() faz ao ver o fragmento fechado em avanco:100: trava
    // o valor calculado nesta mesma passada. O restante, que segue "aberto",
    // continua recebendo exatamente sua parcela.
    const travado = out.map(e => (e.id === fechado.id ? { ...e, valorVinculadoFixo: map[fechado.id] } : e));
    const map2 = computeValorVinculadoMap(travado, vinculos, orcamentoItensMap);
    expect(map2[fechado.id]).toBe(map[fechado.id]);
    expect(map2[restante.id]).toBeCloseTo(500);
    expect(map2['T1']).toBeCloseTo(1000);
  });

  // ── Sucessoras religadas às duas folhas novas ──────────────────────────────────────────────
  describe('sucessoras da tarefa dividida', () => {
    const cenario = (depDaSucessora, extra = {}) => ([
      baseTarefa({ id: 'P', displayId: 10, etapa: 'Predecessora', dur: 5, avanco: 100 }),
      baseTarefa({ id: 'T1', displayId: 11, dep: [{ id: 'P', tipo: 'TI', lag: 0 }] }),
      baseTarefa({ id: 'S', displayId: 12, etapa: 'Sucessora', avanco: 0, dep: depDaSucessora, ...extra }),
    ]);
    const folhas = (out) => ({
      fechado:  out.find(e => e.parentId === 'T1' && e.avanco === 100),
      restante: out.find(e => e.parentId === 'T1' && e.avanco === 0),
    });

    it('TI: a sucessora passa a depender das DUAS folhas e deixa de depender do grupo (caso Enfiação Puc)', () => {
      const out = reprogramarRestante('T1', cenario([{ id: 'T1', tipo: 'TI', lag: 0 }]));
      const { fechado, restante } = folhas(out);
      const s = out.find(e => e.id === 'S');
      expect(s.dep.map(d => d.id).sort()).toEqual([fechado.id, restante.id].sort());
      expect(s.dep.some(d => d.id === 'T1')).toBe(false);
      expect(s.dep.every(d => d.tipo === 'TI' && d.lag === 0)).toBe(true);
    });

    it('as datas da sucessora não mudam (o fim do restante domina)', () => {
      const antes = reprogramarRestante('T1', cenario([{ id: 'T1', tipo: 'TI', lag: 0 }]));
      const grupo = antes.find(e => e.id === 'T1');
      expect(antes.find(e => e.id === 'S').inicio).toBe(taskEnd(grupo));
    });

    it('TT mantém o tipo e o lag nas duas folhas', () => {
      const out = reprogramarRestante('T1', cenario([{ id: 'T1', tipo: 'TT', lag: 3 }]));
      const s = out.find(e => e.id === 'S');
      expect(s.dep).toHaveLength(2);
      expect(s.dep.every(d => d.tipo === 'TT' && d.lag === 3)).toBe(true);
    });

    // Decisão de 17/11/2026 (antes II e IT iam só para o executado): a tarefa não foi concluída, o
    // restante faz parte dela, então quem dependia do início dela também depende do restante.
    it('II e IT também vão para as DUAS folhas, com o mesmo tipo e lag, e deixam de depender do grupo', () => {
      ['II', 'IT'].forEach((tipo) => {
        const out = reprogramarRestante('T1', cenario([{ id: 'T1', tipo, lag: 2 }]));
        const { fechado, restante } = folhas(out);
        const s = out.find(e => e.id === 'S');
        expect(s.dep.map(d => d.id).sort()).toEqual([fechado.id, restante.id].sort());
        expect(s.dep.every(d => d.tipo === tipo && d.lag === 2)).toBe(true);
        expect(s.dep.some(d => d.id === 'T1')).toBe(false);
      });
    });

    // 18/11/2026 (caso ÍON 709): o "(executado)" de outra tarefa dividida antes é 100% e tem data
    // congelada. Ligado ao restante (futuro) ele acusava conflito que o agendador não desfaz.
    it('sucessora já concluída (100%) liga só ao executado, em qualquer tipo, e não acusa conflito', () => {
      ['TI', 'TT', 'II', 'IT'].forEach((tipo) => {
        const out = reprogramarRestante('T1', cenario(
          [{ id: 'T1', tipo, lag: 0 }],
          { avanco: 100, inicio: dateToOffset('2024-03-20'), dur: 2 },
        ));
        const { fechado } = folhas(out);
        const s = out.find(e => e.id === 'S');
        expect(s.dep).toEqual([{ id: fechado.id, tipo, lag: 0 }]);
        expect(gmConflicts(out).filter(c => c.succ === 'S')).toEqual([]);
      });
    });

    it('sucessora quase concluída (99%) continua nas DUAS folhas: só 100% fica congelada', () => {
      const out = reprogramarRestante('T1', cenario([{ id: 'T1', tipo: 'TI', lag: 0 }], { avanco: 99 }));
      const { fechado, restante } = folhas(out);
      expect(out.find(e => e.id === 'S').dep.map(d => d.id).sort()).toEqual([fechado.id, restante.id].sort());
    });

    it('II: a sucessora passa a esperar o INÍCIO do restante (1º do mês seguinte); a de TI segue o fim do grupo (caso 192 e 99)', () => {
      const etapas = [
        ...cenario([{ id: 'T1', tipo: 'II', lag: 0 }]),
        baseTarefa({ id: 'S2', displayId: 13, etapa: 'Sucessora TI', avanco: 0, dep: [{ id: 'T1', tipo: 'TI', lag: 0 }] }),
      ];
      const out = reprogramarRestante('T1', etapas);
      const { fechado, restante } = folhas(out);
      const porII = out.find(e => e.id === 'S');
      const porTI = out.find(e => e.id === 'S2');
      expect(porII.inicio).toBe(restante.inicio);
      expect(porII.inicio).toBeGreaterThan(fechado.inicio);
      expect(porTI.inicio).toBe(taskEnd(out.find(e => e.id === 'T1')));
    });

    it('as duas folhas aparecem como predecessoras da sucessora II na Lista e ela é Sucessora das duas', () => {
      const out = reprogramarRestante('T1', cenario([{ id: 'T1', tipo: 'II', lag: 0 }]));
      const { fechado, restante } = folhas(out);
      const succ = computeSuccessors(out);
      expect(succ[fechado.id]).toEqual(['S']);
      expect(succ[restante.id]).toEqual(['S']);
      expect(succ['T1']).toEqual([]);
    });

    it('as outras predecessoras da sucessora ficam como estavam, e dependência em formato antigo (texto) também é religada', () => {
      const out = reprogramarRestante('T1', cenario(['P', 'T1']));
      const { fechado, restante } = folhas(out);
      const s = out.find(e => e.id === 'S');
      expect(s.dep.find(d => d === 'P')).toBe('P');
      expect(s.dep.filter(d => typeof d === 'object').map(d => d.id).sort()).toEqual([fechado.id, restante.id].sort());
    });

    it('tarefa que não dependia da original não é tocada', () => {
      const etapas = cenario([{ id: 'P', tipo: 'TI', lag: 0 }]);
      const depAntes = etapas.find(e => e.id === 'S').dep;
      const out = reprogramarRestante('T1', etapas);
      expect(out.find(e => e.id === 'S').dep).toEqual(depAntes);
    });

    it('a Sucessora aparece nas folhas novas (computeSuccessors) e não no grupo', () => {
      const out = reprogramarRestante('T1', cenario([{ id: 'T1', tipo: 'TI', lag: 0 }]));
      const { fechado, restante } = folhas(out);
      const succ = computeSuccessors(out);
      expect(succ[fechado.id]).toEqual(['S']);
      expect(succ[restante.id]).toEqual(['S']);
      expect(succ['T1']).toEqual([]);
    });
  });
});
