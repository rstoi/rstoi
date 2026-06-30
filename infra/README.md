# Claude Workstation na GCP — infra

Estação Claude Code persistente na Google Cloud, acessível como **app web** de
qualquer device, atrás de **login Google restrito ao domínio `baita.ac`** (IAP).
A VM **se desliga sozinha quando ociosa** e **acorda sob demanda** ao acessar.

```
device ─HTTPS─▶ Load Balancer + IAP (consent Internal + domain:baita.ac)
                 ├── claude.baita.one ─▶ Cloud Run "control" (sempre on: status + acordar)
                 └── app.baita.one    ─▶ VM code-server:8080 (editor + terminal + noVNC)
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

# DNS no Porkbun (baita.one) via API — cria app.baita.one e claude.baita.one:
export PORKBUN_API_KEY=pk1_... PORKBUN_SECRET_API_KEY=sk1_...
make porkbun

# popule a chave da Anthropic (se não passou via tfvars):
echo -n "sk-ant-..." | gcloud secrets versions add anthropic-api-key --data-file=-
```

Aguarde o certificado gerenciado ficar `ACTIVE` (até ~20 min após a propagação).
Acesse **https://claude.baita.one**, logue com a conta `@baita.ac` → botão
**Acordar** → redirecionado ao editor.

> A trava de login em `@baita.ac` é do **IAP** (identidade Google) — independe da
> URL. `baita.one` é só o endereço. Sem domínio, dá pra usar `nip.io` (hostnames
> vazios no tfvars); com Cloud DNS, `manage_dns=true`.

## Acesso

- **https://claude.baita.one** — bookmark principal. Mostra o estado, acorda a VM,
  redireciona. Dá pra "instalar" como app (PWA).
- **https://app.baita.one** — editor (code-server) + terminal integrado com o Claude.
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
Adicione MCPs (o `desktop`/computer-use deste repo, github, whatsapp, gmail…) em
`~/.claude.json`/`.mcp.json` no `workspace`. O servidor de computer-use é
registrado como **`desktop`** — não use o nome `computer-use`, que é **reservado**
pelo Claude Code e não carrega. Ele já encontra o display virtual via `DISPLAY=:99`
(idêntico ao `.mcp.json` da raiz deste repo).

## Testes

`make test` (ou `bash test/run-all.sh`) valida localmente, sem GCP, todos os
caminhos de acesso e o Claude operando dentro deles. Ver `test/README.md`.
