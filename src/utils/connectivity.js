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
function notify() { listeners.forEach((fn) => fn(offline)); }

export const connectivity = {
  isOffline: () => offline,
  reportError(error) {
    if (isNetworkError(error) && !offline) { offline = true; notify(); }
  },
  reportSuccess() {
    if (offline) { offline = false; notify(); }
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
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => reconnectListeners.forEach((fn) => fn()));
}

export function onNetworkReconnect(fn) {
  reconnectListeners.add(fn);
  return () => reconnectListeners.delete(fn);
}

export function useRetryOnReconnect(fn) {
  React.useEffect(() => onNetworkReconnect(fn), [fn]);
}
