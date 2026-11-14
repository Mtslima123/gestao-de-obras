// Regras puras da composição do orçamento na casca mobile (sem React): níveis pelo código, resumo dos totais, escolha
// do código de um item novo, leitura e validação de números digitados e quais mudanças uma edição gera. A hierarquia
// mora no código com pontos (001.08.04 é pai de 001.08.04.01), como no desktop. Quem guarda o estado e grava continua
// sendo o OrcamentoDetalhe; aqui só se decide o que mostrar e o que aplicar.

// Nível pelo número de pontos: 001 = 0, 001.01 = 1.
export const nivelDoCodigo = (codigo) => (String(codigo || '').match(/\./g) || []).length;

// O desktop só oferece "subitem" até o nível 3 (quatro níveis no total) e "acima" fora da raiz.
export const NIVEL_MAXIMO_DE_SUBITEM = 3;
export const podeInserirAcima = (item) => nivelDoCodigo(item?.codigo) > 0;
export const podeInserirSubitem = (item) => nivelDoCodigo(item?.codigo) < NIVEL_MAXIMO_DE_SUBITEM;

// Próximo código de mesmo nível e mesmo pai: o maior irmão + 1, mantendo a largura do último trecho (001 = 3, 01 = 2).
export const proximoCodigoIrmao = (refCodigo, lista = []) => {
  const partes = refCodigo.split('.');
  const pai = partes.slice(0, -1).join('.');
  const nivel = nivelDoCodigo(refCodigo);
  const irmaos = lista
    .filter(it => nivelDoCodigo(it.codigo) === nivel && it.codigo.split('.').slice(0, -1).join('.') === pai)
    .map(it => parseInt(it.codigo.split('.').pop(), 10))
    .filter(n => !Number.isNaN(n));
  const proximo = irmaos.length ? Math.max(...irmaos) + 1 : 1;
  const prefixo = pai ? pai + '.' : '';
  return prefixo + String(proximo).padStart(partes[partes.length - 1].length, '0');
};

// Código do botão "Novo item" (mesma regra do desktop): lista vazia começa em 001; sem nenhum item de nível 1 abre o
// primeiro (<raiz>.01); com itens de nível 1, o seguinte ao de maior número.
export const codigoDoNovoItem = (items = []) => {
  if (items.length === 0) return '001';
  const nivel1 = items.filter(it => nivelDoCodigo(it.codigo) === 1);
  if (nivel1.length === 0) {
    const raiz = items.find(it => nivelDoCodigo(it.codigo) === 0);
    return (raiz?.codigo ?? '001') + '.01';
  }
  const ultimo = [...nivel1].sort((a, b) => parseInt(b.codigo.split('.').pop(), 10) - parseInt(a.codigo.split('.').pop(), 10))[0];
  return proximoCodigoIrmao(ultimo.codigo, items);
};

// ---- Resumo ----
// Os quatro números do topo, com as mesmas fórmulas do desktop: total = soma dos itens de nível 0; "cadastrados" e os
// dois vínculos contam só folhas (item-resumo não vincula). Linhas novas ainda sem salvar contam como não vinculadas.
export const resumoDoOrcamento = ({ withTotals = [], parentSet = new Set(), vinculadoSet = new Set(), totalItens = withTotals.length }) => {
  const folhas = withTotals.filter(it => !parentSet.has(it.codigo));
  const vinculadas = folhas.filter(it => vinculadoSet.has(it.id));
  const naoVinculadas = folhas.filter(it => !vinculadoSet.has(it.id));
  const soma = (lista) => lista.reduce((s, it) => s + (it.valor_total || 0), 0);
  return {
    grandTotal: withTotals.filter(it => nivelDoCodigo(it.codigo) === 0).reduce((s, it) => s + it.valor_total, 0),
    folhas: folhas.length,
    totalItens,
    vinculados: { n: vinculadas.length, valor: soma(vinculadas) },
    naoVinculados: { n: naoVinculadas.length, valor: soma(naoVinculadas) },
  };
};

// Texto sob o título da composição.
export const subtituloDaComposicao = ({ totalItens = 0, folhasVisiveis = 0, folhasTotal = 0, filtrando = false }) => {
  if (totalItens === 0) return 'Nenhum item. Toque em "Novo item" para adicionar.';
  if (filtrando) return `${folhasVisiveis} de ${folhasTotal} itens`;
  return `${totalItens} itens`;
};

// ---- Números digitados ----
// Aceita "1.234,56", "1234,56", "12,5" e também "12.5" (ponto decimal com 1 ou 2 casas, como o teclado do celular às
// vezes entrega). Ponto com 3 casas é milhar ("1.500" = 1500). Vazio vale 0.
export const parseNumero = (texto) => {
  const s = String(texto ?? '').trim();
  if (!s) return 0;
  if (!s.includes(',') && /^\d+\.\d{1,2}$/.test(s)) return parseFloat(s) || 0;
  return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
};
// Só dígitos separados por ponto ou vírgula (sem sinal, sem letra). Vazio é válido.
export const numeroValido = (texto) => {
  const s = String(texto ?? '').trim();
  return s === '' || /^\d+([.,]\d+)*$/.test(s);
};
// 12.5 -> "12,5" (campo de edição); zero e ausente ficam vazios para digitar por cima.
export const numeroParaCampo = (v) => (Number(v) ? String(v).replace('.', ',') : '');
export const formatarNumero = (n, dec = 2) =>
  (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

// ---- Edição de um item ----
export const valoresIniciaisDoItem = (item) => ({
  nome: item.nome || '',
  quantidade: numeroParaCampo(item.quantidade),
  unidade: item.unidade || '',
  valor_unitario: numeroParaCampo(item.valor_unitario),
});

// Mensagem por campo; vazio = pode aplicar. Grupo só tem nome (quantidade e valor vêm dos filhos).
export const validarItem = (valores, ehGrupo) => {
  const erros = {};
  if (!ehGrupo) {
    if (!numeroValido(valores.quantidade)) erros.quantidade = 'Use só números, sem sinal.';
    if (!numeroValido(valores.valor_unitario)) erros.valor_unitario = 'Use só números, sem sinal.';
  }
  return erros;
};

// O que mudou, no formato do editCell do desktop ({ campo, valor }). Só entra o que é diferente do item atual.
// Unidade em maiúsculas e até 8 letras (mesma regra do campo do desktop); números nunca negativos.
export const alteracoesDoItem = (item, valores, ehGrupo) => {
  const mudancas = [];
  if (valores.nome !== (item.nome || '')) mudancas.push({ campo: 'nome', valor: valores.nome });
  if (ehGrupo) return mudancas;
  const quantidade = Math.max(0, parseNumero(valores.quantidade));
  if (quantidade !== (Number(item.quantidade) || 0)) mudancas.push({ campo: 'quantidade', valor: quantidade });
  const unidade = String(valores.unidade ?? '').toUpperCase().slice(0, 8);
  if (unidade !== (item.unidade || '')) mudancas.push({ campo: 'unidade', valor: unidade });
  const valorUnitario = Math.max(0, parseNumero(valores.valor_unitario));
  if (valorUnitario !== (Number(item.valor_unitario) || 0)) mudancas.push({ campo: 'valor_unitario', valor: valorUnitario });
  return mudancas;
};

// Por que um item não pode ser excluído (null = pode). Item vinculado ao cronograma e os grupos que o contêm ficam
// protegidos, como no desktop.
export const motivoDeNaoExcluir = (item, protegidoSet = new Set()) => (
  protegidoSet.has(item?.codigo) ? 'Item vinculado a uma tarefa do cronograma (ou grupo que contém um). Remova o vínculo antes de excluir.' : null
);

// ---- Lista ----
export const TAMANHO_DA_PAGINA_DE_ITENS = 100;
export const paginaDeItens = (lista = [], limite = TAMANHO_DA_PAGINA_DE_ITENS) => ({
  itens: lista.slice(0, limite),
  restantes: Math.max(0, lista.length - limite),
});

// Título do cartão: "001.02 · Nome" sem repetir o traço quando o nome está vazio (item novo).
export const rotuloDoItem = (item) => (item.nome ? `${item.codigo} · ${item.nome}` : item.codigo);

// Se um item novo apareceu depois de uma inserção: devolve o id dele (o que não estava em `idsAntes`).
export const idDoItemInserido = (idsAntes, items = []) => items.find(it => !idsAntes.has(it.id))?.id ?? null;
