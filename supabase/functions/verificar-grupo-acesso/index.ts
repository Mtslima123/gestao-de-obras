import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Object ID do grupo de segurança do Azure AD "G-SOTER-<App>" — só quem pertence a
// esse grupo pode ter o acesso liberado neste app. Ver auditoria de 2026-09.
const GRUPO_ACESSO_ID = 'f9e6ce01-e343-4b73-99f0-b238a6dbab9a';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ok  = (body: unknown) => new Response(JSON.stringify(body),           { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const err = (msg: string)   => new Response(JSON.stringify({ error: msg }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// Chamada uma vez por login SSO (a partir do provider_token que o Supabase devolve só
// na resposta do sign-in inicial — não sobrevive a reload de página, então isto só roda
// no momento do login, não em toda carga da app). Confirma no Microsoft Graph se o
// usuário pertence ao grupo de acesso; se não pertencer, bloqueia o perfil no banco
// (server-side) — assim mesmo que o cliente ignore a resposta, o próximo carregamento
// de perfil (loadUserProfile em App.jsx) já vê status != 'ativo' e nega o acesso.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Identifica quem está chamando pelo próprio JWT da sessão (nunca confia em um
    // userId vindo no corpo da requisição).
    const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
    const { data: { user: caller }, error: callerErr } = await supabaseAdmin.auth.getUser(token);
    if (callerErr || !caller) return err('Não autenticado');

    const { providerToken } = await req.json();
    if (!providerToken) return err('providerToken é obrigatório');

    // checkMemberGroups (em nome do próprio usuário, com o access token que a Microsoft
    // emitiu pra ele no login) resolve grupos aninhados e não sofre do limite de
    // "overage" que o claim `groups` do ID token tem quando o usuário está em muitos
    // grupos — por isso a checagem via Graph, e não via claim do token.
    const graphRes = await fetch('https://graph.microsoft.com/v1.0/me/checkMemberGroups', {
      method: 'POST',
      headers: { Authorization: `Bearer ${providerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupIds: [GRUPO_ACESSO_ID] }),
    });
    if (!graphRes.ok) {
      const detalhe = await graphRes.text();
      return err(`Falha ao consultar o Microsoft Graph (${graphRes.status}): ${detalhe}`);
    }
    const { value: gruposDoUsuario } = await graphRes.json();
    const membro = Array.isArray(gruposDoUsuario) && gruposDoUsuario.includes(GRUPO_ACESSO_ID);

    if (!membro) {
      // user_profiles.status só aceita 'ativo'/'inativo' (CHECK constraint) — reaproveita
      // 'inativo' em vez de criar um valor novo (evita migration), e deixa a auditoria
      // registrar o motivo real, pra não parecer que foi um admin que desativou à mão.
      await supabaseAdmin.from('user_profiles').update({ status: 'inativo' }).eq('id', caller.id);
      await supabaseAdmin.from('audit_logs').insert([{
        user_id: caller.id,
        user_nome: caller.email,
        user_perfil: 'usuario',
        modulo: 'autenticacao',
        acao: 'bloqueou',
        entidade_tipo: 'usuario',
        entidade_id: caller.id,
        descricao: `Acesso bloqueado: "${caller.email}" não pertence ao grupo de acesso do Azure AD`,
        criticidade: 'alta',
        origem: 'Web',
      }]);
    }

    return ok({ membro });
  } catch (e) {
    return err(e.message ?? 'Erro interno');
  }
});
