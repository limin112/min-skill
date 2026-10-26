# H3 API 工作流样例

ComfyUI 的 API 格式（`POST /prompt` 的 `prompt` 字段），由 `scripts/h3.py` 的 `workflow()` 导出：

| 文件 | 说明 |
|---|---|
| `i2v_turbo_api.json` | 首帧模式 + Turbo LoRA 8 步（默认，约为原版 2.5 倍速） |
| `i2v_base20_api.json` | 首帧模式原版 20 步（`h3.py build --no-accel`） |

用法：把首帧放进 ComfyUI 的 `input/`，改节点 20 的文件名和节点 6 的 prompt / 宽高 / 帧数（17k+5），提交：
`curl -X POST http://<comfy>:8188/prompt -H 'Content-Type: application/json' -d "{\"prompt\": $(cat i2v_turbo_api.json)}"`
Turbo 版需要 `custom_nodes/ComfyUI-MiniMax-H3-Turbo` 和 `models/loras/minimax_h3_turbo_v4_step600_ema.safetensors`（`scripts/h3_setup_accel.sh` 一键装）。
