import React from 'react';
import { Icon } from '../../../../components/Icons';
import { Modal } from '../../../../components/Modals';
import { computeRowNumberMap, formatDepList } from '../../../cronograma/scheduleEngine';
import { isoToBR } from '../../../cronograma/cronogramaDateUtils';
import {
  FILTROS_DE_SITUACAO, chaveDeSituacao, rotuloDeSituacao, linhasDaLista, idsDeGrupos, expandidosIniciais,
  datasDaTarefa, terminoProjetadoISO, camposEditaveis, valoresIniciais, validarFolha, aplicarFolha, formatarPercentual,
} from './cronogramaMobilePure';

const TAMANHO_DA_PAGINA = 120;
const ATALHOS_DE_AVANCO = [0, 25, 50, 75, 100];

// Lista do Cronograma na casca mobile: um cartão por linha da EAP, com os grupos abrindo e fechando e uma folha
// para editar a tarefa. Os dados e a gravação são os do CronogramaFull (a Lista do desktop usa os mesmos): aqui
// só muda a apresentação. Abrir e fechar grupo é só desta tela (não grava), para não mexer no que a equipe vê.
const ListaMobile = ({
  etapas, onCommit, readOnly, wbsMap, groupVals, succMap, avancoTotal, undo, redo, canUndo, canRedo,
}) => {
  const [expandidos, setExpandidos] = React.useState(() => expandidosIniciais(etapas));
  const [texto, setTexto] = React.useState('');
  const [filtro, setFiltro] = React.useState('todas');
  const [limite, setLimite] = React.useState(TAMANHO_DA_PAGINA);
  const [abertaId, setAbertaId] = React.useState(null);
  const numeroDaLinha = React.useMemo(() => computeRowNumberMap(etapas), [etapas]);

  const linhas = React.useMemo(
    () => linhasDaLista({ etapas, wbsMap, expandidos, texto, filtro }),
    [etapas, wbsMap, expandidos, texto, filtro],
  );
  // Busca ou filtro novo volta ao começo da lista.
  React.useEffect(() => { setLimite(TAMANHO_DA_PAGINA); }, [texto, filtro]);

  const alternar = (id) => setExpandidos(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const aberta = abertaId ? etapas.find(e => e.id === abertaId) : null;
  const termino = terminoProjetadoISO(etapas, groupVals);
  const filtrando = !!texto.trim() || filtro !== 'todas';

  const salvar = (valores) => {
    const novas = aplicarFolha(etapas, abertaId, valores);
    if (novas !== etapas) onCommit(novas);
    setAbertaId(null);
  };

  return (
    <div className="mfs-lista">
      <section className="mfs-resumo" aria-label="Resumo do cronograma">
        <div className="mfs-resumo-item">
          <span className="mfs-resumo-rotulo">Avanço físico</span>
          <strong className="mfs-resumo-valor">{formatarPercentual(avancoTotal)}</strong>
          <div className="progress"><span style={{ width: Math.min(100, avancoTotal || 0) + '%' }}></span></div>
        </div>
        <div className="mfs-resumo-item">
          <span className="mfs-resumo-rotulo">Término projetado</span>
          <strong className="mfs-resumo-valor">{termino ? isoToBR(termino) : '—'}</strong>
        </div>
      </section>

      <div className="mfs-lista-controles">
        <div className="mfs-filtros-linha">
          <input
            className="input input-search mfs-busca" type="search" inputMode="search"
            placeholder="Buscar tarefa…" aria-label="Buscar por tarefa, responsável ou pavimento"
            value={texto} onChange={(e) => setTexto(e.target.value)}
          />
          <select className="input mfs-situacao" aria-label="Situação" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            {FILTROS_DE_SITUACAO.map(f => <option key={f.id} value={f.id}>{f.id === 'todas' ? 'Todas as situações' : f.label}</option>)}
          </select>
        </div>
        <div className="mfs-acoes-lista">
          <button type="button" className="mfs-acao" onClick={() => setExpandidos(idsDeGrupos(etapas))} disabled={filtrando}>Expandir tudo</button>
          <button type="button" className="mfs-acao" onClick={() => setExpandidos(new Set())} disabled={filtrando}>Recolher tudo</button>
          <span className="mfs-acoes-espaco" />
          <button type="button" className="mfs-acao" onClick={undo} disabled={readOnly || !canUndo}>Desfazer</button>
          <button type="button" className="mfs-acao" onClick={redo} disabled={readOnly || !canRedo}>Refazer</button>
        </div>
      </div>

      {linhas.length === 0 ? (
        <div className="card"><div className="card-body mfs-aviso">Nenhuma tarefa encontrada para a busca e o filtro atuais.</div></div>
      ) : (
        <ul className="mfs-tarefas">
          {linhas.slice(0, limite).map(({ e, nivel, temFilhos, aberto }) => {
            const datas = datasDaTarefa(e, groupVals);
            const sit = e.isGroup ? null : chaveDeSituacao(e);
            const expansivel = e.isGroup && temFilhos;
            return (
              <li key={e.id} className={'mfs-tarefa' + (e.isGroup ? ' grupo' : '')} style={{ marginLeft: Math.min(nivel, 5) * 10 }}>
                <button
                  type="button" className="mfs-tarefa-corpo"
                  aria-expanded={expansivel ? aberto : undefined}
                  onClick={() => (expansivel ? alternar(e.id) : setAbertaId(e.id))}
                >
                  <span className="mfs-tarefa-topo">
                    {expansivel && <Icon name={aberto ? 'chevron-down' : 'chevron-right'} size={16} />}
                    <span className="mono mfs-tarefa-wbs">{wbsMap?.[e.id] ?? ''}</span>
                    {sit && <span className={'mfs-sit ' + sit}>{rotuloDeSituacao(sit)}</span>}
                  </span>
                  <span className="mfs-tarefa-nome">{e.etapa}</span>
                  <span className="mfs-tarefa-datas">{isoToBR(datas.inicioISO)} a {isoToBR(datas.fimISO)} · {datas.dur} d</span>
                  <span className="mfs-tarefa-prog">
                    <span className={'progress' + (sit === 'concluidas' ? ' success' : sit === 'atrasadas' ? ' danger' : '')}>
                      <span style={{ width: Math.min(100, datas.avanco) + '%' }}></span>
                    </span>
                    <b>{formatarPercentual(datas.avanco)}</b>
                  </span>
                  {(e.responsavel || e.pavimento) && (
                    <span className="mfs-tarefa-tags">
                      {e.responsavel && <span className="mfs-tag">{e.responsavel}</span>}
                      {e.pavimento && <span className="mfs-tag">{e.pavimento}</span>}
                    </span>
                  )}
                </button>
                {e.isGroup && (
                  <button type="button" className="mfs-tarefa-detalhe" aria-label={`Detalhes de ${e.etapa}`} onClick={() => setAbertaId(e.id)}>
                    <Icon name={readOnly ? 'eye' : 'edit'} size={16} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {linhas.length > limite && (
        <button type="button" className="btn btn-ghost mfs-mais" onClick={() => setLimite(l => l + TAMANHO_DA_PAGINA)}>
          Mostrar mais ({linhas.length - limite} restantes)
        </button>
      )}

      {aberta && (
        <FolhaTarefa
          key={aberta.id}
          tarefa={aberta}
          wbs={wbsMap?.[aberta.id] ?? ''}
          datas={datasDaTarefa(aberta, groupVals)}
          predecessoras={formatDepList(aberta.dep, etapas, numeroDaLinha)}
          sucessoras={(succMap?.[aberta.id] || []).map(id => numeroDaLinha[id]).filter(Boolean).join('; ')}
          readOnly={readOnly}
          onSalvar={salvar}
          onClose={() => setAbertaId(null)}
        />
      )}
    </div>
  );
};

// Folha de edição da tarefa (a janela vira folha por baixo na casca, ver mobileFull.css). Mesmos campos do formulário
// do Gantt. Grupo só renomeia: datas e avanço dele vêm dos filhos.
const FolhaTarefa = ({ tarefa, wbs, datas, predecessoras, sucessoras, readOnly, onSalvar, onClose }) => {
  const [valores, setValores] = React.useState(() => valoresIniciais(tarefa));
  const [erros, setErros] = React.useState({});
  const editaveis = camposEditaveis(tarefa);
  const mudou = JSON.stringify(valores) !== JSON.stringify(valoresIniciais(tarefa));
  const sit = tarefa.isGroup ? null : chaveDeSituacao(tarefa);
  const trava = (campo) => readOnly || !editaveis.includes(campo);

  const set = (campo, v) => { setValores(s => ({ ...s, [campo]: v })); setErros(er => ({ ...er, [campo]: undefined })); };
  const tentarSalvar = () => {
    const er = validarFolha(valores, tarefa);
    if (Object.keys(er).length) { setErros(er); return; }
    onSalvar(valores);
  };

  return (
    <Modal
      title={`${tarefa.isGroup ? 'Grupo' : 'Tarefa'} ${wbs}`}
      subtitle={sit ? rotuloDeSituacao(sit) : undefined}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>{mudou && !readOnly ? 'Cancelar' : 'Fechar'}</button>
          {!readOnly && <button type="button" className="btn btn-primary" onClick={tentarSalvar} disabled={!mudou}>Salvar</button>}
        </>
      )}
    >
      {readOnly && <div className="mfs-aviso-folha">Somente consulta: você não pode alterar este cronograma agora.</div>}
      <div className="form-grid">
        <div className="field full">
          <label htmlFor="mfs-f-etapa">Nome</label>
          <input id="mfs-f-etapa" value={valores.etapa} disabled={trava('etapa')} onChange={(e) => set('etapa', e.target.value)} />
          {erros.etapa && <div className="mfs-erro">{erros.etapa}</div>}
        </div>
        {tarefa.isGroup ? (
          <>
            <div className="field"><label>Início</label><div className="mfs-leitura">{isoToBR(datas.inicioISO)}</div></div>
            <div className="field"><label>Término</label><div className="mfs-leitura">{isoToBR(datas.fimISO)}</div></div>
            <div className="field"><label>Avanço</label><div className="mfs-leitura">{formatarPercentual(datas.avanco)}</div></div>
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor="mfs-f-inicio">Início</label>
              <input id="mfs-f-inicio" type="date" value={valores.inicio} disabled={trava('inicio')} onChange={(e) => set('inicio', e.target.value)} />
              {erros.inicio && <div className="mfs-erro">{erros.inicio}</div>}
            </div>
            <div className="field">
              <label htmlFor="mfs-f-dur">Duração (dias úteis)</label>
              <input id="mfs-f-dur" type="number" inputMode="numeric" min={1} value={valores.duracaoDias} disabled={trava('duracaoDias')} onChange={(e) => set('duracaoDias', e.target.value)} />
              {erros.duracaoDias && <div className="mfs-erro">{erros.duracaoDias}</div>}
            </div>
            <div className="field full">
              <label htmlFor="mfs-f-avanco">% concluída</label>
              <input id="mfs-f-avanco" type="number" inputMode="numeric" min={0} max={100} value={valores.avanco} disabled={trava('avanco')} onChange={(e) => set('avanco', e.target.value)} />
              {!trava('avanco') && (
                <div className="mfs-atalhos-avanco">
                  {ATALHOS_DE_AVANCO.map(p => (
                    <button key={p} type="button" className={'chip' + (String(p) === String(valores.avanco) ? ' active' : '')} onClick={() => set('avanco', String(p))}>{p}%</button>
                  ))}
                </div>
              )}
              {erros.avanco && <div className="mfs-erro">{erros.avanco}</div>}
            </div>
            <div className="field full">
              <label htmlFor="mfs-f-resp">Responsável</label>
              <input id="mfs-f-resp" value={valores.responsavel} disabled={trava('responsavel')} onChange={(e) => set('responsavel', e.target.value)} />
            </div>
            <div className="field"><label>Término (calculado)</label><div className="mfs-leitura">{isoToBR(datas.fimISO)}</div></div>
            {tarefa.pavimento && <div className="field"><label>Pavimento</label><div className="mfs-leitura">{tarefa.pavimento}</div></div>}
            <div className="field full"><label>Predecessoras (nº da linha)</label><div className="mfs-leitura">{predecessoras || '—'}</div></div>
            <div className="field full"><label>Sucessoras (nº da linha)</label><div className="mfs-leitura">{sucessoras || '—'}</div></div>
          </>
        )}
      </div>
    </Modal>
  );
};

export { ListaMobile };
