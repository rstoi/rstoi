# Alta disponibilidade e resiliência — infraestrutura de TI com IA (setup.com.br)

Descrição de funcionamento: como a estrutura se mantém **disponível** (continua
atendendo mesmo sob falha) e **resiliente** (recupera-se sozinha e preserva os
dados). Distingue o que **já está implementado** neste repositório do que é
**desenho recomendado** para a operação em produção.

---

## 1. Princípios

1. **Sem ponto único de falha (no SPOF):** todo componente crítico tem réplica
   ou alternativa.
2. **Estado durável, processamento descartável:** os "trabalhadores" (agentes,
   servidores MCP) são reconstruíveis; o que importa fica em armazenamento
   replicado e versionado.
3. **Degradação graciosa:** se uma parte cai, o resto continua — com menos
   recursos, nunca com parada total.
4. **Idempotência:** repetir uma operação não causa dano (essencial para retry e
   reconstrução).
5. **Recuperação automática:** health checks + reinício/realocação sem
   intervenção humana.
6. **Observabilidade:** se não dá para medir, não dá para garantir — métricas,
   logs e alertas em tudo.

---

## 2. Como cada camada obtém HA/resiliência

### Experiência (PC/notebook/tablet/smartphone/WhatsApp)
- **Multicanal por design:** o mesmo agente é alcançável por vários canais. Se o
  WhatsApp estiver indisponível, o profissional usa app/web/IDE — o trabalho não
  para.
- **Clientes leves + reconexão:** apps/PWA toleram queda de rede, fazem fila
  local e ressincronizam ao voltar.

### Orquestração — "o cérebro"
- **Múltiplas instâncias atrás de balanceador:** o orquestrador roda em N
  réplicas (vários nós/zonas); a queda de uma não derruba o serviço.
- **Filas para absorver picos e falhas:** pedidos entram numa fila durável; se um
  worker cai, outro retoma a mensagem (entrega ao-menos-uma-vez + idempotência).
- **Roteador multimodelo com fallback (HA da IA):** se o modelo/provedor primário
  falha ou atinge limite, o roteador reencaminha (ex.: Opus → Sonnet → Haiku, ou
  provedor secundário). Inclui **retry com backoff exponencial**, **timeouts** e
  **circuit breaker** por modelo.

### Conectores (MCP)
- **Isolamento (bulkhead):** cada servidor MCP é um processo independente — a
  falha de um (ex.: WhatsApp) **não** derruba os outros (Drive, Calendar…).
- **Tráfego MCP via Anthropic:** conectores roteiam por canal gerenciado, sem
  depender da rede de saída do container para cada host.
- **Startup tolerante a falha (já implementado):** o servidor MCP sobe **antes**
  de conectar ao serviço externo e conecta em background — se o WhatsApp/rede
  estiver fora, as ferramentas ficam disponíveis e só as que dependem da conexão
  retornam erro, em vez de travar tudo (`src/index.ts`).
- **Circuit breaker + timeout por conector:** chamadas a sistemas externos têm
  prazo e disjuntor para não propagar lentidão.

### Dados e governança
- **Replicação + backup 3-2-1:** banco com réplicas; backups em 3 cópias, 2
  mídias, 1 fora do site; **point-in-time recovery**.
- **Cofre de segredos em HA:** Vault/Secret Manager com réplicas; segredos nunca
  no código (ver `.env.example`).
- **Trilha de auditoria durável:** cada passo dos agentes é registrado para
  conformidade e para reconstruir o que aconteceu após um incidente.

---

## 3. Resiliência do ambiente efêmero (implementado)

O ambiente de execução é **efêmero**: a cada reinício, o container é recriado do
zero. A resiliência vem de:

- **Git como fonte única da verdade:** todo código, configuração de agentes
  (`.mcp.json`), hooks e settings estão versionados — nada crítico vive só local.
- **Reconstrução automática (SessionStart hook):** `.claude/hooks/session-start.sh`
  reinstala dependências (npm/pip), Chromium e cria diretórios a cada sessão —
  idempotente e não-interativo. O ambiente se "regenera" sozinho após reboot.
- **Documentação de continuidade:** `docs/RESILIENCIA.md` mapeia o que sobrevive
  (Git), o que vem do environment (segredos, política de rede) e o que precisa de
  reautenticação (login WhatsApp).

---

## 4. Padrões de resiliência aplicados (e onde)

| Padrão | Para quê | No repositório |
|---|---|---|
| **Idempotência** | repetir sem dano | hook de setup; `INSERT OR REPLACE` no store |
| **Retry com backoff** | tolerar falha transitória de rede | push do git (2s/4s/8s/16s) |
| **Degradação graciosa** | seguir parcial em vez de parar | MCP sobe e conecta em background |
| **Bulkhead (isolamento)** | conter falhas | cada MCP é processo separado |
| **Deny-by-default** | falha segura | autorização do `/setup` e guardrail de grupos |
| **Human-in-the-loop** | conter erro em ação crítica | aprovação antes de envios/alterações |
| **Circuit breaker / timeout** | não propagar lentidão | recomendado por conector/modelo |

---

## 5. Alta disponibilidade da IA (específico)

- **Failover de modelo e de provedor:** nunca um único modelo; o roteador troca
  automaticamente em erro/limite.
- **Cache de respostas e de embeddings:** reduz dependência e custo; serve mesmo
  sob degradação do provedor.
- **Controle de rate-limit:** filas + backoff para não perder pedidos em picos.
- **Sessões/contexto persistidos:** memória de longo prazo em base replicada — a
  troca de instância não perde o contexto do usuário.

---

## 6. Continuidade de negócio (BC/DR)

- **Multi-zona / multi-região:** réplicas em zonas distintas; failover regional
  para desastres.
- **Metas explícitas — RTO e RPO:** defina, por serviço, o tempo máximo para
  voltar (RTO) e a perda máxima de dados aceitável (RPO).
- **Runbooks e ensaios:** procedimentos de recuperação documentados e
  **testados periodicamente** (game days) — backup que nunca foi restaurado não
  é backup.

---

## 7. Observabilidade e auto-recuperação

- **Health checks** em cada serviço/agente; o orquestrador reinicia/realoca o que
  falha.
- **Métricas + alertas:** disponibilidade, latência, taxa de erro, fila, custo.
- **Autoscaling:** sobe réplicas sob carga, reduz na ociosidade.
- **Self-healing:** processos que morrem são reiniciados; nós ruins são drenados.

---

## 8. Como medir

| Indicador | Significado |
|---|---|
| **Uptime / SLA** | % de tempo disponível (ex.: meta 99,9%) |
| **MTTR** | tempo médio para recuperar de uma falha |
| **MTBF** | tempo médio entre falhas |
| **RTO / RPO** | tempo de recuperação / perda de dados tolerada |
| **Taxa de sucesso de failover** | quão confiável é a troca automática |

---

## 9. Estado: implementado × a construir

**Já implementado (neste repo):**
- Reconstrução automática do ambiente (SessionStart hook), idempotente.
- Git como fonte da verdade; segredos fora do código.
- Startup de MCP tolerante a falha (degradação graciosa).
- Retry com backoff (git); deny-by-default nos agentes; isolamento por MCP.
- Documentação de continuidade (`RESILIENCIA.md`).

**A construir para HA plena de produção:**
- Réplicas multi-zona do orquestrador + balanceador e filas duráveis.
- Roteador multimodelo com failover de modelo/provedor + circuit breakers.
- Banco replicado com PITR e backups 3-2-1 testados.
- Observabilidade completa (health checks, métricas, alertas, autoscaling).
- Plano de DR com RTO/RPO e ensaios periódicos.
