import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/globals.css';
import { App } from './App';
import { logger } from './services/logger';

// Captura global de erros assíncronos que escapam do ErrorBoundary do React.
window.addEventListener('error', (ev) => {
  logger.error('erro global nao tratado', { module: 'window', action: 'onerror', err: ev.error || ev.message });
});
window.addEventListener('unhandledrejection', (ev) => {
  logger.error('promise rejeitada sem tratamento', { module: 'window', action: 'unhandledrejection', err: ev.reason });
});

// input[type=number] focado + rodinha do mouse = o navegador incrementa/decrementa o
// valor sozinho (comportamento nativo do Chrome/Edge, surpreendente pro usuário). Tira o
// foco antes de aplicar — a página/container por baixo rola normalmente, o valor não
// muda. Sistêmico (Lista, Distribuir pesos, TaskFormPanel, FluxoExecutivo etc.),
// resolvido uma vez só aqui em vez de em cada input.
window.addEventListener('wheel', () => {
  const el = document.activeElement;
  if (el?.tagName === 'INPUT' && el.type === 'number') el.blur();
}, { passive: true });

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
