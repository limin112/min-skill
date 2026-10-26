import React, { useLayoutEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { ThreeCanvas } from "@remotion/three";
import { useCurrentFrame, useVideoConfig } from "remotion";
import * as THREE from "three";
import { Post, StudioEnv } from "./Logo3D";
import { E, mix, seg } from "./motion";

const N = 24;
const GAP = 1.0;
const LOW = new THREE.Color("#1636FF");
const HIGH = new THREE.Color("#C4FF12");

const Field: React.FC<{ t: number; collapse: number; rise: number }> = ({ t, collapse, rise }) => {
  const ref = useRef<THREE.InstancedMesh>(null);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    let k = 0;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const x = (i - (N - 1) / 2) * GAP;
        const z = (j - (N - 1) / 2) * GAP;
        const d = Math.hypot(x, z);
        const wave = 0.5 + 0.5 * Math.sin(d * 0.75 - t * 0.28);
        const appear = Math.min(1, Math.max(0, (rise * 18 - d) / 3));
        const h = Math.max(0.02, (0.15 + 2.6 * wave * wave) * appear * (1 - collapse));
        tmp.position.set(x, h / 2, z);
        tmp.scale.set(0.82, h, 0.82);
        tmp.updateMatrix();
        m.setMatrixAt(k, tmp.matrix);
        col.copy(LOW).lerp(HIGH, Math.min(1, wave * wave * 1.2));
        m.setColorAt(k, col);
        k++;
      }
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [t, collapse, rise, tmp, col]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, N * N]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshPhysicalMaterial metalness={0.55} roughness={0.32} clearcoat={0.6} envMapIntensity={0.45} />
    </instancedMesh>
  );
};

const Cam: React.FC<{ f: number }> = ({ f }) => {
  const { camera } = useThree();
  const o = seg(f, 0, 44, E.inOut);
  const back = seg(f, 58, 17, E.inOut);
  const ang = mix(0, Math.PI * 0.35, o) + f * 0.006;
  const r = mix(0.01, 20, o) * (1 - back) + 0.01 * back;
  const y = mix(34, 11, o) * (1 - back) + 34 * back;
  camera.position.set(Math.sin(ang) * r, y, Math.cos(ang) * r);
  camera.lookAt(0, 0, 0);
  return null;
};

const Exposure: React.FC<{ v: number }> = ({ v }) => {
  const { gl } = useThree();
  gl.toneMappingExposure = v;
  return null;
};

export const CubeField: React.FC = () => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  return (
    <ThreeCanvas width={width} height={height} camera={{ position: [0, 34, 0.01], fov: 38 }} style={{ position: "absolute", inset: 0 }}>
      <color attach="background" args={["#0A0A0B"]} />
      <StudioEnv />
      <Exposure v={0.72} />
      <ambientLight intensity={0.12} />
      <directionalLight position={[10, 20, 8]} intensity={1.6} />
      <pointLight position={[-12, 6, -6]} intensity={70} color="#2B59FF" decay={1.5} />
      <pointLight position={[12, 6, 10]} intensity={50} color="#D7FF3B" decay={1.5} />
      <Cam f={f} />
      <Field t={f} rise={seg(f, 0, 30, E.out)} collapse={seg(f, 58, 14, E.in2)} />
      <Post bloom={0.45} />
    </ThreeCanvas>
  );
};
