# copyKakasi

**一镜一镜重拍一段视频，只把演员换成你。** 一个 [Claude Code](https://claude.com/claude-code) Skill：构图、机位、动作、节奏、配乐都照原片，演员换成你本人、明确同意的成年人或 AI 虚构角色。全程用你自己部署的 MiniMax H3，不接云端视频服务。

*Remake a video shot by shot with a different cast (yourself, a consenting adult, or a fictional AI character), using your own self-hosted MiniMax H3. Docs are in Chinese.*

▶ **演示**：[demo.mp4](examples/demo.mp4)（30 秒 · 1080p · 9 MB）· **推文**：[https://x.com/MinLiBuilds/status/2118188301123514550](https://x.com/MinLiBuilds/status/2118188301123514550)

```
原片 ─▶ 切镜头 ─▶ 选镜头、剪歌 ─▶ 取首尾帧 ─▶ 换脸 / 打码重画（图像模型）
                                                │  无限画布确认页，逐镜头通过或提意见
                                                ▼
成片 + 对照版 ◀─ 拼接、配歌 ◀─ 去油腻调色 ◀─ H3 首尾帧模式逐镜头生成
```

为什么效果稳：换好脸的首帧、尾帧被**钉死**在第 0 帧和最后一帧，构图、站位、光线都跟原片一样，H3 只负责补中间的动作。

## 使用边界，先看
- **人**：只能换成你本人、本人明确同意的成年人、AI 虚构角色。不做未成年人，不做公众人物，不做未经同意的真人。责任在使用者。

MIT 协议只覆盖这个仓库的代码，详见 [NOTICE.md](NOTICE.md)。这不是法律意见。

## 需要什么
| | 要求 |
|---|---|
| 控制端 | macOS（完整功能）；Linux 回归测试通过，但没有 OCR 读字幕，也还没跑过真实素材；Python ≥ 3.10、FFmpeg（libx264） |
| 视频生成 | **你自己的 NVIDIA 显卡 + MiniMax H3（ComfyUI）**，在本机或能 ssh 的机器上。[部署说明](references/h3-setup.md) |
| 换脸出图 | [Codex CLI](https://github.com/openai/codex)（默认），或[任何实现了简单接口的图像服务](references/image-providers.md) |

**没有显卡**：切镜头、选镜头、换脸都能做，也能在确认页看结果；生成视频这一步要等你有 H3。

## 安装
```bash
git clone https://github.com/limin112/min-skill.git /tmp/min-skill
mkdir -p ~/.claude/skills && cp -R /tmp/min-skill/skills/copy-kakasi ~/.claude/skills/
pip3 install -r ~/.claude/skills/copy-kakasi/requirements.txt
```

## 指定你的 H3
仓库里没有任何机器地址。第一次用时 Claude 会问你一次，之后记住；也可以自己配：
```bash
S=~/.claude/skills/copy-kakasi/scripts
python3 $S/configure.py --host my-gpu --comfy-root /path/to/ComfyUI --ports 8188,8190   # ssh 别名
python3 $S/configure.py --host local  --comfy-root /path/to/ComfyUI --ports 8188        # 或者就在本机
python3 $S/doctor.py --h3                                                                # 检查
```
配置存在 `~/.config/copy-kakasi/config.json`（权限 600）。

## 使用
在 Claude Code 里说：
> 用 copyKakasi 把 `src/my_video.mp4` 按镜头重拍，主角换成我，照片在 `cast/`。

全流程有 4 个检查点，每到一个就停下来给你看。成片后可以按镜头提意见（“这镜不要说话”“动作太快”），只重做那几个镜头。

不用 Claude Code 也能手动跑，命令见 [SKILL.md](SKILL.md)，配置模板在 [examples/minimal/](examples/minimal/)。

## 目录结构
| 路径 | 内容 |
|---|---|
| `SKILL.md` | 流程、红线、返工对照表 |
| `references/` | 配置字段、H3 部署、出图通道、提示词写法、常见的坑 |
| `scripts/` | `scan` 切镜头 · `build_ref` 剪辑 · `keys` 取帧 · `faces` 换脸 · `qa_paste` / `qa_h3` 质检 · `review` 确认页 · `h3_fl` 生成 · `finish` 成片 · `doctor` / `configure` 环境 |
| `tests/` | 回归测试，用假 ssh、假 ComfyUI、假图像服务，不需要显卡 |

## 测试
在本目录下跑：
```bash
pip3 install -r requirements-dev.txt
python3 scripts/doctor.py --fetch-models   # 可选：不下载就跳过 joint 相关用例
python3 -m pytest tests
```

## 协议
本 skill 的代码和文档用 [MIT](LICENSE)。第三方组件见 [NOTICE.md](NOTICE.md)。
