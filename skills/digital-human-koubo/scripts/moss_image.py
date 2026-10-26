#!/usr/bin/env python3
"""docker3 上的 MOSS-Image 出图：做数字人首帧 / 参考图 / 场景开场画面。替代原来的 Renoise GPT Image。

用法：
  python3 moss_image.py --prompt "moss01, upper-body portrait, ..." [--lora moss01[:0.9]] [--ratio 9:16|16:9|1:1|宽x高]
                        [--n 4] [--seed 42] [--out moss_out]
  python3 moss_image.py --prompts prompts.json --out moss_out      # [{"prompt","negative","seed","size":[H,W]}]

- 只用 docker3 的 GPU0 / GPU1（persona.json → moss.gpus），挑当下空闲显存最多的那张
- --lora 写 persona.json → moss.loras 里的名字（moss01 = 自己训的人物，触发词 moss01），或者 docker3 上的绝对路径
- 出图默认 50 步、CFG 3（官方推荐值），一张 1024² 级别约 1 分钟；每次先出 2–4 张让用户挑
- 跑完把远端的临时目录删掉，图片落在 --out
"""
import argparse, json, shlex, subprocess, sys, time
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
M = json.loads((HERE / "persona.json").read_text())["moss"]
SSH = ["ssh", "-o", "ConnectTimeout=30", "-o", "ServerAliveInterval=10", "-o", "BatchMode=yes", M["ssh_host"]]
SIZES = {"9:16": [1360, 768], "16:9": [768, 1360], "1:1": [1024, 1024], "3:4": [1184, 896], "4:3": [896, 1184]}  # [H, W]，都是 16 的倍数


def rsh(cmd, check=True):
    r = subprocess.run(SSH + [cmd], capture_output=True, text=True)
    if check and r.returncode != 0: sys.exit(f"docker3 命令失败：\n{r.stderr.strip()[-1500:]}")
    return r.stdout


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--prompt"); ap.add_argument("--prompts"); ap.add_argument("--negative", default="")
    ap.add_argument("--lora", default=""); ap.add_argument("--ratio", default="9:16")
    ap.add_argument("--n", type=int, default=4); ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--steps", type=int, default=50); ap.add_argument("--out", default="moss_out")
    ap.add_argument("--gpu", type=int, help="指定 docker3 的卡号（默认在 moss.gpus 里挑最空的）")
    a = ap.parse_args()
    if not (a.prompt or a.prompts): sys.exit(__doc__)
    size = SIZES.get(a.ratio) or [int(x) for x in reversed(a.ratio.lower().split("x"))]
    if any(v % 16 for v in size): sys.exit("宽高都要是 16 的倍数")
    items = json.loads(Path(a.prompts).read_text()) if a.prompts else \
        [{"prompt": a.prompt, "negative": a.negative, "seed": a.seed + i, "size": size} for i in range(a.n)]
    for it in items: it.setdefault("size", size)

    adapters = ""
    if a.lora:
        name, _, mult = a.lora.partition(":")
        path = M["loras"].get(name, name)
        adapters = f"{path}:{mult or M['lora_weight']}"

    # 挑卡：只在允许的卡里挑空闲显存最多的
    q = rsh("nvidia-smi --query-gpu=index,memory.free --format=csv,noheader,nounits")
    free = {int(i): int(m) for i, m in (l.split(",") for l in q.strip().splitlines())}
    gpu = a.gpu if a.gpu is not None else max(M["gpus"], key=lambda g: free.get(g, 0))
    if free.get(gpu, 0) < M["need_mb"]:
        sys.exit(f"docker3 的 GPU{M['gpus']} 都不够 {M['need_mb']} MB 空闲（{ {g: free.get(g) for g in M['gpus']} }），等一会再跑")

    job = f"{M['work']}/{time.strftime('%Y%m%d_%H%M%S')}_g{gpu}"
    rsh(f"mkdir -p {job}/out")
    subprocess.run(SSH + [f"cat > {job}/prompts.json"], input=json.dumps(items, ensure_ascii=False), text=True, check=True)
    sets = [f"WEIGHTS={M['weights']}", f"PROMPTS_FILE={job}/prompts.json", f"OUT={job}/out", f"STEPS={a.steps}", "BATCH=2"]
    if adapters: sets.append(f"ADAPTERS={adapters}")
    # docker3 的根分区是 worker3 上多个容器共享的 overlay，经常是满的：所有可写缓存都放到 /workspace/data
    cache = f"{M['work']}/cache"
    cmd = (f"mkdir -p {cache}/tmp && cd {M['trainer']} && source {M['venv']}/bin/activate && "
           f"TRITON_CACHE_DIR={cache}/triton TORCHINDUCTOR_CACHE_DIR={cache}/inductor XDG_CACHE_HOME={cache}/xdg "
           f"TMPDIR={cache}/tmp CUDA_VISIBLE_DEVICES={gpu} PYTHONWARNINGS=ignore kogine run scripts/sample/sample.py "
           + " ".join(f"--set {shlex.quote(s)}" for s in sets) + f" > {job}/sample.log 2>&1")
    print(f"docker3 GPU{gpu}（空闲 {free[gpu]} MB）出 {len(items)} 张 {size[1]}x{size[0]}"
          + (f"，LoRA {adapters}" if adapters else "") + " …", flush=True)
    t0 = time.time()
    r = subprocess.run(SSH + [f"bash -lc {shlex.quote(cmd)}"], capture_output=True, text=True)
    if r.returncode != 0:
        print(rsh(f"tail -40 {job}/sample.log", check=False)); sys.exit("出图失败（日志如上，远端目录保留：" + job + "）")
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    # 一次 tar 流整包拉回：docker3 经 worker3 中转，逐个 scp 很容易卡住
    with open(out / f".pull_{Path(job).name}.tar", "wb") as fh:
        subprocess.run(SSH + [f"cd {job}/out && tar cf - *.png"], stdout=fh, check=True)
    names = subprocess.run(["tar", "tf", str(out / f".pull_{Path(job).name}.tar")], capture_output=True, text=True).stdout.split()
    subprocess.run(["tar", "xf", str((out / f".pull_{Path(job).name}.tar").resolve())], cwd=str(out.resolve()), check=True)
    got = [n for n in names if (out / n).exists()]
    if len(got) < len(items):   # 张数不对就别删远端，留着手动取
        sys.exit(f"只取回 {len(got)}/{len(items)} 张（tar 里 {len(names)} 个），远端保留：{M['ssh_host']}:{job}/out")
    (out / f".pull_{Path(job).name}.tar").unlink()
    rsh(f"rm -rf {job}", check=False)
    pngs = sorted(out.glob("*.png"))
    print(f"完成，用时 {(time.time() - t0) / 60:.1f} 分钟 → {out}/（{len(pngs)} 张）")
    for p in pngs[-len(items):]: print("  ", p)


if __name__ == "__main__":
    main()
