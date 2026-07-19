// Funções puras do Gantt — sem state, sem JSX, sem efeitos colaterais.
// Extraídas de Cronograma.jsx para facilitar testes e leitura.
//
// NOTA: as funções de agenda/hierarquia/criação de tarefas vivem hoje como CÓPIAS
// LOCAIS dentro de Cronograma.jsx (que carregam a lógica de dias úteis / calendário
// de trabalho). Aqui ficam apenas os utilitários realmente importados por outros
// módulos (Obras/Orçamento) e pelos testes, evitando duas fontes de verdade.

// ─── Constantes de referência temporal ──────────────────────────────────────
export const GM_START_YEAR  = 2024;
export const GM_START_MONTH = 2; // março (0-indexed)

const GM_REF = new Date(GM_START_YEAR, GM_START_MONTH, 1);

// ─── Utilitários de data ─────────────────────────────────────────────────────

export function offsetToDate(days) {
  const d = new Date(GM_REF);
  d.setDate(d.getDate() + Math.round(days));
  return d;
}

export function offsetToISO(days) {
  const d   = offsetToDate(days);
  const y   = d.getFullYear();
  const mo  = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

export function dateToOffset(iso) {
  if (!iso) return 0;
  const parts = iso.split('-');
  if (parts.length < 3) return 0;
  const dt = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  return Math.max(0, Math.round((dt - GM_REF) / 86400000));
}

const MES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MS_DIA = 86400000;

// ─── Grade de calendário real (usada pelo header/zoom do Gantt) ─────────────
// Ao contrário de offsetToDate (dia exato), estas funções constroem a grade de
// meses/trimestres/semanas/dias com durações reais de calendário (28-31 dias),
// para o cabeçalho e a grade de fundo do Gantt refletirem datas de verdade.

export function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // segunda=0 ... domingo=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // quinta-feira da semana ISO
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const isoWeek = 1 + Math.round(
    ((d - firstThursday) / MS_DIA - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7
  );
  return { isoYear: d.getUTCFullYear(), isoWeek };
}

export function buildCalendarMonths(refDate, totalDays) {
  const out = [];
  let cursor = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
  let dayCount = 0;
  while (dayCount < totalDays) {
    const y = cursor.getFullYear(), mo = cursor.getMonth();
    const daysInMonth = new Date(y, mo + 1, 0).getDate();
    const days = Math.min(daysInMonth, totalDays - dayCount);
    out.push({ year: y, month: mo, short: MES_ABREV[mo], isQ: mo % 3 === 0, startOffset: dayCount, days });
    dayCount += days;
    cursor = new Date(y, mo + 1, 1);
  }
  return out;
}

export function buildCalendarQuarters(calMonths) {
  const out = [];
  calMonths.forEach(m => {
    const last = out[out.length - 1];
    const q = Math.floor(m.month / 3) + 1;
    if (last && last.year === m.year && last.q === q) { last.days += m.days; }
    else { out.push({ label: `T${q}/${m.year}`, year: m.year, q, startOffset: m.startOffset, days: m.days }); }
  });
  return out;
}

export function buildCalendarYears(calMonths) {
  const out = [];
  calMonths.forEach(m => {
    const last = out[out.length - 1];
    if (last && last.year === m.year) { last.days += m.days; }
    else { out.push({ year: m.year, startOffset: m.startOffset, days: m.days }); }
  });
  return out;
}

export function buildCalendarWeeks(refDate, totalDays) {
  const out = [];
  let dayCount = 0;
  while (dayCount < totalDays) {
    const date = new Date(refDate);
    date.setDate(date.getDate() + dayCount);
    const weekday = (date.getDay() + 6) % 7; // segunda=0 ... domingo=6
    const days = Math.min(7 - weekday, totalDays - dayCount);
    const { isoYear, isoWeek } = getISOWeek(date);
    out.push({ isoYear, isoWeek, startOffset: dayCount, days });
    dayCount += days;
  }
  return out;
}

export function buildCalendarDays(refDate, totalDays) {
  const out = [];
  for (let i = 0; i < totalDays; i++) {
    const date = new Date(refDate);
    date.setDate(date.getDate() + i);
    const weekday = date.getDay(); // domingo=0
    out.push({
      offset: i,
      day: date.getDate(),
      weekday,
      isWeekend: weekday === 0 || weekday === 6,
      isMonthStart: date.getDate() === 1,
    });
  }
  return out;
}

// ─── Migração e normalização ─────────────────────────────────────────────────

export function migrateEtapas(raw) {
  const arr = (raw || []).map(e => ({
    nivel: 0, parentId: null, isGroup: false,
    collapsed: false, responsavel: '', customCols: {},
    milestone: false, custo: 0, showInDist: false,
    restricaoTipo: 'asap', restricaoData: '',
    fator_peso: 1,
    ...e,
    showInDist: e.showInDist ?? false,
    fator_peso: e.fator_peso ?? 1,
    dep: (e.dep || []).map(d =>
      typeof d === 'string' ? { id: d, tipo: 'TI', lag: 0 } : d
    ),
  }));
  const maxDid = arr.reduce((m, e) => Math.max(m, e.displayId || 0), 0);
  let nextDid = maxDid + 1;
  return arr.map(e => e.displayId ? e : { ...e, displayId: nextDid++ });
}

// ─── Integração Orçamento × Cronograma ───────────────────────────────────────

/**
 * Calcula o valor vinculado de cada etapa a partir dos vínculos com o orçamento.
 *
 * Vínculos podem apontar para tarefas-resumo (grupos) ou folhas.
 * Quando apontam para um grupo, o valor total vinculado é distribuído recursivamente
 * entre os descendentes folha usando fator_peso.
 * O mapa retornado inclui tanto folhas (valor distribuído) quanto grupos (soma dos filhos),
 * permitindo exibição em qualquer nível da EAP.
 *
 * @param {Array}  etapas             - Lista completa de etapas do cronograma
 * @param {Array}  vinculos           - Vínculos [{etapa_id, orcamento_item_id}]
 * @param {Object} orcamentoItensMap  - { [orcamento_item_id]: valor_total }
 * @returns {Object} { [etapa_id]: valor }
 */
export function computeValorVinculadoMap(etapas, vinculos, orcamentoItensMap) {
  if (!vinculos?.length) return {};

  const etapaMap = new Map(etapas.map(e => [e.id, e]));

  // Soma os valores dos itens diretamente vinculados por etapa
  const directValues = {};
  vinculos.forEach(v => {
    const val = orcamentoItensMap[v.orcamento_item_id] || 0;
    directValues[v.etapa_id] = (directValues[v.etapa_id] || 0) + val;
  });

  const leafValues = {};

  // Distribui recursivamente o valor de um nó até suas folhas pelo fator_peso
  function distributeToLeaves(etapaId, value) {
    const children = etapas.filter(e => e.parentId === etapaId);
    if (children.length === 0) {
      leafValues[etapaId] = (leafValues[etapaId] || 0) + value;
      return;
    }
    const totalFator = children.reduce((s, c) => s + (c.fator_peso ?? 1), 0);
    if (totalFator <= 0) return;
    children.forEach(c => {
      distributeToLeaves(c.id, value * ((c.fator_peso ?? 1) / totalFator));
    });
  }

  Object.entries(directValues).forEach(([id, val]) => {
    if (val > 0) distributeToLeaves(id, val);
  });

  // Propaga valores das folhas para os grupos (bubble-up, do mais profundo para o mais raso)
  const result = { ...leafValues };
  [...etapas]
    .sort((a, b) => (b.nivel || 0) - (a.nivel || 0))
    .forEach(e => {
      if (e.parentId && result[e.id]) {
        result[e.parentId] = (result[e.parentId] || 0) + result[e.id];
      }
    });

  return result;
}
