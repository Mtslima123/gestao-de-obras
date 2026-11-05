import React from 'react';
import { Modal } from '../../../../components/Modals';
import { computeRowNumberMap, formatDepList } from '../../../cronograma/scheduleEngine';
import { isoToBR } from '../../../cronograma/cronogramaDateUtils';
import {
  chaveDeSituacao, rotuloDeSituacao, datasDaTarefa, camposEditaveis, valoresIniciais, validarFolha, aplicarFolha,
  formatarPercentual,
} from './cronogramaMobilePure';
import { comparacaoComBase, textoDaVariacao } from './linhaDoTempoPure';

const ATALHOS_DE_AVANCO = [0, 25, 50, 75, 100];

// Folha de edição da tarefa, usada pela Lista e pela Linha do tempo (a janela vira folha por baixo na casca, ver
// mobileFull.css). Mesmos campos do formulário do Gantt. Grupo só renomeia: datas e avanço dele vêm dos filhos.
// `base` (opcional) mostra, só para leitura, onde a tarefa estava na linha de base escolhida.
const FolhaTarefa = ({ tarefa, wbs, datas, predecessoras, sucessoras, base, baseNome, readOnly, onSalvar, onClose }) => {
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
        {base && (
          <div className="field full">
            <label>Linha de base{baseNome ? ` (${baseNome})` : ''}</label>
            <div className="mfs-leitura coluna">
              <span>{isoToBR(base.inicioISO)} a {isoToBR(base.fimISO)}</span>
              <span className={'mfs-variacao' + (base.variacaoDias > 0 ? ' atraso' : base.variacaoDias < 0 ? ' adiantada' : '')}>
                Término {textoDaVariacao(base.variacaoDias)}
              </span>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

// Abre a folha da tarefa `tarefaId` com tudo o que ela mostra já calculado a partir do cronograma. Salvar monta o novo
// array de etapas campo a campo (aplicarFolha) e entrega ao `commit` do CronogramaFull, que é quem grava, desfaz e
// recusa vínculo cruzado. Devolve null se a tarefa deixou de existir (outra pessoa a excluiu, por exemplo).
const FolhaDaTarefaAberta = ({ etapas, tarefaId, wbsMap, groupVals, succMap, readOnly, onCommit, onClose, baseEtapa, baseNome }) => {
  const numeroDaLinha = React.useMemo(() => computeRowNumberMap(etapas), [etapas]);
  const tarefa = etapas.find(e => e.id === tarefaId);
  if (!tarefa) return null;
  const salvar = (valores) => {
    const novas = aplicarFolha(etapas, tarefaId, valores);
    if (novas !== etapas) onCommit(novas);
    onClose();
  };
  return (
    <FolhaTarefa
      key={tarefa.id}
      tarefa={tarefa}
      wbs={wbsMap?.[tarefa.id] ?? ''}
      datas={datasDaTarefa(tarefa, groupVals)}
      predecessoras={formatDepList(tarefa.dep, etapas, numeroDaLinha)}
      sucessoras={(succMap?.[tarefa.id] || []).map(id => numeroDaLinha[id]).filter(Boolean).join('; ')}
      base={baseEtapa ? comparacaoComBase(tarefa, baseEtapa, groupVals) : null}
      baseNome={baseNome}
      readOnly={readOnly}
      onSalvar={salvar}
      onClose={onClose}
    />
  );
};

export { FolhaTarefa, FolhaDaTarefaAberta };
