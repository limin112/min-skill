---
name: hdr-video
description: Convert an SDR video (or a clip of it) into a 10-bit HEVC HLG / BT.2020 HDR file whose highlights glow on HDR screens, and build a left/right SDR-vs-HDR comparison in a single file. Pure ffmpeg plus a generated 3D LUT (no zscale / libplacebo needed); parameters are chosen from measured luma stats, and the output tags are verified. Use when asked to make a video HDR / 做成 HDR / SDR 转 HDR / HLG / 亮瞎 / 高光发光, to make a clip look like an HDR reference, to compare SDR and HDR side by side (左右对比), or to judge or describe a scene that suits HDR.
version: 0.1.0
---

# SDR → HLG HDR 视频

把一条普通（SDR）视频或其中一段，转成 10-bit HEVC / HLG / BT.2020 的 HDR 文件：在 HDR 屏幕上高光会“发光”。
还能做**左右对比**（同一个文件里左边 SDR、右边 HDR）。纯 ffmpeg + 自己生成的 3D LUT，不依赖 zscale / libplacebo。

下文的 `scripts/` 指本 skill 目录下的 `scripts/`。

## 先摆正预期

- 所谓“亮瞎”，是云、太阳、水面反光、金属高光这些**亮点被推到 HLG 峰值**，中间调基本不变。
  HLG 信号 75% = 203 nit 参考白，100% = 峰值（标称 1000 nit，实际多亮看屏幕）。
- SDR 里没有的信息变不出来，转换只是把已有的高光拉开。**效果取决于素材**，所以先判断素材（下一节），
  不适合就直接说，别硬做。
- 产物是普通 mp4，只是带了 HLG 标记。在 HDR 屏（Mac XDR、iPhone）上用 QuickTime / 照片打开才有效果；
  不支持 HDR 的播放器里会发灰发平、红色偏橙（BT.2020 被当成 BT.709 读）——这是正常的，不是转坏了。
- **没有 HDR 屏就看不到最终效果。** 验证靠标记和亮度数据；汇报时说“数据对得上”，不要说“看起来很炫”。

## Step 0 — 先判断素材适不适合

适合：同一画面里既有深阴影、又有小面积强光源——太阳/落日、云的亮边、水面碎光、镀铬和玻璃反光、
夜里的霓虹和路灯、自然风光。

不适合：

- 米色/白色底的卡片、PPT、网页、以文字和 UI 为主的画面：HDR 只会把“纸”整片变亮，没有反差，还刺眼。
- 阴天灰蒙蒙、整面白墙或白雪占满画面。
- 整体很暗又没有亮点的夜景。

混合素材（比如大约四成是米色数据卡片的讲解视频）整条转出来就不理想。先抽出适合的镜头
（`-ss` / `-t`），或者直接告诉用户素材不合适，并给一个合适的场景描述（见 `references/hdr-scenes.md`）。

## Step 1 — 探测

脚本会自己 `ffprobe` 并处理：

- 源已经是 HDR（`arib-std-b67` / `smpte2084`）→ 拒绝，退出码 2。再转一次是错的。
- 色彩矩阵按标记走（`smpte170m` / `bt470bg` 当 BT.601，其余和未标记当 BT.709）；
  范围按标记走（`pc` 当全范围，其余当限制范围）。
- 假设 BT.709 色域、gamma 2.4。BT.601 源只换了 YCbCr 矩阵，没有做 SMPTE-C → 709 的色域转换。

依赖：ffmpeg（带 libx265）、python3 + numpy；Pillow 可选（没有的话分屏不带标签）。

## Step 2 — 用数据选参数，不要凭感觉

```bash
python3 -I scripts/hdr_tune.py src.mp4 [--ss 0 --t 10] [--try white=650,knee=0.35,power=1.8]
```

不渲染，按同一套数学预测各档参数下的亮度分布：平均 / 中位数 / 90% / 99% 分位、>90% 的像素占比、
近纯白占比、有没有通道被削平。

`hdr_lut.py` 的参数：

| 参数 | 默认 | 含义 |
|---|---|---|
| `--white` | 203 | SDR 白对应多少 nit，整体亮度，主要抬中间调 |
| `--peak` | 1000 | SDR 100% 白最终落在多少 nit，上限 1000 |
| `--knee` | 0.45 | 线性亮度超过这个值才开始“高光扩展” |
| `--power` | 2.2 | 扩展的陡峭程度，大于 1 比较平滑 |

三档参考：

| 档 | 参数 | 用途 |
|---|---|---|
| 不加强 | `--peak 203` | 等于 SDR 放进 HLG 容器，分屏里当左边 |
| 亮 | `--white 650 --knee 0.35 --power 1.8` | 夜景 / 偏暗素材，平均亮度能追上参考 |
| 天花板 | `--white 1000` | SDR 白 = HLG 峰值，再往上只会削平 |

怎么选：

- **“亮”的观感主要来自中位数和平均，不只是高光占比。** 一条夜景片只扩展高光（默认档）时，
  高光占比已经比参考多，但中位数 25% 对参考的 40%，观感就是“不够亮”；抬 `--white` 之后才对。
- 一条白天外景 HDR 参考片的数据：平均 42%、中位数 40%、90% 分位 73%、99% 分位 98%、近纯白 0.9%。
  只是一个校准点，不是标准。白天的亮场景 `--white 400` 就追平它，650 比它亮；
  夜景和偏暗素材要 650 左右才追得上平均亮度。
- 盯住 `luma>=98%` 和 `any-ch clipped`：它们大，说明亮部在被削平（丢细节、偏色）。几个百分点以内可以接受。

## Step 3 — 渲染 HDR 片段

```bash
scripts/hdr_clip.sh in.mp4 <start> <dur> out.mp4 [lut args...]
CRF=18 scripts/hdr_clip.sh in.mp4 0 999 out.mp4 --white 650 --knee 0.35 --power 1.8   # 整条：dur 给个比总长大的数
```

保持原分辨率和帧率；输出 HEVC 10-bit（`hvc1`）mp4，`CRF` 默认 15（低码率的源用 18 就够）。
脚本最后自检标记，不对就非 0 退出——这个文件不要交付。

## Step 4 — 左右对比

```bash
scripts/hdr_sbs.sh in.mp4 <start> <dur> out.mp4 [lut args...]
```

一个 1920×1080 的 HLG 文件：左边 SDR（白 203 nit、不加强），右边 HDR（你给的参数），各是完整画面，
上方有标签。任意比例的源都行（居中缩放），16:9 最合适。
**只有在 HDR 屏上才看得出差别**：不加强的一边最亮只到 75%。

## Step 5 — 验证（别跳）

1. 脚本已自检：`pix_fmt=yuv420p10le`、`color_space=bt2020nc`、`color_transfer=arib-std-b67`、`color_primaries=bt2020`。
2. 容器里的 `colr` 原子也要是 9 / 18 / 9（QuickTime 看这个）：
   ```bash
   python3 -I -c "d=open('out.mp4','rb').read(4_000_000);i=d.find(b'colr');print(tuple(int.from_bytes(d[i+8+k:i+10+k],'big') for k in (0,2,4)))"
   ```
3. 量实际文件，和 Step 2 的预测对：`python3 -I scripts/hdr_stats.py out.mp4 --scale 480:270`。
   分屏可以用 `--crop W:H:X:Y` 只量某一边，左边的 99% 分位应该≈75%。
4. 看几帧。HLG 在普通屏幕上直接看会偏灰偏平、红偏橙，这是正常的，只看有没有真正的异常（色带、死白、接缝）。

## 踩过的坑

| 症状 | 原因 | 做法 |
|---|---|---|
| `No such filter: drawtext`，也没有 `zscale` / `libplacebo`（常见的 Homebrew ffmpeg） | 构建里没带 freetype / zimg / libplacebo | 色调映射用 3D LUT（`lut3d`）；标签用 Pillow 画 PNG 再 `overlay` |
| 输出的 `color_transfer` 是 bt709，命令行写了 `-color_trc arib-std-b67` 也一样 | 源的 bt709 标记随帧穿过滤镜链，盖过了编码参数 | 滤镜链末尾用 `setparams` 给帧打 HLG 标记（脚本已做）。这种文件播放器当 SDR 解，等于没做 |
| `overlay` 之后变成 8-bit | `overlay` 的 `format` 默认是 `yuv420` | 写 `overlay=...:format=yuv420p10` |
| 量亮度时 `extractplanes` 报 `could not choose formats` | 它自己协商不出格式 | 前面显式加 `format=yuv420p`（或 `yuv420p10le`） |
| 用 `format=gray10le` 取亮度，数字全错 | swscale 把灰度当全范围，会把 64–940 拉伸到 0–1023 | 用 `extractplanes=y` 直接取 Y 平面，不做任何转换 |
| `signalstats` 的 `YHIGH` 当成“最亮的前 2%” | 它其实是 **90% 分位**（`YLOW` 是 10%） | 看高光尾部用 `hdr_stats.py`（p99、≥98% 占比） |
| zsh 里 `ARGS="--white 650 --knee 0.35"; cmd $ARGS` 报 unrecognized arguments | zsh 不对 `$VAR` 分词，整串变成一个参数 | 用数组：`ARGS=(--white 650 --knee 0.35)` 和 `"${ARGS[@]}"` |
| `rm -f seg_*.txt && VAR=...` 之后变量是空的 | zsh 里 glob 没匹配会报错，`&&` 链被短路 | 不要在 `&&` 链里放可能不匹配的 glob |
| 两个渲染同时跑，LUT 文件互相覆盖 | 共用同一个文件名 | 脚本各自 `mktemp -d`，并行安全（已测） |

## 已验证 / 没验证

已验证（都是实际跑出来的）：

- 输出标记：流里和容器 `colr` 原子都是 BT.2020 / HLG / bt2020nc / 10-bit。
- 亮度数据和 `hdr_tune.py` 的预测一致：两条不同的片子，平均 / 中位数 / 90% 分位偏差都在 1 个百分点内。
  例外是“近纯白占比”，它在曲线最陡处，预测 1% 实测 3%。
- 色彩矩阵和范围：BT.709 限制范围、BT.709 全范围、BT.601 限制范围，纯色测试 9 组，最大偏差 0.32%。
- 拒绝已经是 HDR 的源；竖屏、无音轨的源能出分屏；没装 Pillow 时降级成无标签；两个脚本并行互不干扰。

没验证：

- 在真正的 HDR 屏幕上的观感（只有数据和标记）。
- 传到 X、微博、抖音等平台后是否还保持 HDR、会不会被转成 SDR。
- Windows、Android 播放器的表现。
- 大增益下天空渐变会不会出现色带（源是 8-bit，输出 10-bit，但没逐帧检查）。
