import React from 'react';
import { Icon } from '../../../../components/Icons';
import { isoToBR } from '../../../cronograma/cronogramaDateUtils';
import {
  FILTROS_DE_SITUACAO, chaveDeSituacao, rotuloDeSituacao, linhasDaLista, idsDeGrupos, expandidosIniciais,
  datasDaTarefa, terminoProjetadoISO, formatarPercentual,
} from './cronogramaMobilePure';
import { FolhaDaTarefaAberta } from './FolhaTarefa';

const TAMANHO_DA_PAGINA = 120;

// Lista do Cronograma na casca mobile: um cartão por linha da EAP, com os grupos abrindo e fechando e uma folha
// para editar a tarefa. Os dados e a gravação são os do CronogramaFull (a Lista do desktop usa os mesmos): aqui
// só muda a apresentação. Abrir e fechar grupo é só desta tela (não grava), para não mexer no que a equipe vê.
const ListaMobile = ({
  etapas, onCommit, readOnly, wbsMap, groupVals, succMap, avancoTotal, undo, redo, canUndo, canRedo, semEdicao = false,
}) => {
  const [expandidos, setExpandidos] = React.useState(() => expandidosIniciais(etapas));
  const [texto, setTexto] = React.useState('');
  const [filtro, setFiltro] = React.useState('todas');
  const [limite, setLimite] = React.useState(TAMANHO_DA_PAGINA);
  const [abertaId, setAbertaId] = React.useState(null);

  const linhas = React.useMemo(
    () => linhasDaLista({ etapas, wbsMap, expandidos, texto, filtro }),
    [etapas, wbsMap, expandidos, texto, filtro],
  );
  // Busca ou filtro novo volta ao começo da lista.
  React.useEffect(() => { setLimite(TAMANHO_DA_PAGINA); }, [texto, filtro]);

  const alternar = (id) => setExpandidos(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const termino = terminoProjetadoISO(etapas, groupVals);
  const filtrando = !!texto.trim() || filtro !== 'todas';

  return (
    <div className="mfs-lista">
      <section className="mfs-resumo" aria-label="Resumo do cronograma">
        <div className="mfs-resumo-item">
          <span className="mfs-resumo-rotulo">Avanço físico</span>
          <strong className="mfs-resumo-valor">{formatarPercentual(avancoTotal)}</strong>
          <div className="progress"><span style={{ width: Math.min(100, avancoTotal || 0) + '%' }}></span></div>
        </div>
        <div className="mfs-resumo-item">
          <span className="mfs-resumo-rotulo">Término projetado</span>
          <strong className="mfs-resumo-valor">{termino ? isoToBR(termino) : '—'}</strong>
        </div>
      </section>

      <div className="mfs-lista-controles">
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
        <div className="mfs-acoes-lista">
          <button type="button" className="mfs-acao" onClick={() => setExpandidos(idsDeGrupos(etapas))} disabled={filtrando}>Expandir tudo</button>
          <button type="button" className="mfs-acao" onClick={() => setExpandidos(new Set())} disabled={filtrando}>Recolher tudo</button>
          <span className="mfs-acoes-espaco" />
          {!semEdicao && (
            <>
              <button type="button" className="mfs-acao" onClick={undo} disabled={readOnly || !canUndo}>Desfazer</button>
              <button type="button" className="mfs-acao" onClick={redo} disabled={readOnly || !canRedo}>Refazer</button>
            </>
          )}
        </div>
      </div>

      {linhas.length === 0 ? (
        <div className="card"><div className="card-body mfs-aviso">Nenhuma tarefa encontrada para a busca e o filtro atuais.</div></div>
      ) : (
        <ul className="mfs-tarefas">
          {linhas.slice(0, limite).map(({ e, nivel, temFilhos, aberto }) => {
            const datas = datasDaTarefa(e, groupVals);
            const sit = e.isGroup ? null : chaveDeSituacao(e);
            const expansivel = e.isGroup && temFilhos;
            return (
              <li key={e.id} className={'mfs-tarefa' + (e.isGroup ? ' grupo' : '')} style={{ marginLeft: Math.min(nivel, 5) * 10 }}>
                <button
                  type="button" className="mfs-tarefa-corpo"
                  aria-expanded={expansivel ? aberto : undefined}
                  onClick={() => (expansivel ? alternar(e.id) : setAbertaId(e.id))}
                >
                  <span className="mfs-tarefa-topo">
                    {expansivel && <Icon name={aberto ? 'chevron-down' : 'chevron-right'} size={16} />}
                    <span className="mono mfs-tarefa-wbs">{wbsMap?.[e.id] ?? ''}</span>
                    {sit && <span className={'mfs-sit ' + sit}>{rotuloDeSituacao(sit)}</span>}
                  </span>
                  <span className="mfs-tarefa-nome">{e.etapa}</span>
                  <span className="mfs-tarefa-datas">{isoToBR(datas.inicioISO)} a {isoToBR(datas.fimISO)} · {datas.dur} d</span>
                  <span className="mfs-tarefa-prog">
                    <span className={'progress' + (sit === 'concluidas' ? ' success' : sit === 'atrasadas' ? ' danger' : '')}>
                      <span style={{ width: Math.min(100, datas.avanco) + '%' }}></span>
                    </span>
                    <b>{formatarPercentual(datas.avanco)}</b>
                  </span>
                  {(e.responsavel || e.pavimento) && (
                    <span className="mfs-tarefa-tags">
                      {e.responsavel && <span className="mfs-tag">{e.responsavel}</span>}
                      {e.pavimento && <span className="mfs-tag">{e.pavimento}</span>}
                    </span>
                  )}
                </button>
                {e.isGroup && (
                  <button type="button" className="mfs-tarefa-detalhe" aria-label={`Detalhes de ${e.etapa}`} onClick={() => setAbertaId(e.id)}>
                    <Icon name={readOnly ? 'eye' : 'edit'} size={16} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {linhas.length > limite && (
        <button type="button" className="btn btn-ghost mfs-mais" onClick={() => setLimite(l => l + TAMANHO_DA_PAGINA)}>
          Mostrar mais ({linhas.length - limite} restantes)
        </button>
      )}

      {abertaId && (
        <FolhaDaTarefaAberta
          etapas={etapas} tarefaId={abertaId} wbsMap={wbsMap} groupVals={groupVals} succMap={succMap}
          readOnly={readOnly} onCommit={onCommit} onClose={() => setAbertaId(null)}
        />
      )}
    </div>
  );
};

export { ListaMobile };
