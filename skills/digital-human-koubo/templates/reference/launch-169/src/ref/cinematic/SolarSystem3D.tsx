import React, { useMemo } from "react";
import { useLoader, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { ThreeCanvas } from "@remotion/three";
import { random, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import * as THREE from "three";
import { E, seg, track } from "./motion";

export type Body = { img: string; r: number; size: number; speed: number; phase: number; label: string };
type CamKey = { f: number; x: number; y: number; z: number; lx: number; ly: number; lz: number; ease?: (t: number) => number };

const labelTexture = (text: string) => {
  const c = document.createElement("canvas");
  c.width = 640;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.font = '500 52px "Songti SC", "Mole Serif SC", serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(245,244,237,0.92)";
  ctx.fillText(text, 320, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

const glowTexture = (color: string) => {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, color);
  g.addColorStop(0.35, color + "66");
  g.addColorStop(1, "transparent");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

const bodyPos = (b: Body, f: number) => {
  const a = b.phase + f * b.speed;
  return new THREE.Vector3(Math.cos(a) * b.r, 0, Math.sin(a) * b.r);
};

const Sprite: React.FC<{ tex: THREE.Texture; pos: THREE.Vector3 | [number, number, number]; scale: [number, number]; opacity?: number; additive?: boolean }> = ({ tex, pos, scale, opacity = 1, additive }) => (
  <sprite position={pos} scale={[scale[0], scale[1], 1]}>
    <spriteMaterial map={tex} transparent opacity={opacity} depthWrite={false} toneMapped={false} blending={additive ? THREE.AdditiveBlending : THREE.NormalBlending} />
  </sprite>
);

const Orbit: React.FC<{ r: number; opacity: number }> = ({ r, opacity }) => {
  const obj = useMemo(() => {
    const pts = Array.from({ length: 256 }, (_, i) => new THREE.Vector3(Math.cos((i / 256) * Math.PI * 2) * r, 0, Math.sin((i / 256) * Math.PI * 2) * r));
    return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: "#e8e2d2", transparent: true, opacity: 0.2 }));
  }, [r]);
  (obj.material as THREE.LineBasicMaterial).opacity = 0.2 * opacity;
  return <primitive object={obj} />;
};

const StarField: React.FC = () => {
  const geo = useMemo(() => {
    const p = new Float32Array(1800 * 3);
    for (let i = 0; i < 1800; i++) {
      const u = random(`u${i}`) * 2 - 1;
      const th = random(`t${i}`) * Math.PI * 2;
      const rr = 70 + random(`r${i}`) * 30;
      const s = Math.sqrt(1 - u * u);
      p.set([Math.cos(th) * s * rr, u * rr, Math.sin(th) * s * rr], i * 3);
    }
    return new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(p, 3));
  }, []);
  return (
    <points geometry={geo}>
      <pointsMaterial size={0.22} color="#ffffff" transparent opacity={0.8} sizeAttenuation />
    </points>
  );
};

const Scene: React.FC<{ sun: { img: string; size: number; label: string }; bodies: Body[]; cam: CamKey[]; dive?: { index: number; at: number; dur: number } }> = ({ sun, bodies, cam, dive }) => {
  const f = useCurrentFrame();
  const { camera } = useThree();
  const texs = useLoader(THREE.TextureLoader, [sun.img, ...bodies.map((b) => b.img)].map((p) => staticFile(p)));
  texs.forEach((t) => (t.colorSpace = THREE.SRGBColorSpace));
  const labels = useMemo(() => [sun.label, ...bodies.map((b) => b.label)].map(labelTexture), [sun.label, bodies]);
  const glow = useMemo(() => glowTexture("#ffb347"), []);
  const k = track(f, cam);
  let pos = new THREE.Vector3(k.x, k.y, k.z);
  let look = new THREE.Vector3(k.lx, k.ly, k.lz);
  if (dive) {
    const t = seg(f, dive.at, dive.dur, E.in);
    const target = bodyPos(bodies[dive.index], f);
    const near = target.clone().add(pos.clone().sub(target).normalize().multiplyScalar(bodies[dive.index].size * 0.9));
    pos = pos.lerp(near, t);
    look = look.lerp(target, Math.min(1, t * 1.6));
  }
  camera.position.copy(pos);
  camera.lookAt(look);
  const labelOn = seg(f, 20, 20);
  return (
    <>
      <StarField />
      <Sprite tex={glow} pos={[0, 0, 0]} scale={[sun.size * 3.2, sun.size * 3.2]} opacity={0.55} additive />
      <Sprite tex={texs[0]} pos={[0, 0, 0]} scale={[sun.size, sun.size]} />
      <Sprite tex={labels[0]} pos={[0, -sun.size * 0.72, 0]} scale={[4.2, 0.84]} opacity={labelOn} />
      {bodies.map((b, i) => {
        const p = bodyPos(b, f);
        return (
          <group key={b.label}>
            <Orbit r={b.r} opacity={seg(f, 4 + i * 4, 20)} />
            <Sprite tex={texs[i + 1]} pos={p} scale={[b.size, b.size]} opacity={seg(f, 8 + i * 5, 14)} />
            <Sprite tex={labels[i + 1]} pos={[p.x, p.y - b.size * 0.78, p.z]} scale={[3.6, 0.72]} opacity={labelOn * seg(f, 24 + i * 4, 12)} />
          </group>
        );
      })}
    </>
  );
};

/** Solar system of sprite planets on orbits; each body can carry a label and the camera can dive into one. */
export const SolarSystem3D: React.FC<React.ComponentProps<typeof Scene>> = (props) => {
  const { width, height } = useVideoConfig();
  return (
    <ThreeCanvas width={width} height={height} camera={{ fov: 38, near: 0.05, far: 300, position: [0, 20, 10] }}>
      <color attach="background" args={["#030409"]} />
      <Scene {...props} />
      <EffectComposer multisampling={4}>
        <Bloom intensity={0.7} luminanceThreshold={0.7} mipmapBlur />
        <Vignette offset={0.25} darkness={0.85} />
      </EffectComposer>
    </ThreeCanvas>
  );
};

