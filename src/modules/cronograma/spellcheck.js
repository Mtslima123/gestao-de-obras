// Carregamento e estado do verificador ortográfico PT-BR — a parte com I/O de
// spellcheckPure.js (que é lógica pura, sem fetch/localStorage).
import { parseAff, montarIndice, palavraConhecida } from './spellcheckPure';

const URL_AFF = '/dicionarios/pt-BR/pt-BR-vero32.aff.txt';
const URL_DIC = '/dicionarios/pt-BR/pt-BR-vero32.dic.txt';
const LS_PESSOAL   = 'ls_crono_dic_pessoal';   // palavras adicionadas pelo usuário (persistente)
const LS_IGNORADAS = 'ls_crono_dic_ignoradas'; // "ignorar sempre" (persistente, entre sessões)

// Jargão/abreviação de canteiro de obra que o VERO não conhece (ele é o dicionário do
// LibreOffice, não tem vocabulário técnico de construção). "Adicionar ao dicionário"
// no modal cobre o resto — esta lista é só uma semente para não incomodar de cara.
export const GLOSSARIO_OBRA = new Set([
  'pav', 'pavs', 'fck', 'mpa', 'eap', 'rdo', 'spda', 'fôrma', 'fôrmas', 'graute', 'slump',
]);

let _indicePromise = null;
let _pronto = false;

// Carrega e monta o índice do dicionário sob demanda (só na 1ª abertura da revisão) e
// cacheia num singleton do módulo — reabrir a revisão depois é instantâneo.
export function carregarVerificador() {
  if (!_indicePromise) {
    _indicePromise = Promise.all([
      fetch(URL_AFF).then(r => r.text()),
      fetch(URL_DIC).then(r => r.text()),
    ]).then(([affTexto, dicTexto]) => {
      const indice = montarIndice(parseAff(affTexto), dicTexto);
      _pronto = true;
      return indice;
    });
  }
  return _indicePromise;
}

export function verificadorPronto() { return _pronto; }

const lerSet = (chave) => {
  try { return new Set(JSON.parse(localStorage.getItem(chave) || '[]')); } catch { return new Set(); }
};
const gravarSet = (chave, set) => {
  try { localStorage.setItem(chave, JSON.stringify([...set])); } catch { /* best-effort */ }
};

let _pessoal = null;
let _ignoradas = null;
const getPessoal   = () => (_pessoal   ??= lerSet(LS_PESSOAL));
const getIgnoradas = () => (_ignoradas ??= lerSet(LS_IGNORADAS));

export const lerDicionarioPessoal = () => new Set(getPessoal());
export const lerIgnoradasSempre   = () => new Set(getIgnoradas());

export function adicionarAoDicionarioPessoal(palavra) {
  getPessoal().add(palavra.toLocaleLowerCase('pt-BR'));
  gravarSet(LS_PESSOAL, getPessoal());
}
export function ignorarSempre(palavra) {
  getIgnoradas().add(palavra.toLocaleLowerCase('pt-BR'));
  gravarSet(LS_IGNORADAS, getIgnoradas());
}

// Consulta única usada pelo modal de revisão: glossário de obra → dicionário pessoal →
// ignoradas sempre → motor do VERO (nessa ordem, do mais barato pro mais caro).
export function correta(indice, palavra) {
  const lc = palavra.toLocaleLowerCase('pt-BR');
  if (GLOSSARIO_OBRA.has(lc) || getPessoal().has(lc) || getIgnoradas().has(lc)) return true;
  return palavraConhecida(indice, palavra);
}
