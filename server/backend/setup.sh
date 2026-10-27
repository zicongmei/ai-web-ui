#!/usr/bin/env bash
set -euo pipefail

# Ensure $HOME is set when invoked from GCE metadata startup-script runner
export HOME="${HOME:-/root}"

# ==============================================================================
# Setup script for deploying Gemma 4 Backend + Local LLM Frontend on Linux
# Hosts frontend & backend over HTTPS (port 443) with a self-signed certificate,
# Nginx HTTP Basic Authentication, and 500 req/s rate limiting.
# ==============================================================================

GEMMA_MODEL_SIZE="${GEMMA_MODEL_SIZE:-e4b}"
LOCAL_LLM_MODEL="${LOCAL_LLM_MODEL:-gemma4:${GEMMA_MODEL_SIZE}}"
OLLAMA_NUM_CTX="${OLLAMA_NUM_CTX:-8192}"
AUTH_USERNAME="${AUTH_USERNAME:-admin}"
AUTH_PASSWORD="${AUTH_PASSWORD:-changeme}"
INSTALL_DIR="/opt/ai-web-ui"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

echo "=== [1/6] Installing system packages ==="
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y \
    apache2-utils \
    curl \
    ca-certificates \
    gnupg \
    lsb-release \
    openssl \
    nginx \
    python3 \
    python3-venv \
    python3-pip \
    pciutils \
    zstd

echo "=== [2/6] Checking for NVIDIA GPU ==="
if lspci | grep -i nvidia >/dev/null 2>&1; then
    echo "NVIDIA GPU detected."
    if ! command -v nvidia-smi >/dev/null 2>&1; then
        echo "Installing NVIDIA headless driver..."
        apt-get install -y ubuntu-drivers-common || true
        ubuntu-drivers autoinstall || apt-get install -y nvidia-driver-550-server || true
    else
        echo "NVIDIA driver already installed:"
        nvidia-smi --query-gpu=name,memory.total --format=csv,noheader || true
    fi
else
    echo "No NVIDIA GPU detected. Running in CPU-only mode."
fi

echo "=== [3/6] Installing Ollama & pulling model (${LOCAL_LLM_MODEL}) ==="
if ! command -v ollama >/dev/null 2>&1; then
    curl -fsSL https://ollama.com/install.sh | sh
fi

systemctl enable ollama
systemctl restart ollama

# Wait for Ollama daemon to become responsive
echo "Waiting for Ollama service to be ready..."
for i in {1..30}; do
    if curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
        break
    fi
    sleep 2
done

echo "Pulling model ${LOCAL_LLM_MODEL} (this may take a few minutes)..."
ollama pull "${LOCAL_LLM_MODEL}"

echo "=== [4/6] Deploying application files to ${INSTALL_DIR} ==="
mkdir -p "${INSTALL_DIR}/server"
if [ "${REPO_ROOT}" != "${INSTALL_DIR}" ]; then
    cp -r "${REPO_ROOT}/server/backend" "${INSTALL_DIR}/server/"
    cp -r "${REPO_ROOT}/server/frontend" "${INSTALL_DIR}/server/"
fi
chmod -R a+rX "${INSTALL_DIR}/server/frontend"

python3 -m venv "${INSTALL_DIR}/server/backend/.venv"
"${INSTALL_DIR}/server/backend/.venv/bin/pip" install --upgrade pip
"${INSTALL_DIR}/server/backend/.venv/bin/pip" install -r "${INSTALL_DIR}/server/backend/requirements.txt"

cat >/etc/default/gemma-backend <<EOF
LOCAL_LLM_MODEL=${LOCAL_LLM_MODEL}
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_NUM_CTX=${OLLAMA_NUM_CTX}
EOF

echo "=== [5/6] Configuring systemd service (gemma-backend.service) ==="
cp "${INSTALL_DIR}/server/backend/gemma-backend.service" /etc/systemd/system/gemma-backend.service
systemctl daemon-reload
systemctl enable gemma-backend.service
systemctl restart gemma-backend.service

echo "=== [6/6] Generating self-signed TLS certificate, Basic Auth & Nginx on port 443 ==="
mkdir -p /etc/nginx/ssl

# Configure Nginx HTTP Basic Auth credentials
htpasswd -bc /etc/nginx/.htpasswd "${AUTH_USERNAME}" "${AUTH_PASSWORD}"
chown root:www-data /etc/nginx/.htpasswd || true
chmod 640 /etc/nginx/.htpasswd

# Detect external/local IP for Subject Alternative Name (SAN)
EXTERNAL_IP="$(curl -fsSL -H 'Metadata-Flavor: Google' http://169.254.169.254/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip 2>/dev/null || true)"
LOCAL_IP="$(hostname -I | awk '{print $1}' || echo '127.0.0.1')"

SAN_ENTRIES="DNS:localhost,IP:127.0.0.1"
if [ -n "${LOCAL_IP}" ]; then
    SAN_ENTRIES="${SAN_ENTRIES},IP:${LOCAL_IP}"
fi
if [ -n "${EXTERNAL_IP}" ]; then
    SAN_ENTRIES="${SAN_ENTRIES},IP:${EXTERNAL_IP}"
fi

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/selfsigned.key \
    -out /etc/nginx/ssl/selfsigned.crt \
    -subj "/C=US/ST=California/L=MountainView/O=LocalLLM/CN=${EXTERNAL_IP:-localhost}" \
    -addext "subjectAltName=${SAN_ENTRIES}"

chmod 600 /etc/nginx/ssl/selfsigned.key
chmod 644 /etc/nginx/ssl/selfsigned.crt

cp "${INSTALL_DIR}/server/backend/nginx-ai-web-ui.conf" /etc/nginx/sites-available/ai-web-ui.conf
ln -sf /etc/nginx/sites-available/ai-web-ui.conf /etc/nginx/sites-enabled/ai-web-ui.conf
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl enable nginx
systemctl restart nginx

echo "=================================================================="
echo "Deployment complete!"
echo "Active Model : ${LOCAL_LLM_MODEL}"
echo "Basic Auth   : User '${AUTH_USERNAME}'"
echo "Rate Limit   : 500 req/s"
echo "Frontend/API : https://${EXTERNAL_IP:-${LOCAL_IP}} (Port 443, Self-Signed TLS)"
echo "=================================================================="
