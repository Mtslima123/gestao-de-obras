// taskDetailStore.js — camada de serviço para Anexos, Histórico e Comentários da tarefa do Gantt.
//
// Backend PRIMÁRIO: Supabase (tabelas `task_attachments` / `task_history` + bucket Storage
//   `task-attachments`). Ver migration em supabase/migrations/20260712_task_attachments_history.sql.
// Backend de FALLBACK: local (localStorage p/ metadados + IndexedDB p/ bytes), usado
//   automaticamente se as tabelas ainda não existirem / Supabase indisponível.
//
// O backend é escolhido uma vez (probe em `task_history`) e cacheado. A API é a mesma
// para os dois modos, então os componentes não mudam.
//
// Convenção de path no Storage: `<obra_id>/<task_id>/<attachment_id>` (a policy usa o 1º
// segmento como obra_id).

import { supabase } from '../../services/supabase';
import { mkId, nowISO, extOf, normAuthor, validateFile, computeDiffEvents } from './taskDetailPure';

/**
 * @typedef {Object} Attachment
 * @property {string} id
 * @property {string} obraId
 * @property {string} taskId
 * @property {string} name
 * @property {string} mime
 * @property {number} size
 * @property {string} storagePath
 * @property {string} uploadedAt  ISO
 * @property {string} authorId
 * @property {string} authorName
 * @property {string} authorEmail
 */

/**
 * @typedef {Object} HistoryEvent
 * @property {string} id
 * @property {string} obraId
 * @property {string} taskId
 * @property {'created'|'status'|'progress'|'schedule'|'dependency'|'attachment_add'|'attachment_remove'|'resource'|'comment'} type
 * @property {string} [field]
 * @property {string|number} [from]
 * @property {string|number} [to]
 * @property {string} [text]
 * @property {string} authorId
 * @property {string} authorName
 * @property {string} authorEmail
 * @property {string} createdAt  ISO
 */

/** @typedef {HistoryEvent} Comment */

const BUCKET = 'task-attachments';
const LS_KEY = (obraId) => `gantt_taskdata_${obraId}`;
const IDB_NAME = 'soter_gantt_anexos';
const IDB_STORE = 'blobs';

// ════════════════════════════════════════════════════════════════════════════
// BACKEND LOCAL (localStorage + IndexedDB)
// ════════════════════════════════════════════════════════════════════════════
function readObra(obraId) {
  try { return JSON.parse(localStorage.getItem(LS_KEY(obraId)) || '{}'); } catch { return {}; }
}
function writeObra(obraId, data) {
  try { localStorage.setItem(LS_KEY(obraId), JSON.stringify(data)); }
  catch (e) { console.error('[taskDetailStore] falha ao gravar metadados', e); }
}
function lsBucket(data, taskId) {
  if (!data[taskId]) data[taskId] = { attachments: [], history: [] };
  if (!data[taskId].attachments) data[taskId].attachments = [];
  if (!data[taskId].history) data[taskId].history = [];
  return data[taskId];
}

let _dbPromise = null;
function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB indisponível')); return; }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}
async function idbPut(key, blob) {
  const db = await openDb();
  return new Promise((res, rej) => { const tx = db.transaction(IDB_STORE, 'readwrite'); tx.objectStore(IDB_STORE).put(blob, key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}
async function idbGet(key) {
  const db = await openDb();
  return new Promise((res, rej) => { const tx = db.transaction(IDB_STORE, 'readonly'); const r = tx.objectStore(IDB_STORE).get(key); r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error); });
}
async function idbDelete(key) {
  const db = await openDb();
  return new Promise((res, rej) => { const tx = db.transaction(IDB_STORE, 'readwrite'); tx.objectStore(IDB_STORE).delete(key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}

function lsPushEvent(obraId, taskId, ev) {
  const data = readObra(obraId);
  const b = lsBucket(data, taskId);
  const full = { id: mkId(), obraId, taskId, createdAt: nowISO(), ...ev };
  b.history.push(full);
  writeObra(obraId, data);
  return full;
}

const local = {
  async listAttachments(obraId, taskId) {
    const b = lsBucket(readObra(obraId), taskId);
    return [...b.attachments].sort((a, z) => (z.uploadedAt || '').localeCompare(a.uploadedAt || ''));
  },
  async addAttachment(obraId, taskId, file, author) {
    validateFile(file);
    const id = mkId();
    await idbPut(id, file.slice(0, file.size, file.type));
    const a = normAuthor(author);
    const record = { id, obraId, taskId, name: file.name, mime: file.type || extOf(file.name), size: file.size, storagePath: `local:${id}`, uploadedAt: nowISO(), ...a };
    const data = readObra(obraId);
    lsBucket(data, taskId).attachments.push(record);
    writeObra(obraId, data);
    lsPushEvent(obraId, taskId, { type: 'attachment_add', text: file.name, ...a });
    return record;
  },
  async renameAttachment(obraId, taskId, id, newName) {
    const data = readObra(obraId);
    const rec = lsBucket(data, taskId).attachments.find(x => x.id === id);
    if (!rec) throw new Error('Anexo não encontrado.');
    const name = (newName || '').trim();
    if (!name) throw new Error('O nome não pode ficar vazio.');
    const oldExt = extOf(rec.name);
    rec.name = extOf(name) === oldExt ? name : `${name}.${oldExt}`;
    writeObra(obraId, data);
    return rec;
  },
  async removeAttachment(obraId, taskId, id, author) {
    const data = readObra(obraId);
    const b = lsBucket(data, taskId);
    const rec = b.attachments.find(x => x.id === id);
    b.attachments = b.attachments.filter(x => x.id !== id);
    writeObra(obraId, data);
    try { await idbDelete(id); } catch { /* ok */ }
    if (rec) lsPushEvent(obraId, taskId, { type: 'attachment_remove', text: rec.name, ...normAuthor(author) });
  },
  async getBlobUrl(att) {
    try { const blob = await idbGet(att.id); return blob ? URL.createObjectURL(blob) : null; } catch { return null; }
  },
  async listHistory(obraId, taskId) {
    const b = lsBucket(readObra(obraId), taskId);
    return [...b.history].sort((a, z) => (z.createdAt || '').localeCompare(a.createdAt || ''));
  },
  async logEvent(obraId, taskId, event) { return lsPushEvent(obraId, taskId, event); },
  async addComment(obraId, taskId, text, author) {
    const t = (text || '').trim();
    if (!t) throw new Error('Comentário vazio.');
    return lsPushEvent(obraId, taskId, { type: 'comment', text: t, ...normAuthor(author) });
  },
  async removeComment(obraId, taskId, id) {
    const data = readObra(obraId);
    const b = lsBucket(data, taskId);
    b.history = b.history.filter(x => !(x.id === id && x.type === 'comment'));
    writeObra(obraId, data);
  },
};

// ════════════════════════════════════════════════════════════════════════════
// BACKEND SUPABASE (tabelas + Storage)
// ════════════════════════════════════════════════════════════════════════════
const rowToAttachment = (r) => ({
  id: r.id, obraId: r.obra_id, taskId: r.task_id, name: r.name, mime: r.mime, size: r.size,
  storagePath: r.storage_path, uploadedAt: r.uploaded_at,
  authorId: r.author_id, authorName: r.author_name, authorEmail: r.author_email,
});
const rowToEvent = (r) => ({
  id: r.id, obraId: r.obra_id, taskId: r.task_id, type: r.type, field: r.field,
  from: r.from_val, to: r.to_val, text: r.body,
  authorId: r.author_id, authorName: r.author_name, authorEmail: r.author_email, createdAt: r.created_at,
});
const eventToRow = (obraId, taskId, ev) => ({
  obra_id: obraId, task_id: taskId, type: ev.type, field: ev.field ?? null,
  from_val: ev.from != null ? String(ev.from) : null,
  to_val: ev.to != null ? String(ev.to) : null,
  body: ev.text ?? null,
  author_id: ev.authorId ?? null, author_name: ev.authorName ?? null, author_email: ev.authorEmail ?? null,
});

const supa = {
  async listAttachments(obraId, taskId) {
    const { data, error } = await supabase.from('task_attachments')
      .select('*').eq('obra_id', obraId).eq('task_id', taskId).order('uploaded_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []).map(rowToAttachment);
  },
  async addAttachment(obraId, taskId, file, author) {
    validateFile(file);
    const id = mkId();
    const path = `${obraId}/${taskId}/${id}`;
    const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (up.error) throw new Error('Falha no upload: ' + up.error.message);
    const a = normAuthor(author);
    const row = {
      id, obra_id: obraId, task_id: taskId, name: file.name, mime: file.type || extOf(file.name),
      size: file.size, storage_path: path, uploaded_at: nowISO(),
      author_id: a.authorId, author_name: a.authorName, author_email: a.authorEmail,
    };
    const ins = await supabase.from('task_attachments').insert(row);
    if (ins.error) {
      try { await supabase.storage.from(BUCKET).remove([path]); } catch { /* ok */ }
      throw new Error('Falha ao salvar anexo: ' + ins.error.message);
    }
    await supa.logEvent(obraId, taskId, { type: 'attachment_add', text: file.name, ...a });
    return rowToAttachment(row);
  },
  async renameAttachment(obraId, taskId, id, newName) {
    const name = (newName || '').trim();
    if (!name) throw new Error('O nome não pode ficar vazio.');
    const cur = await supabase.from('task_attachments').select('name').eq('id', id).single();
    if (cur.error) throw new Error(cur.error.message);
    const oldExt = extOf(cur.data.name);
    const finalName = extOf(name) === oldExt ? name : `${name}.${oldExt}`;
    const { error } = await supabase.from('task_attachments').update({ name: finalName }).eq('id', id);
    if (error) throw new Error(error.message);
    return { id, name: finalName };
  },
  async removeAttachment(obraId, taskId, id, author) {
    const cur = await supabase.from('task_attachments').select('storage_path, name').eq('id', id).single();
    const { error } = await supabase.from('task_attachments').delete().eq('id', id);
    if (error) throw new Error(error.message);
    if (cur.data?.storage_path) { try { await supabase.storage.from(BUCKET).remove([cur.data.storage_path]); } catch { /* ok */ } }
    await supa.logEvent(obraId, taskId, { type: 'attachment_remove', text: cur.data?.name || '', ...normAuthor(author) });
  },
  async getBlobUrl(att) {
    if (!att?.storagePath) return null;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(att.storagePath, 3600);
    return error ? null : data.signedUrl;
  },
  async listHistory(obraId, taskId) {
    const { data, error } = await supabase.from('task_history')
      .select('*').eq('obra_id', obraId).eq('task_id', taskId).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []).map(rowToEvent);
  },
  async logEvent(obraId, taskId, event) {
    const { data, error } = await supabase.from('task_history').insert(eventToRow(obraId, taskId, event)).select().single();
    if (error) throw new Error(error.message);
    return rowToEvent(data);
  },
  async addComment(obraId, taskId, text, author) {
    const t = (text || '').trim();
    if (!t) throw new Error('Comentário vazio.');
    return supa.logEvent(obraId, taskId, { type: 'comment', text: t, ...normAuthor(author) });
  },
  async removeComment(obraId, taskId, id) {
    const { error } = await supabase.from('task_history').delete().eq('id', id).eq('type', 'comment');
    if (error) throw new Error(error.message);
  },
};

// ════════════════════════════════════════════════════════════════════════════
// Seleção de backend (probe único, cacheado)
// ════════════════════════════════════════════════════════════════════════════
let _bePromise = null;
function pickBackend() {
  if (!_bePromise) {
    _bePromise = (async () => {
      try {
        const { error } = await supabase.from('task_history').select('id').limit(1);
        if (error) { console.warn('[taskDetailStore] modo local (Supabase indisponível):', error.message); return local; }
        return supa;
      } catch (e) {
        console.warn('[taskDetailStore] modo local (exceção no probe):', e?.message);
        return local;
      }
    })();
  }
  return _bePromise;
}

// ════════════════════════════════════════════════════════════════════════════
// API pública — delega para o backend escolhido
// ════════════════════════════════════════════════════════════════════════════
export const taskDetailStore = {
  async listAttachments(obraId, taskId) { return (await pickBackend()).listAttachments(obraId, taskId); },
  async addAttachment(obraId, taskId, file, author) { return (await pickBackend()).addAttachment(obraId, taskId, file, author); },
  async renameAttachment(obraId, taskId, id, newName) { return (await pickBackend()).renameAttachment(obraId, taskId, id, newName); },
  async removeAttachment(obraId, taskId, id, author) { return (await pickBackend()).removeAttachment(obraId, taskId, id, author); },
  async getBlobUrl(att) { return (await pickBackend()).getBlobUrl(att); },
  async listHistory(obraId, taskId) { return (await pickBackend()).listHistory(obraId, taskId); },
  async logEvent(obraId, taskId, event) { return (await pickBackend()).logEvent(obraId, taskId, event); },
  async addComment(obraId, taskId, text, author) { return (await pickBackend()).addComment(obraId, taskId, text, author); },
  async removeComment(obraId, taskId, id) { return (await pickBackend()).removeComment(obraId, taskId, id); },

  // Fire-and-forget: registra as mudanças de um commit no backend ativo. Nunca lança.
  async diffAndLog(obraId, prevEtapas, nextEtapas, author) {
    try {
      const evs = computeDiffEvents(prevEtapas, nextEtapas, author);
      if (!evs.length) return;
      const be = await pickBackend();
      for (const { taskId, event } of evs) {
        try { await be.logEvent(obraId, taskId, event); } catch (e) { console.error('[taskDetailStore] logEvent falhou', e); }
      }
    } catch (e) {
      console.error('[taskDetailStore] diffAndLog falhou (ignorado)', e);
    }
  },
};
