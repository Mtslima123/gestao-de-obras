// Funções puras da tela de Usuários — sem import de supabase/serviços, testáveis
// isoladamente (mesma convenção de scheduleEngine.js/medicaoMensalPure.js).

// Reconcilia o grupo de acesso do Azure AD (membrosGrupo) com quem já tem perfil
// cadastrado (emailsCadastrados) — pra tela de Usuários mostrar só quem falta atribuir
// perfil ("Pendências do grupo"). Comparação por e-mail, case-insensitive (o Graph e o
// cadastro podem divergir em maiúsculas/minúsculas).
export function membrosPendentes(membrosGrupo, emailsCadastrados) {
  const cadastrados = new Set((emailsCadastrados || []).map(e => String(e || '').trim().toLowerCase()));
  return (membrosGrupo || []).filter(m => !cadastrados.has(String(m.email || '').trim().toLowerCase()));
}
