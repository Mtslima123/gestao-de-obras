// ─── listaAutoScroll ──────────────────────────────────────────────────────────
// Decisão de rolagem automática enquanto o usuário arrasta para selecionar linhas na
// Lista. Fica fora do componente por ser a única parte testável: o resto do arraste
// depende de layout real (elementFromPoint, getBoundingClientRect).
//
// Antes não existia rolagem nenhuma no arraste — a seleção parava na borda da tela.

/** Distância da borda (px) em que a rolagem começa. */
export const ZONA_BORDA = 24;
/** Passo máximo por quadro (px). Acima disso o arraste fica difícil de controlar. */
export const PASSO_MAX = 18;

/**
 * Quantos px rolar neste quadro. Negativo sobe, positivo desce, 0 fica parado.
 *
 * A velocidade é proporcional à profundidade dentro da zona de borda: encostar de leve
 * rola devagar, ir além do limite rola no máximo. Respeita os extremos — no topo não
 * sobe mais, no fim não desce mais — senão o laço ficaria rodando à toa.
 *
 * @param {number} ponteiroY  - clientY do mouse
 * @param {DOMRect|Object} rect - retângulo do container de scroll (top/bottom)
 * @param {number} scrollTop  - posição atual
 * @param {number} scrollMax  - scrollHeight - clientHeight
 */
export function passoDeRolagem(ponteiroY, rect, scrollTop, scrollMax) {
  if (!rect) return 0;
  const altura = rect.bottom - rect.top;
  if (!(altura > 0) || !Number.isFinite(ponteiroY)) return 0;

  // Zona nunca passa de metade do container: num container baixo, 24px em cima e 24 embaixo
  // se sobreporiam e todo ponto seria "borda", rolando para os dois lados ao mesmo tempo.
  const zona = Math.min(ZONA_BORDA, altura / 2);
  const max = Math.max(0, scrollMax || 0);
  const atual = Math.min(Math.max(0, scrollTop || 0), max);

  const dTopo = ponteiroY - rect.top;
  const dBase = rect.bottom - ponteiroY;

  if (dTopo < zona) {
    if (atual <= 0) return 0;
    const intensidade = Math.min(1, (zona - dTopo) / zona);
    return -Math.max(1, Math.round(PASSO_MAX * intensidade));
  }
  if (dBase < zona) {
    if (atual >= max) return 0;
    const intensidade = Math.min(1, (zona - dBase) / zona);
    return Math.max(1, Math.round(PASSO_MAX * intensidade));
  }
  return 0;
}
