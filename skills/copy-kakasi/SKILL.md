---
name: copy-kakasi
description: 「copyKakasi / 逐镜复刻」：把一段有权使用的视频（MV、短片、广告）按原片分镜 1:1 重拍——构图、机位、动作、节奏、配乐都照原片，只把演员换成用户本人、本人明确同意的成年人或 AI 虚构角色。流程：切镜头 → 选镜头、剪歌 → 取首尾帧 → 换脸或打码重画 → 用户自己部署的 MiniMax H3 首尾帧模式逐镜头生成 → 重采样回原帧数、去油腻调色 → 拼接配歌、AI 标识 → 上下对照版。触发：copyKakasi、copy-kakasi、「逐镜复刻」「1:1 复刻」「照着原片一镜一镜重拍」「把这段 MV 换成我来演」，以及成片后按镜头返工（「这镜不要说话」「动作太快」「脸崩了」「跟原片剧情不符」）。不用于：把未同意的真人、未成年人、公众人物的脸放进去；只仿风格、内容重写的新片。
---

# copyKakasi：原片分镜不动，只换演员

`scripts/` 靠工程里的 4 个 json 驱动，命令一律在**工程根目录**跑：`S=<本 skill>/scripts; python3 $S/xxx.py ...`

## 红线（开工前就讲清楚）
- **只换成三种人**：用户本人、本人明确同意的成年人、AI 虚构角色。`cast.json` 每个角色都要写 `consent: self | consented | fictional` 和 `adult: true`；`consented` 还要有 `consent_record`（谁、何时、同意用在什么片子）。用户给来真人照片时，**先问清楚是谁、有没有同意、是否成年**，确认了再写，不替用户填。不做未成年人，不做公众人物或"像某某"。脚本只能查字段，核实靠你问。
- **原片要问来源**：`project.json` 的 `source_rights` 必须问过用户再写（`own` 自己的 / `licensed` 有授权 / `public-domain` 公版 / `study-only` 没有授权、只做个人学习研究）。`study-only` 要讲清楚：别人的作品没有授权，是否算合理使用取决于当地法律，责任在用户；成片不要公开发布或商用。
- **模型协议**：MiniMax H3 社区协议不覆盖欧盟、英国、韩国、美国，也禁止侵权、未经同意冒充他人。用户问到或所在地相关时如实说，详见 `references/h3-setup.md`。
- **不去台标和水印**，不教用户绕过平台下载限制。原片由用户自己提供文件。台标和黑边可以用 `src_crop` 裁出画面，这是构图；要求"把这个水印去掉"就拒绝。
- **AI 标识不能去**：`finish.py cut` 总会把 AI 标识烧进成片。
- **H3 机器可能是共享的**：只停 `start_command` 起的、登记过的实例；别人的任务在队列里时，`h3_fl.py` 默认不开跑，告诉用户，同意了才加 `--allow-busy`。
- **地址不外写**：H3 地址只进用户配置，不写进工程文件、汇报和文档。
- 删大文件（1GB 级的未压缩成片、旧版本）前先问。

## 第 0 步：环境（只有缺的时候才问用户）
先跑 `python3 $S/doctor.py`。
- **配置过了**：不问，直接用。开跑 H3 之前再跑 `doctor.py --h3`，看显卡、ComfyUI、节点、模型和队列。
- **没配置 H3**：问用户一次（用 `AskUserQuestion`）H3 在哪里，**不要猜地址**：
  - 在这台机器上：`python3 $S/configure.py --host local --comfy-root <ComfyUI路径> --ports 8188`
  - 在能 ssh 的机器上：`python3 $S/configure.py --host <ssh别名> --comfy-root <ComfyUI路径> --ports 8188,8190`（多张卡配多个端口）
  - 还没有：部署见 `references/h3-setup.md`。切镜头、换脸这些步骤仍然能做，**开工就说清楚**成片要等 H3，别等换完脸才说。
- 配置写一次就记住，以后的工程不再问。要改用户会说。
- **出图通道**：默认 Codex CLI，不问。没有 Codex 或用户有自建服务，见 `references/image-providers.md`。
- `joint` 模式和 `qa_h3.py` 要人脸模型：`python3 $S/doctor.py --fetch-models`（约 40MB，下载前告诉用户）。

## 工程目录
```
<工程>/
  project.json  plan.json  cast.json  shots.json      ← 4 个配置，格式见 references/config.md；模板在本 skill 的 examples/minimal/
  cast/            角色身份照片（本人照片 2–4 张不同角度 + 一张侧脸效果最好）
  ref/             shots.txt shots.jpg lyrics.tsv | edl.json NN.mp4 audio.wav ref.mp4 storyboard.jpg
  keys/src/        原片首尾帧 NN_a.png / NN_b.png（1536×864）
  keys/swap/       直接换脸   keys/masked/ 打码底图   keys/repaint/ 打码重画   keys/clean/ 去字幕的原帧   keys/user/ 用户自己做的帧（最高优先）
  keys/h3/         实际发给 H3 的 JPEG
  gen/             H3 原始输出 NN.mp4 + state.json + NN.qa.json
  graded/  out/  qc/
```

## 流程（4 个检查点，到了就停下来给用户看）
1. **拿原片** 请用户提供视频文件，放进工程的 `src/`。写 `project.json`：`source`、`source_rights`、`src_crop`（去黑边，例如 `1920:804:0:84`）、`style`。
2. **拆原片**
   - `python3 $S/scan.py cuts` → `ref/shots.txt` + `ref/shots.jpg`（镜头总览，带编号和时间）。
   - 歌词：`python3 $S/scan.py ocr --strip <y>:<h>` 读烧录字幕（先截一帧量出字幕条的 y 和高度；只有 macOS 能用，别的系统让用户给歌词）。**不要用 whisper 听歌**，会幻听。
   - 要剪短歌：`python3 $S/scan.py align <副歌1起> <止> <搜索起> <搜索止>` 找第二、三遍副歌的精确偏移，在同一个小节位置接，接口听不出来。
3. **定剪辑** 和用户一起选镜头、定叙事，写 `plan.json`，然后 `python3 $S/build_ref.py`。它会报画面和音频的总长，并扫出镜头内部的暗切和黑场闪帧。
   - 先问清楚**用在哪、多长、高潮在第几秒、哪些镜头必须有**，比剪完再改省事。
   - 音频：铺垫段用主歌，高潮接最后一遍副歌，接口挑音量低点，交叉淡化 60–80 ms。
   - 画面按幕排（每幕写进 `acts`），一幕里的镜头可以从原片任何地方取。**尽量取 ≥1.5 秒的镜头**：0.6–1 秒的快切到了 H3 那步要从 5 秒压回去，动作会快进好几倍。单个镜头不超过 15 秒。
   **▶ 检查点 1**：给用户看 `ref/ref.mp4` 和 `ref/storyboard.jpg`，确认剪辑和时长。
4. **写镜头表和角色表** `shots.json`：每个镜头的 `cx`（16:9 裁切中心）、`desc`（画面 + **情绪**，照原片写，要具体到眼神、嘴、呼吸）、`cam`、要换谁（`swap`）、打码重画时的 `pose`。`cast.json`：每个角色的身份照、`method`、配饰。写法见 `references/prompts.md`。
   **有剧情含义的镜头**（递东西、受伤、拥抱、转身离开），写 `desc` 之前先 `python3 $S/keys.py look NN --pad 2`，看 `qc/look_NN.jpg` 里整段（含前后 2 秒）发生了什么，只看首尾帧容易理解错。
   原片这一镜的尾帧没拍到关键那一刻，在 `shots.json` 写 `src_at` 从原片别的时间取帧。
   然后 `python3 $S/keys.py --sheet`，看 `qc/keys_src.jpg` 核对裁切。
5. **换脸** 先挑 2–3 个有代表性的镜头试（正脸、侧脸、两人同框各一个），通过了再全量。三种方式（`--dry` 可先看提示词；全量加 `--wait 60`，出图满载时每 3 分钟补一轮）：
   - `faces.py swap`：直接换，快，适合 AI 虚构角色；骨相会跟着原演员走。远景小脸、背影、动作糊的镜头没法打码，也走它。
   - `faces.py repaint`：打码后按身份照重画，用户本人这种"要像"的角色用它。
   - `faces.py joint`：所有角色一起打码、一次重画，只把头贴回原帧并自动质检，调用次数最少。项目里两人同框多时优先用。
   - **不要因为难换就留原片的脸**。没有主角的脸的镜头（黑场、腿部特写）才写 `keep_orig`，汇报里列出来。
   - 出图长时间满载时的退路：首帧要特写就 `keys.py zoom` 从已换好的帧里裁；尾帧出不来就 `first_only: true`，H3 按描述往下演。汇报时说清哪些镜头用了退路。
   - 自动人脸检测找不到的帧（仰头、侧脸、远景小脸），在 `shots.json` 的 `box` 里手标。
   **▶ 检查点 2**：`python3 $S/review.py --open` 生成确认页 `qc/review.html`（无限画布；每个镜头原片和结果并排，带提示词；质检没过的帧标在卡片顶部）。用户逐镜头勾「通过」或写意见，点「导出意见」把 JSON 贴回来，按镜头重做。用户想自己加工某几帧，放进 `keys/user/NN_a.png` 就会被优先使用。
6. **H3 出镜头** `python3 $S/h3_fl.py print 03` 先看提示词；`python3 $S/doctor.py --h3` 看机器；然后 `python3 $S/h3_fl.py run`。8 步双卡每个镜头约 2–5 分钟，先把预计时间告诉用户。用后台方式跑，日志重定向到文件。中途失败再跑一次 `run` 只补没出的。质检没过的帧默认不送，给用户看过后才 `--accept-qa`。
   跑完 `python3 $S/qa_h3.py`（查中间多人、换场景、自编字幕），没过的镜头按下面的表返工。
7. **调色拼片** `python3 $S/finish.py grade` → `python3 $S/finish.py cut` → `python3 $S/finish.py compare`。有镜头没出片时 `cut` 默认停下，要用原片顶着看整体，问过用户再加 `--allow-original`。
   **▶ 检查点 3**：给用户成片 + 上下对照版，再跑一次 `review.py --open`（卡片顶部有成片预览，悬停播放）。按镜头收意见，只重跑那几个：`h3_fl.py run --redo NN` 会把旧版挪进 `_old/`，然后 `finish.py grade --only NN` → `cut` → `compare` → `review.py`。
8. **汇报** **▶ 检查点 4**：照 `out/manifest.json` 写清：哪些镜头用了原片画面或只给了首帧、质检没过和已知瑕疵、GPU 用了多久、文件在哪、多大。

## 按意见返工
| 用户说 | 改法 |
|---|---|
| 「这镜不要说话」 | `sound` 写完全静默；`desc` 开头写 "A silent moment: his mouth stays firmly closed, only his eyes move…"；`--redo NN --steps 20`；还张嘴就 `take: "head"` 只取前半段 |
| 「动作太快」 | 多半是短镜头被 5 秒的 H3 输出压缩了 3–9 倍：设 `speed: 1.5`（只用重跑 `finish.py grade`，不用重跑 H3）。`grade` 打印的倍速超过 3 的镜头都值得先看一眼 |
| 「脸崩了」「眼镜变了」 | `--steps 20`；`desc` 加"脸清楚自然、跟首尾帧一致；眼镜细小"；还崩就换一张更正面的首帧 |
| 「跟原片剧情不符」 | `keys.py look NN --pad 2` 看整段；`desc` 写清"在做什么、为什么、不要出现什么"；尾帧不对就 `src_at` 换原片帧再重做；尾帧做不出来就 `first_only` |
| 「开头给个特写」 | `keys.py zoom NN_a X Y W` 裁出特写当首帧，`cam` 写"从特写慢慢拉开到中景"，尾帧不动 |
| 「这里为什么用原片」 | 在 `swap` 里把这个角色列上直接换，别留原脸 |

每改一个镜头，在 `shots.json` 那一镜里留下改法（字段本身就是记录），下次返工能看懂上次做了什么。

## 为什么是首尾帧模式（fl2va），不是参考模式（ref2va）
ref2va 把原片当"参考"，会重新编一个场景，人也可能换成陌生人。fl2va 把换好脸的首帧、尾帧**钉死**在第 0 帧和最后一帧，构图、站位、光线都跟原片一样，H3 只负责补中间的动作。代价是中间的动作靠提示词描述，所以 `desc` 里的情绪和动作要照原片写细。

## 详细资料
- `references/config.md`：4 个配置文件的字段和例子。
- `references/h3-setup.md`：部署 H3、用户配置、显存要求、模型协议。
- `references/image-providers.md`：出图通道（Codex / 自建 HTTP 服务）。
- `references/prompts.md`：换脸、打码重画、H3 提示词的写法。
- `references/pitfalls.md`：常见的坑和解决办法，**开工前读一遍**。
