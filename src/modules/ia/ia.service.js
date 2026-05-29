import { supabase } from '../../services/supabase';

export const iaService = {
  executar: (tipo, payload) =>
    supabase.functions.invoke('ia-assistente', {
      body: { tipo, ...payload },
    }),
};
