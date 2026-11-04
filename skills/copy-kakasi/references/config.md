# 工程配置（4 个 json，都放在工程根目录）

机器地址不在这里，在用户配置里（见 `h3-setup.md`）。完整模板见本 skill 的 `examples/minimal/`。下面例子里的 `//` 注释只是说明，实际文件要去掉。

## project.json：片子本身
```json
{
 "title": "我的复刻",                        // 成片名：out/<title>_复刻.mp4
 "source": "/abs/path/原片.mp4",
 "source_rights": "own",                    // 必填：own / licensed / public-domain / study-only，问过用户再写
 "src_crop": "1920:804:0:84",               // 可选，ffmpeg crop w:h:x:y，去掉上下黑边
 "size": [1024, 576],                       // H3 生成尺寸，32 的倍数，16:9
 "out_size": [1920, 1080],
 "style": "Live-action, photorealistic, shot on 35mm film: soft diffused natural light, gentle natural film grain, slightly muted colors, natural matte skin with visible pores and fine texture, no oily shine, no sweat, no glossy highlights, no plastic or waxy skin, no beauty filter, no HDR, no over-sharpening",
 "ambience": "Quiet natural ambience, soft wind.",   // H3 自带的环境音（成片用原歌，这里只是让 H3 别出人声和音乐）
 "ai_label": "AI 生成",                     // 可选：左下角 AI 标识的文字。可以改，不能留空（留空用默认）
 "watermark": "@你的名字",                   // 可选：右下角水印
 "job": "my_remake",                        // 可选：H3 机器上 input/output 的子目录名，只能用字母数字下划线连字符；不写自动生成
 "seed": 20261111,
 "grade_strength": 0.7, "grain": 7,         // 可选：调色向原片靠的力度、颗粒强度
 "lyrics": [[1.25, 8.4, "第一句歌词"], [8.5, 15.1, "第二句歌词"]],   // 可选：成片时间轴上的歌词，cut 时叠在画面下方
 "h3_variant": "pika4",                     // 可选：加速方案 pika4 / pika8，要装对应 LoRA（见 h3-setup.md）；用了它 --steps 不生效
 "clean_text": true,                        // 可选（仅 macOS）：去烧录字幕。只处理 subtitle_zone 里的字，不处理台标和水印
 "subtitle_zone": [0, 600, 1536, 864],      // 可选：字幕区（1536×864 坐标），默认画面下方
 "face_mode": "joint"                       // 可选：只影响确认页显示的提示词；实际方式由 faces.py 的子命令决定
}
```

## plan.json：选哪些原片镜头、歌怎么剪
`shots` 里每项是 `[原片镜头编号（ref/shots.txt 的行号，从 0 起）, 在原片里的起点秒, 时长秒]`。
起点离镜头边界至少留 1 帧；`build_ref.py` 会检查放不放得下。画面总长要等于剪好的歌长（差 1 帧以内，否则会警告）。
```json
{
 "audio": {"segments": [[24.3, 74.23], [221.492, 268.3]],   // 原片音轨里取哪几段，按顺序拼
           "xfade": 0.06, "fade_in": 0.2, "fade_out": 1.87},
 "acts": [
  {"act": "一·相遇", "lyric": "（前奏）", "shots": [[0, 0.04, 2.58], [3, 6.29, 2.58]]},
  {"act": "二·回忆", "lyric": "副歌",     "shots": [[12, 43.0, 5.58], [13, 48.96, 3.92]]}
 ]
}
```
剪歌：第二段的起点 = 第一段的终点 + `scan.py align` 找到的偏移（atrim 两头各留 0.03 给交叉淡化）。
画面的镜头可以从原片任何位置取，不必跟着音频段走。

## cast.json：角色
```json
{
 "M": {"name": "the man", "label": "男主", "consent": "fictional", "adult": true, "method": "swap",
       "refs": ["cast/male_front.png"]},
 "F": {"name": "the woman", "label": "女主", "consent": "self", "adult": true, "method": "repaint",
       "refs": ["cast/me_1.png", "cast/me_2.png", "cast/me_3.png", "cast/me_side.png"],
       "identity": "the same soft rounded face shape, full cheeks and jawline, the same eyes, eyelids, eyebrows, the same rounded nose tip, full lips and skin tone",
       "accessory": "thin round wire-rim glasses with clear lenses"},
 "P": {"name": "the friend", "consent": "consented", "adult": true, "consent_record": "cast/consent_friend.txt", "method": "repaint",
       "refs": ["cast/friend_1.png"]}
}
```
- `consent`：`self`（用户本人）/ `consented`（本人明确同意）/ `fictional`（AI 生成的虚构人）。别的值脚本直接退出。
- `adult`：必须是 `true`。
- `consent_record`：`consented` 必填，指向工程里一份非空的文本：谁、何时、同意用在什么片子。
- `method`：`swap` 直接换（只用 `refs[0]`）；`repaint` 打码后重画（用全部 `refs`，`identity` 写脸的特征）。`faces.py joint` 对所有写了 `pose` 的角色生效。
- `label`：确认页上的显示名，可选。
- `refs`：裁到脸和肩、光线清楚、没有别人。repaint 时 2–4 张不同角度 + 1 张侧脸最好。
- `accessory`：一直戴着的东西（眼镜、耳环）。换脸和 H3 提示词里都会带上"一直戴着、不闪烁、不变形"。
- `where`：joint 模式下这个角色在画面里的位置（"on the left"），可选。

这些字段只是记录，脚本验证不了真假。核实靠问用户。

## shots.json：每个镜头
```json
[
 {"n": "10", "who": ["M", "F"], "cx": 0.5,
  "desc": "A medium two-shot: the woman grabs the young man's arm while he flinches and turns to her in surprise. Emotion: playful, teasing; he is startled but secretly charmed.",
  "cam": "The camera holds a steady medium shot.",
  "swap": {"M": "the young man on the right"},
  "pose": {"F_a": "She is at the left edge of the frame, head bowed, looking down at the man's arm with playful concentration; lips slightly parted.",
           "F_b": "Three-quarter view facing frame-right toward the man, a small mischievous smile while she holds his wrist."},
  "box":  {"F_a": [128, 192, 416, 608]},
  "hint": {"F": [0, 700]}},
 {"n": "01", "who": ["M"], "cx": 0.5, "desc": "...", "first_only": true}
]
```
| 字段 | 用途 |
|---|---|
| `n` | 两位编号，对应 `ref/NN.mp4` |
| `who` | 画面里出现的角色（决定 H3 提示词里加哪些配饰说明） |
| `cx` | 原片比 16:9 宽时，16:9 裁切框的水平中心（0 最左，1 最右）。看 `qc/keys_src.jpg` 调 |
| `desc` | H3 提示词主体：画面 + 动作 + **Emotion:**，英文 |
| `cam` | 镜头运动，照原片；不写就是"几乎不动" |
| `swap` | 要直接换脸的角色 → 在画面里怎么指认他（"the young man on the right"） |
| `pose` | 打码重画的角色每一帧的头部朝向和表情（`F_a`、`F_b`）。打码后模型看不到原脸，全靠这句。脸被挡住的帧不写，就不重画 |
| `box` | 手标打码框，1536×864 坐标 `[x0, y0, x1, y1]`。自动检测对侧脸、低头、闭眼、贴脸拥抱、特写常找不到 |
| `hint` | 两人同框时，这个角色脸中心的水平范围，用来从检测结果里挑对人 |
| `pad` | joint 模式：脸被画面边缘切掉时，缩小放进带模糊延展边的画布再画（也可以给 `faces.py joint --pad 1`） |
| `take` | `"head"`：成片只取 H3 输出的前 N 帧（原速）。后半段出问题（例如开始张嘴）时用 |
| `speed` | 成片里这一镜的播放速度，从 H3 输出开头按这个倍速取帧（例如 1.5）。要用的帧超过 H3 输出时结尾会定格，`grade` 会警告 |
| `sound` | 这个镜头单独的环境音。不想让人物说话时写成完全静默（"Complete silence ... No human voice, no speech"） |
| `steps` | 这个镜头的 H3 步数（返工时设 20），覆盖 `--steps` |
| `first_only` | 只给首帧。H3 往下自由生成，finish 取前 N 帧不重采样 |
| `src_at` | `{"b": 72.95}`：这一帧直接从原片这个时间（秒）取。改完重跑 `keys.py --only NN`，再删掉这一帧旧的 swap/repaint 结果重做 |
| `keep_orig` | 这个镜头成片直接用原片、不跑 H3（没有主角的脸的镜头）。会写进 manifest |

返工字段可以叠加，镜头表本身就是返工记录。
