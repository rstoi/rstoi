<img src="assets/esportes-co-logo.jpeg" alt="Esportes.Co — Pure Passion" height="56">

# Esportes.Co — Manual de operação

> Como **operacionalizar a empresa**, na prática, do zero ao PMF. Este é o documento que
> transforma o charter ([`empresa.md`](empresa.md)) em rotina executável. Leia depois de
> `empresa.md`, `estrategia-reposicionamento.md` e `historia.md`.

A Esportes.Co opera em **duas camadas que andam juntas**:

- **Camada 1 — Empresa virtual (o "como dirigir"):** o CEO virtual **Emanuel.ia** e o squad
  de agentes planejam, decidem e produzem artefatos dentro do Claude Code.
- **Camada 2 — Negócio real (o "o que executar"):** o **Sprint de 30 dias "Campeonato como
  Mídia"** com clientes reais (organizadores, atletas, patrocinadores) em uma cidade.

A Camada 1 existe para fazer a Camada 2 acontecer com baixa fricção e disciplina de PMF.

---

## 0. Índice rápido

1. [Pré-requisitos e setup](#1-pré-requisitos-e-setup)
2. [O loop do Emanuel.ia (como rodar um ciclo)](#2-o-loop-do-emanuelia-como-rodar-um-ciclo)
3. [Ritmo operacional (cadência)](#3-ritmo-operacional-cadência)
4. [Onde ficam os artefatos](#4-onde-ficam-os-artefatos)
5. [Sprint de 30 dias "Campeonato como Mídia"](#5-sprint-de-30-dias-campeonato-como-mídia)
6. [SOP por função (input → processo → output)](#6-sop-por-função-input--processo--output)
7. [Pipeline comercial](#7-pipeline-comercial)
8. [Operação de campo (captura → publicação)](#8-operação-de-campo-captura--publicação)
9. [Consentimento, imagem e LGPD](#9-consentimento-imagem-e-lgpd)
10. [Cockpit de métricas e relatórios](#10-cockpit-de-métricas-e-relatórios)
11. [Phase gates (avançar / pivotar / arquivar)](#11-phase-gates-avançar--pivotar--arquivar)
12. [Integração com WhatsApp (opcional)](#12-integração-com-whatsapp-opcional)
13. [Primeiros 7 dias — checklist](#13-primeiros-7-dias--checklist)
14. [O que NÃO fazer](#14-o-que-não-fazer)

---

## 1. Pré-requisitos e setup

**Para operar a empresa virtual (Camada 1):**
- Repositório clonado e ambiente pronto (`.claude/hooks/session-start.sh` reconstrói deps).
- Sessão do Claude Code aberta na raiz do projeto. Os 7 agentes em `.claude/agents/` e o
  comando `/emanuel` já estão disponíveis.

**Para operar o negócio real (Camada 2):**
- 1 **dono de operação** humano (você ou um operador) — o squad de IA produz, decide e
  organiza; pessoas executam o que exige presença física e relação comercial.
- 1 cidade-alvo com densidade esportiva (society/futsal) e patrocinadores locais.
- Ferramentas mínimas: número de WhatsApp, celular para captura, conta para receber Pix,
  uma página pública (landing simples) e perfil social (Instagram/TikTok).

> **Regra de ouro:** comece **assistido**. Nada de plataforma. Uma oferta, uma cidade, um
> campeonato piloto.

---

## 2. O loop do Emanuel.ia (como rodar um ciclo)

Toda decisão de operação nasce de um **ciclo do CEO**. Para iniciar:

1. Na sessão do Claude Code, execute **`/emanuel <iniciativa>`** (ou `/emanuel` sozinho →
   "qual o próximo passo rumo ao PMF?").
2. Emanuel.ia executa o **ritual de ciclo**:
   1. Lê `empresa.md` + `estrategia-reposicionamento.md` + `historia.md`.
   2. **Declara a fase atual** e os **OKRs do ciclo** (ancorados nos thresholds de
      `empresa.md §6`).
   3. **Decompõe** a iniciativa em tarefas com dono (mapa de delegação de `empresa.md §8`).
   4. **Delega** cada tarefa ao lead certo via a ferramenta **Task** (`produto-tech`,
      `marketing-vendas`, `financas`, `operacoes`, `dados-ia`, `juridico-lgpd`).
   5. **Consolida** os retornos, cruza com os thresholds e resolve conflitos.
   6. Encerra com **decisão executiva** + próximos passos (e, no fim de fase, o phase gate).
3. **Registre a decisão** em `operacao/registro-de-decisoes.md` (template pronto).

**Quando acionar um lead diretamente** (sem passar pelo CEO): tarefas pontuais e
mono-funcionais (ex.: "marketing-vendas, escreva 10 posts da rodada"). Tarefas
multifuncionais ou estratégicas → sempre via `/emanuel`.

**Gatilho de LGPD:** qualquer entrega que envolva **mídia ou dados de atletas** exige
parecer do `juridico-lgpd` (aprovado / aprovado com ressalvas / bloqueado) **antes** de
publicar.

---

## 3. Ritmo operacional (cadência)

| Ritual | Frequência | Conduzido por | Saída |
|---|---|---|---|
| **Kickoff de sprint** | início de cada sprint (30d) | Emanuel.ia | OKRs do sprint, plano semanal, RACI |
| **Standup** | a cada rodada do campeonato (ou 2×/semana) | Operações | status de captura/publicação, bloqueios |
| **Revisão comercial** | semanal | Marketing & Vendas | pipeline, cotas de patrocínio, próximos contatos |
| **Revisão de números** | semanal | Finanças | receita/ciclo, custo por jogo, margem |
| **Gate de conteúdo** | a cada lote de mídia | Jurídico/LGPD | parecer de consentimento/imagem |
| **Revisão de ciclo / phase gate** | fim do sprint | Emanuel.ia | continuar / pivotar / arquivar + aprendizados |

Cada ritual = um `/emanuel` ou uma chamada direta ao lead, com a saída registrada na pasta
de operação.

---

## 4. Onde ficam os artefatos

Os agentes produzem documentos; eles precisam de um lugar. Convenção:

```
docs/esportes-co/
├── operacao.md                      (este manual)
├── operacao/
│   ├── registro-de-decisoes.md      log de decisões do CEO (preencher por ciclo)
│   ├── pipeline-comercial.md        CRM leve: estágios + tabela de leads
│   ├── checklist-captura-video.md   SOP de captura em campo
│   ├── termo-consentimento-imagem.md modelo (inclui menores)
│   └── kit-patrocinador.md          estrutura do pacote de patrocínio
└── ciclos/                          (criar sob demanda)
    └── 2026-07-sprint-01/           1 pasta por sprint: OKRs, entregas, relatório final
```

> Crie `ciclos/<ano-mes-sprint>/` no primeiro kickoff. Cada sprint guarda seus OKRs,
> entregas (posts, highlights, relatório) e o relatório final que alimenta o phase gate.

---

## 5. Sprint de 30 dias "Campeonato como Mídia"

A unidade de operação é **um sprint = um campeonato piloto**. Oferta única, três entregas
obrigatórias: **página pública + conteúdo social + pacote de patrocínio**.

### RACI das três entregas

| Entrega | Responsável (faz) | Aprova | Consultado | Informado |
|---|---|---|---|---|
| Página pública (tabela, súmula, ranking) | Produto/Tech + Operações | Emanuel.ia | — | Organizador |
| Conteúdo social (posts, highlights) | Dados & IA + Marketing | Jurídico/LGPD | Operações | Times/atletas |
| Pacote de patrocínio | Marketing & Vendas | Emanuel.ia | Finanças | Patrocinador |

### Semana a semana

**Semana 1 — Fechar o piloto e montar a base**
- Marketing & Vendas: prospectar e fechar **1 campeonato pago** (12–24 times) via
  diagnóstico gratuito (§7).
- Finanças: precificar o pacote (referência: setup R$1.000–1.500 + R$500/mês + 20% de
  patrocínio).
- Operações: criar a pasta do ciclo, configurar página pública, inscrições e checklist de
  captura.
- Jurídico/LGPD: preparar termos de consentimento/imagem (atletas e responsáveis).
- **Meta:** contrato/aceite do organizador; 2 patrocinadores abordados.

**Semana 2 — Primeira rodada e prova de conteúdo**
- Operações + Dados & IA: capturar a 1ª rodada, gerar highlights/cards **semiautomáticos**
  (IA sugere, humano aprova) e publicar em **≤24h**.
- Marketing: publicar gol/defesa/craque da rodada, tabela e artilharia; cada post marca
  atleta + time + patrocinador.
- **Meta:** primeiros 100 atletas cadastrados; primeiros reposts de times.

**Semana 3 — Vender mídia e escalar a produção**
- Marketing & Vendas: fechar **2 cotas de patrocínio** (kit pronto — §template).
- Dados & IA: reduzir tempo/custo por vídeo; padronizar templates de corte.
- Finanças: medir custo variável por jogo e receita acumulada.
- **Meta:** ≥30% dos times republicando; 2 cotas vendidas ou em negociação ativa.

**Semana 4 — Fechar o ciclo e decidir**
- Operações: relatório final do campeonato + kit de resultados para patrocinador.
- Finanças: fechar receita do ciclo (meta **R$2.000+**) e margem.
- Marketing: medir intenção de recompra do organizador (meta **≥70%**).
- Emanuel.ia: **phase gate** (§11) — continuar / pivotar (escolinhas) / arquivar com
  aprendizados.

---

## 6. SOP por função (input → processo → output)

| Função | Input | Processo | Output (artefato) |
|---|---|---|---|
| **Emanuel.ia (CEO)** | iniciativa, estado do ciclo | ritual de ciclo + delegação | OKRs, decisões, phase gate |
| **Produto/Tech** | escopo do piloto | montar página pública, definir fluxo | página/tabela/súmula no ar; backlog priorizado |
| **Marketing & Vendas** | ICP, cidade | prospecção, diagnóstico, conteúdo | leads, posts, pacote de patrocínio fechado |
| **Finanças** | dados do ciclo | pricing, unit economics | tabela de preços, relatório de números, recomendação de captação |
| **Operações** | calendário do campeonato | captura, publicação, suporte | checklist preenchido, relatório de rodada |
| **Dados & IA** | vídeos brutos | detecção/corte/cards (semiauto) | highlights, cards, base de atletas consentida |
| **Jurídico/LGPD** | mídia/dados a publicar | checagem de consentimento/imagem | parecer: aprovado / ressalvas / bloqueado |

---

## 7. Pipeline comercial

Fluxo de aquisição (detalhe e tabela em [`operacao/pipeline-comercial.md`](operacao/pipeline-comercial.md)):

1. **Lead** — organizador/escolinha identificado (ICP: society/futsal 8–32 times,
   escolinha 80+ alunos, liga regional, torneio corporativo, projeto social).
2. **Diagnóstico gratuito** — entregar avaliação de presença digital, estimativa de
   audiência, mapa de patrocinadores locais, proposta de página pública, simulação de
   receita e amostra de posts/cards. *Objetivo: virar interesse em piloto pago.*
3. **Proposta** — pacote "Campeonato como Mídia" com preço (Finanças).
4. **Piloto pago** — sprint de 30 dias.
5. **Recompra / expansão** — próximo campeonato, mais cidades.

> Não tente vender "a plataforma inteira" na primeira conversa. Venda **mídia + operação**.

---

## 8. Operação de campo (captura → publicação)

Pipeline físico de cada rodada (SOP completo em
[`operacao/checklist-captura-video.md`](operacao/checklist-captura-video.md)):

1. **Captura** — celular/câmera fixa, padrão mínimo (tripé, enquadramento, áudio). Sem
   padrão mínimo, o valor cai.
2. **Upload** — via WhatsApp/cloud para a esteira de Dados & IA.
3. **Corte semiautomático** — IA sugere melhores momentos; humano aprova em minutos.
4. **Gate de LGPD** — Jurídico aprova a mídia (consentimento/menores).
5. **Geração** — cards (gol/defesa/craque/seleção), tabela, artilharia.
6. **Publicação ≤24h** — cada peça marca atleta + time + patrocinador.
7. **Distribuição orgânica** — atleta marcado → time republica → ranking público.

---

## 9. Consentimento, imagem e LGPD

**Gate inegociável.** Nenhuma mídia ou base de dados de atletas avança sem consentimento
registrado — **sobretudo menores de idade**.

- Use o modelo [`operacao/termo-consentimento-imagem.md`](operacao/termo-consentimento-imagem.md)
  (versões atleta adulto e responsável por menor).
- Colete o consentimento **na inscrição** (antes do primeiro jogo).
- Garanta: finalidade clara, controle de exposição pública, **direito de remoção**,
  moderação de comentários e cuidado com rankings de menores.
- Material com dados pessoais é **interno**; para uso externo, versão redigida.

Fluxo: inscrição com termo → registro do consentimento → Jurídico libera publicação. Sem
termo, o atleta entra na operação mas **não** na mídia pública.

---

## 10. Cockpit de métricas e relatórios

Acompanhe semanalmente os thresholds de decisão (`empresa.md §6`):

| Métrica | Meta | Dono |
|---|---|---|
| Receita por campeonato | R$ 2.000+ / ciclo | Finanças |
| Custo variável por jogo | medir e reduzir | Operações / Dados & IA |
| Repost de times | ≥ 30% | Marketing |
| Cotas de patrocínio | 2 por campeonato | Marketing & Vendas |
| Tempo de publicação pós-jogo | ≤ 24h | Operações |
| Intenção de recompra | ≥ 70% | Marketing |
| Evidência para captação | 10 campeonatos pagos, 3 cidades, margem+ | Finanças / CEO |

Cada sprint termina com um **relatório de ciclo** (na pasta `ciclos/...`) que alimenta o
phase gate. O Finanças mantém o número de receita/custo; o Marketing, a distribuição.

---

## 11. Phase gates (avançar / pivotar / arquivar)

No fim de cada sprint, Emanuel.ia decide com base nos thresholds:

- **Continuar / avançar de fase** → quando as metas da fase foram atingidas (ex.: passar de
  Piloto pago a Produto interno requer ≥1 campeonato pago com economics medidos; chegar a
  SaaS inicial requer 5 campeonatos pagos e custo por jogo conhecido).
- **Pivotar (escolinhas)** → quando campeonatos avulsos não dão recorrência, mas há sinal
  forte em escolinhas (recorrência maior).
- **Arquivar com aprendizados** → quando as fundações (timing/mercado) ainda não respondem;
  documentar e liberar foco, conforme o DNA ("um pivô reaproveitando recursos > insistir
  num negócio cedo demais").

As fases completas (0–30d → 31–90d → 91–180d → 180–365d) estão em `empresa.md §5`.

---

## 12. Integração com WhatsApp (opcional)

O repositório já tem um agente `/setup` no WhatsApp (`scripts/wa-agent.ts`). Quando fizer
sentido, o mesmo padrão pode acionar o ciclo da empresa (ex.: o operador manda "/setup rode
o ciclo do emanuel para o campeonato X" e recebe o plano/decisão de volta). Mantenha as
**guardas de autorização** existentes (grupos/remetentes permitidos) — ver `src/agent-auth.ts`.
Esta integração é um **acréscimo**, não um pré-requisito para operar.

---

## 13. Primeiros 7 dias — checklist

- [ ] **Dia 1:** rodar `/emanuel iniciar operação` → declarar fase (Piloto pago) e OKRs do
  1º sprint; criar `ciclos/2026-07-sprint-01/`.
- [ ] **Dia 1:** escolher a cidade-alvo e o ICP (society/futsal 8–32 times).
- [ ] **Dia 2:** Marketing gera lista de 10 organizadores + roteiro de diagnóstico gratuito.
- [ ] **Dia 2:** Finanças fecha a tabela de preços do pacote piloto.
- [ ] **Dia 3:** Jurídico finaliza os termos de consentimento/imagem.
- [ ] **Dia 3–5:** prospecção ativa; agendar 3 diagnósticos.
- [ ] **Dia 5:** Operações monta a página pública-modelo e o checklist de captura.
- [ ] **Dia 6–7:** fechar **1 campeonato piloto pago**; abordar **2 patrocinadores**.
- [ ] **Dia 7:** `/emanuel` consolida a semana e registra a decisão.

Saída esperada da semana 1: 1 piloto fechado, termos prontos, página-modelo e esteira de
captura no lugar.

---

## 14. O que NÃO fazer

- ❌ Construir plataforma/SaaS antes de validar receita no piloto.
- ❌ Operar cada campeonato de forma artesanal (vira agência) — use pacote rígido e
  templates.
- ❌ Cobrar de atletas/pais antes de gerar orgulho e distribuição.
- ❌ Publicar mídia de menores sem consentimento dos responsáveis.
- ❌ Abrir várias frentes ao mesmo tempo — uma oferta, uma cidade, um sprint.
- ❌ Buscar captação antes de 10 campeonatos pagos, 3 cidades e margem positiva.

> **Lema operacional (DNA de Emanuel Piza):** *timing, "dinheiro é o oxigênio", foco.*
> Valide o business model antes de escalar.
