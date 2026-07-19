// Compartilhados do Cronograma — constantes de timeline/layout, definições de
// colunas da Lista, paleta de cores (Excel) e subcomponentes de UI (EditableCell,
// ColorMenu). Extraídos de Cronograma.jsx (movimento verbatim) para que
// GanttInterativo e ListaInterativa possam viver em arquivos próprios.

import React from "react";
import { Icon } from "../../components/Icons";
import { isoToBR, taskEnd } from "./cronogramaDateUtils";

// ─── Constantes de timeline / layout ─────────────────────────────────────────
export const GM_START_YEAR  = 2024;
export const GM_START_MONTH = 2;    // março (0-indexed)
export const GM_TOTAL       = 28;   // meses na linha do tempo
export const GM_MONTH_W     = 64;              // px por mês (mantido para compatibilidade do header)
export const GM_DAY_W       = GM_MONTH_W / 30; // px por dia ≈ 2.133
export const GM_LABEL_W     = 280;  // px da coluna de rótulos
export const GM_ROW_H       = 44;   // altura por linha
export const GM_BAR_H       = 24;   // altura das barras

// Limiar de virtualização: abaixo disso, Lista e Gantt renderizam todas as linhas
// (comportamento comprovado). Acima, renderizam só a janela visível (windowing).
export const VIRT_MIN = 60;

// Altura de cada linha do cabeçalho (Ano / Trimestre / Mês / linha extra de Semana ou Dia).
// A altura total varia com o zoom — ver `headerH` dentro de GanttInterativo.
export const GM_ROW_ANO  = 20;
export const GM_ROW_TRI  = 28;
export const GM_ROW_MES  = 30;
export const GM_ROW_FINE = 24; // linha extra de Semana (zoom "semana") ou Dia (zoom "dia")

// px por dia em cada nível de zoom — cresce de Trimestre (mais zoom-out) para Dia (mais zoom-in).
export const ZOOM_PX_DIA = { dia: 22, semana: 9, mes: GM_MONTH_W / 30, trimestre: 0.7 };

export const GM_REF_DATE = new Date(GM_START_YEAR, GM_START_MONTH, 1);

// Paleta de cores para grupos WBS — cores em hex de 6 dígitos (suportam sufixo alfa CSS Level 4)
export const GROUP_PALETTE = [
  '#16a34a', // verde
  '#2563eb', // azul
  '#7c3aed', // roxo
  '#ea580c', // laranja
  '#d97706', // âmbar
  '#0891b2', // ciano
  '#be185d', // rosa
  '#374151', // grafite
];

export const GM_MN = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

export const GM_MONTHS = (() => {
  const out = [];
  let y = GM_START_YEAR, mo = GM_START_MONTH;
  for (let i = 0; i < GM_TOTAL; i++) {
    out.push({ short: GM_MN[mo], year: y, isQ: mo % 3 === 0, idx: i });
    if (++mo === 12) { mo = 0; y++; }
  }
  return out;
})();

export const GM_QUARTERS = (() => {
  const out = [];
  for (let q = 0; q * 3 < GM_TOTAL; q++) {
    const start = q * 3;
    const end   = Math.min(start + 3, GM_TOTAL);
    let mo = GM_START_MONTH + start, y = GM_START_YEAR;
    while (mo >= 12) { mo -= 12; y++; }
    out.push({ label: `T${(q % 4) + 1}/${y}`, start, end });
  }
  return out;
})();

// Retorna posição atual em DIAS a partir do início do projeto
export const gmCalcToday = () => {
  const now = new Date();
  return ((now.getFullYear() - GM_START_YEAR) * 12
       + (now.getMonth() - GM_START_MONTH)) * 30
       + (now.getDate() - 1);
};

// Converte offset em DIAS para rótulo "Mês/AA"
export const gmMonthLabel = (days) => {
  const months = Math.floor(days / 30);
  let mo = GM_START_MONTH + months;
  let y  = GM_START_YEAR;
  while (mo >= 12) { mo -= 12; y++; }
  return `${GM_MN[mo]}/${String(y).slice(2)}`;
};

// Detecta violações de dependência considerando tipo (TI/TT/II/IT) e lag
export const gmConflicts = (etapas, overrides) => {
  const map = {};
  etapas.forEach(e => {
    map[e.id] = overrides && overrides[e.id] ? { ...e, ...overrides[e.id] } : e;
  });
  const out = [];
  Object.values(map).forEach(e => {
    (e.dep || []).forEach(depObj => {
      const dId = typeof depObj === 'string' ? depObj : depObj.id;
      const tipo = typeof depObj === 'string' ? 'TI' : (depObj.tipo || 'TI');
      const lag  = typeof depObj === 'string' ? 0 : (depObj.lag || 0);
      const d = map[dId];
      if (!d) return;
      let conflict = false;
      if (tipo === 'TI') conflict = e.inicio < taskEnd(d) + lag;
      if (tipo === 'TT') conflict = taskEnd(e) < (taskEnd(d) + lag);
      if (tipo === 'II') conflict = e.inicio < d.inicio + lag;
      if (tipo === 'IT') conflict = taskEnd(e) < (d.inicio + lag);
      if (conflict) out.push({ pred: dId, succ: e.id, tipo, lag });
    });
  });
  return out;
};

// ─── EditableCell ─────────────────────────────────────────────────────────────
export const EditableCell = ({ value, type = 'text', onSave, readOnly = false, style }) => {
  const [editing, setEditing] = React.useState(false);
  const [draft,   setDraft]   = React.useState(value);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
  }, [editing]);

  // Sincroniza draft quando value muda externamente (e não está editando)
  React.useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const save = () => {
    setEditing(false);
    if (String(draft ?? '') !== String(value ?? '')) onSave(draft ?? '');
  };
  const cancel = () => { setEditing(false); setDraft(value); };

  if (readOnly) {
    const raw     = value !== undefined && value !== null && value !== '' ? value : null;
    const display = type === 'date' && raw ? isoToBR(raw) : raw;
    return <span style={style}>{display ?? <span style={{ color: 'var(--text-faint)' }}>—</span>}</span>;
  }

  if (!editing) {
    const raw     = value !== undefined && value !== null && value !== '' ? value : null;
    const display = type === 'date' && raw ? isoToBR(raw) : raw;
    return (
      <span
        onDoubleClick={() => { setDraft(value); setEditing(true); }}
        title="Duplo-clique para editar"
        style={{ cursor: 'default', display: 'block', minHeight: 20, ...style }}
      >
        {display ?? <span style={{ color: 'var(--text-faint)' }}>—</span>}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
      value={draft ?? ''}
      onChange={e => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); save(); }
        if (e.key === 'Escape') cancel();
        e.stopPropagation();
      }}
      style={{
        width: '100%', border: 'none', outline: '2px solid var(--brand)',
        borderRadius: 4, padding: '2px 6px', fontSize: 'inherit',
        background: 'var(--surface)', fontFamily: 'inherit',
        boxSizing: 'border-box',
      }}
    />
  );
};

// ─── Definições de colunas / paleta de cores / ColorMenu ─────────────────────
export const LISTA_COL_DEFS = {
  wbs:       { label: 'WBS',           defWidth: 44,  frozen: true, band: 'etapa' },
  id:        { label: 'ID',            defWidth: 44,  frozen: true, band: 'etapa' },
  etapa:     { label: 'Etapa / Tarefa',defWidth: 224, frozen: true, band: 'etapa' },
  inicio:    { label: 'Início',        defWidth: 96,  band: 'prazo' },
  fim:       { label: 'Término',       defWidth: 96,  band: 'prazo' },
  duracao:   { label: 'Duração',       defWidth: 78,  band: 'prazo' },
  avanco:    { label: '% Concluída',   defWidth: 150, band: 'avanco' },
  status:    { label: 'Status',        defWidth: 110, band: 'avanco' },
  peso:           { label: 'Peso %',          defWidth: 70,  align: 'right', band: 'fin' },
  fatorPeso:      { label: 'Fator Peso',      defWidth: 90,  align: 'right', band: 'fin' },
  valorVinculado: { label: 'Valor Vinculado', defWidth: 120, align: 'right', band: 'fin' },
  custo:     { label: 'Custo Prev.',   defWidth: 112, align: 'right', band: 'fin' },
  custoReal: { label: 'Custo Real',    defWidth: 112, align: 'right', band: 'fin' },
  saldo:     { label: 'Saldo',         defWidth: 112, align: 'right', band: 'fin' },
  dep:       { label: 'Pred.',         defWidth: 90,  band: 'seq' },
  succ:      { label: 'Suces.',        defWidth: 90,  band: 'seq' },
  resp:      { label: 'Responsável',   defWidth: 152, band: 'seq' },
  restricao: { label: 'Restrição',     defWidth: 148, band: 'seq' },
  participa:  { label: 'Curva',         defWidth: 54, align: 'center', band: 'seq' },
};
export const LISTA_BAND_LABELS = { etapa: 'Etapa / Tarefa', prazo: 'Prazo', avanco: 'Avanço', fin: 'Financeiro', seq: 'Sequenciamento', custom: 'Personalizadas' };

// Avatar do responsável (iniciais + cor determinística por nome). Cores de identidade
// por pessoa — não confundir com o azul de marca da UI.
export const AV_PALETTE = ['#1c4584', '#2a5599', '#0891b2', '#7c3aed', '#db2777', '#15803d'];
export const respInitials = (name) => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};
export const respColor = (name) => AV_PALETTE[[...(name || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % AV_PALETTE.length];
export const LISTA_DEFAULT_ORDER = Object.keys(LISTA_COL_DEFS);
export const LISTA_FROZEN = ['wbs', 'id', 'etapa'];
export const GUTTER_W = 40; // largura da calha de número de linha (estilo Excel/Project)
// Antes WBS/ID eram pegadas de arraste; agora a linha se move pela borda (arraste manual),
// então nenhuma coluna é excluída da seleção — todas podem ser selecionadas/formatadas.
export const ROW_DRAG_COLS = new Set();

// ─── Paleta de cores estilo Excel ──────────────────────────────────────────────
// Clareia (pct>0, em direção ao branco) ou escurece (pct<0) um hex.
export function shadeHex(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (pct >= 0) { r += (255 - r) * pct; g += (255 - g) * pct; b += (255 - b) * pct; }
  else { const p = 1 + pct; r *= p; g *= p; b *= p; }
  return '#' + [r, g, b].map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
}
export const THEME_BASE = ['#FFFFFF', '#000000', '#E7E6E6', '#44546A', '#1C4584', '#ED7D31', '#A5A5A5', '#FFC000', '#4472C4', '#70AD47'];
export const THEME_SHADES = [0.8, 0.6, 0.4, 0, -0.25, -0.5];
export const STD_COLORS = ['#C00000', '#FF0000', '#FFC000', '#FFFF00', '#92D050', '#00B050', '#00B0F0', '#0070C0', '#002060', '#7030A0'];

// Menu de cores (paleta) que fecha ao escolher — usado para preenchimento e fonte.
export const ColorMenu = ({ label, title, value, onPick, onClear, clearLabel, icon }) => {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const pick = (c) => { onPick(c); setOpen(false); };
  const sw = { width: 16, height: 16, border: '1px solid rgba(0,0,0,.18)', borderRadius: 2, cursor: 'pointer', padding: 0 };
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button title={title || label} onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 3, height: 28, padding: '2px 5px', background: open ? 'var(--brand-50)' : 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer' }}>
        {icon ? (
          // Ícone com barra da cor atual embaixo (estilo Excel)
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, lineHeight: 1 }}>
            {icon}
            <span style={{ width: 16, height: 3, borderRadius: 1, background: value || 'transparent', backgroundImage: value ? undefined : 'linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%),linear-gradient(45deg,#ccc 25%,#fff 25%,#fff 75%,#ccc 75%)', backgroundSize: '4px 4px' }} />
          </span>
        ) : (
          <>
            <span style={{ fontSize: 11.5 }}>{label}</span>
            <span style={{ width: 14, height: 14, borderRadius: 2, border: '1px solid rgba(0,0,0,.2)', background: value || 'transparent', backgroundImage: value ? undefined : 'linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%),linear-gradient(45deg,#ccc 25%,#fff 25%,#fff 75%,#ccc 75%)', backgroundSize: '6px 6px' }} />
          </>
        )}
        <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>▼</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 60, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.18)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' }}>Cores do tema</div>
          {THEME_SHADES.map((s, ri) => (
            <div key={ri} style={{ display: 'flex', gap: 3, marginBottom: 3 }}>
              {THEME_BASE.map((base, ci) => {
                const c = shadeHex(base, s);
                return <button key={ci} onClick={() => pick(c)} title={c} style={{ ...sw, background: c }} />;
              })}
            </div>
          ))}
          <div style={{ fontSize: 10, color: 'var(--text-muted)', margin: '8px 0 4px', textTransform: 'uppercase', letterSpacing: '.04em' }}>Cores padrão</div>
          <div style={{ display: 'flex', gap: 3 }}>
            {STD_COLORS.map((c, i) => <button key={i} onClick={() => pick(c)} title={c} style={{ ...sw, background: c }} />)}
          </div>
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button onClick={() => { onClear(); setOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', padding: '2px 0' }}>
              <span style={{ width: 14, height: 14, border: '1px solid var(--border)', borderRadius: 2, display: 'inline-block' }} />{clearLabel}
            </button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', color: 'var(--text)' }}>
              <Icon name="edit" size={13} />Mais cores…
              <input type="color" value={value || '#1c4584'} onChange={e => pick(e.target.value)} style={{ width: 0, height: 0, opacity: 0, position: 'absolute' }} />
            </label>
          </div>
        </div>
      )}
    </div>
  );
};
