// authGatePure.js — decide o que fazer com o resultado de getSession()/onAuthStateChange
// no boot do app (App.jsx). Extraído porque a árvore de decisão é sutil e fácil de
// quebrar sem perceber.
//
// Confirmado em campo (diagnóstico na tela de login, "último logout"): um SIGNED_OUT de
// verdade dispara sozinho, OFFLINE, sem nenhum papel da rede — porque GoTrueClient
// #__loadSession() faz uma checagem ESTRUTURAL puramente local na sessão guardada
// (precisa ter access_token/refresh_token/expires_at) antes mesmo de cogitar renovar
// o token, e remove a sessão (= SIGNED_OUT) se essa checagem falhar. O gatilho mais
// provável: o celular mata/suspende a aba em segundo plano (ex.: ao sair pro painel de
// Ajustes pra desligar a internet) no meio de uma escrita do SDK no storage, deixando
// um valor estruturalmente inválido pra trás. Ou seja: SIGNED_OUT NÃO é mais um sinal
// confiável de "deslogamento de verdade" por si só — só é confiável quando sabemos que
// foi disparado por uma ação explícita da pessoa (botão Sair).
//
// Por decisão explícita (confirmada com o usuário): fora desse deslogamento deliberado,
// confia no último snapshot autorizado (ver salvarAuthCache em App.jsx, guardado em
// localStorage — sobrevive à aba sendo encerrada, diferente da sessão real, que continua
// em sessionStorage e morre com o navegador de propósito) em vez de derrubar pro login,
// que por sua vez também não funciona offline (SSO Microsoft) — sem isto, o usuário fica
// trancado pra fora. Não abre brecha de acesso real: sem rede, nenhuma chamada de verdade
// ao Supabase funciona de qualquer jeito (RLS/JWT são validados no servidor); isto só
// evita travar a UI enquanto não há conexão pra revalidar de verdade.

// session: a sessão devolvida (ou null); event: nome do evento (só existe em
// onAuthStateChange, nunca na chamada direta a getSession()); temCache: existe um
// snapshot (não expirado) da última autorização bem-sucedida?; deslogamentoDeliberado:
// este SIGNED_OUT (se for um) veio de uma ação explícita da pessoa (botão Sair em
// App.jsx), não de uma checagem interna do SDK?
// Retorna 'sessao' (usar a sessão real), 'cache' (restaurar do último snapshot
// autorizado) ou 'deslogado' (tratar como sem sessão, de verdade).
export function decidirFonteDeSessao({ session, event, temCache, deslogamentoDeliberado }) {
  if (session?.user) return 'sessao';
  if (event === 'SIGNED_OUT' && deslogamentoDeliberado) return 'deslogado';
  return temCache ? 'cache' : 'deslogado';
}
