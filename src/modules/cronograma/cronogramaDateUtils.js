// Utilitários de data e calendário de trabalho do Cronograma.
// Extraídos de Cronograma.jsx (movimento verbatim, comportamento idêntico) para
// reduzir o tamanho do componente e permitir reuso/teste.
//
// Convenção de datas: offset em DIAS a partir de GM_REF (1º de março de 2024).
// O calendário de trabalho é um estado de módulo mutável (WORK_CAL), configurado
// por setWorkCal a partir da config de feriados da obra ativa.

import { GM_START_YEAR, GM_START_MONTH } from './ganttUtils';

// ─── Utilitários de data ─────────────────────────────────────────────────────
const GM_REF = new Date(GM_START_YEAR, GM_START_MONTH, 1);

// Converte offset em DIAS para objeto Date
export function offsetToDate(days) {
  const d = new Date(GM_REF);
  d.setDate(d.getDate() + Math.round(days));
  return d;
}

// Converte offset em DIAS para string ISO "YYYY-MM-DD"
export function offsetToISO(days) {
  const d   = offsetToDate(days);
  const y   = d.getFullYear();
  const mo  = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

// Converte "YYYY-MM-DD" → "DD/MM/AAAA" para exibição
export function isoToBR(iso) {
  if (!iso || iso.length < 10) return iso || '';
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

// Converte string ISO para offset em DIAS desde GM_REF
export function dateToOffset(iso) {
  if (!iso) return 0;
  const parts = iso.split('-');
  if (parts.length < 3) return 0;
  const dt = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  return Math.max(0, Math.round((dt - GM_REF) / 86400000));
}

// ─── Calendário de trabalho (feriados / dias não trabalhados) ────────────────
// Estado de módulo mutável definido a partir da config de feriados da obra.
let WORK_CAL = { holidays: new Set(), sabadoUtil: false };
export function setWorkCal(cfg) {
  WORK_CAL = {
    holidays: new Set((cfg?.dias || []).map(d => dateToOffset(d.data))),
    sabadoUtil: !!cfg?.sabadoUtil,
  };
}
function isWorkDay(off) {
  const wd = offsetToDate(off).getDay(); // 0=domingo, 6=sábado
  if (wd === 0) return false;
  if (wd === 6 && !WORK_CAL.sabadoUtil) return false;
  return !WORK_CAL.holidays.has(off);
}
// Término (offset exclusivo) após `dur` dias ÚTEIS a partir de `inicio` (mantém a convenção inicio+dur).
export function workEnd(inicio, dur) {
  if (!(dur > 0)) return inicio;
  let off = inicio, c = 0, guard = 0;
  while (c < dur && guard++ < 100000) { if (isWorkDay(off)) c++; off++; }
  return off;
}
// Nº de dias úteis em [inicio, fimExcl) (mínimo 1).
export function workDur(inicio, fimExcl) {
  let c = 0;
  for (let o = inicio; o < fimExcl; o++) if (isWorkDay(o)) c++;
  return Math.max(1, c);
}
// Término universal: grupo = envelope (inicio+dur já é o envelope dos filhos); folha = dias úteis.
export function taskEnd(e) { return e && e.isGroup ? (e.inicio + e.dur) : workEnd(e.inicio, e.dur); }
