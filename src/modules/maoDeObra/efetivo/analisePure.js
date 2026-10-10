// Cálculos da aba Análise (sem React, para teste). Porte direto de react/AnaliseTab.tsx do
// handoff; as fórmulas vêm de ./regras (fonte da verdade) e do efetivoStore (que só conta
// quinzena LANCADA).
import { classificacaoEfetiva, mesesRestantes, orcado, status } from './regras';
import { GRUPOS, ativosQ, consumidoAte, efetivoMes, funcoesAtivas, prevDe, previstoMes, saldoAcumulado } from './efetivoStore';

const soma = (fs, fn) => {
  const v = fs.map(fn).filter((x) => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
};

const nomeGrupo = (id) => GRUPOS.find((g) => g.id === id)?.nome ?? '';

// Unidades da tabela: uma por função, ou uma por classificação (funções somadas).
export const unidadesAnalise = (s, verPor) => {
  const funcoes = funcoesAtivas(s);
  if (verPor === 'funcao') {
    return funcoes.map((f) => ({ nome: f.nome, sub: nomeGrupo(f.grupoId) + (f.classificacao ? ` · ${f.classificacao}` : ''), fs: [f] }));
  }
  return [...new Set(funcoes.map(classificacaoEfetiva))].map((c) => {
    const fs = funcoes.filter((f) => classificacaoEfetiva(f) === c);
    return { nome: c, sub: fs.length > 1 ? 'Classificação · ' + fs.map((f) => f.nome).join(' + ') : nomeGrupo(fs[0].grupoId), fs };
  });
};

// Linhas da tabela "Efetivo do mês". p = previsto do mês; a1/a2 = ativos de cada quinzena
// lançada; m = efetivo do mês (última lançada); ac = saldo acumulado.
export const linhasAnalise = (s, mesSel, { verPor = 'funcao', ordem = 'grupo', grupoF = null } = {}) => {
  let linhas = unidadesAnalise(s, verPor)
    .filter((u) => !grupoF || u.fs.some((f) => f.grupoId === grupoF))
    .map((u) => ({
      ...u,
      p: soma(u.fs, (f) => previstoMes(s, f.id, mesSel)) ?? 0,
      a1: soma(u.fs, (f) => ativosQ(s, f.id, mesSel, 1)),
      a2: soma(u.fs, (f) => ativosQ(s, f.id, mesSel, 2)),
      m: soma(u.fs, (f) => efetivoMes(s, f.id, mesSel)),
      ac: soma(u.fs, (f) => saldoAcumulado(s, f.id, mesSel)),
    }))
    .filter((l) => l.p > 0 || (l.m ?? 0) > 0);
  if (ordem === 'desvio') linhas = [...linhas].sort((a, b) => Math.abs((b.m ?? 0) - b.p) - Math.abs((a.m ?? 0) - a.p));
  if (ordem === 'pct') {
    const r = (l) => (l.p ? Math.abs(((l.m ?? 0) - l.p) / l.p) : (l.m ?? 0) > 0 ? 9 : 0);
    linhas = [...linhas].sort((a, b) => r(b) - r(a));
  }
  return linhas;
};

// KPIs do topo. nA = quantas quinzenas lançadas existem no mês (0, 1 ou 2).
export const kpisAnalise = (s, mesSel, linhas) => {
  const funcoes = funcoesAtivas(s);
  const previsto = linhas.reduce((a, l) => a + l.p, 0);
  const efetivo = linhas.reduce((a, l) => a + (l.m ?? 0), 0);
  const acumulado = funcoes.reduce((a, f) => a + (saldoAcumulado(s, f.id, mesSel) ?? 0), 0);
  const acima = linhas.filter((l) => status(l.p, l.m) !== 'ok' && l.m != null).length;
  const nA = (funcoes.some((f) => ativosQ(s, f.id, mesSel, 1) != null) ? 1 : 0) + (funcoes.some((f) => ativosQ(s, f.id, mesSel, 2) != null) ? 1 : 0);
  return { previsto, efetivo, acumulado, acima, nA };
};

// Evolução: previsto x efetivo de cada mês, do início da obra até o mês corrente.
export const evolucao = (s, meses, ateAbs) => {
  const funcoes = funcoesAtivas(s);
  return meses.filter((m) => m.abs <= ateAbs).map((m) => ({
    m,
    p: funcoes.reduce((a, f) => a + previstoMes(s, f.id, m), 0),
    e: funcoes.reduce((a, f) => a + (efetivoMes(s, f.id, m) ?? 0), 0),
  }));
};

// Saldo por grupo no mês selecionado.
export const saldoPorGrupo = (s, mesSel) => {
  const funcoes = funcoesAtivas(s);
  return GRUPOS.map((g) => {
    const fs = funcoes.filter((f) => f.grupoId === g.id);
    return {
      g,
      p: fs.reduce((a, f) => a + previstoMes(s, f.id, mesSel), 0),
      m: fs.reduce((a, f) => a + (efetivoMes(s, f.id, mesSel) ?? 0), 0),
      ac: fs.reduce((a, f) => a + (saldoAcumulado(s, f.id, mesSel) ?? 0), 0),
    };
  }).filter((x) => x.p || x.m);
};

// Opções do seletor do gráfico: classificações efetivas com previsto ou classificação própria
// cadastrada, em ordem alfabética.
export const opcoesClassificacao = (s) =>
  [...new Set(funcoesAtivas(s)
    .filter((f) => (prevDe(s, f.id)?.qtdMes ?? 0) > 0 || f.classificacao)
    .map(classificacaoEfetiva))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

// Série do gráfico "Realizado e projeção até o término da obra" para as funções fs:
//  - meses até o selecionado: valor = Σ efetivo do mês (realizado)
//  - meses depois: valor = max(0, saldo ÷ meses restantes), constante (projeção)
//  - prev = Σ previsto do mês (traço preto)
export const serieProjecao = (s, fs, mesSel, meses) => {
  const tot = fs.reduce((a, f) => { const p = prevDe(s, f.id); return a + (p ? orcado(p) : 0); }, 0);
  const cons = fs.reduce((a, f) => a + consumidoAte(s, f.id, mesSel), 0);
  const saldoV = tot - cons;
  const rest = mesesRestantes(mesSel.iso, s.obra.termino);
  const proj = rest ? saldoV / rest : 0;
  const qtd = fs.reduce((a, f) => a + (prevDe(s, f.id)?.qtdMes ?? 0), 0);
  const pts = meses.map((m) => ({
    m,
    prev: fs.reduce((a, f) => a + previstoMes(s, f.id, m), 0),
    past: m.abs <= mesSel.abs,
    v: m.abs <= mesSel.abs ? fs.reduce((a, f) => a + (efetivoMes(s, f.id, m) ?? 0), 0) : Math.max(0, proj),
  }));
  return { tot, cons, saldo: saldoV, rest, proj, qtd, pts };
};
