# H3：部署和配置

copyKakasi 不带模型，也不写任何机器地址。H3 由用户自己部署，地址由用户自己指定。

## 协议，先看
[MiniMax H3 Community License](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE) 决定了你能不能用，原文为准：
- **授权地区不含欧盟、英国、韩国、美国**。这些地区要用，需另外向 MiniMax 申请。
- 禁止侵犯第三方权利（包括未经授权创作衍生作品）、未经同意冒充他人、损害未成年人。
- 向公开环境发布机器生成内容时，要清楚标明是机器生成。
- 权重要自己下载，本仓库不分发。Turbo、Pika 等 LoRA 各有各的协议，下载时自己确认。

## 部署
需要 NVIDIA 显卡。显存门槛见下面的表。

1. 装带 `comfy_extras/nodes_minimax_h3.py` 的 ComfyUI。
2. 从 ModelScope `Comfy-Org/MiniMax-H3` 下载，放进 ComfyUI 的 `models/` 对应目录：
   - `minimax_h3_fl2va_pruned_int8_convrot.safetensors`（diffusion_models）
   - `qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors`（text_encoders）
   - `minimax_h3_video_vae_fp16.safetensors`、`minimax_h3_audio_vae_fp32.safetensors`（vae）
3. 装 Turbo 加速（节点 + LoRA）：`COMFY=/path/to/ComfyUI bash scripts/h3_setup_accel.sh`，然后重启 ComfyUI。
4. 可选的 `pika4` / `pika8` 方案：把 `h3_fl.py` 里 `VARIANTS` 列出的 LoRA 放进 `models/loras/pika/`。

文件名和这里不一样时，在用户配置的 `h3.models` 里改。

## 指定地址
```bash
# ComfyUI 在一台能 ssh 免密登录的机器上（别名写在你的 ~/.ssh/config 里）
python3 scripts/configure.py --host my-gpu --comfy-root /path/to/ComfyUI --ports 8188,8190
# ComfyUI 就在这台机器上
python3 scripts/configure.py --host local --comfy-root /path/to/ComfyUI --ports 8188
# 多条路：依次试，第一个连得上的用
python3 scripts/configure.py --host lan-alias,vpn-alias
# ComfyUI 监听的不是 127.0.0.1（这是"从 H3 机器上看"的地址）
python3 scripts/configure.py --comfy-host 10.0.0.5
# 检查
python3 scripts/doctor.py --h3
```
写到 `~/.config/copy-kakasi/config.json`（权限 600）。不想用这个位置：`export COPYKAKASI_CONFIG=<路径>`。临时换机器：`export COPYKAKASI_H3_HOST=<别名>`。

和 ComfyUI 的通信都通过 ssh 在 H3 机器上用 curl 发出去，本机不需要能直连它的端口。别把 ComfyUI 暴露到公网：它没有鉴权。

## 服务怎么起
- **默认**：你自己保持 ComfyUI 在跑，脚本只投任务，不起也不停。
- **让脚本来起**：拷一份 `templates/start_comfy.sh` 到 H3 机器，按需修改，然后配置 `start_command`：
  ```bash
  python3 scripts/configure.py --start-command 'GPU={gpu} PORT={port} DYNVRAM={dynvram} COMFY=/path/to/ComfyUI PY=/path/to/python bash /path/to/start_comfy.sh'
  ```
  命令必须后台启动 ComfyUI 并打印 `pid=<进程号>`。脚本会登记它，跑完只停登记过的。每张卡起一个实例，端口数就是最多的实例数。

| 空闲显存 | 行为 |
|---|---|
| ≥ 40 GB | 独占（`{dynvram}` = 0） |
| 14–40 GB | 共存（`{dynvram}` = 1，动态显存） |
| < 14 GB | 不在这张卡上起 |

门槛可以在用户配置的 `h3.solo_need_mb`、`h3.share_need_mb` 里改。这两个数来自作者的机器，24 GB 单卡能否流畅跑满没有实测过；不够用就降低 `project.json` 的 `size`。

## 速度参考（作者的双卡环境）
| 配置 | 一段 |
|---|---|
| Turbo 8 步 · 480×864 · 7–9 秒 | 约 3.5–4.2 分钟（含首次加载） |
| Turbo 8 步 · 1024×576 · 5 秒 | 约 3–10 分钟 |
| 原版 20 步 · 1024×576 · 15 秒 | 约 23 分钟 |

## 工作流要点
- Turbo 路线不要再接 `MiniMaxH3SigmaShift`：Turbo Sampler 自己处理音视频双时间表，叠上会把音频搞坏。
- 帧数吸附到 17k+5（124 = 5 秒 … 362 = 15 秒）。宽高 32 的倍数。
- 首尾帧是直接拉伸到画布的，送进去必须正好 16:9（脚本已处理）。
- Turbo 节点的 `low_vram` 参数是必填的（脚本已处理）。
