// ─── etapasPatch ──────────────────────────────────────────────────────────────
// Diff entre o que está no banco e o que está na tela, para o save da Lista/Gantt
// mandar só o que mudou.
//
// cronogramas.etapas é um JSONB único com a árvore inteira — 497 kB nas 1139 etapas
// da maior obra. Como todo save subia o array completo, editar uma célula custava o
// mesmo que reconstruir o cronograma. Aqui o diff sai por comparação do JSON de cada
// etapa contra o snapshot do último save.
//
// A ordem do array importa (é a ordem da EAP), então o patch tem dois modos:
//   ordem === null  → nada entrou, saiu ou mudou de lugar: só substituições in-place
//   ordem !== null  → o array final é exatamente essa lista de ids
// No segundo modo as remoções são implícitas: id que não está na ordem não existe mais.
// Isso deixa o array resultante totalmente determinado pelo patch, sem estado oculto.

/** Snapshot do que está persistido, base do próximo diff. */
export function snapshotEtapas(etapas, outros) {
  const porId = new Map();
  const ordem = [];
  (etapas || []).forEach(e => {
    porId.set(e.id, JSON.stringify(e));
    ordem.push(e.id);
  });
  return { porId, ordem, outros: JSON.stringify(outros ?? null) };
}

/**
 * Compara o estado atual com o snapshot.
 *
 * @returns {null|{upserts, ordem, removidos, inalterado}}
 *          null quando não dá para fazer patch (sem snapshot, ou algo além das etapas
 *          mudou) — nesse caso o chamador manda o payload completo, como antes.
 */
export function diffEtapas(snap, etapas, outros) {
  if (!snap || !Array.isArray(etapas)) return null;
  // custom_cols / baselines / reprogramacoes / feriados não passam por este patch
  if (snap.outros !== JSON.stringify(outros ?? null)) return null;

  const upserts = [];
  const idsAgora = [];
  const vistos = new Set();
  for (const e of etapas) {
    // id repetido quebra a reconstrução por id no servidor — cai no caminho completo
    if (vistos.has(e.id)) return null;
    vistos.add(e.id);
    idsAgora.push(e.id);
    if (snap.porId.get(e.id) !== JSON.stringify(e)) upserts.push(e);
  }

  const ordemMudou =
    idsAgora.length !== snap.ordem.length ||
    idsAgora.some((id, i) => id !== snap.ordem[i]);
  const removidos = ordemMudou ? snap.ordem.filter(id => !vistos.has(id)) : [];

  return {
    upserts,
    ordem: ordemMudou ? idsAgora : null,
    removidos,
    inalterado: upserts.length === 0 && !ordemMudou,
  };
}

/**
 * Vale a pena mandar o patch? Um patch que carrega quase todas as etapas mais a ordem
 * inteira não economiza nada e ainda paga a reconstrução no servidor.
 */
export function patchCompensa(patch, totalEtapas) {
  if (!patch || patch.inalterado) return false;
  return patch.upserts.length <= Math.max(1, Math.floor(totalEtapas * 0.5));
}
