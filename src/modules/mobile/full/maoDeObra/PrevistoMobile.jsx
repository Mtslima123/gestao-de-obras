import React from 'react';
import { Icon } from '../../../../components/Icons';
import { Modal } from '../../../../components/Modals';
import { corMediaRestante, corSaldo, mesAbs, mesesEntre } from '../../../maoDeObra/efetivo/regras';
import { T, corUi } from '../../../maoDeObra/efetivo/tokens';
import { GRUPOS, fimDoMesIso, lerQtd, mesDeAbs } from '../../../maoDeObra/efetivo/efetivoStore';
import { CampoData } from '../../../maoDeObra/efetivo/CampoData';
import { CampoQtd } from '../../../maoDeObra/efetivo/CampoQtd';
import { fmt1, fmtSaldo, fmtMedia, somarQtd, dataBR } from './maoDeObraMobilePure';
import { FolhaDeAcoes, Kpis, Pilula } from './maoDeObraMobileUi';

// Uma função da obra: quantidade por mês (com − e +), início e término, e os números calculados. Quando o previsto está
// trancado (ou o usuário só consulta) os campos viram texto, como no desktop.
const CartaoDeFuncao = ({
  s, linha, editavel, podeRemover, bloqueada, ocupado, setPrev, onPedirRemover,
}) => {
  const { f, p, q, meses, tot, c, sd, med } = linha;
  const inicio = p?.inicio ?? s.obra.inicio;
  const termino = p?.termino ?? fimDoMesIso(mesDeAbs(mesAbs(s.obra.termino)));
  return (
    <li className="mfs-mo-cartao">
      <div className="mfs-mo-cartao-topo">
        <strong className="mfs-mo-cartao-nome">{f.nome}</strong>
        {podeRemover && (
          <button type="button" className="mfs-mo-lixeira" disabled={ocupado || bloqueada} onClick={() => onPedirRemover(f)}
            aria-label={`Remover ${f.nome} desta obra`}
            title={bloqueada ? 'Tem apropriação nesta obra, não pode ser removida' : 'Remover esta função da lista desta obra'}>
            <Icon name="trash" size={16} stroke={2.2} />
          </button>
        )}
      </div>

      {editavel ? (
        <div className="mfs-mo-campos">
          <div className="mfs-mo-campo qtd"><span>Qtd/mês</span>
            <div className="mfs-mo-stepper">
              <button type="button" aria-label={`Diminuir a quantidade por mês de ${f.nome}`} disabled={q <= 0} onClick={() => setPrev(f.id, { qtdMes: somarQtd(q, -1) })}>−</button>
              <CampoQtd decimal className="input" value={q} aria-label={`Quantidade por mês de ${f.nome}`} onChange={(e) => setPrev(f.id, { qtdMes: lerQtd(e.target.value) })} />
              <button type="button" aria-label={`Aumentar a quantidade por mês de ${f.nome}`} onClick={() => setPrev(f.id, { qtdMes: somarQtd(q, 1) })}>+</button>
            </div>
          </div>
          <label className="mfs-mo-campo"><span>Início</span>
            <CampoData className="input" value={inicio} aria-label={`Início de ${f.nome}`} onConfirmar={(v) => setPrev(f.id, { inicio: v })} />
          </label>
          <label className="mfs-mo-campo"><span>Término</span>
            <CampoData className="input" value={termino} aria-label={`Término de ${f.nome}`} onConfirmar={(v) => setPrev(f.id, { termino: v })} />
          </label>
        </div>
      ) : (
        <dl className="mfs-mo-metricas">
          <div><dt>Qtd/mês</dt><dd><b>{fmt1(q)}</b></dd></div>
          <div><dt>Início</dt><dd>{dataBR(inicio)}</dd></div>
          <div><dt>Término</dt><dd>{dataBR(termino)}</dd></div>
        </dl>
      )}

      <dl className="mfs-mo-metricas">
        <div><dt>Meses</dt><dd>{meses}</dd></div>
        <div><dt>Orçado</dt><dd>{fmt1(tot)}</dd></div>
        <div><dt>Consumido</dt><dd>{fmt1(c)}</dd></div>
      </dl>
      <div className="mfs-mo-saldos">
        <div><span>Saldo</span><b style={{ color: corUi(corSaldo(sd)) }}>{fmtSaldo(sd)}</b></div>
        <div><span>Média restante</span><b style={{ color: corUi(corMediaRestante(med, q)) }}>{fmtMedia(med)}</b></div>
      </div>
    </li>
  );
};

// Folha para cadastrar uma função nova (só admin, com o previsto aberto). Estado e gravação são os do PrevistoTab.
const FolhaNovaFuncao = ({ nova, setNova, ocupado, cadastrar }) => (
  <Modal title="Nova função" size="sm" onClose={() => setNova(null)}
    footer={<>
      <button type="button" className="btn btn-ghost" onClick={() => setNova(null)}>Cancelar</button>
      <button type="button" className="btn btn-primary" disabled={ocupado} onClick={cadastrar}>Cadastrar função</button>
    </>}>
    <div className="mfs-mo-form">
      <label className="mfs-mo-campo"><span>Nome da função</span>
        <input autoFocus className="input" value={nova.nome} placeholder="Ex.: Armador" autoComplete="off" onChange={(e) => setNova({ ...nova, nome: e.target.value })} />
      </label>
      <label className="mfs-mo-campo"><span>Grupo</span>
        <select className="input" value={nova.g} onChange={(e) => setNova({ ...nova, g: e.target.value })}>
          {GRUPOS.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
        </select>
      </label>
      <label className="mfs-mo-campo"><span>Qtd/mês</span>
        <CampoQtd decimal className="input" value={nova.q} onChange={(e) => setNova({ ...nova, q: lerQtd(e.target.value) })} />
      </label>
      <div className="mfs-mo-form-datas">
        <label className="mfs-mo-campo"><span>Início</span>
          <input type="date" className="input" value={nova.ini} onChange={(e) => setNova({ ...nova, ini: e.target.value })} />
        </label>
        <label className="mfs-mo-campo"><span>Término</span>
          <input type="date" className="input" value={nova.fim} onChange={(e) => setNova({ ...nova, fim: e.target.value })} />
        </label>
      </div>
    </div>
  </Modal>
);

// Aba Previsto no celular. Quem calcula, grava e confirma é o PrevistoTab (as mesmas regras do desktop); aqui só se
// apresenta e se chamam os mesmos manipuladores. Os modais de importação e de remoção continuam os do PrevistoTab.
const PrevistoMobile = ({
  s, setS, mesSel, locked, somenteLeitura, ehAdmin, podeRemover, ocupado, etiqueta, rest,
  TT, TC, grupos, removidas, comAprop, nova, setNova, cadastrar, setPrev,
  alternarTrava, baixarModelo, escolherArquivo, onGrupos, onPedirRemover, onRestaurar,
}) => {
  const [recolhidos, setRecolhidos] = React.useState({});
  const [acoes, setAcoes] = React.useState(false);
  const editavel = !locked && !somenteLeitura;
  const total = grupos.reduce((n, g) => n + g.rows.length, 0);

  const listaDeAcoes = editavel ? [
    ...(ehAdmin ? [
      { chave: 'grupos', rotulo: 'Grupos e classificações', detalhe: 'Define onde cada função aparece e como são somadas', icone: 'filter', onClick: onGrupos },
      { chave: 'nova', rotulo: 'Nova função', detalhe: 'Cadastra uma função (vale para todas as obras)', icone: 'plus', onClick: () => setNova({ nome: '', g: 'OFICIAL', q: 1, ini: mesSel.iso, fim: s.obra.termino }) },
    ] : []),
    { chave: 'modelo', rotulo: 'Baixar modelo', detalhe: 'Planilha padrão com as funções da obra', icone: 'file', disabled: ocupado, onClick: baixarModelo },
    { chave: 'importar', rotulo: 'Importar do orçamento', detalhe: 'Arquivo .xlsx ou .xls; confira antes de salvar', icone: 'upload', disabled: ocupado, arquivo: { accept: '.xlsx,.xls', onChange: escolherArquivo } },
  ] : [];

  return (
    <div className={'mfs-mo-tela' + (!somenteLeitura ? ' com-barra' : '')}>
      <Kpis itens={[
        { rotulo: 'Total orçado', valor: fmt1(TT), detalhe: 'pessoa-mês (qtd/mês × meses)' },
        { rotulo: 'Consumido', valor: fmt1(TC), cor: T.azul, detalhe: `última apropriação até ${mesSel.label}` },
        { rotulo: 'Saldo do orçamento', valor: fmtSaldo(TT - TC), cor: corUi(corSaldo(TT - TC)), detalhe: `${TT ? Math.round(((TT - TC) / TT) * 100) : 0}% do orçado ainda disponível` },
        { rotulo: 'Duração', valor: `${mesesEntre(s.obra.inicio, s.obra.termino)} meses`, detalhe: `${mesDeAbs(mesAbs(s.obra.inicio)).label} a ${mesDeAbs(mesAbs(s.obra.termino)).label}` },
      ]} />

      <section className="mfs-mo-secao">
        <div className="mfs-mo-estado">
          <h2 className="mfs-mo-titulo">Previsto do orçamento</h2>
          <Pilula cor={locked ? T.texto2 : T.laranja} fundo={locked ? T.faixa : T.laranjaBg}>
            <Icon name={locked ? 'lock' : 'unlock'} size={12} stroke={2.2} />{etiqueta}
          </Pilula>
        </div>
        <span className="mfs-mo-sub">Lançado uma vez: quantidade por mês, início e término de cada função. Os meses são calculados.</span>
        <div className="mfs-mo-form-datas">
          <label className="mfs-mo-campo"><span>Início da obra</span>
            <CampoData className="input" value={s.obra.inicio} max={s.obra.termino} disabled={!editavel} aria-label="Início da obra"
              onConfirmar={(v) => setS((st) => ({ ...st, obra: { ...st.obra, inicio: v } }))} />
          </label>
          <label className="mfs-mo-campo"><span>Término da obra</span>
            <CampoData className="input" value={s.obra.termino} min={s.obra.inicio} disabled={!editavel} aria-label="Término da obra"
              onConfirmar={(v) => setS((st) => ({ ...st, obra: { ...st.obra, termino: v } }))} />
          </label>
        </div>
      </section>

      {total === 0 && <div className="mfs-aviso mfs-mo-vazio">Nenhuma função na lista desta obra.</div>}

      {grupos.map(({ g, rows, gt, gc, gm }) => rows.length > 0 && (
        <section key={g.id} className="mfs-mo-grupo">
          <button type="button" className="mfs-mo-grupo-cab" aria-expanded={!recolhidos[g.id]} onClick={() => setRecolhidos((r) => ({ ...r, [g.id]: !r[g.id] }))}>
            <Icon name={recolhidos[g.id] ? 'chevron-right' : 'chevron-down'} size={18} stroke={2.4} />
            <strong>{g.nome}</strong>
            <span className="mfs-mo-grupo-qtd">{rows.length}</span>
            <span className="mfs-mo-grupo-nums">
              Orçado {fmt1(gt)} · Saldo <b style={{ color: corUi(corSaldo(gt - gc)) }}>{fmtSaldo(gt - gc)}</b> · Média {gm == null ? '—' : fmt1(gm)}
            </span>
          </button>
          {!recolhidos[g.id] && (
            <ul className="mfs-mo-lista">
              {rows.map((linha) => (
                <CartaoDeFuncao key={linha.f.id} s={s} linha={linha} editavel={editavel} podeRemover={podeRemover}
                  bloqueada={comAprop.has(linha.f.id)} ocupado={ocupado} setPrev={setPrev} onPedirRemover={onPedirRemover} />
              ))}
            </ul>
          )}
        </section>
      ))}

      {podeRemover && removidas.length > 0 && (
        <section className="mfs-mo-secao">
          <h2 className="mfs-mo-titulo">Funções removidas desta obra</h2>
          <div className="mfs-mo-chips">
            {removidas.map((f) => (
              <button key={f.id} type="button" className="mfs-mo-chip" disabled={ocupado} onClick={() => onRestaurar(f)} title="Trazer de volta para a lista desta obra">
                <Icon name="plus" size={12} stroke={2.2} />Restaurar {f.nome}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="mfs-mo-legenda">
        <span>Orçado, consumido e saldo em pessoa-mês · saldo = orçado − consumido · média restante = saldo ÷ {rest} {rest === 1 ? 'mês restante' : 'meses restantes'} até o término da obra</span>
        <span><b style={{ color: T.azul }}>●</b> Média acima da qtd/mês</span>
        <span><b style={{ color: T.vermelho }}>●</b> Abaixo: precisa reduzir</span>
      </div>

      {!somenteLeitura && (
        <div className="mfs-mo-fixa" role="region" aria-label="Ações do previsto">
          {listaDeAcoes.length > 0 && (
            <button type="button" className="btn btn-ghost" onClick={() => setAcoes(true)}><Icon name="dots" size={16} />Ações</button>
          )}
          <button type="button" className="btn btn-primary" disabled={ocupado} onClick={alternarTrava}>
            <Icon name={locked ? 'unlock' : 'lock'} size={16} stroke={2.2} />{locked ? 'Editar previsto' : 'Salvar previsto'}
          </button>
        </div>
      )}

      {acoes && <FolhaDeAcoes titulo="Ações do previsto" acoes={listaDeAcoes} onClose={() => setAcoes(false)} />}
      {nova && <FolhaNovaFuncao nova={nova} setNova={setNova} ocupado={ocupado} cadastrar={cadastrar} />}
    </div>
  );
};

export { PrevistoMobile };
