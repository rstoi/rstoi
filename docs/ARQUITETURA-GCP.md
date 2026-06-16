# Arquitetura Google Cloud — agentes e estrutura de IA (setup.com.br)

Proposta para rodar, em produção, tudo o que foi criado aqui: os servidores **MCP
(WhatsApp, computer-use)**, o **agente `/setup`**, a **orquestração multimodelo**,
a **geração de documentos** e os **dados/segredos** — com isolamento, alta
disponibilidade e governança.

---

## 1. Topologia (visão geral)

```
                Internet
                   │
        ┌──────────┴───────────┐
        │  Cloud Load Balancer │  ←  Cloud Armor (WAF, rate limit)
        └──────────┬───────────┘
                   │ (webhook WhatsApp Cloud API, APIs internas)
        ┌──────────▼───────────────────────────────────────────────┐
        │  GKE Autopilot (cluster regional, multi-zona)             │
        │                                                           │
        │  [orchestrator]   roteador multimodelo, harness loop      │
        │  [whatsapp-mcp]   StatefulSet (sessão) + webhook          │
        │  [computer-use]   Deployment ISOLADO (gVisor)             │
        │  [setup-agent]    Deployment ISOLADO (gVisor, IAM mínimo) │
        │  [doc-worker]     geração docx/pdf/pptx (Job/CronJob)     │
        └───┬───────────┬───────────────┬───────────────┬──────────┘
            │           │               │               │
   ┌────────▼──┐  ┌─────▼─────┐  ┌──────▼──────┐  ┌──────▼───────┐
   │ Vertex AI │  │ Cloud SQL │  │   Pub/Sub   │  │ Cloud Storage│
   │ (Claude   │  │ (Postgres │  │ + Cloud     │  │ (mídia, docs,│
   │  Opus/    │  │  HA, PITR)│  │  Tasks      │  │  backups)    │
   │  Sonnet/  │  └───────────┘  │  filas)     │  └──────────────┘
   │  Haiku) + │  ┌───────────┐  └─────────────┘  ┌──────────────┐
   │ Speech/   │  │ Vector    │                   │ Secret Mgr   │
   │ Vision/   │  │ Search /  │                   │ (tokens,keys)│
   │ Embeddings│  │ pgvector  │                   └──────────────┘
   └───────────┘  └───────────┘
        │
   Observabilidade: Cloud Logging · Monitoring · Trace · Error Reporting · Audit Logs
   IaC/CI-CD: Terraform · Cloud Build · Artifact Registry (origem: GitHub)
```

---

## 2. Mapeamento componente → serviço GCP

| Componente (criado aqui) | Serviço GCP | Observação |
|---|---|---|
| Orquestrador / roteador multimodelo | **GKE Autopilot** (Deployment + HPA) | múltiplas réplicas, autoscaling |
| **MCP WhatsApp** (sessão Playwright) | **GKE StatefulSet** + **Persistent Disk** | 1 réplica/numero; sessão persistida |
| Webhook WhatsApp **Cloud API** | GKE/Cloud Run + **LB + Cloud Armor** | recomendado p/ HA (ver §9) |
| **MCP computer-use** | GKE Deployment **com gVisor** | isola GUI/shell |
| **Agente `/setup`** (Claude+bash, RCE) | GKE Deployment **gVisor + IAM mínimo** | node pool dedicado, egress restrito |
| Geração de documentos (build_*.py) | **Cloud Run Job** / GKE CronJob | sob demanda ou agendado |
| Modelos (Opus/Sonnet/Haiku) | **Vertex AI** (Claude no Model Garden) | IAM, regional, sem chave de API solta |
| Áudio / Visão / Embeddings | **Speech-to-Text · Vision/Document AI · Vertex Embeddings** | transcrição, OCR, RAG |
| Banco de mensagens/estado (hoje SQLite) | **Cloud SQL (PostgreSQL)** HA | regional, failover + PITR |
| Base de conhecimento (RAG) | **Vertex AI Vector Search** ou **AlloyDB/pgvector** | busca semântica |
| Mídia, documentos, backups | **Cloud Storage** (multi-região) | versionamento + lifecycle |
| Filas / desacoplamento | **Pub/Sub** + **Cloud Tasks** | retry durável, picos |
| Segredos (tokens Meta, chaves) | **Secret Manager** | nunca em env/repo |
| Agendamentos (relatórios, check-ins) | **Cloud Scheduler** | ex.: relatório financeiro semanal |
| Identidade dos serviços | **Workload Identity** | sem chave de SA nos pods |

---

## 3. Compute e isolamento

- **GKE Autopilot, cluster regional (multi-zona):** Kubernetes gerenciado, HA por
  padrão; você paga por pod, sem gerenciar nós.
- **Node pools / sandbox separados:**
  - `setup-agent` e `computer-use` executam **código/comandos arbitrários** →
    rodar com **GKE Sandbox (gVisor)**, em **node pool dedicado**, com **IAM
    mínimo** e **egress restrito** (Cloud NAT + regras de firewall). É o
    equivalente, em produção, ao guardrail/deny-by-default que já implementamos.
  - `orchestrator`/`whatsapp-mcp` em pool padrão.
- **WhatsApp como StatefulSet:** a sessão (login/QR) é estado → **StatefulSet +
  Persistent Disk** para sobreviver a reinícios sem reescanear o QR.

---

## 4. Modelos de IA (o "cérebro")

- **Vertex AI Model Garden** serve **Claude (Opus/Sonnet/Haiku)** dentro do GCP —
  controlado por IAM, regional, sem expor chave de API. O **roteador multimodelo**
  chama o tier certo por tarefa, com **failover** entre modelos.
- **Complementos gerenciados:** Speech-to-Text (áudios de WhatsApp/reuniões),
  Vision/Document AI (OCR de notas/contratos), Vertex Embeddings (RAG).

---

## 5. Dados

- **Cloud SQL (PostgreSQL) regional/HA** substitui o SQLite local: mensagens,
  estado dos agentes, auditoria. Failover automático + **PITR**.
- **Cloud Storage** (multi-região, versionado) para mídia, documentos gerados
  (docx/pdf/pptx) e **backups 3-2-1**.
- **RAG** via Vertex Vector Search ou AlloyDB (pgvector) sobre os documentos do
  Drive/contratos.

---

## 6. Mensageria, filas e ingresso

- **Webhook (WhatsApp Cloud API)** atrás de **Load Balancer + Cloud Armor**
  (WAF, rate limit, proteção contra abuso).
- **Pub/Sub + Cloud Tasks**: cada pedido entra numa fila durável; workers
  consomem com retry/backoff (resiliência a picos e falhas).

---

## 7. Segurança e governança

- **IAM least-privilege + Workload Identity** (pods autenticam sem chave de SA).
- **Secret Manager** para todos os segredos (tokens Meta, credenciais) com
  rotação; CMEK para criptografia gerenciada por você.
- **VPC + Cloud NAT + VPC Service Controls** para limitar exfiltração; **Cloud
  Armor** na borda.
- **Sandbox (gVisor)** para o `/setup`/computer-use; **node pool isolado**.
- **Cloud Audit Logs**: trilha de cada ação dos agentes (compliance e o
  human-in-the-loop que já adotamos).

---

## 8. Resiliência / HA (alinhado a `docs/ALTA-DISPONIBILIDADE.md`)

- **GKE regional** (réplicas em zonas distintas) + **HPA** + **PodDisruptionBudgets**.
- **Cloud SQL HA** (failover automático) + **backups + PITR**.
- **Cloud Storage multi-região** para documentos/backups.
- **Pub/Sub** desacopla e reentrega; **circuit breakers/timeouts** nos conectores.
- **Cloud Monitoring + Alerting + Error Reporting**; health checks e self-healing.
- **DR**: defina **RTO/RPO** por serviço; ensaios periódicos (game days).

---

## 9. Recomendações específicas

1. **Para HA do WhatsApp, prefira o Cloud API** (`graph.facebook.com`) ao
   adaptador pessoal (Playwright): é **stateless**, escala horizontalmente e não
   depende de uma sessão de navegador única. Mantenha o Playwright só para
   dev/uso pessoal.
2. **Isole o `/setup` ao máximo:** gVisor + IAM mínimo + egress allowlist + a
   autorização por grupo que já existe. Trate-o como superfície de RCE.
3. **Tudo via IaC (Terraform):** infra reproduzível = parte da resiliência (o
   mesmo princípio do nosso SessionStart hook, em escala de nuvem).
4. **CI/CD:** GitHub → **Cloud Build** → **Artifact Registry** → deploy no GKE.

---

## 10. Roadmap de migração (faseado)

| Fase | Entrega |
|---|---|
| **1. Fundação** | Projeto GCP, VPC, IAM, Secret Manager, Artifact Registry, Terraform base |
| **2. Dados** | Cloud SQL (migrar SQLite), Cloud Storage, backups/PITR |
| **3. Runtime** | GKE Autopilot; deploy do orchestrator + MCP WhatsApp (Cloud API) |
| **4. Isolamento** | node pool gVisor para `/setup` e computer-use; Cloud Armor no webhook |
| **5. IA** | Vertex AI (Claude + Speech/Vision/Embeddings); RAG (Vector Search) |
| **6. Observabilidade/DR** | Monitoring/Alerting, HPA, runbooks, ensaios de DR |

---

## 11. Custo (qualitativo — sem números presumidos)

Os maiores direcionadores são: **GKE Autopilot** (por pod ativo), **Cloud SQL HA**
(instância sempre ligada), **Vertex AI** (por token/uso) e **egress**. Otimize
com: autoscaling/`min-instances` ajustados, tiers de modelo (Haiku→Sonnet→Opus),
cache de respostas/embeddings e lifecycle no Cloud Storage. Dimensione com base no
volume real após a Fase 2 (mesma filosofia do nosso framework de indicadores:
medir antes de projetar).

---

*Documento de arquitetura. Próximo passo natural: traduzir as Fases 1–2 em
módulos Terraform versionados neste repositório.*
