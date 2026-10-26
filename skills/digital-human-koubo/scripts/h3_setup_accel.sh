#!/bin/bash
# 给 H3 的 ComfyUI 装 Turbo 加速：自定义节点 + 加速 LoRA，全部走 ModelScope（国内机器连不上 HuggingFace 也能装）。
# 用法（在装 H3 的机器上跑，或 ssh 过去跑）：
#   COMFY=/data/amin/h3/ComfyUI bash h3_setup_accel.sh
# 装完重启 ComfyUI。已经有的文件会断点续传 / 跳过。
set -euo pipefail
COMFY=${COMFY:-/data/amin/h3/ComfyUI}
MS=https://www.modelscope.cn/models
cd "$COMFY"

# 1. 节点：Larryvrh/ComfyUI-MiniMax-H3-Turbo（Apache-2.0）。提供 MiniMaxH3TurboLoRA / MiniMaxH3TurboSampler，
#    原生支持 pruned 底模（adaln curve 那部分不能当普通权重补丁）
if [ ! -f custom_nodes/ComfyUI-MiniMax-H3-Turbo/__init__.py ]; then
  git clone --depth 1 https://github.com/Larryvrh/ComfyUI-MiniMax-H3-Turbo custom_nodes/ComfyUI-MiniMax-H3-Turbo \
    || { echo "GitHub 连不上：在能上网的机器 clone 后 scp 到 $COMFY/custom_nodes/"; exit 1; }
fi

# 2. LoRA：作者推荐的 v4_step600_ema（6–8 步最好）；备选 PAI 的 PDD 8 步（老 ComfyUI 没有 LoRA-bank 时别用，会丢输出头）
get() { # get <modelscope 仓库> <文件>
  for i in 1 2 3 4 5; do
    curl -L -C - --fail -s -o "models/loras/$2" "$MS/$1/resolve/master/$2" && { echo "✓ $2"; return; }
    echo "  重试 $i：$2"; sleep 10
  done
  echo "✗ $2 下载失败"; return 1
}
mkdir -p models/loras
get larryvrh/MiniMax-H3-Turbo-Lora minimax_h3_turbo_v4_step600_ema.safetensors
[ "${WITH_PDD:-0}" = 1 ] && get PAI/MiniMax-H3-Acc-LoRAs MiniMax-H3-FL2VA-Acc-8Step.safetensors
ls -la models/loras
echo "装好了。重启 ComfyUI 后，h3.py 默认就走 Turbo 8 步（persona.json → h3.accel）"
