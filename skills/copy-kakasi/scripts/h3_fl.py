#!/usr/bin/env python3
"""首尾帧 → 用户自己的 MiniMax H3 首尾帧模式（fl2va）→ gen/NN.mp4。在工程根目录跑。

  python3 h3_fl.py print [03 22]                                     看每个镜头用哪两张帧、多长、提示词（不连机器）
  python3 h3_fl.py run [--only 03,22] [--gpus N] [--steps 8] [--keep-server] [--allow-busy] [--accept-qa 03_a,05_b|all]
  python3 h3_fl.py run --redo 19,20 --steps 20                       按意见重拍：旧的 gen/、graded/ 挪进 _old/（带时间），再只跑这几个
  python3 h3_fl.py clean                                             删掉 H3 机器上这个工程上传的帧

机器地址来自用户配置（configure.py），默认卡数 = 配置的端口数。
别人的任务还在队列里时默认不开跑（--allow-busy 才跑）。质检没过的帧默认不送 H3（看过后用 --accept-qa 放行）。
首尾帧来源（优先级）：keys/user（用户自己做的）> keys/repaint > keys/clean > keys/swap > keys/src（没有要换的脸）。
first_only 的镜头只给首帧。生成长度 ≥124 帧（训练区间），尾帧钉在最后一帧；finish.py 再重采样回原镜头帧数。
换种子：state.json 里记着重试次数，自动 +1000。
--steps 20（原版步数）比 8 步更听提示词、小脸更稳，一段约多 2 倍时间。用了 project.json 的 h3_variant 时，步数由方案决定，--steps 不生效。
"""
import json, re, shlex, subprocess, sys, time, hashlib
from pathlib import Path
from common import MAX_FRAMES, OK_JOB, ROOT, project, edl, shots, cast, nn, frames_for, only, opt

P = project()
W, H = P.get("size", [1024, 576])          # 32 的倍数
SEED = P.get("seed", 20261111)
STYLE = P["style"]
SOUND = P.get("ambience", "Quiet natural ambience, soft wind.")
CAM_DEFAULT = "The camera holds a steady shot with only very slight natural movement."


def job():
    """H3 机器上 input/output 的子目录名。会拼进远端命令，只允许字母数字下划线连字符。不写就按工程目录名生成，避免两个工程撞名"""
    j = P.get("job") or "ck_" + hashlib.sha1(str(ROOT).encode()).hexdigest()[:10]
    if not OK_JOB.match(j): sys.exit(f"project.json 的 job 是 {j!r}：只能用字母、数字、下划线、连字符")
    return j


def key(n, tag):
    for d in ("user", "repaint", "clean", "swap"):      # clean：没有要换的脸、只去了字幕的原帧
        s = ROOT / f"keys/{d}/{n}_{tag}.png"
        if s.exists(): return s
    return ROOT / f"keys/src/{n}_{tag}.png"


def prompt_for(n, s, length, C):
    T = (length - 1) / 24
    fo = s.get("first_only")
    # 换过脸、带配饰（眼镜等）的角色：H3 爱把配饰"忘掉"或闪烁，每段都要明说一直戴着
    accs = [f"{C[r]['name'].capitalize()} wears {C[r]['accessory']} the whole time; it stays on, stable in shape and position, never flickering, deforming or disappearing."
            for r in s.get("who", []) if r in C and C[r].get("accessory") and any(key(n, t).parent.name != "src" for t in "ab")]
    return (
        f"For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced. "
        + ("" if fo else f"At {T:.2f} seconds into the target video, <Picture 2> (from [Shot 1]) is fully referenced.") + "\n\n"
        f"integrated_multimodal_description: [Shot 1] {STYLE}. The video begins exactly from <Picture 1>" + ("" if fo else " and ends exactly on <Picture 2>") + ". "
        "Keep the same faces, hair, costumes, makeup, framing, background, lighting and colour as <Picture 1> throughout; every face stays identical "
        f"to <Picture 1> from start to end. {s.get('cam', CAM_DEFAULT)} {s.get('desc', '')} {' '.join(accs)} "
        "Movements are natural, continuous and unhurried, with no cuts. Nobody speaks. "
        "The framing stays exactly as wide or as close as <Picture 1> the whole time: no cut, no zoom-in to a close-up, no new camera angle. "
        "The set and background keep the same look and colours as <Picture 1>. Only the people already visible in <Picture 1> "
        "and <Picture 2> appear; nobody new enters the frame. "
        "No subtitles, captions, logos, watermarks or on-screen text of any kind appear.\n\n"
        f"overall_soundscape: {s.get('sound', SOUND)}\n\nnon_diegetic_music: N/A"
    ).replace("  ", " ")


# project.json 的 "h3_variant" 选 H3 加速方案（不写就是默认 Turbo 8 步）。LoRA 文件放 models/loras/pika/，见 references/h3-setup.md
VARIANTS = {
    "pika4": {"loras": [("pika/pika_h3_flex_fl2va_comfy_bf16.safetensors", 0.5), ("pika/minimax_h3_fl2v_turbo_4step_v1.2_768p_comfyui_bf16.safetensors", 1.0)],
              "steps": 4, "shift_video": 6.0},
    "pika8": {"loras": [("pika/pika_h3_flex_fl2va_comfy_bf16.safetensors", 0.6), ("pika/minimax_h3_fl2v_turbo_8step_v1.1_768p_comfyui_bf16.safetensors", 1.0)],
              "steps": 8, "shift_video": 6.0},
}


def variant():
    v = P.get("h3_variant")
    if v and v not in VARIANTS: sys.exit(f"project.json 的 h3_variant 是 {v!r}：只能是 {', '.join(VARIANTS)}")
    return VARIANTS.get(v)


def workflow(c, t, steps):
    m = c["models"]; JOB = job()
    g = {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": m["fl2va"], "weight_dtype": "default"}},
        "3": {"class_type": "CLIPLoader", "inputs": {"clip_name": m["text_encoder"], "type": "minimax", "device": "default"}},
        "4": {"class_type": "VAELoader", "inputs": {"vae_name": m["video_vae"]}},
        "5": {"class_type": "VAELoader", "inputs": {"vae_name": m["audio_vae"]}},
        "6": {"class_type": "MiniMaxH3ImageToVideo", "inputs": {"clip": ["3", 0], "vae": ["4", 0], "prompt": t["prompt"], "width": W, "height": H,
              "length": t["length"], "first_frame": ["20", 0], **({"last_frame": ["21", 0]} if t["last"] else {})}},
        "9": {"class_type": "LTXVSeparateAVLatent", "inputs": {"av_latent": ["8", 0]}},
        "10": {"class_type": "VAEDecode", "inputs": {"samples": ["9", 0], "vae": ["4", 0]}},
        "11": {"class_type": "VAEDecodeAudio", "inputs": {"samples": ["9", 1], "vae": ["5", 0]}},
        "12": {"class_type": "CreateVideo", "inputs": {"images": ["10", 0], "fps": 24.0, "audio": ["11", 0]}},
        "13": {"class_type": "SaveVideo", "inputs": {"video": ["12", 0], "filename_prefix": f"{JOB}/{t['id']}", "format": "auto", "codec": "auto"}},
        "20": {"class_type": "LoadImage", "inputs": {"image": f"{JOB}/{t['first']}"}},
    }
    if t["last"]: g["21"] = {"class_type": "LoadImage", "inputs": {"image": f"{JOB}/{t['last']}"}}
    V = variant()
    if V:               # LoRA 叠加 + 标准节点 + euler/simple
        prev = ["1", 0]
        for i, (name, w) in enumerate(V["loras"]):
            g[f"30{i}"] = {"class_type": "LoraLoaderModelOnly", "inputs": {"model": prev, "lora_name": name, "strength_model": w}}; prev = [f"30{i}", 0]
        g["2"] = {"class_type": "MiniMaxH3SigmaShift", "inputs": {"model": prev, "shift_video": V["shift_video"], "shift_audio": 3.0}}
        g["7"] = {"class_type": "BasicGuider", "inputs": {"model": ["2", 0], "conditioning": ["6", 0]}}
        g["14"] = {"class_type": "BasicScheduler", "inputs": {"model": ["2", 0], "scheduler": "simple", "steps": V["steps"], "denoise": 1.0}}
        g["15"] = {"class_type": "RandomNoise", "inputs": {"noise_seed": t["seed"]}}
        g["16"] = {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}}
        g["8"] = {"class_type": "SamplerCustomAdvanced", "inputs": {"noise": ["15", 0], "guider": ["7", 0], "sampler": ["16", 0],
                  "sigmas": ["14", 0], "latent_image": ["6", 1]}}
    elif steps < 20:    # Turbo LoRA + Turbo 采样器，8 步。不要再接 SigmaShift：Turbo Sampler 自己处理音视频双时间表
        a = c["accel"]
        g["2"] = {"class_type": "MiniMaxH3TurboLoRA", "inputs": {"model": ["1", 0], "lora_name": a["lora"], "strength": a["strength"], "low_vram": False}}
        g["7"] = {"class_type": "BasicGuider", "inputs": {"model": ["2", 0], "conditioning": ["6", 0]}}
        g["14"] = {"class_type": "BasicScheduler", "inputs": {"model": ["2", 0], "scheduler": "simple", "steps": steps, "denoise": 1.0}}
        g["15"] = {"class_type": "RandomNoise", "inputs": {"noise_seed": t["seed"]}}
        g["16"] = {"class_type": "MiniMaxH3TurboSampler", "inputs": {}}
        g["8"] = {"class_type": "SamplerCustomAdvanced", "inputs": {"noise": ["15", 0], "guider": ["7", 0], "sampler": ["16", 0],
                  "sigmas": ["14", 0], "latent_image": ["6", 1]}}
    else:               # 原版 20 步
        g["2"] = {"class_type": "MiniMaxH3SigmaShift", "inputs": {"model": ["1", 0], "shift_video": 12.0, "shift_audio": 3.0}}
        g["7"] = {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["6", 0]}}
        g["8"] = {"class_type": "KSampler", "inputs": {"model": ["2", 0], "seed": t["seed"], "steps": steps, "cfg": 1.0, "sampler_name": "euler",
                  "scheduler": "normal", "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["6", 1], "denoise": 1.0}}
    return g


def tasks(O):
    S, C = shots(), cast()
    (ROOT / "keys/h3").mkdir(parents=True, exist_ok=True)
    out = []
    for e in edl():
        n = nn(e)
        if O and n not in O: continue
        if n not in S: sys.exit(f"shots.json 里没有镜头 {n}")
        s = S[n]
        if s.get("keep_orig"): continue       # 没有主角的脸（黑场、腿部特写、背影）：成片直接用原片，不跑 H3
        if e["frames"] > MAX_FRAMES: sys.exit(f"镜头 {n} 有 {e['frames']} 帧，超过 H3 的 {MAX_FRAMES} 帧（约 15 秒）上限：在 plan.json 里拆成两个镜头")
        L = frames_for(e["frames"]); fl = []
        for tag in ("a" if s.get("first_only") else "ab"):
            src = key(n, tag); dst = ROOT / f"keys/h3/{n}_{tag}_{src.parent.name}.jpg"   # JPEG q2：链路慢时比 PNG 快约 5 倍
            subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(src), "-vf", f"scale={W}:{H}:flags=lanczos", "-q:v", "2", str(dst)], check=True)
            fl.append(dst)
        out.append({"id": n, "length": L, "first": fl[0].name, "last": fl[1].name if len(fl) > 1 else "", "paths": [str(p) for p in fl],
                    "prompt": prompt_for(n, s, L, C), "seed": SEED + int(n), "steps": s.get("steps")})   # 镜头级 steps（返工时设 20）覆盖全局
    return out


def qa_blocked(T):
    """这批要送 H3 的帧里，质检没过且没被放行的"""
    acc = set((opt("--accept-qa", "") or "").split(",")) - {""}
    if "all" in acc: return []
    bad = []
    for t in T:
        for tag, name in (("a", t["first"]), ("b", t["last"])):
            if name and name.endswith("_repaint.jpg") and (ROOT / f"keys/repaint/{t['id']}_{tag}.qa_fail").exists() and f"{t['id']}_{tag}" not in acc:
                bad.append(f"{t['id']}_{tag}：" + (ROOT / "keys/repaint" / f"{t['id']}_{tag}.qa_fail").read_text())
    return bad


def run():
    steps = int(opt("--steps", "8"))
    outdir = ROOT / "gen"; outdir.mkdir(exist_ok=True)
    redo = set(opt("--redo", "").split(",")) - {""}
    V = variant()
    if V and "--steps" in sys.argv: print(f"⚠ 用了 h3_variant，步数固定为 {V['steps']}，--steps {steps} 不生效", flush=True)
    for n in sorted(redo):               # 旧版本不删，挪进 _old/，用户要对比还能找回来
        for d in ("gen", "graded"):
            f = ROOT / f"{d}/{n}.mp4"
            if f.exists(): (ROOT / f"{d}/_old").mkdir(exist_ok=True); f.rename(ROOT / f"{d}/_old/{n}_{time.strftime('%m%d_%H%M')}.mp4")
    T = [t for t in tasks(only() | redo) if not (outdir / f"{t['id']}.mp4").exists()]
    if not T: print("没有要跑的（要重拍用 --redo）"); return
    bad = qa_blocked(T)
    if bad: sys.exit("这些帧质检没过，先给用户看（review.py），重做，或确认后用 --accept-qa 放行：\n  " + "\n  ".join(bad))
    import h3_client as h3
    c = h3.conf(); JOB = job()
    sf = outdir / "state.json"; state = json.loads(sf.read_text()) if sf.exists() else {}
    save = lambda: sf.write_text(json.dumps(state, ensure_ascii=False, indent=1))
    ports = h3.start_servers(int(opt("--gpus", str(len(c["ports"])))))
    own = {st.get("prompt_id") for st in state.values()}
    foreign = h3.queue_ids(ports) - own
    if foreign and "--allow-busy" not in sys.argv:
        sys.exit(f"ComfyUI 队列里已有 {len(foreign)} 个不是这个工程的任务，可能是别人在用。告诉用户；确认可以一起排队再加 --allow-busy")
    rin = f"{h3.comfy()}/input/{JOB}"; q_rin = shlex.quote(rin)
    enqueued = False
    try:
        h3.rsh(f"mkdir -p {q_rin}")
        for t in T:
            for f in t["paths"]: h3.put(f, f"{rin}/{Path(f).name}")
        h3.rsh(f"chmod -R a+rX {q_rin}")      # scp 会带上本机的文件权限；ComfyUI 可能以另一个用户运行，只给读，不给写
        load = {}
        for p in ports:
            q = h3.api(p, "/queue") or {}
            load[p] = len(q.get("queue_running", [])) + len(q.get("queue_pending", []))
        for t in T:
            st = state.get(t["id"], {})
            st_steps = V["steps"] if V else (t.get("steps") or steps)
            k = h3.hash_of({x: t[x] for x in ("prompt", "first", "last", "length")}) + f"-{st_steps}"
            if st.get("prompt_id") and st.get("key") == k and not (st.get("done") or st.get("error")) and st.get("port") in ports:
                load[st["port"]] += 1; enqueued = True; continue          # 上次入队还在跑：接着等，不重复入队
            tries = st.get("tries", 0) + (1 if st else 0)
            tt = {**t, "seed": t["seed"] + 1000 * tries}
            port = min(load, key=load.get)
            r = h3.api(port, "/prompt", {"prompt": workflow(c, tt, st_steps), "client_id": JOB})
            if not r or "prompt_id" not in r: raise RuntimeError(f"{t['id']} 入队失败：{json.dumps(r, ensure_ascii=False)[:800]}")
            load[port] += 1; enqueued = True
            state[t["id"]] = {"prompt_id": r["prompt_id"], "key": k, "port": port, "at": time.time(), "seed": tt["seed"], "tries": tries, "steps": st_steps}
            save(); print(f"  已入队 {t['id']} → :{port}（{t['length']} 帧 · {st_steps} 步 · {t['first']} / {t['last'] or '只给首帧'}）", flush=True)
        pending = [t["id"] for t in T]; t0 = time.time(); last = ""; missing = {}
        while pending:
            queued = h3.queue_ids(ports)
            for sid in list(pending):
                st = state[sid]; hh = h3.api(st["port"], f"/history/{st['prompt_id']}") or {}
                if st["prompt_id"] not in hh:
                    # 不在历史也不在队列（服务重启过）：连续 3 次就判丢失，重跑 run 会重新入队
                    missing[sid] = 0 if st["prompt_id"] in queued else missing.get(sid, 0) + 1
                    if missing[sid] >= 3:
                        st["error"] = "任务丢了，重跑 run 会重新入队"; pending.remove(sid); save(); print(f"  ✗ {sid} {st['error']}", flush=True)
                    continue
                res = hh[st["prompt_id"]]; files = h3.outputs_of(res)
                if res.get("status", {}).get("status_str") != "success" or not files:
                    msg = next((str(m[1].get("exception_message", ""))[:300] for m in res.get("status", {}).get("messages", []) if "error" in m[0]), "")
                    print(f"  ✗ {sid} 失败：{msg}", flush=True); st["error"] = msg or "没有输出"; pending.remove(sid); save(); continue
                h3.get(f"{h3.comfy()}/output/{files[0]}", outdir / f"{sid}.mp4")
                h3.rsh(f"rm -f {shlex.quote(h3.comfy() + '/output/' + files[0])}", check=False)
                st["done"] = time.time(); st.pop("error", None); save(); pending.remove(sid)
                print(f"  ✓ {sid} → gen/{sid}.mp4（{(st['done'] - st['at']) / 60:.1f} 分钟）", flush=True)
            if pending:
                line = f"  … 还剩 {len(pending)} 段，已等 {(time.time() - t0) / 60:.0f} 分钟"
                if line != last: print(line, flush=True); last = line
                time.sleep(float(opt("--poll", "30")))
        enqueued = False
    except (RuntimeError, KeyboardInterrupt) as e:
        print(f"中断：{e}", flush=True)
        if enqueued: print(f"还有任务在队列里，帧先留在 H3 机器上供它们读取；重跑 run 接着等，或之后 h3_fl.py clean 删掉", flush=True)
        else: _cleanup(h3, rin)
        sys.exit(1)
    _cleanup(h3, rin)
    if "--keep-server" not in sys.argv: h3.down()                # 只停自己起的实例
    bad = [t["id"] for t in T if state[t["id"]].get("error")]
    if bad: sys.exit(f"失败 {len(bad)} 段：{', '.join(bad)}（修好后 h3_fl.py run --only {','.join(bad)}）")
    print(f"全部完成：{len(T)} 段")


def _cleanup(h3, rin):
    h3.rsh(f"rm -rf {shlex.quote(rin)}", check=False)            # 只删这个工程上传的首尾帧
    h3.rsh(f"rmdir {shlex.quote(h3.comfy() + '/output/' + job())} 2>/dev/null", check=False)   # 输出目录空了就一起删；不空说明还有东西，不动


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "run": run()
    elif cmd == "clean":
        import h3_client as h3
        _cleanup(h3, f"{h3.comfy()}/input/{job()}"); print("已删除 H3 机器上这个工程上传的帧")
    elif cmd == "print":
        for t in tasks(set(sys.argv[2:])): print(f"{t['id']}  {t['first']} → {t['last'] or '（只给首帧）'}  {t['length']} 帧\n{t['prompt']}\n")
    else: sys.exit(__doc__)
