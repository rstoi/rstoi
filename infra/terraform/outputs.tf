output "load_balancer_ip" {
  description = "Crie registros A para app_hostname e control_hostname apontando para este IP."
  value       = google_compute_global_address.claude.address
}

output "app_url" {
  value = "https://${var.app_hostname}"
}

output "control_url" {
  description = "Bookmark principal: acorda a VM e redireciona para o app."
  value       = "https://${var.control_hostname}"
}

output "iap_oauth_client_id" {
  value = google_iap_client.claude.client_id
}

output "control_service_name" {
  value = google_cloud_run_v2_service.control.name
}

output "next_steps" {
  value = <<-EOT
    1. DNS: A ${var.app_hostname}     -> ${google_compute_global_address.claude.address}
            A ${var.control_hostname} -> ${google_compute_global_address.claude.address}
    2. Publique o serviço de controle:  bash infra/scripts/deploy-control.sh
    3. Aguarde o certificado gerenciado ficar ACTIVE (até ~20 min após o DNS propagar).
    4. Acesse https://${var.control_hostname} e logue com sua conta @${var.domain}.
  EOT
}
