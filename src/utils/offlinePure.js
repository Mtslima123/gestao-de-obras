// offlinePure.js — regras puras do cache de leitura offline (services/offlineCache.js),
// separadas pra testar em Node (vitest sem IndexedDB). Mesmo padrão de authGatePure.js.

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
