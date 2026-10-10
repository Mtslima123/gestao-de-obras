import React from 'react';
import { Icon } from '../../../components/Icons';
import { corMediaRestante, corSaldo, mediaRestante, mesAbs, mesesEntre, mesesRestantes, orcado } from './regras';
import { T, card, h2, sub, btn, btnPrim, btnSec, th, td, inp, pill, corUi } from './tokens';
import { GRUPOS, consumidoAte, fimDoMesIso, funcoesDoGrupo, mesDeAbs, prevDe } from './efetivoStore';
import { efetivoService } from './efetivo.service';
import { ehConflito } from './efetivoErro';
import { GruposModal } from './GruposModal';
import { lerPlanilha } from './importXlsx';
import { lerPlanilhaPrevisto } from './importXlsxPure';
import { ImportarPlanilhaModal } from './ImportarPlanilhaModal';

const fmt = (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const fmtSaldo = (v) => (v < -0.05 ? '−' + fmt(-v) : fmt(v));

const Campo = ({ label, flex, children }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: T.texto2, flex: flex ? '1 1 220px' : undefined }}>{label}{children}</label>
);

// Aba Previsto: orçamento de efetivo por função (qtd/mês, início, término). Lançado uma vez:
// "Salvar previsto" grava e tranca; "Editar previsto" destranca. A trava é do banco (409); as
// edições da tabela ficam num rascunho local até salvar.
export function PrevistoTab({ s, setS, mesSel, toast, erro, recarregar, ehAdmin, somenteLeitura }) {
  const locked = s.obra.previstoTrancado;
  const [modal, setModal] = React.useState(false);
  const [nova, setNova] = React.useState(null); // { nome, g, q, ini, fim }
  const [ocupado, setOcupado] = React.useState(false);

  const OF = mesAbs(s.obra.termino);
  const rest = mesesRestantes(mesSel.iso, s.obra.termino);

  // Falha de uma ação: mostra a mensagem e, se a tela estava desatualizada (409), recarrega.
  const falhou = (error) => { erro(error.mensagem || error.message); if (ehConflito(error)) recarregar(); };

  const setPrev = (funcaoId, patch) => setS((st) => {
    const ex = st.previsto.find((p) => p.funcaoId === funcaoId);
    const base = ex ?? { obraId: st.obra.id, funcaoId, qtdMes: 0, inicio: st.obra.inicio, termino: st.obra.termino };
    let novo = { ...base, ...patch };
    if (mesAbs(novo.termino) < mesAbs(novo.inicio)) novo = { ...novo, termino: novo.inicio }; // término nunca antes do início
    return { ...st, previsto: ex ? st.previsto.map((p) => (p.funcaoId === funcaoId ? novo : p)) : [...st.previsto, novo] };
  });

  const alternarTrava = async () => {
    if (ocupado) return;
    setOcupado(true);
    try {
      if (locked) {
        const { error } = await efetivoService.destrancarPrevisto(s.obra.id);
        if (error) return falhou(error);
        setS((st) => ({ ...st, obra: { ...st.obra, previstoTrancado: false } }));
        toast('Previsto aberto para edição.');
      } else {
        if (!s.obra.termino) return erro('Informe o término da obra.');
        const itens = s.previsto.filter((p) => s.funcoes.some((f) => f.ativo && f.id === p.funcaoId));
        const { error } = await efetivoService.salvarPrevisto(s.obra.id, s.obra.termino, itens);
        if (error) return falhou(error);
        setNova(null);
        await recarregar();
        toast(`Previsto da obra ${s.obra.codigo} salvo e trancado.`);
      }
    } finally {
      setOcupado(false);
    }
  };

  const cadastrar = async () => {
    if (!nova || ocupado) return;
    const nome = nova.nome.trim();
    if (!nome) return erro('Informe o nome da função.');
    if (s.funcoes.some((f) => f.ativo && f.nome.toLowerCase() === nome.toLowerCase())) return erro('Já existe uma função com esse nome.');
    setOcupado(true);
    try {
      const { data: f, error } = await efetivoService.criarFuncao(nome, nova.g);
      if (error) return falhou(error);
      setS((st) => ({ ...st, funcoes: [...st.funcoes, f], previsto: [...st.previsto, { obraId: st.obra.id, funcaoId: f.id, qtdMes: nova.q, inicio: nova.ini, termino: nova.fim }] }));
      setNova(null);
      toast(`Função "${nome}" cadastrada.`);
    } finally {
      setOcupado(false);
    }
  };

  // Importar do orçamento (.xlsx): lê, mostra a conferência e só então preenche o rascunho da
  // tabela. Não grava nada: o previsto só vai ao banco em "Salvar previsto".
  const [previa, setPrevia] = React.useState(null);
  const escolherArquivo = async (e) => {
    const arquivo = e.target.files?.[0];
    e.target.value = ''; // permite escolher o mesmo arquivo de novo
    if (!arquivo || ocupado) return;
    setOcupado(true);
    try {
      const r = await lerPlanilha(arquivo, (rows) => lerPlanilhaPrevisto(rows, s.funcoes, { inicio: s.obra.inicio, termino: s.obra.termino }));
      if (r.erro) return erro(r.erro);
      setPrevia(r);
    } finally {
      setOcupado(false);
    }
  };
  const aplicarImportacao = () => {
    const p = previa;
    setPrevia(null);
    setS((st) => {
      const novos = new Map(p.itens.map((i) => [i.funcaoId, { obraId: st.obra.id, ...i }]));
      return { ...st, previsto: [...st.previsto.filter((x) => !novos.has(x.funcaoId)), ...novos.values()] };
    });
    toast(`Orçamento importado de ${p.nomeArquivo}. Confira a tabela e clique em Salvar previsto.`);
  };

  // Linhas e totais
  let TT = 0, TC = 0;
  const grupos = GRUPOS.map((g) => {
    let gt = 0, gc = 0, gm = 0, gHas = false;
    const rows = funcoesDoGrupo(s, g.id).map((f) => {
      const p = prevDe(s, f.id);
      const q = p?.qtdMes ?? 0, meses = p ? mesesEntre(p.inicio, p.termino) : 0, tot = p ? orcado(p) : 0;
      const c = consumidoAte(s, f.id, mesSel), sd = tot - c;
      const med = q ? mediaRestante(sd, rest) : null;
      gt += tot; gc += c; if (med != null) { gm += med; gHas = true; }
      return { f, p, q, meses, tot, c, sd, med };
    });
    TT += gt; TC += gc;
    return { g, rows, gt, gc, gm: gHas ? gm : null };
  });

  const kpi = (label, valor, subt, cor = T.texto) => (
    <div style={{ ...card, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12.5, color: T.texto2 }}>{label}</span>
      <span style={{ fontSize: 28, fontWeight: 600, color: cor }}>{valor}</span>
      <span style={{ fontSize: 12, color: T.texto2 }}>{subt}</span>
    </div>
  );

  const etiqueta = somenteLeitura && locked ? 'Previsto salvo e trancado (somente consulta)' : locked ? 'Previsto salvo e trancado' : 'Em edição';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16 }}>
        {kpi('Total orçado', fmt(TT), 'pessoa-mês (qtd/mês × meses)')}
        {kpi('Consumido', fmt(TC), `última apropriação até ${mesSel.label}`, T.azul)}
        {kpi('Saldo do orçamento', fmtSaldo(TT - TC), `${TT ? Math.round(((TT - TC) / TT) * 100) : 0}% do orçado ainda disponível`, corUi(corSaldo(TT - TC)))}
        {kpi('Duração', `${mesesEntre(s.obra.inicio, s.obra.termino)} meses`, `${mesDeAbs(mesAbs(s.obra.inicio)).label} a ${mesDeAbs(OF).label}`)}
      </div>

      <section style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '18px 20px', borderBottom: `1px solid ${T.borda}` }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <h2 style={h2}>Previsto do orçamento</h2>
            <span style={sub}>Lançado uma vez: quantidade por mês, início e término de cada função. Os meses são calculados.</span>
          </div>
          <span style={{ ...pill(locked ? T.texto2 : T.laranja, locked ? T.faixa : T.laranjaBg), fontWeight: 600 }}>
            <Icon name={locked ? 'lock' : 'unlock'} size={12} stroke={2.2} />{etiqueta}
          </span>
          <div style={{ flex: 1 }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.texto2 }}>Término da obra
            <input type="date" value={s.obra.termino} disabled={locked}
              onChange={(e) => e.target.value && setS((st) => ({ ...st, obra: { ...st.obra, termino: e.target.value } }))}
              style={{ ...inp(locked, 'auto'), fontWeight: 600, padding: '7px 10px', borderRadius: 8 }} />
          </label>
          {!locked && !somenteLeitura && ehAdmin && <>
            <button type="button" style={{ ...btn, color: T.azul }} onClick={() => setModal(true)}><Icon name="filter" size={14} stroke={2.2} />Grupos e classificações</button>
            <button type="button" style={{ ...btn, color: T.azul }} onClick={() => setNova({ nome: '', g: 'OFICIAL', q: 1, ini: mesSel.iso, fim: s.obra.termino })}><Icon name="plus" size={14} stroke={2.2} />Nova função</button>
          </>}
          {!locked && !somenteLeitura && (
            <label style={{ ...btn, color: T.azul, opacity: ocupado ? 0.6 : 1, pointerEvents: ocupado ? 'none' : 'auto' }}>
              <Icon name="download" size={15} stroke={2.2} />Importar do orçamento
              <input type="file" accept=".xlsx,.xls" hidden onChange={escolherArquivo} />
            </label>
          )}
          {!somenteLeitura && (
            <button type="button" style={locked ? btnSec : btnPrim} disabled={ocupado} onClick={alternarTrava}>
              <Icon name={locked ? 'unlock' : 'lock'} size={14} stroke={2.2} />{locked ? 'Editar previsto' : 'Salvar previsto'}
            </button>
          )}
        </div>

        {nova && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap', padding: '14px 20px', background: T.faixa, borderBottom: `1px solid ${T.borda}` }}>
            <Campo label="Nome da função" flex><input autoFocus value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} placeholder="Ex.: Armador" style={{ ...inp(false, '100%'), textAlign: 'left', padding: '7px 10px' }} /></Campo>
            <Campo label="Grupo"><select value={nova.g} onChange={(e) => setNova({ ...nova, g: e.target.value })} style={{ ...inp(false, 'auto'), padding: '7px 8px' }}>{GRUPOS.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}</select></Campo>
            <Campo label="Qtd/mês"><input type="number" min={0} value={nova.q} onChange={(e) => setNova({ ...nova, q: Math.max(0, parseInt(e.target.value, 10) || 0) })} style={{ ...inp(false, 70), padding: '7px 8px' }} /></Campo>
            <Campo label="Início"><input type="date" value={nova.ini} onChange={(e) => setNova({ ...nova, ini: e.target.value })} style={{ ...inp(false, 'auto'), padding: '6px 8px' }} /></Campo>
            <Campo label="Término"><input type="date" value={nova.fim} onChange={(e) => setNova({ ...nova, fim: e.target.value })} style={{ ...inp(false, 'auto'), padding: '6px 8px' }} /></Campo>
            <button type="button" style={btn} onClick={() => setNova(null)}>Cancelar</button>
            <button type="button" style={btnPrim} disabled={ocupado} onClick={cadastrar}>Cadastrar função</button>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 960 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left', paddingLeft: 20 }}>Função</th>
                <th style={th}>Qtd/mês</th><th style={{ ...th, textAlign: 'left' }}>Início</th><th style={{ ...th, textAlign: 'left' }}>Término</th><th style={th}>Meses</th>
                <th style={{ ...th, textAlign: 'right' }}>Orçado</th><th style={{ ...th, textAlign: 'right' }}>Consumido</th>
                <th style={{ ...th, textAlign: 'right', background: T.grupo }}>Saldo</th>
                <th style={{ ...th, textAlign: 'right', background: T.colMedia, paddingRight: 20 }} title="Saldo ÷ meses restantes até o término da obra">
                  Média restante<div style={{ fontSize: 11, fontWeight: 500, textTransform: 'none' }}>{rest} {rest === 1 ? 'mês restante' : 'meses restantes'}</div>
                </th>
              </tr>
            </thead>
            {grupos.map(({ g, rows, gt, gc, gm }) => rows.length > 0 && (
              <tbody key={g.id}>
                <tr style={{ background: T.grupo }}>
                  <td colSpan={5} style={{ ...td, textAlign: 'left', padding: '9px 20px', fontWeight: 600, color: T.azul }}>{g.nome}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmt(gt)}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmt(gc)}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: corUi(corSaldo(gt - gc)), background: T.colMedia }}>{fmtSaldo(gt - gc)}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, background: T.colMediaGrupo, paddingRight: 20 }}>{gm == null ? '—' : fmt(gm)}</td>
                </tr>
                {rows.map(({ f, p, q, meses, tot, c, sd, med }) => (
                  <tr key={f.id}>
                    <td style={{ ...td, textAlign: 'left', paddingLeft: 32 }}>{f.nome}</td>
                    <td style={td}><input type="number" min={0} value={q} disabled={locked} onChange={(e) => setPrev(f.id, { qtdMes: Math.max(0, parseInt(e.target.value, 10) || 0) })} style={{ ...inp(locked, 56), fontWeight: 600 }} /></td>
                    <td style={{ ...td, textAlign: 'left' }}><input type="date" value={p?.inicio ?? s.obra.inicio} disabled={locked} onChange={(e) => e.target.value && setPrev(f.id, { inicio: e.target.value })} style={inp(locked, 'auto')} /></td>
                    <td style={{ ...td, textAlign: 'left' }}><input type="date" value={p?.termino ?? fimDoMesIso(mesDeAbs(OF))} disabled={locked} onChange={(e) => e.target.value && setPrev(f.id, { termino: e.target.value })} style={inp(locked, 'auto')} /></td>
                    <td style={{ ...td, fontWeight: 600, color: T.texto2 }}>{meses}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmt(tot)}</td>
                    <td style={{ ...td, textAlign: 'right', color: T.texto2 }}>{fmt(c)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: corUi(corSaldo(sd)), background: T.colSaldo }}>{fmtSaldo(sd)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: corUi(corMediaRestante(med, q)), background: T.grupo, paddingRight: 20 }}>{med == null ? '—' : (med < 0 ? '−' : '') + fmt(Math.abs(med))}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
        <div style={{ display: 'flex', gap: 16, padding: '12px 20px', borderTop: `1px solid ${T.borda}`, fontSize: 12, color: T.texto2, flexWrap: 'wrap' }}>
          <span>Orçado, consumido e saldo em pessoa-mês · saldo = orçado − consumido · média restante = saldo ÷ meses do mês selecionado até o término da obra</span>
          <span><b style={{ color: T.azul }}>●</b> Média acima da qtd/mês</span>
          <span><b style={{ color: T.vermelho }}>●</b> Abaixo: precisa reduzir</span>
        </div>
      </section>

      {previa && (
        <ImportarPlanilhaModal
          titulo="Importar previsto do orçamento"
          nomeArquivo={previa.nomeArquivo}
          resumo={`${previa.itens.length} ${previa.itens.length === 1 ? 'função lida' : 'funções lidas'} da planilha.`}
          substitui="As funções da planilha preenchem a tabela (quantidade, início e término). As que não estão na planilha ficam como estão. Nada é gravado até você clicar em Salvar previsto."
          secoes={[
            { titulo: 'Funções da planilha que não existem no cadastro (ficam de fora)', tom: 'erro', linhas: previa.naoEncontradas.map((n) => `${n.nome} (linha ${n.linha})`) },
            { titulo: 'Linhas inválidas (ficam de fora)', tom: 'erro', linhas: previa.invalidas.map((n) => `${n.nome} (linha ${n.linha}): ${n.motivo}`) },
            { titulo: 'Avisos', tom: 'aviso', linhas: previa.avisos },
          ]}
          onConfirmar={aplicarImportacao}
          onClose={() => setPrevia(null)}
        />
      )}

      {modal && <GruposModal s={s} setS={setS} toast={toast} erro={erro} recarregar={recarregar} onClose={() => setModal(false)} />}
    </div>
  );
}
