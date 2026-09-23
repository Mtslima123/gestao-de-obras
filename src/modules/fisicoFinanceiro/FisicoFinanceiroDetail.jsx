import React from 'react';
import { Icon } from '../../components/Icons';
import { Modal, useToast } from '../../components/Modals';
import { fisicoFinanceiroService } from './fisicoFinanceiro.service';
import {
  parseFechamentoSheet, getLinhaTotal, getDisciplinas, computeKPIs,
} from './fisicoFinanceiroPure';
import { formatBRL, formatNum, mesCurto, formatDateTime } from '../../utils/formatters';
import { moduloSomenteLeitura } from '../../utils/permissions';
import { logger } from '../../services/logger';
import { friendlyError } from '../../utils/friendlyError';

const mesAtualISO = () => new Date().toISOString().slice(0, 7);
const corCss = (sem) => (sem === 'neutral' ? 'var(--text-muted)' : `var(--${sem})`);

// Cores dos 2 grupos de coluna da tabela (Orçamento/Fechamento = clara, Acumulado =
// escura) — mesma cor na banda de cima e na linha de rótulos logo abaixo, pra formar
// um bloco só por grupo.
const BANDA_CLARA  = { background: '#c3d3ea', color: 'var(--brand)' };
const BANDA_ESCURA = { background: 'var(--brand)', color: '#ffffff' };

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
            disabled={erros.length > 0 || !mesEscolhido || !total || saving}
            title={erros.length > 0 ? 'Corrija os erros antes de importar' : !total ? 'A planilha precisa ter a linha de total da obra' : ''}
          >
            <Icon name="check" size={14} />
            {saving ? 'Salvando…' : jaExiste ? 'Sobrescrever mês' : 'Confirmar importação'}
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
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 14px', borderRadius: 8, background: 'var(--warning-bg)', color: 'var(--warning)', fontSize: 13 }}>
              <Icon name="alert-triangle" size={16} />
              <span>Este mês já tem um fechamento importado. Confirmar vai <strong>sobrescrever</strong> os dados existentes.</span>
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
              Pré-visualização ({disciplinas.length} linhas)
            </div>
            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
              <table className="tbl" style={{ fontSize: 12.5 }}>
                <thead>
                  <tr><th>Código</th><th>Nome</th><th className="right">Orçamento atualizado</th><th className="right">Executado físico</th></tr>
                </thead>
                <tbody>
                  {total && (
                    <tr style={{ background: 'var(--brand-tint)', fontWeight: 700 }}>
                      <td>{total.codigo}</td><td>{total.nome}</td>
                      <td className="right mono">{formatBRL(total.valorOrcamentoAtualizado)}</td>
                      <td className="right mono">{formatNum(total.executadoFisico)}%</td>
                    </tr>
                  )}
                  {disciplinas.map(it => (
                    <tr key={it.codigo}>
                      <td>{it.codigo}</td><td>{it.nome}</td>
                      <td className="right mono">{formatBRL(it.valorOrcamentoAtualizado)}</td>
                      <td className="right mono">{formatNum(it.executadoFisico)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

// ── Uma linha da tabela de 19 colunas (disciplina ou total da obra) ────────────
const LinhaFechamento = ({ item, total = false, striped = false }) => {
  const rowStyle = total
    ? { background: 'var(--brand-tint)', borderTop: '2px solid var(--brand)' }
    : striped ? { background: 'var(--surface-muted)' } : undefined;
  const strong   = total ? ' strong' : ''; // só a linha de total (destacada em azul) fica em negrito
  return (
    <tr style={rowStyle}>
      <td className={strong} style={total ? { color: 'var(--brand)' } : undefined}>{item.codigo}</td>
      <td className={strong}>{item.nome}</td>
      <td className={'right mono' + strong}>{formatBRL(item.valorOrcamentoAtualizado)}</td>
      <td className={'right mono text-muted' + strong}>{formatBRL(item.valorOrcamentoBase)}</td>
      <td className={'right mono text-muted' + strong}>{formatNum(item.valorInccBase)}</td>
      <td className={'right mono text-muted' + strong}>{formatNum(item.previstoLinhaBase)}%</td>
      <td className={'right mono' + strong}>{formatNum(item.executadoFisico)}%</td>
      <td className={'right mono' + strong}>{formatNum(item.gastoPct)}%</td>
      <td className={'right mono text-muted' + strong}>{formatNum(item.gastoIncc)}</td>
      <td className={'right mono' + strong}>{formatBRL(item.gastoReal)}</td>
      <td className={'right mono' + strong}>{formatBRL(item.tendencia)}</td>
      <td className={'right mono text-muted' + strong}>{formatBRL(item.creditoModificacoes)}</td>
      <td className={'right mono' + strong}>{formatBRL(item.ganhosIncc)}</td>
      <td className={'right mono' + strong}>{formatBRL(item.saving)}</td>
      <td className={'right mono' + strong}>{formatBRL(item.ganhosInccReal)}</td>
      <td className={'right mono' + strong}>{formatBRL(item.savingReal)}</td>
      <td className={'right mono' + strong}>{formatBRL(item.reservaFinanceira)}</td>
      <td className={'right mono' + strong}>{formatBRL(item.saldoDistribuirReal)}</td>
      <td className={'right mono text-muted' + strong}>{formatNum(item.saldoDistribuirIncc)}</td>
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
                <div className="kpi-label"><span className="kpi-icon"><Icon name="trending-up" size={15} /></span>Ganhos em INCC (R$)</div>
                <div className="kpi-value" style={{ color: corCss(kpis.corGanhosInccReal) }}>{formatNum(kpis.ganhosInccRealPct)}<span className="unit">%</span></div>
                <div className="kpi-foot-text">{formatBRL(kpis.ganhosInccReal)}</div>
              </div>
              <div className="kpi">
                <div className="kpi-label"><span className="kpi-icon"><Icon name="flag" size={15} /></span>Fechamento</div>
                <div className="kpi-value" style={{ color: corCss(kpis.corTendencia) }}>{formatNum(kpis.tendenciaFechamentoPct)}<span className="unit">%</span></div>
                <div className="kpi-foot-text">{formatBRL(kpis.tendenciaFechamentoReal)}</div>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Fechamento por disciplina</div>
                <div className="card-subtitle">
                  {registro.nome_arquivo ? `Importado de ${registro.nome_arquivo}` : 'Importado'}
                  {registro.imported_at ? ` · ${formatDateTime(registro.imported_at)}` : ''}
                </div>
              </div>
            </div>
            <div className="card-body flush" style={{ overflowX: 'auto' }}>
              <table className="tbl" style={{ minWidth: 2000, whiteSpace: 'nowrap' }}>
                <thead>
                  <tr className="band-row">
                    <th colSpan={5} style={{ ...BANDA_CLARA, textAlign: 'center' }}>Orçamento</th>
                    <th colSpan={5} style={{ ...BANDA_ESCURA, borderLeft: '2px solid var(--brand)', textAlign: 'center' }}>Acumulado até {mesCurto(mesSel)}</th>
                    <th colSpan={9} style={{ ...BANDA_CLARA, borderLeft: '2px solid var(--brand)', textAlign: 'center' }}>Fechamento</th>
                  </tr>
                  <tr>
                    <th style={BANDA_CLARA}>Código</th>
                    <th style={BANDA_CLARA}>Nome</th>
                    <th className="right" style={BANDA_CLARA}>Atualizado (R$)</th>
                    <th className="right" style={BANDA_CLARA}>Jun/25 (R$)</th>
                    <th className="right" style={BANDA_CLARA}>INCC base</th>
                    <th className="right" style={{ ...BANDA_ESCURA, borderLeft: '2px solid var(--brand)' }}>Previsto (%)</th>
                    <th className="right" style={BANDA_ESCURA}>Exec. físico (%)</th>
                    <th className="right" style={BANDA_ESCURA}>Gasto (%)</th>
                    <th className="right" style={BANDA_ESCURA}>Gasto (INCC)</th>
                    <th className="right" style={BANDA_ESCURA}>Gasto (R$)</th>
                    <th className="right" style={{ ...BANDA_CLARA, borderLeft: '2px solid var(--brand)' }}>Tendência (R$)</th>
                    <th className="right" style={BANDA_CLARA}>Créd. Modificações</th>
                    <th className="right" style={BANDA_CLARA}>Ganhos (INCC)</th>
                    <th className="right" style={BANDA_CLARA}>Saving</th>
                    <th className="right" style={BANDA_CLARA}>Ganhos (INCC) Real</th>
                    <th className="right" style={BANDA_CLARA}>Saving Real</th>
                    <th className="right" style={BANDA_CLARA}>Reserva Financeira</th>
                    <th className="right" style={BANDA_CLARA}>Saldo (R$)</th>
                    <th className="right" style={BANDA_CLARA}>Saldo (INCC)</th>
                  </tr>
                </thead>
                <tbody>
                  {total && <LinhaFechamento key={total.codigo} item={total} total />}
                  {disciplinas.map((it, i) => <LinhaFechamento key={it.codigo} item={it} striped={i % 2 === 1} />)}
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
          mesInicial={mesSel || mesAtualISO()}
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
