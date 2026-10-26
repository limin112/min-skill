import React from "react";
import { AbsoluteFill, Img, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { useBrand, V } from "./brand";
import type { Cue } from "./sfx";
import { E, clamp01, mix, seg } from "./motion";

export type TemplateCard = { src: string; from?: number; title: string };

const CARD_W = 400;
const CARD_H = 710;
const SLIDE_END = 64;
const CLICK = 86;
const DROP = 112;

export const TEMPLATE_WALL_FRAMES = 150;

export const templateWallCues = (offset: number): Cue[] => [
  { at: offset, name: "swish-2", volume: 0.45 },
  { at: offset + 22, name: "swish-1", volume: 0.3 },
  { at: offset + 44, name: "swish-3", volume: 0.3 },
  { at: offset + CLICK, name: "click", volume: 0.85 },
  { at: offset + CLICK + 3, name: "swish-2", volume: 0.35 },
  { at: offset + DROP, name: "paper-place-1", volume: 0.5 },
  { at: offset + DROP + 8, name: "done", volume: 0.45 },
];

/**
 * Coverflow of vertical template videos; the camera settles on one, the cursor clicks
 * "Make your own" and an upload sheet takes a character photo. 150 frames.
 */
export const TemplateWall: React.FC<{
  templates: TemplateCard[];
  center: number;
  title: string;
  subtitle: string;
  cta: string;
  upload: { img: string; name: string; hint: string };
}> = ({ templates, center, title, subtitle, cta, upload }) => {
  const f = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const b = useBrand();
  const pos = mix(Math.max(0, center - 2), center, seg(f, 0, SLIDE_END, E.inOut));
  const sheet = seg(f, CLICK + 2, 12, E.out);
  const drop = seg(f, DROP - 14, 14, E.inOut);
  const cursorP = seg(f, CLICK - 14, 12, E.inOut);
  const fade = seg(f, 0, 6, E.linear) * (1 - seg(f, durationInFrames - 6, 6, E.linear));
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 55%, #3a1d14, #0E0E0E 70%)`, opacity: fade, perspective: 1600, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 100, top: 90, zIndex: 5 }}>
        <div style={{ fontFamily: V.display, fontWeight: 800, fontSize: 78, letterSpacing: "-0.03em", color: "#fff", opacity: seg(f, 4, 10), transform: `translateY(${(1 - seg(f, 4, 16, E.out)) * 24}px)` }}>{title}</div>
        <div style={{ marginTop: 14, fontFamily: V.body, fontSize: 32, color: "rgba(255,255,255,0.7)", opacity: seg(f, 14, 10) }}>{subtitle}</div>
      </div>
      <div style={{ position: "absolute", left: width / 2, top: height / 2 + 60, transformStyle: "preserve-3d" }}>
        {templates.map((tp, i) => {
          const d = i - pos;
          const ad = Math.abs(d);
          const isCenter = i === center && ad < 0.3;
          return (
            <div
              key={tp.title}
              style={{
                position: "absolute",
                left: -CARD_W / 2,
                top: -CARD_H / 2,
                width: CARD_W,
                height: CARD_H,
                borderRadius: 26,
                overflow: "hidden",
                background: "#111",
                boxShadow: isCenter ? `0 0 0 3px ${b.accent}, 0 40px 90px rgba(0,0,0,0.6)` : "0 30px 70px rgba(0,0,0,0.5)",
                transform: `translateX(${d * 420}px) translateZ(${-ad * 260}px) rotateY(${clamp01(ad) * -Math.sign(d) * 38}deg) scale(${ad < 1 ? mix(1.08, 0.92, ad) : 0.92})`,
                opacity: ad > 2.6 ? 0 : 1 - Math.max(0, ad - 1.6),
                zIndex: 10 - Math.round(ad * 2),
              }}
            >
              <OffthreadVideo src={staticFile(tp.src)} startFrom={Math.round((tp.from ?? 0) * fps)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 200, background: "linear-gradient(transparent, rgba(0,0,0,0.75))" }} />
              <div style={{ position: "absolute", left: 24, bottom: 86, fontFamily: V.body, fontWeight: 700, fontSize: 28, color: "#fff" }}>{tp.title}</div>
              <div
                style={{
                  position: "absolute",
                  left: 24,
                  bottom: 26,
                  padding: "10px 22px",
                  borderRadius: 999,
                  background: i === center ? b.accent : "rgba(255,255,255,0.2)",
                  fontFamily: V.body,
                  fontWeight: 700,
                  fontSize: 20,
                  color: "#fff",
                  transform: `scale(${i === center && f >= CLICK && f < CLICK + 4 ? 0.9 : 1})`,
                }}
              >
                {cta}
              </div>
              {i === center && sheet > 0 && (
                <div style={{ position: "absolute", left: 16, right: 16, bottom: 16, height: 330, borderRadius: 20, background: "#fff", transform: `translateY(${(1 - sheet) * 360}px)`, padding: 22, boxSizing: "border-box", fontFamily: V.body }}>
                  <div style={{ fontWeight: 700, fontSize: 22, color: "#2B2B2B" }}>{upload.hint}</div>
                  <div style={{ marginTop: 16, height: 200, borderRadius: 14, border: `2px dashed ${f >= DROP ? b.accent : "#D4D4D4"}`, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", background: f >= DROP ? `color-mix(in srgb, ${b.accent} 6%, white)` : "#FAFAFA" }}>
                    {f < DROP - 14 && <div style={{ color: "#999", fontSize: 18 }}>Drop an image</div>}
                    {f >= DROP - 14 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 14, transform: `translate(${(1 - drop) * 260}px, ${(1 - drop) * -180}px) rotate(${(1 - drop) * 12}deg)` }}>
                        <Img src={staticFile(upload.img)} style={{ width: 130, height: 150, objectFit: "cover", objectPosition: "50% 22%", borderRadius: 12, boxShadow: "0 10px 24px rgba(0,0,0,0.2)" }} />
                        <div style={{ fontSize: 16, color: "#2B2B2B", opacity: seg(f, DROP, 8) }}>
                          {upload.name}
                          <div style={{ marginTop: 6, color: "#16A34A", fontWeight: 700 }}>✓ Ready</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {f > CLICK - 14 && f < CLICK + 16 && (
        <svg width={34} height={40} viewBox="0 0 34 40" style={{ position: "absolute", left: mix(width / 2 + 420, width / 2 - CARD_W / 2 + 90, cursorP), top: mix(height - 60, height / 2 + 60 + CARD_H / 2 - 50, cursorP), filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.4))", zIndex: 30 }}>
          <path d="M2 2 L2 32 L10 25 L16 38 L21 36 L15 23 L26 23 Z" fill="#111" stroke="#fff" strokeWidth={2.2} strokeLinejoin="round" />
        </svg>
      )}
    </AbsoluteFill>
  );
};
