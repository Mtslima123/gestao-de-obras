import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ok  = (body: unknown) => new Response(JSON.stringify(body),           { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const err = (msg: string)   => new Response(JSON.stringify({ error: msg }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Identifica o usuário pelo JWT enviado pelo frontend
    const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !user) return err('Não autenticado');

    await supabaseAdmin
      .from('user_profiles')
      .update({ deve_alterar_senha: false })
      .eq('email', user.email);

    return ok({ ok: true });
  } catch (e) {
    return err(e.message ?? 'Erro interno');
  }
});
