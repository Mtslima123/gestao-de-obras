// offlineCache.js — guarda no aparelho o último resultado bom das leituras que o fluxo
// mobile (Medição) precisa, pra mostrar sem internet com a data de quando foi carregado.
//
// Banco separado da fila (offlineQueue.js) de propósito: o cache pode ser apagado a
// qualquer momento (Sair, outro usuário, versão nova) e a fila não pode. Separados, uma
// limpeza do cache nunca leva junto uma medição ou foto ainda não enviada.
// IndexedDB e não localStorage: o pacote do cronograma de uma obra passa de 500 KB e o
// localStorage (~5 MB no domínio inteiro) já é usado por outras telas.
import { logger } from './logger';
import { chaveLeitura, leituraValida, VERSAO_CACHE } from '../utils/offlinePure';

const DB_NAME = 'soter_offline_cache';
const STORE = 'leituras';

let _dbPromise = null;
function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB indisponível')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'chave' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch((err) => {
    _dbPromise = null; // não guarda a falha pra sempre: a próxima chamada tenta abrir de novo
    throw err;
  });
  return _dbPromise;
}

// Roda `fn(store)` numa transação e resolve com o resultado da requisição que ela devolver.
async function transacao(modo, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, modo);
    let resultado;
    const req = fn(t.objectStore(STORE));
    if (req) req.onsuccess = () => { resultado = req.result; };
    t.oncomplete = () => resolve(resultado);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

// Dono atual do cache, definido pelo App ao aplicar a sessão (real ou do gm_auth_cache).
// Sem dono, ler devolve null e gravar não faz nada.
let usuario = null;
// Só grava com sessão real. Entrando pelo gm_auth_cache (sem sessão), quando a rede volta
// as consultas saem sem login, o RLS devolve listas vazias "com sucesso" e isso
// sobrescreveria o que está guardado.
let podeGravar = false;

export const offlineCache = {
  definirUsuario(uid, { sessaoReal = true } = {}) {
    usuario = uid || null;
    podeGravar = !!usuario && sessaoReal;
  },

  // { dados, salvoEm } ou null (nada guardado, vencido, de outra versão ou de outro usuário).
  async ler(tipo, escopo) {
    const uid = usuario;
    if (!uid) return null;
    try {
      const chave = chaveLeitura(uid, tipo, escopo);
      const reg = await transacao('readonly', (s) => s.get(chave));
      if (leituraValida(reg, { uid })) return { dados: reg.dados, salvoEm: reg.salvoEm };
      // Vencido ou de versão antiga: some do aparelho em vez de ficar retido (LGPD).
      if (reg) transacao('readwrite', (s) => s.delete(chave)).catch(() => {});
      return null;
    } catch (err) {
      logger.warn('cache offline: falha ao ler', { module: 'offlineCache', tipo, err });
      return null;
    }
  },

  // Melhor esforço: falhar aqui (cota, modo anônimo) só tira o modo offline, não a tela.
  async gravar(tipo, escopo, dados) {
    const uid = usuario;
    if (!uid || !podeGravar) return;
    try {
      await transacao('readwrite', (s) => {
        // Conferido dentro da transação: um Sair no meio do caminho (dono virou null e o
        // limparTudo já foi pedido) não pode deixar este registro pro próximo usuário.
        if (usuario !== uid || !podeGravar) return null;
        return s.put({ chave: chaveLeitura(uid, tipo, escopo), userId: uid, tipo, escopo, versao: VERSAO_CACHE, salvoEm: Date.now(), dados });
      });
    } catch (err) {
      logger.warn('cache offline: falha ao gravar', { module: 'offlineCache', tipo, err });
    }
  },

  // Sair: clear() e não deleteDatabase, que fica bloqueado enquanto houver conexão aberta.
  async limparTudo() {
    try { await transacao('readwrite', (s) => s.clear()); }
    catch (err) { logger.warn('cache offline: falha ao limpar', { module: 'offlineCache', err }); }
  },

  // Login real de alguém: apaga o que outras pessoas deixaram neste aparelho, e o que
  // desta pessoa já venceu.
  limparOutrosUsuarios: (uid) => apagarOnde((reg) => reg.userId !== uid || !leituraValida(reg, { uid })),
  // Servidor disse que a pessoa não tem mais acesso.
  limparUsuario: (uid) => apagarOnde((reg) => reg.userId === uid),
};

async function apagarOnde(predicado) {
  try {
    await transacao('readwrite', (s) => {
      const req = s.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        if (predicado(cursor.value)) cursor.delete();
        cursor.continue();
      };
      return null;
    });
  } catch (err) {
    logger.warn('cache offline: falha ao limpar', { module: 'offlineCache', err });
  }
}
