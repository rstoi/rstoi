# Claude Workstation na GCP — infra

Estação Claude Code persistente na Google Cloud, acessível como **app web** de
qualquer device, atrás de **login Google restrito ao domínio `baita.ac`** (IAP).
A VM **se desliga sozinha quando ociosa** e **acorda sob demanda** ao acessar.

```
device ─HTTPS─▶ Load Balancer + IAP (consent Internal + domain:baita.ac)
                 ├── claude.baita.ac ─▶ Cloud Run "control"  (sempre on: status + acordar)
                 └── app.baita.ac    ─▶ VM code-server:8080  (editor + terminal + noVNC)
                                          ├─ Xvfb :99 + fluxbox + Chromium/Playwright
                                          ├─ computer-use MCP, github, whatsapp…
                                          ├─ tmux "claude"  (sessão sempre viva)
                                          └─ auto-stop por ociosidade
```

## Componentes

| Arquivo | O quê |
|---|---|
| `terraform/` | VM, rede privada + Cloud NAT, LB HTTPS, IAP, trava de domínio, Cloud Run de controle, Secret Manager, Artifact Registry |
| `scripts/startup.sh` | provisiona a VM no boot: display virtual, Chromium, code-server, ttyd, noVNC, sessão Claude, auto-stop (tudo via systemd) |
| `scripts/deploy-control.sh` | build & deploy do serviço de controle (landing + wake) |
| `control/` | app Node do serviço de controle (status / wake / landing PWA) |

## Deploy

Pré-requisitos: `gcloud` autenticado, `terraform`, e um **projeto GCP dentro da
organização do Workspace `baita.ac`** (necessário para a consent screen Internal).

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # edite project_id, hostnames…

terraform init
terraform apply          # cria tudo (control roda imagem placeholder)

# publica a imagem real do serviço de controle:
GCP_PROJECT=<proj> GCP_REGION=us-central1 bash ../scripts/deploy-control.sh

# DNS: aponte os dois hostnames para o IP do LB (output load_balancer_ip)
#   A app.baita.ac     -> <IP>
#   A claude.baita.ac  -> <IP>

# popule a chave da Anthropic (se não passou via tfvars):
echo -n "sk-ant-..." | gcloud secrets versions add anthropic-api-key --data-file=-
```

Aguarde o certificado gerenciado ficar `ACTIVE` (até ~20 min após o DNS propagar).
Acesse **https://claude.baita.ac**, logue com a conta `@baita.ac` → botão **Acordar**
→ redirecionado ao editor.

## Acesso

- **https://claude.baita.ac** — bookmark principal. Mostra o estado, acorda a VM,
  redireciona. Dá pra "instalar" como app (Adicionar à tela inicial → PWA).
- **https://app.baita.ac** — editor (code-server) + terminal integrado com o Claude.
  - `…/proxy/7681/` — só o terminal (`tmux claude`).
  - `…/proxy/6080/vnc.html` — ver o Chromium/computer-use ao vivo.
- **SSH admin** (sem IP público): `gcloud compute ssh claude-workstation --tunnel-through-iap`.

## Segurança

- Sem IP público de entrada na VM; só o LB (pós-IAP) alcança a porta 8080.
- Consent screen **Internal** + IAM `domain:baita.ac` → qualquer `@baita.ac` entra,
  ninguém de fora. Controle pelo Admin do Workspace.
- Segredos no **Secret Manager**; service accounts de privilégio mínimo (a VM só
  pode parar a si mesma; o control só pode ligar a VM).

## Custo (estimativa)

`e2-standard-4` + disco 80 GB SSD, **com auto-stop**: ~**US$ 20–40/mês** em uso
típico. Sempre ligada seria ~US$ 110–130/mês. Ajuste `idle_shutdown_minutes` e
`machine_type` no `terraform.tfvars`.

## MCPs na workstation

A sessão `tmux claude` roda o Claude Code com o `~/.claude` do usuário `claude`.
Adicione MCPs (computer-use deste repo, github, whatsapp, gmail…) em
`~/.claude.json`/`.mcp.json` no `workspace`. O `computer-use` já encontra o display
virtual via `DISPLAY=:99` (idêntico ao `.mcp.json` da raiz deste repo).
