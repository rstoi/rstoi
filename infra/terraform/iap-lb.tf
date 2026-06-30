# ─────────────────────────────────────────────────────────────────────────────
# OAuth consent + IAP
# A consent screen é "Internal": só contas da organização baita.ac veem o login.
# (google_iap_brand só permite criação de brand INTERNAL via Terraform — exatamente
#  o que queremos. Se já existir um brand no projeto, importe-o em vez de criar.)
# ─────────────────────────────────────────────────────────────────────────────
resource "google_iap_brand" "claude" {
  support_email     = var.iap_support_email
  application_title = "Claude Workstation"
}

resource "google_iap_client" "claude" {
  display_name = "Claude Workstation"
  brand        = google_iap_brand.claude.name
}

# ── Endereço público e DNS ───────────────────────────────────────────────────
resource "google_compute_global_address" "claude" {
  name = "claude-lb-ip"
}

resource "google_compute_managed_ssl_certificate" "claude" {
  name = "claude-cert"
  managed {
    domains = [var.app_hostname, var.control_hostname]
  }
}

# ── Backend 1: a VM (code-server na 8080) ────────────────────────────────────
resource "google_compute_instance_group" "claude" {
  name      = "claude-ig"
  zone      = var.zone
  instances = [google_compute_instance.claude.self_link]

  named_port {
    name = "http"
    port = 8080
  }
}

resource "google_compute_health_check" "claude" {
  name = "claude-hc"
  # code-server responde 302 em / quando saudável; checamos a porta TCP para
  # tolerar a VM desligada (auto-stop) sem derrubar o LB inteiro.
  tcp_health_check {
    port = 8080
  }
  check_interval_sec  = 10
  timeout_sec         = 5
  healthy_threshold   = 1
  unhealthy_threshold = 3
}

resource "google_compute_backend_service" "app" {
  name                  = "claude-app-backend"
  protocol              = "HTTP"
  port_name             = "http"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  timeout_sec           = 86400 # sessões longas / websockets do terminal
  health_checks         = [google_compute_health_check.claude.id]

  backend {
    group = google_compute_instance_group.claude.id
  }

  iap {
    enabled              = true
    oauth2_client_id     = google_iap_client.claude.client_id
    oauth2_client_secret = google_iap_client.claude.secret
  }
}

# ── Backend 2: a função de controle (landing + wake), serverless, sempre on ──
resource "google_compute_region_network_endpoint_group" "control" {
  name                  = "claude-control-neg"
  region                = var.region
  network_endpoint_type = "SERVERLESS"
  cloud_run {
    service = google_cloud_run_v2_service.control.name
  }
}

resource "google_compute_backend_service" "control" {
  name                  = "claude-control-backend"
  protocol              = "HTTP"
  load_balancing_scheme = "EXTERNAL_MANAGED"

  backend {
    group = google_compute_region_network_endpoint_group.control.id
  }

  iap {
    enabled              = true
    oauth2_client_id     = google_iap_client.claude.client_id
    oauth2_client_secret = google_iap_client.claude.secret
  }
}

# ── Roteamento por host ──────────────────────────────────────────────────────
resource "google_compute_url_map" "claude" {
  name            = "claude-urlmap"
  default_service = google_compute_backend_service.control.id

  host_rule {
    hosts        = [var.app_hostname]
    path_matcher = "app"
  }
  host_rule {
    hosts        = [var.control_hostname]
    path_matcher = "control"
  }

  path_matcher {
    name            = "app"
    default_service = google_compute_backend_service.app.id
  }
  path_matcher {
    name            = "control"
    default_service = google_compute_backend_service.control.id
  }
}

resource "google_compute_target_https_proxy" "claude" {
  name             = "claude-https-proxy"
  url_map          = google_compute_url_map.claude.id
  ssl_certificates = [google_compute_managed_ssl_certificate.claude.id]
}

resource "google_compute_global_forwarding_rule" "claude" {
  name                  = "claude-fr"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  port_range            = "443"
  target                = google_compute_target_https_proxy.claude.id
  ip_address            = google_compute_global_address.claude.id
}

# ─────────────────────────────────────────────────────────────────────────────
# A TRAVA DE DOMÍNIO: qualquer @baita.ac entra; ninguém de fora entra.
# Aplicada nos dois backends IAP.
# ─────────────────────────────────────────────────────────────────────────────
resource "google_iap_web_backend_service_iam_member" "app_domain" {
  project             = var.project_id
  web_backend_service = google_compute_backend_service.app.name
  role                = "roles/iap.httpsResourceAccessor"
  member              = "domain:${var.domain}"
}

resource "google_iap_web_backend_service_iam_member" "control_domain" {
  project             = var.project_id
  web_backend_service = google_compute_backend_service.control.name
  role                = "roles/iap.httpsResourceAccessor"
  member              = "domain:${var.domain}"
}
