#!/usr/bin/env bash
# 卸载：停掉服务，删掉 install.sh 在这个文件夹里装的东西。
#
#   ./uninstall.sh          删 Python、依赖、Deep-Live-Cam 和换脸模型；照片和视频（web_data/）保留
#   ./uninstall.sh --all    连 web_data/ 和 ~/.insightface/models/buffalo_l 一起删
set -euo pipefail
cd "$(dirname "$0")"
[ -f web_server.py ] || { echo "请在 deep-live-cam-web 目录里运行"; exit 1; }

./start.sh stop 2>/dev/null || true
for d in .venv .python .uvtool Deep-Live-Cam; do
  [ -e "$d" ] && rm -rf "./$d" && echo "已删除 $d/"
done
if [ "${1:-}" = --all ]; then
  [ -e web_data ] && rm -rf ./web_data && echo "已删除 web_data/（照片、视频）"
  if [ -d "$HOME/.insightface/models/buffalo_l" ]; then
    rm -rf "$HOME/.insightface/models/buffalo_l" && echo "已删除 ~/.insightface/models/buffalo_l"
  fi
else
  [ -e web_data ] && echo "保留了 web_data/（照片、视频）；要删用 ./uninstall.sh --all"
fi
echo "卸载完成。代码文件还在，重新装运行 ./install.sh"
