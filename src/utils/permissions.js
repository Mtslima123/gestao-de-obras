/**
 * Verifica se um usuário tem acesso a uma aba específica de um módulo.
 *
 * Regras (alinhadas ao cadastro em Administração > Usuários):
 * - Sem perfil carregado: nega (fail-secure, CWE-636)
 * - Admin: sempre tem acesso
 * - Sem nenhuma aba marcada para o módulo: "Todas as abas liberadas" (acesso total)
 * - Com ao menos uma aba marcada para o módulo: só acessa as marcadas
 *
 * O acesso ao módulo em si é controlado por moduloLiberado; esta função só
 * decide as abas DENTRO de um módulo que o usuário já pode ver.
 *
 * @param {object|null} userProfile  Perfil do usuário (user_profiles)
 * @param {string}      modId        ID do módulo (ex: 'obras', 'cronograma')
 * @param {string}      abaId        ID da aba (ex: 'visao', 'gantt')
 * @returns {boolean}
 */
export const podeVerAba = (userProfile, modId, abaId) => {
  if (!userProfile) return false;
  if (userProfile.perfil === 'admin') return true;
  const abas = userProfile.abas_ids || [];
  const hasAnyForMod = abas.some(a => a.startsWith(`${modId}.`));
  // Sem restrição marcada no módulo = todas as abas liberadas (igual ao cadastro)
  if (!hasAnyForMod) return true;
  // Com restrição = só as abas explicitamente marcadas
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

/**
 * Verifica se um usuário tem acesso a um módulo (tela) inteiro.
 *
 * Regras:
 * - Sem perfil carregado: nega (fail-secure)
 * - Admin: sempre libera
 * - modulos_ids vazio/ausente: libera tudo (mesma convenção da tela de cadastro,
 *   onde lista vazia é exibida como "todos os módulos")
 * - Caso contrário: só libera os módulos listados
 *
 * @param {object|null} userProfile
 * @param {string}      modId
 * @returns {boolean}
 */
/**
 * Verifica se o usuário é administrador.
 *
 * @param {object|null} userProfile
 * @returns {boolean}
 */
export const isAdmin = (userProfile) => userProfile?.perfil === 'admin';

export const moduloLiberado = (userProfile, modId) => {
  if (!userProfile) return false;
  if (userProfile.perfil === 'admin') return true;
  const mods = userProfile.modulos_ids || [];
  if (mods.length === 0) return true;
  return mods.includes(modId);
};

/**
 * Verifica se o usuário só pode visualizar um módulo (sem criar/editar/excluir).
 *
 * Regras:
 * - Sem perfil carregado ou admin: nunca é somente leitura
 * - modulos_readonly_ids vazio/ausente: edição liberada (comportamento atual,
 *   mesma convenção de compatibilidade de modulos_ids/abas_ids)
 * - Caso contrário: somente leitura se o módulo estiver na lista
 *
 * @param {object|null} userProfile
 * @param {string}      modId
 * @returns {boolean}
 */
export const moduloSomenteLeitura = (userProfile, modId) => {
  if (!userProfile || userProfile.perfil === 'admin') return false;
  const readonly = userProfile.modulos_readonly_ids || [];
  return readonly.includes(modId);
};

/**
 * IDs das obras que o usuário pode ver. Admin não tem restrição (retorna null,
 * sinalizando "todas"). Para usuário comum, retorna a lista de user_obras.
 *
 * @param {object|null} userProfile  Perfil já com user_obras carregado
 * @returns {string[]|null}  null = todas as obras; array = apenas essas
 */
export const obrasPermitidas = (userProfile) => {
  if (!userProfile || userProfile.perfil === 'admin') return null;
  return (userProfile.user_obras || []).map(uo => uo.obra_id);
};

/**
 * Verifica se o usuário pode ver uma obra específica.
 *
 * @param {object|null} userProfile
 * @param {string}      obraId
 * @returns {boolean}
 */
export const obraLiberada = (userProfile, obraId) => {
  const permitidas = obrasPermitidas(userProfile);
  if (permitidas === null) return true; // admin
  return permitidas.includes(obraId);
};
