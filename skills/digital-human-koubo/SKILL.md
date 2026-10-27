---
name: digital-human-koubo
description: 把任意一篇文章（技术教程、产品发布、新闻解读、读书笔记、论文、公众号长文……）做成数字人讲解视频，全程本地开源模型、不接云端生成服务：读文章 → 写多角色口播稿（每段带一个声明式画面 visual：大字、配图、圈重点、数据卡、终端、流程、标签、柱状图、金句、片尾阵容）→ 本地文生图出角色首帧（默认 MOSS-Image，可挂自己训的人物 LoRA）→ 本地 MiniMax H3（ComfyUI + Turbo 加速，双卡）按段生成「画面 + 原生配音」→ whisper 逐段回听 → 逐字对齐 → 通用 Remotion 模板出片（配色 / 配乐有魔幻、科技、温暖、史诗四种情绪预设，配乐代码合成无版权）。支持多角色同台（真人感主讲、搭档吐槽、Pixar 风动物、二次元 Q 版）、多语言混说（如英式英语开场切普通话）、双语字幕；另有花字口播 / 发布解读 / 多主播等风格和 48 个包装组件。触发：讲解这篇文章、把文章做成视频、数字人口播、数字人讲解、AI 主播讲一下、用我的数字人讲、本地 H3 生成口播、做个教程讲解视频、加花字 / 加包装。不用于：冒充真人、用别人的脸或声音。
---

# 数字人讲解：任意文章 → 本地生成的口播视频

**换一篇文章只改数据，不改代码。** 一期工程就是一个目录：

```
<工程>/
  article/        文章原文和配图（visual 里引用的图片都从这里拿）
  script.json     口播稿：每段 {id, host, t, lang, shot, ch, act, visual, …}
  cast.json       本期阵容：{"<角色id>": {"use": "<库里的 id>"}} 或自己新建
  episode.json    片名、系列、配色 theme、片头卡、配乐 music、字幕高亮词
  frames/         可选：某些段单独用的场景首帧
```

```
文章 ──读、拆──▶ script.json + cast.json + episode.json
角色首帧（gen_image.py，本地文生图）──┐
                                     ▼
h3.py build/run（本地 H3，双卡）──▶ gen/ ──assemble.py（whisper 回听）──▶ cut/
                                                                           ▼
            build_tl.py ──▶ edit/src/tl.json + episode.json ──▶ templates/explainer-169 ──▶ 成片
            make_score.py --mood … ──▶ 配乐
```

机器、模型路径在 `persona.json`；现成角色在 `assets/cast/library.json`；画面字段在 `references/visuals.md`；H3 提示词规范和加速在 `references/h3.md`。

## 红线
- **只用原创或授权的形象和声音**：底模生成的原创角色、用户自己训的虚构人物 LoRA、用户本人或明确同意的人。不用明星、真实创作者的脸或声音，不做「像某某」的角色；名字和造型避开现成 IP。
- 仓库原带的 `assets/avatar_ref.jpg`（白背心）是上游作者的数字人，NOTICE.md 不许用在别人的内容里：**只当效果参考，不当主播**。
- 角色是成年人造型（提示词写「adult」「late twenties」之类）；性感可以，露骨不行。
- 成片角上标「AI 生成」，片尾写「本片角色全部由 AI 生成」（模板默认带）。
- 文章里的数字、结论照原文讲，不编；点名评价第三方产品的说法要有出处或标「个人体验」。配图只用文章自带的、用户给的或本地生成的。
- 跑模型的机器多半是**共享机器**：起实例前看 `nvidia-smi` 和内存，别动别人的进程；跑完 `h3.py down` 把自己起的服务停掉，远端临时文件脚本会删。

## 流程

### 准备（每次新对话第一次用时做，有就跳过）
1. **H3**：`ssh <persona.h3.ssh_hosts[0]> nvidia-smi` 能通、ComfyUI 和权重在 `persona.h3.root`。没装 Turbo 加速：`ssh <host> 'COMFY=<root>/ComfyUI bash -s' < scripts/h3_setup_accel.sh`（走 ModelScope）。换机器 / 第一次部署见 `references/install.md`。
2. **文生图**：`ssh <persona.image.ssh_host> nvidia-smi`，只用 `persona.image.gpus` 里的卡。
3. **本机**：`bash scripts/doctor.sh`（ffmpeg、Python 3 + numpy、Node 18+、whisper-cli + 模型）。

### 0. 读文章 → 定方案 → 让用户确认
读完文章（URL 先抓成 markdown 放 `article/`，图片一起下），给用户一段话的方案，一次问完：
- **风格**：默认 16:9 讲解（`templates/explainer-169`，本流程）；短视频要花字口播 / 发布解读 / 多主播等，按 `references/style-menu.md` 推荐。
- **结构**：3–6 个章节（`ch`），每章 2–5 段；总长按文章密度，一般 2–6 分钟（25 段 ≈ 3.5 分钟）。
- **阵容**：一个主讲 + 0–3 个配角（搭档吐槽、动物助教、Q 版分身）；先看 `assets/cast/library.json` 有没有合适的，没有就新做（第 1 步）。
- **语言**：普通话 / 英语 / 英式开场切中文……英文段配中文双语字幕。
- **情绪**：`magic` 魔幻 · `tech` 科技 · `warm` 温暖 · `epic` 史诗（同时决定配色和配乐，episode.json 里一个词）。

### 1. 阵容 → cast.json（需要新角色时出首帧）
```bash
python3 scripts/gen_image.py --ratio 9:16 --n 4 --out cast/host --prompt "a confident adult woman in her late twenties, ..."   # 底模原创
python3 scripts/gen_image.py --lora <名字> --ratio 9:16 --n 4 --out cast/me --prompt "<触发词>, ..."                         # 自己训的人物 LoRA
python3 scripts/gen_image.py --prompts prompts.json --gpu 1 --out cast/x                                                    # 一批不同尺寸 / 种子
```
- 每个角色出 2–4 张让用户挑：正脸、闭嘴、手不挡脸、头顶留空。小窗用 9:16，全屏场景段用 16:9。
- **LoRA 人物别在提示词里覆盖它学到的特征**（发色、脸型），只写想换的衣服、场景、小特征。
- 字段（name · tag · color · frames · style · who · keep · voice · pronoun · mouth · sound）见 library.json 的 `_fields`；做法见 `references/new-avatar.md`。好用的角色加进 library.json 下次直接 `use`。

### 2. 写稿 → script.json
每段一两句、5–14 秒（普通话约 5 字/秒，英文约 2.6 词/秒）。字段：
- `t` **念的原文**（数字写成好念的样子：「四十八 G」「第三百步」）；字幕要显示别的写法就加 `sub`（「48G」），句数和 `t` 一致。`lang`：`zh` / `en-GB` / `en` / `ja`；英文段加 `zh` → 双语字幕。
- `host` 是 cast.json 里的 id；`shot`：`pip`（右侧小窗 + 左侧内容区，默认）/ `scene`（全屏场景，配 `frame` 场景首帧）。
- `ch` 章节名（顶部进度条按出现顺序生成）；`act` 表演（英文一两句，跟着台词走：「counts two on her fingers」「pushes his glasses up」）——H3 很听话，这是最出效果的一栏。
- **`visual` 这一段左侧内容区放什么**：类型和字段见 `references/visuals.md`。原则：
  - 文章有图就用图（`image`，`marks` 圈出正在讲的那块，`crop` 只取一部分，`stamp` 盖章）；有数字就上 `stats` / `bars`；有命令就 `terminal`；有步骤就 `flow`；有字段 / 关键词就 `tags`；金句用 `quote`；开场和章节转折用 `big`。
  - 元素出现的时刻用 `at` 卡到口播里的词：`"at": "六十五"` = 念到「六十五」时弹出，`["词", 0.6]` = 那个词后 0.6 秒。
  - 一段里要两样东西（左图右数据）就写数组，各自给 `box`。
- 多角色接力：每 3–5 段换一次人，配角负责吐槽、提问、反应，节奏就活了。

### 3. 生成（H3）
```bash
python3 scripts/h3.py build script.json tasks.json          # 打印段数、时长、GPU 时间粗估 —— 先报给用户
python3 scripts/h3.py run tasks.json --gpus 2               # 双卡各一个实例，按队列长度分；后台跑 + Monitor 看 ✓/✗
python3 scripts/h3.py run tasks.json --only s07             # 删掉 gen/s07.mp4 再跑 = 自动换种子重拍
python3 scripts/h3.py down                                  # 收工：只停自己起的、队列空了的实例
```
- 开跑前报「段数 · 秒数 · 预计多久」：Turbo 8 步、480×864、7–9 秒一段约 2–4.5 分钟，双卡 25 段约 45 分钟。
- **先拍 1–2 段验收再批量**（换了角色、语言或首帧都要）。
- 提示词由 build 按 H3 官方 I2VA 结构自动拼（`references/h3.md`），只改 script.json，不手改 tasks.json。

### 4. 回听 + 抽帧
`python3 scripts/assemble.py script.json`：按每段 `lang` 用 whisper 转写、比文稿、剪段尾，出 `cut/<段>.mp4` + `cut/<段>.json`（逐字时间）+ `cut/qa.json`。
- 准确率 < 85% 的段打 ⚠：先听，真念错就删 gen 重拍；数字写法不同（「五十六」/「56」）不算错。
- **每段抽 4 帧看一眼**：脸有没有漂、手指有没有崩、有没有自己烧字幕。

### 5. 剪辑出片（templates/explainer-169）
```bash
bash scripts/new_edit.sh explainer-169 edit                   # 起工程（可 DH_NODE_MODULES_FROM=<已有 Remotion 4.0.408 工程> 省掉 npm install）
python3 scripts/build_tl.py --edit edit                       # cut/ + script.json + cast.json + episode.json → edit/src/tl.json、episode.json、public/
python3 scripts/make_score.py --sec 300 --out edit/public/music/score.mp3   # 配乐：情绪读 episode.json → music.mood，或 --mood tech
cd edit && npx remotion still src/index.ts Explainer s.jpg --frame=<帧>     # 先抽帧看版式
npx remotion render src/index.ts Explainer out/video.mp4 --crf=18
ffmpeg -i out/video.mp4 -c:v copy -af loudnorm=I=-16:TP=-1.5:LRA=11 -c:a aac -b:a 192k out/final.mp4
```
- build_tl 做的事：每段 -16 LUFS 响度归一、按标点切字幕、英文段挂中文、片头卡插到 `titleCard.after` 那段后、把 visual 引用的图片拷进 public 并量好尺寸（`"cast:<id>"` = 那个角色的首帧）。改了 script.json 的 visual 重跑它就行，不用重新生成。
- **抽帧看每段的中间和结尾**：结尾帧里该出现的元素都要出来了；文字不压脸、不出框、不和字幕打架。有问题改 visual 的 `box` / `at` / 字号，重跑 build_tl。
- 声音：模板里 `<OffthreadVideo>` 一律 `muted`，人声单独一条 `<Audio>`（放两遍 = +6 dB 削波）；配乐 `music.bed` 默认 0.14（压在人声下约 20 dB），片头卡抬到 `music.title`。音效按 visual 类型自动加（盖章 slam、金句 ding、数字 pop、换人 swish、全屏场景 whoosh），来自 `make_assets.py` 合成。
- 模板不够用（要新的画面类型）：在 `Explainer.tsx` 的 `Visual` 里加一个 `case`，同时写进 `references/visuals.md`，不要为某一期写死。
- 其他风格：花字口播 `templates/huazi-916`（`references/huazi.md`）；包装组件按 `references/packaging-presets.json` 排、用户点名的手法在上面加减（`references/packaging.md`）。

## 例子
`examples/ep01-moss-lora`：一篇「人物 LoRA 训练」技术文章 → 3 分 38 秒、25 段、4 个角色、英式开场切普通话的讲解片。只有数据文件（script.json 里 25 个 visual、cast.json、episode.json、article/ 配图），渲染走通用模板。写新一期时照着它的 visual 写法来。

## 参考
- references/visuals.md：visual 的全部类型、字段、时间写法、布局坐标
- references/h3.md：H3 提示词结构（I2VA）、Turbo 加速、双实例、实测速度和坑
- references/style-menu.md：五种风格、内容诊断、怎么问用户
- references/packaging.md / packaging-playbook.md / packaging-presets.json：48 个包装组件和用法
- references/huazi.md：花字模板 edit.json 字段
- references/voice.md：声音（H3 原生音色、怎么写 voice、统一音色）
- references/new-avatar.md：做一个新角色
- references/install.md：本机和 GPU 机器的环境
- persona.json：H3 / 文生图的机器与模型配置、默认表演；assets/cast/library.json：现成角色
