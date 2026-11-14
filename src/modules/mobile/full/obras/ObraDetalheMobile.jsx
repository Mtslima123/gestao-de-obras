import React from 'react';
import { Icon } from '../../../../components/Icons';
import { computeAllWBS, computeSuccessors } from '../../../cronograma/scheduleEngine';
import { LinhaDoTempoMobile } from '../cronograma/LinhaDoTempoMobile';
import { ListaMobile } from '../cronograma/ListaMobile';
import { statusDaObra, resumoDoCronograma, abasDaObraMobile } from './obraDetalhePure';

const SEM_ACAO = () => {};

// Obra detalhe na casca mobile: capa, nome e situação, os cinco indicadores, as abas e o cronograma da obra. Quem busca
// os dados e guarda o estado continua sendo a ObraDetail (que passa tudo pronto, com as mesmas fontes do desktop); aqui
// só muda a apresentação. Cronograma da obra é só consulta (Linha do tempo ou Lista, as mesmas do módulo Cronograma);
// editar o cronograma é no módulo, pelo botão "Ir para Cronograma". Fotos abre o modo foco que já existe.
const ObraDetalheMobile = ({
  obra, capa, podeEditar = false, onEditar, onExcluir, indicadores = [], etapas = [], etapasLoaded = true, groupVals = {},
  avancoFisico = 0, abas = [], aba = 'cronograma', onAba, onAbrirFotos, cronoView = 'gantt', onCronoView, onOpenCronograma,
}) => {
  const status = statusDaObra(obra.status);
  const wbsMap = React.useMemo(() => computeAllWBS(etapas), [etapas]);
  const succMap = React.useMemo(() => computeSuccessors(etapas), [etapas]);
  const abasMobile = abasDaObraMobile(abas);

  return (
    <div className="mfs-od">
      <div className="mfs-od-capa">{capa}</div>

      <header className="mfs-od-titulo">
        <div className="mfs-od-meta">
          <span className="mfs-od-codigo">{obra.sigla || obra.id}</span>
          <span className={'badge ' + status.tom}><span className="dot"></span>{status.rotulo}</span>
        </div>
        <h1>{obra.nome}</h1>
        {obra.endereco && <p className="mfs-od-endereco"><Icon name="map-pin" size={13} />{obra.endereco}</p>}
        {podeEditar && (
          <div className="mfs-od-acoes">
            <button type="button" className="btn btn-ghost" onClick={onEditar}><Icon name="edit" size={16} />Editar</button>
            <button type="button" className="btn btn-ghost mfs-perigo" onClick={onExcluir}><Icon name="trash" size={16} />Excluir</button>
          </div>
        )}
      </header>

      <section className="mfs-od-indicadores" aria-label="Indicadores da obra">
        {indicadores.map(i => (
          <div key={i.id} className={'mfs-ind' + (i.destaque ? ' destaque' : '')}>
            <div className="mfs-ind-rotulo">{i.rotulo}</div>
            <div className="mfs-ind-valor">{i.valor}</div>
            {i.progresso != null && (
              <div className="mfs-ind-barra" aria-hidden="true">
                <span style={{ width: i.progresso + '%' }} />
                {i.planejado != null && <i style={{ left: `calc(${i.planejado}% - 1px)` }} />}
              </div>
            )}
            {i.meta && <div className="mfs-ind-meta">{i.meta}</div>}
          </div>
        ))}
      </section>

      <div className="mfs-od-abas" role="tablist" aria-label="Abas da obra">
        {abasMobile.map(a => {
          const ativa = !a.abreFoco && aba === a.id;
          return (
            <button
              key={a.id} type="button" role="tab" aria-selected={ativa} aria-disabled={a.locked || undefined}
              title={a.locked ? 'Sem acesso a esta aba. Fale com o administrador.' : a.abreFoco ? 'Abre as fotos da obra em tela cheia' : undefined}
              className={'mfs-aba' + (ativa ? ' active' : '') + (a.locked ? ' locked' : '')}
              onClick={a.locked ? undefined : () => (a.abreFoco ? onAbrirFotos?.() : onAba?.(a.id))}
            >
              {a.abreFoco && <Icon name="camera" size={15} />}{a.label}
            </button>
          );
        })}
      </div>

      <section className="mfs-od-cronograma" aria-label="Cronograma físico">
        <div className="mfs-od-cron-cab">
          <div>
            <h3>Cronograma físico</h3>
            <p>{resumoDoCronograma(etapas)}</p>
          </div>
          <div className="mfs-segmentado" role="group" aria-label="Como ver o cronograma">
            <button type="button" aria-pressed={cronoView === 'gantt'} onClick={() => onCronoView?.('gantt')}>Gantt</button>
            <button type="button" aria-pressed={cronoView === 'lista'} onClick={() => onCronoView?.('lista')}>Lista</button>
          </div>
        </div>
        {!etapas.length ? (
          <div className="mfs-aviso">{etapasLoaded ? 'Esta obra ainda não tem cronograma.' : 'Carregando o cronograma…'}</div>
        ) : cronoView === 'lista' ? (
          <ListaMobile
            etapas={etapas} onCommit={SEM_ACAO} readOnly semEdicao wbsMap={wbsMap} groupVals={groupVals} succMap={succMap}
            avancoTotal={avancoFisico} undo={SEM_ACAO} redo={SEM_ACAO} canUndo={false} canRedo={false}
          />
        ) : (
          <LinhaDoTempoMobile
            etapas={etapas} onCommit={SEM_ACAO} readOnly semEdicao alturaMinima={380} wbsMap={wbsMap} groupVals={groupVals}
            succMap={succMap} undo={SEM_ACAO} redo={SEM_ACAO} canUndo={false} canRedo={false}
          />
        )}
        <button type="button" className="btn btn-primary mfs-od-ir" onClick={() => onOpenCronograma?.(obra.id)}>
          <Icon name="arrow-right" size={15} />Ir para Cronograma
        </button>
      </section>
    </div>
  );
};

export { ObraDetalheMobile };
