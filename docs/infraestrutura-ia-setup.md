# Infraestrutura de TI com IA — setup.com.br

> Arquitetura de produtividade aumentada por IA para os profissionais da
> setup.com.br. Integra **PC / notebook / tablet / smartphone / WhatsApp /
> Google Workspace** sob uma camada única de **agentes de IA multimodelo**,
> orquestrados por um **harness loop** (planejar → agir → observar → corrigir),
> conectados ao mundo real por **MCP (Model Context Protocol)**.

Este documento descreve a infraestrutura tal como ela se apoia no que já existe
neste repositório: um servidor MCP de WhatsApp (Playwright/Cloud API),
computer-use, e conectores de Google Workspace (Gmail, Calendar, Drive) e
GitHub. A partir desse núcleo, descrevemos a infraestrutura corporativa
completa.

---

## 1. Princípios

1. **Um cérebro, muitos corpos.** O profissional fala com o mesmo "assistente"
   no notebook, no celular ou pelo WhatsApp. O contexto (e-mails, agenda,
   arquivos, conversas) acompanha o usuário entre dispositivos.
2. **Multimodelo por tarefa, não por moda.** Cada tipo de trabalho usa o modelo
   com a melhor relação custo/qualidade/latência (ver §4).
3. **Agentes com loop, não chat de respostas.** O valor está no *harness loop*:
   o agente planeja, executa ferramentas reais, observa o resultado e corrige —
   sem o humano ter que conduzir passo a passo (§5).
4. **MCP como tomada universal.** Toda integração (WhatsApp, Gmail, Drive,
   Calendar, GitHub, ERP, etc.) é exposta como ferramentas MCP padronizadas.
5. **Segurança e governança por padrão.** Identidade única, permissões mínimas,
   trilha de auditoria, dados corporativos isolados (§7).

---

## 2. Visão geral da arquitetura

```
┌─────────────────────────────────────────────────────────────────────┐
│  CAMADA DE EXPERIÊNCIA (onde o profissional interage)                 │
│  PC/Notebook    Tablet    Smartphone    WhatsApp    Chat web/Slack    │
│  (Claude Code,  (app/PWA) (app/PWA)     (texto/áudio)                  │
│   IDE, desktop)                                                        │
└───────────────┬───────────────────────────────────────────────────────┘
                │  (mesma identidade, mesmo contexto)
┌───────────────▼───────────────────────────────────────────────────────┐
│  CAMADA DE ORQUESTRAÇÃO — "o cérebro"                                   │
│  • Roteador multimodelo (escolhe o modelo por tarefa)                   │
│  • Harness loop (plan → act → observe → reflect)                        │
│  • Memória (curto prazo = sessão; longo prazo = base vetorial)          │
│  • Catálogo de agentes especializados + sub-agentes                     │
└───────────────┬───────────────────────────────────────────────────────┘
                │  Model Context Protocol (MCP)
┌───────────────▼───────────────────────────────────────────────────────┐
│  CAMADA DE FERRAMENTAS / CONECTORES (MCP servers)                       │
│  WhatsApp │ Gmail │ Calendar │ Drive │ GitHub │ computer-use │ ERP/CRM  │
│  (já no repo)        (Google Workspace corporativo)                     │
└───────────────┬───────────────────────────────────────────────────────┘
                │
┌───────────────▼───────────────────────────────────────────────────────┐
│  CAMADA DE DADOS E GOVERNANÇA                                           │
│  Identidade (SSO/Google)│ Segredos/Vault │ Auditoria │ DLP/Backup       │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 3. Camada de experiência — um assistente em cada tela

| Dispositivo | Como o profissional usa | Stack |
|---|---|---|
| **PC / Notebook** | Assistente "de produção": escreve documentos, planilhas, código, automações, analisa dados, opera o computador (computer-use). | Claude Code / app desktop + MCPs locais |
| **Tablet** | Revisão, aprovação, leitura de resumos, ditado de tarefas em campo/reunião. | App/PWA conectado à mesma sessão |
| **Smartphone** | Captura rápida (foto de nota fiscal, áudio de ideia), consulta de agenda/e-mail, aprovação de ações. | App/PWA + push |
| **WhatsApp** | Canal mais natural no Brasil: o profissional **conversa** com o assistente por texto ou áudio; clientes também falam com agentes de atendimento. | **MCP WhatsApp deste repo** (Playwright para número pessoal / Cloud API para produção) |
| **Chat web / IDE / Slack** | Trabalho técnico, suporte, "copiloto" interno. | Claude Code / integrações |

**Ponto-chave:** independentemente da tela, é o **mesmo agente com o mesmo
contexto**. Pedir pelo WhatsApp "remarca a reunião com o cliente X para
quinta" usa os mesmos conectores (Calendar + Gmail) que o assistente usaria no
notebook.

---

## 4. Multimodelo — qual IA para cada trabalho

O roteador escolhe o modelo por tarefa. Recomendação de mapeamento (padrão
Claude como família principal, com modelos especializados onde fizer sentido):

| Tarefa | Modelo recomendado | Por quê |
|---|---|---|
| Raciocínio complexo, agentes longos, código, análise jurídica/financeira | **Claude Opus 4.x** (mais capaz) | Melhor qualidade em tarefas longas e agênticas |
| Volume do dia a dia: e-mails, resumos, respostas de WhatsApp, planilhas | **Claude Sonnet 4.x** | Ótimo custo/qualidade, rápido |
| Tarefas triviais, classificação, roteamento, alta frequência | **Claude Haiku 4.x** | Latência mínima e baixo custo |
| Transcrição de áudio (WhatsApp/reuniões) | Modelo de **speech-to-text** | Áudio → texto antes do LLM |
| Geração/edição de imagem, OCR de documentos | Modelo de **visão/imagem** | Nota fiscal, contrato escaneado, design |
| Busca semântica em base de conhecimento | Modelo de **embeddings** + base vetorial | RAG sobre documentos da empresa |

> Regra prática de roteamento: **comece barato e escale só se necessário.**
> Haiku classifica e tenta; se a confiança for baixa ou a tarefa for crítica,
> escala para Sonnet; tarefas explicitamente complexas vão direto para Opus.
> Isso reduz custo sem sacrificar qualidade nas tarefas que importam.

---

## 5. O harness loop — por que isso é "agente" e não "chatbot"

Um chatbot responde. Um **agente** opera. O harness loop é o ciclo que faz o
agente entregar trabalho de ponta a ponta:

```
        ┌─────────────────────────────────────────────┐
        │                                             ▼
   [ PLANEJAR ] → [ AGIR (chamar ferramenta MCP) ] → [ OBSERVAR resultado ]
        ▲                                             │
        │                                             ▼
        └──────────────── [ REFLETIR / CORRIGIR ] ◀───┘
                          (repete até concluir ou pedir ajuda ao humano)
```

Exemplo real ponta a ponta — **"Fechamento de proposta para o cliente X"**:

1. **Planejar:** entender o pedido (vindo do WhatsApp do vendedor).
2. **Agir/Observar (loop):**
   - `search_files` no **Drive** → acha o template de proposta e o histórico do
     cliente.
   - `search_threads` no **Gmail** → recupera o último acordo de preço.
   - Gera a proposta (modelo Sonnet/Opus) e cria o arquivo (`create_file` no
     Drive).
   - `suggest_time` + `create_event` no **Calendar** → agenda a reunião de
     apresentação.
   - `send_message` no **WhatsApp** → manda o resumo + link para o vendedor
     **aprovar** (humano no loop).
3. **Refletir:** se o vendedor responder "muda o prazo para 30 dias", o loop
   reabre, ajusta o documento e o evento, e confirma.

Tudo isso sem o profissional sair do WhatsApp. O loop, os modelos e os
conectores estão na infraestrutura — o humano só decide e aprova.

**Pontos de controle humano (human-in-the-loop):** ações de baixo risco
(rascunhar, resumir, buscar) são automáticas; ações externas/irreversíveis
(enviar e-mail ao cliente, apagar arquivo, mexer em contrato) **exigem
aprovação** explícita do profissional.

---

## 6. Catálogo de agentes especializados

Em vez de um agente genérico, a empresa mantém um catálogo de agentes com
escopos e permissões definidos. Cada um usa o harness loop e o roteador
multimodelo.

| Agente | Função | Conectores MCP principais |
|---|---|---|
| **Assistente Executivo** | Triagem de e-mail, agenda, resumos diários, preparação de reuniões. | Gmail, Calendar, Drive |
| **Atendimento / SDR** | Responde clientes no WhatsApp, qualifica leads, agenda demos. | WhatsApp, sist. Comercial |
| **PMO / Projetos** | Atualiza status, gera relatórios e antecipa riscos nos projetos. | sist. Projetos, Drive |
| **Contratos** | Gera/organiza contratos, acompanha prazos, OCR de documentos. | sist. Contratos, visão/OCR |
| **Suporte Técnico / IT Helpdesk** | Abre/resolve chamados, executa runbooks, opera máquinas. | computer-use, GitHub, ITSM |
| **DevOps / Engenharia** | Revisa PRs, corrige CI, evolui os sistemas internos. | GitHub, computer-use |
| **Financeiro** | Concilia, organiza despesas, gera relatórios a partir de notas. | sist. Contratos, ERP |

Agentes podem **delegar a sub-agentes** (fan-out): ex., o Assistente Executivo
dispara em paralelo um sub-agente "pesquisa de mercado" e outro "preparar pauta"
e consolida o resultado.

---

## 7. Sistemas internos existentes — integrar e fortalecer

A setup.com.br já desenvolveu, de forma ágil (**vibe coding**), sistemas internos
que sustentam a operação: **gestão de projetos**, **gestão de contratos** e a
**área comercial**. A nova infraestrutura **não os substitui** — ela os encapsula
como conectores MCP e os coloca no alcance dos agentes.

**Integrar — viram conectores dos agentes:**
- **Gestão de Projetos:** o agente de PMO lê/atualiza status, monta relatórios e
  antecipa riscos.
- **Gestão de Contratos:** o agente de Contratos gera minutas, acompanha prazos e
  aciona renovações.
- **Comercial:** o agente de Atendimento/SDR qualifica leads e move o funil no
  próprio sistema comercial.

**Fortalecer — a IA cuida da saúde desses sistemas:** sistemas nascidos em vibe
coding entregam valor rápido, mas tendem a acumular dívida técnica. O agente de
DevOps ajuda a estabilizá-los (testes, revisão de alterações, documentação),
reduzindo retrabalho e aumentando a confiabilidade. O investimento já feito é
**preservado e ampliado, não descartado**.

---

## 8. Pessoas no centro — clima, segurança psicológica e condições de trabalho

Tecnologia só compensa se melhora a vida de quem trabalha. O maior efeito desta
infraestrutura não é a automação em si, mas o que ela faz pelas pessoas: tira o
trabalho repetitivo e penoso e devolve **tempo, energia e tranquilidade**.

**Melhores condições de trabalho:**
- **Menos trabalho braçal:** a IA assume triagem de e-mail, atualização de status
  e montagem de documentos — menos sobrecarga e menos horas extras.
- **Flexibilidade:** o mesmo assistente no WhatsApp e no celular reduz fricção e
  apoia o equilíbrio entre vida e trabalho.
- **Apoio constante:** um mentor sempre disponível nivela o jogo — juniores
  entregam com mais confiança.

**Mais segurança psicológica** (ambiente em que as pessoas se sentem seguras para
propor, pedir ajuda e errar sem medo de exposição):
- **Tirar dúvidas sem julgamento:** dá para perguntar à IA quantas vezes for
  preciso, sem o constrangimento de "perguntar besteira".
- **O erro fica no rascunho:** tudo passa por rascunho revisável e aprovação
  humana — erra-se no rascunho, não na frente do cliente.
- **Aumenta, não vigia:** a IA aumenta as pessoas; **não** as vigia nem mede
  desempenho individual. O controle das decisões é sempre humano.

> **Efeito no clima:** equipes menos sobrecarregadas e mais confiantes colaboram
> melhor, retêm talentos e atendem clientes com mais qualidade. A IA passa a ser
> vista como **aliada do profissional**, não como ameaça ao seu trabalho.

---

## 9. Camada de dados e governança (não-negociável)

- **Identidade única (SSO):** login via **Google Workspace corporativo**. Cada
  agente age *como* o usuário, herdando suas permissões — nunca mais do que o
  profissional já pode acessar.
- **Permissões mínimas e por escopo:** cada MCP server recebe só os escopos
  necessários (ex.: Calendar só lê/escreve agenda; Drive só nas pastas
  autorizadas).
- **Aprovação para ações externas:** envio a clientes, exclusões e alterações
  irreversíveis passam por confirmação (espelha o modo de permissão do harness).
- **Segredos fora do código:** chaves de API e tokens em **Vault/Secret
  Manager** (neste repo, ver `.env.example` — nunca commitar `.env`).
- **Auditoria e trilha:** todo passo do loop (ferramenta chamada, parâmetros,
  resultado, aprovação) é logado para compliance.
- **Isolamento de dados corporativos:** dados da empresa não são usados para
  treinar modelos públicos; preferir provedores/ambientes com garantia de não
  retenção.
- **DLP e backup:** prevenção de vazamento em e-mail/WhatsApp e backup dos
  artefatos gerados (Drive como fonte da verdade).

---

## 10. Como isto se conecta ao que já existe no repositório

| Componente da infraestrutura | Onde está no repo |
|---|---|
| Conector WhatsApp (pessoal Playwright + Cloud API de produção) | `src/adapters/`, `src/tools/`, `.mcp.json` (`whatsapp-business`) |
| Operar o computador (computer-use) | `src/computer-use/`, `.mcp.json` (`computer-use`) |
| Google Workspace — Gmail, Calendar, Drive | MCP servers conectados na sessão (Gmail/Calendar/Drive) |
| GitHub (DevOps) | MCP `github` |
| Multimodelo (Opus/Sonnet/Haiku) | `@anthropic-ai/sdk` em `package.json` |
| Painel de status/observabilidade | `status-dashboard.html`, `status-server.js`, `gen-status.js` |

Ou seja: o **núcleo do WhatsApp + computer-use + Workspace** deste repositório
já é a camada de ferramentas (MCP) da arquitetura. O que falta para a
infraestrutura completa é, principalmente, **roteador multimodelo, catálogo de
agentes, memória de longo prazo (RAG) e a camada de governança/SSO**.

---

## 11. Roadmap de implantação (faseado)

**Fase 1 — Fundação**
- SSO com Google Workspace; cofre de segredos.
- Subir os MCP servers já existentes (WhatsApp, computer-use, Gmail, Calendar,
  Drive, GitHub) em ambiente corporativo.

**Fase 2 — Conectar o que já existe**
- Expor gestão de projetos, contratos e comercial como conectores MCP.
- Assistente Executivo e Atendimento; harness loop com aprovação humana.
- Roteador multimodelo (Haiku→Sonnet→Opus).

**Fase 3 — Agentes + conhecimento**
- Base vetorial (RAG) sobre documentos do Drive.
- Agentes de PMO, Contratos, Financeiro, Suporte/DevOps.
- Multidispositivo (PWA mobile/tablet) com sessão contínua.

**Fase 4 — Governança e otimização (contínuo)**
- Auditoria completa, DLP, indicadores de produtividade, clima e custo.
- Ajuste fino do roteamento de modelos por custo/qualidade.

---

## 12. Framework de indicadores (medidos, não presumidos)

Mede-se produtividade, qualidade e — em pé de igualdade — o **bem-estar das
equipes**. Em vez de prometer números, define-se **o que acompanhar**: a linha de
base é medida na própria operação e as metas saem dela (comparações honestas
antes/depois, sobre dados reais).

| Domínio | Exemplos de indicadores |
|---|---|
| **Produtividade** | Tempo poupado por pessoa · Retrabalho evitado · Tarefas automatizadas |
| **Qualidade** | Consistência dos entregáveis · Erros e correções · Tempo de 1ª resposta |
| **Pessoas & Clima** | Sobrecarga percebida · eNPS / satisfação · Segurança psicológica |
| **Segurança & Governança** | Incidentes com dados · % de ações auditadas · Aderência a permissões |

---

*Documento vivo. Atualize conforme novos conectores MCP e agentes entram em
produção.*
