import React from 'react';
import { Modal } from '../../../components/Modals';
import { T } from './tokens';
import { efetivoService } from './efetivo.service';
import { habilitadosRemoviveis, mesesParaHabilitar } from './efetivoStore';

const rotulo = (m) => m.label.replace('/', '/20');
const campo = { background: 'var(--surface)', color: T.texto, font: 'inherit', fontSize: 13, padding: '7px 10px', border: `1px solid ${T.bordaInput}`, borderRadius: 8, minWidth: 160 };

// Só admin. Libera um mês da obra para apropriação (além do mês atual e dos que já têm
// apropriação) e remove habilitações que ainda não foram usadas. A trava de verdade é do banco.
export function MesesApropriacaoModal({ s, meses, mesAtualAbs, recarregar, toast, erro, onHabilitado, onClose }) {
  const opcoes = mesesParaHabilitar(s, meses, mesAtualAbs);
  const removiveis = habilitadosRemoviveis(s, meses);
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

  return (
    <Modal
      title="Habilitar mês para apropriação"
      size="sm"
      onClose={onClose}
      footer={<>
        <button type="button" className="btn btn-ghost" onClick={onClose}>Fechar</button>
        <button type="button" className="btn btn-primary" disabled={ocupado || !alvo} onClick={habilitar}>Habilitar</button>
      </>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ margin: 0, lineHeight: 1.5, fontSize: 13.5, color: T.texto2 }}>
          A lista de períodos da Apropriação mostra o mês atual, os meses que já têm apropriação e os que você habilitar aqui.
        </p>
        {opcoes.length
          ? (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: T.texto2 }}>Mês
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
              <div key={m.abs} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderTop: `1px solid ${T.linha}`, fontSize: 13.5 }}>
                <span>{rotulo(m)}</span>
                <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={() => remover(m)}>Remover</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
