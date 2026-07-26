// Compartilhados do Cronograma — constantes de timeline/layout, definições de
// colunas da Lista, paleta de cores (Excel) e subcomponentes de UI (EditableCell,
// ColorMenu). Extraídos de Cronograma.jsx (movimento verbatim) para que
// GanttInterativo e ListaInterativa possam viver em arquivos próprios.

import React from "react";
import { Icon } from "../../components/Icons";
import { isoToBR, taskEnd, offsetToISO } from "./cronogramaDateUtils";
import { effStatus, collectDescendantIds, computeSuccessors } from "./scheduleEngine";

// ─── Constantes de timeline / layout ─────────────────────────────────────────
export const GM_START_YEAR  = 2024;
export const GM_START_MONTH = 2;    // março (0-indexed)
export const GM_TOTAL       = 28;   // meses na linha do tempo
export const GM_MONTH_W     = 64;              // px por mês (mantido para compatibilidade do header)
export const GM_DAY_W       = GM_MONTH_W / 30; // px por dia ≈ 2.133
export const GM_LABEL_W     = 280;  // px da coluna de rótulos
export const GM_ROW_H       = 36;   // altura por linha
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
export const ZOOM_PX_DIA = { dia: 16, semana: 7, mes: 1.8, trimestre: 0.6 };

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
export const EditableCell = ({ value, type = 'text', onSave, readOnly = false, style, listId, onExitEdit }) => {
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
    onExitEdit?.();
  };
  const cancel = () => { setEditing(false); setDraft(value); onExitEdit?.(); };

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
        style={{ cursor: type === 'date' ? 'pointer' : 'text', display: 'block', minHeight: 20, ...style }}
      >
        {display ?? <span style={{ color: 'var(--text-faint)' }}>—</span>}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
      list={listId}
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
  wbs:       { label: 'WBS',           defWidth: 44,  frozen: true, band: 'etapa', type: 'text' },
  id:        { label: 'ID',            defWidth: 44,  frozen: true, band: 'etapa', type: 'text' },
  modo:      { label: 'Modo',          defWidth: 56,  align: 'center', band: 'etapa', type: 'enum' },
  etapa:     { label: 'Etapa / Tarefa',defWidth: 224, frozen: true, band: 'etapa', type: 'text' },
  inicio:    { label: 'Início',        defWidth: 96,  band: 'prazo', type: 'date' },
  fim:       { label: 'Término',       defWidth: 96,  band: 'prazo', type: 'date' },
  duracao:   { label: 'Duração',       defWidth: 78,  band: 'prazo', type: 'number' },
  avanco:    { label: '% Concluída',   defWidth: 150, band: 'avanco', type: 'number' },
  status:    { label: 'Status',        defWidth: 110, band: 'avanco', type: 'enum' },
  peso:           { label: 'Peso %',          defWidth: 70,  align: 'right', band: 'fin', type: 'number' },
  fatorPeso:      { label: 'Fator Peso',      defWidth: 90,  align: 'right', band: 'fin', type: 'number' },
  valorVinculado: { label: 'Valor Vinculado', defWidth: 120, align: 'right', band: 'fin', type: 'number' },
  custo:     { label: 'Custo Prev.',   defWidth: 112, align: 'right', band: 'fin', type: 'number' },
  custoReal: { label: 'Custo Real',    defWidth: 112, align: 'right', band: 'fin', type: 'number' },
  saldo:     { label: 'Saldo',         defWidth: 112, align: 'right', band: 'fin', type: 'number' },
  dep:       { label: 'Pred.',         defWidth: 90,  band: 'seq', type: 'text' },
  succ:      { label: 'Suces.',        defWidth: 90,  band: 'seq', type: 'text' },
  resp:      { label: 'Responsável',   defWidth: 152, band: 'seq', type: 'text' },
  pavimento: { label: 'Pavimento',     defWidth: 110, band: 'seq', type: 'text' },
  restricao: { label: 'Restrição',     defWidth: 80,  band: 'seq', type: 'date' },
  participa:  { label: 'Curva',         defWidth: 54, align: 'center', band: 'seq', type: 'boolean' },
};

// Tipo de uma coluna, considerando também colunas personalizadas (que já carregam seu
// próprio `type`) — usado pelo menu de ordenar/filtrar do cabeçalho (ColumnHeaderFilterMenu).
export const resolveColType = (colId, customCols) => {
  if (LISTA_COL_DEFS[colId]) return LISTA_COL_DEFS[colId].type || 'text';
  const cc = (customCols || []).find(c => c.id === colId);
  if (!cc) return 'text';
  if (cc.type === 'boolean') return 'boolean';
  if (cc.type === 'date') return 'date';
  if (cc.type === 'number' || cc.type === 'currency' || cc.type === 'percent' || cc.type === 'duration') return 'number';
  return 'text'; // 'text' | 'list'
};

// Sentinela para "valor em branco" nas listas de filtro — não pode colidir com nenhum
// valor real exibido em célula.
export const FILTER_BLANK_KEY = ' blank';
export const LISTA_BAND_LABELS = { etapa: 'Etapa / Tarefa', prazo: 'Prazo', avanco: 'Avanço', fin: 'Financeiro', seq: 'Sequenciamento', custom: 'Personalizadas' };

// ─── Filtro global (aba "Filtro" da Lista, também aplicado no Gantt) ─────────
// Presets prontos, estilo MS Project. "Crítica" (caminho crítico) fica de fora:
// o sistema ainda não calcula folga/caminho crítico (ver card "Folga Total" na página).
export const FILTRO_PRESETS = [
  { id: '',              label: 'Sem Filtro' },
  { id: 'ativas',        label: 'Tarefas Ativas' },
  { id: 'atrasadas',     label: 'Tarefas Atrasadas' },
  { id: 'concluidas',    label: 'Tarefas Concluídas' },
  { id: 'marcos',        label: 'Marcos' },
  { id: 'semSucessoras', label: 'Sem sucessoras' },
  { id: 'intervalo',     label: 'Intervalo de datas…' },
];

// Predicado único de filtro de tarefas, compartilhado pela Lista e pelo Gantt (para os dois
// verem exatamente o mesmo conjunto filtrado). Tarefa Pai inclui toda a descendência (grupos
// e folhas), preservando a hierarquia EAP; os demais critérios testam cada tarefa individualmente.
export function buildTaskFilterPredicate({ filtroStatus, filtroResp, filtroPreset, filtroPresetRange, filtroTaskIds, etapas }) {
  const allowedIds = (filtroTaskIds && filtroTaskIds.length)
    ? filtroTaskIds.reduce((set, id) => {
        const t = etapas.find(x => x.id === id);
        if (t?.isGroup) collectDescendantIds(id, etapas).forEach(x => set.add(x));
        else set.add(id);
        return set;
      }, new Set())
    : null;
  const succMap = filtroPreset === 'semSucessoras' ? computeSuccessors(etapas) : null;
  return (e) => {
    if (allowedIds && !allowedIds.has(e.id)) return false;
    if (filtroStatus && effStatus(e) !== filtroStatus) return false;
    if (filtroResp && !(e.responsavel || '').toLowerCase().includes(filtroResp.toLowerCase())) return false;
    if (filtroPreset === 'ativas' && !e.isGroup && !(e.avanco > 0 && e.avanco < 100)) return false;
    if (filtroPreset === 'atrasadas' && effStatus(e) !== 'late') return false;
    if (filtroPreset === 'concluidas' && effStatus(e) !== 'done') return false;
    if (filtroPreset === 'marcos' && !e.isGroup && e.dur !== 0) return false;
    if (filtroPreset === 'semSucessoras' && !e.isGroup && (succMap[e.id] || []).length) return false;
    if (filtroPreset === 'intervalo' && filtroPresetRange?.de && filtroPresetRange?.ate) {
      const iso = offsetToISO(e.inicio);
      if (iso < filtroPresetRange.de || iso > filtroPresetRange.ate) return false;
    }
    return true;
  };
}

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

// ─── Menu de cabeçalho de coluna (Ordenar + Filtrar, estilo MS Project) ──────
const SORT_LABELS = {
  date:    ['Classificar do Mais Antigo para o Mais Recente', 'Classificar do Mais Recente para o Mais Antigo'],
  number:  ['Classificar do Menor para o Maior', 'Classificar do Maior para o Menor'],
  default: ['Classificar de A a Z', 'Classificar de Z a A'],
};

// Checkbox nativo com suporte a estado indeterminado (tri-state), que o React/HTML
// não expõe como atributo — só como propriedade do elemento DOM.
const TriCheckbox = ({ checked, indeterminate, onChange }) => {
  const ref = React.useRef(null);
  React.useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate && !checked; }, [indeterminate, checked]);
  return <input ref={ref} type="checkbox" checked={checked} onChange={onChange} style={{ cursor: 'pointer' }} />;
};

export const ColumnHeaderFilterMenu = ({ label, type, activeFilter, onApplyFilter, onClearFilter, sortDir, onSort, getDomainEntries }) => {
  const [open, setOpen] = React.useState(false);
  const [draftChecked, setDraftChecked] = React.useState(null); // Set<string> | null (null = ainda não montado)
  const [flatKeys, setFlatKeys] = React.useState([]);           // colunas não-data: chaves ordenadas
  const [dateTree, setDateTree] = React.useState(null);         // colunas data: { years: Map, hasBlank }
  const [expandedYears, setExpandedYears] = React.useState(() => new Set());
  const [expandedMonths, setExpandedMonths] = React.useState(() => new Set());
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const k = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const entries = getDomainEntries();
    const excluded = new Set(activeFilter?.excluded || []);
    setExpandedYears(new Set());
    setExpandedMonths(new Set());
    if (type === 'date') {
      const years = new Map();
      let hasBlank = false;
      entries.forEach(({ raw }) => {
        if (!raw) { hasBlank = true; return; }
        const y = raw.getFullYear(), m = raw.getMonth(), d = raw.getDate();
        if (!years.has(y)) years.set(y, new Map());
        const mm = years.get(y);
        if (!mm.has(m)) mm.set(m, new Set());
        mm.get(m).add(d);
      });
      setDateTree({ years, hasBlank });
      const allKeys = [];
      years.forEach((mm, y) => mm.forEach((days, m) => days.forEach(d => allKeys.push(`${y}-${m + 1}-${d}`))));
      if (hasBlank) allKeys.push(FILTER_BLANK_KEY);
      setDraftChecked(new Set(allKeys.filter(k => !excluded.has(k))));
    } else {
      const seen = new Map(); // label -> raw (representante, para ordenar number)
      let hasBlank = false;
      entries.forEach(({ raw, label: lbl }) => {
        if (lbl === '' || lbl == null) { hasBlank = true; return; }
        if (!seen.has(lbl)) seen.set(lbl, raw);
      });
      let keys = [...seen.keys()];
      keys.sort((a, b) => type === 'number'
        ? (seen.get(a) ?? 0) - (seen.get(b) ?? 0)
        : a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));
      if (hasBlank) keys.push(FILTER_BLANK_KEY);
      setFlatKeys(keys);
      setDraftChecked(new Set(keys.filter(k => !excluded.has(k))));
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const allKeys = type === 'date'
    ? (() => {
        if (!dateTree) return [];
        const out = [];
        dateTree.years.forEach((mm, y) => mm.forEach((days, m) => days.forEach(d => out.push(`${y}-${m + 1}-${d}`))));
        if (dateTree.hasBlank) out.push(FILTER_BLANK_KEY);
        return out;
      })()
    : flatKeys;

  const toggleKeys = (keys, checked) => setDraftChecked(prev => {
    const next = new Set(prev);
    keys.forEach(k => checked ? next.add(k) : next.delete(k));
    return next;
  });
  const stateOf = (keys) => {
    if (!draftChecked || !keys.length) return { checked: false, indeterminate: false };
    const n = keys.filter(k => draftChecked.has(k)).length;
    return { checked: n === keys.length, indeterminate: n > 0 && n < keys.length };
  };

  const toggleAll = () => {
    const st = stateOf(allKeys);
    toggleKeys(allKeys, !st.checked);
  };
  const toggleYear = (y, dayKeys) => { const st = stateOf(dayKeys); toggleKeys(dayKeys, !st.checked); };
  const toggleMonth = (dayKeys) => { const st = stateOf(dayKeys); toggleKeys(dayKeys, !st.checked); };
  const toggleDay = (key) => toggleKeys([key], !draftChecked.has(key));
  const toggleFlat = (key) => toggleKeys([key], !draftChecked.has(key));

  const applyOk = () => {
    onApplyFilter(allKeys.filter(k => !draftChecked.has(k)));
    setOpen(false);
  };

  const sortWords = SORT_LABELS[type] || SORT_LABELS.default;
  const optRow = { display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', fontSize: 11, fontWeight: 400, textTransform: 'none', cursor: 'pointer', borderRadius: 4 };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', height: '100%' }}>
      <button onClick={() => setOpen(o => !o)} title={`Ordenar / filtrar — ${label}`}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 19, height: 19, padding: 0, border: 'none', background: activeFilter || sortDir ? 'var(--brand-700, #143766)' : 'rgba(255,255,255,0.14)', color: '#fff', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
        ▾
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 9999, background: 'var(--surface)', color: 'var(--text)', fontWeight: 400, textTransform: 'none', letterSpacing: 'normal', border: '1px solid var(--border)', borderRadius: 8, padding: 8, boxShadow: '0 10px 30px rgba(0,0,0,0.18)', width: 240, cursor: 'default' }}>
          <div onClick={() => { onSort('asc'); setOpen(false); }} style={optRow} className="col-filter-opt">{sortWords[0]}</div>
          <div onClick={() => { onSort('desc'); setOpen(false); }} style={optRow} className="col-filter-opt">{sortWords[1]}</div>
          <hr style={{ margin: '6px 0', border: 'none', borderTop: '1px solid var(--border)' }} />
          <div onClick={() => { if (activeFilter) { onClearFilter(); setOpen(false); } }}
            style={{ ...optRow, opacity: activeFilter ? 1 : 0.45, cursor: activeFilter ? 'pointer' : 'default' }}
            className={activeFilter ? 'col-filter-opt' : undefined}>
            Limpar Filtro de {label}
          </div>
          <hr style={{ margin: '6px 0', border: 'none', borderTop: '1px solid var(--border)' }} />
          <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6, padding: 4 }}>
            <label style={{ ...optRow, fontWeight: 600 }}>
              <TriCheckbox {...stateOf(allKeys)} onChange={toggleAll} />
              (Selecionar Todos)
            </label>
            {type === 'date' && dateTree && [...dateTree.years.keys()].sort((a, b) => a - b).map(y => {
              const mm = dateTree.years.get(y);
              const yearDayKeys = [...mm.entries()].flatMap(([m, days]) => [...days].map(d => `${y}-${m + 1}-${d}`));
              const yOpen = expandedYears.has(y);
              return (
                <div key={y}>
                  <label style={optRow}>
                    <button onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); setExpandedYears(s => { const n = new Set(s); n.has(y) ? n.delete(y) : n.add(y); return n; }); }}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', width: 14, fontSize: 10, color: 'var(--text-muted)' }}>{yOpen ? '▼' : '▶'}</button>
                    <TriCheckbox {...stateOf(yearDayKeys)} onChange={() => toggleYear(y, yearDayKeys)} />
                    {y}
                  </label>
                  {yOpen && [...mm.keys()].sort((a, b) => a - b).map(m => {
                    const days = [...mm.get(m)].sort((a, b) => a - b);
                    const monthDayKeys = days.map(d => `${y}-${m + 1}-${d}`);
                    const mKey = `${y}-${m}`;
                    const mOpen = expandedMonths.has(mKey);
                    return (
                      <div key={mKey} style={{ marginLeft: 18 }}>
                        <label style={optRow}>
                          <button onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); setExpandedMonths(s => { const n = new Set(s); n.has(mKey) ? n.delete(mKey) : n.add(mKey); return n; }); }}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', width: 14, fontSize: 10, color: 'var(--text-muted)' }}>{mOpen ? '▼' : '▶'}</button>
                          <TriCheckbox {...stateOf(monthDayKeys)} onChange={() => toggleMonth(monthDayKeys)} />
                          {GM_MN[m]}
                        </label>
                        {mOpen && days.map(d => {
                          const key = `${y}-${m + 1}-${d}`;
                          return (
                            <label key={key} style={{ ...optRow, marginLeft: 18 }}>
                              <input type="checkbox" checked={draftChecked?.has(key) || false} onChange={() => toggleDay(key)} />
                              {d}
                            </label>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {type === 'date' && dateTree?.hasBlank && (
              <label style={optRow}>
                <input type="checkbox" checked={draftChecked?.has(FILTER_BLANK_KEY) || false} onChange={() => toggleFlat(FILTER_BLANK_KEY)} />
                (Em branco)
              </label>
            )}
            {type !== 'date' && flatKeys.map(k => (
              <label key={k} style={optRow}>
                <input type="checkbox" checked={draftChecked?.has(k) || false} onChange={() => toggleFlat(k)} />
                {k === FILTER_BLANK_KEY ? '(Em branco)' : k}
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8 }}>
            <button onClick={() => setOpen(false)} className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px', height: 26 }}>Cancelar</button>
            <button onClick={applyOk} className="btn btn-primary" style={{ fontSize: 12, padding: '4px 10px', height: 26 }}>OK</button>
          </div>
        </div>
      )}
    </div>
  );
};

// Popover de múltipla seleção de tarefas (filtro "Tarefa" da aba Filtro): lista TODAS as
// tarefas (grupos e folhas), indentadas pela hierarquia EAP, com busca e OK/Cancelar — mesmo
// padrão de interação do ColumnHeaderFilterMenu (popover ancorado, fecha ao clicar fora,
// rascunho local até confirmar).
export const TaskMultiSelectFilter = ({ etapas, wbsMap, selectedIds = [], onApply }) => {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(() => new Set(selectedIds));
  const [busca, setBusca] = React.useState('');
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    setDraft(new Set(selectedIds));
    setBusca('');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const k = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [open]);

  const toggle = (id) => setDraft(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const buscaLower = busca.trim().toLowerCase();
  const visiveis = etapas.filter(e => {
    if (!buscaLower) return true;
    const wbs = wbsMap[e.id] || '';
    return e.etapa?.toLowerCase().includes(buscaLower) || wbs.includes(buscaLower);
  });

  const nVisChecked = visiveis.filter(e => draft.has(e.id)).length;
  const allVisChecked = visiveis.length > 0 && nVisChecked === visiveis.length;
  const someVisChecked = nVisChecked > 0 && nVisChecked < visiveis.length;
  const toggleAllVisiveis = () => setDraft(prev => {
    const next = new Set(prev);
    visiveis.forEach(e => allVisChecked ? next.delete(e.id) : next.add(e.id));
    return next;
  });

  const optRow = { display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px', fontSize: 12, cursor: 'pointer', borderRadius: 4 };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        style={{ height: 26, fontSize: 12, padding: '2px 10px', display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', color: 'var(--text)' }}
        onClick={() => setOpen(o => !o)}
      >
        {selectedIds.length ? `Tarefa: ${selectedIds.length} selecionada${selectedIds.length > 1 ? 's' : ''}` : 'Tarefa: todas'}
        <span style={{ fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 9999, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: 8, boxShadow: '0 10px 30px rgba(0,0,0,0.18)', width: 280 }}>
          <input
            autoFocus className="input" placeholder="Buscar tarefa..." value={busca}
            onChange={e => setBusca(e.target.value)}
            style={{ height: 26, fontSize: 12, marginBottom: 6, width: '100%', boxSizing: 'border-box' }}
          />
          <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6, padding: 4 }}>
            {visiveis.length > 0 && (
              <label style={{ ...optRow, fontWeight: 600, borderBottom: '1px solid var(--border-subtle, var(--border))', marginBottom: 2 }}>
                <TriCheckbox checked={allVisChecked} indeterminate={someVisChecked} onChange={toggleAllVisiveis} />
                (Selecionar Todos)
              </label>
            )}
            {visiveis.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 6px' }}>Nenhuma tarefa encontrada.</div>
            )}
            {visiveis.map(e => (
              <label key={e.id} style={{ ...optRow, marginLeft: (e.nivel || 0) * 14, fontWeight: e.isGroup ? 600 : 400 }}>
                <input type="checkbox" checked={draft.has(e.id)} onChange={() => toggle(e.id)} />
                {wbsMap[e.id] ? `${wbsMap[e.id]} — ${e.etapa}` : e.etapa}
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <button onClick={() => { onApply([]); setOpen(false); }} className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 6px', height: 26 }}>
              Limpar filtro
            </button>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setOpen(false)} className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px', height: 26 }}>Cancelar</button>
              <button onClick={() => { onApply([...draft]); setOpen(false); }} className="btn btn-primary" style={{ fontSize: 12, padding: '4px 10px', height: 26 }}>Aplicar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
