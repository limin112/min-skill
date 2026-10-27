# visual：每段画面怎么写（templates/explainer-169）

script.json 每段一个 `visual`（对象，或几个对象的数组）。`build_tl.py` 把它原样搬进 `tl.json`，`Explainer.tsx` 按 `type` 画出来。
换文章只写数据；模板缺类型就在 `Visual` 里加 `case`，并补进这份文档。

## 画布和区域

```
1920 × 1080
┌──────────────────────────────────────────────────────────────┐
│ 系列名 · tag                                  ①章节 ②章节 ③… │  顶栏 y 42
│                                                    ┌───────┐ │
│  内容区 AREA：x 90 · y 180 · w 1260 · h 600        │ 主播  │ │  小窗 x 1462 · y 168
│  （visual 默认画在这里；box 可改）                  │ 9:16  │ │       396 × 704
│                                                    └───────┘ │
│                    字幕（底部 34px，宽 1360）                 │
└──────────────────────────────────────────────────────────────┘
```
- `shot: "pip"`（默认）：右边主播小窗，visual 画在左边内容区，别越过 x≈1420。
- `shot: "scene"`：主播全屏（16:9 首帧），visual 叠在画面上：`big` / `quote` / `card` 靠左上，`stats` 贴底，`shout` 居中偏下。别挡脸，先抽帧看。

## 通用字段

| 字段 | 说明 |
|---|---|
| `type` | 下面的类型之一 |
| `at` | 整个组件出现的时刻（见「时间」）；不写 = 段首 + 0.1 秒 |
| `box` | `{x, y, w, h}` 覆盖默认区域（只写要改的键）。数组 visual 靠它左右 / 上下分区 |
| 颜色 | `accent` `accent2` `good` `bad` `info` `extra` `ink` `mute`（取 episode 配色），或 `#hex` |
| 文字 | 标题类字段支持 `**重点**`（强调色）和 `\n`（换行） |
| 图片 | `src` / `img` 写**相对工程目录**的路径（一般 `article/xxx.jpg`），或 `"cast:<角色id>"` = 那个角色的首帧；build_tl 会拷进 public 并量尺寸 |

## 时间：`at`

| 写法 | 意思 |
|---|---|
| `"六十五"` | 这段口播里「六十五」开始的时刻（whisper 逐字对齐；第一次出现的位置） |
| `["六十五", 0.6]` | 那个词之后 0.6 秒（负数 = 提前） |
| `1.5` | 段首后 1.5 秒 |
| 不写 | 列表类按顺序自动错开（约 0.4–0.8 秒一个） |

词要和 `t` 里的写法一字不差（`t` 写「一千二百」就别写「1200」）。找不到的词退回默认时间，不报错——抽帧时留意没出来的元素。

## 类型

### `big` 大字标题（开场、章节转折、结论）
```json
{"type": "big", "kicker": "这一期，教你两件事", "title": "训练一个我\n**再让我开口讲课**", "sub": "副标题",
 "cards": [{"title": "① 人物 LoRA", "sub": "56 张图 · 一张 4090", "at": "训练", "color": "accent", "w": 560}],
 "chips": [{"text": "Mandarin, please.", "color": "info", "at": "Mandarin"}]}
```
`size`（标题字号，默认 88；长标题 72–76）· `serif: true`（斜体衬线，适合英文金句）· `y`。`cards` 和 `chips` 二选一或都不要。

### `image` 一张图（文章配图、截图、对比图）
```json
{"type": "image", "src": "article/loss.jpg", "label": "真实 Loss 曲线",
 "crop": [0, 329, 1800, 750],
 "marks": [{"rect": [131, 119, 1321, 357], "text": "0.4 ~ 0.65 来回跳", "at": "零点四", "color": "bad"}],
 "chips": [{"text": "看固定测试图", "color": "good", "at": "固定测试图"}],
 "stamp": {"text": "身份泄漏", "at": "全变成了我", "x": 0.6, "y": 0.62},
 "shout": {"text": "全世界都变成我啦！", "at": 0.2}}
```
- 图在 box 里等比放（不裁不变形）；`crop` = 原图像素 `[x, y, w, h]`，只显示那一块（长图、截图里的一小块）。
- `marks` 圈重点：`rect` 用**原图像素**坐标（打开原图量），虚线框 + 角标文字，按 `at` 依次弹出。
- `chips` 排在图下方一行；`stamp` 盖章（`x`/`y` 是 box 里的比例位置，自带 slam 音效）；`shout` 大字喊话（自带 ding 音效和撒花）。
- `align: "left"` 图靠左（右边留给另一个组件）。

### `images` 多张图并排 / 上下（对比、前后、A/B）
```json
{"type": "images", "layout": "rows", "items": [
  {"src": "article/grid.jpg", "crop": [130, 50, 1800, 360], "title": "第 300 步", "sub": "泄漏最轻", "color": "good", "at": "第三百步"},
  {"src": "article/grid.jpg", "crop": [130, 770, 1800, 360], "title": "第 900 步", "sub": "更像她", "color": "accent", "at": "第九百步"}]}
```
`layout`：`cols`（默认，左右，标题在图下）/ `rows`（上下，标题压在图左下）。同一张大图用不同 `crop` 拆成几块是常用手法。

### `stats` 数字卡（参数、成绩、成本）
```json
{"type": "stats", "items": [
  {"value": "RTX 4090", "label": "48G 显存 · 一张卡", "at": "4090"},
  {"count": [0, 1200], "label": "训练步数", "at": "一千二百"},
  {"count": [0, 65], "suffix": " 分钟", "label": "总训练时长", "at": "六十五"},
  {"count": [3.2, 1.8], "dec": 1, "suffix": "s", "label": "延迟", "color": "good"}]}
```
`value` 静态文字，`count: [从, 到]` 滚动数字（`dec` 小数位，自带 pop 音效）。`pos`：`center`（pip 默认）/ `bottom`（scene 默认，贴底一排）。`column: true` 竖排（配 `box` 放在图右边）。

### `bars` 柱状对比（时间、占比、前后）
```json
{"type": "bars", "title": "时间花在哪", "items": [
  {"label": "训练", "text": "1 小时", "value": 1, "color": "info", "at": "一个小时"},
  {"label": "准备数据", "text": "3 小时 15 分", "value": 3.25, "color": "accent", "at": "三个多小时"}],
 "note": {"text": "数据才是大头", "at": ["三个多小时", 0.6]}}
```
`max` 不写取最大值；`w` 卡片宽度（或用 `box`）。

### `terminal` 终端 / 代码（命令、日志、配置）
```json
{"type": "terminal", "title": "h3.py run tasks.json --gpus 2", "y": 180, "lines": [
  {"text": "python3 h3.py run tasks.json --gpus 2", "at": 0.1},
  {"text": "  ✓ s03 → gen/s03.mp4", "out": true, "color": "good", "at": "生成完"},
  {"text": "⚠ s07 准确率 71% → 换种子重拍", "out": true, "color": "bad", "at": "念错"}]}
```
每行按 `at` 打字机效果打出来；`out: true` = 输出行（不带 `$`）。高度按行数自动算（或 `h`）；`y` 改上沿。

### `flow` 流程（输入 → 处理 → 输出，2–4 步）
```json
{"type": "flow", "title": "本地 **MiniMax H3**：一张图 + 一句话", "steps": [
  {"img": "cast:host", "title": "首帧", "sub": "定妆照当第一帧", "at": "首帧"},
  {"code": "<d>[Chinese]\n没问题。\n</d>", "title": "台词", "at": "台词"},
  {"title": "画面 + 声音", "sub": "一次生成", "color": "accent", "at": "画面和声音"}]}
```
每步可带 `img`（`imgPos` 调裁切焦点，默认 `center 22%`，适合人像）或 `code`。

### `tags` 标签 / 字段 / 关键词
```json
{"type": "tags", "kicker": "标签式 caption", "title": "逗号隔开，简单好改", "items": [
  {"text": "moss01,", "label": "触发词", "at": "触发词"}, {"text": "upper-body portrait,", "label": "构图", "at": "构图"}]}
```
默认等宽字体（适合代码、提示词）；`mono: false` 换正文字体（适合中文关键词）。颜色不写自动轮换。

### `list` 清单（要点、步骤、注意事项）
```json
{"type": "list", "title": "开跑前检查", "numbered": true, "items": [
  {"text": "看 **nvidia-smi**", "sub": "别抢别人的卡", "at": "显卡"}, {"text": "先拍一段验收", "at": "验收"}]}
```

### `card` 小卡片（一段代码 + 说明、清单、链接）
```json
{"type": "card", "title": "caption 长这样", "pos": "left", "w": 640, "y": 130,
 "code": {"hi": "moss01", "hiAt": "开头", "text": ", upper-body portrait, ...", "at": "后面"},
 "lines": [{"text": "训练文章 + Notebook", "at": "文章"}, {"text": "这条视频的整套 skill", "mark": "✓", "at": "skill"}]}
```
`code.hi` 是开头要高亮的那个词（`hiAt` 时变色），`code.text` 打字机打出来。`pos`：`left` / `center` / `right`（scene 默认 left，适合叠在全屏画面上）。

### `quote` 金句
```json
{"type": "quote", "text": "Slightly terrifying.", "by": "Oliver", "at": "terrifying", "y": 580}
```

### `shout` 大字喊话（反转、梗、号召）
```json
{"type": "shout", "text": "链接在评论区 ↓", "color": "accent", "at": "链接", "sparkle": false}
```
`size` 字号（默认 92）· `y` · `sparkle: false` 不撒花。自带 ding 音效。

### `end` 片尾（谢幕 + 角色阵容 + 致谢）
```json
{"type": "end", "title": "Cheerio!", "kicker": "THE END · 本片角色全部由 AI 生成", "cast": ["host", "buddy"]}
```
`cast` 不写 = 全部角色；头像、名牌来自 cast.json / 角色库，致谢行是 episode.json 的 `credits`。

### 数组：一段里放两样
```json
[{"type": "image", "src": "article/train_set.jpg", "label": "最终训练集", "box": {"x": 90, "y": 180, "w": 1000, "h": 600}},
 {"type": "stats", "column": true, "box": {"x": 1110, "y": 200, "w": 310}, "items": [
   {"count": [0, 68], "suffix": " 张", "label": "按清单出图", "at": "六十八"},
   {"count": [68, 56], "suffix": " 张", "label": "删掉 12 张重复", "color": "accent", "at": "五十六"}]}]
```
常用分法：左图 `w 1000` + 右卡 `x 1110 · w 310`；上终端 `y 180` + 下图 `y 410 · h 380`。

## episode.json

```json
{
 "series": "系列名", "tag": "第几期 · 一句话主题",
 "title": "片头大标题", "subtitle": "副标题", "credits": "用到的工具 · 致谢", "disclosure": "AI 生成",
 "theme": "tech",
 "titleCard": {"after": "s03", "dur": 3.6, "image": "article/cover.jpg", "kicker": "可选，不写 = 系列名 · tag"},
 "music": {"src": "music/score.mp3", "mood": "tech", "bed": 0.14, "title": 0.6},
 "highlight": ["字幕里要高亮的词", "LoRA", "H3"],
 "cast": {"host": {"tag": "这一期的名牌小字（覆盖 cast.json）"}}
}
```
- `theme`：`magic` 魔幻（深紫 + 金，星空 + 月牙）· `tech` 科技（深蓝 + 青，网格）· `warm` 温暖（深棕 + 橙，纯色）· `epic` 史诗（暗红 + 金，星空）；要微调写 `{"preset": "tech", "accent": "#00E5A0"}`，可改 `bg[3] accent accent2 ink mute good bad info extra backdrop(stars|grid|plain) motif(moon|none)`。
- `music.mood` 给 `make_score.py` 用，一般和 `theme` 一致；`bed` 口播时的配乐音量，`title` 片头卡时的。
- `titleCard.image` 用不带字的图（片头卡自己会写标题）；不要片头卡就删掉 `titleCard`。

## cast.json

```json
{
 "host":  {"use": "moss", "tag": "主讲"},
 "buddy": {"use": "oliver"},
 "guest": {"name": "小鲸", "tag": "嘉宾", "color": "info", "ratio": "9:16", "frames": {"9:16": "cast/guest_916.jpg"},
           "style": "3D animated, Pixar-style render", "who": "a cute little blue whale ...", "voice": "...", "pronoun": "it", "mouth": "lips"}
}
```
`use` 借 `assets/cast/library.json` 的现成角色（字段可覆盖）；新角色字段见 library.json 的 `_fields`，`frames` 相对工程目录。
