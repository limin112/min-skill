# 安装引导（只在缺的时候用）

原则：**已经有的一句话带过**；缺什么才给装法。系统软件让用户自己装，Python 包可以在用户同意后帮装。

## 1. GPU 机器（本地开源模型，不需要任何云账号）

| 机器 | 跑什么 | 检查 |
|---|---|---|
| worker2（`worker2` 局域网 / `worker2-ts` Tailscale） | MiniMax H3 · ComfyUI · 两张 4090 | `ssh worker2-ts nvidia-smi` |
| docker3（worker3 上的容器，经 worker3 跳） | 文生图（MOSS-Image，可挂人物 LoRA）· 只用 GPU0/1 | `ssh docker3 nvidia-smi` |

- H3 的 Turbo 加速没装：`ssh worker2-ts 'COMFY=/data/amin/h3/ComfyUI bash -s' < scripts/h3_setup_accel.sh`（节点从 GitHub，LoRA 从 ModelScope）。
- 换了机器：改 `persona.json → h3`（ssh_hosts、lan_ip、root、models）和 `→ image`（ssh_host、gpus、weights、trainer、venv、loras）。
- 从零部署 H3：ModelScope `Comfy-Org/MiniMax-H3` 下 diffusion_models / text_encoders / vae 五个文件，ComfyUI 需要带 `comfy_extras/nodes_minimax_h3.py` 的版本；更多量化和加速方案见 https://github.com/MiniMax-AI/awesome-minimax-h3-integration 。
- 从零部署 MOSS-Image：见 https://github.com/limin112/Lora（`setup_env.sh` + `download_weights.sh`）。
- 换别的文生图模型：`gen_image.py` 只认 `persona.json → image` 和输出的 png；把远端那条 `kogine run …` 换成你的推理命令（参数 prompt / 尺寸 / 种子 / 张数 / 输出目录），其余流程不变。角色首帧也可以直接用现成的图（用户本人照片要本人同意）。

## 2. 本机环境（剪辑时才需要）
`bash scripts/doctor.sh` 逐项检查，缺的才列装法。

| 缺的 | macOS | Windows | Linux |
|---|---|---|---|
| ffmpeg | `brew install ffmpeg` | `winget install Gyan.FFmpeg` | `sudo apt install ffmpeg` |
| Python 3 + numpy / Pillow | `brew install python` 后 `python3 -m pip install numpy pillow` | `winget install Python.Python.3.12` | `sudo apt install python3-pip` |
| Node 18+ | `brew install node` | `winget install OpenJS.NodeJS.LTS` | `nvm install --lts` |
| whisper-cli | `brew install whisper-cpp` | whisper.cpp Releases | 源码编译 |
| whisper 模型 | `ggml-large-v3-turbo.bin` 放 `~/.cache/whisper.cpp/`（或 `ggml-medium-q5_0.bin` 放 `~/models/`，或 `export WHISPER_MODEL=路径`） | 同左 | 同左 |

Remotion 不用单独装：`scripts/new_edit.sh` 起工程时会 `npm install`；npm 源连不上换 `npm config set registry https://registry.npmmirror.com`。
