"""连接用户自己部署的 MiniMax H3（ComfyUI）：SSH 到 GPU 机器，或者就在本机。

地址全部来自用户配置（configure.py 写入），这里不写任何默认地址。
host 可以是一个 ssh 别名、一组别名（依次试，比如局域网优先、VPN 备用），或 "local"（ComfyUI 就在这台机器上）。
和 ComfyUI 的 HTTP 通信都在 H3 机器上用 curl 发出去，所以本机不需要能直连它的端口。
"""
import hashlib, json, os, re, shlex, shutil, subprocess, sys, time
from pathlib import Path
from common import config, config_path, SKILL

SSH_OPTS = ["-o", "ConnectTimeout=20", "-o", "ServerAliveInterval=10", "-o", "BatchMode=yes"]
DEFAULTS = {
    "comfy_host": "127.0.0.1",
    "models": {"fl2va": "minimax_h3_fl2va_pruned_int8_convrot.safetensors",
               "text_encoder": "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
               "video_vae": "minimax_h3_video_vae_fp16.safetensors",
               "audio_vae": "minimax_h3_audio_vae_fp32.safetensors"},
    "accel": {"lora": "minimax_h3_turbo_v4_step600_ema.safetensors", "strength": 1.0},
    "solo_need_mb": 40000,    # 空闲显存够这么多就独占（{dynvram}=0）
    "share_need_mb": 14000,   # 够这么多就共存（{dynvram}=1），再少不在这张卡上起
}
_conf = _host = None


def conf():
    global _conf
    if _conf is None:
        c = config().get("h3", {})
        host = os.environ.get("COPYKAKASI_H3_HOST") or c.get("host")
        if not host or not c.get("comfy_root") or not c.get("ports"):
            sys.exit(f"还没配置 H3（{config_path()}）。问用户要 H3 机器的 ssh 别名（或 local）和 ComfyUI 路径，然后：\n"
                     f"  python3 {SKILL}/scripts/configure.py --host <ssh别名|local> --comfy-root <ComfyUI路径> --ports 8188\n"
                     "没有自己的 H3：出图、切片这些步骤还能做，H3 这一步做不了。部署见 references/h3-setup.md")
        _conf = {**DEFAULTS, **c, "host": host, "ports": [int(p) for p in c["ports"]],
                 "models": {**DEFAULTS["models"], **c.get("models", {})}, "accel": {**DEFAULTS["accel"], **c.get("accel", {})}}
    return _conf


def comfy(): return conf()["comfy_root"].rstrip("/")
def state_file(): return f"{comfy()}/.copy_kakasi_servers.json"


def host():
    """第一个连得上的地址；local 不走 ssh"""
    global _host
    if _host: return _host
    h = conf()["host"]; cands = h if isinstance(h, list) else [h]
    for c in cands:
        if c == "local": _host = c; return c
        if subprocess.run(["ssh", *SSH_OPTS, "-o", "ConnectTimeout=8", c, "true"], capture_output=True).returncode == 0:
            _host = c; return c
    sys.exit(f"连不上 H3 机器（试过 {', '.join(cands)}）。检查网络和 ssh 配置，或 python3 {SKILL}/scripts/configure.py --host <别名> 改地址")


def is_local(): return host() == "local"


def rsh(cmd, data=None, check=True):
    args = ["bash", "-c", cmd] if is_local() else ["ssh", *SSH_OPTS, host(), cmd]
    r = subprocess.run(args, input=data, capture_output=True, text=True)
    if check and r.returncode != 0:
        sys.exit(f"H3 机器上的命令失败：{cmd[:120]}\n{r.stderr.strip()[-800:]}")
    return r.stdout


def api(port, path, payload=None):
    url = shlex.quote(f"http://{conf()['comfy_host']}:{port}{path}")
    if payload is None: out = rsh(f"curl -s -m 30 {url}", check=False)
    else: out = rsh(f"curl -s -m 60 -H 'Content-Type: application/json' --data-binary @- {url}", data=json.dumps(payload, ensure_ascii=False), check=False)
    try: return json.loads(out)
    except ValueError: return None


def put(local, remote):
    if is_local(): shutil.copy(local, remote)
    else: subprocess.run(["scp", "-q", *SSH_OPTS, str(local), f"{host()}:{shlex.quote(remote)}"], check=True)


def get(remote, local):
    if is_local(): shutil.copy(remote, local)
    else: subprocess.run(["scp", "-q", *SSH_OPTS, f"{host()}:{shlex.quote(remote)}", str(local)], check=True)


# ---------------- 服务 ----------------
def live_ports():
    return [p for p in conf()["ports"] if api(p, "/system_stats")]


def queue_ids(ports):
    """这些实例上正在跑和排队的任务 id"""
    ids = set()
    for p in ports:
        q = api(p, "/queue") or {}
        ids |= {x[1] for x in q.get("queue_running", []) + q.get("queue_pending", [])}
    return ids


def _mine():
    st = rsh(f"cat {shlex.quote(state_file())} 2>/dev/null", check=False).strip()
    return json.loads(st) if st else {"servers": []}


def _save(mine):
    f = shlex.quote(state_file())
    rsh(f"echo {shlex.quote(json.dumps(mine))} > {f}" if mine["servers"] else f"rm -f {f}", check=False)


def start_servers(n):
    """保证有 n 个实例。优先用已经在跑的；不够且配了 start_command 才自己起（每张卡一个，按空闲显存挑），起了就登记，用完只停登记过的"""
    C = conf(); ports = live_ports()
    if len(ports) >= n: return ports[:n]
    if not C.get("start_command"):
        if ports: print(f"只有 {len(ports)} 个实例在跑（要 {n} 个），没配 start_command，就用这些", flush=True); return ports
        sys.exit(f"ComfyUI 没在跑（查了端口 {C['ports']}）。在 H3 机器上起好它，或配置 start_command 让脚本来起（见 references/h3-setup.md）")
    q = rsh("nvidia-smi --query-gpu=index,memory.free --format=csv,noheader,nounits")
    free = sorted(((int(b), int(a)) for a, b in (l.split(",") for l in q.strip().splitlines())), reverse=True)
    mine = _mine(); used = {s["gpu"] for s in mine["servers"]}
    for port in C["ports"]:
        if len(ports) >= n: break
        if port in ports: continue
        cand = [(mb, g) for mb, g in free if g not in used]
        if not cand: break
        mb, gpu = cand[0]
        if mb < C["share_need_mb"]:
            print(f"GPU{gpu} 只剩 {mb} MB（至少要 {C['share_need_mb']} MB），不在上面起实例", flush=True); used.add(gpu); continue
        dyn = 0 if mb >= C["solo_need_mb"] else 1
        cmd = C["start_command"].replace("{gpu}", str(gpu)).replace("{port}", str(port)).replace("{dynvram}", str(dyn))   # 不用 format：命令里可能有别的花括号
        m = re.search(r"pid=(\d+)", rsh(cmd))
        if not m: sys.exit("start_command 没有打印 pid=<进程号>，没法登记（见 templates/start_comfy.sh）")
        used.add(gpu); mine["servers"].append({"pid": int(m[1]), "gpu": gpu, "port": port, "dynvram": dyn, "at": time.strftime("%F %T")}); _save(mine)
        print(f"在 GPU{gpu} 上起了 ComfyUI :{port}（pid {m[1]}，{'共存' if dyn else '独占'}模式，空闲 {mb} MB）", flush=True)
        for _ in range(72):
            if api(port, "/system_stats"): ports.append(port); break
            time.sleep(5)
        else:
            print(f"  :{port} 6 分钟没起来，到 H3 机器上看 ComfyUI 的日志", flush=True)
    if not ports: sys.exit("一个 ComfyUI 都没起来")
    return ports


def down():
    """只停这个工具自己起的实例，而且队列空了才停"""
    mine = _mine()
    if not mine["servers"]: print("没有这个工具起的 ComfyUI，不动别人的"); return
    keep = []
    for s in mine["servers"]:
        q = api(s["port"], "/queue") or {}
        if q.get("queue_running") or q.get("queue_pending"):
            print(f":{s['port']} 队列里还有任务（可能是别人的），先不停"); keep.append(s); continue
        rsh(f"if ps -p {int(s['pid'])} -o args= 2>/dev/null | grep -q main.py; then kill {int(s['pid'])}; fi", check=False)
        print(f"已停掉 ComfyUI :{s['port']}（pid {s['pid']}，GPU{s['gpu']}），显存还回去了")
    mine["servers"] = keep; _save(mine)


def outputs_of(hist):
    files = []
    for o in hist.get("outputs", {}).values():
        for v in o.get("videos", []) + o.get("gifs", []) + o.get("images", []):
            if v.get("filename", "").endswith(".mp4"): files.append(f"{v.get('subfolder', '')}/{v['filename']}".lstrip("/"))
    return files


def hash_of(t):
    return hashlib.sha1(json.dumps(t, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:12]
