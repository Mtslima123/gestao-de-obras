// Verificação ortográfica PT-BR — funções puras (sem state, sem JSX, sem I/O).
// Recebe o conteúdo dos arquivos Hunspell (.aff/.dic do VERO) já lidos como string e
// devolve um índice consultável; o carregamento/fetch fica no módulo de serviço.
//
// POR QUE UM MOTOR PRÓPRIO: nspell/typo-js expandem as regras de afixo de forma ansiosa
// (geram todas as formas de todos os radicais no boot). Com o VERO isso dá ~10 milhões
// de formas e ~1,5GB de heap — trava o navegador. Aqui o caminho é o do Hunspell de
// verdade: indexar só os radicais do .dic e, para uma palavra desconhecida, tentar
// DESFAZER as regras de sufixo/prefixo sobre ELA ("stripping" preguiçoso). Custo:
// ~0,05ms por palavra, ~40MB de heap.
//
// O índice reverso é por TERMINAÇÃO ADICIONADA (campo `add` da regra) e, dentro dela,
// por `stripping` — assim uma palavra testa só as regras que poderiam tê-la produzido,
// e cada radical hipotético é procurado no dicionário uma única vez.

// Letra = qualquer letra Unicode MENOS os ordinais 'ª'/'º'. Eles são categoria Unicode
// Lo (Letter), então \p{L} os captura: um tokenizador ingênuo extrai "º" de
// "2º pavimento" e o marca como erro. Daí a dupla negação [^\P{L}ªº].
// ATENÇÃO: tem que ser literal de regex. Montado por template string, o \p vira escape
// de string inválido e a regex quebra ("Incomplete quantifier").
const RE_TOKEN = /(?:[^\P{L}ªº]|\p{M})+(?:['’-](?:[^\P{L}ªº]|\p{M})+)*/gu;

// Hífen/apóstrofo só valem NO MEIO da palavra (a regex acima já garante isso), então
// "pré-moldado" e "d'água" saem como UM token — o motor decide depois se valida inteiro
// ou por partes. Ambos existem como verbete próprio no VERO, mas a quebra por partes
// continua sendo o fallback para compostos que o dicionário não lista.
const RE_DIVISOR = /['’-]/;

const SIGLA_MAX = 5;
const ROMANO_MAX = 7; // XXVIII
const MIN_LETRAS = 3;

// Teto de combinações MAP testadas (troca de acento em 1 ou 2 posições). "instalacoes"
// precisa de duas trocas simultâneas (c→ç e o→õ), então 1 posição não basta.
const MAX_COMBINACOES_MAP = 400;

// Tokens da descrição de uma etapa, com a posição no texto original — o modal precisa
// dos índices para destacar/substituir sem reprocessar a string.
export function tokenizarEtapa(texto) {
  if (!texto) return [];
  const out = [];
  RE_TOKEN.lastIndex = 0;
  let m;
  while ((m = RE_TOKEN.exec(texto)) !== null) {
    out.push({ palavra: m[0], inicio: m.index, fim: m.index + m[0].length });
  }
  return out;
}

const soMaiusculas = (p) => p === p.toLocaleUpperCase('pt-BR') && p !== p.toLocaleLowerCase('pt-BR');

// Ruído que nunca deve virar "erro ortográfico" na Lista: palavra curta demais para
// julgar, qualquer coisa com dígito, sigla curta em caixa alta (ARM, EAP, RDO, SPDA) e
// numeral romano. Preferimos deixar passar do que incomodar com falso alarme.
export function deveIgnorarToken(palavra) {
  if (!palavra || palavra.length < MIN_LETRAS) return true;
  if (/\d/.test(palavra)) return true;
  if (palavra.length <= SIGLA_MAX && soMaiusculas(palavra)) return true;
  // Romano SÓ em caixa alta — que é como se escreve na prática ("Bloco XVIII"). Aceitar
  // minúscula aqui faria "mil", "vil" e "dilui" passarem sem verificação nenhuma.
  // Até 5 letras isso já é redundante com a regra de sigla; a regra cobre XXVIII e afins.
  if (palavra.length <= ROMANO_MAX && /^[IVXLCDM]+$/.test(palavra)) return true;
  return false;
}

// Aplica a caixa da ocorrência original à substituição: TUDO MAIÚSCULO mantém tudo
// maiúsculo, Inicial mantém a inicial, o resto vai para minúsculas.
function aplicarCaixa(original, nova) {
  if (original.length > 1 && soMaiusculas(original)) return nova.toLocaleUpperCase('pt-BR');
  const inicial = original[0];
  if (inicial && inicial === inicial.toLocaleUpperCase('pt-BR') && inicial !== inicial.toLocaleLowerCase('pt-BR')) {
    return nova[0].toLocaleUpperCase('pt-BR') + nova.slice(1).toLocaleLowerCase('pt-BR');
  }
  return nova.toLocaleLowerCase('pt-BR');
}

// Troca TOKEN INTEIRO (nunca substring): corrigir "laje" não pode encostar em "lajes".
// Usa tokenizarEtapa para achar as fronteiras — regex solta com \b não serve porque \b
// não entende acento nem trata o hífen interno.
export function substituirTokens(texto, alvo, nova) {
  if (!texto || !alvo || !nova) return texto;
  const alvoLower = alvo.toLocaleLowerCase('pt-BR');
  const tokens = tokenizarEtapa(texto).filter(t => t.palavra.toLocaleLowerCase('pt-BR') === alvoLower);
  if (!tokens.length) return texto;
  let out = texto;
  // De trás para frente: assim os índices dos tokens ainda não processados continuam válidos.
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    out = out.slice(0, t.inicio) + aplicarCaixa(t.palavra, nova) + out.slice(t.fim);
  }
  return out;
}

// A condição do Hunspell já é quase regex: '.', '[abc]', '[^abc]' ou string literal.
// Só o que aparece fora de colchetes precisa de escape (o VERO só usa letras e '.',
// mas o escape protege de outras versões do dicionário).
function condParaRegex(cond, ehSufixo) {
  const fonte = cond === '.' ? '.' : escaparCondicao(cond);
  return new RegExp(ehSufixo ? `${fonte}$` : `^${fonte}`, 'u');
}

function escaparCondicao(cond) {
  let out = '';
  let dentroClasse = false;
  for (const ch of cond) {
    if (ch === '[') { dentroClasse = true; out += ch; continue; }
    if (ch === ']') { dentroClasse = false; out += ch; continue; }
    if (dentroClasse) { out += ch; continue; }
    out += /[.*+?^${}()|\\]/.test(ch) ? `\\${ch}` : ch;
  }
  return out;
}

const campos = (linha) => linha.trim().split(/[ \t]+/);
const ehCabecalho = (f) => f.length === 4 && (f[2] === 'Y' || f[2] === 'N') && /^\d+$/.test(f[3]);

// Lê o .aff: grupos SFX/PFX (com a condição já pré-compilada em regex), tabela REP
// (sugestão por troca de substring), grupos MAP (sugestão por troca de acento) e o
// alfabeto TRY (fonte de caracteres para distância de edição 1).
export function parseAff(affTexto) {
  const sfx = new Map();
  const pfx = new Map();
  const rep = [];
  const map = [];
  let tryChars = '';
  let nosuggest = '';
  let forbidden = '';

  for (const linha of affTexto.split(/\r?\n/)) {
    if (!linha || linha[0] === '#') continue;
    const f = campos(linha);
    const tipo = f[0];

    if (tipo === 'SFX' || tipo === 'PFX') {
      const destino = tipo === 'SFX' ? sfx : pfx;
      const flag = f[1];
      if (ehCabecalho(f)) {
        destino.set(flag, { combineComPfx: f[2] === 'Y', regras: [] });
        continue;
      }
      if (f.length < 4) continue;
      const grupo = destino.get(flag) || { combineComPfx: true, regras: [] };
      if (!destino.has(flag)) destino.set(flag, grupo);
      const stripping = f[2] === '0' ? '' : f[2];
      const add = f[3] === '0' ? '' : f[3];
      const condition = f[4] || '.';
      grupo.regras.push({ stripping, add, condition, condRegex: condParaRegex(condition, tipo === 'SFX') });
      continue;
    }

    if (tipo === 'REP' && f.length === 3 && !/^\d+$/.test(f[1])) {
      // '_' representa espaço na tabela REP do Hunspell.
      rep.push({ de: f[1].replace(/_/g, ' '), para: f[2].replace(/_/g, ' ') });
      continue;
    }
    if (tipo === 'MAP' && f.length === 2 && !/^\d+$/.test(f[1])) { map.push([...f[1]]); continue; }
    if (tipo === 'TRY' && f.length >= 2) { tryChars = f[1]; continue; }
    if (tipo === 'NOSUGGEST' && f.length >= 2) { nosuggest = f[1]; continue; }
    if (tipo === 'FORBIDDENWORD' && f.length >= 2) { forbidden = f[1]; continue; }
  }

  return { sfx, pfx, rep, map, try: tryChars, nosuggest, forbidden };
}

// Índice reverso: add -> stripping -> regras. Para uma palavra, o radical hipotético
// depende só do `stripping`, então agrupar por ele deixa uma única busca no `stems` por
// radical candidato (em vez de uma por regra).
function indexarPorAdd(grupos) {
  const porAdd = new Map();
  let maxAdd = 0;
  grupos.forEach((grupo, flag) => {
    grupo.regras.forEach(r => {
      if (r.add.length > maxAdd) maxAdd = r.add.length;
      let porStrip = porAdd.get(r.add);
      if (!porStrip) { porStrip = new Map(); porAdd.set(r.add, porStrip); }
      let lista = porStrip.get(r.stripping);
      if (!lista) { lista = []; porStrip.set(r.stripping, lista); }
      lista.push({ flag, combineComPfx: grupo.combineComPfx, ...r });
    });
  });
  return { porAdd, maxAdd };
}

// Monta o índice consultável a partir do .aff já parseado e do texto cru do .dic.
// Radicais ficam em minúsculas: a comparação é case-insensitive (o objetivo é não gerar
// falso-positivo, e nomes próprios em caixa baixa não incomodam ninguém aqui).
export function montarIndice(affParse, dicTexto) {
  const stems = new Map();
  const proibidas = new Set();
  const linhas = dicTexto.split(/\r?\n/);
  // Primeira linha é só a contagem de verbetes.
  for (let i = 1; i < linhas.length; i++) {
    const linha = linhas[i];
    if (!linha) continue;
    const corte = linha.indexOf('/');
    const bruto = corte === -1 ? linha : linha.slice(0, corte);
    const palavra = bruto.trim();
    if (!palavra) continue;
    const flagsTxt = corte === -1 ? '' : linha.slice(corte + 1).trim();
    const chave = palavra.toLocaleLowerCase('pt-BR');
    let set = stems.get(chave);
    if (!set) { set = new Set(); stems.set(chave, set); }
    // FLAG UTF-8: cada caractere do campo é um flag independente (sem alias AF).
    for (const ch of flagsTxt) set.add(ch);
    // FORBIDDENWORD marca a grafia como ERRADA (ex.: "menas", "Kg"). Só vale quando o
    // verbete não tem nenhum outro flag — aí ele existe no .dic só para ser recusado.
    if (affParse.forbidden && flagsTxt === affParse.forbidden) proibidas.add(chave);
  }

  const sfxIdx = indexarPorAdd(affParse.sfx);
  const pfxIdx = indexarPorAdd(affParse.pfx);
  return {
    aff: affParse,
    stems,
    proibidas,
    sfxPorAdd: sfxIdx.porAdd,
    maxAddSfx: sfxIdx.maxAdd,
    pfxPorAdd: pfxIdx.porAdd,
    maxAddPfx: pfxIdx.maxAdd,
    totalRadicais: stems.size,
  };
}

const flagsDe = (indice, radical) => (indice.proibidas.has(radical) ? undefined : indice.stems.get(radical));

// Percorre as regras de sufixo que poderiam ter produzido `palavra` e chama `visitar`
// com o radical hipotético + a regra. Inclui naturalmente as regras de `add` vazio
// (SFX ... 0 ...), que só removem terminação do radical — sem elas "argamassa",
// "revestimento", "subsolo" e "reboco" viram erro, porque no VERO só existem assim.
function tentarSufixos(indice, palavra, visitar) {
  const limite = Math.min(indice.maxAddSfx, palavra.length);
  for (let n = 0; n <= limite; n++) {
    const porStrip = indice.sfxPorAdd.get(n === 0 ? '' : palavra.slice(palavra.length - n));
    if (!porStrip) continue;
    const base = palavra.slice(0, palavra.length - n);
    for (const [strip, regras] of porStrip) {
      const radical = base + strip;
      if (!radical) continue;
      if (visitar(radical, regras)) return true;
    }
  }
  return false;
}

function tentarPrefixos(indice, palavra, visitar) {
  const limite = Math.min(indice.maxAddPfx, palavra.length);
  for (let n = 0; n <= limite; n++) {
    const porStrip = indice.pfxPorAdd.get(n === 0 ? '' : palavra.slice(0, n));
    if (!porStrip) continue;
    const resto = palavra.slice(n);
    for (const [strip, regras] of porStrip) {
      const radical = strip + resto;
      if (!radical) continue;
      if (visitar(radical, regras)) return true;
    }
  }
  return false;
}

const regraServe = (regras, flags, radical) => regras.some(r => flags.has(r.flag) && r.condRegex.test(radical));

// Ordem de tentativa: forma-base -> sufixo -> prefixo -> prefixo+sufixo -> composto.
export function palavraConhecida(indice, palavra) {
  if (!palavra) return false;
  const alvo = palavra.toLocaleLowerCase('pt-BR');

  // 1) O próprio verbete (com ou sem flags — flags só governam derivações).
  if (indice.stems.has(alvo) && !indice.proibidas.has(alvo)) return true;

  // 2) Sufixo.
  if (tentarSufixos(indice, alvo, (radical, regras) => {
    const flags = flagsDe(indice, radical);
    return !!flags && regraServe(regras, flags, radical);
  })) return true;

  // 3) Prefixo.
  if (tentarPrefixos(indice, alvo, (radical, regras) => {
    const flags = flagsDe(indice, radical);
    return !!flags && regraServe(regras, flags, radical);
  })) return true;

  // 4) Prefixo + sufixo (cross-product). Simplificação assumida: as duas condições são
  // testadas contra o radical final — como prefixo mexe no começo e sufixo no fim, o
  // início do radical intermediário é o mesmo do radical de dicionário.
  if (tentarPrefixos(indice, alvo, (intermediario, regrasPfx) => (
    tentarSufixos(indice, intermediario, (radical, regrasSfx) => {
      const flags = flagsDe(indice, radical);
      if (!flags) return false;
      const pfxOk = regrasPfx.filter(r => flags.has(r.flag) && r.condRegex.test(radical));
      if (!pfxOk.length) return false;
      return regrasSfx.some(r => flags.has(r.flag) && r.condRegex.test(radical)
        && (r.combineComPfx || pfxOk.some(p => p.combineComPfx)));
    })
  ))) return true;

  // 5) Composto com hífen/apóstrofo: aceita se TODAS as partes forem conhecidas.
  if (RE_DIVISOR.test(alvo)) {
    const partes = alvo.split(RE_DIVISOR).filter(Boolean);
    if (partes.length > 1 && partes.every(p => palavraConhecida(indice, p))) return true;
  }

  return false;
}

// Sugestão nunca deve vir com maiúscula no meio (artefato de aplicar MAP, cujos grupos
// trazem as variantes em caixa alta junto).
const maiusculaNoMeio = (p) => [...p].slice(1).some(ch => ch !== ch.toLocaleLowerCase('pt-BR'));

// NOSUGGEST: verbete válido que o dicionário pede para não oferecer (letras soltas,
// grafias raras). Só filtra quando a sugestão é o verbete cru.
function ehNoSuggest(indice, cand) {
  const flag = indice.aff.nosuggest;
  if (!flag) return false;
  const flags = indice.stems.get(cand);
  return !!flags && flags.has(flag) && flags.size === 1;
}

const contarDivisores = (p) => (p.match(/['’-]/g) || []).length;

function criarColetor(indice, original, max) {
  const vistos = new Set();
  const out = [];
  // A tabela REP tem pares que INSEREM hífen ("s" -> "s-"). Como palavraConhecida aceita
  // composto cujas partes existem, "Revestimeto" ganharia "revesti-meto" de sugestão.
  // Candidato não pode trazer mais hífen/apóstrofo do que a palavra original.
  const maxDivisores = contarDivisores(original);
  return {
    out,
    cheio: () => out.length >= max,
    tentar(cand) {
      if (!cand || vistos.has(cand) || out.length >= max) return false;
      vistos.add(cand);
      if (/\s/.test(cand) || maiusculaNoMeio(cand)) return false;
      if (contarDivisores(cand) > maxDivisores) return false;
      if (!palavraConhecida(indice, cand) || ehNoSuggest(indice, cand)) return false;
      out.push(cand);
      return true;
    },
  };
}

// Posições da palavra cujo caractere participa de algum grupo MAP, com as trocas
// possíveis (só minúsculas — as maiúsculas do grupo virariam ruído no meio da palavra).
function posicoesMap(indice, palavra) {
  const posicoes = [];
  for (let i = 0; i < palavra.length; i++) {
    const ch = palavra[i];
    const alternativas = [];
    indice.aff.map.forEach(grupo => {
      if (!grupo.includes(ch)) return;
      grupo.forEach(alt => {
        const baixo = alt.toLocaleLowerCase('pt-BR');
        if (baixo !== ch && !alternativas.includes(baixo)) alternativas.push(baixo);
      });
    });
    if (alternativas.length) posicoes.push({ i, alternativas });
  }
  return posicoes;
}

const trocar = (p, i, ch) => p.slice(0, i) + ch + p.slice(i + 1);

// Sugestões em três ondas, da mais provável para a mais genérica:
// (1) tabela REP do dicionário (erros clássicos: j/g, s/z, ss/ç);
// (2) troca de acento pelos grupos MAP, em 1 ou 2 posições ("instalacoes" precisa de duas);
// (3) distância de edição 1 com o alfabeto TRY.
export function gerarSugestoes(indice, palavra, max = 8) {
  if (!palavra) return [];
  const alvo = palavra.toLocaleLowerCase('pt-BR');
  const coletor = criarColetor(indice, alvo, max);

  for (const { de, para } of indice.aff.rep) {
    if (coletor.cheio()) break;
    if (!de || !alvo.includes(de)) continue;
    coletor.tentar(alvo.split(de).join(para));
  }

  if (!coletor.cheio()) {
    const posicoes = posicoesMap(indice, alvo);
    let testadas = 0;
    for (const p of posicoes) {
      for (const alt of p.alternativas) {
        if (coletor.cheio() || testadas++ >= MAX_COMBINACOES_MAP) break;
        coletor.tentar(trocar(alvo, p.i, alt));
      }
    }
    for (let a = 0; a < posicoes.length && !coletor.cheio() && testadas < MAX_COMBINACOES_MAP; a++) {
      for (let b = a + 1; b < posicoes.length && !coletor.cheio() && testadas < MAX_COMBINACOES_MAP; b++) {
        for (const altA of posicoes[a].alternativas) {
          for (const altB of posicoes[b].alternativas) {
            if (coletor.cheio() || testadas++ >= MAX_COMBINACOES_MAP) break;
            coletor.tentar(trocar(trocar(alvo, posicoes[a].i, altA), posicoes[b].i, altB));
          }
        }
      }
    }
  }

  if (!coletor.cheio()) {
    const alfabeto = [...indice.aff.try].filter(ch => ch === ch.toLocaleLowerCase('pt-BR'));
    // Transposição e remoção primeiro: são os erros de digitação mais comuns e o espaço
    // de busca é pequeno, então entram na frente das ~900 inserções/substituições.
    for (let i = 0; i < alvo.length - 1 && !coletor.cheio(); i++) {
      coletor.tentar(alvo.slice(0, i) + alvo[i + 1] + alvo[i] + alvo.slice(i + 2));
    }
    for (let i = 0; i < alvo.length && !coletor.cheio(); i++) {
      coletor.tentar(alvo.slice(0, i) + alvo.slice(i + 1));
    }
    for (let i = 0; i < alvo.length && !coletor.cheio(); i++) {
      for (const ch of alfabeto) {
        if (coletor.cheio()) break;
        if (ch !== alvo[i]) coletor.tentar(trocar(alvo, i, ch));
      }
    }
    for (let i = 0; i <= alvo.length && !coletor.cheio(); i++) {
      for (const ch of alfabeto) {
        if (coletor.cheio()) break;
        coletor.tentar(alvo.slice(0, i) + ch + alvo.slice(i));
      }
    }
  }

  return coletor.out.map(s => aplicarCaixa(palavra, s));
}
