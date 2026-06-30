# Deploy da Claude Workstation — atalhos encadeados.
# Uso típico (no Mac, com gcloud autenticado):
#   make preflight   # checa ferramentas + login + projeto
#   make apply       # cria a infra
#   make control     # publica o serviço de controle
#   make secret      # grava a chave da Anthropic no Secret Manager
#   make dns         # mostra o IP do LB e onde está o DNS do domínio
#   make status      # certificado + estado da VM
#
# Variáveis (sobrescreva: make apply PROJECT=meu-proj REGION=us-central1):
PROJECT ?= $(shell gcloud config get-value project 2>/dev/null)
REGION  ?= us-central1
DOMAIN  ?= baita.ac
TF       = terraform -chdir=terraform

.PHONY: preflight init plan apply control secret dns status destroy

preflight:
	@echo "== ferramentas =="
	@command -v terraform >/dev/null || { echo "FALTA terraform (brew install terraform)"; exit 1; }
	@command -v gcloud    >/dev/null || { echo "FALTA gcloud (brew install google-cloud-sdk)"; exit 1; }
	@command -v docker    >/dev/null || { echo "FALTA docker (para o build do control)"; exit 1; }
	@echo "== conta gcloud =="
	@gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep . \
		|| { echo "NAO autenticado -> rode: gcloud auth login && gcloud auth application-default login"; exit 1; }
	@echo "== projeto: $(PROJECT) =="
	@test -n "$(PROJECT)" || { echo "defina o projeto -> gcloud config set project <id>"; exit 1; }
	@echo "OK — pronto para 'make apply'."

init:
	@$(TF) init

plan: init
	@$(TF) plan

apply: init
	@$(TF) apply

control:
	@GCP_PROJECT=$(PROJECT) GCP_REGION=$(REGION) bash scripts/deploy-control.sh

secret:
	@printf "Cole a chave da Anthropic (sk-ant-...) e Enter: "; \
	read -rs KEY; echo; \
	printf "%s" "$$KEY" | gcloud secrets versions add anthropic-api-key --data-file=- --project $(PROJECT) \
		&& echo "chave gravada no Secret Manager."

# Hostnames são derivados do IP fixo via nip.io — nenhum registro manual.
dns:
	@echo "== IP do Load Balancer =="
	@$(TF) output -raw load_balancer_ip 2>/dev/null || { echo "(rode 'make apply' antes)"; exit 0; }
	@echo; echo "== URLs (nip.io resolve para o IP acima automaticamente) =="
	@echo "  app:     $$($(TF) output -raw app_url 2>/dev/null)"
	@echo "  control: $$($(TF) output -raw control_url 2>/dev/null)"
	@echo; echo "Sem passo de DNS. Login restrito a @$(DOMAIN) pelo IAP."

status:
	@echo "== certificado gerenciado =="
	@gcloud compute ssl-certificates describe claude-cert --global \
		--format="value(managed.status, managed.domainStatus)" --project $(PROJECT) 2>/dev/null \
		|| echo "(cert ainda não criado)"
	@echo "== estado da VM =="
	@gcloud compute instances describe claude-workstation --zone $(shell $(TF) output -raw 2>/dev/null; echo us-central1-a) \
		--format="value(status)" --project $(PROJECT) 2>/dev/null || echo "(VM ainda não criada)"
	@echo "== URLs =="
	@$(TF) output -raw control_url 2>/dev/null && echo || true

destroy:
	@$(TF) destroy
