// O elemento em foco é um campo onde se digita texto? Nele o Ctrl+Z é o desfazer NATIVO do campo e o
// atalho global do Cronograma (desfazer a última ação da tela) tem que ficar de fora. Checkbox, botão
// de opção, botão, cor, faixa e arquivo também são <input>, mas não têm texto para desfazer: segurar o
// atalho por causa deles fazia o Ctrl+Z "não funcionar" depois de marcar um checkbox da faixa.
const INPUT_SEM_TEXTO = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'range', 'file', 'image']);

export const campoDeTextoFocado = (el) => {
  if (!el) return false;
  if (el.tagName === 'TEXTAREA' || el.isContentEditable) return true;
  if (el.tagName !== 'INPUT') return false;
  return !INPUT_SEM_TEXTO.has(String(el.type || 'text').toLowerCase());
};
