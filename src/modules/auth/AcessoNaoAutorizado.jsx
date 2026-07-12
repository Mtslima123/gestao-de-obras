import React from 'react';
import { Icon } from '../../components/Icons';

// Tela full-screen exibida quando o usuário autentica pela Microsoft mas o e-mail
// não está cadastrado (ou está inativo) em user_profiles. Espelha o layout do Login.
const AcessoNaoAutorizado = ({ email, onSair }) => {
  const Brand = () => (
    <div className="login-brand">
      <div className="login-brand-bg"></div>
      <div className="login-brand-content" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 0 }}>
        <img src="/assets/logo-soter-branco.png" alt="Soter"
          style={{ width: 'min(58%, 340px)', height: 'auto', display: 'block' }} />
        <div style={{ marginTop: 36, fontSize: 11, fontWeight: 500, letterSpacing: '0.42em', color: 'rgba(255,255,255,0.62)', textTransform: 'uppercase', paddingLeft: '0.42em' }}>
          Gestão&nbsp;de&nbsp;Obras
        </div>
      </div>
    </div>
  );

  const Foot = () => (
    <div className="login-foot">
      <span>© 2026 Soter · Gestão de Obras</span>
      <span className="row" style={{ gap: 12 }}>
        <span className="mono text-xs text-faint">v{__APP_VERSION__}</span>
      </span>
    </div>
  );

  return (
    <div className="login-shell" data-screen-label="00 Acesso negado">
      <Brand />
      <div className="login-form-wrap">
        <div className="login-form-top" />
        <div className="login-form">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: '50%', background: 'var(--danger-bg)', color: 'var(--danger)', marginBottom: 20 }}>
            <Icon name="shield" size={26} />
          </div>
          <h2 className="login-title">Acesso não autorizado</h2>
          <p className="login-sub">
            Sua conta foi autenticada, mas ainda não tem acesso liberado ao sistema.
            Contate o administrador do sistema para solicitar a liberação.
          </p>
          {email && (
            <div className="login-error" style={{ marginTop: 16, background: 'var(--surface-muted)', color: 'var(--text-muted)' }}>
              <Icon name="alert" size={13} />
              Conta utilizada: {email}
            </div>
          )}
          <button type="button" className="btn btn-primary btn-lg login-submit" style={{ marginTop: 24, width: '100%' }}
            onClick={onSair}>
            Sair <Icon name="arrow-right" size={14} />
          </button>
        </div>
        <Foot />
      </div>
    </div>
  );
};

export { AcessoNaoAutorizado };
