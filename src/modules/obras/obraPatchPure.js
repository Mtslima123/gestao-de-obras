// ─── obraPatchPure ────────────────────────────────────────────────────────────
// Atualização de obra só com o que a pessoa de fato alterou (BUG-016).
//
// Antes, toda alteração (posição da capa, capa, edição da obra) enviava {...obra, campo} e o
// serviço gravava a LINHA INTEIRA a partir de um objeto que podia estar velho: o estado de
// obras carregado no login, ou o snapshot de sessionStorage restaurado após F5. Isso desfazia
// o que outra tela ou outra pessoa tinha mudado nesse meio tempo (ex.: medicao_mes_inicial,
// que só muda pela RPC definir_medicao_mes_inicial, ou o nome recém-editado).

// "Vazio" é uma coisa só: null, undefined e '' não contam como mudança entre si (o formulário
// mostra '' para campo nulo; abrir e salvar sem tocar não pode gravar '' por cima de null).
const vazio = (v) => v === null || v === undefined || v === '';
const igual = (a, b) => (vazio(a) && vazio(b)) || JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Campos de `novo` que diferem de `base`. O id nunca entra (é a chave, imutável).
 * `base` é o que a tela mostrava quando a pessoa começou a editar; o resultado é o que ela
 * mudou, e só isso deve ir ao banco.
 */
export function camposAlterados(base, novo) {
  const out = {};
  for (const k of Object.keys(novo || {})) {
    if (k === 'id') continue;
    if (!igual(base?.[k], novo[k])) out[k] = novo[k];
  }
  return out;
}

/**
 * Patch do modal "Editar obra": { id, ...só o que a pessoa mudou em relação à obra que o
 * modal mostrou ao abrir }. `form` é o estado do formulário (mesmos nomes do ObraFormModal).
 */
export function patchDeEdicaoDaObra(obra, form) {
  return {
    id: obra.id,
    ...camposAlterados(obra, {
      nome:        form.nome,
      sigla:       form.sigla.trim() || obra.sigla || obra.id,
      status:      form.status,
      endereco:    form.endereco,
      area:        form.area === '' ? null : Number(form.area),
      previsto:    form.dataPrevista || obra.previsto,
      dataFimObra: form.dataFimObra || null,
    }),
  };
}

/**
 * Obra para o estado da tela depois de gravar: a linha devolvida pelo banco vence (é a mais
 * atual, inclusive nas colunas que outra tela mudou), os campos gravados cobrem o que o banco
 * não devolveu e a obra anterior preenche o resto.
 */
export function mesclarObra(base, campos, linhaDoBanco) {
  return { ...(base || {}), ...(campos || {}), ...(linhaDoBanco || {}) };
}
