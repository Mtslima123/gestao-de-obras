import { supabase } from '../../services/supabase';

export const dashboardService = {
  obras: {
    listar: () =>
      supabase.from('obras').select('*').order('created_at', { ascending: false }),
  },
};
