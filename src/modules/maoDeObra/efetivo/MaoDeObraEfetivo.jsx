import React from 'react';
import { useToast } from '../../../components/Modals';
import { abaSomenteLeitura, filtrarAbas, isAdmin } from '../../../utils/permissions';
import { MODULO_ABAS } from '../../../config/modulos';
import { T, card } from './tokens';
import { efetivoService } from './efetivo.service';
import { mesesDaObra } from './efetivoStore';
import { PrevistoTab } from './PrevistoTab';
import { ApropriacaoTab } from './ApropriacaoTab';
import { AnaliseTab } from './AnaliseTab';

const MOD = 'mao-de-obra';
const mesAtualAbs = () => { const d = new Date(); return d.getFullYear() * 12 + d.getMonth(); };
const rotuloObra = (o) => {
  const sigla = o.sigla && o.sigla !== o.id ? o.sigla : '';
  return sigla && o.nome ? `${sigla} · ${o.nome}` : (sigla || o.nome || o.id);
};

const selStyle = { font: 'inherit', fontSize: 13, fontWeight: 600, color: T.texto, padding: '7px 10px', border: `1px solid ${T.bordaInput}`, borderRadius: 8, background: 'var(--surface)', minWidth: 130 };

// Mão de Obra > Efetivo. `obras` já vem filtrada por permissão (obrasVisiveis do App). Quem
// guarda a obra escolhida é o App (vira a URL /mao-de-obra/efetivo/:obraId); aqui só se pede a
// troca por onTrocarObra.
export function MaoDeObraEfetivo({ obras = [], obraId, onTrocarObra, userProfile }) {
  const toastApp = useToast();
  const toast = React.useCallback((m) => toastApp(m), [toastApp]);
  const erro = React.useCallback((m) => toastApp(m, { tone: 'danger', icon: 'alert', duration: 5000 }), [toastApp]);

  const abasLiberadas = React.useMemo(() => filtrarAbas(userProfile, MOD, MODULO_ABAS[MOD] || []), [userProfile]);
  const [aba, setAba] = React.useState(null);
  const abaAtual = abasLiberadas.find((a) => a.id === aba) ? aba : abasLiberadas[0]?.id;

  const [s, setState] = React.useState(null);
  const [falha, setFalha] = React.useState(null);
  const [mesAbsSel, setMesAbsSel] = React.useState(null);
  const pedido = React.useRef(0);

  // Obra sem seleção válida: abre a primeira da lista.
  const obraValida = obras.some((o) => o.id === obraId) ? obraId : null;
  React.useEffect(() => {
    if (!obraValida && obras.length) onTrocarObra?.(obras[0].id);
  }, [obraValida, obras, onTrocarObra]);

  const carregar = React.useCallback(async (id) => {
    const n = ++pedido.current;
    setFalha(null);
    const { data, error } = await efetivoService.carregar(id);
    if (n !== pedido.current) return; // resposta de uma obra anterior
    if (error) { setFalha(error.mensagem || error.message); return; }
    setState(data);
  }, []);
  const recarregar = React.useCallback(() => (obraValida ? carregar(obraValida) : Promise.resolve()), [obraValida, carregar]);

  React.useEffect(() => {
    if (!obraValida) return;
    setState(null);
    carregar(obraValida);
  }, [obraValida, carregar]);

  const meses = React.useMemo(() => (s ? mesesDaObra(s.obra) : []), [s?.obra.inicio, s?.obra.termino]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (!meses.length) return;
    setMesAbsSel((prev) => {
      if (prev != null && meses.some((m) => m.abs === prev)) return prev;
      const atual = mesAtualAbs();
      return Math.min(Math.max(atual, meses[0].abs), meses[meses.length - 1].abs);
    });
  }, [meses]);

  const setS = React.useCallback((fn) => setState((p) => (p ? fn(p) : p)), []);

  if (!obras.length) {
    return <div style={{ padding: '48px 16px', textAlign: 'center', color: T.texto2, fontSize: 14 }}>Nenhuma obra liberada para o seu usuário.</div>;
  }
  if (!abasLiberadas.length) {
    return <div style={{ padding: '48px 16px', textAlign: 'center', color: T.texto2, fontSize: 14 }}>Você não tem nenhuma aba de Mão de Obra liberada. Fale com o administrador.</div>;
  }

  const cabecalho = (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: T.texto }}>Efetivo da obra {s?.obra.codigo ?? ''}</h1>
        <p style={{ margin: '4px 0 0', color: T.texto2, fontSize: 14 }}>Quantidade por função: previsto do mês x apropriações quinzenais.</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: T.texto2 }}>Obra
          <select value={obraValida ?? ''} onChange={(e) => onTrocarObra?.(e.target.value)} style={{ ...selStyle, minWidth: 190 }}>
            {obras.map((o) => <option key={o.id} value={o.id}>{rotuloObra(o)}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: T.texto2 }}>Período
          <select value={mesAbsSel ?? ''} disabled={!meses.length} onChange={(e) => setMesAbsSel(+e.target.value)} style={selStyle}>
            {meses.map((m) => <option key={m.abs} value={m.abs}>{m.label.replace('/', '/20')}</option>)}
          </select>
        </label>
        <div role="tablist" style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--surface)', border: `1px solid ${T.borda}`, borderRadius: 10 }}>
          {abasLiberadas.map((a) => (
            <button key={a.id} type="button" role="tab" aria-selected={abaAtual === a.id} onClick={() => setAba(a.id)}
              style={{ font: 'inherit', fontSize: 14, fontWeight: 600, border: 0, borderRadius: 7, padding: '8px 18px', cursor: 'pointer', background: abaAtual === a.id ? T.azul : 'transparent', color: abaAtual === a.id ? '#fff' : T.texto2 }}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  let corpo;
  if (falha) {
    corpo = (
      <div style={{ ...card, padding: 24, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
        <span style={{ color: T.vermelho, fontSize: 14 }}>{falha}</span>
        <button type="button" className="btn btn-ghost" onClick={recarregar}>Tentar de novo</button>
      </div>
    );
  } else if (!s) {
    corpo = <div className="content-loading"><span className="spinner" /></div>;
  } else if (!s.obra.inicio) {
    corpo = <div style={{ ...card, padding: 24, fontSize: 14, color: T.texto2 }}>Esta obra não tem data de início cadastrada. Preencha o início em Obras para usar o efetivo.</div>;
  } else if (!s.obra.termino) {
    // Sem término na obra nem no cadastro de efetivo: ele define a duração e os meses restantes.
    corpo = (
      <div style={{ ...card, padding: 24, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 14 }}>Esta obra ainda não tem término cadastrado. Informe o término da obra para montar o previsto.</span>
        <input type="date" aria-label="Término da obra" min={s.obra.inicio}
          onChange={(e) => e.target.value && setS((st) => ({ ...st, obra: { ...st.obra, termino: e.target.value } }))}
          style={{ font: 'inherit', fontSize: 13, padding: '7px 10px', border: `1px solid ${T.bordaInput}`, borderRadius: 8, background: 'var(--surface)', color: T.texto }} />
      </div>
    );
  } else if (!meses.length) {
    corpo = <div style={{ ...card, padding: 24, fontSize: 14, color: T.texto2 }}>O término da obra é anterior ao início. Corrija as datas da obra.</div>;
  } else {
    const mesSel = meses.find((m) => m.abs === mesAbsSel) ?? meses[0];
    const ctx = {
      s, setS, mesSel, setMesSel: (m) => setMesAbsSel(m.abs), meses, toast, erro, recarregar, userProfile,
      ehAdmin: isAdmin(userProfile),
      somenteLeitura: abaSomenteLeitura(userProfile, MOD, abaAtual),
    };
    if (abaAtual === 'previsto') corpo = <PrevistoTab {...ctx} />;
    else if (abaAtual === 'apropriacao') corpo = <ApropriacaoTab {...ctx} />;
    else corpo = <AnaliseTab {...ctx} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontFamily: T.fonte, color: T.texto }}>
      {cabecalho}
      {corpo}
    </div>
  );
}
