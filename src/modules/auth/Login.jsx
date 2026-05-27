import React from 'react';
import { supabase } from '../../services/supabase';
import { Icon } from '../../components/Icons';

// Login screen — Gestão de Obras
const LoginScreen = ({ onLogin }) => {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [remember, setRemember] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [showPass, setShowPass] = React.useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email.includes('@')) { setError('Informe um e-mail válido'); return; }
    if (password.length < 1) { setError('Informe sua senha'); return; }
    setError(null);
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) { setError('E-mail ou senha incorretos.'); return; }
    onLogin();
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
            </div>

            {error && <div className="login-error"><Icon name="alert" size={13} />{error}</div>}

            <button type="submit" className="btn btn-primary btn-lg login-submit" disabled={loading}>
              {loading ? <span className="login-spinner"></span> : <>Acessar plataforma <Icon name="arrow-right" size={14} /></>}
            </button>
          </form>
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

export { LoginScreen };
