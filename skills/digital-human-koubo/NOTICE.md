# Notice / 第三方说明

本 skill 的代码和文档按 MIT 协议发布；上游 digital-human-koubo 的版权声明见 LICENSE-upstream。

| 组件 | 用在哪 | 协议 | 说明 |
|---|---|---|---|
| [andyhuo520/digital-human-koubo](https://github.com/andyhuo520/digital-human-koubo) | 本 skill 的上游（剪辑模板、包装组件、回听/对齐脚本） | MIT | 本 skill 把生成后端从 Renoise 换成本地 MOSS-Image + MiniMax H3。上游的主播形象图、风格预览图、包装图鉴是原作者的数字人，按其 NOTICE 不随这里分发 |
| [MiniMax H3](https://github.com/MiniMax-AI/MiniMax-H3) | 口播视频生成（worker2 · ComfyUI） | MiniMax-H3 Community License | 权重自行从 ModelScope `Comfy-Org/MiniMax-H3` 下载，不随 skill 分发 |
| [Larryvrh/ComfyUI-MiniMax-H3-Turbo](https://github.com/Larryvrh/ComfyUI-MiniMax-H3-Turbo) + Turbo LoRA | H3 8 步加速 | Apache-2.0（节点）/ 见 LoRA 仓库 | `scripts/h3_setup_accel.sh` 安装，不随 skill 分发 |
| [MOSS-Image](https://github.com/OpenMOSS/MOSS-Image) | 角色首帧、场景图 | Apache-2.0 | |
| [KohakuMossTrainer](https://github.com/KohakuBlueleaf/KohakuMossTrainer) | moss01 LoRA 训练与推理 | KohakuMoss License 1.0 | 训练工具包见 [limin112/Lora](https://github.com/limin112/Lora) |
| [Remotion](https://www.remotion.dev/) | 剪辑 | [Remotion License](https://www.remotion.dev/license) | 个人和 3 人以内公司免费 |
| [whisper.cpp](https://github.com/ggerganov/whisper.cpp) | 回听、逐字对齐 | MIT | |
| 音效、占位配乐 | `scripts/make_assets.py` 代码合成 | MIT | 不含任何第三方音频 |

**角色**：Moss（moss01）是虚构人物，由 GPT Image 2 生成训练数据、MOSS-Image LoRA 学习；Oliver、Hoot 教授、Q 版 Moss 由 MOSS-Image 底模原创生成。所有角色都不对应任何真人，也不是任何现有 IP 角色。片中标注「AI 生成」。
