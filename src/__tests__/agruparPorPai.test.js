// Modal Vincular tarefas: com tarefas de mais de um pai, a tabela de vínculos ganha cabeçalhos e os
// dropdowns ganham <optgroup>. agruparPorPai separa por trechos contíguos do mesmo pai, sem mudar a ordem.
import { describe, it, expect } from 'vitest';
import { agruparPorPai } from '../modules/cronograma/scheduleEngine';

const t = (id, extra = {}) => ({ id, etapa: id, isGroup: false, parentId: null, ...extra });
const etapas = [
  t('RAIZ', { isGroup: true, etapa: 'Revestimentos' }),
  t('PA', { isGroup: true, parentId: 'RAIZ', etapa: 'Porcelanato áreas molhadas' }),
  t('A1', { parentId: 'PA' }), t('A2', { parentId: 'PA' }), t('A3', { parentId: 'PA' }),
  t('PV', { isGroup: true, parentId: 'RAIZ', etapa: 'Porcelanato varandas' }),
  t('V1', { parentId: 'PV' }), t('V2', { parentId: 'PV' }),
  t('SOLTA'),
];

describe('agruparPorPai', () => {
  it('separa por tarefa pai, na ordem recebida, com o nome do pai como rótulo', () => {
    const g = agruparPorPai(etapas, ['A1', 'A2', 'A3', 'V1', 'V2']);
    expect(g).toEqual([
      { paiId: 'PA', rotulo: 'Porcelanato áreas molhadas', ids: ['A1', 'A2', 'A3'] },
      { paiId: 'PV', rotulo: 'Porcelanato varandas', ids: ['V1', 'V2'] },
    ]);
  });

  it('um pai só devolve um grupo (o modal então não mostra separação)', () => {
    const g = agruparPorPai(etapas, ['A1', 'A3']);
    expect(g).toHaveLength(1);
    expect(g[0].ids).toEqual(['A1', 'A3']);
  });

  it('só agrupa trechos contíguos: a ordem recebida nunca muda', () => {
    const g = agruparPorPai(etapas, ['A1', 'V1', 'A2']);
    expect(g.map(x => x.ids)).toEqual([['A1'], ['V1'], ['A2']]);
    expect(g.map(x => x.paiId)).toEqual(['PA', 'PV', 'PA']);
  });

  it('tarefa sem pai forma um trecho sem rótulo', () => {
    const g = agruparPorPai(etapas, ['SOLTA', 'A1']);
    expect(g[0]).toEqual({ paiId: null, rotulo: '', ids: ['SOLTA'] });
    expect(g[1].rotulo).toBe('Porcelanato áreas molhadas');
  });

  it('pai que não existe mais conta como sem pai', () => {
    const g = agruparPorPai([t('X', { parentId: 'SUMIU' })], ['X']);
    expect(g).toEqual([{ paiId: null, rotulo: '', ids: ['X'] }]);
  });

  it('dois pais diferentes com o mesmo nome ganham o avô no rótulo', () => {
    const lista = [
      t('TA', { isGroup: true, etapa: 'Torre A' }), t('TB', { isGroup: true, etapa: 'Torre B' }),
      t('CA', { isGroup: true, parentId: 'TA', etapa: 'Contrapiso' }), t('CB', { isGroup: true, parentId: 'TB', etapa: 'Contrapiso' }),
      t('A1', { parentId: 'CA' }), t('B1', { parentId: 'CB' }),
    ];
    const g = agruparPorPai(lista, ['A1', 'B1']);
    expect(g.map(x => x.rotulo)).toEqual(['Contrapiso (Torre A)', 'Contrapiso (Torre B)']);
  });

  it('o mesmo pai em dois trechos mantém o mesmo rótulo (sem avô)', () => {
    const g = agruparPorPai(etapas, ['A1', 'V1', 'A2']);
    expect(g[0].rotulo).toBe(g[2].rotulo);
    expect(g[0].rotulo).toBe('Porcelanato áreas molhadas');
  });

  it('ids que não existem são ignorados; lista vazia devolve vazio', () => {
    expect(agruparPorPai(etapas, ['FANTASMA', 'A1']).map(x => x.ids)).toEqual([['A1']]);
    expect(agruparPorPai(etapas, [])).toEqual([]);
  });
});
