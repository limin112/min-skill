#!/usr/bin/env bash
# 安装 Deep-Live-Cam 网页工作台。所有东西都装在这个文件夹里，不动系统 Python。
#
#   ./install.sh                  装好环境、项目和换脸模型
#   ./install.sh --with-enhancer  额外下载画质增强模型 gfpgan-1024（约 350 MB）
#
# 支持：Apple 芯片的 Mac（CoreML 加速）；带 NVIDIA 显卡的 Linux（CUDA 加速）。
# 可用环境变量：
#   HF_ENDPOINT=https://hf-mirror.com   模型下载走镜像（国内网络）
#   DLC_GIT=https://...                 Deep-Live-Cam 仓库地址（默认 GitHub）
#   DLC_REF=08896a5                     Deep-Live-Cam 版本（默认是实测过的这个提交）
set -euo pipefail
cd "$(dirname "$0")"
HERE=$(pwd)

DLC_GIT=${DLC_GIT:-https://github.com/hacksider/Deep-Live-Cam.git}
DLC_REF=${DLC_REF:-08896a5}
HF=${HF_ENDPOINT:-https://huggingface.co}
HF_BASE="$HF/hacksider/deep-live-cam/resolve/main"
WITH_ENH=0
for a in "$@"; do
  case "$a" in
    --with-enhancer) WITH_ENH=1 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "未知参数：$a"; exit 1 ;;
  esac
done

OS=$(uname -s)
say() { printf '\n== %s\n' "$*"; }
die() { printf '\n安装失败：%s\n' "$*" >&2; exit 1; }

case "$OS" in
  Darwin) [ "$(uname -m)" = arm64 ] || echo "提示：这是 Intel Mac，没有 CoreML 加速，只能用 CPU，会很慢。"; GPU=coreml ;;
  Linux)  if command -v nvidia-smi >/dev/null && nvidia-smi -L >/dev/null 2>&1; then GPU=cuda; else
            echo "提示：没找到 NVIDIA 显卡（nvidia-smi），会装成 CPU 版，实时直播会很慢。"; GPU=cpu; fi ;;
  *) die "只支持 macOS 和 Linux" ;;
esac
command -v git >/dev/null || die "需要 git"
command -v curl >/dev/null || die "需要 curl"
command -v python3 >/dev/null || die "需要 python3（任意版本都行，只用来装 uv）"

# 1. uv + Python 3.12，都放在这个文件夹里
say "1/4 准备 Python 3.12（只装在 $HERE 里）"
if [ ! -x .uvtool/bin/uv ]; then
  python3 -m venv .uvtool || die "python3 -m venv 失败。Ubuntu/Debian 请先装 python3-venv：sudo apt install python3-venv"
  .uvtool/bin/pip install -q --upgrade pip uv
fi
UV="$HERE/.uvtool/bin/uv"
export UV_PYTHON_INSTALL_DIR="$HERE/.python"
[ -x .venv/bin/python ] || "$UV" venv -q --python 3.12 .venv
PY="$HERE/.venv/bin/python"
"$PY" --version

# 2. Deep-Live-Cam
say "2/4 获取 Deep-Live-Cam（${DLC_REF}）"
if [ ! -d Deep-Live-Cam/.git ]; then
  git clone -q "$DLC_GIT" Deep-Live-Cam
fi
git -C Deep-Live-Cam fetch -q origin 2>/dev/null || true
git -C Deep-Live-Cam checkout -q "$DLC_REF" || die "切换到 $DLC_REF 失败"

# 3. 依赖
say "3/4 安装依赖（第一次约 2–5 GB，取决于平台）"
"$UV" pip install -q --python "$PY" -r Deep-Live-Cam/requirements.txt aiohttp websocket-client
if [ "$OS" = Linux ]; then
  # requirements 同时装了 opencv-python 和 headless，两者冲突；服务器上只留 headless
  "$UV" pip uninstall -q --python "$PY" opencv-python opencv-python-headless || true
  "$UV" pip install -q --python "$PY" "opencv-python-headless==4.14.0.94"
  if [ "$GPU" = cuda ]; then
    # requirements 里没有 torch；CUDA 版 torch 顺带装上 onnxruntime-gpu 需要的 cuDNN / cuBLAS 等库
    "$UV" pip install -q --python "$PY" torch torchvision --index-url https://download.pytorch.org/whl/cu128
  fi
fi
"$PY" - <<'EOF'
import onnxruntime as o
print("onnxruntime", o.__version__, o.get_available_providers())
EOF

# 4. 模型
say "4/4 下载模型（${HF}）"
dl() {  # url dest
  [ -s "$2" ] && { echo "已有 $(basename "$2")"; return; }
  mkdir -p "$(dirname "$2")"
  curl -fL --retry 3 --progress-bar -C - -o "$2.part" "$1" || die "下载失败：$1（国内网络可以试 HF_ENDPOINT=https://hf-mirror.com ./install.sh）"
  mv "$2.part" "$2"; echo "下好 $(basename "$2")"
}
dl "$HF_BASE/inswapper_128_fp16.onnx" Deep-Live-Cam/models/inswapper_128_fp16.onnx
if [ "$WITH_ENH" = 1 ]; then dl "$HF_BASE/gfpgan-1024.onnx" Deep-Live-Cam/models/gfpgan-1024.onnx; fi
for f in 1k3d68.onnx 2d106det.onnx det_10g.onnx genderage.onnx w600k_r50.onnx; do
  dl "$HF_BASE/buffalo_l/buffalo_l/$f" "$HOME/.insightface/models/buffalo_l/$f"
done

say "装好了（加速方式：${GPU}）"
echo "启动：./start.sh        （Mac 也可以双击 start.command）"
echo "远程显卡服务器：在服务器上装好后，在笔记本上运行 ./remote.sh 你的服务器"
