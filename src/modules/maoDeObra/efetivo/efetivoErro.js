import { friendlyError } from '../../../utils/friendlyError';

// Erros do módulo Efetivo. As funções mo_* do banco (migration 20261010000002) já levantam
// a mensagem em português para o usuário, com SQLSTATE PT400/PT403/PT404/PT409; o PostgREST
// repassa o código em error.code. Essas mensagens vão direto pra tela. Qualquer outro erro
// (rede, sessão, constraint crua) passa pelo friendlyError.
const CODIGOS_DO_MODULO = new Set(['PT400', 'PT403', 'PT404', 'PT409']);

export const erroDoModulo = (error) => CODIGOS_DO_MODULO.has(error?.code) && !!error?.message;

export const mensagemErroEfetivo = (error) => (erroDoModulo(error) ? error.message : friendlyError(error));

// 409 = previsto trancado ou apropriação lançada: a tela está desatualizada (outra pessoa
// lançou ou trancou) e precisa recarregar o estado do servidor.
export const ehConflito = (error) => error?.code === 'PT409';
