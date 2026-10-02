import React from 'react';
import ReactDOM from 'react-dom/client';
// Fontes servidas pelo próprio app (entram na cópia offline). Antes vinham do Google Fonts
// por @import no CSS, e numa rede sem saída pra internet (Wi-Fi da obra, sinal fraco) o
// pedido pendurado segurava a tela inteira em branco: o navegador não pinta nem roda o
// app enquanto uma folha de estilo não termina de carregar. Só o subconjunto latin (cobre
// o português) e os pesos usados.
import '@fontsource/ibm-plex-sans/latin-300.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans/latin-700.css';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-500.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/manrope/latin-800.css';
import './styles/globals.css';
import { App } from './App';
import { logger } from './services/logger';
import { armazenamentoBloqueado } from './services/supabase';
// Só o import já liga a fila de envio do aparelho (gatilhos de reconexão) e registra o
// envio das fotos: precisa estar ativo desde o boot pra mandar o que ficou guardado
// mesmo com a aba Fotos fechada, e pra nenhuma reconexão passar em branco.
import './services/offlineQueue';
import './modules/obras/fotos.service';
import './modules/cronograma/medicaoSync';

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

// Última proteção: erro de render fora dos ErrorBoundary das telas (login, "Verificando
// acesso", barra lateral, aviso de versão) desmontava o app inteiro no React 19 e a tela
// ficava toda branca. Também avisa o vigia do index.html que o app abriu.
class RootErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null, conferindo: false, aviso: '' }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidMount() {
    window.__appMontado = true;
    window.__vigiaAbertura?.esconder();
  }
  componentDidCatch(error, info) {
    logger.fatal('erro de renderizacao na raiz', { module: 'react', action: 'root', err: error, componentStack: info?.componentStack });
  }
  // Sem internet o Reparar não mexe em nada (apagaria a cópia guardada) e avisa aqui.
  reparar = () => {
    if (!window.__vigiaAbertura) { window.location.reload(); return; }
    this.setState({ conferindo: true, aviso: '' });
    window.__vigiaAbertura.reparar(() => this.setState({ conferindo: false, aviso: 'Sem internet agora. Conecte o aparelho e toque em Reparar app de novo.' }));
  };

  render() {
    if (!this.state.error) return this.props.children;
    // Estilo inline: não depende do CSS do app, que pode ser justamente o que falhou.
    const botao = { font: '600 15px Arial, sans-serif', padding: '12px 18px', borderRadius: 8, margin: 6, cursor: 'pointer', border: '1px solid #1C4584' };
    // Dados do site bloqueados no navegador: o app não consegue guardar nada e o Reparar não
    // resolve (nem é verdade que "fotos e medições continuam guardados").
    if (armazenamentoBloqueado) {
      return (
        <div role="alert" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#fff', fontFamily: 'Arial, sans-serif' }}>
          <div style={{ maxWidth: 440, textAlign: 'center' }}>
            <h1 style={{ font: '700 20px Arial, sans-serif', color: '#1C4584', margin: '0 0 10px' }}>O navegador está bloqueando o app</h1>
            <p style={{ fontSize: 15, lineHeight: 1.5, color: '#334155', margin: '0 0 18px' }}>
              Este navegador não deixa o app guardar dados no aparelho. No Chrome, toque no cadeado ao lado do endereço, abra Cookies e dados do site e permita. Depois toque em Recarregar.
            </p>
            <button type="button" style={{ ...botao, background: '#1C4584', color: '#fff' }} onClick={() => window.location.reload()}>Recarregar</button>
            <p style={{ fontSize: 12, color: '#64748b', margin: '18px 0 0' }}>v{__APP_VERSION__}</p>
          </div>
        </div>
      );
    }
    return (
      <div role="alert" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#fff', fontFamily: 'Arial, sans-serif' }}>
        <div style={{ maxWidth: 440, textAlign: 'center' }}>
          <h1 style={{ font: '700 20px Arial, sans-serif', color: '#1C4584', margin: '0 0 10px' }}>O app encontrou um erro ao abrir</h1>
          <p style={{ fontSize: 15, lineHeight: 1.5, color: '#334155', margin: '0 0 18px' }}>
            Toque em Recarregar. Se continuar, toque em Reparar app: fotos e medições que ainda não foram enviadas e o login continuam guardados.
          </p>
          <button type="button" style={{ ...botao, background: '#fff', color: '#1C4584' }} onClick={() => window.location.reload()}>Recarregar</button>
          <button type="button" style={{ ...botao, background: '#1C4584', color: '#fff' }} disabled={this.state.conferindo} onClick={this.reparar}>
            {this.state.conferindo ? 'Conferindo a internet…' : 'Reparar app'}
          </button>
          {this.state.aviso && <p style={{ fontSize: 14, fontWeight: 600, color: '#b91c1c', margin: '12px 0 0' }}>{this.state.aviso}</p>}
          <p style={{ fontSize: 12, color: '#64748b', margin: '18px 0 0' }}>
            v{__APP_VERSION__} · {String(this.state.error?.message || this.state.error).slice(0, 160)}
          </p>
        </div>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(<RootErrorBoundary><App /></RootErrorBoundary>);
