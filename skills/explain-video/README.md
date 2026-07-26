# explain-video

把一个概念做成一条**带旁白的讲解视频**：讨论 → 讲解框架 → HTML 幻灯 → 口播稿 →
TTS 人声 → 字幕 → 背景音乐 → Playwright 录屏 → ffmpeg 合成。

没有数字人、没有 avatar。**一份 HTML 就是全片的源文件**，画面和旁白都从它派生。

## 为什么是 HTML 而不是 PPT / 剪映

|  | 拖拽工具 | 这条流水线 |
|---|---|---|
| 改一个字 | 打开软件手动改，重新导出 | 改文本文件，重跑脚本 |
| 做第二条 | 再拖一遍 | 换内容文件，模板不动 |
| 能否 diff / 回滚 | 不能 | 能，就是一堆文本文件 |

代价是第一次要自己写 CSS，比拖 PPT 慢——但这是一次性成本。

## 用法

装好之后（见仓库根目录 README），直接跟 Claude Code 说：

> 帮我做一条讲解视频，主题是 XXX

它会先跟你把**讲解框架**聊定（8 页左右、每页一个 `role`），确认之后再产出
HTML 和口播稿，最后一条命令跑完剩下五步。

也可以只重跑其中一段：

```bash
S=~/.claude/skills/minli-skill/skills/explain-video/scripts

bash $S/build_video.sh presentations/<slug>                       # 全流程
bash $S/build_video.sh presentations/<slug> --tts say             # 零安装先跑通
bash $S/build_video.sh presentations/<slug> --only mix,compose --bgm-volume 0.12   # 只重混音
bash $S/build_video.sh presentations/<slug> --from record         # 改了画面，从录屏往后
```

## 人声：三选一，随时可换

整条管线里**人声是最容易替换的一环**——下游只认最终 wav 的**实测时长**，
不认是谁念的。所以先用能跑的，回头再升级：

| 引擎 | 装什么 | 效果 |
|---|---|---|
| `--tts say` | 不用装（macOS 自带） | 机器音，用来验证流程通不通 |
| `--tts edge` | `pip install edge-tts` | 免费神经网络音色，够用 |
| `--tts voicebox` | 本地跑 Voicebox app | 声音复刻，最像本人 |

默认 `--tts auto`：Voicebox 能连就用它，否则 edge-tts，再否则 `say`。

## 依赖

```bash
pip install playwright pillow && python -m playwright install chromium
brew install ffmpeg
```

在 macOS（Apple Silicon）上开发和跑通。Python / ffmpeg 部分是跨平台的，
只有 `--tts say` 是 macOS 专属。

## 已知短板（V0）

诚实说明，这是第一版：

1. **HTML 效果随机**——同样的模板，这次排版顺眼下次有点松垮；动画是通用的淡入位移，没有设计感。
2. **口播偏平**——TTS 缺语气起伏；声音复刻的音色如果只用中文样本训练，遇到
   HTML / TTS / Whisper 这类英文词会露馅。
3. **没有数字人、没有对口型**——画面就是幻灯片翻页加画外音。

三个都是工程问题，不是路线问题。第 3 条需要的输入（干净人声轨 +
逐句时间轴）这条管线已经产出了，数字人是**接在后面的新环节**，不是推翻重来。

## 设计要点

- **音频时长是主时钟。** 稿子里写的 `data-duration` 只是估算，TTS 念出来多长才算数。
  翻页时间轴、字幕、录屏长度全部按实测的 `voice.wav` 缩放，绝不反过来。
- **字幕时间戳从最终音频倒推，不从稿子正推。** 按字数估的时长，前几句还对得上，
  越往后飘得越远。
- **不要拿 ASR 转录自己的稿子。** 文字本来就是已知的，缺的只是**时间**；
  按字符权重把已知文本铺到实测时长上，每句落点误差约 0.3 秒，比 ASR 更准且不会写错字。

更多坑记在 `SKILL.md` 的 “Things that will bite you”。
