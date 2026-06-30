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

## Passo 4 — DNS (baita.one no Porkbun, via API)

`baita.one` está no Porkbun. Com as chaves da API no ambiente, os registros A
são criados automaticamente apontando para o IP fixo do LB.

```bash
export PORKBUN_API_KEY=pk1_...
export PORKBUN_SECRET_API_KEY=sk1_...
make porkbun       # cria/atualiza app.baita.one e claude.baita.one -> IP do LB
```

> Login segue restrito a `@baita.ac` pelo **IAP** (identidade Google) — independe
> da URL. Para logar com `@baita.one` (se for Workspace), troque `domain="baita.one"`
> no tfvars.
>
> Alternativas (sem Porkbun): `nip.io` derivado do IP (hostnames vazios no tfvars),
> ou Cloud DNS (`manage_dns=true`). Veja `terraform.tfvars.example`.

## Passo 5 — Aguardar e validar

```bash
make status       # certificado gerenciado deve virar ACTIVE (até ~20 min)
```

Quando o cert estiver `ACTIVE`:
1. Abra a **control_url** (`https://claude.<ip>.nip.io`, veja `make dns`) → login `@baita.ac`.
2. Botão **Acordar** → redireciona ao editor quando a VM sobe (~20–40 s).
3. Editor + terminal com a sessão do Claude já viva; `…/proxy/6080/vnc.html` para
   ver o Chromium/computer-use ao vivo.

---

## Checkpoints humanos (resumo)

| 🧑 | O quê | Por quê |
|----|-------|---------|
| Passo 0 | `gcloud auth login` + billing | identidade e custo são seus |

DNS não é mais checkpoint (nip.io resolve sozinho). Todo o resto o Claude CLI
executa e itera (plan/apply, build, secret, status).

## Manutenção

- **Derrubar tudo:** `make destroy`.
- **Trocar tamanho da VM / tempo de ociosidade:** edite `terraform.tfvars` e
  `make apply`.
- **Adicionar MCPs** (computer-use, github, whatsapp…): na VM, em
  `~/.claude.json` do usuário `claude` (o `computer-use` já acha o `DISPLAY=:99`).
