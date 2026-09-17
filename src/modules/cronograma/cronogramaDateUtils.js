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

// Converte um Date (calendário local, ex.: vindo de offsetToDate) pro número de série
// que o Excel usa internamente pra representar datas. Necessário nos exports em Excel:
// se a gente entrega um objeto Date "cru" pro xlsx-js-style, a conversão interna dele
// (baseada em Date.getTime(), sensível ao fuso do navegador) jogava a data 1 dia pra
// trás em qualquer fuso negativo (Brasil, UTC-3) — ex.: 01/09/2024 virava 31/08/2024 no
// arquivo baixado, mesmo a tela mostrando a data certa. Calculando o serial nós mesmos,
// com aritmética 100% em UTC (Date.UTC dos dois lados), o resultado não depende do fuso
// do processo/navegador.
export function dateToExcelSerial(date) {
  const ms = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(1899, 11, 30);
  return Math.round(ms / 86400000);
}

// Converte "YYYY-MM-DD" → "DD/MM/AAAA" para exibição
export function isoToBR(iso) {
  if (!iso || iso.length < 10) return iso || '';
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

const DIAS_ABREV = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
// Mesmo formato de isoToBR, com a inicial do dia da semana na frente — estilo MS Project
// ("Qui 03/09/2026"). new Date(y, m-1, d) local (não new Date(iso), que parseia como UTC
// e vira o dia anterior em fusos negativos) — mesma convenção de dateToOffset.
export function isoToBRWeekday(iso) {
  if (!iso || iso.length < 10) return iso || '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const wd = new Date(y, m - 1, d).getDay();
  return `${DIAS_ABREV[wd]} ${isoToBR(iso)}`;
}

// Normaliza uma data digitada/colada pro formato ISO "YYYY-MM-DD" que o resto do app
// espera internamente (inclusive o <input type="date"> nativo da célula editável).
// Aceita ISO (colar entre células do próprio app, que já copia em ISO) e "DD/MM/AAAA"
// ou "DD/MM/AA" (colar de fora — Excel/Google Sheets exibem e copiam datas assim por
// padrão no Brasil). Sem isso, colar uma data em DD/MM/AAAA gravava o texto cru direto
// (ex.: em restricaoData), fora do formato ISO que o input nativo e o cálculo de
// agendamento esperam — a data colada parecia simplesmente ignorada.
// Retorna '' se não reconhecer o formato (não corrompe o valor existente).
export function parseAnyDateToISO(raw) {
  const v = String(raw ?? '').trim();
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return '';
  let [, d, mo, y] = m;
  if (y.length === 2) y = (Number(y) <= 69 ? '20' : '19') + y; // mesma regra de século do Excel
  const iso = `${y.padStart(4, '0')}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const [yy, mm, dd] = iso.split('-').map(Number);
  const check = new Date(yy, mm - 1, dd);
  // Valida (ex.: "31/02/2024" não existe) — new Date "rola" o mês, então confere se voltou.
  if (check.getFullYear() !== yy || check.getMonth() !== mm - 1 || check.getDate() !== dd) return '';
  return iso;
}

// Converte string ISO para offset em DIAS desde GM_REF
export function dateToOffset(iso) {
  if (!iso) return 0;
  const parts = iso.split('-');
  if (parts.length < 3) return 0;
  const dt = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  return Math.max(0, Math.round((dt - GM_REF) / 86400000));
}

// Offset (em DIAS desde GM_REF) do dia de hoje — data local, mesmo cuidado de fuso que offsetToISO.
export function todayOffset() {
  const n = new Date();
  const iso = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  return dateToOffset(iso);
}

// Offset (em DIAS desde GM_REF) do dia 1 do mês seguinte ao mês que contém `fromOffset`.
export function nextMonthStartOffset(fromOffset) {
  const d0 = offsetToDate(fromOffset);
  const d  = new Date(d0.getFullYear(), d0.getMonth() + 1, 1);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  return dateToOffset(iso);
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
// Início (offset) tal que [início, fimExcl) contém exatamente `dur` dias úteis,
// terminando em fimExcl (exclusivo). Reverso de workEnd: workEnd(workStart(f,d),d) === f.
// Usado para agendar por TÉRMINO (dependências TT/IT, restrições mfo/fnet) em dias úteis.
export function workStart(fimExcl, dur) {
  if (!(dur > 0)) return fimExcl;
  let off = fimExcl - 1, c = 0, guard = 0;
  while (guard++ < 100000) {
    if (isWorkDay(off)) { c++; if (c === dur) return off; }
    off--;
  }
  return off;
}
// Término universal: grupo = envelope (inicio+dur já é o envelope dos filhos); folha = dias úteis.
export function taskEnd(e) { return e && e.isGroup ? (e.inicio + e.dur) : workEnd(e.inicio, e.dur); }

// Data de TÉRMINO para o usuário ver: o último dia efetivamente trabalhado (inclusivo).
// taskEnd/workEnd retornam o offset EXCLUSIVO (dia seguinte ao último dia trabalhado) —
// necessário pro motor de dependências (sucessora começa exatamente aí) e pras janelas de
// dias (computeMonthlyDist etc.). NUNCA usar isto em cálculo de agendamento ou de dias —
// só na hora de formatar/exibir/exportar uma data de término pra gente.
export function taskEndDisplay(e) { return taskEnd(e) - 1; }
