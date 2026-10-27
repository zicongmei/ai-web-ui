# GCP VM Instance Template for Gemma 4 Local LLM (`server/terraform/vm_template`)

This Terraform configuration creates a **GCP Compute Engine VM Instance Template (`google_compute_instance_template`)** and HTTPS firewall rule (`port 443` / `port 80`) for deploying the **Gemma 4** backend (`server/backend`) and Local LLM web UI (`server/frontend` — Multi-Party Chat and AI RPG Game).

It includes:
- **Self-Signed TLS Certificate** on port `443` (with HTTP `80 -> 443` redirect)
- **Nginx HTTP Basic Authentication** (`auth_username` and `auth_password`)
- **Nginx Rate Limiting** capped at **500 requests/second** (`rate=500r/s`, HTTP `429` when exceeded)

> **Note:** Creating an Instance Template incurs **$0 compute cost** until you launch a VM instance from the template.

---

## 1. Possible `gpu_type` Values in GCP

Set `gpu_type = ""` in `terraform.tfvars` to run **CPU-only without a GPU**. To attach a GPU, set `gpu_type` to one of the exact GCP accelerator identifiers below:

| `gpu_type` Value | GPU Model | GPU VRAM | Compatible Machine Series | Default `machine_type` (if left `""`) | Best Gemma 4 Models | GPU-Only Cost (`us-central1` On-Demand / Spot) | Total VM + GPU Cost (`us-central1` On-Demand / Spot) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `""` | **None (CPU-Only)** | 0 GB (uses System RAM) | `N4`, `C4`, `C3`, `E2`, `N2` | `n4-standard-8` (32 GB RAM) | `e2b`, `e4b`, `12b`, `26b` | **$0.00 / hr** | **~$0.36 / hr** (~$0.11 / hr Spot) |
| `"nvidia-l4"` | **NVIDIA L4** (Ada Lovelace) | **24 GB GDDR6** | `g2-standard-*` (`4`, `8`, `12`, `16`, `32`) | `g2-standard-8` (32 GB RAM) | `e2b`, `e4b`, **`12b`**, **`26b`**, `31b` | **~$0.56 / hr** (~$0.22 / hr Spot, bundled in `g2-*`) | **~$0.85 / hr** (~$0.34–$0.51 / hr Spot) |
| `"nvidia-tesla-t4"` | **NVIDIA Tesla T4** (Turing) | **16 GB GDDR6** | `n1-standard-*`, `n1-highmem-*` | `n1-standard-8` (30 GB RAM) | `e2b`, `e4b`, `12b` | **$0.35 / hr** (~$0.11 / hr Spot) | **~$0.73 / hr** (~$0.19 / hr Spot) |
| `"nvidia-tesla-p4"` | **NVIDIA Tesla P4** (Pascal) | **8 GB GDDR5** | `n1-standard-*`, `n1-highmem-*` | `n1-standard-8` (30 GB RAM) | `e2b`, `e4b` | **$0.60 / hr** (~$0.22 / hr Spot) | **~$0.98 / hr** (~$0.30 / hr Spot) |
| `"nvidia-tesla-p100"` | **NVIDIA Tesla P100** (Pascal) | **16 GB HBM2** | `n1-standard-*`, `n1-highmem-*` | `n1-standard-8` (30 GB RAM) | `e2b`, `e4b`, `12b` | **$1.46 / hr** (~$0.43 / hr Spot) | **~$1.84 / hr** (~$0.51 / hr Spot) |
| `"nvidia-tesla-v100"` | **NVIDIA Tesla V100** (Volta) | **16 GB HBM2** | `n1-standard-*`, `n1-highmem-*` | `n1-standard-8` (30 GB RAM) | `e2b`, `e4b`, `12b` | **$2.48 / hr** (~$0.74 / hr Spot) | **~$2.86 / hr** (~$0.82 / hr Spot) |
| `"nvidia-tesla-a100"` | **NVIDIA A100 40GB** (Ampere) | **40 GB HBM2** | `a2-highgpu-*` (`1g`, `2g`, `4g`, `8g`) | `a2-highgpu-1g` (12 vCPU, 85 GB RAM) | `26b`, **`31b`** (long context / FP16) | **~$2.93 / hr** (~$1.17 / hr Spot, bundled in `a2-*`) | **~$3.67 / hr** (~$1.47–$2.20 / hr Spot) |
| `"nvidia-a100-80gb"` | **NVIDIA A100 80GB** (Ampere) | **80 GB HBM2e** | `a2-ultragpu-*` (`1g`, `2g`, `4g`, `8g`) | `a2-ultragpu-1g` (12 vCPU, 170 GB RAM) | `31b` (full precision BF16 / 256K ctx) | **~$3.93 / hr** (~$1.57 / hr Spot, bundled in `a2-*`) | **~$5.07 / hr** (~$2.03–$3.04 / hr Spot) |
| `"nvidia-h100-80gb"` | **NVIDIA H100 80GB** (Hopper) | **80 GB HBM3** | `a3-highgpu-*` (`1g`, `2g`, `4g`, `8g`) | `a3-highgpu-1g` (26 vCPU, 234 GB RAM) | `31b` (high-concurrency BF16/FP8) | **~$9.80 / hr** (bundled in `a3-*`) | **~$11.06 / hr** (~$6.60 / hr Spot) |

> **Important GCP Rule:** Each GPU type only works with its compatible machine series (`nvidia-l4` requires `g2-*`; `t4`/`v100`/`p100`/`p4` require `n1-*`; `a100` requires `a2-*`; `h100` requires `a3-*`). If you leave `machine_type = ""`, Terraform automatically selects the matching machine series for your `gpu_type`.

---

## 2. Selecting the Right VM Instance Type for Each Gemma 4 Model

When running Gemma 4 via Ollama (4-bit `Q4_K_M` quantization by default), memory capacity (RAM/VRAM) and memory bandwidth determine whether a model fits and how fast it generates tokens.

| Gemma 4 Size (`gemma_model_size`) | Architecture | Weights Size (Q4) | Total Memory Needed (with 8K Context) | Recommended CPU-Only VM (`gpu_type = ""`) | Recommended GPU Setup | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`e2b`** | Dense (Effective 2B) | ~1.8 GB | **4 – 6 GB** | `n4-standard-2` (2 vCPU, 8 GB RAM) or `e2-standard-2` (8 GB) | `gpu_type = "nvidia-tesla-t4"` (`n1-standard-4`) or `"nvidia-l4"` (`g2-standard-4`) | Fast even on small 2–4 vCPU VMs |
| **`e4b`** | Dense (Effective 4B) | ~3.5 GB | **6 – 8 GB** | `n4-standard-4` (4 vCPU, 16 GB RAM) or `e2-standard-4` (16 GB) | `gpu_type = "nvidia-tesla-t4"` (`n1-standard-4`) or `"nvidia-l4"` (`g2-standard-4`) | Default size; great balance of speed and quality |
| **`12b`** | Dense (12B) | ~7.5 GB | **10 – 14 GB** | `n4-standard-4` (16 GB RAM) or `n4-standard-8` (32 GB RAM) | `gpu_type = "nvidia-tesla-t4"` (16 GB VRAM) or `"nvidia-l4"` (24 GB VRAM) | Fits in 16 GB T4 VRAM or 24 GB L4 VRAM |
| **`26b`** | **MoE** (26B total, **3.8B active**) | ~15 GB | **18 – 22 GB** | `n4-standard-8` (8 vCPU, 32 GB RAM) or `c3d-standard-8` (32 GB) | `gpu_type = "nvidia-l4"` (`g2-standard-8`, 24 GB VRAM) | **Best quality-to-speed ratio** (exceeds 16 GB T4 VRAM, fits 24 GB L4 VRAM) |
| **`31b`** | Dense Flagship (31B) | ~19 GB | **24 – 30 GB** | `n4-highmem-8` (8 vCPU, 64 GB RAM) or `n4-standard-8` (32 GB) | `gpu_type = "nvidia-l4"` (`g2-standard-8`) or `"nvidia-tesla-a100"` (40 GB VRAM) | Use `n4-highmem-8` (64 GB) on CPU or `A100` (40 GB) on GPU for >16K context |

---

## 3. GCP VM Cost Comparison (`N4` CPU vs. `G2` + L4 GPU in `us-central1`)

| Series | Mode | Machine Type | vCPU / RAM / GPU | Hardware Technology | On-Demand / Hr | On-Demand / Mo (730h) | Spot VM / Hr (`use_spot_vm = true`) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **N4** | CPU-Only (`gpu_type = ""`) | `n4-standard-2` | 2 vCPU, 8 GB RAM | Intel Emerald Rapids, DDR5 + AMX | ~$0.091 / hr | ~$66 / mo | ~$0.028 / hr |
| **N4** | CPU-Only (`gpu_type = ""`) | `n4-standard-4` | 4 vCPU, 16 GB RAM | Intel Emerald Rapids, DDR5 + AMX | ~$0.181 / hr | ~$132 / mo | ~$0.055 / hr |
| **N4** | CPU-Only (`gpu_type = ""`) | `n4-standard-8` | 8 vCPU, 32 GB RAM | Intel Emerald Rapids, DDR5 + AMX | **~$0.363 / hr** | **~$265 / mo** | **~$0.110 / hr** |
| **N4** | CPU-Only (`gpu_type = ""`) | `n4-highmem-8` | 8 vCPU, 64 GB RAM | Intel Emerald Rapids, DDR5 + AMX | ~$0.490 / hr | ~$358 / mo | ~$0.150 / hr |
| **G2 + L4** | GPU (`gpu_type = "nvidia-l4"`) | `g2-standard-4` | 4 vCPU, 16 GB RAM + **1x L4 (24 GB)** | NVIDIA L4 Ada Lovelace GPU | ~$0.707 / hr | ~$516 / mo | ~$0.28–$0.42 / hr |
| **G2 + L4** | GPU (`gpu_type = "nvidia-l4"`) | `g2-standard-8` | 8 vCPU, 32 GB RAM + **1x L4 (24 GB)** | NVIDIA L4 Ada Lovelace GPU | **~$0.854 / hr** | **~$623 / mo** | **~$0.34–$0.51 / hr** |
| **G2 + L4** | GPU (`gpu_type = "nvidia-l4"`) | `g2-standard-12` | 12 vCPU, 48 GB RAM + **1x L4 (24 GB)** | NVIDIA L4 Ada Lovelace GPU | ~$0.990 / hr | ~$723 / mo | ~$0.40–$0.59 / hr |

---

## 4. Configuration & Deployment

### Step 1: Configure `terraform.tfvars`

```bash
cd server/terraform/vm_template
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`:

- **Example A: NVIDIA L4 GPU + Gemma 4 26B MoE**
  ```hcl
  project_id        = "my-gcp-project"
  gpu_type          = "nvidia-l4"
  machine_type      = "g2-standard-8"
  gemma_model_size  = "26b"
  boot_disk_size_gb = 100
  auth_username     = "admin"
  auth_password     = "my-secret-password"
  ```

- **Example B: Gen 4 CPU-Only (`n4-standard-8`, No GPU) + Gemma 4 E4B**
  ```hcl
  project_id        = "my-gcp-project"
  gpu_type          = ""
  machine_type      = "n4-standard-8"
  gemma_model_size  = "e4b"
  boot_disk_size_gb = 100
  auth_username     = "admin"
  auth_password     = "my-secret-password"
  ```

### Step 2: Initialize & Apply the VM Template

```bash
terraform init
terraform plan
terraform apply
```

### Step 3: Create a VM Instance from the Template

Once the template is created, Terraform outputs the exact `gcloud` command to launch a VM when needed:

```bash
gcloud compute instances create local-llm-vm \
  --project="YOUR_PROJECT_ID" \
  --zone="us-central1-a" \
  --source-instance-template="$(terraform output -raw instance_template_name)"
```

After the VM boots and finishes its startup script (~3–5 minutes for package installation and `ollama pull`), open `https://<EXTERNAL_IP>` in your browser, accept the self-signed certificate prompt, and sign in with `auth_username` and `auth_password`.
