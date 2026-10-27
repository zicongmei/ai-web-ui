import os
import re
import logging
from typing import Any, Dict, List, Optional, Union

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("gemma-backend")

# Model is configured exclusively on the server/Terraform side (never from the frontend)
LOCAL_LLM_MODEL = os.getenv("LOCAL_LLM_MODEL", "gemma4:e4b")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
OLLAMA_TIMEOUT_SECONDS = float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "600"))
OLLAMA_NUM_CTX = int(os.getenv("OLLAMA_NUM_CTX", "8192"))

app = FastAPI(
    title="Local LLM Backend Server",
    description="Backend API hosting Gemma 4 via Ollama for Multi-Party Chat and RPG UIs",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    system: Optional[str] = None
    system_instruction: Optional[str] = None
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: Optional[int] = Field(default=4096, ge=1)
    stop: Optional[List[str]] = None
    json_mode: bool = False
    json_schema: Optional[Dict[str, Any]] = None
    think: bool = False


class TokenUsage(BaseModel):
    prompt_tokens: int = 0
    cached_tokens: int = 0
    uncached_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    duration_ms: float = 0.0


class ChatResponse(BaseModel):
    text: str
    raw_text: str
    thought: Optional[str] = None
    done_reason: Optional[str] = None
    usage: TokenUsage = Field(default_factory=TokenUsage)


# Regex to strip Gemma 4 / DeepSeek style reasoning blocks from final output
THOUGHT_PATTERN = re.compile(
    r"(?:<\|channel\|?[^>]*>thought\s*[\s\S]*?<\|channel\|?[^>]*>|<think>[\s\S]*?</think>)",
    re.IGNORECASE,
)


def extract_thought_and_clean_text(raw_content: str) -> tuple[str, Optional[str]]:
    """Extracts any internal reasoning/thinking block and returns (clean_text, thought)."""
    if not raw_content:
        return "", None

    thoughts: List[str] = []

    # Handle Gemma 4 `<|channel>thought...<channel|>` format
    gemma_match = re.search(
        r"<\|?channel[^>]*>thought\s*([\s\S]*?)(?:<\|?channel[^>]*>|<channel\|>)",
        raw_content,
        re.IGNORECASE,
    )
    if gemma_match:
        thoughts.append(gemma_match.group(1).strip())
        cleaned = (
            raw_content[: gemma_match.start()] + raw_content[gemma_match.end() :]
        ).strip()
        return cleaned, "\n\n".join(thoughts)

    # Handle `<think>...</think>` format
    think_match = re.search(r"<think>([\s\S]*?)</think>", raw_content, re.IGNORECASE)
    if think_match:
        thoughts.append(think_match.group(1).strip())
        cleaned = THOUGHT_PATTERN.sub("", raw_content).strip()
        return cleaned, "\n\n".join(thoughts)

    return raw_content.strip(), None


@app.get("/api/health")
async def health_check() -> Dict[str, Any]:
    """Health check endpoint verifying backend and local Ollama connectivity."""
    ollama_ok = False
    available_models: List[str] = []
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            if resp.status_code == 200:
                ollama_ok = True
                data = resp.json()
                available_models = [m.get("name", "") for m in data.get("models", [])]
    except Exception as exc:
        logger.warning("Ollama health check failed: %s", exc)

    return {
        "status": "ok" if ollama_ok else "degraded",
        "ollama_connected": ollama_ok,
        "configured_model": LOCAL_LLM_MODEL,
        "available_models": available_models,
    }


@app.post("/api/chat", response_model=ChatResponse)
async def chat_completion(req: ChatRequest) -> ChatResponse:
    """Unified chat completion endpoint used by server/frontend apps.

    The model size/variant is strictly controlled by the server environment
    variable `LOCAL_LLM_MODEL` configured via Terraform / systemd.
    """
    ollama_messages: List[Dict[str, str]] = []

    effective_system = req.system if req.system is not None else req.system_instruction
    if effective_system and effective_system.strip():
        ollama_messages.append({"role": "system", "content": effective_system.strip()})

    for msg in req.messages:
        role = msg.role.lower()
        if role == "model":
            role = "assistant"
        elif role not in ("system", "user", "assistant"):
            role = "user"
        ollama_messages.append({"role": role, "content": msg.content})

    options: Dict[str, Any] = {
        "temperature": req.temperature,
        "num_ctx": OLLAMA_NUM_CTX,
    }
    if req.max_tokens:
        options["num_predict"] = req.max_tokens
    if req.stop:
        options["stop"] = req.stop[:5]

    payload: Dict[str, Any] = {
        "model": LOCAL_LLM_MODEL,
        "messages": ollama_messages,
        "stream": False,
        "think": req.think,
        "options": options,
    }

    if req.json_schema:
        payload["format"] = req.json_schema
    elif req.json_mode:
        payload["format"] = "json"

    try:
        async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT_SECONDS) as client:
            resp = await client.post(f"{OLLAMA_BASE_URL}/api/chat", json=payload)
    except httpx.RequestError as exc:
        logger.error("Error connecting to Ollama at %s: %s", OLLAMA_BASE_URL, exc)
        raise HTTPException(
            status_code=502,
            detail=f"Failed to connect to local Ollama service: {exc}",
        ) from exc

    if resp.status_code != 200:
        err_text = resp.text
        logger.error("Ollama error (%s): %s", resp.status_code, err_text)
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"Ollama inference error: {err_text}",
        )

    data = resp.json()
    raw_text = data.get("message", {}).get("content", "") or ""
    clean_text, extracted_thought = extract_thought_and_clean_text(raw_text)

    # Also capture explicit `thinking` field if returned by Ollama
    ollama_thinking = data.get("message", {}).get("thinking")
    if ollama_thinking and not extracted_thought:
        extracted_thought = ollama_thinking

    prompt_tokens = int(data.get("prompt_eval_count") or 0)
    cached_tokens = int(data.get("prompt_eval_cached_count") or 0)
    uncached_tokens = max(0, prompt_tokens - cached_tokens)
    completion_tokens = int(data.get("eval_count") or 0)
    total_tokens = prompt_tokens + completion_tokens
    duration_ms = round(float(data.get("total_duration") or 0) / 1_000_000.0, 2)

    return ChatResponse(
        text=clean_text,
        raw_text=raw_text,
        thought=extracted_thought,
        done_reason=data.get("done_reason", "stop"),
        usage=TokenUsage(
            prompt_tokens=prompt_tokens,
            cached_tokens=cached_tokens,
            uncached_tokens=uncached_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            duration_ms=duration_ms,
        ),
    )
