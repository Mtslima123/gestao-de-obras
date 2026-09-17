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
  // NÃO pedir o scope GroupMember.Read.All aqui enquanto ele não estiver com consentimento
  // de admin já concedido no Azure AD: pedir um scope que exige aprovação de admin e ainda
  // não foi aprovado bloqueia o LOGIN inteiro pra TODO MUNDO (a tela "Aprovação necessária"
  // do Microsoft trava o fluxo OAuth antes de emitir sessão nenhuma) — não é só a checagem
  // de grupo (Edge Function verificar-grupo-acesso) que fica sem efeito, como se pensou;
  // incidente real em 2026-09-17, revertido. Só reativar depois que o admin tiver
  // concedido e consentido a permissão no App Registration (fora deste repositório).
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
