import React from 'react';
import { Icon } from '../../../../components/Icons';
import { Modal } from '../../../../components/Modals';
import { corSaldo, status, usoPct } from '../../../maoDeObra/efetivo/regras';
import { T, corUi } from '../../../maoDeObra/efetivo/tokens';
import { GRUPOS } from '../../../maoDeObra/efetivo/efetivoStore';
import { CampoQtd } from '../../../maoDeObra/efetivo/CampoQtd';
import {
  n2, saldoComSinal, faixaDaQuinzena, textoDaQuinzena, CAMPOS_APROPRIACAO, valorDoCampo, patchDoCampo, idsNaOrdemDaTela, vizinhasDaFuncao,
} from './maoDeObraMobilePure';
import { FolhaDeAcoes, Kpis, Pilula, Segmentado, okUi } from './maoDeObraMobileUi';

// Enter nos campos da folha pula para o próximo; no último, fecha o teclado. Com o teclado virtual do celular o
// botão "próximo" (enterKeyHint) faz o mesmo.
const irParaOProximoCampo = (e) => {
  if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
  e.preventDefault();
  const campos = [...e.currentTarget.querySelectorAll('input:not(:disabled)')];
  const i = campos.indexOf(e.target);
  if (i >= 0 && i < campos.length - 1) campos[i + 1].focus(); else e.target.blur();
};

// Folha de UMA função: todos os campos da linha da tabela do desktop, com os números calculados ao vivo no topo e
// "Anterior / Próxima" para lançar a lista em sequência sem voltar à lista. A gravação do rascunho é a do desktop: cada
// campo grava ao sair dele (blur), em fila.
const FolhaDaFuncao = ({ linha, ids, editavel, setItem, salvarRascunho, onTrocar, onClose }) => {
  const { f, it, pv, at, can, tot } = linha;
  const viz = vizinhasDaFuncao(ids, f.id);
  const ui = okUi(status(pv, at));
  const grupo = GRUPOS.find((g) => g.id === f.grupoId)?.nome;
  const chaveFinal = CAMPOS_APROPRIACAO[CAMPOS_APROPRIACAO.length - 1].chave; // no último campo o teclado mostra "ok", não "próximo"

  return (
    <Modal title={f.nome} subtitle={[grupo, f.classificacao].filter(Boolean).join(' · ')} size="sm" onClose={onClose}
      footer={<>
        <button type="button" className="btn btn-ghost" disabled={!viz.anterior} onClick={() => onTrocar(viz.anterior)}><Icon name="chevron-left" size={16} />Anterior</button>
        <button type="button" className="btn btn-ghost" disabled={!viz.proxima} onClick={() => onTrocar(viz.proxima)}>Próxima<Icon name="chevron-right" size={16} /></button>
        <button type="button" className="btn btn-primary" onClick={onClose}>Concluir</button>
      </>}>
      <div className="mfs-mo-folha-resumo">
        <Kpis itens={[
          { rotulo: 'Previsto (mês)', valor: n2(pv) },
          { rotulo: 'Total efetivo', valor: tot ?? '—' },
          { rotulo: 'Ativos', valor: at ?? '—', cor: T.azul },
          { rotulo: 'Saldo', valor: at == null ? '—' : saldoComSinal(pv - at), cor: at == null ? T.texto2 : corUi(corSaldo(pv - at)) },
        ]} />
        <Pilula cor={ui.cor} fundo={ui.fundo} ponto>{ui.rotulo}</Pilula>
      </div>
      <div className="mfs-mo-folha-campos" onKeyDown={irParaOProximoCampo}>
        {CAMPOS_APROPRIACAO.map((c) => {
          const valor = valorDoCampo(it, c.chave, can);
          const dica = c.chave === chaveFinal ? 'done' : 'next';
          return c.tipo === 'texto' ? (
            <label key={c.chave} className="mfs-mo-campo cheio"><span>{c.rotulo}</span>
              <input className="input" disabled={!editavel} value={valor ?? ''} autoComplete="off" enterKeyHint={dica}
                onChange={(e) => setItem(f.id, patchDoCampo(c, e.target.value))} onBlur={salvarRascunho} />
            </label>
          ) : (
            <label key={c.chave} className="mfs-mo-campo"><span>{c.rotulo}</span>
              <CampoQtd min={0} inputMode="numeric" enterKeyHint={dica} className={'input' + (valor < 0 ? ' negativo' : '')} disabled={!editavel} placeholder="—"
                value={valor} onChange={(e) => setItem(f.id, patchDoCampo(c, e.target.value))} onBlur={salvarRascunho} />
            </label>
          );
        })}
      </div>
      {viz.total > 0 && <p className="mfs-mo-sub mfs-mo-posicao">Função {viz.posicao} de {viz.total}</p>}
    </Modal>
  );
};

// Aba Apropriação no celular: duas quinzenas por mês, lista de funções em cartões e uma folha por função para digitar.
// Quem carrega, grava (rascunho em fila), lança e reabre é o ApropriacaoTab: mesmas regras e mesmos manipuladores do
// desktop. Os modais de conferência (importar, limpar, copiar) também continuam os dele.
const ApropriacaoMobile = ({
  s, mesSel, q, setQ, ap, locked, editavel, aguardaPrimeira, somenteLeitura, mesFechado, ultimo, estadoQ,
  salvando, rascunhoSalvo, ocupado, exportando,
  busca, setBusca, agrupar, setAgrupar, recolhidos, setRecolhidos,
  grupos, TOT, st, d,
  setItem, salvarRascunho, lancarOuReabrir, pedirCopia, pedirLimpar, baixarModelo, escolherArquivo, exportar,
}) => {
  const [aberta, setAberta] = React.useState(null); // id da função com a folha aberta
  const [acoes, setAcoes] = React.useState(false);
  const ids = React.useMemo(() => idsNaOrdemDaTela(grupos), [grupos]);
  const linhaAberta = aberta ? grupos.flatMap((g) => g.rows).find((r) => r.f.id === aberta) : null;
  const todosRecolhidos = grupos.every((g) => recolhidos[g.key]);
  const stUi = okUi(st);

  const listaDeAcoes = [
    ...(editavel && q === 2 ? [{ chave: 'copiar', rotulo: 'Copiar da 1ª', detalhe: 'Traz as quantidades da 1ª apropriação', icone: 'copy', disabled: ocupado, onClick: pedirCopia }] : []),
    ...(editavel ? [
      { chave: 'limpar', rotulo: 'Limpar', detalhe: 'Apaga o que está digitado nesta apropriação', icone: 'trash', perigo: true, disabled: ocupado || !ap?.itens.length, onClick: pedirLimpar },
      { chave: 'modelo', rotulo: 'Baixar modelo', detalhe: 'Planilha padrão com as funções da obra', icone: 'file', disabled: ocupado, onClick: baixarModelo },
      { chave: 'importar', rotulo: 'Importar efetivo (.xlsx)', detalhe: 'Substitui o que está digitado; confira antes', icone: 'upload', disabled: ocupado, arquivo: { accept: '.xlsx,.xls', onChange: escolherArquivo } },
    ] : []),
    { chave: 'pdf', rotulo: 'Exportar PDF', detalhe: `Baixa a ${q}ª apropriação como está na tela`, icone: 'download', disabled: exportando, onClick: () => exportar('pdf') },
    { chave: 'xlsx', rotulo: 'Exportar Excel', detalhe: `Baixa a ${q}ª apropriação como está na tela`, icone: 'download', disabled: exportando, onClick: () => exportar('xlsx') },
  ];

  return (
    <div className="mfs-mo-tela com-barra">
      <div className="mfs-mo-quinzenas" role="group" aria-label="Apropriação do mês">
        {[1, 2].map((n) => (
          <button key={n} type="button" aria-pressed={q === n} onClick={() => setQ(n)}>
            <strong>{n}ª Apropriação</strong>
            <span>{faixaDaQuinzena(n, ultimo)} · {estadoQ(n)}</span>
          </button>
        ))}
      </div>
      <div className="mfs-mo-estado-linha">
        <span className="mfs-mo-sub">{textoDaQuinzena({ lancadaEm: ap?.lancadaEm, lancadaPor: ap?.lancadaPor, n: q, ano: mesSel.ano, mes: mesSel.mes })}</span>
        {editavel && (salvando || rascunhoSalvo) && <span className="mfs-mo-salvo" aria-live="polite">{salvando ? 'Salvando…' : 'Rascunho salvo'}</span>}
      </div>
      {mesFechado
        ? <Pilula cor={T.texto2} fundo={T.faixa}><Icon name="lock" size={12} stroke={2.2} />Mês fechado, só consulta</Pilula>
        : locked
          ? <Pilula cor={T.texto2} fundo={T.faixa}><Icon name="lock" size={12} stroke={2.2} />Lançada e fechada</Pilula>
          : somenteLeitura ? <Pilula cor={T.texto2} fundo={T.faixa}>Somente consulta</Pilula> : null}
      {aguardaPrimeira && !locked && !mesFechado && (
        <div className="mfs-mo-alerta">
          <Icon name="lock" size={16} stroke={2.2} />
          <span>A 2ª apropriação só pode ser preenchida depois que a 1ª for lançada e fechada.</span>
          <button type="button" onClick={() => setQ(1)}>Ir para a 1ª apropriação</button>
        </div>
      )}

      <Kpis itens={[
        { rotulo: 'Previsto (mês)', valor: n2(TOT.prev) },
        { rotulo: 'Ativos', valor: TOT.any ? TOT.at : '—', cor: T.azul },
        { rotulo: 'Saldo', valor: TOT.any ? saldoComSinal(-d) : '—', cor: TOT.any ? corUi(corSaldo(-d)) : T.texto2 },
        { rotulo: 'Uso do previsto', valor: TOT.any ? `${usoPct(TOT.at, TOT.prev) ?? '—'}%` : '—', cor: TOT.any ? stUi.cor : T.texto2 },
      ]} />

      <div className="mfs-mo-controles">
        <input type="search" className="input mfs-busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar função…" aria-label="Buscar função" />
        <div className="mfs-mo-linha-controles">
          <Segmentado rotulo="Agrupar por" valor={agrupar} onChange={setAgrupar} opcoes={[['grupo', 'Por grupo'], ['classificacao', 'Por classificação']]} />
          <button type="button" className="mfs-mo-texto-botao" disabled={!grupos.length}
            onClick={() => setRecolhidos(Object.fromEntries(grupos.map((g) => [g.key, !todosRecolhidos])))}>
            {todosRecolhidos ? 'Expandir grupos' : 'Recolher grupos'}
          </button>
        </div>
      </div>

      {grupos.length === 0 && <div className="mfs-aviso mfs-mo-vazio">Nenhuma função encontrada.</div>}

      {grupos.map(({ key, nome, rows, G }) => (
        <section key={key} className="mfs-mo-grupo">
          <button type="button" className="mfs-mo-grupo-cab" aria-expanded={!recolhidos[key]} onClick={() => setRecolhidos((r) => ({ ...r, [key]: !r[key] }))}>
            <Icon name={recolhidos[key] ? 'chevron-right' : 'chevron-down'} size={18} stroke={2.4} />
            <strong>{nome}</strong>
            <span className="mfs-mo-grupo-qtd">{rows.length}</span>
            <span className="mfs-mo-grupo-nums">
              Previsto {n2(G.prev)} · Ativos {G.any ? G.at : '—'} · Saldo {G.any ? <b style={{ color: corUi(corSaldo(G.prev - G.at)) }}>{saldoComSinal(G.prev - G.at)}</b> : '—'}
            </span>
          </button>
          {!recolhidos[key] && (
            <ul className="mfs-mo-lista">
              {rows.map((linha) => {
                const { f, pv, at, tot } = linha;
                const ui = okUi(status(pv, at));
                return (
                  <li key={f.id}>
                    <button type="button" className="mfs-mo-cartao mfs-mo-func" onClick={() => setAberta(f.id)}>
                      <span className="mfs-mo-func-corpo">
                        <span className="mfs-mo-cartao-topo">
                          <strong className="mfs-mo-cartao-nome">{f.nome}</strong>
                          <Pilula cor={ui.cor} fundo={ui.fundo} ponto>{ui.rotulo}</Pilula>
                        </span>
                        {agrupar === 'grupo' && f.classificacao && <span className="mfs-mo-cartao-sub">{f.classificacao}</span>}
                        <dl className="mfs-mo-metricas quatro">
                          <div><dt>Previsto</dt><dd>{n2(pv)}</dd></div>
                          <div><dt>Total</dt><dd>{tot ?? '—'}</dd></div>
                          <div><dt>Ativos</dt><dd><b style={{ color: T.azul }}>{at ?? '—'}</b></dd></div>
                          <div><dt>Saldo</dt><dd style={{ color: at == null ? T.texto2 : corUi(corSaldo(pv - at)) }}>{at == null ? '—' : saldoComSinal(pv - at)}</dd></div>
                        </dl>
                      </span>
                      <Icon name="chevron-right" size={18} stroke={2.2} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}

      {grupos.length > 0 && (
        <section className="mfs-mo-secao mfs-mo-totais">
          <h2 className="mfs-mo-titulo">Total</h2>
          <dl className="mfs-mo-metricas quatro">
            <div><dt>Previsto</dt><dd>{n2(TOT.prev)}</dd></div>
            <div><dt>Total efetivo</dt><dd>{TOT.totalEfetivo}</dd></div>
            <div><dt>Trab. ADM</dt><dd>{TOT.trabAdm}</dd></div>
            <div><dt>Canteiro</dt><dd>{TOT.can}</dd></div>
            <div><dt>INSS/Seguro</dt><dd>{TOT.inssSeguro}</dd></div>
            <div><dt>Férias</dt><dd>{TOT.ferias}</dd></div>
            <div><dt>Emprest./Manut.</dt><dd>{TOT.emprestManut}</dd></div>
            <div><dt>Recebido outra obra</dt><dd>{TOT.recebidoOutraObra}</dd></div>
          </dl>
        </section>
      )}

      <div className="mfs-mo-legenda">
        <span>Total efetivo = trab. na ADM + trab. no canteiro + emprest./manut. (calculado, não se digita)</span>
        <span style={{ color: T.azul, fontWeight: 600 }}>Ativos = trab. na ADM + trab. no canteiro + recebido outra obra</span>
      </div>

      <div className="mfs-mo-fixa" role="region" aria-label="Ações da apropriação">
        <button type="button" className="btn btn-ghost" onClick={() => setAcoes(true)}><Icon name="dots" size={16} />Ações</button>
        {!somenteLeitura && (
          <button type="button" className="btn btn-primary" disabled={ocupado || aguardaPrimeira} onClick={lancarOuReabrir}>
            <Icon name={locked ? 'unlock' : 'lock'} size={16} stroke={2.2} />{locked ? 'Reabrir apropriação' : 'Lançar apropriação'}
          </button>
        )}
      </div>

      {acoes && <FolhaDeAcoes titulo="Ações da apropriação" acoes={listaDeAcoes} onClose={() => setAcoes(false)} />}
      {linhaAberta && (
        <FolhaDaFuncao linha={linhaAberta} ids={ids} editavel={editavel} setItem={setItem} salvarRascunho={salvarRascunho}
          onTrocar={setAberta} onClose={() => setAberta(null)} />
      )}
    </div>
  );
};

export { ApropriacaoMobile };
