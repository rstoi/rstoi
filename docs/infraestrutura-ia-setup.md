<img src="assets/setup_logo@hi.png" alt="setup.com.br" height="48">

# Infraestrutura de TI com IA — setup.com.br

> Arquitetura de produtividade aumentada por IA para os profissionais da
> setup.com.br. Integra **PC / notebook / tablet / smartphone / WhatsApp /
> Google Workspace** sob uma camada única de **agentes de IA multimodelo**,
> orquestrados por um **harness loop** (planejar → agir → observar → corrigir),
> conectados ao mundo real por **MCP (Model Context Protocol)**.

Este documento descreve a infraestrutura tal como ela se apoia no que já existe
neste repositório: um servidor MCP de WhatsApp (Baileys para número pessoal /
Cloud API para produção), computer-use, e conectores de Google Workspace
(Gmail, Calendar, Drive) e GitHub. A partir desse núcleo, descrevemos a
infraestrutura corporativa completa.

---

## 1. Princípios

1. **Um cérebro, muitos corpos.** O profissional fala com o mesmo assistente
   no notebook, no celular ou pelo WhatsApp. O contexto — e-mails, agenda,
   arquivos, conversas — acompanha o usuário entre dispositivos.
2. **Multimodelo por tarefa.** Cada tipo de trabalho usa o modelo com a melhor
   relação custo/qualidade/latência (ver §4).
3. **Agentes com loop, não chat de respostas.** O valor está no *harness loop*:
   o agente planeja, executa ferramentas reais, observa o resultado e corrige —
   sem o humano ter que conduzir passo a passo (§5).
4. **MCP como tomada universal.** Toda integração (WhatsApp, Gmail, Drive,
   Calendar, GitHub, ERP, etc.) é exposta como ferramentas MCP padronizadas.
5. **Resiliência por design.** O sistema reconecta, restaura sessão e
   retoma operação automaticamente após falhas — sem intervenção manual (§6).
6. **Segurança e governança por padrão.** Identidade única, permissões mínimas,
   trilha de auditoria, dados corporativos isolados (§8).

---

## 2. Visão geral da arquitetura

```
┌─────────────────────────────────────────────────────────────────────┐
│  CAMADA DE EXPERIÊNCIA                                               │
│  PC/Notebook    Tablet/PWA    Smartphone/PWA    WhatsApp             │
│  (Claude Code,  (revisão,     (captura rápida,  (texto/áudio,       │
│   IDE, desktop)  aprovação)    push, consulta)   atendimento)        │
└───────────────┬─────────────────────────────────────────────────────┘
                │  mesma identidade · mesmo contexto · qualquer tela
┌───────────────▼─────────────────────────────────────────────────────┐
│  CAMADA DE ORQUESTRAÇÃO                                              │
│  • Roteador multimodelo (Haiku → Sonnet → Opus por tarefa)          │
│  • Harness loop  plan → act → observe → reflect                     │
│  • Memória  curto prazo = sessão · longo prazo = base vetorial      │
│  • Catálogo de agentes especializados + sub-agentes em paralelo     │
└───────────────┬─────────────────────────────────────────────────────┘
                │  Model Context Protocol (MCP)
┌───────────────▼─────────────────────────────────────────────────────┐
│  CAMADA DE FERRAMENTAS / CONECTORES (MCP servers)                   │
│  WhatsApp │ Gmail │ Calendar │ Drive │ GitHub │ computer-use │ ERP  │
└───────────────┬─────────────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────────────┐
│  CAMADA DE DADOS E GOVERNANÇA                                        │
│  SSO Google │ Vault/Segredos │ Auditoria │ DLP │ Backup             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Camada de experiência — um assistente em cada tela

| Dispositivo | Como o profissional usa | Stack |
|---|---|---|
| **PC / Notebook** | Assistente de produção: escreve documentos, analisa dados, opera o computador (computer-use), revisa código. | Claude Code + MCPs locais |
| **Tablet** | Revisão, aprovação, leitura de resumos, ditado de tarefas em campo ou reunião. | App/PWA conectado à mesma sessão |
| **Smartphone** | Captura rápida (foto de nota fiscal, áudio de ideia), consulta de agenda, aprovação de ações. | App/PWA + notificações push |
| **WhatsApp** | Canal principal no Brasil: o profissional conversa com o assistente por texto ou áudio; clientes interagem com agentes de atendimento. | MCP WhatsApp (Baileys para número pessoal · Cloud API para produção) |

**Ponto-chave:** independentemente da tela, é o **mesmo agente com o mesmo
contexto**. Pedir pelo WhatsApp "remarca a reunião com o cliente X para quinta"
usa os mesmos conectores (Calendar + Gmail) que o assistente usaria no notebook.

---

## 4. Multimodelo — qual IA para cada trabalho

| Tarefa | Modelo | Justificativa |
|---|---|---|
| Raciocínio complexo, agentes longos, código, análise jurídica/financeira | **Claude Opus 4** | Melhor qualidade em tarefas longas e agênticas |
| Volume do dia a dia: e-mails, resumos, respostas de WhatsApp, planilhas | **Claude Sonnet 4** | Ótimo custo/qualidade, rápido |
| Classificação, roteamento, triagem, alta frequência | **Claude Haiku 4** | Latência mínima e custo baixo |
| Transcrição de áudio (WhatsApp / reuniões) | Speech-to-text | Converte áudio → texto antes do LLM |
| OCR de documentos, notas fiscais, contratos | Modelo de visão | Extrai estrutura de imagens e PDFs |
| Busca semântica em base de conhecimento | Embeddings + base vetorial | RAG sobre documentos da empresa |

> **Regra de roteamento:** comece com Haiku; se a confiança for baixa ou a
> tarefa for crítica, escala para Sonnet; tarefas explicitamente complexas vão
> direto para Opus. Custo reduzido sem sacrificar qualidade onde importa.

---

## 5. O harness loop — agente, não chatbot

Um chatbot responde. Um **agente** opera. O harness loop é o ciclo que faz o
agente entregar trabalho de ponta a ponta:

```
        ┌──────────────────────────────────────────────┐
        │                                              ▼
   [ PLANEJAR ] → [ AGIR (ferramenta MCP) ] → [ OBSERVAR resultado ]
        ▲                                              │
        └─────────── [ REFLETIR / CORRIGIR ] ◀─────────┘
                     (repete até concluir ou escalar ao humano)
```

**Exemplo ponta a ponta — "Fechar proposta para o cliente X":**

1. **Planejar:** interpretar o pedido (mensagem de WhatsApp do vendedor).
2. **Loop agir/observar:**
   - `search_files` no Drive → localiza template de proposta e histórico do cliente.
   - `search_threads` no Gmail → recupera último acordo de preço.
   - Gera proposta (Sonnet/Opus) e cria arquivo (`create_file` no Drive).
   - `suggest_time` + `create_event` no Calendar → agenda reunião de apresentação.
   - `send_message` no WhatsApp → envia resumo + link para o vendedor **aprovar**.
3. **Refletir:** se o vendedor responder "muda prazo para 30 dias", o loop reabre,
   ajusta documento e evento, e confirma.

Tudo sem o profissional sair do WhatsApp.

**Human-in-the-loop:** ações de baixo risco (rascunhar, resumir, buscar) são
automáticas. Ações irreversíveis ou externas (enviar ao cliente, apagar arquivo,
assinar contrato) **exigem aprovação explícita**.

---

## 6. Resiliência

O sistema é projetado para se recuperar automaticamente de falhas de conexão,
reinicializações de container e interrupções de rede — sem intervenção manual.

### 6.1 WhatsApp (Baileys)

**Baileys** gerencia a conexão WebSocket com o WhatsApp Web e implementa
reconexão nativa:

| Situação | Comportamento |
|---|---|
| Queda de rede momentânea | Reconecta automaticamente com backoff exponencial |
| Container reiniciado | Restaura sessão do disco (`data/wa-session/`) — sem novo QR |
| Sessão expirada pelo WhatsApp | Detecta `DisconnectReason.loggedOut`, emite alerta e aguarda novo QR |
| Mensagem não entregue | Baileys mantém fila; reentrega quando a conexão volta |

**Sessão persistida em disco:** a autenticação é salva em `data/wa-session/`
(credenciais criptografadas). Enquanto o WhatsApp não revogar o dispositivo,
nenhum novo QR é necessário após reinicializações.

```
Fluxo de reconexão:
  container sobe → lê data/wa-session/ → Baileys conecta sem QR → MCP disponível
                                ↓ (sessão ausente ou revogada)
                          gera QR → usuário escaneia → sessão salva → MCP disponível
```

### 6.2 SessionStart hook (Claude Code na web)

O ambiente de execução é um container efêmero: a cada sessão, o repo é clonado
do zero. O hook `.claude/hooks/session-start.sh` reconstitui o ambiente
automaticamente:

```
sessão inicia → npm install → pip install -r requirements.txt
             → mkdir -p data → verifica/instala Chromium
             → ambiente pronto, MCPs disponíveis
```

O hook é idempotente e não-interativo; roda apenas no ambiente remoto
(`CLAUDE_CODE_REMOTE=true`).

### 6.3 O que sobrevive ao reboot

| Item | Status | Como |
|---|---|---|
| Código e configuração dos MCP servers | ✅ Persiste | Versionado no Git |
| Dependências Node/Python | ✅ Restaurado | `npm install` / `pip install` no hook |
| Sessão WhatsApp | ✅ Persiste | `data/wa-session/` versionado* |
| Banco SQLite de mensagens | ✅ Persiste | `data/*.db` versionado* |
| Guardrail de grupos bloqueados | ✅ Persiste | `WA_BLOCKED_GROUPS` no `.mcp.json` |
| Segredos e tokens de API | ⚠️ Requer configuração externa | Variáveis de ambiente do environment |
| Chromium (Playwright/computer-use) | ✅ Disponível | Imagem base `/opt/pw-browsers` |

> \* `data/wa-session/` e `data/*.db` devem estar no `.gitignore` em produção.
> Para ambientes cloud efêmeros, use armazenamento externo (ex.: Cloud Storage,
> Secret Manager) ou injete via variável de ambiente.

### 6.4 Guardrails de segurança

- **Grupos bloqueados:** chats listados em `WA_BLOCKED_GROUPS` são filtrados em
  todas as ferramentas MCP — o agente não lê, não responde, não lista.
- **Allowlist de remetentes para `/setup`:** o comando de configuração remota
  só é aceito de contatos autorizados e membros do grupo de administração.
- **Aprovação humana obrigatória:** ações externas/irreversíveis passam por
  confirmação explícita antes de execução.

---

## 7. Catálogo de agentes especializados

| Agente | Função | Conectores MCP principais |
|---|---|---|
| **Assistente Executivo** | Triagem de e-mail, agenda, resumos diários, preparação de reuniões. | Gmail, Calendar, Drive |
| **Atendimento / SDR** | Responde clientes no WhatsApp, qualifica leads, agenda demonstrações. | WhatsApp, sistema comercial |
| **PMO / Projetos** | Atualiza status, gera relatórios, antecipa riscos. | Sistema de projetos, Drive |
| **Contratos** | Gera minutas, acompanha prazos, OCR de documentos. | Sistema de contratos, visão/OCR |
| **Suporte Técnico / Helpdesk** | Abre e resolve chamados, executa runbooks, opera máquinas remotamente. | computer-use, GitHub, ITSM |
| **DevOps / Engenharia** | Revisa PRs, corrige CI, evolui sistemas internos. | GitHub, computer-use |
| **Financeiro** | Concilia, organiza despesas, gera relatórios a partir de notas fiscais. | Sistema financeiro, Drive |

Agentes delegam a **sub-agentes em paralelo** quando necessário — ex.: o
Assistente Executivo dispara simultaneamente "pesquisa de mercado" e "preparar
pauta", e consolida os resultados.

---

## 8. Sistemas internos — integrar e fortalecer

A setup.com.br já opera sistemas internos de **gestão de projetos**, **gestão de
contratos** e **área comercial**. A infraestrutura de IA **não os substitui** —
encapsula cada um como conector MCP e os coloca no alcance dos agentes.

**Integrar (viram conectores MCP):**
- **Projetos:** agente de PMO lê/atualiza status, monta relatórios, antecipa riscos.
- **Contratos:** agente gera minutas, acompanha prazos, aciona renovações.
- **Comercial:** agente de SDR qualifica leads e move o funil automaticamente.

**Fortalecer (a IA cuida da saúde dos sistemas):** o agente de DevOps ajuda a
estabilizar sistemas existentes — testes, revisão de mudanças, documentação —
reduzindo retrabalho e aumentando confiabilidade. O investimento já feito é
**preservado e ampliado**.

---

## 9. Governança e segurança

- **Identidade única (SSO):** login via Google Workspace corporativo. Cada agente
  age *como* o usuário, herdando suas permissões — nunca acima do que o
  profissional já pode acessar.
- **Permissões mínimas e por escopo:** cada MCP server recebe só os escopos
  necessários (Calendar só lê/escreve agenda; Drive só nas pastas autorizadas).
- **Segredos fora do código:** chaves de API e tokens em Vault/Secret Manager.
  Ver `.env.example` — nunca commitar `.env`.
- **Auditoria e trilha:** todo passo do loop (ferramenta, parâmetros, resultado,
  aprovação) é logado para compliance.
- **Isolamento de dados corporativos:** dados da empresa não são usados para
  treinar modelos públicos; preferir provedores com garantia de não retenção.
- **DLP e backup:** prevenção de vazamento em e-mail/WhatsApp e backup dos
  artefatos gerados (Drive como fonte da verdade).

---

## 10. Mapa do repositório

| Componente | Localização no repo |
|---|---|
| MCP WhatsApp (Baileys + Cloud API) | `src/adapters/`, `src/tools/`, `.mcp.json` (`whatsapp-business`) |
| Guardrail de grupos | `src/guard.ts`, `WA_BLOCKED_GROUPS` em `.mcp.json` |
| Autorização de remetentes (`/setup`) | `src/agent-auth.ts` |
| Computer-use | `src/computer-use/`, `.mcp.json` (`computer-use`) |
| Google Workspace (Gmail · Calendar · Drive) | MCP servers conectados na sessão |
| GitHub (DevOps) | MCP `github` na sessão |
| SDK multimodelo | `@anthropic-ai/sdk` — `package.json` |
| Painel de status / observabilidade | `status-dashboard.html`, `status-server.js`, `gen-status.js` |
| SessionStart hook | `.claude/hooks/session-start.sh`, `.claude/settings.json` |
| Geração de documentos | `docs/build_*.py`, `docs/render_pptx.py` |

O **núcleo operacional** (WhatsApp + computer-use + Google Workspace) já está
implementado. O que completa a infraestrutura corporativa são: roteador
multimodelo, catálogo de agentes, memória de longo prazo (RAG) e camada de
governança/SSO.

---

## 11. Roadmap de implantação

**Fase 1 — Fundação**
- SSO com Google Workspace; cofre de segredos.
- MCP servers em produção: WhatsApp (Cloud API), computer-use, Gmail, Calendar,
  Drive, GitHub.
- Sessão Baileys persistida em armazenamento externo (Cloud Storage ou Secret
  Manager).

**Fase 2 — Conectar sistemas existentes**
- Expor projetos, contratos e comercial como conectores MCP.
- Assistente Executivo e Atendimento/SDR com harness loop e aprovação humana.
- Roteador multimodelo (Haiku → Sonnet → Opus).

**Fase 3 — Agentes + conhecimento**
- Base vetorial (RAG) sobre documentos do Drive.
- Agentes de PMO, Contratos, Financeiro, Suporte/DevOps.
- Multidispositivo: PWA mobile/tablet com sessão contínua.

**Fase 4 — Governança e otimização (contínuo)**
- Auditoria completa, DLP, indicadores de produtividade e custo.
- Ajuste fino do roteamento por custo/qualidade/latência.

---

## 12. Indicadores

| Domínio | O que acompanhar |
|---|---|
| **Produtividade** | Tempo poupado por pessoa · retrabalho evitado · tarefas automatizadas |
| **Qualidade** | Consistência dos entregáveis · erros e correções · tempo de primeira resposta |
| **Resiliência** | Uptime do WhatsApp MCP · reconexões automáticas · taxa de falha de entrega |
| **Segurança** | Incidentes com dados · % de ações auditadas · aderência a permissões |

A linha de base é medida na operação real; metas derivam dela — comparações
honestas antes/depois, sobre dados reais.

---

*Documento vivo. Atualize conforme novos conectores MCP e agentes entram em produção.*
