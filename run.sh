#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/tmp/stapler-server.log"

# Kill existing processes before starting
"$SCRIPT_DIR/kill.sh"

echo "[stapler] Starting dev server..."
cd "$SCRIPT_DIR"
pnpm dev > "$LOG_FILE" 2>&1 &
SERVER_PID=$!
echo "[stapler] PID=$SERVER_PID  log=$LOG_FILE"

# Wait for server to be ready (poll health on any candidate port)
for i in $(seq 1 45); do
  for PORT in $(grep -o '"port":[0-9]*' "$LOG_FILE" 2>/dev/null | grep -o '[0-9]*$' | sort -u || true); do
    HEALTH=$(curl -s --max-time 1 "http://localhost:${PORT}/api/health" 2>/dev/null || true)
    if [ -n "$HEALTH" ]; then
      echo "[stapler] Ready at http://localhost:${PORT}"
      exit 0
    fi
  done
  printf "."
  sleep 1
done

echo ""
echo "[stapler] Timed out waiting for server. Check $LOG_FILE"
exit 1
