# Deploy guiado — Claude Workstation na GCP

Runbook para rodar **com o Claude Code CLI no seu Mac**. O Claude executa os
comandos; **você** só atua nos 3 checkpoints humanos marcados com 🧑 (login,
billing, DNS). Atalhos no `infra/Makefile`.

> Como começar no Mac:
> ```bash
> git checkout claude/gcloud-claude-remote-platform-81stc4
> cd infra
> claude
> # peça: "siga o DEPLOY.md e faça o deploy, parando nos checkpoints 🧑"
> ```

---

## Pré-requisitos

- Projeto GCP **dentro da organização do Workspace `baita.ac`** (obrigatório para
  a consent screen Internal do IAP).
- Você com papel de Owner/Editor + admin de IAP no projeto.

## Passo 0 — 🧑 Autenticação (humano)

```bash
brew install terraform google-cloud-sdk   # se faltar
gcloud auth login                         # 🧑 abre o navegador, você loga
gcloud auth application-default login     # 🧑 idem (credencial p/ o Terraform)
gcloud config set project <SEU_PROJECT_ID>
```

🧑 **Billing:** garanta que o projeto tem billing ativo (a VM e o LB são pagos).

Valida tudo:
```bash
make preflight
```

## Passo 1 — Criar a infra

```bash
cp terraform/terraform.tfvars.example terraform/terraform.tfvars
# edite project_id e, se quiser, hostnames/machine_type
make apply        # terraform apply
```

Isso cria: rede privada + Cloud NAT, VM (provisiona sozinha no boot), LB HTTPS,
IAP (consent Internal + `domain:baita.ac`), Cloud Run de controle (com imagem
placeholder por ora), Secret Manager e Artifact Registry.

## Passo 2 — Publicar o serviço de controle

```bash
make control      # build + push da imagem real e aponta o Cloud Run pra ela
```

## Passo 3 — Chave da Anthropic

```bash
make secret       # cola a sk-ant-... (vai para o Secret Manager)
```

## Passo 4 — 🧑 DNS

```bash
make dns          # mostra o IP do LB e os nameservers de baita.ac
```

- Se os nameservers forem `*.googledomains.com` → é **Google Cloud DNS**: peça ao
  Claude para automatizar os registros A no Terraform (ele adiciona um
  `google_dns_record_set` e re-aplica).
- Senão → 🧑 crie 2 registros A no seu provedor (Registro.br, Cloudflare, etc.):
  ```
  A app.baita.ac    -> <IP do LB>
  A claude.baita.ac -> <IP do LB>
  ```

## Passo 5 — Aguardar e validar

```bash
make status       # certificado gerenciado deve virar ACTIVE (até ~20 min pós-DNS)
```

Quando o cert estiver `ACTIVE`:
1. Abra **https://claude.baita.ac** → login `@baita.ac`.
2. Botão **Acordar** → redireciona ao editor quando a VM sobe (~20–40 s).
3. Editor + terminal com a sessão do Claude já viva; `…/proxy/6080/vnc.html` para
   ver o Chromium/computer-use ao vivo.

---

## Checkpoints humanos (resumo)

| 🧑 | O quê | Por quê |
|----|-------|---------|
| Passo 0 | `gcloud auth login` + billing | identidade e custo são seus |
| Passo 4 | registros A do DNS | a menos que `baita.ac` esteja no Cloud DNS |

Todo o resto o Claude CLI executa e itera (plan/apply, build, secret, status).

## Manutenção

- **Derrubar tudo:** `make destroy`.
- **Trocar tamanho da VM / tempo de ociosidade:** edite `terraform.tfvars` e
  `make apply`.
- **Adicionar MCPs** (computer-use, github, whatsapp…): na VM, em
  `~/.claude.json` do usuário `claude` (o `computer-use` já acha o `DISPLAY=:99`).
