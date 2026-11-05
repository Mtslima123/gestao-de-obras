// Casca mobile do Sistema Completo (modules/mobile/full): quando liga, o que o menu mostra e o que o
// cabeçalho escreve. O ponto mais importante é a garantia de que nada muda para o desktop, o MobileGate e o
// modo foco: ver os testes de modoMobileCompleto.
import { describe, it, expect, vi } from 'vitest';
import {
  decidirChaveDeTeste, modoMobileCompleto, montarNavegacao, abaDaBarraAtiva, itemDaGavetaAtivo,
  atalhosLiberados, cabecalhoDaTela, telaDeRetornoDoFoco, DESTINOS_DA_BARRA, TELAS_ADAPTADAS, telaJaAdaptada,
} from '../modules/mobile/full/mobileFullPure';
import { MODULOS_TOPO } from '../config/modulos';

const admin = { perfil: 'admin' };
const usuario = (extra = {}) => ({ perfil: 'usuario', modulos_ids: [], abas_ids: [], ...extra });

describe('chave de teste (?mobile=novo / ?mobile=antigo)', () => {
  it('sem parâmetro e sem nada guardado: desligada, sem gravar nada', () => {
    expect(decidirChaveDeTeste({ search: '', guardado: null })).toEqual({ ativa: false, gravar: undefined });
  });
  it('?mobile=novo liga e manda guardar', () => {
    expect(decidirChaveDeTeste({ search: '?mobile=novo' })).toEqual({ ativa: true, gravar: '1' });
    expect(decidirChaveDeTeste({ search: '?x=1&mobile=novo' }).ativa).toBe(true);
  });
  it('?mobile=antigo desliga e manda apagar o que estava guardado', () => {
    expect(decidirChaveDeTeste({ search: '?mobile=antigo', guardado: '1' })).toEqual({ ativa: false, gravar: null });
  });
  it('sem parâmetro vale o que ficou guardado no aparelho', () => {
    expect(decidirChaveDeTeste({ search: '', guardado: '1' })).toEqual({ ativa: true, gravar: undefined });
    expect(decidirChaveDeTeste({ search: '', guardado: '0' }).ativa).toBe(false);
  });
  it('parâmetro desconhecido não liga nada', () => {
    expect(decidirChaveDeTeste({ search: '?mobile=talvez', guardado: null }).ativa).toBe(false);
  });
  it('não quebra sem argumentos', () => {
    expect(decidirChaveDeTeste().ativa).toBe(false);
  });
});

describe('modoMobileCompleto: só liga no celular, depois de "Acessar sistema completo", fora do modo foco', () => {
  const base = { chaveAtiva: true, isMobile: true, gateLiberado: true, mobileFocus: null };
  it('liga quando tudo se cumpre', () => {
    expect(modoMobileCompleto(base)).toBe(true);
  });
  it('chave desligada: o app é o de hoje', () => {
    expect(modoMobileCompleto({ ...base, chaveAtiva: false })).toBe(false);
  });
  it('desktop e tablet em retrato (useIsMobile falso): layout atual', () => {
    expect(modoMobileCompleto({ ...base, isMobile: false })).toBe(false);
  });
  it('ainda no MobileGate (não clicou em Acessar sistema completo)', () => {
    expect(modoMobileCompleto({ ...base, gateLiberado: false })).toBe(false);
  });
  it('modo foco da Medição e das Fotos nunca recebe a casca', () => {
    expect(modoMobileCompleto({ ...base, mobileFocus: 'medicao' })).toBe(false);
    expect(modoMobileCompleto({ ...base, mobileFocus: 'fotos' })).toBe(false);
  });
  it('valores ausentes contam como falso', () => {
    expect(modoMobileCompleto({})).toBe(false);
  });
});

describe('montarNavegacao: vem da fonte única de módulos e das permissões', () => {
  it('barra inferior: Dashboard, Obras e Cronogramas, nessa ordem', () => {
    const { barra } = montarNavegacao(admin);
    expect(barra.map(i => i.id)).toEqual(DESTINOS_DA_BARRA);
    expect(barra.map(i => i.label)).toEqual(['Dashboard', 'Obras', 'Cronogramas']);
  });

  it('todo módulo de topo aparece em um lugar só: barra ou gaveta, sem repetir nem perder', () => {
    const { barra, gaveta } = montarNavegacao(admin);
    const ids = [...barra, ...gaveta].map(i => i.id);
    MODULOS_TOPO.forEach(m => expect(ids).toContain(m.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('Orç. × Cronograma entra na gaveta e abre a aba certa do Cronograma', () => {
    const { gaveta } = montarNavegacao(admin);
    const orc = gaveta.find(i => i.id === 'orc-x-cron');
    expect(orc).toBeTruthy();
    expect(orc.acao).toEqual({ view: 'cronograma', cronogramaTab: 'orc-x-cron' });
  });

  it('Cronogramas na barra sempre abre o Gantt/Lista, mesmo vindo de Orç. × Cronograma', () => {
    const { barra } = montarNavegacao(admin);
    expect(barra.find(i => i.id === 'cronograma').acao).toEqual({ view: 'cronograma', cronogramaTab: 'gantt' });
    expect(barra.find(i => i.id === 'dashboard').acao).toEqual({ view: 'dashboard' });
  });

  it('administrador vê tudo liberado e a seção Administração', () => {
    const { barra, gaveta, admin: adm } = montarNavegacao(admin);
    expect([...barra, ...gaveta].every(i => !i.locked)).toBe(true);
    expect(adm.map(i => i.acao)).toEqual([
      { view: 'admin', adminTab: 'usuarios' },
      { view: 'admin', adminTab: 'auditoria' },
    ]);
  });

  it('usuário comum não vê Administração', () => {
    expect(montarNavegacao(usuario()).admin).toEqual([]);
  });

  it('módulo fora da lista do usuário aparece travado, não some (como na Sidebar do desktop)', () => {
    const { barra, gaveta } = montarNavegacao(usuario({ modulos_ids: ['dashboard', 'obras'] }));
    const todos = [...barra, ...gaveta];
    expect(todos.find(i => i.id === 'dashboard').locked).toBe(false);
    expect(todos.find(i => i.id === 'obras').locked).toBe(false);
    expect(todos.find(i => i.id === 'cronograma').locked).toBe(true);
    expect(todos.find(i => i.id === 'orcamentos').locked).toBe(true);
    expect(todos.find(i => i.id === 'orc-x-cron').locked).toBe(true);
  });

  it('lista de módulos vazia significa acesso total (mesma convenção do cadastro de usuários)', () => {
    const { barra, gaveta } = montarNavegacao(usuario({ modulos_ids: [] }));
    expect([...barra, ...gaveta].every(i => !i.locked)).toBe(true);
  });

  it('sem perfil carregado, tudo travado (nega por padrão)', () => {
    const { barra, gaveta, admin: adm } = montarNavegacao(null);
    expect([...barra, ...gaveta].every(i => i.locked)).toBe(true);
    expect(adm).toEqual([]);
  });
});

describe('abaDaBarraAtiva e itemDaGavetaAtivo', () => {
  it('telas da barra marcam o próprio botão', () => {
    expect(abaDaBarraAtiva({ view: 'dashboard' })).toBe('dashboard');
    expect(abaDaBarraAtiva({ view: 'obras' })).toBe('obras');
    expect(abaDaBarraAtiva({ view: 'obra-detail' })).toBe('obras');
    expect(abaDaBarraAtiva({ view: 'cronograma', cronogramaTab: 'gantt' })).toBe('cronograma');
  });
  it('o que está só na gaveta marca "Mais"', () => {
    ['orcamentos', 'fisico-financeiro', 'fisico-financeiro-detail', 'mao-de-obra', 'admin'].forEach(view => {
      expect(abaDaBarraAtiva({ view })).toBe('mais');
    });
    expect(abaDaBarraAtiva({ view: 'cronograma', cronogramaTab: 'orc-x-cron' })).toBe('mais');
  });
  it('linha da gaveta marcada acompanha a tela', () => {
    expect(itemDaGavetaAtivo({ view: 'orcamentos' })).toBe('orcamentos');
    expect(itemDaGavetaAtivo({ view: 'fisico-financeiro-detail' })).toBe('fisico-financeiro');
    expect(itemDaGavetaAtivo({ view: 'mao-de-obra' })).toBe('mao-de-obra');
    expect(itemDaGavetaAtivo({ view: 'cronograma', cronogramaTab: 'orc-x-cron' })).toBe('orc-x-cron');
    expect(itemDaGavetaAtivo({ view: 'admin', adminTab: 'auditoria' })).toBe('admin-auditoria');
    expect(itemDaGavetaAtivo({ view: 'admin', adminTab: 'usuarios' })).toBe('admin-usuarios');
  });
  it('telas da barra não marcam nenhuma linha da gaveta', () => {
    expect(itemDaGavetaAtivo({ view: 'dashboard' })).toBeNull();
    expect(itemDaGavetaAtivo({ view: 'cronograma', cronogramaTab: 'gantt' })).toBeNull();
  });
});

describe('atalhosLiberados (mesmas regras do MobileGate)', () => {
  it('admin tem os dois', () => {
    expect(atalhosLiberados(admin)).toEqual({ medicao: true, fotos: true });
  });
  it('usuário com restrição de abas só tem o que foi marcado', () => {
    const p = usuario({ abas_ids: ['cronograma.gantt', 'obras.fotos'] });
    expect(atalhosLiberados(p)).toEqual({ medicao: false, fotos: true });
  });
  it('módulo bloqueado bloqueia o atalho', () => {
    expect(atalhosLiberados(usuario({ modulos_ids: ['dashboard'] }))).toEqual({ medicao: false, fotos: false });
  });
  it('sem perfil, nenhum', () => {
    expect(atalhosLiberados(null)).toEqual({ medicao: false, fotos: false });
  });
});

describe('cabecalhoDaTela (breadcrumb da Topbar do desktop vira cabeçalho compacto)', () => {
  it('tela de topo: só o título, sem voltar (quem navega é a barra inferior)', () => {
    const r = cabecalhoDaTela([{ label: 'Início', onClick: () => {} }, { label: 'Orçamentos' }]);
    expect(r).toEqual({ titulo: 'Orçamentos', subtitulo: null, voltar: null });
  });
  it('dashboard: só o título', () => {
    expect(cabecalhoDaTela([{ label: 'Início' }, { label: 'Dashboard' }]).voltar).toBeNull();
  });
  it('tela de detalhe: pai vira subtítulo e o voltar leva a ele', () => {
    const voltar = vi.fn();
    const r = cabecalhoDaTela([
      { label: 'Início', onClick: () => {} },
      { label: 'Obras', onClick: voltar },
      { label: 'Edifício Íon' },
    ]);
    expect(r.titulo).toBe('Edifício Íon');
    expect(r.subtitulo).toBe('Obras');
    r.voltar();
    expect(voltar).toHaveBeenCalledTimes(1);
  });
  it('pai sem ação (Mão de Obra > Efetivo): mostra o subtítulo mas sem botão voltar', () => {
    const r = cabecalhoDaTela([{ label: 'Início', onClick: () => {} }, { label: 'Mão de Obra' }, { label: 'Efetivo' }]);
    expect(r).toEqual({ titulo: 'Efetivo', subtitulo: 'Mão de Obra', voltar: null });
  });
  it('breadcrumb vazio ou ausente não quebra', () => {
    expect(cabecalhoDaTela([])).toEqual({ titulo: '', subtitulo: null, voltar: null });
    expect(cabecalhoDaTela(undefined)).toEqual({ titulo: '', subtitulo: null, voltar: null });
  });
  it('ignora itens sem rótulo', () => {
    expect(cabecalhoDaTela([null, { label: '' }, { label: 'Obras' }]).titulo).toBe('Obras');
  });
});

describe('telas já adaptadas (saem do contêiner de rolagem LegadoMobile)', () => {
  it('Dashboard, Obras, Obra detalhe, Orçamentos, Físico Financeiro (lista), Cronograma e Mão de Obra já estão adaptados', () => {
    ['dashboard', 'obras', 'obra-detail', 'orcamentos', 'fisico-financeiro', 'cronograma', 'mao-de-obra'].forEach(v => expect(telaJaAdaptada(v)).toBe(true));
  });
  it('o resto ainda é a tela do desktop', () => {
    ['fisico-financeiro-detail', 'admin'].forEach(v => {
      expect(telaJaAdaptada(v)).toBe(false);
    });
  });
  it('Cronograma: todas as abas, inclusive Orç. × Cronograma, já têm casca própria (nenhuma cai no contêiner)', () => {
    expect(telaJaAdaptada('cronograma', 'gantt')).toBe(true);
    expect(telaJaAdaptada('cronograma', 'orc-x-cron')).toBe(true);
  });
  it('toda tela adaptada é uma view que existe no menu ou uma subtela de um módulo do menu', () => {
    const subtelas = { 'obra-detail': 'obras' };
    TELAS_ADAPTADAS.forEach(v => expect(MODULOS_TOPO.map(m => m.id)).toContain(subtelas[v] || v));
  });
});

describe('telaDeRetornoDoFoco', () => {
  it('telas comuns voltam para elas mesmas', () => {
    expect(telaDeRetornoDoFoco('dashboard')).toBe('dashboard');
    expect(telaDeRetornoDoFoco('orcamentos')).toBe('orcamentos');
    expect(telaDeRetornoDoFoco('cronograma')).toBe('cronograma');
  });
  it('telas de detalhe voltam para a lista, que não depende da obra selecionada', () => {
    expect(telaDeRetornoDoFoco('obra-detail')).toBe('obras');
    expect(telaDeRetornoDoFoco('fisico-financeiro-detail')).toBe('fisico-financeiro');
  });
  it('sem tela conhecida, Dashboard', () => {
    expect(telaDeRetornoDoFoco(null)).toBe('dashboard');
  });
});
