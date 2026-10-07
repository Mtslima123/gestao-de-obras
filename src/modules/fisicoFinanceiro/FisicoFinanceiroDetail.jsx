import React from 'react';
import { Icon } from '../../components/Icons';
import { Modal, useToast } from '../../components/Modals';
import { fisicoFinanceiroService } from './fisicoFinanceiro.service';
import {
  parseFechamentoSheet, getLinhaTotal, getDisciplinas, computeKPIs,
} from './fisicoFinanceiroPure';
import { formatBRL, formatNum, mesCurto } from '../../utils/formatters';
import { moduloSomenteLeitura } from '../../utils/permissions';
import { logger } from '../../services/logger';
import { friendlyError } from '../../utils/friendlyError';

const mesAtualISO = () => new Date().toISOString().slice(0, 7);
// 'AAAA-MM' do mês seguinte (dezembro vira janeiro do ano seguinte).
const mesSeguinteISO = (mes) => {
  const [ano, m] = mes.split('-').map(Number);
  return m === 12 ? `${ano + 1}-01` : `${ano}-${String(m + 1).padStart(2, '0')}`;
};
const corCss = (sem) => (sem === 'neutral' ? 'var(--text-muted)' : `var(--${sem})`);

// Cores dos 2 grupos de coluna da tabela (Orçamento/Fechamento = clara, Acumulado =
// escura) — mesma cor na banda de cima e na linha de rótulos logo abaixo, pra formar
// um bloco só por grupo.
const BANDA_CLARA  = { background: '#c3d3ea', color: 'var(--brand)' };
const BANDA_ESCURA = { background: 'var(--brand)', color: '#ffffff' };

// Colunas da tabela de fechamento — uma definição só pra tela, pré-visualização da
// importação e PDF, pra que ocultar uma coluna na tela valha igual no PDF. O autoTable
// precisa de texto pronto por célula, por isso o `fmt` fica aqui e não no JSX.
// grupo = banda de cima; fixa = não pode ser ocultada (sem código e nome a linha não diz
// de qual disciplina é); muted = texto mais apagado na tela.
const pctFmt = (v) => `${formatNum(v)}%`;
const COLUNAS = [
  { label: 'Código',               campo: 'codigo',                   grupo: 'orcamento', fixa: true },
  { label: 'Nome',                 campo: 'nome',                     grupo: 'orcamento', fixa: true },
  { label: 'Orçamento',            campo: 'valorOrcamentoBase',       grupo: 'orcamento', fmt: formatBRL, muted: true },
  { label: 'Orçamento INCC',       campo: 'valorInccBase',            grupo: 'orcamento', fmt: formatNum, muted: true },
  { label: 'Orçamento Atualizado', campo: 'valorOrcamentoAtualizado', grupo: 'orcamento', fmt: formatBRL },
  { label: 'Previsto (%)',         campo: 'previstoLinhaBase',        grupo: 'acumulado', fmt: pctFmt, muted: true },
  { label: 'Exec. físico (%)',     campo: 'executadoFisico',          grupo: 'acumulado', fmt: pctFmt },
  { label: 'Gasto (%)',            campo: 'gastoPct',                 grupo: 'acumulado', fmt: pctFmt },
  { label: 'Gasto (INCC)',         campo: 'gastoIncc',                grupo: 'acumulado', fmt: formatNum, muted: true },
  { label: 'Gasto (R$)',           campo: 'gastoReal',                grupo: 'acumulado', fmt: formatBRL },
  { label: 'Tendência (R$)',       campo: 'tendencia',                grupo: 'fechamento', fmt: formatBRL },
  { label: 'Créd. Modificações',   campo: 'creditoModificacoes',      grupo: 'fechamento', fmt: formatBRL, muted: true },
  { label: 'Ganhos (INCC)',        campo: 'ganhosIncc',               grupo: 'fechamento', fmt: formatBRL },
  { label: 'Saving',               campo: 'saving',                   grupo: 'fechamento', fmt: formatBRL },
  { label: 'Ganhos (INCC) Real',   campo: 'ganhosInccReal',           grupo: 'fechamento', fmt: formatBRL },
  { label: 'Saving Real',          campo: 'savingReal',               grupo: 'fechamento', fmt: formatBRL },
  { label: 'Reserva Financeira',   campo: 'reservaFinanceira',        grupo: 'fechamento', fmt: formatBRL },
  { label: 'Saldo (R$)',           campo: 'saldoDistribuirReal',      grupo: 'fechamento', fmt: formatBRL },
  { label: 'Saldo (INCC)',         campo: 'saldoDistribuirIncc',      grupo: 'fechamento', fmt: formatNum, muted: true },
];
const GRUPOS = [
  { id: 'orcamento',  rotulo: () => 'Orçamento',                       escura: false },
  { id: 'acumulado',  rotulo: (mes) => `Acumulado até ${mesCurto(mes)}`, escura: true },
  { id: 'fechamento', rotulo: () => 'Fechamento',                      escura: false },
];
const grupoEscuro = (id) => GRUPOS.find(g => g.id === id).escura;
// Bandas de cima a partir das colunas visíveis: o colSpan acompanha quantas colunas
// sobraram no grupo, e o grupo some se todas as dele estiverem ocultas.
const bandasDe = (cols) => GRUPOS
  .map(g => ({ ...g, span: cols.filter(c => c.grupo === g.id).length }))
  .filter(g => g.span > 0);
// Preferência do navegador, igual pra todas as obras (as colunas do fechamento são
// sempre as mesmas, não faz sentido escolher de novo a cada obra).
const COLS_OCULTAS_KEY = 'ff_cols_ocultas';
const PDF_BRAND = [28, 69, 132];   // #1C4584 (identidade Soter) = BANDA_ESCURA
const PDF_CLARA = [195, 211, 234]; // #c3d3ea = BANDA_CLARA
// Mesmas cores semânticas da tela (globals.css: --success, --warning, --danger, --text-muted).
const PDF_COR = {
  success: [31, 139, 92],
  warning: [179, 113, 26],
  danger:  [179, 36, 30],
  neutral: [107, 120, 144],
};

// ── Importação da planilha de fechamento (Excel/CSV) ───────────────────────────
const ImportarFechamentoModal = ({ obraId, obraNome, mesInicial, mesesExistentes, onImported, onClose }) => {
  const toast = useToast();
  const [step, setStep]           = React.useState(1);
  const [parsing, setParsing]     = React.useState(false);
  const [saving, setSaving]       = React.useState(false);
  const [dragging, setDragging]   = React.useState(false);
  const [nomeArquivo, setNomeArquivo] = React.useState('');
  const [itens, setItens]         = React.useState([]);
  const [erros, setErros]         = React.useState([]);
  const [avisos, setAvisos]       = React.useState([]);
  const [mesEscolhido, setMesEscolhido] = React.useState(mesInicial);
  const fileRef = React.useRef();

  const parseFile = async (file) => {
    if (file.size > 25 * 1024 * 1024) {
      toast('Arquivo muito grande. Máximo: 25 MB', { tone: 'error', icon: 'alert' });
      return;
    }
    setParsing(true);
    try {
      const XLSX = await import('xlsx'); // carregado sob demanda (fora do bundle inicial)
      const buf = await file.arrayBuffer();
      const wb  = XLSX.read(buf, { type: 'array' });
      const ws  = wb.Sheets[wb.SheetNames[0]];
      // O modo de leitura certo depende do TIPO de arquivo, testado contra os dois
      // formatos reais que essa obra já mandou:
      //  - .xlsx de verdade (bookType 'biff8'/'xlsx'/...): célula numérica tem tipo
      //    próprio no arquivo — raw:true dá o number de verdade (%, sempre fração do
      //    Excel: 0.228; o resto, valor absoluto). O texto formatado (`w`) que o
      //    SheetJS gera pra essas células usa separador EN-US (vírgula de milhar),
      //    não pt-BR, e dava número truncado se lido como texto.
      //  - .htm de "Salvar como > Página da Web" (bookType 'html'): o parser de HTML do
      //    SheetJS tenta ADIVINHAR se cada célula "parece" número, e adivinha errado
      //    pra algumas (confirmado com arquivo real: uma célula com um só ponto de
      //    milhar, tipo "50.043,42", virava o number 50.04342 — a vírgula decimal some
      //    no meio do palpite). raw:false evita esse palpite: toda célula sai como o
      //    texto pt-BR mesmo, que o parsePtBR (fisicoFinanceiroPure.js) já lê certo.
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: wb.bookType !== 'html', defval: '' });
      const resultado = parseFechamentoSheet(aoa);
      // Excel "Salvar como > Página da Web (completa)" gera um arquivo-índice pequeno
      // (frameset) + uma pasta "..._arquivos" ao lado com os dados de verdade — quem
      // seleciona só o arquivo principal (o ícone reconhecível) recebe um índice vazio,
      // sem tabela nenhuma. bookType 'html' + arquivo pequeno + cabeçalho não reconhecido
      // é o sinal disso — dá pra confirmar exatamente esse caso, então orienta direto em
      // vez de deixar só o erro genérico de cabeçalho.
      if (resultado.erros.length && wb.bookType === 'html' && file.size < 100 * 1024) {
        resultado.erros.push('Se este arquivo veio de "Salvar como > Página da Web" do Excel, ele pode ser só o índice — os dados ficam num arquivo separado (algo como "sheet001.htm") dentro de uma pasta "..._arquivos" com o mesmo nome, ao lado deste arquivo. Selecione esse arquivo em vez deste.');
      }
      setItens(resultado.itens);
      setErros(resultado.erros);
      setAvisos(resultado.avisos);
      setNomeArquivo(file.name);
      setStep(2);
    } catch (e) {
      logger.error('erro ao ler planilha de fechamento', { module: 'fisicoFinanceiro', action: 'lerPlanilha', err: e });
      toast('Erro ao ler a planilha: ' + (e?.message || e), { tone: 'error', icon: 'alert' });
    } finally {
      setParsing(false);
    }
  };

  const total = getLinhaTotal(itens);
  const disciplinas = getDisciplinas(itens);
  const jaExiste = mesesExistentes.has(mesEscolhido);

  const handleConfirmar = async () => {
    setSaving(true);
    const { error } = await fisicoFinanceiroService.salvarImportacao(obraId, mesEscolhido, itens, { nomeArquivo, obraNome });
    setSaving(false);
    if (error) {
      toast('Erro ao salvar importação. ' + friendlyError(error), { tone: 'error', icon: 'alert' });
      return;
    }
    toast('Fechamento importado com sucesso', { tone: 'success', icon: 'check' });
    onImported(mesEscolhido);
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
            disabled={erros.length > 0 || !mesEscolhido || !total || saving || jaExiste}
            title={
              jaExiste ? 'Exclua o fechamento deste mês antes de importar de novo'
                : erros.length > 0 ? 'Corrija os erros antes de importar'
                : !total ? 'A planilha precisa ter a linha de total da obra' : ''
            }
          >
            <Icon name="check" size={14} />
            {saving ? 'Salvando…' : 'Confirmar importação'}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <Modal
      title="Importar fechamento"
      overlay={false}
      size="xl"
      subtitle={step === 1
        ? 'Carregue a planilha de fechamento físico-financeiro mensal'
        : `${disciplinas.length} disciplinas · ${erros.length} erros · ${avisos.length} avisos`}
      onClose={onClose}
      footer={footer}
    >
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
                <Icon name="upload" size={30} />
                <div style={{ fontWeight: 600, fontSize: 14, marginTop: 8 }}>Clique ou arraste o arquivo aqui</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12.5, marginTop: 4 }}>
                  Aceita XLSX, XLS e CSV · fechamento físico-financeiro mensal
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="stack" style={{ gap: 16 }}>
          <div className="field">
            <label>Mês de referência</label>
            <input type="month" value={mesEscolhido} onChange={e => setMesEscolhido(e.target.value)} style={{ maxWidth: 200 }} />
          </div>

          {jaExiste && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 14px', borderRadius: 8, background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: 13 }}>
              <Icon name="alert-triangle" size={16} />
              <span>Este mês já tem um fechamento importado. Não é possível sobrescrever — <strong>feche este modal, exclua o fechamento existente</strong> (botão "Excluir mês" na tela) e importe de novo.</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            {[
              { label: 'Disciplinas',   val: disciplinas.length },
              { label: 'Total da obra', val: total ? '✓' : '—', color: total ? 'var(--success)' : 'var(--danger)' },
              { label: 'Erros',         val: erros.length,  color: erros.length  ? 'var(--danger)'  : undefined },
              { label: 'Avisos',        val: avisos.length, color: avisos.length ? 'var(--warning)' : undefined },
            ].map((s, i) => (
              <div key={i} style={{ flex: 1, padding: '10px 14px', borderRadius: 8, textAlign: 'center', background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: s.color || 'var(--text)' }}>{s.val}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {(erros.length > 0 || avisos.length > 0) && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ padding: '8px 14px', fontWeight: 600, fontSize: 12, background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)' }}>
                Problemas encontrados
              </div>
              <ul style={{ margin: 0, padding: '10px 14px', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {erros.map((e, i) => (
                  <li key={'e' + i} style={{ fontSize: 12.5, color: 'var(--danger)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                    <Icon name="alert" size={13} />{e}
                  </li>
                ))}
                {avisos.map((a, i) => (
                  <li key={'a' + i} style={{ fontSize: 12.5, color: 'var(--warning)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                    <Icon name="alert-triangle" size={13} />{a}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '8px 14px', fontWeight: 600, fontSize: 12, background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)' }}>
              Pré-visualização ({disciplinas.length} linhas) — arraste para o lado pra ver as demais colunas
            </div>
            <div style={{ maxHeight: 320, overflow: 'auto' }}>
              {/* Pré-visualização mostra sempre todas as colunas: é pra conferir a planilha inteira antes de gravar. */}
              <table className="tbl" style={{ minWidth: 2000, whiteSpace: 'nowrap', fontSize: 12.5 }}>
                <CabecalhoFechamento cols={COLUNAS} mes={mesEscolhido} />
                <tbody>
                  {total && <LinhaFechamento key={total.codigo} item={total} cols={COLUNAS} total />}
                  {disciplinas.map((it, i) => <LinhaFechamento key={it.codigo} item={it} cols={COLUNAS} striped={i % 2 === 1} />)}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

// ── Cabeçalho da tabela (bandas + rótulos), só com as colunas recebidas ────────
const CabecalhoFechamento = ({ cols, mes }) => {
  const separador = { borderLeft: '2px solid var(--brand)' };
  return (
    <thead>
      <tr className="band-row">
        {bandasDe(cols).map((b, i) => (
          <th key={b.id} colSpan={b.span}
            style={{ ...(b.escura ? BANDA_ESCURA : BANDA_CLARA), ...(i > 0 ? separador : null), textAlign: 'center' }}>
            {b.rotulo(mes)}
          </th>
        ))}
      </tr>
      <tr>
        {/* A borda grossa vai na 1ª coluna visível de cada grupo, que muda conforme o que foi ocultado. */}
        {cols.map((c, i) => (
          <th key={c.campo} className="center"
            style={{ ...(grupoEscuro(c.grupo) ? BANDA_ESCURA : BANDA_CLARA), ...(i > 0 && cols[i - 1].grupo !== c.grupo ? separador : null) }}>
            {c.label}
          </th>
        ))}
      </tr>
    </thead>
  );
};

// ── Uma linha da tabela (disciplina ou total da obra) ──────────────────────────
const LinhaFechamento = ({ item, cols, total = false, striped = false }) => {
  const rowStyle = total
    ? { background: 'var(--brand-tint)', borderTop: '2px solid var(--brand)' }
    : striped ? { background: 'var(--surface-muted)' } : undefined;
  const strong   = total ? ' strong' : ''; // só a linha de total (destacada em azul) fica em negrito
  return (
    <tr style={rowStyle}>
      {cols.map(c => (c.fmt
        ? <td key={c.campo} className={'right mono' + (c.muted ? ' text-muted' : '') + strong}>{c.fmt(item[c.campo])}</td>
        : <td key={c.campo} className={strong} style={total && c.campo === 'codigo' ? { color: 'var(--brand)' } : undefined}>{item[c.campo]}</td>
      ))}
    </tr>
  );
};

// ── Tela por obra: mês + importar + KPIs + tabela ──────────────────────────────
const FisicoFinanceiroDetail = ({ obra, userProfile, onBack }) => {
  const toast = useToast();
  const obraId = obra?.id;
  const readOnly = moduloSomenteLeitura(userProfile, 'fisico-financeiro');

  const [meses, setMeses]         = React.useState([]);
  const [mesSel, setMesSel]       = React.useState(null);
  const [registro, setRegistro]   = React.useState(null);
  const [loading, setLoading]     = React.useState(true);
  const [modalAberto, setModalAberto] = React.useState(false);
  // 0 = fechado, 1 = "tem certeza?", 2 = confirmação final (mesmo padrão 2 passos de
  // ObrasList.jsx/Orcamentos.jsx pra ação destrutiva).
  const [excluirStep, setExcluirStep] = React.useState(0);
  const [excluindo, setExcluindo]     = React.useState(false);

  const carregarMeses = React.useCallback(async () => {
    const { data } = await fisicoFinanceiroService.listarMeses(obraId);
    setMeses(data);
    return data;
  }, [obraId]);

  // Carrega o histórico de meses da obra e escolhe o mais recente por padrão.
  React.useEffect(() => {
    if (!obraId) return;
    let cancelado = false;
    carregarMeses().then((data) => {
      if (cancelado) return;
      setMesSel(prev => (prev && data.some(m => m.mes_referencia === prev)) ? prev : (data[0]?.mes_referencia || null));
    });
    return () => { cancelado = true; };
  }, [obraId, carregarMeses]);

  // Carrega o registro completo (itens) do mês selecionado.
  React.useEffect(() => {
    if (!obraId || !mesSel) { setRegistro(null); setLoading(false); return; }
    let cancelado = false;
    setLoading(true);
    fisicoFinanceiroService.buscarPorMes(obraId, mesSel).then(({ data }) => {
      if (!cancelado) { setRegistro(data); setLoading(false); }
    });
    return () => { cancelado = true; };
  }, [obraId, mesSel]);

  const handleImported = async (mesReferencia) => {
    await carregarMeses();
    setMesSel(mesReferencia);
    const { data } = await fisicoFinanceiroService.buscarPorMes(obraId, mesReferencia);
    setRegistro(data);
  };

  const handleExcluirMes = async () => {
    if (!mesSel) return;
    setExcluindo(true);
    const { error } = await fisicoFinanceiroService.excluir(obraId, mesSel, { obraNome: obra?.nome });
    setExcluindo(false);
    if (error) {
      toast('Erro ao excluir fechamento. ' + friendlyError(error), { tone: 'error', icon: 'alert' });
      return;
    }
    toast('Fechamento excluído', { tone: 'success', icon: 'check' });
    setExcluirStep(0);
    // O mês que acabou de ser excluído nunca aparece no `data` recarregado — o primeiro
    // item (lista já vem ordenada mes_referencia desc) é o próximo mais recente restante.
    const data = await carregarMeses();
    const proximo = data[0]?.mes_referencia || null;
    setMesSel(proximo);
    if (!proximo) setRegistro(null);
  };

  const itens = registro?.itens || [];
  const total = getLinhaTotal(itens);
  const disciplinas = getDisciplinas(itens);
  const kpis = computeKPIs(itens);
  const mesesExistentes = React.useMemo(() => new Set(meses.map(m => m.mes_referencia)), [meses]);

  // Colunas ocultas da tabela (botão "Colunas"). A tela e o PDF usam a mesma lista de
  // visíveis, então o que some aqui some também no PDF exportado.
  const [colsOcultas, setColsOcultas] = React.useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(COLS_OCULTAS_KEY) || '[]')); }
    catch { return new Set(); }
  });
  React.useEffect(() => {
    try { localStorage.setItem(COLS_OCULTAS_KEY, JSON.stringify([...colsOcultas])); } catch { /* ignore */ }
  }, [colsOcultas]);
  const colsVisiveis = COLUNAS.filter(c => c.fixa || !colsOcultas.has(c.campo));
  const qtdOcultas = COLUNAS.length - colsVisiveis.length;
  const toggleColuna = (campo) => setColsOcultas(prev => {
    const next = new Set(prev);
    next.has(campo) ? next.delete(campo) : next.add(campo);
    return next;
  });
  const [colsMenuAberto, setColsMenuAberto] = React.useState(false);
  const colsMenuRef = React.useRef(null);
  React.useEffect(() => {
    if (!colsMenuAberto) return;
    const fechar = (e) => { if (colsMenuRef.current && !colsMenuRef.current.contains(e.target)) setColsMenuAberto(false); };
    document.addEventListener('mousedown', fechar);
    return () => document.removeEventListener('mousedown', fechar);
  }, [colsMenuAberto]);

  // Exporta KPIs + tabela de fechamento do mês em PDF (A3 paisagem: 19 colunas não cabem
  // legíveis em A4). Mesmo padrão de exportarPDF da Medição Mensal (jspdf sob demanda).
  const [exportando, setExportando] = React.useState(false);
  const exportarPDF = async () => {
    if (!registro) return;
    setExportando(true);
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();
      doc.setFontSize(14); doc.setTextColor(...PDF_BRAND);
      doc.text(`Físico Financeiro · ${obra?.nome || 'Obra'} · ${mesCurto(mesSel)}`, 14, 15);
      doc.setFontSize(8); doc.setTextColor(130);
      doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, 14, 21);
      doc.setTextColor(0);

      let y = 27;
      if (kpis) {
        // Faixa de KPIs: 4 caixas lado a lado, % grande e R$ embaixo (igual aos cards).
        // O % usa a mesma cor semântica da tela (verde/vermelho/âmbar) e vai em negrito.
        const cards = [
          ['Delta (%) Físico × Financeiro', kpis.deltaFisicoFinanceiroPct, kpis.deltaFisicoFinanceiroReal, kpis.corDeltaFisicoFinanceiro],
          ['Saving', kpis.savingRealPct, kpis.savingReal, kpis.corSavingReal],
          ['Ganhos em INCC', kpis.ganhosInccRealPct, kpis.ganhosInccReal, kpis.corGanhosInccReal],
          ['Tendência de Fechamento', kpis.tendenciaFechamentoPct, kpis.tendenciaFechamentoReal, kpis.corTendencia],
        ];
        const gap = 4, cw = (W - 28 - gap * 3) / 4, ch = 18;
        cards.forEach(([rot, pct, real, sem], i) => {
          const x = 14 + i * (cw + gap);
          doc.setDrawColor(220); doc.roundedRect(x, y, cw, ch, 1.5, 1.5);
          doc.setFont(undefined, 'bold');
          doc.setFontSize(7); doc.setTextColor(110); doc.text(rot.toUpperCase(), x + 4, y + 5);
          doc.setFontSize(13); doc.setTextColor(...(PDF_COR[sem] || PDF_COR.neutral)); doc.text(pctFmt(pct), x + 4, y + 12);
          doc.setFont(undefined, 'normal');
          doc.setFontSize(7); doc.setTextColor(120); doc.text(formatBRL(real), x + 4, y + 16);
        });
        doc.setTextColor(0);
        y += ch + 6;
      }

      const linhas = [...(total ? [total] : []), ...disciplinas];
      const cel = (it, c) => (c.fmt ? c.fmt(it[c.campo]) : (it[c.campo] ?? ''));
      const banda = (content, colSpan, escura) => ({
        content, colSpan,
        styles: { halign: 'center', fillColor: escura ? PDF_BRAND : PDF_CLARA, textColor: escura ? 255 : PDF_BRAND },
      });
      autoTable(doc, {
        startY: y,
        // Só as colunas visíveis na tela, com as bandas recalculadas pelo que sobrou.
        head: [
          bandasDe(colsVisiveis).map(b => banda(b.rotulo(mesSel).toUpperCase(), b.span, b.escura)),
          colsVisiveis.map(c => ({
            content: c.label.toUpperCase(),
            styles: grupoEscuro(c.grupo)
              ? { fillColor: PDF_BRAND, textColor: 255 }
              : { fillColor: PDF_CLARA, textColor: PDF_BRAND },
          })),
        ],
        body: linhas.map(it => colsVisiveis.map(c => cel(it, c))),
        theme: 'grid',
        headStyles: { fontSize: 6.5, fontStyle: 'bold', halign: 'center', valign: 'middle' },
        bodyStyles: { fontSize: 7, textColor: 40 },
        alternateRowStyles: { fillColor: [248, 249, 250] },
        columnStyles: Object.fromEntries(colsVisiveis.map((c, i) => [i, { halign: c.fmt ? 'right' : 'left' }])),
        margin: { top: 14, right: 14, bottom: 14, left: 14 },
        didParseCell: (data) => {
          // Linha de total da obra (1ª do corpo): negrito com fundo azul claro, como na tela.
          if (data.section === 'body' && total && data.row.index === 0) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [232, 240, 252];
            data.cell.styles.textColor = 20;
          }
        },
        didDrawPage: ({ pageNumber }) => {
          doc.setFontSize(8); doc.setTextColor(150);
          doc.text(`Página ${pageNumber}`, W - 24, H - 6);
          doc.setTextColor(0);
        },
      });
      const slug = String(obra?.nome || 'obra').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      doc.save(`fisico-financeiro-${slug}-${mesSel}.pdf`);
    } catch (e) {
      logger.error('erro ao exportar PDF do físico financeiro', { module: 'fisicoFinanceiro', action: 'exportarPDF', obraId, err: e });
      toast('Erro ao exportar para PDF', { tone: 'error', icon: 'alert' });
    } finally {
      setExportando(false);
    }
  };

  return (
    <>
      <div className="page-header" style={{ marginBottom: 6 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}><Icon name="chevron-left" size={14} />Voltar</button>
      </div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{obra?.nome || 'Obra'}</h1>
          <div className="page-subtitle">Físico Financeiro{mesSel ? ` · ${mesCurto(mesSel)}` : ''}</div>
        </div>
        <div className="page-actions">
          {meses.length > 0 && (
            <select className="input" value={mesSel || ''} onChange={e => setMesSel(e.target.value)} style={{ minWidth: 160 }}>
              {meses.map(m => <option key={m.mes_referencia} value={m.mes_referencia}>{mesCurto(m.mes_referencia)}</option>)}
            </select>
          )}
          {/* Exportar não altera nada: aparece também em somente leitura. */}
          {mesSel && registro && (
            <button className="btn btn-ghost" title="Exportar KPIs e as colunas visíveis do fechamento deste mês em PDF" onClick={exportarPDF} disabled={exportando}>
              <Icon name="download" size={14} />{exportando ? 'Exportando…' : 'Exportar PDF'}
            </button>
          )}
          {!readOnly && mesSel && registro && (
            <button className="btn btn-ghost" title="Excluir o fechamento deste mês" onClick={() => setExcluirStep(1)}>
              <Icon name="trash" size={14} />Excluir mês
            </button>
          )}
          {!readOnly && (
            <button className="btn btn-primary" onClick={() => setModalAberto(true)}>
              <Icon name="upload" size={15} />Importar planilha
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="content-loading"><span className="spinner" /></div>
      ) : !registro ? (
        <div className="card" style={{ padding: '80px 24px', textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: 16, background: 'var(--brand-tint)', color: 'var(--brand)', display: 'grid', placeItems: 'center', margin: '0 auto 18px' }}>
            <Icon name="chart" size={32} />
          </div>
          <h2 style={{ margin: '0 0 6px', fontSize: 18 }}>Nenhum fechamento importado</h2>
          <div className="text-muted" style={{ maxWidth: 420, margin: '0 auto 20px', fontSize: 13.5 }}>
            {meses.length > 0 ? 'Escolha outro mês acima ou importe um novo.' : 'Importe a planilha de fechamento mensal desta obra para começar.'}
          </div>
          {!readOnly && (
            <button className="btn btn-primary" onClick={() => setModalAberto(true)}>
              <Icon name="upload" size={15} />Importar planilha
            </button>
          )}
        </div>
      ) : (
        <>
          {kpis && (
            <div className="kpi-grid">
              <div className="kpi">
                <div className="kpi-label"><span className="kpi-icon"><Icon name="measure" size={15} /></span>Delta (%) Físico × Financeiro</div>
                <div className="kpi-value" style={{ color: corCss(kpis.corDeltaFisicoFinanceiro) }}>{formatNum(kpis.deltaFisicoFinanceiroPct)}<span className="unit">%</span></div>
                <div className="kpi-foot-text">{formatBRL(kpis.deltaFisicoFinanceiroReal)}</div>
              </div>
              <div className="kpi">
                <div className="kpi-label"><span className="kpi-icon"><Icon name="briefcase" size={15} /></span>Saving</div>
                <div className="kpi-value" style={{ color: corCss(kpis.corSavingReal) }}>{formatNum(kpis.savingRealPct)}<span className="unit">%</span></div>
                <div className="kpi-foot-text">{formatBRL(kpis.savingReal)}</div>
              </div>
              <div className="kpi">
                <div className="kpi-label"><span className="kpi-icon"><Icon name="trending-up" size={15} /></span>Ganhos em INCC</div>
                <div className="kpi-value" style={{ color: corCss(kpis.corGanhosInccReal) }}>{formatNum(kpis.ganhosInccRealPct)}<span className="unit">%</span></div>
                <div className="kpi-foot-text">{formatBRL(kpis.ganhosInccReal)}</div>
              </div>
              <div className="kpi">
                <div className="kpi-label"><span className="kpi-icon"><Icon name="flag" size={15} /></span>Tendência de Fechamento</div>
                <div className="kpi-value" style={{ color: corCss(kpis.corTendencia) }}>{formatNum(kpis.tendenciaFechamentoPct)}<span className="unit">%</span></div>
                <div className="kpi-foot-text">{formatBRL(kpis.tendenciaFechamentoReal)}</div>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Fechamento</div>
              </div>
              <div className="card-actions">
                <div ref={colsMenuRef} style={{ position: 'relative' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setColsMenuAberto(v => !v)} title="Mostrar/ocultar colunas (o PDF exporta só as visíveis)">
                    <Icon name="layers" size={13} />Colunas{qtdOcultas > 0 && <span className="text-muted">· {qtdOcultas} {qtdOcultas === 1 ? 'oculta' : 'ocultas'}</span>}
                  </button>
                  {colsMenuAberto && (
                    <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 6, zIndex: 50, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', padding: 10, minWidth: 220, maxHeight: '60vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {GRUPOS.map(g => (
                        <React.Fragment key={g.id}>
                          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', padding: '6px 4px 2px' }}>{g.rotulo(mesSel)}</div>
                          {COLUNAS.filter(c => c.grupo === g.id && !c.fixa).map(c => (
                            <label key={c.campo} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer', padding: '3px 4px' }}>
                              <input type="checkbox" checked={!colsOcultas.has(c.campo)} onChange={() => toggleColuna(c.campo)} />
                              {c.label}
                            </label>
                          ))}
                        </React.Fragment>
                      ))}
                      {qtdOcultas > 0 && (
                        <button className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={() => setColsOcultas(new Set())}>Mostrar todas</button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="card-body flush" style={{ overflowX: 'auto' }}>
              {/* ~105px por coluna: com todas visíveis dá os mesmos 2000px de antes, e encolhe ao ocultar. */}
              <table className="tbl" style={{ minWidth: colsVisiveis.length * 105, whiteSpace: 'nowrap' }}>
                <CabecalhoFechamento cols={colsVisiveis} mes={mesSel} />
                <tbody>
                  {total && <LinhaFechamento key={total.codigo} item={total} cols={colsVisiveis} total />}
                  {disciplinas.map((it, i) => <LinhaFechamento key={it.codigo} item={it} cols={colsVisiveis} striped={i % 2 === 1} />)}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {modalAberto && (
        <ImportarFechamentoModal
          obraId={obraId}
          obraNome={obra?.nome}
          // Importação é sempre do próximo fechamento: o mês seguinte ao último já
          // importado (meses vem mais recente primeiro), não o que está aberto na tela.
          mesInicial={meses[0] ? mesSeguinteISO(meses[0].mes_referencia) : mesAtualISO()}
          mesesExistentes={mesesExistentes}
          onImported={handleImported}
          onClose={() => setModalAberto(false)}
        />
      )}

      {excluirStep > 0 && (
        <Modal
          title={excluirStep === 1 ? 'Excluir fechamento' : 'Confirmação final'}
          onClose={() => setExcluirStep(0)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setExcluirStep(0)}>Cancelar</button>
              <button
                className="btn"
                style={{ background: 'var(--danger)', color: 'white', fontWeight: 600 }}
                disabled={excluindo}
                onClick={() => (excluirStep === 1 ? setExcluirStep(2) : handleExcluirMes())}
              >
                {excluindo ? 'Excluindo…' : excluirStep === 1 ? 'Sim, excluir' : 'Confirmar exclusão'}
              </button>
            </>
          }
        >
          {excluirStep === 1 ? (
            <p style={{ fontSize: 14 }}>
              Tem certeza que deseja excluir o fechamento de <strong>{mesCurto(mesSel)}</strong> desta obra?
            </p>
          ) : (
            <div>
              <p style={{ fontSize: 14, marginBottom: 10 }}>
                Esta ação é <strong style={{ color: 'var(--danger)' }}>irreversível</strong>. Todos os dados importados para {mesCurto(mesSel)} serão apagados.
              </p>
              <p style={{ fontSize: 14, marginTop: 12, fontWeight: 600 }}>Deseja realmente continuar?</p>
            </div>
          )}
        </Modal>
      )}
    </>
  );
};

export { FisicoFinanceiroDetail };
