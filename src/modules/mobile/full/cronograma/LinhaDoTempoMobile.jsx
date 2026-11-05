import React from 'react';
import { Icon } from '../../../../components/Icons';
import { todayOffset } from '../../../cronograma/cronogramaDateUtils';
import {
  FILTROS_DE_SITUACAO, chaveDeSituacao, rotuloDeSituacao, linhasDaLista, idsDeGrupos, expandidosIniciais, formatarPercentual,
} from './cronogramaMobilePure';
import { FolhaDaTarefaAberta } from './FolhaTarefa';
import {
  ZOOMS_DA_LINHA, ZOOM_PADRAO, ALTURA_LINHA, ALTURA_CABECALHO, larguraDoRotulo, caminhoCritico, idsEmConflito,
  escalaDaLinhaDoTempo, geometriaDaBarra, geometriaDaBase, cabecalhoDaEscala, feriadosNaJanela, xDeHoje, janelaDeLinhas,
  rolagemParaOffset, offsetInicialDaRolagem,
} from './linhaDoTempoPure';

const CHAVE_ZOOM = 'mfs_lt_zoom';
// Altura reservada para a legenda sob o gráfico (28px de legenda + 8px de espaço entre os blocos).
const ALTURA_LEGENDA = 36;
const ALTURA_MINIMA = 260;
const ALTURA_MINIMA_PAISAGEM = 200;

const lerZoom = () => {
  try {
    const z = sessionStorage.getItem(CHAVE_ZOOM);
    return ZOOMS_DA_LINHA.some(x => x.id === z) ? z : ZOOM_PADRAO;
  } catch { return ZOOM_PADRAO; }
};

// Linha do tempo (o Gantt) do Cronograma na casca mobile. Não é o Gantt do desktop espremido: a coluna de tarefas e o
// cabeçalho de datas ficam fixos numa área que rola nos dois sentidos, as linhas têm 44px de altura (alvo de toque) e
// só as visíveis são desenhadas. Arrastar barra não existe aqui: tocar na linha abre a folha de edição, onde o início
// e a duração se alteram. Dados e gravação são os do CronogramaFull (`onCommit` é o `commit` dele).
const LinhaDoTempoMobile = ({
  etapas, onCommit, readOnly, wbsMap, groupVals, succMap, feriadosCfg,
  baselines = [], reprogramacoes = [], blVisivelId = null, onSelectBaseline, baselineEtapas = null,
  undo, redo, canUndo, canRedo,
  // Uso só para consultar (Obra detalhe): sem Desfazer e Refazer, e a área pode pedir mais altura mínima.
  semEdicao = false, alturaMinima = ALTURA_MINIMA,
}) => {
  const [zoomId, setZoomId] = React.useState(lerZoom);
  const [critico, setCritico] = React.useState(false);
  const [expandidos, setExpandidos] = React.useState(() => expandidosIniciais(etapas));
  const [texto, setTexto] = React.useState('');
  const [filtro, setFiltro] = React.useState('todas');
  const [filtrosAbertos, setFiltrosAbertos] = React.useState(false);
  const [abertaId, setAbertaId] = React.useState(null);
  const [dim, setDim] = React.useState({ w: 0 });
  const [altura, setAltura] = React.useState(420);
  const [janela, setJanela] = React.useState({ de: 0, ate: 40 });

  const rolagemRef = React.useRef(null);
  const areaRef = React.useRef(null);
  const controlesRef = React.useRef(null);
  const centroPendenteRef = React.useRef(null);
  const abriuRef = React.useRef(false);

  const filtrando = !!texto.trim() || filtro !== 'todas';
  const linhas = React.useMemo(
    () => linhasDaLista({ etapas, wbsMap, expandidos, texto, filtro }),
    [etapas, wbsMap, expandidos, texto, filtro],
  );

  const rotuloW = larguraDoRotulo(dim.w || (typeof window !== 'undefined' ? window.innerWidth : 0));
  const larguraGrafico = Math.max(0, dim.w - rotuloW);
  const escala = React.useMemo(
    () => escalaDaLinhaDoTempo({ etapas, groupVals, baselineEtapas, zoomId, larguraGrafico }),
    [etapas, groupVals, baselineEtapas, zoomId, larguraGrafico],
  );
  const cab = React.useMemo(() => cabecalhoDaEscala(escala), [escala]);
  const feriados = React.useMemo(() => feriadosNaJanela(feriadosCfg, escala), [feriadosCfg, escala]);
  const hojeX = xDeHoje(escala);
  const criticos = React.useMemo(() => (critico ? caminhoCritico(etapas) : null), [critico, etapas]);
  const conflitos = React.useMemo(() => idsEmConflito(etapas), [etapas]);
  const blMap = React.useMemo(() => (baselineEtapas ? new Map(baselineEtapas.map(e => [e.id, e])) : null), [baselineEtapas]);
  const baseNome = blVisivelId
    ? (baselines.find(b => b.id === blVisivelId)?.nome || reprogramacoes.find(r => r.id === blVisivelId)?.nome || '')
    : '';

  // ---- Medidas: largura da área que rola e altura que sobra na tela ----
  React.useLayoutEffect(() => {
    const el = rolagemRef.current;
    if (!el) return undefined;
    const medir = () => setDim(d => (d.w === el.clientWidth ? d : { w: el.clientWidth }));
    medir();
    // Girar o aparelho muda a largura sem mexer no conteúdo: o evento de janela cobre isso mesmo sem ResizeObserver.
    window.addEventListener('resize', medir);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
    if (ro) ro.observe(el);
    return () => { window.removeEventListener('resize', medir); if (ro) ro.disconnect(); };
  }, [linhas.length === 0]);

  // A área ocupa o que sobra da tela entre os controles e a barra inferior, para a página não rolar junto com o gráfico.
  // O rodapé reservado é o padding inferior real do .content (barra + área segura do aparelho).
  const medirAltura = React.useCallback(() => {
    const area = areaRef.current;
    if (!area) return;
    const topo = area.getBoundingClientRect().top + window.scrollY;
    const conteudo = area.closest('.content');
    const rodape = conteudo ? (parseFloat(getComputedStyle(conteudo).paddingBottom) || 76) : 76;
    // Celular deitado (menos de 500px de altura): o piso menor deixa gráfico e legenda caberem na tela depois de a
    // página rolar até eles; a conta natural dá menos que isso e o gráfico ficaria só com cabeçalho.
    const minima = window.innerHeight <= 500 ? Math.min(alturaMinima, ALTURA_MINIMA_PAISAGEM) : alturaMinima;
    setAltura(Math.max(minima, Math.round(window.innerHeight - topo - rodape - ALTURA_LEGENDA)));
  }, [alturaMinima]);
  // Os controles de cima mudam de altura ao abrir a busca (linha a mais), então mede de novo nesse momento.
  React.useLayoutEffect(() => { medirAltura(); }, [medirAltura, filtrosAbertos]);
  React.useLayoutEffect(() => {
    window.addEventListener('resize', medirAltura);
    window.addEventListener('orientationchange', medirAltura);
    // Rede de proteção: qualquer outra mudança de altura dos controles (chips que quebram, fonte que carrega).
    let ro = null;
    if (typeof ResizeObserver !== 'undefined' && controlesRef.current) { ro = new ResizeObserver(medirAltura); ro.observe(controlesRef.current); }
    return () => {
      window.removeEventListener('resize', medirAltura);
      window.removeEventListener('orientationchange', medirAltura);
      if (ro) ro.disconnect();
    };
  }, [medirAltura]);

  // ---- Quais linhas desenhar ----
  const alturaVisivel = Math.max(0, altura - ALTURA_CABECALHO);
  const recalcularJanela = React.useCallback(() => {
    const el = rolagemRef.current;
    const j = janelaDeLinhas({ rolagemY: el ? el.scrollTop : 0, alturaVisivel, total: linhas.length });
    setJanela(a => (a.de === j.de && a.ate === j.ate ? a : j));
  }, [alturaVisivel, linhas.length]);
  React.useEffect(() => { recalcularJanela(); }, [recalcularJanela]);
  // Sem throttle de propósito: a conta é só aritmética e o setState devolve o mesmo objeto enquanto a faixa de linhas
  // não muda, então o React não redesenha nada na maior parte dos eventos de rolagem.
  const aoRolar = recalcularJanela;

  // ---- Rolagem horizontal ----
  // Na primeira medida a tela abre em hoje (se hoje está dentro do cronograma) ou no começo da primeira tarefa.
  React.useEffect(() => {
    if (abriuRef.current || !dim.w) return;
    const el = rolagemRef.current;
    if (!el) return;
    abriuRef.current = true;
    el.scrollLeft = rolagemParaOffset(escala, offsetInicialDaRolagem(escala, etapas), larguraGrafico);
  }, [dim.w]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trocar a escala mantém no centro da tela a mesma data que estava lá.
  const trocarZoom = (id) => {
    if (id === zoomId) return;
    const el = rolagemRef.current;
    if (el) centroPendenteRef.current = escala.inicioOffset + (el.scrollLeft + larguraGrafico / 2) / escala.pxPorDia;
    try { sessionStorage.setItem(CHAVE_ZOOM, id); } catch { /* sem armazenamento: a escolha vale só nesta tela */ }
    setZoomId(id);
  };
  React.useLayoutEffect(() => {
    const alvo = centroPendenteRef.current;
    if (alvo == null) return;
    centroPendenteRef.current = null;
    const el = rolagemRef.current;
    if (el) el.scrollLeft = rolagemParaOffset(escala, alvo, larguraGrafico, 0.5);
  }, [zoomId]); // eslint-disable-line react-hooks/exhaustive-deps

  const irParaHoje = () => {
    const el = rolagemRef.current;
    if (el) el.scrollTo({ left: rolagemParaOffset(escala, todayOffset(), larguraGrafico, 0.3), behavior: 'smooth' });
  };

  const alternar = (id) => setExpandidos(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const larguraTotal = rotuloW + escala.larguraTotal;
  const visiveis = linhas.slice(janela.de, janela.ate);
  const temBases = baselines.length > 0 || reprogramacoes.length > 0;

  return (
    <div className="mfs-lt">
      <div className="mfs-lt-controles" ref={controlesRef}>
        <div className="mfs-lt-linha-a">
          <div className="mfs-segmentado" role="group" aria-label="Escala de tempo">
            {ZOOMS_DA_LINHA.map(z => (
              <button key={z.id} type="button" aria-pressed={zoomId === z.id} onClick={() => trocarZoom(z.id)}>{z.rotulo}</button>
            ))}
          </div>
          <button
            type="button" className="mfs-acao mfs-lt-hoje-botao" onClick={irParaHoje} disabled={hojeX == null}
            title={hojeX == null ? 'Hoje está fora do período do cronograma' : undefined}
          >Hoje</button>
          <button
            type="button" className="mfs-acao mfs-acao-icone" aria-label="Buscar e filtrar" aria-expanded={filtrosAbertos}
            onClick={() => setFiltrosAbertos(v => !v)}
          >
            <Icon name="search" size={18} />
            {filtrando && <span className="mfs-ponto-filtro" aria-hidden="true" />}
          </button>
        </div>
        {filtrosAbertos && (
          <div className="mfs-filtros-linha">
            <input
              className="input input-search mfs-busca" type="search" inputMode="search"
              placeholder="Buscar tarefa…" aria-label="Buscar por tarefa, responsável ou pavimento"
              value={texto} onChange={(e) => setTexto(e.target.value)}
            />
            <select className="input mfs-situacao" aria-label="Situação" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
              {FILTROS_DE_SITUACAO.map(f => <option key={f.id} value={f.id}>{f.id === 'todas' ? 'Todas as situações' : f.label}</option>)}
            </select>
          </div>
        )}
        <div className="mfs-lt-chips">
          <button type="button" className={'chip' + (critico ? ' active' : '')} aria-pressed={critico} onClick={() => setCritico(v => !v)}>Caminho crítico</button>
          <button type="button" className="mfs-acao" onClick={() => setExpandidos(idsDeGrupos(etapas))} disabled={filtrando}>Expandir tudo</button>
          <button type="button" className="mfs-acao" onClick={() => setExpandidos(new Set())} disabled={filtrando}>Recolher tudo</button>
          {!semEdicao && <button type="button" className="mfs-acao" onClick={undo} disabled={readOnly || !canUndo}>Desfazer</button>}
          {!semEdicao && <button type="button" className="mfs-acao" onClick={redo} disabled={readOnly || !canRedo}>Refazer</button>}
          {temBases && (
            <select
              className="input mfs-base" aria-label="Linha de base comparada" value={blVisivelId || ''}
              onChange={(e) => onSelectBaseline?.(e.target.value || null)}
            >
              <option value="">Sem linha de base</option>
              {baselines.length > 0 && (
                <optgroup label="Linhas de base">{baselines.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}</optgroup>
              )}
              {reprogramacoes.length > 0 && (
                <optgroup label="Reprogramações">{reprogramacoes.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}</optgroup>
              )}
            </select>
          )}
        </div>
      </div>

      <div className="mfs-lt-area" ref={areaRef} style={{ height: altura }}>
        {linhas.length === 0 ? (
          <div className="card"><div className="card-body mfs-aviso">Nenhuma tarefa encontrada para a busca e o filtro atuais.</div></div>
        ) : (
          <div
            className="mfs-lt-rolagem" ref={rolagemRef} onScroll={aoRolar}
            tabIndex={0} role="region" aria-label="Linha do tempo do cronograma"
          >
            <div className="mfs-lt-conteudo" style={{ width: larguraTotal, '--rotulo-w': rotuloW + 'px' }}>
              <div className="mfs-lt-cabecalho" style={{ width: larguraTotal, height: ALTURA_CABECALHO }}>
                <div className="mfs-lt-canto" style={{ width: rotuloW }}>Tarefa</div>
                <div className={'mfs-lt-escala ' + zoomId} style={{ width: escala.larguraTotal }}>
                  {cab.superior.map((c, k) => (
                    <span key={'s' + k} className="mfs-lt-celula sup" style={{ left: c.x, width: c.w }}><span className="mfs-lt-sup-rotulo">{c.rotulo}</span></span>
                  ))}
                  {cab.inferior.map((c, k) => (
                    <span key={'i' + k} className={'mfs-lt-celula inf' + (c.fimDeSemana ? ' fds' : '')} style={{ left: c.x, width: c.w }}>{c.rotulo}</span>
                  ))}
                  {hojeX != null && <span className="mfs-lt-hoje-marca" style={{ left: hojeX }} aria-hidden="true" />}
                </div>
              </div>

              <div className="mfs-lt-corpo" style={{ height: linhas.length * ALTURA_LINHA, width: larguraTotal }}>
                <div className="mfs-lt-camadas" style={{ left: rotuloW, width: escala.larguraTotal }} aria-hidden="true">
                  {cab.grade.map((g, k) => <span key={k} className={'mfs-lt-grade' + (g.forte ? ' forte' : '')} style={{ left: g.x }} />)}
                  {feriados.map((f, k) => <span key={'f' + k} className="mfs-lt-feriado" style={{ left: f.x, width: f.w }} />)}
                </div>

                {visiveis.map(({ e, nivel, temFilhos, aberto }, k) => {
                  const i = janela.de + k;
                  const geo = geometriaDaBarra(e, escala, groupVals);
                  const sit = e.isGroup ? null : chaveDeSituacao(e);
                  const gv = e.isGroup ? groupVals?.[e.id] : null;
                  const avanco = gv ? gv.avanco : (e.avanco ?? 0);
                  const base = blMap ? geometriaDaBase(blMap.get(e.id), escala) : null;
                  const emConflito = conflitos.has(e.id);
                  const ehCritico = !!criticos && criticos.has(e.id);
                  return (
                    <div
                      key={e.id}
                      className={'mfs-lt-linha' + (e.isGroup ? ' grupo' : '') + (i % 2 ? ' impar' : '') + (e.id === abertaId ? ' aberta' : '')}
                      style={{ top: i * ALTURA_LINHA, width: larguraTotal }}
                      onClick={() => setAbertaId(e.id)}
                    >
                      <div className="mfs-lt-rotulo" style={{ width: rotuloW, paddingLeft: 2 + Math.min(nivel, 4) * 8 }}>
                        {temFilhos ? (
                          <button
                            type="button" className="mfs-lt-chevron" aria-expanded={aberto}
                            aria-label={`${aberto ? 'Recolher' : 'Expandir'} ${e.etapa}`}
                            onClick={(ev) => { ev.stopPropagation(); alternar(e.id); }}
                          >
                            <Icon name={aberto ? 'chevron-down' : 'chevron-right'} size={15} />
                          </button>
                        ) : <span className="mfs-lt-chevron vazio" aria-hidden="true" />}
                        <button
                          type="button" className="mfs-lt-nome-botao"
                          aria-label={`${e.etapa}. ${sit ? rotuloDeSituacao(sit) + '. ' : ''}${formatarPercentual(avanco)} concluído. Abrir detalhes`}
                        >
                          <span className="mfs-lt-nome"><span className="mono mfs-lt-wbs">{wbsMap?.[e.id] ?? ''}</span>{' '}{e.etapa}</span>
                        </button>
                      </div>
                      <div className="mfs-lt-faixa" style={{ left: rotuloW, width: escala.larguraTotal }} aria-hidden="true">
                        {base && <span className="mfs-lt-base" style={{ left: base.x, width: base.w }} />}
                        {geo.tipo === 'marco' && <span className={'mfs-lt-marco' + (emConflito ? ' conflito' : '')} style={{ left: geo.x }} />}
                        {geo.tipo === 'grupo' && <span className="mfs-lt-resumo" style={{ left: geo.x, width: geo.w }} />}
                        {geo.tipo === 'tarefa' && (
                          <span
                            className={'mfs-lt-barra ' + sit + (ehCritico ? ' critico' : '') + (emConflito ? ' conflito' : '')}
                            style={{ left: geo.x, width: geo.w }}
                          >
                            <span className="mfs-lt-avanco" style={{ width: Math.min(100, avanco) + '%' }} />
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {hojeX != null && <span className="mfs-lt-hoje" style={{ left: rotuloW + hojeX }} aria-hidden="true" />}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mfs-lt-legenda" aria-label="Legenda">
        <span><i className="mfs-lt-cor concluidas" />Concluída</span>
        <span><i className="mfs-lt-cor execucao" />Em execução</span>
        <span><i className="mfs-lt-cor atrasadas" />Atrasada</span>
        <span><i className="mfs-lt-cor futuras" />Futura</span>
        <span><i className="mfs-lt-cor resumo" />Grupo</span>
        <span><i className="mfs-lt-cor marco" />Marco</span>
        <span><i className="mfs-lt-cor conflito" />Conflito</span>
        {critico && <span><i className="mfs-lt-cor critico" />Caminho crítico</span>}
        {blMap && <span><i className="mfs-lt-cor base" />Linha de base</span>}
        {feriados.length > 0 && <span><i className="mfs-lt-cor feriado" />Feriado</span>}
      </div>

      {abertaId && (
        <FolhaDaTarefaAberta
          etapas={etapas} tarefaId={abertaId} wbsMap={wbsMap} groupVals={groupVals} succMap={succMap}
          readOnly={readOnly} onCommit={onCommit} onClose={() => setAbertaId(null)}
          baseEtapa={blMap ? blMap.get(abertaId) : null} baseNome={baseNome}
        />
      )}
    </div>
  );
};

export { LinhaDoTempoMobile };
