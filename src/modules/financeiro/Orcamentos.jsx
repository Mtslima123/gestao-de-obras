import React from 'react';
import * as XLSX from 'xlsx';
import { Icon } from '../../components/Icons';
import { AppData } from '../../utils/data';
import { useToast, Modal } from '../../components/Modals';
import { StatusBadge } from '../../components/StatusBadge';
import { orcamentosService } from './orcamentos.service';
import { formatBRL } from '../../utils/formatters';

// Orçamentos — lista + detalhe com composição
const { brl: brlOR } = AppData;
const brlFull = formatBRL;


// OrcamentoLista recebe orcamentos já buscados pelo screen pai
const OrcamentoLista = ({ onOpen, onNovo, orcamentos = [], loading = false }) => {
  const [filter, setFilter] = React.useState('todos');

  const filtered = filter === 'todos' ? orcamentos : orcamentos.filter(o => o.status === filter);
  const totalAprovado = orcamentos.filter(o => o.status === 'aprovado').reduce((a, b) => a + b.valor, 0);
  const totalPendente = orcamentos.filter(o => o.status === 'pendente').reduce((a, b) => a + b.valor, 0);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Orçamentos</h1>
          <div className="page-subtitle">
            {loading
              ? 'Carregando…'
              : `${orcamentos.length} orçamentos · ${brlOR(totalAprovado + totalPendente, { compact: true })} em valor total`}
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost"><Icon name="download" size={15} />Exportar</button>
          <button className="btn btn-primary" onClick={onNovo}><Icon name="plus" size={15} />Novo orçamento</button>
        </div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="kpi" style={{ padding: '14px 18px' }}>
          <div className="kpi-label">Aprovados</div>
          <div className="kpi-value num" style={{ fontSize: 22, marginTop: 6 }}>{brlOR(totalAprovado, { compact: true })}</div>
          <div className="kpi-foot" style={{ marginTop: 6 }}>
            <span className="kpi-foot-text">{orcamentos.filter(o => o.status === 'aprovado').length} contratos firmados</span>
          </div>
        </div>
        <div className="kpi" style={{ padding: '14px 18px' }}>
          <div className="kpi-label">Em aprovação</div>
          <div className="kpi-value num" style={{ fontSize: 22, marginTop: 6 }}>{brlOR(totalPendente, { compact: true })}</div>
          <div className="kpi-foot" style={{ marginTop: 6 }}>
            <span className="kpi-foot-text">{orcamentos.filter(o => o.status === 'pendente').length} aguardando cliente</span>
          </div>
        </div>
        <div className="kpi" style={{ padding: '14px 18px' }}>
          <div className="kpi-label">BDI médio</div>
          <div className="kpi-value num" style={{ fontSize: 22, marginTop: 6 }}>26,4<span className="unit">%</span></div>
          <div className="kpi-foot" style={{ marginTop: 6 }}>
            <span className="kpi-foot-text">Faixa típica: 24% – 28%</span>
          </div>
        </div>
        <div className="kpi" style={{ padding: '14px 18px' }}>
          <div className="kpi-label">Taxa de conversão (90d)</div>
          <div className="kpi-value num" style={{ fontSize: 22, marginTop: 6 }}>72<span className="unit">%</span></div>
          <div className="kpi-foot" style={{ marginTop: 6 }}>
            <span className="kpi-foot-text"><Icon name="arrow-up" size={11} stroke={2.5} />+8 p.p. vs trimestre anterior</span>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 'var(--gap)' }}>
        <div className="card-header">
          <div className="filters">
            {[
              { id: 'todos',    label: 'Todos',        count: orcamentos.length },
              { id: 'aprovado', label: 'Aprovados',    count: orcamentos.filter(o => o.status === 'aprovado').length },
              { id: 'pendente', label: 'Em aprovação', count: orcamentos.filter(o => o.status === 'pendente').length },
              { id: 'rascunho', label: 'Rascunhos',    count: orcamentos.filter(o => o.status === 'rascunho').length },
              { id: 'rejeitado',label: 'Rejeitados',   count: orcamentos.filter(o => o.status === 'rejeitado').length },
            ].map(f => (
              <button key={f.id} className={'chip' + (filter === f.id ? ' active' : '')} onClick={() => setFilter(f.id)}>
                {f.label} <span style={{ color: 'var(--text-faint)' }}>·</span> {f.count}
              </button>
            ))}
          </div>
          <div className="card-actions">
            <input className="input input-search" placeholder="Buscar orçamento…" style={{ minWidth: 220 }} />
          </div>
        </div>
        <div className="card-body flush">
          <table className="tbl">
            <thead>
              <tr>
                <th>Código</th>
                <th>Obra / Cliente</th>
                <th className="center">Versão</th>
                <th className="right">Valor</th>
                <th className="right">BDI</th>
                <th>Status</th>
                <th>Data</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} style={{ pointerEvents: 'none' }}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j}><div className="skeleton" style={{ height: 14 }} /></td>
                    ))}
                  </tr>
                ))
              ) : (
                filtered.map((o) => (
                  <tr key={o.id} onClick={() => onOpen(o)}>
                    <td className="strong mono">{o.id}</td>
                    <td>
                      <div className="strong">{o.obra}</div>
                      <div className="text-xs text-muted">{o.cliente}</div>
                    </td>
                    <td className="center mono text-muted">{o.versao}</td>
                    <td className="right strong num">{brlOR(o.valor, { compact: true })}</td>
                    <td className="right mono num">{Number(o.bdi).toFixed(1)}%</td>
                    <td><StatusBadge status={o.status} /></td>
                    <td className="mono text-sm text-muted">{o.data}</td>
                    <td>
                      <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={(e) => e.stopPropagation()}>
                        <Icon name="dots" size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
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
      user_id:        user?.id ?? null,
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

// Célula editável isolada com memo — evita re-render de todas as linhas ao digitar
const NumericCell = React.memo(({ id, field, rawValue, displayValue, isActive, onFocus, onChange, onBlur, placeholder }) => (
  <input
    className="orca-cell-input right"
    inputMode="decimal"
    value={isActive ? rawValue : displayValue}
    onFocus={onFocus}
    onChange={onChange}
    onBlur={onBlur}
    placeholder={placeholder}
  />
));

const OrcamentoDetalhe = ({ orcamento, onBack, onDelete, onCriarRevisao, user }) => {
  const toast         = useToast();
  const [items, setItems]           = React.useState([]);
  const [deletedIds, setDeletedIds] = React.useState([]);
  const [dirty, setDirty]           = React.useState(false);
  const [showImport, setShowImport] = React.useState(false);
  const [activeCell, setActiveCell] = React.useState(null); // { id, field, raw }

  // Formata número com separadores pt-BR (ex: 1.234,56)
  const fmtNum = (n, dec = 2) =>
    (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

  // Converte string pt-BR de volta para float (1.234,56 → 1234.56)
  const parseNum = (s) =>
    parseFloat(String(s).replace(/\./g, '').replace(',', '.')) || 0;
  const [saving, setSaving]         = React.useState(false);
  const [collapsed, setCollapsed]   = React.useState(new Set());
  const [confirmDelete, setConfirm] = React.useState(false);
  const [deleting, setDeleting]     = React.useState(false);
  const [revisando, setRevisando]   = React.useState(false);

  React.useEffect(() => {
    orcamentosService.itens.listar(orcamento.id).then(({ data, error }) => {
      if (!error && data && data.length > 0) setItems(data);
    });
  }, [orcamento.id]);

  // ── Utilitários de hierarquia ──────────────────────────────────────────────
  const getNivel = (codigo) => (codigo.match(/\./g) || []).length;

  const isParent = (codigo, list) =>
    list.some(it => it.codigo !== codigo && it.codigo.startsWith(codigo + '.'));

  // Calcula totais bottom-up: folha = qty × unit; grupo = soma dos filhos diretos
  const calcTotals = (list) => {
    const map = {};
    [...list]
      .sort((a, b) => getNivel(b.codigo) - getNivel(a.codigo))
      .forEach(it => {
        if (isParent(it.codigo, list)) {
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

  const withTotals = React.useMemo(() => calcTotals(items), [items]);

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
      if (getNivel(it.codigo) === maxNivel && isParent(it.codigo, items))
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
    user_id: user?.id ?? null,
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
      if (data && data.length > 0) setItems(data);
    });
    setDeletedIds([]);
    setDirty(false);
  };

  const handleImport = (newItems, modo) => {
    if (modo === 'substituir') {
      // Marca itens existentes no banco para deletar no próximo save
      const toDelete = items.filter(it => !it._new).map(it => it.id);
      if (toDelete.length) setDeletedIds(prev => [...prev, ...toDelete]);
      setItems(newItems);
    } else {
      setItems(prev => [...prev, ...newItems]);
    }
    setDirty(true);
  };

  // ── Salvar no DB ───────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);

    // Deleta do banco itens removidos localmente
    if (deletedIds.length) {
      const { error } = await orcamentosService.itens.excluirVarios(deletedIds);
      if (error) {
        toast('Erro ao excluir itens: ' + error.message, { tone: 'error', icon: 'alert' });
        setSaving(false);
        return;
      }
      setDeletedIds([]);
    }

    // Itens novos: omitir `id` para o DB gerar o UUID automaticamente
    const toInsert = items
      .filter(it => it._new)
      .map(({ _new, _dirty, id, ...rest }) => rest);

    // Itens existentes editados: UPDATE individual por id
    // (upsert falha com colunas GENERATED ALWAYS AS IDENTITY)
    const toUpdate = items
      .filter(it => !it._new && it._dirty)
      .map(({ _new, _dirty, ...rest }) => rest);

    if (toInsert.length) {
      const { error } = await orcamentosService.itens.criar(toInsert);
      if (error) {
        toast('Erro ao inserir itens: ' + error.message, { tone: 'error', icon: 'alert' });
        setSaving(false);
        return;
      }
    }
    if (toUpdate.length) {
      const resultados = await Promise.all(
        toUpdate.map(({ id, ...dados }) => orcamentosService.itens.atualizar(id, dados))
      );
      const falha = resultados.find(r => r.error);
      if (falha) {
        toast('Erro ao atualizar itens: ' + falha.error.message, { tone: 'error', icon: 'alert' });
        setSaving(false);
        return;
      }
    }
    // Atualiza valor total do cabeçalho do orçamento
    const grandTotal = withTotals
      .filter(it => getNivel(it.codigo) === 0)
      .reduce((s, it) => s + it.valor_total, 0);
    await orcamentosService.atualizar(orcamento.id, { valor: grandTotal });
    // Limpa flags localmente — não recarrega do DB para evitar que RLS vazio apague a UI
    setItems(prev => prev.map(({ _new, _dirty, ...rest }) => rest));
    setSaving(false);
    setDirty(false);
    toast('Itens salvos com sucesso', { tone: 'success', icon: 'check' });
  };

  // ── Excluir / Revisão ──────────────────────────────────────────────────────
  const handleDeleteClick = async () => {
    if (!confirmDelete) {
      setConfirm(true);
      setTimeout(() => setConfirm(false), 5000);
      return;
    }
    setDeleting(true);
    await onDelete(orcamento.id);
  };

  const handleCriarRevisao = async () => {
    setRevisando(true);
    await onCriarRevisao(orcamento);
    setRevisando(false);
  };

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const grandTotal  = React.useMemo(() => withTotals.filter(it => getNivel(it.codigo) === 0).reduce((s, it) => s + it.valor_total, 0), [withTotals]);
  const bdiNum      = React.useMemo(() => parseFloat(String(orcamento.bdi).replace(',', '.')) || 0, [orcamento.bdi]);
  const totalDireto = React.useMemo(() => bdiNum > 0 ? grandTotal / (1 + bdiNum / 100) : grandTotal, [grandTotal, bdiNum]);
  const totalBdi    = React.useMemo(() => grandTotal - totalDireto, [grandTotal, totalDireto]);
  const bdiPct      = React.useMemo(() => bdiNum > 0 ? bdiNum.toFixed(1) : '0.0', [bdiNum]);

  // Seções de nível 1 para Curva ABC
  const secoes        = React.useMemo(() => withTotals.filter(it => getNivel(it.codigo) === 1), [withTotals]);
  const maxSecaoTotal = React.useMemo(() => Math.max(...secoes.map(s => s.valor_total), 1), [secoes]);
  const abcSorted     = React.useMemo(() => [...secoes].sort((a, b) => b.valor_total - a.valor_total).slice(0, 8), [secoes]);

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
            <StatusBadge status={orcamento.status} />
            <span className="badge neutral mono">{orcamento.versao}</span>
          </div>
          <div className="page-subtitle">{orcamento.obra} · {orcamento.cliente} · atualizado em {orcamento.data}</div>
        </div>
        <div className="page-actions">
          <button
            className={'btn ' + (confirmDelete ? 'btn-danger' : 'btn-ghost')}
            onClick={handleDeleteClick}
            disabled={deleting}
          >
            <Icon name="trash" size={15} />
            {deleting ? 'Excluindo…' : confirmDelete ? 'Confirmar exclusão' : 'Excluir'}
          </button>
          <button className="btn btn-ghost" onClick={handleCriarRevisao} disabled={revisando}>
            <Icon name="file" size={15} />
            {revisando ? 'Criando…' : 'Criar revisão'}
          </button>
          <button className="btn btn-ghost"><Icon name="download" size={15} />Exportar PDF</button>
          {orcamento.status === 'pendente' && (
            <button className="btn btn-primary"><Icon name="check" size={15} />Aprovar</button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="kpi" style={{ padding: '14px 18px' }}>
          <div className="kpi-label">Custo direto</div>
          <div className="kpi-value num" style={{ fontSize: 20, marginTop: 6 }}>{brlFull(totalDireto)}</div>
        </div>
        <div className="kpi" style={{ padding: '14px 18px' }}>
          <div className="kpi-label">BDI ({bdiPct}%)</div>
          <div className="kpi-value num" style={{ fontSize: 20, marginTop: 6 }}>{brlFull(totalBdi)}</div>
        </div>
        <div className="kpi" style={{ padding: '14px 18px' }}>
          <div className="kpi-label">Valor total</div>
          <div className="kpi-value num" style={{ fontSize: 20, marginTop: 6, color: 'var(--brand)' }}>{brlFull(grandTotal)}</div>
        </div>
        <div className="kpi" style={{ padding: '14px 18px' }}>
          <div className="kpi-label">Itens cadastrados</div>
          <div className="kpi-value num" style={{ fontSize: 20, marginTop: 6 }}>{items.filter(it => !isParent(it.codigo, items)).length}</div>
          <div className="kpi-foot" style={{ marginTop: 4 }}>
            <span className="kpi-foot-text">{items.length} total (incluindo grupos)</span>
          </div>
        </div>
      </div>

      {/* Composição + Curva ABC */}
      <div className="grid-cols-3-2" style={{ marginTop: 'var(--gap)' }}>
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
              <button className="btn btn-sm btn-ghost" onClick={() => setShowImport(true)}>
                <Icon name="download" size={13} />Importar
              </button>
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
            </div>
          </div>
          <div className="card-body flush" style={{ overflowX: 'auto' }}>
            <table className="orca-table">
              <thead>
                <tr>
                  <th style={{ width: 140 }}>Código</th>
                  <th>Nome</th>
                  <th className="right" style={{ width: 100 }}>Quant.</th>
                  <th style={{ width: 60 }}>Un.</th>
                  <th className="right" style={{ width: 110 }}>Valor Unit.</th>
                  <th className="right" style={{ width: 120 }}>Valor Total</th>
                  <th style={{ width: 104 }}></th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((it) => {
                    const nivel     = getNivel(it.codigo);
                    const hasKids   = isParent(it.codigo, items);
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
                            <input
                              className="orca-cell-input"
                              value={it.codigo}
                              onChange={e => editCell(it.id, 'codigo', e.target.value)}
                              style={{ width: 90, fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5 }}
                            />
                          </div>
                        </td>

                        {/* Nome */}
                        <td>
                          <input
                            className="orca-cell-input"
                            value={it.nome || ''}
                            placeholder={hasKids ? 'Nome do grupo…' : 'Nome do item…'}
                            onChange={e => editCell(it.id, 'nome', e.target.value)}
                          />
                        </td>

                        {/* Quantidade */}
                        <td className="right">
                          {!hasKids ? (
                            <NumericCell
                              id={it.id}
                              field="quantidade"
                              rawValue={activeCell?.id === it.id && activeCell?.field === 'quantidade' ? activeCell.raw : ''}
                              displayValue={fmtNum(it.quantidade)}
                              isActive={activeCell?.id === it.id && activeCell?.field === 'quantidade'}
                              onFocus={() => setActiveCell({ id: it.id, field: 'quantidade', raw: it.quantidade || '' })}
                              onChange={e => setActiveCell(prev => ({ ...prev, raw: e.target.value }))}
                              onBlur={e => { editCell(it.id, 'quantidade', parseNum(e.target.value)); setActiveCell(null); }}
                              placeholder="0,00"
                            />
                          ) : <span className="text-muted" style={{ fontSize: 11 }}>—</span>}
                        </td>

                        {/* Unidade */}
                        <td>
                          {!hasKids ? (
                            <input
                              className="orca-cell-input"
                              value={it.unidade || ''}
                              placeholder="UN"
                              maxLength={8}
                              onChange={e => editCell(it.id, 'unidade', e.target.value.toUpperCase())}
                              style={{ width: 52, textTransform: 'uppercase' }}
                            />
                          ) : null}
                        </td>

                        {/* Valor Unitário */}
                        <td className="right">
                          {!hasKids ? (
                            <NumericCell
                              id={it.id}
                              field="valor_unitario"
                              rawValue={activeCell?.id === it.id && activeCell?.field === 'valor_unitario' ? activeCell.raw : ''}
                              displayValue={fmtNum(it.valor_unitario)}
                              isActive={activeCell?.id === it.id && activeCell?.field === 'valor_unitario'}
                              onFocus={() => setActiveCell({ id: it.id, field: 'valor_unitario', raw: it.valor_unitario || '' })}
                              onChange={e => setActiveCell(prev => ({ ...prev, raw: e.target.value }))}
                              onBlur={e => { editCell(it.id, 'valor_unitario', parseNum(e.target.value)); setActiveCell(null); }}
                              placeholder="0,00"
                            />
                          ) : <span className="text-muted" style={{ fontSize: 11 }}>—</span>}
                        </td>

                        {/* Valor Total (calculado) */}
                        <td className="right mono" style={{ fontWeight: hasKids ? 600 : 500, color: nivel === 0 ? 'var(--brand)' : 'inherit' }}>
                          {brlFull(it.valor_total)}
                        </td>

                        {/* Ações */}
                        <td>
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
                              onClick={() => removeRow(it.codigo)}
                            >×</button>
                          </div>
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

        {/* Painéis laterais */}
        <div className="stack">
          {/* Curva ABC por seção */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Curva ABC — Seções</div>
            </div>
            <div className="card-body">
              <div className="stack" style={{ gap: 11 }}>
                {secoes.length === 0 && (
                  <div className="text-muted" style={{ fontSize: 13 }}>Adicione itens para ver a Curva ABC.</div>
                )}
                {abcSorted.map((it, i) => {
                    const pct = grandTotal > 0 ? (it.valor_total / grandTotal * 100) : 0;
                    return (
                      <div key={i}>
                        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                          <span className="text-sm" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                            <span className="mono text-muted" style={{ marginRight: 6 }}>{it.codigo}</span>
                            {it.nome || '—'}
                          </span>
                          <span className="mono num fw-600 text-sm">{pct.toFixed(1)}%</span>
                        </div>
                        <div className="progress" style={{ height: 5 }}>
                          <span style={{ width: (it.valor_total / maxSecaoTotal * 100) + '%' }}></span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>

          {/* Composição do BDI */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Composição do BDI</div>
            </div>
            <div className="card-body">
              <div className="stack" style={{ gap: 9, fontSize: 13 }}>
                {[
                  { label: 'Administração central',     value: '4,2%' },
                  { label: 'Despesas financeiras',      value: '1,1%' },
                  { label: 'Seguros e garantias',       value: '0,8%' },
                  { label: 'Risco do empreendimento',   value: '2,0%' },
                  { label: 'Lucro bruto',               value: '8,0%' },
                  { label: 'Tributos (PIS/COFINS/ISS)', value: '6,4%' },
                  { label: 'CPRB',                      value: '4,5%' },
                ].map((b, i) => (
                  <div key={i} className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="text-soft">{b.label}</span>
                    <span className="mono num fw-600">{b.value}</span>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 9, marginTop: 4 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600 }}>Total BDI</span>
                    <span className="mono num" style={{ fontWeight: 700, color: 'var(--brand)' }}>{bdiPct}%</span>
                  </div>
                </div>
              </div>
            </div>
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
    </>
  );
};

// Cache module-level: sobrevive a desmontagens do componente, resetado no F5
let _orcamentosCache = null;

// OrcamentosScreen gerencia o estado da lista e os handlers de ação
const OrcamentosScreen = ({ onNovoOrcamento, obras = [], refreshKey = 0, user }) => {
  const toast = useToast();
  const [selected, setSelected]     = React.useState(null);
  const [orcamentos, setOrcamentos] = React.useState(_orcamentosCache ?? []);
  const [loading, setLoading]       = React.useState(_orcamentosCache === null);

  const refetch = React.useCallback((invalidate = false) => {
    if (invalidate) _orcamentosCache = null;
    // Só exibe skeleton quando não há cache (primeira visita ou após mutação)
    if (_orcamentosCache === null) setLoading(true);
    orcamentosService.listar().then(({ data, error }) => {
      if (!error && data && data.length > 0) {
        const enriched = data.map(o => ({
          ...o,
          obra: obras.find(ob => ob.id === o.obra_id)?.nome || o.obra_id,
        }));
        _orcamentosCache = enriched;
        setOrcamentos(enriched);
      } else {
        // Fallback para mock quando tabela vazia ou sem autenticação (devMode)
        setOrcamentos(AppData.orcamentosLista);
      }
      setLoading(false);
    });
  }, [obras]);

  const prevRefreshKeyRef = React.useRef(refreshKey);
  React.useEffect(() => {
    const isCreation = refreshKey !== prevRefreshKeyRef.current;
    prevRefreshKeyRef.current = refreshKey;
    // Após criação invalida o cache; demais visitas fazem refresh em background
    refetch(isCreation);
  }, [refreshKey, refetch]);

  const handleDelete = async (id) => {
    const { error } = await orcamentosService.excluir(id);
    if (error) {
      toast('Erro ao excluir: ' + error.message, { tone: 'error', icon: 'alert' });
      return;
    }
    toast('Orçamento excluído', { tone: 'success', icon: 'check' });
    setSelected(null);
    refetch(true);
  };

  const handleCriarRevisao = async (orcamento) => {
    if (!orcamento.obra_id) {
      toast('Orçamento sem obra vinculada — não é possível criar revisão', { tone: 'error', icon: 'alert' });
      return;
    }
    const versaoNum = parseInt((orcamento.versao || 'v1').replace('v', ''), 10);
    const novaVersao = 'v' + (versaoNum + 1);
    const novoId = 'OR-' + String(Date.now()).slice(-4);

    const { error } = await orcamentosService.criar({
      id:      novoId,
      obra_id: orcamento.obra_id,
      cliente: orcamento.cliente,
      versao:  novaVersao,
      bdi:     orcamento.bdi,
      status:  'rascunho',
      valor:   orcamento.valor,
      data:    new Date().toISOString().slice(0, 10),
    }, user?.id);

    if (error) {
      toast('Erro ao criar revisão: ' + error.message, { tone: 'error', icon: 'alert' });
      return;
    }

    // Copia os itens do orçamento original para a nova revisão
    const { data: itens } = await orcamentosService.itens.listar(orcamento.id);
    if (itens && itens.length > 0) {
      const novosItens = itens.map(({ id, created_at, orcamento_id, ...rest }) => ({
        ...rest,
        orcamento_id: novoId,
      }));
      await orcamentosService.itens.criar(novosItens);
    }

    toast('Revisão ' + novaVersao + ' criada', { tone: 'success', icon: 'check' });
    refetch(true);
    setSelected({ ...orcamento, id: novoId, versao: novaVersao, status: 'rascunho', data: new Date().toLocaleDateString('pt-BR') });
  };

  if (selected) {
    return (
      <OrcamentoDetalhe
        orcamento={selected}
        onBack={() => setSelected(null)}
        onDelete={handleDelete}
        user={user}
        onCriarRevisao={handleCriarRevisao}
      />
    );
  }

  return (
    <OrcamentoLista
      onOpen={setSelected}
      onNovo={onNovoOrcamento}
      orcamentos={orcamentos}
      loading={loading}
    />
  );
};

export { OrcamentosScreen, OrcamentoDetalhe, OrcamentoLista };
