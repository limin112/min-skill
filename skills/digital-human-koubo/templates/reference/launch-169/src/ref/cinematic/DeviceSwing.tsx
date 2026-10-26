import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { V } from "./brand";
import { E, mix, seg, track } from "./motion";

const SERIF = V.display;
const SANS = V.body;

/** A product image swings in through 3D space (with reflection) beside a two-line headline. */
export const DeviceSwing: React.FC<{ image: string; title: string; body: string }> = ({ image, title, body }) => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const cam = track(f, [
    { f: 0, ry: -38, rx: 14, z: -600, x: 260 },
    { f: 34, ry: -14, rx: 4, z: 0, x: 0, ease: E.out },
    { f: durationInFrames, ry: -6, rx: 2, z: 80, x: -20, ease: E.sine },
  ]);
  const fade = seg(f, 0, 8, E.linear) * (1 - seg(f, durationInFrames - 6, 6, E.linear));
  const lines = title.split("\n");
  const img = (
    <Img src={staticFile(image)} style={{ width: 1000, display: "block" }} />
  );
  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse 70% 60% at 60% 45%, #FFFFFF 0%, #F3F3F3 55%, #E4E4E4 100%)", opacity: fade }}>
      <AbsoluteFill style={{ perspective: 1800 }}>
        <div
          style={{
            position: "absolute",
            left: 800,
            top: 190,
            transformStyle: "preserve-3d",
            transform: `translateX(${cam.x}px) translateZ(${cam.z}px) rotateY(${cam.ry}deg) rotateX(${cam.rx}deg)`,
          }}
        >
          <div style={{ filter: "drop-shadow(0 40px 60px rgba(0,0,0,0.18))" }}>{img}</div>
          <div
            style={{
              transform: "scaleY(-1)",
              opacity: 0.12,
              marginTop: 8,
              maskImage: "linear-gradient(to top, black 0%, transparent 35%)",
              WebkitMaskImage: "linear-gradient(to top, black 0%, transparent 35%)",
            }}
          >
            {img}
          </div>
        </div>
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 120, top: 380, width: 700 }}>
        {lines.map((l, i) => {
          const p = seg(f, 10 + i * 5, 18, E.out);
          return (
            <div key={i} style={{ overflow: "hidden", paddingBottom: 8 }}>
              <div style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 80, lineHeight: 1.08, letterSpacing: "-0.03em", color: "#141414", transform: `translateY(${(1 - p) * 110}%)` }}>
                {l}
              </div>
            </div>
          );
        })}
        <div style={{ marginTop: 26, fontFamily: SANS, fontSize: 30, lineHeight: 1.5, color: "rgba(0,0,0,0.6)", opacity: seg(f, 24, 14), transform: `translateY(${(1 - seg(f, 24, 18)) * 16}px)` }}>
          {body}
        </div>
      </div>
      <div style={{ position: "absolute", inset: 0, background: "#141414", opacity: mix(0.8, 0, seg(f, 0, 10, E.linear)) }} />
    </AbsoluteFill>
  );
};
