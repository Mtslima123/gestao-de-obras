// authGatePure.js — decide o que fazer com o resultado de getSession()/onAuthStateChange
// no boot do app (App.jsx). Extraído porque a árvore de decisão é sutil e fácil de
// quebrar sem perceber: o auth-js (GoTrueClient#__loadSession) devolve sessão NULA tanto
// pra "nunca logou" quanto pra "não deu pra confirmar" (falha de rede ao tentar renovar um
// token perto de expirar, ou a própria aba do navegador foi encerrada pelo celular em
// segundo plano — ex.: ao sair pro painel de Ajustes pra desligar a internet — levando
// junto o sessionStorage antes mesmo do app conseguir reagir), sem expor o motivo real em
// nenhum dos dois casos. Tentar diferenciar "foi rede" de "a aba morreu" caso a caso se
// mostrou frágil na prática (ambos chegam aqui como sessão nula, sem pista confiável).
//
// Por decisão explícita (confirmada com o usuário): fora de um SIGNED_OUT de verdade,
// confia no último snapshot autorizado (ver salvarAuthCache em App.jsx, guardado em
// localStorage — sobrevive à aba sendo encerrada, diferente da sessão real, que continua
// em sessionStorage e morre com o navegador de propósito) em vez de derrubar pro login,
// que por sua vez também não funciona offline (SSO Microsoft) — sem isto, o usuário fica
// trancado pra fora. Não abre brecha de acesso real: sem rede, nenhuma chamada de verdade
// ao Supabase funciona de qualquer jeito (RLS/JWT são validados no servidor); isto só
// evita travar a UI enquanto não há conexão pra revalidar de verdade.

// session: a sessão devolvida (ou null); event: nome do evento (só existe em
// onAuthStateChange, nunca na chamada direta a getSession()); temCache: existe um
// snapshot (não expirado) da última autorização bem-sucedida?
// Retorna 'sessao' (usar a sessão real), 'cache' (restaurar do último snapshot
// autorizado) ou 'deslogado' (tratar como sem sessão, de verdade).
export function decidirFonteDeSessao({ session, event, temCache }) {
  if (session?.user) return 'sessao';
  // SIGNED_OUT é o único evento garantidamente deslogamento de verdade (botão Sair ou
  // refresh token realmente revogado) — nunca cai pro cache, mesmo havendo um.
  if (event === 'SIGNED_OUT') return 'deslogado';
  return temCache ? 'cache' : 'deslogado';
}
