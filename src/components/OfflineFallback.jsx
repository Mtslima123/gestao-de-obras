import React from 'react';
import { Icon } from './Icons';

// Fallback pro conteúdo INTEIRO de uma tela quando o carregamento falhou por uma falha
// REAL de rede (ver src/utils/connectivity.js), nunca por navigator.onLine cru e nunca
// pra outros tipos de erro (permissão, validação), que continuam com o tratamento já
// existente em cada tela (banner/toast).
const OfflineFallback = ({
  mensagem = 'Não foi possível carregar estes dados. Verifique sua conexão com a internet.',
  onRetry,
}) => (
  <div className="card" style={{ marginTop: 'var(--gap)', padding: '72px 24px', textAlign: 'center' }}>
    <div style={{
      width: 64, height: 64, borderRadius: 16, background: 'var(--brand-tint)', color: 'var(--brand)',
      display: 'grid', placeItems: 'center', margin: '0 auto 16px',
    }}>
      <Icon name="wifi-off" size={28} />
    </div>
    <h2 style={{ margin: '0 0 6px', fontSize: 18 }}>Sem conexão</h2>
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

export { OfflineFallback };
