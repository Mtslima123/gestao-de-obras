// Testes unitários da lógica pura do Físico Financeiro.
// Roda em node (sem browser/Supabase). Executar: npm test
//
// Os valores numéricos aqui são sintéticos (não são dados reais de nenhuma obra) —
// só precisam exercitar as mesmas faixas/sinais que os campos reais podem assumir.
import { describe, it, expect } from 'vitest';
import {
  detectarHeaderRowIndex, mapearColunas, parsePtBR, parseCampo, parseFechamentoSheet,
  getLinhaTotal, getDisciplinas, corGasto, corTendencia, corPorSinal, computeKPIs,
  computeKPIsFromTotal, somarTotaisCarteira,
} from '../modules/fisicoFinanceiro/fisicoFinanceiroPure';

// Cabeçalho embaralhado de propósito (ordem diferente da planilha de origem) — prova
// que o mapeamento não depende de posição fixa de coluna.
const HEADERS = [
  'Nome', 'Código da Tarefa', 'Saldo a distribuir (INCC)', 'Ganhos (Atualização de INCC) - REAL',
  'Saving', 'Saving - REAL', 'Ganhos (Atualização de INCC)', 'Saldo a distribuir (R$)',
  'Valor orçamento atualizado (R$)', 'Valor orçamento jun/25 (R$)', 'Reserva Financeira',
  'Crédito Modificações', 'Tendência', 'Gasto (R$)', 'Gasto (INCC)', 'Gasto (%)',
  'Executado Físico (%)', 'Previsto Linha de Base (%)', 'Valor total em INCC base jun/25',
];

// Linha de banda mesclada (row 0 real da planilha) — não deve casar com nenhuma regra.
const BAND_ROW = ['Orçamento', '', '', '', '', 'Acumulado até ago/26', '', '', '', '', 'Fechamento', '', '', '', '', '', '', '', ''];

// Linha de total sintética: tendência abaixo do orçamento atualizado (sucesso), gasto
// 5pp acima do executado (atenção), saving negativo (perigo).
const ROW_TOTAL = ['TESTE', '001', '600,00', '30.000,00', '-20.000,00', '1.000,00', '50.000,00',
  '700.000,00', '1.100.000,00', '1.000.000,00', '31.000,00', '0,00', '1.050.000,00',
  '350.000,00', '100,00', '35,00%', '30,00%', '0,00%', '900,00'];

// Linha de disciplina sintética: tendência ACIMA do orçamento atualizado (perigo), gasto
// 25pp acima do executado (perigo), ganhos/saving/reserva negativos (perigo).
const ROW_DISC = ['Disciplina Teste', '001.01', '130,00', '-3.000,00', '-8.000,00', '0,00', '-5.000,00',
  '150.000,00', '220.000,00', '200.000,00', '-3.000,00', '0,00', '250.000,00',
  '143.000,00', '20,00', '65,00%', '40,00%', '0,00%', '180,00'];

const AOA = [BAND_ROW, HEADERS, ROW_TOTAL, ROW_DISC];

describe('parsePtBR', () => {
  it('milhar com ponto, decimal com vírgula', () => {
    expect(parsePtBR('1.234,56')).toBeCloseTo(1234.56, 5);
  });
  it('percentual', () => {
    expect(parsePtBR('22,80%')).toBeCloseTo(22.8, 5);
  });
  it('negativo com milhar', () => {
    expect(parsePtBR('-133.352,81')).toBeCloseTo(-133352.81, 5);
  });
  it('prefixo R$', () => {
    expect(parsePtBR('R$ 1,00')).toBeCloseTo(1, 5);
  });
  it('vazio/nulo vira 0', () => {
    expect(parsePtBR('')).toBe(0);
    expect(parsePtBR(null)).toBe(0);
    expect(parsePtBR(undefined)).toBe(0);
  });
  it('número já numérico passa direto', () => {
    expect(parsePtBR(42)).toBe(42);
  });
});

describe('detectarHeaderRowIndex', () => {
  it('ignora a linha de banda mesclada e acha a linha de cabeçalho real', () => {
    expect(detectarHeaderRowIndex(AOA)).toBe(1);
  });
  it('devolve -1 se nenhuma linha reconhece colunas suficientes', () => {
    expect(detectarHeaderRowIndex([['a', 'b'], ['c', 'd']])).toBe(-1);
  });
});

describe('mapearColunas', () => {
  const cols = mapearColunas(HEADERS);
  it('mapeia as 19 colunas fora de ordem', () => {
    expect(Object.keys(cols)).toHaveLength(19);
  });
  it('distingue "Valor orçamento X (R$)" de "...atualizado"', () => {
    expect(cols.valorOrcamentoBase).toBe(HEADERS.indexOf('Valor orçamento jun/25 (R$)'));
    expect(cols.valorOrcamentoAtualizado).toBe(HEADERS.indexOf('Valor orçamento atualizado (R$)'));
    expect(cols.valorOrcamentoBase).not.toBe(cols.valorOrcamentoAtualizado);
  });
  it('distingue "Ganhos (INCC)" de "Ganhos (INCC) - REAL"', () => {
    expect(cols.ganhosIncc).toBe(HEADERS.indexOf('Ganhos (Atualização de INCC)'));
    expect(cols.ganhosInccReal).toBe(HEADERS.indexOf('Ganhos (Atualização de INCC) - REAL'));
  });
  it('distingue "Saving" de "Saving - REAL"', () => {
    expect(cols.saving).toBe(HEADERS.indexOf('Saving'));
    expect(cols.savingReal).toBe(HEADERS.indexOf('Saving - REAL'));
  });
  it('distingue "Saldo a distribuir (R$)" de "(INCC)"', () => {
    expect(cols.saldoDistribuirReal).toBe(HEADERS.indexOf('Saldo a distribuir (R$)'));
    expect(cols.saldoDistribuirIncc).toBe(HEADERS.indexOf('Saldo a distribuir (INCC)'));
  });
});

describe('parseFechamentoSheet', () => {
  const { itens, erros, avisos } = parseFechamentoSheet(AOA);

  it('sem erros bloqueantes com um cabeçalho completo', () => {
    expect(erros).toEqual([]);
  });
  it('sem avisos de coluna ausente (as 19 foram reconhecidas)', () => {
    expect(avisos.filter(a => a.includes('não encontrada'))).toEqual([]);
  });
  it('traz as 2 linhas de dado (total + 1 disciplina)', () => {
    expect(itens).toHaveLength(2);
  });
  it('identifica a linha de total pelo código sem ponto', () => {
    const total = getLinhaTotal(itens);
    expect(total?.codigo).toBe('001');
    expect(total?.nome).toBe('TESTE');
    expect(total.valorOrcamentoAtualizado).toBeCloseTo(1100000, 2);
    expect(total.gastoPct).toBeCloseTo(35, 2);
    expect(total.executadoFisico).toBeCloseTo(30, 2);
    expect(total.saving).toBeCloseTo(-20000, 2);
  });
  it('linhas de disciplina não incluem a linha de total', () => {
    const disciplinas = getDisciplinas(itens);
    expect(disciplinas).toHaveLength(1);
    expect(disciplinas[0].codigo).toBe('001.01');
    expect(disciplinas[0].ganhosInccReal).toBeCloseTo(-3000, 2);
  });

  it('cabeçalho sem "Código da Tarefa"/"Nome" gera erro bloqueante', () => {
    const semCodigo = HEADERS.map(h => (h === 'Código da Tarefa' ? 'Outra coisa' : h));
    const r = parseFechamentoSheet([BAND_ROW, semCodigo, ROW_TOTAL]);
    expect(r.erros.length).toBeGreaterThan(0);
    expect(r.itens).toEqual([]);
  });

  it('planilha vazia/sem cabeçalho reconhecível gera erro bloqueante', () => {
    const r = parseFechamentoSheet([['x', 'y'], ['1', '2']]);
    expect(r.erros.length).toBeGreaterThan(0);
  });

  // Regressão: uma exportação real trouxe "Código" no cabeçalho (sem o "da Tarefa"
  // que outra exportação do mesmo relatório usava) — a regra de coluna não pode
  // depender do rótulo exato inteiro, só reconhecer que a coluna é a de código.
  it('reconhece "Código" sozinho, sem o sufixo "da Tarefa"', () => {
    const headersCurto = HEADERS.map(h => (h === 'Código da Tarefa' ? 'Código' : h));
    const r = parseFechamentoSheet([BAND_ROW, headersCurto, ROW_TOTAL, ROW_DISC]);
    expect(r.erros).toEqual([]);
    expect(r.itens).toHaveLength(2);
  });

  // Regressão: uma exportação real trazia, na mesma planilha, um bloco-resumo
  // (rótulo/valor) LOGO DEPOIS da grade principal — ex. "Saving (R$)" / "R$ 3.667,71".
  // Um valor em R$ formatado tem ponto de milhar, então cairia no filtro de
  // getDisciplinas (código com ponto) se não fosse validado como código de WBS de
  // verdade (dígitos separados por ponto). Essas linhas devem ser ignoradas
  // silenciosamente, sem virar "disciplina" fantasma nem gerar aviso de nome vazio.
  it('ignora linhas de resumo depois da grade (código não é um WBS válido)', () => {
    const linhaResumoTexto = ['Delta (%) Físico × Financeiro', '-4,52%', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
    const linhaResumoValor = ['Saving (R$)', 'R$ 3.667.017,71', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
    const r = parseFechamentoSheet([BAND_ROW, HEADERS, ROW_TOTAL, ROW_DISC, linhaResumoTexto, linhaResumoValor]);
    expect(r.erros).toEqual([]);
    expect(r.avisos).toEqual([]);
    expect(r.itens).toHaveLength(2); // só total + 1 disciplina — as 2 linhas de resumo ficam de fora
    expect(getDisciplinas(r.itens).map(i => i.codigo)).toEqual(['001.01']);
  });

  // Regressão mais específica: numa leitura raw:true (célula numérica de verdade, não
  // texto), um valor pequeno do bloco-resumo (ex. 0.01, um percentual cru) vira a
  // STRING "0.01" ao passar por String(...) — e isso BATE na regex de WBS por
  // coincidência (dígitos-ponto-dígitos), diferente da versão em texto ("Saving (R$)")
  // que não bate. Por isso o corte tem que ser "para no primeiro inválido depois do
  // bloco de WBS", não só "filtra inválidos onde aparecerem" (na coluna código, índice
  // 1 em HEADERS — ver o cabeçalho embaralhado no topo do arquivo).
  it('para no primeiro código inválido após o bloco de WBS, mesmo se ele também bate na regex por coincidência', () => {
    const linhaResumoNumerica = ['Delta (%) Físico × Financeiro', 0.01, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
    const r = parseFechamentoSheet([BAND_ROW, HEADERS, ROW_TOTAL, ROW_DISC, linhaResumoNumerica]);
    expect(r.itens).toHaveLength(2); // só total + 1 disciplina — a linha de resumo não vira uma 3ª
  });
});

describe('parseCampo', () => {
  it('número em campo percentual: multiplica por 100 (Excel guarda % como fração)', () => {
    expect(parseCampo(0.228, true)).toBeCloseTo(22.8, 5);
  });
  it('número em campo não-percentual: usa direto, sem escala', () => {
    expect(parseCampo(63697430.34, false)).toBeCloseTo(63697430.34, 2);
  });
  it('string (planilha .htm, já formatada em pt-BR): cai no parsePtBR, sem ×100 mesmo em campo percentual', () => {
    expect(parseCampo('22,80%', true)).toBeCloseTo(22.8, 5);
  });
  it('vazio/nulo vira 0 nos dois modos', () => {
    expect(parseCampo('', true)).toBe(0);
    expect(parseCampo(null, false)).toBe(0);
  });
});

describe('parseFechamentoSheet — AOA numérico (simula leitura raw:true de .xlsx real)', () => {
  // Mesmo cabeçalho embaralhado de HEADERS, mas os valores aqui são NUMBERS de
  // verdade (não strings) — percentual como fração (Excel sempre guarda assim),
  // o resto em valor absoluto. É exatamente o formato que sheet_to_json({raw:true})
  // devolve pra um .xlsx binário de verdade.
  const rowTotalNum = ['TESTE', 1, 600, 30000, -20000, 1000, 50000, 700000, 1100000, 1000000, 31000, 0, 1050000, 350000, 100, 0.35, 0.30, 0, 900];
  const rowDiscNum  = ['Disciplina Teste', '001.01', 130, -3000, -8000, 0, -5000, 150000, 220000, 200000, -3000, 0, 250000, 143000, 20, 0.65, 0.40, 0, 180];

  it('lê valores numéricos sem erro, com % corretamente escalado (fração ×100)', () => {
    const r = parseFechamentoSheet([BAND_ROW, HEADERS, rowTotalNum, rowDiscNum]);
    expect(r.erros).toEqual([]);
    const total = getLinhaTotal(r.itens);
    expect(total.executadoFisico).toBeCloseTo(30, 5);
    expect(total.gastoPct).toBeCloseTo(35, 5);
    expect(total.valorOrcamentoAtualizado).toBeCloseTo(1100000, 2); // sem escala, já é o valor final
    const disc = getDisciplinas(r.itens)[0];
    expect(disc.executadoFisico).toBeCloseTo(40, 5);
    expect(disc.gastoPct).toBeCloseTo(65, 5);
  });
});

describe('corGasto', () => {
  it('ambos zerados: neutro', () => { expect(corGasto(0, 0)).toBe('neutral'); });
  it('gasto abaixo do executado: sucesso', () => { expect(corGasto(50, 40)).toBe('success'); });
  it('gasto igual ao executado: sucesso (limite)', () => { expect(corGasto(50, 50)).toBe('success'); });
  it('gap pequeno acima (0 < gap < 10pp): atenção', () => { expect(corGasto(50, 55)).toBe('warning'); });
  it('gap exatamente 10pp: perigo (limite)', () => { expect(corGasto(50, 60)).toBe('danger'); });
  it('gap pequeno (5pp): atenção', () => { expect(corGasto(30, 35)).toBe('warning'); });
  it('gap grande (25pp): perigo', () => { expect(corGasto(40, 65)).toBe('danger'); });
});

describe('corTendencia', () => {
  it('ambos zerados: neutro', () => { expect(corTendencia(0, 0)).toBe('neutral'); });
  it('tendência abaixo do orçamento atualizado: sucesso', () => { expect(corTendencia(90, 100)).toBe('success'); });
  it('tendência igual ao orçamento atualizado: sucesso (limite, não é estouro)', () => { expect(corTendencia(100, 100)).toBe('success'); });
  it('tendência acima do orçamento atualizado: perigo', () => { expect(corTendencia(250000, 220000)).toBe('danger'); });
});

describe('corPorSinal', () => {
  it('positivo: sucesso', () => { expect(corPorSinal(1)).toBe('success'); });
  it('negativo: perigo', () => { expect(corPorSinal(-1)).toBe('danger'); });
  it('zero: neutro', () => { expect(corPorSinal(0)).toBe('neutral'); });
});

describe('computeKPIs', () => {
  const { itens } = parseFechamentoSheet(AOA);
  const kpis = computeKPIs(itens);

  it('bate com os números sintéticos da linha de total', () => {
    expect(kpis.valorOrcamentoAtualizado).toBeCloseTo(1100000, 2);
    expect(kpis.executadoFisico).toBeCloseTo(30, 2);
    expect(kpis.gastoPct).toBeCloseTo(35, 2);
    expect(kpis.gastoReal).toBeCloseTo(350000, 2);
    expect(kpis.gapGasto).toBeCloseTo(5, 2);
    expect(kpis.tendencia).toBeCloseTo(1050000, 2);
    expect(kpis.saldoDistribuirReal).toBeCloseTo(700000, 2);
    expect(kpis.reservaFinanceira).toBeCloseTo(31000, 2);
  });
  it('gasto 5 p.p. acima do executado -> atenção', () => {
    expect(kpis.corGasto).toBe('warning');
  });
  it('tendência abaixo do orçamento atualizado -> sucesso', () => {
    expect(kpis.corTendencia).toBe('success');
  });
  // Delta (%) Físico × Financeiro = Executado Físico − Gasto (%); em R$, esse delta
  // aplicado sobre o Orçamento Atualizado. Fórmula pedida pelo usuário e conferida
  // contra o "Delta (%) Físico × Financeiro" que a planilha real desta obra já traz
  // pronto no bloco-resumo (fora da grade de 19 colunas): 22,80% (exec) − 27,32%
  // (gasto) = −4,52%, exatamente o valor que a planilha mostra.
  it('Delta (%) Físico × Financeiro = executado − gasto; Delta (R$) = Delta% × orçamento atualizado', () => {
    expect(kpis.deltaFisicoFinanceiroPct).toBeCloseTo(30 - 35, 5); // -5
    expect(kpis.deltaFisicoFinanceiroReal).toBeCloseTo((-5 / 100) * 1100000, 2); // -55.000
  });
  it('Delta reproduz o exemplo real da obra (22,80% exec − 27,32% gasto = −4,52%)', () => {
    const total = { executadoFisico: 22.80, gastoPct: 27.32, valorOrcamentoAtualizado: 63697430.34 };
    const k = computeKPIs([{ codigo: '001', nome: 'X', ...total }]);
    expect(k.deltaFisicoFinanceiroPct).toBeCloseTo(-4.52, 2);
  });
  it('Delta negativo -> perigo (vermelho); positivo -> sucesso (verde); zero -> neutro', () => {
    expect(kpis.corDeltaFisicoFinanceiro).toBe('danger'); // -5, do fixture sintético
    expect(computeKPIs([{ codigo: '001', nome: 'X', executadoFisico: 40, gastoPct: 30, valorOrcamentoAtualizado: 1000 }]).corDeltaFisicoFinanceiro).toBe('success');
    expect(computeKPIs([{ codigo: '001', nome: 'X', executadoFisico: 30, gastoPct: 30, valorOrcamentoAtualizado: 1000 }]).corDeltaFisicoFinanceiro).toBe('neutral');
  });
  // Saving (%) usa o campo "Saving - REAL" (savingReal), não o "Saving" cru — pedido
  // explícito do usuário, confirmado batendo com o "Saving (R$)" que a planilha real
  // desta obra já traz pronto no bloco-resumo: R$ 4.143,20 / 0,01%.
  it('Saving (%) = Saving REAL (R$) ÷ orçamento atualizado — usa savingReal, não saving', () => {
    expect(kpis.savingReal).toBeCloseTo(1000, 2); // savingReal do fixture, não os -20.000 de "saving"
    expect(kpis.savingRealPct).toBeCloseTo((1000 / 1100000) * 100, 5); // 0,0909...%
  });
  it('Saving REAL positivo -> sucesso; negativo -> perigo; zero -> neutro', () => {
    expect(kpis.corSavingReal).toBe('success'); // 1.000, do fixture sintético (positivo, mesmo com "saving" cru negativo)
    expect(computeKPIs([{ codigo: '001', nome: 'X', savingReal: -500, valorOrcamentoAtualizado: 1000 }]).corSavingReal).toBe('danger');
    expect(computeKPIs([{ codigo: '001', nome: 'X', savingReal: 0, valorOrcamentoAtualizado: 1000 }]).corSavingReal).toBe('neutral');
  });
  it('Saving REAL reproduz o exemplo real da obra (R$ 4.143,20 ÷ R$ 63.697.430,34 = 0,01%)', () => {
    const k = computeKPIs([{ codigo: '001', nome: 'X', savingReal: 4143.20, valorOrcamentoAtualizado: 63697430.34 }]);
    expect(k.savingRealPct).toBeCloseTo(0.01, 2);
  });
  // Ganhos em INCC (%) = Ganhos (Atualização de INCC) - REAL ÷ orçamento atualizado.
  it('Ganhos em INCC (%) = Ganhos (INCC) Real ÷ orçamento atualizado', () => {
    expect(kpis.ganhosInccReal).toBeCloseTo(30000, 2);
    expect(kpis.ganhosInccRealPct).toBeCloseTo((30000 / 1100000) * 100, 5); // 2,727...%
  });
  it('Ganhos em INCC reproduz o exemplo real da obra (R$ 3.667.017,71 ÷ R$ 63.697.430,34 = 5,76%)', () => {
    const k = computeKPIs([{ codigo: '001', nome: 'X', ganhosInccReal: 3667017.71, valorOrcamentoAtualizado: 63697430.34 }]);
    expect(k.ganhosInccRealPct).toBeCloseTo(5.76, 2);
  });
  it('Ganhos em INCC negativo -> perigo; positivo -> sucesso', () => {
    expect(computeKPIs([{ codigo: '001', nome: 'X', ganhosInccReal: -1, valorOrcamentoAtualizado: 1000 }]).corGanhosInccReal).toBe('danger');
    expect(kpis.corGanhosInccReal).toBe('success'); // 30.000, do fixture sintético
  });
  // Tendência de Fechamento (%) = 1 − (Tendência ÷ Orçamento Atualizado); em R$, esse %
  // aplicado sobre o Orçamento Atualizado — equivale a Orçamento Atualizado − Tendência.
  it('Tendência de Fechamento (%) = 1 − (Tendência ÷ orçamento atualizado); (R$) = % × orçamento atualizado', () => {
    expect(kpis.tendenciaFechamentoPct).toBeCloseTo((1 - 1050000 / 1100000) * 100, 5); // 4,545...%
    expect(kpis.tendenciaFechamentoReal).toBeCloseTo(1100000 - 1050000, 2); // 50.000
  });
  it('Tendência de Fechamento reproduz o exemplo real da obra (R$ 60.026.269,44 vs R$ 63.697.430,34 -> 5,76% / R$ 3.671.160,90)', () => {
    const k = computeKPIs([{ codigo: '001', nome: 'X', tendencia: 60026269.44, valorOrcamentoAtualizado: 63697430.34 }]);
    expect(k.tendenciaFechamentoPct).toBeCloseTo(5.76, 2);
    expect(k.tendenciaFechamentoReal).toBeCloseTo(3671160.90, 2);
  });
  it('sem linha de total: null', () => {
    expect(computeKPIs([{ codigo: '001.01', nome: 'x' }])).toBeNull();
  });
});

describe('somarTotaisCarteira / computeKPIsFromTotal', () => {
  // 2 obras sintéticas com orçamentos bem diferentes, pra deixar claro quando um campo
  // está sendo ponderado pelo orçamento (executadoFisico) vs. só somado (o resto).
  const obraA = { valorOrcamentoAtualizado: 1000000, executadoFisico: 40, gastoPct: 30, gastoReal: 300000, savingReal: 5000, ganhosInccReal: 8000, tendencia: 950000 };
  const obraB = { valorOrcamentoAtualizado: 500000, executadoFisico: 20, gastoPct: 25, gastoReal: 125000, savingReal: -1000, ganhosInccReal: 2000, tendencia: 480000 };

  it('soma valores absolutos (orçamento, gastoReal, savingReal, ganhosInccReal, tendência) direto', () => {
    const t = somarTotaisCarteira([obraA, obraB]);
    expect(t.valorOrcamentoAtualizado).toBeCloseTo(1500000, 2);
    expect(t.gastoReal).toBeCloseTo(425000, 2);
    expect(t.savingReal).toBeCloseTo(4000, 2);
    expect(t.ganhosInccReal).toBeCloseTo(10000, 2);
    expect(t.tendencia).toBeCloseTo(1430000, 2);
  });

  it('executadoFisico (%) é ponderado pelo orçamento atualizado de cada obra, não média simples', () => {
    const t = somarTotaisCarteira([obraA, obraB]);
    // (40*1.000.000 + 20*500.000) / 1.500.000 = 33,33...% — não (40+20)/2=30%
    expect(t.executadoFisico).toBeCloseTo(100 / 3, 5);
  });

  it('gastoPct (%) também é ponderado pelo orçamento atualizado, igual executadoFisico', () => {
    const t = somarTotaisCarteira([obraA, obraB]);
    // (30*1.000.000 + 25*500.000) / 1.500.000 = 28,33...%
    expect(t.gastoPct).toBeCloseTo(85 / 3, 5);
  });

  it('computeKPIsFromTotal do total combinado usa a MESMA fórmula do card por obra', () => {
    const kpis = computeKPIsFromTotal(somarTotaisCarteira([obraA, obraB]));
    expect(kpis.deltaFisicoFinanceiroPct).toBeCloseTo(5, 5); // 33,33...% - 28,33...% = 5%
    expect(kpis.deltaFisicoFinanceiroReal).toBeCloseTo(75000, 2); // 5% * 1.500.000
    expect(kpis.savingRealPct).toBeCloseTo((4000 / 1500000) * 100, 5);
    expect(kpis.ganhosInccRealPct).toBeCloseTo((10000 / 1500000) * 100, 5);
    expect(kpis.tendenciaFechamentoPct).toBeCloseTo((1 - 1430000 / 1500000) * 100, 5);
    expect(kpis.tendenciaFechamentoReal).toBeCloseTo(70000, 2); // 1.500.000 - 1.430.000
  });

  it('obra sem fechamento (null/undefined na lista) não entra na soma', () => {
    const comBuraco = somarTotaisCarteira([obraA, null, obraB, undefined]);
    const semBuraco = somarTotaisCarteira([obraA, obraB]);
    expect(comBuraco).toEqual(semBuraco);
  });

  it('lista vazia ou só null/undefined: null', () => {
    expect(somarTotaisCarteira([])).toBeNull();
    expect(somarTotaisCarteira([null, undefined])).toBeNull();
    expect(somarTotaisCarteira(null)).toBeNull();
  });

  it('computeKPIsFromTotal(null): null', () => {
    expect(computeKPIsFromTotal(null)).toBeNull();
  });

  it('1 obra só: computeKPIsFromTotal(somarTotaisCarteira([total])) bate exatamente com computeKPIs(itens) dessa obra', () => {
    const { itens } = parseFechamentoSheet(AOA);
    const total = getLinhaTotal(itens);
    const viaCarteira = computeKPIsFromTotal(somarTotaisCarteira([total]));
    const viaObra = computeKPIs(itens);
    expect(viaCarteira).toEqual(viaObra);
  });
});
