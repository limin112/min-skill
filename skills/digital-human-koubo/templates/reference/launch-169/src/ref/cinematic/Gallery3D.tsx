import React from "react";
import { useLoader, useThree } from "@react-three/fiber";
import { Bloom, DepthOfField, EffectComposer, Vignette } from "@react-three/postprocessing";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import * as THREE from "three";
import { E, mix, seg, track } from "./motion";
import { useBrand, V } from "./brand";

export type GalleryPanel = { img: string; label: string };
const GAP = 5.5;
const VIEW = 5.4;
const W = 4.6;
const STEP = 22;

const layout = (i: number) => {
  const side = i % 2 === 0 ? -1 : 1;
  return { x: side * 2.3, y: (i % 4 < 2 ? 0.22 : -0.18) * -side, ry: -side * 0.32 };
};

/** Frames needed for `n` panels. */
export const galleryFrames = (n: number) => 22 + (n - 1) * STEP + 24;

const Panel: React.FC<{ img: string; position: [number, number, number]; ry: number; aspect: number }> = ({
  img,
  position,
  ry,
  aspect,
}) => {
  const tex = useLoader(THREE.TextureLoader, staticFile(img));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return (
    <group position={position} rotation={[0, ry, 0]}>
      <mesh>
        <planeGeometry args={[W, W / aspect]} />
        <meshBasicMaterial map={tex} transparent toneMapped={false} />
      </mesh>
    </group>
  );
};

const Rig: React.FC<{ z: number; x: number; lookX: number }> = ({ z, x, lookX }) => {
  const { camera } = useThree();
  camera.position.set(x, 0.1, z);
  camera.lookAt(lookX, 0, z - 6);
  return null;
};

/** Dolly through floating panels with focus pulls; length = galleryFrames(panels.length). */
export const Gallery3D: React.FC<{ panels: GalleryPanel[]; title: string; aspect?: number }> = ({
  panels,
  title,
  aspect = 16 / 10,
}) => {
  const f = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const b = useBrand();
  const n = panels.length;
  const PANELS = panels.map((p, i) => ({ ...p, ...layout(i) }));
  const cam = track(f, [
    { f: 0, z: 12, x: 0, lookX: 0 },
    ...PANELS.map((p, i) => ({
      f: 22 + i * STEP,
      z: VIEW - GAP * i,
      x: Math.sign(p.x) * 0.4,
      lookX: Math.sign(p.x) * 1.6,
      ...(i === 0 ? { ease: E.out } : {}),
    })),
    { f: 22 + (n - 1) * STEP + 16, z: VIEW - GAP * (n - 1) - 5, x: 0, lookX: 0, ease: E.in },
  ]);
  const nearest = Math.min(n - 1, Math.max(0, Math.round((VIEW - cam.z) / GAP)));
  const focus = PANELS[nearest];
  const focusDist = Math.hypot(cam.x - focus.x, cam.z + nearest * GAP);
  const fadeIn = seg(f, 0, 8, E.linear);
  const fadeOut = 1 - seg(f, durationInFrames - 8, 8, E.linear);

  return (
    <AbsoluteFill style={{ background: b.ink, opacity: fadeIn * fadeOut }}>
      <ThreeCanvas width={width} height={height} camera={{ position: [0, 0, 9], fov: 42 }}>
        <color attach="background" args={[b.ink]} />
        <fog attach="fog" args={[b.ink, 6, 22]} />
        <Rig z={cam.z} x={cam.x} lookX={cam.lookX} />
        {PANELS.map((p, i) => (
          <Panel
            key={p.img}
            img={p.img}
            position={[p.x, p.y, -i * GAP]}
            ry={p.ry}
            aspect={aspect}
          />
        ))}
        <mesh position={[0, 0, -30]}>
          <planeGeometry args={[80, 40]} />
          <meshBasicMaterial color={b.accent2} transparent opacity={0.08} />
        </mesh>
        <EffectComposer multisampling={4}>
          <DepthOfField worldFocusDistance={focusDist} worldFocusRange={2.5} bokehScale={3} />
          <Bloom intensity={0.25} luminanceThreshold={0.96} mipmapBlur />
          <Vignette offset={0.3} darkness={0.8} />
        </EffectComposer>
      </ThreeCanvas>
      <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 70 }}>
        <div
          style={{
            opacity: seg(f, 2, 12) * (1 - seg(f, 22, 10)),
            transform: `translateY(${(1 - seg(f, 2, 18)) * 30}px)`,
            fontFamily: V.display,
            fontWeight: 500,
            fontSize: 64,
            color: "#F5F3EF",
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </div>
      </AbsoluteFill>
      {PANELS.map((p, i) => {
        const at = 22 + i * STEP;
        const inP = seg(f, at - 8, 14, E.out);
        const outP = seg(f, at + 12, 10, E.inOut);
        const left = p.x > 0;
        return (
          <AbsoluteFill
            key={p.label}
            style={{
              justifyContent: "flex-end",
              alignItems: left ? "flex-start" : "flex-end",
              padding: "0 140px 120px",
              opacity: inP * (1 - outP),
            }}
          >
            <div style={{ transform: `translateX(${(1 - inP) * (left ? -60 : 60)}px)`, textAlign: left ? "left" : "right" }}>
              <div style={{ fontFamily: V.body, fontSize: 24, color: V.accent, letterSpacing: "0.2em" }}>
                {String(i + 1).padStart(2, "0")}
              </div>
              <div
                style={{
                  fontFamily: V.display,
                  fontWeight: 500,
                  fontSize: 84,
                  color: "#F5F3EF",
                  letterSpacing: "-0.02em",
                }}
              >
                {p.label}
              </div>
            </div>
          </AbsoluteFill>
        );
      })}
      <AbsoluteFill style={{ background: `rgba(20,20,20,${mix(0.6, 0, seg(f, 0, 14))})` }} />
    </AbsoluteFill>
  );
};
