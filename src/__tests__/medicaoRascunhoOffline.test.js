import { describe, it, expect } from 'vitest';
import {
  serializarItensRascunho, registrarAlteracoes, aplicarAlteracoes, mesclarRascunho,
  rebaseAlteracoes, descartarCampos, classificarMedicaoNoBanco,
} from '../modules/cronograma/medicaoMensalPure';

// Itens como o banco guarda (medicoes_mensais.itens).
const banco = [
  { id: 1, percMedido: 20 },
  { id: 2, percMedido: 0, visto: true },
  { id: 3, percMedido: 50, observacao: 'falta reboco' },
];

describe('serializarItensRascunho', () => {
  it('gera exatamente o formato que o banco guarda', () => {
    expect(serializarItensRascunho([
      { id: 1, percMedido: 10, foraDoMes: true, observacao: 'x', visto: true, descricao: 'ignorado' },
      { id: 2, percMedido: 0, observacao: '', visto: false },
    ])).toEqual([
      { id: 1, percMedido: 10, manual: true, observacao: 'x', visto: true },
      { id: 2, percMedido: 0 },
    ]);
  });
});

describe('registrarAlteracoes', () => {
  it('fixa a base do banco na 1ª mudança e atualiza só o valor nas seguintes', () => {
    let alt = registrarAlteracoes({}, [{ id: 1, campos: { percMedido: 40 } }], banco);
    alt = registrarAlteracoes(alt, [{ id: 1, campos: { percMedido: 60 } }], [{ id: 1, percMedido: 99 }]);
    expect(alt['1'].campos.percMedido).toEqual({ base: 20, valor: 60 });
  });

  it('tarefa que não está na lista do banco nasce com o % da tela (base ausente)', () => {
    const alt = registrarAlteracoes({}, [{ id: 9, campos: { visto: true }, percMedidoTela: 35 }], banco);
    expect(alt['9'].campos.percMedido).toEqual({ base: null, valor: 35 });
    expect(alt['9'].campos.visto).toEqual({ base: false, valor: true });
  });
});

describe('mesclarRascunho', () => {
  it('só eu mudei: fica o meu, e o resto do banco é preservado', () => {
    const alt = registrarAlteracoes({}, [{ id: 1, campos: { percMedido: 40, visto: true } }], banco);
    const { itens, conflitos } = mesclarRascunho(banco, alt);
    expect(conflitos).toEqual([]);
    expect(itens).toEqual([
      { id: 1, percMedido: 40, visto: true },
      { id: 2, percMedido: 0, visto: true },
      { id: 3, percMedido: 50, observacao: 'falta reboco' },
    ]);
  });

  it('outra pessoa mudou OUTRA tarefa: as duas mudanças ficam (antes a minha apagava a dela)', () => {
    const alt = registrarAlteracoes({}, [{ id: 1, campos: { percMedido: 40 } }], banco);
    const agora = banco.map(i => (i.id === 3 ? { ...i, percMedido: 80 } : i));
    const { itens, conflitos } = mesclarRascunho(agora, alt);
    expect(conflitos).toEqual([]);
    expect(itens.find(i => i.id === 1).percMedido).toBe(40);
    expect(itens.find(i => i.id === 3).percMedido).toBe(80);
  });

  it('os dois mudaram a mesma tarefa pra valores diferentes: conflito, fica o do banco', () => {
    const alt = registrarAlteracoes({}, [{ id: 1, campos: { percMedido: 40 } }], banco);
    const agora = banco.map(i => (i.id === 1 ? { ...i, percMedido: 30 } : i));
    const { itens, conflitos } = mesclarRascunho(agora, alt);
    expect(conflitos).toEqual([{ id: 1, campo: 'percMedido', meu: 40, sistema: 30 }]);
    expect(itens.find(i => i.id === 1).percMedido).toBe(30);
  });

  it('usar os meus resolve o conflito com o meu valor', () => {
    const alt = registrarAlteracoes({}, [{ id: 1, campos: { percMedido: 40 } }], banco);
    const agora = banco.map(i => (i.id === 1 ? { ...i, percMedido: 30 } : i));
    const { itens, conflitos } = mesclarRascunho(agora, alt, { forcarMeus: true });
    expect(conflitos).toEqual([]);
    expect(itens.find(i => i.id === 1).percMedido).toBe(40);
  });

  it('os dois chegaram ao mesmo valor: não é conflito', () => {
    const alt = registrarAlteracoes({}, [{ id: 1, campos: { percMedido: 40 } }], banco);
    const agora = banco.map(i => (i.id === 1 ? { ...i, percMedido: 40 } : i));
    expect(mesclarRascunho(agora, alt).conflitos).toEqual([]);
  });

  it('envio anterior chegou mas a resposta se perdeu: reenviar não acusa conflito', () => {
    const alt = registrarAlteracoes({}, [{ id: 1, campos: { percMedido: 40 } }], banco);
    const jaGravado = mesclarRascunho(banco, alt).itens;
    const r = mesclarRascunho(jaGravado, alt);
    expect(r.conflitos).toEqual([]);
    expect(r.itens).toEqual(jaGravado);
  });

  it('tarefa nova na lista (não estava no banco) é criada sem conflito falso', () => {
    const alt = registrarAlteracoes({}, [{ id: 9, campos: { visto: true }, percMedidoTela: 35 }], banco);
    const { itens, conflitos } = mesclarRascunho(banco, alt);
    expect(conflitos).toEqual([]);
    expect(itens.find(i => i.id === 9)).toEqual({ id: 9, percMedido: 35, visto: true });
  });

  it('observação apagada e visto desmarcado somem do item, como o banco guarda', () => {
    const alt = registrarAlteracoes({}, [
      { id: 3, campos: { observacao: '' } },
      { id: 2, campos: { visto: false } },
    ], banco);
    const { itens } = mesclarRascunho(banco, alt);
    expect(itens.find(i => i.id === 3)).toEqual({ id: 3, percMedido: 50 });
    expect(itens.find(i => i.id === 2)).toEqual({ id: 2, percMedido: 0 });
  });

  it('ids de texto também casam (chave do objeto é string)', () => {
    const b = [{ id: 'a1', percMedido: 10 }];
    const alt = registrarAlteracoes({}, [{ id: 'a1', campos: { percMedido: 15 } }], b);
    expect(mesclarRascunho(b, alt).itens).toEqual([{ id: 'a1', percMedido: 15 }]);
  });
});

describe('mesclarRascunho: tarefa que sumiu do banco', () => {
  it('existia quando a pessoa mexeu e foi removida: não recria nem acusa conflito', () => {
    const alt = registrarAlteracoes({}, [{ id: 1, campos: { percMedido: 0 } }], banco);
    const semTarefa1 = banco.filter(i => i.id !== 1);
    const { itens, conflitos } = mesclarRascunho(semTarefa1, alt);
    expect(conflitos).toEqual([]);
    expect(itens.find(i => i.id === 1)).toBeUndefined();
  });

  it('item novo só nasce com % medido', () => {
    const alt = { 9: { id: 9, campos: { visto: { base: false, valor: true } } } };
    expect(mesclarRascunho(banco, alt).itens.find(i => i.id === 9)).toBeUndefined();
  });
});

describe('aplicarAlteracoes', () => {
  it('mostra na tela o que está guardado no aparelho', () => {
    const linhas = [{ id: 1, percMedido: 20, observacao: '', visto: false }, { id: 2, percMedido: 0 }];
    const alt = registrarAlteracoes({}, [{ id: 1, campos: { percMedido: 70, visto: true } }], banco);
    expect(aplicarAlteracoes(linhas, alt)).toEqual([
      { id: 1, percMedido: 70, observacao: '', visto: true },
      { id: 2, percMedido: 0 },
    ]);
  });
});

describe('rebaseAlteracoes', () => {
  it('tira o que já foi enviado e rebaseia o que mudou durante o envio', () => {
    const enviadas = registrarAlteracoes({}, [{ id: 1, campos: { percMedido: 40 } }, { id: 2, campos: { visto: false } }], banco);
    const depois = registrarAlteracoes(enviadas, [{ id: 1, campos: { percMedido: 60 } }], banco);
    const r = rebaseAlteracoes(depois, enviadas);
    expect(r).toEqual({ 1: { id: 1, campos: { percMedido: { base: 40, valor: 60 } } } });
  });

  it('sem nada novo, não sobra nada', () => {
    const enviadas = registrarAlteracoes({}, [{ id: 1, campos: { percMedido: 40 } }], banco);
    expect(rebaseAlteracoes(enviadas, enviadas)).toEqual({});
  });
});

describe('descartarCampos', () => {
  it('usar os do sistema esquece só os campos em conflito', () => {
    const alt = registrarAlteracoes({}, [{ id: 1, campos: { percMedido: 40, visto: true } }, { id: 2, campos: { percMedido: 5 } }], banco);
    const r = descartarCampos(alt, [{ id: 1, campo: 'percMedido' }, { id: 2, campo: 'percMedido' }]);
    expect(Object.keys(r)).toEqual(['1']);
    expect(Object.keys(r['1'].campos)).toEqual(['visto']);
  });
});

describe('classificarMedicaoNoBanco', () => {
  it('distingue excluída, reaberta com outro id, fechada/aprovada e rascunho', () => {
    expect(classificarMedicaoNoBanco(null, 7)).toBe('excluida');
    expect(classificarMedicaoNoBanco({ id: 8, status: 'rascunho' }, 7)).toBe('excluida');
    expect(classificarMedicaoNoBanco({ id: 7, status: 'fechada' }, 7)).toBe('fechada');
    expect(classificarMedicaoNoBanco({ id: 7, status: 'aprovada' }, 7)).toBe('fechada');
    expect(classificarMedicaoNoBanco({ id: 7, status: 'rascunho' }, 7)).toBe('rascunho');
    expect(classificarMedicaoNoBanco({ id: 7, status: 'rascunho' }, null)).toBe('rascunho');
  });
});
