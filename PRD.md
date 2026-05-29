# PRD — Gestão de Obras

**Versão:** 1.1.0 | **Última atualização:** 2026-05-28

## Objetivo

Plataforma centralizada para gerenciamento completo de projetos de construção, com foco em controle de timeline, orçamento, recursos e conformidade. Inicialmente para uso interno; depois, escala para clientes externos.

## Público-alvo

**Fase 1 (Interno)**
- Gerentes de projeto (da empresa)
- Engenheiros e supervisores de obra
- Time de financeiro/controladoria

**Fase 2 (Clientes externos)**
- Proprietários/investidores de obras
- Gestores de portfólio

## Features principais

### Dashboard
Visão 360º de todas as obras: status, atrasos, alertas, progresso físico vs. planejado.

### Cronograma
Planejamento temporal de fases, atividades e marcos. Visualização de caminho crítico e dependências (Gantt interativo).

### Contratos
Registro, versionamento e status de contratos com fornecedores, mão-de-obra e terceirizados.

### Controle de Execução
Acompanhamento diário de atividades, tarefas concluídas, desvios de cronograma, RDO e ocorrências.

### Recursos (Efetivo)
Alocação de pessoal, equipamentos e materiais por obra e fase.

### Medições & Banco de Dados
Registro de quantitativos executados, validação contra contrato e orçamento.

### Orçamentos
Orçamento base, análise de variações, previsão de custos finais (forecast).

### INCC
Correção monetária automática baseada em índices da construção civil.

### Estimativas
Projeção de custos finais, prazos e recursos necessários.

### Resumo & Relatórios
Exportação de dashboards, KPIs e relatórios gerenciais.

### Assistente IA ✨
Análise inteligente de obras via Groq/Llama 3.3 (gratuito). Funcionalidades:
- Geração de cronograma inicial com EAP e predecessoras
- Geração de EAP (Estrutura Analítica do Projeto)
- Diagnóstico de atrasos com estratégias de recuperação
- Sugestões de replanejamento após imprevistos
- Otimização de prazo via fast-tracking e crashing
- Relatório executivo mensal automatizado

> A IA sugere — o engenheiro decide. Nenhuma alteração é aplicada automaticamente ao banco.

## Roadmap

### V1 (MVP — Fase interna)
- ✓ Arquitetura base (React JSX + Vite)
- ✓ Componentes principais implementados
- ✓ Supabase conectado (autenticação + banco de dados)
- ✓ Módulo de IA com Groq/Llama 3.3 via Edge Functions
- [ ] Autenticação robusta (papéis e permissões por obra)
- [ ] Validação de integridade dos dados
- [ ] Testes automatizados (aprendizado)

### V2 (Uso interno consolidado)
- [ ] Persistência completa no Supabase (todos os módulos)
- [ ] Auditoria e permissões por usuário
- [ ] Importação em massa (CSV)
- [ ] Webhooks/integrações externas
- [ ] IA com contexto persistente de obra (histórico de interações)

### V3 (Clientes externos)
- [ ] Multi-tenant
- [ ] Branding customizável por cliente
- [ ] SLA e SLO públicos
- [ ] Suporte ao cliente

## Decisões de design

- **Stack**: React (JSX) + Vite, CSS puro, sem frameworks de UI.
- **Backend**: Supabase (autenticação, banco relacional, Edge Functions).
- **IA**: Groq API (Llama 3.3 70B) via Supabase Edge Function — gratuito, sem exposição de chave no frontend.
- **APIs externas**: Open-Meteo para dados climáticos (sem chave).
- **Foco**: Legibilidade > Otimização. Código é material de aprendizado.
- **Dados**: Mock como fallback; Supabase como fonte primária quando autenticado.

## Métricas de sucesso

- Time interno consegue rastrear 100% de obras sem planilhas auxiliares
- Redução de 30% no tempo de geração de relatórios
- Zero conflitos de informação entre sistemas (fonte única de verdade)
- Clientes conseguem acompanhar obra em tempo real (V3)

## Constraints

- Sem bibliotecas externas de UI sem aprovação (sem Material UI, Tailwind, etc.)
- Código comentado em português
- Foco em aprendizado e manutenibilidade
- Chaves de API nunca expostas no frontend (sempre via Supabase Secrets)
