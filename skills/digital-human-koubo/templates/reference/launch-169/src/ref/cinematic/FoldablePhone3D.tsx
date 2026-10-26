import React, { useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { Bloom, DepthOfField, EffectComposer, Vignette } from "@react-three/postprocessing";
import { ThreeCanvas } from "@remotion/three";
import { useCurrentFrame, useVideoConfig } from "remotion";
import * as THREE from "three";
import { StudioEnv } from "./Logo3D";
import { track } from "./motion";

/** Book-style foldable. Units: height 6.2, each half 2.2 wide, 0.1 thick. */
const H = 6.2;
const W = 2.2;
const T = 0.1;
const R = 0.42;
const BEZEL = 0.07;

export type ScreenMode = "off" | "lock" | "wallpaper" | "split";
export type PhoneKey = {
  f: number;
  /** 0 = closed, 1 = flat open. */
  open?: number;
  ry?: number;
  rx?: number;
  rz?: number;
  x?: number;
  y?: number;
  camX?: number;
  camY?: number;
  camZ?: number;
  lookX?: number;
  lookY?: number;
  inner?: number;
  outer?: number;
  focus?: number;
  ease?: (t: number) => number;
};

const DEFAULTS = { open: 0, ry: 0, rx: 0, rz: 0, x: 0, y: 0, camX: 0, camY: 0, camZ: 14, lookX: 0, lookY: 0, inner: 0, outer: 0, focus: 14 };

/** Half outline in plan: rounded on the outer corners, straight on the hinge edge (x = 0). */
const halfShape = (side: 1 | -1, inset = 0) => {
  const s = new THREE.Shape();
  const w = W - inset;
  const h = H / 2 - inset;
  const r = Math.max(0.05, R - inset);
  const X = (v: number) => v * side;
  s.moveTo(0, -h);
  s.lineTo(X(w - r), -h);
  s.quadraticCurveTo(X(w), -h, X(w), -h + r);
  s.lineTo(X(w), h - r);
  s.quadraticCurveTo(X(w), h, X(w - r), h);
  s.lineTo(0, h);
  s.closePath();
  return s;
};

/** Planar geometry with UVs mapped into [u0,u1] × [0,1] of a shared screen texture. */
const displayGeometry = (shape: THREE.Shape, u0: number, u1: number) => {
  const g = new THREE.ShapeGeometry(shape, 24);
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x);
    const v = (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y);
    uv.setXY(i, u0 + u * (u1 - u0), v);
  }
  uv.needsUpdate = true;
  return g;
};

const FONT = '"SF Pro Display", -apple-system, "Helvetica Neue", sans-serif';

const aurora = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  ctx.fillStyle = "#05060A";
  ctx.fillRect(0, 0, w, h);
  const blobs: [number, number, number, string][] = [
    [0.25, 0.3, 0.7, "rgba(64,98,255,0.85)"],
    [0.8, 0.45, 0.6, "rgba(168,85,247,0.75)"],
    [0.45, 0.85, 0.65, "rgba(255,120,64,0.55)"],
    [0.9, 0.05, 0.4, "rgba(56,189,248,0.5)"],
  ];
  for (const [x, y, r, c] of blobs) {
    const g = ctx.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * Math.max(w, h));
    g.addColorStop(0, c);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
};

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
};

const drawScreen = (mode: ScreenMode, kind: "inner" | "outer") => {
  const w = kind === "inner" ? 1408 : 704;
  const h = kind === "inner" ? 1980 : 1024;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  aurora(ctx, w, h);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  if (mode === "lock") {
    ctx.font = `600 34px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText("Friday, October 23", w / 2, h * 0.16);
    ctx.font = `700 190px ${FONT}`;
    ctx.fillStyle = "#fff";
    ctx.fillText("9:41", w / 2, h * 0.33);
  }
  if (mode === "split") {
    ctx.font = `600 30px ${FONT}`;
    ctx.textAlign = "left";
    ctx.fillText("9:41", 60, 64);
    const pad = 36;
    const top = 110;
    const gw = (w - pad * 3) / 2;
    const gh = h - top - pad;
    ctx.fillStyle = "rgba(250,250,252,0.96)";
    roundRect(ctx, pad, top, gw, gh, 44);
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.font = `700 54px ${FONT}`;
    ctx.fillText("Kyoto, Day 2", pad + 44, top + 110);
    ctx.fillStyle = "#8a8a8e";
    ctx.font = `500 28px ${FONT}`;
    ctx.fillText("October 23 · Notes", pad + 44, top + 160);
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = i % 4 === 0 ? "#1c1c1e" : "#c7c7cc";
      roundRect(ctx, pad + 44, top + 230 + i * 70, (gw - 88) * (i % 4 === 0 ? 0.55 : 0.7 + ((i * 37) % 30) / 100), i % 4 === 0 ? 22 : 16, 8);
      ctx.fill();
    }
    const px = pad * 2 + gw;
    ctx.save();
    roundRect(ctx, px, top, gw, gh, 44);
    ctx.clip();
    const sky = ctx.createLinearGradient(0, top, 0, top + gh);
    sky.addColorStop(0, "#ff9f6e");
    sky.addColorStop(0.45, "#f76b8a");
    sky.addColorStop(0.75, "#4b3a8f");
    sky.addColorStop(1, "#141433");
    ctx.fillStyle = sky;
    ctx.fillRect(px, top, gw, gh);
    ctx.fillStyle = "rgba(255,236,200,0.95)";
    ctx.beginPath();
    ctx.arc(px + gw * 0.62, top + gh * 0.42, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1b1640";
    ctx.beginPath();
    ctx.moveTo(px, top + gh * 0.7);
    ctx.lineTo(px + gw * 0.3, top + gh * 0.5);
    ctx.lineTo(px + gw * 0.55, top + gh * 0.64);
    ctx.lineTo(px + gw * 0.8, top + gh * 0.46);
    ctx.lineTo(px + gw, top + gh * 0.6);
    ctx.lineTo(px + gw, top + gh);
    ctx.lineTo(px, top + gh);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    roundRect(ctx, w / 2 - 5, h / 2 - 60, 10, 120, 5);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
};

const useScreens = () =>
  useMemo(
    () => ({
      inner: { wallpaper: drawScreen("wallpaper", "inner"), split: drawScreen("split", "inner") },
      outer: drawScreen("lock", "outer"),
    }),
    [],
  );

const DOME_R = 2;
const DOME_T = Math.asin(0.46);

const Lens: React.FC<{ x: number; y: number; r: number }> = ({ x, y, r }) => (
  <group position={[x, y, -0.02]} rotation={[Math.PI / 2, 0, 0]}>
    <mesh>
      <cylinderGeometry args={[r * 1.18, r * 1.18, 0.12, 64]} />
      <meshPhysicalMaterial color="#9aa0a8" metalness={1} roughness={0.16} />
    </mesh>
    <mesh position={[0, -0.061, 0]}>
      <cylinderGeometry args={[r * 1.06, r * 1.06, 0.004, 64]} />
      <meshStandardMaterial color="#020203" roughness={0.7} />
    </mesh>
    <mesh position={[0, -0.064, 0]}>
      <cylinderGeometry args={[r * 0.92, r * 0.92, 0.004, 64]} />
      <meshPhysicalMaterial color="#030409" roughness={0.05} clearcoat={1} />
    </mesh>
    {[0.8, 0.62].map((k) => (
      <mesh key={k} position={[0, -0.067, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[r * k, 0.006, 8, 64]} />
        <meshStandardMaterial color="#3a404c" metalness={1} roughness={0.25} />
      </mesh>
    ))}
    <mesh position={[0, -0.068, 0]}>
      <cylinderGeometry args={[r * 0.42, r * 0.42, 0.003, 48]} />
      <meshPhysicalMaterial color="#101a44" metalness={0.3} roughness={0.04} clearcoat={1} iridescence={1} iridescenceIOR={1.9} iridescenceThicknessRange={[250, 750]} />
    </mesh>
    <mesh position={[0, -0.064 + r * DOME_R * Math.cos(DOME_T), 0]} rotation={[Math.PI, 0, 0]}>
      <sphereGeometry args={[r * DOME_R, 64, 12, 0, Math.PI * 2, 0, DOME_T]} />
      <meshPhysicalMaterial color="#000000" transparent opacity={0.35} roughness={0} clearcoat={1} depthWrite={false} />
    </mesh>
  </group>
);

const plateauGeometry = (() => {
  const s = 1.5, r = 0.38, h = s / 2;
  const sh = new THREE.Shape();
  sh.moveTo(-h + r, -h);
  sh.lineTo(h - r, -h);
  sh.quadraticCurveTo(h, -h, h, -h + r);
  sh.lineTo(h, h - r);
  sh.quadraticCurveTo(h, h, h - r, h);
  sh.lineTo(-h + r, h);
  sh.quadraticCurveTo(-h, h, -h, h - r);
  sh.lineTo(-h, -h + r);
  sh.quadraticCurveTo(-h, -h, -h + r, -h);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 3, curveSegments: 16 });
  g.translate(0, 0, -0.05);
  return g;
})();

const Half: React.FC<{ side: 1 | -1; screen: THREE.Texture; inner: number; back: "outer" | "camera"; outerTex: THREE.Texture; outer: number }> = ({
  side,
  screen,
  inner,
  back,
  outerTex,
  outer,
}) => {
  const body = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(halfShape(side), { depth: T - 0.04, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 4, curveSegments: 24 });
    g.translate(0, 0, -T + 0.02);
    return g;
  }, [side]);
  const disp = useMemo(() => displayGeometry(halfShape(side, BEZEL), side === -1 ? 0 : 0.5, side === -1 ? 0.5 : 1), [side]);
  const backDisp = useMemo(() => {
    const g = displayGeometry(halfShape(side, BEZEL + 0.03), 0, 1);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
    return g;
  }, [side]);
  const backPlate = useMemo(() => new THREE.ShapeGeometry(halfShape(side, 0.03), 24), [side]);
  const glass = useMemo(() => new THREE.MeshPhysicalMaterial({ color: "#07080b", roughness: 0.12, metalness: 0.1, clearcoat: 1 }), []);
  const frame = useMemo(() => new THREE.MeshPhysicalMaterial({ color: "#aeb4bc", metalness: 1, roughness: 0.2 }), []);
  const u = new THREE.Color().setScalar(inner);
  return (
    <group>
      <mesh geometry={body} material={[glass, frame]} />
      <mesh geometry={disp} position={[0, 0, 0.003]}>
        <meshBasicMaterial map={screen} color={u} toneMapped={false} />
      </mesh>
      <mesh geometry={disp} position={[0, 0, 0.008]}>
        <meshPhysicalMaterial color="#ffffff" transparent opacity={0.1} metalness={1} roughness={0.06} depthWrite={false} />
      </mesh>
      {back === "outer" ? (
        <mesh geometry={backDisp} position={[0, 0, -T - 0.003]} rotation={[0, Math.PI, 0]} scale={[-1, 1, 1]}>
          <meshBasicMaterial map={outerTex} color={new THREE.Color().setScalar(outer)} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      ) : (
        <>
          <mesh geometry={backPlate} position={[0, 0, -T - 0.002]} rotation={[0, Math.PI, 0]} scale={[-1, 1, 1]}>
            <meshPhysicalMaterial color="#1a2236" roughness={0.38} metalness={0.25} clearcoat={0.6} side={THREE.DoubleSide} />
          </mesh>
          <group position={[side * (W - 0.95), H / 2 - 0.95, -T - 0.004]}>
            <mesh geometry={plateauGeometry}>
              <meshPhysicalMaterial color="#1f2940" roughness={0.3} metalness={0.4} clearcoat={0.8} />
            </mesh>
            <Lens x={-0.35} y={0.35} r={0.27} />
            <Lens x={0.35} y={-0.35} r={0.27} />
            <mesh position={[0.4, 0.4, -0.07]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.09, 0.09, 0.02, 24]} />
              <meshPhysicalMaterial color="#a39b8a" roughness={0.45} clearcoat={1} />
            </mesh>
          </group>
        </>
      )}
    </group>
  );
};

const Rig: React.FC<{ k: typeof DEFAULTS }> = ({ k }) => {
  const { camera } = useThree();
  camera.position.set(k.camX, k.camY, k.camZ);
  camera.lookAt(k.lookX, k.lookY, 0);
  return null;
};

/**
 * Keyframed foldable phone on a black stage: `keys` drive the hinge (open), pose, camera and
 * screen brightness; `screens` switches the inner display content at given frames.
 */
export const FoldablePhone3D: React.FC<{
  keys: PhoneKey[];
  screens?: { from: number; mode: Exclude<ScreenMode, "off" | "lock"> }[];
  accent?: string;
  dof?: boolean;
}> = ({ keys, screens = [{ from: 0, mode: "wallpaper" }], accent = "#7aa2ff", dof = false }) => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tex = useScreens();
  const full = keys.map((k) => ({ ...DEFAULTS, ...k }));
  const k = track(f, full) as unknown as typeof DEFAULTS;
  const mode = [...screens].reverse().find((s) => f >= s.from)?.mode ?? "wallpaper";
  const hinge = (1 - k.open) * Math.PI;
  return (
    <ThreeCanvas width={width} height={height} camera={{ fov: 30, position: [0, 0, 14] }}>
      <color attach="background" args={["#000000"]} />
      <Rig k={k} />
      <StudioEnv />
      <ambientLight intensity={0.15} />
      <directionalLight position={[5, 6, 8]} intensity={1.6} />
      <pointLight position={[-6, 3, -4]} intensity={80} color={accent} decay={1.7} />
      <pointLight position={[6, -2, -5]} intensity={60} color="#ffffff" decay={1.7} />
      <group position={[k.x, k.y, 0]} rotation={[k.rx, k.ry, k.rz]}>
        <group position={[-W * k.open * 0 - (1 - k.open) * W * 0.5, 0, (1 - k.open) * T * 0.5]}>
          <Half side={1} screen={tex.inner[mode]} inner={k.inner} back="camera" outerTex={tex.outer} outer={k.outer} />
          <group rotation={[0, hinge, 0]}>
            <Half side={-1} screen={tex.inner[mode]} inner={k.inner} back="outer" outerTex={tex.outer} outer={k.outer} />
          </group>
        </group>
      </group>
      {dof ? (
        <EffectComposer multisampling={4}>
          <DepthOfField worldFocusDistance={k.focus} worldFocusRange={1.2} bokehScale={5} />
          <Bloom intensity={0.45} luminanceThreshold={0.82} mipmapBlur />
          <Vignette offset={0.2} darkness={0.85} />
        </EffectComposer>
      ) : (
        <EffectComposer multisampling={4}>
          <Bloom intensity={0.45} luminanceThreshold={0.82} mipmapBlur />
          <Vignette offset={0.2} darkness={0.85} />
        </EffectComposer>
      )}
    </ThreeCanvas>
  );
};
