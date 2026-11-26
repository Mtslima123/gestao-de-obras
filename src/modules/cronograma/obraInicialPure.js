// Qual obra o Cronograma abre selecionada ao montar. Puro (sem React/DOM), testável em node.
//
// Entrar em Cronogramas pelo menu abre SEM obra: a pessoa escolhe no seletor. Só duas coisas pré-selecionam:
//  - o deep link (`initialObraId`: atalho "Ir para Cronograma", Medição pelo celular);
//  - a obra guardada na sessão (`obraSalva`), que existe para o F5/"Atualizar" da PWA manter a obra. O App
//    apaga essa chave ao SAIR do Cronograma, então só o reload a encontra.
// `semSeletor` (modo foco da Medição, sem o seletor na tela) mantém o fallback antigo (primeira em andamento,
// depois a primeira da lista): sem seletor, uma tela sem obra não teria saída.

// Aceita o id quando a obra existe na lista, ou quando a lista ainda não chegou (o modo foco monta esta tela
// antes das obras carregarem e a obra é decidida uma vez só; rejeitar com lista vazia perdia a obra no reload).
const idValido = (id, obras) => (id && (!obras.length || obras.some(o => o.id === id)) ? id : null);

export function escolherObraInicial({ initialObraId, obraSalva, obras = [], semSeletor = false }) {
  return idValido(initialObraId, obras)
    || idValido(obraSalva, obras)
    || (semSeletor ? (obras.find(o => o.status === 'em_andamento')?.id || obras[0]?.id) : null)
    || null;
}
