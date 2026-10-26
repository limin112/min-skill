---
name: digital-human-koubo
description: 用本地开源模型做数字人口播视频，全程不依赖任何云服务：docker3 上的 MOSS-Image（可加自己训的人物 LoRA，如 moss01）出主播首帧和场景图 → worker2 上的 MiniMax H3（ComfyUI + Turbo 加速 LoRA，双 4090）按段生成「画面 + 原生配音」→ whisper 逐段回听 → 逐字对齐 → Remotion 剪辑出片。支持多角色同台（真人感主讲、黑框眼镜搭档、Pixar 风动物、二次元 Q 版）、中英混说（英式英语开场切普通话）、双语字幕。先按内容推荐剪辑风格让用户选（小林式解说 / 网红花字口播 / 发布解读 / 保姆级教程 / 多主播多语言），自动套从 MrBeast、MKBHD、影视飓风、Johnny Harris、Vox、半佛、差评等头部博主拆出来的 48 个包装组件。触发：用 Moss / 我的数字人讲这段、数字人口播、数字人讲解文章、本地 H3 生成口播、做个教程讲解视频、加花字 / 加包装 / 加弹幕 / 文字放在人身后、有哪些包装手法。不用于：冒充真人、用别人的脸或声音。
---

# 数字人口播（本地版：MOSS-Image + MiniMax H3）

角色、显卡、模型路径都在 `persona.json`；剪辑风格在 `references/style-menu.md`；H3 的提示词规范和加速在 `references/h3.md`。

```
文章 / 想法 ──写稿──▶ script.json ──h3.py build──▶ tasks.json
                                                     │ h3.py run（worker2 双卡，Turbo 8 步）
MOSS-Image（docker3）──首帧──────────────────────────┘
                                                     ▼
                     gen/<段>.mp4 ──assemble.py（whisper 回听）──▶ cut/ ──对齐──▶ Remotion ──▶ 成片
```

## 红线
- **只用原创或授权的形象和声音**：自己训的虚构人物（moss01）、底模生成的原创角色、用户本人或明确同意的人。不用明星、真实创作者的脸或声音，不做「像某某」的角色；名字和造型避开现成 IP（黑框眼镜男是原创角色 Oliver，不是哈利·波特）。
- 仓库原带的 `assets/avatar_ref.jpg`（白背心）是原作者的数字人，NOTICE.md 不许用在别人的内容里：**只当效果参考，不当主播**。
- 主播是成年人造型（「late twenties」「adult」写进提示词）；性感可以，露骨不行。
- 成片角上标「AI 生成」，片尾写「本片角色全部由 AI 生成」。
- 点名评价第三方产品的说法，要有出处或标「个人体验」。
- worker2 / docker3 是**共享机器**：起实例前看 `nvidia-smi` 和内存（别人的 3DGS 重建常年占 40G 内存，不要动它）；跑完 `h3.py down` 把自己起的 ComfyUI 停掉。

## 流程

### 准备（每次新对话第一次用时做，有就跳过）
1. **H3**：`python3 scripts/h3.py status tasks.json`（随便一个 tasks.json；没有就 `ssh worker2-ts nvidia-smi`）。连不上先试 `worker2`（局域网）再试 `worker2-ts`（Tailscale）。没装 Turbo 加速：`ssh worker2-ts 'COMFY=/data/amin/h3/ComfyUI bash -s' < scripts/h3_setup_accel.sh`（走 ModelScope）。
2. **MOSS**：`ssh docker3 nvidia-smi`，只用 GPU0 / GPU1。
3. **本机**：`bash scripts/doctor.sh`（ffmpeg、Python、Node 18+、whisper-cli；whisper 模型默认找 `~/.cache/whisper.cpp/ggml-large-v3-turbo.bin`）。

### 0. 看内容 → 推荐风格 → 让用户选
按 `references/style-menu.md`：一行诊断 → 推荐 2 个风格 → 一次问完（风格 · 比例时长 · 花字强度 · 角色阵容 · 语言）→ 写进 `brief.json`。

| 风格 | 比例 | 时长 | 剪辑实现 |
|---|---|---|---|
| A 小林式解说 | 16:9 | 3–20 分钟 | finance-explainer 引擎（拍表 episode.json） |
| B 网红花字口播 | 9:16 | 30–120 秒 | `templates/huazi-916`（edit.json 驱动） |
| C 发布解读 | 16:9 | 30–90 秒 | `templates/reference/launch-169` |
| D 保姆级教程 | 16:9 | 3–8 分钟 | `templates/reference/tutorial-169`；**完整实例：examples/ep01-moss-lora（MOSS LoRA 教程）** |
| E 多主播多语言 | 16:9 | 3–7 分钟 | `templates/reference/multihost-169` |

### 1. 角色首帧（MOSS-Image，docker3）
```bash
python3 scripts/moss_image.py --lora moss01 --ratio 9:16 --n 4 --out cast/moss --prompt "moss01, a confident adult woman in her late twenties, ..."
python3 scripts/moss_image.py --ratio 16:9 --n 2 --out cast/owl --prompt "a cute fluffy snowy owl professor ..."     # 不加 LoRA = 原创角色
python3 scripts/moss_image.py --prompts prompts.json --gpu 1 --out cast/x                                         # 一批不同尺寸/种子
```
- **LoRA 人物别覆盖它学到的特征**：moss01 是银金发，提示词写「dark hair」就不像她了。只写想换的东西（衣服、场景、构图、纹身这类小特征）。
- 每个角色出 2–4 张挑一张：正脸、闭嘴、手不挡脸、头顶留点空。PIP 竖屏用 9:16，全屏场景用 16:9。
- 挑好放 `assets/cast/<角色>_<916|169>.jpg`，在 `persona.json → hosts` 里登记（style / who / voice / keep）。场景图（伦敦街头、城堡图书馆…）放工程的 `frames/`，在 script.json 那段写 `frame`。
- 两个任务并行跑时 `--gpu 0` / `--gpu 1` 各占一张卡；`--out` 可以同目录（回传文件按任务命名，不会互相覆盖）。

### 2. 写稿 → script.json
每段一两句、5–14 秒（普通话约 5 字/秒，英文约 2.6 词/秒），字段见 `scripts/h3.py` 文件头：`id · host · t · lang · shot · frame · act · sound · sub · zh`。
- `lang`：`zh` / `en-GB`（英式）/ `en` / `ja`。英文段加 `zh` 翻译 → 双语字幕。
- `t` 是**念的原文**（数字、缩写写成好念的样子：「moss 零一」「四十八 G」）；字幕要显示别的写法就加 `sub`（「moss01」），句数要和 `t` 一致。
- `act` 写这一段的表演（英文、一两句），让表情和手势跟着台词走（「counts two on her fingers」「pushes his glasses up」）。H3 很听话，这是最出效果的一栏。
- 多角色接力：主讲 + 搭档吐槽 + 动物助教 + 二次元分身，每 3–5 段换一次人，节奏就活了。

### 3. 生成（H3，worker2）
```bash
python3 scripts/h3.py build script.json tasks.json          # 打印段数、时长、GPU 时间粗估 —— 先报给用户
python3 scripts/h3.py run tasks.json --gpus 2               # 双卡各一个实例，任务轮流分；后台跑 + Monitor 看 ✓/✗
python3 scripts/h3.py run tasks.json --only s07             # 删掉 gen/s07.mp4 再跑 = 自动换种子重拍
python3 scripts/h3.py down                                  # 收工：只停自己起的、队列空了的实例
```
- 不花钱，但占共享卡：开跑前报「段数 · 秒数 · 预计多久」。实测 Turbo 8 步、480×864、7–9 秒一段约 3.5–4 分钟（含排队），双卡 25 段约 40 分钟。
- **先拍 1–2 段验收再批量**（换了角色、语言或首帧都要）。
- 提示词由 build 按 H3 官方 I2VA 结构自动拼（见 references/h3.md），一般只改 script.json，不手改 tasks.json。
- 只有首帧改了内容才会换缓存文件名（按内容哈希）；改完首帧重新 build。

### 4. 回听 + 抽帧
`python3 scripts/assemble.py script.json`：按每段的 `lang` 用 whisper 转写、比文稿、剪掉段尾空白、出 `cut/<段>.mp4` + `cut/<段>.json`（逐字时间）+ `cut/qa.json`。
- 准确率 < 85% 的段打 ⚠：先听，真念错就删 gen 重拍。
- **每段抽 4 帧看一眼**：脸有没有漂、手指有没有崩、有没有自己烧字幕。
- 竖屏小窗和横屏场景混着时不拼预览片（尺寸不同），cut/ 直接进剪辑。
- H3 会把台词摊满给定时长：段尾没有静音是正常的，whisper 听全了就行；明显赶就给那段加 `seconds`。

### 5. 剪辑（Remotion）
- 时间轴：`python3 scripts/align.py script.json` 出逐字时间；多角色 / 双语 / 场景混排的教程片，直接参考 examples/ep01-moss-lora/tools/build_tl.py（片段做 -16 LUFS 响度归一、字幕按句切、片头卡插在指定段后）。
- 起工程：`bash scripts/new_edit.sh reference/tutorial-169 edit`，按本期稿子重写每段的画面（参考 examples/ep01-moss-lora/edit/src/Episode.tsx：左侧内容区 + 右侧主播小窗 + 顶部章节进度 + 底部字幕，全屏场景段自动切满屏）。
- **Panel 里用的是整片绝对时间**（`W(段, 词)`），别把它套进 `<Sequence>`（里面的帧号会变成相对的，动画全错位）——按时间条件渲染。
- 包装：按 `references/packaging-presets.json` 的默认包装排，用户点名的手法在上面加减（references/packaging.md）。
- 声音：**画面里的 `<OffthreadVideo>` 一律 `muted`**，人声单独铺一条 `<Audio>`（同一段音频放两遍 = +6 dB、峰值削波）；成片再 `loudnorm=I=-16:TP=-1.5` 过一遍。H3 原声直接用（每个角色音色由 persona.hosts.voice 固定）；段间差异大时用 `scripts/voicefx/unify.py` 统一。BGM 压在人声下约 20 dB，片头卡抬起来。
- 渲染前 `npx remotion still` 抽 4–6 帧看版式；渲染后抽转场中间帧。

## 参考
- references/h3.md：H3 提示词结构（I2VA）、Turbo 加速、双实例、实测速度和坑
- references/style-menu.md：五种风格、内容诊断、怎么问用户、brief.json
- references/packaging.md / packaging-playbook.md / packaging-presets.json：48 个包装组件和用法
- references/huazi.md：花字模板 edit.json 字段
- references/voice.md：声音（H3 原生音色、参考音频、自己的 TTS）
- references/new-avatar.md：做一个新角色（MOSS + 可选 LoRA）
- references/install.md：本机环境
- persona.json：角色阵容（hosts）、H3 / MOSS 的机器与模型配置
