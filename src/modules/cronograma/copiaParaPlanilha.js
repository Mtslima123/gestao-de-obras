// Texto que o Ctrl+C da Lista de Tarefas põe na área de transferência (sem React, para poder testar).
//
// O Excel lê o que veio do Ctrl+C como texto separado por tabulação (colunas) e quebra de linha (linhas).
// Duas regras dele importam aqui: célula que contém tabulação, quebra de linha ou aspas vai entre aspas (com as
// aspas de dentro dobradas), e número em formato brasileiro ("5.487.920,69") vira número no Excel em português.
import { formatNum } from '../../utils/formatters';

export const escaparCelula = (texto) => {
  const t = texto == null ? '' : String(texto);
  return /["\t\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

// grade: [[texto da célula, ...], ...] já na ordem da tela.
export const montarTextoDaGrade = (grade) => grade.map((linha) => linha.map(escaparCelula).join('\t')).join('\n');

// Colunas de dinheiro: a tela mostra "R$ 1.500,50"; para o Excel vai só o número em formato BR (o "R$" com espaço
// especial não é lido como número em todo Excel). Sem valor (ex.: Valor Vinculado de quem não tem vínculo) fica vazio.
const COLUNAS_DE_VALOR = new Set(['custo', 'custoReal', 'custoOrcado', 'saldo', 'valorVinculado']);

const isoDaData = (d) => {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};

// Texto de uma célula como a tela a mostra, para as colunas que não têm texto próprio de cópia (as calculadas) e
// para as linhas de grupo (cujos números são a soma dos filhos, não o campo do próprio grupo).
// `valor` é o { raw, label } de colFilterValue: raw para quem ordena, label para quem lê.
export const textoExibidoParaPlanilha = (colId, { raw, label } = {}) => {
  if (COLUNAS_DE_VALOR.has(colId)) return Number.isFinite(raw) ? formatNum(raw) : '';
  if (colId === 'peso') return Number.isFinite(raw) ? `${formatNum(raw, 1)}%` : '';
  // Sem o "d" e o "%" da tela: a tarefa já copia o número puro nessas duas colunas, o grupo segue igual. O avanço e a
  // duração do grupo são médias e podem ter casas decimais: vírgula (o ponto não vira número no Excel em português).
  if (colId === 'duracao' || colId === 'avanco') return Number.isFinite(raw) ? String(Math.round(raw * 100) / 100).replace('.', ',') : '';
  // Data no mesmo formato (AAAA-MM-DD) que a linha de tarefa copia, para a coluna não misturar dois formatos.
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return isoDaData(raw);
  return label == null ? '' : String(label);
};

// O texto que o app gravou no Ctrl+C só vale como "cópia interna" (cola com formatação) se for IGUAL ao que veio no
// Ctrl+V. O Windows pode devolver as quebras como \r\n, então compara sem essa diferença.
export const mesmoTextoCopiado = (gravado, colado) =>
  gravado != null && colado != null && gravado.replace(/\r\n?/g, '\n') === colado.replace(/\r\n?/g, '\n');
