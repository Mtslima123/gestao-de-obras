// Leitura das planilhas do módulo Efetivo (sem React e sem a lib xlsx, para teste). Recebe as
// linhas da planilha como matriz (XLSX.utils.sheet_to_json com header: 1, raw: true) e devolve
// o que casou, o que não casou e os avisos; quem grava é a tela, depois de o usuário conferir.
//
// Formatos (README do handoff):
//  - Efetivo (apropriação): FUNÇÃO, TOTAL EFETIVO, TRAB. NA ADM, TRAB. NO CANTEIRO (ignorada,
//    recalculada), INSS/SEGURO, FÉRIAS, EMPREST/MANUT, DESTINO, RECEBIDO OUTRA OBRA, ORIGEM,
//    ATIVOS (conferida contra o cálculo). Acima do cabeçalho pode haver DATA e OBRA.
//  - Orçamento (previsto): função, qtd/mês, início, término.
// Função casa por nome normalizado (sem acento, caixa-alta, só letras e números).
import { ativos, temValor, trabCanteiro } from './regras';

export const normalizar = (v) =>
  String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

// ---- valores -----------------------------------------------------------------------------

const vazio = (v) => v == null || (typeof v === 'string' && ['', '-', '—'].includes(v.trim()));

// null = vazio; { erro: true } = não é número inteiro >= 0.
const inteiro = (v) => {
  if (vazio(v)) return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return { erro: true };
  return n;
};

// Número de série do Excel, texto dd/mm/aaaa (ou dd/mm/aa), aaaa-mm-dd ou Date -> 'YYYY-MM-DD'.
export const paraIso = (v) => {
  if (vazio(v)) return null;
  const iso = (y, m, d) => {
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  };
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : iso(v.getFullYear(), v.getMonth() + 1, v.getDate());
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return null; // fora de ~1954-2119: não é data
    const dt = new Date(Math.round((v - 25569) * 86400000));
    return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  const t = String(v).trim();
  let m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})$/);
  if (m) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m ? iso(+m[1], +m[2], +m[3]) : null;
};

// ---- cabeçalho ---------------------------------------------------------------------------

const casa = (norm, aliases) => aliases.some((a) => norm === a || norm.startsWith(a + ' '));

const COLS_EFETIVO = {
  funcao: ['FUNCAO', 'CARGO'],
  totalEfetivo: ['TOTAL EFETIVO', 'EFETIVO TOTAL'],
  trabAdm: ['TRAB NA ADM', 'TRABALHANDO NA ADM', 'TRAB ADM'],
  trabCanteiro: ['TRAB NO CANTEIRO', 'TRABALHANDO NO CANTEIRO'],
  inssSeguro: ['INSS SEGURO', 'INSS'],
  ferias: ['FERIAS'],
  emprestManut: ['EMPREST MANUT', 'EMPRESTADO MANUTENCAO', 'EMPREST'],
  destino: ['DESTINO'],
  recebidoOutraObra: ['RECEBIDO OUTRA OBRA', 'RECEBIDO'],
  origem: ['ORIGEM'],
  ativos: ['ATIVOS'],
};
const COLS_PREVISTO = {
  funcao: ['FUNCAO', 'CARGO'],
  qtdMes: ['QTD MES', 'QTDE MES', 'QTD MENSAL', 'QTD', 'QTDE', 'QUANTIDADE'],
  inicio: ['INICIO', 'DATA INICIO'],
  termino: ['TERMINO', 'DATA TERMINO', 'FIM', 'DATA FIM'],
};

// Procura nas primeiras linhas a que parece o cabeçalho: tem FUNÇÃO e pelo menos `minimo`
// outras colunas conhecidas. Devolve { linha, col: { chave: índiceDaColuna } } ou null.
const acharCabecalho = (rows, defs, minimo) => {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const col = {};
    (rows[i] || []).forEach((cel, j) => {
      const n = normalizar(cel);
      if (!n) return;
      for (const [k, aliases] of Object.entries(defs)) {
        if (col[k] === undefined && casa(n, aliases)) { col[k] = j; break; }
      }
    });
    if (col.funcao !== undefined && Object.keys(col).length - 1 >= minimo) return { linha: i, col };
  }
  return null;
};

const porNome = (funcoes) => {
  const m = new Map();
  for (const f of funcoes) if (f.ativo !== false && !m.has(normalizar(f.nome))) m.set(normalizar(f.nome), f);
  return m;
};

const LINHA_TOTAL = new Set(['TOTAL', 'TOTAIS', 'TOTAL GERAL', 'SUBTOTAL']);

// DATA e OBRA do cabeçalho da planilha ("DATA | 01/10/2026" ou "DATA: 01/10/2026").
const lerCabecalhoPlanilha = (rows, ate) => {
  const out = { data: null, obra: null };
  for (let i = 0; i < ate; i++) {
    const linha = rows[i] || [];
    linha.forEach((cel, j) => {
      const txt = String(cel ?? '').trim();
      const n = normalizar(txt);
      const proximo = () => { for (let k = j + 1; k < linha.length; k++) if (!vazio(linha[k])) return linha[k]; return null; };
      const inline = txt.match(/^(DATA|OBRA)\s*[:\-]\s*(.+)$/i);
      const [chave, valor] = inline ? [inline[1].toUpperCase(), inline[2]] : n === 'DATA' ? ['DATA', proximo()] : n === 'OBRA' ? ['OBRA', proximo()] : [null, null];
      if (chave === 'DATA' && !out.data) out.data = paraIso(valor);
      if (chave === 'OBRA' && !out.obra && !vazio(valor)) out.obra = String(valor).trim();
    });
  }
  return out;
};

// ---- planilha de efetivo -----------------------------------------------------------------

const CAMPOS_NUM = ['totalEfetivo', 'trabAdm', 'inssSeguro', 'ferias', 'emprestManut', 'recebidoOutraObra'];
const ROTULO = { totalEfetivo: 'TOTAL EFETIVO', trabAdm: 'TRAB. NA ADM', inssSeguro: 'INSS/SEGURO', ferias: 'FÉRIAS', emprestManut: 'EMPREST/MANUT', recebidoOutraObra: 'RECEBIDO OUTRA OBRA' };

export function lerPlanilhaEfetivo(rows, funcoes) {
  const cab = acharCabecalho(rows, COLS_EFETIVO, 2);
  if (!cab) return { erro: 'Não achei o cabeçalho da planilha de efetivo (coluna FUNÇÃO e as colunas de quantidade, como TOTAL EFETIVO).' };
  const funcaoPorNome = porNome(funcoes);
  const itens = [], naoEncontradas = [], divergencias = [], avisos = [], vistas = new Set();
  const get = (linha, k) => (cab.col[k] === undefined ? null : linha[cab.col[k]]);

  for (let i = cab.linha + 1; i < rows.length; i++) {
    const linha = rows[i] || [];
    const nome = String(get(linha, 'funcao') ?? '').trim();
    const norm = normalizar(nome);
    if (!norm || LINHA_TOTAL.has(norm)) continue;
    const num = {};
    let invalido = false;
    for (const k of CAMPOS_NUM) {
      const v = inteiro(get(linha, k));
      if (v && v.erro) { avisos.push(`Linha ${i + 1} (${nome}): valor inválido em ${ROTULO[k]} ("${get(linha, k)}"). Use números inteiros, de 0 para cima.`); invalido = true; }
      else num[k] = v;
    }
    if (invalido) continue;
    const destino = vazio(get(linha, 'destino')) ? null : String(get(linha, 'destino')).trim();
    const origem = vazio(get(linha, 'origem')) ? null : String(get(linha, 'origem')).trim();
    const item = { apropriacaoId: null, funcaoId: null, ...num, destino, origem };
    // Linha de título de grupo (nome sem nenhum valor): ignora sem avisar.
    if (!temValor(item) && !destino && !origem) continue;

    const f = funcaoPorNome.get(norm);
    if (!f) { naoEncontradas.push({ nome, linha: i + 1 }); continue; }
    if (vistas.has(f.id)) { avisos.push(`Linha ${i + 1}: "${nome}" aparece mais de uma vez; usei a primeira.`); continue; }
    vistas.add(f.id);
    item.funcaoId = f.id;
    itens.push(item);

    if (temValor(item) && trabCanteiro(item) < 0) avisos.push(`"${f.nome}": trab. no canteiro ficou negativo (${trabCanteiro(item)}). Confira total, ADM, INSS, férias e empréstimo.`);
    const atPlanilha = inteiro(get(linha, 'ativos'));
    const atCalc = ativos(item);
    if (atPlanilha != null && !atPlanilha.erro && atPlanilha !== (atCalc ?? 0)) {
      divergencias.push({ nome: f.nome, planilha: atPlanilha, calculado: atCalc ?? 0 });
    }
  }
  if (!itens.length) return { erro: 'Nenhuma função da planilha bate com o cadastro de funções.', naoEncontradas };
  return { itens, naoEncontradas, divergencias, avisos, cabecalho: lerCabecalhoPlanilha(rows, cab.linha) };
}

// Confere DATA e OBRA da planilha com a tela onde ela está sendo importada. Só avisa.
export const avisosDeContexto = (cabecalho, { obraCodigo, obraNome, ano, mes, quinzena }) => {
  const avisos = [];
  if (cabecalho?.data) {
    const [y, m, d] = cabecalho.data.split('-').map(Number);
    const q = d <= 15 ? 1 : 2;
    if (y !== ano || m !== mes || q !== quinzena) {
      avisos.push(`A data da planilha (${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}, ${q}ª quinzena) não é a da apropriação aberta (${quinzena}ª de ${String(mes).padStart(2, '0')}/${ano}).`);
    }
  }
  if (cabecalho?.obra) {
    const o = normalizar(cabecalho.obra);
    const nomes = [obraCodigo, obraNome].map(normalizar).filter(Boolean);
    if (o && !nomes.some((n) => n === o || n.includes(o) || o.includes(n))) {
      avisos.push(`A obra da planilha ("${cabecalho.obra}") parece diferente da obra aberta (${obraCodigo || obraNome}).`);
    }
  }
  return avisos;
};

// ---- planilha de orçamento (previsto) ----------------------------------------------------

// padrao = { inicio, termino } da obra, usados quando a planilha não traz as datas da função.
export function lerPlanilhaPrevisto(rows, funcoes, padrao = {}) {
  const cab = acharCabecalho(rows, COLS_PREVISTO, 1);
  if (!cab || cab.col.qtdMes === undefined) return { erro: 'Não achei o cabeçalho da planilha de orçamento (colunas FUNÇÃO e QTD/MÊS, com INÍCIO e TÉRMINO).' };
  const funcaoPorNome = porNome(funcoes);
  const itens = [], naoEncontradas = [], invalidas = [], avisos = [], vistas = new Set();
  const get = (linha, k) => (cab.col[k] === undefined ? null : linha[cab.col[k]]);
  if (cab.col.inicio === undefined || cab.col.termino === undefined) avisos.push('A planilha não tem as colunas INÍCIO e/ou TÉRMINO: usei as datas da obra onde faltou.');

  for (let i = cab.linha + 1; i < rows.length; i++) {
    const linha = rows[i] || [];
    const nome = String(get(linha, 'funcao') ?? '').trim();
    const norm = normalizar(nome);
    if (!norm || LINHA_TOTAL.has(norm)) continue;
    if (vazio(get(linha, 'qtdMes')) && vazio(get(linha, 'inicio')) && vazio(get(linha, 'termino'))) continue; // título de grupo
    const f = funcaoPorNome.get(norm);
    if (!f) { naoEncontradas.push({ nome, linha: i + 1 }); continue; }
    if (vistas.has(f.id)) { avisos.push(`Linha ${i + 1}: "${nome}" aparece mais de uma vez; usei a primeira.`); continue; }
    const qtd = inteiro(get(linha, 'qtdMes'));
    if (qtd == null || qtd.erro) { invalidas.push({ nome, linha: i + 1, motivo: `quantidade por mês inválida ("${get(linha, 'qtdMes') ?? ''}")` }); continue; }
    const ini = vazio(get(linha, 'inicio')) ? padrao.inicio ?? null : paraIso(get(linha, 'inicio'));
    const fim = vazio(get(linha, 'termino')) ? padrao.termino ?? null : paraIso(get(linha, 'termino'));
    if (!ini || !fim) { invalidas.push({ nome, linha: i + 1, motivo: 'data de início ou de término inválida' }); continue; }
    if (fim < ini) { invalidas.push({ nome, linha: i + 1, motivo: 'término antes do início' }); continue; }
    vistas.add(f.id);
    itens.push({ funcaoId: f.id, qtdMes: qtd, inicio: ini, termino: fim });
  }
  if (!itens.length) return { erro: 'Nenhuma função válida da planilha bate com o cadastro de funções.', naoEncontradas, invalidas };
  return { itens, naoEncontradas, invalidas, avisos };
}
