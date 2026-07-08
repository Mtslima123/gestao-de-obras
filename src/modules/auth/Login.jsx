import React from 'react';
import { authService } from './auth.service';
import { Icon } from '../../components/Icons';

const LoginScreen = ({ onLogin, passwordRecovery = false, onPasswordSet }) => {
  const [mode, setMode] = React.useState(passwordRecovery ? 'define-senha' : 'login');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [showPass, setShowPass] = React.useState(false);

  React.useEffect(() => {
    if (passwordRecovery) setMode('define-senha');
  }, [passwordRecovery]);

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

  const handleDefinirSenha = async (e) => {
    e.preventDefault();
    if (password.length < 6) { setError('A senha deve ter pelo menos 6 caracteres.'); return; }
    if (password !== confirmPassword) { setError('As senhas não coincidem.'); return; }
    setError(null);
    setLoading(true);
    const { error: err } = await authService.updatePassword(password);
    setLoading(false);
    if (err) { setError('Erro ao definir senha. Tente novamente.'); return; }
    onPasswordSet?.();
  };

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
        <a href="#" onClick={e => e.preventDefault()}>Privacidade</a>
        <a href="#" onClick={e => e.preventDefault()}>Termos</a>
        <span className="mono text-xs text-faint">v4.18.2</span>
      </span>
    </div>
  );

  // ── Modo: definir senha (retorno do link de recuperação) ──
  if (mode === 'define-senha') {
    return (
      <div className="login-shell" data-screen-label="00 Login">
        <Brand />
        <div className="login-form-wrap">
          <div className="login-form-top" />
          <div className="login-form">
            <form onSubmit={handleDefinirSenha}>
              <h2 className="login-title">Definir senha</h2>
              <p className="login-sub">Escolha uma senha para acessar a plataforma.</p>
              <div className="field full">
                <label>Nova senha</label>
                <div className="login-password-wrap">
                  <input type={showPass ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" autoFocus />
                  <button type="button" className="login-pass-toggle" onClick={() => setShowPass(s => !s)}>
                    <Icon name="eye" size={15} />
                  </button>
                </div>
              </div>
              <div className="field full" style={{ marginTop: 14 }}>
                <label>Confirmar senha</label>
                <input type="password" value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)} placeholder="Repita a senha" />
              </div>
              {error && <div className="login-error" style={{ marginTop: 14 }}><Icon name="alert" size={13} />{error}</div>}
              <button type="submit" className="btn btn-primary btn-lg login-submit" style={{ marginTop: 20 }} disabled={loading}>
                {loading ? <span className="login-spinner"></span> : <>Definir senha <Icon name="arrow-right" size={14} /></>}
              </button>
            </form>
          </div>
          <Foot />
        </div>
      </div>
    );
  }

  // ── Modo: login normal (somente SSO Microsoft) ──
  return (
    <div className="login-shell" data-screen-label="00 Login">
      <Brand />
      <div className="login-form-wrap">
        <div className="login-form-top" />
        <div className="login-form">
          <h2 className="login-title">Bem-vindo de volta</h2>
          <p className="login-sub">Acesse com sua conta corporativa Microsoft.</p>
          {error && <div className="login-error" style={{ marginTop: 16 }}><Icon name="alert" size={13} />{error}</div>}
          {/* Login SSO com email corporativo (Microsoft Entra ID) */}
          <button type="button" className="btn btn-primary btn-lg login-submit" style={{ marginTop: 24, width: '100%' }}
            onClick={handleSSO} disabled={loading}>
            {loading ? <span className="login-spinner"></span> : <>Entrar com e-mail corporativo (Microsoft) <Icon name="arrow-right" size={14} /></>}
          </button>
        </div>
        <Foot />
      </div>
    </div>
  );
};

export { LoginScreen };
