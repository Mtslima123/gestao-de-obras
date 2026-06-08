import React from 'react';
import { authService } from './auth.service';
import { Icon } from '../../components/Icons';

// Login screen — Gestão de Obras
const LoginScreen = ({ onLogin, passwordRecovery = false, onPasswordSet }) => {
  const [mode, setMode] = React.useState(passwordRecovery ? 'define-senha' : 'login');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [remember, setRemember] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [success, setSuccess] = React.useState(null);
  const [showPass, setShowPass] = React.useState(false);

  React.useEffect(() => {
    if (passwordRecovery) setMode('define-senha');
  }, [passwordRecovery]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email.includes('@')) { setError('Informe um e-mail válido'); return; }
    if (password.length < 1) { setError('Informe sua senha'); return; }
    setError(null);
    setLoading(true);
    const { error: err } = await authService.signIn(email, password);
    setLoading(false);
    if (err) {
      const isCredentialError = err.message?.toLowerCase().includes('invalid') || err.status === 400;
      setError(isCredentialError ? 'E-mail ou senha incorretos.' : 'Erro de conexão. Tente novamente.');
      return;
    }
    onLogin();
  };

  const handlePrimeiroAcesso = async (e) => {
    e.preventDefault();
    if (!email.includes('@')) { setError('Informe um e-mail válido'); return; }
    setError(null);
    setLoading(true);
    const { error: err } = await authService.resetPassword(email);
    setLoading(false);
    if (err) { setError('E-mail não encontrado ou erro de conexão.'); return; }
    setSuccess('Link enviado! Verifique sua caixa de entrada e clique no link para definir sua senha.');
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

  // ── Modo: primeiro acesso ──
  if (mode === 'primeiro-acesso') {
    return (
      <div className="login-shell" data-screen-label="00 Login">
        <Brand />
        <div className="login-form-wrap">
          <div className="login-form-top">
            <button className="btn btn-sm btn-ghost" onClick={() => { setMode('login'); setError(null); setSuccess(null); setEmail(''); }}>
              <Icon name="chevron-left" size={14} /> Voltar
            </button>
          </div>
          <div className="login-form">
            {success ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#dcfce7', display: 'grid', placeItems: 'center', margin: '0 auto 20px' }}>
                  <Icon name="mail" size={24} style={{ color: '#15803d' }} />
                </div>
                <h2 className="login-title">E-mail enviado!</h2>
                <p className="login-sub" style={{ maxWidth: 320, margin: '0 auto 24px' }}>{success}</p>
                <button className="btn btn-ghost" onClick={() => { setMode('login'); setSuccess(null); setEmail(''); }}>
                  Voltar ao login
                </button>
              </div>
            ) : (
              <form onSubmit={handlePrimeiroAcesso}>
                <h2 className="login-title">Primeiro acesso</h2>
                <p className="login-sub">Informe seu e-mail corporativo. Enviaremos um link para você criar sua senha.</p>
                <div className="field full">
                  <label>E-mail corporativo</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="seu.nome@empresa.com.br" autoFocus />
                </div>
                {error && <div className="login-error" style={{ marginTop: 14 }}><Icon name="alert" size={13} />{error}</div>}
                <button type="submit" className="btn btn-primary btn-lg login-submit" style={{ marginTop: 20 }} disabled={loading}>
                  {loading ? <span className="login-spinner"></span> : <>Enviar link <Icon name="arrow-right" size={14} /></>}
                </button>
              </form>
            )}
          </div>
          <Foot />
        </div>
      </div>
    );
  }

  // ── Modo: login normal ──
  return (
    <div className="login-shell" data-screen-label="00 Login">
      <Brand />
      <div className="login-form-wrap">
        <div className="login-form-top">
          <button className="btn btn-sm btn-ghost">
            <Icon name="help" size={14} />
            Suporte
          </button>
        </div>
        <div className="login-form">
          <form onSubmit={handleLogin}>
            <h2 className="login-title">Bem-vindo de volta</h2>
            <p className="login-sub">Acesse com seu e-mail e senha corporativa.</p>
            <div className="field full">
              <label>E-mail corporativo</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="seu.nome@empresa.com.br" autoFocus />
            </div>
            <div className="field full" style={{ marginTop: 14, width: '100%' }}>
              <label>Senha</label>
              <div className="login-password-wrap">
                <input type={showPass ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)} placeholder="Digite sua senha" />
                <button type="button" className="login-pass-toggle" onClick={() => setShowPass(s => !s)}>
                  <Icon name="eye" size={15} />
                </button>
              </div>
            </div>
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 12, marginBottom: 20 }}>
              <label className="login-remember">
                <div className={'switch' + (remember ? ' on' : '')} onClick={() => setRemember(r => !r)}></div>
                <span>Manter-me conectado</span>
              </label>
              <button type="button" style={{ background: 'none', border: 'none', color: 'var(--brand)', fontSize: 13, cursor: 'pointer', padding: 0, fontWeight: 500 }}
                onClick={() => { setMode('primeiro-acesso'); setError(null); }}>
                Primeiro acesso?
              </button>
            </div>
            {error && <div className="login-error"><Icon name="alert" size={13} />{error}</div>}
            <button type="submit" className="btn btn-primary btn-lg login-submit" disabled={loading}>
              {loading ? <span className="login-spinner"></span> : <>Acessar plataforma <Icon name="arrow-right" size={14} /></>}
            </button>
          </form>
        </div>
        <Foot />
      </div>
    </div>
  );
};

export { LoginScreen };
