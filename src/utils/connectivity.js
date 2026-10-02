// connectivity.js — detecta "offline" a partir de uma falha REAL de rede, nunca de
// navigator.onLine cru (falso-positivo conhecido em portal cativo, onde onLine fica
// true mesmo sem internet de verdade). Cada tela só entra em modo offline depois de UMA
// requisição de verdade falhar com uma mensagem de rede conhecida (ver NETWORK_ERROR_RE
// em friendlyError.js).
import React from 'react';
import { NETWORK_ERROR_RE } from './friendlyError';

export function isNetworkError(error) {
  return NETWORK_ERROR_RE.test(String(error?.message || error || ''));
}

// Bus mínimo (mesmo espírito do notifBus em notificacoes.service.js): guarda "existe
// alguma falha de rede real em aberto no app?" e notifica quem estiver ouvindo. Quem
// ESCREVE aqui são as próprias telas, chamando reportError/reportSuccess no resultado de
// fetches que já fariam de qualquer forma — este módulo nunca chama fetch sozinho.
const listeners = new Set();
let offline = false;
let ultimaFalha = 0;
function notify() { listeners.forEach((fn) => fn(offline)); }

export const connectivity = {
  isOffline: () => offline,
  reportError(error) {
    if (!isNetworkError(error)) return;
    ultimaFalha = Date.now(); // ver avisarReconexaoReal
    if (!offline) { offline = true; notify(); }
  },
  reportSuccess() {
    if (offline) { offline = false; notify(); avisarReconexaoReal(); }
  },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

export function useConnectivity() {
  const [state, setState] = React.useState(connectivity.isOffline);
  React.useEffect(() => connectivity.subscribe(setState), []);
  return state;
}

// Gatilho de "bom momento pra tentar de novo", baseado no evento nativo `online`. Nunca
// declara sozinho "estamos online" (por isso fica fora do bus acima) — só avisa quem
// quiser tentar de novo; a confirmação real vem do próximo fetch ter sucesso.
//
// Guardado atrás de `typeof window !== 'undefined'` porque os testes rodam em Node puro
// (vite.config.js, test.environment:'node', sem jsdom) e este módulo precisa ser
// importável sem DOM disponível.
const reconnectListeners = new Set();
let ultimoEventoOnline = 0;
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    ultimoEventoOnline = Date.now();
    reconnectListeners.forEach((fn) => fn());
  });
}

// "Sem sinal" (Wi-Fi sem internet, sinal fraco): navigator.onLine nunca vira false, então
// o evento `online` nunca dispara na volta. A primeira requisição que dá certo depois de
// uma falha (reportSuccess) faz o mesmo papel, pra quem ficou em "Sem conexão" ou com
// dados do aparelho tentar de novo.
// - Só avisa se houve falha DEPOIS do último aviso (evento `online` ou este): se a falha
//   é anterior, as telas já foram avisadas e estão recarregando; repetir só reiniciaria
//   a carga.
// - No máximo uma vez a cada 30s, e o aviso que cair dentro da janela é adiado pro fim
//   dela em vez de descartado (senão a tela ficava em "Sem internet" com a rede de volta).
//   Sem o limite, uma tela que falha sempre (ex.: endpoint fora do ar) e outra que
//   funciona alternariam falha e sucesso disparando recargas sem parar.
let ultimoAvisoReal = 0;
let avisoAdiado = null;
function dispararAvisoReal() {
  ultimoAvisoReal = Date.now();
  reconnectListeners.forEach((fn) => fn());
}
function avisarReconexaoReal() {
  if (ultimaFalha <= Math.max(ultimoEventoOnline, ultimoAvisoReal)) return;
  const liberaEm = ultimoAvisoReal + 30000;
  const agora = Date.now();
  if (agora >= liberaEm) { dispararAvisoReal(); return; }
  if (avisoAdiado) return;
  avisoAdiado = setTimeout(() => {
    avisoAdiado = null;
    if (!offline) dispararAvisoReal();
  }, liberaEm - agora);
}

export function onNetworkReconnect(fn) {
  reconnectListeners.add(fn);
  return () => reconnectListeners.delete(fn);
}

// "Agora sem rede?" pra decidir o que mostrar (ex.: esconder cadastro que precisa do
// servidor). Junta o modo avião (navigator.onLine, que só erra pro lado de "tem rede") com
// a última falha real de requisição (bus acima, que pega o "sem sinal").
export function useSemRede() {
  const falhaReal = useConnectivity();
  const [aviao, setAviao] = React.useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  React.useEffect(() => {
    const atualizar = () => setAviao(navigator.onLine === false);
    window.addEventListener('online', atualizar);
    window.addEventListener('offline', atualizar);
    return () => { window.removeEventListener('online', atualizar); window.removeEventListener('offline', atualizar); };
  }, []);
  return aviao || falhaReal;
}

export function useRetryOnReconnect(fn) {
  React.useEffect(() => onNetworkReconnect(fn), [fn]);
}
