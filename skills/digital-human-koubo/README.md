# digital-human-koubo · 任意文章 → 本地数字人讲解视频

**中文** · [English](README.en.md) · [日本語](README.ja.md)

**给它一篇文章，出一条多角色、带配图动画和双语字幕的讲解片。** 全程本地开源模型，不接任何云端生成服务；换一篇文章只写数据，不改代码。

```
文章 ─▶ 口播稿 script.json（多角色 · 多语言 · 每段一个声明式画面 visual）
本地文生图（MOSS-Image，可挂自己训的人物 LoRA）─▶ 角色首帧
MiniMax H3 + Turbo LoRA（8 步，双卡）─▶ 每段「画面 + 原生配音」
whisper.cpp 逐段回听 ─▶ 逐字对齐 ─▶ 通用 Remotion 模板 + 代码合成配乐 ─▶ 成片
```

[![例子预览：点开看成片](examples/ep01-moss-lora/preview.jpg)](examples/ep01-moss-lora/ep01.mp4)

▶ **成片**：[examples/ep01-moss-lora/ep01.mp4](examples/ep01-moss-lora/ep01.mp4)（3 分 38 秒 · 720p · 23 MB）· **推文**：[https://x.com/MinLiBuilds/status/2114876477267386417](https://x.com/MinLiBuilds/status/2114876477267386417?s=20) · **仓库**：[github.com/limin112/min-skill/tree/main/skills/digital-human-koubo](https://github.com/limin112/min-skill/tree/main/skills/digital-human-koubo)

## 一期工程长这样

```
my-episode/
  article/        文章和配图
  script.json     [{"id":"s04","host":"host","ch":"① 原理","t":"……念的原文……",
                    "visual":{"type":"image","src":"article/fig1.jpg","marks":[{"rect":[120,80,600,300],"at":"这一块"}]}}, …]
  cast.json       {"host":{"use":"moss"},"buddy":{"use":"oliver"}}      ← 借角色库，或新建
  episode.json    {"series":"…","title":"…","theme":"tech","music":{"mood":"tech"}, …}
```

**画面类型**（`references/visuals.md`）：`big` 大字 · `image` 配图（裁切 / 圈重点 / 盖章 / 喊话）· `images` 多图对比 · `stats` 滚动数字 · `bars` 柱状对比 · `terminal` 终端 · `flow` 流程 · `tags` 标签 · `list` 清单 · `card` 卡片 · `quote` 金句 · `shout` 大字喊话 · `end` 片尾阵容；数组 = 一段里叠几个。每个元素用 `"at": "念到的那个词"` 卡在口播上。

**情绪预设**（配色 + 配乐一起换，`episode.json` 一个词）：

| | 配色 | 配乐（`scripts/make_score.py`，纯代码合成，无版权） |
|---|---|---|
| `magic` 魔幻 | 深紫 + 金 · 星空 · 月牙 | D 小调 72 BPM：弦乐铺底 + 钢片琴琶音 + 轻定音鼓 |
| `tech` 科技 | 深蓝 + 青 · 网格 | A 小调 112 BPM：合成器铺底 + 方波琶音 + 脉冲贝斯 + 电子鼓 |
| `warm` 温暖 | 深棕 + 橙 · 纯色 | C 大调 84 BPM：柔和铺底 + 钢琴分解和弦 + 指弹低音 |
| `epic` 史诗 | 暗红 + 金 · 星空 | C 小调 90 BPM：厚铺底 + 铜管长音 + 战鼓 + 大混响 |

**现成角色**（`assets/cast/library.json`，`{"use": "<id>"}` 直接借）：

| | id | |
|---|---|---|
| <img src="assets/cast/moss_916.jpg" width="80"> | `moss` | 真人感主讲（MOSS-Image + 自训 moss01 LoRA） |
| <img src="assets/cast/oliver_916.jpg" width="80"> | `oliver` | 英式黑框眼镜搭档 |
| <img src="assets/cast/hoot_169.jpg" width="140"> | `hoot` | Pixar 风猫头鹰助教 |
| <img src="assets/cast/chibi_916.jpg" width="80"> | `chibi` | 二次元 Q 版 |

新角色：`scripts/gen_image.py` 出首帧，写进 cast.json（`references/new-avatar.md`）。

## 用法

装好后对 Claude 说「把这篇文章做成讲解视频」「用数字人讲一下这个链接」，流程见 [SKILL.md](SKILL.md)。手动跑：

```bash
python3 scripts/h3.py build script.json tasks.json      # 分段 + 拼 H3 提示词 + 估时间
python3 scripts/h3.py run tasks.json --gpus 2           # 双卡生成，断点续跑
python3 scripts/assemble.py script.json                 # whisper 回听、剪段尾 → cut/
bash scripts/new_edit.sh explainer-169 edit             # 起剪辑工程
python3 scripts/build_tl.py --edit edit                 # 时间轴 + 字幕 + 素材
python3 scripts/make_score.py --out edit/public/music/score.mp3
cd edit && npx remotion render src/index.ts Explainer out/video.mp4
```

完整例子 [`examples/ep01-moss-lora`](examples/ep01-moss-lora)：一篇人物 LoRA 训练文章 → 3 分 38 秒、25 段、4 个角色、英式开场切普通话。

## 依赖

| | 在哪 | 说明 |
|---|---|---|
| MiniMax H3（ComfyUI） | 一台 24G+ 显卡的机器 | 权重从 ModelScope `Comfy-Org/MiniMax-H3` 下；加速：`scripts/h3_setup_accel.sh`（Turbo 节点 + LoRA，走 ModelScope） |
| 文生图（默认 MOSS-Image + KohakuMoss） | 一台 24G+ 显卡的机器 | 环境见 [limin112/Lora](https://github.com/limin112/Lora)；换别的模型改 `gen_image.py` 的远端命令 |
| ffmpeg · Python 3 + numpy · Node 18+ · whisper-cli | 本机 | `bash scripts/doctor.sh` 一键检查 |

机器地址、模型路径在 `persona.json` 的 `h3` / `image` 两节，换机器改那里。部署细节、实测速度和坑见 [references/h3.md](references/h3.md)。

| 实测（RTX 4090 48G） | 一段口播 |
|---|---|
| H3 原版 20 步 · 1024×576 · 15 秒 | ~23 分钟 |
| **H3 + Turbo 8 步 · 480×864 · 7–9 秒** | **~2–4.5 分钟**（双卡并行，25 段约 45 分钟） |

## 来源与授权
- fork 自 [andyhuo520/digital-human-koubo](https://github.com/andyhuo520/digital-human-koubo)（MIT，见 [LICENSE-upstream](LICENSE-upstream)）：花字模板、48 个包装组件、回听 / 对齐 / 声音统一脚本来自上游。本 fork 把生成后端换成本地文生图 + MiniMax H3，加了通用文章讲解模板、声明式画面、角色库、多角色、多语言、双卡调度和配乐情绪预设。
- 上游的主播形象图、风格预览图、包装图鉴是原作者的数字人，按上游 NOTICE 不随这里分发（见 [assets/README.md](assets/README.md)）。
- 第三方组件见 [NOTICE.md](NOTICE.md)。所有角色都是 AI 生成的虚构人物，不对应真人或现有 IP，成片里标「AI 生成」。
