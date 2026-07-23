import React from 'react';
import { authService } from './auth.service';

const LoginScreen = () => {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);

  // Inicia o login SSO (Microsoft Entra ID). Em caso de sucesso o navegador
  // é redirecionado para a Microsoft, então não resetamos loading no fluxo feliz.
  const handleSSO = async () => {
    setError(null);
    setLoading(true);
    const { error: err } = await authService.signInWithSSO();
    if (err) {
      setLoading(false);
      setError('Não foi possível iniciar o login corporativo. Tente novamente.');
    }
  };

  // ── Login (somente SSO Microsoft) — design handoff ──
  return (
    <div className="sso-login" data-screen-label="00 Login">
      {/* Painel esquerdo: marca */}
      <div className="sso-brand">
        <div className="sso-brand-inner">
          <img className="sso-brand-logo" src="/assets/soter-logo.png" alt="Soter Engenharia" />
        </div>
        <div className="sso-brand-label">GESTÃO DE OBRAS</div>
      </div>

      {/* Painel direito: acesso */}
      <div className="sso-access">
        <div className="sso-access-body">
          <div className="sso-block">
            <div className="sso-eyebrow">ACESSO CORPORATIVO</div>
            <h1 className="sso-title">Bem-vindo<br />de volta</h1>
            <p className="sso-sub">Acesse com sua conta corporativa Microsoft.</p>

            <button type="button" className="sso-btn" onClick={handleSSO} disabled={loading}>
              {loading ? (
                <><span className="sso-spinner" /> Entrando…</>
              ) : (
                <><MicrosoftIcon /> Entrar com Microsoft</>
              )}
            </button>

            {error && (
              <div className="sso-error"><LockIcon size={14} /> {error}</div>
            )}

            <div className="sso-note">
              <LockIcon size={14} /> Acesso restrito a colaboradores Soter
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Ícone Microsoft (4 quadrados) — SVG inline conforme handoff
const MicrosoftIcon = () => (
  <svg className="sso-btn-icon" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
    <rect x="0" y="0" width="9" height="9" fill="#F25022" />
    <rect x="11" y="0" width="9" height="9" fill="#7FBA00" />
    <rect x="0" y="11" width="9" height="9" fill="#00A4EF" />
    <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
  </svg>
);

// Ícone de cadeado — SVG inline (stroke currentColor)
const LockIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

export { LoginScreen };
