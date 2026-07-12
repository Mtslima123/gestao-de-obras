// taskDetailPure.js — lógica pura (sem Supabase, sem browser APIs) das features de
// Anexos/Histórico da tarefa. Separado do taskDetailStore para ser testável em node.

export const MAX_BYTES = 15 * 1024 * 1024; // 15 MB por arquivo
export const ALLOWED_EXT = ['pdf', 'jpg', 'jpeg', 'png', 'xlsx', 'csv'];

export const mkId = () => {
  try { return crypto.randomUUID(); }
  catch { return `id-${Date.now()}-${Math.floor(Math.random() * 1e6)}`; }
};

export const nowISO = () => new Date().toISOString();
export const extOf = (name = '') => (name.split('.').pop() || '').toLowerCase();

const STATUS_LABEL = { done: 'Concluída', late: 'Atrasada', upcoming: 'Futura', exec: 'Em execução', execucao: 'Em execução' };
export const statusLabel = (s) => STATUS_LABEL[s] || 'Em execução';

export function normAuthor(author) {
  return {
    authorId: author?.id || 'sistema',
    authorName: author?.nome || author?.email || 'Sistema',
    authorEmail: author?.email || '',
  };
}

// Valida um arquivo (ou objeto {name,size}) por tamanho e extensão. Lança em caso inválido.
export function validateFile(file) {
  if (!file) throw new Error('Nenhum arquivo selecionado.');
  if (file.size > MAX_BYTES) throw new Error(`Arquivo muito grande. Máximo: ${Math.round(MAX_BYTES / 1024 / 1024)} MB.`);
  if (!ALLOWED_EXT.includes(extOf(file.name))) throw new Error('Tipo não aceito. Use PDF, JPG, PNG, XLSX ou CSV.');
}

// Diff puro: compara etapas (anterior x novo) e devolve [{ taskId, event }] das mudanças relevantes.
export function computeDiffEvents(prevEtapas, nextEtapas, author) {
  const out = [];
  if (!Array.isArray(prevEtapas) || !Array.isArray(nextEtapas) || !prevEtapas.length) return out;
  const a = normAuthor(author);
  const sys = { authorId: 'sistema', authorName: 'Sistema', authorEmail: '' };
  const prevMap = new Map(prevEtapas.map(e => [e.id, e]));
  const depIds = (e) => new Set((e.dep || []).map(d => (typeof d === 'string' ? d : d.id)));

  nextEtapas.forEach((e) => {
    if (e.isGroup) return;
    const p = prevMap.get(e.id);
    if (!p) { out.push({ taskId: e.id, event: { type: 'created', text: e.etapa, ...a } }); return; }
    if ((p.status || '') !== (e.status || '')) {
      out.push({ taskId: e.id, event: { type: 'status', from: statusLabel(p.status), to: statusLabel(e.status), ...a } });
    }
    const pa = p.avanco ?? 0, na = e.avanco ?? 0;
    if (pa !== na) {
      out.push({ taskId: e.id, event: { type: 'progress', from: pa, to: na, ...a } });
      if (pa < 100 && na >= 100) out.push({ taskId: e.id, event: { type: 'status', to: 'Concluída', ...sys } });
    }
    if ((p.inicio ?? 0) !== (e.inicio ?? 0) || (p.dur ?? 0) !== (e.dur ?? 0)) {
      out.push({ taskId: e.id, event: { type: 'schedule', from: `${p.inicio ?? 0}+${p.dur ?? 0}`, to: `${e.inicio ?? 0}+${e.dur ?? 0}`, ...a } });
    }
    const pd = depIds(p), nd = depIds(e);
    const added = [...nd].filter(x => !pd.has(x));
    const removed = [...pd].filter(x => !nd.has(x));
    if (added.length) out.push({ taskId: e.id, event: { type: 'dependency', field: 'add', text: added.join(', '), ...a } });
    if (removed.length) out.push({ taskId: e.id, event: { type: 'dependency', field: 'remove', text: removed.join(', '), ...a } });
    if ((p.responsavel || '') !== (e.responsavel || '')) {
      out.push({ taskId: e.id, event: { type: 'resource', from: p.responsavel || '—', to: e.responsavel || '—', ...a } });
    }
  });
  return out;
}
