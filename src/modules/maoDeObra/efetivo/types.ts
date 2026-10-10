// Modelo de dados — Módulo Mão de Obra › Efetivo
// Todas as quantidades são PESSOAS (não custo). "pessoa-mês" = 1 pessoa durante 1 mês.

export type GrupoId =
  | 'ADM_TEC'      // Administrativo e técnico
  | 'LIDERANCA'    // Liderança de campo
  | 'OFICIAL'      // Oficial
  | 'MEIO_OFICIAL' // Meio-oficial
  | 'SERVENTE'     // Servente
  | 'EQUIPAMENTOS' // Operação de equipamentos
  | 'APOIO';       // Apoio

export interface Grupo { id: GrupoId; nome: string; ordem: number }

/** Cadastro global de função (cargo). Vale para todas as obras. */
export interface Funcao {
  id: string;
  nome: string;
  grupoId: GrupoId;
  /** Nome da classificação. null = a função é a sua própria classificação. */
  classificacao: string | null;
  ativo: boolean; // exclusão = soft delete recomendado (ver README)
}

/** Classificação: agrupa funções que são somadas e comparadas juntas com o previsto. */
export interface Classificacao { nome: string }

export interface Obra {
  id: string;
  codigo: string;        // ex.: 'AAZ'
  inicio: string;        // ISO date — 1º mês da obra
  termino: string;       // ISO date — término da obra (base dos "meses restantes")
  previstoTrancado: boolean;
}

/**
 * Previsto do orçamento — lançado UMA vez por função/obra.
 * Meses = diferença em meses (por mês-calendário) entre início e término, inclusive.
 * Previsto mensal da função = qtdMes se o mês ∈ [inicio, termino], senão 0.
 */
export interface PrevistoFuncao {
  obraId: string;
  funcaoId: string;
  qtdMes: number;  // inteiro ≥ 0
  inicio: string;  // ISO date (digitada)
  termino: string; // ISO date (digitada)
}

export type Quinzena = 1 | 2; // 1 = dias 01–15 · 2 = dias 16–fim do mês

/** Cabeçalho da apropriação (1 por obra/mês/quinzena). */
export interface Apropriacao {
  id: string;
  obraId: string;
  ano: number;
  mes: number;           // 1–12
  quinzena: Quinzena;
  dataReferencia: string; // dia 01 ou 16
  status: 'RASCUNHO' | 'LANCADA';
  lancadaEm: string | null;
  lancadaPor: string | null;
}

/** Linha da apropriação — espelha a planilha de efetivo. */
export interface ApropriacaoItem {
  apropriacaoId: string;
  funcaoId: string;
  totalEfetivo: number | null;
  trabAdm: number | null;
  inssSeguro: number | null;
  ferias: number | null;
  emprestManut: number | null;
  destino: string | null;         // texto livre (ex.: 'CRI/LEC/MC3')
  recebidoOutraObra: number | null;
  origem: string | null;          // texto livre (ex.: 'DMS')
  // Calculados (não digitar; podem ser colunas computadas ou calculados no backend):
  // trabCanteiro = totalEfetivo − trabAdm − inssSeguro − ferias − emprestManut
  // ativos       = trabAdm + trabCanteiro + recebidoOutraObra
}

export type Status = 'ok' | 'acima' | 'sem' | 'pend';
