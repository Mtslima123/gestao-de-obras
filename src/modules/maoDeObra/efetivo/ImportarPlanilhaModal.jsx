import React from 'react';
import { Modal } from '../../../components/Modals';
import { T } from './tokens';

const MAX_LINHAS = 8;

const Secao = ({ titulo, tom, linhas }) => {
  if (!linhas?.length) return null;
  const cor = tom === 'erro' ? T.vermelho : T.laranja;
  const fundo = tom === 'erro' ? T.vermelhoBg : T.laranjaBg;
  return (
    <div style={{ background: fundo, borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <b style={{ fontSize: 13, color: cor }}>{titulo} ({linhas.length})</b>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: T.texto, lineHeight: 1.45 }}>
        {linhas.slice(0, MAX_LINHAS).map((l, i) => <li key={i}>{l}</li>)}
        {linhas.length > MAX_LINHAS && <li>e mais {linhas.length - MAX_LINHAS}…</li>}
      </ul>
    </div>
  );
};

// Conferência antes de importar uma planilha: o que foi lido, o que não casou e os avisos.
// Nada é gravado até o usuário confirmar. `secoes`: [{ titulo, tom: 'aviso' | 'erro', linhas }].
export function ImportarPlanilhaModal({ titulo, nomeArquivo, resumo, substitui, secoes, textoConfirmar = 'Importar', onConfirmar, onClose }) {
  return (
    <Modal
      title={titulo}
      size="lg"
      onClose={onClose}
      footer={<>
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn btn-primary" onClick={onConfirmar}>{textoConfirmar}</button>
      </>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 13, color: T.texto2 }}>Arquivo: <b style={{ color: T.texto, fontWeight: 600 }}>{nomeArquivo}</b></div>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{resumo}</div>
        {secoes.map((s) => <Secao key={s.titulo} {...s} />)}
        <div style={{ fontSize: 13, color: T.texto2 }}>{substitui}</div>
      </div>
    </Modal>
  );
}
