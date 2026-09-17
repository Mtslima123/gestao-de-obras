import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Lista os membros do grupo de acesso do Azure AD (GESTAOOBRAS) via Microsoft Graph,
// pra a tela de Usuários (Administração) mostrar quem já está autorizado e ainda não tem
// perfil cadastrado ("Pendências do grupo"). Chamada só quando um admin abre essa tela —
// nunca no fluxo de login (signInWithSSO continua com o escopo mínimo, intocado). Usa
// application permission (client credentials, servidor) em vez de delegated: pedir escopo
// novo no login sem admin consent já concedido bloqueou o acesso de todo mundo numa
// tentativa anterior (ver histórico) — este caminho não tem esse risco, porque não muda
// nada no login de ninguém.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ok  = (body: unknown) => new Response(JSON.stringify(body),           { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const err = (msg: string)   => new Response(JSON.stringify({ error: msg }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// Token via client credentials (application permission, GroupMember.Read.All ou
// Group.Read.All) — nada de delegated, nada de provider_token do browser.
async function obterTokenGraph(): Promise<string> {
  const tenantId = Deno.env.get('GRAPH_TENANT_ID')!;
  const clientId = Deno.env.get('GRAPH_CLIENT_ID')!;
  const clientSecret = Deno.env.get('GRAPH_CLIENT_SECRET')!;
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
    }),
  });
  if (!res.ok) throw new Error(`Falha ao obter token do Graph (${res.status}): ${await res.text()}`);
  const { access_token } = await res.json();
  return access_token;
}

// Busca todos os membros do grupo, seguindo @odata.nextLink se a lista vier paginada.
async function listarMembros(token: string, grupoId: string) {
  const membros: { id: string; nome: string; email: string }[] = [];
  let url = `https://graph.microsoft.com/v1.0/groups/${grupoId}/members?$select=id,displayName,mail,userPrincipalName&$top=999`;
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Falha ao consultar o Microsoft Graph (${res.status}): ${await res.text()}`);
    const data = await res.json();
    for (const m of data.value ?? []) {
      const email = (m.mail ?? m.userPrincipalName ?? '').toLowerCase().trim();
      if (email) membros.push({ id: m.id, nome: m.displayName ?? email, email });
    }
    url = data['@odata.nextLink'] ?? '';
  }
  return membros;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Só admin autenticado pode listar o grupo — mesma checagem usada nas outras
    // Edge Functions administrativas deste projeto.
    const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
    const { data: { user: caller }, error: callerErr } = await supabaseAdmin.auth.getUser(token);
    if (callerErr || !caller) return err('Não autenticado');

    const { data: callerProfile } = await supabaseAdmin
      .from('user_profiles')
      .select('perfil, status')
      .eq('id', caller.id)
      .single();
    if (!callerProfile || callerProfile.perfil !== 'admin' || callerProfile.status !== 'ativo') {
      return err('Acesso negado: requer administrador');
    }

    const grupoId = Deno.env.get('GRAPH_GRUPO_ID')!;
    const graphToken = await obterTokenGraph();
    const membros = await listarMembros(graphToken, grupoId);

    return ok({ membros });
  } catch (e) {
    return err(e.message ?? 'Erro interno');
  }
});
