import React from 'react';
import { Icon } from '../../../components/Icons';
import { T, btn, btnPrim, pill } from './tokens';
import { GRUPOS } from './efetivoStore';
import { efetivoService } from './efetivo.service';
import { ehConflito } from './efetivoErro';

// Modal "Grupos e classificações", aberto da aba Previsto em edição. Só admin chega aqui (o
// banco também recusa os demais). Cada mudança vai direto ao banco; as funções são globais
// (valem para todas as obras).
export function GruposModal({ s, setS, toast, erro, recarregar, onClose }) {
  const [nova, setNova] = React.useState('');
  const [excluir, setExcluir] = React.useState(null);
  const [ocupado, setOcupado] = React.useState(false);

  React.useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const funcoes = s.funcoes.filter((f) => f.ativo).slice()
    .sort((a, b) => GRUPOS.findIndex((g) => g.id === a.grupoId) - GRUPOS.findIndex((g) => g.id === b.grupoId));
  const sel = { font: 'inherit', fontSize: 13, padding: '6px 8px', border: `1px solid ${T.bordaInput}`, borderRadius: 7, background: 'var(--surface)', color: T.texto, flexShrink: 0 };

  // Roda uma chamada ao banco; em falha mostra a mensagem (e recarrega se a tela estava defasada).
  const rodar = async (chamada, aoOk) => {
    if (ocupado) return;
    setOcupado(true);
    try {
      const { data, error } = await chamada();
      if (error) { erro(error.mensagem || error.message); if (ehConflito(error)) recarregar(); return; }
      aoOk(data);
    } finally {
      setOcupado(false);
    }
  };

  const add = () => {
    const n = nova.trim();
    if (!n) return;
    if (s.classificacoes.some((c) => c.toLowerCase() === n.toLowerCase())) return erro('Já existe uma classificação com esse nome.');
    rodar(() => efetivoService.criarClassificacao(n), () => { setS((st) => ({ ...st, classificacoes: [...st.classificacoes, n].sort((a, b) => a.localeCompare(b, 'pt-BR')) })); setNova(''); });
  };
  const remover = (c) => rodar(() => efetivoService.removerClassificacao(c), () =>
    setS((st) => ({ ...st, classificacoes: st.classificacoes.filter((x) => x !== c), funcoes: st.funcoes.map((f) => (f.classificacao === c ? { ...f, classificacao: null } : f)) })));
  const setGrupo = (id, grupoId) => rodar(() => efetivoService.alterarFuncao(id, { grupoId }), () =>
    setS((st) => ({ ...st, funcoes: st.funcoes.map((f) => (f.id === id ? { ...f, grupoId } : f)) })));
  const setCls = (id, v) => { const classificacao = v || null; rodar(() => efetivoService.alterarFuncao(id, { classificacao }), () =>
    setS((st) => ({ ...st, funcoes: st.funcoes.map((f) => (f.id === id ? { ...f, classificacao } : f)) }))); };
  const doExcluir = (id) => {
    const nome = s.funcoes.find((f) => f.id === id)?.nome;
    rodar(() => efetivoService.excluirFuncao(id), () => {
      setS((st) => ({ ...st, funcoes: st.funcoes.map((f) => (f.id === id ? { ...f, ativo: false } : f)), previsto: st.previsto.filter((p) => p.funcaoId !== id) }));
      setExcluir(null);
      toast(`Função "${nome}" excluída.`);
    });
  };
  const temApropriacao = (id) => s.apropriacoes.some((a) => a.itens.some((i) => i.funcaoId === id && ((i.totalEfetivo ?? 0) + (i.recebidoOutraObra ?? 0)) > 0));

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,27,45,.45)', zIndex: 150, /* abaixo do toast (200), para a mensagem de erro aparecer por cima */ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div role="dialog" aria-label="Grupos e classificações" onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface)', color: T.texto, borderRadius: 16, boxShadow: '0 20px 50px rgba(15,27,45,.3)', width: '100%', maxWidth: 780, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${T.borda}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Grupos e classificações</h2>
              <p style={{ margin: '3px 0 0', fontSize: 13, color: T.texto2, textWrap: 'pretty' }}>Grupo define onde a função aparece (Administrativo, Apoio…). Funções na mesma classificação são somadas e comparadas juntas com o previsto (ex.: Carpinteiro + 1/2 Of. Carpinteiro). Sem classificação, a função é a sua própria classificação.</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Fechar" style={{ font: 'inherit', fontSize: 20, border: 0, background: 'none', color: T.texto2, cursor: 'pointer' }}>×</button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={nova} onChange={(e) => setNova(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Nova classificação (ex.: Pintura)" style={{ font: 'inherit', fontSize: 13, padding: '8px 10px', border: `1px solid ${T.bordaInput}`, borderRadius: 8, flex: 1, background: 'var(--surface)', color: T.texto }} />
            <button type="button" style={btnPrim} disabled={ocupado} onClick={add}>Adicionar</button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {s.classificacoes.map((c) => (
              <span key={c} style={{ ...pill(T.azul, T.azulClaro), padding: '4px 6px 4px 10px', fontSize: 12.5 }}>{c}
                <span style={{ color: T.texto2, fontWeight: 400 }}>{s.funcoes.filter((f) => f.ativo && f.classificacao === c).length}</span>
                <button type="button" onClick={() => remover(c)} aria-label={`Remover ${c}`} style={{ border: 0, background: 'none', color: T.texto2, cursor: 'pointer', fontSize: 14 }}>×</button>
              </span>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, padding: '8px 24px', fontSize: 11.5, fontWeight: 600, color: T.texto2, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: `1px solid ${T.borda}` }}>
          <span style={{ flex: 1 }}>Função</span><span style={{ width: 210 }}>Grupo</span><span style={{ width: 200 }}>Classificação</span><span style={{ width: 34 }} />
        </div>
        <div style={{ overflowY: 'auto', padding: '4px 24px 8px' }}>
          {funcoes.map((f, k) => (
            <div key={f.id}>
              {(k === 0 || funcoes[k - 1].grupoId !== f.grupoId) && <div style={{ fontSize: 11.5, fontWeight: 600, color: T.azul, textTransform: 'uppercase', letterSpacing: '.05em', padding: '14px 0 6px' }}>{GRUPOS.find((g) => g.id === f.grupoId)?.nome}</div>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0', borderTop: `1px solid ${T.linha}`, fontSize: 13.5 }}>
                <span style={{ flex: 1, minWidth: 0 }}>{f.nome}</span>
                <select value={f.grupoId} disabled={ocupado} onChange={(e) => setGrupo(f.id, e.target.value)} style={{ ...sel, width: 210 }}>{GRUPOS.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}</select>
                <select value={f.classificacao ?? ''} disabled={ocupado} onChange={(e) => setCls(f.id, e.target.value)} style={{ ...sel, width: 200 }}>
                  <option value="">Própria função</option>
                  {s.classificacoes.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <button type="button" onClick={() => setExcluir(f.id)} aria-label="Excluir função" title="Excluir função" style={{ width: 34, height: 32, flexShrink: 0, border: '1px solid var(--danger-bg)', background: 'var(--surface)', color: T.vermelho, borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="trash" size={15} stroke={2} /></button>
              </div>
              {excluir === f.id && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', marginBottom: 6, background: T.vermelhoBg, borderRadius: 8, fontSize: 13, color: T.vermelho }}>
                  {/* O handoff dizia que as apropriações seriam removidas; aqui a exclusão é soft delete
                      (ativo = false) e o histórico lançado fica guardado. */}
                  <span style={{ flex: 1, minWidth: 200 }}>Excluir "{f.nome}"? Ela some do previsto e das telas de todas as obras.{temApropriacao(f.id) ? ' O que já foi apropriado nela fica guardado no histórico.' : ''}</span>
                  <button type="button" style={{ ...btn, padding: '6px 12px', fontSize: 12.5 }} onClick={() => setExcluir(null)}>Cancelar</button>
                  <button type="button" style={{ ...btnPrim, background: T.vermelho, padding: '7px 12px', fontSize: 12.5 }} disabled={ocupado} onClick={() => doExcluir(f.id)}>Excluir</button>
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ padding: '14px 24px', borderTop: `1px solid ${T.borda}`, display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" style={btnPrim} onClick={onClose}>Concluir</button>
        </div>
      </div>
    </div>
  );
}
