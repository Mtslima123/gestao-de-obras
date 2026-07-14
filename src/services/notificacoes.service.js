import { supabase } from './supabase';

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
