// logger.js — logger estruturado (JSON) para a SPA. Substitui console.* disperso.
//
// Por que não winston/Pino: ambos são de Node.js e não rodam no navegador (dependem de
// APIs de Node e incham/quebram o bundle). Este app é 100% client-side, então usamos um
// logger próprio e leve com a mesma disciplina: níveis, contexto, masking e sink remoto.
// winston/Pino ficariam reservados a componentes server-side (Edge Functions usam Deno).
//
// Recursos:
//  - Níveis: debug < info < warn < error < fatal (filtro por ambiente).
//  - Saída JSON única por evento, com contexto (userId, requestId, module, action).
//  - Masking recursivo: senha/token/dados pessoais nunca são gravados.
//  - Sink remoto best-effort: error/fatal também vão para a tabela app_logs no Supabase.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, fatal: 50 };

// Ambiente: em dev logamos tudo; em produção a partir de info.
const IS_DEV = (() => {
  try { return !!(import.meta && import.meta.env && import.meta.env.DEV); }
  catch { return false; }
})();
const MIN_LEVEL = LEVELS[IS_DEV ? 'debug' : 'info'];

// id único (correlationId) da carga/sessão do app — anexado a todo log.
const mkId = () => {
  try { return crypto.randomUUID(); }
  catch { return `id-${Date.now()}-${Math.floor(Math.random() * 1e6)}`; }
};
const REQUEST_ID = mkId();

// ── Contexto global (setado no login, limpo no logout) ──────────────────────
let ctx = {};
export const setContext = (partial) => { ctx = { ...ctx, ...(partial || {}) }; };
export const clearContext = () => { ctx = {}; };

// ── Data Masking ────────────────────────────────────────────────────────────
// Chaves cujo VALOR deve ser totalmente redigido (case-insensitive, por substring).
const SENSITIVE_KEY = /(senha|password|pass|token|secret|authorization|auth|apikey|api_key|cpf|cnpj|rg|dados_bancarios|bank|card|cartao)/i;
// Chaves de e-mail: mascaramos parcialmente em vez de redigir por completo.
const EMAIL_KEY = /(email|e_mail|mail)/i;
const REDACTED = '[REDACTED]';
const MAX_DEPTH = 6;

const maskEmail = (v) => {
  if (typeof v !== 'string' || !v.includes('@')) return v;
  const [user, dominio] = v.split('@');
  const head = user.slice(0, 1);
  return `${head}***@${dominio}`;
};

const serializeError = (e) => ({
  name: e?.name ?? 'Error',
  message: e?.message ?? String(e),
  stack: typeof e?.stack === 'string' ? e.stack : undefined,
});

// Sanitiza recursivamente: redige chaves sensíveis, mascara e-mail, serializa Error,
// protege contra ciclos e profundidade excessiva.
export function maskSensitive(value, _seen = new WeakSet(), _depth = 0) {
  if (value == null) return value;
  if (value instanceof Error) return serializeError(value);
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return value;
  if (t === 'bigint') return value.toString();
  if (t === 'function' || t === 'symbol') return `[${t}]`;
  if (_depth >= MAX_DEPTH) return '[Depth limit]';
  if (typeof value === 'object') {
    if (_seen.has(value)) return '[Circular]';
    _seen.add(value);
    if (Array.isArray(value)) return value.map((v) => maskSensitive(v, _seen, _depth + 1));
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(k)) { out[k] = REDACTED; continue; }
      if (EMAIL_KEY.test(k) && typeof v === 'string') { out[k] = maskEmail(v); continue; }
      out[k] = maskSensitive(v, _seen, _depth + 1);
    }
    return out;
  }
  return String(value);
}

// ── Montagem do evento (pura, testável) ──────────────────────────────────────
export function buildLogEntry(level, msg, data = {}) {
  const { module, action, err, ...rest } = data || {};
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: String(msg ?? ''),
    requestId: REQUEST_ID,
    ...ctx,
    ...(module ? { module } : {}),
    ...(action ? { action } : {}),
  };
  const maskedRest = maskSensitive(rest);
  if (maskedRest && Object.keys(maskedRest).length) entry.data = maskedRest;
  if (err !== undefined) entry.err = maskSensitive(err);
  return entry;
}

// ── Sink remoto (Supabase) — best-effort, só error/fatal ─────────────────────
let remoteSent = 0;
let remoteWindowStart = Date.now();
const REMOTE_MAX = 20;              // no máx. 20 envios
const REMOTE_WINDOW_MS = 60 * 1000; // por minuto

function shipRemote(entry) {
  // Só no navegador (evita rodar em testes node/SSR) e só error/fatal.
  if (typeof window === 'undefined') return;
  if (LEVELS[entry.level] < LEVELS.error) return;
  // Rate-limit simples para não inundar em storms de erro.
  const now = Date.now();
  if (now - remoteWindowStart > REMOTE_WINDOW_MS) { remoteWindowStart = now; remoteSent = 0; }
  if (remoteSent >= REMOTE_MAX) return;
  remoteSent++;
  // Import dinâmico: não acopla o logger ao cliente Supabase (mantém testável).
  import('./supabase.js')
    .then(({ supabase }) => supabase.from('app_logs').insert([{
      level: entry.level,
      msg: entry.msg,
      module: entry.module ?? null,
      action: entry.action ?? null,
      request_id: entry.requestId,
      user_id: entry.userId ?? null,
      user_email: entry.userEmail ?? null,
      data: entry.data ?? null,
      err: entry.err ?? null,
      url: window.location?.href ?? null,
      user_agent: navigator?.userAgent ?? null,
    }]))
    .then((res) => {
      // NUNCA chamar logger.* aqui (evita recursão infinita). console cru e olho.
      if (res?.error) console.error('[logger] falha ao gravar app_logs:', res.error?.message);
    })
    .catch((e) => console.error('[logger] falha ao enviar log remoto:', e?.message));
}

// ── Emissão ───────────────────────────────────────────────────────────────
const CONSOLE_METHOD = { debug: 'debug', info: 'info', warn: 'warn', error: 'error', fatal: 'error' };

function emit(level, msg, data) {
  if (LEVELS[level] < MIN_LEVEL) return;
  const entry = buildLogEntry(level, msg, data);
  const method = CONSOLE_METHOD[level] || 'log';
  // Em dev, formato legível + objeto expansível; em produção, JSON puro (parseável).
  if (IS_DEV) console[method](`[${level}] ${entry.msg}`, entry);
  else console[method](JSON.stringify(entry));
  shipRemote(entry);
}

function make(base = {}) {
  const merge = (data) => ({ ...base, ...(data || {}) });
  return {
    debug: (msg, data) => emit('debug', msg, merge(data)),
    info:  (msg, data) => emit('info',  msg, merge(data)),
    warn:  (msg, data) => emit('warn',  msg, merge(data)),
    error: (msg, data) => emit('error', msg, merge(data)),
    fatal: (msg, data) => emit('fatal', msg, merge(data)),
    // child: fixa dados base (ex.: module) para não repetir em cada chamada.
    child: (baseData) => make(merge(baseData)),
    setContext,
    clearContext,
  };
}

export const logger = make();
export default logger;
