# 例子 · 一篇技术文章 → 3 分 38 秒的数字人讲解片

[![预览：点开看成片](preview.jpg)](ep01.mp4)

▶ 成片：[ep01.mp4](ep01.mp4)（720p · 23 MB，原片 1080p 用下面的命令自己渲染）· 推文：[https://x.com/MinLiBuilds/status/2114876477267386417](https://x.com/MinLiBuilds/status/2114876477267386417?s=20) · skill：[github.com/limin112/min-skill/tree/main/skills/digital-human-koubo](https://github.com/limin112/min-skill/tree/main/skills/digital-human-koubo)

原文：《你的专属「女友马尔福」：MOSS-Image 图像 LoRA 从 0 到 1 实战》（LoRA 训练工具包见 [limin112/Lora](https://github.com/limin112/Lora)）。
成片：16:9 · 25 段 H3 口播 + 片头标题卡 · 4 个角色 · 英式英语开场切普通话 · 中英双语字幕 · 6 个章节。

**这个目录只有数据**，剪辑用 skill 的通用模板 `templates/explainer-169`。写别的文章时照这个结构来：

| 文件 | 内容 |
|---|---|
| `script.json` | 25 段口播：`host / shot / ch / lang / frame / t / sub / zh / act / sound`，每段一个 `visual`（类型见 `references/visuals.md`） |
| `cast.json` | 阵容：4 个角色都从 skill 的角色库借（`{"use": "moss"}`），只改了名牌小字 |
| `episode.json` | 系列名、片名、`theme: "magic"`、片头卡、`music.mood: "magic"`、字幕高亮词 |
| `article/` | 文章原图（visual 用 `article/xxx.jpg` 引用） |
| `frames/` | 三张全屏场景首帧（伦敦雨夜、城堡图书馆、机房），script.json 里 `frame` 引用 |
| `ep01.mp4` | 成片（720p 压缩版） |
| `prompts/` | 角色和场景首帧的文生图提示词（Moss 挂 moss01 LoRA，其余用底模） |

本片用到的 visual：`big`（开场、语言切换、原因分析）· `image` + `chips` / `stamp` / `marks` / `shout`（文章配图）· `images` + `crop`（同一张大图拆成两行对比）· `stats`（训练参数滚动数字）· `bars`（时间花在哪）· `tags`（caption 字段拆解）· `card`（caption 打字、开源清单）· `terminal`（命令和日志）· `flow`（首帧 + 台词 → 画面声音）· `quote` · `shout` · `end`，以及数组（左图右数据卡、上终端下截图）。

## 复现

```bash
cp -R examples/ep01-moss-lora ~/ep01 && cd ~/ep01      # 在 skill 目录外面开工
S=<skill 目录>/scripts
python3 $S/h3.py build script.json tasks.json           # 25 段 · 约 212 秒
python3 $S/h3.py run tasks.json --gpus 2                # 双卡约 45 分钟
python3 $S/h3.py down
python3 $S/assemble.py script.json                      # whisper 回听 → cut/
bash $S/new_edit.sh explainer-169 edit
python3 $S/build_tl.py --edit edit                      # → edit/src/tl.json + episode.json + public/
python3 $S/make_score.py --sec 240 --out edit/public/music/score.mp3
cd edit && npx remotion render src/index.ts Explainer out/ep01.mp4 --crf=18
ffmpeg -i out/ep01.mp4 -c:v copy -af loudnorm=I=-16:TP=-1.5:LRA=11 -c:a aac -b:a 192k out/ep01_final.mp4
```
只想改画面：改 `script.json` 里的 `visual` → 重跑 `build_tl.py` → 渲染，不用重新生成口播。

## 实测
- H3 Turbo 8 步：单段执行 130–270 秒；双卡 25 段 45 分钟。
- whisper 回听：中文 79–100%、英文 87–100%。低分都是「五十六 / 56」这类写法差异，人工确认没有念错，0 段重拍。
- 首帧换成金发版之前用黑发版试拍过 2 段：**LoRA 人物别在提示词里覆盖她学到的特征**（发色），不然就不像她了。
- 第一次渲染响度 -10.8 LUFS、峰值削波：画面里的视频轨没静音，人声叠了两遍。模板里 `<OffthreadVideo muted>`，成片再 loudnorm 到 -16。
