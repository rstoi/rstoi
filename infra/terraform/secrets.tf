resource "google_secret_manager_secret" "anthropic_api_key" {
  secret_id = "anthropic-api-key"
  replication {
    auto {}
  }
}

# Só cria a versão se você passar a chave via var; senão, popule manualmente:
#   echo -n "sk-ant-..." | gcloud secrets versions add anthropic-api-key --data-file=-
resource "google_secret_manager_secret_version" "anthropic_api_key" {
  count       = var.anthropic_api_key == "" ? 0 : 1
  secret      = google_secret_manager_secret.anthropic_api_key.id
  secret_data = var.anthropic_api_key
}

# Senha do code-server (gerada e guardada no Secret Manager; a VM lê no boot).
resource "random_password" "code_server" {
  length  = 32
  special = false
}

resource "google_secret_manager_secret" "code_server_password" {
  secret_id = "code-server-password"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "code_server_password" {
  secret      = google_secret_manager_secret.code_server_password.id
  secret_data = random_password.code_server.result
}
