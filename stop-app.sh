#!/bin/zsh

set -euo pipefail

ROOT_DIR="/Users/amarnath/Documents/New project"
RUN_DIR="$ROOT_DIR/.run"

stop_service() {
  local name="$1"
  local pid_file="$2"

  if [[ ! -f "$pid_file" ]]; then
    echo "$name is not running"
    return
  fi

  local pid
  pid="$(cat "$pid_file")"

  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid"
    echo "Stopped $name (PID $pid)"
  else
    echo "$name PID file existed, but process $pid was not running"
  fi

  rm -f "$pid_file"
}

stop_service "owner-web" "$RUN_DIR/owner-web.pid"
stop_service "operations-pos" "$RUN_DIR/operations-pos.pid"
stop_service "backend" "$RUN_DIR/backend.pid"
