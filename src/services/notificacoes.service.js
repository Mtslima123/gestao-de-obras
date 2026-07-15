import { supabase } from './supabase';

// Event-bus mínimo (via window events) para o sino reagir na hora a uma ação
// que gera notificação, sem esperar o polling nem recarregar a página.
const CHANGED = 'notificacoes:changed';
export const notifBus = {
  ping() { try { window.dispatchEvent(new Event(CHANGED)); } catch { /* sem window (SSR): ignora */ } },
  subscribe(fn) { window.addEventListener(CHANGED, fn); return () => window.removeEventListener(CHANGED, fn); },
};

// Serviço de notificações reais (tabela public.notificacoes).
// RLS garante que cada usuário só enxerga/atualiza as próprias.
export const notificacoesService = {
  listar: (limit = 30) =>
    supabase
      .from('notificacoes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit),

  contarNaoLidas: () =>
    supabase
      .from('notificacoes')
      .select('*', { count: 'exact', head: true })
      .eq('lido', false),

  marcarLida: (id) =>
    supabase.from('notificacoes').update({ lido: true }).eq('id', id),

  marcarTodasLidas: () =>
    supabase.from('notificacoes').update({ lido: true }).eq('lido', false),
};
