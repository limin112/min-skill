# digital-human-koubo · 本地开源数字人口播

**一张显卡训练出来的人物，让她自己开口讲课。** 全程本地开源模型，不接任何云端生成服务：

```
文章 ─▶ 口播稿（多角色 · 中英混说）
MOSS-Image + 人物 LoRA ─▶ 角色首帧 / 场景图
MiniMax H3 + Turbo LoRA（8 步，双卡）─▶ 每段「画面 + 原生配音」
whisper.cpp 逐段回听 ─▶ 逐字对齐 ─▶ Remotion 剪辑 ─▶ 成片
```

![第一期预览](examples/ep01-moss-lora/preview.jpg)

第一期《MOSS 魔法学院 · 第一课》：Moss（MOSS-Image 人物 LoRA 训练出来的虚构人物）在伦敦雨夜用英式英语开场，切成普通话讲怎么训练出一个她、怎么让她开口；黑框眼镜搭档 Oliver 吐槽，猫头鹰 Hoot 教授讲 caption，Q 版 Moss 负责「全世界都变成我啦」。工程在 [`examples/ep01-moss-lora`](examples/ep01-moss-lora)。

| | 角色 | 怎么来的 |
|---|---|---|
| <img src="assets/cast/moss_916.jpg" width="90"> | **Moss** | MOSS-Image + moss01 LoRA（56 张图、一张 4090、1 小时） |
| <img src="assets/cast/oliver_916.jpg" width="90"> | **Oliver** | MOSS-Image 底模原创的英国眼镜男生 |
| <img src="assets/cast/hoot_169.jpg" width="160"> | **Hoot 教授** | Pixar 风猫头鹰 |
| <img src="assets/cast/chibi_916.jpg" width="90"> | **Q 版 Moss** | 二次元分身 |

## 用法

装好后直接说「用 Moss 讲解这篇文章」「做个数字人口播」，流程见 [SKILL.md](SKILL.md)。手动跑：

```bash
python3 scripts/moss_image.py --lora moss01 --ratio 9:16 --n 4 --out cast/moss --prompt "moss01, ..."   # 角色首帧
python3 scripts/h3.py build script.json tasks.json      # 分段 + 拼 H3 提示词 + 估时间
python3 scripts/h3.py run tasks.json --gpus 2           # 双卡生成，断点续跑
python3 scripts/assemble.py script.json                 # whisper 回听、剪段尾
bash scripts/new_edit.sh reference/tutorial-169 edit    # 起 Remotion 剪辑工程
```

## 依赖

| | 在哪 | 说明 |
|---|---|---|
| MiniMax H3（ComfyUI） | 一台 24G+ 显卡的机器 | 权重从 ModelScope `Comfy-Org/MiniMax-H3` 下；加速：`scripts/h3_setup_accel.sh`（Turbo 节点 + LoRA，走 ModelScope） |
| MOSS-Image + KohakuMoss | 一台 24G+ 显卡的机器 | 训练 / 推理环境见 [limin112/Lora](https://github.com/limin112/Lora) |
| ffmpeg · Python 3 · Node 18+ · whisper-cli | 本机 | `bash scripts/doctor.sh` 一键检查 |

机器地址、模型路径在 `persona.json` 的 `h3` / `moss` 两节，换机器改那里。部署细节、实测速度和坑见 [references/h3.md](references/h3.md)。

| 实测（RTX 4090 48G） | 一段口播 |
|---|---|
| H3 原版 20 步 · 1024×576 · 15 秒 | ~23 分钟 |
| **H3 + Turbo 8 步 · 480×864 · 7–9 秒** | **~2–4.5 分钟**（双卡并行，25 段约 45 分钟） |

## 来源与授权
- fork 自 [andyhuo520/digital-human-koubo](https://github.com/andyhuo520/digital-human-koubo)（MIT，见 [LICENSE-upstream](LICENSE-upstream)）：剪辑模板、48 个包装组件、回听 / 对齐 / 声音统一脚本都来自上游。本 fork 把生成后端从 Renoise 换成本地 MOSS-Image + MiniMax H3，并加了多角色、中英混说、双卡调度。
- 上游的主播形象图、风格预览图、包装图鉴是原作者的数字人，按上游 NOTICE 不随这里分发（见 [assets/README.md](assets/README.md)）。
- 第三方组件见 [NOTICE.md](NOTICE.md)。所有角色都是 AI 生成的虚构人物，不对应真人或现有 IP，成片里标「AI 生成」。
