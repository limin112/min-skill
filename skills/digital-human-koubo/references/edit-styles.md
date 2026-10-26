# 剪辑模板

几个模板都是 Remotion 工程，`node_modules` 用 `cp -cR` 从任一现有工程克隆（npm 源常 SSL 失败）。时间轴全部来自逐字对齐（tl.json / timeline.json），改文案后重跑对齐即可。

| 风格 | 工程 | 入口 | 适合 |
|---|---|---|---|
| B 花字口播（数据驱动） | skill 内 templates/huazi-916 | src/Huazi.tsx + src/edit.json | 抖音 / 小红书口播、带货、种草 |
| C 发布解读 | templates/reference/launch-169 | src/Film.tsx | 新品发布、横屏 B 站 |
| D 教程 | templates/reference/tutorial-169 | src/Tutorial.tsx | 保姆级教程、操作演示 |
| E 多主播多语言 | templates/reference/multihost-169 | src/Tutorial.tsx（nar / clip / title / outro） | 能力展示、多场景、出海 |
| A 小林式解说 | finance-explainer skill 的 templates/engine | src/Episode.tsx + episode.json | 财经 / 科技事件解说 |

## 花字口播
新片一律用 templates/huazi-916（edit.json 驱动），字段见 references/huazi.md。

## 渲染
`npx remotion render src/index.ts <Composition> out/raw.mp4 --concurrency=6` → `ffmpeg -af loudnorm=I=-16:TP=-1.5:LRA=11 -crf 20` 出片。抽帧检查时一定要看过渡中间帧。

## 声音统一（2026-10-24 教程第二期实测）
- **数字人视频轨一定要 `muted`**：画面用 OffthreadVideo、声音另铺一条时，视频轨不静音会双声叠加，差几毫秒就梳状滤波——听感就是「刺耳、混响忽远忽近」。
- 分段生成的原声（H3 / 早期的 Grok 都一样）：段间齿音差可达 13 dB、混响尾巴 60–380 ms。用 `scripts/voicefx/unify.py`：1/3 倍频程频谱向中位数匹配（±4 dB）→ 去齿音 + 3–7 kHz 轻收 → 同一个小房间 IR（原本湿的段 wet 少、干的段多）→ 每段 -18 LUFS → 整片铺 -60 dBFS 房间底噪。实测齿音段间差 13.2→5.9 dB。
- 只改音频时不用重渲画面：`AUDIO_ONLY=1 npx remotion render … out/mix.wav --codec=wav`（remotion.config.ts 里 CRF/codec 要按 AUDIO_ONLY 跳过），再和旧画面 mux。
- 换声 + 保留原口型（别的 TTS 重念 → 按逐字时间 WSOLA 对齐）实测口型差中位约 100 ms，全屏特写能看出来；要换声又要口型准，用 worker2 的 MuseTalk 按新配音重对口型（musetalk-lipsync skill）。
