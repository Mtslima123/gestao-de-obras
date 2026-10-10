import React from 'react';
import { Icon } from '../../../components/Icons';
import { STATUS_UI, classificacaoEfetiva, corSaldo, status, usoPct } from './regras';
import { T, card, h2, sub, th, td, pill, corUi } from './tokens';
import { GRUPOS, funcoesAtivas } from './efetivoStore';
import { evolucao, kpisAnalise, linhasAnalise, opcoesClassificacao, saldoPorGrupo, serieProjecao } from './analisePure';

const fmt = (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const sg = (v) => (v > 0.05 ? '+' + fmt(v) : v < -0.05 ? '−' + fmt(-v) : '0');
const mesAtualAbs = () => { const d = new Date(); return d.getFullYear() * 12 + d.getMonth(); };
const okUi = (stt) => { const u = STATUS_UI[stt]; return { cor: corUi(u.cor), fundo: corUi(u.fundo), rotulo: u.rotulo }; };

const Leg = ({ cor, t }) => <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: 5, borderRadius: 3, background: cor }} />{t}</span>;

// Aba Análise: só leitura. Efetivo do mês = última apropriação LANCADA (2ª se existir, senão
// a 1ª), nunca média; rascunho não conta.
export function AnaliseTab({ s, mesSel, setMesSel, meses }) {
  const [verPor, setVerPor] = React.useState('funcao');
  const [ordem, setOrdem] = React.useState('grupo');
  const [grupoF, setGrupoF] = React.useState(null);

  const linhas = React.useMemo(() => linhasAnalise(s, mesSel, { verPor, ordem, grupoF }), [s, mesSel, verPor, ordem, grupoF]);
  const mx = Math.max(1, ...linhas.map((l) => Math.max(l.p, l.m ?? 0)));
  const { previsto: MP, efetivo: MM, acumulado: ACT, acima, nA } = kpisAnalise(s, mesSel, linhas);

  const kpis = [
    { l: 'Previsto do mês', v: fmt(MP), s: 'pessoas (soma das funções)', c: T.texto },
    { l: 'Efetivo apropriado', v: fmt(MM), s: nA ? `última apropriação (${nA}ª)` : 'sem apropriações lançadas', c: T.azul },
    { l: 'Saldo do mês', v: sg(MP - MM), s: MP ? `uso ${usoPct(MM, MP)}% do previsto` : '', c: corUi(corSaldo(MP - MM)) },
    { l: 'Saldo acumulado', v: sg(ACT), s: `pessoa-mês não utilizada · ${meses[0]?.label} a ${mesSel.label}`, c: corUi(corSaldo(ACT)) },
    { l: 'Acima do previsto', v: String(acima), s: `de ${linhas.length} ${verPor === 'classificacao' ? 'itens' : 'funções'} com previsão ou efetivo`, c: acima ? T.vermelho : T.verde },
  ];

  const evo = React.useMemo(() => evolucao(s, meses, mesAtualAbs()), [s, meses]);
  const mxE = Math.max(1, ...evo.map((x) => Math.max(x.p, x.e))) * 1.08;
  const porGrupo = React.useMemo(() => saldoPorGrupo(s, mesSel), [s, mesSel]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16 }}>
        {kpis.map((k) => (
          <div key={k.l} style={{ ...card, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12.5, color: T.texto2 }}>{k.l}</span><span style={{ fontSize: 28, fontWeight: 600, color: k.c }}>{k.v}</span><span style={{ fontSize: 12, color: T.texto2 }}>{k.s}</span>
          </div>
        ))}
      </div>

      <GraficoProjecao s={s} mesSel={mesSel} meses={meses} />

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <section style={{ ...card, flex: '2 1 640px', minWidth: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '18px 20px', borderBottom: `1px solid ${T.borda}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h2 style={h2}>{verPor === 'classificacao' ? 'Efetivo do mês por classificação' : 'Efetivo do mês por função'}</h2>
                <span style={sub}>Efetivo do mês = última apropriação lançada · {nA === 2 ? 'usando a 2ª' : nA === 1 ? 'usando a 1ª' : 'sem apropriações lançadas'}</span>
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', border: `1px solid ${T.bordaInput}`, borderRadius: 8, overflow: 'hidden' }}>
                {['funcao', 'classificacao'].map((v) => <button key={v} type="button" onClick={() => setVerPor(v)} style={{ font: 'inherit', fontSize: 12.5, fontWeight: 500, border: 0, padding: '7px 11px', cursor: 'pointer', background: verPor === v ? T.azul : 'var(--surface)', color: verPor === v ? '#fff' : T.texto }}>{v === 'funcao' ? 'Por função' : 'Por classificação'}</button>)}
              </div>
              <select value={ordem} onChange={(e) => setOrdem(e.target.value)} style={{ font: 'inherit', fontSize: 13, padding: '7px 10px', border: `1px solid ${T.bordaInput}`, borderRadius: 8, background: 'var(--surface)', color: T.texto }}>
                <option value="grupo">Ordenar por grupo</option><option value="desvio">Maior desvio (qtd)</option><option value="pct">Maior desvio (%)</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[{ id: null, nome: 'Todos' }, ...GRUPOS].map((g) => {
                const on = grupoF === g.id;
                return <button key={g.nome} type="button" onClick={() => setGrupoF(g.id)} style={{ font: 'inherit', fontSize: 12.5, fontWeight: 500, padding: '5px 11px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${on ? T.azul : T.bordaInput}`, background: on ? T.azul : 'var(--surface)', color: on ? '#fff' : T.texto }}>{g.nome}</button>;
              })}
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 820 }}>
              <thead><tr>
                <th style={{ ...th, textAlign: 'left', paddingLeft: 20 }}>{verPor === 'classificacao' ? 'Classificação' : 'Função'}</th><th style={{ ...th, textAlign: 'right' }}>Previsto</th><th style={{ ...th, textAlign: 'right' }}>1ª</th><th style={{ ...th, textAlign: 'right' }}>2ª</th><th style={{ ...th, textAlign: 'right' }}>Efetivo</th>
                <th style={{ ...th, width: 180, textAlign: 'left' }}>Efetivo x previsto</th><th style={{ ...th, textAlign: 'right' }}>Saldo mês</th><th style={{ ...th, textAlign: 'right', background: T.grupo }}>Saldo acum.</th><th style={{ ...th, textAlign: 'left', paddingRight: 20 }}>Status</th>
              </tr></thead>
              <tbody>
                {linhas.length === 0 && <tr><td colSpan={9} style={{ ...td, padding: 24, color: T.texto2 }}>Nenhuma função com previsto ou efetivo neste mês.</td></tr>}
                {linhas.map((l) => {
                  const ui = okUi(status(l.p, l.m));
                  return (
                    <tr key={l.nome}>
                      <td style={{ ...td, textAlign: 'left', paddingLeft: 20 }}><div style={{ fontWeight: 500 }}>{l.nome}</div><div style={{ fontSize: 11.5, color: T.texto3 }}>{l.sub}</div></td>
                      <td style={{ ...td, textAlign: 'right' }}>{l.p}</td><td style={{ ...td, textAlign: 'right', color: T.texto2 }}>{l.a1 ?? '—'}</td><td style={{ ...td, textAlign: 'right', color: T.texto2 }}>{l.a2 ?? '—'}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{l.m ?? '—'}</td>
                      <td style={{ ...td, padding: '8px 14px' }}><div style={{ position: 'relative', height: 16 }}>
                        <div style={{ position: 'absolute', left: 0, top: 2, height: 5, borderRadius: 3, background: T.previsto, width: `${(l.p / mx) * 100}%` }} />
                        <div style={{ position: 'absolute', left: 0, top: 9, height: 5, borderRadius: 3, background: ui.cor, width: `${((l.m ?? 0) / mx) * 100}%` }} />
                      </div></td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: l.m == null ? T.texto2 : corUi(corSaldo(l.p - l.m)) }}>{l.m == null ? '—' : sg(l.p - l.m)}<div style={{ fontSize: 11.5, fontWeight: 400 }}>{l.m == null ? '' : `uso ${usoPct(l.m, l.p) ?? '—'}%`}</div></td>
                      <td style={{ ...td, textAlign: 'right', background: T.colSaldo }}><b style={{ color: l.ac == null ? T.texto2 : corUi(corSaldo(l.ac)) }}>{l.ac == null ? '—' : sg(l.ac)}</b><div style={{ fontSize: 11.5, color: T.texto2 }}>{l.ac == null ? '' : l.ac > 0.05 ? 'não utilizado' : l.ac < -0.05 ? 'excedido' : 'zerado'}</div></td>
                      <td style={{ ...td, textAlign: 'left', paddingRight: 20 }}><span style={pill(ui.cor, ui.fundo)}><span style={{ width: 6, height: 6, borderRadius: '50%', background: ui.cor }} />{ui.rotulo}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 16, padding: '12px 20px', borderTop: `1px solid ${T.borda}`, fontSize: 12, color: T.texto2, flexWrap: 'wrap' }}>
            <Leg cor={T.previsto} t="Previsto" /><Leg cor={T.verde} t="Até 100% do previsto" /><Leg cor={T.vermelho} t="Acima de 100%" />
            <span>Saldo = previsto − utilizado · acumulado em pessoa-mês desde {meses[0]?.label}</span>
          </div>
        </section>

        <div style={{ flex: '1 1 340px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <section style={{ ...card, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <h2 style={h2}>Evolução do efetivo</h2>
              <span style={{ display: 'flex', gap: 10, fontSize: 12, color: T.texto2 }}><Leg cor={T.previsto} t="Previsto" /><Leg cor={T.azul} t="Efetivo" /></span>
            </div>
            {evo.length === 0
              ? <span style={{ fontSize: 13, color: T.texto2 }}>A obra ainda não começou.</span>
              : <>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 170, borderBottom: `1px solid ${T.bordaInput}` }}>
                  {evo.map((x) => (
                    <div key={x.m.abs} onClick={() => setMesSel(x.m)} title={`${x.m.label}: previsto ${x.p}, efetivo ${x.e}`} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 4, cursor: 'pointer', borderRadius: 6, background: x.m.abs === mesSel.abs ? T.destaque : 'transparent' }}>
                      <span style={{ fontSize: 11, fontWeight: 600 }}>{x.e}</span>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, width: '100%', justifyContent: 'center', height: '80%' }}>
                        <div style={{ width: '38%', maxWidth: 16, borderRadius: '3px 3px 0 0', background: T.previsto, height: `${(x.p / mxE) * 100}%` }} />
                        <div style={{ width: '38%', maxWidth: 16, borderRadius: '3px 3px 0 0', background: T.azul, height: `${(x.e / mxE) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>{evo.map((x) => <span key={x.m.abs} style={{ flex: 1, textAlign: 'center', fontSize: 11.5, color: T.texto2, fontWeight: x.m.abs === mesSel.abs ? 700 : 400 }}>{x.m.label}</span>)}</div>
              </>}
          </section>
          <section style={{ ...card, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><h2 style={h2}>Saldo por grupo</h2><span style={{ fontSize: 12, color: T.texto2 }}>efetivo / previsto · saldo acum.</span></div>
            {porGrupo.map(({ g, p, m, ac }) => (
              <div key={g.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', gap: 12, alignItems: 'center', fontSize: 13, padding: '6px 0', borderTop: `1px solid ${T.linha}` }}>
                <span>{g.nome}</span><span style={{ color: T.texto2, fontSize: 12 }}>{m} / {p}</span><b style={{ color: corUi(corSaldo(ac)), minWidth: 52, textAlign: 'right' }}>{sg(ac)}</b>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}

/* ---------- Gráfico realizado x projeção ---------- */
function GraficoProjecao({ s, mesSel, meses }) {
  const funcoes = funcoesAtivas(s);
  const opcoes = React.useMemo(() => opcoesClassificacao(s), [s.funcoes, s.previsto]); // eslint-disable-line react-hooks/exhaustive-deps
  const [sel, setSel] = React.useState('Carpinteiro');
  const atual = opcoes.includes(sel) ? sel : opcoes[0];
  const fs = funcoes.filter((f) => classificacaoEfetiva(f) === atual);
  const { tot, cons, saldo: saldoV, rest, proj, qtd, pts } = serieProjecao(s, fs, mesSel, meses);
  const mx = Math.max(1, ...pts.map((p) => Math.max(p.v, p.prev))) * 1.12;
  const fim = meses[meses.length - 1];

  if (!atual) {
    return <section style={{ ...card, padding: '18px 20px', fontSize: 13, color: T.texto2 }}>Cadastre o previsto para ver o gráfico de realizado e projeção.</section>;
  }
  return (
    <section style={{ ...card, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={h2}>Realizado e projeção até o término da obra</h2>
          <span style={sub}>{fs.length > 1 ? `${atual} · ${fs.map((f) => f.nome).join(' + ')}` : atual} · meses até {mesSel.label} mostram o realizado; depois, o saldo distribuído até {fim?.label}</span>
        </div>
        <div style={{ flex: 1 }} />
        <ClassificacaoSelect opcoes={opcoes} valor={atual} onChange={setSel} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
        {[
          { l: 'Orçado', v: fmt(tot), c: T.texto },
          { l: `Realizado até ${mesSel.label}`, v: fmt(cons), c: T.azul },
          { l: 'Saldo', v: (saldoV < 0 ? '−' : '') + fmt(Math.abs(saldoV)), c: corUi(corSaldo(saldoV)) },
          { l: `Projeção/mês (${rest} ${rest === 1 ? 'mês' : 'meses'})`, v: rest ? fmt(proj) : '—', c: rest && proj < qtd - 0.05 ? T.vermelho : T.texto },
        ].map((k) => (
          <div key={k.l} style={{ border: `1px solid ${T.borda}`, borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 12, color: T.texto2 }}>{k.l}</span><span style={{ fontSize: 20, fontWeight: 600, color: k.c }}>{k.v}</span></div>
        ))}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 640, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 200, borderBottom: `1px solid ${T.bordaInput}` }}>
            {pts.map((p) => (
              <div key={p.m.abs} title={`${p.m.label}: ${p.past ? 'realizado' : 'projeção'} ${fmt(p.v)} · previsto ${p.prev}`} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 3, background: p.m.abs === mesSel.abs ? T.destaque : 'transparent', borderRadius: '6px 6px 0 0', position: 'relative' }}>
                {p.prev > 0 && <div style={{ position: 'absolute', left: '12%', right: '12%', height: 2, background: T.texto, bottom: `${(p.prev / mx) * 100}%`, zIndex: 1 }} />}
                <span style={{ fontSize: 10.5, fontWeight: 600, color: p.past ? T.texto : T.azul }}>{fmt(p.v)}</span>
                <div style={{ position: 'relative', width: '70%', maxWidth: 28, height: `${(p.v / mx) * 100}%`, background: p.past ? T.azul : T.projecao, border: p.past ? 0 : `1.5px dashed ${T.azul}`, borderBottom: 0, borderRadius: '3px 3px 0 0', boxSizing: 'border-box' }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>{pts.map((p) => <span key={p.m.abs} style={{ flex: 1, textAlign: 'center', fontSize: 10.5, color: p.m.abs === mesSel.abs ? T.azul : T.texto3, fontWeight: p.m.abs === mesSel.abs ? 700 : 500 }}>{p.m.label}</span>)}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: T.texto2, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 2, background: T.azul }} />Realizado (última apropriação do mês)</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 2, background: T.projecao, border: `1.5px dashed ${T.azul}`, boxSizing: 'border-box' }} />Projeção (saldo ÷ meses restantes)</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: 2, background: T.texto }} />Previsto do orçamento</span>
      </div>
    </section>
  );
}

// Seletor que sempre abre para baixo, com busca, ordem alfabética, Enter escolhe o 1º e Esc fecha.
function ClassificacaoSelect({ opcoes, valor, onChange }) {
  const [aberto, setAberto] = React.useState(false);
  const [q, setQ] = React.useState('');
  const ref = React.useRef(null);
  React.useEffect(() => {
    const f = (e) => { if (!ref.current?.contains(e.target)) { setAberto(false); setQ(''); } };
    document.addEventListener('mousedown', f);
    return () => document.removeEventListener('mousedown', f);
  }, []);
  const lista = opcoes.filter((o) => !q.trim() || o.toLowerCase().includes(q.trim().toLowerCase()));
  const escolher = (o) => { onChange(o); setAberto(false); setQ(''); };
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setAberto((a) => !a)} aria-haspopup="listbox" style={{ font: 'inherit', fontSize: 13, fontWeight: 600, color: T.texto, padding: '8px 12px', border: `1px solid ${T.bordaInput}`, borderRadius: 8, background: 'var(--surface)', width: 260, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, cursor: 'pointer' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{valor}</span><Icon name="chevron-down" size={14} stroke={2.2} />
      </button>
      {aberto && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, width: 260, background: 'var(--surface)', border: `1px solid ${T.bordaInput}`, borderRadius: 10, boxShadow: '0 10px 30px rgba(15,27,45,.15)', zIndex: 10, overflow: 'hidden' }}>
          <div style={{ padding: 8, borderBottom: `1px solid ${T.linha}` }}>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Digite para buscar…"
              onKeyDown={(e) => { if (e.key === 'Enter' && lista[0]) escolher(lista[0]); if (e.key === 'Escape') { setAberto(false); setQ(''); } }}
              style={{ font: 'inherit', fontSize: 13, width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: `1px solid ${T.bordaInput}`, borderRadius: 7, background: 'var(--surface)', color: T.texto }} />
          </div>
          <div role="listbox" style={{ maxHeight: 280, overflowY: 'auto', padding: 4, display: 'flex', flexDirection: 'column' }}>
            {lista.length === 0 && <span style={{ fontSize: 13, color: T.texto3, padding: '8px 10px' }}>Nenhuma classificação encontrada</span>}
            {lista.map((o) => (
              <button key={o} type="button" role="option" aria-selected={o === valor} onClick={() => escolher(o)} style={{ font: 'inherit', fontSize: 13, textAlign: 'left', border: 0, borderRadius: 6, padding: '8px 10px', cursor: 'pointer', background: o === valor ? T.azulClaro : 'transparent', color: o === valor ? T.azul : T.texto, fontWeight: o === valor ? 600 : 400 }}>{o}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
