# Baita Financial Intelligence OS

Plataforma de diagnóstico financeiro empresarial contínuo, com agentes de IA (modo regra-a-regra), governança, desenvolvimento organizacional e melhoria contínua — para empresas B2B de serviços técnicos, engenharia, automação e operações complexas.

> MVP robusto e extensível: fundações reais de dados, serviços, agentes e telas — não um protótipo visual.

## Sumário

- [Instalação](#instalação)
- [Uso](#uso)
- [Arquitetura](#arquitetura)
- [Modelo de dados](#modelo-de-dados)
- [Agentes de IA](#agentes-de-ia)
- [Regras de rating de confiabilidade](#regras-de-rating-de-confiabilidade)
- [Relatórios](#relatórios)
- [Segurança e auditoria](#segurança-e-auditoria)
- [Dados demo](#dados-demo)
- [Funcionalidades implementadas](#funcionalidades-implementadas)
- [Pendências / próximos passos](#pendências--próximos-passos)

## Instalação

Pré-requisitos: Node.js 20+, PostgreSQL 14+.

```bash
cd apps/baita
npm install

# configurar variáveis de ambiente
cp .env.example .env
# edite .env com a connection string do seu Postgres (DATABASE_URL)

# criar schema no banco
npm run db:migrate

# gerar dados demo (empresa "Setup Automação Demo")
npm run db:seed
```

### Comandos

| Comando | Descrição |
|---|---|
| `npm run dev` | Sobe o servidor Next.js em modo desenvolvimento |
| `npm run build` | Build de produção |
| `npm start` | Roda o build de produção |
| `npm run lint` | ESLint |
| `npm test` | Testes unitários (Vitest) |
| `npm run db:migrate` | Aplica migrations Prisma |
| `npm run db:generate` | Gera o Prisma Client |
| `npm run db:seed` | Popula a empresa demo (idempotente — remove e recria) |
| `npm run db:reset` | Reseta o banco e roda seed |

### Login demo

Após rodar o seed:

| Usuário | Papel | Senha |
|---|---|---|
| `admin@baita.ai` | Administrador (acesso irrestrito) | `baita123` |
| `consultor@baita.ai` | Consultor Baita (acesso irrestrito) | `baita123` |
| `enrique@setupautomacao.com.br` | Diretor da empresa demo (acesso restrito a essa empresa) | `baita123` |

## Uso

1. Login em `/login`.
2. `/empresas` — cadastrar uma nova empresa (dispara onboarding: cria os 7 ciclos de implantação e sugere checklist mínimo de fontes).
3. Dentro da empresa: cadastrar **Pessoas**, **Fontes de Dados**, fazer **Upload de Arquivos** (CSV, XLSX, JSON, TXT, OFX, XML de NF-e — PDF fica marcado para revisão manual no MVP).
4. Processar arquivos enviados → gera eventos financeiros brutos.
5. Em **Base Financeira**: classificar eventos (ou rodar o agente de classificação), marcar duplicados/transferências, ajustar rating.
6. Gerar **DRE Gerencial** por período.
7. Consultar **Situação Financeira** (caixa livre/comprometido, capital de giro, runway, classificação da situação).
8. Gerar **Forecast** (30 dias e mensal até dezembro) nos 3 cenários.
9. Registrar **Recomendações** e **Decisões**.
10. Rodar **Backtesting** contra um forecast anterior.
11. Acompanhar **PDCA e Melhoria Contínua**.
12. **Governança**: rituais, atas, avaliação de maturidade da diretoria (8 dimensões).
13. **Desenvolvimento Organizacional**: estágio Adizes e escada de maturidade de sistemas (níveis 0 a 5).
14. **Pessoas**: perfil humano, confiabilidade por tema, mensagens acionáveis geradas automaticamente.
15. **Relatórios**: gerar HTML executivo e exportar PDF.
16. **Auditoria**: trilha completa de mudanças (manuais e por agente).

## Arquitetura

Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + Prisma 7 (driver adapter `@prisma/adapter-pg`) + PostgreSQL.

```
apps/baita/
├── prisma/
│   ├── schema.prisma        # modelo de dados completo (40+ modelos)
│   └── seed.ts               # dados demo sintéticos
├── src/
│   ├── app/                  # rotas (App Router)
│   │   ├── (auth)/login/     # login (server action)
│   │   ├── empresas/         # lista de empresas + onboarding
│   │   │   └── [companyId]/  # todas as telas por empresa (dashboard, DRE, forecast, ...)
│   │   └── api/               # route handlers (upload de arquivos, relatório HTML/PDF)
│   ├── agents/                # 22 agentes de IA (rule-based por padrão)
│   ├── lib/                   # serviços centrais (rating, DRE, forecast, tesouraria, ...)
│   ├── reports/                # templates HTML dos relatórios executivos
│   ├── components/            # UI (cards, badges, sidebar, gráficos Recharts)
│   └── proxy.ts                # gate leve de autenticação (Next.js 16 renomeou middleware → proxy)
```

### Camadas e por que existem

- **`src/lib/*-service.ts`** — cálculos financeiros e de maturidade centralizados (DRE, forecast, tesouraria, backtesting, rating, avaliação de diretoria, desenvolvimento organizacional, dedup, conciliação). Puros, testáveis, sem I/O — usados tanto pelos agentes quanto pelos testes unitários.
- **`src/agents/*`** — cada agente estende `BaseAgent` (nome, versão, descrição, `run()`, confiança, warnings/erros, modo determinístico, auditoria automática). Os agentes fazem a orquestração (leem/escrevem no banco) e delegam o cálculo aos serviços.
- **`src/lib/llm-provider.ts`** — abstração `LLMProvider`. Sem `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` configurada, todos os agentes operam 100% em modo regra-a-regra (determinístico). A integração real com um provedor de LLM é um ponto de extensão futuro, não uma dependência do MVP.
- **`src/lib/file-storage.ts`** — abstração `FileStorageService`. Implementação atual: disco local (`FILE_STORAGE_DIR`). Trocar por S3/GCS/Drive não exige mudança nos chamadores.
- **`src/lib/auth.ts`** — sessão via cookie httpOnly + hash SHA-256 armazenado (não a sessão em si), senha com bcrypt. RBAC: papéis "globais" (`ADMIN`, `CONSULTANT`, `AUDITOR`) acessam qualquer empresa; os demais papéis exigem vínculo explícito via `CompanyUserAccess` (isolamento por empresa).
- **`src/proxy.ts`** — Next.js 16 renomeou `middleware.ts` para `proxy.ts`. Faz apenas um redirecionamento leve baseado na presença do cookie de sessão; a validação real (sessão + RBAC por empresa) acontece em `requireUser()`/`requireCompanyAccess()` dentro de cada página/route handler/server action — nunca apenas no proxy.
- **Server Actions** — toda mutação (criar empresa, classificar evento, gerar DRE, etc.) é uma Server Action colocada em `actions.ts` ao lado da página, sempre chamando `requireCompanyAccess()` e `recordAudit()`.

## Modelo de dados

Schema Prisma completo em `prisma/schema.prisma`, cobrindo:

Empresa, ciclo de implantação, pessoa (+ confiabilidade por tema), fonte de dados, arquivo enviado, documento extraído, evento financeiro canônico, categoria gerencial (plano de contas), contas a receber/pagar, dívidas, impostos, DRE (+ itens), conciliação, forecast (+ linhas), recomendação, decisão, backtesting (+ linhas), PDCA, ação de melhoria, ritual de governança, ata de reunião, avaliação de diretoria (+ itens), interação humana, log de auditoria, relatório, usuário/sessão/acesso por empresa.

Todos os enums do domínio (papéis, estágio de carreira, estágio Adizes, tipo de fonte, status de processamento, tipo/linha de evento financeiro, rating de confiabilidade, cenário de forecast, área/urgência de recomendação, etc.) seguem exatamente o vocabulário do diagnóstico financeiro Baita.

## Agentes de IA

Todos em `src/agents/`, estendendo `BaseAgent<TInput, TOutput>`:

| Agente | Responsabilidade |
|---|---|
| `OrchestratorAgent` | Decide o próximo ciclo de implantação e ações pendentes |
| `CollectorAgent` | Mapeia fontes disponíveis x checklist mínimo |
| `ExtractorAgent` | Extrai dados brutos (CSV, XLSX, JSON, TXT, OFX, XML de NF-e; PDF fica para revisão manual) |
| `NormalizerAgent` | Padroniza datas, valores, contrapartes e descrições |
| `DeduplicatorAgent` | Detecta eventos duplicados (valor + contraparte + data próxima, ou mesmo documento) |
| `ClassifierAgent` | Classifica eventos no plano de contas gerencial via palavras-chave |
| `ReconciliationAgent` | Concilia eventos entre fontes (banco x nota, ERP x banco, etc.) |
| `QualityAuditorAgent` | Atribui rating de confiabilidade a cada evento |
| `DREAgent` | Gera o DRE gerencial de um período |
| `TreasuryAgent` | Calcula caixa livre/comprometido, capital de giro, risco de liquidez |
| `ForecastAgent` | Gera fluxo diário (30d) e mensal (até dezembro) por cenário |
| `BacktestingAgent` | Compara forecast anterior x realizado |
| `BenchmarkAgent` | Compara indicadores contra faixas de referência por setor |
| `ReportAgent` | Monta os relatórios executivos HTML |
| `ControllerAgent` | Consolida alertas (pendências, atrasos, riscos) |
| `HumanProfileAgent` | Perfil operacional da pessoa e abordagem recomendada |
| `ActionableMessageAgent` | Gera mensagens curtas e acionáveis adaptadas por pessoa |
| `CadenceAgent` | Evita sobrecarga de interação por pessoa |
| `GovernanceAgent` | Acompanha saúde dos rituais de governança |
| `DirectorEvaluationAgent` | Avaliação de maturidade da diretoria (8 dimensões) |
| `OrganizationalDevelopmentAgent` | Estágio Adizes + próximo sistema gerencial |
| `ContinuousImprovementAgent` | Estrutura ciclos PDCA e ações corretivas/preventivas |

Todos operam em **modo determinístico (rule-based)** por padrão. Definir `LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` no `.env` é o ponto de extensão para IA generativa real (não implementado neste MVP para não introduzir dependência externa obrigatória).

## Regras de rating de confiabilidade

Centralizadas em `src/lib/rating-service.ts` (`calculateReliabilityRating`, `checkRatingForDecision`, `ratingForecastInclusion`):

- **A**: 2+ fontes fortes, ou extrato bancário conciliado, ou guia paga + comprovante, ou NF conciliada com recebimento.
- **B**: 1 fonte forte — NF emitida sem recebimento, extrato identificado, contrato formal sem liquidação.
- **C**: plausível mas incompleto — ERP sem conciliação, e-mail com boleto sem pagamento.
- **D**: informal — WhatsApp, áudio, promessa verbal, hipótese comercial.
- **E**: contraditório entre fontes.
- **UNKNOWN**: não avaliado.

Regras de uso por decisão (`checkRatingForDecision`): pagamento crítico/crédito/investimento exigem A ou B; corte estrutural exige B com revisão humana; renegociação aceita B/C; hipótese comercial aceita C/D fora do cenário conservador.

Regras de inclusão em forecast (`ratingForecastInclusion`): conservador não inclui D; base inclui C com desconto de 50% de probabilidade; otimista inclui C integralmente e D com peso reduzido (30%).

## Relatórios

`src/agents/report-agent.ts` + `src/reports/shell.ts` geram 5 relatórios HTML print-friendly com capa executiva Baita (roxo/azul profundo/magenta):

1. Diagnóstico Financeiro Executivo
2. Relatório Semanal de Tesouraria
3. Relatório Mensal Financeiro
4. Relatório de Governança e Diretoria
5. Relatório de Auditoria

Exportação para PDF via Playwright/Chromium (`/api/empresas/[companyId]/relatorios/[reportId]/pdf`). Toda conclusão inclui fonte, período, rating e limitação — nunca esconde a incerteza.

## Segurança e auditoria

- Isolamento por empresa via `CompanyUserAccess` — papéis não-globais só acessam empresas explicitamente vinculadas.
- Toda mutação relevante (manual ou por agente) grava um `AuditLog` (ator, agente, ação, entidade, antes/depois, racional).
- Nenhum dado bruto é excluído fisicamente por ações de usuário nas telas do MVP (eventos são marcados `isDuplicate`/`needsReview`, nunca deletados).
- Senhas com bcrypt; sessão via token opaco (hash SHA-256 armazenado, nunca o token em si).

## Dados demo

`npm run db:seed` cria a empresa **Setup Automação Demo** com:

- Pessoas: Enrique (CEO/diretor), William (operações), Gerson (comercial), Tânia (tesouraria), Contabilidade externa, Consultor Baita — cada um com perfil, canal preferido e estágio de carreira distintos.
- 9 fontes de dados, plano de contas gerencial com 13 categorias.
- ~130 eventos financeiros sintéticos (4 meses de competência + caixa realizado via extrato), incluindo casos propositais de duplicata e evento pendente de revisão.
- Contas a receber/pagar, dívidas, impostos.
- DRE dos últimos 4 meses, forecasts (3 cenários x 2 horizontes), 1 backtesting histórico.
- Recomendações, decisões, PDCA, rituais de governança + atas, avaliação de diretoria completa, estágio Adizes, mensagens acionáveis, 1 relatório executivo gerado.

Todos os dados são sintéticos — nenhuma informação real ou sensível é usada.

## Funcionalidades implementadas

Todos os 24 critérios de aceite do MVP foram verificados manualmente (login, navegação por todas as telas, geração de DRE/forecast/backtesting/relatório/PDF) com o servidor de desenvolvimento rodando:

1. ✅ Cadastro de empresa (com onboarding automático de ciclos)
2. ✅ Cadastro de pessoas e perfis
3. ✅ Cadastro de fontes de dados
4. ✅ Upload de arquivos (multipart, Route Handler dedicado)
5. ✅ Criação de eventos financeiros estruturados (extração + normalização)
6. ✅ Classificação de eventos (manual e via `ClassifierAgent`)
7. ✅ Atribuição de rating (manual e via `QualityAuditorAgent`)
8. ✅ Geração de DRE
9. ✅ Situação financeira atual
10. ✅ Forecast 30 dias
11. ✅ Cenários (conservador/base/otimista)
12. ✅ Recomendações
13. ✅ Registro de decisões
14. ✅ Backtesting
15. ✅ PDCA
16. ✅ Avaliação de diretoria (8 dimensões)
17. ✅ Avaliação de estágio Adizes
18. ✅ Mensagens adaptadas por pessoa
19. ✅ Relatório executivo HTML
20. ✅ Exportação PDF (Playwright)
21. ✅ Trilha de auditoria
22. ✅ Dados demo funcionais
23. ✅ README (este arquivo)
24. ✅ Testes básicos (47 testes Vitest cobrindo os 8 serviços centrais)

## Pendências / próximos passos

- **Integração real de LLM**: hoje 100% rule-based; `LLMProvider` está pronto para receber uma implementação Anthropic/OpenAI real.
- **Extração de PDF**: no MVP, PDFs são marcados para revisão manual (sem OCR/parsing de texto real).
- **Autenticação**: sessão simples por cookie; não há SSO, 2FA ou recuperação de senha.
- **Armazenamento de arquivos**: local em disco; `FileStorageService` está pronto para um adapter S3/GCS/Drive.
- **Benchmarking**: faixas de referência por setor são ilustrativas/manuais (`BenchmarkAgent`); não há base de benchmarks reais.
- **Testes de integração/E2E automatizados**: a verificação end-to-end foi feita manualmente via Playwright neste ciclo; não há suíte de testes E2E versionada no repositório.
- **Base financeira**: paginação simples (últimos 100 eventos); falta paginação real para históricos muito grandes.
- **OKRs**: modelagem de rituais/atas cobre governança, mas não há um modelo dedicado de OKR (hoje registrado em texto livre nas atas).

## Observações de segurança

Este é um MVP funcional, não um produto hardened para produção. Antes de operar com dados reais de clientes:
- Trocar `AUTH_SECRET`/senhas demo, revisar política de expiração de sessão.
- Adicionar rate limiting ao login e aos endpoints de upload.
- Revisar limites de tamanho de upload e sanitização de nomes de arquivo (já normalizados, mas vale auditoria adicional).
- Configurar HTTPS/cookies `secure` em produção (já condicionado a `NODE_ENV=production`).
- Avaliar LGPD/retenção de dados antes de armazenar CNPJ/documentos reais.
