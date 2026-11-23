#!/usr/bin/env python3
"""测速：用一段视频冒充摄像头，按网页的方式推流，统计帧率和延迟。

  .venv/bin/python bench.py 你的视频.mp4                       # 本机 720p，测 20 秒
  .venv/bin/python bench.py 你的视频.mp4 --res 640x480 --secs 30
  .venv/bin/python bench.py 你的视频.mp4 --inflight 8 --jpeg-q 75 --srv-q 75   # 模拟「流畅优先」
  .venv/bin/python bench.py 你的视频.mp4 --save last.jpg       # 存最后一帧换脸结果看看

先在网页里上传并选中一张照片。服务同一时间只服务一个直播连接，测速会把网页上正在进行的直播挤掉。
默认参数对应网页的「低延迟优先」：最多 2 帧同时在路上，JPEG 质量 82 / 85。
"""
import argparse, json, statistics, struct, threading, time

import cv2
import websocket

ap = argparse.ArgumentParser()
ap.add_argument("video")
ap.add_argument("--url", default="ws://127.0.0.1:8765/ws")
ap.add_argument("--secs", type=float, default=20)
ap.add_argument("--res", default="1280x720")
ap.add_argument("--fps", type=float, default=30, help="摄像头帧率上限")
ap.add_argument("--inflight", type=int, default=2, help="最多几帧同时在路上（流畅优先 = 8）")
ap.add_argument("--jpeg-q", type=int, default=82, help="上传 JPEG 质量")
ap.add_argument("--srv-q", type=int, default=85, help="服务端返回 JPEG 质量")
ap.add_argument("--save", help="把最后一帧换脸结果存成这个文件")
a = ap.parse_args()
W, H = map(int, a.res.split("x"))

cap = cv2.VideoCapture(a.video)
FR = []
while len(FR) < 900:
    ok, im = cap.read()
    if not ok:
        break
    FR.append(cv2.resize(im, (W, H)) if im.shape[:2] != (H, W) else im)
if not FR:
    raise SystemExit(f"读不出视频：{a.video}")

ws = websocket.create_connection(a.url, timeout=30, enable_multithread=True)
ws.send(json.dumps({"type": "settings", "jpeg_q": a.srv_q}))
lock = threading.Condition()
st = dict(inflight=0, rtt=[], srv=[], ok=0, swapped=0, dropped=0, nosrc=0, up=0, down=0, last=None)


def rx():
    while True:
        try:
            op, d = ws.recv_data()
        except Exception:
            return
        if op != 2:
            continue
        ts, = struct.unpack("<d", d[:8])
        ms, fl = struct.unpack("<fB", d[8:13])
        with lock:
            st["inflight"] = max(0, st["inflight"] - 1)
            st["down"] += len(d)
            st["nosrc"] += bool(fl & 4)
            if fl & 2:
                st["dropped"] += 1
            else:
                st["ok"] += 1
                st["swapped"] += bool(fl & 1)
                st["rtt"].append((time.time() - ts) * 1000)
                st["srv"].append(ms)
                st["last"] = d[13:]
            lock.notify_all()


threading.Thread(target=rx, daemon=True).start()
t0 = nxt = time.time()
stop, sent = t0 + a.secs, 0
while time.time() < stop:
    with lock:
        while st["inflight"] >= a.inflight and time.time() < stop:
            lock.wait(0.5)
        if time.time() >= stop:
            break
        st["inflight"] += 1
    im = FR[int((time.time() - t0) * 30) % len(FR)]
    ok, jpg = cv2.imencode(".jpg", im, [cv2.IMWRITE_JPEG_QUALITY, a.jpeg_q])
    msg = struct.pack("<d", time.time()) + jpg.tobytes()
    ws.send_binary(msg)
    sent += 1
    st["up"] += len(msg)
    nxt += 1 / a.fps
    time.sleep(max(0, nxt - time.time()))
time.sleep(1.5)
ws.close()
el = time.time() - t0
r = st["rtt"] or [0]
p95 = statistics.quantiles(r, n=20)[18] if len(r) > 2 else r[0]
print(f"{a.res} {el:.0f}s | 出 {st['ok'] / el:.1f} fps（发 {sent / el:.1f}）| 换上脸 {st['swapped']}/{st['ok']} 帧 | "
      f"往返 p50 {statistics.median(r):.0f} ms p95 {p95:.0f} ms | 服务端每帧 {statistics.median(st['srv'] or [0]):.1f} ms | "
      f"上行 {st['up'] * 8 / el / 1e6:.1f} Mbps 下行 {st['down'] * 8 / el / 1e6:.1f} Mbps | 丢 {st['dropped']}")
if st["nosrc"]:
    print("提示：照片库里还没选照片，先在网页里上传一张")
if a.save and st["last"]:
    open(a.save, "wb").write(st["last"])
    print("最后一帧已存到", a.save)
