#!/bin/bash
# 起一个剪辑工程：bash new_edit.sh <模板> <工程目录>
#   模板：explainer-169（通用文章讲解 16:9，数据驱动：episode.json + build_tl.py 写的 tl.json，换文章不改代码）
#         huazi-916（B 网红花字口播，数据驱动）
#         reference/launch-169 · reference/tutorial-169 · reference/multihost-169（C / D / E 参考实现，按段重写 Scene）
#   A 小林式解说用 finance-explainer：bash ~/.claude/skills/finance-explainer/scripts/setup_engine.sh <工程目录>
set -e
TPL="$1"; DST="$2"
[ -z "$TPL" ] || [ -z "$DST" ] && { echo "用法：bash new_edit.sh explainer-169 <工程目录>"; exit 1; }
SRC="$(cd "$(dirname "$0")/.." && pwd)/templates/$TPL"
[ -d "$SRC" ] || { echo "没有模板 $TPL（可用：explainer-169、huazi-916、reference/launch-169、reference/tutorial-169、reference/multihost-169）"; exit 1; }
[ -e "$DST/src" ] && { echo "$DST 里已经有 src/，不覆盖"; exit 1; }
mkdir -p "$DST" && cp -R "$SRC/." "$DST/"
# 参考实现不带素材：音效和配乐从花字模板拿
if [ ! -f "$DST/public/sfx/pop.wav" ]; then mkdir -p "$DST/public" && (cp -R "$(dirname "$SRC")/../huazi-916/public/sfx" "$(dirname "$SRC")/../huazi-916/public/music" "$DST/public/" 2>/dev/null || cp -R "$(dirname "$SRC")/huazi-916/public/sfx" "$(dirname "$SRC")/huazi-916/public/music" "$DST/public/" 2>/dev/null || true); fi
# node_modules：npm 源常 SSL 失败，可以用 DH_NODE_MODULES_FROM=<已有 Remotion 4.0.408 工程> 克隆它的（APFS 克隆不占空间）
# 模板 package.json 里列的依赖那边都得有，不然还是 npm install
if [ -n "${DH_NODE_MODULES_FROM:-}" ]; then
  ok=1; for d in $(python3 -c "import json,sys; print(' '.join(json.load(open(sys.argv[1])).get('dependencies', {})))" "$DST/package.json"); do [ -d "$DH_NODE_MODULES_FROM/node_modules/$d" ] || ok=0; done
  if [ $ok = 1 ]; then cp -cR "$DH_NODE_MODULES_FROM/node_modules" "$DST/" 2>/dev/null || cp -R "$DH_NODE_MODULES_FROM/node_modules" "$DST/"; echo "node_modules ← $DH_NODE_MODULES_FROM"; fi
fi
[ -d "$DST/node_modules" ] || (cd "$DST" && npm install)
# 音效 / 占位配乐：仓库里不带第三方音频，缺了就用代码合成一套（无版权）
if [ ! -f "$DST/public/sfx/pop.wav" ] || [ ! -f "$DST/public/music/bgm.mp3" ]; then
  PY=""; for p in python3 python3.14 python3.13 python3.12 python3.11 python; do command -v $p >/dev/null 2>&1 && $p -c "import numpy" 2>/dev/null && PY=$p && break; done
  [ -n "$PY" ] && "$PY" "$(dirname "$0")/make_assets.py" "$DST/public" || echo "⚠ 没找到装了 numpy 的 Python，音效没生成：python3 -m pip install numpy 后跑 python3 $(dirname "$0")/make_assets.py $DST/public"
fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ "$TPL" = "explainer-169" ]; then
  echo "✓ $DST 已就绪。在工程目录（script.json 所在处）跑："
  echo "  python3 $ROOT/scripts/build_tl.py --edit $DST       # cut/ + script.json + episode.json + cast.json → 时间轴和素材"
  echo "  python3 $ROOT/scripts/make_score.py --out $DST/public/music/score.mp3   # 配乐（情绪读 episode.json → music.mood）"
  echo "  cd $DST && npx remotion render Explainer out/video.mp4"
elif [ "$TPL" = "huazi-916" ]; then
  echo "✓ $DST 已就绪。放入 public/main.mp4、public/voice.wav、src/tl.json，改 src/edit.json，然后："
  echo "  python3 $ROOT/scripts/check_edit.py $DST/src"
else
  echo "✓ $DST 已就绪（参考实现）。换 src 里的时间轴，按本期稿子重写 Scene；素材路径看代码里的 staticFile(…)"
fi
