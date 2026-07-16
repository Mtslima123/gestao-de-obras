import React from 'react';
import * as XLSX from 'xlsx';
import { Icon } from '../../components/Icons';
import { AppData } from '../../utils/data';
import { useToast, Modal } from '../../components/Modals';
import { orcamentosService } from './orcamentos.service';
import { formatBRL } from '../../utils/formatters';
import { moduloSomenteLeitura, isAdmin } from '../../utils/permissions';

// Orçamentos — lista + detalhe com composição
const { brl: brlOR } = AppData;
const brlFull = formatBRL;


// OrcamentoLista recebe orcamentos já buscados pelo screen pai
const OrcamentoLista = ({ onOpen, onNovo, orcamentos = [], loading = false, onDelete, userProfile, pagina = 1, total = 0, perPage = 12, onPagina }) => {
  const filtered = orcamentos;
  const totalPaginas = Math.max(1, Math.ceil(total / perPage));
  const readOnly = moduloSomenteLeitura(userProfile, 'orcamentos');
  const [deleteOrc, setDeleteOrc] = React.useState(null);
  const [deleteStep, setDeleteStep] = React.useState(1);

  const handleDeleteConfirm = () => {
    if (!deleteOrc) return;
    if (deleteStep === 1) { setDeleteStep(2); return; }
    onDelete(deleteOrc.id);
    setDeleteOrc(null);
    setDeleteStep(1);
  };

  const handleDeleteCancel = () => { setDeleteOrc(null); setDeleteStep(1); };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Orçamentos</h1>
        </div>
        {isAdmin(userProfile) && (
          <div className="page-actions">
            <button className="btn btn-primary" onClick={onNovo}><Icon name="plus" size={15} />Novo orçamento</button>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 'var(--gap)' }}>
        <div className="card-header">
          <div className="card-actions">
            <input className="input input-search" placeholder="Buscar orçamento…" style={{ minWidth: 220 }} />
          </div>
        </div>
        <div className="card-body flush">
          <table className="tbl">
            <thead>
              <tr>
                <th>Código</th>
                <th>Obra</th>
                <th className="center">Versão</th>
                <th>Data</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} style={{ pointerEvents: 'none' }}>
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j}><div className="skeleton" style={{ height: 14 }} /></td>
                    ))}
                  </tr>
                ))
              ) : (
                filtered.map((o) => (
                  <tr key={o.id} onClick={() => onOpen(o)}>
                    <td className="strong mono">{o.id}</td>
                    <td className="strong">{o.obra}</td>
                    <td className="center mono text-muted">{o.versao}</td>
                    <td className="mono text-sm text-muted">{o.data}</td>
                    <td>
                      {!readOnly && (
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                        <button
                          className="icon-btn"
                          style={{ width: 28, height: 28 }}
                          title="Excluir orçamento"
                          onClick={(e) => { e.stopPropagation(); setDeleteOrc(o); setDeleteStep(1); }}
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && total > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
              Mostrando {(pagina - 1) * perPage + 1}–{Math.min(pagina * perPage, total)} de {total} orçamento{total !== 1 ? 's' : ''}
            </span>
            {totalPaginas > 1 && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button className="icon-btn" disabled={pagina === 1} onClick={() => onPagina(pagina - 1)} title="Página anterior"><Icon name="chevron-left" size={14} /></button>
                <span style={{ fontSize: 12.5, minWidth: 60, textAlign: 'center' }}>{pagina} / {totalPaginas}</span>
                <button className="icon-btn" disabled={pagina >= totalPaginas} onClick={() => onPagina(pagina + 1)} title="Próxima página"><Icon name="chevron-right" size={14} /></button>
              </div>
            )}
          </div>
        )}
      </div>

      {deleteOrc && (
        <Modal
          title={deleteStep === 1 ? 'Excluir orçamento' : 'Confirmação final'}
          onClose={handleDeleteCancel}
          footer={
            <>
              <button className="btn btn-ghost" onClick={handleDeleteCancel}>Cancelar</button>
              <button
                className="btn"
                style={{ background: 'var(--danger)', color: 'white', fontWeight: 600 }}
                onClick={handleDeleteConfirm}
              >
                {deleteStep === 1 ? 'Sim, excluir' : 'Confirmar exclusão'}
              </button>
            </>
          }
        >
          {deleteStep === 1 ? (
            <p style={{ fontSize: 14 }}>
              Tem certeza que deseja excluir o orçamento <strong>{deleteOrc.id}</strong> ({deleteOrc.obra})?
            </p>
          ) : (
            <div>
              <p style={{ fontSize: 14, marginBottom: 10 }}>
                Esta ação é <strong style={{ color: 'var(--danger)' }}>irreversível</strong>. Todos os itens do orçamento serão removidos.
              </p>
              <p style={{ fontSize: 14, marginTop: 12, fontWeight: 600 }}>Deseja realmente continuar?</p>
            </div>
          )}
        </Modal>
      )}
    </>
  );
};

// ── Importação de base orçamentária (Excel/CSV) ───────────────────────────────
const ImportarOrcamentoModal = ({ orcamento, user, existingItems, onImport, onClose }) => {
  const [step, setStep]         = React.useState(1);
  const [rows, setRows]         = React.useState([]);
  const [erros, setErros]       = React.useState([]);
  const [removidos, setRemo]    = React.useState(new Set());
  const [modo, setModo]         = React.useState('substituir');
  const [parsing, setParsing]   = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const fileRef = React.useRef();

  const ALIASES = {
    codigo:         ['código', 'codigo', 'code', 'cod'],
    nome:           ['nome', 'descrição', 'descricao', 'name', 'description', 'desc'],
    quantidade:     ['quantidade', 'qtd', 'qty', 'quantity'],
    unidade:        ['unidade', 'un', 'unit'],
    valor_unitario: ['valor unitário', 'valor unit', 'unit price', 'preco', 'preço', 'v.unit'],
  };

  const detectCol = (headers, field) =>
    headers.findIndex(h => ALIASES[field].some(a => String(h).toLowerCase().trim().startsWith(a)));

  const validate = React.useCallback((rowList, modoAtual) => {
    const lista = [];
    const codigos = new Set();
    const existentes = new Set(existingItems.map(it => it.codigo));
    rowList.forEach((r, i) => {
      if (!r.codigo)
        lista.push({ rowIdx: i, tipo: 'Erro', descricao: 'Código vazio' });
      else if (!/^\d+(\.\d+)*$/.test(r.codigo))
        lista.push({ rowIdx: i, tipo: 'Erro', descricao: `Código inválido: "${r.codigo}"` });
      else if (codigos.has(r.codigo))
        lista.push({ rowIdx: i, tipo: 'Erro', descricao: `Código duplicado: ${r.codigo}` });
      else if (modoAtual === 'adicionar' && existentes.has(r.codigo))
        lista.push({ rowIdx: i, tipo: 'Aviso', descricao: `Código já existe: ${r.codigo}` });

      if (!r.nome)
        lista.push({ rowIdx: i, tipo: 'Aviso', descricao: 'Nome vazio' });

      if (r.codigo && r.codigo.includes('.')) {
        const parent = r.codigo.split('.').slice(0, -1).join('.');
        if (!rowList.some(x => x.codigo === parent))
          lista.push({ rowIdx: i, tipo: 'Aviso', descricao: `Grupo pai não encontrado: ${parent}` });
      }
      if (r.codigo) codigos.add(r.codigo);
    });
    return lista;
  }, [existingItems]);

  const parseFile = async (file) => {
    if (file.size > 25 * 1024 * 1024) {
      toast('Arquivo muito grande. Máximo: 25 MB', { tone: 'danger' });
      return;
    }
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const wb  = XLSX.read(buf, { type: 'array' });
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      const hdrIdx = raw.findIndex(r => r.some(c => String(c).trim()));
      if (hdrIdx === -1) return;
      const headers = raw[hdrIdx].map(c => String(c).toLowerCase().trim());
      const cols = {
        codigo:         detectCol(headers, 'codigo'),
        nome:           detectCol(headers, 'nome'),
        quantidade:     detectCol(headers, 'quantidade'),
        unidade:        detectCol(headers, 'unidade'),
        valor_unitario: detectCol(headers, 'valor_unitario'),
      };
      const parsed = raw.slice(hdrIdx + 1)
        .filter(r => r.some(c => String(c).trim()))
        .map((r, i) => ({
          rowIdx:         i,
          codigo:         String(r[cols.codigo]  ?? '').trim(),
          nome:           String(r[cols.nome]    ?? '').trim(),
          quantidade:     parseFloat(r[cols.quantidade])     || 0,
          unidade:        (String(r[cols.unidade] ?? 'UN').trim().toUpperCase().slice(0, 8)) || 'UN',
          valor_unitario: parseFloat(r[cols.valor_unitario]) || 0,
        }));
      setRows(parsed);
      setErros(validate(parsed, modo));
      setRemo(new Set());
      setStep(2);
    } finally {
      setParsing(false);
    }
  };

  const downloadTemplate = () => {
    const wb   = XLSX.utils.book_new();
    const data = [
      ['Código', 'Nome', 'Quantidade', 'Unidade', 'Valor Unitário'],
      ['001',       'Serviços Iniciais',      0,  '',   0    ],
      ['001.01',    'Projetos',               0,  '',   0    ],
      ['001.01.01', 'Projeto de Arquitetura', 1, 'VB', 15000],
      ['001.01.02', 'Projeto Estrutural',     1, 'VB', 12000],
      ['001.02',    'Licenças',               0,  '',   0    ],
      ['001.02.01', 'Alvará de Construção',   1, 'VB',  3000],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 14 }, { wch: 40 }, { wch: 12 }, { wch: 10 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Modelo');
    XLSX.writeFile(wb, 'modelo-orcamento.xlsx');
  };

  const visibleRows  = rows.filter(r => !removidos.has(r.rowIdx));
  const errosAtivos  = erros.filter(e => !removidos.has(e.rowIdx));
  const temErro      = errosAtivos.some(e => e.tipo === 'Erro');
  const qtdGrupos    = visibleRows.filter(r => visibleRows.some(x => x.codigo !== r.codigo && x.codigo.startsWith(r.codigo + '.'))).length;
  const qtdFolhas    = visibleRows.length - qtdGrupos;

  const handleConfirmar = () => {
    const validos  = visibleRows.filter(r => !errosAtivos.some(e => e.rowIdx === r.rowIdx && e.tipo === 'Erro'));
    const newItems = validos.map((r, i) => ({
      id:             'tmp-' + Math.random().toString(36).slice(2),
      orcamento_id:   orcamento.id,
      codigo:         r.codigo,
      nome:           r.nome,
      quantidade:     r.quantidade,
      unidade:        r.unidade,
      valor_unitario: r.valor_unitario,
      valor_total:    0,
      ordem:          i,
      _new:           true,
    }));
    onImport(newItems, modo);
    onClose();
  };

  const footer = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {[1, 2].map(s => (
          <div key={s} style={{ width: 8, height: 8, borderRadius: 4, background: step >= s ? 'var(--brand)' : 'var(--border-strong)' }} />
        ))}
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 }}>
          {step === 1 ? 'Carregar arquivo' : 'Revisar e confirmar'}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {step === 2 && <button className="btn btn-ghost" onClick={() => setStep(1)}>Voltar</button>}
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        {step === 2 && (
          <button
            className="btn btn-primary"
            onClick={handleConfirmar}
            disabled={temErro}
            title={temErro ? 'Corrija ou remova as linhas com erro antes de importar' : ''}
          >
            <Icon name="check" size={14} />
            Confirmar importação ({visibleRows.length} itens)
          </button>
        )}
      </div>
    </div>
  );

  return (
    <Modal
      title="Importar Base Orçamentária"
      subtitle={
        step === 1
          ? 'Carregue uma planilha Excel ou CSV'
          : `${visibleRows.length} linhas · ${errosAtivos.filter(e => e.tipo === 'Erro').length} erros · ${errosAtivos.filter(e => e.tipo === 'Aviso').length} avisos`
      }
      onClose={onClose}
      size="xl"
      footer={footer}
    >
      {/* Step 1 — Upload */}
      {step === 1 && (
        <div className="stack" style={{ gap: 20 }}>
          <div
            className={'import-dropzone' + (dragging ? ' over' : '')}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) parseFile(f); }}
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
              onChange={e => { if (e.target.files[0]) parseFile(e.target.files[0]); }} />
            {parsing ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Lendo arquivo…</div>
            ) : (
              <>
                <div style={{ fontSize: 36, marginBottom: 10 }}>📂</div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Clique ou arraste o arquivo aqui</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12.5, marginTop: 4 }}>
                  Aceita XLSX, XLS e CSV · colunas: Código, Nome, Quantidade, Unidade, Valor Unitário
                </div>
              </>
            )}
          </div>

          <div>
            <div style={{ fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)', marginBottom: 10 }}>
              Modo de importação
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              {[
                { val: 'substituir', label: 'Substituir itens existentes',   desc: 'Remove tudo e importa a planilha' },
                { val: 'adicionar',  label: 'Adicionar aos itens existentes', desc: 'Mantém itens atuais e adiciona os novos' },
              ].map(opt => (
                <label key={opt.val} style={{
                  flex: 1, border: '1px solid', cursor: 'pointer', borderRadius: 8, padding: '12px 14px',
                  borderColor: modo === opt.val ? 'var(--brand)' : 'var(--border)',
                  background:  modo === opt.val ? 'var(--brand-tint)' : 'var(--surface)',
                  transition: 'all .12s',
                }}>
                  <input type="radio" name="modo" value={opt.val} checked={modo === opt.val}
                    onChange={() => setModo(opt.val)} style={{ display: 'none' }} />
                  <div style={{ fontWeight: 600, fontSize: 13, color: modo === opt.val ? 'var(--brand)' : 'var(--text)' }}>
                    {opt.label}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{opt.desc}</div>
                </label>
              ))}
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn-ghost btn-sm" onClick={downloadTemplate}>
              <Icon name="download" size={13} />Baixar modelo de importação
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Modelo com colunas obrigatórias e exemplos de hierarquia
            </span>
          </div>
        </div>
      )}

      {/* Step 2 — Preview + erros */}
      {step === 2 && (
        <div className="stack" style={{ gap: 16 }}>
          {/* KPIs de resumo */}
          <div style={{ display: 'flex', gap: 12 }}>
            {[
              { label: 'Total',    val: visibleRows.length },
              { label: 'Grupos',   val: qtdGrupos },
              { label: 'Folhas',   val: qtdFolhas },
              { label: 'Erros',    val: errosAtivos.filter(e => e.tipo === 'Erro').length,  color: '#dc2626' },
              { label: 'Avisos',   val: errosAtivos.filter(e => e.tipo === 'Aviso').length, color: '#d97706' },
            ].map((s, i) => (
              <div key={i} style={{
                flex: 1, padding: '10px 14px', borderRadius: 8, textAlign: 'center',
                background: 'var(--surface-muted)', border: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: s.color || 'var(--text)' }}>{s.val}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Grade de erros */}
          {errosAtivos.length > 0 && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ padding: '8px 14px', fontWeight: 600, fontSize: 12, background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)' }}>
                Problemas encontrados
              </div>
              <table className="tbl" style={{ fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>Linha</th>
                    <th style={{ width: 70 }}>Tipo</th>
                    <th>Descrição</th>
                    <th style={{ width: 100 }}>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {errosAtivos.map((e, i) => (
                    <tr key={i}>
                      <td className="mono">{e.rowIdx + 2}</td>
                      <td>
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                          background: e.tipo === 'Erro' ? '#fef2f2' : '#fffbeb',
                          color: e.tipo === 'Erro' ? '#dc2626' : '#d97706',
                        }}>
                          {e.tipo}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-soft)' }}>{e.descricao}</td>
                      <td>
                        <button className="btn btn-sm btn-ghost" style={{ fontSize: 11, padding: '2px 8px', color: '#dc2626' }}
                          onClick={() => setRemo(prev => new Set([...prev, e.rowIdx]))}>
                          Remover linha
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pré-visualização */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '8px 14px', fontWeight: 600, fontSize: 12, background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0 }}>
              Pré-visualização ({visibleRows.length} linhas)
            </div>
            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
              <table className="tbl" style={{ fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <th style={{ width: 110 }}>Código</th>
                    <th>Nome</th>
                    <th className="right" style={{ width: 90 }}>Quantidade</th>
                    <th style={{ width: 60 }}>Un.</th>
                    <th className="right" style={{ width: 110 }}>Valor Unit.</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r, i) => {
                    const hasErro  = errosAtivos.some(e => e.rowIdx === r.rowIdx && e.tipo === 'Erro');
                    const hasAviso = errosAtivos.some(e => e.rowIdx === r.rowIdx && e.tipo === 'Aviso');
                    const indent   = (r.codigo.split('.').length - 1) * 14;
                    return (
                      <tr key={i} className={hasErro ? 'import-err-row' : hasAviso ? 'import-warn-row' : ''}>
                        <td className="mono" style={{ fontSize: 11.5 }}>{r.codigo}</td>
                        <td style={{ paddingLeft: indent + 10 }}>{r.nome || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                        <td className="right mono">{r.quantidade || '—'}</td>
                        <td>{r.unidade}</td>
                        <td className="right mono">{r.valor_unitario ? brlFull(r.valor_unitario) : '—'}</td>
                        <td>
                          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, padding: '0 4px' }}
                            title="Remover linha"
                            onClick={() => setRemo(prev => new Set([...prev, r.rowIdx]))}>×</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {temErro && (
            <div style={{ padding: '10px 14px', background: '#fef2f2', borderRadius: 8, fontSize: 13, color: '#dc2626', border: '1px solid #fecaca' }}>
              Corrija ou remova as linhas com <strong>Erro</strong> antes de confirmar.
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

// Célula numérica isolada: mantém o texto em edição em estado LOCAL, então digitar
// não re-renderiza a tabela inteira. Só comunica o pai (onCommit) ao sair do campo.
const NumericCell = React.memo(({ value, displayValue, onCommit, placeholder }) => {
  const [draft, setDraft] = React.useState(null); // null = não está em edição
  return (
    <input
      className="orca-cell-input right"
      inputMode="decimal"
      value={draft != null ? draft : displayValue}
      onFocus={() => setDraft(value ? String(value).replace('.', ',') : '')}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { onCommit(draft ?? ''); setDraft(null); }}
      placeholder={placeholder}
    />
  );
});

// Colunas da composição orçamentária + larguras padrão (px). Ordem fixa.
const ORCA_COLS = [
  { id: 'codigo', label: 'Código',      defWidth: 140 },
  { id: 'nome',   label: 'Nome',        defWidth: 300 },
  { id: 'quant',  label: 'Quant.',      defWidth: 100, right: true },
  { id: 'un',     label: 'Un.',         defWidth: 60 },
  { id: 'vunit',  label: 'Valor Unit.', defWidth: 110, right: true },
  { id: 'vtotal', label: 'Valor Total', defWidth: 120, right: true },
  { id: 'acoes',  label: '',            defWidth: 104 },
];

const OrcamentoDetalhe = ({ orcamento, onBack, user, userProfile }) => {
  const toast         = useToast();
  const readOnly       = moduloSomenteLeitura(userProfile, 'orcamentos');
  const [items, setItems]           = React.useState([]);
  const [deletedIds, setDeletedIds] = React.useState([]);
  const [dirty, setDirty]           = React.useState(false);
  const [showImport, setShowImport] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState(null); // item aguardando confirmação de exclusão

  // Formata número com separadores pt-BR (ex: 1.234,56)
  const fmtNum = (n, dec = 2) =>
    (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

  // Converte string pt-BR de volta para float (1.234,56 → 1234.56)
  const parseNum = (s) =>
    parseFloat(String(s).replace(/\./g, '').replace(',', '.')) || 0;
  const [saving, setSaving]         = React.useState(false);
  const [collapsed, setCollapsed]   = React.useState(new Set());
  const [showClearAll, setShowClearAll] = React.useState(false);
  const [clearing, setClearing]     = React.useState(false);
  const [exportingPDF, setExportingPDF] = React.useState(false);

  // Larguras de coluna ajustáveis (por orçamento, persistidas no navegador)
  const [colWidths, setColWidths] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem(`ls_orca_widths_${orcamento.id}`) || 'null') || {}; }
    catch { return {}; }
  });
  React.useEffect(() => {
    try { localStorage.setItem(`ls_orca_widths_${orcamento.id}`, JSON.stringify(colWidths)); } catch { /* ignore */ }
  }, [colWidths, orcamento.id]);
  const getColW = (id) => colWidths[id] ?? ORCA_COLS.find(c => c.id === id)?.defWidth ?? 100;
  const tableWidth = ORCA_COLS.reduce((s, c) => s + getColW(c.id), 0);
  const startColResize = (ev, id) => {
    ev.preventDefault(); ev.stopPropagation();
    const startX = ev.clientX;
    const startW = getColW(id);
    const onMove = (e2) => setColWidths(prev => ({ ...prev, [id]: Math.max(50, startW + e2.clientX - startX) }));
    const onUp   = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  React.useEffect(() => {
    if (_itensCache[orcamento.id]) { setItems(_itensCache[orcamento.id]); return; }
    orcamentosService.itens.listar(orcamento.id).then(({ data, error }) => {
      if (!error && data && data.length > 0) { _itensCache[orcamento.id] = data; setItems(data); }
    });
  }, [orcamento.id]);

  // ── Utilitários de hierarquia ──────────────────────────────────────────────
  const getNivel = (codigo) => (codigo.match(/\./g) || []).length;

  // Conjunto de códigos que são "pais" (têm filhos), pré-computado em O(n).
  // Substitui isParent() O(n)-por-linha, que tornava o render O(n²).
  const parentSet = React.useMemo(() => {
    const s = new Set();
    for (const it of items) {
      const parts = it.codigo.split('.');
      for (let i = 1; i < parts.length; i++) s.add(parts.slice(0, i).join('.'));
    }
    return s;
  }, [items]);

  // Calcula totais bottom-up: folha = qty × unit; grupo = soma dos filhos diretos
  const calcTotals = (list) => {
    const map = {};
    [...list]
      .sort((a, b) => getNivel(b.codigo) - getNivel(a.codigo))
      .forEach(it => {
        if (parentSet.has(it.codigo)) {
          const children = list.filter(ch =>
            ch.codigo.startsWith(it.codigo + '.') &&
            getNivel(ch.codigo) === getNivel(it.codigo) + 1
          );
          map[it.codigo] = children.reduce((s, ch) => s + (map[ch.codigo] ?? 0), 0);
        } else {
          map[it.codigo] = (Number(it.quantidade) || 0) * (Number(it.valor_unitario) || 0);
        }
      });
    return list.map(it => ({ ...it, valor_total: map[it.codigo] ?? it.valor_total ?? 0 }));
  };

  const withTotals = React.useMemo(() => calcTotals(items), [items, parentSet]);

  // Próximo código de mesmo nível (irmão seguinte)
  const nextCode = (refCodigo, list) => {
    const parts  = refCodigo.split('.');
    const parent = parts.slice(0, -1).join('.');
    const nivel  = getNivel(refCodigo);
    const siblings = list
      .filter(it =>
        getNivel(it.codigo) === nivel &&
        it.codigo.split('.').slice(0, -1).join('.') === parent
      )
      .map(it => parseInt(it.codigo.split('.').pop(), 10))
      .filter(n => !isNaN(n));
    const next     = siblings.length ? Math.max(...siblings) + 1 : 1;
    const prefix   = parent ? parent + '.' : '';
    // Preserva a largura do último segmento do código de referência (001→3, 01→2)
    const padWidth = parts[parts.length - 1].length;
    return prefix + String(next).padStart(padWidth, '0');
  };

  // Linha visível se nenhum ancestral estiver colapsado
  const isVisible = (codigo) => {
    const parts = codigo.split('.');
    for (let i = 1; i < parts.length; i++) {
      if (collapsed.has(parts.slice(0, i).join('.'))) return false;
    }
    return true;
  };

  // Pré-computa itens visíveis para evitar re-cálculo por linha no render
  const visibleItems = React.useMemo(() => {
    if (!collapsed.size) return withTotals;
    return withTotals.filter(it => isVisible(it.codigo));
  }, [withTotals, collapsed]);

  // Colapsa todos os grupos no nível maxNivel; -1 = expandir tudo
  const collapseToLevel = (maxNivel) => {
    if (maxNivel < 0) { setCollapsed(new Set()); return; }
    const next = new Set();
    items.forEach(it => {
      if (getNivel(it.codigo) === maxNivel && parentSet.has(it.codigo))
        next.add(it.codigo);
    });
    setCollapsed(next);
  };

  // ── Operações de linha ─────────────────────────────────────────────────────
  const editCell = (id, field, value) => {
    setItems(prev => prev.map(it =>
      it.id === id ? { ...it, [field]: value, _dirty: true } : it
    ));
    setDirty(true);
  };

  const makeNewRow = (codigo, ordem) => ({
    id: 'tmp-' + Math.random().toString(36).slice(2),
    orcamento_id: orcamento.id,
    codigo,
    nome: '',
    quantidade: 0,
    unidade: 'UN',
    valor_unitario: 0,
    valor_total: 0,
    ordem,
    _new: true,
  });

  const addBelow = (refCodigo) => {
    const ref = items.find(it => it.codigo === refCodigo);
    // Avança além de todos os descendentes para inserir após a subárvore inteira
    let insertIdx = items.findIndex(it => it.codigo === refCodigo);
    while (
      insertIdx + 1 < items.length &&
      items[insertIdx + 1].codigo.startsWith(refCodigo + '.')
    ) {
      insertIdx++;
    }
    const newRow = makeNewRow(nextCode(refCodigo, items), (ref?.ordem ?? 0) + 1);
    setItems(prev => { const n = [...prev]; n.splice(insertIdx + 1, 0, newRow); return n; });
    setDirty(true);
  };

  const addAbove = (refCodigo) => {
    const parts    = refCodigo.split('.');
    const parent   = parts.slice(0, -1).join('.');
    const refNum   = parseInt(parts[parts.length - 1], 10);
    const padWidth = parts[parts.length - 1].length;
    const nivel    = getNivel(refCodigo);

    // Renumera todos os itens cujo segmento no nível `nivel` (mesmo pai) for >= refNum
    // Isso inclui o próprio item de referência e seus descendentes
    const renumber = (list) => list.map(it => {
      const seg = it.codigo.split('.');
      if (seg.length <= nivel) return it;
      const segAtNivel  = parseInt(seg[nivel], 10);
      const sameParent  = seg.slice(0, nivel).join('.') === (parent || '');
      if (sameParent && segAtNivel >= refNum) {
        const newSeg = [...seg];
        newSeg[nivel] = String(segAtNivel + 1).padStart(padWidth, '0');
        return { ...it, codigo: newSeg.join('.'), _dirty: !it._new };
      }
      return it;
    });

    const idx    = items.findIndex(it => it.codigo === refCodigo);
    const ref    = items[idx];
    const newRow = makeNewRow(refCodigo, (ref?.ordem ?? 1) - 1);

    setItems(prev => {
      const renumbered = renumber(prev);
      const n = [...renumbered];
      n.splice(idx, 0, newRow);
      return n;
    });
    setDirty(true);
  };

  const addChild = (parentCodigo) => {
    // Próximo filho direto de parentCodigo
    const childNivel = getNivel(parentCodigo) + 1;
    const existingChildren = items.filter(it =>
      getNivel(it.codigo) === childNivel &&
      it.codigo.startsWith(parentCodigo + '.')
    );
    const nums = existingChildren
      .map(it => parseInt(it.codigo.split('.').pop(), 10))
      .filter(n => !isNaN(n));
    const next = nums.length ? Math.max(...nums) + 1 : 1;
    const newCode = parentCodigo + '.' + String(next).padStart(2, '0');

    // Insere após o último filho existente ou logo após o pai
    const parentIdx = items.findIndex(it => it.codigo === parentCodigo);
    const lastChildIdx = existingChildren.length
      ? Math.max(...existingChildren.map(ch => items.findIndex(it => it.codigo === ch.codigo)))
      : parentIdx;

    const ref = items[lastChildIdx];
    const newRow = makeNewRow(newCode, (ref?.ordem ?? 0) + 1);
    setItems(prev => { const n = [...prev]; n.splice(lastChildIdx + 1, 0, newRow); return n; });
    // Garante que o pai fique expandido
    setCollapsed(prev => { const next = new Set(prev); next.delete(parentCodigo); return next; });
    setDirty(true);
  };

  // Pede confirmação antes de excluir quando o item (ou seus filhos) tem quantidade lançada
  const requestRemove = (codigo) => {
    const afetados = items.filter(it => it.codigo === codigo || it.codigo.startsWith(codigo + '.'));
    const temQuantidade = afetados.some(it => Number(it.quantidade) > 0);
    if (!temQuantidade) {
      removeRow(codigo); // sem quantidade: exclui direto, como antes
      return;
    }
    const item = items.find(it => it.codigo === codigo);
    setPendingDelete({
      codigo,
      nome: item?.nome || '',
      quantidade: item?.quantidade,
      unidade: item?.unidade,
      isGrupo: afetados.length > 1,
    });
  };

  const removeRow = (codigo) => {
    // Rastreia IDs de itens já salvos no banco para deletar no próximo save
    const toDelete = items
      .filter(it => it.codigo === codigo || it.codigo.startsWith(codigo + '.'))
      .filter(it => !it._new)
      .map(it => it.id);
    if (toDelete.length) setDeletedIds(prev => [...prev, ...toDelete]);

    setItems(prev => prev.filter(it =>
      it.codigo !== codigo && !it.codigo.startsWith(codigo + '.')
    ));
    setDirty(true);
  };

  const discardChanges = () => {
    orcamentosService.itens.listar(orcamento.id).then(({ data }) => {
      if (data && data.length > 0) { _itensCache[orcamento.id] = data; setItems(data); }
    });
    setDeletedIds([]);
    setDirty(false);
  };

  // Importação grava direto no banco — não exige clicar em "Salvar alterações"
  const handleImport = async (newItems, modo) => {
    // Em "substituir", remove os itens já persistidos antes de inserir os novos
    const idsToDelete = modo === 'substituir'
      ? items.filter(it => !it._new).map(it => it.id)
      : [];
    // Omitir id (DB gera) e user_id (coluna inexistente em orcamento_itens)
    const toInsert = newItems.map(({ _new, _dirty, id, user_id, ...rest }) => rest);

    setSaving(true);
    try {
      // 1) Substituir: deleta os antigos primeiro (evita conflito de código duplicado)
      if (idsToDelete.length) {
        const { error } = await orcamentosService.itens.excluirVarios(idsToDelete);
        if (error) {
          console.error('[orcamento] erro ao substituir itens na importação', error);
          toast('Erro ao substituir itens: ' + error.message, { tone: 'error', icon: 'alert' });
          setSaving(false);
          return; // nada foi alterado no banco
        }
        setDeletedIds([]);
      }

      // 2) Insere os itens importados
      if (toInsert.length) {
        const { error } = await orcamentosService.itens.criar(toInsert);
        if (error) {
          console.error('[orcamento] erro ao inserir itens na importação', error);
          toast('Erro ao importar itens: ' + error.message, { tone: 'error', icon: 'alert' });
          // Mantém os novos itens em memória (pendentes) para retry via "Salvar alterações"
          if (modo === 'substituir') setItems(newItems);
          else setItems(prev => [...prev, ...newItems]);
          setDirty(true);
          setSaving(false);
          return;
        }
      }

      // 3) Recarrega do banco para refletir os IDs reais
      const { data } = await orcamentosService.itens.listar(orcamento.id);
      const loaded = data && data.length > 0 ? data : [];
      _itensCache[orcamento.id] = loaded;
      setItems(loaded);
      setDeletedIds([]);
      setDirty(false);

      // 4) Atualiza o valor total no cabeçalho do orçamento
      const grandTotal = calcTotals(loaded)
        .filter(it => getNivel(it.codigo) === 0)
        .reduce((s, it) => s + it.valor_total, 0);
      const { error: errHeader } = await orcamentosService.atualizar(orcamento.id, { valor: grandTotal });
      if (errHeader) console.error('[orcamento] erro ao atualizar total do orçamento', errHeader);

      toast(`${toInsert.length} itens importados e salvos`, { tone: 'success', icon: 'check' });
    } catch (e) {
      console.error('[orcamento] falha inesperada na importação', e);
      toast('Erro ao importar: ' + (e?.message || e), { tone: 'error', icon: 'alert' });
    } finally {
      setSaving(false);
    }
  };

  // ── Salvar no DB ───────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      // Itens novos: omitir `id` (DB gera) e `user_id` (orcamento_itens não tem essa coluna)
      const toInsert = items
        .filter(it => it._new)
        .map(({ _new, _dirty, id, user_id, ...rest }) => rest);

      // Itens existentes editados: UPDATE individual por id
      // (upsert falha com colunas GENERATED ALWAYS AS IDENTITY)
      const toUpdate = items
        .filter(it => !it._new && it._dirty)
        .map(({ _new, _dirty, user_id, ...rest }) => rest);

      // 1) Insere os novos itens ANTES de qualquer exclusão — assim uma falha
      //    aqui não deixa o orçamento vazio (a exclusão só roda após sucesso).
      if (toInsert.length) {
        const { error } = await orcamentosService.itens.criar(toInsert);
        if (error) {
          console.error('[orcamento] erro ao inserir itens', error);
          toast('Erro ao inserir itens: ' + error.message, { tone: 'error', icon: 'alert' });
          setSaving(false);
          return;
        }
      }

      // 2) Atualiza os itens editados
      if (toUpdate.length) {
        const resultados = await Promise.all(
          toUpdate.map(({ id, ...dados }) => orcamentosService.itens.atualizar(id, dados))
        );
        const falha = resultados.find(r => r.error);
        if (falha) {
          console.error('[orcamento] erro ao atualizar itens', falha.error);
          toast('Erro ao atualizar itens: ' + falha.error.message, { tone: 'error', icon: 'alert' });
          setSaving(false);
          return;
        }
      }

      // 3) Só agora exclui do banco os itens removidos localmente
      if (deletedIds.length) {
        const { error } = await orcamentosService.itens.excluirVarios(deletedIds);
        if (error) {
          console.error('[orcamento] erro ao excluir itens', error);
          toast('Erro ao excluir itens: ' + error.message, { tone: 'error', icon: 'alert' });
          setSaving(false);
          return;
        }
        setDeletedIds([]);
      }

      // 4) Atualiza valor total do cabeçalho do orçamento
      const grandTotal = withTotals
        .filter(it => getNivel(it.codigo) === 0)
        .reduce((s, it) => s + it.valor_total, 0);
      const { error: errHeader } = await orcamentosService.atualizar(orcamento.id, { valor: grandTotal });
      if (errHeader) {
        console.error('[orcamento] erro ao atualizar total do orçamento', errHeader);
        toast('Erro ao atualizar total do orçamento: ' + errHeader.message, { tone: 'error', icon: 'alert' });
        setSaving(false);
        return;
      }

      // 5) Recarrega do banco para refletir os IDs reais (substitui os tmp-…)
      const { data } = await orcamentosService.itens.listar(orcamento.id);
      if (data && data.length > 0) { _itensCache[orcamento.id] = data; setItems(data); }
      else { delete _itensCache[orcamento.id]; setItems(prev => prev.map(({ _new, _dirty, ...rest }) => rest)); }

      setDirty(false);
      toast('Itens salvos com sucesso', { tone: 'success', icon: 'check' });
    } catch (e) {
      console.error('[orcamento] falha inesperada ao salvar', e);
      toast('Erro ao salvar: ' + (e?.message || e), { tone: 'error', icon: 'alert' });
    } finally {
      setSaving(false);
    }
  };

  // ── Limpar itens ─────────────────────────────────────────────────────────────
  // Remove todos os itens da composição, mantendo o orçamento (fica vazio).
  const handleClearAll = async () => {
    setClearing(true);
    try {
      // Itens já persistidos no banco: excluir via serviço (registra auditoria)
      const idsToDelete = items.filter(it => !it._new).map(it => it.id);
      if (idsToDelete.length) {
        const { error } = await orcamentosService.itens.excluirVarios(idsToDelete);
        if (error) {
          console.error('[orcamento] erro ao limpar itens', error);
          toast('Erro ao limpar itens: ' + error.message, { tone: 'error', icon: 'alert' });
          setClearing(false);
          return;
        }
      }

      // Zera o total no cabeçalho do orçamento
      const { error: errHeader } = await orcamentosService.atualizar(orcamento.id, { valor: 0 });
      if (errHeader) console.error('[orcamento] erro ao zerar total do orçamento', errHeader);

      delete _itensCache[orcamento.id];
      setItems([]);
      setDeletedIds([]);
      setDirty(false);
      setShowClearAll(false);
      toast('Todos os itens foram removidos', { tone: 'success', icon: 'check' });
    } catch (e) {
      console.error('[orcamento] falha inesperada ao limpar itens', e);
      toast('Erro ao limpar itens: ' + (e?.message || e), { tone: 'error', icon: 'alert' });
    } finally {
      setClearing(false);
    }
  };

  const handleExportPDF = async () => {
    if (!withTotals.length) { toast('Nada para exportar', { tone: 'neutral', icon: 'alert' }); return; }
    setExportingPDF(true);
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const BRAND = [28, 69, 132]; // #1C4584 (identidade Soter)
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();
      doc.setFontSize(14); doc.text(`Orçamento ${orcamento.id} (${orcamento.versao || 'v1'})`, 14, 14);
      doc.setFontSize(9); doc.setTextColor(120);
      doc.text(`${orcamento.obra || orcamento.cliente || ''} · Gerado em ${new Date().toLocaleDateString('pt-BR')}`, 14, 20);
      doc.setTextColor(0);
      const grupo = (it) => parentSet.has(it.codigo);
      const body = withTotals.map(it => ({
        _g: grupo(it),
        vals: [
          '  '.repeat(getNivel(it.codigo)) + it.codigo,
          it.nome || '—',
          grupo(it) ? '—' : fmtNum(it.quantidade),
          grupo(it) ? '' : (it.unidade || '—'),
          grupo(it) ? '—' : fmtNum(it.valor_unitario),
          brlFull(it.valor_total),
        ],
      }));
      autoTable(doc, {
        startY: 25,
        head: [['Código', 'Nome', 'Quant.', 'Un.', 'Valor Unit.', 'Valor Total']],
        body: body.map(r => r.vals),
        foot: [['', 'Total', '', '', '', brlFull(grandTotal)]],
        theme: 'grid',
        headStyles: { fillColor: BRAND, textColor: 255, fontSize: 8, fontStyle: 'bold' },
        bodyStyles: { fontSize: 7.5, textColor: 40 },
        alternateRowStyles: { fillColor: [248, 249, 250] },
        footStyles: { fillColor: [225, 232, 242], fontStyle: 'bold', fontSize: 8 },
        columnStyles: { 2: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
        margin: { top: 25, right: 14, bottom: 14, left: 14 },
        didParseCell: (data) => {
          if (data.section === 'body' && body[data.row.index]?._g) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [232, 240, 252];
            data.cell.styles.textColor = 20;
          }
        },
        didDrawPage: ({ pageNumber }) => {
          doc.setFontSize(8); doc.setTextColor(150);
          doc.text(`Página ${pageNumber}`, W - 20, H - 6);
          doc.setTextColor(0);
        },
      });
      doc.save(`orcamento-${orcamento.id}-${orcamento.versao || 'v1'}.pdf`);
      toast('PDF exportado', { tone: 'success', icon: 'check' });
    } catch (e) {
      toast('Erro ao exportar PDF: ' + (e?.message || e), { tone: 'error', icon: 'alert' });
    } finally {
      setExportingPDF(false);
    }
  };

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const grandTotal  = React.useMemo(() => withTotals.filter(it => getNivel(it.codigo) === 0).reduce((s, it) => s + it.valor_total, 0), [withTotals]);

  // Seções de nível 1 para Curva ABC
  return (
    <>
      {/* Cabeçalho */}
      <div className="page-header" style={{ marginBottom: 12 }}>
        <div>
          <button className="btn btn-sm btn-ghost" onClick={onBack} style={{ marginBottom: 8 }}>
            <Icon name="chevron-left" size={13} />Orçamentos
          </button>
          <div className="row" style={{ gap: 10 }}>
            <h1 className="page-title">{orcamento.id}</h1>
            <span className="badge neutral mono">{orcamento.versao}</span>
          </div>
          <div className="page-subtitle">{orcamento.obra} · {orcamento.cliente} · atualizado em {orcamento.data}</div>
        </div>
        <div className="page-actions">
          {!readOnly && (
            <button
              className="btn btn-ghost"
              onClick={() => setShowClearAll(true)}
              disabled={clearing || items.length === 0}
              title={items.length === 0 ? 'Não há itens para limpar' : 'Remover todos os itens deste orçamento'}
            >
              <Icon name="trash" size={15} />
              {clearing ? 'Limpando…' : 'Limpar itens'}
            </button>
          )}
          <button className="btn btn-ghost" onClick={handleExportPDF} disabled={exportingPDF}>
            <Icon name="download" size={15} />{exportingPDF ? 'Exportando…' : 'Exportar PDF'}
          </button>
          {orcamento.status === 'pendente' && !readOnly && (
            <button className="btn btn-primary"><Icon name="check" size={15} />Aprovar</button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <div className="kpi" style={{ padding: '14px 18px' }}>
          <div className="kpi-label">Valor total</div>
          <div className="kpi-value num" style={{ fontSize: 20, marginTop: 6, color: 'var(--brand)' }}>{brlFull(grandTotal)}</div>
        </div>
        <div className="kpi" style={{ padding: '14px 18px' }}>
          <div className="kpi-label">Itens cadastrados</div>
          <div className="kpi-value num" style={{ fontSize: 20, marginTop: 6 }}>{items.filter(it => !parentSet.has(it.codigo)).length}</div>
          <div className="kpi-foot" style={{ marginTop: 4 }}>
            <span className="kpi-foot-text">{items.length} total (incluindo grupos)</span>
          </div>
        </div>
      </div>

      {/* Composição */}
      <div style={{ marginTop: 'var(--gap)' }}>
        {/* Tabela de itens */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-header">
            <div>
              <div className="card-title">Composição orçamentária</div>
              <div className="card-subtitle">
                {items.length === 0
                  ? 'Nenhum item. Use + abaixo para adicionar.'
                  : `${items.length} itens · clique para editar`}
              </div>
            </div>
            <div className="card-actions">
              <div style={{ display: 'flex', gap: 2, marginRight: 4 }}>
                {[
                  { label: 'N1', title: 'Mostrar só grupos raiz (001…)',    nivel: 0  },
                  { label: 'N2', title: 'Mostrar até nível 2 (001.01…)',    nivel: 1  },
                  { label: 'N3', title: 'Mostrar até nível 3 (001.01.01…)', nivel: 2  },
                  { label: '≡',  title: 'Expandir tudo',                    nivel: -1 },
                ].map(b => (
                  <button
                    key={b.label}
                    className="orca-row-btn"
                    title={b.title}
                    style={{ width: 26, height: 24, fontSize: 11, fontWeight: 600 }}
                    onClick={() => collapseToLevel(b.nivel)}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
              {!readOnly && (
              <button className="btn btn-sm btn-ghost" onClick={() => setShowImport(true)}>
                <Icon name="download" size={13} />Importar
              </button>
              )}
              {!readOnly && (
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  let newCode;
                  if (items.length === 0) {
                    // Lista vazia: primeira tarefa é sempre a raiz 001
                    newCode = '001';
                  } else {
                  // Detecta o próximo grupo de nível 1 (ex: 001.01 → 001.02)
                  const level1 = items.filter(it => getNivel(it.codigo) === 1);
                  if (level1.length === 0) {
                    // Sem grupos nível 1: usa raiz existente ou '001' como base
                    const root = items.find(it => getNivel(it.codigo) === 0);
                    newCode = (root?.codigo ?? '001') + '.01';
                  } else {
                    // Próximo irmão após o último grupo nível 1
                    const last = [...level1].sort((a, b) => {
                      const an = parseInt(a.codigo.split('.').pop(), 10);
                      const bn = parseInt(b.codigo.split('.').pop(), 10);
                      return bn - an;
                    })[0];
                    newCode = nextCode(last.codigo, items);
                  }
                  } // fecha else (items não vazio)
                  const newRow = makeNewRow(newCode, items.length);
                  setItems(prev => [...prev, newRow]);
                  setDirty(true);
                }}
              >
                <Icon name="plus" size={13} />Novo item
              </button>
              )}
            </div>
          </div>
          <div className="card-body flush" style={{ overflowX: 'auto' }}>
            <table className="orca-table" style={{ tableLayout: 'fixed', width: tableWidth, minWidth: '100%' }}>
              <thead>
                <tr>
                  {ORCA_COLS.map(col => {
                    const w = getColW(col.id);
                    return (
                      <th key={col.id} className={col.right ? 'right' : undefined}
                        style={{ width: w, minWidth: w, position: 'relative', userSelect: 'none', borderRight: '1px solid var(--border)' }}>
                        {col.label}
                        <div className="orca-col-grip" title="Arraste para redimensionar"
                          onMouseDown={(ev) => startColResize(ev, col.id)} />
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((it) => {
                    const nivel     = getNivel(it.codigo);
                    const hasKids   = parentSet.has(it.codigo);
                    const isOpen    = !collapsed.has(it.codigo);
                    const indent    = nivel * 18;

                    return (
                      <tr
                        key={it.id}
                        className={`orca-row level-${nivel}${hasKids ? ' is-group' : ''}`}
                      >
                        {/* Código */}
                        <td style={{ paddingLeft: indent + 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {hasKids ? (
                              <button
                                className={'orca-toggle' + (isOpen ? ' open' : '')}
                                onClick={() => setCollapsed(prev => {
                                  const next = new Set(prev);
                                  next.has(it.codigo) ? next.delete(it.codigo) : next.add(it.codigo);
                                  return next;
                                })}
                              >
                                <Icon name="chevron-right" size={12} />
                              </button>
                            ) : (
                              <span style={{ width: 16, flexShrink: 0 }} />
                            )}
                            {/* Código é gerado pelo sistema (novo item / sub-itens), não editável manualmente */}
                            <span
                              className="orca-cell-code"
                              style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: 2, fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5, color: 'var(--text-soft)' }}
                            >
                              {it.codigo}
                            </span>
                          </div>
                        </td>

                        {/* Nome */}
                        <td>
                          {readOnly ? (
                            <span style={{ fontSize: 13 }}>{it.nome || '—'}</span>
                          ) : (
                            <input
                              className="orca-cell-input"
                              value={it.nome || ''}
                              placeholder={hasKids ? 'Nome do grupo…' : 'Nome do item…'}
                              onChange={e => editCell(it.id, 'nome', e.target.value)}
                            />
                          )}
                        </td>

                        {/* Quantidade */}
                        <td className="right">
                          {hasKids ? <span className="text-muted" style={{ fontSize: 11 }}>—</span>
                          : readOnly ? <span className="mono">{fmtNum(it.quantidade)}</span>
                          : (
                            <NumericCell
                              value={it.quantidade}
                              displayValue={fmtNum(it.quantidade)}
                              onCommit={(raw) => editCell(it.id, 'quantidade', parseNum(raw))}
                              placeholder="0,00"
                            />
                          )}
                        </td>

                        {/* Unidade */}
                        <td>
                          {hasKids ? null
                          : readOnly ? <span className="mono">{it.unidade || '—'}</span>
                          : (
                            <input
                              className="orca-cell-input"
                              value={it.unidade || ''}
                              placeholder="UN"
                              maxLength={8}
                              onChange={e => editCell(it.id, 'unidade', e.target.value.toUpperCase())}
                              style={{ width: '100%', textTransform: 'uppercase' }}
                            />
                          )}
                        </td>

                        {/* Valor Unitário */}
                        <td className="right">
                          {hasKids ? <span className="text-muted" style={{ fontSize: 11 }}>—</span>
                          : readOnly ? <span className="mono">{fmtNum(it.valor_unitario)}</span>
                          : (
                            <NumericCell
                              value={it.valor_unitario}
                              displayValue={fmtNum(it.valor_unitario)}
                              onCommit={(raw) => editCell(it.id, 'valor_unitario', parseNum(raw))}
                              placeholder="0,00"
                            />
                          )}
                        </td>

                        {/* Valor Total (calculado) */}
                        <td className="right mono" style={{ fontWeight: hasKids ? 600 : 500, color: nivel === 0 ? 'var(--brand)' : 'inherit' }}>
                          {brlFull(it.valor_total)}
                        </td>

                        {/* Ações */}
                        <td>
                          {!readOnly && (
                            <div className="orca-row-actions">
                              {nivel > 0 && (
                                <button
                                  className="orca-row-btn"
                                  title="Inserir acima (mesmo nível)"
                                  onClick={() => addAbove(it.codigo)}
                                >↑+</button>
                              )}
                              <button
                                className="orca-row-btn"
                                title="Inserir abaixo (mesmo nível)"
                                onClick={() => addBelow(it.codigo)}
                              >↓+</button>
                              {nivel < 3 && (
                                <button
                                  className="orca-row-btn"
                                  title="Inserir subgrupo (nível filho)"
                                  onClick={() => addChild(it.codigo)}
                                >→+</button>
                              )}
                              <button
                                className="orca-row-btn danger"
                                title="Remover linha (e filhos)"
                                onClick={() => requestRemove(it.codigo)}
                              >×</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)' }}>
                      Nenhum item cadastrado. Clique em "Novo item" para começar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Barra de salvar sticky */}
            {dirty && (
              <div className="orca-save-bar">
                <button className="btn btn-ghost" onClick={discardChanges}>Descartar</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                  <Icon name="check" size={14} />
                  {saving ? 'Salvando…' : 'Salvar alterações'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showImport && (
        <ImportarOrcamentoModal
          orcamento={orcamento}
          user={user}
          existingItems={items}
          onImport={handleImport}
          onClose={() => setShowImport(false)}
        />
      )}

      {pendingDelete && (
        <Modal
          title="Excluir item"
          onClose={() => setPendingDelete(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setPendingDelete(null)}>Cancelar</button>
              <button
                className="btn"
                style={{ background: 'var(--danger)', color: 'white', fontWeight: 600 }}
                onClick={() => { removeRow(pendingDelete.codigo); setPendingDelete(null); }}
              >
                Sim, excluir
              </button>
            </>
          }
        >
          <p style={{ fontSize: 14 }}>
            {pendingDelete.isGrupo ? (
              <>O grupo <strong>{pendingDelete.codigo}{pendingDelete.nome ? ` · ${pendingDelete.nome}` : ''}</strong> contém itens com quantidade lançada, que também serão removidos.</>
            ) : (
              <>O item <strong>{pendingDelete.codigo}{pendingDelete.nome ? ` · ${pendingDelete.nome}` : ''}</strong> tem <strong>{fmtNum(pendingDelete.quantidade)} {pendingDelete.unidade || ''}</strong> lançado.</>
            )}
            {' '}Tem certeza que deseja excluir?
          </p>
        </Modal>
      )}

      {showClearAll && (
        <Modal
          title="Limpar todos os itens"
          onClose={() => setShowClearAll(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setShowClearAll(false)}>Cancelar</button>
              <button
                className="btn"
                style={{ background: 'var(--danger)', color: 'white', fontWeight: 600 }}
                onClick={handleClearAll}
                disabled={clearing}
              >
                {clearing ? 'Limpando…' : 'Sim, limpar tudo'}
              </button>
            </>
          }
        >
          <p style={{ fontSize: 14 }}>
            Esta ação remove <strong>todos os {items.length} itens</strong> da composição do
            orçamento <strong>{orcamento.id}</strong> e é{' '}
            <strong style={{ color: 'var(--danger)' }}>irreversível</strong>.
            O orçamento é mantido, mas ficará sem itens.
          </p>
        </Modal>
      )}
    </>
  );
};

// Cache module-level: sobrevive a desmontagens do componente, resetado no F5
let _orcamentosCache = null;
const PER_PAGE_ORC = 12;  // itens por página na listagem de orçamentos (paginação no servidor)
// Cache dos itens da composição por orçamento (evita rebuscar ao reabrir o mesmo)
const _itensCache = {};

// OrcamentosScreen gerencia o estado da lista e os handlers de ação
const OrcamentosScreen = ({ onNovoOrcamento, obras = [], refreshKey = 0, user, userProfile }) => {
  const toast = useToast();
  const [selected, setSelected]     = React.useState(null);
  const [orcamentos, setOrcamentos] = React.useState([]);
  const [loading, setLoading]       = React.useState(true);
  const [pagina, setPagina]         = React.useState(1);
  const [total, setTotal]           = React.useState(0);

  // Paginação no servidor: busca só a página atual (não a tabela inteira).
  const refetch = React.useCallback(() => {
    setLoading(true);
    orcamentosService.listarPaginado({ page: pagina, perPage: PER_PAGE_ORC }).then(({ data, count, error }) => {
      if (!error && data) {
        setOrcamentos(data.map(o => ({ ...o, obra: obras.find(ob => ob.id === o.obra_id)?.nome || '—' })));
        setTotal(count ?? 0);
      } else {
        setOrcamentos([]); setTotal(0);
      }
      setLoading(false);
    });
  }, [obras, pagina]);

  React.useEffect(() => { refetch(); }, [refetch, refreshKey]);
  // Após criar um orçamento, volta para a 1ª página (onde ele aparece)
  const prevRefreshKeyRef = React.useRef(refreshKey);
  React.useEffect(() => {
    if (refreshKey !== prevRefreshKeyRef.current) { prevRefreshKeyRef.current = refreshKey; setPagina(1); }
  }, [refreshKey]);

  const handleDelete = async (id) => {
    const { error } = await orcamentosService.excluir(id);
    if (error) {
      toast('Erro ao excluir: ' + error.message, { tone: 'error', icon: 'alert' });
      return;
    }
    toast('Orçamento excluído', { tone: 'success', icon: 'check' });
    setSelected(null);
    refetch();
  };

  if (selected) {
    return (
      <OrcamentoDetalhe
        orcamento={selected}
        onBack={() => setSelected(null)}
        user={user}
        userProfile={userProfile}
      />
    );
  }

  return (
    <OrcamentoLista
      onOpen={setSelected}
      onNovo={onNovoOrcamento}
      orcamentos={orcamentos}
      loading={loading}
      onDelete={handleDelete}
      userProfile={userProfile}
      pagina={pagina}
      total={total}
      perPage={PER_PAGE_ORC}
      onPagina={setPagina}
    />
  );
};

export { OrcamentosScreen, OrcamentoDetalhe, OrcamentoLista };
