# 声音

## 默认：H3 原生配音
H3 出画面的同时出声音，口型天然对齐。每个角色的音色描述写在 `persona.json → hosts.<id>.voice`，**每段一字不改**，整片音色才统一；口音写在 script.json 的 `lang`（`en-GB` = 英式 RP、`zh` = 普通话）。

段与段之间仍有轻微差异（混响、齿音）时：`python3 scripts/voicefx/unify.py <输出目录> <片段…>` 统一频谱 + 同一个小房间混响，再进剪辑。

## 锁音色：参考音频（ref2va，未实测）
H3 的参考模式（`MiniMaxH3ReferenceToVideo`）能吃最多 3 段参考音频（`<Audio 1>`），官方说干净、清楚的 10 秒左右单人录音最好用。代价：参考模式底模质量比首帧模式略低、构图按提示词走。要用时在 h3.py 的 workflow() 里加 ref 分支（LoadAudio → ref_audios.ref_audio_0），提示词里用 `<Audio 1>` 指代音色。

## 用自己的声音
- 只克隆本人或明确授权的声音。
- 本地没有部署开源 TTS 时，最稳的办法是：整片用 H3 原声，只在画外音 / 场景段用自己录的旁白（主播嘴闭着：提示词写 `says in an off-screen voiceover … while her lips remain completely closed`）。
- worker2 上有 MuseTalk 1.5（`musetalk-lipsync` skill）：先用 H3 出带动作的口播，再用自己的配音让 MuseTalk 重对口型。MuseTalk 只改嘴，头部动作全来自 H3 视频。
