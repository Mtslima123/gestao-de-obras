// Modais do Cronograma — componentes de UI extraídos de Cronograma.jsx (movimento
// verbatim). Cada um recebe seus callbacks do componente pai via props.

import React from "react";
import { Modal, useToast } from "../../components/Modals";
import { Icon } from "../../components/Icons";
import { isoToBR } from "./cronogramaDateUtils";
import { nextEtapaId, nextDisplayId, emptyCustomCols } from "./scheduleEngine";

// ─── AddColModal ──────────────────────────────────────────────────────────────
export const AddColModal = ({ onClose, onAdd }) => {
  const [label,   setLabel]   = React.useState('');
  const [type,    setType]    = React.useState('text');
  const [options, setOptions] = React.useState('');

  const doAdd = () => {
    if (!label.trim()) return;
    const col = { id: 'cc_' + Date.now().toString(36), label: label.trim(), type };
    if (type === 'list' && options.trim()) col.options = options.split(',').map(o => o.trim()).filter(Boolean);
    onAdd(col);
    onClose();
  };

  return (
    <Modal
      title="Nova coluna personalizada"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!label.trim()} onClick={doAdd}>
            Adicionar coluna
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field full">
          <label>Nome da coluna</label>
          <input
            autoFocus className="input" value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Ex.: Nota Fiscal, Observações..."
            onKeyDown={e => { if (e.key === 'Enter') doAdd(); }}
          />
        </div>
        <div className="field">
          <label>Tipo de dados</label>
          <select className="input" value={type} onChange={e => setType(e.target.value)}>
            <option value="text">Texto</option>
            <option value="number">Número</option>
            <option value="currency">Moeda (R$)</option>
            <option value="percent">Percentual (%)</option>
            <option value="date">Data</option>
            <option value="duration">Duração (dias)</option>
            <option value="boolean">Sim / Não</option>
            <option value="list">Lista suspensa</option>
          </select>
        </div>
        {type === 'list' && (
          <div className="field full">
            <label>Opções (separadas por vírgula)</label>
            <input
              className="input" value={options}
              onChange={e => setOptions(e.target.value)}
              placeholder="Ex.: Baixo, Médio, Alto"
            />
          </div>
        )}
      </div>
    </Modal>
  );
};

// ─── InformacoesProjetoModal (somente leitura) ───────────────────────────────
// Resumo do cronograma: obra, prazos, escopo, custos e calendário. Recebe um
// objeto `info` já calculado pelo pai (Cronograma) — não edita nada.
export const InformacoesProjetoModal = ({ info, onClose }) => {
  const Row = ({ label, value, strong }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '8px 0', borderBottom: '1px solid var(--border-subtle, rgba(0,0,0,0.06))' }}>
      <span style={{ fontSize: 12.5, color: 'var(--text-soft)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: strong ? 700 : 500, color: 'var(--text)', textAlign: 'right' }}>{value}</span>
    </div>
  );
  const Section = ({ title, children }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--brand)', marginBottom: 2 }}>{title}</div>
      {children}
    </div>
  );
  return (
    <Modal
      title="Informações do projeto"
      subtitle="Resumo do cronograma (somente leitura)"
      size="sm"
      onClose={onClose}
      footer={<button className="btn btn-primary" onClick={onClose}>Fechar</button>}
    >
      <Section title="Obra">
        <Row label="Nome" value={info.obraNome} strong />
        {info.obraCodigo ? <Row label="Código" value={info.obraCodigo} /> : null}
      </Section>
      <Section title="Prazos">
        <Row label="Início" value={info.inicio} />
        <Row label="Término projetado" value={info.termino} />
        <Row label="Duração total" value={info.duracao} />
        <Row label="Data de status" value={info.dataStatus} />
      </Section>
      <Section title="Escopo">
        <Row label="Etapas (grupos)" value={info.grupos} />
        <Row label="Tarefas" value={info.tarefas} />
        <Row label="Tarefas manuais" value={info.manuais} />
        <Row label="Avanço geral" value={info.avanco} />
      </Section>
      <Section title="Custos">
        <Row label="Custo previsto total" value={info.custoPrevisto} strong />
      </Section>
      <Section title="Calendário">
        <Row label="Feriados/dias não úteis" value={info.feriados} />
        <Row label="Sábado trabalhado" value={info.sabadoUtil} />
      </Section>
    </Modal>
  );
};

// ─── RowHeightModal ───────────────────────────────────────────────────────────
// Caixa "Altura da linha" (estilo Excel). A grade usa altura uniforme, então o valor
// vale para todas as linhas da tabela.
export const RowHeightModal = ({ value, min, max, onApply, onClose, count = 1 }) => {
  const [val, setVal] = React.useState(String(value));

  const doApply = () => {
    const n = parseInt(val, 10);
    if (!Number.isFinite(n)) { onClose(); return; }
    onApply(Math.min(max, Math.max(min, n)));
    onClose();
  };

  return (
    <Modal
      title="Altura da linha"
      onClose={onClose}
      size="sm"
      draggable
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={doApply}>OK</button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field full">
          <label>Altura da linha (px)</label>
          <input
            autoFocus type="number" className="input" value={val}
            min={min} max={max}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') doApply(); }}
          />
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
            Entre {min} e {max}px · vale para {count > 1 ? `as ${count} linhas selecionadas` : 'a linha selecionada'}.
          </span>
        </div>
      </div>
    </Modal>
  );
};

// ─── PavimentosModal ─────────────────────────────────────────────────────────
export const PavimentosModal = ({ etapas, customCols, onCommit, onClose }) => {
  const [step,          setStep]          = React.useState(1);
  const [floors,        setFloors]        = React.useState(['']);
  const [selectedTasks, setSelectedTasks] = React.useState([]);

  const validFloors = floors.filter(f => f.trim());

  const handleConfirm = () => {
    if (!validFloors.length || !selectedTasks.length) return;
    let novas = etapas.map(e => ({ ...e }));

    selectedTasks.forEach(taskId => {
      // Converter tarefa em grupo se ainda não for
      novas = novas.map(e => e.id === taskId ? { ...e, isGroup: true } : e);
      const task = novas.find(e => e.id === taskId);
      if (!task) return;

      // Encontra índice do último descendente para inserir subtarefas após ele
      let insertIdx = novas.findIndex(e => e.id === taskId);
      for (let i = insertIdx + 1; i < novas.length; i++) {
        let cur = novas[i], isDesc = false;
        while (cur && cur.parentId) {
          if (cur.parentId === taskId) { isDesc = true; break; }
          cur = novas.find(x => x.id === cur.parentId);
        }
        if (isDesc) insertIdx = i; else break;
      }

      // Cria subtarefas para cada pavimento
      const subDur = Math.max(1, Math.round(task.dur / validFloors.length));
      const toInsert = validFloors.map((nome, fi) => {
        const allSoFar = [...novas, ...validFloors.slice(0, fi).map((_, j) => ({ id: `_tmp${j}` }))];
        return {
          id:         nextEtapaId([...novas, ...validFloors.slice(0, fi).map((_, j) => ({ id: `E${9000 + j}` }))]),
          etapa:      nome,
          nivel:      (task.nivel || 0) + 1,
          parentId:   taskId,
          isGroup:    false, collapsed: false,
          inicio:     task.inicio + fi * subDur,
          dur:        subDur,
          avanco:     0, status: 'upcoming',
          dep:        [], milestone: false, responsavel: '',
          modo:       'auto',
          customCols: emptyCustomCols(customCols),
          custo:      0,
        };
      });

      // Gera IDs únicos sequencialmente
      const uniqueSubs = [];
      for (const sub of toInsert) {
        const base = [...novas, ...uniqueSubs];
        uniqueSubs.push({ ...sub, id: nextEtapaId(base), displayId: nextDisplayId(base) });
      }

      novas = [
        ...novas.slice(0, insertIdx + 1),
        ...uniqueSubs,
        ...novas.slice(insertIdx + 1),
      ];
    });

    onCommit(novas);
    onClose();
  };

  return (
    <Modal
      title="Inserção automática de pavimentos"
      subtitle={step === 1 ? 'Passo 1 de 2 — Definir pavimentos' : 'Passo 2 de 2 — Selecionar tarefas'}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={step === 1 ? onClose : () => setStep(1)}>
            {step === 1 ? 'Cancelar' : 'Voltar'}
          </button>
          {step === 1 ? (
            <button className="btn btn-primary" disabled={!validFloors.length} onClick={() => setStep(2)}>
              Próximo →
            </button>
          ) : (
            <button className="btn btn-primary" disabled={!selectedTasks.length} onClick={handleConfirm}>
              Criar {validFloors.length} pavimento{validFloors.length !== 1 ? 's' : ''} em {selectedTasks.length} tarefa{selectedTasks.length !== 1 ? 's' : ''}
            </button>
          )}
        </>
      }
    >
      {step === 1 && (
        <div>
          <p style={{ marginBottom: 14, fontSize: 13, color: 'var(--text-muted)' }}>
            Informe os nomes dos pavimentos. Eles serão criados como subtarefas das tarefas que você selecionar.
          </p>
          {floors.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <span style={{ width: 20, textAlign: 'right', fontSize: 12, color: 'var(--text-faint)', flexShrink: 0 }}>{i + 1}.</span>
              <input
                className="input"
                value={f}
                autoFocus={i === 0}
                onChange={ev => setFloors(fl => fl.map((x, j) => j === i ? ev.target.value : x))}
                placeholder={`Ex.: Pavimento ${i + 1}`}
                style={{ flex: 1 }}
                onKeyDown={ev => { if (ev.key === 'Enter') setFloors(fl => [...fl, '']); }}
              />
              {floors.length > 1 && (
                <button
                  className="btn btn-ghost"
                  style={{ width: 30, height: 30, padding: 0, fontSize: 16, lineHeight: 1 }}
                  onClick={() => setFloors(fl => fl.filter((_, j) => j !== i))}
                >×</button>
              )}
            </div>
          ))}
          <button className="btn btn-ghost" style={{ fontSize: 12, marginTop: 4, gap: 5 }} onClick={() => setFloors(fl => [...fl, ''])}>
            <Icon name="plus" size={12} /> Adicionar pavimento
          </button>
        </div>
      )}

      {step === 2 && (
        <div>
          <p style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-muted)' }}>
            Selecione as tarefas que receberão os pavimentos como subtarefas.
            Serão criados: <strong>{validFloors.join(', ')}</strong>.
          </p>
          <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
            {etapas.map(e => (
              <label key={e.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 14px', cursor: 'pointer',
                borderBottom: '1px solid var(--border)',
                background: selectedTasks.includes(e.id) ? 'var(--brand-tint)' : 'transparent',
              }}>
                <input
                  type="checkbox"
                  checked={selectedTasks.includes(e.id)}
                  onChange={ev => {
                    if (ev.target.checked) setSelectedTasks(ts => [...ts, e.id]);
                    else setSelectedTasks(ts => ts.filter(id => id !== e.id));
                  }}
                />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)', minWidth: 32 }}>{e.id}</span>
                <span style={{ paddingLeft: (e.nivel || 0) * 16, fontSize: 13, fontWeight: e.isGroup ? 600 : 400 }}>
                  {e.etapa}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
};

// ─── Modal: Salvar Linha de Base ─────────────────────────────────────────────
export const CriarLinhaModal = ({ baselines, totalEtapas, onClose, onCreate, onUpdate }) => {
  const temExistentes = baselines.length > 0;
  const [modo,     setModo]     = React.useState('nova');  // 'nova' | 'sobrescrever'
  const [nome,     setNome]     = React.useState(`Linha de Base ${baselines.length + 1}`);
  const [targetId, setTargetId] = React.useState(temExistentes ? baselines[0].id : '');

  const targetBL = baselines.find(b => b.id === targetId);
  const labelBtn = modo === 'nova' ? 'Criar' : 'Sobrescrever';
  const disabled = modo === 'nova' ? !nome.trim() : !targetId;

  const handleConfirm = () => {
    if (modo === 'nova' && nome.trim()) { onCreate(nome.trim()); onClose(); }
    else if (modo === 'sobrescrever' && targetId) { onUpdate(targetId, targetBL?.nome || nome.trim()); onClose(); }
  };

  const radioSt = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
    cursor: 'pointer', padding: '8px 12px', borderRadius: 6,
    border: '1px solid var(--border)', marginBottom: 6 };

  return (
    <Modal title="Salvar Linha de Base" onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={disabled} onClick={handleConfirm}>
            <Icon name="check" size={14} />{labelBtn}
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        {/* Modo: nova ou sobrescrever */}
        {temExistentes && (
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-soft)', display: 'block', marginBottom: 8 }}>
              Ação
            </label>
            <label style={{ ...radioSt, background: modo === 'nova' ? 'var(--brand-tint, #eef4fb)' : undefined }}>
              <input type="radio" name="bl-modo" value="nova" checked={modo === 'nova'}
                onChange={() => setModo('nova')} style={{ accentColor: 'var(--brand)' }} />
              Criar nova linha de base
            </label>
            <label style={{ ...radioSt, background: modo === 'sobrescrever' ? 'var(--brand-tint, #eef4fb)' : undefined }}>
              <input type="radio" name="bl-modo" value="sobrescrever" checked={modo === 'sobrescrever'}
                onChange={() => setModo('sobrescrever')} style={{ accentColor: 'var(--brand)' }} />
              Sobrescrever linha existente
            </label>
          </div>
        )}

        {/* Nova: campo de nome */}
        {modo === 'nova' && (
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-soft)', display: 'block', marginBottom: 6 }}>
              Nome
            </label>
            <input className="input" value={nome} autoFocus
              onChange={e => setNome(e.target.value)}
              placeholder="Ex: Planejamento Inicial"
              style={{ width: '100%' }}
            />
          </div>
        )}

        {/* Sobrescrever: select */}
        {modo === 'sobrescrever' && (
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-soft)', display: 'block', marginBottom: 6 }}>
              Linha de base a sobrescrever
            </label>
            <select className="input" value={targetId} onChange={e => setTargetId(e.target.value)}
              style={{ width: '100%' }}>
              {baselines.map(b => (
                <option key={b.id} value={b.id}>{b.nome} — {b.criadaEm}</option>
              ))}
            </select>
            <p style={{ fontSize: 12, color: '#b45309', margin: '8px 0 0' }}>
              O conteúdo atual substituirá os dados salvos. Esta ação não pode ser desfeita.
            </p>
          </div>
        )}

        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>
          O estado atual do cronograma ({totalEtapas} etapas) será salvo na linha de base selecionada.
        </p>
      </div>
    </Modal>
  );
};

// ─── Modal: Gerenciar Linhas de Base ─────────────────────────────────────────
export const GerenciarLinhasModal = ({ baselines, blVisivelId, onSelect, onDuplicar, onExcluir, onClose }) => {
  const [confirmId, setConfirmId] = React.useState(null); // id aguardando 2ª confirmação

  return (
    <Modal title="Gerenciar Linhas de Base" subtitle={`${baselines.length} linha${baselines.length !== 1 ? 's' : ''} de base`} size="lg" onClose={onClose}
      footer={<button className="btn btn-ghost" onClick={onClose}>Fechar</button>}
    >
      {baselines.length === 0
        ? <p style={{ fontSize: 13.5, color: 'var(--text-muted)', padding: '24px 0', textAlign: 'center' }}>
            Nenhuma linha de base cadastrada. Clique em "Criar Linha de Base" para começar.
          </p>
        : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Criada em</th>
                <th className="right">Etapas</th>
                <th style={{ textAlign: 'center' }}>Visível</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {baselines.map(b => (
                <tr key={b.id}>
                  <td className="strong">{b.nome}</td>
                  <td className="mono text-muted">{b.criadaEm}</td>
                  <td className="right num">{b.etapas.length}</td>
                  <td style={{ textAlign: 'center' }}>
                    <input type="radio" name="bl-visivel"
                      checked={blVisivelId === b.id}
                      onChange={() => onSelect(blVisivelId === b.id ? null : b.id)}
                      style={{ cursor: 'pointer' }}
                    />
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button className="btn btn-sm btn-ghost" onClick={() => { onDuplicar(b.id); setConfirmId(null); }}>Duplicar</button>

                      {confirmId === b.id ? (
                        /* — 2ª confirmação — */
                        <>
                          <span style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            Excluir definitivamente?
                          </span>
                          <button className="btn btn-sm"
                            style={{ background: 'var(--danger)', color: 'white', fontWeight: 700 }}
                            onClick={() => { onExcluir(b.id); setConfirmId(null); }}>
                            Sim, excluir
                          </button>
                          <button className="btn btn-sm btn-ghost" onClick={() => setConfirmId(null)}>
                            Cancelar
                          </button>
                        </>
                      ) : (
                        /* — 1ª confirmação — */
                        <button className="btn btn-sm" style={{ color: 'var(--danger)' }}
                          onClick={() => setConfirmId(b.id)}>
                          Excluir
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      }
    </Modal>
  );
};

// ─── Modal: Feriados / dias não trabalhados ──────────────────────────────────
export const FeriadosModal = ({ cfg, onChange, onClose }) => {
  const toast = useToast();
  const [data, setData] = React.useState('');
  const [descricao, setDescricao] = React.useState('');
  const dias = cfg.dias || [];
  const add = () => {
    if (!data) return;
    if (!descricao.trim()) { toast('Informe a descrição do feriado', { tone: 'error', icon: 'alert' }); return; }
    if (dias.some(d => d.data === data)) { toast('Essa data já está cadastrada', { tone: 'error', icon: 'alert' }); return; }
    const next = { ...cfg, dias: [...dias, { data, descricao: descricao.trim() }].sort((a, b) => a.data.localeCompare(b.data)) };
    onChange(next); setData(''); setDescricao('');
  };
  const remove = (d) => onChange({ ...cfg, dias: dias.filter(x => x.data !== d) });
  const [editKey, setEditKey]   = React.useState(null); // data original em edição
  const [editDate, setEditDate] = React.useState('');
  const [editDesc, setEditDesc] = React.useState('');
  const startEdit = (d) => { setEditKey(d.data); setEditDate(d.data); setEditDesc(d.descricao || ''); };
  const saveEdit = () => {
    if (!editDate) return;
    if (!editDesc.trim()) { toast('Informe a descrição do feriado', { tone: 'error', icon: 'alert' }); return; }
    if (editDate !== editKey && dias.some(x => x.data === editDate)) { toast('Essa data já está cadastrada', { tone: 'error', icon: 'alert' }); return; }
    const next = { ...cfg, dias: dias.map(x => x.data === editKey ? { data: editDate, descricao: editDesc.trim() } : x).sort((a, b) => a.data.localeCompare(b.data)) };
    onChange(next); setEditKey(null);
  };
  return (
    <Modal
      title="Feriados / dias não trabalhados"
      subtitle="Domingos e feriados não são trabalhados; o sábado é configurável."
      onClose={onClose} size="md" draggable
      footer={<button className="btn btn-primary" onClick={onClose}>Concluir</button>}
    >
      <div className="stack" style={{ gap: 14 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="field">
            <label>Data</label>
            <input type="date" className="input" value={data} onChange={e => setData(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }} />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 180 }}>
            <label>Descrição</label>
            <input className="input" placeholder="Ex.: Natal, Independência…" value={descricao} onChange={e => setDescricao(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }} />
          </div>
          <button className="btn btn-primary" onClick={add} disabled={!data || !descricao.trim()}><Icon name="plus" size={14} />Adicionar</button>
        </div>

        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!cfg.sabadoUtil} onChange={() => onChange({ ...cfg, sabadoUtil: !cfg.sabadoUtil })} />
          Trabalhar aos sábados (sábado conta como dia útil)
        </label>

        {dias.length === 0 ? (
          <div className="text-muted" style={{ textAlign: 'center', padding: '16px 0', fontSize: 13 }}>Nenhum feriado cadastrado.</div>
        ) : (
          <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
            <table className="tbl">
              <thead><tr><th style={{ width: 120 }}>Data</th><th>Descrição</th><th></th></tr></thead>
              <tbody>
                {dias.map(d => (
                  editKey === d.data ? (
                    <tr key={d.data}>
                      <td>
                        <input type="date" className="input" value={editDate} style={{ height: 30 }}
                          onChange={e => setEditDate(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditKey(null); }} />
                      </td>
                      <td>
                        <input className="input" value={editDesc} style={{ height: 30 }} autoFocus
                          onChange={e => setEditDesc(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditKey(null); }} />
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn btn-sm btn-primary" onClick={saveEdit} disabled={!editDate || !editDesc.trim()}>Salvar</button>
                        <button className="btn btn-sm btn-ghost" onClick={() => setEditKey(null)}>Cancelar</button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={d.data}>
                      <td className="mono">{isoToBR(d.data)}</td>
                      <td>{d.descricao || <span className="text-muted">—</span>}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn btn-sm btn-ghost" onClick={() => startEdit(d)}>Editar</button>
                        <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => remove(d.data)}>Remover</button>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
};

// ─── Modal: Salvar Reprogramação ─────────────────────────────────────────────
export const CriarReprogramacaoModal = ({ totalEtapas, onClose, onCreate }) => {
  const hoje = new Date();
  const mesLabel = hoje.toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' }).replace('/', '/');
  const [nome, setNome] = React.useState(`Reprogramação ${mesLabel}`);

  const handleConfirm = () => {
    if (nome.trim()) { onCreate(nome.trim()); onClose(); }
  };

  return (
    <Modal title="Salvar Reprogramação" onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!nome.trim()} onClick={handleConfirm}>
            <Icon name="check" size={14} />Salvar
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        <div>
          <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-soft)', display: 'block', marginBottom: 6 }}>
            Nome
          </label>
          <input className="input" value={nome} autoFocus
            onChange={e => setNome(e.target.value)}
            placeholder="Ex: Reprogramação 07/2026"
            style={{ width: '100%' }}
          />
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>
          Salva uma cópia do cronograma atual ({totalEtapas} etapas), como ele está agora, para você
          comparar depois na Curva Física — use antes de reprogramar.
        </p>
      </div>
    </Modal>
  );
};

// ─── Modal: Gerenciar Reprogramações ─────────────────────────────────────────
export const GerenciarReprogramacoesModal = ({ reprogramacoes, repVisivelId, onSelect, onExcluir, onClose }) => {
  const [confirmId, setConfirmId] = React.useState(null); // id aguardando 2ª confirmação

  return (
    <Modal title="Gerenciar Reprogramações" subtitle={`${reprogramacoes.length} reprogramação${reprogramacoes.length !== 1 ? 'ões' : ''} salva${reprogramacoes.length !== 1 ? 's' : ''}`} size="lg" onClose={onClose}
      footer={<button className="btn btn-ghost" onClick={onClose}>Fechar</button>}
    >
      {reprogramacoes.length === 0
        ? <p style={{ fontSize: 13.5, color: 'var(--text-muted)', padding: '24px 0', textAlign: 'center' }}>
            Nenhuma reprogramação salva. Clique em "Salvar Reprogramação" para começar.
          </p>
        : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Criada em</th>
                <th className="right">Etapas</th>
                <th style={{ textAlign: 'center' }}>Comparando</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {reprogramacoes.map(r => (
                <tr key={r.id}>
                  <td className="strong">{r.nome}</td>
                  <td className="mono text-muted">{r.criadaEm}</td>
                  <td className="right num">{r.etapas.length}</td>
                  <td style={{ textAlign: 'center' }}>
                    <input type="radio" name="rep-visivel"
                      checked={repVisivelId === r.id}
                      onChange={() => onSelect(repVisivelId === r.id ? null : r.id)}
                      style={{ cursor: 'pointer' }}
                    />
                  </td>
                  <td>
                    {confirmId === r.id ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          Excluir definitivamente?
                        </span>
                        <button className="btn btn-sm"
                          style={{ background: 'var(--danger)', color: 'white', fontWeight: 700 }}
                          onClick={() => { onExcluir(r.id); setConfirmId(null); }}>
                          Sim, excluir
                        </button>
                        <button className="btn btn-sm btn-ghost" onClick={() => setConfirmId(null)}>
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button className="btn btn-sm" style={{ color: 'var(--danger)' }}
                        onClick={() => setConfirmId(r.id)}>
                        Excluir
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      }
    </Modal>
  );
};
