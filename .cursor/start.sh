#!/usr/bin/env bash
# Serve the Droidspeak lab on every boot. Exits 0 once the page responds.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT=8765
SESSION=droidspeak_lab
URL="http://127.0.0.1:${PORT}/robot-communicate-lab.html"

lab_ready() {
  local body
  body="$(curl -fsS "$URL" 2>/dev/null || true)"
  [[ "$body" == *"Droidspeak Pulse"* ]]
}

if lab_ready; then
  echo "droidspeak lab already listening on ${PORT}"
  exit 0
fi

if tmux has-session -t "$SESSION" 2>/dev/null; then
  tmux kill-session -t "$SESSION"
fi

tmux new-session -d -s "$SESSION" -c "$ROOT" \
  "python3 -m http.server ${PORT} --bind 0.0.0.0"

for _ in $(seq 1 25); do
  if lab_ready; then
    echo "droidspeak lab ready on ${PORT}"
    exit 0
  fi
  sleep 0.2
done

echo "droidspeak lab did not become ready on ${PORT}" >&2
tmux capture-pane -pt "$SESSION" >&2 || true
exit 1
