#!/usr/bin/env python3
"""口播稿 → worker2 上的 MiniMax H3（ComfyUI）分段出片：画面 + 原生配音一起出。

用法（在工程目录里跑）：
  python3 h3.py build script.json tasks.json [--fast] [--no-accel]
  python3 h3.py run tasks.json [--only s1,s3] [--gpus 1|2] [--keep-server] [--keep-remote]
  python3 h3.py status tasks.json
  python3 h3.py down                       # 只停自己起的 ComfyUI，而且队列空了才停

script.json：[{"id","host","t","lang", ...}]
  host   项目 cast.json 里的角色 id（cast.json 可以 {"use": "oliver"} 借 skill 角色库 assets/cast/library.json 里的）
  t      台词，原样念（不翻译不改写）
  lang   zh（普通话，默认）/ en-GB（英式英语）/ en / ja …
  shot   pip（画中画小窗，默认 480 档）/ full（全屏 576 档）/ scene（全屏场景，16:9）
  frame  可选：这段单独用的首帧（相对工程目录）；不写就用这个角色在该比例下的 frames
  ratio  可选：9:16 / 16:9；不写按 shot（scene → 16:9）再按 host 默认
  act    可选：这段的表演（英文），不写用 persona.acts[shot]
  camera / sound / music  可选：镜头、环境声、配乐（music 默认 N/A，配乐后期统一铺）
  seconds 可选：强制时长；不写按语速估

提示词按 H3 官方 I2VA 规范拼（first-frame 指令 + integrated_multimodal_description /
overall_soundscape / non_diegetic_music，台词放 <d>[语言] …</d>），见 references/h3.md。
默认挂 Turbo 加速 LoRA（8 步，约为 20 步的 2.5 倍速）；--no-accel 回到原版 20 步。
run 会起服务（没在跑就挑最空的卡起；--gpus 2 两张卡各起一个实例，任务轮流分）→ 传首帧 →
入队 → 等完 → 取回 gen/<段id>.mp4 → 删远端这次的输入输出 → 自己起的服务、队列空了就停。
中断后重跑同一条命令会接着等，不重复入队；删掉 gen/<段id>.mp4 再 run 就是换种子重拍。
"""
import hashlib, json, math, os, re, shlex, subprocess, sys, time
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
P = json.loads((HERE / "persona.json").read_text())
H3 = P["h3"]
ROOT = H3["root"]                       # /data/amin/h3
COMFY = f"{ROOT}/ComfyUI"
STATE_REMOTE = f"{ROOT}/logs/dh_koubo_server.json"
SSH_OPTS = ["-o", "ConnectTimeout=20", "-o", "ServerAliveInterval=10", "-o", "BatchMode=yes"]
LANG = {  # lang → (<d> 里的语言标签, 口音描述)
    "zh": ("Chinese", "speaking standard Mandarin Chinese"),
    "en-GB": ("English", "speaking English with a crisp, refined British RP accent"),
    "en": ("English", "speaking natural American English"),
    "ja": ("Japanese", "speaking natural Japanese"),
}


def arg(name, default=None):
    a = sys.argv
    return a[a.index(name) + 1] if name in a else default


# ---------------- 连接 ----------------
_host = None
def host():
    """worker2 局域网直连优先，连不上走 Tailscale（worker2-ts）。H3_SSH 可以强制指定。"""
    global _host
    if _host: return _host
    cands = [os.environ["H3_SSH"]] if os.environ.get("H3_SSH") else H3["ssh_hosts"]
    for h in cands:
        if subprocess.run(["ssh", *SSH_OPTS, "-o", "ConnectTimeout=8", h, "true"], capture_output=True).returncode == 0:
            _host = h; return h
    sys.exit(f"连不上 worker2（试过 {', '.join(cands)}）。检查 Tailscale / 局域网，或 export H3_SSH=<ssh 别名>")


def rsh(cmd, data=None, check=True):
    r = subprocess.run(["ssh", *SSH_OPTS, host(), cmd], input=data, capture_output=True, text=True)
    if check and r.returncode != 0:
        sys.exit(f"远端命令失败：{cmd[:120]}\n{r.stderr.strip()[-800:]}")
    return r.stdout


def api(port, path, payload=None):
    url = f"http://{H3['lan_ip']}:{port}{path}"
    if payload is None:
        out = rsh(f"curl -s -m 30 {shlex.quote(url)}", check=False)
    else:
        out = rsh(f"curl -s -m 60 -H 'Content-Type: application/json' --data-binary @- {shlex.quote(url)}",
                  data=json.dumps(payload, ensure_ascii=False), check=False)
    try: return json.loads(out)
    except ValueError: return None


def scp(src, dst):
    subprocess.run(["scp", "-q", *SSH_OPTS, src, dst], check=True)


# ---------------- build ----------------
def frames(sec):
    """秒 → 帧数，吸附到 H3 的 17k+5 网格；训练区间 124–362 帧（约 5–15 秒）"""
    n = math.ceil((sec * 24 - 5) / 17) * 17 + 5
    return max(124, min(362, n))


def seconds_for(s):
    if s.get("seconds"): return float(s["seconds"])
    t, lang = s["t"], s.get("lang", "zh")
    if lang == "zh":
        d = len(re.sub(r"[\s，。、：；！？,.:;!?“”「」…—]", "", t)) / H3["speed"]["zh_cps"]
    elif lang == "ja":
        d = len(re.sub(r"\s", "", t)) / 7
    else:
        d = len(t.split()) / H3["speed"]["en_wps"]
    return d + H3["pad_seconds"]


def fit_image(src, dst, w, h):
    """按目标比例居中裁切再缩放到精确尺寸（H3 的首帧是直接拉伸到画布的，比例不对人会变形）"""
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(src), "-vf",
                    f"scale={w}:{h}:force_original_aspect_ratio=increase:flags=lanczos,crop={w}:{h}", str(dst)], check=True)


def load_cast():
    """skill 角色库 + 项目 cast.json（项目优先）。frames 解析成绝对路径：库里的相对 skill 目录，项目的相对工程目录"""
    lib = json.loads((HERE / "assets/cast/library.json").read_text())
    proj = json.loads(Path("cast.json").read_text()) if Path("cast.json").exists() else {}
    if not proj:
        sys.exit("工程目录里没有 cast.json：先定阵容（见 SKILL.md 第 1 步；可以 {\"host\": {\"use\": \"<库里的角色 id>\"}} 借 assets/cast/library.json 里的现成角色）")
    cast = {}
    for cid, c in proj.items():
        if cid.startswith("_"): continue
        base = dict(lib[c["use"]]) if c.get("use") else {}
        fr = {r: str(HERE / f) for r, f in base.get("frames", {}).items()}
        fr.update({r: str(Path(f).resolve()) for r, f in c.get("frames", {}).items()})
        cast[cid] = {**base, **{k: v for k, v in c.items() if k not in ("use", "frames")}, "frames": fr}
    return cast


def compose(s, hp, sec):
    """H3 官方 I2VA 结构：首帧指令 + 三个核心字段。台词一字不改放进 <d>。"""
    tag, accent = LANG.get(s.get("lang", "zh"), LANG["zh"])
    shot = s.get("shot", "pip")
    framing = {"pip": "a vertical selfie-style medium close-up", "full": "a medium close-up talking-head shot",
               "scene": "a cinematic medium shot"}.get(shot, "a medium close-up")
    act = s.get("act") or P["acts"].get(shot, P["acts"]["pip"])
    camera = s.get("camera") or ("The camera holds a near-static handheld shot with only a very slight natural sway."
                                 if shot != "scene" else "The camera pushes in with small amplitude at slow speed.")
    pron = hp.get("pronoun", "she")
    body = (f"[Shot 1] {hp['style']}, {framing}. The video begins exactly from <Picture 1>: {hp['who']}. "
            f"Keep the same face, hair, outfit, {hp.get('keep', 'skin details')}, framing, background and lighting as <Picture 1> throughout. "
            f"{camera} {act} The {hp['voice']} (S1), {accent}, looks into the camera and says: "
            f"<d>[{tag}] {s['t']}</d> "
            f"After the line {pron} holds a relaxed, natural expression with {hp.get('mouth', 'lips')} closed until the end. "
            f"No subtitles, captions, logos or on-screen text of any kind appear.")
    sound = s.get("sound") or hp.get("sound") or "Quiet room tone with soft fabric rustle and natural breathing between phrases."
    music = s.get("music") or "N/A"
    return (f"For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.\n\n"
            f"integrated_multimodal_description: {body}\n\noverall_soundscape: {sound}\n\nnon_diegetic_music: {music}")


def build():
    src, dst = Path(sys.argv[2]), Path(sys.argv[3])
    fast, accel = "--fast" in sys.argv, "--no-accel" not in sys.argv
    S = json.loads(src.read_text())
    job = re.sub(r"[^\w-]", "_", f"{Path.cwd().name}_{src.stem}")[:60]
    inputs = Path("h3_inputs"); inputs.mkdir(exist_ok=True)
    tasks, gpu_min = [], 0.0
    CAST = load_cast()
    for s in S:
        sec = seconds_for(s)
        if sec > 15.2:
            sys.exit(f"{s['id']} 约 {sec:.1f} 秒，超过 H3 的 15 秒（362 帧）上限：拆成两段再跑")
        hid = s.get("host") or next(iter(CAST))
        if hid not in CAST: sys.exit(f"{s['id']} 的 host「{hid}」不在 cast.json 里（有：{', '.join(CAST)}）")
        hp = CAST[hid]
        shot = s.get("shot", "pip")
        ratio = s.get("ratio") or ("16:9" if shot == "scene" else hp.get("ratio", "9:16"))
        tier = "fast" if (fast or shot == "pip") else "full"
        w, h = H3["resolution"][ratio][tier]
        L = frames(sec)
        if not s.get("frame") and ratio not in hp["frames"]:
            sys.exit(f"{s['id']}：角色 {hid} 没有 {ratio} 的首帧（cast.json → frames），先出一张或给这段写 frame")
        fsrc = Path(s["frame"]) if s.get("frame") else Path(hp["frames"][ratio])
        img = inputs / f"{fsrc.stem}_{hashlib.sha1(fsrc.read_bytes()).hexdigest()[:8]}_{w}x{h}.png"   # 换了首帧内容就换文件名
        if not img.exists(): fit_image(fsrc, img, w, h)
        t = {"id": s["id"], "host": hid, "width": w, "height": h, "length": L, "seconds": round((L - 1) / 24, 2),
             "seed": s.get("seed", H3["seed"]), "accel": accel, "prompt": compose(s, hp, sec), "image": str(img)}
        tasks.append(t)
        gpu_min += H3["minutes_per_unit"] * (w * h * L) / (1024 * 576 * 362) * (H3["accel"]["steps"] / H3["steps"] if accel else 1)
    dst.write_text(json.dumps({"job": job, "tasks": tasks}, ensure_ascii=False, indent=1))
    secs = sum(t["seconds"] for t in tasks)
    print(f"{len(tasks)} 段 · 生成总长约 {secs:.0f} 秒 · {'Turbo ' + str(H3['accel']['steps']) + ' 步' if accel else str(H3['steps']) + ' 步'}"
          f" · 单卡串行 GPU 时间粗估 {gpu_min:.0f} 分钟（双卡约减半；另加首次加载模型几分钟）\n→ {dst}")


def workflow(t, job, img_name):
    m = H3["models"]
    g = {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": m["fl2va"], "weight_dtype": "default"}},
        "3": {"class_type": "CLIPLoader", "inputs": {"clip_name": m["text_encoder"], "type": "minimax", "device": "default"}},
        "4": {"class_type": "VAELoader", "inputs": {"vae_name": m["video_vae"]}},
        "5": {"class_type": "VAELoader", "inputs": {"vae_name": m["audio_vae"]}},
        "6": {"class_type": "MiniMaxH3ImageToVideo", "inputs": {"clip": ["3", 0], "vae": ["4", 0], "prompt": t["prompt"],
              "width": t["width"], "height": t["height"], "length": t["length"], "first_frame": ["20", 0]}},
        "9": {"class_type": "LTXVSeparateAVLatent", "inputs": {"av_latent": ["8", 0]}},
        "10": {"class_type": "VAEDecode", "inputs": {"samples": ["9", 0], "vae": ["4", 0]}},
        "11": {"class_type": "VAEDecodeAudio", "inputs": {"samples": ["9", 1], "vae": ["5", 0]}},
        "12": {"class_type": "CreateVideo", "inputs": {"images": ["10", 0], "fps": 24.0, "audio": ["11", 0]}},
        "13": {"class_type": "SaveVideo", "inputs": {"video": ["12", 0], "filename_prefix": f"dh_koubo/{job}/{t['id']}",
               "format": "auto", "codec": "auto"}},
        "20": {"class_type": "LoadImage", "inputs": {"image": img_name}},
    }
    if t.get("accel"):
        # Larryvrh/ComfyUI-MiniMax-H3-Turbo 的接法：LoRA 夹在模型和采样之间，采样器换成 Turbo Sampler，
        # BasicScheduler simple。不要再挂 SigmaShift —— Turbo Sampler 自己处理音视频双时间表，叠上会重复 shift 把音频搞坏
        a = H3["accel"]
        g["2"] = {"class_type": "MiniMaxH3TurboLoRA", "inputs": {"model": ["1", 0], "lora_name": a["lora"], "strength": a["strength"], "low_vram": False}}
        g["7"] = {"class_type": "BasicGuider", "inputs": {"model": ["2", 0], "conditioning": ["6", 0]}}
        g["14"] = {"class_type": "BasicScheduler", "inputs": {"model": ["2", 0], "scheduler": "simple", "steps": a["steps"], "denoise": 1.0}}
        g["15"] = {"class_type": "RandomNoise", "inputs": {"noise_seed": t["seed"]}}
        g["16"] = {"class_type": "MiniMaxH3TurboSampler", "inputs": {}}
        g["8"] = {"class_type": "SamplerCustomAdvanced", "inputs": {"noise": ["15", 0], "guider": ["7", 0], "sampler": ["16", 0],
                  "sigmas": ["14", 0], "latent_image": ["6", 1]}}
    else:
        g["2"] = {"class_type": "MiniMaxH3SigmaShift", "inputs": {"model": ["1", 0], "shift_video": 12.0, "shift_audio": 3.0}}
        g["7"] = {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["6", 0]}}
        g["8"] = {"class_type": "KSampler", "inputs": {"model": ["2", 0], "seed": t["seed"], "steps": H3["steps"], "cfg": 1.0,
                  "sampler_name": "euler", "scheduler": "normal", "positive": ["6", 0], "negative": ["7", 0],
                  "latent_image": ["6", 1], "denoise": 1.0}}
    return g


# ---------------- 服务 ----------------
def live_ports():
    return [p for p in H3["ports"] if api(p, "/system_stats")]


def start_servers(n):
    """保证有 n 个实例在跑：8188 用 start_comfy.sh，8190 用 start_comfy_8190.sh，各占一张最空的卡"""
    ports = live_ports()
    if len(ports) >= n: return ports[:n]
    q = rsh("nvidia-smi --query-gpu=index,memory.free --format=csv,noheader,nounits")
    free = sorted(((int(b), int(a)) for a, b in (l.split(",") for l in q.strip().splitlines())), reverse=True)
    st = rsh(f"cat {STATE_REMOTE} 2>/dev/null", check=False).strip()
    mine = json.loads(st) if st else {"servers": []}
    used = {s["gpu"] for s in mine["servers"]}
    for port, script in zip(H3["ports"], H3["start_scripts"]):
        if len(ports) >= n: break
        if port in ports: continue
        cand = [(mb, g) for mb, g in free if g not in used]
        if not cand: break
        mb, gpu = cand[0]
        if mb >= H3["solo_need_mb"]: dyn = 0
        elif mb >= H3["share_need_mb"]: dyn = 1
        else:
            print(f"GPU{gpu} 只剩 {mb} MB，不在上面起实例"); continue
        out = rsh(f"sudo -u amin env CUDA_DEV={gpu} DYNVRAM={dyn} bash {ROOT}/{script}")
        pid = int(re.search(r"pid=(\d+)", out).group(1))
        used.add(gpu); mine["servers"].append({"pid": pid, "gpu": gpu, "port": port, "dynvram": dyn, "at": time.strftime("%F %T")})
        rsh(f"echo {shlex.quote(json.dumps(mine))} > {STATE_REMOTE}")
        print(f"在 GPU{gpu} 上起了 ComfyUI :{port}（pid {pid}，{'共存' if dyn else '独占'}模式，空闲 {mb} MB）", flush=True)
        for _ in range(72):
            time.sleep(5)
            if api(port, "/system_stats"): ports.append(port); break
        else:
            print(f"  :{port} 6 分钟没起来，看日志：ssh {host()} tail -50 {ROOT}/logs/comfy*.log")
    if not ports: sys.exit("一个 ComfyUI 都没起来")
    return ports


def down(force=False):
    st = rsh(f"cat {STATE_REMOTE} 2>/dev/null", check=False).strip()
    if not st: print("没有这个 skill 起的 ComfyUI，不动别人的"); return
    mine = json.loads(st); keep = []
    for s in mine["servers"]:
        q = api(s["port"], "/queue") or {}
        if not force and (q.get("queue_running") or q.get("queue_pending")):
            print(f":{s['port']} 队列里还有任务（可能是别人的），先不停"); keep.append(s); continue
        rsh(f"if tr '\\0' ' ' < /proc/{s['pid']}/cmdline 2>/dev/null | grep -q main.py; then kill {s['pid']}; fi", check=False)
        print(f"已停掉 ComfyUI :{s['port']}（pid {s['pid']}，GPU{s['gpu']}），显存还给别人")
    mine["servers"] = keep
    rsh(f"echo {shlex.quote(json.dumps(mine))} > {STATE_REMOTE}" if keep else f"rm -f {STATE_REMOTE}", check=False)


# ---------------- run ----------------
def outputs_of(hist):
    files = []
    for o in hist.get("outputs", {}).values():
        for v in o.get("videos", []) + o.get("gifs", []) + o.get("images", []):
            if v.get("filename", "").endswith(".mp4"): files.append(f"{v.get('subfolder', '')}/{v['filename']}".lstrip("/"))
    return files


def hash_of(t):
    return hashlib.sha1(json.dumps(t, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:12]


def run():
    tf = Path(sys.argv[2]); T = json.loads(tf.read_text()); job = T["job"]
    only = set(arg("--only", "").split(",")) - {""}
    todo = [t for t in T["tasks"] if not only or t["id"] in only]
    sf = tf.with_suffix(".state.json")
    state = json.loads(sf.read_text()) if sf.exists() else {}
    save = lambda: sf.write_text(json.dumps(state, ensure_ascii=False, indent=1))
    Path("gen").mkdir(exist_ok=True)
    todo = [t for t in todo if not (Path("gen") / f"{t['id']}.mp4").exists()]
    if not todo: print("这些段都已经在 gen/ 里了（要重拍先删掉 gen/<段id>.mp4）"); return
    ports = start_servers(int(arg("--gpus", H3["default_gpus"])))
    rin = f"{COMFY}/input/dh_koubo/{job}"
    rsh(f"mkdir -p {rin} && chmod 777 {rin}")
    sent = set()
    for t in todo:
        if t["image"] not in sent: scp(t["image"], f"{host()}:{rin}/{Path(t['image']).name}"); sent.add(t["image"])
    # 按各实例当前的队列长度分（别的 run 或别人的任务也算上），不然新任务会全堆在一张卡上
    load = {}
    for p in ports:
        q = api(p, "/queue") or {}
        load[p] = len(q.get("queue_running", [])) + len(q.get("queue_pending", []))
    for t in todo:
        st = state.get(t["id"], {})
        # 上次入队还没出结果、提示词也没改、那个实例还活着 → 接着等，不重复入队
        if st.get("prompt_id") and st.get("prompt_hash") == hash_of(t) and not (st.get("done") or st.get("error")) \
                and st.get("port") in ports:
            load[st["port"]] += 1; continue
        # 重拍（上次出过片或失败过）自动换种子，不然同种子同提示词出来一模一样
        tries = st.get("tries", 0) + (1 if st else 0)
        tt = {**t, "seed": t["seed"] + 1000 * tries}
        port = min(load, key=load.get)
        r = api(port, "/prompt", {"prompt": workflow(tt, job, f"dh_koubo/{job}/{Path(t['image']).name}"), "client_id": f"dh_koubo_{job}"})
        if not r or "prompt_id" not in r:
            sys.exit(f"{t['id']} 入队失败：{json.dumps(r, ensure_ascii=False)[:800]}")
        load[port] += 1
        state[t["id"]] = {"prompt_id": r["prompt_id"], "prompt_hash": hash_of(t), "port": port, "at": time.time(),
                          "seed": tt["seed"], "tries": tries}
        save(); print(f"  已入队 {t['id']} → :{port}（{t['width']}x{t['height']} · {t['seconds']}s · seed {tt['seed']}）", flush=True)
    pending = [t["id"] for t in todo]; t0 = time.time(); last = ""; missing = {}
    while pending:
        queued, qn = set(), [0, 0]
        for p in ports:
            q = api(p, "/queue") or {}
            queued |= {x[1] for x in q.get("queue_running", []) + q.get("queue_pending", [])}
            qn[0] += len(q.get("queue_running", [])); qn[1] += len(q.get("queue_pending", []))
        for sid in list(pending):
            st = state[sid]; pid = st["prompt_id"]
            h = api(st["port"], f"/history/{pid}") or {}
            if pid not in h:
                # 既不在历史也不在队列（服务被重启过）：连续 3 次就判丢失
                missing[sid] = 0 if pid in queued else missing.get(sid, 0) + 1
                if missing[sid] >= 3:
                    st["error"] = "任务丢了（ComfyUI 被重启过？），重跑 run 会重新入队"; pending.remove(sid); save()
                    print(f"  ✗ {sid} {st['error']}", flush=True)
                continue
            res = h[pid]; ok = res.get("status", {}).get("status_str") == "success"
            files = outputs_of(res)
            if not ok or not files:
                msg = next((str(m[1].get("exception_message", ""))[:300] for m in res.get("status", {}).get("messages", []) if "error" in m[0]), "")
                print(f"  ✗ {sid} 失败：{msg}", flush=True); st["error"] = msg; pending.remove(sid); save(); continue
            scp(f"{host()}:{COMFY}/output/{files[0]}", f"gen/{sid}.mp4")
            st["done"] = time.time(); st.pop("error", None); save(); pending.remove(sid)
            print(f"  ✓ {sid} → gen/{sid}.mp4（入队到出片 {(st['done'] - st['at']) / 60:.1f} 分钟）", flush=True)
        if pending:
            line = f"  … 还剩 {len(pending)} 段，{len(ports)} 个实例 运行 {qn[0]} / 等待 {qn[1]}，已等 {(time.time() - t0) / 60:.0f} 分钟"
            if line != last: print(line, flush=True); last = line
            time.sleep(30)
    if "--keep-remote" not in sys.argv:
        rsh(f"rm -rf {rin} {COMFY}/output/dh_koubo/{job}", check=False)
    if "--keep-server" not in sys.argv: down()
    bad = [t["id"] for t in todo if state[t["id"]].get("error")]
    print("全部完成" if not bad else f"失败 {len(bad)} 段：{', '.join(bad)}（修好后 h3.py run {tf} --only {','.join(bad)}）")


def status():
    tf = Path(sys.argv[2]); T = json.loads(tf.read_text()); sf = tf.with_suffix(".state.json")
    state = json.loads(sf.read_text()) if sf.exists() else {}
    ports = live_ports()
    print(f"ComfyUI：{'端口 ' + ', '.join(map(str, ports)) if ports else '没在跑'}")
    for p in ports:
        q = api(p, "/queue") or {}
        print(f"  :{p} 运行 {len(q.get('queue_running', []))} / 等待 {len(q.get('queue_pending', []))}")
    for t in T["tasks"]:
        st = state.get(t["id"], {})
        s = "✓ 已取回" if Path(f"gen/{t['id']}.mp4").exists() else ("✗ " + st["error"][:60] if st.get("error") else (f"已入队 :{st.get('port')}" if st else "未提交"))
        print(f"  {t['id']:8s} {t['host']:7s} {t['width']}x{t['height']} {t['seconds']:>5}s  {s}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "build" and len(sys.argv) >= 4: build()
    elif cmd == "run" and len(sys.argv) >= 3: run()
    elif cmd == "status" and len(sys.argv) >= 3: status()
    elif cmd == "down": down(force="--force" in sys.argv)
    else: sys.exit(__doc__)
