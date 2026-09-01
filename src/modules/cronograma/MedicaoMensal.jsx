import React from 'react';
import { Icon } from '../../components/Icons';
import { Modal, useToast } from '../../components/Modals';
import { formatBRL, formatNum } from '../../utils/formatters';
import { computeAllWBS, computeRealizedDistAte } from './scheduleEngine';
import { offsetToDate } from './cronogramaDateUtils';
import { medicaoMensalService } from './medicaoMensal.service';
import {
  fmtPct100, PREVISTO_MES_PCT, computeDisciplinaInfo, buildItensMedicao, listarTarefasForaDoMes,
  parsePercInput, derivarStatus, computeArvoreMedicao, gruposParaNivel, computeTotaisMedicao,
  computeResumo, validarFechamento, mergePercMedido, buildSnapshotFechamento, hidratarSnapshot,
} from './medicaoMensalPure';

// Medição Mensal — aba do módulo Cronograma. Gera a medição físico-financeira do
// mês a partir dos itens do cronograma agendados no mês de referência (mesma
// distribuição mensal usada em Uso da Tarefa/Curva Física), permite ajustar o
// % medido de cada item e consolidar (fechar) a medição do mês.
//
// A tabela renderiza a hierarquia REAL do cronograma (N1/N2/N3): grupos indentados e
// recolhíveis, folhas medíveis. O colapso é estado LOCAL desta tela — diferente da
// Lista, que grava `e.collapsed` no cronograma; aqui a Medição só lê o cronograma.

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

const PDF_FORMATOS = ['a4', 'a3', 'a2', 'a1'];

function ModalReabrirMedicao({ mesRefKey, salvando, onClose, onConfirmar }) {
  return (
    <Modal
      title="Reabrir medição"
      subtitle={mesLabel(mesRefKey)}
      onClose={onClose}
      overlay={false}
      footer={
        <>
          <div className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={salvando} onClick={onConfirmar}>
            <Icon name="refresh-cw" size={14} />{salvando ? 'Reabrindo…' : 'Reabrir medição'}
          </button>
        </>
      }
    >
      <p style={{ fontSize: 13.5, color: 'var(--text-soft)' }}>
        Isso volta {mesLabel(mesRefKey)} para rascunho e libera o % medido de cada item
        para edição de novo. Os valores desta medição saem do histórico de "Medições
        fechadas" até você fechar de novo.
      </p>
    </Modal>
  );
}

function KpiCard({ label, value, barColor, foot, footColor }) {
  return (
    <div className="kpi" style={{ padding: '18px 20px' }}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value num" style={{ fontSize: 30, marginTop: 4 }}>
        {formatNum(value, 2)}<span className="unit">%</span>
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

function ModalFecharMedicao({ mesRefKey, violacoes, salvando, onClose, onConfirmar }) {
  const bloqueadoPorViolacao = violacoes.length > 0;
  return (
    <Modal
      title="Fechar medição"
      subtitle={mesLabel(mesRefKey)}
      onClose={onClose}
      overlay={false}
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

// Tela de escolha manual de tarefas fora do mês (sem fatia programada no mês de
// referência) para trazer à medição — substitui o antigo checkbox "Incluir itens não
// programados" por uma seleção explícita, item a item.
function ModalIncluirTarefa({ candidatas, onClose, onConfirmar }) {
  const [busca, setBusca] = React.useState('');
  const [selecionados, setSelecionados] = React.useState(() => new Set());

  const filtradas = React.useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return candidatas;
    return candidatas.filter(c => c.descricao.toLowerCase().includes(q) || c.wbs.includes(q));
  }, [candidatas, busca]);

  const alternar = (id) => {
    setSelecionados(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <Modal
      title="Incluir tarefa fora do mês"
      subtitle="Tarefas sem fatia programada no mês de referência"
      onClose={onClose}
      overlay={false}
      size="lg"
      footer={
        <>
          <div className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button
            className="btn btn-dark"
            disabled={selecionados.size === 0}
            onClick={() => onConfirmar([...selecionados])}
          >
            Adicionar{selecionados.size > 0 ? ` (${selecionados.size})` : ''}
          </button>
        </>
      }
    >
      <input
        className="input input-search"
        style={{ width: '100%', marginBottom: 10 }}
        placeholder="Buscar tarefa..."
        value={busca}
        onChange={e => setBusca(e.target.value)}
      />
      {filtradas.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>
          Nenhuma tarefa fora do mês para incluir.
        </p>
      ) : (
        <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
          {filtradas.map(c => (
            <label key={c.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
              borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', fontSize: 13,
            }}>
              <input type="checkbox" checked={selecionados.has(c.id)} onChange={() => alternar(c.id)} />
              <span className="num" style={{ color: 'var(--text-muted)', minWidth: 56 }}>{c.wbs}</span>
              <span style={{ flex: 1 }}>{c.descricao}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{c.disciplina}</span>
              <span className="num" style={{ minWidth: 90, textAlign: 'right' }}>{formatBRL(c.valor, 2)}</span>
            </label>
          ))}
        </div>
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
  const [mostrarConfirmReabrir, setMostrarConfirmReabrir] = React.useState(false);

  // Tarefas fora do mês escolhidas manualmente (ver ModalIncluirTarefa) — persistidas
  // no rascunho como `manual: true` e recarregadas com ele (ver gerarMedicao).
  const [idsManuais, setIdsManuais] = React.useState(() => new Set());
  const [modalIncluirAberto, setModalIncluirAberto] = React.useState(false);

  // Grupos recolhidos (ids). Local: recolher aqui não mexe no cronograma.
  const [collapsed, setCollapsed] = React.useState(() => new Set());

  const [mesesComMedicao, setMesesComMedicao] = React.useState([]);
  const [pdfFormat, setPdfFormat] = React.useState('a3');
  const [exportando, setExportando] = React.useState(false);
  const [exportOpen, setExportOpen] = React.useState(false);
  const exportRef = React.useRef(null);

  const wbsMap = React.useMemo(() => computeAllWBS(etapas), [etapas]);
  const disciplinaInfo = React.useMemo(() => computeDisciplinaInfo(etapas, wbsMap), [etapas, wbsMap]);

  // Monta as linhas do mês a partir do cronograma vivo. Usado enquanto a medição está
  // aberta (rascunho) — medição fechada NÃO passa por aqui, ver abaixo.
  const montarDoCronograma = React.useCallback((idsExtras) => buildItensMedicao(etapas, mesRefKey, {
    monthlyDist, wbsMap, disciplinaInfo, idsExtras, valorVinculadoMap: weightOverride,
  }), [etapas, mesRefKey, monthlyDist, wbsMap, disciplinaInfo, weightOverride]);

  const gerarMedicao = React.useCallback(async () => {
    if (!obraId || !mesRefKey) { setItensTrabalho([]); setRegistro(null); setIdsManuais(new Set()); return; }
    setCarregando(true);
    const reg = await medicaoMensalService.buscarPorMes(obraId, mesRefKey);
    // Aceita as duas chaves: o rascunho grava `manual`, o snapshot de fechamento grava
    // `foraDoMes`. Lendo só uma delas, uma medição fechada voltava sem os itens extras e
    // os totais da tela divergiam do valor congelado que o histórico mostra.
    const idsSalvos = new Set((reg?.itens || []).filter(i => i.manual || i.foraDoMes).map(i => i.id));
    setIdsManuais(idsSalvos);
    setRegistro(reg);
    // Medição FECHADA é documento: renderiza do snapshot congelado, não do cronograma.
    // Antes ela era recalculada a cada abertura, então mudar custo ou datas depois do
    // fechamento alterava os valores exibidos e eles divergiam do histórico.
    if (reg?.status === 'fechada') {
      setItensTrabalho(hidratarSnapshot(reg.itens, etapas, { wbsMap, disciplinaInfo }));
    } else if (reg) {
      setItensTrabalho(mergePercMedido(montarDoCronograma(idsSalvos), reg.itens));
    } else {
      // Sem registro: nada de itens. O mês só passa a existir depois de "Abrir medição".
      setItensTrabalho([]);
    }
    setCarregando(false);
  }, [obraId, mesRefKey, etapas, wbsMap, disciplinaInfo, montarDoCronograma]);

  // Carrega ao montar e sempre que trocar de mês/obra — edições em andamento do
  // usuário não são perdidas por mudanças não relacionadas.
  React.useEffect(() => { gerarMedicao(); }, [obraId, mesRefKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fecha o dropdown de exportação ao clicar fora.
  React.useEffect(() => {
    if (!exportOpen) return;
    const h = (e) => { if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [exportOpen]);

  React.useEffect(() => {
    let vivo = true;
    medicaoMensalService.listarMeses(obraId).then(r => { if (vivo) setMesesComMedicao(r); });
    return () => { vivo = false; };
  }, [obraId, registro]);

  // Estado por mês, para marcar o seletor: 'fechada' | 'rascunho' | undefined.
  const statusPorMes = React.useMemo(
    () => Object.fromEntries(mesesComMedicao.map(m => [m.mes_referencia, m.status])),
    [mesesComMedicao]
  );
  const fechadas = React.useMemo(() => mesesComMedicao.filter(m => m.status === 'fechada'), [mesesComMedicao]);

  const fechada = registro?.status === 'fechada';
  const aberta = !!registro && !fechada;
  // Sem registro no banco a medição não existe: nada editável até "Abrir medição".
  // Antes a ausência de registro deixava a tela livre, indistinguível de um rascunho.
  const bloqueado = readOnly || fechada || !registro;

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
  // Árvore sem colapso nenhum: base do seletor de níveis e do aplicarNivel. A `linhas`
  // não serve porque um grupo colapsado esconde os descendentes, e o nível mais fundo
  // sumiria da lista de opções conforme o usuário recolhe.
  const arvoreCompleta = React.useMemo(
    () => computeArvoreMedicao(filtradas, etapas, valorTotalBase, new Set()),
    [filtradas, etapas, valorTotalBase]
  );
  // gruposParaNivel recolhe grupos de nivel >= alvo-1, então o alvo útil vai até o
  // nível do grupo mais fundo + 1. Acima disso nada recolhe, e a opção seria inócua.
  const nivelMax = React.useMemo(
    () => arvoreCompleta.reduce((m, l) => (l.tipo === 'grupo' ? Math.max(m, l.nivel + 1) : m), 0),
    [arvoreCompleta]
  );
  const totais = React.useMemo(() => computeTotaisMedicao(filtradas, valorTotalBase), [filtradas, valorTotalBase]);
  const qtdForaDoMes = React.useMemo(() => filtradas.filter(i => i.foraDoMes).length, [filtradas]);

  // Candidatas da tela "Incluir tarefa fora do mês": tudo que ainda não foi trazido.
  const candidatasForaDoMes = React.useMemo(() => {
    const todas = listarTarefasForaDoMes(etapas, mesRefKey, { monthlyDist, wbsMap, disciplinaInfo, valorVinculadoMap: weightOverride });
    return todas.filter(c => !idsManuais.has(c.id));
  }, [etapas, mesRefKey, monthlyDist, wbsMap, disciplinaInfo, weightOverride, idsManuais]);

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
  const aplicarNivel = (nivel) => setCollapsed(gruposParaNivel(arvoreCompleta, nivel));

  // Grava a lista no rascunho. `itens` explícito porque a inclusão/remoção manual precisa
  // salvar a lista nova no mesmo tick, antes do state ter sido aplicado.
  const persistirRascunho = React.useCallback(async (itens, { silencioso = false } = {}) => {
    if (bloqueado) return;
    const { data, error } = await medicaoMensalService.salvarRascunho(obraId, mesRefKey, itens);
    if (error) {
      if (!silencioso) toast('Não foi possível salvar o rascunho (tabela de medição ainda não disponível).', { tone: 'danger' });
      return;
    }
    setRegistro(data);
    if (!silencioso) toast('Rascunho salvo', { tone: 'success', icon: 'check' });
  }, [obraId, mesRefKey, bloqueado, toast]);

  // Abre a medição do mês: cria o registro no banco com os itens do cronograma. É o
  // "eu abro a medição para ela ser criada" — antes a linha nascia por efeito colateral
  // do primeiro salvamento, e um mês sem registro já vinha editável.
  const abrirMedicao = async () => {
    if (readOnly || registro) return;
    setSalvando(true);
    const itens = montarDoCronograma(new Set());
    const { data, error } = await medicaoMensalService.salvarRascunho(obraId, mesRefKey, itens);
    setSalvando(false);
    if (error) { toast('Não foi possível abrir a medição (tabela de medição ainda não disponível).', { tone: 'danger' }); return; }
    setRegistro(data);
    setItensTrabalho(itens);
    setIdsManuais(new Set());
    toast(`Medição de ${mesLabel(mesRefKey)} aberta`, { tone: 'success', icon: 'check' });
  };

  // Traz as tarefas escolhidas no ModalIncluirTarefa para a lista de trabalho, sem
  // perder o %medido já editado nas linhas que já estavam na tela. Salva na hora: a
  // seleção é a única coisa da tela que não pode ser reconstruída do cronograma, e sem
  // isso um F5 (ou trocar de aba, que desmonta o componente) perdia tudo.
  const adicionarTarefasManuais = (ids) => {
    if (bloqueado) return;
    const nextIds = new Set(idsManuais);
    ids.forEach(id => nextIds.add(id));
    const base = buildItensMedicao(etapas, mesRefKey, {
      monthlyDist, wbsMap, disciplinaInfo, idsExtras: nextIds, valorVinculadoMap: weightOverride,
    });
    const percById = new Map(itensTrabalho.map(i => [i.id, i.percMedido]));
    const proximos = base.map(i => (percById.has(i.id) ? { ...i, percMedido: percById.get(i.id) } : i));
    setIdsManuais(nextIds);
    setItensTrabalho(proximos);
    setModalIncluirAberto(false);
    persistirRascunho(proximos, { silencioso: true });
  };

  // Desfaz a inclusão manual de uma tarefa fora do mês.
  const removerTarefaManual = (id) => {
    if (bloqueado) return;
    const nextIds = new Set(idsManuais);
    nextIds.delete(id);
    const proximos = itensTrabalho.filter(i => i.id !== id);
    setIdsManuais(nextIds);
    setItensTrabalho(proximos);
    persistirRascunho(proximos, { silencioso: true });
  };

  const salvarRascunho = async () => {
    setSalvando(true);
    await persistirRascunho(itensTrabalho);
    setSalvando(false);
  };

  const confirmarFechamento = async () => {
    setSalvando(true);
    const snapshot = buildSnapshotFechamento(itensTrabalho, totais);
    const { data, error } = await medicaoMensalService.fechar(obraId, mesRefKey, snapshot, currentUser?.nome || currentUser?.email);
    setSalvando(false);
    // !data sem error acontece se o RLS filtrar a linha silenciosamente (0 linhas
    // afetadas) — sem essa checagem o toast de sucesso dispara mesmo sem ter fechado nada.
    if (error || !data) { toast('Não foi possível fechar a medição (tabela de medição ainda não disponível).', { tone: 'danger' }); return; }
    setRegistro(data);
    setMostrarConfirmFechar(false);
    toast('Medição fechada', { tone: 'success', icon: 'check' });
  };

  const reabrirMedicao = async () => {
    setSalvando(true);
    const { data, error } = await medicaoMensalService.reabrir(obraId, mesRefKey);
    setSalvando(false);
    // !data sem error: a função reabrir_medicao_mensal não existe ainda (migration não
    // aplicada) ou não achou uma linha 'fechada' pra reabrir — nos dois casos não houve
    // mudança nenhuma, então não pode virar toast de sucesso.
    if (error || !data) { toast('Não foi possível reabrir a medição.', { tone: 'danger' }); return; }
    setRegistro(data);
    setMostrarConfirmReabrir(false);
    toast('Medição reaberta', { tone: 'success', icon: 'check' });
  };

  // ── Exportação ────────────────────────────────────────────────────────────
  // Linhas da árvore no formato de planilha/PDF: mesma ordem e hierarquia da tela,
  // com a indentação por nível que o projeto já usa nos outros exports.
  const linhasExport = () => linhas.map(l => {
    const grupo = l.tipo === 'grupo';
    return {
      grupo,
      cells: [
        l.wbs || '',
        '  '.repeat(l.nivel || 0) + l.descricao + (l.foraDoMes ? ' (fora do mês)' : ''),
        grupo ? '' : l.pavimento,
        grupo ? null : offsetToDate(l.inicioOff),
        grupo ? null : offsetToDate(l.terminoOff),
        grupo ? '' : l.duracaoDias,
        (l.peso ?? ((l.foraDoMes || !valorTotalBase) ? 0 : (l.valor / valorTotalBase) * 100)) / 100,
        grupo ? null : l.percExecutado / 100,
        (grupo ? l.med : l.percMedido) / 100,
        l.valor,
        grupo ? (l.valor * l.med) / 100 : (l.valor * l.percMedido) / 100,
      ],
    };
  });

  const CABECALHOS = ['SERVIÇO', 'DESCRIÇÃO', 'PAVIMENTO', 'INÍCIO', 'TÉRMINO', 'DUR.', 'PESO %', '% EXECUTADO', '% MEDIDO', 'VALOR A MEDIR', 'VALOR MEDIDO'];

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
          totais.peso / 100, totais.exec / 100, totais.med / 100, totais.valor, totais.valorAMedir],
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows, { dateNF: 'DD/MM/YYYY' });
      const rng = XLSX.utils.decode_range(ws['!ref']);
      // Números crus na célula + formato via .z (nunca string de moeda), padrão do projeto.
      for (let R = 1; R <= rng.e.r; R++) {
        [[3, 'DD/MM/YYYY'], [4, 'DD/MM/YYYY'], [6, '0.00%'], [7, '0.00%'], [8, '0.00%'], [9, '#,##0.00'], [10, '#,##0.00']].forEach(([C, z]) => {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          if (ws[addr]) ws[addr].z = z;
        });
      }
      ws['!cols'] = [{ wch: 12 }, { wch: 46 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 7 }, { wch: 10 }, { wch: 13 }, { wch: 11 }, { wch: 16 }, { wch: 16 }];
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
      doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, 14, 20);
      doc.setTextColor(0);

      const dados = linhasExport();
      const fmtD = (d) => (d ? d.toLocaleDateString('pt-BR') : '');
      const fmtP = (v) => (v == null ? '' : `${formatNum(v * 100, 2)}%`);
      autoTable(doc, {
        startY: 25,
        head: [CABECALHOS],
        body: dados.map(l => [
          l.cells[0], l.cells[1], l.cells[2], fmtD(l.cells[3]), fmtD(l.cells[4]), l.cells[5],
          fmtP(l.cells[6]), fmtP(l.cells[7]), fmtP(l.cells[8]), formatBRL(l.cells[9]), formatBRL(l.cells[10]),
        ]),
        foot: [[
          { content: `TOTAL GERAL · ${totais.qtd} atividades`, colSpan: 6, styles: { halign: 'left' } },
          fmtPct100(totais.peso), fmtPct100(totais.exec), fmtPct100(totais.med), formatBRL(totais.valor), formatBRL(totais.valorAMedir),
        ]],
        theme: 'grid',
        headStyles: { fillColor: BRAND, textColor: 255, fontSize: 7, fontStyle: 'bold', halign: 'center' },
        bodyStyles: { fontSize: 7, textColor: 40 },
        footStyles: { fillColor: [225, 232, 242], textColor: 20, fontStyle: 'bold', fontSize: 7, halign: 'right' },
        alternateRowStyles: { fillColor: [248, 249, 250] },
        columnStyles: {
          5: { halign: 'center' }, 6: { halign: 'center' }, 7: { halign: 'center' },
          8: { halign: 'center' }, 9: { halign: 'right' }, 10: { halign: 'right' },
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

  // ── Card congelado sob a topbar, com rolagem interna ──────────────────────
  // Mesmo padrão da Lista (ListaInterativa.jsx): `sticky` não serve porque o card é o
  // último elemento e preenche a viewport, então usa sentinela + position:fixed via JS.
  // Altura real da topbar, para congelar exatamente abaixo dela sem corte.
  const [topbarH, setTopbarH] = React.useState(60);
  React.useEffect(() => {
    const measure = () => { const tb = document.querySelector('.topbar'); if (tb) setTopbarH(tb.offsetHeight); };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const sentinelRef = React.useRef(null);
  const [pinned, setPinned] = React.useState(null); // null = fluxo normal; { left, width } = fixado
  React.useEffect(() => {
    let raf = 0;
    const check = () => {
      raf = 0;
      const s = sentinelRef.current;
      if (!s) return;
      const r = s.getBoundingClientRect();
      // Gatilho na mesma altura em que o card prende (topbarH + 10), senão ele salta
      // 10px para baixo no instante do congelamento.
      if (r.top <= topbarH + 10) {
        // Tolerância de 0.5px evita re-render em loop por variação fracionária.
        setPinned(prev => (prev && Math.abs(prev.left - r.left) < 0.5 && Math.abs(prev.width - r.width) < 0.5) ? prev : { left: r.left, width: r.width });
      } else {
        setPinned(prev => (prev ? null : prev));
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(check); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    // Reajusta left/width quando a largura muda sem scroll (ex.: fixar/soltar a sidebar).
    let ro = null;
    if (typeof ResizeObserver !== 'undefined' && sentinelRef.current) {
      ro = new ResizeObserver(onScroll);
      ro.observe(sentinelRef.current);
    }
    const id = setTimeout(check, 0);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      clearTimeout(id);
      if (raf) cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
    };
  }, [topbarH]);
  // Altura fixa nos dois estados: sem ela o documento não tem rolagem suficiente para
  // levar o topo do card até o gatilho de congelamento.
  const cardH = `calc(100vh - ${topbarH + 10}px)`;

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
  // boxShadow veda a fresta sub-pixel por onde o corpo aparecia ao rolar (truque da Lista).
  const thSticky = { position: 'sticky', top: bandTop, zIndex: 3, boxShadow: '0 1px 0 0 var(--brand)' };
  const footCell = { padding: '0 10px', height: 30 };
  const filtroLabelSt = { fontSize: 10.5, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.04em' };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Medição Mensal</h1>
          <div className="page-subtitle">Medição física da obra · itens do cronograma agendados para o mês</div>
        </div>
        <div className="page-actions">
          {/* O estado de cada mês no próprio seletor: antes ele listava os meses do
              cronograma sem nenhuma relação com as medições, então não havia como saber
              quais meses já tinham sido abertos ou fechados. */}
          <select className="input" value={mesRefKey} onChange={e => setMesRefKey(e.target.value)} style={{ minWidth: 190 }}>
            {months.map(m => {
              const st = statusPorMes[m.key];
              const sufixo = st === 'fechada' ? ' · fechada' : st === 'rascunho' ? ' · aberta' : '';
              return <option key={m.key} value={m.key}>{mesLabel(m.key)}{sufixo}</option>;
            })}
          </select>
          <button type="button" className="btn btn-ghost" onClick={onAtualizarDados} disabled={carregando}>
            <Icon name="refresh-cw" size={15} />Atualizar dados
          </button>
          <div ref={exportRef} style={{ position: 'relative' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setExportOpen(o => !o)} disabled={exportando}>
              <Icon name="download" size={15} />{exportando ? 'Exportando…' : 'Exportar'}<Icon name="chevron-down" size={13} />
            </button>
            {exportOpen && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 60,
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
                boxShadow: '0 10px 30px rgba(0,0,0,0.18)', padding: 10, minWidth: 190,
              }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>
                  Tamanho do papel (PDF)
                  <select className="input" value={pdfFormat} onChange={e => setPdfFormat(e.target.value)} style={{ width: '100%', marginTop: 4 }}>
                    {PDF_FORMATOS.map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}
                  </select>
                </label>
                <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', marginTop: 4 }}
                  onClick={() => { setExportOpen(false); exportarExcel(); }}>
                  <Icon name="download" size={14} />Excel
                </button>
                <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', marginTop: 2 }}
                  onClick={() => { setExportOpen(false); exportarPDF(); }}>
                  <Icon name="download" size={14} />PDF
                </button>
              </div>
            )}
          </div>
          {/* Este botão nunca criou nada: é o mesmo carregamento, relendo o cronograma.
              O nome agora diz isso, e ele só aparece com a medição aberta. */}
          {aberta && !readOnly && (
            <button type="button" className="btn btn-ghost" onClick={gerarMedicao} disabled={carregando}
              title="Relê o cronograma e recalcula as linhas, mantendo os % já medidos">
              <Icon name="refresh-cw" size={15} />{carregando ? 'Recalculando…' : 'Recalcular do cronograma'}
            </button>
          )}
          {!registro && !readOnly && (
            <button type="button" className="btn btn-dark" onClick={abrirMedicao} disabled={carregando || salvando}>
              <Icon name="plus" size={15} />{salvando ? 'Abrindo…' : 'Abrir medição'}
            </button>
          )}
        </div>
      </div>

      <div className="kpi-grid">
        <KpiCard label="Previsto do mês" value={PREVISTO_MES_PCT} barColor="var(--brand)" foot="meta física do mês" />
        <KpiCard
          label="Executado do mês" value={totais.exec} barColor="var(--warning)"
          foot={`${gapExecutado >= 0 ? '▼' : '▲'} ${formatNum(Math.abs(gapExecutado), 2)} pp vs previsto`}
          footColor={gapExecutado >= 0 ? 'var(--danger)' : 'var(--success)'}
        />
        <KpiCard label="Previsto acumulado" value={resumo.previstoAcumulado} barColor="var(--brand)" foot="linha de base" />
        <KpiCard label="Executado acumulado" value={resumo.executadoAcumulado} barColor="var(--success)" foot="real + reprogramado" />
      </div>

      {/* Sentinela: marca onde o card começa, para detectar quando prender */}
      <div ref={sentinelRef} aria-hidden="true" style={{ height: 0 }} />
      {/* Espaçador: preserva a altura do fluxo quando o card sai dele (position:fixed) */}
      {pinned && <div aria-hidden="true" style={{ marginTop: 8, height: cardH }} />}

      <div className="card"
        style={pinned
          ? { position: 'fixed', top: topbarH + 10, left: pinned.left, width: pinned.width, height: cardH, zIndex: 5, margin: 0, display: 'flex', flexDirection: 'column' }
          : { marginTop: 8, height: cardH, display: 'flex', flexDirection: 'column' }
        }>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 200 }}>
            <span style={filtroLabelSt}>Busca</span>
            <input
              className="input input-search"
              placeholder="Buscar atividade..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={filtroLabelSt}>Disciplina</span>
            <select className="input" value={disciplina} onChange={e => setDisciplina(e.target.value)} style={{ minWidth: 150 }}>
              {disciplinas.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={filtroLabelSt}>Pavimento</span>
            <select className="input" value={pavimento} onChange={e => setPavimento(e.target.value)} style={{ minWidth: 150 }}>
              {pavimentos.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          {/* Estrutura de tópicos por nível — mesmo menu da Lista e do Gantt. Volta ao
              placeholder depois de escolher: o colapso também muda pelos chevrons de cada
              linha, então o select não teria como refletir um "nível atual" confiável. */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={filtroLabelSt}>Estrutura</span>
            <select className="input" defaultValue="" style={{ minWidth: 150 }}
              title="Expandir ou recolher a estrutura por nível"
              onChange={e => { const v = e.target.value; e.target.value = ''; if (v !== '') aplicarNivel(Number(v)); }}>
              <option value="" disabled>Escolher…</option>
              <option value="0">Expandir tudo</option>
              <option value="1">Recolher tudo</option>
              {Array.from({ length: nivelMax }, (_, i) => i + 1).map(n => (
                <option key={n} value={n}>Nível {n}</option>
              ))}
            </select>
          </label>
          {!bloqueado && (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setModalIncluirAberto(true)}>
                <Icon name="plus" size={15} />Incluir tarefa fora do mês
              </button>
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
          {qtdForaDoMes > 0 && (
            <span className="badge warning" style={{ marginLeft: 'auto' }}>
              {qtdForaDoMes} {qtdForaDoMes === 1 ? 'item fora do mês' : 'itens fora do mês'} · somam ao realizado, não ao previsto
            </span>
          )}
          {fechada && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: qtdForaDoMes > 0 ? 0 : 'auto' }}>
              <span className="badge success"><span className="dot" />Medição fechada</span>
              {!readOnly && (
                <button type="button" className="btn btn-ghost" onClick={() => setMostrarConfirmReabrir(true)}>
                  <Icon name="refresh-cw" size={15} />Reabrir medição
                </button>
              )}
            </span>
          )}
        </div>

        {/* flex:1 + minHeight:0 dá a rolagem por dentro do card; sem o minHeight o
            flex item não encolhe e o scroll vaza para a página. */}
        <div style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
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
                <th className="right" style={thSticky}>VALOR MEDIDO</th>
              </tr>
            </thead>
            <tbody>
              {linhas.length === 0 && (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-muted)' }}>
                    {!registro ? (
                      // Mês sem medição: o ciclo começa aqui. Nada de itens e nada editável
                      // até abrir — antes a tela já vinha preenchida e livre, sem registro.
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                        <div style={{ fontSize: 13.5 }}>
                          Nenhuma medição aberta para <strong>{mesLabel(mesRefKey)}</strong>.
                        </div>
                        {readOnly ? (
                          <div style={{ fontSize: 12.5 }}>Você não tem permissão para abrir medições.</div>
                        ) : (
                          <button type="button" className="btn btn-dark" onClick={abrirMedicao} disabled={salvando}>
                            <Icon name="plus" size={15} />{salvando ? 'Abrindo…' : 'Abrir medição'}
                          </button>
                        )}
                      </div>
                    ) : (
                      'Nenhum item do cronograma agendado para o período com os filtros aplicados.'
                    )}
                  </td>
                </tr>
              )}
              {linhas.map(l => {
                const indent = (l.nivel || 0) * 20;
                if (l.tipo === 'grupo') {
                  // Tarefa-pai dentro de outra tarefa-pai: tom mais forte pro nível mais alto (raiz
                  // da EAP), enfraquecendo a cada nível mais fundo — mesma escala usada no Gantt, no
                  // Cronograma e na Curva Física (classes .lista-row-group-l0/l1/l2, globals.css).
                  const groupLvl = l.nivel || 0;
                  const groupLevelClass = groupLvl <= 0 ? 'lista-row-group-l0' : groupLvl === 1 ? 'lista-row-group-l1' : 'lista-row-group-l2';
                  return (
                    <tr key={'g' + l.id} className={`lista-row-group ${groupLevelClass}`} style={{ fontWeight: 600 }}>
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
                      <td />
                      <td className="center num">{fmtPct100(l.med)}</td>
                      <td className="right num">{formatBRL(l.valor, 2)}</td>
                      <td className="right num">{formatBRL((l.valor * l.med) / 100, 2)}</td>
                    </tr>
                  );
                }
                const status = derivarStatus(l);
                // Fora do mês não faz parte do previsto: peso zero (soma só ao realizado).
                const peso = (l.foraDoMes || !valorTotalBase) ? 0 : (l.valor / valorTotalBase) * 100;
                return (
                  <tr key={l.id} style={l.foraDoMes ? { background: 'var(--warning-bg)' } : undefined}>
                    <td className="num">{l.wbs}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: indent }}>
                        {/* Espaçador da largura da seta: alinha a folha com o nome do grupo do mesmo nível. */}
                        <span style={{ width: 20, flexShrink: 0, display: 'inline-block' }} />
                        <span>{l.descricao}</span>
                        {l.foraDoMes && (
                          <>
                            <span className="badge warning" style={{ fontSize: 9.5, padding: '0 5px' }}>fora do mês</span>
                            <button type="button" className="icon-btn" title="Remover tarefa"
                              style={{ width: 18, height: 18 }}
                              onClick={() => removerTarefaManual(l.id)} disabled={bloqueado}>
                              <Icon name="x" size={11} />
                            </button>
                          </>
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
                          className="input medicao-input-medido"
                          style={{ width: 56, height: 24, padding: '0 6px', textAlign: 'right' }}
                          inputMode="decimal"
                          value={l.percMedido}
                          disabled={bloqueado}
                          aria-label={`Percentual medido de ${l.descricao}`}
                          onChange={e => alterarMedido(l.id, e.target.value)}
                          onKeyDown={e => {
                            if (e.key !== 'Enter') return;
                            e.preventDefault();
                            const inputs = Array.from(document.querySelectorAll('.medicao-input-medido'));
                            const proximo = inputs[inputs.indexOf(e.currentTarget) + 1];
                            if (proximo) { proximo.focus(); proximo.select(); }
                          }}
                        />
                        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>%</span>
                      </span>
                    </td>
                    <td className="right num">{formatBRL(l.valor, 2)}</td>
                    <td className="right num" style={{ fontWeight: 600 }}>{formatBRL((l.valor * l.percMedido) / 100, 2)}</td>
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
                <td className="right num" style={footCell}>{formatBRL(totais.valor, 2)}</td>
                <td className="right num" style={footCell}>{formatBRL(totais.valorAMedir, 2)}</td>
              </tr>
            </tfoot>
          </table>

          {/* Rodapé e histórico ficam DENTRO do container que rola. Fora dele, com o card
              em position:fixed ocupando a viewport, os dois ficavam atrás do card e o
              histórico virava inalcançável. Na Lista isso não acontece porque lá o card é
              o último elemento da página. */}
          <div style={{ padding: '10px 16px', fontSize: 12.5, color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
            Itens do cronograma agendados para {mesLabel(mesRefKey)}{registro?.updated_at ? ` · atualizado em ${new Date(registro.updated_at).toLocaleString('pt-BR')}` : ''}
          </div>

          {/* Histórico: medições já fechadas, com os valores congelados no fechamento. */}
          {fechadas.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border)' }}>
              <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
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
                      <th className="center">% MEDIDO</th>
                      <th className="right">VALOR MEDIDO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fechadas.map(f => (
                      <tr key={f.mes_referencia}>
                        <td style={{ fontWeight: 600 }}>{mesLabel(f.mes_referencia)}</td>
                        <td className="center num">{f.fechada_em ? new Date(f.fechada_em).toLocaleDateString('pt-BR') : '—'}</td>
                        <td>{f.fechada_por || '—'}</td>
                        <td className="center num">{f.perc_medido == null ? '—' : fmtPct100(f.perc_medido)}</td>
                        <td className="right num">{f.valor_total_medido == null ? '—' : formatBRL(f.valor_total_medido, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {mostrarConfirmFechar && (
        <ModalFecharMedicao
          mesRefKey={mesRefKey}
          violacoes={validacao.violacoes}
          salvando={salvando}
          onClose={() => setMostrarConfirmFechar(false)}
          onConfirmar={confirmarFechamento}
        />
      )}

      {mostrarConfirmReabrir && (
        <ModalReabrirMedicao
          mesRefKey={mesRefKey}
          salvando={salvando}
          onClose={() => setMostrarConfirmReabrir(false)}
          onConfirmar={reabrirMedicao}
        />
      )}

      {modalIncluirAberto && (
        <ModalIncluirTarefa
          candidatas={candidatasForaDoMes}
          onClose={() => setModalIncluirAberto(false)}
          onConfirmar={adicionarTarefasManuais}
        />
      )}
    </>
  );
}
