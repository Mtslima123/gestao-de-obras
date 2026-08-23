// Testes unitários do motor de verificação ortográfica PT-BR.
// Roda em node (sem browser): o teste de integração lê os arquivos reais do VERO em
// public/dicionarios/pt-BR/ direto do disco. Executar: npm test
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  tokenizarEtapa, deveIgnorarToken, substituirTokens,
  parseAff, montarIndice, palavraConhecida, gerarSugestoes,
} from '../modules/cronograma/spellcheckPure';

describe('tokenizarEtapa', () => {
  // 'º' (U+00BA) e 'ª' (U+00AA) são categoria Unicode Lo, então \p{L} os captura:
  // um tokenizador ingênuo tiraria "º" de "2º pavimento" e marcaria como erro.
  it('não extrai os ordinais º/ª como token', () => {
    expect(tokenizarEtapa('Concretagem 2º pavimento').map(t => t.palavra))
      .toEqual(['Concretagem', 'pavimento']);
    expect(tokenizarEtapa('3ª etapa').map(t => t.palavra)).toEqual(['etapa']);
  });

  it('não extrai dígitos nem pontuação', () => {
    expect(tokenizarEtapa('Alvenaria 1º pav. (bloco A)').map(t => t.palavra))
      .toEqual(['Alvenaria', 'pav', 'bloco', 'A']);
  });

  // DECISÃO DE DESIGN: hífen e apóstrofo NO MEIO da palavra ficam dentro do token —
  // "pré-moldado" e "d'água" saem como UM token só. Quem decide se aceita inteiro ou
  // por partes é palavraConhecida (ambos existem como verbete próprio no VERO; a
  // quebra em partes é o fallback para compostos não listados).
  it('mantém hífen e apóstrofo internos no mesmo token', () => {
    expect(tokenizarEtapa('pré-moldado').map(t => t.palavra)).toEqual(['pré-moldado']);
    expect(tokenizarEtapa("d'água").map(t => t.palavra)).toEqual(["d'água"]);
    expect(tokenizarEtapa("Caixa d'água e guarda-corpo").map(t => t.palavra))
      .toEqual(['Caixa', "d'água", 'e', 'guarda-corpo']);
  });

  it('não deixa hífen/apóstrofo na borda do token', () => {
    expect(tokenizarEtapa('-laje- e "viga"').map(t => t.palavra)).toEqual(['laje', 'e', 'viga']);
  });

  it('devolve índices que recortam exatamente a palavra no texto original', () => {
    const texto = "Concretagem 2º pav. — pré-moldado e d'água";
    tokenizarEtapa(texto).forEach(t => {
      expect(texto.slice(t.inicio, t.fim)).toBe(t.palavra);
    });
  });

  it('texto vazio ou nulo devolve lista vazia', () => {
    expect(tokenizarEtapa('')).toEqual([]);
    expect(tokenizarEtapa(null)).toEqual([]);
  });

  it('é reentrante (lastIndex do regex global não vaza entre chamadas)', () => {
    const a = tokenizarEtapa('laje viga pilar').map(t => t.palavra);
    const b = tokenizarEtapa('laje viga pilar').map(t => t.palavra);
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
  });
});

describe('deveIgnorarToken', () => {
  it('ignora palavra curta demais para julgar', () => {
    expect(deveIgnorarToken('de')).toBe(true);
    expect(deveIgnorarToken('e')).toBe(true);
    expect(deveIgnorarToken('laje')).toBe(false);
  });

  it('ignora qualquer coisa com dígito', () => {
    expect(deveIgnorarToken('CA50')).toBe(true);
    expect(deveIgnorarToken('h30')).toBe(true);
  });

  it('ignora sigla curta em caixa alta', () => {
    ['ARM', 'EAP', 'RDO', 'SPDA', 'NBR'].forEach(s => expect(deveIgnorarToken(s)).toBe(true));
  });

  it('não ignora palavra longa em caixa alta (grupo do cronograma pode ter erro)', () => {
    expect(deveIgnorarToken('ESTRUTURA')).toBe(false);
    expect(deveIgnorarToken('ESTRUTURAA')).toBe(false);
  });

  it('ignora numeral romano', () => {
    ['II', 'IV', 'VIII', 'XVIII', 'XXVIII'].forEach(s => expect(deveIgnorarToken(s)).toBe(true));
    // A regra de romano é só para CAIXA ALTA: em minúscula ela engoliria palavras
    // reais como "mil", "vil" e "civil" e elas nunca seriam verificadas.
    expect(deveIgnorarToken('civil')).toBe(false);
    expect(deveIgnorarToken('mil')).toBe(false);
  });
});

describe('substituirTokens', () => {
  it('respeita a fronteira do token (não é substring)', () => {
    expect(substituirTokens('a laje e as lajes', 'laje', 'viga')).toBe('a viga e as lajes');
    expect(substituirTokens('lajes', 'laje', 'viga')).toBe('lajes');
  });

  it('troca todas as ocorrências preservando a caixa de cada uma', () => {
    expect(substituirTokens('Concretajem', 'concretajem', 'concretagem')).toBe('Concretagem');
    expect(substituirTokens('CONCRETAJEM', 'concretajem', 'concretagem')).toBe('CONCRETAGEM');
    expect(substituirTokens('concretajem', 'concretajem', 'concretagem')).toBe('concretagem');
    expect(substituirTokens('Concretajem, CONCRETAJEM e concretajem', 'Concretajem', 'concretagem'))
      .toBe('Concretagem, CONCRETAGEM e concretagem');
  });

  it('mantém a pontuação e os índices ao redor', () => {
    expect(substituirTokens('Laje do 2º pav. (laje maciça)', 'laje', 'viga'))
      .toBe('Viga do 2º pav. (viga maciça)');
  });

  it('texto sem o alvo volta intacto', () => {
    expect(substituirTokens('Alvenaria de vedação', 'laje', 'viga')).toBe('Alvenaria de vedação');
    expect(substituirTokens('', 'laje', 'viga')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Integração com o dicionário VERO real. parseAff + montarIndice rodam UMA vez
// (~0,5s no total) — é o custo esperado, não vale mockar.
// ---------------------------------------------------------------------------
const lerDic = (nome) => readFileSync(fileURLToPath(new URL(`../../public/dicionarios/pt-BR/${nome}`, import.meta.url)), 'utf8');
const aff = parseAff(lerDic('pt-BR-vero32.aff.txt'));
const indice = montarIndice(aff, lerDic('pt-BR-vero32.dic.txt'));

describe('parseAff (arquivo real)', () => {
  it('lê os grupos de afixo, REP, MAP e TRY', () => {
    expect(aff.sfx.size).toBeGreaterThan(50);
    expect(aff.pfx.size).toBeGreaterThan(40);
    expect(aff.rep.length).toBeGreaterThan(1000);
    expect(aff.map).toHaveLength(6);
    expect(aff.try).toContain('á');
  });

  it('pré-compila a condição em regex utilizável', () => {
    const regras = [...aff.sfx.values()].flatMap(g => g.regras);
    expect(regras.length).toBeGreaterThan(20000);
    expect(regras.every(r => r.condRegex instanceof RegExp)).toBe(true);
    // Condições com classe negada existem e têm que funcionar como regex.
    const negada = regras.find(r => r.condition.includes('[^'));
    expect(negada).toBeDefined();
    expect(() => negada.condRegex.test('teste')).not.toThrow();
  });

  it('normaliza stripping/add "0" para string vazia e mantém as regras de add vazio', () => {
    const regras = [...aff.sfx.values()].flatMap(g => g.regras);
    // As 58 regras SFX que SÓ removem terminação do radical. Sem elas "argamassa",
    // "revestimento", "subsolo" e "reboco" seriam marcadas como erro.
    expect(regras.filter(r => r.add === '').length).toBe(58);
    expect(regras.some(r => r.add === '0')).toBe(false);
    expect(regras.some(r => r.stripping === '0')).toBe(false);
  });
});

describe('montarIndice (arquivo real)', () => {
  it('indexa os radicais ignorando a linha de contagem', () => {
    expect(indice.totalRadicais).toBeGreaterThan(300000);
    expect(indice.stems.has('312368')).toBe(false);
  });

  it('guarda os flags como caracteres independentes', () => {
    expect([...indice.stems.get('fundação')]).toEqual(expect.arrayContaining(['B', 'Q', 'W']));
  });
});

// Vocabulário de obra. A maioria NÃO é verbete direto do .dic — só existe via regra de
// afixo (argamassa/revestimento/subsolo/reboco vêm das regras SFX de add vazio). ZERO
// falso-positivo aqui é o requisito mais importante do recurso.
const CORRETAS = [
  'casa', 'obra', 'porta', 'piso', 'muro', 'cimento', 'concreto', 'projeto', 'trabalho',
  'argamassa', 'revestimento', 'subsolo', 'reboco', 'alvenaria', 'fundação', 'estrutural',
  'hidráulica', 'elétrica', 'impermeabilização', 'pavimento', 'vergalhões', 'chapisco',
  'emboço', 'pré-moldado', "d'água",
];

describe('palavraConhecida (dicionário real)', () => {
  it.each(CORRETAS)('reconhece "%s"', (p) => {
    expect(palavraConhecida(indice, p)).toBe(true);
  });

  it('reconhece a bateria inteira sem nenhum falso-positivo', () => {
    expect(CORRETAS.filter(p => !palavraConhecida(indice, p))).toEqual([]);
  });

  it('é insensível à caixa', () => {
    expect(palavraConhecida(indice, 'Argamassa')).toBe(true);
    expect(palavraConhecida(indice, 'ARGAMASSA')).toBe(true);
  });

  it('reconhece vocabulário de obra em frases reais de cronograma', () => {
    const frases = [
      'Concretagem da laje do 2º pavimento',
      'Execução de alvenaria de vedação bloco cerâmico',
      'Impermeabilização de baldrames e reservatório',
      'Instalações hidrossanitárias do subsolo',
      'Revestimento cerâmico das áreas molhadas',
      'Chapisco, emboço e reboco interno',
      'Assentamento de esquadrias de alumínio',
      'Terraplenagem e compactação do aterro',
      'Fundação profunda estaca hélice contínua',
      'Estrutura pré-moldada de concreto protendido',
      "Caixa d'água superior e barrilete",
      'Contrapiso e regularização de piso',
      'Rejuntamento e limpeza final da obra',
      'Guarda-corpo em vidro temperado laminado',
    ];
    const erros = frases.flatMap(f => tokenizarEtapa(f)
      .map(t => t.palavra)
      .filter(p => !deveIgnorarToken(p) && !palavraConhecida(indice, p)));
    expect(erros).toEqual([]);
  });

  it('recusa palavra inventada', () => {
    ['xpto', 'blargh', 'zzzzqw', 'concretx'].forEach(p => {
      expect(palavraConhecida(indice, p)).toBe(false);
    });
  });

  it('recusa entrada vazia', () => {
    expect(palavraConhecida(indice, '')).toBe(false);
    expect(palavraConhecida(indice, null)).toBe(false);
  });
});

// Erros propositais: cada um exercita um caminho diferente de sugestão —
// REP (j/g, s/z), MAP (acento) e distância de edição 1 (letra faltando).
const ERRADAS = [
  ['Concretajem', 'Concretagem'],
  ['Impermeabilisação', 'Impermeabilização'],
  ['Argamasa', 'Argamassa'],
  ['Revestimeto', 'Revestimento'],
  ['hidraulica', 'hidráulica'],
  ['instalacoes', 'instalações'],
];

describe('gerarSugestoes (dicionário real)', () => {
  it.each(ERRADAS)('marca "%s" como erro e sugere "%s" entre as 3 primeiras', (errada, certa) => {
    expect(palavraConhecida(indice, errada)).toBe(false);
    // Hoje TODAS saem em 1º lugar; a asserção é "entre as 3 primeiras" só para o teste
    // não quebrar com um ajuste fino de ordenação.
    expect(gerarSugestoes(indice, errada).slice(0, 3)).toContain(certa);
  });

  it('preserva a caixa da palavra buscada na sugestão', () => {
    expect(gerarSugestoes(indice, 'concretajem')[0]).toBe('concretagem');
    expect(gerarSugestoes(indice, 'Concretajem')[0]).toBe('Concretagem');
    expect(gerarSugestoes(indice, 'CONCRETAJEM')[0]).toBe('CONCRETAGEM');
  });

  it('não devolve sugestão com maiúscula no meio (artefato dos grupos MAP)', () => {
    ERRADAS.forEach(([errada]) => {
      gerarSugestoes(indice, errada).forEach(s => {
        expect(s.slice(1)).toBe(s.slice(1).toLocaleLowerCase('pt-BR'));
      });
    });
  });

  // A tabela REP tem pares que INSEREM hífen ("s" -> "s-"), e palavraConhecida aceita
  // composto cujas partes existem: sem o filtro, "Revestimeto" ganhava "revesti-meto".
  it('não inventa hífen que a palavra original não tinha', () => {
    ERRADAS.forEach(([errada]) => {
      gerarSugestoes(indice, errada).forEach(s => expect(s).not.toContain('-'));
    });
  });

  it('respeita o teto de sugestões e nunca repete', () => {
    const sug = gerarSugestoes(indice, 'concretajem', 3);
    expect(sug.length).toBeLessThanOrEqual(3);
    expect(new Set(sug).size).toBe(sug.length);
  });

  it('toda sugestão devolvida é uma palavra conhecida', () => {
    ERRADAS.forEach(([errada]) => {
      gerarSugestoes(indice, errada).forEach(s => expect(palavraConhecida(indice, s)).toBe(true));
    });
  });
});

describe('desempenho (dicionário real)', () => {
  it('verifica ~2000 palavras bem abaixo do orçamento de 0,2ms por palavra', () => {
    const palavras = CORRETAS.concat(ERRADAS.map(e => e[0]));
    const t0 = Date.now();
    const voltas = Math.ceil(2000 / palavras.length);
    for (let i = 0; i < voltas; i++) palavras.forEach(p => palavraConhecida(indice, p));
    const msPorPalavra = (Date.now() - t0) / (voltas * palavras.length);
    expect(msPorPalavra).toBeLessThan(0.2);
  });
});
