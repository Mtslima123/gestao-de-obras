// friendlyError.js — traduz o erro técnico cru do Supabase/Postgres/rede (em inglês,
// ex.: "duplicate key value violates unique constraint", "JWT expired", "Failed to
// fetch") numa frase curta em português, apropriada pra mostrar ao usuário final.
//
// O erro original NUNCA deve ir direto pro toast — só serve de entrada aqui (e pro
// logger, pra debug). Isso evita expor mensagem técnica/em inglês na interface.
//
// Exportada (não só usada aqui dentro) porque também alimenta src/utils/connectivity.js,
// que decide quando trocar o conteúdo de uma tela pelo fallback "sem conexão". Um único
// lugar de verdade evita que as duas regras divirjam com o tempo.
// Cobre a mensagem de cada motor: Chromium ("Failed to fetch"), Firefox ("NetworkError
// when attempting to fetch"), Safari/WebKit, inclusive Chrome no iOS ("Load failed",
// "The Internet connection appears to be offline", "The network connection was lost").
// Sem as do WebKit, no iPhone offline a falha de rede caía como erro comum (ex.: tela de
// "Acesso não autorizado" em vez do perfil em cache).
export const NETWORK_ERROR_RE = /failed to fetch|network ?error|load failed|internet connection appears to be offline|network connection was lost|ERR_INTERNET|ERR_NETWORK/i;

export function friendlyError(error) {
  const msg = String(error?.message || error || '');

  if (NETWORK_ERROR_RE.test(msg)) {
    return 'Falha de conexão. Verifique sua internet e tente novamente.';
  }
  if (/jwt|token.*expired|not authenticated|session/i.test(msg)) {
    return 'Sua sessão expirou. Atualize a página e faça login novamente.';
  }
  if (/row-level security|permission denied|not authorized|403/i.test(msg)) {
    return 'Você não tem permissão para realizar esta ação.';
  }
  if (/duplicate key|already exists|unique constraint/i.test(msg)) {
    return 'Já existe um registro com esses dados.';
  }
  if (/violates foreign key/i.test(msg)) {
    return 'Não é possível concluir: existem registros vinculados a este item.';
  }
  if (/violates not-null constraint|null value in column/i.test(msg)) {
    return 'Preencha todos os campos obrigatórios.';
  }
  if (/timeout|timed out/i.test(msg)) {
    return 'A operação demorou demais para responder. Tente novamente.';
  }
  return 'Ocorreu um erro inesperado. Tente novamente ou contate o suporte.';
}
