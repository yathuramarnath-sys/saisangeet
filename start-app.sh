#!/bin/zsh

set -euo pipefail

ROOT_DIR="/Users/amarnath/Documents/New project update 1"
RUN_DIR="$ROOT_DIR/.run"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/apps/owner-web"
POS_DIR="$ROOT_DIR/apps/operations-pos"
WAITER_DIR="$ROOT_DIR/apps/waiter-mobile"
KITCHEN_DIR="$ROOT_DIR/apps/kitchen-display"

BACKEND_PID_FILE="$RUN_DIR/backend.pid"
FRONTEND_PID_FILE="$RUN_DIR/owner-web.pid"
POS_PID_FILE="$RUN_DIR/operations-pos.pid"
WAITER_PID_FILE="$RUN_DIR/waiter-mobile.pid"
KITCHEN_PID_FILE="$RUN_DIR/kitchen-display.pid"
BACKEND_LOG="$RUN_DIR/backend.log"
FRONTEND_LOG="$RUN_DIR/owner-web.log"
POS_LOG="$RUN_DIR/operations-pos.log"
WAITER_LOG="$RUN_DIR/waiter-mobile.log"
KITCHEN_LOG="$RUN_DIR/kitchen-display.log"

mkdir -p "$RUN_DIR"

start_service() {
  local name="$1"
  local pid_file="$2"
  local workdir="$3"
  local log_file="$4"
  shift 4

  if [[ -f "$pid_file" ]]; then
    local existing_pid
    existing_pid="$(cat "$pid_file")"
    if kill -0 "$existing_pid" 2>/dev/null; then
      echo "$name is already running with PID $existing_pid"
      return
    fi
    rm -f "$pid_file"
  fi

  (
    cd "$workdir"
    nohup "$@" >>"$log_file" 2>&1 &
    echo $! >"$pid_file"
  )

  local new_pid
  new_pid="$(cat "$pid_file")"
  echo "Started $name with PID $new_pid"
}

start_service "backend" "$BACKEND_PID_FILE" "$BACKEND_DIR" "$BACKEND_LOG" npm start
start_service "owner-web" "$FRONTEND_PID_FILE" "$FRONTEND_DIR" "$FRONTEND_LOG" npm run dev -- --host 0.0.0.0 --port 4173
start_service "operations-pos" "$POS_PID_FILE" "$POS_DIR" "$POS_LOG" npm run dev -- --host 0.0.0.0 --port 4174
start_service "waiter-mobile" "$WAITER_PID_FILE" "$WAITER_DIR" "$WAITER_LOG" npm run dev -- --host 0.0.0.0 --port 4175
start_service "kitchen-display" "$KITCHEN_PID_FILE" "$KITCHEN_DIR" "$KITCHEN_LOG" npm run dev -- --host 0.0.0.0 --port 4176

echo ""
echo "Frontend: http://localhost:4173/"
echo "Backend:  http://localhost:4000/"
echo "POS:      http://localhost:4174/"
echo "Waiter:   http://localhost:4175/"
echo "Kitchen:  http://localhost:4176/"
echo "Logs:"
echo "  $FRONTEND_LOG"
echo "  $BACKEND_LOG"
echo "  $POS_LOG"
echo "  $WAITER_LOG"
echo "  $KITCHEN_LOG"
