# 例子 · MOSS 魔法学院 · 第一课：你的专属「女友马尔福」

![预览](preview.jpg)

3 分 38 秒 · 16:9 · 25 段 H3 口播 + 片头标题卡 · 4 个角色 · 英式英语开场切普通话 · 中英双语字幕

讲两件事：**怎么用 MOSS-Image 训练一个人物 LoRA**（数据、caption、训练、验收、身份泄漏、Loss、导出 ComfyUI），以及**怎么让她自己开口讲课**（本地 MiniMax H3 + Turbo 加速 + whisper 回听 + Remotion 剪辑）。内容来自文章《你的专属「女友马尔福」：MOSS-Image 图像 LoRA 从 0 到 1 实战》，LoRA 训练工具包见 [limin112/Lora](https://github.com/limin112/Lora)。

## 文件

| 路径 | 内容 |
|---|---|
| `script.json` | 口播稿：25 段，字段 `host / lang / shot / frame / act / sound / sub / zh` |
| `cast/*.json` | 角色和场景的 MOSS-Image 提示词（Moss 加 moss01 LoRA，其余用底模） |
| `frames/` | 三张场景首帧（伦敦雨夜、城堡图书馆、机房）；角色首帧在 skill 的 `assets/cast/` |
| `tools/build_tl.py` | cut/ → `edit/src/tl.json`：逐字时间、按句字幕、英文段配中文、片头卡、每段 -16 LUFS |
| `tools/make_score.py` | 代码合成的原创配乐（D 小调 · 72 BPM · 弦乐铺底 + 钢片琴琶音 + 定音鼓 + 混响） |
| `edit/src/Episode.tsx` | Remotion 剪辑：深色魔法学院主题、主播小窗、全屏场景、章节进度、每段的配图动画 |
| `edit/public/` | 角色图、文章配图（音效和配乐用脚本生成，口播片段用 H3 生成，都不进仓库） |

## 复现

```bash
cp -R examples/ep01-moss-lora ~/ep01 && cd ~/ep01      # 在 skill 目录外面开工
S=<skill 目录>/scripts
python3 $S/h3.py build script.json tasks.json           # 25 段 · 约 212 秒
python3 $S/h3.py run tasks.json --gpus 2                # 双卡约 45 分钟
python3 $S/h3.py down
python3 $S/assemble.py script.json                      # whisper 回听 → cut/
python3 tools/build_tl.py                               # → edit/src/tl.json + edit/public/clips/
python3 tools/make_score.py 240                         # → edit/public/music/score.mp3
python3 $S/make_assets.py edit/public                   # → edit/public/sfx/
cd edit && npm install && npx remotion render Episode out/ep01.mp4
ffmpeg -i out/ep01.mp4 -c:v copy -af loudnorm=I=-16:TP=-1.5:LRA=11 -c:a aac -b:a 192k out/ep01_final.mp4
```

## 实测
- H3 Turbo 8 步：单段执行 130–270 秒；双卡 25 段 45 分钟。
- whisper 回听：中文 79–100%、英文 87–100%。低分都是「五十六 / 56」这类写法差异，人工确认没有念错，0 段重拍。
- 首帧换成金发版之前用黑发版试拍过 2 段：**LoRA 人物别在提示词里覆盖她学到的特征**（发色），不然就不像她了。
- 第一次渲染响度 -10.8 LUFS、峰值削波：画面里的视频轨没静音，人声叠了两遍。现在 `<OffthreadVideo muted>`，成片再 loudnorm 到 -16。
