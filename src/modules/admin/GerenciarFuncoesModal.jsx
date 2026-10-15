import React from 'react';
import { Icon } from '../../components/Icons';
import { Modal, useToast } from '../../components/Modals';
import { usuariosService } from './usuarios.service';
import { logger } from '../../services/logger';
import { friendlyError } from '../../utils/friendlyError';
import { contarPorFuncao, nomeDuplicado, normNome, ordenarFuncoes } from './funcoesPure';

const UNICO_VIOLADO = '23505'; // índice único do nome no banco (barra duplicata criada ao mesmo tempo)

// Catálogo de funções (Apontador, Engenheiro...) usadas só como rótulo na lista de usuários.
// `funcoes`/`setFuncoes` vêm da tela (a lista e o filtro dela usam os mesmos dados);
// `onAlterado` pede para a tela recarregar usuários (excluir uma função limpa o campo deles).
const GerenciarFuncoesModal = ({ funcoes, setFuncoes, onAlterado, onClose }) => {
  const toast = useToast();
  const [nome, setNome] = React.useState('');
  const [erro, setErro] = React.useState('');
  const [editando, setEditando] = React.useState(null); // função em renomeação
  const [rascunho, setRascunho] = React.useState('');
  const [erroEdicao, setErroEdicao] = React.useState('');
  const [confirmar, setConfirmar] = React.useState(null); // função aguardando "Sim, excluir"
  const [usos, setUsos] = React.useState(new Map()); // idComoTexto -> quantos usuários usam
  const [busy, setBusy] = React.useState(false);
  // Uma gravação por vez, travada já no toque: `busy` só vale no render seguinte e o Enter
  // dos campos não passa pelo botão desabilitado (mesma razão do modal de pavimentos).
  const travaRef = React.useRef(false);

  const carregarUsos = React.useCallback(async () => {
    const { data, error } = await usuariosService.funcaoDosUsuarios();
    // Sem a contagem o aviso de exclusão só fica menos preciso: não vale travar o modal.
    if (error) { logger.warn('falha ao contar usuários por função', { module: 'admin', action: 'contarFuncoes', err: error }); return; }
    setUsos(contarPorFuncao(data || []));
  }, []);
  React.useEffect(() => { carregarUsos(); }, [carregarUsos]);

  const executar = async (fn) => {
    if (travaRef.current) return;
    travaRef.current = true;
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      logger.error('falha no cadastro de funções de usuário', { module: 'admin', action: 'funcoesModal', err });
      toast('Erro ao salvar. ' + friendlyError(err), { tone: 'error', icon: 'alert' });
    } finally {
      travaRef.current = false;
      setBusy(false);
    }
  };

  // Resultado de uma escrita no catálogo. O banco só deixa administrador escrever, mas sem permissão
  // o PostgREST não dá erro: devolve zero linhas (por isso o serviço pede .select()).
  // Devolve true quando gravou; senão já avisou o usuário. `semLinha` é o motivo provável de voltar
  // vazio (criar: só falta de permissão; renomear/excluir: também a função já ter sido excluída).
  // Nas duas falhas a lista da tela é recarregada: outra pessoa pode ter mexido no catálogo.
  const gravou = (res, falha, semLinha) => {
    if (res.error) {
      const duplicada = res.error.code === UNICO_VIOLADO;
      toast(`${falha} ${duplicada ? 'Já existe uma função com esse nome.' : friendlyError(res.error)}`, { tone: 'error', icon: 'alert' });
      if (duplicada) onAlterado?.();
      return false;
    }
    if (!res.data?.length) {
      toast(`${falha} ${semLinha}`, { tone: 'error', icon: 'alert' });
      onAlterado?.();
      return false;
    }
    return true;
  };
  const SEM_PERMISSAO = 'Sem permissão para alterar as funções.';
  const SEM_PERMISSAO_OU_JA_EXCLUIDA = 'Sem permissão ou a função já foi excluída. A lista foi atualizada.';

  const adicionar = () => {
    const n = normNome(nome);
    if (!n) { setErro('Informe o nome da função.'); return; }
    if (nomeDuplicado(funcoes, n)) { setErro('Essa função já está cadastrada.'); return; }
    executar(async () => {
      const res = await usuariosService.criarFuncao(n);
      if (!gravou(res, 'Erro ao cadastrar função.', SEM_PERMISSAO)) return;
      setFuncoes(prev => ordenarFuncoes([...prev, res.data[0]]));
      setNome(''); setErro('');
    });
  };

  const iniciarEdicao = (f) => {
    if (travaRef.current) return;
    setEditando(f); setRascunho(f.nome); setErroEdicao(''); setConfirmar(null);
  };
  const cancelarEdicao = () => { setEditando(null); setErroEdicao(''); };
  const salvarEdicao = () => {
    const n = normNome(rascunho);
    if (!n) { setErroEdicao('Informe o nome da função.'); return; }
    const f = editando;
    if (n === f.nome) { cancelarEdicao(); return; }
    // Mudar só a caixa ou o acento da própria função é permitido (ela mesma não conta como duplicata).
    if (nomeDuplicado(funcoes, n, f.id)) { setErroEdicao('Essa função já está cadastrada.'); return; }
    executar(async () => {
      const res = await usuariosService.renomearFuncao(f.id, n, f.nome);
      if (!gravou(res, 'Erro ao renomear função.', SEM_PERMISSAO_OU_JA_EXCLUIDA)) return;
      setFuncoes(prev => ordenarFuncoes(prev.map(x => (x.id === f.id ? res.data[0] : x))));
      toast('Função renomeada', { tone: 'success', icon: 'check' });
      cancelarEdicao();
    });
  };

  const pedirExclusao = (f) => { if (!travaRef.current) { setConfirmar(f); setEditando(null); } };
  const excluir = (f) => executar(async () => {
    const res = await usuariosService.excluirFuncao(f.id, f.nome);
    setConfirmar(null);
    if (!gravou(res, 'Erro ao excluir função.', SEM_PERMISSAO_OU_JA_EXCLUIDA)) return;
    setFuncoes(prev => prev.filter(x => x.id !== f.id));
    // Quem tinha essa função ficou sem função no banco: a lista de usuários precisa recarregar.
    onAlterado?.();
    carregarUsos();
  });

  const textoUsos = (f) => {
    const n = usos.get(String(f.id)) ?? 0;
    return n === 0 ? null : `${n} usuário${n !== 1 ? 's' : ''}`;
  };

  return (
    <Modal title="Funções dos usuários" subtitle="Só identifica e separa os usuários na lista: não muda o que cada um acessa"
      onClose={onClose} size="compact" draggable resizable overlay={false}
      footer={<button className="btn btn-primary" onClick={onClose}>Fechar</button>}>
      <div className="stack">
        <div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" style={{ flex: 1 }} placeholder="Ex.: Apontador, Engenheiro, Mestre de Obras" value={nome} maxLength={60}
              aria-label="Nome da nova função"
              onChange={e => { setNome(e.target.value); setErro(''); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionar(); } }} />
            <button className="btn btn-primary" onClick={adicionar} disabled={busy}>
              <Icon name="plus" size={14} />Adicionar
            </button>
          </div>
          {erro && <div style={{ fontSize: 11.5, color: 'var(--danger)', marginTop: 3 }}>{erro}</div>}
        </div>

        {funcoes.length === 0
          ? <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nenhuma função cadastrada.</div>
          : (
            // Mesmas classes do modal de pavimentos: botões de ícone com o estado desabilitado visível.
            <table className="tbl pav-lista">
              <tbody>
                {funcoes.map(f => (
                  editando?.id === f.id
                    ? (
                      <tr key={f.id}>
                        <td colSpan={2}>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input className="input" style={{ flex: 1 }} value={rascunho} maxLength={60} autoFocus
                              aria-label={`Novo nome de ${f.nome}`}
                              onChange={e => { setRascunho(e.target.value); setErroEdicao(''); }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') { e.preventDefault(); salvarEdicao(); }
                                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelarEdicao(); }
                              }} />
                            <button className="icon-btn" title="Salvar" disabled={busy} onClick={salvarEdicao}>
                              <Icon name="check" size={14} />
                            </button>
                            <button className="icon-btn" title="Cancelar" disabled={busy} onClick={cancelarEdicao}>
                              <Icon name="x" size={14} />
                            </button>
                          </div>
                          {erroEdicao && <div style={{ fontSize: 11.5, color: 'var(--danger)', marginTop: 3 }}>{erroEdicao}</div>}
                        </td>
                      </tr>
                    )
                    : (
                      <tr key={f.id}>
                        <td style={{ padding: '6px 8px', wordBreak: 'break-word' }}>
                          {f.nome}
                          {textoUsos(f) && <span style={{ marginLeft: 8, fontSize: 11.5, color: 'var(--text-muted)' }}>{textoUsos(f)}</span>}
                          {confirmar?.id === f.id && (
                            <div style={{ fontSize: 11.5, color: 'var(--danger)', marginTop: 3 }}>
                              {textoUsos(f)
                                ? `${textoUsos(f)} ${(usos.get(String(f.id)) ?? 0) !== 1 ? 'ficarão' : 'ficará'} sem função. Os acessos não mudam.`
                                : 'Nenhum usuário usa esta função.'}
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap', padding: '6px 8px', width: 1 }}>
                          {confirmar?.id === f.id
                            ? (
                              <>
                                <button className="btn btn-ghost btn-sm" onClick={() => setConfirmar(null)}>Cancelar</button>
                                <button className="btn btn-sm" style={{ background: 'var(--danger)', color: '#fff', fontWeight: 600, marginLeft: 6 }}
                                  disabled={busy} onClick={() => excluir(f)}>Sim, excluir</button>
                              </>
                            )
                            : (
                              // aria-disabled em vez de disabled: botão desabilitado perde o foco do teclado.
                              <div className="pav-acoes">
                                <button className="icon-btn" title="Renomear função" aria-label={`Renomear ${f.nome}`} aria-disabled={busy} onClick={() => iniciarEdicao(f)}>
                                  <Icon name="edit" size={14} />
                                </button>
                                <button className="icon-btn" title="Excluir função" aria-label={`Excluir ${f.nome}`} aria-disabled={busy} onClick={() => pedirExclusao(f)}>
                                  <Icon name="trash" size={14} />
                                </button>
                              </div>
                            )}
                        </td>
                      </tr>
                    )
                ))}
              </tbody>
            </table>
          )}
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
          Vale para todos os usuários. Renomear atualiza quem já tem a função; excluir deixa esses usuários sem função.
        </div>
      </div>
    </Modal>
  );
};

export { GerenciarFuncoesModal };
