// Login screen — Gestão de Obras
const LoginScreen = ({ onLogin }) => {
  const [step, setStep] = React.useState('login'); // login → 2fa
  const [email, setEmail] = React.useState('responsavel.01@soter.com.br');
  const [password, setPassword] = React.useState('');
  const [code, setCode] = React.useState('');
  const [remember, setRemember] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [showPass, setShowPass] = React.useState(false);

  const handleLogin = (e) => {
    e.preventDefault();
    if (!email.includes('@')) { setError('Informe um e-mail válido'); return; }
    if (password.length < 1) { setError('Informe sua senha'); return; }
    setError(null);
    setLoading(true);
    setTimeout(() => { setLoading(false); setStep('2fa'); }, 400);
  };

  const handle2fa = (e) => {
    e.preventDefault();
    if (code.replace(/\D/g, '').length < 6) { setError('Informe os 6 dígitos'); return; }
    setError(null);
    setLoading(true);
    setTimeout(() => { setLoading(false); onLogin(); }, 400);
  };

  return (
    <div className="login-shell" data-screen-label="00 Login">
      {/* LEFT — brand panel */}
      <div className="login-brand">
        <div className="login-brand-bg"></div>
        <div className="login-brand-content" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 0 }}>
          <img
            src="assets/logo-soter-branco.png"
            alt="Soter"
            style={{ width: 'min(58%, 340px)', height: 'auto', display: 'block' }}
          />
          <div style={{
            marginTop: 36, fontSize: 11, fontWeight: 500,
            letterSpacing: '0.42em', color: 'rgba(255,255,255,0.62)',
            textTransform: 'uppercase', paddingLeft: '0.42em',
          }}>Gestão&nbsp;de&nbsp;Obras</div>
        </div>
      </div>

      {/* RIGHT — form */}
      <div className="login-form-wrap">
        <div className="login-form-top">
          <button type="button" className="btn btn-sm btn-subtle" onClick={onLogin}>
            <Icon name="arrow-right" size={13} />
            Acesso de demonstração
          </button>
          <button className="btn btn-sm btn-ghost">
            <Icon name="help" size={14} />
            Suporte
          </button>
        </div>

        <div className="login-form">
          {step === 'login' && (
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
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Digite sua senha"
                  />
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
                <a href="#" style={{ fontSize: 12.5, fontWeight: 500 }} onClick={e => e.preventDefault()}>Esqueci minha senha</a>
              </div>

              {error && <div className="login-error"><Icon name="alert" size={13} />{error}</div>}

              <button type="submit" className="btn btn-primary btn-lg login-submit" disabled={loading}>
                {loading ? <span className="login-spinner"></span> : <>Continuar <Icon name="arrow-right" size={14} /></>}
              </button>
            </form>
          )}

          {step === '2fa' && (
            <form onSubmit={handle2fa}>
              <h2 className="login-title">Verificação em duas etapas</h2>
              <p className="login-sub">
                Insira o código de 6 dígitos do seu aplicativo autenticador.
              </p>

              <div className="field full">
                <label>Código de verificação</label>
                <input
                  type="text" inputMode="numeric" maxLength="6"
                  value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000" autoFocus className="login-otp"
                />
              </div>

              <div className="row" style={{ justifyContent: 'space-between', marginTop: 8, marginBottom: 20, fontSize: 12.5 }}>
                <span className="text-muted">Não recebeu? <a href="#" onClick={e => e.preventDefault()} style={{ fontWeight: 500 }}>Reenviar código</a></span>
                <span className="mono text-muted">00:47</span>
              </div>

              {error && <div className="login-error"><Icon name="alert" size={13} />{error}</div>}

              <button type="submit" className="btn btn-primary btn-lg login-submit" disabled={loading}>
                {loading ? <span className="login-spinner"></span> : <>Acessar plataforma <Icon name="check" size={14} /></>}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 10, width: '100%' }} onClick={() => { setStep('login'); setError(null); }}>
                <Icon name="chevron-left" size={12} />Voltar
              </button>
            </form>
          )}
        </div>

        <div className="login-foot">
          <span>© 2026 Soter · Gestão de Obras</span>
          <span className="row" style={{ gap: 12 }}>
            <a href="#" onClick={e => e.preventDefault()}>Privacidade</a>
            <a href="#" onClick={e => e.preventDefault()}>Termos</a>
            <span className="mono text-xs text-faint">v4.18.2</span>
          </span>
        </div>
      </div>
    </div>
  );
};

window.LoginScreen = LoginScreen;
