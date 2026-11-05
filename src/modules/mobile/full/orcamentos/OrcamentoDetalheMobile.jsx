import React from 'react';
import { Icon } from '../../../../components/Icons';
import { Modal } from '../../../../components/Modals';
import { formatBRL } from '../../../../utils/formatters';
import { isoToBR } from '../../../cronograma/cronogramaDateUtils';
import {
  nivelDoCodigo, podeInserirAcima, podeInserirSubitem, resumoDoOrcamento, subtituloDaComposicao, valoresIniciaisDoItem,
  validarItem, alteracoesDoItem, motivoDeNaoExcluir, paginaDeItens, formatarNumero, idDoItemInserido,
  TAMANHO_DA_PAGINA_DE_ITENS,
} from './orcamentoMobilePure';

const OPCOES_DE_ESTRUTURA = [
  { valor: '-1', rotulo: 'Expandir tudo' },
  { valor: '0', rotulo: 'Só nível 1' },
  { valor: '1', rotulo: 'Até nível 2' },
  { valor: '2', rotulo: 'Até nível 3' },
];

// Composição do orçamento na casca mobile: resumo, busca e filtro, os itens em cartões (grupos abrem e fecham) e uma
// folha para editar o item. Quem guarda o estado e grava continua sendo o OrcamentoDetalhe (que passa os manipuladores
// dele): as edições ficam pendentes e só vão ao banco em "Salvar alterações", como no desktop. Importar, limpar e
// excluir usam os mesmos modais do desktop (viram folhas na casca).
const OrcamentoDetalheMobile = ({
  orcamento, readOnly = false, ehAdmin = false, dataAtualizada, onBack,
  items = [], withTotals = [], visibleItems = [], parentSet, vinculadoSet, vinculoTarefaMap = {}, protegidoSet, collapsed,
  busca = '', onBusca, filtroVinculo = '', onFiltroVinculo, onNivel, onAlternarGrupo,
  dirty = false, saving = false, onSalvar, onDescartar,
  onEditar, onInserirAbaixo, onInserirAcima, onInserirSubitem, onNovoItem, onExcluirItem,
  onImportar, onLimparTudo, limpando = false, onExportarExcel, onExportarPdf, exportando = false, onExcluirOrcamento,
}) => {
  const [abertoId, setAbertoId] = React.useState(null);
  const [acoesAbertas, setAcoesAbertas] = React.useState(false);
  const [limite, setLimite] = React.useState(TAMANHO_DA_PAGINA_DE_ITENS);
  const [estrutura, setEstrutura] = React.useState('');
  const idsAntesRef = React.useRef(null);

  const filtrando = !!busca.trim() || !!filtroVinculo;
  const resumo = React.useMemo(
    () => resumoDoOrcamento({ withTotals, parentSet, vinculadoSet, totalItens: items.length }),
    [withTotals, parentSet, vinculadoSet, items.length],
  );
  const folhasVisiveis = React.useMemo(() => visibleItems.filter(it => !parentSet.has(it.codigo)).length, [visibleItems, parentSet]);
  const pagina = React.useMemo(() => paginaDeItens(visibleItems, limite), [visibleItems, limite]);
  React.useEffect(() => { setLimite(TAMANHO_DA_PAGINA_DE_ITENS); }, [busca, filtroVinculo]);

  // Depois de inserir um item, a folha dele abre sozinha para preencher o nome (o item novo nasce vazio).
  React.useEffect(() => {
    if (!idsAntesRef.current) return;
    const novo = idDoItemInserido(idsAntesRef.current, items);
    if (novo) { idsAntesRef.current = null; setAbertoId(novo); }
  }, [items]);
  const lembrarItensAtuais = () => { idsAntesRef.current = new Set(items.map(it => it.id)); };

  const aberto = abertoId ? withTotals.find(it => it.id === abertoId) || items.find(it => it.id === abertoId) : null;
  const brl = (v) => formatBRL(v);

  const aplicarMudancas = (item, valores) => {
    alteracoesDoItem(item, valores, parentSet.has(item.codigo)).forEach(m => onEditar(item.id, m.campo, m.valor));
  };
  const executarAcao = (tipo, item, valores) => {
    aplicarMudancas(item, valores);
    setAbertoId(null);
    if (tipo === 'abaixo') { lembrarItensAtuais(); onInserirAbaixo(item.codigo); }
    else if (tipo === 'acima') { lembrarItensAtuais(); onInserirAcima(item.codigo); }
    else if (tipo === 'subitem') { lembrarItensAtuais(); onInserirSubitem(item.codigo); }
    else if (tipo === 'excluir') onExcluirItem(item.codigo);
  };

  const noMenu = (fn) => () => { setAcoesAbertas(false); fn?.(); };
  const motivoLimpar = !items.length ? 'Não há itens para limpar.'
    : vinculadoSet.size > 0 ? 'Há itens vinculados ao cronograma. Remova os vínculos antes de limpar.' : null;

  return (
    <div className={'mfs-orc' + (dirty ? ' com-barra' : '')}>
      <div className="mfs-orc-topo-tela">
        <button type="button" className="btn btn-ghost mfs-orc-voltar" onClick={onBack}><Icon name="chevron-left" size={16} />Orçamentos</button>
        <button type="button" className="btn btn-ghost mfs-orc-acoes-botao" onClick={() => setAcoesAbertas(true)} disabled={exportando || limpando}>
          <Icon name="dots" size={16} />{exportando ? 'Exportando…' : limpando ? 'Limpando…' : 'Ações'}
        </button>
      </div>

      <header className="mfs-orc-titulo">
        <h1>{orcamento.obra}</h1>
        <p>{[orcamento.cliente, `atualizado em ${isoToBR(dataAtualizada)}`].filter(Boolean).join(' · ')}</p>
      </header>

      <section className="mfs-orc-resumo" aria-label="Resumo do orçamento">
        <div className="mfs-orc-kpi destaque">
          <span>Valor total</span>
          <strong>{brl(resumo.grandTotal)}</strong>
        </div>
        <div className="mfs-orc-kpi">
          <span>Itens cadastrados</span>
          <strong>{resumo.folhas}</strong>
          <small>{resumo.totalItens} com grupos</small>
        </div>
        <div className="mfs-orc-kpi">
          <span>Vinculados</span>
          <strong>{resumo.vinculados.n}</strong>
          <small>{brl(resumo.vinculados.valor)}</small>
        </div>
        <div className="mfs-orc-kpi">
          <span>Não vinculados</span>
          <strong>{resumo.naoVinculados.n}</strong>
          <small>{brl(resumo.naoVinculados.valor)}</small>
        </div>
      </section>

      <section className="mfs-orc-composicao" aria-label="Composição">
        <div className="mfs-orc-cabeca">
          <div>
            <h2>Composição</h2>
            <p>{subtituloDaComposicao({ totalItens: items.length, folhasVisiveis, folhasTotal: resumo.folhas, filtrando })}</p>
          </div>
          {!readOnly && (
            <button type="button" className="btn btn-primary mfs-orc-novo" onClick={onNovoItem}><Icon name="plus" size={16} />Novo item</button>
          )}
        </div>
        <input
          className="input input-search mfs-orc-busca" type="search" inputMode="search"
          placeholder="Buscar por código, item ou tarefa…" aria-label="Buscar por código, item ou tarefa"
          value={busca} onChange={(e) => onBusca?.(e.target.value)}
        />
        <div className="mfs-orc-filtros">
          <select className="input" aria-label="Filtrar por vínculo" value={filtroVinculo} onChange={(e) => onFiltroVinculo?.(e.target.value)}>
            <option value="">Todos (vínculo)</option>
            <option value="vinculado">Vinculados</option>
            <option value="nao_vinculado">Não vinculados</option>
          </select>
          <select
            className="input" aria-label="Expandir ou recolher a estrutura" value={estrutura}
            onChange={(e) => { setEstrutura(e.target.value); onNivel?.(Number(e.target.value)); }}
          >
            <option value="" disabled>Estrutura…</option>
            {OPCOES_DE_ESTRUTURA.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
          </select>
        </div>

        {!visibleItems.length ? (
          <div className="mfs-aviso">{items.length ? 'Nenhum item encontrado para a busca e o filtro atuais.' : 'Nenhum item cadastrado.'}</div>
        ) : (
          <ul className="mfs-orc-itens">
            {pagina.itens.map(it => {
              const grupo = parentSet.has(it.codigo);
              const nivel = nivelDoCodigo(it.codigo);
              const vinculado = !grupo && vinculadoSet.has(it.id);
              const fechado = collapsed.has(it.codigo);
              return (
                <li key={it.id} className={'mfs-orc-item' + (grupo ? ' grupo' : '') + ((it._new || it._dirty) ? ' pendente' : '')} style={{ marginLeft: Math.min(nivel, 3) * 10 }}>
                  {grupo && (
                    <button
                      type="button" className="mfs-orc-chevron" aria-expanded={!fechado}
                      aria-label={`${fechado ? 'Expandir' : 'Recolher'} ${it.codigo}`}
                      onClick={() => onAlternarGrupo(it.codigo)}
                    >
                      <Icon name={fechado ? 'chevron-right' : 'chevron-down'} size={18} />
                    </button>
                  )}
                  <button type="button" className="mfs-orc-corpo" onClick={() => setAbertoId(it.id)}>
                    <span className="mfs-orc-linha1">
                      <span className="mono mfs-orc-codigo">{it.codigo}</span>
                      {vinculado && <i className="mfs-orc-vinculo" title="Vinculado ao cronograma" aria-label="Vinculado ao cronograma" />}
                      {(it._new || it._dirty) && <span className="mfs-orc-pendente">{it._new ? 'novo' : 'alterado'}</span>}
                      <strong className="mfs-orc-valor">{brl(it.valor_total)}</strong>
                    </span>
                    <span className="mfs-orc-nome">{it.nome || <em>Sem nome</em>}</span>
                    {!grupo && (
                      <span className="mfs-orc-calculo">{formatarNumero(it.quantidade)} {(it.unidade || '').toUpperCase()} × {brl(it.valor_unitario)}</span>
                    )}
                    {vinculado && vinculoTarefaMap[it.id] && <span className="mfs-orc-tarefa">Tarefa: {vinculoTarefaMap[it.id]}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {pagina.restantes > 0 && (
          <button type="button" className="btn btn-ghost mfs-orc-mais" onClick={() => setLimite(l => l + TAMANHO_DA_PAGINA_DE_ITENS)}>
            Mostrar mais ({pagina.restantes} restantes)
          </button>
        )}
      </section>

      {dirty && (
        <div className="mfs-orc-barra" role="region" aria-label="Alterações não salvas">
          <button type="button" className="btn btn-ghost" onClick={onDescartar} disabled={saving}>Descartar</button>
          <button type="button" className="btn btn-primary" onClick={onSalvar} disabled={saving}>
            <Icon name="check" size={16} />{saving ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      )}

      {aberto && (
        <FolhaItem
          key={aberto.id}
          item={aberto}
          grupo={parentSet.has(aberto.codigo)}
          tarefa={vinculoTarefaMap[aberto.id]}
          readOnly={readOnly}
          ehAdmin={ehAdmin}
          motivoNaoExcluir={motivoDeNaoExcluir(aberto, protegidoSet)}
          onAplicar={(valores) => { aplicarMudancas(aberto, valores); setAbertoId(null); }}
          onAcao={(tipo, valores) => executarAcao(tipo, aberto, valores)}
          onClose={() => setAbertoId(null)}
        />
      )}

      {acoesAbertas && (
        <Modal title="Ações do orçamento" subtitle={orcamento.obra} onClose={() => setAcoesAbertas(false)} footer={<button type="button" className="btn btn-ghost" onClick={() => setAcoesAbertas(false)}>Fechar</button>}>
          <div className="mfs-orc-lista-acoes">
            {ehAdmin && <button type="button" className="mfs-orc-acao" onClick={noMenu(onImportar)}><Icon name="upload" size={18} />Importar planilha</button>}
            <button type="button" className="mfs-orc-acao" onClick={noMenu(onExportarExcel)}><Icon name="download" size={18} />Exportar para Excel</button>
            <button type="button" className="mfs-orc-acao" onClick={noMenu(onExportarPdf)}><Icon name="download" size={18} />Exportar para PDF</button>
            {ehAdmin && (
              <button type="button" className="mfs-orc-acao perigo" onClick={noMenu(onLimparTudo)} disabled={!!motivoLimpar}>
                <Icon name="trash" size={18} />Limpar todos os itens
                {motivoLimpar && <small>{motivoLimpar}</small>}
              </button>
            )}
            {ehAdmin && <button type="button" className="mfs-orc-acao perigo" onClick={noMenu(onExcluirOrcamento)}><Icon name="trash" size={18} />Excluir orçamento</button>}
          </div>
        </Modal>
      )}
    </div>
  );
};

// Folha do item: edita nome, quantidade, unidade e valor unitário (grupo só o nome) e oferece inserir acima, abaixo e
// subitem e excluir. As ações aplicam antes o que foi digitado. O valor total é sempre calculado, nunca digitado.
const FolhaItem = ({ item, grupo, tarefa, readOnly, ehAdmin, motivoNaoExcluir, onAplicar, onAcao, onClose }) => {
  const [valores, setValores] = React.useState(() => valoresIniciaisDoItem(item));
  const [erros, setErros] = React.useState({});
  const mudou = alteracoesDoItem(item, valores, grupo).length > 0;
  const set = (campo, v) => { setValores(s => ({ ...s, [campo]: v })); setErros(e => ({ ...e, [campo]: undefined })); };
  const comValidacao = (fn) => {
    const er = validarItem(valores, grupo);
    if (Object.keys(er).length) { setErros(er); return; }
    fn();
  };
  const nivel = nivelDoCodigo(item.codigo);

  return (
    <Modal
      title={`${grupo ? 'Grupo' : 'Item'} ${item.codigo}`}
      subtitle={tarefa ? `Vinculado à tarefa: ${tarefa}` : undefined}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>{mudou && !readOnly ? 'Cancelar' : 'Fechar'}</button>
          {!readOnly && <button type="button" className="btn btn-primary" disabled={!mudou} onClick={() => comValidacao(() => onAplicar(valores))}>Aplicar</button>}
        </>
      )}
    >
      {readOnly && <div className="mfs-aviso-folha">Somente consulta: você não pode alterar este orçamento.</div>}
      <div className="form-grid">
        <div className="field full">
          <label htmlFor="mfs-o-nome">Nome</label>
          <input id="mfs-o-nome" value={valores.nome} disabled={readOnly} placeholder={grupo ? 'Nome do grupo…' : 'Nome do item…'} onChange={(e) => set('nome', e.target.value)} />
        </div>
        {grupo ? (
          <div className="field full">
            <label>Valor total (soma dos itens do grupo)</label>
            <div className="mfs-leitura">{formatBRL(item.valor_total)}</div>
          </div>
        ) : (
          <>
            <div className="field">
              <label htmlFor="mfs-o-qtd">Quantidade</label>
              <input id="mfs-o-qtd" inputMode="decimal" value={valores.quantidade} disabled={readOnly} placeholder="0" onChange={(e) => set('quantidade', e.target.value)} />
              {erros.quantidade && <div className="mfs-erro">{erros.quantidade}</div>}
            </div>
            <div className="field">
              <label htmlFor="mfs-o-un">Unidade</label>
              <input id="mfs-o-un" maxLength={8} value={valores.unidade} disabled={readOnly} placeholder="UN" style={{ textTransform: 'uppercase' }} onChange={(e) => set('unidade', e.target.value)} />
            </div>
            <div className="field full">
              <label htmlFor="mfs-o-vu">Valor unitário (R$)</label>
              <input id="mfs-o-vu" inputMode="decimal" value={valores.valor_unitario} disabled={readOnly} placeholder="0,00" onChange={(e) => set('valor_unitario', e.target.value)} />
              {erros.valor_unitario && <div className="mfs-erro">{erros.valor_unitario}</div>}
            </div>
            <div className="field full">
              <label>Valor total (calculado)</label>
              <div className="mfs-leitura">{formatBRL(item.valor_total)}</div>
            </div>
          </>
        )}
      </div>

      {!readOnly && (
        <div className="mfs-orc-folha-acoes">
          <div className="mfs-orc-folha-titulo">Inserir</div>
          <div className="mfs-orc-folha-grade">
            {podeInserirAcima(item) && <button type="button" className="btn btn-ghost" onClick={() => comValidacao(() => onAcao('acima', valores))}><Icon name="arrow-up" size={16} />Acima</button>}
            <button type="button" className="btn btn-ghost" onClick={() => comValidacao(() => onAcao('abaixo', valores))}><Icon name="arrow-down" size={16} />Abaixo</button>
            {podeInserirSubitem(item) && <button type="button" className="btn btn-ghost" onClick={() => comValidacao(() => onAcao('subitem', valores))}><Icon name="arrow-right" size={16} />Subitem</button>}
          </div>
          <p className="mfs-nota">
            {nivel === 0
              ? '"Abaixo" cria um novo grupo raiz no fim da lista.'
              : '"Abaixo" cria um item no fim do grupo, "Acima" antes deste e "Subitem" dentro dele.'}
            {' '}O código do novo item é gerado pelo sistema.
          </p>
          {ehAdmin && (
            <>
              <button type="button" className="btn btn-ghost mfs-perigo mfs-orc-excluir" disabled={!!motivoNaoExcluir} onClick={() => onAcao('excluir', valores)}>
                <Icon name="trash" size={16} />{grupo ? 'Excluir grupo e itens' : 'Excluir item'}
              </button>
              {motivoNaoExcluir && <p className="mfs-nota">{motivoNaoExcluir}</p>}
            </>
          )}
        </div>
      )}
    </Modal>
  );
};

export { OrcamentoDetalheMobile };
