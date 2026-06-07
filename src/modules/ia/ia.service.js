import { supabase } from '../../services/supabase';

// 🔒 SEGURANÇA [VULN-5]: Throttle — previne esgotamento de cota Groq por spam (CWE-400)
let _ultimaChamadaIA = 0;
const INTERVALO_MIN_MS = 5_000;

export const iaService = {
  executar: (tipo, payload) => {
    const agora = Date.now();
    if (agora - _ultimaChamadaIA < INTERVALO_MIN_MS) {
      return Promise.reject(new Error('Aguarde alguns segundos antes de nova consulta à IA.'));
    }
    _ultimaChamadaIA = agora;
    return supabase.functions.invoke('ia-assistente', {
      body: { tipo, ...payload },
    });
  },
};
