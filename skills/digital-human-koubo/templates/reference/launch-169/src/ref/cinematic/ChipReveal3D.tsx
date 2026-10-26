import React, { useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { ThreeCanvas } from "@remotion/three";
import { random, useCurrentFrame, useVideoConfig } from "remotion";
import * as THREE from "three";
import { StudioEnv } from "./Logo3D";
import { E, clamp01, mix, seg } from "./motion";

const SIZE = 2.4;
const TRACES = 44;

const chipTexture = (title: string, sub: string) => {
  const c = document.createElement("canvas");
  c.width = c.height = 1024;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 1024, 1024);
  g.addColorStop(0, "#2a2d33");
  g.addColorStop(0.5, "#16181c");
  g.addColorStop(1, "#24272d");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 1024);
  ctx.textAlign = "center";
  const font = '"SF Pro Display", -apple-system, "Helvetica Neue", sans-serif';
  ctx.fillStyle = "#d9dde3";
  ctx.font = `600 300px ${font}`;
  ctx.fillText(title, 512, 560);
  ctx.font = `600 120px ${font}`;
  ctx.fillStyle = "#aeb4bd";
  ctx.fillText(sub, 512, 720);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
};

const roundedSquare = (s: number, r: number) => {
  const sh = new THREE.Shape();
  const h = s / 2;
  sh.moveTo(-h + r, -h);
  sh.lineTo(h - r, -h);
  sh.quadraticCurveTo(h, -h, h, -h + r);
  sh.lineTo(h, h - r);
  sh.quadraticCurveTo(h, h, h - r, h);
  sh.lineTo(-h + r, h);
  sh.quadraticCurveTo(-h, h, -h, h - r);
  sh.lineTo(-h, -h + r);
  sh.quadraticCurveTo(-h, -h, -h + r, -h);
  return sh;
};

const Rig: React.FC<{ pos: [number, number, number] }> = ({ pos }) => {
  const { camera } = useThree();
  camera.position.set(...pos);
  camera.lookAt(0, 0.2, 0);
  return null;
};

/** Processor hero: the chip rises from a dark board while light pulses race along its traces. */
export const ChipReveal3D: React.FC<{ title: string; sub: string; accent?: string }> = ({ title, sub, accent = "#7aa2ff" }) => {
  const f = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const tex = useMemo(() => chipTexture(title, sub), [title, sub]);
  const body = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(roundedSquare(SIZE, 0.28), { depth: 0.22, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 4 });
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const top = useMemo(() => {
    const g = new THREE.ShapeGeometry(roundedSquare(SIZE - 0.16, 0.22), 16);
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    const h = (SIZE - 0.16) / 2;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + h) / (2 * h), (pos.getY(i) + h) / (2 * h));
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const traces = useMemo(
    () =>
      Array.from({ length: TRACES }, (_, i) => {
        const side = i % 4;
        const t = (Math.floor(i / 4) + 0.5) / (TRACES / 4);
        const along = (t - 0.5) * (SIZE - 0.5);
        const len = 2.5 + random(`tl-${i}`) * 4;
        const dir = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ][side];
        const start = [dir[0] ? (dir[0] * SIZE) / 2 : along, dir[1] ? (dir[1] * SIZE) / 2 : along];
        return { start, dir, len, delay: random(`td-${i}`) * 30, speed: 0.08 + random(`ts-${i}`) * 0.06 };
      }),
    [],
  );
  const rise = seg(f, 4, 40, E.out);
  const orbit = seg(f, 0, durationInFrames, E.sine);
  const camPos: [number, number, number] = [Math.sin(mix(-0.5, 0.35, orbit)) * mix(9, 6.5, orbit), mix(10, 4.2, orbit), Math.cos(mix(-0.5, 0.35, orbit)) * mix(9, 6.5, orbit)];
  return (
    <ThreeCanvas width={width} height={height} camera={{ fov: 32, position: [0, 8, 8] }}>
      <color attach="background" args={["#000"]} />
      <fog attach="fog" args={["#000", 8, 20]} />
      <Rig pos={camPos} />
      <StudioEnv />
      <ambientLight intensity={0.15} />
      <spotLight position={[mix(-6, 6, orbit), 8, 3]} angle={0.5} penumbra={0.8} intensity={140} decay={1.6} />
      <pointLight position={[0, 1.5, 0]} intensity={20 * rise} color={accent} decay={2} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#07080b" roughness={0.55} metalness={0.4} />
      </mesh>
      {traces.map((tr, i) => {
        const mid: [number, number, number] = [tr.start[0] + (tr.dir[0] * tr.len) / 2, 0.005, tr.start[1] + (tr.dir[1] * tr.len) / 2];
        const p = ((f - tr.delay) * tr.speed) % 1.4;
        const pulse: [number, number, number] = [tr.start[0] + tr.dir[0] * tr.len * p, 0.02, tr.start[1] + tr.dir[1] * tr.len * p];
        const alive = f > tr.delay && p < 1;
        return (
          <group key={i}>
            <mesh position={mid}>
              <boxGeometry args={[tr.dir[0] ? tr.len : 0.025, 0.004, tr.dir[1] ? tr.len : 0.025]} />
              <meshStandardMaterial color="#1c2230" emissive={accent} emissiveIntensity={0.25 * rise} />
            </mesh>
            {alive && (
              <mesh position={pulse}>
                <boxGeometry args={[tr.dir[0] ? 0.5 : 0.05, 0.02, tr.dir[1] ? 0.5 : 0.05]} />
                <meshBasicMaterial color={accent} toneMapped={false} transparent opacity={clamp01((1 - p) * 1.5)} />
              </mesh>
            )}
          </group>
        );
      })}
      <group position={[0, mix(-0.3, 0, rise), 0]}>
        <mesh geometry={body}>
          <meshPhysicalMaterial color="#3a3e45" metalness={0.9} roughness={0.28} />
        </mesh>
        <mesh geometry={top} position={[0, 0.265, 0]}>
          <meshPhysicalMaterial map={tex} metalness={0.7} roughness={0.32} clearcoat={0.4} />
        </mesh>
      </group>
      <EffectComposer multisampling={4}>
        <Bloom intensity={0.9} luminanceThreshold={0.6} mipmapBlur />
        <Vignette offset={0.2} darkness={0.9} />
      </EffectComposer>
    </ThreeCanvas>
  );
};
