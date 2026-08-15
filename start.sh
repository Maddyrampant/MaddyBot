#!/usr/bin/env bash
# Start MaddyBot fully local (Ollama + custom maddybot model).
# First time only, download the embedding model:
#   ollama pull bge-m3
cd "$(dirname "$0")"

if ! curl -s --max-time 2 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  echo "Starting Ollama..."
  setsid nohup ollama serve >/dev/null 2>&1 </dev/null &
  sleep 3
fi

if ! ollama list 2>/dev/null | grep -q "^maddybot"; then
  echo "MISSING model: maddybot"
  echo "Build it from the local Qwen3-4B:"
  echo "  cd '/run/media/solo/New Volume/AI-Studio/train'"
  echo "  ollama create maddybot -f Modelfile.gguf"
fi

if ! ollama list 2>/dev/null | grep -q "bge-m3"; then
  echo "MISSING model: bge-m3  ->  run:  ollama pull bge-m3"
fi

exec node index.js
