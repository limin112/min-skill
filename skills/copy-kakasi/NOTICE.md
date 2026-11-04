# Notice / 第三方说明

MIT 协议（LICENSE）只覆盖本仓库的代码和文档。**模型、权重和你处理的视频不在其中**，它们有各自的权利和协议，使用前自己确认。

MiniMax H3 is licensed under the MiniMax H3 Community License Agreement, Copyright © 2026 MiniMax. All Rights Reserved.

| 组件 | 用在哪 | 协议 | 说明 |
|---|---|---|---|
| [MiniMax H3](https://github.com/MiniMax-AI/MiniMax-H3) | 视频生成 | [MiniMax H3 Community License](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE) | 用户自行下载部署，不在本仓库。授权地区不含欧盟、英国、韩国、美国；有使用限制 |
| [Larryvrh/ComfyUI-MiniMax-H3-Turbo](https://github.com/Larryvrh/ComfyUI-MiniMax-H3-Turbo) + Turbo LoRA | H3 8 步加速 | Apache-2.0（节点）/ 见 LoRA 仓库 | `h3_setup_accel.sh` 安装，不在本仓库 |
| Pika H3 Flex、lightx2v LoRA | 可选加速方案 | 见各自仓库 | 用户自行下载，不在本仓库 |
| [ComfyUI](https://github.com/comfyanonymous/ComfyUI) | 跑 H3 | GPL-3.0 | 用户自行安装，本仓库通过 HTTP API 调用 |
| [YuNet](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet) | 质检：人脸检测 | MIT | `doctor.py --fetch-models` 下载，不在本仓库 |
| [SFace](https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface) | 质检：判断中间帧是否换了人 | Apache-2.0 | 同上 |
| [OpenCV](https://opencv.org/)、Pillow、NumPy、FFmpeg | 图像视频处理 | 各自协议 | 用户自行安装 |
| [Codex CLI](https://github.com/openai/codex) | 默认出图通道 | 见其仓库和你的账号条款 | 用户自行安装 |

H3 驱动的代码演化自 [limin112/moss-koubo](https://github.com/limin112/moss-koubo)（MIT），后者 fork 自 [andyhuo520/digital-human-koubo](https://github.com/andyhuo520/digital-human-koubo)（MIT）。
