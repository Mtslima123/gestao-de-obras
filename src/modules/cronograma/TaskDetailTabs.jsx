import React from 'react';
import { Icon } from '../../components/Icons';
import { Modal, useToast } from '../../components/Modals';
import { formatBytes, formatDateTime, initials, avatarColor } from '../../utils/formatters';
import { taskDetailStore } from './taskDetailStore';

// ── Helpers de arquivo ───────────────────────────────────────────────────────
const extOf = (name = '') => (name.split('.').pop() || '').toLowerCase();
const isImage = (a) => /^image\//.test(a.mime || '') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extOf(a.name));

const fileMeta = (a) => {
  const ext = extOf(a.name);
  if (isImage(a)) return { icon: 'image', color: '#7c3aed', label: ext.toUpperCase() };
  if (ext === 'pdf') return { icon: 'file', color: '#b3241e', label: 'PDF' };
  if (['xlsx', 'xls', 'csv'].includes(ext)) return { icon: 'file', color: '#15803d', label: ext.toUpperCase() };
  return { icon: 'file', color: 'var(--text-muted)', label: (ext || 'arquivo').toUpperCase() };
};

// Data/hora relativa: "Hoje, 14:30" / "Ontem, 09:15" / "01/04/2024, 09:15"
const relDateTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const hm = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(d)) / 86400000);
  if (diffDays === 0) return `Hoje, ${hm}`;
  if (diffDays === 1) return `Ontem, ${hm}`;
  return `${d.toLocaleDateString('pt-BR')}, ${hm}`;
};

// ── Avatar do autor ───────────────────────────────────────────────────────────
const AuthorAvatar = ({ name, system, size = 30 }) => {
  if (system) {
    return (
      <span className="avatar" style={{ width: size, height: size, background: '#334155', flexShrink: 0 }}
        aria-hidden="true">
        <Icon name="cog" size={size * 0.5} />
      </span>
    );
  }
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4, background: avatarColor(name), flexShrink: 0 }}
      aria-hidden="true">
      {initials(name)}
    </span>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// ABA ANEXOS
// ═══════════════════════════════════════════════════════════════════════════
export function AnexosTab({ obraId, taskId, currentUser }) {
  const toast = useToast();
  const fileRef = React.useRef(null);
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [dragging, setDragging] = React.useState(false);
  const [upload, setUpload] = React.useState(null); // { name, pct }
  const [menuId, setMenuId] = React.useState(null);
  const [confirmDel, setConfirmDel] = React.useState(null); // attachment
  const [renameId, setRenameId] = React.useState(null);
  const [renameVal, setRenameVal] = React.useState('');
  const thumbs = React.useRef({}); // id -> objectURL (imagens)

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const list = await taskDetailStore.listAttachments(obraId, taskId);
      setItems(list);
      // miniaturas de imagens
      for (const a of list) {
        if (isImage(a) && !thumbs.current[a.id]) {
          const url = await taskDetailStore.getBlobUrl(a);
          if (url) thumbs.current[a.id] = url;
        }
      }
    } catch (e) {
      toast('Falha ao carregar anexos.', { tone: 'danger', icon: 'alert' });
    } finally {
      setLoading(false);
    }
  }, [obraId, taskId, toast]);

  React.useEffect(() => { load(); }, [load]);
  // Revoga objectURLs ao desmontar
  React.useEffect(() => () => {
    Object.values(thumbs.current).forEach(u => { try { URL.revokeObjectURL(u); } catch {} });
    thumbs.current = {};
  }, []);

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    let ok = 0;
    for (const f of files) {
      setUpload({ name: f.name, pct: 15 });
      try {
        await new Promise(r => setTimeout(r, 60)); // deixa a barra aparecer
        setUpload({ name: f.name, pct: 70 });
        await taskDetailStore.addAttachment(obraId, taskId, f, currentUser);
        setUpload({ name: f.name, pct: 100 });
        ok++;
      } catch (e) {
        toast(e.message || 'Falha no upload.', { tone: 'danger', icon: 'alert' });
      }
    }
    setUpload(null);
    if (ok) toast(ok === 1 ? 'Anexo adicionado.' : `${ok} anexos adicionados.`, { tone: 'success', icon: 'check' });
    await load();
  };

  const openFile = async (a, download) => {
    setMenuId(null);
    const url = await taskDetailStore.getBlobUrl(a);
    if (!url) { toast('Arquivo indisponível.', { tone: 'danger', icon: 'alert' }); return; }
    if (download) {
      const el = document.createElement('a');
      el.href = url; el.download = a.name; document.body.appendChild(el); el.click(); el.remove();
    } else {
      window.open(url, '_blank', 'noopener');
    }
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 60000);
  };

  const startRename = (a) => { setMenuId(null); setRenameId(a.id); setRenameVal(a.name.replace(/\.[^.]+$/, '')); };
  const commitRename = async () => {
    try {
      await taskDetailStore.renameAttachment(obraId, taskId, renameId, renameVal);
      toast('Anexo renomeado.', { tone: 'success', icon: 'check' });
    } catch (e) { toast(e.message || 'Falha ao renomear.', { tone: 'danger', icon: 'alert' }); }
    setRenameId(null); setRenameVal(''); await load();
  };

  const doDelete = async () => {
    const a = confirmDel;
    setConfirmDel(null);
    try {
      if (thumbs.current[a.id]) { try { URL.revokeObjectURL(thumbs.current[a.id]); } catch {} delete thumbs.current[a.id]; }
      await taskDetailStore.removeAttachment(obraId, taskId, a.id, currentUser);
      toast('Anexo excluído.', { tone: 'success', icon: 'check' });
    } catch (e) { toast(e.message || 'Falha ao excluir.', { tone: 'danger', icon: 'alert' }); }
    await load();
  };

  const pick = () => fileRef.current?.click();

  return (
    <div>
      {/* Dropzone */}
      <div
        className={'import-dropzone' + (dragging ? ' over' : '')}
        role="button" tabIndex={0}
        aria-label="Arraste arquivos aqui ou clique para selecionar"
        onClick={pick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
        style={{ padding: '22px 16px' }}
      >
        <Icon name="paperclip" size={26} style={{ color: 'var(--brand)', opacity: 0.8 }} />
        <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--text-muted)' }}>
          Arraste arquivos aqui ou <span style={{ color: 'var(--brand)', fontWeight: 600 }}>selecione</span>
        </div>
        <div style={{ marginTop: 4, fontSize: 10.5, color: 'var(--text-faint)' }}>PDF, JPG, PNG, XLSX, CSV · até 15 MB</div>
      </div>
      <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.xlsx,.csv,image/*"
        style={{ display: 'none' }}
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} />

      {/* Progresso de upload */}
      {upload && (
        <div style={{ marginTop: 12 }} aria-live="polite">
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Enviando {upload.name}…</span>
            <span>{upload.pct}%</span>
          </div>
          <div className="progress"><span style={{ width: upload.pct + '%' }} /></div>
        </div>
      )}

      {/* Lista / estados */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '32px 12px', color: 'var(--text-faint)', fontSize: 12.5 }}>Carregando…</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 12px', color: 'var(--text-faint)' }}>
          <Icon name="paperclip" size={26} style={{ opacity: 0.5 }} />
          <div style={{ marginTop: 8, fontSize: 12.5 }}>Nenhum anexo adicionado a esta tarefa</div>
        </div>
      ) : (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column' }}>
          {items.map((a) => {
            const meta = fileMeta(a);
            const thumb = thumbs.current[a.id];
            return (
              <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
                {/* Miniatura / ícone */}
                {thumb ? (
                  <img src={thumb} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border)' }} />
                ) : (
                  <span style={{ width: 40, height: 40, borderRadius: 6, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'var(--surface-muted)', color: meta.color }}>
                    <Icon name={meta.icon} size={18} />
                  </span>
                )}
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {renameId === a.id ? (
                    <input autoFocus value={renameVal}
                      onChange={(e) => setRenameVal(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setRenameId(null); setRenameVal(''); } }}
                      onBlur={commitRename}
                      aria-label="Renomear anexo"
                      style={{ width: '100%', fontSize: 12.5, padding: '3px 6px', border: '1px solid var(--brand)', borderRadius: 5, outline: 'none' }} />
                  ) : (
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                  )}
                  <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {meta.label} · {formatBytes(a.size)} · {relDateTime(a.uploadedAt)}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 1 }}>{a.authorName}</div>
                </div>
                {/* Menu de ações */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <button className="icon-btn" aria-label="Ações do anexo" aria-haspopup="true"
                    onClick={() => setMenuId(menuId === a.id ? null : a.id)}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)', borderRadius: 6 }}>
                    <Icon name="dots" size={16} />
                  </button>
                  {menuId === a.id && (
                    <>
                      <div onClick={() => setMenuId(null)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                      <div role="menu" style={{
                        position: 'absolute', right: 0, top: '100%', zIndex: 41, minWidth: 160,
                        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
                        boxShadow: 'var(--shadow-md)', padding: 4, marginTop: 2,
                      }}>
                        {[
                          { ic: 'eye', label: 'Visualizar', fn: () => openFile(a, false) },
                          { ic: 'download', label: 'Baixar', fn: () => openFile(a, true) },
                          { ic: 'edit', label: 'Renomear', fn: () => startRename(a) },
                          { ic: 'trash', label: 'Excluir', fn: () => { setMenuId(null); setConfirmDel(a); }, danger: true },
                        ].map(opt => (
                          <button key={opt.label} role="menuitem" onClick={opt.fn}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                              border: 'none', background: 'none', cursor: 'pointer', padding: '7px 8px',
                              fontSize: 12.5, borderRadius: 6, color: opt.danger ? 'var(--danger)' : 'var(--text)',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-muted)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'none'}>
                            <Icon name={opt.ic} size={14} /> {opt.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Botão adicionar */}
      <button className="btn btn-ghost" onClick={pick}
        style={{ width: '100%', justifyContent: 'center', gap: 6, fontSize: 12.5, marginTop: 16 }}>
        <Icon name="paperclip" size={14} /> Adicionar anexo
      </button>

      {/* Confirmação de exclusão */}
      {confirmDel && (
        <Modal
          title="Excluir anexo"
          onClose={() => setConfirmDel(null)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setConfirmDel(null)}>Cancelar</button>
            <button className="btn btn-danger" onClick={doDelete}>Excluir</button>
          </>}
        >
          <p style={{ fontSize: 13.5, color: 'var(--text)' }}>
            Excluir <strong>{confirmDel.name}</strong>? Esta ação não pode ser desfeita.
          </p>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ABA HISTÓRICO
// ═══════════════════════════════════════════════════════════════════════════
const DOT_COLOR = {
  created: '#64748b', status: '#15803d', progress: '#15803d',
  schedule: '#d97706', dependency: '#d97706', resource: '#d97706',
  attachment_add: '#2563eb', attachment_remove: '#b3241e', comment: 'var(--brand)',
};

const describeEvent = (ev) => {
  switch (ev.type) {
    case 'created': return { verb: 'criou a tarefa', highlight: ev.text };
    case 'status': return { verb: ev.from ? `alterou o status de ${ev.from} para` : 'alterou o status para', highlight: ev.to };
    case 'progress': return { verb: `atualizou o progresso físico de ${ev.from}% para`, highlight: `${ev.to}%` };
    case 'schedule': return { verb: 'reprogramou a tarefa (início/término/duração)' };
    case 'dependency': return ev.field === 'remove'
      ? { verb: 'removeu dependência', highlight: ev.text }
      : { verb: 'incluiu dependência', highlight: ev.text };
    case 'attachment_add': return { verb: 'anexou', highlight: ev.text };
    case 'attachment_remove': return { verb: 'removeu o anexo', highlight: ev.text };
    case 'resource': return { verb: `alterou o responsável de ${ev.from} para`, highlight: ev.to };
    case 'comment': return { verb: 'comentou' };
    default: return { verb: 'registrou uma alteração' };
  }
};

export function HistoricoTab({ obraId, taskId, currentUser }) {
  const toast = useToast();
  const [events, setEvents] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState('todos');
  const [text, setText] = React.useState('');
  const [sending, setSending] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try { setEvents(await taskDetailStore.listHistory(obraId, taskId)); }
    catch { toast('Falha ao carregar histórico.', { tone: 'danger', icon: 'alert' }); }
    finally { setLoading(false); }
  }, [obraId, taskId, toast]);

  React.useEffect(() => { load(); }, [load]);

  const shown = events.filter(e =>
    filter === 'todos' ? true : filter === 'comentarios' ? e.type === 'comment' : e.type !== 'comment');

  const send = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      await taskDetailStore.addComment(obraId, taskId, t, currentUser);
      setText('');
      await load();
    } catch (e) { toast(e.message || 'Falha ao comentar.', { tone: 'danger', icon: 'alert' }); }
    finally { setSending(false); }
  };

  const removeComment = async (id) => {
    try { await taskDetailStore.removeComment(obraId, taskId, id); await load(); }
    catch { toast('Falha ao excluir comentário.', { tone: 'danger', icon: 'alert' }); }
  };

  const canDelete = (ev) => ev.authorId === currentUser?.id || currentUser?.isAdmin;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 200 }}>
      {/* Filtros */}
      <div style={{ display: 'inline-flex', background: 'var(--surface-muted)', border: '1px solid var(--border)', borderRadius: 8, padding: 3, gap: 2, alignSelf: 'flex-start', marginBottom: 14 }}>
        {[{ k: 'todos', l: 'Todos' }, { k: 'comentarios', l: 'Comentários' }, { k: 'alteracoes', l: 'Alterações' }].map(f => (
          <button key={f.k} onClick={() => setFilter(f.k)}
            style={{
              fontSize: 12, padding: '4px 11px', border: 'none', borderRadius: 6, cursor: 'pointer',
              fontWeight: filter === f.k ? 600 : 500,
              background: filter === f.k ? 'var(--brand)' : 'transparent',
              color: filter === f.k ? '#fff' : 'var(--text-muted)',
            }}>
            {f.l}
          </button>
        ))}
      </div>

      {/* Timeline / estados */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '28px 12px', color: 'var(--text-faint)', fontSize: 12.5 }}>Carregando…</div>
      ) : shown.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '28px 12px', color: 'var(--text-faint)' }}>
          <Icon name="clock" size={24} style={{ opacity: 0.5 }} />
          <div style={{ marginTop: 8, fontSize: 12.5 }}>
            {filter === 'comentarios' ? 'Nenhum comentário nesta tarefa' : 'Ainda não há movimentações nesta tarefa'}
          </div>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          {shown.map((ev, i) => {
            const isSys = ev.authorId === 'sistema';
            const d = describeEvent(ev);
            const color = DOT_COLOR[ev.type] || 'var(--text-muted)';
            const last = i === shown.length - 1;
            return (
              <div key={ev.id} style={{ display: 'flex', gap: 12, position: 'relative', paddingBottom: last ? 0 : 18 }}>
                {/* Linha + bolinha */}
                <div style={{ position: 'relative', width: 12, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                  <span style={{ width: 11, height: 11, borderRadius: '50%', background: color, marginTop: 3, zIndex: 1, boxShadow: '0 0 0 3px var(--surface)' }} />
                  {!last && <span style={{ position: 'absolute', top: 14, bottom: -4, width: 2, background: 'var(--border)' }} />}
                </div>
                {/* Conteúdo */}
                <div style={{ flex: 1, minWidth: 0, paddingBottom: 2 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 2 }}>{relDateTime(ev.createdAt)}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <AuthorAvatar name={ev.authorName} system={isSys} size={26} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.45 }}>
                        <strong>{ev.authorName}</strong> {d.verb}{' '}
                        {d.highlight && <span style={{ color: 'var(--brand)', fontWeight: 600 }}>{d.highlight}</span>}
                      </div>
                      {ev.type === 'comment' && (
                        <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--text)', background: 'var(--surface-muted)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {ev.text}
                        </div>
                      )}
                      {ev.type === 'comment' && canDelete(ev) && (
                        <button onClick={() => removeComment(ev.id)} aria-label="Excluir comentário"
                          style={{ marginTop: 4, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, padding: 0 }}>
                          <Icon name="trash" size={11} /> Excluir
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Rodapé: novo comentário */}
      <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <label htmlFor="novo-comentario" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Escreva um comentário</label>
        <textarea id="novo-comentario" value={text} rows={1}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Escreva um comentário…"
          style={{ flex: 1, resize: 'none', minHeight: 36, maxHeight: 120, fontSize: 12.5, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', outline: 'none', fontFamily: 'inherit' }} />
        <button onClick={send} disabled={!text.trim() || sending} aria-label="Enviar comentário"
          className="btn btn-primary" style={{ height: 36, padding: '0 12px', flexShrink: 0 }}>
          <Icon name="send" size={15} />
        </button>
      </div>
    </div>
  );
}
