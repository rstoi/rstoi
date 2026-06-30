# Serviço de controle: serve a landing, acorda a VM (auto-start) e redireciona
# para o app quando saudável. Fica sempre disponível (Cloud Run, escala a zero),
# então funciona mesmo com a workstation desligada.

resource "google_artifact_registry_repository" "control" {
  location      = var.region
  repository_id = "claude-control"
  format        = "DOCKER"
}

resource "google_service_account" "control" {
  account_id   = "claude-control"
  display_name = "Claude Control (wake)"
}

# A função de controle pode LIGAR a workstation (e ler status), nada além.
resource "google_project_iam_member" "control_start_vm" {
  project = var.project_id
  role    = "roles/compute.instanceAdmin.v1"
  member  = "serviceAccount:${google_service_account.control.email}"
  condition {
    title      = "apenas-esta-instancia"
    expression = "resource.name == 'projects/${var.project_id}/zones/${var.zone}/instances/claude-workstation'"
  }
}

resource "google_cloud_run_v2_service" "control" {
  name     = "claude-control"
  location = var.region
  # Só recebe tráfego do Load Balancer (atrás do IAP); nunca direto da internet.
  ingress  = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  template {
    service_account = google_service_account.control.email

    containers {
      image = var.control_image

      env {
        name  = "GCP_PROJECT"
        value = var.project_id
      }
      env {
        name  = "GCP_ZONE"
        value = var.zone
      }
      env {
        name  = "INSTANCE_NAME"
        value = "claude-workstation"
      }
      env {
        name  = "APP_URL"
        value = "https://${local.app_host}"
      }
    }
  }

  lifecycle {
    # A imagem é publicada por infra/scripts/deploy-control.sh; o Terraform
    # cria/gere o serviço mas não disputa a tag da imagem.
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }
}

# IAP faz a autenticação na borda; o Cloud Run aceita o tráfego já filtrado pelo LB.
resource "google_cloud_run_v2_service_iam_member" "control_invoker" {
  name     = google_cloud_run_v2_service.control.name
  location = google_cloud_run_v2_service.control.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}
