output "load_balancer_ip" {
  description = "IP fixo do LB. Os hostnames nip.io abaixo já resolvem para ele automaticamente."
  value       = google_compute_global_address.claude.address
}

output "app_url" {
  value = "https://${local.app_host}"
}

output "control_url" {
  description = "Bookmark principal: acorda a VM e redireciona para o app."
  value       = "https://${local.control_host}"
}

output "iap_oauth_client_id" {
  value = google_iap_client.claude.client_id
}

output "control_service_name" {
  value = google_cloud_run_v2_service.control.name
}

output "next_steps" {
  value = <<-EOT
    DNS: nenhum passo manual — ${local.app_host} e ${local.control_host}
         já resolvem para ${google_compute_global_address.claude.address} via ${var.wildcard_dns_suffix}.

    1. Publique o serviço de controle:  bash infra/scripts/deploy-control.sh
    2. Aguarde o certificado gerenciado ficar ACTIVE (até ~20 min).
    3. Acesse https://${local.control_host} e logue com sua conta @${var.domain}.
  EOT
}
