import React from "react";
import { AbsoluteFill, continueRender, delayRender, staticFile } from "remotion";
import { clamp01, mix } from "./motion";

/**
 * Music-driven visuals. Features come from scripts/audio_features.py (public/music/features.json),
 * so every frame reads fixed numbers — no Web Audio at render time, fully deterministic.
 */
export type AudioFeatures = { fps: number; frames: number; bass: number[]; mid: number[]; high: number[]; level: number[]; onsets: number[]; spec: number[][] };
export type Band = "bass" | "mid" | "high" | "level";

/** Load once per render tab; delayRender lives in the component, never at module level. */
export const useAudioFeatures = (src = "music/features.json") => {
  const [data, setData] = React.useState<AudioFeatures | null>(null);
  const [handle] = React.useState(() => delayRender(`audio-features ${src}`, { timeoutInMilliseconds: 60000 }));
  React.useEffect(() => {
    fetch(staticFile(src))
      .then((r) => r.json())
      .then((d: AudioFeatures) => setData(d))
      .catch(() => undefined)
      .finally(() => continueRender(handle));
  }, [handle, src]);
  return data;
};
export const AudioCtx = React.createContext<AudioFeatures | null>(null);
/** Put this once near the root: <AudioProvider>…</AudioProvider>, then read with useAudio(). */
export const AudioProvider: React.FC<{ src?: string; children: React.ReactNode }> = ({ src, children }) => <AudioCtx.Provider value={useAudioFeatures(src)}>{children}</AudioCtx.Provider>;
export const useAudio = () => React.useContext(AudioCtx);

/** `f` is the absolute film frame (pass sequence offset if you are inside a <Sequence>). */
export const band = (d: AudioFeatures | null, b: Band, f: number) => (d ? d[b][Math.max(0, Math.min(d.frames - 1, Math.round(f)))] ?? 0 : 0);
export const specAt = (d: AudioFeatures | null, f: number): number[] => (d ? d.spec[Math.max(0, Math.min(d.frames - 1, Math.round(f)))] : Array(24).fill(0));
/** 1 right on a kick, decaying with time constant tau frames. */
export const kick = (d: AudioFeatures | null, f: number, tau = 4) => {
  if (!d) return 0;
  let last = -1e9;
  for (const o of d.onsets) {
    if (o > f) break;
    last = o;
  }
  return f >= last ? Math.exp(-(f - last) / tau) : 0;
};
/** Index of the current kick (how many kicks have happened) — handy for "change something every hit". */
export const kickIndex = (d: AudioFeatures | null, f: number) => (d ? d.onsets.filter((o) => o <= f).length : 0);

/* ── ready-made reactive pieces ── */

/** Spectrum as bars, mirrored bars or a ring. */
export const Spectrum: React.FC<{ f: number; mode?: "bars" | "mirror" | "ring"; width?: number; height?: number; bars?: number; color?: string; accent?: string; radius?: number; gap?: number }> = ({ f, mode = "bars", width = 1200, height = 260, bars = 48, color = "#fff", accent, radius = 220, gap = 6 }) => {
  const d = useAudio();
  const s = specAt(d, f);
  const val = (i: number) => {
    const x = (i / (bars - 1)) * (s.length - 1);
    const a = Math.floor(x);
    return mix(s[a] ?? 0, s[Math.min(s.length - 1, a + 1)] ?? 0, x - a);
  };
  if (mode === "ring") {
    const n = bars;
    return (
      <svg width={radius * 2 + height * 2} height={radius * 2 + height * 2} viewBox={`${-radius - height} ${-radius - height} ${(radius + height) * 2} ${(radius + height) * 2}`} style={{ overflow: "visible" }}>
        {Array.from({ length: n }, (_, i) => {
          const v = val(i < n / 2 ? i * 2 : (n - 1 - i) * 2);
          const a = (i / n) * Math.PI * 2 - Math.PI / 2;
          const l = 6 + v * height;
          return <line key={i} x1={Math.cos(a) * radius} y1={Math.sin(a) * radius} x2={Math.cos(a) * (radius + l)} y2={Math.sin(a) * (radius + l)} stroke={accent && v > 0.7 ? accent : color} strokeWidth={(Math.PI * 2 * radius) / n - gap / 2} strokeLinecap="round" />;
        })}
      </svg>
    );
  }
  const bw = (width - gap * (bars - 1)) / bars;
  return (
    <div style={{ width, height, display: "flex", alignItems: mode === "mirror" ? "center" : "flex-end", gap }}>
      {Array.from({ length: bars }, (_, i) => {
        const v = val(i);
        return <div key={i} style={{ width: bw, height: Math.max(4, v * height), borderRadius: bw / 2, background: accent && v > 0.75 ? accent : color }} />;
      })}
    </div>
  );
};

/** Scale + glow children on the bass; `amount` is the extra scale at full bass. */
export const BassPulse: React.FC<{ f: number; amount?: number; glow?: string; children: React.ReactNode }> = ({ f, amount = 0.06, glow, children }) => {
  const d = useAudio();
  const b = band(d, "bass", f);
  const k = kick(d, f, 5);
  return <div style={{ transform: `scale(${1 + b * amount * 0.5 + k * amount})`, filter: glow ? `drop-shadow(0 0 ${10 + k * 40}px ${glow})` : undefined }}>{children}</div>;
};

/** Camera kick: small shake + zoom punch on each onset. */
export const BeatCam: React.FC<{ f: number; shake?: number; punch?: number; children: React.ReactNode }> = ({ f, shake = 10, punch = 0.03, children }) => {
  const d = useAudio();
  const k = kick(d, f, 3);
  const i = kickIndex(d, f);
  const dx = Math.sin(i * 12.9898) * shake * k;
  const dy = Math.cos(i * 78.233) * shake * k * 0.6;
  return <AbsoluteFill style={{ transform: `translate(${dx}px, ${dy}px) scale(${1 + punch * k})` }}>{children}</AbsoluteFill>;
};

/** A flash layer that fires on kicks (use sparingly: every 2nd or 4th hit via `every`). */
export const KickFlash: React.FC<{ f: number; color?: string; max?: number; every?: number }> = ({ f, color = "#fff", max = 0.35, every = 1 }) => {
  const d = useAudio();
  const i = kickIndex(d, f);
  const k = i % every === 0 ? kick(d, f, 2) : 0;
  return <AbsoluteFill style={{ background: color, opacity: k * max, pointerEvents: "none", mixBlendMode: "screen" }} />;
};

/** Type whose letters stretch with their own spectrum band — the "lyric video" look. */
export const ReactiveType: React.FC<{ f: number; text: string; size?: number; color?: string; font?: string; weight?: number; stretch?: number; lift?: number }> = ({ f, text, size = 200, color = "#fff", font = '"SF Pro Display", "PingFang SC", sans-serif', weight = 900, stretch = 0.35, lift = 18 }) => {
  const d = useAudio();
  const s = specAt(d, f);
  const chars = Array.from(text);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", fontFamily: font, fontWeight: weight, fontSize: size, color, lineHeight: 1, letterSpacing: "-0.03em" }}>
      {chars.map((c, i) => {
        const v = s[Math.floor((i / Math.max(1, chars.length - 1)) * 20) + 2] ?? 0;
        return (
          <span key={i} style={{ display: "inline-block", transform: `translateY(${-v * lift}px) scaleY(${1 + clamp01(v) * stretch})`, transformOrigin: "50% 100%", whiteSpace: "pre" }}>
            {c}
          </span>
        );
      })}
    </div>
  );
};

/** Radial "speaker cone" rings that emit on kicks. */
export const KickRings: React.FC<{ f: number; x?: number; y?: number; color?: string; max?: number; life?: number }> = ({ f, x = 960, y = 540, color = "255,255,255", max = 900, life = 22 }) => {
  const d = useAudio();
  if (!d) return null;
  const live = d.onsets.filter((o) => o <= f && f - o < life);
  return (
    <>
      {live.map((o) => {
        const u = (f - o) / life;
        const r = 80 + (1 - Math.pow(1 - u, 3)) * max;
        return <div key={o} style={{ position: "absolute", left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: "50%", border: `3px solid rgba(${color},${(1 - u) * 0.6})`, pointerEvents: "none" }} />;
      })}
    </>
  );
};

/**
 * Accent camera: a small push only on the hand-picked key frames in `hits` (absolute film frames),
 * e.g. the logo landing or a chapter flip. Everywhere else the camera is locked.
 * Prefer this over BeatCam — a camera that moves on every kick reads as a shaking background.
 */
export const HitCam: React.FC<{ f: number; hits: number[]; shake?: number; punch?: number; tau?: number; children: React.ReactNode }> = ({ f, hits, shake = 5, punch = 0.02, tau = 4, children }) => {
  let k = 0;
  let seed = 0;
  for (const h of hits) {
    if (f >= h && f - h < tau * 5) {
      const v = Math.exp(-(f - h) / tau);
      if (v > k) {
        k = v;
        seed = h;
      }
    }
  }
  const dx = Math.sin(seed * 12.9898) * shake * k;
  const dy = Math.cos(seed * 78.233) * shake * k * 0.6;
  return <AbsoluteFill style={{ transform: k > 0.001 ? `translate(${dx}px, ${dy}px) scale(${1 + punch * k})` : undefined }}>{children}</AbsoluteFill>;
};
