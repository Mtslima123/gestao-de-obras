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

  // Apaga a sessão do Supabase só neste aparelho, sem falar com o servidor — pra quando
  // signOut() não consegue concluir (offline ele tenta revogar no servidor primeiro e
  // desiste sem limpar nada local). Sem isto, a próxima abertura com internet entraria
  // de novo com a sessão que ficou guardada. Mesmas chaves que GoTrueClient#_removeSession
  // apaga, no storage configurado em services/supabase.js (sessionStorage).
  limparSessaoLocal: () => {
    try {
      Object.keys(sessionStorage)
        .filter((k) => /^sb-.+-auth-token(-code-verifier|-user)?$/.test(k))
        .forEach((k) => sessionStorage.removeItem(k));
    } catch { /* storage indisponível: nada a limpar */ }
  },

  // access_token da sessão guardada, lido direto do storage (sem passar pelo SDK, que
  // pode estar preso num refresh). Usado pelo Sair pra ainda conseguir revogar no
  // servidor depois de limpar o aparelho.
  lerAccessTokenLocal: () => {
    try {
      const k = Object.keys(sessionStorage).find((x) => /^sb-.+-auth-token$/.test(x));
      return k ? JSON.parse(sessionStorage.getItem(k) || 'null')?.access_token ?? null : null;
    } catch { return null; }
  },

  // Revoga no servidor (todas as sessões da pessoa, igual ao signOut padrão) em segundo
  // plano, com o JWT dela — é a mesma chamada que GoTrueClient#_signOut faz por dentro.
  // Sem isto, quando o Sair limpa só o aparelho (rede lenta ou ausente), o refresh token
  // continuaria válido no servidor. Offline falha em silêncio: não há o que fazer.
  revogarNoServidor: (accessToken) => {
    supabase.auth.admin.signOut(accessToken, 'global').catch(() => { /* sem rede: ignora */ });
  },
};
