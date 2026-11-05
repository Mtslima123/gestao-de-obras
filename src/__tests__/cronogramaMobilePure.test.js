// Lista do Cronograma na casca mobile (modules/mobile/full/cronograma): quais linhas aparecem, como a busca e o
// filtro funcionam, como as datas são lidas e como uma edição da folha vira o novo array de etapas (com as mesmas
// funções da Lista e do formulário do Gantt).
import { describe, it, expect } from 'vitest';
import {
  FILTROS_DE_SITUACAO, chaveDeSituacao, rotuloDeSituacao, normalizarTexto, formatarPercentual, linhasDaLista,
  idsDeGrupos, expandidosIniciais, datasDaTarefa, terminoProjetadoISO, camposEditaveis, valoresIniciais,
  validarFolha, aplicarFolha,
} from '../modules/mobile/full/cronograma/cronogramaMobilePure';

const grupo = (id, parentId, nivel, etapa, extra = {}) => ({ id, parentId, nivel, isGroup: true, etapa, inicio: 0, dur: 5, avanco: 0, collapsed: false, dep: [], ...extra });
const tarefa = (id, parentId, nivel, etapa, extra = {}) => ({ id, parentId, nivel, isGroup: false, etapa, inicio: 0, dur: 5, avanco: 0, status: 'ongoing', dep: [], modo: 'auto', ...extra });

const etapas = [
  grupo('G1', null, 0, 'Estrutura'),
  grupo('G2', 'G1', 1, 'Fundação'),
  tarefa('T1', 'G2', 2, 'Escavação', { avanco: 100, status: 'done', responsavel: 'João' }),
  tarefa('T2', 'G2', 2, 'Concretagem', { inicio: 5, avanco: 40, status: 'late', pavimento: 'Subsolo' }),
  tarefa('T3', 'G1', 1, 'Alvenaria', { inicio: 10, status: 'upcoming' }),
  grupo('G3', null, 0, 'Acabamento'),
  tarefa('T4', 'G3', 1, 'Pintura', { inicio: 20 }),
];
const ids = (linhas) => linhas.map(l => l.e.id);

describe('situação da tarefa', () => {
  it('100% conta como concluída mesmo com outro status salvo (mesma regra da Lista)', () => {
    expect(chaveDeSituacao(tarefa('x', null, 0, 'a', { avanco: 100, status: 'ongoing' }))).toBe('concluidas');
  });
  it('late, upcoming e o resto', () => {
    expect(chaveDeSituacao(tarefa('x', null, 0, 'a', { status: 'late' }))).toBe('atrasadas');
    expect(chaveDeSituacao(tarefa('x', null, 0, 'a', { status: 'upcoming' }))).toBe('futuras');
    expect(chaveDeSituacao(tarefa('x', null, 0, 'a', { status: 'exec' }))).toBe('execucao');
    expect(chaveDeSituacao(tarefa('x', null, 0, 'a', { status: undefined }))).toBe('execucao');
  });
  it('rótulos em português e opção "Todas" primeiro', () => {
    expect(rotuloDeSituacao('atrasadas')).toBe('Atrasada');
    expect(rotuloDeSituacao('qualquer')).toBe('Em execução');
    expect(FILTROS_DE_SITUACAO[0]).toEqual({ id: 'todas', label: 'Todas' });
  });
});

describe('texto e percentual', () => {
  it('normalizarTexto ignora acento e caixa', () => {
    expect(normalizarTexto('  FUNDAÇÃO ')).toBe('  fundacao ');
    expect(normalizarTexto(null)).toBe('');
  });
  it('formatarPercentual: vírgula, uma casa só quando existe', () => {
    expect(formatarPercentual(100)).toBe('100%');
    expect(formatarPercentual(0)).toBe('0%');
    expect(formatarPercentual(33.3)).toBe('33,3%');
    expect(formatarPercentual(56.14)).toBe('56,1%');
    expect(formatarPercentual(undefined)).toBe('0%');
    expect(formatarPercentual('x')).toBe('0%');
  });
});

describe('linhasDaLista: hierarquia e grupos abertos', () => {
  it('tudo fechado: só o que não tem pai', () => {
    expect(ids(linhasDaLista({ etapas, expandidos: new Set() }))).toEqual(['G1', 'G3']);
  });
  it('abrir um grupo mostra os filhos dele, e os netos só se o filho também abrir', () => {
    expect(ids(linhasDaLista({ etapas, expandidos: new Set(['G1']) }))).toEqual(['G1', 'G2', 'T3', 'G3']);
    expect(ids(linhasDaLista({ etapas, expandidos: new Set(['G1', 'G2']) }))).toEqual(['G1', 'G2', 'T1', 'T2', 'T3', 'G3']);
  });
  it('grupo aberto sem o avô aberto continua escondido', () => {
    expect(ids(linhasDaLista({ etapas, expandidos: new Set(['G2']) }))).toEqual(['G1', 'G3']);
  });
  it('marca quem tem filhos, o nível e se está aberto', () => {
    const l = linhasDaLista({ etapas, expandidos: new Set(['G1']) });
    const g2 = l.find(x => x.e.id === 'G2');
    expect(g2).toMatchObject({ nivel: 1, temFilhos: true, aberto: false });
    expect(l.find(x => x.e.id === 'G1')).toMatchObject({ aberto: true });
    expect(l.find(x => x.e.id === 'T3')).toMatchObject({ temFilhos: false });
  });
  it('lista vazia não quebra', () => {
    expect(linhasDaLista({ etapas: [] })).toEqual([]);
  });
});

describe('linhasDaLista: busca e filtro (mostram o resultado com os grupos acima, abertos)', () => {
  const wbsMap = { G1: '1', G2: '1.1', T1: '1.1.1', T2: '1.1.2', T3: '1.2', G3: '2', T4: '2.1' };
  const busca = (extra) => linhasDaLista({ etapas, wbsMap, expandidos: new Set(), ...extra });

  it('busca sem acento acha "Fundação"', () => {
    expect(ids(busca({ texto: 'fundacao' }))).toEqual(['G1', 'G2']);
  });
  it('busca pelo número da EAP, pelo responsável e pelo pavimento', () => {
    expect(ids(busca({ texto: '1.1.1' }))).toEqual(['G1', 'G2', 'T1']);
    expect(ids(busca({ texto: 'joao' }))).toEqual(['G1', 'G2', 'T1']);
    expect(ids(busca({ texto: 'subsolo' }))).toEqual(['G1', 'G2', 'T2']);
  });
  it('resultado de busca aparece mesmo com os grupos fechados e todos os grupos saem abertos', () => {
    const l = busca({ texto: 'escavacao' });
    expect(ids(l)).toEqual(['G1', 'G2', 'T1']);
    expect(l.filter(x => x.e.isGroup).every(x => x.aberto)).toBe(true);
  });
  it('filtro por situação: grupos só entram como pai de quem casou', () => {
    expect(ids(busca({ filtro: 'atrasadas' }))).toEqual(['G1', 'G2', 'T2']);
    expect(ids(busca({ filtro: 'concluidas' }))).toEqual(['G1', 'G2', 'T1']);
    expect(ids(busca({ filtro: 'futuras' }))).toEqual(['G1', 'T3']);
    expect(ids(busca({ filtro: 'execucao' }))).toEqual(['G3', 'T4']);
  });
  it('busca e filtro juntos', () => {
    expect(ids(busca({ texto: 'concretagem', filtro: 'atrasadas' }))).toEqual(['G1', 'G2', 'T2']);
    expect(ids(busca({ texto: 'concretagem', filtro: 'concluidas' }))).toEqual([]);
  });
  it('busca sem resultado: lista vazia', () => {
    expect(busca({ texto: 'zzz' })).toEqual([]);
  });
  it('espaços na busca não filtram', () => {
    expect(ids(busca({ texto: '   ' }))).toEqual(['G1', 'G3']);
  });
});

describe('grupos abertos de saída', () => {
  it('idsDeGrupos: só quem tem filhos', () => {
    expect([...idsDeGrupos(etapas)].sort()).toEqual(['G1', 'G2', 'G3']);
    expect([...idsDeGrupos([grupo('V', null, 0, 'vazio')])]).toEqual([]);
  });
  it('expandidosIniciais respeita o que a equipe deixou recolhido no cronograma', () => {
    const e = etapas.map(x => (x.id === 'G2' ? { ...x, collapsed: true } : x));
    expect([...expandidosIniciais(e)].sort()).toEqual(['G1', 'G3']);
  });
});

describe('datasDaTarefa e término projetado', () => {
  it('tarefa usa os próprios campos', () => {
    const d = datasDaTarefa(etapas.find(e => e.id === 'T2'));
    expect(d.dur).toBe(5);
    expect(d.avanco).toBe(40);
    expect(d.inicioISO).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(d.fimISO >= d.inicioISO).toBe(true);
  });
  it('grupo usa o envelope dos filhos (groupVals) e o avanço calculado', () => {
    const g = etapas.find(e => e.id === 'G1');
    const d = datasDaTarefa(g, { G1: { inicio: 3, dur: 7, avanco: 55.5 } });
    expect(d.dur).toBe(7);
    expect(d.avanco).toBe(55.5);
    expect(d.inicioISO).not.toBe(datasDaTarefa(g).inicioISO);
  });
  it('término projetado é o maior término entre as tarefas (não conta grupo)', () => {
    expect(terminoProjetadoISO(etapas)).toBe(datasDaTarefa(etapas.find(e => e.id === 'T4')).fimISO);
    expect(terminoProjetadoISO([])).toBeNull();
    expect(terminoProjetadoISO([grupo('V', null, 0, 'só grupo')])).toBeNull();
  });
});

describe('campos da folha', () => {
  it('tarefa edita 5 campos; grupo só o nome', () => {
    expect(camposEditaveis(tarefa('x', null, 0, 'a'))).toEqual(['etapa', 'inicio', 'duracaoDias', 'avanco', 'responsavel']);
    expect(camposEditaveis(grupo('g', null, 0, 'a'))).toEqual(['etapa']);
  });
  it('valores iniciais saem como texto de formulário', () => {
    const v = valoresIniciais(etapas.find(e => e.id === 'T2'));
    expect(v.etapa).toBe('Concretagem');
    expect(v.duracaoDias).toBe('5');
    expect(v.avanco).toBe('40');
    expect(v.responsavel).toBe('');
    expect(v.inicio).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('validarFolha', () => {
  const t2 = etapas.find(e => e.id === 'T2');
  const ok = valoresIniciais(t2);
  it('valores atuais são válidos', () => {
    expect(validarFolha(ok, t2)).toEqual({});
  });
  it('nome vazio, data inválida, duração e avanço fora da regra', () => {
    expect(validarFolha({ ...ok, etapa: '   ' }, t2).etapa).toBeTruthy();
    expect(validarFolha({ ...ok, inicio: '' }, t2).inicio).toBeTruthy();
    expect(validarFolha({ ...ok, duracaoDias: '0' }, t2).duracaoDias).toBeTruthy();
    expect(validarFolha({ ...ok, duracaoDias: '2.5' }, t2).duracaoDias).toBeTruthy();
    expect(validarFolha({ ...ok, avanco: '101' }, t2).avanco).toBeTruthy();
    expect(validarFolha({ ...ok, avanco: '-1' }, t2).avanco).toBeTruthy();
    expect(validarFolha({ ...ok, avanco: '5.5' }, t2).avanco).toBeTruthy();
    expect(validarFolha({ ...ok, avanco: '' }, t2).avanco).toBeUndefined(); // '' vira 0 (Number('') === 0)
  });
  it('grupo só valida o nome (o resto vem dos filhos)', () => {
    const g = etapas.find(e => e.id === 'G1');
    expect(validarFolha({ ...valoresIniciais(g), avanco: '999', duracaoDias: '0' }, g)).toEqual({});
    expect(validarFolha({ ...valoresIniciais(g), etapa: '' }, g).etapa).toBeTruthy();
  });
});

describe('aplicarFolha: vira o novo array pelo mesmo caminho do formulário do Gantt', () => {
  const v = (id, extra) => ({ ...valoresIniciais(etapas.find(e => e.id === id)), ...extra });
  const de = (novas, id) => novas.find(e => e.id === id);

  it('nada mudou: devolve o MESMO array (nada a gravar, nada a desfazer)', () => {
    expect(aplicarFolha(etapas, 'T2', v('T2'))).toBe(etapas);
  });
  it('renomear: só a tarefa muda e o nome sai sem espaços nas pontas', () => {
    const novas = aplicarFolha(etapas, 'T2', v('T2', { etapa: '  Concretagem da laje  ' }));
    expect(novas).not.toBe(etapas);
    expect(de(novas, 'T2').etapa).toBe('Concretagem da laje');
    expect(de(novas, 'T1')).toBe(de(etapas, 'T1'));
  });
  it('duração', () => {
    expect(de(aplicarFolha(etapas, 'T2', v('T2', { duracaoDias: '8' })), 'T2').dur).toBe(8);
  });
  it('avanço comum e o status acompanha ao reabrir uma tarefa concluída', () => {
    expect(de(aplicarFolha(etapas, 'T2', v('T2', { avanco: '60' })), 'T2').avanco).toBe(60);
    const reaberta = de(aplicarFolha(etapas, 'T1', v('T1', { avanco: '50' })), 'T1');
    expect(reaberta.avanco).toBe(50);
    expect(reaberta.status).toBe('ongoing');
  });
  it('chegar a 100% conclui a tarefa', () => {
    const t = de(aplicarFolha(etapas, 'T2', v('T2', { avanco: '100' })), 'T2');
    expect(t.avanco).toBe(100);
  });
  it('responsável', () => {
    expect(de(aplicarFolha(etapas, 'T2', v('T2', { responsavel: ' Maria ' })), 'T2').responsavel).toBe('Maria');
  });
  it('início digitado vira o início da tarefa', () => {
    const antes = valoresIniciais(de(etapas, 'T3')).inicio;
    const novas = aplicarFolha(etapas, 'T3', v('T3', { inicio: '2030-01-15' }));
    expect(valoresIniciais(de(novas, 'T3')).inicio).not.toBe(antes);
  });
  it('grupo só renomeia: datas e avanço enviados são ignorados', () => {
    const novas = aplicarFolha(etapas, 'G1', { ...v('G1'), etapa: 'Superestrutura', avanco: '90', duracaoDias: '99' });
    expect(de(novas, 'G1').etapa).toBe('Superestrutura');
    expect(de(novas, 'G1').avanco).toBe(0);
    expect(de(novas, 'G1').dur).toBe(5);
  });
  it('tarefa inexistente: devolve o mesmo array', () => {
    expect(aplicarFolha(etapas, 'NAO', v('T2'))).toBe(etapas);
  });
  it('não altera o array original', () => {
    const copia = JSON.stringify(etapas);
    aplicarFolha(etapas, 'T2', v('T2', { etapa: 'Outra', avanco: '70', duracaoDias: '9' }));
    expect(JSON.stringify(etapas)).toBe(copia);
  });
});
