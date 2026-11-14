import React from 'react';
import { Icon } from '../../../../components/Icons';
import { janelaDeLinhas } from './linhaDoTempoPure';

export const ALTURA_CABECALHO_MATRIZ = 36;
export const ALTURA_RODAPE_MATRIZ = 34;

// Matriz com rolagem nos dois sentidos para as abas Uso da Tarefa e Curva Física: o cabeçalho de colunas fica fixo em
// cima, a coluna de rótulos fica fixa à esquerda e as linhas de totais ficam coladas embaixo (tudo sticky dentro da
// própria área, sem sincronizar rolagem). Só as linhas visíveis são desenhadas. É só apresentação: quem monta as linhas
// e os textos é a tela que usa.
//
// colunas: [{ id, rotulo, w }]  linhas/rodape: [{ id, rotulo, wbs?, nivel?, grupo?, fundo?, faixa?, temFilhos?, aberto?,
//   celulas: { [colunaId]: { texto, calor?, tom?, forte? } } }]
const MatrizMobile = ({
  rotuloDoCanto = 'Tarefa', larguraRotulo = 130, colunas = [], linhas = [], rodape = [], altura,
  alturaLinha = 44, colunaAtiva = null, linhaAbertaId = null, aoTocarLinha, aoAlternar, nomeAcessivel = 'Tabela', vazio,
}) => {
  const rolagemRef = React.useRef(null);
  const [janela, setJanela] = React.useState({ de: 0, ate: 40 });

  const posicoes = React.useMemo(() => {
    const mapa = {};
    let x = 0;
    colunas.forEach(c => { mapa[c.id] = x; x += c.w; });
    return { mapa, total: x };
  }, [colunas]);
  const larguraTotal = larguraRotulo + posicoes.total;
  const alturaVisivel = Math.max(0, altura - ALTURA_CABECALHO_MATRIZ - rodape.length * ALTURA_RODAPE_MATRIZ);

  const recalcular = React.useCallback(() => {
    const el = rolagemRef.current;
    const j = janelaDeLinhas({ rolagemY: el ? el.scrollTop : 0, alturaVisivel, total: linhas.length, alturaLinha });
    setJanela(a => (a.de === j.de && a.ate === j.ate ? a : j));
  }, [alturaVisivel, linhas.length, alturaLinha]);
  React.useEffect(() => { recalcular(); }, [recalcular]);

  // A coluna ativa (mês de referência) vem para a área visível ao abrir e quando muda: fica no centro da parte que
  // sobra ao lado da coluna de rótulos, a não ser que já esteja toda à vista.
  React.useLayoutEffect(() => {
    const el = rolagemRef.current;
    const x = colunaAtiva != null ? posicoes.mapa[colunaAtiva] : undefined;
    if (!el || x == null) return;
    const w = colunas.find(c => c.id === colunaAtiva)?.w || 0;
    const esquerda = el.scrollLeft;
    const direita = esquerda + el.clientWidth - larguraRotulo;
    if (x >= esquerda && x + w <= direita) return;
    el.scrollLeft = Math.max(0, Math.round(x + w / 2 - (el.clientWidth - larguraRotulo) / 2));
  }, [colunaAtiva]); // eslint-disable-line react-hooks/exhaustive-deps

  const celulas = (l) => colunas.map(c => {
    const cel = l.celulas?.[c.id];
    const cls = 'mfs-mx-celula'
      + (cel?.calor ? ' calor' : '')
      + (cel?.forte ? ' forte' : '')
      + (cel?.tom ? ' mfs-tom-' + cel.tom : '')
      + (c.id === colunaAtiva ? ' ativa' : '');
    return <span key={c.id} className={cls} style={{ width: c.w }}>{cel?.texto ?? ''}</span>;
  });

  const rotulo = (l, comAcao) => (
    <div className={'mfs-mx-rotulo' + (l.faixa ? ' faixa-' + l.faixa : '')} style={{ width: larguraRotulo, paddingLeft: 4 + Math.min(l.nivel || 0, 4) * 8 }}>
      {comAcao && aoAlternar ? (
        l.temFilhos ? (
          <button
            type="button" className="mfs-lt-chevron" aria-expanded={l.aberto}
            aria-label={`${l.aberto ? 'Recolher' : 'Expandir'} ${l.rotulo}`}
            onClick={(ev) => { ev.stopPropagation(); aoAlternar(l); }}
          >
            <Icon name={l.aberto ? 'chevron-down' : 'chevron-right'} size={15} />
          </button>
        ) : <span className="mfs-lt-chevron vazio" aria-hidden="true" />
      ) : null}
      {comAcao && aoTocarLinha ? (
        <button type="button" className="mfs-lt-nome-botao" aria-label={`${l.rotulo}. Abrir detalhes`}>
          <span className="mfs-lt-nome">{l.wbs ? <><span className="mono mfs-lt-wbs">{l.wbs}</span>{' '}</> : null}{l.rotulo}</span>
        </button>
      ) : (
        <span className="mfs-lt-nome-botao"><span className="mfs-lt-nome">{l.wbs ? <><span className="mono mfs-lt-wbs">{l.wbs}</span>{' '}</> : null}{l.rotulo}</span></span>
      )}
    </div>
  );

  if (!linhas.length && vazio) return <div className="card"><div className="card-body mfs-aviso">{vazio}</div></div>;

  const visiveis = linhas.slice(janela.de, janela.ate);
  return (
    <div className="mfs-mx" ref={rolagemRef} onScroll={recalcular} style={{ height: altura }} tabIndex={0} role="region" aria-label={nomeAcessivel}>
      <div className="mfs-mx-conteudo" style={{ width: larguraTotal, '--rotulo-w': larguraRotulo + 'px' }}>
        <div className="mfs-mx-cabecalho" style={{ height: ALTURA_CABECALHO_MATRIZ }}>
          <div className="mfs-mx-canto" style={{ width: larguraRotulo }}>{rotuloDoCanto}</div>
          {colunas.map(c => (
            <span key={c.id} className={'mfs-mx-cab-celula' + (c.id === colunaAtiva ? ' ativa' : '')} style={{ width: c.w }}>{c.rotulo}</span>
          ))}
        </div>

        <div className="mfs-mx-corpo" style={{ height: linhas.length * alturaLinha }}>
          {visiveis.map((l, k) => {
            const i = janela.de + k;
            return (
              <div
                key={l.id}
                className={'mfs-mx-linha' + (l.grupo ? ' grupo' : '') + (l.id === linhaAbertaId ? ' aberta' : '') + (aoTocarLinha ? ' toque' : '')}
                style={{ top: i * alturaLinha, height: alturaLinha, width: larguraTotal, background: l.fundo || undefined }}
                onClick={aoTocarLinha ? () => aoTocarLinha(l) : undefined}
              >
                {rotulo(l, true)}
                {celulas(l)}
              </div>
            );
          })}
        </div>

        {rodape.length > 0 && (
          <div className="mfs-mx-rodape" style={{ width: larguraTotal }}>
            {rodape.map(l => (
              <div key={l.id} className="mfs-mx-linha rodape" style={{ height: ALTURA_RODAPE_MATRIZ, width: larguraTotal }}>
                {rotulo(l, false)}
                {celulas(l)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export { MatrizMobile };
