# hdr-video

把普通（SDR）视频或其中一段，转成 **10-bit HEVC / HLG / BT.2020** 的 HDR 文件：在 HDR 屏幕上，云、太阳、水面反光、
金属高光会“发光”。还能做**左右对比**：同一个文件里左边 SDR、右边 HDR。

纯 ffmpeg + 自己生成的 3D LUT，**不依赖 zscale / libplacebo / drawtext**（Homebrew 的 ffmpeg 常常没带）。

## 它做什么

```
SDR mp4 ──hdr_tune.py──▶ 按素材预测各档参数的亮度分布，选参数
        │
        ├─hdr_clip.sh──▶ out_hdr.mp4      （HEVC 10-bit，HLG，原分辨率原帧率）
        └─hdr_sbs.sh───▶ out_compare.mp4  （1920×1080，左 SDR / 右 HDR，各一份完整画面）
                            │
                    hdr_stats.py：量实际文件的亮度，和预测对
```

脚本结束时会自检输出的 HLG / BT.2020 / 10-bit 标记，不对就非 0 退出。

## 需要什么

- ffmpeg（带 libx265）和 ffprobe
- python3 + numpy
- Pillow（可选，只用于分屏的标签；没有就不带标签）

## 用法

```bash
S=skills/hdr-video/scripts      # 装到 ~/.claude/skills/ 之后就是 ~/.claude/skills/hdr-video/scripts

python3 -I $S/hdr_tune.py in.mp4 --ss 0 --t 10                 # 先预测，选参数
$S/hdr_clip.sh in.mp4 0 10 out_hdr.mp4 --white 650 --knee 0.35 --power 1.8
$S/hdr_sbs.sh  in.mp4 0 10 out_compare.mp4 --white 650 --knee 0.35 --power 1.8
python3 -I $S/hdr_stats.py out_hdr.mp4 --scale 480:270         # 量实际文件
```

更多在 [SKILL.md](SKILL.md)：参数含义、怎么选、踩过的坑。
[references/hdr-scenes.md](references/hdr-scenes.md)：什么场景适合 HDR，以及一段可直接用的场景提示词。

## 注意

- **效果取决于素材。** 米色卡片、文字、PPT 这类画面转成 HDR 只是把“纸”变亮，不适合。
- 产物只有在 **HDR 屏**（Mac XDR、iPhone）上用 QuickTime / 照片打开才有效果；普通播放器里会发灰、红偏橙，这是正常的。
- 源已经是 HDR 的，脚本会拒绝（退出码 2）。
- 没在真正的 HDR 屏上做过观感验证，也没验证过上传各平台后是否保持 HDR；详见 SKILL.md 末尾“已验证 / 没验证”。
