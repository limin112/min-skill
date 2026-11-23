#!/usr/bin/env bash
# 用远程显卡服务器换脸：在服务器上启动服务，在本机开 SSH 隧道，浏览器打开 http://localhost:8765
#
#   ./remote.sh 服务器 [服务器上的工具目录]
#   ./remote.sh gpu-box                       # 默认目录 ~/min-skill/tools/deep-live-cam-web
#   ./remote.sh gpu-box ~/apps/deep-live-cam-web
#   ./remote.sh gpu-box stop                  # 停掉服务器上的服务
#
# 「服务器」是 ssh 能直接连上的名字（~/.ssh/config 里的 Host，或 user@ip）。
# 服务器上要先 git clone 本仓库并运行过 ./install.sh。
# 环境变量：PORT=8765  GPU=0（服务器上用哪张卡）
# 摄像头只允许在 localhost 或 https 下使用，所以要走隧道，不要直接开服务器的 IP。
set -uo pipefail
[ $# -ge 1 ] || { sed -n '2,12p' "$0"; exit 1; }
HOST=$1
DIR=${2:-'~/min-skill/tools/deep-live-cam-web'}
PORT=${PORT:-8765}
GPU=${GPU:-0}
SSH=(ssh -o ConnectTimeout=15)

if [ "$DIR" = stop ]; then
  "${SSH[@]}" "$HOST" "~/min-skill/tools/deep-live-cam-web/start.sh stop"; exit 0
fi

echo "== 在 $HOST 上启动服务（GPU ${GPU}）..."
"${SSH[@]}" "$HOST" "cd $DIR && CUDA_VISIBLE_DEVICES=$GPU PORT=$PORT ./start.sh --no-open" || {
  echo "服务器上启动失败。确认已在 $DIR 运行过 ./install.sh"; exit 1; }

OLD=$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)
[ -n "$OLD" ] && { echo "本机 $PORT 端口被占用（PID ${OLD}），先关掉它或换 PORT=8766"; exit 1; }
"${SSH[@]}" -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=15 -L "$PORT:127.0.0.1:$PORT" "$HOST" &
TUNNEL=$!
trap 'kill $TUNNEL 2>/dev/null' EXIT INT TERM
for _ in $(seq 1 15); do curl -s -m 2 "http://localhost:$PORT/healthz" >/dev/null && break; sleep 1; done
curl -s -m 3 "http://localhost:$PORT/healthz" >/dev/null || { echo "隧道没通"; exit 1; }

URL="http://localhost:$PORT"
echo "== 已就绪：$URL   （网页里「网络模式」选「流畅优先」，固定延迟 350–450 ms）"
if [ "$(uname -s)" = Darwin ]; then
  if [ -d "/Applications/Google Chrome.app" ]; then open -a "Google Chrome" "$URL"; else open "$URL"; fi
fi
echo "直播期间保持这个窗口开着，Ctrl+C 断开隧道。服务器上的服务闲置 2 小时自动退出。"
wait $TUNNEL
