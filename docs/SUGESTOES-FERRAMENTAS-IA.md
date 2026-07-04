<img src="assets/setup_logo@hi.png" alt="setup.com.br" height="48">

# Sugestões de recursos e ferramentas de IA — Claude, ChatGPT, Lovable, Google Workspace

> Complemento a `docs/infraestrutura-ia-setup.md`. Aquele documento descreve a
> arquitetura (camadas, harness loop, catálogo de agentes). Este documento é
> mais tático: **o que instalar/assinar/configurar hoje**, ferramenta por
> ferramenta, para tirar o máximo de Claude, ChatGPT, Lovable e Google
> Workspace — e onde cada uma encaixa no que já existe neste repositório.

---

## 1. Resumo — o que usar para quê

| Necessidade | Ferramenta | Por quê |
|---|---|---|
| Agentes que operam (código, WhatsApp, e-mail, agenda, arquivos) | **Claude Code + MCP** (este repo) | Já é o núcleo: harness loop + conectores |
| Trabalho do dia a dia dentro do Google Workspace (Docs, Sheets, Gmail) | **Gemini para Google Workspace** | Nativo, sem trocar de tela, já licenciado junto com o Workspace |
| Protótipo/app interno rápido (formulário, painel, mini-CRM) | **Lovable** | Gera o app inteiro (front + back) a partir de linguagem natural, exporta pro GitHub |
| Pesquisa aberta, brainstorm, segunda opinião, geração de imagem | **ChatGPT** (Plus/Team) | Bom complemento onde Claude não é o ponto forte (ex.: Deep Research, DALL·E) |
| Resumo/pergunta sobre uma pasta de documentos (contratos, propostas) | **NotebookLM** | Fonte fica restrita aos documentos carregados, cita a origem |
| Automatizar sem código entre Workspace e sistemas internos | **Apps Script / AppSheet** | Já dentro do Workspace, sem custo adicional, fácil de o time de negócio manter |

---

## 2. Claude — aprofundar o que o repo já usa

- **Claude Code (este repo):** já orquestra WhatsApp, computer-use e (via MCP)
  Gmail/Calendar/Drive/GitHub. Próximo passo natural é ativar os agentes do
  catálogo (`docs/infraestrutura-ia-setup.md`, §6) um de cada vez, começando
  pelo **Assistente Executivo** (menor risco, maior alcance).
- **Claude.ai Projects:** para trabalho de conhecimento que não precisa de
  ferramentas (ex.: revisar uma minuta, tirar dúvida jurídica pontual), crie um
  Project por área (Contratos, Comercial, PMO) com os documentos-base
  anexados como conhecimento — reduz a necessidade de "explicar contexto"
  toda vez.
- **Claude para Chrome / computer-use:** já presente em `src/computer-use/` —
  use para tarefas em sistemas sem API (portais de fornecedor, ERPs legados)
  em vez de tentar integrar tudo via MCP.
- **Roteador multimodelo:** mantenha o mapeamento já definido em
  `infraestrutura-ia-setup.md` §4 (Haiku → Sonnet → Opus por complexidade).
  Não duplique isso "por fora" com prompts soltos — centralize a escolha de
  modelo no roteador da camada de orquestração.

## 3. ChatGPT — onde complementa, sem duplicar o Claude

Regra prática: **Claude continua sendo o agente que age** (tem os MCPs, o
harness loop, o histórico). ChatGPT entra como ferramenta **pontual**, não
como segundo orquestrador — evita dois "cérebros" com contextos diferentes.

- **Deep Research / navegação:** bom para o sub-agente de "pesquisa de mercado"
  citado em `infraestrutura-ia-setup.md` §6 (fan-out do Assistente Executivo) —
  roda em paralelo e devolve um relatório para o Claude consolidar.
- **Geração de imagem (DALL·E) e Canvas:** peças de marketing, mockups
  rápidos de slide/documento antes de fechar no `docs/build_pptx.py`.
- **Custom GPTs com Actions:** só se o time comercial/negócio precisa de um
  chat isolado, sem tocar em dados sensíveis do WhatsApp/Drive — mantenha
  fora do caminho crítico de agentes com permissão de escrita.
- **Não usar para:** qualquer coisa que já tem MCP (WhatsApp, Drive, Calendar,
  GitHub) — duplicar o conector em outro produto cria duas fontes de verdade e
  quebra a auditoria única descrita em `infraestrutura-ia-setup.md` §9.

## 4. Lovable — para os sistemas internos "vibe coding" (§7 da infraestrutura)

O documento de infraestrutura já reconhece que a setup.com.br mantém sistemas
internos (projetos, contratos, comercial) nascidos de vibe coding. Lovable é o
lugar certo para **continuar** esse padrão de forma mais sustentável:

- **Novo painel/formulário interno em horas, não semanas:** descreva o app em
  linguagem natural, Lovable gera front-end + back-end (Supabase) prontos.
- **Exporta para GitHub:** conecte o repositório gerado a este workspace do
  GitHub MCP — o **agente de DevOps** (catálogo §6) passa a revisar PRs,
  rodar testes e reduzir a dívida técnica desses apps, exatamente como já
  proposto para os sistemas existentes.
- **Autenticação:** ligue o app Lovable ao **SSO do Google Workspace**
  (§9 da infraestrutura) em vez de criar login próprio — mantém "identidade
  única" em vez de mais uma base de usuários para gerenciar.
- **Candidatos concretos hoje:** o **painel de status** deste repo
  (`status-dashboard.html`/`status-server.js`) e qualquer tela de aprovação
  humana do harness loop (ex.: aprovar envio de mensagem/e-mail antes de sair)
  são bons primeiros casos — telas simples, dado já existe, ganho imediato de
  usabilidade sobre HTML estático.

## 5. Google Workspace — além de Gmail/Calendar/Drive (já conectados)

- **Gemini em Docs/Sheets/Gmail:** para edição e resumo *dentro* do próprio
  app, sem trocar de contexto — complementa (não substitui) os agentes MCP,
  que continuam sendo o caminho para ações que cruzam sistemas.
- **NotebookLM:** aponte para as pastas de contratos/propostas do Drive;
  qualquer profissional pergunta "o que ficou combinado com o cliente X" com
  a resposta citando a fonte exata — bom para reduzir uso indevido de LLM
  genérico sobre documento sensível.
- **Apps Script:** ponte leve entre Sheets/Forms e os sistemas internos
  (projetos/contratos/comercial) quando não vale a pena escrever um conector
  MCP dedicado ainda — útil na Fase 2 do roadmap antes de existir o conector
  formal.
- **AppSheet:** para telas internas simples ligadas direto a uma planilha
  (ex.: checklist de onboarding, registro de despesa) — alternativa mais leve
  que Lovable quando o dado já vive inteiramente no Workspace.
- **Google Chat apps:** se parte do time prefere Chat interno a WhatsApp, o
  mesmo padrão do conector WhatsApp (`src/adapters/`) pode ser replicado como
  um novo adapter — mesma identidade, mesmo agente, canal adicional.

## 6. Como decidir (para não acumular ferramenta por acumular)

1. **Já existe um conector MCP para isso?** → use o agente Claude existente.
2. **É uma automação simples só dentro do Workspace?** → Apps Script/AppSheet.
3. **Precisa virar um app de verdade, com tela própria e dado que ainda não
   tem lar?** → Lovable, depois GitHub + agente de DevOps.
4. **É pesquisa aberta, imagem ou uma segunda opinião pontual?** → ChatGPT.
5. **É trabalho de conhecimento sem necessidade de agir (analisar, redigir,
   tirar dúvida)?** → Claude.ai Project ou Gemini nativo do Workspace,
   o que estiver mais perto de onde a pessoa já está trabalhando.

Critério geral: **cada ferramenta nova precisa herdar a identidade única
(SSO Google) e cair sob a mesma auditoria/aprovação humana** já definidas em
`infraestrutura-ia-setup.md` §9 — senão a infraestrutura ganha uma ferramenta
e perde governança.

---

*Documento vivo — atualize conforme novas ferramentas entrarem em uso real.*
