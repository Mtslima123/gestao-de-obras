// Formatadores centralizados — evita duplicação entre módulos

export const formatBRL = (value, decimals = 2) =>
  (Number(value) || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

export const formatNum = (value, decimals = 2) =>
  isFinite(Number(value))
    ? Number(value).toLocaleString('pt-BR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    : '—';

export const formatPct = (value, decimals = 1) =>
  isFinite(Number(value))
    ? (Number(value) * 100).toLocaleString('pt-BR', { maximumFractionDigits: decimals }) + '%'
    : '—';
