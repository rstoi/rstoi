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

# Mostra o IP do LB e descobre onde o DNS do domínio é gerenciado (nameservers).
dns:
	@echo "== IP do Load Balancer =="
	@$(TF) output -raw load_balancer_ip 2>/dev/null || echo "(rode 'make apply' antes)"
	@echo; echo "== nameservers de $(DOMAIN) (onde criar os registros A) =="
	@dig +short NS $(DOMAIN) 2>/dev/null || nslookup -type=NS $(DOMAIN) 2>/dev/null | grep nameserver || true
	@echo
	@echo "Se aparecer *.googledomains.com / ns-cloud-*.googledomains.com => Google Cloud DNS"
	@echo "(posso automatizar os registros no Terraform). Caso contrário, crie 2 registros A:"
	@echo "  A app.$(DOMAIN)    -> <IP acima>"
	@echo "  A claude.$(DOMAIN) -> <IP acima>"

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
