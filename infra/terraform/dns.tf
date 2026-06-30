# Automação opcional de DNS (Cloud DNS).
# Quando manage_dns = true e você usa um domínio próprio (ex.: baita.one) servido
# por uma managed zone do Cloud DNS, o Terraform cria os registros A apontando os
# hostnames para o IP fixo do LB. Sem isso, crie os 2 registros A manualmente no
# seu provedor (o output load_balancer_ip mostra o IP).
#
# Pré-requisito: a managed zone já existe e o domínio está delegado a ela
# (NS do registrador apontando para os nameservers da zone). Crie a zone com:
#   gcloud dns managed-zones create baita-one --dns-name=baita.one. \
#       --description="baita.one" --visibility=public
# e delegue os NS no registrador do baita.one (uma vez).

resource "google_dns_record_set" "app" {
  count        = var.manage_dns ? 1 : 0
  managed_zone = var.dns_managed_zone
  name         = "${local.app_host}."
  type         = "A"
  ttl          = 300
  rrdatas      = [google_compute_global_address.claude.address]
}

resource "google_dns_record_set" "control" {
  count        = var.manage_dns ? 1 : 0
  managed_zone = var.dns_managed_zone
  name         = "${local.control_host}."
  type         = "A"
  ttl          = 300
  rrdatas      = [google_compute_global_address.claude.address]
}
