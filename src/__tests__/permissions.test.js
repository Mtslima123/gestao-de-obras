// Testes unitários das regras de permissão (fail-secure). Roda em node. npm test
import { describe, it, expect } from 'vitest';
import {
  moduloLiberado, moduloSomenteLeitura, abaSomenteLeitura, obrasPermitidas, obraLiberada, isAdmin,
} from '../utils/permissions';

const admin = { perfil: 'admin' };

describe('moduloLiberado', () => {
  it('nega sem perfil (fail-secure)', () => expect(moduloLiberado(null, 'obras')).toBe(false));
  it('admin libera tudo', () => expect(moduloLiberado(admin, 'qualquer')).toBe(true));
  it('modulos_ids vazio = todos liberados', () =>
    expect(moduloLiberado({ perfil: 'usuario', modulos_ids: [] }, 'obras')).toBe(true));
  it('com lista, só os listados', () => {
    const u = { perfil: 'usuario', modulos_ids: ['obras'] };
    expect(moduloLiberado(u, 'obras')).toBe(true);
    expect(moduloLiberado(u, 'financeiro')).toBe(false);
  });
});

describe('moduloSomenteLeitura', () => {
  it('sem perfil ou admin nunca é somente leitura', () => {
    expect(moduloSomenteLeitura(null, 'obras')).toBe(false);
    expect(moduloSomenteLeitura(admin, 'obras')).toBe(false);
  });
  it('sem lista = edição liberada', () =>
    expect(moduloSomenteLeitura({ perfil: 'usuario' }, 'obras')).toBe(false));
  it('módulo na lista readonly = somente leitura', () => {
    const u = { perfil: 'usuario', modulos_readonly_ids: ['financeiro'] };
    expect(moduloSomenteLeitura(u, 'financeiro')).toBe(true);
    expect(moduloSomenteLeitura(u, 'obras')).toBe(false);
  });
});

describe('abaSomenteLeitura', () => {
  it('sem perfil ou admin nunca é somente leitura', () => {
    expect(abaSomenteLeitura(null, 'obras', 'fotos')).toBe(false);
    expect(abaSomenteLeitura(admin, 'obras', 'fotos')).toBe(false);
  });
  it('módulo inteiro readonly implica aba readonly', () => {
    const u = { perfil: 'usuario', modulos_readonly_ids: ['obras'] };
    expect(abaSomenteLeitura(u, 'obras', 'fotos')).toBe(true);
  });
  it('aba específica na lista = readonly, mesmo com módulo liberado', () => {
    const u = { perfil: 'usuario', abas_readonly_ids: ['obras.fotos'] };
    expect(abaSomenteLeitura(u, 'obras', 'fotos')).toBe(true);
    expect(abaSomenteLeitura(u, 'obras', 'visao')).toBe(false);
  });
  it('sem restrição de módulo nem de aba = editável', () =>
    expect(abaSomenteLeitura({ perfil: 'usuario' }, 'obras', 'fotos')).toBe(false));
});

describe('obrasPermitidas / obraLiberada', () => {
  it('admin não tem restrição (null = todas)', () => {
    expect(obrasPermitidas(admin)).toBeNull();
    expect(obraLiberada(admin, 'OB-1')).toBe(true);
  });
  it('usuário comum vê apenas as obras vinculadas', () => {
    const u = { perfil: 'usuario', user_obras: [{ obra_id: 'OB-1' }, { obra_id: 'OB-2' }] };
    expect(obrasPermitidas(u)).toEqual(['OB-1', 'OB-2']);
    expect(obraLiberada(u, 'OB-1')).toBe(true);
    expect(obraLiberada(u, 'OB-9')).toBe(false);
  });
  it('usuário sem vínculos não vê nenhuma obra', () => {
    const u = { perfil: 'usuario' };
    expect(obrasPermitidas(u)).toEqual([]);
    expect(obraLiberada(u, 'OB-1')).toBe(false);
  });
});

describe('isAdmin', () => {
  it('true só para perfil admin', () => {
    expect(isAdmin(admin)).toBe(true);
    expect(isAdmin({ perfil: 'usuario' })).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });
});
