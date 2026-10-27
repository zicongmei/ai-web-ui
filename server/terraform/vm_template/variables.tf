variable "project_id" {
  description = "The GCP project ID where the VM instance template and firewall rules will be created."
  type        = string
}

variable "region" {
  description = "The GCP region for the instance template."
  type        = string
  default     = "us-central1"
}

variable "template_name_prefix" {
  description = "Base name prefix for the GCP Compute Engine VM Instance Template (model size and machine type are appended automatically)."
  type        = string
  default     = "local-llm"
}

variable "gpu_type" {
  description = <<-EOT
    Exact GCP GPU accelerator type to attach to the VM (e.g., "nvidia-l4", "nvidia-tesla-t4", "nvidia-tesla-v100", "nvidia-tesla-p100", "nvidia-tesla-p4", "nvidia-tesla-a100", "nvidia-a100-80gb", "nvidia-h100-80gb").
    Leave empty ("") to deploy a CPU-only VM without a GPU.
  EOT
  type        = string
  default     = ""
}

variable "machine_type" {
  description = <<-EOT
    Explicit GCP VM machine type override (e.g., "g2-standard-4", "g2-standard-8", "n4-standard-4", "n4-standard-8", "n4-highmem-8").
    If left empty (""), Terraform automatically selects a default machine type based on gpu_type ("g2-standard-8" for GPU or "n4-standard-8" when gpu_type is empty).
  EOT
  type        = string
  default     = ""
}

variable "gemma_model_size" {
  description = "The Gemma 4 model size to host on the backend (e2b, e4b, 12b, 26b, or 31b)."
  type        = string
  default     = "e4b"

  validation {
    condition     = contains(["e2b", "e4b", "12b", "26b", "31b"], var.gemma_model_size)
    error_message = "gemma_model_size must be one of: e2b, e4b, 12b, 26b, 31b."
  }
}

variable "boot_disk_size_gb" {
  description = "Boot disk size in GB (must be large enough for OS, NVIDIA drivers, and Gemma 4 model weights)."
  type        = number
  default     = 100
}

variable "boot_disk_type" {
  description = "GCP disk type override for the boot disk (e.g., hyperdisk-balanced for N4/C4, pd-balanced for G2/N1/E2). Leave empty (\"\") to select automatically based on machine_type."
  type        = string
  default     = ""
}

variable "boot_image" {
  description = "Boot OS image for the VM template."
  type        = string
  default     = "ubuntu-os-cloud/ubuntu-2204-lts"
}

variable "auth_username" {
  description = "HTTP Basic Auth username verified by Nginx on port 443."
  type        = string
  default     = "admin"
}

variable "auth_password" {
  description = "HTTP Basic Auth password verified by Nginx on port 443."
  type        = string
  sensitive   = true
}

variable "ollama_num_ctx" {
  description = "Context window length (tokens) configured for Ollama inference."
  type        = number
  default     = 8192
}

variable "use_spot_vm" {
  description = "Whether to configure the VM template as a Spot (preemptible) VM for ~60-70% lower hourly cost."
  type        = bool
  default     = false
}
