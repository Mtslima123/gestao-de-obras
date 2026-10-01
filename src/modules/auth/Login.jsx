import React from 'react';
import { authService } from './auth.service';
import { ssoLoginError } from '../../services/supabase';

// Traduz o erro que o Azure AD devolve no redirect quando barra o login antes de emitir
// sessão (ver services/supabase.js `ssoLoginError`). AADSTS50105 é o código específico de
// "Assignment required" no Enterprise Application — usuário autenticado, mas fora do
// grupo de acesso (gerenciado pelo Appiá, não por este app). Qualquer outro erro cai
// numa mensagem genérica.
const traduzErroSSO = (desc) => {
  if (/AADSTS50105/i.test(desc)) {
    return 'Você ainda não tem acesso ao Gestão de Obras. Solicite pelo portal Appiá.';
  }
  return 'Não foi possível concluir o login com a Microsoft. Tente novamente ou contate o administrador.';
};

// DIAGNÓSTICO TEMPORÁRIO (remover depois de confirmar a causa do logout offline em
// campo): o sink remoto do logger (app_logs) é bloqueado por RLS pra quem ainda não
// está autenticado — exatamente o momento em que essa tela aparece — então não dá pra
// ver remotamente o estado do cache local. Lendo e mostrando direto na tela pra quem
// estiver testando poder ler em voz alta / printar.
const diagCacheLocal = () => {
  try {
    const raw = localStorage.getItem('gm_auth_cache');
    if (!raw) return 'nenhum';
    const snap = JSON.parse(raw);
    const idadeMin = Math.round((Date.now() - (snap.salvoEm || 0)) / 60000);
    return `${snap.email || '?'}, salvo há ${idadeMin}min`;
  } catch (e) { return `erro ao ler: ${e?.message}`; }
};

// Mesmo espírito do diagCacheLocal acima, mas pra SESSÃO REAL do Supabase (não o meu
// cache) — lida crua do sessionStorage, sem passar pelo SDK, só pra saber se ela
// sobreviveu estruturalmente (access_token/refresh_token/expires_at, os 3 campos que
// o auth-js exige em GoTrueClient#_isValidSession — faltando qualquer um, o SDK trata
// como sessão inválida e desloga de verdade, SIGNED_OUT, sem relação com rede). Nunca
// mostra o valor dos tokens, só presença/validade estrutural/data de expiração.
const diagSessaoReal = () => {
  try {
    const chave = Object.keys(sessionStorage).find(k => /^sb-.*-auth-token$/.test(k));
    if (!chave) return 'nenhuma';
    const raw = sessionStorage.getItem(chave);
    if (!raw) return 'chave vazia';
    const sess = JSON.parse(raw);
    const temCampos = sess && typeof sess === 'object'
      && 'access_token' in sess && 'refresh_token' in sess && 'expires_at' in sess;
    if (!temCampos) return `estrutura invalida (campos: ${sess && typeof sess === 'object' ? Object.keys(sess).join(',') : typeof sess})`;
    const expiraEm = Math.round((sess.expires_at * 1000 - Date.now()) / 60000);
    return `ok, expira em ${expiraEm}min`;
  } catch (e) { return `erro ao ler: ${e?.message}`; }
};

const LoginScreen = () => {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(() => ssoLoginError ? traduzErroSSO(ssoLoginError) : null);
  const [cacheLocal] = React.useState(diagCacheLocal);
  const [sessaoReal] = React.useState(diagSessaoReal);

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
            {/* Diagnóstico rápido de versão em campo (ex.: confirmar se o celular de
                alguém já pegou um deploy novo antes de pedir pra testar de novo) — mesmo
                padrão de AcessoNaoAutorizado.jsx. */}
            <div className="mono text-xs text-faint" style={{ marginTop: 16, textAlign: 'center' }}>
              v{__APP_VERSION__} · cache local: {cacheLocal}<br />sessão real: {sessaoReal}
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
