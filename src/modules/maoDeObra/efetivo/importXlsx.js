import { logger } from '../../../services/logger';

const LIMITE = 25 * 1024 * 1024;

// Lê o arquivo escolhido e passa as linhas de cada aba ao `parser` (importXlsxPure) até uma
// servir; se nenhuma serve, devolve o erro da primeira aba. A lib xlsx é carregada só aqui
// (fora do bundle inicial), como em Físico Financeiro. Nunca lança: erro vira { erro }.
export async function lerPlanilha(file, parser) {
  if (!file) return { erro: 'Nenhum arquivo escolhido.' };
  if (file.size > LIMITE) return { erro: 'Arquivo muito grande. Máximo: 25 MB.' };
  try {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    let primeiroErro = null;
    for (const nome of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, raw: true, defval: null });
      const r = parser(rows);
      if (!r.erro) return { ...r, nomeArquivo: file.name, aba: nome };
      primeiroErro = primeiroErro ?? r;
    }
    return { ...(primeiroErro ?? {}), erro: primeiroErro?.erro ?? 'A planilha está vazia.', nomeArquivo: file.name };
  } catch (e) {
    logger.error('erro ao ler planilha de efetivo', { module: 'maoDeObra', action: 'lerPlanilha', err: e });
    return { erro: 'Não consegui ler esse arquivo. Use uma planilha do Excel (.xlsx ou .xls).' };
  }
}
