import React from 'react';
import { Modal } from '../../../components/Modals';
import { T, pill } from './tokens';
import { efetivoService } from './efetivo.service';
import { habilitadosRemoviveis, mesFechado, mesesFechaveis, mesesParaHabilitar } from './efetivoStore';

const rotulo = (m) => m.label.replace('/', '/20');
const campo = { background: 'var(--surface)', color: T.texto, font: 'inherit', fontSize: 13, padding: '7px 10px', border: `1px solid ${T.bordaInput}`, borderRadius: 8, minWidth: 160 };
const linhaMes = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderTop: `1px solid ${T.linha}`, fontSize: 13.5 };

// Só admin. Libera um mês da obra para apropriação (além do mês atual e dos que já têm
// apropriação), remove habilitações que ainda não foram usadas e fecha/reabre meses que já têm
// apropriação (mês fechado é só consulta). A trava de verdade é do banco.
export function MesesApropriacaoModal({ s, meses, mesAtualAbs, recarregar, toast, erro, onHabilitado, onClose }) {
  const opcoes = mesesParaHabilitar(s, meses, mesAtualAbs);
  const removiveis = habilitadosRemoviveis(s, meses);
  const fechaveis = mesesFechaveis(s);
  const [escolhido, setEscolhido] = React.useState('');
  const [ocupado, setOcupado] = React.useState(false);
  const alvo = opcoes.find((m) => String(m.abs) === escolhido) ?? opcoes[0];

  const executar = async (chamada, m, msg, depois) => {
    if (ocupado) return;
    setOcupado(true);
    try {
      const { error } = await chamada(s.obra.id, m.ano, m.mes);
      if (error) return erro(error.mensagem || error.message);
      await recarregar();
      toast(msg);
      depois?.();
    } finally {
      setOcupado(false);
    }
  };

  const habilitar = () => alvo && executar(efetivoService.habilitarMes, alvo, `${rotulo(alvo)} habilitado para apropriação.`, () => { onHabilitado(alvo.abs); onClose(); });
  const remover = (m) => executar(efetivoService.desabilitarMes, m, `${rotulo(m)} removido da lista de apropriação.`);
  const fechar = (m) => executar(efetivoService.fecharMes, m, `${rotulo(m)} fechado. Só consulta até ser reaberto.`);
  const reabrir = (m) => executar(efetivoService.reabrirMes, m, `${rotulo(m)} reaberto para edição.`);

  return (
    <Modal
      title="Meses da apropriação"
      size="sm"
      onClose={onClose}
      footer={<>
        <button type="button" className="btn btn-ghost" onClick={onClose}>Concluir</button>
        <button type="button" className="btn btn-primary" disabled={ocupado || !alvo} onClick={habilitar}>Habilitar</button>
      </>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ margin: 0, lineHeight: 1.5, fontSize: 13.5, color: T.texto2 }}>
          A lista de períodos da Apropriação mostra o mês atual, os meses que já têm apropriação e os que você habilitar aqui. Mês fechado continua na lista, só para consulta.
        </p>
        {opcoes.length
          ? (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: T.texto2 }}>Mês a habilitar
              <select value={alvo ? String(alvo.abs) : ''} onChange={(e) => setEscolhido(e.target.value)} disabled={ocupado} style={campo}>
                {opcoes.map((m) => <option key={m.abs} value={m.abs}>{rotulo(m)}</option>)}
              </select>
            </label>
          )
          : <span style={{ fontSize: 13.5 }}>Todos os meses da obra já estão disponíveis para apropriação.</span>}
        {removiveis.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <b style={{ fontSize: 13 }}>Habilitados e ainda sem apropriação</b>
            {removiveis.map((m) => (
              <div key={m.abs} style={linhaMes}>
                <span>{rotulo(m)}</span>
                <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={() => remover(m)}>Remover</button>
              </div>
            ))}
          </div>
        )}
        {fechaveis.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <b style={{ fontSize: 13 }}>Meses com apropriação</b>
            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
              {fechaveis.map((m) => {
                const fechado = mesFechado(s, m);
                return (
                  <div key={m.abs} style={linhaMes}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {rotulo(m)}
                      <span style={fechado ? pill(T.texto2, T.faixa) : pill(T.verde, T.verdeBg)}>{fechado ? 'Fechado' : 'Aberto'}</span>
                    </span>
                    <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={() => (fechado ? reabrir(m) : fechar(m))}>
                      {fechado ? 'Reabrir mês' : 'Fechar mês'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
