import React from "react";
import { useLoader, useThree } from "@react-three/fiber";
import { Bloom, DepthOfField, EffectComposer, Vignette } from "@react-three/postprocessing";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import * as THREE from "three";
import { useBrand, V } from "./brand";
import { Particles } from "./Logo3D";
import { E, clamp01, mix, seg } from "./motion";

export type CarouselItem = { img: string; name: string; status: string };

const RADIUS = 3.2;
const SIZE = 1.9;
const CAM_DIST = 7.4;

const Card: React.FC<{ img: string; angle: number; front: number }> = ({ img, angle, front }) => {
  const tex = useLoader(THREE.TextureLoader, staticFile(img));
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = mix(0.78, 1.1, front);
  return (
    <group position={[Math.sin(angle) * RADIUS * 1.25, 0, Math.cos(angle) * RADIUS]} scale={s}>
      <mesh>
        <planeGeometry args={[SIZE, SIZE]} />
        <meshBasicMaterial map={tex} transparent toneMapped={false} opacity={mix(0.45, 1, front)} />
      </mesh>
    </group>
  );
};

const Rig: React.FC = () => {
  const { camera } = useThree();
  camera.position.set(0, 0.6, RADIUS + CAM_DIST);
  camera.lookAt(0, 0.05, 0);
  return null;
};

/** Ring of portraits/cards; each steps to the front every `step` frames. */
export const Carousel3D: React.FC<{ items: CarouselItem[]; step?: number; title: string }> = ({
  items,
  step = 20,
  title,
}) => {
  const f = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const b = useBrand();
  const n = items.length;
  const t = Math.max(0, f - 12) / step;
  const idx = Math.min(n - 1, Math.floor(t));
  const turn = idx >= n - 1 ? n - 1 : idx + E.inOut(clamp01((t - idx - 0.55) / 0.45));
  const ring = -turn * ((Math.PI * 2) / n);
  const enter = seg(f, 0, 24, E.out);
  const current = items[Math.min(n - 1, Math.round(turn))];
  const labelLocal = (f - 12) % step;
  const labelIn = f < 12 ? 0 : seg(labelLocal, 0, 8, E.out) * (idx < n - 1 ? 1 - seg(labelLocal, step - 7, 6, E.in) : 1);
  const fade = seg(f, 0, 6, E.linear) * (1 - seg(f, durationInFrames - 6, 6, E.linear));

  return (
    <AbsoluteFill style={{ background: b.ink, opacity: fade }}>
      <ThreeCanvas width={width} height={height} camera={{ position: [0, 0, 9], fov: 38 }}>
        <color attach="background" args={[b.ink]} />
        <Rig />
        <Particles drift={mix(0, 3, f / durationInFrames)} count={350} colors={[b.accent, b.accent2]} />
        <group position={[0, mix(-1.5, 0, enter), 0]}>
          {items.map((it, i) => {
            const world = (i / n) * Math.PI * 2 + ring + (1 - enter) * 1.4;
            const front = clamp01(Math.cos(world) * 1.4 - 0.4);
            return <Card key={it.img} img={it.img} angle={world} front={front} />;
          })}
        </group>
        <EffectComposer multisampling={4}>
          <DepthOfField worldFocusDistance={CAM_DIST} worldFocusRange={2.5} bokehScale={4} />
          <Bloom intensity={0.3} luminanceThreshold={0.9} mipmapBlur />
          <Vignette offset={0.3} darkness={0.8} />
        </EffectComposer>
      </ThreeCanvas>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 80 }}>
        <div
          style={{
            fontFamily: V.display,
            fontWeight: 500,
            fontSize: 70,
            letterSpacing: "-0.02em",
            color: "#F5F3EF",
            opacity: seg(f, 4, 14),
            transform: `translateY(${(1 - seg(f, 4, 20)) * 30}px)`,
          }}
        >
          {title}
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 90 }}>
        <div style={{ textAlign: "center", opacity: labelIn, transform: `translateY(${(1 - labelIn) * 16}px)` }}>
          <div style={{ fontFamily: V.body, fontSize: 22, letterSpacing: "0.22em", color: V.accent }}>
            {String(items.indexOf(current) + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}
          </div>
          <div style={{ fontFamily: V.display, fontWeight: 500, fontSize: 60, color: "#F5F3EF", marginTop: 6 }}>
            {current.name}
          </div>
          <div style={{ fontFamily: V.body, fontSize: 26, color: "rgba(245,243,239,0.6)", marginTop: 4 }}>
            {current.status}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
