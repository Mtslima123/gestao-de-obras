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

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
