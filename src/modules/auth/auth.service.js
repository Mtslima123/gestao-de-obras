import { supabase } from '../../services/supabase';
import { auditoriaService } from '../admin/auditoria.service';

export const authService = {
  getSession: () => supabase.auth.getSession(),

  signIn: async (email, password) => {
    const res = await supabase.auth.signInWithPassword({ email, password });
    if (!res.error && res.data?.user) {
      const u = res.data.user;
      auditoriaService.registrar({
        userId: u.id,
        userNome: u.email,
        userPerfil: 'usuario',
        modulo: 'autenticacao',
        acao: 'login',
        entidadeTipo: 'sessao',
        entidadeId: u.id,
        descricao: `Login realizado: ${u.email}`,
        criticidade: 'baixa',
      });
    }
    return res;
  },

  // Login SSO via Microsoft Entra ID (email corporativo @soter.com.br).
  // As credenciais (Client ID/Secret/Tenant) ficam só no painel do Supabase,
  // nunca no código. Aqui apenas iniciamos o fluxo OAuth com o provider 'azure'.
  signInWithSSO: () =>
    supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        scopes: 'email openid profile',
        redirectTo: window.location.origin,
      },
    }),

  signOut: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await auditoriaService.registrar({
        userId: session.user.id,
        userNome: session.user.email,
        userPerfil: 'usuario',
        modulo: 'autenticacao',
        acao: 'logout',
        entidadeTipo: 'sessao',
        entidadeId: session.user.id,
        descricao: `Logout realizado: ${session.user.email}`,
        criticidade: 'baixa',
      });
    }
    return supabase.auth.signOut();
  },

  onAuthStateChange: (callback) =>
    supabase.auth.onAuthStateChange(callback),

  resetPassword: (email) =>
    supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    }),

  updatePassword: (newPassword) =>
    supabase.auth.updateUser({ password: newPassword }),

  marcarSenhaAlterada: () =>
    supabase.functions.invoke('marcar-senha-alterada'),
};
