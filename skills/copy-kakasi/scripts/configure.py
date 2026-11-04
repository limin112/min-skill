#!/usr/bin/env python3
"""写用户配置 ~/.config/copy-kakasi/config.json（权限 600）。地址由用户指定，不进工程、不进仓库。只改传了的项，其余保留。

  python3 configure.py --show
  python3 configure.py --host my-gpu --comfy-root /path/to/ComfyUI --ports 8188,8190
  python3 configure.py --host local  --comfy-root /path/to/ComfyUI --ports 8188      # ComfyUI 就在这台机器上
  python3 configure.py --host lan-alias,vpn-alias ...                                # 多个 ssh 别名依次试
  python3 configure.py --comfy-host 10.0.0.5                                         # ComfyUI 没绑 127.0.0.1 时，它在 H3 机器上监听的地址
  python3 configure.py --start-command 'GPU={gpu} PORT={port} DYNVRAM={dynvram} COMFY=/path/to/ComfyUI bash /path/to/start_comfy.sh'
  python3 configure.py --image codex                                                 # 默认：Codex CLI（gpt-image）
  python3 configure.py --image http --image-urls http://127.0.0.1:18801              # 自建图像编辑服务，接口见 references/image-providers.md
"""
import argparse, json, os
from common import config, config_path

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
for a in ("--host", "--comfy-root", "--comfy-host", "--ports", "--start-command", "--image", "--image-urls", "--face-models-dir", "--font"): ap.add_argument(a)
ap.add_argument("--show", action="store_true")
a = ap.parse_args()
c = config(); h = c.setdefault("h3", {}); im = c.setdefault("image", {})
if a.host: h["host"] = a.host.split(",") if "," in a.host else a.host
if a.comfy_root: h["comfy_root"] = a.comfy_root
if a.comfy_host: h["comfy_host"] = a.comfy_host
if a.ports: h["ports"] = [int(p) for p in a.ports.split(",")]
if a.start_command: h["start_command"] = a.start_command
if a.image:
    if a.image not in ("codex", "http"): ap.error("--image 只能是 codex 或 http")
    im["provider"] = a.image
if a.image_urls: im["urls"] = a.image_urls.split(",")
if im.get("provider") == "http" and not im.get("urls"): ap.error("--image http 要同时给 --image-urls")
if a.face_models_dir: c["face_models_dir"] = a.face_models_dir
if a.font: c["font"] = a.font
p = config_path()
if not a.show:
    p.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(p, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f: json.dump(c, f, ensure_ascii=False, indent=1)
    os.chmod(p, 0o600)
    print(f"已写入 {p}")
print(json.dumps(c, ensure_ascii=False, indent=1))
