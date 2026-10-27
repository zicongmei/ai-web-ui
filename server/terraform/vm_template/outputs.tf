output "instance_template_name" {
  description = "Name of the created GCP Compute Engine VM Instance Template."
  value       = google_compute_instance_template.local_llm_template.name
}

output "instance_template_self_link" {
  description = "Self-link URI of the created VM Instance Template."
  value       = google_compute_instance_template.local_llm_template.self_link
}

output "vpc_network_name" {
  description = "Name of the created VPC network."
  value       = google_compute_network.vpc_network.name
}

output "subnetwork_name" {
  description = "Name of the created regional subnetwork."
  value       = google_compute_subnetwork.subnet.name
}

output "configured_machine_type" {
  description = "The VM machine type configured in the template."
  value       = local.effective_machine_type
}

output "configured_gpu_type" {
  description = "The GPU accelerator type attached to the template ('none' if CPU-only)."
  value       = local.has_gpu ? local.normalized_gpu_type : "none"
}

output "configured_gemma_model" {
  description = "The Gemma 4 model configured to run in Ollama on the backend."
  value       = local.local_llm_model
}

output "configured_boot_disk_size_gb" {
  description = "Configured boot disk size in GB."
  value       = var.boot_disk_size_gb
}

output "gcloud_create_vm_command" {
  description = "Example gcloud command to launch a VM instance from this template."
  value       = "gcloud compute instances create local-llm-vm --project=${var.project_id} --zone=${var.region}-a --source-instance-template=${google_compute_instance_template.local_llm_template.name}"
}
