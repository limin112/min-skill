#!/usr/bin/env bash
# 在这台电脑上启动换脸网页（后台运行），然后打开 http://localhost:8765
#
#   ./start.sh              启动（已在运行就直接打开网页）
#   ./start.sh --no-open    只启动，不开浏览器（服务器上用）
#   ./start.sh stop         停止
#   ./start.sh status       看看在不在跑
#   ./start.sh log          看日志
#
# 环境变量：PORT=8765  IDLE_MIN=120（闲置多少分钟自动退出，0 = 不退出）
#           CUDA_VISIBLE_DEVICES=1（Linux 上换一张显卡）  DLC_PROVIDER=cpu（强制 CPU）
set -uo pipefail
cd "$(dirname "$0")"
HERE=$(pwd)
PORT=${PORT:-8765}
IDLE_MIN=${IDLE_MIN:-120}
LOG="$HERE/web_data/server.log"
PAT="$HERE/web_server[.]py"
OPEN=1

pids() { pgrep -f "$PAT" || true; }
healthy() { curl -s -m 2 "http://127.0.0.1:$PORT/healthz" >/dev/null; }

case "${1:-}" in
  stop)   P=$(pids); [ -n "$P" ] && kill $P && echo "已停止" || echo "本来就没在运行"; exit 0 ;;
  status) P=$(pids); [ -n "$P" ] && echo "运行中（PID ${P}）" && tail -1 "$LOG" || echo "没在运行"; exit 0 ;;
  log)    exec tail -n 50 -f "$LOG" ;;
  --no-open) OPEN=0 ;;
  "") ;;
  *) sed -n '2,11p' "$0"; exit 1 ;;
esac

[ -x .venv/bin/python ] || { echo "还没安装，先运行 ./install.sh"; exit 1; }

if ! healthy; then
  if [ "$(uname -s)" = Linux ]; then
    # onnxruntime-gpu 要用 pip 装的 cuDNN / cuBLAS，不加进库路径会悄悄退回 CPU
    NV=$(ls -d .venv/lib/python3*/site-packages/nvidia 2>/dev/null | head -1)
    if [ -n "$NV" ]; then
      for d in "$HERE/$NV"/*/lib; do LD_LIBRARY_PATH="$d:${LD_LIBRARY_PATH:-}"; done
      export LD_LIBRARY_PATH
    fi
    export QT_QPA_PLATFORM=offscreen
  fi
  mkdir -p web_data
  echo "== 启动换脸服务（加载模型 10–30 秒）..."
  : > "$LOG"
  nohup .venv/bin/python "$HERE/web_server.py" --port "$PORT" --idle-exit-min "$IDLE_MIN" >> "$LOG" 2>&1 < /dev/null &
  for _ in $(seq 1 120); do
    grep -q "ready on" "$LOG" && break
    if grep -q "^Traceback\|^Deep-Live-Cam not found\|is not available in onnxruntime" "$LOG" || [ -z "$(pids)" ]; then
      echo "启动失败，日志最后几行："; tail -20 "$LOG"; exit 1
    fi
    sleep 1
  done
fi
healthy || { echo "服务没有响应，看日志：./start.sh log"; exit 1; }
grep -o "provider=.*" "$LOG" | tail -1
URL="http://localhost:$PORT"
echo "== 已就绪：$URL"
if [ "$OPEN" = 1 ] && [ "$(uname -s)" = Darwin ]; then
  if [ -d "/Applications/Google Chrome.app" ]; then open -a "Google Chrome" "$URL"; else open "$URL"; fi
fi
