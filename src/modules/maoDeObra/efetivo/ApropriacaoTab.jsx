import React from 'react';
import { Icon } from '../../../components/Icons';
import { Modal } from '../../../components/Modals';
import { STATUS_UI, ativos, classificacaoEfetiva, corSaldo, status, temValor, trabCanteiro, usoPct } from './regras';
import { T, card, h2, btn, btnPrim, btnSec, th, td, inp, pill, corUi } from './tokens';
import { GRUPOS, apropDe, aplicarPatchItem, funcoesAtivas, itemDe, previstoMes, totalEfetivoTela, ultimoDia } from './efetivoStore';
import { efetivoService } from './efetivo.service';
import { ehConflito } from './efetivoErro';
import { lerPlanilha } from './importXlsx';
import { avisosDeContexto, lerPlanilhaEfetivo } from './importXlsxPure';
import { ImportarPlanilhaModal } from './ImportarPlanilhaModal';
import { CampoQtd } from './CampoQtd';
import { logger } from '../../../services/logger';

const NUM = ['trabAdm', 'inssSeguro', 'ferias', 'emprestManut', 'recebidoOutraObra'];
// O previsto pode ser quebrado (2,5): soma e diferença são arredondadas a 2 casas para não
// aparecer 0,30000000000000004, e o decimal sai com vírgula.
const r2 = (v) => Math.round(v * 100) / 100;
const n2 = (v) => String(r2(v)).replace('.', ',');
const sg = (v) => { const x = r2(v); return x > 0 ? '+' + n2(x) : x < 0 ? '−' + n2(-x) : '0'; };
const chaveQ = (ano, mes, q) => `${ano}-${mes}-${q}`;

// Aba Apropriação: efetivo real por função, duas por mês (1ª = dias 01-15, 2ª = 16-fim),
// espelhando a planilha de efetivo. As digitações ficam num rascunho local e são gravadas no
// banco ao sair de cada campo (uma de cada vez, em fila). "Lançar" tranca a quinzena; só
// "Reabrir" destranca. A trava de verdade é do banco (409).
export function ApropriacaoTab({ s, setS, mesSel, toast, erro, recarregar, somenteLeitura, mesFechado, obraNome }) {
  const [q, setQ] = React.useState(1);
  // Trocou o período: volta para a 1ª apropriação (ajuste durante a renderização, sem piscar a 2ª do mês novo).
  const [absVisto, setAbsVisto] = React.useState(mesSel.abs);
  if (absVisto !== mesSel.abs) { setAbsVisto(mesSel.abs); setQ(1); }
  const [busca, setBusca] = React.useState('');
  const [agrupar, setAgrupar] = React.useState('grupo');
  const [recolhidos, setRecolhidos] = React.useState({});
  const [ocupado, setOcupado] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);
  const [rascunhoSalvo, setRascunhoSalvo] = React.useState(false);
  const [confirmaCopia, setConfirmaCopia] = React.useState(false);
  const [confirmaLimpar, setConfirmaLimpar] = React.useState(false);
  const [exportando, setExportando] = React.useState(false);
  const [linhaFoco, setLinhaFoco] = React.useState(null); // função cuja linha tem um campo em edição

  // Gravação do rascunho: fila (nunca duas ao mesmo tempo, na ordem em que foram pedidas) e,
  // por quinzena, um contador de alterações ainda não gravadas. O contador (e não um simples
  // "sujo/limpo") é o que impede perder uma digitação feita enquanto a gravação anterior
  // ainda estava no ar: ao terminar, só limpa se ninguém alterou nesse meio-tempo.
  const sRef = React.useRef(s);
  sRef.current = s;
  const fila = React.useRef(Promise.resolve());
  const sujo = React.useRef(new Map());
  const marcarSujo = (chave) => sujo.current.set(chave, (sujo.current.get(chave) || 0) + 1);

  const ap = apropDe(s, mesSel, q);
  const locked = ap?.status === 'LANCADA';
  const aguardaPrimeira = q === 2 && apropDe(s, mesSel, 1)?.status !== 'LANCADA'; // a 2ª só se apropria com a 1ª lançada e fechada
  const editavel = !locked && !somenteLeitura && !aguardaPrimeira;
  const ultimo = ultimoDia(mesSel.ano, mesSel.mes);
  const range = (n) => (n === 1 ? '01 a 15' : `16 a ${ultimo}`);

  const falhou = (error) => { erro(error.mensagem || error.message); if (ehConflito(error)) recarregar(); };

  const gravar = (ano, mes, quin) => {
    const tarefa = async () => {
      const chave = chaveQ(ano, mes, quin);
      const versao = sujo.current.get(chave);
      if (!versao) return true;
      const st = sRef.current;
      const a = st.apropriacoes.find((x) => x.ano === ano && x.mes === mes && x.quinzena === quin);
      if (!a || a.status === 'LANCADA') { sujo.current.delete(chave); return true; }
      setSalvando(true);
      const { error } = await efetivoService.salvarApropriacao(st.obra.id, ano, mes, quin, a.itens);
      setSalvando(false);
      if (error) { falhou(error); return false; } // continua "sujo": tenta de novo no próximo campo
      if (sujo.current.get(chave) === versao) { sujo.current.delete(chave); setRascunhoSalvo(true); }
      return true;
    };
    fila.current = fila.current.catch(() => {}).then(tarefa);
    return fila.current;
  };

  const garantirAprop = (st, quin) => {
    const ex = apropDe(st, mesSel, quin);
    if (ex) return [st, ex];
    const novo = { id: `tmp-${mesSel.abs}-${quin}`, obraId: st.obra.id, ano: mesSel.ano, mes: mesSel.mes, quinzena: quin, dataReferencia: `${mesSel.iso.slice(0, 8)}${quin === 1 ? '01' : '16'}`, status: 'RASCUNHO', lancadaEm: null, lancadaPor: null, itens: [] };
    return [{ ...st, apropriacoes: [...st.apropriacoes, novo] }, novo];
  };

  const setItem = (funcaoId, patch) => {
    marcarSujo(chaveQ(mesSel.ano, mesSel.mes, q));
    setRascunhoSalvo(false);
    setS((st0) => {
      const [st, a] = garantirAprop(st0, q);
      const ex = itemDe(a, funcaoId);
      const it = aplicarPatchItem(ex ?? { apropriacaoId: a.id, funcaoId, totalEfetivo: null, trabAdm: null, inssSeguro: null, ferias: null, emprestManut: null, destino: null, recebidoOutraObra: null, origem: null }, patch);
      const itens = ex ? a.itens.map((i) => (i.funcaoId === funcaoId ? it : i)) : [...a.itens, it];
      return { ...st, apropriacoes: st.apropriacoes.map((x) => (x.id === a.id ? { ...a, itens } : x)) };
    });
  };

  const salvarRascunho = () => gravar(mesSel.ano, mesSel.mes, q);

  const lancarOuReabrir = async () => {
    if (ocupado) return;
    setOcupado(true);
    try {
      if (locked) {
        const { error } = await efetivoService.reabrir(s.obra.id, mesSel.ano, mesSel.mes, q);
        if (error) return falhou(error);
        await recarregar();
        return toast(`${q}ª apropriação reaberta para edição.`);
      }
      if (aguardaPrimeira) return erro('Lance e feche a 1ª apropriação antes de apropriar a 2ª.');
      if (!ap || !ap.itens.some(temValor)) return erro('Preencha ao menos uma função antes de lançar.');
      const negativas = ap.itens.filter((i) => trabCanteiro(i) < 0).map((i) => s.funcoes.find((f) => f.id === i.funcaoId)?.nome).filter(Boolean);
      if (negativas.length) return erro(`"Trab. no canteiro" ficou negativo em: ${negativas.join(', ')}. Corrija antes de lançar.`);
      marcarSujo(chaveQ(mesSel.ano, mesSel.mes, q));
      if (!(await gravar(mesSel.ano, mesSel.mes, q))) return;
      const { error } = await efetivoService.lancar(s.obra.id, mesSel.ano, mesSel.mes, q);
      if (error) return falhou(error);
      await recarregar();
      toast(`${q}ª apropriação de ${mesSel.label} lançada e fechada.`);
    } finally {
      setOcupado(false);
    }
  };

  const copiarDa1 = async () => {
    setConfirmaCopia(false);
    if (ocupado) return;
    setOcupado(true);
    try {
      marcarSujo(chaveQ(mesSel.ano, mesSel.mes, 1));
      if (!(await gravar(mesSel.ano, mesSel.mes, 1))) return;
      // A 2ª passa a ser a cópia: descarta qualquer alteração local ainda não gravada nela.
      sujo.current.delete(chaveQ(mesSel.ano, mesSel.mes, 2));
      const { error } = await efetivoService.copiarDaPrimeira(s.obra.id, mesSel.ano, mesSel.mes);
      if (error) return falhou(error);
      await recarregar();
      toast('Quantidades copiadas da 1ª apropriação.');
    } finally {
      setOcupado(false);
    }
  };
  // Limpar: esvazia o rascunho da quinzena aberta (a tela e o banco) depois da confirmação.
  // Quinzena lançada não chega aqui: o botão só aparece quando é editável.
  const limparQuinzena = async () => {
    setConfirmaLimpar(false);
    if (ocupado || !ap) return;
    setOcupado(true);
    try {
      const alvo = ap.id;
      marcarSujo(chaveQ(mesSel.ano, mesSel.mes, q));
      setRascunhoSalvo(false);
      setS((st0) => ({ ...st0, apropriacoes: st0.apropriacoes.map((x) => (x.id === alvo ? { ...x, itens: [] } : x)) }));
      sRef.current = { ...sRef.current, apropriacoes: sRef.current.apropriacoes.map((x) => (x.id === alvo ? { ...x, itens: [] } : x)) };
      if (!(await gravar(mesSel.ano, mesSel.mes, q))) return;
      toast(`${q}ª apropriação limpa.`);
    } finally {
      setOcupado(false);
    }
  };

  // ---- importar a planilha de efetivo (.xlsx): lê, mostra a conferência e só então aplica ao
  // rascunho da quinzena aberta (substitui o que estava digitado) e grava.
  const [previa, setPrevia] = React.useState(null);
  const gravarDepois = React.useRef(null);

  const escolherArquivo = async (e) => {
    const arquivo = e.target.files?.[0];
    e.target.value = ''; // permite escolher o mesmo arquivo de novo
    if (!arquivo || ocupado) return;
    setOcupado(true);
    try {
      const r = await lerPlanilha(arquivo, (rows) => lerPlanilhaEfetivo(rows, s.funcoes));
      if (r.erro) return erro(r.erro);
      const ctx = { obraCodigo: s.obra.codigo, obraNome: '', ano: mesSel.ano, mes: mesSel.mes, quinzena: q };
      setPrevia({ ...r, quinzena: q, ano: mesSel.ano, mes: mesSel.mes, avisos: [...avisosDeContexto(r.cabecalho, ctx), ...r.avisos] });
    } finally {
      setOcupado(false);
    }
  };

  const aplicarImportacao = () => {
    const p = previa;
    setPrevia(null);
    marcarSujo(chaveQ(p.ano, p.mes, p.quinzena));
    setRascunhoSalvo(false);
    gravarDepois.current = { ano: p.ano, mes: p.mes, quin: p.quinzena, nome: p.nomeArquivo };
    setS((st0) => {
      const ex = st0.apropriacoes.find((x) => x.ano === p.ano && x.mes === p.mes && x.quinzena === p.quinzena);
      const a = ex ?? { id: `tmp-${p.ano * 12 + p.mes - 1}-${p.quinzena}`, obraId: st0.obra.id, ano: p.ano, mes: p.mes, quinzena: p.quinzena, dataReferencia: `${p.ano}-${String(p.mes).padStart(2, '0')}-${p.quinzena === 1 ? '01' : '16'}`, status: 'RASCUNHO', lancadaEm: null, lancadaPor: null, itens: [] };
      const novo = { ...a, itens: p.itens.map((i) => ({ ...i, apropriacaoId: a.id })) };
      return { ...st0, apropriacoes: ex ? st0.apropriacoes.map((x) => (x.id === a.id ? novo : x)) : [...st0.apropriacoes, novo] };
    });
  };

  // O estado novo já foi para a tela quando este efeito roda, e sRef.current o tem: grava.
  React.useEffect(() => {
    const g = gravarDepois.current;
    if (!g) return;
    gravarDepois.current = null;
    gravar(g.ano, g.mes, g.quin).then((ok) => { if (ok) toast(`Efetivo importado de ${g.nome}. Confira e lance a apropriação.`); });
  }, [s]); // eslint-disable-line react-hooks/exhaustive-deps

  const pedirCopia = () => {
    const a1 = apropDe(s, mesSel, 1);
    if (!a1 || !a1.itens.some(temValor)) return erro('A 1ª apropriação ainda não tem dados para copiar.');
    if (ap?.itens.some(temValor)) setConfirmaCopia(true); else copiarDa1();
  };

  // ---- agrupamento
  const termo = busca.trim().toLowerCase();
  const visiveis = funcoesAtivas(s).filter((f) => !termo || f.nome.toLowerCase().includes(termo));
  const defs = agrupar === 'grupo'
    ? GRUPOS.map((g) => ({ key: g.id, nome: g.nome, funcoes: visiveis.filter((f) => f.grupoId === g.id) }))
    : [...new Set(visiveis.map(classificacaoEfetiva))].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((c) => ({ key: c, nome: c, funcoes: visiveis.filter((f) => classificacaoEfetiva(f) === c) }));

  const Z = () => ({ prev: 0, totalEfetivo: 0, trabAdm: 0, can: 0, inssSeguro: 0, ferias: 0, emprestManut: 0, recebidoOutraObra: 0, at: 0, any: false });  const TOT = Z();
  const grupos = defs.filter((d) => d.funcoes.length).map((d) => {
    const G = Z();
    const rows = d.funcoes.map((f) => {
      const it = itemDe(ap, f.id);
      const pv = previstoMes(s, f.id, mesSel);
      const at = it ? ativos(it) : null;
      const tot = totalEfetivoTela(it);
      const can = it && temValor(it) ? trabCanteiro(it) : null;
      for (const o of [G, TOT]) {
        o.prev = r2(o.prev + pv);
        NUM.forEach((k) => { o[k] += it?.[k] ?? 0; });
        if (can != null) o.can += can;
        if (tot != null) o.totalEfetivo += tot;
        if (at != null) { o.at += at; o.any = true; }
      }
      return { f, it, pv, at, can, tot };
    });
    return { ...d, rows, G };
  });

  const st = TOT.any ? status(TOT.prev, TOT.at) : 'pend';
  const d = r2(TOT.at - TOT.prev);
  const estadoQ = (n) => { const a = apropDe(s, mesSel, n); return a?.status === 'LANCADA' ? 'Lançada' : a?.itens.some(temValor) ? 'Rascunho' : 'Pendente'; };

  // Exportar a quinzena aberta, do jeito que está na tela (agrupamento e busca). Só leitura:
  // por isso os botões aparecem também com a quinzena lançada, o mês fechado ou em somente
  // consulta. O módulo de exportação (e o jspdf/xlsx dentro dele) só é baixado no clique.
  const exportar = async (formato) => {
    if (exportando) return;
    setExportando(true);
    try {
      const { exportarPDF, exportarExcel } = await import('./exportApropriacao');
      const dados = {
        obraNome, obraCodigo: s.obra.codigo,
        mesLabel: mesSel.label.replace('/', '/20'), ano: mesSel.ano, mes: mesSel.mes,
        quinzena: q, periodo: range(q), situacao: estadoQ(q),
        busca: busca.trim(), grupos, total: TOT,
      };
      await (formato === 'pdf' ? exportarPDF(dados) : exportarExcel(dados));
    } catch (e) {
      logger.error(`erro ao exportar a apropriação (${formato})`, { module: 'maoDeObra', action: 'exportarApropriacao', obraId: s.obra.id, err: e });
      erro(`Erro ao exportar para ${formato === 'pdf' ? 'PDF' : 'Excel'}.`);
    } finally {
      setExportando(false);
    }
  };

  const numInput = (f, it, k, label, valor = it?.[k]) => (
    <td style={{ ...td, padding: '4px' }}>
      <CampoQtd min={0} disabled={!editavel} aria-label={label} placeholder="—" value={valor}
        onChange={(e) => setItem(f.id, { [k]: e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0) })} onBlur={salvarRascunho}
        style={{ ...inp(!editavel, 50), fontWeight: 500, color: valor < 0 ? T.vermelho : T.texto }} />
    </td>
  );
  const txtInput = (f, it, k, label) => (
    <td style={{ ...td, padding: '4px', textAlign: 'left' }}>
      <input disabled={!editavel} aria-label={label} value={it?.[k] ?? ''} onChange={(e) => setItem(f.id, { [k]: e.target.value || null })} onBlur={salvarRascunho}
        style={{ ...inp(!editavel, 96), textAlign: 'left', fontSize: 12.5 }} />
    </td>
  );
  const somas = (o, bold = 600) => (<>
    {['totalEfetivo', 'trabAdm', 'can', 'inssSeguro', 'ferias', 'emprestManut'].map((k) => <td key={k} style={{ ...td, fontWeight: bold }}>{o[k]}</td>)}
    <td style={td} /><td style={{ ...td, fontWeight: bold }}>{o.recebidoOutraObra}</td><td style={td} />
  </>);

  const okUi = (stt) => { const u = STATUS_UI[stt]; return { cor: corUi(u.cor), fundo: corUi(u.fundo), rotulo: u.rotulo }; };

  return (
    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
      <section style={{ ...card, flex: '1 1 100%', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '18px 20px', borderBottom: `1px solid ${T.borda}` }}>
          <div style={{ display: 'flex', border: `1px solid ${T.bordaInput}`, borderRadius: 9, overflow: 'hidden' }}>
            {[1, 2].map((n) => (
              <button key={n} type="button" onClick={() => setQ(n)} style={{ font: 'inherit', fontSize: 13, fontWeight: 600, border: 0, borderLeft: n === 2 ? `1px solid ${T.bordaInput}` : 0, padding: '9px 16px', cursor: 'pointer', background: q === n ? T.azul : 'var(--surface)', color: q === n ? '#fff' : T.texto, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
                {n}ª Apropriação<span style={{ fontSize: 11, fontWeight: 500, opacity: 0.8 }}>{range(n)} · {estadoQ(n)}</span>
              </button>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          {editavel && (salvando || rascunhoSalvo) && <span style={{ fontSize: 12, color: T.texto3 }}>{salvando ? 'Salvando…' : 'Rascunho salvo'}</span>}
          {mesFechado
            ? <span style={{ ...pill(T.texto2, T.faixa), fontWeight: 600 }}><Icon name="lock" size={12} stroke={2.2} />Mês fechado, só consulta</span>
            : locked
            ? <span style={{ ...pill(T.texto2, T.faixa), fontWeight: 600 }}><Icon name="lock" size={12} stroke={2.2} />Lançada e fechada</span>
            : somenteLeitura
              ? <span style={{ ...pill(T.texto2, T.faixa), fontWeight: 600 }}>Somente consulta</span>
              : aguardaPrimeira
                ? null
                : <>
                {q === 2 && <button type="button" style={btn} disabled={ocupado} onClick={pedirCopia}>Copiar da 1ª</button>}
                <button type="button" style={{ ...btn, opacity: ocupado || !ap?.itens.length ? 0.5 : 1 }} disabled={ocupado || !ap?.itens.length} onClick={() => setConfirmaLimpar(true)}>
                  <Icon name="trash" size={15} stroke={2.2} />Limpar
                </button>
                <label style={{ ...btn, opacity: ocupado ? 0.6 : 1, pointerEvents: ocupado ? 'none' : 'auto' }}>
                  <Icon name="download" size={15} stroke={2.2} />Importar efetivo (.xlsx)
                  <input type="file" accept=".xlsx,.xls" hidden onChange={escolherArquivo} />
                </label>
              </>}
          {[['pdf', 'PDF'], ['xlsx', 'Excel']].map(([formato, rotulo]) => (
            <button key={formato} type="button" style={{ ...btn, opacity: exportando ? 0.6 : 1 }} disabled={exportando} onClick={() => exportar(formato)}
              title={`Baixar a ${q}ª apropriação em ${rotulo}`}>
              <Icon name="download" size={15} stroke={2.2} />{exportando ? 'Exportando…' : `Exportar ${rotulo}`}
            </button>
          ))}
          {!somenteLeitura && (
            <button type="button" style={locked ? btnSec : btnPrim} disabled={ocupado || aguardaPrimeira} onClick={lancarOuReabrir}>
              <Icon name={locked ? 'unlock' : 'lock'} size={14} stroke={2.2} />{locked ? 'Reabrir apropriação' : 'Lançar apropriação'}
            </button>
          )}
        </div>

        {aguardaPrimeira && !locked && !mesFechado && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 20px', fontSize: 13, fontWeight: 500, color: T.laranja, background: T.laranjaBg, borderBottom: `1px solid ${T.borda}` }}>
            <Icon name="lock" size={14} stroke={2.2} />
            <span>A 2ª apropriação só pode ser preenchida depois que a 1ª for lançada e fechada.</span>
            <button type="button" onClick={() => setQ(1)} style={{ font: 'inherit', fontSize: 13, fontWeight: 600, border: 0, background: 'none', color: T.azul, cursor: 'pointer', padding: 0 }}>Ir para a 1ª apropriação</button>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', flexWrap: 'wrap', fontSize: 13, color: T.texto2, background: T.faixa, borderBottom: `1px solid ${T.borda}` }}>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar função…" style={{ font: 'inherit', fontSize: 13, padding: '7px 10px', border: `1px solid ${T.bordaInput}`, borderRadius: 8, width: 220, background: 'var(--surface)', color: T.texto }} />
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>Agrupar por
            <span style={{ display: 'flex', border: `1px solid ${T.bordaInput}`, borderRadius: 8, overflow: 'hidden' }}>
              {['grupo', 'classificacao'].map((a) => <button key={a} type="button" onClick={() => setAgrupar(a)} style={{ font: 'inherit', fontSize: 12.5, fontWeight: 500, border: 0, padding: '6px 11px', cursor: 'pointer', background: agrupar === a ? T.azul : 'var(--surface)', color: agrupar === a ? '#fff' : T.texto }}>{a === 'grupo' ? 'Grupo' : 'Classificação'}</button>)}
            </span>
          </span>
          <div style={{ flex: 1 }} />
          <button type="button" style={{ font: 'inherit', fontSize: 13, border: 0, background: 'none', color: T.azul, cursor: 'pointer', fontWeight: 500 }}
            onClick={() => { const abrir = grupos.every((g) => recolhidos[g.key]); setRecolhidos(Object.fromEntries(grupos.map((g) => [g.key, !abrir]))); }}>
            {grupos.every((g) => recolhidos[g.key]) ? 'Expandir grupos' : 'Recolher grupos'}
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 1320 }}>
            <thead style={{ background: T.faixa }}>
              <tr>
                <th style={{ ...th, textAlign: 'left', paddingLeft: 20 }}>Função</th>
                <th style={th}>Previsto<br />(mês)</th><th style={{ ...th, background: T.grupo }}>Total<br />efetivo</th><th style={th}>Trab. na<br />ADM</th>
                <th style={th}>Trab. no<br />canteiro</th><th style={th}>INSS/<br />Seguro</th><th style={th}>Férias</th><th style={th}>Emprest./<br />Manut.</th>
                <th style={{ ...th, textAlign: 'left' }}>Destino</th><th style={th}>Recebido<br />outra obra</th><th style={{ ...th, textAlign: 'left' }}>Origem</th>
                <th style={{ ...th, background: T.azulClaro, color: T.azul }}>Ativos</th><th style={{ ...th, textAlign: 'right' }}>Saldo</th><th style={{ ...th, textAlign: 'left', paddingRight: 20 }}>Status</th>
              </tr>
            </thead>
            {grupos.map(({ key, nome, rows, G }) => {
              const gst = G.any ? status(G.prev, G.at) : 'pend';
              return (
                <tbody key={key}>
                  <tr onClick={() => setRecolhidos((r) => ({ ...r, [key]: !r[key] }))} style={{ background: T.grupo, cursor: 'pointer' }}>
                    <td style={{ ...td, textAlign: 'left', padding: '9px 20px', fontWeight: 600, color: T.azul, whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-block', transform: recolhidos[key] ? 'rotate(-90deg)' : 'none', transition: 'transform .15s', marginRight: 8 }}>▾</span>{nome}
                      <span style={{ fontWeight: 500, color: T.texto2, fontSize: 12, marginLeft: 8 }}>{rows.length}</span>
                    </td>
                    <td style={{ ...td, fontWeight: 600 }}>{n2(G.prev)}</td>
                    {somas(G)}
                    <td style={{ ...td, fontWeight: 700, color: T.azul, background: T.azulClaro }}>{G.any ? G.at : '—'}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: G.any ? corUi(corSaldo(r2(G.prev - G.at))) : T.texto2 }}>{G.any ? sg(G.prev - G.at) : '—'}</td>
                    <td style={{ ...td, textAlign: 'left', fontWeight: 600, color: okUi(gst).cor, paddingRight: 20 }}>{G.any ? `${usoPct(G.at, G.prev) ?? '—'}%` : '—'}</td>
                  </tr>
                  {!recolhidos[key] && rows.map(({ f, it, pv, at, can, tot }) => {
                    const ui = okUi(status(pv, at));
                    const foco = linhaFoco === f.id;
                    return (
                      <tr key={f.id} style={foco ? { background: T.linhaSel } : undefined}
                        onFocus={() => setLinhaFoco(f.id)}
                        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setLinhaFoco(null); }}>
                        <td style={{ ...td, textAlign: 'left', paddingLeft: 42, boxShadow: foco ? `inset 3px 0 0 ${T.azul}` : undefined, fontWeight: foco ? 600 : undefined }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{f.nome}
                            {agrupar === 'grupo' && f.classificacao && <span style={pill(T.azul, T.azulClaro)}>{f.classificacao}</span>}
                          </span>
                        </td>
                        <td style={{ ...td, color: T.texto2 }}>{n2(pv)}</td>
                        <td style={{ ...td, fontWeight: 600, background: foco ? 'transparent' : T.colSaldo }}>{tot ?? '—'}</td>
                        {numInput(f, it, 'trabAdm', 'Trabalhando na ADM')}{numInput(f, it, 'canteiro', 'Trabalhando no canteiro', can)}
                        {numInput(f, it, 'inssSeguro', 'INSS/Seguro')}{numInput(f, it, 'ferias', 'Férias')}{numInput(f, it, 'emprestManut', 'Emprestado/Manutenção')}
                        {txtInput(f, it, 'destino', 'Destino')}{numInput(f, it, 'recebidoOutraObra', 'Recebido outra obra')}{txtInput(f, it, 'origem', 'Origem')}
                        <td style={{ ...td, fontWeight: 700, color: T.azul, background: foco ? 'transparent' : T.destaque }}>{at ?? '—'}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: at == null ? T.texto2 : corUi(corSaldo(r2(pv - at))) }}>{at == null ? '—' : sg(pv - at)}</td>
                        <td style={{ ...td, textAlign: 'left', paddingRight: 20 }}><span style={pill(ui.cor, ui.fundo)}><span style={{ width: 6, height: 6, borderRadius: '50%', background: ui.cor }} />{ui.rotulo}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
            <tfoot>
              <tr style={{ borderTop: `2px solid ${T.bordaInput}`, fontWeight: 700 }}>
                <td style={{ padding: '12px 20px' }}>Total</td><td style={{ ...td, fontWeight: 700 }}>{n2(TOT.prev)}</td>
                {somas(TOT, 700)}
                <td style={{ ...td, color: T.azul, background: T.azulClaro, fontWeight: 700 }}>{TOT.any ? TOT.at : '—'}</td>
                <td style={{ ...td, textAlign: 'right', color: TOT.any ? corUi(corSaldo(-d)) : T.texto2 }}>{TOT.any ? sg(-d) : '—'}</td>
                <td style={{ ...td, textAlign: 'left', color: okUi(st).cor, paddingRight: 20 }}>{TOT.any ? `${usoPct(TOT.at, TOT.prev) ?? '—'}%` : '—'}</td>
              </tr>
            </tfoot>
          </table>
          <div style={{ padding: '10px 20px', borderTop: `1px solid ${T.borda}`, fontSize: 12, color: T.texto2, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <span>Total efetivo = trab. na ADM + trab. no canteiro + emprest./manut. (calculado, não se digita)</span>
            <span style={{ color: T.azul, fontWeight: 600 }}>Ativos = trab. na ADM + trab. no canteiro + recebido outra obra</span>
          </div>
        </div>
      </section>

      <div style={{ flex: '1 1 100%', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 20, alignItems: 'start' }}>
        <section style={{ ...card, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={h2}>Apropriações de {mesSel.label.replace('/', '/20')}</h2>
          {[1, 2].map((n) => {
            const a = apropDe(s, mesSel, n), e = estadoQ(n);
            const ui = e === 'Lançada' ? okUi('ok') : e === 'Rascunho' ? { cor: T.laranja, fundo: T.laranjaBg } : okUi('pend');
            return (
              <div key={n} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: `1px solid ${T.linha}`, fontSize: 13.5 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <b style={{ fontWeight: 600 }}>{n}ª Apropriação ({range(n)})</b>
                  <span style={{ color: T.texto2, fontSize: 12 }}>
                    {a?.lancadaEm ? `Lançada em ${new Date(a.lancadaEm).toLocaleDateString('pt-BR')}${a.lancadaPor ? ` por ${a.lancadaPor}` : ''}` : `Data de referência ${n === 1 ? '01' : '16'}/${String(mesSel.mes).padStart(2, '0')}/${mesSel.ano}`}
                  </span>
                </div>
                <span style={pill(ui.cor, ui.fundo)}>{e}</span>
              </div>
            );
          })}
        </section>
      </div>

      {previa && (
        <ImportarPlanilhaModal
          titulo="Importar efetivo da planilha"
          nomeArquivo={previa.nomeArquivo}
          resumo={`${previa.itens.length} ${previa.itens.length === 1 ? 'função lida' : 'funções lidas'} para a ${previa.quinzena}ª apropriação de ${String(previa.mes).padStart(2, '0')}/${previa.ano}.`}
          substitui="Importar substitui o que está digitado nesta quinzena. A apropriação continua em rascunho até você lançar."
          secoes={[
            { titulo: 'Funções da planilha que não existem no cadastro (ficam de fora)', tom: 'erro', linhas: previa.naoEncontradas.map((n) => `${n.nome} (linha ${n.linha})`) },
            { titulo: 'ATIVOS da planilha diferente do cálculo (vale o cálculo)', tom: 'aviso', linhas: previa.divergencias.map((d) => `${d.nome}: planilha ${d.planilha}, calculado ${d.calculado}`) },
            { titulo: 'Avisos', tom: 'aviso', linhas: previa.avisos },
          ]}
          onConfirmar={aplicarImportacao}
          onClose={() => setPrevia(null)}
        />
      )}

      {confirmaLimpar && (
        <Modal
          title={`Limpar a ${q}ª apropriação?`}
          size="sm"
          onClose={() => setConfirmaLimpar(false)}
          footer={<>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmaLimpar(false)}>Cancelar</button>
            <button type="button" className="btn btn-danger" onClick={limparQuinzena}>Limpar</button>
          </>}
        >
          <p style={{ margin: 0, lineHeight: 1.5 }}>Todas as quantidades, destinos e origens digitados na {q}ª apropriação ({range(q)}) serão apagados. Essa ação não pode ser desfeita.</p>
        </Modal>
      )}

      {confirmaCopia && (
        <Modal
          title="Copiar da 1ª apropriação?"
          size="sm"
          onClose={() => setConfirmaCopia(false)}
          footer={<>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmaCopia(false)}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={copiarDa1}>Copiar</button>
          </>}
        >
          <p style={{ margin: 0, lineHeight: 1.5 }}>A 2ª apropriação já tem valores digitados. Copiar substitui tudo pelo que está na 1ª.</p>
        </Modal>
      )}
    </div>
  );
}
