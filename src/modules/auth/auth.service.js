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
  // Sem escopo de Graph de propósito: a validação do grupo de acesso (G-SOTER-<App>) é
  // decisão de arquitetura da Soter — fica inteiramente fora deste app, via "Assignment
  // required" no Enterprise Application (gerenciado pelo Appiá, não por este código).
  // Pedir um scope como GroupMember.Read.All aqui sem consentimento de admin já concedido
  // bloqueia o LOGIN inteiro pra todo mundo (incidente real em 2026-09-17) — não tentar de
  // novo; ver Login.jsx (traduzErroSSO) pro tratamento do AADSTS50105 quando o Entra barrar.
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
};
