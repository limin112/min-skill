#!/usr/bin/env bash
# ComfyUI 启动模板：拷到 H3 机器上按需修改，再配置
#   configure.py --start-command 'GPU={gpu} PORT={port} DYNVRAM={dynvram} COMFY=/path/to/ComfyUI PY=/path/to/python bash /path/to/start_comfy.sh'
# 约定：后台启动 ComfyUI，并打印一行 pid=<进程号>。h3_fl.py 靠它登记，用完只停自己起的实例。
# DYNVRAM=1：动态显存，和别人的任务共存，留 6G 余量。DYNVRAM=0：独占。
set -u
: "${COMFY:?COMFY=ComfyUI 目录}"; PORT=${PORT:-8188}; PY=${PY:-python3}; LISTEN=${LISTEN:-127.0.0.1}
cd "$COMFY"
if [ "${DYNVRAM:-0}" = "1" ]; then FLAGS="--enable-dynamic-vram --vram-headroom 6"; else FLAGS="--disable-dynamic-vram"; fi
[ -n "${GPU:-}" ] && FLAGS="$FLAGS --cuda-device $GPU"
setsid nohup "$PY" main.py --listen "$LISTEN" --port "$PORT" $FLAGS --cache-none > "comfy_$PORT.log" 2>&1 < /dev/null &
echo "started pid=$! port=$PORT flags=$FLAGS"
