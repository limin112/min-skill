import React, { useLayoutEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from "remotion";
import * as THREE from "three";
import { useBrand, V } from "./brand";
import { StudioEnv } from "./Logo3D";
import type { Cue } from "./sfx";
import { E, clamp01, mix, seg } from "./motion";

/** Pixel art as voxels: x/y in pixels (y up), colour per pixel. Build with a PNG → JSON script. */
export type VoxelData = { w: number; h: number; voxels: [number, number, string][] };

const ASSEMBLE = 46;

export const Voxels: React.FC<{ data: VoxelData; f: number; assemble: [number, number]; explode?: [number, number]; size: number }> = ({
  data,
  f,
  assemble,
  explode,
  size,
}) => {
  const ref = useRef<THREE.InstancedMesh>(null);
  const n = data.voxels.length;
  const scatter = useMemo(
    () =>
      data.voxels.map((_, i) => {
        const th = random(`vt-${i}`) * Math.PI * 2;
        const ph = Math.acos(2 * random(`vp-${i}`) - 1);
        const r = 40 + random(`vr-${i}`) * 50;
        return {
          p: new THREE.Vector3(Math.sin(ph) * Math.cos(th) * r, Math.sin(ph) * Math.sin(th) * r, Math.cos(ph) * r * 0.6 + 20),
          delay: random(`vd-${i}`) * 0.45,
          spin: (random(`vs-${i}`) - 0.5) * 12,
          z: (random(`vz-${i}`) - 0.5) * 0.35,
        };
      }),
    [data],
  );
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    data.voxels.forEach(([, , c], i) => m.setColorAt(i, new THREE.Color(c)));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [data]);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    const [a0, aLen] = assemble;
    data.voxels.forEach(([x, y], i) => {
      const s = scatter[i];
      const t = E.out(clamp01((f - a0 - s.delay * aLen) / (aLen * 0.55)));
      const home = new THREE.Vector3(x - data.w / 2, y - data.h / 2, s.z);
      const pos = s.p.clone().lerp(home, t);
      let rot = (1 - t) * s.spin;
      if (explode) {
        const e = E.in(clamp01((f - explode[0] - s.delay * explode[1] * 0.4) / (explode[1] * 0.6)));
        pos.lerp(new THREE.Vector3(home.x * 3, home.y * 3, 60 + s.p.z), e);
        rot += e * s.spin;
      }
      o.position.copy(pos);
      o.rotation.set(rot, rot * 0.7, 0);
      o.scale.setScalar(t < 0.02 ? 0.001 : 0.92);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, n]} scale={size / data.h}>
      <boxGeometry args={[1, 1, 1.4]} />
      <meshStandardMaterial roughness={0.45} metalness={0.1} />
    </instancedMesh>
  );
};

export const Rig: React.FC<{ x: number; z: number; yaw: number }> = ({ x, z, yaw }) => {
  const { camera } = useThree();
  camera.position.set(Math.sin(yaw) * z + x, 0.4, Math.cos(yaw) * z);
  camera.lookAt(x, 0, 0);
  return null;
};

const Grid: React.FC<{ color: string }> = ({ color }) => (
  <gridHelper args={[80, 80, color, color]} position={[0, -4.2, 0]} material-transparent material-opacity={0.18} />
);

export const voxelIntroCues = (offset: number): Cue[] => [
  { at: offset, name: "riser", volume: 0.35 },
  { at: offset + ASSEMBLE - 2, name: "impact", volume: 0.6 },
  { at: offset + 54, name: "tap", volume: 0.5 },
];

/**
 * Opening: voxels fly in and lock into the portrait, camera orbits, name and role reveal beside it.
 * With `explodeAt`, the portrait bursts toward camera to hand over to the next scene.
 */
export const VoxelIntro: React.FC<{ data: VoxelData; name: string; role: string; tag?: string; explodeAt?: number }> = ({
  data,
  name,
  role,
  tag,
  explodeAt,
}) => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const b = useBrand();
  const slide = seg(f, ASSEMBLE, 20, E.inOut);
  const yaw = mix(0.9, 0.18, seg(f, 0, ASSEMBLE + 10, E.out)) + Math.sin(f / 30) * 0.04;
  const out = explodeAt ? seg(f, explodeAt, 10, E.in) : 0;
  return (
    <AbsoluteFill style={{ background: b.ink }}>
      <ThreeCanvas width={width} height={height} camera={{ fov: 35, position: [0, 0, 16] }}>
        <color attach="background" args={[b.ink]} />
        <Rig x={mix(0, 4, slide)} z={mix(22, 15, seg(f, 0, ASSEMBLE, E.out)) - out * 6} yaw={yaw} />
        <StudioEnv />
        <ambientLight intensity={0.5} />
        <directionalLight position={[4, 6, 8]} intensity={2.2} />
        <pointLight position={[-6, 2, 4]} intensity={60} color={b.accent} decay={1.6} />
        <pointLight position={[6, -3, 3]} intensity={50} color={b.accent2} decay={1.6} />
        <Grid color={b.accent} />
        <Voxels data={data} f={f} assemble={[0, ASSEMBLE]} explode={explodeAt ? [explodeAt, 12] : undefined} size={7.6} />
        <EffectComposer multisampling={4}>
          <Bloom intensity={0.5} luminanceThreshold={0.7} mipmapBlur />
          <Vignette offset={0.25} darkness={0.8} />
        </EffectComposer>
      </ThreeCanvas>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "flex-end", paddingRight: 130, opacity: 1 - out }}>
        <div style={{ width: 760 }}>
          {tag && (
            <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 22, color: V.accent, letterSpacing: "0.08em", opacity: seg(f, ASSEMBLE + 4, 8) }}>
              {tag}
            </div>
          )}
          <div style={{ overflow: "hidden", marginTop: 22 }}>
            <div
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: 92,
                lineHeight: 1.1,
                color: "#F5F7FA",
                transform: `translateY(${(1 - seg(f, ASSEMBLE + 6, 16, E.out)) * 110}%)`,
                textShadow: `6px 6px 0 ${b.accent}55`,
              }}
            >
              {name}
            </div>
          </div>
          <div style={{ marginTop: 34, fontFamily: V.body, fontWeight: 600, fontSize: 44, color: "rgba(245,247,250,0.85)", opacity: seg(f, ASSEMBLE + 14, 12), transform: `translateY(${(1 - seg(f, ASSEMBLE + 14, 16, E.out)) * 20}px)` }}>
            {role}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const voxelOutroCues = (offset: number): Cue[] => [
  { at: offset, name: "whoosh", volume: 0.5 },
  { at: offset + 30, name: "impact", volume: 0.45 },
  { at: offset + 44, name: "pop", volume: 0.5 },
  { at: offset + 54, name: "ding", volume: 0.4 },
];

/** End card: voxels re-assemble, handle and CTA land beside the portrait. */
export const VoxelOutro: React.FC<{ data: VoxelData; handle: string; line: string; links?: string[] }> = ({ data, handle, line, links = [] }) => {
  const f = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const b = useBrand();
  const fadeOut = 1 - seg(f, durationInFrames - 10, 10, E.linear);
  return (
    <AbsoluteFill style={{ background: b.ink, opacity: fadeOut }}>
      <ThreeCanvas width={width} height={height} camera={{ fov: 35, position: [0, 0, 16] }}>
        <color attach="background" args={[b.ink]} />
        <Rig x={4} z={15} yaw={mix(-0.6, 0.15, seg(f, 0, 40, E.out)) + Math.sin(f / 26) * 0.05} />
        <StudioEnv />
        <ambientLight intensity={0.5} />
        <directionalLight position={[4, 6, 8]} intensity={2.2} />
        <pointLight position={[-6, 2, 4]} intensity={60} color={b.accent} decay={1.6} />
        <pointLight position={[6, -3, 3]} intensity={50} color={b.accent2} decay={1.6} />
        <Grid color={b.accent} />
        <Voxels data={data} f={f} assemble={[0, 34]} size={7.6} />
        <EffectComposer multisampling={4}>
          <Bloom intensity={0.5} luminanceThreshold={0.7} mipmapBlur />
          <Vignette offset={0.25} darkness={0.8} />
        </EffectComposer>
      </ThreeCanvas>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "flex-end", paddingRight: 110 }}>
        <div style={{ width: 820 }}>
          <div style={{ fontFamily: V.body, fontSize: 30, color: "rgba(245,247,250,0.6)", opacity: seg(f, 28, 10) }}>在 X 上找到我</div>
          <div style={{ overflow: "hidden", marginTop: 18 }}>
            <div
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: 80,
                lineHeight: 1.15,
                color: V.accent,
                transform: `translateY(${(1 - seg(f, 30, 14, E.out)) * 110}%)`,
                textShadow: `6px 6px 0 ${b.accent2}66`,
              }}
            >
              {handle}
            </div>
          </div>
          <div style={{ marginTop: 34, fontFamily: V.body, fontWeight: 600, fontSize: 48, lineHeight: 1.35, color: "#F5F7FA", whiteSpace: "pre-line", opacity: seg(f, 40, 12), transform: `translateY(${(1 - seg(f, 40, 16, E.out)) * 20}px)` }}>
            {line}
          </div>
          <div style={{ display: "flex", gap: 18, marginTop: 40 }}>
            {links.map((l, i) => {
              const p = seg(f, 50 + i * 5, 14, E.back);
              return (
                <div key={l} style={{ padding: "12px 24px", borderRadius: 999, border: "1px solid rgba(245,247,250,0.25)", fontFamily: V.body, fontSize: 24, color: "rgba(245,247,250,0.85)", opacity: clamp01(p * 1.5), transform: `scale(${mix(0.8, 1, p)})` }}>
                  {l}
                </div>
              );
            })}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
