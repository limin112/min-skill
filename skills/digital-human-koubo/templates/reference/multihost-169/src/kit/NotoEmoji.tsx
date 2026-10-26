// Google Noto 动态 emoji：逐帧驱动 lottie-web（不依赖浏览器时钟）。
// 素材先用 scripts/fetch_noto_emoji.py 下到 public/emoji/（manifest.json 记录每个 emoji 是动态还是静态）。
// <NotoEmoji char="🚀" at={at(3)} size={160} />
//  - at：开始播放的帧；之前停在第 0 帧（Noto 的起止姿态相同，静止时就是正常 emoji）
//  - speed：播放速度倍数；cycles：播几轮（默认 1，播完停住）；Infinity = 一直循环
//  - 没有动态版的 emoji 自动退回 Noto 静态 SVG
// 授权：片尾或声明里加「Animated emoji: Google Noto」。
import React, { useEffect, useRef, useState } from "react";
import lottie, { type AnimationItem } from "lottie-web";
import { continueRender, delayRender, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

type Entry = { cp: string; kind: "lottie" | "svg" };
let manifestP: Promise<Record<string, Entry>> | null = null;
const jsonCache = new Map<string, Promise<any>>();
const manifest = () => (manifestP ??= fetch(staticFile("emoji/manifest.json")).then((r) => r.json()));
const lottieJson = (cp: string) => {
  if (!jsonCache.has(cp)) jsonCache.set(cp, fetch(staticFile(`emoji/${cp}.json`)).then((r) => r.json()));
  return jsonCache.get(cp)!;
};

export const NotoEmoji: React.FC<{
  char: string;
  at?: number;
  size?: number;
  speed?: number;
  cycles?: number;
  style?: React.CSSProperties;
}> = ({ char, at = 0, size = 128, speed = 1, cycles = 1, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const box = useRef<HTMLDivElement>(null);
  const anim = useRef<AnimationItem | null>(null);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [meta, setMeta] = useState<{ ip: number; op: number; fr: number } | null>(null);
  const [h] = useState(() => delayRender(`NotoEmoji ${char}`));

  useEffect(() => {
    let dead = false;
    (async () => {
      const m = await manifest();
      const e = m[char];
      if (!e) throw new Error(`NotoEmoji: ${char} 不在 public/emoji/manifest.json，先跑 fetch_noto_emoji.py`);
      if (dead) return;
      setEntry(e);
      if (e.kind === "svg") return continueRender(h);
      const data = structuredClone(await lottieJson(e.cp));
      if (dead || !box.current) return;
      const a = lottie.loadAnimation({ container: box.current, renderer: "svg", loop: false, autoplay: false, animationData: data });
      anim.current = a;
      a.addEventListener("DOMLoaded", () => {
        setMeta({ ip: data.ip, op: data.op, fr: data.fr });
        continueRender(h);
      });
    })();
    return () => {
      dead = true;
      anim.current?.destroy();
    };
  }, [char]);

  useEffect(() => {
    if (!anim.current || !meta) return;
    const len = meta.op - meta.ip;
    let local = Math.max(0, ((frame - at) / fps) * meta.fr * speed);
    if (Number.isFinite(cycles)) local = Math.min(local, cycles * len - 0.001);
    anim.current.goToAndStop(meta.ip + (local % len), true);
  }, [frame, meta, at, fps, speed, cycles]);

  return (
    <div style={{ width: size, height: size, lineHeight: 0, ...style }}>
      {entry?.kind === "svg" ? (
        <Img src={staticFile(`emoji/${entry.cp}.svg`)} style={{ width: "100%", height: "100%" }} />
      ) : (
        <div ref={box} style={{ width: "100%", height: "100%" }} />
      )}
    </div>
  );
};
