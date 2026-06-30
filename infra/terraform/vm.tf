resource "google_service_account" "claude_vm" {
  account_id   = "claude-workstation"
  display_name = "Claude Workstation VM"
}

# A própria VM pode parar-se (auto-stop por ociosidade) e ler segredos.
resource "google_project_iam_member" "vm_self_stop" {
  project = var.project_id
  role    = "roles/compute.instanceAdmin.v1"
  member  = "serviceAccount:${google_service_account.claude_vm.email}"
  condition {
    title       = "apenas-esta-instancia"
    description = "Restringe ações de compute à própria workstation."
    expression  = "resource.name == 'projects/${var.project_id}/zones/${var.zone}/instances/claude-workstation'"
  }
}

resource "google_project_iam_member" "vm_secrets" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.claude_vm.email}"
}

resource "google_compute_address" "claude_internal" {
  name         = "claude-internal-ip"
  subnetwork   = google_compute_subnetwork.claude.id
  address_type = "INTERNAL"
  region       = var.region
}

resource "google_compute_instance" "claude" {
  name         = "claude-workstation"
  machine_type = var.machine_type
  zone         = var.zone
  tags         = ["claude-workstation"]

  # Permite que o auto-stop interno desligue sem o Terraform "recriar" no apply.
  allow_stopping_for_update = true

  boot_disk {
    initialize_params {
      image = "projects/ubuntu-os-cloud/global/images/family/ubuntu-2404-lts-amd64"
      size  = var.disk_size_gb
      type  = var.disk_type
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.claude.id
    network_ip = google_compute_address.claude_internal.address
    # Sem access_config => sem IP público. Saída via Cloud NAT.
  }

  service_account {
    email  = google_service_account.claude_vm.email
    scopes = ["cloud-platform"]
  }

  metadata = {
    enable-oslogin        = "TRUE"
    idle-shutdown-minutes = tostring(var.idle_shutdown_minutes)
    startup-script        = file("${path.module}/../scripts/startup.sh")
  }

  lifecycle {
    # O estado parado/rodando é gerido pelo auto-stop, não pelo Terraform.
    ignore_changes = [metadata["created-by"]]
  }
}
