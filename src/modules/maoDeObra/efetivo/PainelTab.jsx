import React from 'react';
import { Icon } from '../../../components/Icons';
import { T, card, h2, sub, btn, th, td, pill } from './tokens';
import { efetivoService } from './efetivo.service';
import { mesDeAbs, ultimoDia } from './efetivoStore';
import { filtrarPainel, mesesDoPainel, montarPainel, resumoPainel } from './painelApropriacaoPure';

const campo = { font: 'inherit', fontSize: 13, color: T.texto, padding: '7px 10px', border: `1px solid ${T.bordaInput}`, borderRadius: 8, background: 'var(--surface)' };

const fmtData = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('pt-BR') : '';
};

// Uma quinzena de uma obra. OK só quando lançada; rascunho (há dados salvos) fica à parte para
// não parecer feito.
const Celula = ({ q }) => {
  if (q.estado === 'lancada') {
    const detalhe = [fmtData(q.lancadaEm), q.lancadaPor && `por ${q.lancadaPor}`].filter(Boolean).join(' ');
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        <span style={pill(T.verde, T.verdeBg)}><Icon name="check" size={13} stroke={2.4} />OK</span>
        {detalhe && <span style={{ fontSize: 11.5, color: T.texto2 }}>{detalhe}</span>}
      </div>
    );
  }
  if (q.estado === 'rascunho') return <span style={pill(T.laranja, T.laranjaBg)} title="Há dados salvos, mas a apropriação ainda não foi lançada">Rascunho</span>;
  if (q.estado === 'fora') return <span style={{ color: T.texto3 }} title="Mês fora do período da obra">—</span>;
  return <span style={pill(T.texto2, T.faixa)}>Pendente</span>;
};

// Mão de Obra > Efetivo > Painel: todas as obras do usuário, com a 1ª e a 2ª apropriação do mês
// escolhido. `obras` já vem filtrada por permissão (obrasVisiveis do App); o banco filtra de novo
// as linhas (admin lê todas, os demais só as obras liberadas). Não depende da obra aberta no
// Efetivo: carrega por conta própria.
export function PainelTab({ obras, mesAtualAbs }) {
  const [mesAbsSel, setMesAbsSel] = React.useState(mesAtualAbs);
  const [configs, setConfigs] = React.useState([]);
  const [linhas, setLinhas] = React.useState(null);
  const [falha, setFalha] = React.useState(null);
  const [situacao, setSituacao] = React.useState('todas');
  const [busca, setBusca] = React.useState('');
  const [mostrarConcluidas, setMostrarConcluidas] = React.useState(false);
  const pedido = React.useRef(0);

  const mesSel = React.useMemo(() => mesDeAbs(mesAbsSel), [mesAbsSel]);

  const carregar = React.useCallback(async (ano, mes) => {
    const n = ++pedido.current;
    setFalha(null);
    setLinhas(null);
    const [rl, rc] = await Promise.all([efetivoService.listarApropriacoesDoMes(ano, mes), efetivoService.listarConfigsObras()]);
    if (n !== pedido.current) return; // resposta de um mês anterior
    const erro = rl.error || rc.error;
    if (erro) { setFalha(erro.mensagem || erro.message); return; }
    setConfigs(rc.data);
    setLinhas(rl.data);
  }, []);
  React.useEffect(() => { carregar(mesSel.ano, mesSel.mes); }, [mesSel, carregar]);

  // O início das obras vem do que acabou de carregar e pode encurtar a lista: o mês escolhido
  // nunca some do seletor.
  const opcoesMes = React.useMemo(() => {
    const ms = mesesDoPainel({ obras, configs, mesAtualAbs });
    return ms.some((m) => m.abs === mesAbsSel) ? ms : [...ms, mesSel].sort((a, b) => b.abs - a.abs);
  }, [obras, configs, mesAtualAbs, mesAbsSel, mesSel]);

  const todas = React.useMemo(() => (linhas ? montarPainel({ obras, linhas, configs, mes: mesSel }) : []), [obras, linhas, configs, mesSel]);
  // Os números dos filtros respeitam a busca e as concluídas, mas não a situação escolhida (senão
  // "Completas (0)" apareceria ao clicar em "Pendentes").
  const resumo = React.useMemo(() => resumoPainel(filtrarPainel(todas, { busca, mostrarConcluidas })), [todas, busca, mostrarConcluidas]);
  const visiveis = React.useMemo(() => filtrarPainel(todas, { situacao, busca, mostrarConcluidas }), [todas, situacao, busca, mostrarConcluidas]);

  const doPeriodo = resumo.total - resumo.fora;
  const fim = ultimoDia(mesSel.ano, mesSel.mes);

  const chip = (id, rotulo, n) => (
    <button key={id} type="button" aria-pressed={situacao === id} onClick={() => setSituacao(id)}
      style={{ font: 'inherit', fontSize: 13, fontWeight: 600, padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
        border: `1px solid ${situacao === id ? T.azul : T.bordaInput}`, background: situacao === id ? T.azul : 'var(--surface)', color: situacao === id ? '#fff' : T.texto2 }}>
      {rotulo} ({n})
    </button>
  );

  if (falha) {
    return (
      <div style={{ ...card, padding: 24, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
        <span style={{ color: T.vermelho, fontSize: 14 }}>{falha}</span>
        <button type="button" className="btn btn-ghost" onClick={() => carregar(mesSel.ano, mesSel.mes)}>Tentar de novo</button>
      </div>
    );
  }

  return (
    <div style={{ ...card, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={h2}>Apropriações por obra</h2>
          <div style={sub}>
            {!linhas ? 'Carregando...'
              : doPeriodo === 0 ? 'Nenhuma obra com este mês no período.'
              : `${resumo.completas} de ${doPeriodo} obra${doPeriodo !== 1 ? 's' : ''} com as duas apropriações lançadas${resumo.fora ? ` · ${resumo.fora} fora do período` : ''}`}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: T.texto2 }}>Mês
            <select value={mesAbsSel} onChange={(e) => setMesAbsSel(+e.target.value)} style={{ ...campo, fontWeight: 600, minWidth: 130 }}>
              {opcoesMes.map((m) => <option key={m.abs} value={m.abs}>{m.label.replace('/', '/20')}</option>)}
            </select>
          </label>
          <button type="button" style={{ ...btn, padding: '8px 12px' }} onClick={() => carregar(mesSel.ano, mesSel.mes)} disabled={!linhas}>
            Atualizar
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar obra..." aria-label="Buscar obra"
          style={{ ...campo, minWidth: 220 }} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {chip('todas', 'Todas', resumo.total)}
          {chip('pendentes', 'Pendentes', resumo.pendentes)}
          {chip('completas', 'Completas', resumo.completas)}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: T.texto2, cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={mostrarConcluidas} onChange={(e) => setMostrarConcluidas(e.target.checked)} style={{ accentColor: 'var(--brand)', cursor: 'pointer' }} />
          Mostrar obras concluídas
        </label>
      </div>

      {!linhas ? (
        <div className="content-loading"><span className="spinner" /></div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${T.borda}` }}>
                <th scope="col" style={{ ...th, textAlign: 'left', padding: '8px 10px' }}>Obra</th>
                <th scope="col" style={{ ...th, width: '28%' }}>1ª Apropriação (01 a 15)</th>
                <th scope="col" style={{ ...th, width: '28%' }}>2ª Apropriação (16 a {fim})</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.length === 0 ? (
                <tr><td colSpan={3} style={{ ...td, padding: '40px 10px', color: T.texto2 }}>
                  {todas.length === 0 ? 'Nenhuma obra liberada.' : 'Nenhuma obra encontrada com esses filtros.'}
                </td></tr>
              ) : visiveis.map((r) => (
                <tr key={r.obraId} style={{ opacity: r.situacao === 'fora' ? 0.6 : 1 }}>
                  <td style={{ ...td, textAlign: 'left', padding: '10px', fontWeight: 600 }}>
                    {r.rotulo}
                    {r.concluida && <span style={{ ...pill(T.texto2, T.faixa), marginLeft: 8, fontSize: 11, padding: '2px 8px' }}>Concluída</span>}
                  </td>
                  <td style={{ ...td, padding: '10px' }}><Celula q={r.q1} /></td>
                  <td style={{ ...td, padding: '10px' }}><Celula q={r.q2} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ ...sub, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <span><b style={{ color: T.verde }}>OK</b> apropriação lançada</span>
        <span><b style={{ color: T.laranja }}>Rascunho</b> dados salvos, ainda não lançada</span>
        <span><b>Pendente</b> nada salvo</span>
        <span><b>—</b> mês fora do período da obra</span>
      </div>
    </div>
  );
}
