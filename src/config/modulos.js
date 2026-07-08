// Fonte ÚNICA dos módulos e abas navegáveis do sistema.
//
// Ao criar um módulo ou uma aba nova, adicione AQUI. Isso reflete automaticamente:
//  - no menu lateral (src/Chrome.jsx)
//  - no cadastro de permissões de usuário (src/modules/admin/Usuarios.jsx)
//
// Assim as duas telas nunca ficam dessincronizadas. Só entram módulos que têm
// tela real; "abas" só para módulos com sub-telas reais.

export const MODULOS = [
  { id: 'dashboard',   label: 'Dashboard',         icon: 'dashboard' },
  { id: 'obras',       label: 'Obras',             icon: 'building', abas: [
      { id: 'visao',      label: 'Visão geral' },
      { id: 'cronograma', label: 'Cronograma' },
      { id: 'fotos',      label: 'Fotos' },
  ] },
  { id: 'orcamentos',  label: 'Orçamentos',        icon: 'wallet' },
  { id: 'cronograma',  label: 'Cronogramas',       icon: 'calendar' },
  { id: 'orc-x-cron',  label: 'Orç. × Cronograma', icon: 'link', subDe: 'cronograma' },
  { id: 'estimativas', label: 'Estimativas',       icon: 'calculator', abas: [
      { id: 'nova',   label: 'Estimativa atual' },
      { id: 'salvas', label: 'Estimativas salvas' },
      { id: 'base',   label: 'Base de dados' },
  ] },
  { id: 'incc',        label: 'INCC',              icon: 'trending-up' },
];

// Módulos de nível superior no menu (exclui sub-itens, ex.: orc-x-cron)
export const MODULOS_TOPO = MODULOS.filter(m => !m.subDe);

// Todos os ids de módulo (usado como padrão "acesso total" no cadastro)
export const MODULOS_IDS = MODULOS.map(m => m.id);

// Mapa módulo -> abas configuráveis (só módulos com sub-telas reais)
export const MODULO_ABAS = Object.fromEntries(
  MODULOS.filter(m => m.abas?.length).map(m => [m.id, m.abas])
);
