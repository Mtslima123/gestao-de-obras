import React from 'react';
import { Icon } from '../../components/Icons';
import { Modal, useToast } from '../../components/Modals';
import { formatBRL, formatNum } from '../../utils/formatters';
import { computeAllWBS, computeRealizedDistAte } from './scheduleEngine';
import { offsetToDate, dateToOffset } from './cronogramaDateUtils';
import { medicaoMensalService } from './medicaoMensal.service';
import {
  fmtPct100, PREVISTO_MES_PCT, computeDisciplinaInfo, buildItensMedicao,
  parsePercInput, derivarStatus, computeArvoreMedicao, gruposParaNivel, computeTotaisMedicao,
  computeResumo, validarFechamento, mergePercMedido, buildSnapshotFechamento,
} from './medicaoMensalPure';

// Medição Mensal — aba do módulo Cronograma. Gera a medição físico-financeira do
// mês a partir dos itens do cronograma agendados no mês de referência (mesma
// distribuição mensal usada em Uso da Tarefa/Curva Física), permite ajustar o
// % medido de cada item e consolidar (fechar) a medição do mês.
//
// A tabela renderiza a hierarquia REAL do cronograma (N1/N2/N3): grupos indentados e
// recolhíveis, folhas medíveis. O colapso é estado LOCAL desta tela — diferente da
// Lista, que grava `e.collapsed` no cronograma; aqui a Medição só lê o cronograma.

const STATUS_META = {
  pendente:  { label: 'Pendente',     badge: 'danger' },
  andamento: { label: 'Em andamento', badge: 'warning' },
  concluida: { label: 'Concluída',    badge: 'success' },
  atrasada:  { label: 'Atrasada',     badge: 'neutral' },
};
const STATUS_ORDER = ['concluida', 'andamento', 'pendente', 'atrasada'];

const MES_NOMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const mesLabel = (key) => {
  const [y, m] = (key || '').split('-');
  return m ? `${MES_NOMES[Number(m) - 1]} / ${y}` : '—';
};
const mesAtualKeyLocal = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
};
function carregarMesRefMedicao(obraId) {
  try { return localStorage.getItem('crono_medicao_mesref_' + obraId) || null; } catch { return null; }
}
function salvarMesRefMedicao(obraId, key) {
  try { localStorage.setItem('crono_medicao_mesref_' + obraId, key); } catch { /* ignore */ }
}

// Primeiro e último dia do mês de referência, em ISO — default dos campos De/Até.
function limitesDoMes(mesRefKey) {
  const [y, m] = (mesRefKey || '').split('-').map(Number);
  if (!y || !m) return { de: '', ate: '' };
  const ultimo = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, '0');
  return { de: `${y}-${mm}-01`, ate: `${y}-${mm}-${String(ultimo).padStart(2, '0')}` };
}

const PDF_FORMATOS = ['a4', 'a3', 'a2', 'a1'];

function KpiCard({ label, value, barColor, foot, footColor }) {
  return (
    <div className="kpi" style={{ padding: '18px 20px' }}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value num" style={{ fontSize: 30, marginTop: 4 }}>
        {formatNum(value, 1)}<span className="unit">%</span>
      </div>
      <div className="kpi-bar">
        <span className="kpi-bar-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: barColor }} />
      </div>
      <div className="kpi-foot" style={{ marginTop: 6 }}>
        <span className="kpi-foot-text" style={{ color: footColor }}>{foot}</span>
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const meta = STATUS_META[status] || STATUS_META.pendente;
  return <span className={'badge ' + meta.badge}><span className="dot" />{meta.label}</span>;
}

function ModalFecharMedicao({ mesRefKey, violacoes, salvando, onClose, onConfirmar }) {
  const bloqueadoPorViolacao = violacoes.length > 0;
  return (
    <Modal
      title="Fechar medição"
      subtitle={mesLabel(mesRefKey)}
      onClose={onClose}
      footer={
        <>
          <div className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button
            className="btn"
            style={{ background: 'var(--success)', color: '#fff' }}
            disabled={bloqueadoPorViolacao || salvando}
            onClick={onConfirmar}
          >
            <Icon name="check" size={14} />{salvando ? 'Fechando…' : 'Confirmar fechamento'}
          </button>
        </>
      }
    >
      {bloqueadoPorViolacao ? (
        <div>
          <p style={{ color: 'var(--danger)', fontWeight: 600, marginBottom: 8, fontSize: 13.5 }}>
            {violacoes.length} item(ns) com % medido maior que % executado. Corrija antes de fechar:
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-soft)' }}>
            {violacoes.map(v => (
              <li key={v.id}>{v.wbs} — {v.descricao}: medido {fmtPct100(v.percMedido)} &gt; executado {fmtPct100(v.percExecutado)}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p style={{ fontSize: 13.5, color: 'var(--text-soft)' }}>
          Isso vai consolidar a medição de {mesLabel(mesRefKey)} e bloquear novas edições de % medido. Deseja continuar?
        </p>
      )}
    </Modal>
  );
}

export default function MedicaoMensal({
  etapas, months, monthlyDist, monthlyTotals, valorVinculadoMap = {},
  obraId, readOnly, currentUser, onAtualizarDados,
}) {
  const toast = useToast();
  const hasVinc = Object.keys(valorVinculadoMap).length > 0;
  const weightOverride = hasVinc ? valorVinculadoMap : null;

  const [mesRefKey, setMesRefKey] = React.useState(() => {
    const salvo = carregarMesRefMedicao(obraId);
    if (salvo && months.some(m => m.key === salvo)) return salvo;
    const atual = mesAtualKeyLocal();
    if (months.some(m => m.key === atual)) return atual;
    return months[months.length - 1]?.key || '';
  });
  React.useEffect(() => { if (obraId && mesRefKey) salvarMesRefMedicao(obraId, mesRefKey); }, [obraId, mesRefKey]);
  React.useEffect(() => {
    if (months.length && !months.some(m => m.key === mesRefKey)) setMesRefKey(months[months.length - 1].key);
  }, [months, mesRefKey]);

  const [registro, setRegistro] = React.useState(null);
  const [itensTrabalho, setItensTrabalho] = React.useState([]);
  const [carregando, setCarregando] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);
  const [busca, setBusca] = React.useState('');
  const [disciplina, setDisciplina] = React.useState('Todas');
  const [pavimento, setPavimento] = React.useState('Todos');
  const [mostrarConfirmFechar, setMostrarConfirmFechar] = React.useState(false);

  // Recorte do período: começa no mês de referência e pode ser ampliado à mão.
  const [incluirNaoProgramados, setIncluirNaoProgramados] = React.useState(false);
  const [periodoDe, setPeriodoDe] = React.useState(() => limitesDoMes(mesRefKey).de);
  const [periodoAte, setPeriodoAte] = React.useState(() => limitesDoMes(mesRefKey).ate);
  React.useEffect(() => {
    const lim = limitesDoMes(mesRefKey);
    setPeriodoDe(lim.de);
    setPeriodoAte(lim.ate);
  }, [mesRefKey]);

  // Grupos recolhidos (ids). Local: recolher aqui não mexe no cronograma.
  const [collapsed, setCollapsed] = React.useState(() => new Set());

  const [fechadas, setFechadas] = React.useState([]);
  const [pdfFormat, setPdfFormat] = React.useState('a3');
  const [exportando, setExportando] = React.useState(false);

  const wbsMap = React.useMemo(() => computeAllWBS(etapas), [etapas]);
  const disciplinaInfo = React.useMemo(() => computeDisciplinaInfo(etapas, wbsMap), [etapas, wbsMap]);

  const periodo = React.useMemo(() => {
    if (!periodoDe || !periodoAte) return null;
    return { de: dateToOffset(periodoDe), ate: dateToOffset(periodoAte) };
  }, [periodoDe, periodoAte]);

  const gerarMedicao = React.useCallback(async () => {
    if (!obraId || !mesRefKey) { setItensTrabalho([]); setRegistro(null); return; }
    setCarregando(true);
    const base = buildItensMedicao(etapas, mesRefKey, {
      monthlyDist, wbsMap, disciplinaInfo,
      incluirNaoProgramados, periodo, valorVinculadoMap: weightOverride,
    });
    const reg = await medicaoMensalService.buscarPorMes(obraId, mesRefKey);
    setRegistro(reg);
    setItensTrabalho(mergePercMedido(base, reg?.itens));
    setCarregando(false);
  }, [etapas, mesRefKey, monthlyDist, wbsMap, disciplinaInfo, obraId, incluirNaoProgramados, periodo, weightOverride]);

  // Carrega ao montar e sempre que trocar de mês/obra ou de recorte do período —
  // edições em andamento do usuário não são perdidas por mudanças não relacionadas.
  React.useEffect(() => { gerarMedicao(); }, [obraId, mesRefKey, incluirNaoProgramados, periodoDe, periodoAte]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    let vivo = true;
    medicaoMensalService.listarFechadas(obraId).then(r => { if (vivo) setFechadas(r); });
    return () => { vivo = false; };
  }, [obraId, registro]);

  const fechada = registro?.status === 'fechada';
  const bloqueado = readOnly || fechada;

  const disciplinas = React.useMemo(
    () => ['Todas', ...Array.from(new Set(itensTrabalho.map(i => i.disciplina))).sort((a, b) => a.localeCompare(b, 'pt-BR'))],
    [itensTrabalho]
  );
  const pavimentos = React.useMemo(
    () => ['Todos', ...Array.from(new Set(itensTrabalho.map(i => i.pavimento))).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))],
    [itensTrabalho]
  );

  const filtradas = React.useMemo(() => itensTrabalho.filter(i => (
    (disciplina === 'Todas' || i.disciplina === disciplina) &&
    (pavimento === 'Todos' || i.pavimento === pavimento) &&
    (busca.trim() === '' ||
      i.descricao.toLowerCase().includes(busca.trim().toLowerCase()) ||
      i.wbs.includes(busca.trim()))
  )), [itensTrabalho, disciplina, pavimento, busca]);

  // Denominador = só o previsto do mês. Itens fora do mês somam ao realizado
  // (numerador) mas não ao previsto, então % executado pode passar de 100%.
  const valorTotalBase = React.useMemo(
    () => itensTrabalho.reduce((s, i) => s + (i.foraDoMes ? 0 : i.valor), 0),
    [itensTrabalho]
  );
  const linhas = React.useMemo(
    () => computeArvoreMedicao(filtradas, etapas, valorTotalBase, collapsed),
    [filtradas, etapas, valorTotalBase, collapsed]
  );
  const totais = React.useMemo(() => computeTotaisMedicao(filtradas, valorTotalBase), [filtradas, valorTotalBase]);
  const qtdForaDoMes = React.useMemo(() => filtradas.filter(i => i.foraDoMes).length, [filtradas]);

  const resumo = React.useMemo(() => {
    if (!mesRefKey) return { valorObra: 0, metaProgramada: 0, previstoAcumulado: 0, executadoAcumulado: 0 };
    const [y, m] = mesRefKey.split('-');
    const ateData = new Date(Number(y), Number(m), 0); // último dia do mês de referência
    const realizedTotalsAte = computeRealizedDistAte(etapas, ateData, weightOverride);
    return computeResumo({ monthlyTotals, realizedTotalsAte, mesRefKey });
  }, [etapas, monthlyTotals, weightOverride, mesRefKey]);

  const gapExecutado = PREVISTO_MES_PCT - totais.exec;
  const validacao = React.useMemo(() => validarFechamento(itensTrabalho), [itensTrabalho]);

  const alterarMedido = (id, bruto) => {
    if (bloqueado) return;
    const valor = parsePercInput(bruto);
    setItensTrabalho(prev => prev.map(l => (l.id === id ? { ...l, percMedido: valor } : l)));
  };

  const alternarGrupo = (id) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Mesma semântica de applyOutlineLevel do Cronograma (0 = expandir tudo), mas o
  // resultado é o Set local desta tela, sem gravar no cronograma.
  const aplicarNivel = (nivel) => {
    const todas = computeArvoreMedicao(filtradas, etapas, valorTotalBase, new Set());
    setCollapsed(gruposParaNivel(todas, nivel));
  };

  const salvarRascunho = async () => {
    setSalvando(true);
    const { data, error } = await medicaoMensalService.salvarRascunho(obraId, mesRefKey, itensTrabalho);
    setSalvando(false);
    if (error) { toast('Não foi possível salvar o rascunho (tabela de medição ainda não disponível).', { tone: 'danger' }); return; }
    setRegistro(data);
    toast('Rascunho salvo', { tone: 'success', icon: 'check' });
  };

  const confirmarFechamento = async () => {
    setSalvando(true);
    const snapshot = buildSnapshotFechamento(itensTrabalho, totais);
    const { data, error } = await medicaoMensalService.fechar(obraId, mesRefKey, snapshot, currentUser?.nome || currentUser?.email);
    setSalvando(false);
    if (error) { toast('Não foi possível fechar a medição (tabela de medição ainda não disponível).', { tone: 'danger' }); return; }
    setRegistro(data);
    setMostrarConfirmFechar(false);
    toast('Medição fechada', { tone: 'success', icon: 'check' });
  };

  // ── Exportação ────────────────────────────────────────────────────────────
  // Linhas da árvore no formato de planilha/PDF: mesma ordem e hierarquia da tela,
  // com a indentação por nível que o projeto já usa nos outros exports.
  const linhasExport = () => linhas.map(l => {
    const grupo = l.tipo === 'grupo';
    const status = grupo ? '' : (STATUS_META[derivarStatus(l)]?.label || '');
    return {
      grupo,
      cells: [
        l.wbs || '',
        '  '.repeat(l.nivel || 0) + l.descricao + (l.foraDoMes ? ' (fora do mês)' : ''),
        grupo ? '' : l.pavimento,
        grupo ? null : offsetToDate(l.inicioOff),
        grupo ? null : offsetToDate(l.terminoOff),
        grupo ? '' : l.duracaoDias,
        (l.peso ?? (valorTotalBase ? (l.valor / valorTotalBase) * 100 : 0)) / 100,
        (grupo ? l.exec : l.percExecutado) / 100,
        (grupo ? l.med : l.percMedido) / 100,
        grupo ? l.valor : (l.valor * l.percMedido) / 100,
        status,
      ],
    };
  });

  const CABECALHOS = ['SERVIÇO', 'DESCRIÇÃO', 'PAVIMENTO', 'INÍCIO', 'TÉRMINO', 'DUR.', 'PESO %', '% EXECUTADO', '% MEDIDO', 'VALOR A MEDIR', 'STATUS'];

  const exportarExcel = async () => {
    setExportando(true);
    try {
      const XLSX = await import('xlsx');
      const corpo = linhasExport().map(l => l.cells);
      const rows = [
        CABECALHOS,
        ...corpo,
        [],
        [`TOTAL GERAL · ${totais.qtd} atividades`, '', '', null, null, '',
          totais.peso / 100, totais.exec / 100, totais.med / 100, totais.valorAMedir, ''],
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows, { dateNF: 'DD/MM/YYYY' });
      const rng = XLSX.utils.decode_range(ws['!ref']);
      // Números crus na célula + formato via .z (nunca string de moeda), padrão do projeto.
      for (let R = 1; R <= rng.e.r; R++) {
        [[3, 'DD/MM/YYYY'], [4, 'DD/MM/YYYY'], [6, '0.00%'], [7, '0.00%'], [8, '0.00%'], [9, '#,##0.00']].forEach(([C, z]) => {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          if (ws[addr]) ws[addr].z = z;
        });
      }
      ws['!cols'] = [{ wch: 12 }, { wch: 46 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 7 }, { wch: 10 }, { wch: 13 }, { wch: 11 }, { wch: 16 }, { wch: 14 }];
      ws['!freeze'] = { xSplit: 2, ySplit: 1 };
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Medição');
      XLSX.writeFile(wb, `medicao-mensal-${mesRefKey || 'mes'}.xlsx`);
    } catch {
      toast('Erro ao exportar para Excel', { tone: 'danger' });
    } finally {
      setExportando(false);
    }
  };

  const exportarPDF = async () => {
    setExportando(true);
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: pdfFormat });
      const BRAND = [28, 69, 132]; // #1C4584 (identidade Soter)
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();
      doc.setFontSize(13); doc.text(`Medição Mensal · ${mesLabel(mesRefKey)}`, 14, 14);
      doc.setFontSize(8); doc.setTextColor(130);
      doc.text(`Período ${periodoDe ? periodoDe.split('-').reverse().join('/') : '—'} a ${periodoAte ? periodoAte.split('-').reverse().join('/') : '—'} · Gerado em ${new Date().toLocaleDateString('pt-BR')}`, 14, 20);
      doc.setTextColor(0);

      const dados = linhasExport();
      const fmtD = (d) => (d ? d.toLocaleDateString('pt-BR') : '');
      const fmtP = (v) => `${formatNum(v * 100, 1)}%`;
      autoTable(doc, {
        startY: 25,
        head: [CABECALHOS],
        body: dados.map(l => [
          l.cells[0], l.cells[1], l.cells[2], fmtD(l.cells[3]), fmtD(l.cells[4]), l.cells[5],
          fmtP(l.cells[6]), fmtP(l.cells[7]), fmtP(l.cells[8]), formatBRL(l.cells[9]), l.cells[10],
        ]),
        foot: [[
          { content: `TOTAL GERAL · ${totais.qtd} atividades`, colSpan: 6, styles: { halign: 'left' } },
          fmtPct100(totais.peso), fmtPct100(totais.exec), fmtPct100(totais.med), formatBRL(totais.valorAMedir), '',
        ]],
        theme: 'grid',
        headStyles: { fillColor: BRAND, textColor: 255, fontSize: 7, fontStyle: 'bold', halign: 'center' },
        bodyStyles: { fontSize: 7, textColor: 40 },
        footStyles: { fillColor: [225, 232, 242], textColor: 20, fontStyle: 'bold', fontSize: 7, halign: 'right' },
        alternateRowStyles: { fillColor: [248, 249, 250] },
        columnStyles: {
          5: { halign: 'center' }, 6: { halign: 'center' }, 7: { halign: 'center' },
          8: { halign: 'center' }, 9: { halign: 'right' }, 10: { halign: 'center' },
        },
        margin: { top: 25, right: 14, bottom: 14, left: 14 },
        didParseCell: (data) => {
          if (data.section === 'body' && dados[data.row.index]?.grupo) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [232, 240, 252];
            data.cell.styles.textColor = 20;
          }
          if (data.section === 'foot' && data.column.index === 0) data.cell.styles.halign = 'left';
        },
        didDrawPage: ({ pageNumber }) => {
          doc.setFontSize(8); doc.setTextColor(150);
          doc.text(`Página ${pageNumber}`, W - 20, H - 6);
          doc.setTextColor(0);
        },
      });
      doc.save(`medicao-mensal-${mesRefKey || 'mes'}.pdf`);
    } catch {
      toast('Erro ao exportar para PDF', { tone: 'danger' });
    } finally {
      setExportando(false);
    }
  };

  // Banda e nomes de coluna são os dois sticky; sem deslocar o segundo pelo altura do
  // primeiro, as duas faixas colidem no topo ao rolar (mesma correção da Lista).
  const bandRowRef = React.useRef(null);
  const [bandH, setBandH] = React.useState(26);
  React.useEffect(() => {
    if (bandRowRef.current) {
      const h = Math.ceil(bandRowRef.current.getBoundingClientRect().height);
      if (h && h !== bandH) setBandH(h);
    }
  });
  const bandTop = Math.max(0, bandH - 1);
  const thSticky = { position: 'sticky', top: bandTop, zIndex: 3 };
  const footCell = { padding: '0 10px', height: 30 };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Medição Mensal</h1>
          <div className="page-subtitle">Medição física da obra · itens do cronograma agendados para o mês</div>
        </div>
        <div className="page-actions">
          <select className="input" value={mesRefKey} onChange={e => setMesRefKey(e.target.value)} style={{ minWidth: 150 }}>
            {months.map(m => <option key={m.key} value={m.key}>{mesLabel(m.key)}</option>)}
          </select>
          <button type="button" className="btn btn-ghost" onClick={onAtualizarDados} disabled={carregando}>
            <Icon name="refresh-cw" size={15} />Atualizar dados
          </button>
          <button type="button" className="btn btn-ghost" onClick={exportarExcel} disabled={exportando}>
            <Icon name="download" size={15} />Excel
          </button>
          <select className="input" value={pdfFormat} onChange={e => setPdfFormat(e.target.value)}
            title="Tamanho do papel do PDF" style={{ minWidth: 74 }}>
            {PDF_FORMATOS.map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}
          </select>
          <button type="button" className="btn btn-ghost" onClick={exportarPDF} disabled={exportando}>
            <Icon name="download" size={15} />{exportando ? 'Gerando…' : 'PDF'}
          </button>
          <button type="button" className="btn btn-dark" onClick={gerarMedicao} disabled={carregando || bloqueado}>
            <Icon name="plus" size={15} />{carregando ? 'Gerando…' : 'Gerar medição'}
          </button>
        </div>
      </div>

      <div className="kpi-grid cols-5">
        <KpiCard label="Previsto do mês" value={PREVISTO_MES_PCT} barColor="var(--brand)" foot="meta física do mês" />
        <KpiCard
          label="Executado do mês" value={totais.exec} barColor="var(--warning)"
          foot={`${gapExecutado >= 0 ? '▼' : '▲'} ${formatNum(Math.abs(gapExecutado), 1)} pp vs previsto`}
          footColor={gapExecutado >= 0 ? 'var(--danger)' : 'var(--success)'}
        />
        <KpiCard label="Medido do mês" value={totais.med} barColor="var(--success)" foot="aprovado para medição" />
        <KpiCard label="Previsto acumulado" value={resumo.previstoAcumulado} barColor="var(--brand)" foot="linha de base" />
        <KpiCard label="Executado acumulado" value={resumo.executadoAcumulado} barColor="var(--success)" foot="real + reprogramado" />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--gap)', marginBottom: 'var(--gap)' }}>
        <div className="card" style={{ flex: 1, minWidth: 220, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>Meta programada · {mesLabel(mesRefKey)}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }} className="num">{fmtPct100(resumo.metaProgramada)}</div>
        </div>
        <div style={{ flex: 1, minWidth: 220, borderRadius: 'var(--r-lg)', background: 'var(--brand-700)', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#c7d4ea' }}>Medição a realizar</div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#fff' }} className="num">{fmtPct100(totais.med)}</div>
            <div style={{ fontSize: 13, color: '#a9bfe0' }} className="num">{formatBRL(totais.valorAMedir)}</div>
          </div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 220, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>Valor da obra</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }} className="num">{formatBRL(resumo.valorObra)}</div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <input
            className="input input-search"
            style={{ flex: 1, minWidth: 200 }}
            placeholder="Buscar atividade..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
          <select className="input" value={disciplina} onChange={e => setDisciplina(e.target.value)} style={{ minWidth: 150 }}>
            {disciplinas.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select className="input" value={pavimento} onChange={e => setPavimento(e.target.value)} style={{ minWidth: 150 }}>
            {pavimentos.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select
            className="input" defaultValue="" style={{ minWidth: 130 }}
            title="Expandir/recolher a estrutura por nível"
            onChange={e => { const v = e.target.value; e.target.value = ''; if (v !== '') aplicarNivel(Number(v)); }}
          >
            <option value="" disabled>Estrutura…</option>
            <option value="0">Expandir tudo</option>
            <option value="1">Recolher tudo</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => <option key={n} value={n}>Nível {n}</option>)}
          </select>
          {!bloqueado && (
            <>
              <button type="button" className="btn btn-ghost" onClick={salvarRascunho} disabled={salvando}>
                <Icon name="save" size={15} />Salvar rascunho
              </button>
              <button
                type="button"
                className="btn"
                style={{ background: 'var(--success)', color: '#fff' }}
                onClick={() => setMostrarConfirmFechar(true)}
              >
                <Icon name="check" size={15} />Fechar medição
              </button>
            </>
          )}
          {fechada && <span className="badge success" style={{ marginLeft: 'auto' }}><span className="dot" />Medição fechada</span>}
        </div>

        {/* Recorte do período: começa no mês de referência; itens fora do mês somam ao
            realizado, não ao previsto (foram produzidos além do programado). */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Período</span>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-soft)' }}>
            De
            <input type="date" className="input" style={{ height: 28, fontSize: 12.5 }}
              value={periodoDe} onChange={e => setPeriodoDe(e.target.value)} />
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-soft)' }}>
            Até
            <input type="date" className="input" style={{ height: 28, fontSize: 12.5 }}
              value={periodoAte} onChange={e => setPeriodoAte(e.target.value)} />
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-soft)', cursor: 'pointer' }}
            title="Traz tarefas sem fatia programada neste mês, para medir o que foi feito adiantado">
            <input type="checkbox" checked={incluirNaoProgramados} onChange={e => setIncluirNaoProgramados(e.target.checked)} />
            Incluir itens não programados
          </label>
          {qtdForaDoMes > 0 && (
            <span className="badge warning" style={{ marginLeft: 'auto' }}>
              {qtdForaDoMes} {qtdForaDoMes === 1 ? 'item fora do mês' : 'itens fora do mês'} · somam ao realizado, não ao previsto
            </span>
          )}
        </div>

        <div style={{ overflowX: 'auto' }}>
          {/* tbl-lista: cabeçalho azul e altura de linha fina, os mesmos da Lista. */}
          <table className="tbl tbl-lista" style={{ minWidth: 1240, '--lista-row-h': '24px' }}>
            <thead>
              <tr className="band-row" ref={bandRowRef}>
                <th colSpan={3}>ETAPA / TAREFA</th>
                <th colSpan={3}>PRAZO</th>
                <th colSpan={3}>AVANÇO</th>
                <th colSpan={2}>FINANCEIRO</th>
              </tr>
              <tr>
                <th style={{ ...thSticky, width: 110 }}>SERVIÇO</th>
                <th style={thSticky}>DESCRIÇÃO</th>
                <th style={thSticky}>PAVIMENTO</th>
                <th className="center" style={thSticky}>INÍCIO</th>
                <th className="center" style={thSticky}>TÉRMINO</th>
                <th className="center" style={thSticky}>DUR.</th>
                <th className="center" style={thSticky}>PESO %</th>
                <th style={{ ...thSticky, minWidth: 160 }}>% EXECUTADO</th>
                <th className="center" style={thSticky}>% MEDIDO</th>
                <th className="right" style={thSticky}>VALOR A MEDIR</th>
                <th className="center" style={thSticky}>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {linhas.length === 0 && (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-muted)' }}>
                    Nenhum item do cronograma agendado para o período com os filtros aplicados.
                  </td>
                </tr>
              )}
              {linhas.map(l => {
                const indent = (l.nivel || 0) * 20;
                if (l.tipo === 'grupo') {
                  return (
                    <tr key={'g' + l.id} className="lista-row-group" style={{ fontWeight: 600 }}>
                      <td className="num">{l.wbs}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', paddingLeft: indent }}>
                          <button className="lista-toggle" onClick={() => alternarGrupo(l.id)}
                            title={l.colapsado ? 'Expandir' : 'Recolher'}>
                            {l.colapsado ? '▶' : '▼'}
                          </button>
                          <span style={{ fontWeight: 700 }}>{l.descricao}</span>
                        </div>
                      </td>
                      <td /><td /><td /><td />
                      <td className="center num">{fmtPct100(l.peso)}</td>
                      <td className="num">{fmtPct100(l.exec)}</td>
                      <td className="center num">{fmtPct100(l.med)}</td>
                      <td className="right num">{formatBRL(l.valor, 2)}</td>
                      <td />
                    </tr>
                  );
                }
                const status = derivarStatus(l);
                const peso = valorTotalBase ? (l.valor / valorTotalBase) * 100 : 0;
                return (
                  <tr key={l.id}>
                    <td className="num">{l.wbs}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: indent }}>
                        {/* Espaçador da largura da seta: alinha a folha com o nome do grupo do mesmo nível. */}
                        <span style={{ width: 20, flexShrink: 0, display: 'inline-block' }} />
                        <span>{l.descricao}</span>
                        {l.foraDoMes && (
                          <span className="badge warning" style={{ fontSize: 9.5, padding: '0 5px' }}>fora do mês</span>
                        )}
                      </div>
                    </td>
                    <td>{l.pavimento}</td>
                    <td className="center num">{l.dataInicio}</td>
                    <td className="center num">{l.dataTermino}</td>
                    <td className="center num">{l.duracaoDias}</td>
                    <td className="center num">{fmtPct100(peso)}</td>
                    <td>
                      <div className="progress-row">
                        <div className={'progress' + (status === 'concluida' ? ' success' : status === 'pendente' ? ' danger' : '')}>
                          <span style={{ width: `${Math.min(100, l.percExecutado)}%` }} />
                        </div>
                        <span className="pct">{fmtPct100(l.percExecutado)}</span>
                      </div>
                    </td>
                    <td className="center">
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                        <input
                          className="input"
                          style={{ width: 56, height: 24, padding: '0 6px', textAlign: 'right' }}
                          inputMode="decimal"
                          value={l.percMedido}
                          disabled={bloqueado}
                          aria-label={`Percentual medido de ${l.descricao}`}
                          onChange={e => alterarMedido(l.id, e.target.value)}
                        />
                        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>%</span>
                      </span>
                    </td>
                    <td className="right num" style={{ fontWeight: 600 }}>{formatBRL((l.valor * l.percMedido) / 100, 2)}</td>
                    <td className="center"><StatusPill status={status} /></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--brand-700)', color: '#fff', fontWeight: 600 }}>
                <td colSpan={6} style={footCell}>TOTAL GERAL · {totais.qtd} atividades</td>
                <td className="center num" style={footCell}>{fmtPct100(totais.peso)}</td>
                <td className="num" style={footCell}>{fmtPct100(totais.exec)}</td>
                <td className="center num" style={footCell}>{fmtPct100(totais.med)}</td>
                <td className="right num" style={footCell}>{formatBRL(totais.valorAMedir, 2)}</td>
                <td style={footCell} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="legend" style={{ marginTop: 12, justifyContent: 'space-between' }}>
        <span>Itens do cronograma agendados para {mesLabel(mesRefKey)}{registro?.updated_at ? ` · atualizado em ${new Date(registro.updated_at).toLocaleString('pt-BR')}` : ''}</span>
        <div style={{ display: 'flex', gap: 16 }}>
          {STATUS_ORDER.map(s => (
            <span key={s} className="legend-item">
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: `var(--${STATUS_META[s].badge === 'neutral' ? 'text-muted' : STATUS_META[s].badge})`, display: 'inline-block' }} />
              {STATUS_META[s].label}
            </span>
          ))}
        </div>
      </div>

      {/* Histórico: medições já fechadas, com os valores congelados no fechamento. */}
      {fechadas.length > 0 && (
        <div className="card" style={{ marginTop: 'var(--gap)' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>Medições fechadas</div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>valores congelados no fechamento</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl tbl-lista" style={{ '--lista-row-h': '26px' }}>
              <thead>
                <tr>
                  <th>MÊS</th>
                  <th className="center">FECHADA EM</th>
                  <th>FECHADA POR</th>
                  <th className="center">ITENS</th>
                  <th className="center">% MEDIDO</th>
                  <th className="right">VALOR MEDIDO</th>
                </tr>
              </thead>
              <tbody>
                {fechadas.map(f => (
                  <tr key={f.id}>
                    <td style={{ fontWeight: 600 }}>{mesLabel(f.mes_referencia)}</td>
                    <td className="center num">{f.fechada_em ? new Date(f.fechada_em).toLocaleDateString('pt-BR') : '—'}</td>
                    <td>{f.fechada_por || '—'}</td>
                    <td className="center num">{Array.isArray(f.itens) ? f.itens.length : 0}</td>
                    <td className="center num">{f.perc_medido == null ? '—' : fmtPct100(f.perc_medido)}</td>
                    <td className="right num">{f.valor_total_medido == null ? '—' : formatBRL(f.valor_total_medido, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {mostrarConfirmFechar && (
        <ModalFecharMedicao
          mesRefKey={mesRefKey}
          violacoes={validacao.violacoes}
          salvando={salvando}
          onClose={() => setMostrarConfirmFechar(false)}
          onConfirmar={confirmarFechamento}
        />
      )}
    </>
  );
}
