// authGatePure.js — decide o que fazer com o resultado de getSession()/onAuthStateChange
// no boot do app (App.jsx). Extraído porque a árvore de decisão é sutil e fácil de
// quebrar sem perceber.
//
// Regra central: o cache local da última autorização (gm_auth_cache, ver App.jsx) só é
// usado quando NÃO há rede pra confirmar a sessão de verdade. Com rede, sem sessão real
// vai pro login — fechar o navegador de propósito continua exigindo login de novo, e
// ninguém fica "logado" pelo cache sem conseguir carregar dado nenhum.
//
// Por que cada caso:
// - INITIAL_SESSION é ignorado: chega sem o erro real (GoTrueClient#_emitInitialSession
//   engole o erro e repassa null) e é redundante com a chamada direta a getSession()
//   que restaurarSessao faz no boot, que tem o erro e decide sozinha.
// - Depois do botão Sair, nada reautentica até a página recarregar: um refresh de token
//   que já estava em voo pode terminar DEPOIS do Sair, regravar a sessão e emitir
//   TOKEN_REFRESHED — sem esta regra, a pessoa clicava Sair e voltava logada (num tablet
//   compartilhado de obra, o próximo usuário herdava a sessão). Um login novo sempre
//   chega por redirect do SSO, que recarrega a página e zera essa marca.
// - SIGNED_OUT sem ser pelo botão Sair (o SDK também dispara sozinho: sessão guardada
//   falhando a checagem estrutural, refresh token recusado) só derruba com rede.
//
// Parâmetros: session (ou null); event (só em onAuthStateChange); temCache (snapshot não
// expirado existe); deslogamentoDeliberado (a pessoa clicou Sair nesta página); erroDeRede
// (getSession falhou por rede); offline (navigator.onLine === false).
// Retorna 'sessao' | 'cache' | 'deslogado' | 'ignorar'.
// Aviso do botão Sair, ou null quando pode sair direto (com rede e nada pendente). Sem
// rede, sair tranca a pessoa do lado de fora até a conexão voltar (login Microsoft precisa
// de internet); com fotos ainda na fila do aparelho, sair apaga essas fotos.
export function avisoAoSair({ semRede = false, pendentes = 0 } = {}) {
  if (!semRede && !pendentes) return null;
  const partes = [];
  if (semRede) partes.push('Você está sem internet. Se sair agora, só vai conseguir entrar de novo quando a conexão voltar.');
  if (pendentes) {
    partes.push(pendentes === 1
      ? '1 foto ainda não foi enviada e será apagada deste aparelho.'
      : `${pendentes} fotos ainda não foram enviadas e serão apagadas deste aparelho.`);
  }
  return {
    titulo: semRede ? 'Sair sem internet?' : 'Sair com fotos não enviadas?',
    texto: partes.join(' '),
    confirmar: pendentes ? 'Sair e apagar' : 'Sair mesmo assim',
  };
}

export function decidirFonteDeSessao({ session, event, temCache, deslogamentoDeliberado, erroDeRede, offline }) {
  if (event === 'INITIAL_SESSION') return 'ignorar';
  if (deslogamentoDeliberado) return 'deslogado';
  if (session?.user) return 'sessao';
  if (temCache && (erroDeRede || offline)) return 'cache';
  return 'deslogado';
}
