# PRD — Gestão de Obras

**Versão:** 1.0.0 | **Última atualização:** 2026-05-24

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
Planejamento temporal de fases, atividades e marcos. Visualização de caminho crítico e dependências.

### Contratos
Registro, versionamento e status de contratos com fornecedores, mão-de-obra e terceirizados.

### Controle de Execução
Acompanhamento diário de atividades, tarefas concluídas, desvios de cronograma.

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

## Roadmap

### V1 (MVP — Fase interna)
- ✓ Arquitetura base (React JSX)
- ✓ Componentes principais implementados
- [ ] Autenticação robusta
- [ ] Persistência de dados (backend)
- [ ] Validação de integridade
- [ ] Testes (aprendizado)

### V2 (Uso interno consolidado)
- [ ] API backend
- [ ] Banco de dados
- [ ] Auditoria e permissões
- [ ] Importação em massa (CSV)
- [ ] Webhooks/integrações

### V3 (Clientes externos)
- [ ] Multi-tenant
- [ ] Whitespace/branding customizável
- [ ] SLA e SLO públicos
- [ ] Suporte ao cliente

## Decisões de design

- **Stack**: React (JSX) vanilla, CSS puro, sem frameworks de UI.
- **API externa**: Open-Meteo para contexto (sem chave necessária).
- **Foco**: Legibilidade > Otimização. Código é material de aprendizado.
- **Dados**: Atualmente mock. Backend virá depois.

## Métricas de sucesso

- Time interno consegue rastrear 100% de obras sem planilhas auxiliares
- Redução de 30% no tempo de geração de relatórios
- Zero conflitos de informação entre sistemas (fonte única de verdade)
- Clientes conseguem acompanhar obra em tempo real (V3)

## Constraints

- Sem npm/build system (vanilla)
- Sem bibliotecas externas sem aprovação
- Código comentado em português
- Foco em aprendizado e manutenibilidade
