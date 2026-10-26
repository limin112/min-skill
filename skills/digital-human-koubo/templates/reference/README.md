# 参考实现（C / D / E 三种风格）

这三个是做过的真实成片工程的剪辑代码（只有代码，不带素材）。**内容每期都不一样，所以不是填空模板**：起新工程后保留布局、主播框、字幕、音效、过渡这些通用部分，按本期的稿子重写每段的 Scene。

| 目录 | 风格 | 出过的片 | 入口 | 时间轴 |
|---|---|---|---|---|
| launch-169 | C 发布解读 | MemT 1.0 发布解读（38 秒） | src/Film.tsx | src/timeline.json（逐字对齐 + 卡点） |
| tutorial-169 | D 保姆级教程 | AIGC 教程第二期（4 分 36 秒） | src/Tutorial.tsx | src/tl.json（nar 段 + 演示插入） |
| multihost-169 | E 多主播多语言 | AIGC 教程第三期（5 分 54 秒） | src/Tutorial.tsx | src/tl.json（nar / clip / title / outro） |

起工程：`bash scripts/new_edit.sh reference/tutorial-169 <工程目录>`（会顺带放好 sfx 和配乐）。
素材文件名看代码里的 `staticFile("…")`，按同样的路径放进 public/。

multihost-169/pipeline 是第三期从规划到时间轴的脚本（plan → build_tasks → qa → build_tl），换声统一用 `scripts/voicefx/unify.py`。
参考工程里用包装：import { PackLayer } from "./kit/registry"，见 references/packaging.md
