import React from 'react';
import { Modal } from '../../../../components/Modals';

// Folha só de leitura com o detalhe de uma linha das abas Uso da Tarefa e Curva Física: um resumo e a lista de meses
// com valor (a janela vira folha por baixo na casca, ver mobileFull.css). Substitui o "olho" que o desktop faz rolando
// a tabela: no celular, tocar na linha mostra tudo dela junto, sem precisar achar o mês na grade.
//
// resumo: [{ rotulo, valor, tom? }]   meses: [{ key, rotulo, principal, secundario?, terciario? }]
const FolhaMeses = ({ titulo, subtitulo, resumo = [], tituloMeses = 'Por mês', meses = [], vazio = 'Sem valores nos meses.', onClose }) => (
  <Modal
    title={titulo}
    subtitle={subtitulo}
    onClose={onClose}
    footer={<button type="button" className="btn btn-primary" onClick={onClose}>Fechar</button>}
  >
    {resumo.length > 0 && (
      <dl className="mfs-folha-resumo">
        {resumo.map((r, i) => (
          <div key={i} className="mfs-folha-resumo-item">
            <dt>{r.rotulo}</dt>
            <dd className={r.tom ? 'mfs-tom-' + r.tom : undefined}>{r.valor}</dd>
          </div>
        ))}
      </dl>
    )}
    <div className="mfs-folha-titulo">{tituloMeses}</div>
    {meses.length === 0 ? (
      <div className="mfs-aviso">{vazio}</div>
    ) : (
      <ul className="mfs-folha-meses">
        {meses.map(m => (
          <li key={m.key} className="mfs-folha-mes">
            <span className="mfs-folha-mes-nome">{m.rotulo}</span>
            <span className="mfs-folha-mes-valores">
              <strong>{m.principal}</strong>
              {m.secundario && <span>{m.secundario}</span>}
              {m.terciario && <span>{m.terciario}</span>}
            </span>
          </li>
        ))}
      </ul>
    )}
  </Modal>
);

export { FolhaMeses };
