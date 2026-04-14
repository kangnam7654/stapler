#!/usr/bin/env bash

KILLED=0

kill_pattern() {
  local pattern="$1"
  local signal="${2:-TERM}"
  local pids
  pids=$(pgrep -f "$pattern" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill "-$signal" 2>/dev/null || true
    KILLED=$((KILLED + $(echo "$pids" | wc -w | tr -d ' ')))
  fi
}

kill_port() {
  local port="$1"
  local signal="${2:-TERM}"
  local pids
  pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill "-$signal" 2>/dev/null || true
    KILLED=$((KILLED + $(echo "$pids" | wc -w | tr -d ' ')))
  fi
}

# Known orchestrators
kill_pattern "dev-runner.mjs"
kill_pattern "dev-watch.ts"
kill_pattern "tsx.*dev-watch"
kill_pattern "cross-env.*PAPERCLIP"

# tsx watcher running the API server (orphans to PID 1, missed by previous patterns)
kill_pattern "tsx.*watch.*src/index.ts"
kill_pattern "tsx.*server/src/index.ts"
kill_pattern "tsx.*stapler/server"

# Vite dev server (UI) — sometimes survives parent exit
kill_pattern "vite.*--config.*ui"
kill_pattern "node.*ui/node_modules/.bin/vite"

# Give processes a moment to exit, then force-kill anything still on port 3100
sleep 1
kill_pattern "dev-runner.mjs"
kill_pattern "dev-watch.ts"
kill_pattern "tsx.*watch.*src/index.ts"
kill_port 3100
sleep 1
kill_port 3100 KILL

if [ "$KILLED" -gt 0 ]; then
  echo "[stapler] Killed $KILLED process(es)"
else
  echo "[stapler] No processes found"
fi
