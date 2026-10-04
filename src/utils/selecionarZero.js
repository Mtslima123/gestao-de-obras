// No celular, tocar num campo numérico que está com 0 e digitar "5" dava "05" (ou "50",
// conforme onde o cursor caía) e o 0 atrapalhava o número. Ao focar um campo numérico com
// valor zerado, o 0 fica selecionado: o primeiro dígito digitado o substitui. Quem só
// toca e sai não muda nada (select não altera o valor, então não dispara onChange).

// "0", "00", "0,0", "0.00", "0,00": só zeros, com ou sem casas decimais.
export const valorZerado = (v) => /^0+([.,]0*)?$/.test(String(v ?? '').trim());

// Campo numérico = type="number" ou teclado numérico (inputMode decimal/numeric), como os
// % medidos da Medição Mensal.
export const campoNumerico = (el) =>
  !!el && el.tagName === 'INPUT'
  && (el.type === 'number' || el.inputMode === 'decimal' || el.inputMode === 'numeric');

// Liga o comportamento uma vez só no app inteiro (foco sobe como focusin). Só em aparelho de
// toque (pointer: coarse): no computador, clicar no campo continua posicionando o cursor.
export function instalarSelecaoDoZero() {
  document.addEventListener('focusin', (ev) => {
    const el = ev.target;
    if (!campoNumerico(el) || el.disabled || el.readOnly || !valorZerado(el.value)) return;
    if (!window.matchMedia?.('(pointer: coarse)').matches) return;
    // Adiado: o Android posiciona o cursor depois do foco e desfaria a seleção feita aqui.
    setTimeout(() => {
      if (document.activeElement !== el || !valorZerado(el.value)) return;
      el.select();
      try { el.setSelectionRange(0, el.value.length); } catch { /* type=number não aceita; o select() acima basta */ }
    }, 0);
  });
}
