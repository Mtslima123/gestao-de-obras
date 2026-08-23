// Verificador ortográfico da Lista (F7), estilo Word/Project: revisão passo a passo com
// Ignorar / Ignorar todas / Alterar / Alterar todas / Adicionar ao dicionário.
//
// Estado por CURSOR derivado ({ taskId, offset }), não fila pré-calculada — cada "Alterar"
// muda a identidade de `etapas` (novo commit), então uma fila calculada de antemão ficaria
// com índices/offsets obsoletos. Em vez disso, a ocorrência atual é recomputada a cada
// render a partir de `etapas` + `cursor` (useMemo), sempre lendo o texto mais recente.
import React from 'react';
import { Modal } from '../../components/Modals';
import { tokenizarEtapa, deveIgnorarToken, gerarSugestoes } from './spellcheckPure';
import { carregarVerificador, correta, adicionarAoDicionarioPessoal } from './spellcheck';

// Acha a primeira palavra desconhecida a partir de `cursor` (inclusive), percorrendo
// `etapas` na ordem do array. Pula o que `deveIgnorarToken` e o que foi "ignorado" nesta
// sessão de revisão. Retorna null quando não sobra nenhuma ocorrência.
function proximaOcorrencia(etapas, cursor, indice, ignoradasSessao) {
  if (!indice) return null;
  const startIdx = cursor.taskId == null ? 0 : Math.max(0, etapas.findIndex(e => e.id === cursor.taskId));
  for (let i = startIdx; i < etapas.length; i++) {
    const e = etapas[i];
    const texto = e.etapa || '';
    const minOffset = e.id === cursor.taskId ? cursor.offset : 0;
    for (const t of tokenizarEtapa(texto)) {
      if (t.inicio < minOffset) continue;
      if (deveIgnorarToken(t.palavra)) continue;
      if (ignoradasSessao.has(t.palavra.toLocaleLowerCase('pt-BR'))) continue;
      if (correta(indice, t.palavra)) continue;
      return { taskId: e.id, palavra: t.palavra, inicio: t.inicio, fim: t.fim };
    }
  }
  return null;
}

export function OrtografiaModal({ etapas, filtrada, onAlterarUma, onAlterarTodas, onFocarTarefa, onClose }) {
  const [fase, setFase] = React.useState('carregando'); // carregando | revisando | concluido | erro
  const [cursor, setCursor] = React.useState({ taskId: null, offset: 0 });
  const [substituto, setSubstituto] = React.useState('');
  const indiceRef = React.useRef(null);
  const ignoradasSessaoRef = React.useRef(new Set());

  React.useEffect(() => {
    let cancelado = false;
    carregarVerificador()
      .then(indice => { if (cancelado) return; indiceRef.current = indice; setFase('revisando'); })
      .catch(() => { if (!cancelado) setFase('erro'); });
    return () => { cancelado = true; };
  }, []);

  const ocorrencia = React.useMemo(() => {
    if (fase !== 'revisando' || !indiceRef.current) return null;
    return proximaOcorrencia(etapas, cursor, indiceRef.current, ignoradasSessaoRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etapas, cursor, fase]);

  const sugestoes = React.useMemo(() => (
    ocorrencia && indiceRef.current ? gerarSugestoes(indiceRef.current, ocorrencia.palavra) : []
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [ocorrencia?.taskId, ocorrencia?.inicio, ocorrencia?.palavra]);

  // Ao mudar de ocorrência: arma o campo "Alterar para" com a 1ª sugestão e rola até a
  // tarefa (só quando ela está visível pelo filtro atual — senão avisa em vez de rolar
  // pro lugar errado). Quando não sobra ocorrência, fecha a revisão com "concluído".
  React.useEffect(() => {
    if (!ocorrencia) { setFase(f => (f === 'revisando' ? 'concluido' : f)); return; }
    setSubstituto(sugestoes[0] ?? ocorrencia.palavra);
    if (filtrada?.some(e => e.id === ocorrencia.taskId)) onFocarTarefa?.(ocorrencia.taskId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ocorrencia?.taskId, ocorrencia?.inicio]);

  // Resume a partir do INÍCIO da ocorrência tratada (não de um offset previsto): o texto
  // vai mudar (Alterar/Alterar todas) ou não (Ignorar), e deixar o tokenizador recontar em
  // cima do texto atualizado evita offsets errados quando a mesma palavra aparece 2x na
  // mesma tarefa e "Alterar todas" desloca o resto da string.
  const avancarPara = (offset) => setCursor({ taskId: ocorrencia.taskId, offset });

  const handleIgnorar      = () => avancarPara(ocorrencia.fim);
  const handleIgnorarTodas = () => { ignoradasSessaoRef.current.add(ocorrencia.palavra.toLocaleLowerCase('pt-BR')); avancarPara(ocorrencia.fim); };
  const handleAdicionar    = () => { adicionarAoDicionarioPessoal(ocorrencia.palavra); avancarPara(ocorrencia.fim); };
  const handleAlterar = () => {
    const nova = substituto.trim();
    if (!nova) return;
    onAlterarUma(ocorrencia.taskId, ocorrencia.inicio, ocorrencia.fim, nova);
    avancarPara(ocorrencia.inicio);
  };
  const handleAlterarTodas = () => {
    const nova = substituto.trim();
    if (!nova) return;
    onAlterarTodas(ocorrencia.palavra, nova);
    avancarPara(ocorrencia.inicio);
  };

  const podeAgir = fase === 'revisando' && !!ocorrencia;

  return (
    <Modal title="Verificar ortografia" size="sm" draggable overlay={false} onClose={onClose}
      footer={
        fase === 'concluido' || fase === 'erro' ? (
          <button className="btn btn-primary" onClick={onClose}>OK</button>
        ) : (
          <>
            <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
            <button className="btn btn-ghost" disabled={!podeAgir} onClick={handleIgnorar}>Ignorar</button>
            <button className="btn btn-ghost" disabled={!podeAgir} onClick={handleIgnorarTodas}>Ignorar todas</button>
            <button className="btn btn-ghost" disabled={!podeAgir} onClick={handleAdicionar}>Adicionar ao dicionário</button>
            <button className="btn btn-primary" disabled={!podeAgir} onClick={handleAlterarTodas}>Alterar todas</button>
            <button className="btn btn-primary" disabled={!podeAgir} onClick={handleAlterar}>Alterar</button>
          </>
        )
      }>
      {fase === 'carregando' && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Carregando dicionário…</div>}
      {fase === 'erro' && <div style={{ fontSize: 13, color: 'var(--danger)' }}>Não foi possível carregar o dicionário. Tente novamente mais tarde.</div>}
      {fase === 'concluido' && <div style={{ fontSize: 13 }}>Verificação de ortografia concluída.</div>}
      {fase === 'revisando' && ocorrencia && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Não encontrado no dicionário:
            {!filtrada?.some(e => e.id === ocorrencia.taskId) && (
              <span style={{ marginLeft: 6, color: 'var(--warning, #b45309)' }}>(tarefa oculta pelo filtro atual)</span>
            )}
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--danger)' }}>{ocorrencia.palavra}</div>
          <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Alterar para:
            <input className="input" style={{ marginTop: 4, width: '100%' }} value={substituto}
              onChange={e => setSubstituto(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAlterar(); } }} />
          </label>
          {sugestoes.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {sugestoes.map(s => (
                <button key={s} className="btn btn-ghost" style={{ fontSize: 12, padding: '3px 8px' }}
                  onClick={() => setSubstituto(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
