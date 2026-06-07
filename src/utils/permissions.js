/**
 * Verifica se um usuário tem acesso a uma aba específica de um módulo.
 *
 * Regras:
 * - Admin: sempre tem acesso (retorna true)
 * - Usuário sem restrições de aba para o módulo: acesso total (retorna true)
 * - Usuário com ao menos uma aba listada para o módulo: só acessa as abas listadas
 *
 * @param {object|null} userProfile  Perfil do usuário (user_profiles)
 * @param {string}      modId        ID do módulo (ex: 'ia', 'cronograma')
 * @param {string}      abaId        ID da aba (ex: 'gerar-eap', 'gantt')
 * @returns {boolean}
 */
export const podeVerAba = (userProfile, modId, abaId) => {
  // 🔒 SEGURANÇA [VULN-3]: Fail-secure — sem perfil carregado nega acesso (CWE-636)
  if (!userProfile) return false;
  if (userProfile.perfil === 'admin') return true;
  const abas = userProfile.abas_ids || [];
  const hasAnyForMod = abas.some(a => a.startsWith(`${modId}.`));
  // 🔒 SEGURANÇA [VULN-3]: Sem restrições definidas para o módulo = sem acesso (não mais acesso total)
  if (!hasAnyForMod) return false;
  return abas.includes(`${modId}.${abaId}`);
};

/**
 * Filtra uma lista de abas retornando só as que o usuário pode ver.
 *
 * @param {object|null} userProfile
 * @param {string}      modId
 * @param {Array<{id:string}>} abas  Array de objetos com campo `id`
 * @returns {Array}
 */
export const filtrarAbas = (userProfile, modId, abas) =>
  abas.filter(a => podeVerAba(userProfile, modId, a.id));
