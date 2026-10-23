// BUG-016: toda alteração de obra enviava {...obra, campo} e o serviço gravava a linha inteira
// a partir de um objeto possivelmente velho (estado do login ou snapshot de sessionStorage),
// desfazendo o que outra tela ou pessoa tinha mudado (ex.: medicao_mes_inicial, nome).
import { describe, it, expect } from 'vitest';
import { camposAlterados, patchDeEdicaoDaObra, mesclarObra } from '../modules/obras/obraPatchPure';

// A obra como a tela a conhece (pode estar velha em relação ao banco)
const obraDaTela = () => ({
  id: 'OB-0001', nome: 'Residencial Aurora', sigla: 'AUR', status: 'em_andamento',
  endereco: 'Rua A, 10', area: 1200, previsto: '2027-06-30', dataFimObra: null,
  imageUrl: null, capaPos: { x: 50, y: 50 }, medicao_mes_inicial: '2026-01',
  user_id: 'u-1', created_at: '2026-01-02T10:00:00Z',
});

describe('camposAlterados', () => {
  it('devolve só o que mudou e nunca o id', () => {
    const base = obraDaTela();
    expect(camposAlterados(base, { ...base, capaPos: { x: 20, y: 80 } })).toEqual({ capaPos: { x: 20, y: 80 } });
    expect(camposAlterados(base, { ...base, id: 'OUTRO', nome: 'Novo nome' })).toEqual({ nome: 'Novo nome' });
  });

  it('nada mudou: patch vazio', () => {
    const base = obraDaTela();
    expect(camposAlterados(base, { ...base })).toEqual({});
  });

  it('compara objeto por conteúdo (capaPos novo com os mesmos x e y não conta)', () => {
    const base = obraDaTela();
    expect(camposAlterados(base, { capaPos: { x: 50, y: 50 } })).toEqual({});
  });

  it('null, undefined e vazio são a mesma coisa; vazio de verdade para valor é mudança', () => {
    expect(camposAlterados({ endereco: null }, { endereco: '' })).toEqual({});
    expect(camposAlterados({}, { endereco: '' })).toEqual({});
    expect(camposAlterados({ endereco: 'Rua A' }, { endereco: '' })).toEqual({ endereco: '' });
    expect(camposAlterados({ endereco: '' }, { endereco: 'Rua B' })).toEqual({ endereco: 'Rua B' });
  });

  it('número igual não conta e zero não é "vazio"', () => {
    expect(camposAlterados({ area: 1200 }, { area: 1200 })).toEqual({});
    expect(camposAlterados({ area: 1200 }, { area: 0 })).toEqual({ area: 0 });
    expect(camposAlterados({ area: null }, { area: 0 })).toEqual({ area: 0 });
  });

  it('base ausente: tudo que veio (menos o id) é mudança', () => {
    expect(camposAlterados(undefined, { id: 'X', nome: 'A' })).toEqual({ nome: 'A' });
  });
});

describe('patchDeEdicaoDaObra (modal Editar obra)', () => {
  const formDe = (obra, extra = {}) => ({
    nome: obra.nome, sigla: obra.sigla, status: obra.status, endereco: obra.endereco || '',
    area: obra.area ?? '', dataPrevista: obra.previsto || '', dataFimObra: obra.dataFimObra || '', ...extra,
  });

  it('salvar sem mexer em nada: só o id, nenhum campo vai ao banco', () => {
    const obra = obraDaTela();
    expect(patchDeEdicaoDaObra(obra, formDe(obra))).toEqual({ id: 'OB-0001' });
  });

  it('renomear: só o nome vai, e não leva medicao_mes_inicial nem os outros campos (o bug)', () => {
    const obra = obraDaTela(); // medicao_mes_inicial '2026-01' é o valor VELHO da tela
    const patch = patchDeEdicaoDaObra(obra, formDe(obra, { nome: 'Aurora Park' }));
    expect(patch).toEqual({ id: 'OB-0001', nome: 'Aurora Park' });
    expect(patch).not.toHaveProperty('medicao_mes_inicial');
    expect(patch).not.toHaveProperty('imageUrl');
    expect(patch).not.toHaveProperty('capaPos');
    expect(patch).not.toHaveProperty('user_id');
  });

  it('vários campos de uma vez, com área numérica e data fim vazia virando null', () => {
    const obra = { ...obraDaTela(), dataFimObra: '2027-08-01' };
    const patch = patchDeEdicaoDaObra(obra, formDe(obra, { area: '1500', dataFimObra: '', status: 'concluida' }));
    expect(patch).toEqual({ id: 'OB-0001', area: 1500, dataFimObra: null, status: 'concluida' });
  });

  it('sigla em branco cai na sigla atual (ou no id), sem virar mudança', () => {
    const obra = obraDaTela();
    expect(patchDeEdicaoDaObra(obra, formDe(obra, { sigla: '   ' }))).toEqual({ id: 'OB-0001' });
    const semSigla = { ...obraDaTela(), sigla: undefined };
    expect(patchDeEdicaoDaObra(semSigla, formDe(semSigla, { sigla: '' }))).toEqual({ id: 'OB-0001', sigla: 'OB-0001' });
  });

  it('limpar um campo que tinha valor é mudança', () => {
    const obra = obraDaTela();
    expect(patchDeEdicaoDaObra(obra, formDe(obra, { endereco: '' }))).toEqual({ id: 'OB-0001', endereco: '' });
  });
});

describe('mesclarObra', () => {
  it('a linha devolvida pelo banco vence (traz o que outra tela mudou, como o mês inicial)', () => {
    const velha = obraDaTela();
    const linhaDoBanco = { ...velha, nome: 'Aurora Park', medicao_mes_inicial: '2026-06', capaPos: { x: 20, y: 80 } };
    const r = mesclarObra(velha, { capaPos: { x: 20, y: 80 } }, linhaDoBanco);
    expect(r.medicao_mes_inicial).toBe('2026-06'); // não volta para '2026-01'
    expect(r.nome).toBe('Aurora Park');
    expect(r.capaPos).toEqual({ x: 20, y: 80 });
  });

  it('sem linha do banco, vale a obra anterior com os campos gravados por cima', () => {
    const r = mesclarObra(obraDaTela(), { nome: 'Novo' }, null);
    expect(r.nome).toBe('Novo');
    expect(r.area).toBe(1200);
  });

  it('sem nada anterior não quebra', () => {
    expect(mesclarObra(null, { nome: 'A' }, undefined)).toEqual({ nome: 'A' });
  });
});
