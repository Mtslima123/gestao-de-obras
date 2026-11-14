import React from 'react';
import { Icon } from '../../../../components/Icons';
import { Modal } from '../../../../components/Modals';
import { corSaldo, status, usoPct } from '../../../maoDeObra/efetivo/regras';
import { T, corUi } from '../../../maoDeObra/efetivo/tokens';
import { GRUPOS } from '../../../maoDeObra/efetivo/efetivoStore';
import { funcoesDaOpcao, serieProjecao } from '../../../maoDeObra/efetivo/analisePure';
import {
  fmt1, fmtSaldo, n2, saldoAnalise, escalaDoGrafico, alturaPct, larguraDoGrafico, detalheProjecao, detalheEvolucao, legendaDoAcumulado, filtrarOpcoes,
} from './maoDeObraMobilePure';
import { Kpis, Pilula, Segmentado, okUi } from './maoDeObraMobileUi';

const FATIA = 44; // largura de cada mês nos gráficos (px); 12 meses passam da tela e o gráfico rola

// Gráfico que rola na horizontal e já abre no mês selecionado (no desktop ele cabe inteiro, aqui não).
const AreaRolavel = ({ nMeses, indiceAtual, children }) => {
  const ref = React.useRef(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el || indiceAtual < 0) return;
    el.scrollLeft = Math.max(0, indiceAtual * FATIA - el.clientWidth / 2 + FATIA / 2);
  }, [indiceAtual, nMeses]);
  return (
    <div className="mfs-mo-grafico" ref={ref}>
      <div className="mfs-mo-grafico-trilho" style={{ width: larguraDoGrafico(nMeses, FATIA) }}>{children}</div>
    </div>
  );
};

const Legenda = ({ itens }) => (
  <div className="mfs-mo-legenda">
    {itens.map((i) => (
      <span key={i.texto} className="mfs-mo-legenda-item"><i style={i.estilo} />{i.texto}</span>
    ))}
  </div>
);

// Seletor de função/classificação do gráfico de projeção, em folha com busca (o do desktop é um dropdown com busca).
const SeletorDeFuncao = ({ opcoes, valor, onEscolher, onClose }) => {
  const [busca, setBusca] = React.useState('');
  const lista = filtrarOpcoes(opcoes, busca);
  return (
    <Modal title="Função ou classificação" size="sm" onClose={onClose}>
      <input autoFocus type="search" className="input mfs-busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Digite para buscar…" aria-label="Buscar função" />
      <div className="mfs-mo-opcoes" role="listbox">
        {lista.length === 0 && <span className="mfs-aviso">Nenhuma função encontrada</span>}
        {lista.map((o) => (
          <button key={o} type="button" role="option" aria-selected={o === valor} className={'mfs-mo-opcao' + (o === valor ? ' ativa' : '')} onClick={() => onEscolher(o)}>{o}</button>
        ))}
      </div>
    </Modal>
  );
};

// Realizado x projeção até o término da obra. Sem hover no celular: tocar numa barra mostra os números do mês abaixo.
const GraficoProjecao = ({ s, mesSel, meses, opcoes, atual, onSel }) => {
  const [aberto, setAberto] = React.useState(false);
  const [destaque, setDestaque] = React.useState(null);
  if (!atual) {
    return <section className="mfs-mo-secao"><span className="mfs-mo-sub">Cadastre o previsto para ver o gráfico de realizado e projeção.</span></section>;
  }
  const fs = funcoesDaOpcao(s, atual);
  const { tot, cons, saldo: saldoV, rest, proj, qtd, pts } = serieProjecao(s, fs, mesSel, meses);
  const mx = escalaDoGrafico(pts.flatMap((p) => [p.v, p.prev]), 1.12);
  const indiceAtual = pts.findIndex((p) => p.m.abs === mesSel.abs);
  const sel = destaque != null ? pts[destaque] : null;

  return (
    <section className="mfs-mo-secao">
      <h2 className="mfs-mo-titulo">Realizado e projeção até o término da obra</h2>
      <button type="button" className="mfs-mo-seletor" aria-haspopup="listbox" onClick={() => setAberto(true)}>
        <span>{atual}</span><Icon name="chevron-down" size={16} stroke={2.2} />
      </button>
      <Kpis itens={[
        { rotulo: 'Orçado', valor: fmt1(tot) },
        { rotulo: `Realizado até ${mesSel.label}`, valor: fmt1(cons), cor: T.azul },
        { rotulo: 'Saldo', valor: fmtSaldo(saldoV), cor: corUi(corSaldo(saldoV)) },
        { rotulo: `Projeção/mês (${rest} ${rest === 1 ? 'mês' : 'meses'})`, valor: rest ? fmt1(proj) : '—', cor: rest && proj < qtd - 0.05 ? T.vermelho : T.texto },
      ]} />
      <AreaRolavel nMeses={pts.length} indiceAtual={indiceAtual}>
        <div className="mfs-mo-barras">
          {pts.map((p, i) => (
            <button key={p.m.abs} type="button" aria-label={detalheProjecao(p)} onClick={() => setDestaque(i)}
              className={'mfs-mo-slot' + (p.m.abs === mesSel.abs ? ' atual' : '') + (destaque === i ? ' destaque' : '')}>
              {p.prev > 0 && <span className="mfs-mo-prev" style={{ bottom: `${alturaPct(p.prev, mx)}%` }} />}
              <span className="mfs-mo-valor" style={{ color: p.past ? T.texto : T.azul }}>{fmt1(p.v)}</span>
              <span className={'mfs-mo-barra ' + (p.past ? 'real' : 'proj')} style={{ height: `${alturaPct(p.v, mx)}%` }} />
            </button>
          ))}
        </div>
        <div className="mfs-mo-rotulos">
          {pts.map((p) => <span key={p.m.abs} className={p.m.abs === mesSel.abs ? 'atual' : ''}>{p.m.label}</span>)}
        </div>
      </AreaRolavel>
      <p className="mfs-mo-detalhe" aria-live="polite">{sel ? detalheProjecao(sel) : 'Toque numa barra para ver os números do mês.'}</p>
      <Legenda itens={[
        { texto: 'Realizado (última apropriação do mês)', estilo: { background: T.azul } },
        { texto: 'Projeção (saldo ÷ meses restantes)', estilo: { background: T.projecao, border: `1.5px dashed ${T.azul}` } },
        { texto: 'Previsto do orçamento', estilo: { background: T.texto, height: 2, borderRadius: 0 } },
      ]} />
      {aberto && <SeletorDeFuncao opcoes={opcoes} valor={atual} onEscolher={(o) => { onSel(o); setDestaque(null); setAberto(false); }} onClose={() => setAberto(false)} />}
    </section>
  );
};

// Previsto x efetivo de cada mês até o mês corrente. Tocar num mês com apropriação lançada troca o período (como o clique
// na barra do desktop).
const GraficoEvolucao = ({ evo, mesSel, lancados, setMesSel }) => {
  const [destaque, setDestaque] = React.useState(null);
  const mxE = escalaDoGrafico(evo.flatMap((x) => [x.p, x.e]), 1.08);
  const indiceAtual = evo.findIndex((x) => x.m.abs === mesSel.abs);
  const sel = destaque != null ? evo[destaque] : null;
  const tocar = (x, i) => { setDestaque(i); if (lancados.has(x.m.abs)) setMesSel(x.m); };
  return (
    <section className="mfs-mo-secao">
      <h2 className="mfs-mo-titulo">Evolução do efetivo</h2>
      {evo.length === 0 ? (
        <span className="mfs-mo-sub">A obra ainda não começou.</span>
      ) : (
        <>
          <AreaRolavel nMeses={evo.length} indiceAtual={indiceAtual}>
            <div className="mfs-mo-barras">
              {evo.map((x, i) => (
                <button key={x.m.abs} type="button" aria-label={detalheEvolucao(x)} onClick={() => tocar(x, i)}
                  className={'mfs-mo-slot duplo' + (x.m.abs === mesSel.abs ? ' atual' : '') + (destaque === i ? ' destaque' : '')}>
                  <span className="mfs-mo-valor">{x.e}</span>
                  <span className="mfs-mo-par">
                    <span className="mfs-mo-barra previsto" style={{ height: `${alturaPct(x.p, mxE)}%` }} />
                    <span className="mfs-mo-barra efetivo" style={{ height: `${alturaPct(x.e, mxE)}%` }} />
                  </span>
                </button>
              ))}
            </div>
            <div className="mfs-mo-rotulos">
              {evo.map((x) => <span key={x.m.abs} className={x.m.abs === mesSel.abs ? 'atual' : ''}>{x.m.label}</span>)}
            </div>
          </AreaRolavel>
          <p className="mfs-mo-detalhe" aria-live="polite">{sel ? detalheEvolucao(sel) : 'Toque num mês para ver os números. Mês com apropriação lançada troca o período.'}</p>
          <Legenda itens={[
            { texto: 'Previsto', estilo: { background: T.previsto } },
            { texto: 'Efetivo', estilo: { background: T.azul } },
          ]} />
        </>
      )}
    </section>
  );
};

// Efetivo do mês por função (ou classificação), uma linha da tabela do desktop por cartão.
const CartaoDeEfetivo = ({ l, mx }) => {
  const ui = okUi(status(l.p, l.m));
  return (
    <li className="mfs-mo-cartao">
      <div className="mfs-mo-cartao-topo">
        <strong className="mfs-mo-cartao-nome">{l.nome}</strong>
        <Pilula cor={ui.cor} fundo={ui.fundo} ponto>{ui.rotulo}</Pilula>
      </div>
      <span className="mfs-mo-cartao-sub">{l.sub}</span>
      <dl className="mfs-mo-metricas quatro">
        <div><dt>Previsto</dt><dd>{n2(l.p)}</dd></div>
        <div><dt>1ª</dt><dd>{l.a1 ?? '—'}</dd></div>
        <div><dt>2ª</dt><dd>{l.a2 ?? '—'}</dd></div>
        <div><dt>Efetivo</dt><dd><b>{l.m ?? '—'}</b></dd></div>
      </dl>
      <div className="mfs-mo-comparar" aria-hidden="true">
        <span style={{ top: 1, background: T.previsto, width: `${alturaPct(l.p, mx)}%` }} />
        <span style={{ top: 8, background: ui.cor, width: `${alturaPct(l.m ?? 0, mx)}%` }} />
      </div>
      <div className="mfs-mo-saldos">
        <div>
          <span>Saldo do mês</span>
          <b style={{ color: l.m == null ? T.texto2 : corUi(corSaldo(l.p - l.m)) }}>{l.m == null ? '—' : saldoAnalise(l.p - l.m)}</b>
          {l.m != null && <small>uso {usoPct(l.m, l.p) ?? '—'}%</small>}
        </div>
        <div>
          <span>Saldo acumulado</span>
          <b style={{ color: l.ac == null ? T.texto2 : corUi(corSaldo(l.ac)) }}>{l.ac == null ? '—' : saldoAnalise(l.ac)}</b>
          {l.ac != null && <small>{legendaDoAcumulado(l.ac)}</small>}
        </div>
      </div>
    </li>
  );
};

// Aba Análise no celular (só leitura, como no desktop). O estado (função do gráfico, filtros, ordem) mora no AnaliseTab
// e chega por props, para o PDF exportar exatamente o que está na tela.
const AnaliseMobile = ({
  s, mesSel, setMesSel, meses, opcoes, atual, setSel, verPor, setVerPor, ordem, setOrdem, grupoF, setGrupoF,
  linhas, nA, evo, lancados, onExportarPdf,
}) => {
  const mx = Math.max(1, ...linhas.map((l) => Math.max(l.p, l.m ?? 0)));
  return (
    <div className="mfs-mo-tela">
      <button type="button" className="btn mfs-mo-exportar" onClick={onExportarPdf}><Icon name="download" size={16} stroke={2.2} />Exportar PDF</button>

      <GraficoProjecao s={s} mesSel={mesSel} meses={meses} opcoes={opcoes} atual={atual} onSel={setSel} />
      <GraficoEvolucao evo={evo} mesSel={mesSel} lancados={lancados} setMesSel={setMesSel} />

      <section className="mfs-mo-secao">
        <div>
          <h2 className="mfs-mo-titulo">{verPor === 'classificacao' ? 'Efetivo do mês por classificação' : 'Efetivo do mês por função'}</h2>
          <span className="mfs-mo-sub">Efetivo do mês = última apropriação lançada · {nA === 2 ? 'usando a 2ª' : nA === 1 ? 'usando a 1ª' : 'sem apropriações lançadas'}</span>
        </div>
        <Segmentado rotulo="Ver por" valor={verPor} onChange={setVerPor} opcoes={[['funcao', 'Por função'], ['classificacao', 'Por classificação']]} />
        <select className="input mfs-select" aria-label="Ordenar" value={ordem} onChange={(e) => setOrdem(e.target.value)}>
          <option value="grupo">Ordenar por grupo</option>
          <option value="desvio">Maior desvio (qtd)</option>
          <option value="pct">Maior desvio (%)</option>
        </select>
        <div className="mfs-mo-chips rolavel">
          {[{ id: null, nome: 'Todos' }, ...GRUPOS].map((g) => (
            <button key={g.nome} type="button" className="mfs-mo-chip" aria-pressed={grupoF === g.id} onClick={() => setGrupoF(g.id)}>{g.nome}</button>
          ))}
        </div>
        {linhas.length === 0 ? (
          <div className="mfs-aviso mfs-mo-vazio">Nenhuma função com previsto ou efetivo neste mês.</div>
        ) : (
          <ul className="mfs-mo-lista">{linhas.map((l) => <CartaoDeEfetivo key={l.nome} l={l} mx={mx} />)}</ul>
        )}
        <div className="mfs-mo-legenda">
          <span>Saldo = previsto − utilizado · acumulado em pessoa-mês desde {meses[0]?.label}</span>
          <span><b style={{ color: T.verde }}>●</b> Até 100% do previsto</span>
          <span><b style={{ color: T.vermelho }}>●</b> Acima de 100%</span>
        </div>
      </section>
    </div>
  );
};

export { AnaliseMobile };
