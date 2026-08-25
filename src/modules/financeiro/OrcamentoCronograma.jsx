import React from 'react';
import { Icon } from '../../components/Icons';
import { useToast, Modal } from '../../components/Modals';
import { supabase } from '../../services/supabase';
import { vinculoService, itemValor } from './vinculoService';
import { formatBRL } from '../../utils/formatters';
import { migrateEtapas, computeValorVinculadoMap } from '../cronograma/ganttUtils';
import { invalidateCronCache, _ocCache } from '../cronograma/cronogramaCache';
import { isAdmin } from '../../utils/permissions';

// ─── AutocompleteInput ────────────────────────────────────────────────────────
const AutocompleteInput = ({ value, onChange, placeholder, suggestions, style }) => {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  const filtered = React.useMemo(() => {
    if (!value) return suggestions.slice(0, 8);
    const q = value.toLowerCase();
    return suggestions.filter(s => s.toLowerCase().includes(q)).slice(0, 8);
  }, [value, suggestions]);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', ...style }}>
      <input
        className="input"
        placeholder={placeholder}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        style={{ width: '100%' }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
          maxHeight: 200, overflowY: 'auto', marginTop: 2,
        }}>
          {filtered.map(s => (
            <div
              key={s}
              onMouseDown={(e) => { e.preventDefault(); onChange(s); setOpen(false); }}
              style={{
                padding: '7px 12px', fontSize: 13, cursor: 'pointer',
                borderBottom: '1px solid var(--border-subtle)',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-muted)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── TarefaCronogramaSelect ───────────────────────────────────────────────────
// Combobox com busca para a "Tarefa do Cronograma": abre a lista ao focar e filtra
// conforme digita. Devolve o id da etapa (value/onChange). Desambigua nomes
// repetidos (pavimentos) mostrando o EAP e a tarefa-pai.
const TarefaCronogramaSelect = React.memo(({ etapas, value, onChange, disabled }) => {
  const [query,     setQuery]     = React.useState('');
  const [open,      setOpen]      = React.useState(false);
  const [highlight, setHighlight] = React.useState(0);
  const ref     = React.useRef(null);
  const listRef = React.useRef(null);

  const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const paiNome = React.useCallback(
    (et) => (et?.parentId ? (etapas.find(e => e.id === et.parentId)?.etapa || '') : ''),
    [etapas]
  );
  const etapaSel   = etapas.find(e => e.id === value) || null;
  const labelEtapa = (et) => (et ? `${et.displayId ?? et.id}  ${et.etapa}` : '');

  const filtradas = React.useMemo(() => {
    if (!query) return etapas;
    const q = norm(query);
    return etapas.filter(et =>
      norm(et.etapa).includes(q) || norm(String(et.displayId ?? et.id)).includes(q)
    );
  }, [etapas, query]);

  // Fecha ao clicar fora; limpa o texto digitado (volta a mostrar a seleção)
  React.useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQuery(''); } };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Mantém o item destacado visível ao navegar por teclado
  React.useEffect(() => {
    if (!open || !listRef.current) return;
    listRef.current.children[highlight]?.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  const abrir      = () => { setOpen(true); setHighlight(Math.max(0, filtradas.findIndex(e => e.id === value))); };
  const selecionar = (et) => { onChange(et.id); setQuery(''); setOpen(false); };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown')      { e.preventDefault(); if (!open) return abrir(); setHighlight(h => Math.min(h + 1, filtradas.length - 1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter')     { if (open && filtradas[highlight]) { e.preventDefault(); selecionar(filtradas[highlight]); } }
    else if (e.key === 'Escape')    { setOpen(false); setQuery(''); }
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        className="input"
        placeholder="— Selecione uma tarefa —"
        value={open ? query : labelEtapa(etapaSel)}
        disabled={disabled}
        onChange={e => { setQuery(e.target.value); setOpen(true); setHighlight(0); }}
        onFocus={abrir}
        onKeyDown={onKeyDown}
        style={{ width: '100%' }}
      />
      {open && (
        <div ref={listRef} style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
          maxHeight: 260, overflowY: 'auto', marginTop: 2,
        }}>
          {filtradas.length === 0 && (
            <div style={{ padding: '9px 12px', fontSize: 13, color: 'var(--text-faint)' }}>Nenhuma tarefa encontrada.</div>
          )}
          {filtradas.map((et, i) => {
            const pai = paiNome(et);
            const sel = et.id === value;
            // Tarefa-pai dentro de outra tarefa-pai: tom mais forte pro nível mais alto (raiz da
            // EAP), enfraquecendo a cada nível mais fundo — mesma escala usada no Gantt, na Lista,
            // na Curva Física e na Medição Mensal.
            const groupLvl = et.nivel || 0;
            const groupTint = groupLvl <= 0 ? 'var(--brand-100)' : groupLvl === 1 ? 'var(--brand-50)' : 'var(--brand-tint)';
            return (
              <div
                key={et.id}
                onMouseDown={(e) => { e.preventDefault(); selecionar(et); }}
                onMouseEnter={() => setHighlight(i)}
                style={{
                  padding: '7px 12px', cursor: 'pointer',
                  borderBottom: '1px solid var(--border-subtle)',
                  // Grupo entra depois de selecionado/destacado para não roubar esses estados; a barra
                  // à esquerda é o sinal que sobrevive aos três casos (transparente nas folhas, para alinhar).
                  background: sel ? 'var(--brand-tint)' : i === highlight ? 'var(--surface-muted)' : et.isGroup ? groupTint : 'transparent',
                  borderLeft: et.isGroup ? '3px solid var(--brand)' : '3px solid transparent',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)', minWidth: 34 }}>{et.displayId ?? et.id}</span>
                  <span style={{ paddingLeft: (et.nivel || 0) * 12, fontWeight: et.isGroup ? 700 : 400, color: et.isGroup ? 'var(--brand)' : undefined }}>{et.etapa}</span>
                  {et.isGroup && <span style={{ fontSize: 10, color: 'var(--brand)', background: 'var(--brand-tint)', borderRadius: 4, padding: '0 5px' }}>grupo</span>}
                </div>
                {pai && <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1, paddingLeft: 40 }}>em {pai}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

// ─── DistribuirPesosModal ─────────────────────────────────────────────────────
// Distribui o valor de um grupo entre suas subtarefas-folha ajustando o fator_peso
// de cada uma (entrada por fator peso, igual à Lista). O valor em R$ é recalculado
// via computeValorVinculadoMap, isolado ao valor que este grupo recebe.
const DistribuirPesosModal = ({ etapa, etapas, vinculos, orcamentoItensMap, saving, onSave, onClose }) => {
  // Folhas descendentes do grupo (sem filhos), na ordem do array
  const folhas = React.useMemo(() => {
    const filhosDe = (id) => etapas.filter(e => e.parentId === id);
    const out = [];
    const walk = (id) => filhosDe(id).forEach(c => {
      if (filhosDe(c.id).length === 0) out.push(c); else walk(c.id);
    });
    walk(etapa.id);
    return out;
  }, [etapa, etapas]);

  const [pesos, setPesos] = React.useState(() =>
    Object.fromEntries(folhas.map(f => [f.id, String(f.fator_peso ?? 1)]))
  );
  const setPeso = (id, val) => setPesos(p => ({ ...p, [id]: val }));
  // Refs dos inputs de fator peso — Enter confirma e pula para a próxima subtarefa
  const pesoRefs = React.useRef([]);
  // Unidade base usada para distribuir os pesos deste grupo (registro/documentação)
  const [unidade, setUnidade] = React.useState(etapa.peso_unidade || '');
  const UNIDADES_PESO = ['m²', 'm', 'm³', 'un', 'vb', '%', 'pav'];

  const nomePai = React.useCallback(
    (f) => (f.parentId && f.parentId !== etapa.id ? (etapas.find(e => e.id === f.parentId)?.etapa || '') : ''),
    [etapas, etapa]
  );

  // Valor que o grupo recebe (soma dos itens vinculados diretamente a ele)
  const valorGrupo = React.useMemo(
    () => vinculos.reduce((s, v) => s + (orcamentoItensMap[v.orcamento_item_id] || 0), 0),
    [vinculos, orcamentoItensMap]
  );

  // Com os pesos digitados, quanto cai em cada folha (isolado a este grupo)
  const valorPorFolha = React.useMemo(() => {
    const editadas = etapas.map(e =>
      pesos[e.id] != null ? { ...e, fator_peso: Math.max(0, parseFloat(pesos[e.id]) || 0) } : e
    );
    return computeValorVinculadoMap(editadas, vinculos, orcamentoItensMap);
  }, [pesos, etapas, vinculos, orcamentoItensMap]);

  const totalDistribuido = folhas.reduce((s, f) => s + (valorPorFolha[f.id] || 0), 0);

  return (
    <Modal
      title={`Distribuir pesos — ${etapa.etapa}`}
      subtitle={`Valor do grupo: ${formatBRL(valorGrupo)} · ajuste o fator peso de cada subtarefa`}
      onClose={onClose}
      overlay={false}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => onSave(pesos, unidade)} disabled={saving || folhas.length === 0}>
            {saving ? 'Salvando…' : 'Salvar distribuição'}
          </button>
        </>
      }
    >
      {folhas.length === 0 ? (
        <div style={{ padding: '10px 4px', fontSize: 13, color: 'var(--text-muted)' }}>
          Esta tarefa não tem subtarefas para distribuir.
        </div>
      ) : (
        <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-soft)' }}>Unidade base:</span>
          <select className="input" value={unidade} onChange={e => setUnidade(e.target.value)}
            title="Unidade usada para distribuir os pesos deste grupo (apenas registro)" style={{ width: 130 }}>
            <option value="">— não informada</option>
            {UNIDADES_PESO.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>referência de como os pesos foram distribuídos</span>
        </div>
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', background: 'var(--surface-muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
            <span style={{ flex: 1 }}>Subtarefa</span>
            <span style={{ width: 90, textAlign: 'center' }}>Fator peso</span>
            <span style={{ width: 120, textAlign: 'right' }}>Valor (R$)</span>
          </div>
          {folhas.map((f, idx) => {
            const pai = nomePai(f);
            const concluida = (f.avanco ?? 0) >= 100;
            return (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: '1px solid var(--border-subtle)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, paddingLeft: Math.max(0, (f.nivel || 0) - (etapa.nivel || 0) - 1) * 12 }}>{f.etapa}</div>
                  {pai && <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>em {pai}</div>}
                </div>
                <input
                  ref={el => { pesoRefs.current[idx] = el; }}
                  type="number" min="0" step="any"
                  className="input"
                  value={pesos[f.id] ?? ''}
                  onChange={e => setPeso(f.id, e.target.value)}
                  disabled={concluida}
                  title={concluida ? 'Tarefa concluída — peso e valor travados' : undefined}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const next = pesoRefs.current[idx + 1];
                      if (next) { next.focus(); next.select(); } else e.currentTarget.blur();
                    }
                  }}
                  style={{ width: 90, textAlign: 'right', opacity: concluida ? 0.55 : 1, cursor: concluida ? 'not-allowed' : 'text' }}
                />
                <span className="mono" style={{ width: 120, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
                  {formatBRL(valorPorFolha[f.id] || 0)}
                </span>
              </div>
            );
          })}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: '2px solid var(--border)', fontWeight: 700 }}>
            <span style={{ flex: 1, textAlign: 'right', fontSize: 13 }}>Total</span>
            <span style={{ width: 90 }} />
            <span className="mono" style={{ width: 120, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
              {formatBRL(totalDistribuido)}
            </span>
          </div>
        </div>
        </>
      )}
    </Modal>
  );
};

// ─── ItensOrcamentoSelect ─────────────────────────────────────────────────────
// Multi-select com busca isolado: digitar só re-renderiza este componente, não a tela toda
const ItensOrcamentoSelect = React.memo(({ itens, itensVinculadosIds, resumoIds, selItens, onToggle, onClearSel }) => {
  const [buscaItem, setBuscaItem] = React.useState('');
  const buscaDef = React.useDeferredValue(buscaItem);
  const itensFiltradosBusca = React.useMemo(() => {
    const disponiveis = itens.filter(it => !itensVinculadosIds.has(it.id));
    if (!buscaDef) return disponiveis;
    const q = buscaDef.toLowerCase();
    return disponiveis.filter(it =>
      it.nome?.toLowerCase().includes(q) || it.codigo?.toLowerCase().includes(q)
    );
  }, [itens, buscaDef, itensVinculadosIds]);

  return (
    <>
      <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
        Itens do Orçamento
        {selItens.length > 0 && (
          <span style={{ marginLeft: 6, color: 'var(--brand)', fontWeight: 600 }}>
            ({selItens.length} selecionado{selItens.length > 1 ? 's' : ''})
          </span>
        )}
      </label>
      <input
        className="input"
        placeholder="Buscar item…"
        value={buscaItem}
        onChange={e => setBuscaItem(e.target.value)}
        style={{ width: '100%', marginBottom: 6 }}
      />
      <div style={{
        maxHeight: 220,
        overflowY: 'auto',
        border: '1px solid var(--border)',
        borderRadius: 6,
        background: 'var(--surface)',
      }}>
        {itensFiltradosBusca.length === 0 && (
          <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--text-faint)' }}>
            {!buscaItem && itens.length > 0
              ? 'Todos os itens já foram vinculados.'
              : 'Nenhum item encontrado.'}
          </div>
        )}
        {itensFiltradosBusca.map(it => {
          const val = itemValor(it);
          const sid = String(it.id);
          const checked = selItens.includes(sid);
          const resumo = resumoIds.has(it.id);
          // Nível de aninhamento do item-resumo pela contagem de pontos no código (mesma lógica
          // de getNivel em Orcamentos.jsx) — tom mais forte pro nível mais alto (raiz),
          // enfraquecendo a cada nível mais fundo, mesma escala do Gantt/Lista/Curva Física/
          // Medição Mensal. Antes os itens-resumo não tinham fundo nenhum (só opacity geral).
          const nivel = (it.codigo?.match(/\./g) || []).length;
          const groupTint = nivel <= 0 ? 'var(--brand-100)' : nivel === 1 ? 'var(--brand-50)' : 'var(--brand-tint)';
          return (
            <label
              key={it.id}
              title={resumo ? 'Item-resumo não pode ser vinculado diretamente' : undefined}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '8px 12px',
                cursor: resumo ? 'not-allowed' : 'pointer',
                borderBottom: '1px solid var(--border-subtle)',
                background: checked ? 'var(--brand-tint)' : resumo ? groupTint : 'transparent',
                transition: 'background 0.1s',
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={resumo}
                onChange={() => !resumo && onToggle(it.id)}
                style={{ marginTop: 2, accentColor: 'var(--brand)', flexShrink: 0, opacity: resumo ? 0.5 : 1 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: checked ? 600 : resumo ? 600 : 400, color: resumo ? 'var(--text-muted)' : undefined }}>
                  <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>{it.codigo}</span>
                  {it.nome}
                  {resumo && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-faint)' }}>resumo</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                  {formatBRL(val)}
                </div>
              </div>
            </label>
          );
        })}
      </div>
      {selItens.length > 0 && (
        <button
          className="btn btn-ghost"
          style={{ marginTop: 6, fontSize: 12 }}
          onClick={onClearSel}
        >
          Limpar seleção
        </button>
      )}
    </>
  );
});

// ─── OrcamentoCronogramaScreen ────────────────────────────────────────────────
const OrcamentoCronogramaScreen = ({ obras = [], user, userProfile }) => {
  const toast = useToast();

  const [obraSel,    setObraSel]    = React.useState('');
  const [vinculos,   setVinculos]   = React.useState([]);
  const [itens,      setItens]      = React.useState([]);
  const [etapas,     setEtapas]     = React.useState([]);
  const [loading,    setLoading]    = React.useState(false);
  const [saving,     setSaving]     = React.useState(false);

  const [filtroItem,  setFiltroItem]  = React.useState('');
  const [filtroEtapa, setFiltroEtapa] = React.useState('');

  const [selItens, setSelItens] = React.useState([]);
  const [selEtapa, setSelEtapa] = React.useState('');

  // Estado do modal de edição de vínculos por tarefa
  const [editandoEtapaId,  setEditandoEtapaId]  = React.useState(null);
  const [buscaModalItem,   setBuscaModalItem]    = React.useState('');

  // Confirmação antes de remover vínculo. Na tabela é um modal; dentro do modal de edição
  // é inline na própria linha (modal sobre modal quebra o Escape e o scroll do fundo).
  const [pendingRemove,   setPendingRemove]   = React.useState(null);
  const [confirmRemoveId, setConfirmRemoveId] = React.useState(null);

  // Estado do modal de distribuição de pesos (fator_peso das subtarefas de um grupo)
  const [distribuirEtapaId, setDistribuirEtapaId] = React.useState(null);
  const [salvandoPeso,      setSalvandoPeso]      = React.useState(false);
  // Baseline do bloqueio otimista ao gravar etapas (mesmo padrão de _cronSavedAt em Cronograma.jsx)
  const etapasUpdatedAtRef = React.useRef(null);

  React.useEffect(() => {
    if (!obraSel) {
      setVinculos([]); setItens([]); setEtapas([]);
      return;
    }
    const c = _ocCache[obraSel];
    if (c) { setVinculos(c.vinculos); setItens(c.itens); setEtapas(c.etapas); etapasUpdatedAtRef.current = c.updatedAt ?? null; return; }
    setLoading(true);
    Promise.all([
      vinculoService.listarPorObra(obraSel),
      vinculoService.itensPorObra(obraSel),
      supabase.from('cronogramas').select('etapas, updated_at').eq('obra_id', obraSel).single(),
    ]).then(([vincRes, itensRes, cronRes]) => {
      const v = vincRes.data || [], it = itensRes.data || [], et = migrateEtapas(cronRes.data?.etapas || []);
      const updatedAt = cronRes.data?.updated_at ?? null;
      setVinculos(v); setItens(it); setEtapas(et);
      etapasUpdatedAtRef.current = updatedAt;
      _ocCache[obraSel] = { vinculos: v, itens: it, etapas: et, updatedAt };
      setLoading(false);
    });
  }, [obraSel]);

  const linkedEtapaIds = React.useMemo(
    () => new Set(vinculos.map(v => v.etapa_id)),
    [vinculos]
  );

  // Mapa orcamento_item_id -> valor (alimenta a distribuição de pesos por fator_peso)
  const orcamentoItensMap = React.useMemo(
    () => Object.fromEntries(itens.map(it => [it.id, itemValor(it)])),
    [itens]
  );

  // IDs de itens já vinculados a qualquer tarefa — cada item pode pertencer a uma só tarefa
  const itensVinculadosIds = React.useMemo(
    () => new Set(vinculos.map(v => v.orcamento_item_id)),
    [vinculos]
  );

  const toggleItem = React.useCallback((id) => {
    const sid = String(id);
    setSelItens(prev =>
      prev.includes(sid) ? prev.filter(x => x !== sid) : [...prev, sid]
    );
  }, []);

  const limparSelecao = React.useCallback(() => setSelItens([]), []);

  // IDs dos itens-resumo: qualquer item cujo codigo é prefixo de outro não pode ser vinculado
  const resumoIds = React.useMemo(
    () => new Set(itens.filter(it => itens.some(other => other.codigo?.startsWith(it.codigo + '.'))).map(it => it.id)),
    [itens]
  );

  // ── Adicionar vínculos (tela principal) ───────────────────────────────────
  const handleAdd = async () => {
    if (!selItens.length || !selEtapa) return;
    setSaving(true);
    let criados = 0, erros = 0;

    for (const itemId of selItens) {
      const numId = Number(itemId);
      if (vinculos.some(v => v.orcamento_item_id === numId && v.etapa_id === selEtapa)) continue;
      const { error } = await vinculoService.criar({
        obra_id: obraSel, orcamento_item_id: numId, etapa_id: selEtapa,
      }, user?.id);
      if (error) erros++;
      else criados++;
    }

    if (erros > 0) toast(`${erros} vínculo(s) falharam ao salvar`, { tone: 'danger', icon: 'alert-triangle' });
    if (criados > 0) {
      const { data } = await vinculoService.listarPorObra(obraSel);
      setVinculos(data || []);
      if (_ocCache[obraSel]) _ocCache[obraSel].vinculos = data || [];
      setSelItens([]); setSelEtapa('');
      toast(
        criados === 1 ? 'Vínculo criado com sucesso' : `${criados} vínculos criados`,
        { tone: 'success', icon: 'check' }
      );
    }
    setSaving(false);
  };

  // ── Remover vínculo ────────────────────────────────────────────────────────
  const handleRemove = async (id) => {
    const { error } = await vinculoService.excluir(id);
    if (error) {
      toast('Erro ao remover vínculo: ' + error.message, { tone: 'danger', icon: 'alert-triangle' });
      return;
    }
    setVinculos(v => v.filter(x => x.id !== id));
    if (_ocCache[obraSel]) _ocCache[obraSel].vinculos = _ocCache[obraSel].vinculos.filter(x => x.id !== id);
    toast('Vínculo removido', { tone: 'neutral', icon: 'check' });
  };

  // ── Adicionar vínculo via modal "Editar Itens Associados" ─────────────────
  const handleAddVinculoModal = async (itemId) => {
    if (!editandoEtapaId) return;
    const numId = Number(itemId);
    if (vinculos.some(v => v.orcamento_item_id === numId && v.etapa_id === editandoEtapaId)) return;
    setSaving(true);
    const { error } = await vinculoService.criar({
      obra_id: obraSel, orcamento_item_id: numId, etapa_id: editandoEtapaId,
    }, user?.id);
    if (error) {
      toast('Erro ao criar vínculo: ' + error.message, { tone: 'danger', icon: 'alert-triangle' });
    } else {
      const { data } = await vinculoService.listarPorObra(obraSel);
      setVinculos(data || []);
      if (_ocCache[obraSel]) _ocCache[obraSel].vinculos = data || [];
      toast('Item associado com sucesso', { tone: 'success', icon: 'check' });
    }
    setSaving(false);
  };

  // ── Salvar distribuição de pesos (fator_peso) de volta no cronograma ───────
  const handleSalvarPesos = async (novosPesos, unidade) => {
    setSalvandoPeso(true);
    const novasEtapas = etapas.map(e => {
      let ne = e;
      // Tarefa 100% concluída: peso travado, não deixa a distribuição alterá-lo.
      if (novosPesos[e.id] != null && (e.avanco ?? 0) < 100) ne = { ...ne, fator_peso: Math.max(0, parseFloat(novosPesos[e.id]) || 0) };
      if (e.id === distribuirEtapaId) ne = { ...ne, peso_unidade: unidade || null };
      return ne;
    });
    const nowISO = new Date().toISOString();
    const expected = etapasUpdatedAtRef.current;
    const query = supabase.from('cronogramas').update({ etapas: novasEtapas, updated_at: nowISO }).eq('obra_id', obraSel);
    const { data, error } = await (expected ? query.eq('updated_at', expected) : query).select('updated_at');
    if (error) {
      toast('Erro ao salvar os pesos: ' + error.message, { tone: 'danger', icon: 'alert-triangle' });
      setSalvandoPeso(false);
      return;
    }
    if (expected && (!data || !data.length)) {
      // Outra sessão (ex.: a Lista) salvou o cronograma nesse meio-tempo — não sobrescreve.
      toast('Este cronograma foi alterado em outra tela enquanto você editava. Recarregue e tente de novo.', { tone: 'warning', icon: 'alert-triangle' });
      setSalvandoPeso(false);
      return;
    }
    etapasUpdatedAtRef.current = nowISO;
    setEtapas(novasEtapas);
    if (_ocCache[obraSel]) { _ocCache[obraSel].etapas = novasEtapas; _ocCache[obraSel].updatedAt = nowISO; }
    // Invalida o cache do Cronograma para a Lista reler os pesos novos do banco.
    invalidateCronCache(obraSel);
    setDistribuirEtapaId(null);
    setSalvandoPeso(false);
    toast('Distribuição de pesos salva', { tone: 'success', icon: 'check' });
  };

  // ── Filtros da tabela ──────────────────────────────────────────────────────
  const filtrados = vinculos.filter(v => {
    const itemNome  = (v.orcamento_itens?.nome || '').toLowerCase();
    const etapaNome = (etapas.find(e => e.id === v.etapa_id)?.etapa || '').toLowerCase();
    return (
      (!filtroItem  || itemNome.includes(filtroItem.toLowerCase()))  &&
      (!filtroEtapa || etapaNome.includes(filtroEtapa.toLowerCase()))
    );
  });

  const totalVinculado = filtrados.reduce((s, v) => s + itemValor(v.orcamento_itens), 0);

  // Etapas disponíveis: exclui apenas as já vinculadas (todas aparecem, incluindo resumos)
  const etapasDisponiveis = etapas.filter(et => !linkedEtapaIds.has(et.id));

  // Sugestões para autocomplete dos filtros
  const sugestoesItem = React.useMemo(
    () => [...new Set(vinculos.map(v => v.orcamento_itens?.nome).filter(Boolean))].sort(),
    [vinculos]
  );
  const sugestoesEtapa = React.useMemo(
    () => [...new Set(vinculos.map(v => etapas.find(e => e.id === v.etapa_id)?.etapa).filter(Boolean))].sort(),
    [vinculos, etapas]
  );

  // ── Dados do modal de edição ───────────────────────────────────────────────
  const editandoEtapa     = etapas.find(e => e.id === editandoEtapaId);
  const vinculosEtapa     = vinculos.filter(v => v.etapa_id === editandoEtapaId);
  const itensNaoVinculados = itens.filter(it => {
    if (itensVinculadosIds.has(it.id)) return false; // já vinculado a alguma tarefa
    if (!buscaModalItem) return true;
    const q = buscaModalItem.toLowerCase();
    return it.nome?.toLowerCase().includes(q) || it.codigo?.toLowerCase().includes(q);
  });

  const fecharModal = () => { setEditandoEtapaId(null); setBuscaModalItem(''); setConfirmRemoveId(null); };

  // ── Dados do modal de distribuição de pesos ────────────────────────────────
  const distribuirEtapa    = etapas.find(e => e.id === distribuirEtapaId) || null;
  const vinculosDistribuir = vinculos.filter(v => v.etapa_id === distribuirEtapaId);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Orçamento × Cronograma</h1>
          <div className="page-subtitle">
            Vincule itens do orçamento às tarefas do cronograma para calcular pesos físicos automaticamente
          </div>
        </div>
        <div className="page-actions">
          <select
            className="input"
            value={obraSel}
            onChange={e => setObraSel(e.target.value)}
            style={{ minWidth: 240 }}
          >
            <option value="">Selecione uma obra…</option>
            {obras.map(o => (
              <option key={o.id} value={o.id}>{o.nome}</option>
            ))}
          </select>
        </div>
      </div>

      {!obraSel && (
        <div className="card" style={{ marginTop: 'var(--gap)', padding: '72px 24px', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--brand-tint)', color: 'var(--brand)', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
            <Icon name="link" size={28} />
          </div>
          <h2 style={{ margin: '0 0 6px', fontSize: 18 }}>Nenhuma obra selecionada</h2>
          <div className="text-muted" style={{ maxWidth: 400, margin: '0 auto', fontSize: 13.5 }}>
            Selecione uma obra para gerenciar os vínculos entre orçamento e cronograma.
          </div>
        </div>
      )}

      {obraSel && loading && (
        <div style={{ padding: 64, textAlign: 'center' }} className="text-muted">Carregando…</div>
      )}

      {obraSel && !loading && (
        <>
          {/* ── Adicionar novo vínculo ──────────────────────────────────────── */}
          {/* overflow visível: o dropdown "Tarefa do Cronograma" (position:absolute) não pode
              ser recortado pela borda do card (.card tem overflow:hidden por padrão) */}
          <div className="card" style={{ marginTop: 'var(--gap)', overflow: 'visible' }}>
            <div className="card-header">
              <div>
                <div className="card-title">Adicionar vínculo</div>
                <div className="card-subtitle">
                  Selecione um ou mais itens do orçamento e a tarefa do cronograma que receberá os pesos
                </div>
              </div>
            </div>
            <div className="card-body">
              {itens.length === 0 && (
                <div className="text-muted" style={{ fontSize: 13, marginBottom: 12 }}>
                  Nenhum item de orçamento encontrado para esta obra. Crie um orçamento primeiro.
                </div>
              )}
              {etapasDisponiveis.length === 0 && etapas.length === 0 && (
                <div className="text-muted" style={{ fontSize: 13, marginBottom: 12 }}>
                  Nenhuma tarefa de cronograma encontrada para esta obra. Crie um cronograma primeiro.
                </div>
              )}
              {etapasDisponiveis.length === 0 && etapas.length > 0 && (
                <div className="text-muted" style={{ fontSize: 13, marginBottom: 12, padding: '8px 12px', background: 'var(--surface-muted)', borderRadius: 6 }}>
                  Todas as tarefas executáveis já foram vinculadas.
                </div>
              )}

              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                {/* Multi-select de itens de orçamento (busca isolada — ver ItensOrcamentoSelect) */}
                <div style={{ flex: '1 1 300px', minWidth: 240 }}>
                  <ItensOrcamentoSelect
                    itens={itens}
                    itensVinculadosIds={itensVinculadosIds}
                    resumoIds={resumoIds}
                    selItens={selItens}
                    onToggle={toggleItem}
                    onClearSel={limparSelecao}
                  />
                </div>

                {/* Select de tarefa do cronograma */}
                <div style={{ flex: '1 1 280px', minWidth: 200 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    Tarefa do Cronograma
                    <span style={{ marginLeft: 6, color: 'var(--text-faint)', fontWeight: 400, fontSize: 11 }}>
                      somente tarefas executáveis
                    </span>
                  </label>
                  <TarefaCronogramaSelect
                    etapas={etapasDisponiveis}
                    value={selEtapa}
                    onChange={setSelEtapa}
                    disabled={etapasDisponiveis.length === 0}
                  />

                  {selItens.length > 0 && selEtapa && (() => {
                    const etapa = etapas.find(e => e.id === selEtapa);
                    const totalSel = selItens.reduce((s, sid) => {
                      const it = itens.find(i => String(i.id) === sid);
                      return s + (it ? itemValor(it) : 0);
                    }, 0);
                    return (
                      <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--brand-tint)', borderRadius: 8, fontSize: 13, color: 'var(--brand)' }}>
                        <strong>{selItens.length} {selItens.length > 1 ? 'itens' : 'item'}</strong>
                        <span style={{ margin: '0 8px', opacity: 0.6 }}>→</span>
                        <strong>{etapa?.etapa}</strong>
                        <div style={{ marginTop: 4, opacity: 0.8 }}>
                          Total: {formatBRL(totalSel)}
                        </div>
                      </div>
                    );
                  })()}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                    <button
                      className="btn btn-primary"
                      onClick={handleAdd}
                      disabled={!selItens.length || !selEtapa || saving}
                    >
                      <Icon name="plus" size={15} />
                      {saving
                        ? 'Salvando…'
                        : selItens.length > 0
                          ? `Adicionar (${selItens.length} ${selItens.length > 1 ? 'itens' : 'item'})`
                          : 'Adicionar'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Vínculos cadastrados + Resumo lado a lado ─────────────────────── */}
          <div style={{ display: 'flex', gap: 'var(--gap)', alignItems: 'stretch', flexWrap: 'wrap', marginTop: 'var(--gap)' }}>
          <div style={{ flex: '2 1 480px', minWidth: 0 }}>
          <div className="card">
            <div className="card-header" style={{ overflow: 'visible', height: 88, gap: 12 }}>
              <div style={{ minWidth: 0, overflow: 'hidden' }}>
                <div className="card-title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  Vínculos cadastrados
                  <span style={{ marginLeft: 8, background: 'var(--surface-muted)', borderRadius: 12, padding: '2px 8px', fontSize: 12, fontWeight: 400 }}>
                    {filtrados.length}
                  </span>
                  {vinculos.length > 0 && (
                    <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--success)', fontWeight: 400 }}>
                      · Pesos automáticos ativos
                    </span>
                  )}
                </div>
                {filtrados.length > 0 && (
                  <div className="card-subtitle" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Total vinculado: <strong>{formatBRL(totalVinculado)}</strong>
                  </div>
                )}
              </div>
              <div className="card-actions" style={{ overflow: 'visible', flexShrink: 0 }}>
                <AutocompleteInput
                  value={filtroItem}
                  onChange={setFiltroItem}
                  placeholder="Filtrar por item…"
                  suggestions={sugestoesItem}
                  style={{ width: 150 }}
                />
                <AutocompleteInput
                  value={filtroEtapa}
                  onChange={setFiltroEtapa}
                  placeholder="Filtrar por tarefa…"
                  suggestions={sugestoesEtapa}
                  style={{ width: 150 }}
                />
                {/* Só aparece com filtro ativo (não reserva espaço) — deixa os campos à direita e libera o título */}
                {(filtroItem || filtroEtapa) && (
                  <button className="btn btn-ghost" onClick={() => { setFiltroItem(''); setFiltroEtapa(''); }}>
                    <Icon name="x" size={14} />Limpar
                  </button>
                )}
              </div>
            </div>

            {/* Corpo com altura fixa e scroll interno */}
            <div style={{ overflowX: 'auto' }}>
              <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 90, position: 'sticky', top: 0, background: 'var(--brand)', color: '#fff', borderBottom: '2px solid var(--brand-700)', zIndex: 2 }}>Código</th>
                      <th style={{ whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--brand)', color: '#fff', borderBottom: '2px solid var(--brand-700)', zIndex: 2 }}>Item do Orçamento</th>
                      <th style={{ whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--brand)', color: '#fff', borderBottom: '2px solid var(--brand-700)', zIndex: 2 }}>Tarefa do Cronograma</th>
                      <th style={{ width: 60, textAlign: 'center', position: 'sticky', top: 0, background: 'var(--brand)', color: '#fff', borderBottom: '2px solid var(--brand-700)', zIndex: 2 }}>Nível</th>
                      <th style={{ textAlign: 'right', width: 140, position: 'sticky', top: 0, background: 'var(--brand)', color: '#fff', borderBottom: '2px solid var(--brand-700)', zIndex: 2 }}>Valor (R$)</th>
                      <th style={{ width: 48, position: 'sticky', top: 0, background: 'var(--brand)', color: '#fff', borderBottom: '2px solid var(--brand-700)', zIndex: 2 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '32px 24px', color: 'var(--text-faint)' }}>
                          {vinculos.length === 0
                            ? 'Nenhum vínculo cadastrado. Adicione o primeiro acima.'
                            : 'Nenhum resultado para os filtros aplicados.'}
                        </td>
                      </tr>
                    )}
                    {filtrados.map(v => {
                      const etapa = etapas.find(e => e.id === v.etapa_id);
                      return (
                        <tr key={v.id}>
                          <td className="mono text-sm" style={{ color: 'var(--text-muted)' }}>
                            {v.orcamento_itens?.codigo || '—'}
                          </td>
                          <td>{v.orcamento_itens?.nome || <span className="text-faint">Item removido</span>}</td>
                          <td>
                            {etapa ? (
                              <span>
                                {' '.repeat((etapa.nivel || 0) * 2)}
                                {etapa.isGroup && <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>▸</span>}
                                {etapa.etapa}
                              </span>
                            ) : (
                              <span className="text-faint">Tarefa removida ({v.etapa_id})</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
                            {etapa ? (etapa.isGroup ? 'Grupo' : `N${etapa.nivel || 0}`) : '—'}
                          </td>
                          <td className="mono" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {formatBRL(itemValor(v.orcamento_itens))}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {isAdmin(userProfile) && (
                              <button
                                className="icon-btn"
                                title="Remover vínculo"
                                onClick={() => setPendingRemove(v)}
                                style={{ color: 'var(--danger)' }}
                              >
                                <Icon name="trash" size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  {filtrados.length > 0 && (
                    <tfoot>
                      <tr style={{ fontWeight: 600 }}>
                        <td colSpan={4} style={{ textAlign: 'right', fontSize: 13 }}>Total vinculado</td>
                        <td className="mono" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {formatBRL(totalVinculado)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>

          </div>{/* fim coluna Vínculos */}

          {/* ── Resumo por tarefa ─────────────────────────────────────────────── */}
          {/* Sempre visível (mesmo sem vínculo ainda), igual ao card "Vínculos
              cadastrados" ao lado — antes só aparecia depois do primeiro vínculo. */}
          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <ResumoVinculos
              vinculos={vinculos}
              etapas={etapas}
              onEditarVinculos={setEditandoEtapaId}
              onDistribuir={setDistribuirEtapaId}
            />
          </div>
          </div>{/* fim container 2 colunas */}
        </>
      )}

      {/* ── Modal: Editar Itens Associados ─────────────────────────────────── */}
      {editandoEtapaId && editandoEtapa && (
        <Modal
          title={`Editar Itens Associados — ${editandoEtapa.etapa}`}
          onClose={fecharModal}
          draggable
          overlay={false}
          footer={
            <button className="btn btn-ghost" onClick={fecharModal}>Fechar</button>
          }
        >
          {/* Itens atualmente vinculados */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Itens vinculados ({vinculosEtapa.length})
            </div>
            {vinculosEtapa.length === 0 ? (
              <div style={{ color: 'var(--text-faint)', fontSize: 13, padding: '8px 0' }}>
                Nenhum item associado a esta tarefa.
              </div>
            ) : (
              <div style={{ border: '1px solid var(--border)', borderRadius: 6, maxHeight: 160, overflowY: 'auto' }}>
                {vinculosEtapa.map(v => (
                  <div key={v.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)',
                  }}>
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)', flexShrink: 0, minWidth: 64, fontFamily: 'var(--font-mono)' }}>
                      {v.orcamento_itens?.codigo || '—'}
                    </span>
                    <span style={{ flex: 1, fontSize: 13 }}>
                      {v.orcamento_itens?.nome || <span style={{ color: 'var(--text-faint)' }}>Item removido</span>}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-soft)', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
                      {formatBRL(itemValor(v.orcamento_itens))}
                    </span>
                    {confirmRemoveId === v.id ? (
                      <>
                        <button
                          className="btn btn-danger"
                          style={{ fontSize: 11.5, padding: '2px 10px', height: 26, flexShrink: 0 }}
                          onClick={() => { setConfirmRemoveId(null); handleRemove(v.id); }}
                        >
                          Confirmar
                        </button>
                        <button
                          className="btn btn-ghost"
                          title="Cancelar"
                          style={{ fontSize: 14, padding: 0, width: 26, height: 26, flexShrink: 0, lineHeight: 1 }}
                          onClick={() => setConfirmRemoveId(null)}
                        >
                          ×
                        </button>
                      </>
                    ) : isAdmin(userProfile) ? (
                      <button
                        className="icon-btn"
                        title="Remover vínculo"
                        onClick={() => setConfirmRemoveId(v.id)}
                        style={{ color: 'var(--danger)', flexShrink: 0 }}
                      >
                        <Icon name="trash" size={13} />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Adicionar novos itens */}
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Adicionar itens
            </div>
            <input
              className="input"
              placeholder="Buscar item do orçamento…"
              value={buscaModalItem}
              onChange={e => setBuscaModalItem(e.target.value)}
              style={{ width: '100%', marginBottom: 8 }}
            />
            <div style={{ border: '1px solid var(--border)', borderRadius: 6, maxHeight: 160, overflowY: 'auto' }}>
              {itensNaoVinculados.length === 0 ? (
                <div style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-faint)', textAlign: 'center' }}>
                  {buscaModalItem ? 'Nenhum item encontrado para essa busca.' : 'Todos os itens já foram vinculados.'}
                </div>
              ) : (
                itensNaoVinculados.map(it => {
                  const resumo = resumoIds.has(it.id);
                  return (
                    <div key={it.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)',
                      opacity: resumo ? 0.45 : 1,
                    }}>
                      <span style={{ fontSize: 11.5, color: 'var(--text-muted)', flexShrink: 0, minWidth: 64, fontFamily: 'var(--font-mono)' }}>
                        {it.codigo}
                      </span>
                      <span style={{ flex: 1, fontSize: 13 }}>
                        {it.nome}
                        {resumo && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-faint)' }}>resumo</span>}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--text-soft)', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
                        {formatBRL(itemValor(it))}
                      </span>
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: 11.5, padding: '2px 10px', height: 26, flexShrink: 0, gap: 4 }}
                        onClick={() => handleAddVinculoModal(it.id)}
                        disabled={saving || resumo}
                        title={resumo ? 'Item-resumo não pode ser vinculado diretamente' : undefined}
                      >
                        <Icon name="plus" size={12} />Vincular
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* ── Confirmação: remover vínculo (lixeira da tabela) ────────────────── */}
      {pendingRemove && (
        <Modal
          title="Remover vínculo"
          size="sm"
          onClose={() => setPendingRemove(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setPendingRemove(null)}>Cancelar</button>
              <button
                className="btn btn-danger"
                onClick={() => { const alvo = pendingRemove; setPendingRemove(null); handleRemove(alvo.id); }}
              >
                Remover
              </button>
            </>
          }
        >
          <p style={{ fontSize: 14, marginBottom: 4 }}>
            Remover o vínculo do item{' '}
            <strong>{pendingRemove.orcamento_itens?.codigo || '—'} {pendingRemove.orcamento_itens?.nome || ''}</strong>?
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
            O item do orçamento e a tarefa não são apagados — só a associação entre eles, e os pesos físicos
            passam a ser recalculados sem esse valor.
          </p>
        </Modal>
      )}

      {/* ── Modal: Distribuir pesos das subtarefas ─────────────────────────── */}
      {distribuirEtapa && (
        <DistribuirPesosModal
          etapa={distribuirEtapa}
          etapas={etapas}
          vinculos={vinculosDistribuir}
          orcamentoItensMap={orcamentoItensMap}
          saving={salvandoPeso}
          onSave={handleSalvarPesos}
          onClose={() => setDistribuirEtapaId(null)}
        />
      )}
    </>
  );
};

// ─── ResumoVinculos ───────────────────────────────────────────────────────────
const ResumoVinculos = React.memo(({ vinculos, etapas, onEditarVinculos, onDistribuir }) => {
  const [filtroResumo, setFiltroResumo] = React.useState('');
  const porEtapa = {};
  vinculos.forEach(v => {
    if (!porEtapa[v.etapa_id]) porEtapa[v.etapa_id] = { itens: [], total: 0 };
    porEtapa[v.etapa_id].itens.push(v);
    porEtapa[v.etapa_id].total += itemValor(v.orcamento_itens);
  });

  const etapasComVinculo = etapas.filter(e => porEtapa[e.id]);
  const q = filtroResumo.trim().toLowerCase();
  const etapasFiltradas = q ? etapasComVinculo.filter(e => (e.etapa || '').toLowerCase().includes(q)) : etapasComVinculo;

  return (
    <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="card-header" style={{ height: 88, overflow: 'visible', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className="card-title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Resumo por tarefa</div>
          <div className="card-subtitle" style={{ lineHeight: 1.3 }}>Valor total recebido do orçamento por tarefa vinculada</div>
        </div>
        <div className="card-actions" style={{ flexShrink: 0 }}>
          <input className="input" placeholder="Filtrar por tarefa…" value={filtroResumo}
            onChange={e => setFiltroResumo(e.target.value)} style={{ width: 150 }} />
          {filtroResumo && (
            <button className="btn btn-ghost" onClick={() => setFiltroResumo('')}>
              <Icon name="x" size={14} />Limpar
            </button>
          )}
        </div>
      </div>
      <div className="card-body" style={{ padding: 0, flex: 1, overflow: 'hidden' }}>
        <div style={{ maxHeight: 380, overflow: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ position: 'sticky', top: 0, background: 'var(--brand)', color: '#fff', borderBottom: '2px solid var(--brand-700)', zIndex: 2 }}>Tarefa</th>
              <th style={{ textAlign: 'center', width: 70, position: 'sticky', top: 0, background: 'var(--brand)', color: '#fff', borderBottom: '2px solid var(--brand-700)', zIndex: 2 }}>Itens</th>
              <th style={{ textAlign: 'right', width: 150, position: 'sticky', top: 0, background: 'var(--brand)', color: '#fff', borderBottom: '2px solid var(--brand-700)', zIndex: 2 }}>Valor Vinculado</th>
              <th style={{ width: 96, position: 'sticky', top: 0, background: 'var(--brand)', color: '#fff', borderBottom: '2px solid var(--brand-700)', zIndex: 2 }}></th>
            </tr>
          </thead>
          <tbody>
            {etapasFiltradas.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-faint)' }}>
                {etapasComVinculo.length === 0 ? 'Nenhum vínculo cadastrado ainda.' : 'Nenhuma tarefa para o filtro.'}
              </td></tr>
            )}
            {etapasFiltradas.map(e => (
              <tr key={e.id}>
                <td>
                  {' '.repeat((e.nivel || 0) * 2)}
                  {e.isGroup && <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>▸</span>}
                  {e.etapa}
                </td>
                <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
                  {porEtapa[e.id].itens.length}
                </td>
                <td className="mono" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                  {formatBRL(porEtapa[e.id].total)}
                </td>
                <td style={{ paddingRight: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 2 }}>
                    {e.isGroup && (
                      <button
                        className="icon-btn"
                        title="Distribuir pesos das subtarefas"
                        onClick={() => onDistribuir(e.id)}
                        style={{ color: 'var(--brand)' }}
                      >
                        <Icon name="chart" size={14} />
                      </button>
                    )}
                    <button
                      className="icon-btn"
                      title="Editar Itens Associados"
                      onClick={() => onEditarVinculos(e.id)}
                    >
                      <Icon name="edit" size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
});

export { OrcamentoCronogramaScreen };
