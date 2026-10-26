# 网红花字口播模板（templates/huazi-916）

9:16，1080×1920，30fps。**内容全在 `src/edit.json`，时间全来自 `src/tl.json`**——改稿只动这两个文件。

## 起一个新工程
```bash
bash ~/.claude/skills/digital-human-koubo/scripts/new_edit.sh huazi-916 <工程目录>
```
然后放素材：`public/main.mp4`（拼好的数字人口播，竖屏）、`public/voice.wav`（处理过的人声）、`public/show/`（要展示的作品）、`src/tl.json`（`scripts/align.py` 的输出）。

## edit.json 字段
时间写法：`"3:"` 第 3 段开头 · `"3:end"` 第 3 段结束 · `"3:关键词"` 这个词开始 · `"3:关键词#2"` 第 2 次出现 · 数字 = 绝对秒。

| 字段 | 作用 | 例子 |
|---|---|---|
| `preset` | 花字强度 克制 / 标准 / 热闹 | `"标准"` |
| `title` | 顶部胶囊标题 | `{"left":"真实体验","right":"我为什么推荐 Renoise"}` |
| `chapters` | 章节胶囊（自动编 ①②③） | `[{"at":"4:","t":"隐私：MCP vs CLI"}]` |
| `keys` | 字幕里变色放大的关键词 | `["太臃肿","强烈建议"]` |
| `emojis` | 脸两侧弹的动态表情 | `[{"at":"2:太臃肿","e":"😵‍💫","side":"r"}]` |
| `punch` | 镜头推一下的时刻（不写就每段第一个关键词） | `["1:最大"]` |
| `cards` | 卡片，见下表 | |
| `showcase` | 主播缩小窗、全屏放作品 | `[{"from":"8:尤其","to":"8:end","items":[{"src":"show/a.mp4","label":"复刻"}]}]` |
| `cta` | 结尾号召大字 | `{"at":"11:强烈建议","text":"强烈建议","sub":"去试试 Renoise","subAt":"11:去试试"}` |
| `music` | 配乐 | `{"src":"music/bgm.mp3","vol":0.075}` |
| `badge` / `credits` | 左上角 AI 标识 / 片尾署名 | 默认「内容由 AI 数字人演绎」 |
| `brand` | 主色 | `"orange"` / `"#FF7A1A"` |

### 卡片类型（cards[].type）
每张卡片都有 `at`，可选 `until`（默认到本段结束、下一张卡片或 4.5 秒，取最早）。

| type | 长什么样 | 什么时候用 | 关键字段 |
|---|---|---|---|
| `stamp` | 斜盖的描边印章 | 结论、「不用抽卡」 | text, color, x, y, rot |
| `slam` | 描边大字砸屏 | 吐槽、情绪最高点 | text, color |
| `big` | 黄色渐变大字块 | 标签式结论「起号神器」 | text |
| `number` | 数字滚动 | 价格、数量、积分 | value, unit, prefix, label |
| `vs` | 左右名牌 + VS | 对比两家 | left{at,t}, right{at,t} |
| `tags` | 2×2 彩色名牌逐个点亮 | 支持的平台 / 工具 | title, items[{at,t,color}] |
| `bars` | 横条对比 | 速度 / 价格对比（标「个人体验」） | title, items[{t,v,label,color}], note |
| `list` | ✅ / ❌ 清单 | 优缺点、两面 | title, items[{t,tone,at}] |
| `image` | 带白边的截图 | 官网、界面、聊天记录 | src, label, x, y, w, rot |

颜色可写 yellow / pink / cyan / red / green / orange / purple / white 或十六进制。

## 三档花字强度（对比图：assets/styles/B_huazi_presets.jpg，选强度时发给用户）
| | 克制 | 标准 | 热闹 |
|---|---|---|---|
| 字幕字号（普通 / 关键词） | 66 / 76 | 76 / 92 | 82 / 106 |
| 关键词颜色 | 黄 | 黄 | 黄 / 粉 / 青 轮换 |
| 逐字弹跳 | 很轻 | 明显 | 更弹 |
| 表情 | 隔一个出一个，偏小 | 全部 | 全部，更大 |
| 跳切推近 / 重点推镜 | 不交替 / 很轻 | 1.09 / 14% | 1.11 / 20% |
| 段间闪白 | 无 | 有 | 更亮 |
| 音效 | 0.6 倍 | 正常 | 1.2 倍 + 推镜处加 pop |
适合：克制 = 知识、品牌、严肃话题；标准 = 大多数口播；热闹 = 带货、搞笑、年轻向。不管哪档都**不做整段抖动**，只在关键帧推镜。

## 写 edit.json 的习惯（参考爆款口播）
- 关键词：每段 1–3 个，挑「情绪词 + 数字 + 产品名」，不要整句都标黄。
- 表情：每分钟 6–10 个，跟情绪走（惊讶 😱、推荐 😍、吐槽 😤、秘密 🤫、成功 💯），左右交替。
- 卡片：一段最多一张；一屏只说一件事，内容完整放下，别拆碎。
- 引用别人的说法（评测、扒料）在卡片 title 里写「网友分析 / 个人体验」。
- 作品展示 ≥ 3 秒一个，最多 3 个。

## 检查 + 渲染
```bash
python3 ~/.claude/skills/digital-human-koubo/scripts/check_edit.py <工程>/src     # 所有时间引用能对上才往下
npx remotion still src/index.ts Huazi out/a.jpg --frame=<帧>                    # 抽卡片、表情、展示过渡的中间帧
npx remotion render src/index.ts Huazi out/raw.mp4 --concurrency=6
ffmpeg -i out/raw.mp4 -af loudnorm=I=-16:TP=-1.5:LRA=11 -c:v libx264 -crf 20 成片.mp4
```
示例数据：模板自带的 tl.json / edit.json 是「Renoise 推荐口播」那期（11 段 · 88 秒），可以直接照着改。
