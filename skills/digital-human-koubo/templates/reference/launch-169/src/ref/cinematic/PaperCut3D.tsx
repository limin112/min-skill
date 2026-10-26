import React, { useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from "remotion";
import * as THREE from "three";
import { useBrand, V } from "./brand";
import type { Cue } from "./sfx";
import { E, mix, seg } from "./motion";

const WIDTH = 26;
const LAYER_GAP = 0.9;
const RISE_AT = 6;
const RISE_STEP = 7;
const RISE_LEN = 22;
const TITLE_AT = 50;

/** Frame each layer (back to front) lands; use for paper-place cues. */
export const paperLayerAt = (i: number) => RISE_AT + i * RISE_STEP + RISE_LEN * 0.6;

export const paperCutCues = (offset: number, layers = 6): Cue[] => [
  { at: offset, name: "swish-2", volume: 0.5 },
  ...Array.from({ length: layers }, (_, i) => ({
    at: offset + Math.round(paperLayerAt(i)),
    name: `paper-place-${(i % 2) + 1}`,
    volume: 0.35 + i * 0.06,
  })),
  { at: offset + TITLE_AT, name: "cut", volume: 0.45 },
  { at: offset + TITLE_AT + 12, name: "paper-place-1", volume: 0.6 },
];

const ridgeShape = (seed: string, height: number, amp: number, detail: number) => {
  const s = new THREE.Shape();
  const n = 90;
  const phase = [0, 1, 2].map((k) => random(`${seed}-p${k}`) * Math.PI * 2);
  s.moveTo(-WIDTH / 2, 0);
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const x = -WIDTH / 2 + u * WIDTH;
    const y =
      height +
      amp * (Math.sin(u * 3.1 * detail + phase[0]) * 0.6 + Math.sin(u * 7.3 * detail + phase[1]) * 0.28 + Math.sin(u * 17 + phase[2]) * 0.12) +
      (random(`${seed}-j${i}`) - 0.5) * 0.06;
    s.lineTo(x, y);
  }
  s.lineTo(WIDTH / 2, 0);
  s.closePath();
  return s;
};

const cloudShape = (w: number) => {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.bezierCurveTo(-w / 2, w * 0.28, -w * 0.2, w * 0.3, -w * 0.12, w * 0.2);
  s.bezierCurveTo(-w * 0.05, w * 0.46, w * 0.3, w * 0.42, w * 0.26, w * 0.18);
  s.bezierCurveTo(w * 0.5, w * 0.2, w * 0.52, 0, w / 2, 0);
  s.closePath();
  return s;
};

/** Paper fibre bump texture, generated once so renders stay deterministic. */
const usePaperGrain = () =>
  useMemo(() => {
    const size = 256;
    const data = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      const v = 128 + (random(`grain-${i}`) - 0.5) * 70;
      data.set([v, v, v, 255], i * 4);
    }
    const tex = new THREE.DataTexture(data, size, size);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 6);
    tex.needsUpdate = true;
    return tex;
  }, []);

const Paper: React.FC<{ shape: THREE.Shape; color: string; grain: THREE.Texture }> = ({ shape, color, grain }) => {
  const geo = useMemo(() => new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false }), [shape]);
  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.95} metalness={0} bumpMap={grain} bumpScale={0.6} />
    </mesh>
  );
};

const Rig: React.FC<{ z: number; x: number; y: number }> = ({ z, x, y }) => {
  const { camera } = useThree();
  camera.position.set(x, y, z);
  camera.lookAt(x * 0.4, 2.2, -3);
  return null;
};

const mixColor = (a: string, b: string, t: number) => `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;

/**
 * Layered paper-cut landscape with real shadows: layers slide up and settle like stage flats,
 * a low front light drifts so each layer's shadow moves on the one behind, and the title lands as a cut paper tag. ~130 frames.
 */
export const PaperCut3D: React.FC<{
  title: string;
  subtitle?: string;
  /** Back-to-front layer colours; derived from the brand when omitted. */
  palette?: string[];
  layers?: number;
}> = ({ title, subtitle, palette, layers = 6 }) => {
  const f = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const b = useBrand();
  const grain = usePaperGrain();
  const colors =
    palette ??
    Array.from({ length: layers }, (_, i) => {
      const stops = [mixColor(b.paper, b.accent2, 0.32), mixColor(b.paper, b.accent2, 0.6), b.accent2, mixColor(b.accent, b.paper, 0.3), b.accent, mixColor(b.accent, b.ink, 0.5)];
      return stops[Math.round((i / Math.max(1, layers - 1)) * (stops.length - 1))];
    });
  const sky = mixColor(b.paper, b.accent2, 0.12);
  const shapes = useMemo(
    () => colors.map((_, i) => ridgeShape(`ridge-${i}`, 6 - i * 0.62, 1.2 - i * 0.12, 1 + i * 0.15)),
    [colors.length],
  );
  const cloud = useMemo(() => cloudShape(2.6), []);

  const cam = { z: mix(11, 9.2, seg(f, 0, durationInFrames, E.sine)), x: mix(-0.6, 0.6, seg(f, 0, durationInFrames, E.sine)), y: 2.6 };
  const sun = seg(f, 0, durationInFrames, E.sine);
  const titleIn = seg(f, TITLE_AT, 20, E.back);
  const fade = seg(f, 0, 6, E.linear) * (1 - seg(f, durationInFrames - 6, 6, E.linear));

  return (
    <AbsoluteFill style={{ background: sky, opacity: fade }}>
      <ThreeCanvas width={width} height={height} shadows="variance" camera={{ position: [0, 2, 10], fov: 40 }}>
        <color attach="background" args={[sky]} />
        <Rig {...cam} />
        <ambientLight intensity={0.9} />
        <hemisphereLight args={["#ffffff", mixColor(b.accent2, b.ink, 0.5), 0.6]} />
        <directionalLight
          position={[mix(-6, 6, sun), 0.2, 8]}
          intensity={2.6}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-14}
          shadow-camera-right={14}
          shadow-camera-top={9}
          shadow-camera-bottom={-5}
          shadow-bias={-0.0004}
          shadow-radius={10}
          shadow-blurSamples={16}
        />
        <mesh position={[mix(-5.2, -4.6, sun), mix(3.4, 4.6, seg(f, 0, 40, E.out)), -LAYER_GAP * layers - 0.6]} receiveShadow>
          <circleGeometry args={[1.25, 64]} />
          <meshStandardMaterial color={mixColor(b.accent, "#ffffff", 0.45)} roughness={1} bumpMap={grain} bumpScale={0.4} />
        </mesh>
        {[
          { x: 5.2, y: 4.8, s: 1, d: 0.6 },
          { x: -7.4, y: 6.2, s: 0.7, d: 1.4 },
        ].map((c, k) => (
          <group key={k} position={[c.x + mix(-0.5, 0.5, sun) * c.d, c.y, -LAYER_GAP * layers + 0.2]} scale={c.s * mix(0.4, 1, seg(f, 20 + k * 8, 20, E.back))}>
            <Paper shape={cloud} color="#ffffff" grain={grain} />
          </group>
        ))}
        {shapes.map((shape, i) => {
          const rise = seg(f, RISE_AT + i * RISE_STEP, RISE_LEN, E.back);
          return (
            <group key={i} position={[0, mix(-8, -3, rise), -LAYER_GAP * (layers - 1 - i)]} rotation={[mix(-0.35, 0, rise), 0, 0]}>
              <Paper shape={shape} color={colors[i]} grain={grain} />
            </group>
          );
        })}
      </ThreeCanvas>
      <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 110 }}>
        <div
          style={{
            opacity: Math.min(1, titleIn * 1.5),
            transform: `translateY(${(1 - titleIn) * -80}px) rotate(${mix(-9, -2, titleIn)}deg)`,
            background: "#FFFDF8",
            padding: "30px 64px 34px",
            clipPath:
              "polygon(0% 6%, 3% 0%, 22% 3%, 41% 0%, 63% 4%, 82% 0%, 100% 5%, 98% 32%, 100% 61%, 97% 100%, 74% 96%, 52% 100%, 29% 96%, 8% 100%, 0% 94%, 2% 63%, 0% 34%)",
            filter: "drop-shadow(0 18px 20px rgba(0,0,0,0.18))",
            textAlign: "center",
          }}
        >
          <div style={{ fontFamily: V.display, fontWeight: 500, fontSize: 78, letterSpacing: "-0.02em", color: V.ink, lineHeight: 1.05 }}>{title}</div>
          {subtitle && (
            <div style={{ fontFamily: V.body, fontSize: 28, color: "rgba(0,0,0,0.55)", marginTop: 12, opacity: seg(f, TITLE_AT + 12, 12) }}>{subtitle}</div>
          )}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
