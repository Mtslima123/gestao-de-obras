// Modais do Cronograma — componentes de UI extraídos de Cronograma.jsx (movimento
// verbatim). Cada um recebe seus callbacks do componente pai via props.

import React from "react";
import { Modal, useToast } from "../../components/Modals";
import { Icon } from "../../components/Icons";
import { isoToBR, todayOffset } from "./cronogramaDateUtils";
import { nextEtapaId, nextDisplayId, emptyCustomCols, recomputeHierarchy, updateParentBounds } from "./scheduleEngine";

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
      draggable
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
        <div className="field full">
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
            <option value="autocomplete">Lista com sugestão automática</option>
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
// Retângulo horizontal e compacto (tiles lado a lado, agrupados por assunto),
// em vez das seções empilhadas verticalmente — e arrastável pelo cabeçalho.
export const InformacoesProjetoModal = ({ info, onClose }) => {
  const Tile = ({ label, value, strong }) => (
    <div style={{ minWidth: 88 }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 3, whiteSpace: 'nowrap' }}>
        {label}
      </div>
      <div style={{ fontSize: 13.5, fontWeight: strong ? 700 : 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>
        {value}
      </div>
    </div>
  );
  const Group = ({ title, children }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--brand)' }}>
        {title}
      </div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>{children}</div>
    </div>
  );
  return (
    <Modal
      title="Informações do projeto"
      subtitle="Resumo do cronograma (somente leitura)"
      size="md"
      draggable
      onClose={onClose}
      footer={<button className="btn btn-primary" onClick={onClose}>Fechar</button>}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
        <Group title="Obra">
          <Tile label="Nome" value={info.obraNome} strong />
          {info.obraCodigo && <Tile label="Código" value={info.obraCodigo} />}
        </Group>
        <Group title="Prazos">
          <Tile label="Início" value={info.inicio} />
          <Tile label="Término projetado" value={info.termino} />
          <Tile label="Duração total" value={info.duracao} />
          <Tile label="Data de status" value={info.dataStatus} />
        </Group>
        <Group title="Escopo">
          <Tile label="Etapas (grupos)" value={info.grupos} />
          <Tile label="Tarefas" value={info.tarefas} />
          <Tile label="Tarefas manuais" value={info.manuais} />
          <Tile label="Avanço geral" value={info.avanco} />
        </Group>
        <Group title="Custos">
          <Tile label="Custo previsto total" value={info.custoPrevisto} strong />
        </Group>
        <Group title="Calendário">
          <Tile label="Feriados/dias não úteis" value={info.feriados} />
          <Tile label="Sábado trabalhado" value={info.sabadoUtil} />
        </Group>
      </div>
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
export const PavimentosModal = ({ etapas, customCols, onCommit, onClose, pavimentosSalvos = [], onPavimentosCriados, onPavimentoExcluir }) => {
  const [step,          setStep]          = React.useState(1);
  // Pré-preenche com os pavimentos já cadastrados nesta obra (não precisa redigitar a cada vez).
  const [floors,        setFloors]        = React.useState(pavimentosSalvos.length ? [...pavimentosSalvos] : ['']);
  const [selectedTasks, setSelectedTasks] = React.useState([]);
  const floorInputRefs = React.useRef([]);
  const prevFloorsLenRef = React.useRef(floors.length);

  // Ao surgir um novo campo de pavimento (Enter na última linha, ou "Adicionar pavimento"),
  // já habilita a digitação nele — sem precisar clicar.
  React.useEffect(() => {
    if (floors.length > prevFloorsLenRef.current) floorInputRefs.current[floors.length - 1]?.focus();
    prevFloorsLenRef.current = floors.length;
  }, [floors.length]);

  const validFloors = floors.filter(f => f.trim());

  // Preenche o primeiro campo vazio com o nome (chip de pavimento já usado), ou cria um novo
  // campo já com o nome — mesma lógica de "próximo campo" usada pelo Enter.
  const addOrFillFloor = (nome) => {
    setFloors(fl => {
      const emptyIdx = fl.findIndex(f => !f.trim());
      if (emptyIdx >= 0) {
        requestAnimationFrame(() => floorInputRefs.current[emptyIdx]?.focus());
        return fl.map((x, j) => j === emptyIdx ? nome : x);
      }
      return [...fl, nome];
    });
  };

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
          etapa:      `${task.etapa} - ${nome}`,
          nivel:      (task.nivel || 0) + 1,
          parentId:   taskId,
          isGroup:    false, collapsed: false,
          inicio:     task.inicio + fi * subDur,
          dur:        subDur,
          avanco:     0, status: 'upcoming',
          dep:        [], milestone: false, responsavel: '',
          pavimento:  nome,
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
    onPavimentosCriados?.(validFloors);
    onClose();
  };

  // Apenas registra os pavimentos na obra (disponíveis para reutilizar em inserções/fotos),
  // sem criar subtarefas agora. A lista da tela é a verdade: o que o usuário tirou daqui
  // sai também do cadastro da obra — senão o pavimento excluído voltava na próxima abertura.
  const handleSalvarPreCadastro = () => {
    if (!validFloors.length) return;
    pavimentosSalvos.filter(n => !validFloors.includes(n)).forEach(n => onPavimentoExcluir?.(n));
    onPavimentosCriados?.(validFloors);
    onClose();
  };

  return (
    <Modal
      title="Inserção automática de pavimentos"
      subtitle={step === 1 ? 'Passo 1 de 2 — Definir pavimentos' : 'Passo 2 de 2 — Selecionar tarefas'}
      onClose={onClose}
      draggable
      footer={
        <>
          <button className="btn btn-ghost" onClick={step === 1 ? onClose : () => setStep(1)}>
            {step === 1 ? 'Cancelar' : 'Voltar'}
          </button>
          {step === 1 ? (
            <>
              <button className="btn btn-ghost" disabled={!validFloors.length} onClick={handleSalvarPreCadastro}
                title="Sincroniza o cadastro da obra com esta lista (adiciona os novos e exclui os removidos), sem criar subtarefas agora">
                Salvar pré-cadastro
              </button>
              <button className="btn btn-primary" disabled={!validFloors.length} onClick={() => setStep(2)}>
                Próximo →
              </button>
            </>
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
            Informe os nomes dos pavimentos. Use "Salvar pré-cadastro" para deixá-los disponíveis na obra (para reutilizar em inserções e fotos), ou "Próximo" para já criá-los como subtarefas das tarefas que você selecionar.
          </p>
          {/* Altura fixa: a caixa não cresce ao adicionar pavimentos, o rodapé não pula de lugar. */}
          <div style={{ height: 132, overflowY: 'auto', paddingRight: 4 }}>
            {floors.map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <span style={{ width: 20, textAlign: 'right', fontSize: 12, color: 'var(--text-faint)', flexShrink: 0 }}>{i + 1}.</span>
                <input
                  ref={el => { floorInputRefs.current[i] = el; }}
                  className="input"
                  value={f}
                  autoFocus={i === 0}
                  onChange={ev => setFloors(fl => fl.map((x, j) => j === i ? ev.target.value : x))}
                  placeholder={`Ex.: Pavimento ${i + 1}`}
                  style={{ flex: 1 }}
                  onKeyDown={ev => {
                    if (ev.key !== 'Enter') return;
                    ev.preventDefault();
                    if (i < floors.length - 1) floorInputRefs.current[i + 1]?.focus();
                    else setFloors(fl => [...fl, '']);
                  }}
                />
                {floors.length > 1 && (
                  <button
                    className="btn btn-ghost"
                    style={{ width: 30, height: 30, padding: 0, fontSize: 16, lineHeight: 1, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={() => setFloors(fl => fl.filter((_, j) => j !== i))}
                  >×</button>
                )}
              </div>
            ))}
          </div>
          <button className="btn btn-ghost" style={{ fontSize: 12, marginTop: 4, gap: 5 }} onClick={() => setFloors(fl => [...fl, ''])}>
            <Icon name="plus" size={12} /> Adicionar pavimento
          </button>

          {pavimentosSalvos.filter(n => !floors.includes(n)).length > 0 && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-soft)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                Pavimentos já usados nesta obra
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {pavimentosSalvos.filter(n => !floors.includes(n)).map(n => (
                  <span key={n} className="btn btn-ghost"
                    style={{ fontSize: 12, padding: '3px 6px 3px 10px', height: 26, borderRadius: 14, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ cursor: 'pointer' }} title="Adicionar aos pavimentos" onClick={() => addOrFillFloor(n)}>{n}</span>
                    {onPavimentoExcluir && (
                      <span role="button" title="Excluir do cadastro da obra"
                        onClick={() => onPavimentoExcluir(n)}
                        style={{ cursor: 'pointer', color: 'var(--text-faint)', fontSize: 13, lineHeight: 1, padding: '0 2px' }}>×</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
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

// ─── ImportarEAPModal — importa uma EAP pronta de planilha Excel/CSV ──────────
export const ImportarEAPModal = ({ etapas, customCols, onCommit, onClose }) => {
  const toast = useToast();
  const [step,     setStep]     = React.useState(1);
  const [fileName, setFileName] = React.useState('');
  const [parsed,   setParsed]   = React.useState(null); // { nodes, warnings }
  const [busy,     setBusy]     = React.useState(false);
  const fileRef = React.useRef(null);
  // Descarta resultado obsoleto: se o usuário clicar de novo antes do parse anterior
  // terminar (o import('xlsx') dinâmico é lento na 1ª vez da sessão), a Promise mais
  // ANTIGA pode resolver DEPOIS da mais nova e sobrescrever a prévia com o arquivo errado.
  const requestIdRef = React.useRef(0);

  const norm = (s) => String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  // Separa um codigo de EAP colado no inicio do nome ("1.2.1 Fundacao" ou "1.2.1 - Fundacao").
  // O codigo da planilha serve SO para descobrir a hierarquia: o WBS exibido e sempre
  // gerado pelo sistema (computeAllWBS, a partir do parentId). Sem isso, uma planilha de
  // coluna unica trazia o codigo dentro do nome da tarefa e a hierarquia vinha plana.
  const separarCodigoNome = (texto) => {
    const t = String(texto ?? '').trim();
    // O separador é obrigatório: sem ele, "1.2.1" era quebrado em código "1.2" + nome "1",
    // e uma linha que só tem o código viraria uma tarefa chamada "1".
    const m = t.match(/^(\d+(?:\.\d+)*)(?:\s*[-–—:]\s*|[).]?\s+)(.+)$/);
    if (!m) return { code: '', name: t };
    return { code: m[1], name: m[2].trim() };
  };

  // Converte a matriz (linhas x colunas) da planilha em nós de EAP com parentId.
  const parseRows = (matrix) => {
    const rows = (matrix || []).filter(r => Array.isArray(r) && r.some(c => String(c ?? '').trim() !== ''));
    if (!rows.length) return { nodes: [], warnings: ['A planilha está vazia.'] };

    // Detecta cabeçalho por palavras-chave
    let codeIdx = -1, levelIdx = -1, nameIdx = -1, durIdx = -1;
    const head = rows[0].map(norm);
    const findIdx = (re) => head.findIndex(h => re.test(h));
    codeIdx  = findIdx(/^(eap|wbs|codigo|cod|item)$/);
    levelIdx = findIdx(/^(nivel|level)$/);
    nameIdx  = findIdx(/(nome|tarefa|descri|atividade|etapa|servico)/);
    durIdx   = findIdx(/(dura|dias|prazo)/);
    const hasHeader = nameIdx >= 0 || codeIdx >= 0 || levelIdx >= 0 || durIdx >= 0;
    const dataRows = hasHeader ? rows.slice(1) : rows;

    // Sem cabeçalho reconhecível: adivinha pelo formato da 1ª linha de dados
    if (!hasHeader) {
      const c0 = String((dataRows[0] || [])[0] ?? '').trim();
      if (/^\d+(\.\d+)*$/.test(c0)) { codeIdx = 0; nameIdx = 1; durIdx = 2; }
      else { nameIdx = 0; durIdx = 1; }
    }
    if (nameIdx < 0) nameIdx = codeIdx >= 0 ? codeIdx + 1 : 0;

    const warnings = [];
    const items = [];
    dataRows.forEach(r => {
      const bruto = String(r[nameIdx] ?? '').trim();
      if (!bruto) return;
      const codigoNaColuna = codeIdx >= 0 ? String(r[codeIdx] ?? '').trim() : '';
      // Sem coluna de código própria, tenta extrair do começo do nome.
      const sep  = codigoNaColuna ? { code: codigoNaColuna, name: bruto } : separarCodigoNome(bruto);
      const name = sep.name;
      if (!name) return;
      const code   = sep.code;
      const level  = levelIdx >= 0 ? parseInt(r[levelIdx], 10) : null;
      const durRaw = durIdx   >= 0 ? parseFloat(String(r[durIdx] ?? '').replace(',', '.')) : NaN;
      const dur    = Number.isFinite(durRaw) && durRaw > 0 ? Math.round(durRaw) : null;
      items.push({ code, level, name, dur });
    });
    if (!items.length) return { nodes: [], warnings: ['Nenhuma tarefa encontrada. Verifique a coluna de nomes.'] };

    // Cunha ids únicos (base crescente inclui as etapas atuais + as já criadas)
    let base = etapas.slice();
    items.forEach(it => {
      it.id = nextEtapaId(base);
      it.displayId = nextDisplayId(base);
      base = [...base, { id: it.id, displayId: it.displayId }];
    });

    // Resolve parentId: por código EAP (1, 1.1, 1.1.2) ou por coluna de nível
    const useCode = items.some(it => /\d+\.\d+/.test(it.code)) || (codeIdx >= 0 && items.every(it => it.code));
    const codeMap = {};
    const stack = [];
    items.forEach(it => {
      let parentId = null;
      if (useCode && it.code) {
        const parts = it.code.split('.').filter(Boolean);
        const parentCode = parts.slice(0, -1).join('.');
        parentId = parentCode ? (codeMap[parentCode] ?? null) : null;
        codeMap[it.code] = it.id;
      } else if (it.level != null && !Number.isNaN(it.level)) {
        while (stack.length && stack[stack.length - 1].level >= it.level) stack.pop();
        parentId = stack.length ? stack[stack.length - 1].id : null;
        stack.push({ level: it.level, id: it.id });
      }
      it.parentId = parentId;
    });

    // Distribui datas em cascata só nas folhas (grupos têm datas calculadas depois)
    const childCount = {};
    items.forEach(it => { if (it.parentId) childCount[it.parentId] = (childCount[it.parentId] || 0) + 1; });
    let cursor = todayOffset();
    const nodes = items.map(it => {
      const isLeaf = !childCount[it.id];
      const dur    = isLeaf ? (it.dur || 1) : 1;
      const inicio = isLeaf ? cursor : 0;
      if (isLeaf) cursor += dur;
      return { ...it, isLeaf, dur, inicio };
    });
    if (!useCode && levelIdx < 0) warnings.push('Sem coluna EAP ou Nível: todas as tarefas entraram no mesmo nível. Use recuo depois se precisar.');
    return { nodes, warnings };
  };

  const handleFile = async (file) => {
    if (!file) return;
    const myId = ++requestIdRef.current;
    setBusy(true);
    setFileName(file.name);
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb  = XLSX.read(buf, { type: 'array' });
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
      if (myId !== requestIdRef.current) return; // uma seleção mais nova já está em voo — descarta esta
      setParsed(parseRows(matrix));
      setStep(2);
    } catch {
      if (myId !== requestIdRef.current) return;
      toast('Não foi possível ler o arquivo. Verifique se é um Excel/CSV válido.', { tone: 'danger', icon: 'alert' });
    } finally {
      if (myId === requestIdRef.current) setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleConfirm = () => {
    const nodes = parsed?.nodes || [];
    if (!nodes.length) return;
    const novos = nodes.map(n => ({
      id: n.id, displayId: n.displayId, etapa: n.name,
      nivel: 0, parentId: n.parentId, isGroup: false, collapsed: false,
      inicio: n.inicio, dur: n.dur, avanco: 0, status: 'upcoming',
      dep: [], milestone: false, responsavel: '',
      custo: 0, custoRealizado: 0, showInDist: false,
      restricaoTipo: 'asap', restricaoData: '', fator_peso: 1, modo: 'auto',
      customCols: emptyCustomCols(customCols),
    }));
    let novas = recomputeHierarchy([...etapas, ...novos]);
    novas = updateParentBounds(novas);
    onCommit(novas);
    toast(`EAP importada: ${nodes.length} tarefa${nodes.length !== 1 ? 's' : ''} adicionada${nodes.length !== 1 ? 's' : ''}.`, { tone: 'success', icon: 'check' });
    onClose();
  };

  const nodes = parsed?.nodes || [];
  const depthOf = (id) => { let d = 0, cur = nodes.find(n => n.id === id); while (cur && cur.parentId) { d++; cur = nodes.find(n => n.id === cur.parentId); } return d; };
  const isGroupNode = (id) => nodes.some(n => n.parentId === id);

  return (
    <Modal
      title="Importar EAP de planilha"
      subtitle={step === 1 ? 'Passo 1 de 2 — Escolher arquivo' : 'Passo 2 de 2 — Conferir e importar'}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={step === 1 ? onClose : () => { setStep(1); setParsed(null); }}>
            {step === 1 ? 'Cancelar' : 'Voltar'}
          </button>
          {step === 2 && (
            <button className="btn btn-primary" disabled={!nodes.length} onClick={handleConfirm}>
              Importar {nodes.length} tarefa{nodes.length !== 1 ? 's' : ''}
            </button>
          )}
        </>
      }
    >
      {step === 1 && (
        <div>
          <p style={{ marginBottom: 14, fontSize: 13, color: 'var(--text-muted)' }}>
            Selecione um arquivo Excel (.xlsx/.xls) ou CSV. A hierarquia vem do código EAP
            (<strong>1</strong>, <strong>1.1</strong>, <strong>1.1.2</strong>) ou de uma coluna <strong>Nível</strong>.
            Colunas reconhecidas: <strong>EAP</strong>, <strong>Nome</strong>, <strong>Duração</strong> (opcional).
          </p>
          <div
            onClick={busy ? undefined : () => fileRef.current?.click()}
            style={{
              border: '2px dashed var(--border)', borderRadius: 10, padding: '32px 16px',
              textAlign: 'center', cursor: busy ? 'default' : 'pointer', background: 'var(--surface-muted)',
              opacity: busy ? 0.6 : 1, pointerEvents: busy ? 'none' : 'auto',
            }}
          >
            <Icon name="upload" size={26} />
            <div style={{ marginTop: 10, fontSize: 13, fontWeight: 600 }}>
              {busy ? 'Lendo arquivo...' : 'Clique para escolher a planilha'}
            </div>
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-faint)' }}>.xlsx, .xls ou .csv</div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            disabled={busy}
            style={{ display: 'none' }}
            onChange={e => handleFile(e.target.files?.[0])}
          />
        </div>
      )}

      {step === 2 && (
        <div>
          {parsed?.warnings?.map((w, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, fontSize: 12.5, color: 'var(--warning, #a15c00)' }}>
              <Icon name="alert-triangle" size={14} /> {w}
            </div>
          ))}
          {!nodes.length ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Nenhuma tarefa foi reconhecida no arquivo <strong>{fileName}</strong>.
            </p>
          ) : (
            <>
              <p style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-muted)' }}>
                <strong>{fileName}</strong> — {nodes.length} tarefa{nodes.length !== 1 ? 's' : ''} pronta{nodes.length !== 1 ? 's' : ''} para adicionar ao fim do cronograma.
              </p>
              <div style={{ maxHeight: 340, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                {nodes.map(n => (
                  <div key={n.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '6px 14px', borderBottom: '1px solid var(--border)',
                  }}>
                    <span style={{
                      paddingLeft: depthOf(n.id) * 18, fontSize: 13, flex: 1,
                      fontWeight: isGroupNode(n.id) ? 600 : 400,
                    }}>{n.name}</span>
                    {!isGroupNode(n.id) && (
                      <span style={{ fontSize: 11.5, color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums' }}>
                        {n.dur} dia{n.dur !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
};

// ─── Modal: Salvar Linha de Base ─────────────────────────────────────────────
export const CriarLinhaModal = ({ baselines, totalEtapas, nomesUsados = [], onClose, onCreate, onUpdate }) => {
  const toast = useToast();
  const temExistentes = baselines.length > 0;
  const [modo,     setModo]     = React.useState('nova');  // 'nova' | 'sobrescrever'
  const [nome,     setNome]     = React.useState(`Linha de Base ${baselines.length + 1}`);
  const [targetId, setTargetId] = React.useState(temExistentes ? baselines[0].id : '');

  const targetBL = baselines.find(b => b.id === targetId);
  const labelBtn = modo === 'nova' ? 'Criar' : 'Sobrescrever';
  const nomeDup  = modo === 'nova' && !!nome.trim() && nomesUsados.includes(nome.trim().toLowerCase());
  const disabled = modo === 'nova' ? !nome.trim() : !targetId;

  const handleConfirm = () => {
    if (modo === 'nova' && nome.trim()) {
      if (nomeDup) { toast('Já existe uma linha de base ou reprogramação com esse nome.', { tone: 'danger' }); return; }
      onCreate(nome.trim()); onClose();
    }
    else if (modo === 'sobrescrever' && targetId) { onUpdate(targetId, targetBL?.nome || nome.trim()); onClose(); }
  };

  const radioSt = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
    cursor: 'pointer', padding: '8px 12px', borderRadius: 6,
    border: '1px solid var(--border)', marginBottom: 6 };

  return (
    <Modal title="Salvar Linha de Base" size="sm" draggable onClose={onClose}
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
            {nomeDup && (
              <p style={{ fontSize: 12, color: 'var(--danger, #dc2626)', margin: '6px 0 0' }}>
                Já existe uma linha de base ou reprogramação com esse nome.
              </p>
            )}
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
    <Modal title="Gerenciar Linhas de Base" subtitle={`${baselines.length} linha${baselines.length !== 1 ? 's' : ''} de base`} size="md" draggable onClose={onClose}
      footer={<button className="btn btn-ghost" onClick={onClose}>Fechar</button>}
    >
      {baselines.length === 0
        ? <p style={{ fontSize: 13.5, color: 'var(--text-muted)', padding: '24px 0', textAlign: 'center' }}>
            Nenhuma linha de base cadastrada. Clique em "Criar Linha de Base" para começar.
          </p>
        : (
          <div style={{ maxHeight: 340, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
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
                  <td className="mono text-muted">{isoToBR(b.criadaEm)}</td>
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
          </div>
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
export const CriarReprogramacaoModal = ({ totalEtapas, nomesUsados = [], onClose, onCreate }) => {
  const toast = useToast();
  const hoje = new Date();
  const mesLabel = hoje.toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' }).replace('/', '/');
  const [nome, setNome] = React.useState(`Reprogramação ${mesLabel}`);
  const nomeDup = !!nome.trim() && nomesUsados.includes(nome.trim().toLowerCase());

  const handleConfirm = () => {
    if (!nome.trim()) return;
    if (nomeDup) { toast('Já existe uma linha de base ou reprogramação com esse nome.', { tone: 'danger' }); return; }
    onCreate(nome.trim()); onClose();
  };

  return (
    <Modal title="Salvar Reprogramação" size="sm" draggable onClose={onClose}
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
          {nomeDup && (
            <p style={{ fontSize: 12, color: 'var(--danger, #dc2626)', margin: '6px 0 0' }}>
              Já existe uma linha de base ou reprogramação com esse nome.
            </p>
          )}
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
    <Modal title="Gerenciar Reprogramações" subtitle={`${reprogramacoes.length} reprogramação${reprogramacoes.length !== 1 ? 'ões' : ''} salva${reprogramacoes.length !== 1 ? 's' : ''}`} size="md" draggable onClose={onClose}
      footer={<button className="btn btn-ghost" onClick={onClose}>Fechar</button>}
    >
      {reprogramacoes.length === 0
        ? <p style={{ fontSize: 13.5, color: 'var(--text-muted)', padding: '24px 0', textAlign: 'center' }}>
            Nenhuma reprogramação salva. Clique em "Salvar Reprogramação" para começar.
          </p>
        : (
          <div style={{ maxHeight: 340, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
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
                  <td className="mono text-muted">{isoToBR(r.criadaEm)}</td>
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
          </div>
        )
      }
    </Modal>
  );
};
