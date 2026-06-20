<img src="assets/setup_logo@hi.png" alt="setup.com.br" height="48">

# Infraestrutura de TI com IA em Google Cloud — setup.com.br

> Versão **enxuta e econômica** da arquitetura de produtividade aumentada por IA
> da setup.com.br, redesenhada para rodar a infraestrutura em **Google Cloud +
> Google Workspace**, com a **camada de modelos apoiada em assinaturas de valor
> fixo já contratadas — Claude Pro/Max e Gemini Business — eliminando a Vertex AI**
> (que era cobrada por token). O objetivo é manter a mesma capacidade da
> arquitetura original ao **menor custo incremental possível**, reaproveitando
> tudo o que já está contratado e os *free tiers* permanentes do Google Cloud.

Este documento consolida: (1) a arquitetura sem Vertex AI, (2) a lista de
serviços a contratar/reaproveitar, (3) o plano de implantação passo a passo com
custo por etapa e (4) as estimativas de custo por cenário.

---

## 1. Princípios de economia

1. **Não recomprar o que já existe.** Workspace, Gemini Business, Claude Pro/Max,
   WhatsApp (Meta Cloud API), GitHub, o host próprio e os sistemas internos
   (projetos, contratos, comercial) já estão pagos — são reaproveitados.
2. **Modelos por assinatura fixa, não por token.** A camada de IA roda sobre
   **Claude Pro/Max** (trabalho agêntico, via Claude Code) e **Gemini Business**
   (produtividade dentro do Workspace). **Vertex AI é eliminada.**
3. **Free tier primeiro.** A infraestrutura de apoio (Cloud Run, Pub/Sub,
   Firestore, Logging, Firebase) cabe majoritariamente no *free tier* permanente
   do Google Cloud.
4. **Reuso do host próprio.** `computer-use`, transcrição de áudio (Whisper
   open-source) e embeddings para RAG rodam no servidor que já existe.
5. **Governança por padrão.** Identidade única (Cloud Identity/Workspace),
   permissões mínimas, auditoria e DLP usando recursos já inclusos no Workspace.

---

## 2. Arquitetura sem Vertex AI

```
┌──────────────────────────────────────────────────────────────────────┐
│ EXPERIÊNCIA   PC/Notebook · Tablet · Smartphone · WhatsApp · Chat web  │
│               Workspace (Gmail/Docs/Sheets/Meet) + PWA (Firebase)      │
└───────────────┬────────────────────────────────────────────────────────┘
                │  Cloud Identity (SSO) + Identity-Aware Proxy (IAP)
┌───────────────▼────────────────────────────────────────────────────────┐
│ ORQUESTRAÇÃO — "o cérebro" (assinaturas já contratadas)                │
│ • Trabalho agêntico: Claude Code sobre Claude Pro/Max (harness loop)    │
│ • Produtividade no Workspace: Gemini Business + Gems + NotebookLM       │
│ • Orquestração assíncrona: Pub/Sub + Cloud Tasks (free tier)            │
│ • Memória: Firestore (curto) · pgvector/NotebookLM (longo / RAG)        │
└───────────────┬────────────────────────────────────────────────────────┘
                │  MCP sobre Cloud Run (HTTP/SSE) + IAM
┌───────────────▼────────────────────────────────────────────────────────┐
│ FERRAMENTAS / CONECTORES (MCP servers em Cloud Run / host próprio)      │
│ WhatsApp │ Gmail │ Calendar │ Drive │ GitHub │ computer-use │ ERP/CRM   │
└───────────────┬────────────────────────────────────────────────────────┘
                │
┌───────────────▼────────────────────────────────────────────────────────┐
│ DADOS & GOVERNANÇA                                                      │
│ Cloud Identity/IAM · Secret Manager · Cloud Audit Logs · Vault + DLP   │
│ do Workspace · Cloud Storage (backup) · Drive (fonte da verdade)       │
└────────────────────────────────────────────────────────────────────────┘
```

**Decisão central:** a camada de modelos (o maior custo da versão com Vertex)
passa a ser **custo fixo já contratado ≈ R$0 incremental**. A infraestrutura
restante fica majoritariamente no *free tier*.

---

## 3. Como cada peça da Vertex AI é substituída

| O que a Vertex fazia | Alternativa sem Vertex (já contratada / grátis) |
|---|---|
| Modelos do "cérebro" (Pro/Flash/Lite) | **Claude Pro/Max** dirige o harness loop via **Claude Code** |
| IA para usuário final | **Gemini Business** no Workspace (Gmail/Docs/Sheets/Meet) + app Gemini |
| RAG / Vector Search | **NotebookLM** (no Gemini Business) + **pgvector** com embeddings open-source no host |
| Speech-to-Text (áudio do WhatsApp) | **Whisper (open-source)** no host próprio, ou app Gemini |
| Document AI (OCR) | **OCR nativo do Google Drive/Docs** (grátis) ou **Tesseract** no host |
| Agentes especializados | **Gems** (Gemini Business) + **sub-agentes do Claude Code** |

**Trade-offs honestos:** assinaturas têm limites por *seat*/uso — atendem bem
Piloto e Operação; em escala muito alta de automação backend pode ser preciso
mais seats Max ou um fallback metered pontual. Embeddings/Whisper no host
consomem CPU/RAM do servidor já existente (reuso, sem novo contrato).

---

## 4. Serviços — contratar vs. reaproveitar

### Já contratados (reaproveitar, US$ 0 incremental)
- **Google Workspace + Gemini Business** — e-mail, Docs, Sheets, Meet, Drive,
  SSO, Gemini nas apps, Gems, NotebookLM, Vault e DLP.
- **Claude Pro/Max** — runtime dos agentes via Claude Code.
- **WhatsApp Meta Cloud API** — canal de atendimento de produção.
- **GitHub** — DevOps / chamados de engenharia.
- **Host próprio** — `computer-use`, Whisper, embeddings, sistemas internos.

### A ativar no Google Cloud (majoritariamente free tier)
| Serviço | Para quê | Faixa de custo |
|---|---|---|
| **Cloud Run** | MCP servers + webhook WhatsApp | free tier → baixo |
| **Pub/Sub + Cloud Tasks** | Orquestração do loop | free tier |
| **Firestore** | Estado de sessão/agentes | free tier → baixo |
| **Cloud Storage** | Backup de artefatos | baixo |
| **Secret Manager** | Chaves e tokens | ~US$ 0 |
| **Cloud Identity + IAP** | SSO e acesso seguro | incluído / US$ 0 |
| **Cloud Armor** | Proteção de borda | baixo |
| **Cloud Logging/Monitoring** | Observabilidade | free tier |
| **Looker Studio** | Painéis de indicadores | grátis |
| **Firebase Hosting/Auth/FCM** | PWA mobile/tablet + push | Spark grátis |

---

## 5. Plano de implantação passo a passo (com custo por passo)

Custos **incrementais mensais** no Google Cloud (câmbio US$ 1 ≈ R$ 5,50),
cenário de referência: **Operação, 50 usuários**. Esforço de engenharia é
interno (agente DevOps + Claude Code), não vira assinatura.

### Fase 0 — Fundação (semana 1)
| Passo | O que fazer | Serviço | Custo/mês |
|---|---|---|---|
| 1 | Projeto GCP + Billing + organização | Google Cloud | US$ 0 (crédito inicial US$ 300) |
| 2 | SSO, grupos, MDM | Cloud Identity (Workspace já pago) | US$ 0 |
| 3 | Migrar `.env` → cofre | Secret Manager | ~US$ 0 |

**Subtotal: ~US$ 0**

### Fase 1 — Camada de IA nas assinaturas (semana 1–2)
| Passo | O que fazer | Serviço | Custo/mês |
|---|---|---|---|
| 4 | Harness loop + agentes via Claude Code | Claude Pro/Max (já contratado) | US$ 0 incremental |
| 5 | Ativar Gemini no Workspace + Gems + NotebookLM | Gemini Business (já contratado) | US$ 0 incremental |

**Subtotal: US$ 0** — a maior despesa (modelos) fica zerada.

### Fase 2 — Conectores MCP em produção (semana 2–4)
| Passo | O que fazer | Serviço | Custo/mês |
|---|---|---|---|
| 6 | Containerizar MCP (WhatsApp, Gmail, Calendar, Drive, GitHub) → deploy | Cloud Run (free 2M req) | US$ 0–50 |
| 7 | Webhook WhatsApp (Meta já paga) → fila de eventos | Cloud Run + Pub/Sub (free 10 GB) | US$ 0–20 |
| 8 | `computer-use` no servidor existente | Host próprio (reuso) | US$ 0 |

**Subtotal: ~US$ 0–70**

### Fase 3 — Memória e RAG sem Vertex (semana 4–6)
| Passo | O que fazer | Serviço | Custo/mês |
|---|---|---|---|
| 9 | Q&A ancorado nos documentos do Drive | NotebookLM (no Gemini Business) | US$ 0 |
| 10 | RAG programático: embeddings OSS + busca vetorial | pgvector no host/Postgres | US$ 0 (ou Cloud SQL pequeno ~US$ 50) |
| 11 | Áudio → texto; OCR de documentos | Whisper OSS no host + OCR do Drive | US$ 0 |

**Subtotal: ~US$ 0–50**

### Fase 4 — Estado e dados (semana 5–6)
| Passo | O que fazer | Serviço | Custo/mês |
|---|---|---|---|
| 12 | Estado de sessão/agentes | Firestore (free tier) | US$ 0–30 |
| 13 | Expor sistemas internos como MCP | mantêm-se onde já rodam | US$ 0 incremental |
| 14 | Backup dos artefatos (Drive = fonte da verdade) | Cloud Storage | US$ 5–30 |

**Subtotal: ~US$ 5–60**

### Fase 5 — Governança e observabilidade (semana 6–7)
| Passo | O que fazer | Serviço | Custo/mês |
|---|---|---|---|
| 15 | Acesso seguro à UI/serviços | IAP (US$ 0) + Cloud Armor | US$ 0–20 |
| 16 | Trilha de auditoria do loop | Cloud Audit Logs (free tier) | US$ 0–20 |
| 17 | Retenção/DLP corporativos | Vault + DLP do Workspace | US$ 0 incremental |
| 18 | Logs/métricas + painéis | Cloud Logging/Monitoring (free) + Looker Studio (grátis) | US$ 0–20 |

**Subtotal: ~US$ 0–60**

### Fase 6 — Experiência multidispositivo (semana 7–8)
| Passo | O que fazer | Serviço | Custo/mês |
|---|---|---|---|
| 19 | PWA mobile/tablet com login Workspace + push | Firebase Hosting/Auth/FCM (Spark grátis) | US$ 0–10 |

**Subtotal: ~US$ 0–10**

### Fase 7 — Otimização contínua (mês 3+)
| Passo | O que fazer | Efeito |
|---|---|---|
| 20 | Ajuste de roteamento (Gems vs Claude), Committed Use Discounts (−20% a −55%), limpeza de logs | reduz custo |

---

## 6. Custo acumulado e estimativa por cenário

### Acumulado por fase — Operação (50 usuários)
| Acumulado até… | Incremental/mês (US$) | (R$) |
|---|---|---|
| Fase 1 (IA no ar) | ~0 | ~R$ 0 |
| Fase 2 (conectores) | ~0–70 | ~R$ 0–385 |
| Fase 3 (RAG) | ~0–120 | ~R$ 0–660 |
| Fase 4 (dados) | ~5–180 | ~R$ 30–990 |
| Fase 5 (governança) | ~5–240 | ~R$ 30–1.320 |
| **Fase 6 (completo)** | **~5–250** | **~R$ 30–1.375** |

### Por cenário (gasto incremental, sem Vertex)
| Cenário | Usuários | Com Vertex (US$) | **Sem Vertex (US$)** | **Sem Vertex (R$)** |
|---|---|---|---|---|
| Piloto | 10 | ~450 | **~150** | ~R$ 800 |
| Operação | 50 | ~1.150 | **~280** | ~R$ 1.550 |
| Escala | 150 | ~3.200 | **~900** | ~R$ 4.950 |

➡️ Eliminar a Vertex e apoiar a IA nas assinaturas **Claude Pro + Gemini
Business** derruba o incremental de ~US$ 1.150 para **~US$ 280/mês** na Operação
(**−75%**). O **Piloto (10 usuários) fica praticamente em R$ 0**, coberto pelo
*free tier* permanente do Google Cloud.

> Valores aproximados (referência Google Cloud/Workspace início de 2026; sujeitos
> a câmbio e tabela vigente). O custo só sobe de forma relevante se o volume de
> automação backend ultrapassar os limites das assinaturas — aí avalia-se mais
> seats Max ou fallback metered pontual.

---

## 7. Como isto se conecta ao que já existe no repositório

| Componente | Onde está no repo |
|---|---|
| Conector WhatsApp (Playwright + Cloud API) | `src/adapters/`, `src/tools/`, `.mcp.json` |
| Operar o computador (computer-use) | `src/computer-use/`, `.mcp.json` |
| Google Workspace — Gmail, Calendar, Drive | MCP servers conectados na sessão |
| GitHub (DevOps) | MCP `github` |
| Painel de status/observabilidade | `status-dashboard.html`, `gen-status.js` |

O núcleo de **WhatsApp + computer-use + Workspace** já é a camada de ferramentas
(MCP). Esta versão troca a camada de modelos paga (Vertex) por **assinaturas já
contratadas** e move a infra de apoio para o **free tier do Google Cloud**.

---

*Documento vivo. Atualize conforme novos conectores MCP, agentes e medições de
custo entram em produção.*
