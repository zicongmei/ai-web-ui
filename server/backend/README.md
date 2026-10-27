# Gemma 4 Local LLM Backend (`server/backend`)

This directory contains the FastAPI backend server, `systemd` service definition, Nginx HTTPS reverse proxy configuration, and automated Linux installer for hosting **Gemma 4** models via Ollama.

## Features

- **Model Isolation**: Model size (`LOCAL_LLM_MODEL=gemma4:<size>`) is configured exclusively on the server side via `/etc/default/gemma-backend`.
- **HTTPS on Port 443**: Self-signed X.509 certificate generated automatically via `openssl` with HTTP `80 -> 443` redirect.
- **Nginx HTTP Basic Auth**: Protects both the frontend UI (`/`) and backend API (`/api/*`) with username/password verification (`/etc/nginx/.htpasswd`).
- **Nginx Rate Limiting**: Enforces `500 requests/second` (`limit_req_zone ... rate=500r/s`, returning HTTP `429` on excess traffic).

## Files

- [`main.py`](main.py): FastAPI application exposing `/api/chat` and `/api/health`.
- [`requirements.txt`](requirements.txt): Python package dependencies.
- [`gemma-backend.service`](gemma-backend.service): `systemd` unit file running the FastAPI server on `127.0.0.1:8000`.
- [`nginx-ai-web-ui.conf`](nginx-ai-web-ui.conf): Nginx configuration serving `server/frontend` on port `443` with Basic Auth, 500 req/s rate limiting, and reverse-proxying `/api/` to the FastAPI backend.
- [`setup.sh`](setup.sh): Automated Ubuntu/Debian setup script.

## Manual Installation on a Linux Machine

```bash
sudo GEMMA_MODEL_SIZE=e4b \
     AUTH_USERNAME=admin \
     AUTH_PASSWORD=your_strong_password \
     bash server/backend/setup.sh
```

## Switching the Backend Model Later

To change the active model on a running Linux server without modifying the frontend:

```bash
# 1. Pull the new model in Ollama
ollama pull gemma4:26b

# 2. Update /etc/default/gemma-backend
sudo sed -i 's/^LOCAL_LLM_MODEL=.*/LOCAL_LLM_MODEL=gemma4:26b/' /etc/default/gemma-backend

# 3. Restart the systemd service
sudo systemctl restart gemma-backend.service
```

## Updating Nginx Basic Auth Password

```bash
sudo htpasswd -bc /etc/nginx/.htpasswd admin new_strong_password
sudo systemctl reload nginx
```
