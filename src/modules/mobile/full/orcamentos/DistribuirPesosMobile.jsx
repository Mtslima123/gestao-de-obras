import React from 'react';
import { Icon } from '../../../../components/Icons';
import { Modal } from '../../../../components/Modals';
import { formatBRL } from '../../../../utils/formatters';
import { buildChildrenMap, flattenTree } from '../../../financeiro/distribuirPesos';
import { paginaDeItens } from './orcamentoMobilePure';
import {
  UNIDADES_PESO, subarvoreIds, estadoInicial, retirarDaDistribuicao, readicionarNaDistribuicao, idsComSubarvore, linhasDaLista,
  alternarEm, valorDoGrupo, valorPorNoDe, totalDistribuido, divergenciaDe, valorDoPai, valorEditavel, bloqueioDaLinha,
  valorParaCampo, aplicarValorDigitado, houveMudanca, payloadParaSalvar,
} from './pesosMobilePure';

const PAGINA = 80;
const brl = (v) => formatBRL(v);

// "Distribuir pesos" na casca mobile: a mesma distribuição do modal do desktop (fator peso de cada subtarefa, cadeado,
// retirar da distribuição, valor digitado em R$), como folha por baixo com um cartão por linha. Recebe as mesmas props do
// DistribuirPesosModal e salva pelo mesmo onSave (handleSalvarPesos do OrcamentoCronogramaScreen), então a gravação, o
// bloqueio por versão do cronograma e os avisos são os do desktop. Duplo clique, Enter entre campos e tooltips do desktop
// viraram toque: o valor em R$ abre pelo próprio botão do valor.
const DistribuirPesosMobile = ({ etapa, etapas, vinculos, orcamentoItensMap, saving, onSave, onClose }) => {
  const [ini] = React.useState(() => estadoInicial(etapa, etapas));
  const childrenOf = React.useMemo(() => buildChildrenMap(etapas), [etapas]);
  const descendentes = React.useMemo(() => flattenTree(etapa.id, childrenOf), [etapa.id, childrenOf]);

  const [collapsed, setCollapsed] = React.useState(ini.collapsed);
  const [pesos, setPesos] = React.useState(ini.pesos);
  const [travas, setTravas] = React.useState(ini.travas);
  const [removidos, setRemovidos] = React.useState(ini.removidos);
  const [unidade, setUnidade] = React.useState(ini.unidade);
  const [editandoValor, setEditandoValor] = React.useState(null);
  const [limite, setLimite] = React.useState(PAGINA);
  const guardadosRef = React.useRef({}); // peso de cada linha antes de ser retirada, para "adicionar de volta"

  const setPeso = (id, val) => setPesos(p => ({ ...p, [id]: val }));
  const retirar = (id) => {
    const r = retirarDaDistribuicao({ pesos, ids: subarvoreIds(id, childrenOf), guardados: guardadosRef.current });
    guardadosRef.current = r.guardados;
    setPesos(r.pesos);
    setRemovidos(prev => new Set([...prev, id]));
  };
  const readicionar = (id) => {
    setPesos(readicionarNaDistribuicao({ pesos, ids: subarvoreIds(id, childrenOf), guardados: guardadosRef.current }));
    setRemovidos(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  const removidosSubarvore = React.useMemo(() => idsComSubarvore(removidos, childrenOf), [removidos, childrenOf]);
  const linhas = React.useMemo(
    () => linhasDaLista({ etapaId: etapa.id, childrenOf, collapsed, removidosSubarvore }),
    [etapa.id, childrenOf, collapsed, removidosSubarvore]
  );
  const grupos = React.useMemo(() => descendentes.filter(n => n.temFilhos), [descendentes]);
  const tudoAberto = grupos.length > 0 && collapsed.size === 0;
  const tudoRecolhido = grupos.length > 0 && collapsed.size === grupos.length;

  const valorGrupo = React.useMemo(() => valorDoGrupo(vinculos, orcamentoItensMap), [vinculos, orcamentoItensMap]);
  const valorPorNo = React.useMemo(
    () => valorPorNoDe({ etapas, pesos, vinculos, orcamentoItensMap }),
    [etapas, pesos, vinculos, orcamentoItensMap]
  );
  const total = totalDistribuido(etapa.id, childrenOf, valorPorNo);
  const divergencia = divergenciaDe(valorGrupo, total);
  const paiDe = (f) => valorDoPai(f, { etapaId: etapa.id, valorGrupo, valorPorNo });

  // R$ digitado -> fator peso dos irmãos (a mesma redistribuição do desktop).
  const confirmarValor = (f, texto) => {
    setEditandoValor(null);
    const patch = aplicarValorDigitado({ etapa: f, texto, childrenOf, valorPai: paiDe(f), valorPorNo, pesos, travas });
    if (patch) setPesos(p => ({ ...p, ...patch }));
  };

  // Referência para o aviso de "alterações não salvas": só avança quando um salvar é confirmado (o salvar não fecha a folha).
  const baseRef = React.useRef(null);
  if (baseRef.current === null) baseRef.current = { pesos, travas, unidade, removidos };
  const sujo = houveMudanca(baseRef.current, { pesos, travas, unidade, removidos });

  const salvar = async () => {
    const p = payloadParaSalvar({ descendentes, pesos, travas, childrenOf });
    const ok = await onSave(p.pesos, unidade, p.travas);
    if (ok) baseRef.current = { pesos, travas, unidade, removidos };
  };

  // Fechar com edição pendente pede confirmação na própria folha. O Modal só registra o Escape uma vez, por isso a função
  // entregue a ele é estável e delega para o ref, que a cada renderização enxerga o estado de agora.
  const [confirmaFechar, setConfirmaFechar] = React.useState(false);
  const tentarFecharRef = React.useRef();
  tentarFecharRef.current = () => { if (!sujo) { onClose(); return; } setConfirmaFechar(true); };
  const tentarFechar = React.useCallback(() => tentarFecharRef.current(), []);

  const pagina = paginaDeItens(linhas, limite);

  return (
    <Modal
      title="Distribuir pesos"
      subtitle={etapa.etapa}
      onClose={tentarFechar}
      footer={confirmaFechar && sujo ? (
        <div className="mfs-pw-rodape">
          <span className="mfs-pw-aviso"><Icon name="alert-triangle" size={16} />Você tem alterações não salvas nesta distribuição.</span>
          <button type="button" className="btn btn-ghost" onClick={() => setConfirmaFechar(false)} disabled={saving}>Voltar</button>
          <button type="button" className="btn mfs-oc-perigo" onClick={onClose} disabled={saving}>Fechar sem salvar</button>
        </div>
      ) : (
        <div className="mfs-pw-rodape">
          <button type="button" className="btn btn-ghost" onClick={tentarFechar} disabled={saving}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={salvar} disabled={saving || descendentes.length === 0}>{saving ? 'Salvando…' : 'Salvar distribuição'}</button>
        </div>
      )}
    >
      {descendentes.length === 0 ? (
        <div className="mfs-aviso">Esta tarefa não tem subtarefas para distribuir.</div>
      ) : (
        <>
          <div className="mfs-pw-resumo">
            <div><span>Valor do grupo</span><strong>{brl(valorGrupo)}</strong></div>
            <div><span>Distribuído</span><strong>{brl(total)}</strong></div>
          </div>
          <p className="mfs-nota mfs-pw-nota">Ajuste o fator peso de cada linha ou toque no valor para digitar quanto ela recebe. As outras linhas livres absorvem a diferença.</p>

          <div className="mfs-pw-controles">
            <label className="mfs-pw-unidade">
              <span>Unidade base <small>(só registro)</small></span>
              <select className="input" value={unidade} onChange={(e) => setUnidade(e.target.value)} aria-label="Unidade base">
                <option value="">Não informada</option>
                {UNIDADES_PESO.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </label>
            {grupos.length > 0 && (
              <div className="mfs-pw-expandir">
                <button type="button" className="btn btn-ghost" disabled={tudoAberto} onClick={() => setCollapsed(new Set())}>Expandir tudo</button>
                <button type="button" className="btn btn-ghost" disabled={tudoRecolhido} onClick={() => setCollapsed(new Set(grupos.map(n => n.etapa.id)))}>Recolher tudo</button>
              </div>
            )}
          </div>

          <ul className="mfs-pw-lista">
            {pagina.itens.map(no => {
              const f = no.etapa;
              const { concluida, cadeado, bloqueada } = bloqueioDaLinha(f, { childrenOf, travas });
              const podeDigitar = !bloqueada && valorEditavel(f, { childrenOf, travas, valorPai: paiDe(f) });
              const aberto = !collapsed.has(f.id);
              const valor = valorPorNo[f.id] || 0;
              return (
                <li key={f.id} className={'mfs-pw-linha' + (no.temFilhos ? ' grupo' : '') + (bloqueada ? ' bloqueada' : '')} style={{ marginLeft: Math.min(no.depth, 4) * 10 }}>
                  <div className="mfs-pw-topo">
                    {no.temFilhos ? (
                      <button type="button" className="mfs-pw-chevron" aria-expanded={aberto} aria-label={`${aberto ? 'Recolher' : 'Expandir'} ${f.etapa}`} onClick={() => setCollapsed(c => alternarEm(c, f.id))}>
                        <Icon name={aberto ? 'chevron-down' : 'chevron-right'} size={18} />
                      </button>
                    ) : <span className="mfs-pw-espaco" />}
                    <span className="mfs-pw-nome">{f.etapa}</span>
                    <button type="button" className="mfs-pw-retirar" aria-label={`Retirar ${f.etapa} da distribuição`} onClick={() => retirar(f.id)}><Icon name="x" size={18} /></button>
                  </div>
                  <div className="mfs-pw-campos">
                    <label className="mfs-pw-peso">
                      <span>Peso</span>
                      <input
                        type="number" min="0" step="any" inputMode="decimal" className="input" aria-label={`Fator peso de ${f.etapa}`}
                        value={pesos[f.id] ?? ''} disabled={bloqueada} onChange={(e) => setPeso(f.id, e.target.value)}
                      />
                    </label>
                    <button
                      type="button" className={'mfs-pw-cadeado' + (cadeado ? ' ligado' : '')} aria-pressed={cadeado} disabled={concluida}
                      aria-label={concluida ? `${f.etapa}: concluída, já travada` : `${cadeado ? 'Destravar' : 'Travar'} o peso de ${f.etapa}`}
                      onClick={() => setTravas(t => alternarEm(t, f.id))}
                    >
                      <Icon name={cadeado ? 'lock' : 'unlock'} size={18} />
                    </button>
                    {editandoValor === f.id ? (
                      <input
                        autoFocus type="text" inputMode="decimal" className="input mono mfs-pw-valor-campo" aria-label={`Valor de ${f.etapa} em reais`}
                        defaultValue={valorParaCampo(valor)} onFocus={(e) => e.target.select()}
                        onBlur={(e) => confirmarValor(f, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
                          if (e.key === 'Escape') { e.preventDefault(); setEditandoValor(null); }
                        }}
                      />
                    ) : podeDigitar ? (
                      <button type="button" className="mfs-pw-valor editavel" aria-label={`Digitar o valor de ${f.etapa}: ${brl(valor)}`} onClick={() => setEditandoValor(f.id)}>
                        {brl(valor)}<Icon name="edit" size={14} />
                      </button>
                    ) : (
                      <span className="mfs-pw-valor">{brl(valor)}</span>
                    )}
                  </div>
                  {bloqueada && (
                    <small className="mfs-pw-motivo">
                      {concluida ? (no.temFilhos ? 'Todas as subtarefas estão concluídas: peso travado' : 'Tarefa concluída: peso e valor travados') : 'Peso travado no cadeado'}
                    </small>
                  )}
                </li>
              );
            })}
          </ul>
          {pagina.restantes > 0 && (
            <button type="button" className="btn btn-ghost mfs-oc-mais" onClick={() => setLimite(l => l + PAGINA)}>Mostrar mais ({pagina.restantes} restantes)</button>
          )}
          <div className="mfs-pw-total"><span>Total distribuído</span><strong>{brl(total)}</strong></div>

          {removidos.size > 0 && (
            <div className="mfs-oc-bloco mfs-pw-retiradas">
              <div className="mfs-oc-bloco-titulo">Retiradas da distribuição</div>
              <div className="mfs-pw-chips">
                {[...removidos].map(id => {
                  const no = descendentes.find(n => n.etapa.id === id);
                  if (!no) return null;
                  return (
                    <button key={id} type="button" className="btn btn-ghost mfs-pw-chip" aria-label={`Adicionar ${no.etapa.etapa} de volta à distribuição`} onClick={() => readicionar(id)}>
                      <Icon name="plus" size={14} />{no.etapa.etapa}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {divergencia.tem && (
            <div className="mfs-pw-diverge" role="alert">
              <Icon name="alert-triangle" size={16} />
              <span>{brl(Math.abs(divergencia.valor))} do grupo não chegou a nenhuma subtarefa: há um conjunto de irmãs com todos os pesos zerados.</span>
            </div>
          )}
        </>
      )}
    </Modal>
  );
};

export { DistribuirPesosMobile };
