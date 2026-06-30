resource "google_compute_network" "claude" {
  name                    = "claude-net"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "claude" {
  name          = "claude-subnet"
  ip_cidr_range = "10.10.0.0/24"
  region        = var.region
  network       = google_compute_network.claude.id
}

# Cloud NAT — a VM não tem IP público de entrada, mas precisa de saída
# (apt, npm, GitHub, API da Anthropic). Acesso de entrada é só via IAP/LB.
resource "google_compute_router" "claude" {
  name    = "claude-router"
  region  = var.region
  network = google_compute_network.claude.id
}

resource "google_compute_router_nat" "claude" {
  name                               = "claude-nat"
  router                             = google_compute_router.claude.name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"
}

# Só o range do Load Balancer + IAP (35.191.0.0/16, 130.211.0.0/22) alcança a VM.
resource "google_compute_firewall" "allow_lb_health_and_iap" {
  name      = "claude-allow-lb-iap"
  network   = google_compute_network.claude.id
  direction = "INGRESS"

  allow {
    protocol = "tcp"
    ports    = ["8080"] # code-server (único backend exposto; proxia ttyd/noVNC internamente)
  }

  source_ranges = ["35.191.0.0/16", "130.211.0.0/22"]
  target_tags   = ["claude-workstation"]
}

# IAP TCP forwarding para SSH administrativo (sem IP público).
resource "google_compute_firewall" "allow_iap_ssh" {
  name      = "claude-allow-iap-ssh"
  network   = google_compute_network.claude.id
  direction = "INGRESS"

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = ["35.235.240.0/20"] # range fixo do IAP
  target_tags   = ["claude-workstation"]
}
