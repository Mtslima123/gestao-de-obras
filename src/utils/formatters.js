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

// Tamanho de arquivo: 2411724 -> "2,3 MB" (pt-BR, vírgula decimal)
export const formatBytes = (bytes) => {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let val = b / 1024;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  const decimals = val >= 100 || i === 0 ? 0 : 1;
  return `${val.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} ${units[i]}`;
};

// Timestamp ISO -> "11/07/2026 14:30" (pt-BR)
export const formatDateTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

// Iniciais para avatar: "Ana Souza" -> "AS"; vazio -> "?"
export const initials = (name) => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};

// Cor determinística do avatar a partir do nome
const AVATAR_PALETTE = ['#1c4584', '#2a5599', '#0891b2', '#7c3aed', '#db2777', '#15803d'];
export const avatarColor = (name) =>
  AVATAR_PALETTE[[...(name || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_PALETTE.length];
