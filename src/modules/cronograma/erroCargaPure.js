// ─── erroCargaPure ────────────────────────────────────────────────────────────
// O que um erro da leitura de `cronogramas` significa (BUG-003).
//
// A leitura usa `.single()`: obra que ainda não tem cronograma devolve PGRST116 (zero
// linhas), e isso é o único erro que quer dizer "pode começar um cronograma novo". Qualquer
// outro (HTTP 5xx, "JWT expired", statement timeout) é falha de LEITURA: a obra pode ter
// cronograma, só não conseguimos ler. Tratar esses como "obra sem cronograma" abria a tela
// de edição com cópia velha, linhas de base do localStorage ou vazio, e a pessoa editava às
// cegas por cima de dados que existem no banco.
//
// Erro de rede já tem tratamento próprio e vem antes deste (isNetworkError / timeout).

export const CODIGO_SEM_LINHA = 'PGRST116';

/** true só para "esta obra não tem cronograma ainda" (zero linhas no `.single()`). */
export function ehObraSemCronograma(erro) {
  return erro?.code === CODIGO_SEM_LINHA;
}

export const MSG_ERRO_CARGA_SERVIDOR =
  'O servidor devolveu um erro ao buscar o cronograma desta obra. Nada foi alterado ' +
  'e a edição fica bloqueada para não gravar por cima do que está no banco. ' +
  'Tente novamente; se continuar, avise o TI.';
