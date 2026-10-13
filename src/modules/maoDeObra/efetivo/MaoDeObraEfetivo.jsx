import React from 'react';
import { useToast } from '../../../components/Modals';
import { abaSomenteLeitura, filtrarAbas, isAdmin } from '../../../utils/permissions';
import { MODULO_ABAS } from '../../../config/modulos';
import { Icon } from '../../../components/Icons';
import { T, card, btn } from './tokens';
import { efetivoService } from './efetivo.service';
import { mesFechado, mesesApropriaveis, mesesDaObra } from './efetivoStore';
import { PrevistoTab } from './PrevistoTab';
import { ApropriacaoTab } from './ApropriacaoTab';
import { AnaliseTab } from './AnaliseTab';
import { MesesApropriacaoModal } from './MesesApropriacaoModal';
import { CampoData } from './CampoData';

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
  const [modalMeses, setModalMeses] = React.useState(false);
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

  // Na Apropriação a lista de períodos é menor: só o mês atual, os que já têm apropriação e os
  // que um admin habilitou. Previsto e Análise seguem com todos os meses da obra. O mês da
  // Apropriação é derivado (não mexe em mesAbsSel): fora da lista, vale o atual ou o último.
  const ehAdmin = isAdmin(userProfile);
  const naApropriacao = abaAtual === 'apropriacao';
  const listaPeriodo = naApropriacao && s ? mesesApropriaveis(s, meses, mesAtualAbs()) : meses;
  const mesListado = listaPeriodo.find((m) => m.abs === mesAbsSel) ?? listaPeriodo.find((m) => m.abs === mesAtualAbs()) ?? listaPeriodo[listaPeriodo.length - 1];

  const cabecalho = (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: T.texto }}>Efetivo da obra {s?.obra.codigo ?? ''}</h1>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: T.texto2 }}>Obra
          <select value={obraValida ?? ''} onChange={(e) => onTrocarObra?.(e.target.value)} style={{ ...selStyle, minWidth: 190 }}>
            {obras.map((o) => <option key={o.id} value={o.id}>{rotuloObra(o)}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: T.texto2 }}>Período
          <select value={mesListado?.abs ?? ''} disabled={!listaPeriodo.length} onChange={(e) => setMesAbsSel(+e.target.value)} style={selStyle}>
            {listaPeriodo.map((m) => <option key={m.abs} value={m.abs}>{m.label.replace('/', '/20')}</option>)}
          </select>
        </label>
        {ehAdmin && naApropriacao && s && meses.length > 0 && (
          <button type="button" style={{ ...btn, padding: '8px 12px' }} onClick={() => setModalMeses(true)}>
            <Icon name="calendar" size={15} stroke={2.2} />Gerenciar meses
          </button>
        )}
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
  } else if (!meses.length) {
    // Obra sem início e/ou término (nem no cadastro de obras nem no de efetivo), ou com as datas
    // trocadas: as duas datas definem os meses da tela e os meses restantes. Quando ficam
    // válidas, este cartão some sozinho; são gravadas junto com o previsto.
    const campo = { background: 'var(--surface)', color: T.texto, font: 'inherit', fontSize: 13, padding: '7px 10px', border: `1px solid ${T.bordaInput}`, borderRadius: 8 };
    corpo = (
      <div style={{ ...card, padding: 24, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 14 }}>
          {s.obra.inicio && s.obra.termino
            ? 'O término da obra é anterior ao início. Corrija as datas.'
            : 'Informe o início e o término da obra para montar o previsto.'}
        </span>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: T.texto2 }}>Início da obra
            <CampoData value={s.obra.inicio ?? ''} aria-label="Início da obra" style={campo}
              onConfirmar={(v) => setS((st) => ({ ...st, obra: { ...st.obra, inicio: v } }))} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: T.texto2 }}>Término da obra
            <CampoData value={s.obra.termino ?? ''} aria-label="Término da obra" style={campo}
              onConfirmar={(v) => setS((st) => ({ ...st, obra: { ...st.obra, termino: v } }))} />
          </label>
        </div>
      </div>
    );
  } else if (naApropriacao && !mesListado) {
    corpo = (
      <div style={{ ...card, padding: 24, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Nenhum mês habilitado para apropriação nesta obra.</span>
        <span style={{ fontSize: 13.5, color: T.texto2 }}>
          {ehAdmin ? 'Use "Gerenciar meses" para liberar um mês.' : 'Fale com o administrador para habilitar um mês.'}
        </span>
      </div>
    );
  } else {
    const mesSel = (naApropriacao ? mesListado : meses.find((m) => m.abs === mesAbsSel)) ?? meses[0];
    const fechado = naApropriacao && mesFechado(s, mesSel);
    const ctx = {
      s, setS, mesSel, setMesSel: (m) => setMesAbsSel(m.abs), meses, toast, erro, recarregar, userProfile,
      ehAdmin,
      // mo_efetivo_estado só devolve o código da obra; o nome vem da lista de obras da tela
      // (usado no título dos arquivos exportados).
      obraNome: obras.find((o) => o.id === obraValida)?.nome ?? '',
      somenteLeitura: abaSomenteLeitura(userProfile, MOD, abaAtual) || fechado,
      mesFechado: fechado,
    };
    if (abaAtual === 'previsto') corpo = <PrevistoTab {...ctx} />;
    else if (abaAtual === 'apropriacao') corpo = <ApropriacaoTab {...ctx} />;
    else corpo = <AnaliseTab {...ctx} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontFamily: T.fonte, color: T.texto }}>
      {cabecalho}
      {corpo}
      {modalMeses && s && (
        <MesesApropriacaoModal s={s} meses={meses} mesAtualAbs={mesAtualAbs()} recarregar={recarregar} toast={toast} erro={erro}
          onHabilitado={setMesAbsSel} onClose={() => setModalMeses(false)} />
      )}
    </div>
  );
}
