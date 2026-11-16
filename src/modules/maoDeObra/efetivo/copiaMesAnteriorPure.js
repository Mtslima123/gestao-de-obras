// Copiar a 2ª apropriação do mês anterior para a 1ª do mês aberto. Lógica pura (sem React nem
// banco) para poder testar: o ApropriacaoTab só chama estas funções e grava o resultado pelo
// mesmo caminho do Importar .xlsx.
import { apropDe, mesDeAbs, temDado } from './efetivoStore';

// A 2ª do mês anterior e o motivo de não poder ser copiada (null = pode).
// Só vale a quinzena LANÇADA: é o fechamento confirmado, e rascunho ainda muda. O mês anterior
// vem de mesDeAbs(abs - 1), que já vira janeiro em dezembro do ano anterior.
export const origemDaCopia = (s, mesSel) => {
  const mes = mesDeAbs(mesSel.abs - 1);
  const ap = apropDe(s, mes, 2);
  let erro = null;
  if (!ap) erro = `A 2ª apropriação de ${mes.label} não tem dados para copiar.`;
  else if (ap.status !== 'LANCADA') erro = `A 2ª apropriação de ${mes.label} ainda não foi lançada. Lance e feche antes de copiar.`;
  else if (!ap.itens.some(temDado)) erro = `A 2ª apropriação de ${mes.label} não tem dados para copiar.`;
  return { mes, ap, erro };
};

// Linhas que vão para a 1ª. Ao lançar, o banco grava uma linha zerada para TODA função ativa;
// essas não são lançamento e ficam de fora (a 1ª mostra vazio, não 0). Função que saiu da lista
// da obra também fica de fora, senão a gravação reinseriria uma linha que a tela não mostra.
// totalEfetivo segue o valor bruto gravado na origem, então o "Trab. no canteiro" (calculado a
// partir dele) sai igual ao do mês anterior.
export const itensDaCopia = (itensOrigem, idsFuncoesAtivas, apropriacaoId) => {
  const ativas = new Set(idsFuncoesAtivas.map(String));
  return itensOrigem
    .filter((i) => ativas.has(String(i.funcaoId)) && temDado(i))
    .map((i) => ({
      apropriacaoId,
      funcaoId: i.funcaoId,
      totalEfetivo: i.totalEfetivo ?? null,
      trabAdm: i.trabAdm ?? null,
      inssSeguro: i.inssSeguro ?? null,
      ferias: i.ferias ?? null,
      emprestManut: i.emprestManut ?? null,
      destino: i.destino?.trim() || null,
      recebidoOutraObra: i.recebidoOutraObra ?? null,
      origem: i.origem?.trim() || null,
    }));
};

// A 1ª já tem algo digitado que a cópia vai substituir? Conta também Destino/Origem em texto,
// que a checagem por número (temValor) não enxerga.
export const apropriacaoTemDados = (ap) => !!ap?.itens.some(temDado);
