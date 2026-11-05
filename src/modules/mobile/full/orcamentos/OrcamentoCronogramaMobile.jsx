import React from 'react';
import { Icon } from '../../../../components/Icons';
import { Modal } from '../../../../components/Modals';
import { formatBRL } from '../../../../utils/formatters';
import { paginaDeItens } from './orcamentoMobilePure';
import {
  valorDoItem, valorDoGrupoMap, itensDoSeletor, estadoDoItem, totalDosSelecionados, rotuloDaTarefa, nomeDoPai,
  filtrarTarefas, nivelDaTarefa, resumoPorTarefa, filtrarResumo, plural, textoDaSelecao, textoDoBotaoAdicionar,
} from './vinculosMobilePure';

const PAGINA = 60;
const brl = (v) => formatBRL(v);

// Orçamento × Cronograma na casca mobile. Três abas: "Vincular" (dois passos: escolher os itens do orçamento e depois a
// tarefa do cronograma), "Vínculos" (a lista, com filtros e remoção) e "Resumo" (uma linha por tarefa, com a folha para
// editar os itens dela). Quem carrega os dados e grava é o OrcamentoCronogramaScreen: estes componentes só apresentam e
// chamam os mesmos manipuladores do desktop. Distribuir pesos das subtarefas ainda é só do desktop.
const OrcamentoCronogramaMobile = ({
  obras = [], obraSel = '', onTrocarObra, loading = false,
  itens = [], etapas = [], vinculos = [], rowNumberMap = {}, itensVinculadosIds, resumoIds,
  selItens = [], onToggleItem, onToggleVarios, onLimparSelecao,
  selEtapa = '', onSelEtapa, etapasDisponiveis = [], saving = false, onAdicionar,
  filtroItem = '', onFiltroItem, filtroEtapa = '', onFiltroEtapa, filtrados = [], totalVinculado = 0,
  ehAdmin = false, onPedirRemocao,
  onAbrirEdicao, editandoEtapa, vinculosEtapa = [], itensNaoVinculados = [], buscaModalItem = '', onBuscaModalItem,
  novaTarefaId = '', onNovaTarefa, movendoTarefa = false, onMover,
  confirmRemoveId, onConfirmRemoveId, onRemover, confirmRemoveTodos = false, onConfirmRemoveTodos, removendoTodos = false, onRemoverTodos,
  onVincularNoModal, onFecharEdicao,
}) => {
  const [aba, setAba] = React.useState('vincular');
  const [passo, setPasso] = React.useState(1);

  // Depois de gravar, a seleção é limpa pelo desktop: volta ao primeiro passo.
  React.useEffect(() => { if (!selItens.length && passo === 2) setPasso(1); }, [selItens.length, passo]);

  // Trocar de obra zera tudo da obra anterior (seleção, filtros): no desktop esses estados sobreviviam à troca, e um
  // item ou tarefa da obra antiga podia ser gravado como vínculo da nova.
  const trocarObra = (id) => {
    onLimparSelecao?.(); onSelEtapa?.(''); onFiltroItem?.(''); onFiltroEtapa?.('');
    setPasso(1); setAba('vincular');
    onTrocarObra?.(id);
  };

  const tarefaEscolhida = etapas.find(e => e.id === selEtapa);
  const totalEscolhido = totalDosSelecionados(itens, selItens);
  const mostraBarra = aba === 'vincular' && !!obraSel && !loading && (passo === 2 || selItens.length > 0);

  return (
    <div className={'mfs-oc' + (mostraBarra ? ' com-barra' : '')}>
      <select className="input mfs-select" aria-label="Obra" value={obraSel} onChange={(e) => trocarObra(e.target.value)}>
        <option value="">Selecione uma obra…</option>
        {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
      </select>

      {obras.length === 0 ? (
        <div className="mfs-aviso">Nenhuma obra com cronograma criado ainda. Crie o cronograma da obra primeiro.</div>
      ) : !obraSel ? (
        <div className="mfs-aviso">Selecione uma obra para gerenciar os vínculos entre orçamento e cronograma.</div>
      ) : loading ? (
        <div className="mfs-aviso">Carregando…</div>
      ) : (
        <>
          <div className="mfs-segmentado" role="tablist" aria-label="Seções">
            <button type="button" role="tab" aria-pressed={aba === 'vincular'} onClick={() => setAba('vincular')}>Vincular</button>
            <button type="button" role="tab" aria-pressed={aba === 'vinculos'} onClick={() => setAba('vinculos')}>Vínculos ({vinculos.length})</button>
            <button type="button" role="tab" aria-pressed={aba === 'resumo'} onClick={() => setAba('resumo')}>Resumo</button>
          </div>

          {aba === 'vincular' && (
            !itens.length ? (
              <div className="mfs-aviso">Nenhum item de orçamento encontrado para esta obra. Crie um orçamento primeiro.</div>
            ) : !etapas.length ? (
              <div className="mfs-aviso">Nenhuma tarefa de cronograma encontrada para esta obra. Crie um cronograma primeiro.</div>
            ) : (
              <>
                <ol className="mfs-oc-passos" aria-label="Passos">
                  <li className={passo === 1 ? 'ativo' : 'feito'}><span>1</span>Itens do orçamento</li>
                  <li className={passo === 2 ? 'ativo' : ''}><span>2</span>Tarefa do cronograma</li>
                </ol>
                {passo === 1 ? (
                  <SeletorDeItens
                    itens={itens} itensVinculadosIds={itensVinculadosIds} resumoIds={resumoIds} selItens={selItens}
                    onToggleItem={onToggleItem} onToggleVarios={onToggleVarios} onLimpar={onLimparSelecao}
                  />
                ) : (
                  <SeletorDeTarefa
                    etapas={etapasDisponiveis} todasEtapas={etapas} rowNumberMap={rowNumberMap} value={selEtapa} onChange={onSelEtapa}
                    vazio="Todas as tarefas já foram vinculadas."
                  />
                )}
              </>
            )
          )}

          {aba === 'vinculos' && (
            <ListaDeVinculos
              etapas={etapas} rowNumberMap={rowNumberMap} filtrados={filtrados} total={vinculos.length} totalVinculado={totalVinculado}
              filtroItem={filtroItem} onFiltroItem={onFiltroItem} filtroEtapa={filtroEtapa} onFiltroEtapa={onFiltroEtapa}
              ehAdmin={ehAdmin} onPedirRemocao={onPedirRemocao}
            />
          )}

          {aba === 'resumo' && (
            <ResumoPorTarefa vinculos={vinculos} etapas={etapas} rowNumberMap={rowNumberMap} onEditar={onAbrirEdicao} />
          )}
        </>
      )}

      {mostraBarra && (
        <div className="mfs-oc-barra" role="region" aria-label="Seleção para vincular">
          <div className="mfs-oc-barra-texto">
            <strong>{textoDaSelecao({ nItens: selItens.length, tarefa: passo === 2 && tarefaEscolhida ? rotuloDaTarefa(tarefaEscolhida, rowNumberMap) : '' })}</strong>
            <span>Total: {brl(totalEscolhido)}</span>
          </div>
          {passo === 1 ? (
            <div className="mfs-oc-barra-botoes">
              <button type="button" className="btn btn-ghost" onClick={onLimparSelecao}>Limpar</button>
              <button type="button" className="btn btn-primary" onClick={() => setPasso(2)}>Continuar<Icon name="arrow-right" size={16} /></button>
            </div>
          ) : (
            <div className="mfs-oc-barra-botoes">
              <button type="button" className="btn btn-ghost" onClick={() => setPasso(1)} disabled={saving}><Icon name="chevron-left" size={16} />Voltar</button>
              <button type="button" className="btn btn-primary" onClick={onAdicionar} disabled={!selEtapa || !selItens.length || saving}>
                {saving ? 'Salvando…' : textoDoBotaoAdicionar(selItens.length)}
              </button>
            </div>
          )}
        </div>
      )}

      {editandoEtapa && (
        <FolhaDeEdicao
          etapa={editandoEtapa} etapas={etapas} rowNumberMap={rowNumberMap} vinculosEtapa={vinculosEtapa}
          itensNaoVinculados={itensNaoVinculados} resumoIds={resumoIds} busca={buscaModalItem} onBusca={onBuscaModalItem}
          ehAdmin={ehAdmin} saving={saving} novaTarefaId={novaTarefaId} onNovaTarefa={onNovaTarefa} movendo={movendoTarefa} onMover={onMover}
          confirmRemoveId={confirmRemoveId} onConfirmRemoveId={onConfirmRemoveId} onRemover={onRemover}
          confirmRemoveTodos={confirmRemoveTodos} onConfirmRemoveTodos={onConfirmRemoveTodos} removendoTodos={removendoTodos} onRemoverTodos={onRemoverTodos}
          onVincular={onVincularNoModal} onFechar={onFecharEdicao}
        />
      )}
    </div>
  );
};

// ---- Passo 1: itens do orçamento (vários, com busca que enxerga a subárvore) ----
const SeletorDeItens = ({ itens, itensVinculadosIds, resumoIds, selItens, onToggleItem, onToggleVarios, onLimpar }) => {
  const [busca, setBusca] = React.useState('');
  const [limite, setLimite] = React.useState(PAGINA);
  const buscaDef = React.useDeferredValue(busca);
  const lista = React.useMemo(() => itensDoSeletor({ itens, itensVinculadosIds, busca: buscaDef }), [itens, itensVinculadosIds, buscaDef]);
  const grupoMap = React.useMemo(() => valorDoGrupoMap(itens, resumoIds), [itens, resumoIds]);
  React.useEffect(() => { setLimite(PAGINA); }, [buscaDef]);
  const pagina = paginaDeItens(lista, limite);

  return (
    <section className="mfs-oc-secao" aria-label="Itens do orçamento">
      <div className="mfs-oc-secao-cab">
        <h2>Itens do orçamento{selItens.length > 0 && <span> ({selItens.length} {plural(selItens.length, 'selecionado', 'selecionados')})</span>}</h2>
        {selItens.length > 0 && <button type="button" className="btn btn-ghost mfs-oc-pequeno" onClick={onLimpar}>Limpar seleção</button>}
      </div>
      <input
        className="input input-search mfs-oc-busca" type="search" inputMode="search" placeholder="Buscar item…" aria-label="Buscar item do orçamento"
        value={busca} onChange={(e) => setBusca(e.target.value)}
      />
      {lista.length === 0 ? (
        <div className="mfs-aviso">{!busca && itens.length > 0 ? 'Todos os itens já foram vinculados.' : 'Nenhum item encontrado.'}</div>
      ) : (
        <ul className="mfs-oc-itens">
          {pagina.itens.map(it => {
            const e = estadoDoItem(it, { resumoIds, valorGrupoMap: grupoMap, lista, selItens });
            const nivel = (it.codigo?.match(/\./g) || []).length;
            return (
              <li key={it.id}>
                <label className={'mfs-oc-linha' + (e.marcado ? ' marcado' : '') + (e.resumo ? ' resumo n' + Math.min(nivel, 2) : '') + (e.inerte ? ' inerte' : '')}>
                  <input
                    type="checkbox" checked={e.marcado} disabled={e.inerte}
                    ref={el => { if (el) el.indeterminate = e.parcial; }}
                    onChange={() => { if (e.inerte) return; if (e.resumo) onToggleVarios(e.folhas.map(f => f.id), !e.marcado); else onToggleItem(it.id); }}
                  />
                  <span className="mfs-oc-textos">
                    <span className="mfs-oc-linha1">
                      <span className="mono mfs-oc-codigo">{it.codigo}</span>
                      {e.resumo && <span className="mfs-oc-tag">resumo</span>}
                      <strong className="mfs-oc-valor">{brl(e.valor)}</strong>
                    </span>
                    <span className="mfs-oc-nome">{it.nome}</span>
                    {e.resumo && <small className="mfs-oc-dica">{e.inerte ? 'Sem itens disponíveis nesta lista' : 'Marca ou desmarca os itens listados abaixo dele'}</small>}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {pagina.restantes > 0 && (
        <button type="button" className="btn btn-ghost mfs-oc-mais" onClick={() => setLimite(l => l + PAGINA)}>Mostrar mais ({pagina.restantes} restantes)</button>
      )}
    </section>
  );
};

// ---- Passo 2: tarefa do cronograma (uma só; grupos também valem) ----
const SeletorDeTarefa = ({ etapas, todasEtapas, rowNumberMap, value, onChange, vazio }) => {
  const [busca, setBusca] = React.useState('');
  const [limite, setLimite] = React.useState(PAGINA);
  const lista = React.useMemo(() => filtrarTarefas(etapas, busca, rowNumberMap), [etapas, busca, rowNumberMap]);
  React.useEffect(() => { setLimite(PAGINA); }, [busca]);
  const pagina = paginaDeItens(lista, limite);
  return (
    <section className="mfs-oc-secao" aria-label="Tarefa do cronograma">
      <div className="mfs-oc-secao-cab"><h2>Tarefa do cronograma</h2></div>
      <input
        className="input input-search mfs-oc-busca" type="search" inputMode="search" placeholder="Buscar tarefa…" aria-label="Buscar tarefa"
        value={busca} onChange={(e) => setBusca(e.target.value)}
      />
      {lista.length === 0 ? (
        <div className="mfs-aviso">{etapas.length === 0 ? vazio : 'Nenhuma tarefa encontrada.'}</div>
      ) : (
        <ul className="mfs-oc-itens" role="listbox" aria-label="Tarefas">
          {pagina.itens.map(et => {
            const pai = nomeDoPai(et, todasEtapas);
            return (
              <li key={et.id}>
                <button type="button" role="option" aria-selected={value === et.id} className={'mfs-oc-tarefa-linha' + (value === et.id ? ' marcado' : '') + (et.isGroup ? ' grupo' : '')} onClick={() => onChange(et.id)} style={{ paddingLeft: 12 + Math.min(et.nivel || 0, 4) * 10 }}>
                  <span className="mono mfs-oc-codigo">{rowNumberMap[et.id] ?? et.id}</span>
                  <span className="mfs-oc-nome">{et.etapa}</span>
                  {et.isGroup && <span className="mfs-oc-tag">grupo</span>}
                  {pai && <small className="mfs-oc-dica">em {pai}</small>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {pagina.restantes > 0 && (
        <button type="button" className="btn btn-ghost mfs-oc-mais" onClick={() => setLimite(l => l + PAGINA)}>Mostrar mais ({pagina.restantes} restantes)</button>
      )}
    </section>
  );
};

// ---- Aba Vínculos ----
const ListaDeVinculos = ({ etapas, rowNumberMap, filtrados, total, totalVinculado, filtroItem, onFiltroItem, filtroEtapa, onFiltroEtapa, ehAdmin, onPedirRemocao }) => {
  const [limite, setLimite] = React.useState(PAGINA);
  React.useEffect(() => { setLimite(PAGINA); }, [filtroItem, filtroEtapa]);
  const pagina = paginaDeItens(filtrados, limite);
  const filtrando = !!filtroItem || !!filtroEtapa;
  return (
    <section className="mfs-oc-secao" aria-label="Vínculos cadastrados">
      <div className="mfs-oc-secao-cab">
        <h2>Vínculos cadastrados ({filtrados.length})</h2>
        {filtrando && <button type="button" className="btn btn-ghost mfs-oc-pequeno" onClick={() => { onFiltroItem(''); onFiltroEtapa(''); }}>Limpar</button>}
      </div>
      <div className="mfs-oc-filtros">
        <input className="input mfs-oc-busca" placeholder="Filtrar por item…" aria-label="Filtrar por item" value={filtroItem} onChange={(e) => onFiltroItem(e.target.value)} />
        <input className="input mfs-oc-busca" placeholder="Filtrar por tarefa…" aria-label="Filtrar por tarefa" value={filtroEtapa} onChange={(e) => onFiltroEtapa(e.target.value)} />
      </div>
      {filtrados.length > 0 && <p className="mfs-oc-total">Total vinculado: <strong>{brl(totalVinculado)}</strong></p>}
      {filtrados.length === 0 ? (
        <div className="mfs-aviso">{total === 0 ? 'Nenhum vínculo cadastrado. Use a aba Vincular para adicionar o primeiro.' : 'Nenhum resultado para os filtros aplicados.'}</div>
      ) : (
        <ul className="mfs-oc-itens">
          {pagina.itens.map(v => {
            const et = etapas.find(e => e.id === v.etapa_id);
            const it = v.orcamento_itens;
            return (
              <li key={v.id} className="mfs-oc-cartao">
                <div className="mfs-oc-cartao-corpo">
                  <span className="mfs-oc-linha1">
                    <span className="mono mfs-oc-codigo">{it?.codigo || '—'}</span>
                    <strong className="mfs-oc-valor">{brl(valorDoItem(it))}</strong>
                  </span>
                  <span className="mfs-oc-nome">{it?.nome || <em>Item removido</em>}</span>
                  <span className="mfs-oc-destino">
                    <Icon name="arrow-right" size={13} />
                    {et ? <><span className="mono">{rowNumberMap[et.id] ?? et.id}</span> {et.etapa} <span className="mfs-oc-tag">{nivelDaTarefa(et)}</span></> : <em>Tarefa removida ({v.etapa_id})</em>}
                  </span>
                </div>
                {ehAdmin && (
                  <button type="button" className="mfs-oc-lixeira" aria-label={`Remover vínculo do item ${it?.codigo || ''}`} onClick={() => onPedirRemocao(v)}>
                    <Icon name="trash" size={18} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {pagina.restantes > 0 && (
        <button type="button" className="btn btn-ghost mfs-oc-mais" onClick={() => setLimite(l => l + PAGINA)}>Mostrar mais ({pagina.restantes} restantes)</button>
      )}
    </section>
  );
};

// ---- Aba Resumo: uma linha por tarefa com vínculo ----
const ResumoPorTarefa = ({ vinculos, etapas, rowNumberMap, onEditar }) => {
  const [filtro, setFiltro] = React.useState('');
  const todas = React.useMemo(() => resumoPorTarefa(vinculos, etapas), [vinculos, etapas]);
  const lista = filtrarResumo(todas, filtro);
  return (
    <section className="mfs-oc-secao" aria-label="Resumo por tarefa">
      <div className="mfs-oc-secao-cab">
        <div>
          <h2>Resumo por tarefa</h2>
          <p>Valor total recebido do orçamento por tarefa vinculada</p>
        </div>
        {filtro && <button type="button" className="btn btn-ghost mfs-oc-pequeno" onClick={() => setFiltro('')}>Limpar</button>}
      </div>
      <input className="input mfs-oc-busca" placeholder="Filtrar por tarefa…" aria-label="Filtrar por tarefa" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
      {lista.length === 0 ? (
        <div className="mfs-aviso">{todas.length === 0 ? 'Nenhum vínculo cadastrado ainda.' : 'Nenhuma tarefa para o filtro.'}</div>
      ) : (
        <ul className="mfs-oc-itens">
          {lista.map(({ etapa: e, itens: n, total }) => (
            <li key={e.id} className="mfs-oc-cartao" style={{ marginLeft: Math.min(e.nivel || 0, 3) * 8 }}>
              <button type="button" className="mfs-oc-cartao-corpo mfs-oc-botao-cartao" onClick={() => onEditar(e.id)} aria-label={`Editar os itens associados a ${e.etapa}`}>
                <span className="mfs-oc-linha1">
                  <span className="mono mfs-oc-codigo">{rowNumberMap[e.id] ?? e.id}</span>
                  {e.isGroup && <span className="mfs-oc-tag">grupo</span>}
                  <strong className="mfs-oc-valor">{brl(total)}</strong>
                </span>
                <span className="mfs-oc-nome">{e.etapa}</span>
                <span className="mfs-oc-calculo">{n} {plural(n, 'item', 'itens')} · toque para editar</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

// ---- Folha: editar os itens associados a uma tarefa ----
const FolhaDeEdicao = ({
  etapa, etapas, rowNumberMap, vinculosEtapa, itensNaoVinculados, resumoIds, busca, onBusca, ehAdmin, saving,
  novaTarefaId, onNovaTarefa, movendo, onMover, confirmRemoveId, onConfirmRemoveId, onRemover,
  confirmRemoveTodos, onConfirmRemoveTodos, removendoTodos, onRemoverTodos, onVincular, onFechar,
}) => {
  const [limite, setLimite] = React.useState(PAGINA);
  React.useEffect(() => { setLimite(PAGINA); }, [busca]);
  const pagina = paginaDeItens(itensNaoVinculados, limite);
  const n = vinculosEtapa.length;
  return (
    <Modal
      title={`Editar itens · ${rowNumberMap[etapa.id] ?? etapa.id}`}
      subtitle={etapa.etapa}
      onClose={onFechar}
      footer={<button type="button" className="btn btn-primary" onClick={onFechar}>Fechar</button>}
    >
      {ehAdmin && (
        <div className="mfs-oc-bloco">
          <div className="mfs-oc-bloco-titulo">Mover para outra tarefa</div>
          <div className="mfs-oc-mover">
            <select className="input" aria-label="Tarefa de destino" value={novaTarefaId} onChange={(e) => onNovaTarefa(e.target.value)}>
              <option value="">Escolha a tarefa…</option>
              {etapas.filter(e => e.id !== etapa.id).map(e => (
                <option key={e.id} value={e.id}>{'  '.repeat(Math.min(e.nivel || 0, 4))}{rotuloDaTarefa(e, rowNumberMap)}</option>
              ))}
            </select>
            <button type="button" className="btn btn-ghost" disabled={!novaTarefaId || movendo} onClick={onMover}>{movendo ? 'Movendo…' : 'Mover'}</button>
          </div>
          <p className="mfs-nota">Transfere os {n} {plural(n, 'item vinculado', 'itens vinculados')} desta tarefa para a tarefa escolhida, caso a tarefa atual esteja errada.</p>
        </div>
      )}

      <div className="mfs-oc-bloco">
        <div className="mfs-oc-bloco-cab">
          <div className="mfs-oc-bloco-titulo">Itens vinculados ({n})</div>
          {ehAdmin && n > 0 && (
            confirmRemoveTodos ? (
              <div className="mfs-oc-confirma">
                <button type="button" className="btn mfs-oc-perigo" disabled={removendoTodos} onClick={onRemoverTodos}>
                  {removendoTodos ? 'Removendo…' : `Confirmar remoção de ${n} ${plural(n, 'item', 'itens')}`}
                </button>
                <button type="button" className="btn btn-ghost" aria-label="Cancelar" disabled={removendoTodos} onClick={() => onConfirmRemoveTodos(false)}><Icon name="x" size={16} /></button>
              </div>
            ) : (
              <button type="button" className="btn btn-ghost mfs-oc-pequeno mfs-oc-texto-perigo" onClick={() => onConfirmRemoveTodos(true)}><Icon name="trash" size={14} />Excluir todos</button>
            )
          )}
        </div>
        {n === 0 ? (
          <div className="mfs-aviso">Nenhum item associado a esta tarefa.</div>
        ) : (
          <ul className="mfs-oc-itens">
            {vinculosEtapa.map(v => (
              <li key={v.id} className="mfs-oc-cartao">
                <div className="mfs-oc-cartao-corpo">
                  <span className="mfs-oc-linha1">
                    <span className="mono mfs-oc-codigo">{v.orcamento_itens?.codigo || '—'}</span>
                    <strong className="mfs-oc-valor">{brl(valorDoItem(v.orcamento_itens))}</strong>
                  </span>
                  <span className="mfs-oc-nome">{v.orcamento_itens?.nome || <em>Item removido</em>}</span>
                  {ehAdmin && confirmRemoveId === v.id && (
                    <span className="mfs-oc-confirma">
                      <button type="button" className="btn mfs-oc-perigo" onClick={() => { onConfirmRemoveId(null); onRemover(v.id); }}>Confirmar remoção</button>
                      <button type="button" className="btn btn-ghost" aria-label="Cancelar" onClick={() => onConfirmRemoveId(null)}><Icon name="x" size={16} /></button>
                    </span>
                  )}
                </div>
                {ehAdmin && confirmRemoveId !== v.id && (
                  <button type="button" className="mfs-oc-lixeira" aria-label={`Remover vínculo do item ${v.orcamento_itens?.codigo || ''}`} onClick={() => onConfirmRemoveId(v.id)}><Icon name="trash" size={18} /></button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mfs-oc-bloco">
        <div className="mfs-oc-bloco-titulo">Adicionar itens</div>
        <input className="input mfs-oc-busca" placeholder="Buscar item do orçamento…" aria-label="Buscar item do orçamento" value={busca} onChange={(e) => onBusca(e.target.value)} />
        {itensNaoVinculados.length === 0 ? (
          <div className="mfs-aviso">{busca ? 'Nenhum item encontrado para essa busca.' : 'Todos os itens já foram vinculados.'}</div>
        ) : (
          <ul className="mfs-oc-itens">
            {pagina.itens.map(it => {
              const resumo = resumoIds.has(it.id);
              return (
                <li key={it.id} className={'mfs-oc-cartao' + (resumo ? ' apagado' : '')}>
                  <div className="mfs-oc-cartao-corpo">
                    <span className="mfs-oc-linha1">
                      <span className="mono mfs-oc-codigo">{it.codigo}</span>
                      {resumo && <span className="mfs-oc-tag">resumo</span>}
                      {/* O valor gravado no resumo é 0: mostrar "R$ 0,00" enganaria (o total dele vem das folhas). */}
                      {!resumo && <strong className="mfs-oc-valor">{brl(valorDoItem(it))}</strong>}
                    </span>
                    <span className="mfs-oc-nome">{it.nome}</span>
                    {resumo && <small className="mfs-oc-dica">Item-resumo não pode ser vinculado diretamente</small>}
                  </div>
                  <button type="button" className="btn btn-ghost mfs-oc-vincular" disabled={saving || resumo} onClick={() => onVincular(it.id)}><Icon name="plus" size={14} />Vincular</button>
                </li>
              );
            })}
          </ul>
        )}
        {pagina.restantes > 0 && (
          <button type="button" className="btn btn-ghost mfs-oc-mais" onClick={() => setLimite(l => l + PAGINA)}>Mostrar mais ({pagina.restantes} restantes)</button>
        )}
      </div>
    </Modal>
  );
};

export { OrcamentoCronogramaMobile };
