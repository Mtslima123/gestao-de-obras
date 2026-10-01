// offlineQueue.js — motor genérico de fila de sincronização offline (Fase 1). Guarda no
// IndexedDB qualquer formulário preenchido sem internet, pra reenviar quando a conexão
// voltar. Nesta fase a fila é INERTE: nenhum tipo de item tem handler registrado ainda
// (Fotos entra na Fase 2, Medição na Fase 3). O que existe aqui é só o motor.
//
// Por que tudo em IndexedDB, diferente do split localStorage+IndexedDB de
// src/modules/cronograma/taskDetailStore.js: lá o caso de uso é "listar nomes de anexo
// sem baixar o arquivo", por isso separa metadado pequeno (localStorage) de blob grande
// (IndexedDB). Aqui o caso de uso é diferente: fazer flush de um item exige o registro
// INTEIRO, payload incluído (que na Fase 2 pode ser um arquivo de foto). Não há ganho em
// separar, só complexidade extra — e IndexedDB não tem a cota pequena do localStorage
// (~5-10MB no domínio inteiro), o que importa quando o usuário acumula fotos offline.
import { logger } from './logger';
import { connectivity, onNetworkReconnect } from '../utils/connectivity';

const DB_NAME = 'soter_offline_queue';
const STORE = 'itens';
const DB_VERSION = 1;

let _dbPromise = null;
function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB indisponível')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

async function store(mode) {
  const db = await openDb();
  return db.transaction(STORE, mode).objectStore(STORE);
}

const mkId = () => `fila-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

// handlers: tipo -> async (payload) => void (deve lançar em caso de falha real de envio).
// Fase 2/3 populam isto no módulo de Fotos/Medição. Fase 1 deixa vazio de propósito.
const handlers = new Map();

// beforeFlushHooks: async (item) => boolean. true segue com o envio, false pula o item
// nesta passada (mantém na fila). Ponto de extensão pra Fase 3 pendurar a checagem de
// conflito de Medição (hoje um upsert cego, sem controle de concorrência) sem precisar
// redesenhar a fila depois.
const beforeFlushHooks = [];

export const offlineQueue = {
  async enqueue(tipo, payload) {
    const item = { id: mkId(), tipo, payload, criadoEm: new Date().toISOString() };
    const s = await store('readwrite');
    await new Promise((res, rej) => { const r = s.add(item); r.onsuccess = () => res(); r.onerror = () => rej(r.error); });
    return item;
  },

  async listarPendentes(tipo) {
    const s = await store('readonly');
    const all = await new Promise((res, rej) => { const r = s.getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); });
    return tipo ? all.filter((i) => i.tipo === tipo) : all;
  },

  async remover(id) {
    const s = await store('readwrite');
    await new Promise((res, rej) => { const r = s.delete(id); r.onsuccess = () => res(); r.onerror = () => rej(r.error); });
  },

  registrarHandler(tipo, handlerFn) { handlers.set(tipo, handlerFn); },
  registrarBeforeFlush(hookFn) { beforeFlushHooks.push(hookFn); },

  async flush() {
    const pendentes = await offlineQueue.listarPendentes();
    for (const item of pendentes) {
      const handler = handlers.get(item.tipo);
      if (!handler) continue; // ninguém registrado pra este tipo ainda (toda a Fase 1)
      try {
        let liberado = true;
        for (const hook of beforeFlushHooks) {
          liberado = await hook(item);
          if (!liberado) break;
        }
        if (!liberado) continue; // hook vetou (ex.: conflito na Fase 3): mantém na fila
        await handler(item.payload);
        await offlineQueue.remover(item.id);
      } catch (e) {
        logger.error('falha ao sincronizar item da fila offline', { module: 'offlineQueue', action: 'flush', tipo: item.tipo, err: e });
        // Mantém na fila pra tentar de novo na próxima reconexão. Política de
        // retry/backoff fica pra Fase 2/3, quando existir handler de verdade pra
        // calibrar contra (por enquanto tentar de novo a cada reconexão é suficiente).
      }
    }
  },
};

// Dois gatilhos de flush automático, cada um cobre um caso que o outro pode perder:
// 1) evento nativo `online`: mais rápido, mas pode ser falso-positivo (captive portal).
// 2) connectivity relatando volta de verdade (uma tela teve um fetch com sucesso real
//    depois de uma falha): mais lento de acontecer, mas mais confiável.
// Sem handlers registrados (toda a Fase 1), as duas chamadas rodam e não fazem nada
// visível: é só a fiação pronta pra Fase 2/3.
onNetworkReconnect(() => { offlineQueue.flush(); });
connectivity.subscribe((isOffline) => { if (!isOffline) offlineQueue.flush(); });
