import React from 'react';
import { Icon } from '../../components/Icons';
import { Modal, useToast } from '../../components/Modals';
import { formatBRL, formatNum } from '../../utils/formatters';
import { computeAllWBS, computeRealizedDistAte } from './scheduleEngine';
import { medicaoMensalService } from './medicaoMensal.service';
import {
  fmtPct100, PREVISTO_MES_PCT, computeDisciplinaInfo, buildItensMedicao,
  parsePercInput, derivarStatus, computeGruposMedicao, computeTotaisMedicao,
  computeResumo, validarFechamento, mergePercMedido,
} from './medicaoMensalPure';

// Medição Mensal — aba do módulo Cronograma. Gera a medição físico-financeira do
// mês a partir dos itens do cronograma agendados no mês de referência (mesma
// distribuição mensal usada em Uso da Tarefa/Curva Física), permite ajustar o
// % medido de cada item e consolidar (fechar) a medição do mês.

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

  const wbsMap = React.useMemo(() => computeAllWBS(etapas), [etapas]);
  const disciplinaInfo = React.useMemo(() => computeDisciplinaInfo(etapas, wbsMap), [etapas, wbsMap]);

  const gerarMedicao = React.useCallback(async () => {
    if (!obraId || !mesRefKey) { setItensTrabalho([]); setRegistro(null); return; }
    setCarregando(true);
    const base = buildItensMedicao(etapas, mesRefKey, { monthlyDist, wbsMap, disciplinaInfo });
    const reg = await medicaoMensalService.buscarPorMes(obraId, mesRefKey);
    setRegistro(reg);
    setItensTrabalho(mergePercMedido(base, reg?.itens));
    setCarregando(false);
  }, [etapas, mesRefKey, monthlyDist, wbsMap, disciplinaInfo, obraId]);

  // Carrega ao montar e sempre que trocar de mês/obra — edições em andamento do
  // usuário não são perdidas por mudanças não relacionadas (ex.: outra aba salvando).
  React.useEffect(() => { gerarMedicao(); }, [obraId, mesRefKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const fechada = registro?.status === 'fechada';
  const bloqueado = readOnly || fechada;

  const disciplinas = React.useMemo(
    () => ['Todas', ...Array.from(new Set(itensTrabalho.map(i => i.disciplina))).sort((a, b) => a.localeCompare(b, 'pt-BR'))],
    [itensTrabalho]
  );
  const pavimentos = React.useMemo(
    () => ['Todos', ...Array.from(new Set(itensTrabalho.map(i => i.pavimento)))],
    [itensTrabalho]
  );

  const filtradas = React.useMemo(() => itensTrabalho.filter(i => (
    (disciplina === 'Todas' || i.disciplina === disciplina) &&
    (pavimento === 'Todos' || i.pavimento === pavimento) &&
    (busca.trim() === '' ||
      i.descricao.toLowerCase().includes(busca.trim().toLowerCase()) ||
      i.wbs.includes(busca.trim()))
  )), [itensTrabalho, disciplina, pavimento, busca]);

  const valorTotalBase = React.useMemo(() => itensTrabalho.reduce((s, i) => s + i.valor, 0), [itensTrabalho]);
  const grupos = React.useMemo(() => computeGruposMedicao(filtradas, valorTotalBase), [filtradas, valorTotalBase]);
  const totais = React.useMemo(() => computeTotaisMedicao(filtradas, valorTotalBase), [filtradas, valorTotalBase]);

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
    const { data, error } = await medicaoMensalService.fechar(obraId, mesRefKey, itensTrabalho, currentUser?.nome || currentUser?.email);
    setSalvando(false);
    if (error) { toast('Não foi possível fechar a medição (tabela de medição ainda não disponível).', { tone: 'danger' }); return; }
    setRegistro(data);
    setMostrarConfirmFechar(false);
    toast('Medição fechada', { tone: 'success', icon: 'check' });
  };

  const exportar = async () => {
    const XLSX = await import('xlsx');
    const linhas = [
      ['SERVIÇO', 'DESCRIÇÃO', 'DISCIPLINA', 'PAVIMENTO', 'INÍCIO', 'TÉRMINO', 'DUR.', 'PESO %', '% EXECUTADO', '% MEDIDO', 'VALOR A MEDIR'],
      ...filtradas.map(i => [
        i.wbs, i.descricao, i.disciplina, i.pavimento, i.dataInicio, i.dataTermino, i.duracaoDias,
        valorTotalBase ? (i.valor / valorTotalBase) * 100 : 0, i.percExecutado, i.percMedido, (i.valor * i.percMedido) / 100,
      ]),
      [],
      ['TOTAL GERAL', '', '', '', '', '', '', totais.peso, totais.exec, totais.med, totais.valorAMedir],
    ];
    const ws = XLSX.utils.aoa_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Medição');
    XLSX.writeFile(wb, `medicao-mensal-${mesRefKey || 'mes'}.xlsx`);
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Medição Mensal</h1>
          <div className="page-subtitle">Medição física-financeira da obra · itens do cronograma agendados para o mês</div>
        </div>
        <div className="page-actions">
          <select className="input" value={mesRefKey} onChange={e => setMesRefKey(e.target.value)} style={{ minWidth: 150 }}>
            {months.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <button type="button" className="btn btn-ghost" onClick={onAtualizarDados} disabled={carregando}>
            <Icon name="refresh-cw" size={15} />Atualizar dados
          </button>
          <button type="button" className="btn btn-ghost" onClick={exportar}>
            <Icon name="download" size={15} />Exportar
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
            style={{ flex: 1, minWidth: 220 }}
            placeholder="Buscar atividade..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
          <select className="input" value={disciplina} onChange={e => setDisciplina(e.target.value)} style={{ minWidth: 170 }}>
            {disciplinas.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select className="input" value={pavimento} onChange={e => setPavimento(e.target.value)} style={{ minWidth: 170 }}>
            {pavimentos.map(p => <option key={p} value={p}>{p}</option>)}
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

        <div style={{ overflowX: 'auto' }}>
          <table className="tbl" style={{ minWidth: 1240 }}>
            <thead>
              <tr className="band-row">
                <th />
                <th colSpan={3}>ETAPA / TAREFA</th>
                <th colSpan={3}>PRAZO</th>
                <th colSpan={3}>AVANÇO</th>
                <th colSpan={2}>FINANCEIRO</th>
              </tr>
              <tr>
                <th style={{ width: 36 }} />
                <th>SERVIÇO</th>
                <th>DESCRIÇÃO</th>
                <th>PAVIMENTO</th>
                <th className="center">INÍCIO</th>
                <th className="center">TÉRMINO</th>
                <th className="center">DUR.</th>
                <th className="center">PESO %</th>
                <th style={{ minWidth: 160 }}>% EXECUTADO</th>
                <th className="center">% MEDIDO</th>
                <th className="right">VALOR A MEDIR</th>
                <th className="center">STATUS</th>
              </tr>
            </thead>
            <tbody>
              {grupos.length === 0 && (
                <tr>
                  <td colSpan={12} style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-muted)' }}>
                    Nenhum item do cronograma agendado para o período com os filtros aplicados.
                  </td>
                </tr>
              )}
              {grupos.map(g => (
                <React.Fragment key={g.codigo + '|' + g.nome}>
                  <tr style={{ background: 'var(--brand-50)' }}>
                    <td />
                    <td className="strong num">{g.codigo}</td>
                    <td colSpan={5} className="strong">{g.nome}</td>
                    <td className="center strong num">{fmtPct100(g.peso)}</td>
                    <td className="strong num">{fmtPct100(g.exec)}</td>
                    <td className="center strong num">{fmtPct100(g.med)}</td>
                    <td className="right strong num">{formatBRL(g.valor, 2)}</td>
                    <td />
                  </tr>
                  {g.rows.map(item => {
                    const status = derivarStatus(item);
                    const peso = valorTotalBase ? (item.valor / valorTotalBase) * 100 : 0;
                    return (
                      <tr key={item.id}>
                        <td />
                        <td className="num">{item.wbs}</td>
                        <td className="strong">{item.descricao}</td>
                        <td>{item.pavimento}</td>
                        <td className="center num">{item.dataInicio}</td>
                        <td className="center num">{item.dataTermino}</td>
                        <td className="center num">{item.duracaoDias}</td>
                        <td className="center num">{fmtPct100(peso)}</td>
                        <td>
                          <div className="progress-row">
                            <div className={'progress' + (status === 'concluida' ? ' success' : status === 'pendente' ? ' danger' : '')}>
                              <span style={{ width: `${item.percExecutado}%` }} />
                            </div>
                            <span className="pct">{fmtPct100(item.percExecutado)}</span>
                          </div>
                        </td>
                        <td className="center">
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                            <input
                              className="input"
                              style={{ width: 56, height: 28, padding: '0 6px', textAlign: 'right' }}
                              inputMode="decimal"
                              value={item.percMedido}
                              disabled={bloqueado}
                              aria-label={`Percentual medido de ${item.descricao}`}
                              onChange={e => alterarMedido(item.id, e.target.value)}
                            />
                            <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>%</span>
                          </span>
                        </td>
                        <td className="right strong num">{formatBRL((item.valor * item.percMedido) / 100, 2)}</td>
                        <td className="center"><StatusPill status={status} /></td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--brand-700)', color: '#fff' }}>
                <td />
                <td colSpan={6}>TOTAL GERAL · {totais.qtd} atividades</td>
                <td className="center num">{fmtPct100(totais.peso)}</td>
                <td className="num">{fmtPct100(totais.exec)}</td>
                <td className="center num">{fmtPct100(totais.med)}</td>
                <td className="right num">{formatBRL(totais.valorAMedir, 2)}</td>
                <td />
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
