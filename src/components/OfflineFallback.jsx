import React from 'react';
import { Icon } from './Icons';

// Fallback pro conteúdo INTEIRO de uma tela quando o carregamento falhou por uma falha
// REAL de rede (ver src/utils/connectivity.js), nunca por navigator.onLine cru e nunca
// pra outros tipos de erro (permissão, validação), que continuam com o tratamento já
// existente em cada tela (banner/toast).
// `titulo` e `icone` só mudam quando a causa NÃO é a rede (ex.: o servidor respondeu com
// erro): "Sem conexão" nesse caso mandaria a pessoa conferir a internet à toa.
const OfflineFallback = ({
  mensagem = 'Não foi possível carregar estes dados. Verifique sua conexão com a internet.',
  onRetry,
  titulo = 'Sem conexão',
  icone = 'wifi-off',
}) => (
  <div className="card" style={{ marginTop: 'var(--gap)', padding: '72px 24px', textAlign: 'center' }}>
    <div style={{
      width: 64, height: 64, borderRadius: 16, background: 'var(--brand-tint)', color: 'var(--brand)',
      display: 'grid', placeItems: 'center', margin: '0 auto 16px',
    }}>
      <Icon name={icone} size={28} />
    </div>
    <h2 style={{ margin: '0 0 6px', fontSize: 18 }}>{titulo}</h2>
    <div className="text-muted" style={{ maxWidth: 400, margin: '0 auto 20px', fontSize: 13.5 }}>
      {mensagem}
    </div>
    {onRetry && (
      <button className="btn btn-primary" onClick={onRetry}>
        <Icon name="refresh-cw" size={15} />Tentar novamente
      </button>
    )}
  </div>
);

// Faixa no topo de uma tela que está mostrando dados guardados neste aparelho (ver
// services/offlineCache.js), pra ninguém tomar o que vê como o estado atual do sistema.
const AvisoOffline = ({ texto, onRetry }) => (
  <div className="aviso-offline" role="status">
    <Icon name="wifi-off" size={15} />
    <span className="aviso-offline-texto">{texto}</span>
    {onRetry && (
      <button type="button" className="aviso-offline-acao" onClick={onRetry}>Tentar agora</button>
    )}
  </div>
);

export { OfflineFallback, AvisoOffline };
