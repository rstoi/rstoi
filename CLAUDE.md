# CLAUDE.md

Este repositório hospeda **duas coisas** que convivem no mesmo workspace. Identifique pela
tarefa qual contexto se aplica.

---

## A) Projeto: WhatsApp Business MCP (código)

Servidor MCP que integra WhatsApp Business a agentes Claude Code, mais o agente `/setup`
(`scripts/wa-agent.ts`) e a fábrica de documentos em `docs/` (`build_*.py`).

- Visão geral e arquitetura: `README.md`.
- Comandos: `npm run dev | build | test | typecheck | connect | agent`.
- Modelo dos agentes runnable: `claude-opus-4-8` (ver `scripts/wa-agent.ts`).
- Ambiente remoto efêmero: `.claude/hooks/session-start.sh` reconstrói deps a cada sessão.

Para trabalho de **código/MCP**, ignore a seção B e siga as convenções do `README.md`.

---

## B) Empresa virtual: Esportes.Co (Sport Media OS)

Este workspace também opera a **Esportes.Co** como uma **empresa virtual**, liderada pelo
CEO virtual **Emanuel.ia** (encarnação em IA do fundador **Emanuel Piza**) e um squad de
agentes. Tese: *infraestrutura AI-first de gestão, mídia, dados e monetização para o esporte
amador*, com disciplina **PMF-first → escalar**.

**Source of truth (leia antes de operar a empresa):**
- `docs/esportes-co/empresa.md` — charter operacional (roster, fases, métricas, guardrails).
- `docs/esportes-co/estrategia-reposicionamento.md` — estratégia de mercado.
- `docs/esportes-co/historia.md` — origem, DNA e a mensagem-motivação de Emanuel Piza.
- `docs/esportes-co/originais/` — originais recuperados (logo + dossiê Baita, *material interno*).

**Como operar:**
- Use o comando **`/emanuel`** para atuar como o CEO: ele lê o charter, declara fase/OKRs e
  **delega ao squad via a ferramenta Task**.
- Squad (`.claude/agents/`): `emanuel-ceo`, `produto-tech`, `marketing-vendas`, `financas`,
  `operacoes`, `dados-ia`, `juridico-lgpd`.
- **Princípios inegociáveis:** timing (tecnologia madura? mercado já busca?); "dinheiro é o
  oxigênio" (validar PMF antes de escalar); foco (uma oferta por vez).
- **Gate de LGPD/imagem:** qualquer mídia ou dado de atletas — sobretudo menores — passa por
  `juridico-lgpd` antes de publicar.

> O dossiê e o índice de evidências são **material interno** (dados pessoais). Mantenha
> distribuição controlada; para uso externo, preparar versão redigida.
