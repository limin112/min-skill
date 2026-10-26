// 包装组件库 · 公共底座：时间、缓动、字体、配色、音效。所有组件只依赖这里 + remotion。
// 约定：组件的 at / dur 都用「秒」，相对它所在的 <Sequence>（或整片）起点；内部用 useCurrentFrame() 换算。
import React from "react";
import { Audio, Easing, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

export const FPS = 30;
export const F = (s: number) => Math.round(s * FPS);
export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const ease = { out: Easing.out(Easing.cubic), inOut: Easing.inOut(Easing.cubic), back: Easing.out(Easing.back(1.6)), expo: Easing.out(Easing.exp) };

export const FONT = {
  zh: '"PingFang SC","Hiragino Sans GB",sans-serif',
  en: '"Avenir Next","Helvetica Neue",Arial,sans-serif',
  intl: '"PingFang SC","Hiragino Sans","Apple SD Gothic Neo","Geeza Pro",sans-serif',
  mono: '"SF Mono",Menlo,monospace',
  serif: '"Songti SC","Times New Roman",serif',
};
export const C = {
  ink: "#16161A", paper: "#F3EEE4", white: "#FFFFFF", yellow: "#FFE14D", orange: "#FF7A1A", red: "#FF3B3B", green: "#2BD67B",
  blue: "#3B82F6", cyan: "#3EE6FF", pink: "#FF5A8A", purple: "#A78BFA", mute: "#8A877F", hl: "rgba(255,225,77,.72)",
};

/** 秒 → 当前组件内的进度工具 */
export const useT = () => {
  const f = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  return { f, t: f / fps, fps, W: width, H: height, D: durationInFrames / fps };
};
export const sp = (f: number, at: number, damping = 13, stiffness = 170, mass = 0.7) => spring({ frame: f - F(at), fps: FPS, config: { damping, stiffness, mass } });
/** 窗口：at 淡入，until 淡出（d 帧） */
export const win = (f: number, a: number, b: number, d = 5) => interpolate(f, [F(a), F(a) + d, F(b) - d, F(b)], [0, 1, 1, 0], clamp);
export const lerp = (f: number, a: number, b: number, from: number, to: number, e = ease.out) => interpolate(f, [F(a), F(b)], [from, to], { ...clamp, easing: e });
/** 描边（16 向 text-shadow，比 -webkit-text-stroke 稳） */
export const stroke = (px: number, c = "#111") => Array.from({ length: 16 }, (_, a) => `${(Math.cos((a / 16) * Math.PI * 2) * px).toFixed(1)}px ${(Math.sin((a / 16) * Math.PI * 2) * px).toFixed(1)}px 0 ${c}`).join(",");
export const isLatin = (s: string) => /^[\x00-\x7F]+$/.test(s);

/** 一次性音效：在 at 秒处放 sfx/<name>.wav */
export const Sfx: React.FC<{ at: number; name: string; vol?: number }> = ({ at, name, vol = 0.5 }) => (
  <Sequence from={Math.max(0, F(at))} durationInFrames={F(2.5)} layout="none"><Audio src={staticFile(`sfx/${name}.wav`)} volume={vol} /></Sequence>
);
