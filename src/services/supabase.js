import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
