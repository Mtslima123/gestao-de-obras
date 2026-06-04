import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Groq é gratuito — custo sempre zero
function calcularCusto(_modelo: string, _input: number, _output: number): number {
  return 0;
}

// Remove markdown fences e extrai JSON puro da resposta
function parseJson(raw: string): unknown {
  let limpo = raw.trim()
    .replace(/^```json\s*/i, '').replace(/\s*```$/i, '')
    .replace(/^```\s*/i, '').replace(/\s*```$/i, '');
  const inicio = limpo.search(/[{[]/);
  if (inicio > 0) limpo = limpo.substring(inicio);
  const fim = Math.max(limpo.lastIndexOf('}'), limpo.lastIndexOf(']'));
  if (fim !== limpo.length - 1 && fim > 0) limpo = limpo.substring(0, fim + 1);
  return JSON.parse(limpo);
}

// Chama a API do Groq (OpenAI-compatible, gratuito)
async function callGemini(
  prompt: string,
  modelo: string,
  temperatura: number,
  maxTokens = 8192,
) {
  const apiKey = Deno.env.get('GROQ_API_KEY');
  if (!apiKey) throw new Error('GROQ_API_KEY não configurada no Supabase Secrets.');

  const inicio = Date.now();
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelo,
      messages: [{ role: 'user', content: prompt }],
      temperature: temperatura,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Groq API erro ${res.status}: ${body}`);
  }

  const data = await res.json();
  const text         = data.choices?.[0]?.message?.content ?? '';
  const tokensInput  = data.usage?.prompt_tokens     ?? 0;
  const tokensOutput = data.usage?.completion_tokens ?? 0;
  const custoUsd     = 0; // Groq é gratuito
  const duracaoMs    = Date.now() - inicio;

  return { text, tokensInput, tokensOutput, custoUsd, duracaoMs };
}

// ── Prompts ────────────────────────────────────────────────────────────────────

function promptCronograma(b: Record<string, unknown>): string {
  return `Você é um engenheiro planejador sênior com 20 anos de experiência em obras de construção civil no Brasil, especializado em MS Project e Primavera P6.

Gere um cronograma detalhado em JSON para a obra abaixo.

DADOS DA OBRA:
- Tipo: ${b.tipoObra}
- Descrição: ${b.descricao}
- Pavimentos: ${b.quantidadePavimentos}
- Prazo desejado: ${b.prazoDias} dias
- Calendário: ${b.calendario ?? 'Segunda a sábado, 8h/dia'}
- Restrições: ${b.restricoes ?? 'Nenhuma'}

REGRAS:
1. Lógica construtiva brasileira: fundação → estrutura → alvenaria → instalações → acabamentos
2. Predecessoras usam IDs internos da lista (começando em 1)
3. Tipos de dependência: "TI" (término-início), "II" (início-início), "TT" (término-término)
4. Latências em dias (positivo = lag, negativo = lead)
5. Durações realistas para equipes brasileiras
6. Caminho crítico compatível com prazo de ${b.prazoDias} dias
7. Nível EAP: 1 = fase, 2 = entrega, 3 = pacote de trabalho
8. Entre 30 e 80 tarefas

RESPONDA APENAS COM JSON VÁLIDO:

{
  "cronograma": [
    {
      "id": 1,
      "nome": "string",
      "duracao": 0,
      "unidade": "dias",
      "predecessoras": [{ "id": 0, "tipo": "TI", "latencia": 0 }],
      "fase": "string",
      "nivel_eap": 1,
      "recurso_sugerido": "string",
      "observacao": "string"
    }
  ],
  "resumo": {
    "total_tarefas": 0,
    "fases": ["string"],
    "prazo_estimado_dias": 0,
    "premissas": ["string"]
  }
}`;
}

function promptEap(b: Record<string, unknown>): string {
  return `Você é um engenheiro planejador especialista em EAP (Estrutura Analítica do Projeto) para obras de construção civil.

Gere uma EAP completa para a obra abaixo.

DADOS:
- Tipo: ${b.tipoObra}
- Descrição: ${b.descricao}
- Pavimentos: ${b.quantidadePavimentos}
- Escopo adicional: ${b.escopo ?? 'Padrão para o tipo de obra'}

REGRAS:
1. Nível 1: Fases principais (máx. 8)
2. Nível 2: Entregas por fase (3 a 6 por fase)
3. Nível 3: Pacotes de trabalho (2 a 5 por entrega)
4. Codificação: 1.0, 1.1, 1.1.1
5. Nomes curtos e técnicos (máx. 50 caracteres)

RESPONDA APENAS COM JSON VÁLIDO:

{
  "eap": [
    {
      "codigo": "1.0",
      "nome": "string",
      "nivel": 1,
      "descricao": "string",
      "entregavel": "string",
      "criterio_aceite": "string"
    }
  ]
}`;
}

function promptAtraso(b: Record<string, unknown>): string {
  return `Você é um engenheiro planejador sênior especialista em análise de desvios e recuperação de cronogramas de obras.

Analise a situação de atraso abaixo e forneça diagnóstico técnico com estratégias de recuperação.

DADOS:
- Obra: ${b.nomeObra ?? 'Não informado'}
- Data de término contratual: ${b.dataFimObra}
- Atraso estimado: ${b.diasAtraso ?? 0} dias
- Situação atual: ${b.descricaoSituacao ?? 'Não informada'}
- Contexto adicional: ${b.contextoAdicional ?? 'Não informado'}

RESPONDA COM JSON VÁLIDO:

{
  "diagnostico": {
    "gravidade": "baixa|media|alta|critica",
    "impacto_prazo_dias": 0,
    "percentual_atraso_geral": 0,
    "resumo_executivo": "string"
  },
  "gargalos": [
    {
      "area": "string",
      "motivo_provavel": "string",
      "impacto": "string",
      "critica": true
    }
  ],
  "estrategias": [
    {
      "prioridade": 1,
      "acao": "string",
      "descricao": "string",
      "reducao_dias_estimada": 0,
      "custo_adicional": "baixo|medio|alto",
      "viabilidade": "alta|media|baixa"
    }
  ],
  "alertas": ["string"]
}`;
}

function promptReplanejar(b: Record<string, unknown>): string {
  return `Você é um engenheiro planejador sênior especialista em recuperação de cronogramas de obras.

SITUAÇÃO:
- Obra: ${b.nomeObra ?? 'Não informado'}
- Motivo do atraso: ${b.motivo}
- Descrição do impacto: ${b.descricaoImpacto}
- Dias perdidos: ${b.diasPerdidos}
- Tarefas impactadas: ${b.descricaoTarefas ?? 'Não especificadas'}
- Restrições: ${b.restricoes ?? 'Nenhuma'}

Sugira estratégias de replanejamento priorizando menor custo adicional.
O scheduler calculará as novas datas — sugira apenas as ações.

RESPONDA COM JSON VÁLIDO:

{
  "estrategias": [
    {
      "prioridade": 1,
      "acao": "string",
      "descricao": "string",
      "impacto_custo": "baixo|medio|alto",
      "impacto_qualidade": "nenhum|baixo|medio|alto",
      "dias_recuperados_estimado": 0
    }
  ],
  "recomendacao_principal": "string",
  "alerta": "string"
}`;
}

function promptOtimizar(b: Record<string, unknown>): string {
  return `Você é um especialista em otimização de cronogramas de obras com experiência em crashing e fast-tracking.

Analise a situação abaixo e sugira otimizações para reduzir o prazo total.

OBRA: ${b.nomeObra ?? 'Não informado'}
PRAZO ATUAL: ${b.prazoAtual ?? 0} dias
PRAZO ALVO: ${b.prazoAlvo ?? 0} dias
DESCRIÇÃO DO CRONOGRAMA: ${b.descricaoCronograma ?? 'Não informada'}
RESTRIÇÕES: ${b.restricoes ?? 'Nenhuma'}

REGRAS:
1. Não altere predecessoras que impactam segurança
2. Prefira fast-tracking antes de crashing (menor custo)
3. Identifique paralelismos possíveis
4. Mantenha folga mínima de 2 dias em tarefas não-críticas

RESPONDA COM JSON VÁLIDO:

{
  "otimizacoes": [
    {
      "area_cronograma": "string",
      "acao": "fast-tracking|crashing|paralelismo|reducao-escopo",
      "reducao_dias": 0,
      "justificativa": "string",
      "risco": "baixo|medio|alto",
      "custo_adicional": "baixo|medio|alto"
    }
  ],
  "reducao_total_estimada_dias": 0,
  "novo_prazo_estimado_dias": 0,
  "observacoes": ["string"]
}`;
}

function promptRelatorio(b: Record<string, unknown>): string {
  return `Você é um engenheiro de planejamento responsável pela emissão de relatórios gerenciais de obra.

Gere um relatório executivo em JSON com linguagem técnica e objetiva.

DADOS DA OBRA:
- Nome: ${b.nomeObra ?? 'Não informado'}
- Período: ${b.periodo}
- Avanço Físico: ${b.avancoFisico}%
- Avanço Financeiro: ${b.avancoFinanceiro}%
- Situação geral: ${b.descricaoSituacao ?? 'Não informada'}

RESPONDA COM JSON VÁLIDO:

{
  "relatorio": {
    "titulo": "string",
    "periodo": "string",
    "resumo_executivo": "string",
    "avanco_fisico": 0,
    "avanco_financeiro": 0,
    "desvio_fisico": 0,
    "desvio_financeiro": 0,
    "status_geral": "em_dia|atencao|critico",
    "principais_realizacoes": ["string"],
    "principais_pendencias": ["string"],
    "riscos_identificados": [
      { "descricao": "string", "probabilidade": "baixa|media|alta", "impacto": "baixo|medio|alto" }
    ],
    "acoes_recomendadas": ["string"],
    "projecao_termino": "string"
  }
}`;
}

// ── Log ────────────────────────────────────────────────────────────────────────

async function logInteracao(params: {
  obraId?: string;
  tipo: string;
  prompt: string;
  geminiResult?: { text: string; tokensInput: number; tokensOutput: number; custoUsd: number; duracaoMs: number };
  sucesso: boolean;
  erro?: string;
  authHeader: string;
}): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const client = createClient(supabaseUrl, serviceKey);

    const token = params.authHeader.replace('Bearer ', '');
    const { data: { user } } = await client.auth.getUser(token);

    await client.from('ia_interacoes').insert({
      obra_id:       params.obraId ?? null,
      usuario_id:    user?.id ?? null,
      tipo:          params.tipo,
      prompt:        params.prompt,
      resposta:      params.geminiResult?.text ?? '',
      tokens_input:  params.geminiResult?.tokensInput ?? 0,
      tokens_output: params.geminiResult?.tokensOutput ?? 0,
      custo_usd:     params.geminiResult?.custoUsd ?? 0,
      duracao_ms:    params.geminiResult?.duracaoMs ?? 0,
      sucesso:       params.sucesso,
      erro:          params.erro ?? null,
    });
  } catch (logErr) {
    // Falha no log nunca derruba a operação principal
    console.error('[ia-assistente] Falha ao registrar interação:', (logErr as Error).message);
  }
}

// ── Handler principal ─────────────────────────────────────────────────────────

const CONFIG: Record<string, { modelo: string; temperatura: number; maxTokens?: number }> = {
  'gerar-cronograma': { modelo: 'llama-3.3-70b-versatile', temperatura: 0.2, maxTokens: 8192 },
  'gerar-eap':        { modelo: 'llama-3.3-70b-versatile', temperatura: 0.3 },
  'analisar-atraso':  { modelo: 'llama-3.3-70b-versatile', temperatura: 0.1 },
  'replanejar':       { modelo: 'llama-3.3-70b-versatile', temperatura: 0.2 },
  'otimizar':         { modelo: 'llama-3.3-70b-versatile', temperatura: 0.2 },
  'gerar-relatorio':  { modelo: 'llama-3.3-70b-versatile', temperatura: 0.3, maxTokens: 4096 },
};

const PROMPT_FN: Record<string, (b: Record<string, unknown>) => string> = {
  'gerar-cronograma': promptCronograma,
  'gerar-eap':        promptEap,
  'analisar-atraso':  promptAtraso,
  'replanejar':       promptReplanejar,
  'otimizar':         promptOtimizar,
  'gerar-relatorio':  promptRelatorio,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json() as Record<string, unknown>;
    const tipo = body.tipo as string;
    const obraId = body.obraId as string | undefined;

    const cfg = CONFIG[tipo];
    if (!cfg) {
      return new Response(JSON.stringify({ error: `Tipo desconhecido: ${tipo}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    const prompt = PROMPT_FN[tipo](body);
    let geminiResult;
    let sucesso = true;
    let erroMsg: string | undefined;

    try {
      geminiResult = await callGemini(prompt, cfg.modelo, cfg.temperatura, cfg.maxTokens);
    } catch (err) {
      sucesso = false;
      erroMsg = (err as Error).message;
      await logInteracao({ obraId, tipo, prompt, sucesso, erro: erroMsg, authHeader });
      return new Response(JSON.stringify({ error: erroMsg }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let resultado: unknown;
    try {
      resultado = parseJson(geminiResult.text);
    } catch {
      sucesso = false;
      erroMsg = 'Resposta da IA não é um JSON válido.';
      await logInteracao({ obraId, tipo, prompt, geminiResult, sucesso, erro: erroMsg, authHeader });
      return new Response(JSON.stringify({ error: erroMsg }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await logInteracao({ obraId, tipo, prompt, geminiResult, sucesso, authHeader });

    return new Response(
      JSON.stringify({
        resultado,
        meta: {
          tokensInput:  geminiResult.tokensInput,
          tokensOutput: geminiResult.tokensOutput,
          custoUsd:     geminiResult.custoUsd,
          duracaoMs:    geminiResult.duracaoMs,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
