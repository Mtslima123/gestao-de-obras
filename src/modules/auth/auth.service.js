import { supabase } from '../../services/supabase';
import { auditoriaService } from '../admin/auditoria.service';

// Login é SOMENTE SSO (Microsoft Entra ID) — nunca senha própria. `signIn` (email+senha),
// `resetPassword` e o fluxo de troca de senha forçada existiam aqui de uma versão anterior
// ao SSO e foram removidos (auditoria de 2026-09): nenhuma tela chamava mais nada disso, e
// o fluxo real de criar usuário (usuarios.service.js `criar`) já nunca cria senha nenhuma —
// a conta é criada pela Microsoft no 1º login.
export const authService = {
  getSession: () => supabase.auth.getSession(),

  // Login SSO via Microsoft Entra ID (email corporativo @soter.com.br).
  // As credenciais (Client ID/Secret/Tenant) ficam só no painel do Supabase,
  // nunca no código. Aqui apenas iniciamos o fluxo OAuth com o provider 'azure'.
  // O scope GroupMember.Read.All é o que permite ao App.jsx (via provider_token
  // devolvido só nesta resposta inicial de login) chamar o Microsoft Graph
  // checkMemberGroups e validar o grupo G-SOTER-<App> no servidor (Edge Function
  // verificar-grupo-acesso). Requer o App Registration ter essa permissão
  // delegada concedida e consentida pelo admin no Azure AD (passo manual, fora
  // deste repositório).
  signInWithSSO: () =>
    supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        scopes: 'email openid profile GroupMember.Read.All',
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
};
