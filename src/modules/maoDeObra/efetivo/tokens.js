// Estilos do módulo Efetivo. Mesmas proporções do handoff (tokens.ts), mas as cores apontam
// para as variáveis do app (--brand = #1C4584 oficial da Soter, tema escuro incluso) em vez de
// hex fixos.
export const T = {
  azul: 'var(--brand)', azulHover: 'var(--brand-600)',
  texto: 'var(--text)', texto2: 'var(--text-muted)', texto3: 'var(--text-faint)',
  borda: 'var(--border)', bordaInput: 'var(--border-strong)', linha: 'var(--border)',
  fundo: 'var(--bg-app)', superficie: 'var(--surface)', faixa: 'var(--surface-muted)',
  grupo: 'var(--brand-tint)', destaque: 'var(--brand-tint)', azulClaro: 'var(--brand-50)',
  projecao: 'var(--brand-100)', previsto: 'var(--brand-100)',
  colSaldo: 'var(--surface-muted)', colMedia: 'var(--brand-50)', colMediaGrupo: 'var(--brand-100)',
  verde: 'var(--success)', verdeBg: 'var(--success-bg)',
  vermelho: 'var(--danger)', vermelhoBg: 'var(--danger-bg)',
  laranja: 'var(--warning)', laranjaBg: 'var(--warning-bg)',
  fonte: 'var(--font-sans)',
};

// regras.ts (fonte da verdade, não alterada) devolve cores em hex do handoff (corSaldo,
// corMediaRestante, STATUS_UI). Aqui elas viram as variáveis do app.
const MAPA_COR = {
  '#014386': 'var(--brand)', '#b42318': 'var(--danger)', '#0f7a3d': 'var(--success)', '#5b6b80': 'var(--text-muted)',
  '#e7f6ed': 'var(--success-bg)', '#fdecea': 'var(--danger-bg)', '#eef2f6': 'var(--surface-muted)',
};
export const corUi = (c) => MAPA_COR[c] ?? c;

export const card = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
  boxShadow: '0 1px 2px rgba(15,27,45,.04), 0 4px 14px rgba(15,27,45,.04)',
};
export const h2 = { margin: 0, fontSize: 15, fontWeight: 600, color: T.azul };
export const sub = { fontSize: 12.5, color: T.texto2 };
export const btn = { font: 'inherit', fontSize: 13, fontWeight: 500, border: `1px solid ${T.bordaInput}`, background: 'var(--surface)', color: T.texto, borderRadius: 8, padding: '9px 14px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 };
export const btnPrim = { ...btn, border: 0, background: T.azul, color: '#fff', fontWeight: 600 };
export const btnSec = { ...btn, border: '1px solid var(--brand-400)', color: T.azul, fontWeight: 600 };
export const th = { padding: '8px 6px', fontWeight: 600, textAlign: 'center', lineHeight: 1.2, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.02em', color: T.texto2 };
export const td = { padding: '6px', textAlign: 'center', borderTop: `1px solid ${T.linha}` };

// Input que vira "texto" quando trancado.
export const inp = (locked, w = 50) => ({
  font: 'inherit', fontSize: 13, width: w, textAlign: 'center', padding: '5px 4px', borderRadius: 6,
  border: `1px solid ${locked ? 'transparent' : T.bordaInput}`, background: locked ? 'transparent' : 'var(--surface)',
  color: T.texto, boxSizing: 'border-box',
});

export const pill = (cor, fundo) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, padding: '3px 9px',
  borderRadius: 999, background: fundo, color: cor, whiteSpace: 'nowrap',
});
