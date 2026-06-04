-- ============================================================
-- Remove políticas antigas/permissivas que sobrepõem as _own
-- Causa: múltiplas policies com OR — se qualquer uma permite, acesso é concedido
-- ============================================================

-- cronogramas: qualquer autenticado via IS NOT NULL (vaza dados entre usuários)
DROP POLICY IF EXISTS "cronogramas_auth" ON cronogramas;

-- fotos_obra: qualquer autenticado via IS NOT NULL (vaza dados entre usuários)
DROP POLICY IF EXISTS "fotos_auth" ON fotos_obra;

-- obras: duplicatas das _own (mesma condição, mas nomes antigos)
DROP POLICY IF EXISTS "obras_select"  ON obras;
DROP POLICY IF EXISTS "obras_insert"  ON obras;
DROP POLICY IF EXISTS "obras_update"  ON obras;
DROP POLICY IF EXISTS "obras_delete"  ON obras;

-- orcamentos: duplicata via user_owns (ALL, mesma condição)
DROP POLICY IF EXISTS "user_owns" ON orcamentos;

-- orcamento_itens: políticas antigas referenciam user_id que não existe na tabela
-- itens_insert sem qual = qualquer autenticado pode inserir em qualquer orçamento
DROP POLICY IF EXISTS "itens_select"    ON orcamento_itens;
DROP POLICY IF EXISTS "itens_insert"    ON orcamento_itens;
DROP POLICY IF EXISTS "itens_update"    ON orcamento_itens;
DROP POLICY IF EXISTS "itens_delete"    ON orcamento_itens;
DROP POLICY IF EXISTS "user_owns_itens" ON orcamento_itens;

-- ia_interacoes: ia_interacoes_select_own duplica "users see own" (mesma condição)
DROP POLICY IF EXISTS "ia_interacoes_select_own" ON ia_interacoes;

-- estimativas_base: "acesso autenticado" (ALL) duplica as políticas _authed granulares
DROP POLICY IF EXISTS "acesso autenticado" ON estimativas_base;
