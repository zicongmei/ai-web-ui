terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.0.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  normalized_gpu_type = trimspace(var.gpu_type)
  has_gpu             = local.normalized_gpu_type != ""

  # Default machine type per GPU family when var.machine_type is not explicitly provided
  default_gpu_machine_type = (
    local.normalized_gpu_type == "nvidia-l4" ? "g2-standard-8" :
    local.normalized_gpu_type == "nvidia-tesla-a100" ? "a2-highgpu-1g" :
    local.normalized_gpu_type == "nvidia-a100-80gb" ? "a2-ultragpu-1g" :
    local.normalized_gpu_type == "nvidia-h100-80gb" ? "a3-highgpu-1g" :
    "n1-standard-8" # Compatible with nvidia-tesla-t4, nvidia-tesla-v100, nvidia-tesla-p100, nvidia-tesla-p4
  )

  effective_machine_type = var.machine_type != "" ? var.machine_type : (
    local.has_gpu ? local.default_gpu_machine_type : "n4-standard-8"
  )

  # N4 and C4 series require Hyperdisk (hyperdisk-balanced); G2/N1/E2 use Persistent Disk (pd-balanced)
  requires_hyperdisk = startswith(local.effective_machine_type, "n4-") || startswith(local.effective_machine_type, "c4-")
  effective_boot_disk_type = var.boot_disk_type != "" ? var.boot_disk_type : (
    local.requires_hyperdisk ? "hyperdisk-balanced" : "pd-balanced"
  )

  # Detect whether GPU scheduling rules apply
  is_gpu_instance = local.has_gpu || startswith(local.effective_machine_type, "g2-") || startswith(local.effective_machine_type, "a2-") || startswith(local.effective_machine_type, "a3-")

  local_llm_model = "gemma4:${var.gemma_model_size}"
  network_tag     = "local-llm-https-server"

  # Instance template name_prefix includes prefix, model size, and effective VM machine type (max 37 chars for GCP name_prefix)
  instance_template_name_prefix = substr("${var.template_name_prefix}-${var.gemma_model_size}-${local.effective_machine_type}-", 0, 37)

  # Embed server/backend and server/frontend files (gzip + base64) so the VM template is 100% self-contained on boot
  embedded_files = {
    "/opt/ai-web-ui/server/backend/requirements.txt"             = base64gzip(file("${path.module}/../../backend/requirements.txt"))
    "/opt/ai-web-ui/server/backend/main.py"                      = base64gzip(file("${path.module}/../../backend/main.py"))
    "/opt/ai-web-ui/server/backend/gemma-backend.service"        = base64gzip(file("${path.module}/../../backend/gemma-backend.service"))
    "/opt/ai-web-ui/server/backend/nginx-ai-web-ui.conf"         = base64gzip(file("${path.module}/../../backend/nginx-ai-web-ui.conf"))
    "/opt/ai-web-ui/server/backend/setup.sh"                     = base64gzip(file("${path.module}/../../backend/setup.sh"))
    "/opt/ai-web-ui/server/frontend/index.html"                  = base64gzip(file("${path.module}/../../frontend/index.html"))
    "/opt/ai-web-ui/server/frontend/style.css"                   = base64gzip(file("${path.module}/../../frontend/style.css"))
    "/opt/ai-web-ui/server/frontend/multi-party-chat/index.html" = base64gzip(file("${path.module}/../../frontend/multi-party-chat/index.html"))
    "/opt/ai-web-ui/server/frontend/multi-party-chat/style.css"  = base64gzip(file("${path.module}/../../frontend/multi-party-chat/style.css"))
    "/opt/ai-web-ui/server/frontend/multi-party-chat/chat.js"    = base64gzip(file("${path.module}/../../frontend/multi-party-chat/chat.js"))
    "/opt/ai-web-ui/server/frontend/rpg/index.html"              = base64gzip(file("${path.module}/../../frontend/rpg/index.html"))
    "/opt/ai-web-ui/server/frontend/rpg/style.css"               = base64gzip(file("${path.module}/../../frontend/rpg/style.css"))
    "/opt/ai-web-ui/server/frontend/rpg/game.js"                 = base64gzip(file("${path.module}/../../frontend/rpg/game.js"))
  }

  startup_script = <<-EOT
    #!/usr/bin/env bash
    set -euo pipefail
    export HOME="$${HOME:-/root}"

    if [ -f /var/lib/local-llm-initialized ]; then
      echo "Local LLM server already initialized. Ensuring services are running..."
      systemctl start ollama || true
      systemctl start gemma-backend.service || true
      systemctl start nginx || true
      exit 0
    fi

    mkdir -p /opt/ai-web-ui/server/backend
    mkdir -p /opt/ai-web-ui/server/frontend/multi-party-chat
    mkdir -p /opt/ai-web-ui/server/frontend/rpg

    %{for target_path, b64_content in local.embedded_files~}
    echo "${b64_content}" | base64 -d | gunzip > "${target_path}"
    %{endfor~}

    chmod +x /opt/ai-web-ui/server/backend/setup.sh

    export GEMMA_MODEL_SIZE="${var.gemma_model_size}"
    export LOCAL_LLM_MODEL="${local.local_llm_model}"
    export OLLAMA_NUM_CTX="${var.ollama_num_ctx}"
    export AUTH_USERNAME=${jsonencode(var.auth_username)}
    export AUTH_PASSWORD=${jsonencode(var.auth_password)}

    bash /opt/ai-web-ui/server/backend/setup.sh
    touch /var/lib/local-llm-initialized
  EOT
}

# Dedicated VPC Network
resource "google_compute_network" "vpc_network" {
  name                    = "${var.template_name_prefix}-vpc"
  auto_create_subnetworks = false
  description             = "Dedicated VPC network for Local LLM Web UI instances"
}

# Regional Subnetwork
resource "google_compute_subnetwork" "subnet" {
  name          = "${var.template_name_prefix}-subnet"
  ip_cidr_range = "10.10.0.0/24"
  region        = var.region
  network       = google_compute_network.vpc_network.id
}

# Firewall rule allowing HTTPS (port 443) and HTTP redirect (port 80)
resource "google_compute_firewall" "allow_https" {
  name    = "${var.template_name_prefix}-allow-https"
  network = google_compute_network.vpc_network.id

  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = [local.network_tag]
  description   = "Allow inbound HTTP (80) and HTTPS (443) traffic to Local LLM Web UI instances"
}

# Firewall rule allowing SSH (port 22) for instance administration
resource "google_compute_firewall" "allow_ssh" {
  name    = "${var.template_name_prefix}-allow-ssh"
  network = google_compute_network.vpc_network.id

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = [local.network_tag]
  description   = "Allow inbound SSH (22) traffic to Local LLM Web UI instances"
}

# GCP Compute Engine VM Instance Template (does not launch a running VM)
resource "google_compute_instance_template" "local_llm_template" {
  name_prefix  = local.instance_template_name_prefix
  description  = "VM Instance Template for hosting Gemma 4 (${local.local_llm_model}) on ${local.effective_machine_type} with Local LLM Web UI on port 443"
  machine_type = local.effective_machine_type
  region       = var.region

  tags = [local.network_tag]

  disk {
    source_image = var.boot_image
    auto_delete  = true
    boot         = true
    disk_size_gb = var.boot_disk_size_gb
    disk_type    = local.effective_boot_disk_type
  }

  network_interface {
    network    = google_compute_network.vpc_network.id
    subnetwork = google_compute_subnetwork.subnet.id
    # Assign ephemeral public IP when a VM is created from this template
    access_config {
      network_tier = "PREMIUM"
    }
  }

  # Attach the specified GPU when var.gpu_type is defined
  dynamic "guest_accelerator" {
    for_each = local.has_gpu ? [local.normalized_gpu_type] : []
    content {
      type  = guest_accelerator.value
      count = 1
    }
  }

  scheduling {
    # GPU instances and Spot VMs require TERMINATE on host maintenance
    on_host_maintenance = (local.is_gpu_instance || var.use_spot_vm) ? "TERMINATE" : "MIGRATE"
    automatic_restart   = var.use_spot_vm ? false : true
    preemptible         = var.use_spot_vm
    provisioning_model  = var.use_spot_vm ? "SPOT" : "STANDARD"
  }

  metadata = {
    startup-script   = local.startup_script
    gemma-model-size = var.gemma_model_size
    local-llm-model  = local.local_llm_model
    gpu-type         = local.has_gpu ? local.normalized_gpu_type : "none"
  }

  lifecycle {
    create_before_destroy = true
  }
}
