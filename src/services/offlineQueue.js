// offlineQueue.js — fila de envio do aparelho. O que a pessoa faz em campo (hoje: fotos)
// é gravado primeiro aqui, no IndexedDB, e um único enviador manda pro servidor quando dá:
// na hora, se houver internet, ou quando ela voltar. Assim nada se perde se a rede cair no
// meio do envio, nem se o Android recarregar a aba.
//
// Por que tudo em IndexedDB, diferente do split localStorage+IndexedDB de
// src/modules/cronograma/taskDetailStore.js: lá o caso de uso é "listar nomes de anexo
// sem baixar o arquivo", por isso separa metadado pequeno (localStorage) de blob grande
// (IndexedDB). Aqui enviar um item exige o registro INTEIRO, foto incluída. E IndexedDB
// não tem a cota pequena do localStorage (~5-10MB no domínio inteiro), o que importa
// quando a pessoa acumula fotos sem internet.
//
// Regras (as decisões puras estão em utils/offlinePure.js, com testes):
// - Cada item tem dono (userId): só é enviado e só aparece com a sessão REAL dessa pessoa.
// - Falha passageira (rede, servidor fora, tempo esgotado) para a passada e tenta de novo
//   depois, cada vez mais espaçado; erro definitivo (sem permissão etc.) vira "revisar" e
//   espera a pessoa decidir, em vez de repetir pra sempre.
// - Um envio por vez, inclusive entre abas (navigator.locks): o mesmo item não sobe duas vezes.
import { logger } from './logger';
import { supabase } from './supabase';
import { connectivity, onNetworkReconnect } from '../utils/connectivity';
import { itensParaEnviar, ehFalhaPassageira, proximoAtraso, itemDaFilaVencido, VERSAO_FILA } from '../utils/offlinePure';

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

const listarTodos = async () => (await transacao('readonly', (s) => s.getAll())) || [];
const existeItem = async (id) => !!(await transacao('readonly', (s) => s.get(id)));
const removerItem = (id) => transacao('readwrite', (s) => s.delete(id));
// Lê e grava na mesma transação: nada escrito entre a leitura e a gravação se perde.
const atualizarItem = (id, patch) => transacao('readwrite', (s) => {
  const req = s.get(id);
  req.onsuccess = () => { if (req.result) s.put({ ...req.result, ...patch }); };
  return null;
});

const mkId = () => `fila-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

// Sessão atual, definida pelo App: só com sessão real (não a do gm_auth_cache, sem rede)
// a fila envia; sem dono nada é listado nem gravado.
let sessao = { userId: null, real: false };
// tipo -> async (payload, { aindaNaFila }) => void; lança em caso de falha. aindaNaFila()
// diz se o item continua guardado (pra não publicar o que a pessoa mandou apagar).
const handlers = new Map();
const ouvintes = new Set();
let enviando = false;
let semSessao = false;   // achou itens, mas não há sessão válida pra enviar ("entre de novo")
let rodada = null;       // promessa da passada em andamento
let pedirOutra = false;  // chegou pedido de envio durante uma passada: roda mais uma no fim
let timer = null;
let falhasSeguidas = 0;

// evento opcional: { enviados: [id] } quando um item subiu. Sem isso a tela teria de
// deduzir "sumiu da lista = enviado", o que mente quando a fila é limpa no Sair ou a
// sessão cai.
const notificar = (evento) => ouvintes.forEach((fn) => { try { fn(evento); } catch { /* ouvinte com erro não para os outros */ } });
// "tempo esgotado" não bate com o regex de rede do connectivity: avisa como falha de rede.
const avisarFalhaDeRede = (err) => {
  const causa = err?.causa || err;
  connectivity.reportError(causa?.timeout ? { message: 'Failed to fetch' } : causa);
};

// 'ok' | 'rede' | 'sem-sessao'. Sem sessão o supabase-js manda a chave anônima e o RLS
// barra tudo; e item de uma pessoa nunca sobe com a sessão de outra.
async function conferirSessao(uid) {
  const TEMPO = { timeout: true };
  try {
    const r = await Promise.race([
      supabase.auth.getSession(),
      // getSession espera o refresh do token, que com sinal fraco pode não responder.
      new Promise((resolve) => setTimeout(() => resolve(TEMPO), 8000)),
    ]);
    if (r === TEMPO || (r.error && ehFalhaPassageira(r.error))) {
      connectivity.reportError({ message: 'Failed to fetch' });
      return 'rede';
    }
    return r.data?.session?.user?.id === uid ? 'ok' : 'sem-sessao';
  } catch (err) {
    return ehFalhaPassageira(err) ? 'rede' : 'sem-sessao';
  }
}

function agendarNovaTentativa() {
  clearTimeout(timer);
  timer = setTimeout(() => { timer = null; offlineQueue.flush(); }, proximoAtraso(falhasSeguidas));
  falhasSeguidas += 1;
}

async function passada() {
  const uid = sessao.userId;
  if (!sessao.real || !uid) return;
  // Modo avião: volta pelo evento `online` (ver gatilhos no fim do arquivo).
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const itens = itensParaEnviar(await listarTodos(), { uid, tipos: new Set(handlers.keys()) });
  if (!itens.length) { falhasSeguidas = 0; return; }

  enviando = true;
  notificar();
  let falhouRede = false;
  // 'rede' | 'sem-sessao' | 'ok'. Conferida antes de CADA item, e não só no começo: um
  // lote grande com sinal fraco atravessa o vencimento do token, e um refresh que falha
  // faz o supabase-js mandar a chave anônima (o RLS recusa e a foto viraria "revisar" à toa).
  const pararPorSessao = (situacao) => {
    if (situacao === 'sem-sessao') { semSessao = true; return true; }
    if (situacao === 'rede') { falhouRede = true; return true; }
    semSessao = false;
    return false;
  };
  try {
    for (const item of itens) {
      if (sessao.userId !== uid) break; // trocou de usuário no meio da passada
      if (pararPorSessao(await conferirSessao(uid))) break;
      // Ainda na fila? (o Sair com "apagar" pode ter limpado no meio da passada)
      if (!(await existeItem(item.id))) continue;
      try {
        await handlers.get(item.tipo)(item.payload, { aindaNaFila: () => existeItem(item.id) });
        await removerItem(item.id);
        falhasSeguidas = 0;
        connectivity.reportSuccess();
        notificar({ enviados: [item.id] });
        continue;
      } catch (err) {
        if (ehFalhaPassageira(err)) {
          falhouRede = true;
          avisarFalhaDeRede(err);
          // Fica pendente, com o motivo à mostra (a miniatura tem "Descartar" pra quem desistir).
          await atualizarItem(item.id, {
            tentativas: (item.tentativas || 0) + 1,
            ultimoErro: String(err?.message || 'falha de rede').slice(0, 300),
          });
          break; // os próximos falhariam igual; tenta todos de novo depois
        }
        // Antes de dar como recusado, confere se não foi a sessão que caiu durante o envio.
        if (pararPorSessao(await conferirSessao(uid))) break;
        logger.error('item da fila recusado pelo servidor', { module: 'offlineQueue', action: 'enviar', tipo: item.tipo, err });
        await atualizarItem(item.id, {
          status: 'revisar',
          tentativas: (item.tentativas || 0) + 1,
          ultimoErro: String(err?.message || 'erro desconhecido').slice(0, 300),
        });
      }
      notificar();
    }
  } finally {
    enviando = false;
    notificar();
  }
  if (falhouRede) agendarNovaTentativa();
}

// Duas abas abertas mandariam o mesmo item ao mesmo tempo. Espera a outra aba terminar
// (em vez de desistir, o que deixava a foto nova parada até outro gatilho); a passada relê
// a fila ao pegar a trava, então o que a outra aba já enviou não sobe de novo.
function comTrava(fn) {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request('soter-fila-envio', () => fn());
  }
  return fn();
}

export const offlineQueue = {
  // Chamado pelo App ao aplicar a sessão. real=false: entrou pelo gm_auth_cache (sem
  // rede), então mostra os itens mas não envia.
  definirSessao({ userId = null, real = false } = {}) {
    if (userId !== sessao.userId) falhasSeguidas = 0;
    sessao = { userId, real };
    semSessao = false;
    notificar();
    if (real && userId) offlineQueue.flush();
  },

  registrarHandler(tipo, fn) { handlers.set(tipo, fn); },

  // Vários itens numa transação só: tudo ou nada. Gravando um a um, faltar espaço no meio
  // do lote deixava parte guardada com o modal ainda aberto, e salvar de novo duplicava.
  async enfileirarLote(tipo, payloads) {
    const uid = sessao.userId;
    if (!uid) throw new Error('Sem usuário para guardar o item neste aparelho.');
    const criadoEm = new Date().toISOString();
    const itens = payloads.map((payload) => ({ id: mkId(), tipo, userId: uid, versao: VERSAO_FILA, status: 'pendente', criadoEm, tentativas: 0, ultimoErro: null, payload }));
    await transacao('readwrite', (s) => { itens.forEach((item) => s.put(item)); return null; });
    notificar();
    return itens;
  },

  // Itens da pessoa logada (todos os status), opcionalmente de um tipo.
  async listar(tipo) {
    const uid = sessao.userId;
    if (!uid) return [];
    return (await listarTodos()).filter((i) => i.userId === uid && (!tipo || i.tipo === tipo));
  },

  async contar(uid = sessao.userId) {
    if (!uid) return 0;
    return (await listarTodos()).filter((i) => i.userId === uid).length;
  },

  // Sair confirmado com itens não enviados (a pessoa escolheu apagar), ou servidor
  // confirmou que a pessoa perdeu o acesso.
  async limparDoUsuario(uid) {
    if (!uid) return;
    await apagarOnde((item) => item.userId === uid);
    notificar();
  },

  // Login real: o que outra pessoa deixou e não voltou pra enviar em 30 dias sai do
  // aparelho (LGPD). Antes disso fica: ela pode só ter demorado a voltar.
  async limparVencidosDeOutros(uid) {
    if (!uid) return;
    await apagarOnde((item) => item.userId !== uid && itemDaFilaVencido(item));
  },

  // Item em "revisar": a pessoa pediu pra tentar de novo.
  async tentarDeNovo(id) {
    await atualizarItem(id, { status: 'pendente', ultimoErro: null });
    falhasSeguidas = 0;
    notificar();
    return offlineQueue.flush();
  },

  async descartar(id) {
    await removerItem(id);
    notificar();
  },

  estado: () => ({ enviando, semSessao }),

  subscribe(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); },

  // Uma passada por vez; pedido durante uma passada vira mais uma no fim dela.
  flush() {
    if (rodada) { pedirOutra = true; return rodada; }
    rodada = (async () => {
      do {
        pedirOutra = false;
        await comTrava(passada);
      } while (pedirOutra);
    })()
      .catch((err) => logger.error('falha na fila de envio', { module: 'offlineQueue', action: 'flush', err }))
      .finally(() => { rodada = null; });
    return rodada;
  },
};

async function apagarOnde(predicado) {
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
}

// Gatilhos de envio, além do que cada tela pede ao gravar:
// 1) evento `online` e a primeira requisição que dá certo depois de uma falha
//    (onNetworkReconnect, ver utils/connectivity.js);
// 2) app volta pra frente (a pessoa saiu pra câmera ou outro app e voltou);
// 3) nova tentativa agendada depois de falha de rede (agendarNovaTentativa).
onNetworkReconnect(() => { falhasSeguidas = 0; offlineQueue.flush(); });
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') offlineQueue.flush();
  });
}
