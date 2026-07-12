# Gestão de Obras — Soter Engenharia

App interno (React + Vite + Supabase) para gestão de obras: obras, orçamentos, cronograma (Gantt/curva física), comercial e administração.

## Requisitos
- Node 18+ e npm.

## Variáveis de ambiente
Crie um `.env.local` na raiz (não versionar). Baseie-se no `.env.example`:

| Variável | Obrigatória | Descrição |
|---|---|---|
| `VITE_SUPABASE_URL` | sim | URL do projeto Supabase. |
| `VITE_SUPABASE_ANON_KEY` | sim | Chave anon (pública, vai ao bundle). A segurança depende do RLS, não do sigilo desta chave. |

Sem essas variáveis o app mostra uma tela de "Aplicação não configurada" no boot (guard em `src/services/supabase.js`), em vez de tela branca.

Variáveis usadas só nos testes de segurança (ver abaixo): `TEST_USER_A_EMAIL`, `TEST_USER_A_PASS`, `TEST_USER_B_EMAIL`, `TEST_USER_B_PASS`.

Segredos server-side (nunca no front): `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY` etc. ficam em Supabase Secrets, usados só pelas Edge Functions.

## Scripts
- `npm run dev` — servidor de desenvolvimento (http://localhost:5173).
- `npm run build` — build de produção em `dist/`.
- `npm run preview` — serve o build localmente.
- `npm test` — testes unitários (vitest, ambiente node).
- `npm run test:watch` — testes em modo watch.
- `npm run test:security` — testes de RLS/segurança contra o Supabase real (exige as `TEST_USER_*` + `VITE_SUPABASE_*`).

## Testes
Unitários ficam em `src/__tests__/*.test.js` e rodam em node (funções puras). O teste de integração de segurança (`security.test.js`) é excluído do `npm test` padrão porque precisa de credenciais e rede; rode-o com `npm run test:security`.
Ao adicionar uma funcionalidade nova, adicione/atualize o teste correspondente.

## Deploy (Vercel)
1. Conectar o repositório GitHub ao projeto na Vercel (a stack padrão da empresa).
2. Configurar `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` nas Environment Variables do projeto na Vercel.
3. Build command `npm run build`, output `dist/` (padrão Vite). O `vercel.json` já define o rewrite de SPA e headers de segurança.
4. TODO: definir uma Content-Security-Policy no `vercel.json`/painel, liberando `connect-src` para o domínio do Supabase (REST + Storage + Realtime). Não foi incluída por padrão para não quebrar a conexão antes de ser afinada.

## Backend (Supabase)
- Tabelas e RLS versionadas em `supabase/migrations/`. Aplicar novas migrations no projeto de produção (SQL Editor ou Supabase CLI) antes de publicar código que dependa delas.
- Edge Functions em `supabase/functions/` (deploy via `supabase functions deploy <nome>`).
