import React from 'react';
import { Icon } from '../../../../components/Icons';
import { T } from '../../../maoDeObra/efetivo/tokens';
import { rotuloMes, subtituloDoPainel } from './maoDeObraMobilePure';
import { Pilula } from './maoDeObraMobileUi';

const dataCurta = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('pt-BR') : '';
};

// Situação de UMA quinzena de uma obra. OK só quando lançada; rascunho (há dados salvos) fica à parte para não parecer
// feito. Mesmas quatro situações do painel do desktop.
const Quinzena = ({ rotulo, q }) => {
  let situacao;
  if (q.estado === 'lancada') {
    const detalhe = [dataCurta(q.lancadaEm), q.lancadaPor && `por ${q.lancadaPor}`].filter(Boolean).join(' ');
    situacao = (
      <>
        <Pilula cor={T.verde} fundo={T.verdeBg}><Icon name="check" size={13} stroke={2.4} />OK</Pilula>
        {detalhe && <small>{detalhe}</small>}
      </>
    );
  } else if (q.estado === 'rascunho') {
    situacao = <Pilula cor={T.laranja} fundo={T.laranjaBg}>Rascunho</Pilula>;
  } else if (q.estado === 'fora') {
    situacao = <span className="mfs-mo-fora" title="Mês fora do período da obra">—</span>;
  } else {
    situacao = <Pilula cor={T.texto2} fundo={T.faixa}>Pendente</Pilula>;
  }
  return (
    <div className="mfs-mo-quinz">
      <span className="mfs-mo-quinz-rotulo">{rotulo}</span>
      <div className="mfs-mo-quinz-situacao">{situacao}</div>
    </div>
  );
};

// Painel de apropriações no celular: uma obra por cartão, com a 1ª e a 2ª apropriação do mês escolhido. Quem carrega e
// filtra é o PainelTab (mesmos dados e mesmas regras do desktop); aqui só se apresenta.
const PainelMobile = ({
  carregando = false, opcoesMes = [], mesAbsSel, onMes, fim, onAtualizar,
  busca = '', onBusca, situacao = 'todas', onSituacao, resumo, doPeriodo = 0, todasVazio = false, visiveis = [],
}) => {
  const chip = (id, rotulo, n) => (
    <button key={id} type="button" className="mfs-mo-chip" aria-pressed={situacao === id} onClick={() => onSituacao?.(id)}>{rotulo} ({n})</button>
  );

  return (
    <div className="mfs-mo-secao">
      <div>
        <h2 className="mfs-mo-titulo">Apropriações por obra</h2>
        <div className="mfs-mo-sub">{subtituloDoPainel({ carregando, doPeriodo, completas: resumo.completas, fora: resumo.fora })}</div>
      </div>

      <div className="mfs-mo-periodo">
        <label className="mfs-mo-campo"><span>Mês</span>
          <select className="input mfs-select" value={mesAbsSel} onChange={(e) => onMes?.(+e.target.value)}>
            {opcoesMes.map((m) => <option key={m.abs} value={m.abs}>{rotuloMes(m)}</option>)}
          </select>
        </label>
        <button type="button" className="btn mfs-mo-meses" onClick={onAtualizar} disabled={carregando}>
          <Icon name="refresh-cw" size={16} stroke={2.2} />Atualizar
        </button>
      </div>

      <input type="search" className="input mfs-busca" value={busca} onChange={(e) => onBusca?.(e.target.value)} placeholder="Buscar obra..." aria-label="Buscar obra" />
      <div className="mfs-mo-chips">
        {chip('todas', 'Todas', resumo.total)}
        {chip('pendentes', 'Pendentes', resumo.pendentes)}
        {chip('completas', 'Completas', resumo.completas)}
      </div>

      {carregando ? (
        <div className="content-loading"><span className="spinner" /></div>
      ) : visiveis.length === 0 ? (
        <div className="mfs-aviso mfs-mo-vazio">{todasVazio ? 'Nenhuma obra em andamento.' : 'Nenhuma obra encontrada com esses filtros.'}</div>
      ) : (
        <ul className="mfs-mo-lista">
          {visiveis.map((r) => (
            <li key={r.obraId} className="mfs-mo-cartao" style={{ opacity: r.situacao === 'fora' ? 0.6 : 1 }}>
              <strong className="mfs-mo-cartao-nome">{r.rotulo}</strong>
              <Quinzena rotulo="1ª (01 a 15)" q={r.q1} />
              <Quinzena rotulo={`2ª (16 a ${fim})`} q={r.q2} />
            </li>
          ))}
        </ul>
      )}

      <div className="mfs-mo-legenda">
        <span><b style={{ color: T.verde }}>OK</b> apropriação lançada</span>
        <span><b style={{ color: T.laranja }}>Rascunho</b> dados salvos, ainda não lançada</span>
        <span><b>Pendente</b> nada salvo</span>
        <span><b>—</b> mês fora do período da obra</span>
      </div>
    </div>
  );
};

export { PainelMobile };
