import React from "react";
import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from "remotion";
import { useBrand, V } from "./brand";
import { keyCues, type Cue } from "./sfx";
import { E, clamp01, mix, seg, track, typed, typingSchedule } from "./motion";

export type TerminalStep = { label: string; detail: string };
export type TerminalOutput = { title: string; kind: "cover" | "chart" | "bullets" };
export type TerminalDemoProps = {
  window: string;
  prompt: string;
  steps: TerminalStep[];
  result: string;
  outputs?: TerminalOutput[];
  caption?: string;
};

const MONO = "'SF Mono', Menlo, 'PingFang SC', monospace";
const TYPE_AT = 16;
const PER_CHAR = 1.1;
const STEP_GAP = 13;

export const terminalTimeline = (p: TerminalDemoProps) => {
  const t = typingSchedule(p.prompt, TYPE_AT, PER_CHAR, (i) => random(`tp-${i}`));
  const enter = t.end + 6;
  const steps = p.steps.map((_, i) => enter + 6 + i * STEP_GAP);
  const done = steps.map((s) => s + STEP_GAP - 3);
  const result = done[done.length - 1] + 6;
  const outputs = result + 10;
  return { typing: t, enter, steps, done, result, outputs, total: Math.ceil(outputs + 60) };
};

export const terminalFrames = (p: TerminalDemoProps) => terminalTimeline(p).total;

export const terminalCues = (p: TerminalDemoProps, offset: number): Cue[] => {
  const t = terminalTimeline(p);
  return [
    { at: offset, name: "swish-1", volume: 0.4 },
    ...keyCues(p.prompt, t.typing.times, offset, 0.5),
    { at: offset + t.enter, name: "key-space", volume: 0.8 },
    ...t.done.map((d) => ({ at: offset + d, name: "done", volume: 0.35 })),
    { at: offset + t.result, name: "pop", volume: 0.55 },
    ...(p.outputs ?? []).map((_, i) => ({ at: offset + t.outputs + i * 5, name: `swish-${(i % 3) + 1}`, volume: 0.35 })),
  ];
};

const Spinner: React.FC<{ f: number }> = ({ f }) => {
  const frames = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";
  return <span style={{ color: V.accent }}>{frames[Math.floor(f / 2) % frames.length]}</span>;
};

const MiniSlide: React.FC<{ o: TerminalOutput; i: number }> = ({ o, i }) => {
  const b = useBrand();
  const dark = o.kind === "cover";
  return (
    <div style={{ width: 400, height: 225, borderRadius: 12, background: dark ? b.ink : "#FFFFFF", padding: 26, boxSizing: "border-box", boxShadow: "0 30px 60px rgba(0,0,0,0.45)", fontFamily: V.body, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ fontSize: 11, letterSpacing: "0.12em", color: dark ? b.accent : "#94A3B8" }}>0{i + 1}</div>
      <div style={{ fontSize: dark ? 30 : 22, fontWeight: 700, color: dark ? "#F5F7FA" : "#0F172A", marginTop: 8, lineHeight: 1.2 }}>{o.title}</div>
      {o.kind === "chart" && (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 100, marginTop: 18 }}>
          {[0.4, 0.55, 0.5, 0.72, 0.9].map((h, k) => (
            <div key={k} style={{ flex: 1, height: `${h * 100}%`, borderRadius: 4, background: k === 4 ? b.accent : b.accent2, opacity: k === 4 ? 1 : 0.5 }} />
          ))}
        </div>
      )}
      {o.kind === "bullets" && (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {[0.9, 0.75, 0.82].map((w, k) => (
            <div key={k} style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: b.accent }} />
              <div style={{ height: 10, width: `${w * 100}%`, borderRadius: 5, background: "#E2E8F0" }} />
            </div>
          ))}
        </div>
      )}
      {o.kind === "cover" && <div style={{ marginTop: 30, width: 90, height: 6, borderRadius: 3, background: b.accent }} />}
    </div>
  );
};

/**
 * Coding-agent terminal: prompt typed, tool calls stream with spinners and ticks, result line,
 * then produced files fly out of the window. Length = terminalFrames(props).
 */
export const TerminalDemo: React.FC<TerminalDemoProps> = (p) => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const b = useBrand();
  const t = terminalTimeline(p);
  const outs = p.outputs ?? [];
  const cam = track(f, [
    { f: 0, s: 0.82, rx: 16, ry: -14, x: 0, y: 40 },
    { f: 18, s: 1.12, rx: 4, ry: -4, x: 120, y: 60, ease: E.out },
    { f: t.enter, s: 1.12, rx: 4, ry: -4, x: 120, y: 60 },
    { f: t.enter + 16, s: 1.02, rx: 3, ry: 3, x: 40, y: -20 },
    { f: t.result, s: 1, rx: 2, ry: 4, x: 30, y: -30 },
    { f: t.outputs + 12, s: 0.8, rx: 8, ry: 16, x: -240, y: 0 },
    { f: t.total, s: 0.76, rx: 8, ry: 20, x: -260, y: 0 },
  ]);
  const fade = seg(f, 0, 6, E.linear);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 30% 40%, ${b.accent}22, transparent 60%), ${b.ink}`, opacity: fade, perspective: 1600 }}>
      {p.caption && (
        <div style={{ position: "absolute", top: 70, width: "100%", textAlign: "center", fontFamily: V.body, fontWeight: 700, fontSize: 52, color: "#F5F7FA", opacity: seg(f, t.result, 10), transform: `translateY(${(1 - seg(f, t.result, 16, E.out)) * 24}px)` }}>
          {p.caption}
        </div>
      )}
      <div
        style={{
          position: "absolute",
          left: width / 2 - 560,
          top: height / 2 - 330,
          width: 1120,
          height: 660,
          transformStyle: "preserve-3d",
          transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.s}) rotateX(${cam.rx}deg) rotateY(${cam.ry}deg)`,
        }}
      >
        <div style={{ position: "absolute", inset: 0, borderRadius: 18, background: "#0D1117", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 50px 120px rgba(0,0,0,0.6)", overflow: "hidden" }}>
          <div style={{ height: 46, display: "flex", alignItems: "center", gap: 9, padding: "0 18px", background: "#161B22", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
              <div key={c} style={{ width: 13, height: 13, borderRadius: "50%", background: c }} />
            ))}
            <div style={{ flex: 1, textAlign: "center", fontFamily: MONO, fontSize: 15, color: "rgba(230,237,243,0.5)", marginRight: 60 }}>{p.window}</div>
          </div>
          <div style={{ padding: "26px 34px", fontFamily: MONO, fontSize: 22, lineHeight: 1.7, color: "#E6EDF3" }}>
            <div style={{ color: "rgba(230,237,243,0.45)" }}>
              <span style={{ color: b.accent }}>✻</span> Welcome to Claude Code
            </div>
            <div style={{ marginTop: 16, display: "flex", gap: 14 }}>
              <span style={{ color: b.accent }}>&gt;</span>
              <span style={{ whiteSpace: "pre-wrap" }}>
                {typed(p.prompt, t.typing.times, f)}
                {f < t.enter + 4 && <span style={{ display: "inline-block", width: 12, height: 24, marginLeft: 2, verticalAlign: "-4px", background: "#E6EDF3", opacity: Math.floor(f / 8) % 2 ? 0.2 : 0.9 }} />}
              </span>
            </div>
            <div style={{ marginTop: 18 }}>
              {p.steps.map((s, i) => {
                const at = t.steps[i];
                if (f < at) return null;
                const ok = f >= t.done[i];
                const inP = seg(f, at, 8, E.out);
                return (
                  <div key={s.label} style={{ display: "flex", gap: 14, opacity: inP, transform: `translateX(${(1 - inP) * 20}px)` }}>
                    <span style={{ width: 22 }}>{ok ? <span style={{ color: "#3FB950" }}>✓</span> : <Spinner f={f} />}</span>
                    <span style={{ color: "#79C0FF" }}>{s.label}</span>
                    <span style={{ color: "rgba(230,237,243,0.55)" }}>{s.detail}</span>
                  </div>
                );
              })}
            </div>
            {f >= t.result && (
              <div style={{ marginTop: 18, color: "#3FB950", opacity: seg(f, t.result, 8), fontWeight: 600 }}>
                ⏺ {p.result}
              </div>
            )}
          </div>
        </div>
        {outs.map((o, i) => {
          const p2 = seg(f, t.outputs + i * 5, 26, E.out);
          if (p2 <= 0) return null;
          const dx = mix(0, 820 + i * 90, p2);
          const dy = mix(0, -230 + i * 230, p2);
          const dz = mix(-40, 160 - i * 40, p2);
          return (
            <div
              key={o.title}
              style={{
                position: "absolute",
                left: 360,
                top: 220,
                opacity: clamp01(p2 * 3),
                transform: `translate3d(${dx}px, ${dy}px, ${dz}px) rotateY(${mix(0, -18, p2)}deg) rotateZ(${mix(0, (i - 1) * 3, p2)}deg) scale(${mix(0.4, 1, p2)})`,
              }}
            >
              <MiniSlide o={o} i={i} />
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
