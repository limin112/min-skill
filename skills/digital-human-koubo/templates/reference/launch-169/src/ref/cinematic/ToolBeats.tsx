import React from "react";
import { AbsoluteFill, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { useBrand, V } from "./brand";
import type { Cue } from "./sfx";
import { E, clamp01, mix, seg } from "./motion";

export type ToolEffect = "upscale" | "expand" | "consistent" | "reshoot";
export type ToolBeat = { src: string; from?: number; word: string; effect: ToolEffect; badge?: string };

export const toolBeatsFrames = (n: number, beat: number, beatsEach = 2) => Math.round(n * beatsEach * beat);

export const toolBeatsCues = (items: ToolBeat[], beat: number, offset: number, beatsEach = 2): Cue[] =>
  items.flatMap((it, i) => {
    const at = Math.round(offset + i * beatsEach * beat);
    const fx: Record<ToolEffect, Cue> = {
      upscale: { at: at + 4, name: "swish-3", volume: 0.45 },
      expand: { at: at + 3, name: "whoosh", volume: 0.4 },
      consistent: { at: at + 3, name: "tap", volume: 0.5 },
      reshoot: { at: at + 10, name: "whoosh", volume: 0.55 },
    };
    return [{ at, name: `slam-${(i % 3) + 1}`, volume: 0.45 }, fx[it.effect]];
  });

const Vid: React.FC<{ src: string; from: number; style?: React.CSSProperties }> = ({ src, from, style }) => {
  const { fps } = useVideoConfig();
  return <OffthreadVideo src={staticFile(src)} startFrom={Math.round(from * fps)} muted style={{ width: "100%", height: "100%", objectFit: "cover", ...style }} />;
};

const Beat: React.FC<{ it: ToolBeat; len: number }> = ({ it, len }) => {
  const f = useCurrentFrame();
  const b = useBrand();
  const from = it.from ?? 0;
  const wordIn = seg(f, 0, 7, E.out);
  let body: React.ReactNode;
  if (it.effect === "upscale") {
    const line = seg(f, 3, len - 6, E.inOut);
    body = (
      <>
        <Vid src={it.src} from={from} />
        <AbsoluteFill style={{ clipPath: `inset(0 0 0 ${line * 100}%)` }}>
          <Vid src={it.src} from={from} style={{ filter: "blur(9px) saturate(0.7) brightness(0.9)", transform: "scale(1.04)" }} />
        </AbsoluteFill>
        <div style={{ position: "absolute", top: 0, bottom: 0, left: `${line * 100}%`, width: 4, background: "#fff", boxShadow: `0 0 30px 6px ${b.accent}`, opacity: line > 0 && line < 1 ? 1 : 0 }} />
      </>
    );
  } else if (it.effect === "expand") {
    const e = seg(f, 3, len * 0.55, E.inOut);
    const inset = mix(26, 0, e);
    body = (
      <>
        <AbsoluteFill style={{ filter: `blur(${mix(24, 0, e)}px) brightness(${mix(0.35, 1, e)})` }}>
          <Vid src={it.src} from={from} />
        </AbsoluteFill>
        <AbsoluteFill style={{ clipPath: `inset(${inset}% ${inset * 1.2}% round ${mix(18, 0, e)}px)` }}>
          <Vid src={it.src} from={from} />
        </AbsoluteFill>
        <div style={{ position: "absolute", inset: `${inset}% ${inset * 1.2}%`, borderRadius: mix(18, 0, e), border: "3px dashed #fff", opacity: 1 - e }} />
      </>
    );
  } else if (it.effect === "consistent") {
    body = (
      <AbsoluteFill style={{ flexDirection: "row", gap: 10, background: "#0E0E0E", padding: "70px 40px 260px", boxSizing: "border-box" }}>
        {[0, 1, 2].map((k) => {
          const p = seg(f, k * 3, 10, E.out);
          return (
            <div key={k} style={{ flex: 1, borderRadius: 18, overflow: "hidden", position: "relative", opacity: p, transform: `translateY(${(1 - p) * 60}px)` }}>
              <Vid src={it.src} from={from + k * 3.2} />
              <div style={{ position: "absolute", left: 16, top: 14, padding: "6px 14px", borderRadius: 999, background: "rgba(0,0,0,0.5)", color: "#fff", fontFamily: V.body, fontWeight: 600, fontSize: 18 }}>Shot {k + 1}</div>
            </div>
          );
        })}
      </AbsoluteFill>
    );
  } else {
    const whip = seg(f, 8, 6, E.inOut);
    const second = f >= 11;
    body = (
      <AbsoluteFill style={{ transform: `translateX(${Math.sin(whip * Math.PI) * -240}px)`, filter: `blur(${Math.sin(whip * Math.PI) * 18}px)` }}>
        <Vid src={it.src} from={second ? from + 4 : from} style={{ transform: second ? "scale(1.25) translateX(-6%)" : undefined }} />
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      {body}
      <AbsoluteFill style={{ background: "linear-gradient(transparent 60%, rgba(0,0,0,0.6))" }} />
      <div style={{ position: "absolute", left: 100, bottom: 100, overflow: "hidden", paddingBottom: 8 }}>
        <div style={{ fontFamily: V.display, fontWeight: 800, fontSize: 104, letterSpacing: "-0.03em", color: "#fff", transform: `translateY(${(1 - wordIn) * 105}%)` }}>{it.word}</div>
      </div>
      {it.badge && (
        <div style={{ position: "absolute", right: 90, bottom: 124, padding: "12px 22px", borderRadius: 12, background: b.accent, color: "#fff", fontFamily: V.body, fontWeight: 800, fontSize: 30, opacity: clamp01(seg(f, 10, 8) * 2), transform: `scale(${mix(0.6, 1, seg(f, 10, 12, E.back))})` }}>
          {it.badge}
        </div>
      )}
    </AbsoluteFill>
  );
};

/** One editing tool per `beatsEach` beats, each demonstrated on footage with its own effect. */
export const ToolBeats: React.FC<{ items: ToolBeat[]; beat: number; beatsEach?: number }> = ({ items, beat, beatsEach = 2 }) => {
  const len = Math.round(beat * beatsEach);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {items.map((it, i) => (
        <Sequence key={i} from={i * len} durationInFrames={len} layout="none">
          <Beat it={it} len={len} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
