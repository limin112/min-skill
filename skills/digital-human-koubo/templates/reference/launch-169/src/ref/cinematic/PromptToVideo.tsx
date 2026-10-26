import React from "react";
import { AbsoluteFill, Img, OffthreadVideo, random, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { LucideIcon } from "lucide-react";
import { useBrand, V } from "./brand";
import { keyCues, type Cue } from "./sfx";
import { E, clamp01, mix, seg, track, typed, typingSchedule } from "./motion";

export type PromptToVideoProps = {
  prompt: string;
  placeholder: string;
  models: { name: string; tag?: string }[];
  /** Index in `models` that gets picked; the chip starts on `startModel`. */
  pick: number;
  startModel: string;
  heroVideo: { src: string; from?: number };
  result: { src: string; from?: number; label: string };
  nav: { label: string; icon: LucideIcon }[];
  tools: { label: string; icon: LucideIcon }[];
  scenarios: { title: string; img: string }[];
  /** Square app icon shown next to the wordmark in the sidebar. */
  mark?: string;
};

const CARD = { x: 180, y: 86, w: 1560, h: 640 };
const COMPOSER = { x: 540, y: 612, w: 840, h: 80 };
const CHIP = { x: 1112, y: 628, w: 210, h: 48 };
const SEND = { x: 1330, y: 628, w: 48, h: 48 };
const MENU = { x: 1062, w: 300, item: 54 };
const TYPE_AT = 22;
const PER_CHAR = 0.85;

export const promptTimeline = (p: PromptToVideoProps) => {
  const t = typingSchedule(p.prompt, TYPE_AT, PER_CHAR, (i) => random(`pp-${i}`));
  const chipClick = Math.ceil(t.end) + 12;
  const pickClick = chipClick + 20;
  const send = pickClick + 18;
  const reveal = send + 42;
  const expand = reveal + 16;
  return { typing: t, chipClick, pickClick, send, reveal, expand, total: expand + 18 };
};

export const promptFrames = (p: PromptToVideoProps) => promptTimeline(p).total;

export const promptCues = (p: PromptToVideoProps, offset: number): Cue[] => {
  const t = promptTimeline(p);
  return [
    { at: offset, name: "swish-1", volume: 0.4 },
    ...keyCues(p.prompt, t.typing.times, offset, 0.45),
    { at: offset + t.chipClick, name: "click", volume: 0.8 },
    { at: offset + t.chipClick + 2, name: "pop", volume: 0.35 },
    { at: offset + t.pickClick, name: "click", volume: 0.8 },
    { at: offset + t.send, name: "click", volume: 0.9 },
    { at: offset + t.send + 4, name: "processing", volume: 0.12 },
    { at: offset + t.reveal, name: "ding", volume: 0.35 },
    { at: offset + t.expand, name: "whoosh", volume: 0.6 },
  ];
};

const Cursor: React.FC<{ x: number; y: number; down: boolean }> = ({ x, y, down }) => (
  <svg width={34} height={40} viewBox="0 0 34 40" style={{ position: "absolute", left: x, top: y, transform: `scale(${down ? 0.86 : 1})`, transformOrigin: "0 0", filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.35))", zIndex: 20 }}>
    <path d="M2 2 L2 32 L10 25 L16 38 L21 36 L15 23 L26 23 Z" fill="#111" stroke="#fff" strokeWidth={2.2} strokeLinejoin="round" />
  </svg>
);

const Ripple: React.FC<{ x: number; y: number; f: number; at: number; color: string }> = ({ x, y, f, at, color }) => {
  const p = seg(f, at, 14, E.out);
  if (f < at || p >= 1) return null;
  return <div style={{ position: "absolute", left: x - 40 * p, top: y - 40 * p, width: 80 * p, height: 80 * p, borderRadius: "50%", border: `3px solid ${color}`, opacity: 1 - p, zIndex: 19 }} />;
};

/** Cubic path through waypoints: [frame, x, y][] */
const cursorAt = (f: number, pts: [number, number, number][]) => {
  if (f <= pts[0][0]) return { x: pts[0][1], y: pts[0][2] };
  for (let i = 0; i < pts.length - 1; i++) {
    const [f0, x0, y0] = pts[i];
    const [f1, x1, y1] = pts[i + 1];
    if (f < f1) {
      const t = E.inOut((f - f0) / (f1 - f0));
      const arc = Math.sin(t * Math.PI) * 40;
      return { x: mix(x0, x1, t), y: mix(y0, y1, t) - arc };
    }
  }
  const l = pts[pts.length - 1];
  return { x: l[1], y: l[2] };
};


/**
 * AI generation app replica: prompt typed into the composer, model picked from a dropdown,
 * generate clicked, progress shown, result video revealed in the hero card, which then
 * expands to full screen. Length = promptFrames(props).
 */
export const PromptToVideo: React.FC<PromptToVideoProps> = (p) => {
  const f = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const b = useBrand();
  const t = promptTimeline(p);
  const menuOpen = seg(f, t.chipClick, 8, E.out) * (1 - seg(f, t.pickClick + 2, 7, E.in));
  const model = f >= t.pickClick ? p.models[p.pick].name : p.startModel;
  const gen = seg(f, t.send + 4, 10, E.out);
  const progress = clamp01((f - t.send - 6) / (t.reveal - t.send - 8));
  const reveal = seg(f, t.reveal, 14, E.inOut);
  const expand = seg(f, t.expand, 16, E.inOut);
  const menuY = COMPOSER.y - 18 - p.models.length * MENU.item;

  const cam = track(f, [
    { f: 0, s: 0.9, fx: 960, fy: 560, rx: 10 },
    { f: 20, s: 1.5, fx: 960, fy: 640, rx: 0, ease: E.out },
    { f: t.chipClick - 4, s: 1.5, fx: 1010, fy: 640, rx: 0 },
    { f: t.chipClick + 8, s: 1.38, fx: 1110, fy: 520, rx: 0 },
    { f: t.pickClick + 8, s: 1.38, fx: 1110, fy: 560, rx: 0 },
    { f: t.send + 14, s: 1.12, fx: 860, fy: 500, rx: 0 },
    { f: t.expand, s: 1.12, fx: 870, fy: 490, rx: 0 },
    { f: t.expand + 16, s: width / CARD.w, fx: CARD.x + CARD.w / 2, fy: CARD.y + CARD.h / 2, rx: 0 },
  ]);
  const cur = cursorAt(f, [
    [t.chipClick - 16, 1500, 900],
    [t.chipClick - 2, CHIP.x + 110, CHIP.y + 26],
    [t.pickClick - 10, CHIP.x + 110, CHIP.y + 26],
    [t.pickClick - 2, MENU.x + 120, menuY + p.pick * MENU.item + 26],
    [t.send - 10, MENU.x + 120, menuY + p.pick * MENU.item + 26],
    [t.send - 2, SEND.x + 22, SEND.y + 24],
  ]);
  const showCursor = f > t.chipClick - 16 && f < t.send + 12;
  const down = [t.chipClick, t.pickClick, t.send].some((c) => f >= c && f < c + 4);
  const typedText = typed(p.prompt, t.typing.times, f);
  const sent = seg(f, t.send, 8, E.in);

  return (
    <AbsoluteFill style={{ background: "#F4F4F4", overflow: "hidden", perspective: 2000 }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 1920,
          height: 1080,
          transformOrigin: "0 0",
          transform: `translate(${width / 2 - cam.fx * cam.s}px, ${height / 2 - cam.fy * cam.s}px) scale(${cam.s}) rotateX(${cam.rx}deg)`,
          background: "#FFFFFF",
          fontFamily: V.body,
          color: "#2B2B2B",
        }}
      >
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 150, borderRight: "1px solid #EEE", padding: "18px 14px", boxSizing: "border-box" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {p.mark && <Img src={staticFile(p.mark)} style={{ width: 26, height: 26 }} />}
            {b.wordmark && <Img src={staticFile(b.wordmark)} style={{ height: 15 }} />}
          </div>
          <div style={{ marginTop: 26, display: "flex", flexDirection: "column", gap: 20 }}>
            {p.nav.map(({ label, icon: Icon }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 15, fontWeight: 500 }}>
                <Icon size={19} strokeWidth={1.75} color="#2B2B2B" />
                {label}
              </div>
            ))}
          </div>
        </div>
        <div style={{ position: "absolute", left: CARD.x, top: CARD.y, width: CARD.w, height: CARD.h, borderRadius: mix(22, 0, expand), overflow: "hidden", background: "#111" }}>
          <AbsoluteFill style={{ filter: `blur(${gen * (1 - reveal) * 18}px) brightness(${mix(1, 0.5, gen * (1 - reveal))})` }}>
            <OffthreadVideo src={staticFile(p.heroVideo.src)} startFrom={Math.round((p.heroVideo.from ?? 0) * fps)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </AbsoluteFill>
          {f >= t.send && (
            <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: gen * (1 - reveal) }}>
              <svg width={130} height={130} viewBox="0 0 130 130">
                <circle cx={65} cy={65} r={56} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={8} />
                <circle cx={65} cy={65} r={56} fill="none" style={{ stroke: b.accent }} strokeWidth={8} strokeLinecap="round" strokeDasharray={`${progress * 352} 352`} transform="rotate(-90 65 65)" />
              </svg>
              <div style={{ position: "absolute", fontSize: 30, fontWeight: 700, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{Math.round(progress * 100)}%</div>
              <div style={{ marginTop: 26, fontSize: 22, color: "rgba(255,255,255,0.8)" }}>Generating · {model}</div>
            </AbsoluteFill>
          )}
          {f >= t.reveal && (
            <AbsoluteFill style={{ clipPath: `circle(${reveal * 120}% at 50% 50%)` }}>
              <OffthreadVideo src={staticFile(p.result.src)} startFrom={Math.round((p.result.from ?? 0) * fps)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <div style={{ position: "absolute", left: 28, top: 26, padding: "10px 18px", borderRadius: 999, background: "rgba(20,20,20,0.55)", color: "#fff", fontSize: 18, fontWeight: 600, opacity: seg(f, t.reveal + 6, 8) * (1 - expand), display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: b.accent }} />
                {p.result.label}
              </div>
            </AbsoluteFill>
          )}
          <div
            style={{
              position: "absolute",
              left: COMPOSER.x - CARD.x,
              top: COMPOSER.y - CARD.y,
              width: COMPOSER.w,
              height: COMPOSER.h,
              borderRadius: 999,
              background: "rgba(24,24,24,0.72)",
              backdropFilter: "blur(16px)",
              border: "1px solid rgba(255,255,255,0.14)",
              display: "flex",
              alignItems: "center",
              padding: "0 16px",
              boxSizing: "border-box",
              gap: 16,
              opacity: 1 - seg(f, t.send + 6, 10, E.in),
              transform: `translateY(${sent * 30}px)`,
            }}
          >
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(255,255,255,0.12)", color: "#fff", fontSize: 26, display: "flex", alignItems: "center", justifyContent: "center" }}>+</div>
            <div style={{ flex: 1, fontSize: 19, color: typedText ? "#fff" : "rgba(255,255,255,0.5)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "clip" }}>
              {typedText || p.placeholder}
              {f >= TYPE_AT && f < t.chipClick && <span style={{ display: "inline-block", width: 2, height: 22, marginLeft: 2, verticalAlign: "-4px", background: "#fff", opacity: Math.floor(f / 8) % 2 ? 0.2 : 1 }} />}
            </div>
            <div style={{ width: CHIP.w, height: CHIP.h, borderRadius: 999, background: "rgba(255,255,255,0.14)", color: "#fff", fontSize: 17, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transform: `scale(${f >= t.chipClick && f < t.chipClick + 4 ? 0.95 : 1})` }}>
              {model} <span style={{ opacity: 0.6 }}>▾</span>
            </div>
            <div style={{ width: SEND.w, height: SEND.h, borderRadius: "50%", background: b.accent, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 22, fontWeight: 700, transform: `scale(${f >= t.send && f < t.send + 4 ? 0.85 : 1})`, boxShadow: `0 0 ${f >= t.send ? 30 : 0}px ${b.accent}` }}>↑</div>
          </div>
        </div>
        <div style={{ position: "absolute", left: 1760, top: CARD.y, width: 300, height: CARD.h, borderRadius: 22, overflow: "hidden" }}>
          <Img src={staticFile(p.scenarios[3].img)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
        {menuOpen > 0.01 && (
          <div style={{ position: "absolute", left: MENU.x, top: menuY, width: MENU.w, borderRadius: 16, background: "#fff", boxShadow: "0 24px 60px rgba(0,0,0,0.25)", padding: 8, boxSizing: "border-box", opacity: menuOpen, transform: `translateY(${(1 - menuOpen) * 16}px) scale(${mix(0.96, 1, menuOpen)})`, transformOrigin: "bottom center", zIndex: 10 }}>
            {p.models.map((m, i) => {
              const hover = i === p.pick && f >= t.pickClick - 6;
              return (
                <div key={m.name} style={{ height: MENU.item - 6, display: "flex", alignItems: "center", gap: 12, padding: "0 12px", borderRadius: 10, marginBottom: 6, background: hover ? `color-mix(in srgb, ${b.accent} 12%, white)` : "transparent", fontSize: 17, fontWeight: 600 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: ["#111", "#3B82F6", "#8B5CF6", "#10B981", "#F59E0B", "#EC4899"][i % 6] }} />
                  <span style={{ flex: 1 }}>{m.name}</span>
                  {m.tag && <span style={{ fontSize: 12, color: b.accent, background: `color-mix(in srgb, ${b.accent} 12%, white)`, padding: "3px 8px", borderRadius: 6 }}>{m.tag}</span>}
                </div>
              );
            })}
          </div>
        )}
        <div style={{ position: "absolute", left: CARD.x, top: CARD.y + CARD.h + 20, display: "flex", gap: 14 }}>
          {p.tools.map(({ label, icon: Icon }) => (
            <div key={label} style={{ width: 180, height: 84, borderRadius: 14, background: "#F5F5F5", padding: 14, boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <Icon size={21} strokeWidth={1.75} color="#2B2B2B" />
              <div style={{ fontSize: 15, fontWeight: 600 }}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{ position: "absolute", left: CARD.x, top: CARD.y + CARD.h + 124, display: "flex", gap: 14 }}>
          {p.scenarios.map((s) => (
            <div key={s.title} style={{ width: 375, height: 230, borderRadius: 18, overflow: "hidden", position: "relative" }}>
              <Img src={staticFile(s.img)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <div style={{ position: "absolute", left: 18, top: 16, color: "#fff", fontSize: 22, fontWeight: 700, textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}>{s.title}</div>
            </div>
          ))}
        </div>
        {showCursor && <Cursor x={cur.x} y={cur.y} down={down} />}
        <Ripple x={CHIP.x + 110} y={CHIP.y + 24} f={f} at={t.chipClick} color={b.accent} />
        <Ripple x={MENU.x + 120} y={menuY + p.pick * MENU.item + 24} f={f} at={t.pickClick} color={b.accent} />
        <Ripple x={SEND.x + 24} y={SEND.y + 24} f={f} at={t.send} color={b.accent} />
      </div>
    </AbsoluteFill>
  );
};
