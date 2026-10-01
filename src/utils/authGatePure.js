// authGatePure.js — decide o que fazer com o resultado de getSession()/onAuthStateChange
// no boot do app (App.jsx). Extraído porque a árvore de decisão é sutil e fácil de
// quebrar sem perceber: o auth-js (GoTrueClient#__loadSession) devolve sessão NULA tanto
// pra "nunca logou" quanto pra "não deu pra confirmar — falha de rede ao tentar renovar
// um token perto de expirar", sem distinguir os dois casos no retorno de
// onAuthStateChange (#_emitInitialSession engole o erro real antes de emitir
// INITIAL_SESSION). Sem diferenciar, um reload sem internet derrubava quem já estava
// autenticado de volta pro login, que por sua vez também não funciona offline (SSO
// Microsoft) — o usuário ficava trancado pra fora.
import { isNetworkError } from './connectivity';

// session: a sessão devolvida (ou null); error: erro explícito (só existe na chamada
// direta a getSession(), nunca em onAuthStateChange); event: nome do evento (só existe em
// onAuthStateChange, nunca na chamada direta); temCache: existe um snapshot da última
// autorização bem-sucedida (ver salvarAuthCache/lerAuthCache em App.jsx)?
// Retorna 'sessao' (usar a sessão real), 'cache' (restaurar do último snapshot
// autorizado) ou 'deslogado' (tratar como sem sessão, de verdade).
export function decidirFonteDeSessao({ session, error, event, temCache }) {
  if (session?.user) return 'sessao';
  // SIGNED_OUT é o único evento garantidamente deslogamento de verdade (botão Sair ou
  // refresh token realmente revogado, não uma falha de rede) — nunca cai pro cache.
  if (event === 'SIGNED_OUT') return 'deslogado';
  if (!temCache) return 'deslogado';
  // Chamada direta a getSession() (sem `event`): só confia no cache quando o erro é
  // claramente de rede — outros erros (ex.: token realmente inválido) continuam deslogando.
  // Via onAuthStateChange (com `event`, tipicamente INITIAL_SESSION): auth-js não expõe o
  // erro real aqui, então o único sinal disponível é "não foi um SIGNED_OUT explícito".
  if (event != null || isNetworkError(error)) return 'cache';
  return 'deslogado';
}
