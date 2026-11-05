import React from 'react';
import { Icon } from '../../../../components/Icons';
import { Modal } from '../../../../components/Modals';
import { STATUS_UI } from '../../../maoDeObra/efetivo/regras';
import { corUi } from '../../../maoDeObra/efetivo/tokens';

// Peças pequenas que as quatro telas de Mão de Obra no celular dividem. Ficam num arquivo só para não repetir o mesmo
// bloco de indicadores, pílula e seletor segmentado em cada aba.

// Cor e rótulo de um status ('ok' | 'acima' | 'sem' | 'pend'): mesmas cores do desktop, já em variáveis do app.
export const okUi = (stt) => { const u = STATUS_UI[stt]; return { cor: corUi(u.cor), fundo: corUi(u.fundo), rotulo: u.rotulo }; };

// Indicadores em 2 colunas. itens: [{ rotulo, valor, cor?, detalhe? }]
export const Kpis = ({ itens }) => (
  <div className="mfs-mo-kpis">
    {itens.map((k) => (
      <div key={k.rotulo} className="mfs-mo-kpi">
        <span className="mfs-mo-kpi-rotulo">{k.rotulo}</span>
        <strong className="mfs-mo-kpi-valor" style={k.cor ? { color: k.cor } : undefined}>{k.valor}</strong>
        {k.detalhe && <span className="mfs-mo-kpi-detalhe">{k.detalhe}</span>}
      </div>
    ))}
  </div>
);

export const Pilula = ({ cor, fundo, ponto = false, children }) => (
  <span className="mfs-mo-pilula" style={{ color: cor, background: fundo }}>
    {ponto && <i style={{ background: cor }} />}{children}
  </span>
);

// Seletor de duas ou três opções lado a lado (mesmo visual do .mfs-segmentado das outras telas). opcoes: [[id, texto]]
export const Segmentado = ({ rotulo, opcoes, valor, onChange }) => (
  <div className="mfs-segmentado mfs-mo-seg" role="group" aria-label={rotulo}>
    {opcoes.map(([id, texto]) => (
      <button key={id} type="button" aria-pressed={valor === id} onClick={() => onChange(id)}>{texto}</button>
    ))}
  </div>
);

// Folha com a lista de ações de uma tela (o que no desktop são vários botões soltos no cabeçalho do cartão).
// acoes: [{ chave, rotulo, detalhe?, icone, onClick?, disabled?, perigo?, arquivo?: { accept, onChange } }]. A ação com
// `arquivo` é um seletor de arquivo: a folha só fecha DEPOIS de entregar o arquivo (se saísse do ar antes, o navegador
// podia perder a escolha).
export const FolhaDeAcoes = ({ titulo = 'Ações', acoes, onClose }) => (
  <Modal title={titulo} size="sm" onClose={onClose}>
    <div className="mfs-mo-acoes">
      {acoes.map((a) => {
        const conteudo = (
          <>
            <Icon name={a.icone} size={18} stroke={2.2} />
            <span className="mfs-mo-acao-rotulo">{a.rotulo}</span>
            {a.detalhe && <small>{a.detalhe}</small>}
          </>
        );
        const classe = 'mfs-mo-acao' + (a.perigo ? ' perigo' : '') + (a.disabled ? ' desabilitada' : '');
        if (a.arquivo) {
          return (
            <label key={a.chave} className={classe}>
              {conteudo}
              <input type="file" accept={a.arquivo.accept} hidden disabled={a.disabled}
                onChange={(e) => { a.arquivo.onChange(e); onClose(); }} />
            </label>
          );
        }
        return (
          <button key={a.chave} type="button" className={classe} disabled={a.disabled} onClick={() => { onClose(); a.onClick?.(); }}>
            {conteudo}
          </button>
        );
      })}
    </div>
  </Modal>
);
