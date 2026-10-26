# 包装组件库（48 个，templates/packaging/kit）

所有剪辑模板都能用。**写法统一**：一个 `pack` 数组，每条 `{ "use": "组件名", ...参数 }`。
- 时间字段 `at` / `until`（包括数组里嵌套的，如 `words[].at`、`pins[].at`）可以写 `"段:词"`（如 `"3:积分"`、`"3:"` 段首、`"3:end"` 段尾、`"3:词#2"` 第 2 次出现），也可以写秒数。
- 有顶层 `at` 的组件只在 `[at, until]` 里出现；没写 `until` 就是 `at + dur + 3.5` 秒（`hold` 可改）。
- 9:16 竖屏时，没写位置参数的组件自动用竖屏默认位置。
- **全屏类**会盖住主播（口播声音照常）——这正是「用 B-roll 盖住口型难的段」的做法；**叠加类**叠在主播上。

在 9:16 花字模板里写进 `src/edit.json` 的 `"pack"`；在 16:9 参考工程里 `import { PackLayer } from "./kit/registry"`，`<PackLayer items={pack} T={时间解析} />`。

**看效果**：`assets/packaging/图鉴.jpg`（每个组件一格），完整演示片 `templates/packaging` 里 `npx remotion render src/index.ts Gallery`（成片：仓库 Releases 里的 packaging-gallery.mp4）。用户问「有哪些包装」时先发图鉴。

## 开场 / 钩子
| 组件 | 类型 | 做什么 | 关键参数 | 来源流派 |
|---|---|---|---|---|
| TeaserColdOpen | 全屏 | 后面最炸的 3–5 个瞬间各闪 0.4–0.8 秒 + 「接下来」角标 → 问题字卡 | clips[{src,offset,dur,label,img}], question | 英文顶流 |
| ColdOpenFreeze | 全屏 | 动作片段 → 定格去色 → 「未完待续」箭头 → 片名卡 → 雪花转场 | src, freezeAt, until, title[2], vol | 半佛 |
| SearchTyping | 全屏 | 中性搜索框逐字打 + 联想词 + 推近 1.6× | query, suggestions[], cps | Johnny Harris |
| NumberSpike | 叠加 | 大数字从 3 倍大 0.5 秒缩到顶部 + 同色闪光，可再缩成角标常驻 | text, color, label, pinAt | MrBeast |
| SlamText | 叠加 | 两行大字先后砸进画面上下，可带年份角标 | lines[], stagger, year | Johnny Harris / Kurzgesagt |
| WordStack | 全屏 | 逐词堆叠，一拍一个词，最后一词换色放大 | words[{t,at}], until | Mark Rober |
| TornStrip | 叠加 | 撕纸标题条横穿画面（片名 / 章节） | title, sub | 回形针 |
| **TextBehind** | 全屏（含主播） | **景深字：大字 / 数字在人身后**（原视频 → 大字 → 抠出来的人），升起 / 砸入 / 数字滚动 / 滑入 | src, cutout, lines[{t,color,size,font,outline}], mode, y, count{to,unit}, gradient, bgDim, crop, zoom, cutoutFrom | 影视飓风 / MrBeast / 差评 |

## 证据 / 数据
| 组件 | 类型 | 做什么 | 关键参数 | 来源 |
|---|---|---|---|---|
| EvidenceCard | 全屏 | 截图飞入 + 品牌色描边 + 鼠标指针 + 推近数值签 + 3D 倾斜 | src, iw, ih, focus{x,y}, label, labelAt, tilt, source | 差评 |
| DocFocus | 全屏 | 重建文档，非目标句压暗 35%，关键词黄块扫过 | title, source, paras[[{t,focus,hl,hlAt}]] | Vox / JH |
| SourceDoc | 全屏 | 官方文档截图慢推 + 中文译句荧光底 + 来源角标 | src, iw, ih, zh, source | 影视飓风 / 何同学 |
| ZoomFocus | 全屏/框 | 截图 / 录屏推近到目标框 + 压暗 + 标签（不越过原图边缘） | src, iw, ih, focus{x,y,w,h}, label, zoom, box | 教程通用 |
| Counter | 叠加 | 数字滚动，落地弹一下 | to, from, unit, prefix, label, dur | 通用 |
| Odometer | 叠加 | 里程表逐位滚动，高位先停 | value(字符串), unit, label | 质感派 |
| GlassPanel | 叠加 | 毛玻璃数据面板，条形和数字一起滚 | title, unit, rows[{label,value,highlight}], note | 质感派 |
| SpecCard | 叠加 | 质感参数卡：大数字小单位、留白、逐行淡入 | rows[{k,v,u}] | MKBHD |
| LineDraw | 全屏 | 多条折线画出，末端挂同色标签 | series[{label,color,data}], xLabels, source | JH / Vox |
| BarCompare | 全屏 | 横条对比 + 鬼影大字背景 | rows[{label,value,text,color}], ghost | 回形针 |
| ReviewCards | 叠加 | 评论 / 差评卡每 1.1 秒连弹（示意评论要标注） | cards[{name,stars,text,avatar}], per | Ryan Trahan |
| ArchiveCards | 全屏 | 档案卡 0.6 秒一张快切 + 红色标签 | images[{src,label}], per | Johnny Harris |
| MapRoute | 全屏 | 世界地图推近 + 国家高亮 + 图钉 + 航线生长 | camera[{at,lon,lat,zoom}], highlight[{name,at}], pins[], routes[], theme | Johnny Harris |
| CompareWipe | 全屏/框 | 前后对比擦除 | a, b, la, lb, split | 通用 |
| PaperCollage | 全屏 | 纸纹底 + 白边照片 + 胶带 + 手写批注 | items[{src,x,y,w,caption}], title, note | Vox / 回形针 |

## 标注 / 人物
| 组件 | 类型 | 做什么 | 关键参数 |
|---|---|---|---|
| HandDraw | 叠加 | 手绘圈 / 箭头 / 下划线 / 打叉，描边生长 | kind, x, y, w, h, from, color |
| CalloutPill | 叠加 | 实色胶囊 + 小尖指向目标，弹簧弹出 | text, sub, x, y, color, pointer |
| LeaderLabel | 叠加 | 引线 + 中文粗体 + 英文小斜体（+ 牛皮纸小标签） | target[x,y], zh, en, dir, len, tag |
| TypedNameTag | 叠加 | 手绘箭头指人 + 粗衬线名字逐字打出 + 头衔 | name, title, x, y, target |
| LowerThird | 叠加 | 色条 + 名字 + 身份两层滑出 | name, title, color, x, y |
| NamePlate | 叠加 | 去色人物旁双层名牌 + 语录药丸气泡 | name, title, quotes[{t,at}], x, y, qx, qy |
| SourceTag | 叠加 | 出处角标（每个数据都挂） | text, side, y |
| FreezeFrame | 全屏 | 定格 + 去色 + 「等等！」+ 圈注（打断节奏） | src, label, note, mark |

## 节奏 / 互动 / 结构
| 组件 | 类型 | 做什么 | 关键参数 |
|---|---|---|---|
| PunchInHost | 主播层 | 同一条口播按句子边界硬切景别（1.0/1.3 或 1.0/1.18/1.32 + 偏置） | src, cuts[], scale, levels[{s,dx}], anchor |
| KeywordStack | 叠加 | 主播身旁依次弹 图标 + 彩色词，结束一起模糊淡出 | items[{t,at,icon,color}], until, x, y |
| RetentionCaption | 叠加 | 留存大字幕：1–3 个词一组居中砸出，关键词变色 | words[{t,at,key}], y, size, group |
| TiltLine | 叠加 | 倾斜 -12° 金句逐字弹出，关键词亮黄 | text, keys[], tilt |
| Aside | 叠加 | 括号旁白吐槽（剪辑师画外音） | items[{t,at,until,x,y}] |
| Danmaku | 叠加 | 弹幕从右往左飘（替观众说出质疑） | items[{t,at,hot}], lanes |
| ReactionPop | 叠加 | 动态表情 / 原创贴纸 + 吐槽，弹出轻晃 | emoji / img, caption, x, y |
| MemeWindow | 全屏 | 黑底梗图窗，一句一图硬切（素材用原创表情包） | items[{src,at,caption,pos}], until |
| PollPop | 叠加 | 「评论区打 1 还是 2」，说到哪个哪个大数字弹出 | question, options[{n,t,at}] |
| GlitchInterstitial | 全屏 | 0.5 秒测试卡故障插屏 + 圆形主播 + 「点赞关注」 | dur, text, host |
| HostFloaters | 叠加 | 主播旁漂两个浏览器窗口 + 图标小标签 | windows[{src,pos,title}], chips[{t,icon,at,x,y}] |
| ProgressChapters | 叠加 | 顶部进度条 + 章节刻度 + 当前章节名 | chapters[{at,t}], total |
| ProgressTracker | 叠加 | 步骤徽章 / 路线条（起点 → 终点） | mode, steps[], stepAt[], from, to, progress[{at,v}] |
| ChapterCard | 全屏 | 色条扫过 + 大序号 + 标题 | n, title, sub, color, solid |
| RecapBoard | 全屏 | 两栏复盘板（为什么 / 怎么办），每章亮一条新的 | columns[{title,color,items}], reveal[] |
| Countdown | 叠加 | 倒计时药丸，最后 3 秒变红跳动 | seconds, label |
| GhostWord | 叠加 | 背景巨大鬼影词缓慢横移 | text, outline, opacity |

## 景深字 TextBehind 怎么做
1. 先抠像（macOS Vision 人像分割，只抠要用的那几秒）：
   `python3 scripts/cutout_video.py public/main.mp4 public/main_cut_s3.webm --from 16.0 --to 19.5`
   出透明 webm + 一条灰度遮罩（检查用）。边缘有背景灰边就加 `--shrink 2`；头发丝被吃掉就 `--shrink 0 --grow 1`。
2. pack 里写：`{ "use": "TextBehind", "src": "main.mp4", "cutout": "main_cut_s3.webm", "cutoutFrom": 16.0, "at": "3:体验最好", "until": "3:end", "lines": [{ "t": "体验最好" }], "gradient": ["#FFFFFF", "#C9D2E0"] }`
   数字：`"mode": "count", "lines": [{ "t": "23", "font": "en", "color": "#FFE14D", "size": 0.42 }], "count": { "to": 23 }`
3. 字放在头肩后面（y 默认 0.36，竖屏 0.28），字越大越好（横屏 0.3–0.45 画面高）；人像背景越干净效果越好。主播在模板里有推近时把 `zoom` 设成同样倍数，避免进出时取景跳一下。
4. **素材要求：中景、头顶和两侧有背景。** 实测横屏中景（人占画面约 28%）效果很好；竖屏自拍特写（人占 89%）字几乎全被挡住——抠像脚本会在人像占比超过 60% 时提醒。要用景深字的那几段，生成口播时提示词加「medium shot, leave headroom and background on both sides」。
5. 适合：开场命题、关键数字、章节名、金句。一支片 2–4 次，别每句都用。

## 例子（9:16 花字口播的 edit.json）
```json
"pack": [
  { "use": "NumberSpike", "at": "1:23 积分", "text": "23 积分", "label": "做一个数字人形象", "pinAt": "1:end" },
  { "use": "Danmaku", "items": [{ "t": "真的假的", "at": "3:" }, { "t": "这么方便？", "at": "3:不是专业", "hot": true }] },
  { "use": "ZoomFocus", "src": "media/screen.png", "iw": 2880, "ih": 1800, "at": "7:", "until": "7:end", "focus": { "x": 2520, "y": 30, "w": 330, "h": 70 }, "label": "右上角注册" },
  { "use": "PollPop", "at": "9:", "until": "9:end", "question": "你会用数字人起号吗？", "options": [{ "n": "1", "t": "会", "at": "9:起号" }, { "n": "2", "t": "再看看", "at": "9:end" }] },
  { "use": "GlitchInterstitial", "at": "10:", "dur": 0.5, "text": "点赞关注" }
]
```
写完跑 `python3 scripts/check_edit.py <工程>/src`（会检查 pack 里所有时间引用）。

## 素材
- 动态表情：`public/emoji/`（Noto，59 个；缺的用 promo-video 的 fetch_noto_emoji.py 补）。片尾加「Animated emoji: Google Noto」。
- 地图：world-atlas（Natural Earth 110m，公有领域）。涉及中国边界的正式发布内容，按国内规范另行核对。
- 梗图 / 反应贴纸：用数字人定妆图生成 20 种表情贴纸，或原创 IP 动物，不用网络梗图。
