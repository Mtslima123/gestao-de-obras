// Regras puras da Mão de Obra na casca mobile do Sistema Completo (sem React, sem navegador), para teste.
// Os cálculos do módulo (orçado, consumido, ativos, status...) continuam vindo de efetivo/regras.ts e efetivoStore.js,
// os mesmos do desktop. Aqui só ficam as decisões de APRESENTAÇÃO que o celular precisa e que o desktop faz inline
// dentro de cada aba (formatação de números, campos da folha, vizinhas da lista, textos).

const r2 = (v) => Math.round(v * 100) / 100;

// ---- números ----
// Previsto e Análise: até 1 casa, com milhar. Mesma formatação das abas do desktop.
export const fmt1 = (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
// Saldo do Previsto: negativo com o sinal "−" (não o hífen), como no desktop. Diferença consciente: um resto minúsculo
// (-0,04) aparece como "0"; o desktop mostrava "-0" (o toLocaleString mantém o sinal do zero negativo).
export const fmtSaldo = (v) => (v <= -0.05 ? '−' + fmt1(-v) : fmt1(Math.max(0, v)));
// Média restante do Previsto: "—" quando não há (qtd 0 ou sem meses restantes). Mesmo cuidado com o "-0".
export const fmtMedia = (med) => (med == null ? '—' : med <= -0.05 ? '−' + fmt1(-med) : fmt1(Math.max(0, med)));
// Apropriação: o previsto pode ser quebrado (2,5), então soma e diferença são arredondadas a 2 casas, com vírgula.
export const n2 = (v) => String(r2(v)).replace('.', ',');
export const saldoComSinal = (v) => { const x = r2(v); return x > 0 ? '+' + n2(x) : x < 0 ? '−' + n2(-x) : '0'; };
// Saldo da Análise: dentro de ±0,05 é zero.
export const saldoAnalise = (v) => (v > 0.05 ? '+' + fmt1(v) : v < -0.05 ? '−' + fmt1(-v) : '0');

// ---- datas e períodos ----
export const rotuloMes = (m) => m.label.replace('/', '/20');
// 'AAAA-MM-DD' vira 'DD/MM/AAAA' sem passar por Date (fuso não pode mudar o dia).
export const dataBR = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
export const faixaDaQuinzena = (n, ultimoDia) => (n === 1 ? '01 a 15' : `16 a ${ultimoDia}`);
export const textoDaQuinzena = ({ lancadaEm, lancadaPor, n, ano, mes }) => (
  lancadaEm
    ? `Lançada em ${new Date(lancadaEm).toLocaleDateString('pt-BR')}${lancadaPor ? ` por ${lancadaPor}` : ''}`
    : `Data de referência ${n === 1 ? '01' : '16'}/${String(mes).padStart(2, '0')}/${ano}`
);

// ---- Previsto ----
// Quantidade por mês nos botões − e +: nunca negativa, no máximo 2 casas (2,5 pessoas vale).
export const somarQtd = (q, delta) => Math.max(0, r2((Number(q) || 0) + delta));

// ---- Apropriação ----
// Campos da folha de uma função, na ordem em que aparecem. 'canteiro' é o "Trab. no canteiro" DIGITADO (o desktop
// calcula o total a partir dele, ver aplicarPatchItem); os demais são colunas do item.
export const CAMPOS_APROPRIACAO = [
  { chave: 'trabAdm', rotulo: 'Trab. na ADM', tipo: 'numero' },
  { chave: 'canteiro', rotulo: 'Trab. no canteiro', tipo: 'numero' },
  { chave: 'inssSeguro', rotulo: 'INSS / Seguro', tipo: 'numero' },
  { chave: 'ferias', rotulo: 'Férias', tipo: 'numero' },
  { chave: 'emprestManut', rotulo: 'Emprest. / Manut.', tipo: 'numero' },
  { chave: 'recebidoOutraObra', rotulo: 'Recebido de outra obra', tipo: 'numero' },
  { chave: 'destino', rotulo: 'Destino', tipo: 'texto' },
  { chave: 'origem', rotulo: 'Origem', tipo: 'texto' },
];

// O que o campo mostra. Para 'canteiro' vale o valor calculado da linha (pode ser negativo, e aí fica vermelho).
export const valorDoCampo = (item, chave, canteiro) => (chave === 'canteiro' ? canteiro : item?.[chave]);

// O que gravar no rascunho quando a pessoa digita. Mesma regra do desktop: número inteiro >= 0, vazio = null;
// texto vazio = null.
export const patchDoCampo = (campo, texto) => {
  if (campo.tipo === 'texto') return { [campo.chave]: texto || null };
  return { [campo.chave]: texto === '' ? null : Math.max(0, parseInt(texto, 10) || 0) };
};

// Ordem plana das funções como aparecem na tela (grupo a grupo), para o "Anterior / Próxima" da folha. Funções de
// grupo recolhido entram: recolher é só da lista.
export const idsNaOrdemDaTela = (grupos) => grupos.flatMap((g) => g.rows.map((r) => r.f.id));
export const vizinhasDaFuncao = (ids, id) => {
  const i = ids.indexOf(id);
  return {
    posicao: i + 1, // 0 quando a função não está na lista (filtrada pela busca)
    total: ids.length,
    anterior: i > 0 ? ids[i - 1] : null,
    proxima: i >= 0 && i < ids.length - 1 ? ids[i + 1] : null,
  };
};

// ---- Análise ----
// Maior valor do gráfico (nunca menos que 1, para a altura não dividir por zero) com folga em cima.
export const escalaDoGrafico = (valores, folga = 1) => Math.max(1, ...valores) * folga;
export const alturaPct = (v, max) => (max > 0 ? Math.min(100, Math.max(0, (v / max) * 100)) : 0);
// Larguras: cada mês ganha uma fatia fixa e o gráfico rola na horizontal (no celular 12 meses não cabem lado a lado).
export const larguraDoGrafico = (nMeses, fatia) => nMeses * fatia;
// O previsto pode ser quebrado (2,5): o texto sai com vírgula (o título da barra no desktop mostra "2.5").
export const detalheProjecao = (p) => `${p.m.label}: ${p.past ? 'realizado' : 'projeção'} ${fmt1(p.v)} · previsto ${n2(p.prev)}`;
export const detalheEvolucao = (x) => `${x.m.label}: previsto ${n2(x.p)}, efetivo ${n2(x.e)}`;
// Bolinhas de "Saldo acumulado": mesmo texto do desktop.
export const legendaDoAcumulado = (ac) => (ac == null ? '' : ac > 0.05 ? 'não utilizado' : ac < -0.05 ? 'excedido' : 'zerado');
// Busca do seletor de função/classificação: sem caixa, mantendo a ordem recebida.
export const filtrarOpcoes = (opcoes, termo) => {
  const t = (termo || '').trim().toLowerCase();
  return t ? opcoes.filter((o) => o.toLowerCase().includes(t)) : opcoes;
};

// ---- Painel ----
export const subtituloDoPainel = ({ carregando, doPeriodo, completas, fora }) => {
  if (carregando) return 'Carregando...';
  if (doPeriodo === 0) return 'Nenhuma obra com este mês no período.';
  return `${completas} de ${doPeriodo} obra${doPeriodo !== 1 ? 's' : ''} com as duas apropriações lançadas${fora ? ` · ${fora} fora do período` : ''}`;
};
