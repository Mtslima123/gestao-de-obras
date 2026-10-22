// O layout mobile (cartões da Medição e das Fotos no modo foco) não pode depender só da largura da
// janela: celular deitado e Chrome em "Versão para computador" passam de 768px e caíam na tabela
// clássica ("aparência de site"). Ver useIsMobile.js.
import { describe, it, expect } from 'vitest';
import { ehLayoutMobile, ehSiteDeComputadorNoToque } from '../utils/useIsMobile';

const UA_CELULAR = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36';
const UA_TABLET = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';
const UA_SITE_COMPUTADOR = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';
const UA_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';

describe('ehLayoutMobile', () => {
  it('celular em pé: janela estreita', () => {
    expect(ehLayoutMobile({ largura: 390, toque: true, menorLadoTela: 390 })).toBe(true);
  });

  it('celular deitado (844x390): janela larga, tela física pequena, toque', () => {
    expect(ehLayoutMobile({ largura: 844, toque: true, menorLadoTela: 390 })).toBe(true);
  });

  it('"Versão para computador" (janela de 980px, tela de 390): continua mobile', () => {
    expect(ehLayoutMobile({ largura: 980, toque: true, menorLadoTela: 390 })).toBe(true);
  });

  it('notebook com mouse: janela estreita ainda vale (redimensionar o navegador), larga não', () => {
    expect(ehLayoutMobile({ largura: 700, toque: false, menorLadoTela: 1080 })).toBe(true);
    expect(ehLayoutMobile({ largura: 1280, toque: false, menorLadoTela: 1080 })).toBe(false);
  });

  it('notebook com tela de toque e mouse (pointer fine): não vira mobile', () => {
    expect(ehLayoutMobile({ largura: 1366, toque: false, menorLadoTela: 768 })).toBe(false);
  });

  it('tablet de 10": em pé e deitado continuam no layout clássico', () => {
    expect(ehLayoutMobile({ largura: 800, toque: true, menorLadoTela: 800 })).toBe(false);
    expect(ehLayoutMobile({ largura: 1280, toque: true, menorLadoTela: 800 })).toBe(false);
  });

  it('tela física no limite (768) conta; um pixel acima não', () => {
    expect(ehLayoutMobile({ largura: 1024, toque: true, menorLadoTela: 768 })).toBe(true);
    expect(ehLayoutMobile({ largura: 1024, toque: true, menorLadoTela: 769 })).toBe(false);
  });

  it('sem medida da tela (NaN, 0): só vale a largura', () => {
    expect(ehLayoutMobile({ largura: 900, toque: true, menorLadoTela: NaN })).toBe(false);
    expect(ehLayoutMobile({ largura: 900, toque: true, menorLadoTela: 0 })).toBe(false);
    expect(ehLayoutMobile({ largura: 500, toque: true, menorLadoTela: NaN })).toBe(true);
  });

  it('o limite é configurável', () => {
    expect(ehLayoutMobile({ largura: 900, toque: false, menorLadoTela: 1080, limite: 1000 })).toBe(true);
  });
});

describe('ehSiteDeComputadorNoToque', () => {
  const base = { largura: 980, toque: true, menorLadoTela: 390 };

  it('Chrome do celular em "Versão para computador" (UA Linux de mesa, janela larga, tela pequena)', () => {
    expect(ehSiteDeComputadorNoToque({ ...base, userAgent: UA_SITE_COMPUTADOR })).toBe(true);
  });

  it('celular normal ou tablet Android (UA com Android): não é', () => {
    expect(ehSiteDeComputadorNoToque({ ...base, userAgent: UA_CELULAR })).toBe(false);
    expect(ehSiteDeComputadorNoToque({ ...base, largura: 1024, userAgent: UA_TABLET })).toBe(false);
  });

  it('computador de verdade: Windows, ou Linux de mesa com mouse e tela grande', () => {
    expect(ehSiteDeComputadorNoToque({ largura: 1280, toque: false, menorLadoTela: 1080, userAgent: UA_WINDOWS })).toBe(false);
    expect(ehSiteDeComputadorNoToque({ largura: 1280, toque: false, menorLadoTela: 1080, userAgent: UA_SITE_COMPUTADOR })).toBe(false);
    expect(ehSiteDeComputadorNoToque({ largura: 1280, toque: true, menorLadoTela: 1080, userAgent: UA_SITE_COMPUTADOR })).toBe(false);
  });

  it('janela estreita (já é layout mobile): não precisa avisar', () => {
    expect(ehSiteDeComputadorNoToque({ ...base, largura: 390, userAgent: UA_SITE_COMPUTADOR })).toBe(false);
  });

  it('sem user agent ou sem medida da tela: não avisa', () => {
    expect(ehSiteDeComputadorNoToque({ ...base, userAgent: '' })).toBe(false);
    expect(ehSiteDeComputadorNoToque({ ...base, userAgent: UA_SITE_COMPUTADOR, menorLadoTela: NaN })).toBe(false);
  });
});
