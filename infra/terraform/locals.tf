# Hostnames: se app_hostname/control_hostname forem vazios, derivamos do IP fixo
# do Load Balancer via DNS curinga (nip.io/sslip.io). Assim NÃO é preciso ter
# acesso ao DNS do baita.ac (que está no Cloudflare) — o nome resolve sozinho
# para o IP reservado. A trava de login em @baita.ac é do IAP, independe do nome.
locals {
  ip_dashed = replace(google_compute_global_address.claude.address, ".", "-")

  app_host = var.app_hostname != "" ? var.app_hostname : "app.${local.ip_dashed}.${var.wildcard_dns_suffix}"

  control_host = var.control_hostname != "" ? var.control_hostname : "claude.${local.ip_dashed}.${var.wildcard_dns_suffix}"
}
