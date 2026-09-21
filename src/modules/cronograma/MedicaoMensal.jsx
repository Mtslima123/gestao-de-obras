import React from 'react';
import { Icon } from '../../components/Icons';
import { Modal, useToast } from '../../components/Modals';
import { formatBRL, formatNum } from '../../utils/formatters';
import { offsetToDate, dateToExcelSerial } from './cronogramaDateUtils';
import { mesAtualOuUltimo, mesesComReprogramacao } from './scheduleEngine';
import { medicaoMensalService } from './medicaoMensal.service';
import { useIsMobile } from '../../utils/useIsMobile';
import {
  XLSX_HEADER_STYLE, XLSX_GROUP_ROW_STYLE, XLSX_TOTAL_ROW_STYLE, XLSX_TITLE_STYLE,
  XLSX_SUBTITLE_STYLE, aplicarEstiloLinha,
} from './cronogramaShared';
import {
  fmtPct100, computeDisciplinaInfo, buildItensMedicao, listarTarefasForaDoMes,
  parsePercInput, derivarStatus, computeArvoreMedicao, gruposParaNivel, computeTotaisMedicao,
  computeResumo, validarFechamento, validarAbertura, mergePercMedido, buildSnapshotFechamento,
  hidratarSnapshot, computeArvoreForaDoMes,
} from './medicaoMensalPure';

// Medição Mensal — aba do módulo Cronograma. Gera a medição físico-financeira do
// mês a partir dos itens do cronograma agendados no mês de referência (mesma
// distribuição mensal usada em Uso da Tarefa/Curva Física), permite ajustar o
// % medido de cada item e consolidar (fechar) a medição do mês.
//
// A tabela renderiza a hierarquia REAL do cronograma (N1/N2/N3): grupos indentados e
// recolhíveis, folhas medíveis. O colapso é estado LOCAL desta tela — diferente da
// Lista, que grava `e.collapsed` no cronograma; aqui a Medição só lê o cronograma.

// Colunas da tabela principal, na ordem em que aparecem — larguras ajustáveis (arrastar a
// borda direita do cabeçalho), mesmo padrão de ListaInterativa.jsx (colWidths/getColW/
// startColResize), persistidas por obra.
const MEDICAO_COL_IDS = ['servico', 'descricao', 'pavimento', 'inicio', 'termino', 'dur', 'peso', 'executado', 'medido', 'valorAMedir', 'valorMedido'];
const MEDICAO_COL_DEFWIDTH = {
  servico: 110, descricao: 220, pavimento: 100, inicio: 100, termino: 100, dur: 70,
  peso: 90, executado: 160, medido: 110, valorAMedir: 130, valorMedido: 130,
};

const MES_NOMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Uma cor por etapa de topo no accordion mobile — só pra diferenciar visualmente uma
// etapa da outra (borda esquerda do cabeçalho e dos cards das tarefas dela). Cicla pelo
// índice da etapa no mês (não é ligado a nenhuma configuração salva no cronograma).
const ETAPA_CORES_MOBILE = ['#1C4584', '#B45309', '#166437', '#7C2D92', '#0F766E', '#B91C1C'];
const mesLabel = (key) => {
  const [y, m] = (key || '').split('-');
  return m ? `${MES_NOMES[Number(m) - 1]} / ${y}` : '—';
};
function carregarMesRefMedicao(obraId) {
  try { return localStorage.getItem('crono_medicao_mesref_' + obraId) || null; } catch { return null; }
}
function salvarMesRefMedicao(obraId, key) {
  try { localStorage.setItem('crono_medicao_mesref_' + obraId, key); } catch { /* ignore */ }
}

const PDF_FORMATOS = ['a4', 'a3', 'a2', 'a1', 'a0'];

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

function ModalLimparMedicao({ mesRefKey, qtd, salvando, onClose, onConfirmar }) {
  return (
    <Modal
      title="Limpar medição"
      subtitle={mesLabel(mesRefKey)}
      onClose={onClose}
      overlay={false}
      footer={
        <>
          <div className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button
            className="btn"
            style={{ background: 'var(--danger)', color: '#fff' }}
            disabled={salvando}
            onClick={onConfirmar}
          >
            <Icon name="trash" size={14} />{salvando ? 'Limpando…' : 'Confirmar limpeza'}
          </button>
        </>
      }
    >
      <p style={{ fontSize: 13.5, color: 'var(--text-soft)' }}>
        Isso zera o % medido de {qtd} {qtd === 1 ? 'tarefa' : 'tarefas'} desta medição, pra
        recomeçar o preenchimento do zero. Não mexe no avanço da Lista nem em meses já
        fechados. Deseja continuar?
      </p>
    </Modal>
  );
}

function ModalExcluirMedicao({ mesRefKey, salvando, onClose, onConfirmar }) {
  return (
    <Modal
      title="Excluir medição"
      subtitle={mesLabel(mesRefKey)}
      onClose={onClose}
      overlay={false}
      footer={
        <>
          <div className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button
            className="btn"
            style={{ background: 'var(--danger)', color: '#fff' }}
            disabled={salvando}
            onClick={onConfirmar}
          >
            <Icon name="trash" size={14} />{salvando ? 'Excluindo…' : 'Excluir medição'}
          </button>
        </>
      }
    >
      <p style={{ fontSize: 13.5, color: 'var(--text-soft)' }}>
        Isso apaga a medição de {mesLabel(mesRefKey)} por completo, junto com todo o % medido
        preenchido nela — diferente de "Limpar", não deixa o registro para trás. Não tem como
        desfazer. Deseja continuar?
      </p>
    </Modal>
  );
}

// Só informativo — sem botão de "abrir mesmo assim": a única saída é reprogramar a(s)
// tarefa(s) listada(s) na Lista/Gantt e tentar abrir de novo.
function ModalPendenciasAbertura({ mesRefKey, pendentes, onClose }) {
  return (
    <Modal
      title="Não é possível abrir a medição"
      subtitle={mesLabel(mesRefKey)}
      onClose={onClose}
      overlay={false}
      draggable
      resizable
      footer={
        <>
          <div className="spacer" />
          <button className="btn btn-primary" onClick={onClose}>Entendi</button>
        </>
      }
    >
      <p style={{ fontSize: 13.5, color: 'var(--danger)', fontWeight: 600, marginBottom: 8 }}>
        {pendentes.length} tarefa(s) impedem abrir a medição de {mesLabel(mesRefKey)}:
      </p>
      <p style={{ fontSize: 13, color: 'var(--text-soft)', marginBottom: 8 }}>
        Reprograme a(s) data(s) ou registre o avanço na Lista ou no Gantt antes de abrir esta medição:
      </p>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-soft)' }}>
        {pendentes.map(p => (
          <li key={p.id}>
            {p.wbs} — {p.descricao}: {fmtPct100(p.avanco)}
            {p.motivo === 'termino' && ` (término ${mesLabel(p.terminoMes)})`}
            {p.motivo === 'zerada' && ` (sem execução desde ${mesLabel(p.inicioMes)})`}
            {p.motivo === 'atravessa' && (
              <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 2 }}>
                Começa em {mesLabel(p.inicioMes)} e ainda se estende até {mesLabel(mesRefKey)} ou
                depois.{' '}
                {p.avanco >= 100 ? (
                  // 100% executado mas ainda atravessa o mês: já terminou, as datas é que
                  // ficaram desalinhadas (ex.: marcaram 100% sem ajustar o término) —
                  // "Reprogramar restante" não se aplica (não sobra restante).
                  <>Como ela já está 100% executada, não é caso de "Reprogramar restante" —
                  as datas é que ficaram maiores que o trabalho real. Ajuste o término dela
                  na Lista pra ele caber antes de {mesLabel(mesRefKey)}.</>
                ) : (
                  <>Na Lista, botão direito na tarefa → "Reprogramar restante" separa o que já
                  foi feito do que falta, e libera a abertura.</>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
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
      {barColor && (
        <div className="kpi-bar">
          <span className="kpi-bar-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: barColor }} />
        </div>
      )}
      {foot && (
        <div className="kpi-foot" style={{ marginTop: 6 }}>
          <span className="kpi-foot-text" style={{ color: footColor }}>{foot}</span>
        </div>
      )}
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
            {violacoes.length} tarefa(s) impedem o fechamento de {mesLabel(mesRefKey)}:
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-soft)' }}>
            {violacoes.map(v => (
              <li key={v.id}>
                {v.wbs} — {v.descricao}: medido {fmtPct100(v.percMedido)} &gt; executado {fmtPct100(v.percExecutado)}
              </li>
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

// Sem estado "salvando": commit() aplica no cronograma em memória na hora (a persistência
// no banco é debounced em segundo plano, igual a qualquer outra edição da Lista/Gantt).
function ModalEnviarAvanco({ mesRefKey, pares, onClose, onConfirmar }) {
  const qtdForaDoMes = pares.filter(p => p.foraDoMes).length;
  return (
    <Modal
      title="Enviar % medido para a Lista"
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
            onClick={onConfirmar}
          >
            <Icon name="upload" size={14} />Confirmar envio
          </button>
        </>
      }
    >
      <p style={{ fontSize: 13.5, color: 'var(--text-soft)', marginBottom: 8 }}>
        Isso vai atualizar o % executado (avanço) de {pares.length} tarefa(s) na Lista com o %
        medido preenchido nesta tela. Tarefas cujo % medido é igual ao avanço atual não entram
        nesta lista.
      </p>
      {qtdForaDoMes > 0 && (
        <p style={{ fontSize: 13, color: 'var(--warning)', background: 'var(--warning-bg)', borderRadius: 6, padding: '8px 10px', marginBottom: 8 }}>
          {qtdForaDoMes} {qtdForaDoMes === 1 ? 'destas tarefas está marcada' : 'destas tarefas estão marcadas'} como "fora do mês" (data
          programada fora de {mesLabel(mesRefKey)}) — ajuste as datas dela{qtdForaDoMes === 1 ? '' : 's'} na Lista para
          dentro do mês atual, senão ela{qtdForaDoMes === 1 ? '' : 's'} continua{qtdForaDoMes === 1 ? '' : 'm'} aparecendo
          fora do previsto por lá.
        </p>
      )}
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-soft)', maxHeight: 220, overflowY: 'auto' }}>
        {pares.map(p => (
          <li key={p.id}>
            {p.wbs} — {p.descricao}: {fmtPct100(p.percMedido)}
            {p.foraDoMes && <span className="badge warning" style={{ fontSize: 9.5, padding: '0 5px', marginLeft: 6 }}>fora do mês</span>}
          </li>
        ))}
      </ul>
    </Modal>
  );
}

// Tom por nível de profundidade — mesma escala usada em VincularTarefasModal
// (cronogramaModais.jsx) para destacar tarefas-pai fora de uma <table> (aqui é lista de
// <label>, então as classes lista-row-group-lN da tabela não se aplicam).
const groupTintDoNivel = (nivel) =>
  (nivel || 0) <= 0 ? 'var(--brand-100)' : nivel === 1 ? 'var(--brand-50)' : 'var(--brand-tint)';

// Tela de escolha manual de tarefas fora do mês (sem fatia programada no mês de
// referência) para trazer à medição — substitui o antigo checkbox "Incluir itens não
// programados" por uma seleção explícita, item a item.
function ModalIncluirTarefa({ candidatas, etapas, onClose, onConfirmar, mobileView = false }) {
  const [busca, setBusca] = React.useState('');
  const [selecionados, setSelecionados] = React.useState(() => new Set());

  const filtradas = React.useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return candidatas;
    return candidatas.filter(c => c.descricao.toLowerCase().includes(q) || c.wbs.includes(q));
  }, [candidatas, busca]);

  // Injeta as linhas de grupo ancestrais das candidatas filtradas — grupo só aparece se
  // tiver alguma folha candidata dentro (mesma regra de computeArvoreMedicao).
  const linhas = React.useMemo(() => computeArvoreForaDoMes(filtradas, etapas), [filtradas, etapas]);

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
      draggable
      resizable
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
          {linhas.map(l => l.tipo === 'grupo' ? (
            <div key={'g' + l.id} style={{
              display: 'flex', alignItems: 'center', padding: '6px 12px', paddingLeft: 12 + l.nivel * 14,
              borderBottom: '1px solid var(--border-subtle)', background: groupTintDoNivel(l.nivel),
              fontSize: 12.5, fontWeight: 700, color: 'var(--brand)',
            }}>
              {l.descricao}
            </div>
          ) : mobileView ? (
            // No mobile a linha em flex única espremia demais a descrição (wbs + valor
            // já tomavam boa parte da largura) — empilha em 2 linhas, sem coluna de
            // disciplina (cabe na descrição/wbs, que já mostra o essencial).
            <label key={l.id} style={{
              display: 'flex', flexDirection: 'column', gap: 4, padding: '9px 12px', paddingLeft: 12 + l.nivel * 14,
              borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', fontSize: 13,
            }}>
              <span style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <input type="checkbox" checked={selecionados.has(l.id)} onChange={() => alternar(l.id)} style={{ marginTop: 2, flexShrink: 0 }} />
                <span style={{ flex: 1 }}>
                  <span className="num" style={{ color: 'var(--text-muted)', marginRight: 6 }}>{l.wbs}</span>
                  {l.descricao}
                </span>
              </span>
              <span style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 26, fontSize: 12, color: 'var(--text-muted)' }}>
                <span>{l.disciplina}</span>
                <span className="num">{formatBRL(l.valor, 2)}</span>
              </span>
            </label>
          ) : (
            <label key={l.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', paddingLeft: 12 + l.nivel * 14,
              borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', fontSize: 13,
            }}>
              <input type="checkbox" checked={selecionados.has(l.id)} onChange={() => alternar(l.id)} />
              <span className="num" style={{ color: 'var(--text-muted)', minWidth: 56 }}>{l.wbs}</span>
              <span style={{ flex: 1 }}>{l.descricao}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{l.disciplina}</span>
              <span className="num" style={{ minWidth: 90, textAlign: 'right' }}>{formatBRL(l.valor, 2)}</span>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}

export default function MedicaoMensal({
  etapas, months, monthlyDist, monthlyTotals, valorVinculadoMap = {}, wbsMap,
  obraId, readOnly, currentUser, onEnviarAvanco,
  reprogramacoes = [], obraNome = 'Projeto', hideChrome = false,
}) {
  const toast = useToast();
  const isMobile = useIsMobile();
  // O design mobile (accordion/cards) só vale dentro do "modo foco" do Mobile Gate
  // (hideChrome) — "Acessar sistema completo" sempre mostra a tabela clássica, não
  // importa a largura real da tela (isMobile sozinho não decide mais o layout).
  const mobileView = isMobile && hideChrome;
  const hasVinc = Object.keys(valorVinculadoMap).length > 0;
  const weightOverride = hasVinc ? valorVinculadoMap : null;

  const [mesRefKey, setMesRefKey] = React.useState(() => {
    const salvo = carregarMesRefMedicao(obraId);
    if (salvo && months.some(m => m.key === salvo)) return salvo;
    return mesAtualOuUltimo(months);
  });
  React.useEffect(() => { if (obraId && mesRefKey) salvarMesRefMedicao(obraId, mesRefKey); }, [obraId, mesRefKey]);
  React.useEffect(() => {
    if (months.length && !months.some(m => m.key === mesRefKey)) setMesRefKey(months[months.length - 1].key);
  }, [months, mesRefKey]);

  const [registro, setRegistro] = React.useState(null);
  const [itensTrabalho, setItensTrabalho] = React.useState([]);
  // Começa true: a 1ª renderização (antes do useEffect de gerarMedicao rodar) não pode
  // cair no branch "Nenhuma medição aberta" — seria um falso negativo, já que a medição
  // pode existir e só não ter voltado do banco ainda.
  const [carregando, setCarregando] = React.useState(true);
  const [salvando, setSalvando] = React.useState(false);
  const [busca, setBusca] = React.useState('');
  const [pavimento, setPavimento] = React.useState('Todos');
  const [mostrarConfirmFechar, setMostrarConfirmFechar] = React.useState(false);
  const [mostrarConfirmReabrir, setMostrarConfirmReabrir] = React.useState(false);
  const [mostrarConfirmLimpar, setMostrarConfirmLimpar] = React.useState(false);
  const [mostrarConfirmExcluir, setMostrarConfirmExcluir] = React.useState(false);
  const [pendenciasAbertura, setPendenciasAbertura] = React.useState(null);

  // Largura das colunas da tabela principal — mesmo padrão de ListaInterativa.jsx.
  const [colWidths, setColWidths] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem(`crono_medicao_widths_${obraId}`) || 'null') || {}; }
    catch { return {}; }
  });
  React.useEffect(() => {
    if (obraId) localStorage.setItem(`crono_medicao_widths_${obraId}`, JSON.stringify(colWidths));
  }, [colWidths, obraId]);
  const getColW = (colId) => colWidths[colId] ?? MEDICAO_COL_DEFWIDTH[colId] ?? 100;
  const startColResize = (ev, colId) => {
    ev.preventDefault(); ev.stopPropagation();
    const startX = ev.clientX;
    const startW = getColW(colId);
    const onMove = (e2) => setColWidths(prev => ({ ...prev, [colId]: Math.max(50, startW + e2.clientX - startX) }));
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };
  const resizeHandle = (colId) => (
    <div
      style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 5, cursor: 'col-resize', zIndex: 5 }}
      onClick={ev => ev.stopPropagation()}
      onMouseDown={ev => startColResize(ev, colId)}
    />
  );

  // Tarefas fora do mês escolhidas manualmente (ver ModalIncluirTarefa) — persistidas
  // no rascunho como `manual: true` e recarregadas com ele (ver gerarMedicao).
  const [idsManuais, setIdsManuais] = React.useState(() => new Set());
  const [modalIncluirAberto, setModalIncluirAberto] = React.useState(false);
  const [modalEnviarAberto, setModalEnviarAberto] = React.useState(false);

  // Observação por tarefa (card mobile): editor embutido no card, some fechado por
  // padrão — só abre id-a-id (notasAbertas) com um rascunho próprio (notaDrafts) até
  // "Salvar" gravar em itensTrabalho/persistirRascunho; "Cancelar" descarta o rascunho.
  const [notasAbertas, setNotasAbertas] = React.useState(() => new Set());
  const [notaDrafts, setNotaDrafts] = React.useState({});

  // Grupos recolhidos (ids). Local: recolher aqui não mexe no cronograma.
  const [collapsed, setCollapsed] = React.useState(() => new Set());
  // Último nível escolhido no select "Estrutura", só para o select mostrar o que foi
  // aplicado (em vez de sempre voltar a "Escolher…"). Some de novo assim que um chevron
  // é clicado à mão, porque nesse momento deixa de ser verdade que a árvore inteira está
  // naquele nível — ver alternarGrupo.
  const [nivelEstrutura, setNivelEstrutura] = React.useState('');

  // Recolher a faixa de filtros/ações — mesma ideia do ribbon da Lista, só que aqui é um
  // toggle único (sem abas). Persistido por navegador (não por obra: é preferência de tela).
  const [filtrosRecolhidos, setFiltrosRecolhidos] = React.useState(() => localStorage.getItem('crono_medicao_filtros_recolhidos') === '1');
  React.useEffect(() => {
    try { localStorage.setItem('crono_medicao_filtros_recolhidos', filtrosRecolhidos ? '1' : '0'); } catch { /* ignore */ }
  }, [filtrosRecolhidos]);

  const [mesesComMedicao, setMesesComMedicao] = React.useState([]);
  const [pdfFormat, setPdfFormat] = React.useState('a3');
  const [exportando, setExportando] = React.useState(false);
  const [exportOpen, setExportOpen] = React.useState(false);
  const exportRef = React.useRef(null);

  // wbsMap vem por prop, já calculado uma única vez em CronogramaFull (que nunca desmonta
  // ao trocar de aba) — evita recalcular do zero sobre todas as etapas a cada vez que o
  // usuário entra nesta aba (mesmo motivo de UsoTarefaView receber por prop).
  const disciplinaInfo = React.useMemo(() => computeDisciplinaInfo(etapas, wbsMap), [etapas, wbsMap]);

  // Monta as linhas do mês a partir do cronograma vivo. Usado enquanto a medição está
  // aberta (rascunho) — medição fechada NÃO passa por aqui, ver abaixo.
  const montarDoCronograma = React.useCallback((idsExtras) => buildItensMedicao(etapas, mesRefKey, {
    monthlyDist, wbsMap, disciplinaInfo, idsExtras, valorVinculadoMap: weightOverride,
  }), [etapas, mesRefKey, monthlyDist, wbsMap, disciplinaInfo, weightOverride]);

  const gerarMedicao = React.useCallback(async () => {
    if (!obraId || !mesRefKey) { setItensTrabalho([]); setRegistro(null); setIdsManuais(new Set()); setCarregando(false); return; }
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

  // Fecha o dropdown de ações ao clicar fora — mesmo padrão do dropdown de exportação.
  const [acoesOpen, setAcoesOpen] = React.useState(false);
  const acoesRef = React.useRef(null);
  React.useEffect(() => {
    if (!acoesOpen) return;
    const h = (e) => { if (acoesRef.current && !acoesRef.current.contains(e.target)) setAcoesOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [acoesOpen]);

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

  // Ciclo de abertura/fechamento precisa seguir a ordem dos meses: não dá pra abrir um mês
  // enquanto o anterior ainda está em rascunho, nem reabrir um mês enquanto algum posterior
  // já foi fechado (senão os dois documentos fechados deixam de bater com a ordem real).
  const mesIdxAtual = months.findIndex(m => m.key === mesRefKey);
  const mesAnterior = mesIdxAtual > 0 ? months[mesIdxAtual - 1] : null;
  const anteriorAberta = !!mesAnterior && statusPorMes[mesAnterior.key] === 'rascunho';
  // Cada mês só abre depois que o anterior já tem uma Reprogramação salva (o retrato do
  // cronograma antes de reprogramar pra frente) — sem isso, o previsto congelado na
  // abertura deste mês partiria de um cronograma que ainda não foi "fechado" pra trás.
  // Primeiro mês do cronograma (sem mesAnterior) não exige nada.
  const mesesComRep = React.useMemo(() => mesesComReprogramacao(reprogramacoes), [reprogramacoes]);
  const anteriorSemReprogramacao = !!mesAnterior && !mesesComRep.has(mesAnterior.key);
  const proximaFechadaPosterior = mesIdxAtual >= 0
    ? months.slice(mesIdxAtual + 1).find(m => statusPorMes[m.key] === 'fechada')
    : undefined;
  const existePosteriorFechada = !!proximaFechadaPosterior;
  // Excluir também segue a ordem, mas ao contrário de abrir: é a operação inversa de
  // abrir/fechar, então desfazer precisa ir do mês mais recente pro mais antigo (mesma
  // direção de reabrir) — só dá pra excluir o mês mais NOVO já criado, senão abre um
  // buraco no meio da sequência (o posterior fica criado, este alvo fica sem nada).
  const proximaCriadaPosterior = mesIdxAtual >= 0
    ? months.slice(mesIdxAtual + 1).find(m => !!statusPorMes[m.key])
    : undefined;
  const existePosteriorCriada = !!proximaCriadaPosterior;
  // Excluir apaga tudo sem deixar rastro (ao contrário de Limpar) — com % já preenchido
  // isso é perda de dado real, então força passar por "Limpar" primeiro (que ao menos
  // mantém o registro) em vez de deixar excluir de uma tacada só.
  const temPercMedidoPreenchido = itensTrabalho.some(i => (i.percMedido || 0) > 0);

  const pavimentos = React.useMemo(
    () => ['Todos', ...Array.from(new Set(itensTrabalho.map(i => i.pavimento))).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))],
    [itensTrabalho]
  );

  const filtradas = React.useMemo(() => itensTrabalho.filter(i => (
    (pavimento === 'Todos' || i.pavimento === pavimento) &&
    (busca.trim() === '' ||
      i.descricao.toLowerCase().includes(busca.trim().toLowerCase()) ||
      i.wbs.includes(busca.trim()))
  )), [itensTrabalho, pavimento, busca]);

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
  // Nível das "etapas de topo" pro accordion mobile: normalmente nível 0, mas várias
  // obras têm um único grupo-raiz tipo "Resumo" envolvendo o cronograma inteiro (peso
  // 100%) — nesse caso as etapas de verdade (SERVIÇOS INICIAIS, INFRAESTRUTURA...) ficam
  // no nível 1, e colorir/accordionar no nível 0 pintava só o "Resumo" sozinho. Se o
  // nível 0 tem exatamente 1 grupo, desce um nível; do contrário usa o 0 normalmente.
  const nivelEtapaMobile = React.useMemo(() => {
    const nivel0 = arvoreCompleta.filter(l => l.tipo === 'grupo' && (l.nivel || 0) === 0);
    return nivel0.length === 1 ? 1 : 0;
  }, [arvoreCompleta]);
  // Ids das etapas de topo (no nível acima) — base do accordion mobile em alternarGrupo
  // e do auto-colapso ao entrar. Vem de arvoreCompleta (não de `linhas`) porque não pode
  // depender do próprio `collapsed` que está sendo alterado.
  const nivel0Ids = React.useMemo(
    () => arvoreCompleta.filter(l => l.tipo === 'grupo' && (l.nivel || 0) === nivelEtapaMobile).map(l => l.id),
    [arvoreCompleta, nivelEtapaMobile]
  );
  // Nº de tarefas (folhas) sob cada etapa de topo — só pro resumo mobile ("peso 35% · 7
  // tarefas"). arvoreCompleta é ordem depth-first: cada grupo é seguido dos próprios
  // descendentes até o próximo item de nível <= o dele, daí a varredura por índice.
  const contagemPorGrupo = React.useMemo(() => {
    const mapa = {};
    arvoreCompleta.forEach((l, i) => {
      if (l.tipo !== 'grupo' || (l.nivel || 0) !== nivelEtapaMobile) return;
      let count = 0;
      for (let j = i + 1; j < arvoreCompleta.length; j++) {
        const cur = arvoreCompleta[j];
        if (cur.tipo === 'grupo' && (cur.nivel || 0) <= nivelEtapaMobile) break;
        if (cur.tipo === 'item') count++;
      }
      mapa[l.id] = count;
    });
    return mapa;
  }, [arvoreCompleta, nivelEtapaMobile]);
  // Cor de cada linha (grupo de topo, subníveis e tarefas) = a cor da etapa de topo que
  // a contém — mesma varredura depth-first de contagemPorGrupo, só que carregando a cor
  // "corrente" adiante em vez de contar. Só usado no accordion mobile.
  const corPorLinha = React.useMemo(() => {
    const mapa = {};
    let corAtual = ETAPA_CORES_MOBILE[0];
    let indiceEtapa = -1;
    arvoreCompleta.forEach((l) => {
      if (l.tipo === 'grupo' && (l.nivel || 0) === nivelEtapaMobile) {
        indiceEtapa += 1;
        corAtual = ETAPA_CORES_MOBILE[indiceEtapa % ETAPA_CORES_MOBILE.length];
      }
      mapa[l.id] = corAtual;
    });
    return mapa;
  }, [arvoreCompleta, nivelEtapaMobile]);
  // No celular, ao entrar pela 1ª vez num mês, começa com as etapas de topo recolhidas
  // (resumidas em 1 linha) — igual ao "Recolher tudo", mas só no nível 0: abrir uma
  // etapa (alternarGrupo) já mostra a subárvore inteira dela, sem subníveis colapsados
  // por baixo. Roda 1x por mesRefKey (a ref evita repetir ao só re-renderizar).
  const autoColapsouMobileRef = React.useRef(null);
  React.useEffect(() => {
    if (mobileView && nivel0Ids.length > 0 && autoColapsouMobileRef.current !== mesRefKey) {
      setCollapsed(new Set(nivel0Ids));
      autoColapsouMobileRef.current = mesRefKey;
    }
  }, [mobileView, mesRefKey, nivel0Ids]);
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
    if (!mesRefKey) return { valorObra: 0, metaProgramada: 0, previstoAcumulado: 0, executadoMesPct: 0, executadoAcumulado: 0 };
    return computeResumo({ monthlyTotals, mesRefKey, valorMedidoMes: totais.valorAMedir });
  }, [monthlyTotals, mesRefKey, totais.valorAMedir]);

  // "Previsto do mês" (KPI): só o previsto de verdade (valorTotalBase, exclui as manuais "fora
  // do mês" — mesma regra já usada pro peso/PESO% da tabela) como fração do valor total do
  // projeto (resumo.valorObra). Tarefa trazida manualmente não estava no previsto do mês, então
  // não pode inflar essa conta — ela só entra no realizado (Executado do mês/acumulado).
  //
  // Uma vez aberta a medição, esse previsto CONGELA (registro.perc_previsto, gravado na
  // abertura — ver abrirMedicao): reprogramar uma tarefa depois não pode fazer a meta
  // "perseguir" o que já foi executado. Sem registro (ainda não abriu) continua ao vivo,
  // como prévia. Registros abertos antes desse campo existir (perc_previsto null) também
  // caem no cálculo ao vivo — não tem o que congelar retroativamente.
  const previstoMesPctAoVivo = resumo.valorObra > 0 ? (valorTotalBase / resumo.valorObra) * 100 : 0;
  const previstoMesPct = registro?.perc_previsto != null ? registro.perc_previsto : previstoMesPctAoVivo;
  const previstoAcumuladoExibido = registro?.perc_previsto_acumulado != null ? registro.perc_previsto_acumulado : resumo.previstoAcumulado;

  // "Executado do mês" (KPI) usa resumo.executadoMesPct — o que foi medido nesta tela em R$
  // como fração da OBRA INTEIRA, não do valor deste mês (totais.med, que só mostra "quanto do
  // que cabia neste mês já foi medido" e pode chegar a 100% mesmo o mês valendo pouco da obra).
  // Comparado contra previstoMesPct (mesma escala agora), não mais contra a constante 100.
  const gapExecutado = previstoMesPct - resumo.executadoMesPct;
  const validacao = React.useMemo(() => validarFechamento(itensTrabalho), [itensTrabalho]);

  // Tarefas cujo % medido diverge do avanço ATUAL do cronograma — só essas entram no
  // botão "Enviar % medido para a Lista" (ignora busca/pavimento, igual a "Salvar
  // rascunho"/"Fechar medição": os filtros são só da tela, não da operação).
  const paresParaEnviar = React.useMemo(() => {
    const porId = new Map(etapas.map(e => [e.id, e]));
    return itensTrabalho
      .filter(i => Math.round(i.percMedido) !== (porId.get(i.id)?.avanco ?? 0))
      .map(i => ({ id: i.id, percMedido: Math.round(i.percMedido), descricao: i.descricao, wbs: i.wbs, foraDoMes: !!i.foraDoMes }));
  }, [itensTrabalho, etapas]);

  const confirmarEnvioAvanco = () => {
    onEnviarAvanco(paresParaEnviar);
    // Reflete na hora nesta tela: onEnviarAvanco muda o avanço lá no cronograma (prop `etapas`),
    // mas itensTrabalho é estado local (só recarrega ao trocar de mês/obra, de propósito, pra não
    // perder edição em andamento) — sem isso, "% executado" só atualizava depois de sair e voltar
    // à aba.
    const porId = new Map(paresParaEnviar.map(p => [p.id, p.percMedido]));
    setItensTrabalho(prev => prev.map(l => (porId.has(l.id) ? { ...l, percExecutado: porId.get(l.id) } : l)));
    setModalEnviarAberto(false);
    toast(`${paresParaEnviar.length} tarefa(s) atualizada(s) na Lista`, { tone: 'success', icon: 'check' });
  };

  // Autosave debounced: cada tecla atualiza a tela na hora, e 800ms depois de parar de
  // digitar salva sozinho — sem exigir um botão "Salvar rascunho" separado. Mesmo padrão de
  // debounce do commit() do cronograma (Cronograma.jsx).
  const saveTimerRef = React.useRef(null);
  const alterarMedido = (id, bruto) => {
    if (bloqueado) return;
    const valor = parsePercInput(bruto);
    setItensTrabalho(prev => {
      const proximos = prev.map(l => (l.id === id ? { ...l, percMedido: valor } : l));
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => persistirRascunho(proximos, { silencioso: true }), 800);
      return proximos;
    });
  };

  // Observação por tarefa (mobile) — ver notasAbertas/notaDrafts acima.
  const abrirNota = (l) => {
    setNotaDrafts(prev => ({ ...prev, [l.id]: l.observacao || '' }));
    setNotasAbertas(prev => new Set(prev).add(l.id));
  };
  const fecharNota = (id) => {
    setNotasAbertas(prev => { const next = new Set(prev); next.delete(id); return next; });
  };
  const salvarNota = (id) => {
    if (bloqueado) return;
    const texto = (notaDrafts[id] || '').trim();
    const proximos = itensTrabalho.map(l => (l.id === id ? { ...l, observacao: texto } : l));
    setItensTrabalho(proximos);
    persistirRascunho(proximos);
    fecharNota(id);
  };

  const alternarGrupo = (id) => {
    setNivelEstrutura(''); // o select deixa de valer: a árvore não está mais uniforme num nível só
    setCollapsed(prev => {
      const estaFechado = prev.has(id);
      const next = new Set(prev);
      // Accordion só entre etapas de nível 0 (topo) e só no modo foco mobile: abrir uma
      // fecha as demais que estavam abertas, sem mexer no colapso interno de subníveis
      // (que continuam com toggle independente). Fora do modo foco mantém multi-abertura.
      if (mobileView && estaFechado && nivel0Ids.includes(id)) {
        nivel0Ids.forEach(gid => next.add(gid));
      }
      if (estaFechado) {
        next.delete(id);
        // Ao abrir um grupo, os subgrupos logo abaixo dele sempre voltam recolhidos —
        // sem isso, abrir uma etapa já revelava a subárvore inteira de uma vez (nenhum
        // subnível tinha sido tocado ainda, então não estava em `collapsed`). Mesma
        // varredura depth-first de contagemPorGrupo/corPorLinha.
        const idx = arvoreCompleta.findIndex(l => l.id === id);
        if (idx !== -1) {
          const nivelAtual = arvoreCompleta[idx].nivel || 0;
          for (let i = idx + 1; i < arvoreCompleta.length; i++) {
            const cur = arvoreCompleta[i];
            if (cur.tipo === 'grupo' && (cur.nivel || 0) <= nivelAtual) break;
            if (cur.tipo === 'grupo') next.add(cur.id);
          }
        }
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Mesma semântica de applyOutlineLevel do Cronograma (0 = expandir tudo), mas o
  // resultado é o Set local desta tela, sem gravar no cronograma.
  const aplicarNivel = (nivel) => {
    setCollapsed(gruposParaNivel(arvoreCompleta, nivel));
    setNivelEstrutura(String(nivel));
  };

  // Grava a lista no rascunho. `itens` explícito porque a inclusão/remoção manual precisa
  // salvar a lista nova no mesmo tick, antes do state ter sido aplicado.
  const persistirRascunho = React.useCallback(async (itens, { silencioso = false } = {}) => {
    if (bloqueado) return;
    const { data, error } = await medicaoMensalService.salvarRascunho(obraId, mesRefKey, itens);
    if (error) {
      // Falha SEMPRE avisa, mesmo no autosave silencioso (que só suprime o toast de
      // SUCESSO) — ficar sempre calado numa falha real fazia o usuário achar que salvou
      // e o valor sumir ao recarregar a página.
      toast('Não foi possível salvar o rascunho. Tente novamente.', { tone: 'danger' });
      return;
    }
    setRegistro(data);
    if (!silencioso) toast('Rascunho salvo', { tone: 'success', icon: 'check' });
  }, [obraId, mesRefKey, bloqueado, toast]);

  // Abre a medição do mês: cria o registro no banco com os itens do cronograma. É o
  // "eu abro a medição para ela ser criada" — antes a linha nascia por efeito colateral
  // do primeiro salvamento, e um mês sem registro já vinha editável.
  const abrirMedicao = async () => {
    if (readOnly || registro || anteriorAberta || anteriorSemReprogramacao) return;
    const { ok, pendentes } = validarAbertura(etapas, mesRefKey, wbsMap);
    if (!ok) { setPendenciasAbertura(pendentes); return; }
    setSalvando(true);
    const itens = montarDoCronograma(new Set());
    // Congela o previsto (mês e acumulado) neste exato momento — antes de qualquer
    // reprogramação futura, é isso que a meta deste mês vai continuar sendo. O previsto
    // do mês usa `itens` (acabou de montar, sempre atual), NÃO `valorTotalBase`/
    // `itensTrabalho` (estado da tela — podia ainda estar vazio/da tela anterior no
    // instante exato do clique, congelando 0 por engano).
    const valorTotalBaseFresco = itens.reduce((s, i) => s + (i.foraDoMes ? 0 : i.valor), 0);
    const previstoCongelado = {
      percPrevisto: resumo.valorObra > 0 ? (valorTotalBaseFresco / resumo.valorObra) * 100 : 0,
      percPrevistoAcumulado: resumo.previstoAcumulado,
    };
    const { data, error } = await medicaoMensalService.salvarRascunho(obraId, mesRefKey, itens, previstoCongelado);
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

  // Desfaz a inclusão manual de uma tarefa fora do mês. Com % medido preenchido, o botão
  // continua clicável (só desabilitado quando a medição está bloqueada) pra poder avisar
  // o motivo por toast — um <button disabled> não dispara title/tooltip no toque (mobile
  // não tem hover), então o aviso silencioso não chegava a quem tentasse remover.
  const tentarRemoverTarefa = (l) => {
    if (bloqueado) return;
    if (l.percMedido > 0) {
      toast('Zere o % medido antes de remover esta tarefa.', { tone: 'danger', icon: 'alert-triangle' });
      return;
    }
    removerTarefaManual(l.id);
  };
  const removerTarefaManual = (id) => {
    if (bloqueado) return;
    const nextIds = new Set(idsManuais);
    nextIds.delete(id);
    const proximos = itensTrabalho.filter(i => i.id !== id);
    setIdsManuais(nextIds);
    setItensTrabalho(proximos);
    persistirRascunho(proximos, { silencioso: true });
  };

  const confirmarFechamento = async () => {
    setSalvando(true);
    // Carrega adiante o previsto já congelado na abertura — não recalcula aqui (senão o
    // fechamento reintroduziria o mesmo problema que a abertura resolveu). Só recai no
    // cálculo ao vivo se o mês foi aberto antes desses campos existirem.
    const previstoCongelado = {
      percPrevisto: registro?.perc_previsto != null ? registro.perc_previsto : previstoMesPctAoVivo,
      percPrevistoAcumulado: registro?.perc_previsto_acumulado != null ? registro.perc_previsto_acumulado : resumo.previstoAcumulado,
    };
    const snapshot = buildSnapshotFechamento(itensTrabalho, totais, previstoCongelado);
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
    if (existePosteriorFechada) return;
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

  // Zera o % medido de todos os itens da medição (mantém a lista de itens/manuais como
  // está) — pra recomeçar o preenchimento do zero sem precisar reabrir/apagar a medição.
  const limparMedicao = async () => {
    setSalvando(true);
    const proximos = itensTrabalho.map(l => ({ ...l, percMedido: 0 }));
    setItensTrabalho(proximos);
    await persistirRascunho(proximos, { silencioso: true });
    setSalvando(false);
    setMostrarConfirmLimpar(false);
    toast('Medição limpa', { tone: 'success', icon: 'check' });
  };

  // Apaga o boletim inteiro — ao contrário de limparMedicao, não deixa nada para trás: volta
  // ao estado "sem medição aberta" pro mês, como se "Abrir medição" nunca tivesse rodado.
  const excluirMedicao = async () => {
    if (existePosteriorCriada || temPercMedidoPreenchido) return;
    setSalvando(true);
    const { data, error } = await medicaoMensalService.excluir(obraId, mesRefKey);
    setSalvando(false);
    if (error || !data || data.length === 0) { toast('Não foi possível excluir a medição.', { tone: 'danger' }); return; }
    setRegistro(null);
    setItensTrabalho([]);
    setIdsManuais(new Set());
    setMostrarConfirmExcluir(false);
    toast(`Medição de ${mesLabel(mesRefKey)} excluída`, { tone: 'success', icon: 'check' });
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
        offsetToDate(l.inicioOff),
        offsetToDate(l.terminoOff - 1), // terminoOff é exclusivo; -1 pra exibir/exportar
        l.duracaoDias,
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
      const mod  = await import('xlsx-js-style');
      const XLSX = mod.utils ? mod : mod.default; // interop: xlsx-js-style não expõe named exports estáticos como o `xlsx`
      const HEADER_ROW  = 3;
      const linhas2     = linhasExport();
      const groupRowIdx = [];
      linhas2.forEach((l, i) => { if (l.grupo) groupRowIdx.push(HEADER_ROW + 1 + i); });
      // linhasExport() devolve objetos Date crus nas células 3/4 (Início/Término) porque o
      // export em PDF usa esses mesmos Date via toLocaleDateString — só aqui, pro Excel,
      // convertemos pro serial do Excel (ver dateToExcelSerial: entregar o Date object direto
      // pro xlsx-js-style jogava a data 1 dia pra trás em fuso negativo, ex. Brasil).
      const corpo = linhas2.map(l => l.cells.map((v, i) => (i === 3 || i === 4) && v instanceof Date ? dateToExcelSerial(v) : v));
      const totalRowIdx = HEADER_ROW + 1 + corpo.length;
      const rows = [
        [`Medição Mensal · ${obraNome} · ${mesLabel(mesRefKey)}`],
        [`Gerado em ${new Date().toLocaleDateString('pt-BR')}`],
        [],
        CABECALHOS,
        ...corpo,
        [`TOTAL GERAL · ${totais.qtd} atividades`, '', '', null, null, '',
          totais.peso / 100, totais.exec / 100, totais.med / 100, totais.valor, totais.valorAMedir],
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows, { dateNF: 'DD/MM/YYYY' });
      const rng = XLSX.utils.decode_range(ws['!ref']);
      // Números crus na célula + formato via .z (nunca string de moeda), padrão do projeto.
      for (let R = HEADER_ROW + 1; R <= rng.e.r; R++) {
        [[3, 'DD/MM/YYYY'], [4, 'DD/MM/YYYY'], [6, '0.00%'], [7, '0.00%'], [8, '0.00%'], [9, '#,##0.00'], [10, '#,##0.00']].forEach(([C, z]) => {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          if (ws[addr]) ws[addr].z = z;
        });
      }
      ws['!cols'] = [{ wch: 12 }, { wch: 46 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 7 }, { wch: 10 }, { wch: 13 }, { wch: 11 }, { wch: 16 }, { wch: 16 }];
      ws['!freeze'] = { xSplit: 2, ySplit: HEADER_ROW + 1 };
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: CABECALHOS.length - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: CABECALHOS.length - 1 } },
      ];
      ws['A1'].s = { ...XLSX_TITLE_STYLE };
      ws['A2'].s = { ...XLSX_SUBTITLE_STYLE };
      aplicarEstiloLinha(XLSX, ws, HEADER_ROW, CABECALHOS.length, XLSX_HEADER_STYLE);
      groupRowIdx.forEach(r => aplicarEstiloLinha(XLSX, ws, r, CABECALHOS.length, XLSX_GROUP_ROW_STYLE));
      aplicarEstiloLinha(XLSX, ws, totalRowIdx, CABECALHOS.length, XLSX_TOTAL_ROW_STYLE);
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
      doc.setFontSize(13); doc.text(`Medição Mensal · ${obraNome} · ${mesLabel(mesRefKey)}`, 14, 14);
      doc.setFontSize(8); doc.setTextColor(130);
      doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, 14, 20);
      doc.setTextColor(0);

      const dados = linhasExport();
      const fmtD = (d) => (d ? d.toLocaleDateString('pt-BR') : '');
      const fmtP = (v) => (v == null ? '' : `${formatNum(v * 100, 2)}%`);
      // % MEDIDO em branco quando zero — célula "sem nada preenchido" fica mais clara que
      // "0,00%" numa medição ainda por fazer.
      const fmtPMedido = (v) => (!v ? '' : fmtP(v));
      autoTable(doc, {
        startY: 25,
        head: [CABECALHOS],
        body: dados.map(l => [
          l.cells[0], l.cells[1], l.cells[2], fmtD(l.cells[3]), fmtD(l.cells[4]), l.cells[5],
          fmtP(l.cells[6]), fmtP(l.cells[7]), fmtPMedido(l.cells[8]), formatBRL(l.cells[9]), formatBRL(l.cells[10]),
        ]),
        foot: [[
          { content: `TOTAL GERAL · ${totais.qtd} atividades`, colSpan: 6, styles: { halign: 'left' } },
          fmtPct100(totais.peso), fmtPct100(totais.exec), totais.med ? fmtPct100(totais.med) : '', formatBRL(totais.valor), formatBRL(totais.valorAMedir),
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
      {!mobileView && (
      <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Medição Mensal</h1>
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
        </div>
      </div>

      <div className="kpi-grid">
        <KpiCard label="Previsto do mês" value={previstoMesPct} />
        <KpiCard
          label="Executado do mês" value={resumo.executadoMesPct}
          foot={`${gapExecutado >= 0 ? '▼' : '▲'} ${formatNum(Math.abs(gapExecutado), 2)} pp vs previsto`}
          footColor={gapExecutado >= 0 ? 'var(--danger)' : 'var(--success)'}
        />
        <KpiCard label="Previsto acumulado" value={previstoAcumuladoExibido} barColor="var(--brand)" />
        <KpiCard label="Executado acumulado" value={resumo.executadoAcumulado} barColor="var(--success)" />
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
        <div style={{ position: 'relative', borderBottom: '1px solid var(--border)', flexShrink: 0, minHeight: 34 }}>
        <div style={{
          display: filtrosRecolhidos ? 'none' : 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 10,
          padding: '14px 40px 14px 16px',
        }}>
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
            <span style={filtroLabelSt}>Pavimento</span>
            <select className="input" value={pavimento} onChange={e => setPavimento(e.target.value)} style={{ minWidth: 150 }}>
              {pavimentos.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          {/* Estrutura de tópicos por nível — mesmo menu da Lista e do Gantt, mas mostra o
              nível aplicado (nivelEstrutura) em vez de sempre voltar a "Escolher…": sem
              isso não havia confirmação nenhuma de que a escolha tinha feito efeito. Some
              de novo se um chevron individual for clicado (alternarGrupo), porque aí a
              árvore deixa de estar uniformemente naquele nível. */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={filtroLabelSt}>Estrutura</span>
            <select className="input" value={nivelEstrutura} style={{ minWidth: 150 }}
              title="Expandir ou recolher a estrutura por nível"
              onChange={e => { const v = e.target.value; if (v !== '') aplicarNivel(Number(v)); }}>
              <option value="" disabled>Escolher…</option>
              <option value="0">Expandir tudo</option>
              <option value="1">Recolher tudo</option>
              {Array.from({ length: nivelMax }, (_, i) => i + 1).map(n => (
                <option key={n} value={n}>Nível {n}</option>
              ))}
            </select>
          </label>
          {!bloqueado && (
            <div ref={acoesRef} style={{ position: 'relative' }}>
              <button type="button" className="btn btn-dark" onClick={() => setAcoesOpen(o => !o)}>
                Ações<Icon name="chevron-down" size={13} />
              </button>
              {acoesOpen && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 60,
                  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
                  boxShadow: '0 10px 30px rgba(0,0,0,0.18)', padding: 6, minWidth: 220,
                  display: 'flex', flexDirection: 'column', gap: 2,
                }}>
                  <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start' }}
                    onClick={() => { setAcoesOpen(false); setModalIncluirAberto(true); }}>
                    <Icon name="plus" size={15} />Incluir tarefa
                  </button>
                  <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start' }}
                    onClick={() => { setAcoesOpen(false); setMostrarConfirmLimpar(true); }}>
                    <Icon name="trash" size={15} />Limpar medição
                  </button>
                  <button
                    className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start' }}
                    onClick={() => { setAcoesOpen(false); setModalEnviarAberto(true); }}
                    disabled={paresParaEnviar.length === 0}
                    title={paresParaEnviar.length === 0 ? 'Nenhuma tarefa com % medido diferente do avanço atual' : undefined}
                  >
                    <Icon name="upload" size={15} />Enviar %
                  </button>
                  <div style={{ borderTop: '1px solid var(--border)', margin: '2px 0' }} />
                  <button
                    className="btn" style={{ width: '100%', justifyContent: 'flex-start', background: 'var(--success)', color: '#fff' }}
                    onClick={() => { setAcoesOpen(false); setMostrarConfirmFechar(true); }}
                  >
                    <Icon name="check" size={15} />Fechar medição
                  </button>
                  <div style={{ borderTop: '1px solid var(--border)', margin: '2px 0' }} />
                  <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', color: 'var(--danger)' }}
                    onClick={() => {
                      setAcoesOpen(false);
                      if (existePosteriorCriada) { toast(`Exclua primeiro a medição de ${mesLabel(proximaCriadaPosterior.key)}`, { tone: 'danger', icon: 'alert-triangle' }); return; }
                      if (temPercMedidoPreenchido) { toast('Esta medição já tem % medido preenchido — use "Limpar medição" antes de excluir.', { tone: 'danger', icon: 'alert-triangle' }); return; }
                      setMostrarConfirmExcluir(true);
                    }}
                    title={existePosteriorCriada ? `Exclua primeiro a medição de ${mesLabel(proximaCriadaPosterior.key)}`
                      : temPercMedidoPreenchido ? 'Use "Limpar medição" antes de excluir' : undefined}>
                    <Icon name="trash" size={15} />Excluir medição
                  </button>
                </div>
              )}
            </div>
          )}
          {fechada && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
              <span className="badge success"><span className="dot" />Medição fechada</span>
              {!readOnly && (
                <button type="button" className="btn btn-ghost"
                  onClick={() => {
                    if (existePosteriorFechada) { toast(`Reabra primeiro a medição de ${mesLabel(proximaFechadaPosterior.key)}`, { tone: 'danger', icon: 'alert-triangle' }); return; }
                    setMostrarConfirmReabrir(true);
                  }}
                  title={existePosteriorFechada ? `Reabra primeiro a medição de ${mesLabel(proximaFechadaPosterior.key)}` : undefined}>
                  <Icon name="refresh-cw" size={15} />Reabrir medição
                </button>
              )}
            </span>
          )}
        </div>
          <button
            type="button"
            onClick={() => setFiltrosRecolhidos(v => !v)}
            title={filtrosRecolhidos ? 'Mostrar filtros' : 'Ocultar filtros'}
            style={{
              position: 'absolute', right: 8, bottom: 6, zIndex: 1,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22,
              border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: filtrosRecolhidos ? 'rotate(-90deg)' : 'none', transition: 'transform .12s' }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>

        {/* Fora da barra de filtros/ações de propósito — fica visível mesmo com os
            filtros recolhidos, e não disputa espaço com os botões. */}
        {qtdForaDoMes > 0 && (
          <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <span className="badge warning">
              {qtdForaDoMes} {qtdForaDoMes === 1 ? 'item fora do mês' : 'itens fora do mês'} · somam ao realizado, não ao previsto
            </span>
          </div>
        )}

        {/* flex:1 + minHeight:0 dá a rolagem por dentro do card; sem o minHeight o
            flex item não encolhe e o scroll vaza para a página. */}
        <div style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
          {/* tbl-lista: cabeçalho azul e altura de linha fina, os mesmos da Lista. */}
          <table className="tbl tbl-lista" style={{ minWidth: 1240, '--lista-row-h': '24px' }}>
            <colgroup>
              {MEDICAO_COL_IDS.map(id => <col key={id} style={{ width: getColW(id) }} />)}
            </colgroup>
            <thead>
              <tr className="band-row" ref={bandRowRef}>
                <th colSpan={3}>ETAPA / TAREFA</th>
                <th colSpan={3}>PRAZO</th>
                <th colSpan={3}>AVANÇO</th>
                <th colSpan={2}>FINANCEIRO</th>
              </tr>
              <tr>
                <th style={{ ...thSticky, minWidth: getColW('servico') }}>SERVIÇO{resizeHandle('servico')}</th>
                <th style={{ ...thSticky, minWidth: getColW('descricao') }}>DESCRIÇÃO{resizeHandle('descricao')}</th>
                <th style={{ ...thSticky, minWidth: getColW('pavimento') }}>PAVIMENTO{resizeHandle('pavimento')}</th>
                <th className="center" style={{ ...thSticky, minWidth: getColW('inicio') }}>INÍCIO{resizeHandle('inicio')}</th>
                <th className="center" style={{ ...thSticky, minWidth: getColW('termino') }}>TÉRMINO{resizeHandle('termino')}</th>
                <th className="center" style={{ ...thSticky, minWidth: getColW('dur') }}>DUR.{resizeHandle('dur')}</th>
                <th className="center" style={{ ...thSticky, minWidth: getColW('peso') }}>PESO %{resizeHandle('peso')}</th>
                <th className="center" style={{ ...thSticky, minWidth: getColW('executado') }}>% EXECUTADO{resizeHandle('executado')}</th>
                <th className="center" style={{ ...thSticky, minWidth: getColW('medido') }}>% MEDIDO{resizeHandle('medido')}</th>
                <th className="right" style={{ ...thSticky, minWidth: getColW('valorAMedir') }}>VALOR A MEDIR{resizeHandle('valorAMedir')}</th>
                <th className="right" style={{ ...thSticky, minWidth: getColW('valorMedido') }}>VALOR MEDIDO{resizeHandle('valorMedido')}</th>
              </tr>
            </thead>
            <tbody>
              {linhas.length === 0 && (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-muted)' }}>
                    {carregando ? (
                      // Enquanto a busca no banco não volta, "Nenhuma medição aberta" seria
                      // enganoso — a medição pode existir e só não ter chegado ainda; sem
                      // isso a tela piscava esse aviso a cada troca de aba/mês antes do real.
                      <div style={{ fontSize: 13.5 }}>Carregando medição…</div>
                    ) : !registro ? (
                      // Mês sem medição: o ciclo começa aqui. Nada de itens e nada editável
                      // até abrir — antes a tela já vinha preenchida e livre, sem registro.
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                        <div style={{ fontSize: 13.5 }}>
                          Nenhuma medição aberta para <strong>{mesLabel(mesRefKey)}</strong>.
                        </div>
                        {readOnly ? (
                          <div style={{ fontSize: 12.5 }}>Você não tem permissão para abrir medições.</div>
                        ) : anteriorAberta ? (
                          <div style={{ fontSize: 12.5, color: 'var(--danger)' }}>
                            Feche primeiro a medição de {mesLabel(mesAnterior.key)} para poder abrir esta.
                          </div>
                        ) : anteriorSemReprogramacao ? (
                          <div style={{ fontSize: 12.5, color: 'var(--danger)' }}>
                            Salve a reprogramação de {mesLabel(mesAnterior.key)} (Cadastro → Salvar
                            reprogramação) antes de abrir esta medição.
                          </div>
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
                      <td />
                      <td className="center num">{l.dataInicio}</td>
                      <td className="center num">{l.dataTermino}</td>
                      <td className="center num">{l.duracaoDias}</td>
                      <td className="center num">{fmtPct100(l.peso)}</td>
                      <td className="right num">{fmtPct100(l.exec)}</td>
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
                            <button type="button" className="icon-btn-sm"
                              title={l.percMedido > 0 ? 'Zere o % medido antes de remover' : 'Remover tarefa'}
                              onClick={() => tentarRemoverTarefa(l)} disabled={bloqueado}>
                              <Icon name="x" size={11} />
                            </button>
                          </>
                        )}
                        {/* Observação por tarefa — mesmo campo/handlers do card mobile
                            (abrirNota/fecharNota/salvarNota, notasAbertas/notaDrafts),
                            só a casca de popover muda: sincroniza sozinho com o celular. */}
                        <span className="mm-row-nota-wrap">
                          <button type="button"
                            className={'mm-row-nota-btn' + (l.observacao ? ' has-nota' : '')}
                            title={l.observacao || 'Adicionar observação'}
                            disabled={bloqueado && !l.observacao}
                            onClick={() => (notasAbertas.has(l.id) ? fecharNota(l.id) : abrirNota(l))}>
                            <Icon name={l.observacao ? 'message-square' : 'plus'} size={13} />
                          </button>
                          {notasAbertas.has(l.id) && (
                            <div className="mm-row-nota-popover" onClick={e => e.stopPropagation()}>
                              <div className="mm-card-nota-editor">
                                <textarea
                                  className="input mm-card-nota-textarea"
                                  value={notaDrafts[l.id] ?? ''}
                                  disabled={bloqueado}
                                  placeholder="Ex.: motivo do atraso, pendência, combinado com o cliente…"
                                  aria-label={`Observação de ${l.descricao}`}
                                  onChange={e => setNotaDrafts(prev => ({ ...prev, [l.id]: e.target.value }))}
                                />
                                <div className="mm-card-nota-actions">
                                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => fecharNota(l.id)}>Cancelar</button>
                                  <button type="button" className="btn btn-dark btn-sm" disabled={bloqueado} onClick={() => salvarNota(l.id)}>Salvar</button>
                                </div>
                              </div>
                            </div>
                          )}
                        </span>
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
                    <td className="right num">{formatBRL((l.valor * l.percMedido) / 100, 2)}</td>
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
              {/* Acima de 10 meses fechados a tabela vira scroll (10 linhas + cabeçalho ~ 290px),
                  senão a página cresce sem fim conforme os fechamentos se acumulam. */}
              <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: fechadas.length > 10 ? 290 : undefined }}>
                <table className="tbl tbl-lista" style={{ '--lista-row-h': '26px' }}>
                  <thead>
                    <tr>
                      <th style={{ position: 'sticky', top: 0, zIndex: 1 }}>MÊS</th>
                      <th className="center" style={{ position: 'sticky', top: 0, zIndex: 1 }}>FECHADA EM</th>
                      <th style={{ position: 'sticky', top: 0, zIndex: 1 }}>FECHADA POR</th>
                      <th className="center" style={{ position: 'sticky', top: 0, zIndex: 1 }}>% MEDIDO</th>
                      <th className="right" style={{ position: 'sticky', top: 0, zIndex: 1 }}>VALOR MEDIDO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fechadas.map(f => (
                      <tr key={f.mes_referencia}>
                        <td style={{ fontWeight: 600 }}>{mesLabel(f.mes_referencia)}</td>
                        <td className="center num">{f.fechada_em ? new Date(f.fechada_em).toLocaleDateString('pt-BR') : '—'}</td>
                        <td>{f.fechada_por || '—'}</td>
                        {/* % do mês em relação à obra inteira (mesma escala do card "Executado
                            do mês"), não o f.perc_medido congelado — que é % do valor SÓ daquele
                            mês, escala diferente da usada no resto do resumo. */}
                        <td className="center num">
                          {f.valor_total_medido == null || !resumo.valorObra ? '—' : fmtPct100((f.valor_total_medido / resumo.valorObra) * 100)}
                        </td>
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
      </>
      )}

      {mobileView && (
      <div className="mm-mobile">
        <div className="mm-mobile-header">
          <div className="mm-mobile-title-row">
            <div>
              <div className="mm-mobile-eyebrow">{obraNome}</div>
              <div className="mm-mobile-title">Medição Mensal</div>
            </div>
            {registro && (
              <span className={'badge' + (fechada ? '' : ' success')}>
                <span className="dot" />{fechada ? 'Fechada' : 'Aberta'}
              </span>
            )}
          </div>

          {aberta && !bloqueado && (
            <div className="mm-mobile-actions-row">
              <button type="button" className="btn btn-dark" style={{ flex: 1 }} onClick={() => setMostrarConfirmFechar(true)}>
                <Icon name="check" size={15} />Fechar medição
              </button>
              <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setModalIncluirAberto(true)}>
                <Icon name="plus" size={15} />Incluir tarefa
              </button>
            </div>
          )}
          {fechada && !readOnly && (
            <div className="mm-mobile-actions-row">
              <button type="button" className="btn btn-ghost" style={{ flex: 1 }}
                onClick={() => {
                  if (existePosteriorFechada) { toast(`Reabra primeiro a medição de ${mesLabel(proximaFechadaPosterior.key)}`, { tone: 'danger', icon: 'alert-triangle' }); return; }
                  setMostrarConfirmReabrir(true);
                }}
                title={existePosteriorFechada ? `Reabra primeiro a medição de ${mesLabel(proximaFechadaPosterior.key)}` : undefined}>
                <Icon name="refresh-cw" size={15} />Reabrir medição
              </button>
            </div>
          )}

          <input
            className="input input-search"
            style={{ width: '100%' }}
            placeholder="Buscar atividade..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />

          <div className="mm-mobile-filters-row">
            <select className="input" value={pavimento} onChange={e => setPavimento(e.target.value)}>
              {pavimentos.map(p => <option key={p} value={p}>{p === 'Todos' ? 'Pavimento: Todos' : p}</option>)}
            </select>
            <select className="input" value={mesRefKey} onChange={e => setMesRefKey(e.target.value)}>
              {months.map(m => {
                const st = statusPorMes[m.key];
                const sufixo = st === 'fechada' ? ' · fechada' : st === 'rascunho' ? ' · aberta' : '';
                return <option key={m.key} value={m.key}>{mesLabel(m.key)}{sufixo}</option>;
              })}
            </select>
          </div>
          {/* Mesmo seletor de nível do desktop (Estrutura) — reaproveita aplicarNivel/
              nivelEstrutura tal como já existem, sem lógica nova. */}
          <div className="mm-mobile-filters-row">
            <select className="input" value={nivelEstrutura} title="Expandir ou recolher a estrutura por nível"
              onChange={e => { const v = e.target.value; if (v !== '') aplicarNivel(Number(v)); }}>
              <option value="" disabled>Estrutura: escolher…</option>
              <option value="0">Expandir tudo</option>
              <option value="1">Recolher tudo</option>
              {Array.from({ length: nivelMax }, (_, i) => i + 1).map(n => (
                <option key={n} value={n}>Nível {n}</option>
              ))}
            </select>
          </div>

          {qtdForaDoMes > 0 && (
            <span className="badge warning" style={{ alignSelf: 'flex-start' }}>
              {qtdForaDoMes} {qtdForaDoMes === 1 ? 'item fora do mês' : 'itens fora do mês'}
            </span>
          )}

          {linhas.length > 0 && (
            <div className="mm-mobile-hint">toque numa etapa para abrir só ela — as outras ficam resumidas em 1 linha</div>
          )}
        </div>

        <div className="mm-mobile-list">
          {linhas.length === 0 ? (
            <div className="mm-mobile-empty">
              {carregando ? (
                <div>Carregando medição…</div>
              ) : !registro ? (
                <>
                  <div>Nenhuma medição aberta para <strong>{mesLabel(mesRefKey)}</strong>.</div>
                  {readOnly ? (
                    <div className="mm-mobile-empty-note">Você não tem permissão para abrir medições.</div>
                  ) : anteriorAberta ? (
                    <div className="mm-mobile-empty-note danger">Feche primeiro a medição de {mesLabel(mesAnterior.key)} para poder abrir esta.</div>
                  ) : anteriorSemReprogramacao ? (
                    <div className="mm-mobile-empty-note danger">Salve a reprogramação de {mesLabel(mesAnterior.key)} antes de abrir esta medição.</div>
                  ) : (
                    <button type="button" className="btn btn-dark" onClick={abrirMedicao} disabled={salvando}>
                      <Icon name="plus" size={15} />{salvando ? 'Abrindo…' : 'Abrir medição'}
                    </button>
                  )}
                </>
              ) : (
                <div>Nenhum item do cronograma agendado para o período com os filtros aplicados.</div>
              )}
            </div>
          ) : (
            linhas.map(l => {
              // Profundidade relativa à etapa de topo (0 = a própria etapa) — cada nível
              // abaixo dela precisa ficar visivelmente menor/mais recuado que o de cima,
              // nunca do tamanho do pai (ex.: uma sub-tarefa dentro de uma etapa não pode
              // parecer do mesmo tamanho da etapa, mesmo se ela própria agrupar tarefas).
              const profundidade = Math.max(0, (l.nivel || 0) - nivelEtapaMobile);
              if (l.tipo === 'grupo') {
                const nivel0 = profundidade === 0;
                return (
                  <button
                    key={'g' + l.id} type="button"
                    className={'mm-etapa' + (nivel0 ? ' mm-etapa-n0' : ' mm-etapa-sub') + (!l.colapsado ? ' open' : '')}
                    style={nivel0
                      ? { borderLeftColor: corPorLinha[l.id] }
                      : { marginLeft: 14 + (profundidade - 1) * 10, borderLeftWidth: Math.max(2, 4 - profundidade), fontSize: Math.max(10.5, 12 - (profundidade - 1)) }
                    }
                    onClick={() => alternarGrupo(l.id)}
                  >
                    <span className="mm-etapa-name">
                      <Icon name="chevron-right" size={nivel0 ? 13 : Math.max(9, 11 - profundidade)} className="mm-etapa-chevron" />
                      {l.descricao}
                    </span>
                    {nivel0 && contagemPorGrupo[l.id] != null && (
                      <span className="mm-etapa-meta">
                        {contagemPorGrupo[l.id]} tarefa{contagemPorGrupo[l.id] === 1 ? '' : 's'}
                      </span>
                    )}
                  </button>
                );
              }
              return (
                <div key={l.id} className={'mm-card' + (l.foraDoMes ? ' fora-do-mes' : '')}
                  style={{ borderLeftColor: corPorLinha[l.id], marginLeft: 14 + Math.max(0, profundidade - 1) * 10 }}>
                  <div className="mm-card-row">
                    <span className="mm-card-nome">{l.descricao}</span>
                    <span className="mm-card-pav">{l.pavimento}</span>
                    <input
                      className="input medicao-input-medido mm-card-input"
                      inputMode="decimal"
                      value={l.percMedido}
                      disabled={bloqueado}
                      aria-label={`Percentual medido de ${l.descricao}`}
                      onChange={e => alterarMedido(l.id, e.target.value)}
                    />
                  </div>
                  {l.foraDoMes && (
                    <div className="mm-card-row">
                      <span className="badge warning" style={{ fontSize: 9.5, padding: '0 5px' }}>fora do mês</span>
                      <button type="button" className="icon-btn-sm"
                        title={l.percMedido > 0 ? 'Zere o % medido antes de remover' : 'Remover tarefa'}
                        onClick={() => tentarRemoverTarefa(l)} disabled={bloqueado}>
                        <Icon name="x" size={11} />
                      </button>
                    </div>
                  )}
                  {notasAbertas.has(l.id) ? (
                    <div className="mm-card-nota-editor">
                      <textarea
                        className="input mm-card-nota-textarea"
                        value={notaDrafts[l.id] ?? ''}
                        disabled={bloqueado}
                        placeholder="Ex.: motivo do atraso, pendência, combinado com o cliente…"
                        aria-label={`Observação de ${l.descricao}`}
                        onChange={e => setNotaDrafts(prev => ({ ...prev, [l.id]: e.target.value }))}
                      />
                      <div className="mm-card-nota-actions">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => fecharNota(l.id)}>Cancelar</button>
                        <button type="button" className="btn btn-dark btn-sm" disabled={bloqueado} onClick={() => salvarNota(l.id)}>Salvar</button>
                      </div>
                    </div>
                  ) : (
                    <button type="button"
                      className={'mm-card-nota-toggle' + (l.observacao ? ' has-nota' : '')}
                      disabled={bloqueado && !l.observacao}
                      onClick={() => abrirNota(l)}>
                      <Icon name={l.observacao ? 'message-square' : 'plus'} size={13} />
                      <span>{l.observacao || 'Adicionar observação'}</span>
                      {l.observacao && <Icon name="chevron-down" size={12} />}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {linhas.length > 0 && (
          <div className="mm-mobile-total">
            <div className="mm-mobile-total-row">
              <span>Total geral · {totais.qtd} atividades</span>
              <span>{fmtPct100(totais.med)}</span>
            </div>
            <div className="mm-mobile-total-row sub">
              <span>exec {fmtPct100(totais.exec)}</span>
              <span>{formatBRL(totais.valor, 2)} → {formatBRL(totais.valorAMedir, 2)}</span>
            </div>
          </div>
        )}

        <div className="mm-mobile-footnote">
          Itens do cronograma agendados para {mesLabel(mesRefKey)}
          {registro?.updated_at ? ` · atualizado em ${new Date(registro.updated_at).toLocaleString('pt-BR')}` : ''}
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

      {mostrarConfirmReabrir && (
        <ModalReabrirMedicao
          mesRefKey={mesRefKey}
          salvando={salvando}
          onClose={() => setMostrarConfirmReabrir(false)}
          onConfirmar={reabrirMedicao}
        />
      )}

      {mostrarConfirmLimpar && (
        <ModalLimparMedicao
          mesRefKey={mesRefKey}
          qtd={itensTrabalho.length}
          salvando={salvando}
          onClose={() => setMostrarConfirmLimpar(false)}
          onConfirmar={limparMedicao}
        />
      )}

      {mostrarConfirmExcluir && (
        <ModalExcluirMedicao
          mesRefKey={mesRefKey}
          salvando={salvando}
          onClose={() => setMostrarConfirmExcluir(false)}
          onConfirmar={excluirMedicao}
        />
      )}

      {pendenciasAbertura && (
        <ModalPendenciasAbertura
          mesRefKey={mesRefKey}
          pendentes={pendenciasAbertura}
          onClose={() => setPendenciasAbertura(null)}
        />
      )}

      {modalIncluirAberto && (
        <ModalIncluirTarefa
          candidatas={candidatasForaDoMes}
          etapas={etapas}
          onClose={() => setModalIncluirAberto(false)}
          onConfirmar={adicionarTarefasManuais}
          mobileView={mobileView}
        />
      )}

      {modalEnviarAberto && (
        <ModalEnviarAvanco
          mesRefKey={mesRefKey}
          pares={paresParaEnviar}
          onClose={() => setModalEnviarAberto(false)}
          onConfirmar={confirmarEnvioAvanco}
        />
      )}
    </>
  );
}
