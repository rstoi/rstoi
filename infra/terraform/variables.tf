variable "project_id" {
  type        = string
  description = "ID do projeto GCP (deve pertencer à organização do Workspace baita.ac)."
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "zone" {
  type    = string
  default = "us-central1-a"
}

variable "domain" {
  type        = string
  description = "Domínio do Google Workspace autorizado a entrar (qualquer e-mail @este-domínio)."
  default     = "baita.ac"
}

variable "app_hostname" {
  type        = string
  description = "Hostname público do app (code-server/editor/terminal). Ex.: app.baita.ac"
  default     = "app.baita.ac"
}

variable "control_hostname" {
  type        = string
  description = "Hostname da landing/wake (acorda a VM e redireciona). Ex.: claude.baita.ac"
  default     = "claude.baita.ac"
}

variable "machine_type" {
  type    = string
  default = "e2-standard-4"
}

variable "disk_size_gb" {
  type    = number
  default = 80
}

variable "disk_type" {
  type    = string
  default = "pd-ssd"
}

variable "iap_support_email" {
  type        = string
  description = "E-mail de suporte da OAuth consent screen (precisa ser você ou um grupo do qual você é dono)."
  default     = "renato@baita.ac"
}

variable "idle_shutdown_minutes" {
  type        = number
  description = "Minutos sem conexão ativa antes de a VM se desligar sozinha."
  default     = 30
}

variable "anthropic_api_key" {
  type        = string
  description = "Chave da Anthropic. Deixe vazio para popular o Secret Manager manualmente."
  default     = ""
  sensitive   = true
}

variable "control_image" {
  type        = string
  description = "Imagem do serviço de controle. Placeholder no 1º apply; deploy-control.sh publica a real."
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}
