import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Guard de configuração: sem as VITE_* o app quebraria em tela branca no boot.
// Aqui damos um erro claro (útil em produção quando o env não foi configurado no host).
if (!SUPABASE_URL || !SUPABASE_KEY) {
  const msg = 'Configuração ausente: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no ambiente (painel do host / .env.local).';
  console.error('[supabase]', msg);
  if (typeof document !== 'undefined') {
    document.body.innerHTML =
      `<div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:12vh auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;color:#1c4584">
        <h2 style="margin:0 0 8px">Aplicação não configurada</h2>
        <p style="color:#475569;font-size:14px;line-height:1.5">${msg}</p>
      </div>`;
  }
  throw new Error(msg);
}

// Sessão guardada em sessionStorage: ao fechar o navegador a sessão é descartada
// e o login passa a ser exigido novamente. detectSessionInUrl é mantido para o
// fluxo de recuperação de senha (link por e-mail) seguir funcionando.
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: window.sessionStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
