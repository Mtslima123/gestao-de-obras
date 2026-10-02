// offlinePure.js — regras puras do modo offline: cache de leitura (services/offlineCache.js)
// e fila de envio (services/offlineQueue.js), separadas pra testar em Node (vitest sem
// IndexedDB). Mesmo padrão de authGatePure.js.
import { NETWORK_ERROR_RE } from './friendlyError';

// Sobe quando o formato do que é guardado muda: registro de versão antiga é ignorado em
// vez de quebrar a tela com um formato que o código novo não entende.
export const VERSAO_CACHE = 1;
// Mesma validade do gm_auth_cache (App.jsx): sem rede por mais que isso, o dado é velho
// demais pra servir de referência em campo.
export const VALIDADE_CACHE_MS = 30 * 24 * 60 * 60 * 1000;

// Chave começa pelo usuário: tablet compartilhado, o dado de uma pessoa nunca é lido
// com o login de outra, e dá pra apagar tudo de alguém por prefixo.
export const chaveLeitura = (uid, tipo, escopo = '-') => `${uid}|${tipo}|${escopo}`;

export function leituraValida(reg, { uid, agora = Date.now() } = {}) {
  if (!reg || !uid || reg.userId !== uid) return false;
  if (reg.versao !== VERSAO_CACHE) return false;
  const idade = agora - (reg.salvoEm || 0);
  return idade >= 0 && idade <= VALIDADE_CACHE_MS;
}

const dois = (n) => String(n).padStart(2, '0');

// "hoje às 14:32" / "02/10 às 14:32" — entra nas faixas de aviso: a pessoa precisa saber
// que está vendo o que foi carregado da última vez com internet, não o estado atual.
export function quandoFoiGuardado(salvoEm, agora = Date.now()) {
  const d = new Date(salvoEm);
  const h = new Date(agora);
  const hora = `${dois(d.getHours())}:${dois(d.getMinutes())}`;
  const mesmoDia = d.getFullYear() === h.getFullYear() && d.getMonth() === h.getMonth() && d.getDate() === h.getDate();
  return mesmoDia ? `hoje às ${hora}` : `${dois(d.getDate())}/${dois(d.getMonth() + 1)} às ${hora}`;
}

// Cada reprogramação guarda uma cópia inteira do cronograma (~500 KB). A Medição só usa
// mesRef/criadaEm (mesesComReprogramacao em scheduleEngine.js) e a seleção usa o id.
export const reduzirReprogramacoes = (reps) =>
  (reps || []).map(({ id, nome, mesRef, criadaEm }) => ({ id, nome, mesRef, criadaEm }));

// ── Fila de envio (services/offlineQueue.js) ─────────────────────────────────────────

// Mesmo papel do VERSAO_CACHE: item gravado num formato antigo fica parado em vez de ser
// enviado errado por um código que não o entende mais.
export const VERSAO_FILA = 1;

// Espera entre tentativas depois de falha de rede: em "sem sinal" o evento `online` nunca
// dispara, então a própria fila precisa tentar de novo sozinha, cada vez mais espaçado.
const ATRASOS_MS = [15000, 30000, 60000, 120000, 300000];
export const proximoAtraso = (falhasSeguidas) => ATRASOS_MS[Math.min(Math.max(falhasSeguidas, 0), ATRASOS_MS.length - 1)];

// O que uma passada da fila envia: só itens da pessoa logada (nunca a foto de alguém com a
// sessão de outro), pendentes (os "revisar" esperam a pessoa), da versão atual e de um
// tipo que tem quem envie; do mais antigo pro mais novo.
export function itensParaEnviar(itens, { uid, tipos }) {
  return (itens || [])
    .filter((i) => i.userId === uid && i.status === 'pendente' && i.versao === VERSAO_FILA && tipos.has(i.tipo))
    .sort((a, b) => (a.criadoEm < b.criadoEm ? -1 : a.criadoEm > b.criadoEm ? 1 : 0));
}

// Item que ficou mais de 30 dias na fila (mesma validade do cache): usado só pra limpar o
// que OUTRA pessoa deixou no aparelho e não voltou pra enviar.
export function itemDaFilaVencido(item, agora = Date.now()) {
  const criado = Date.parse(item?.criadoEm || '');
  return !Number.isFinite(criado) || agora - criado > VALIDADE_CACHE_MS;
}

// Resposta do Storage quando o arquivo já está lá. Num reenvio, prova que a tentativa
// anterior chegou (e só a resposta se perdeu): conta como enviado, não como erro.
export const arquivoJaExiste = (error) =>
  !!error && (String(error.statusCode) === '409' || error.status === 409 || /already exists|duplicate/i.test(error.message || ''));

// Falha que vale tentar de novo mais tarde (sem rede, servidor fora, tempo esgotado) ×
// erro definitivo (sem permissão, dado recusado), que não adianta repetir: vira "revisar".
export function ehFalhaPassageira(error) {
  if (!error) return false;
  if (typeof error.passageira === 'boolean') return error.passageira; // já classificado por quem lançou
  if (error.timeout || error.status === 0) return true;
  const status = Number(error.statusCode ?? error.status);
  // 401: login vencido no meio do caminho. A fila renova a sessão antes do próximo item
  // (e para se ela tiver caído de vez), então vale tentar de novo.
  if (status >= 500 || status === 401 || status === 408 || status === 429) return true;
  const texto = `${error.name || ''} ${error.message || ''} ${error.originalError?.message || ''}`;
  return NETWORK_ERROR_RE.test(texto) || /StorageUnknownError|AbortError|TimeoutError/i.test(texto);
}
