import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { ThreeCanvas } from "@remotion/three";
import {
  AbsoluteFill,
  Img,
  continueRender,
  delayRender,
  random,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { useBrand } from "./brand";
import { E, mix, seg } from "./motion";


export const useSvgShapes = (file: string) => {
  const [shapes, setShapes] = useState<THREE.Shape[] | null>(null);
  const [handle] = useState(() => delayRender(`svg ${file}`));
  useEffect(() => {
    fetch(staticFile(file))
      .then((r) => r.text())
      .then((svg) => {
        const data = new SVGLoader().parse(svg);
        setShapes(data.paths.flatMap((p) => SVGLoader.createShapes(p)));
        continueRender(handle);
      });
  }, [file, handle]);
  return shapes;
};

export const StudioEnv: React.FC = () => {
  const { gl, scene } = useThree();
  useLayoutEffect(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    return () => {
      env.dispose();
      pm.dispose();
    };
  }, [gl, scene]);
  return null;
};

export const Particles: React.FC<{ count?: number; spread?: number; drift: number; colors: string[] }> = ({
  count = 500,
  spread = 30,
  drift,
  colors,
}) => {
  const geo = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const palette = [...colors, "#ffffff"].map((c) => new THREE.Color(c));
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (random(`px${i}`) - 0.5) * spread;
      pos[i * 3 + 1] = (random(`py${i}`) - 0.5) * spread * 0.6;
      pos[i * 3 + 2] = -random(`pz${i}`) * spread;
      const c = palette[i % palette.length];
      col.set([c.r, c.g, c.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  }, [count, spread, colors]);
  return (
    <points geometry={geo} position={[0, 0, drift]}>
      <pointsMaterial size={0.06} vertexColors transparent opacity={0.85} sizeAttenuation />
    </points>
  );
};

export const LogoMesh: React.FC<{
  shapes: THREE.Shape[];
  rotation: [number, number, number];
  position: [number, number, number];
  scale: number;
}> = ({ shapes, rotation, position, scale }) => {
  const geo = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(shapes, {
      depth: 2.4,
      bevelEnabled: true,
      bevelThickness: 0.5,
      bevelSize: 0.28,
      bevelSegments: 8,
      curveSegments: 32,
    });
    g.center();
    return g;
  }, [shapes]);
  const s = scale / 24;
  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={geo} scale={[s, -s, s]}>
        <meshPhysicalMaterial
          color="#e9e6e1"
          metalness={0.92}
          roughness={0.18}
          clearcoat={1}
          clearcoatRoughness={0.08}
          envMapIntensity={1.4}
        />
      </mesh>
    </group>
  );
};

const Lights: React.FC<{ sweep: number; accent: string; accent2: string }> = ({ sweep, accent, accent2 }) => (
  <>
    <ambientLight intensity={0.15} />
    <pointLight position={[-6, 2, 5]} intensity={90} color={accent} decay={1.6} />
    <pointLight position={[6, -2, 4]} intensity={80} color={accent2} decay={1.6} />
    <spotLight position={[mix(-10, 10, sweep), 6, 8]} angle={0.35} penumbra={0.8} intensity={260} decay={1.4} />
  </>
);

export const Post: React.FC<{ bloom?: number }> = ({ bloom = 0.9 }) => (
  <EffectComposer multisampling={4}>
    <Bloom intensity={bloom} luminanceThreshold={0.55} luminanceSmoothing={0.25} mipmapBlur />
    <Vignette offset={0.25} darkness={0.75} />
  </EffectComposer>
);

const Reveal: React.FC<{ text: string; start: number; color: string; size: number; font: string }> = ({
  text,
  start,
  color,
  size,
  font,
}) => {
  const f = useCurrentFrame();
  return (
    <div style={{ display: "flex", justifyContent: "center", overflow: "hidden", paddingBottom: size * 0.12 }}>
      {Array.from(text).map((ch, i) => {
        const p = seg(f, start + i * 0.9, 18, E.out);
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              whiteSpace: "pre",
              color,
              fontFamily: font,
              fontWeight: 500,
              fontSize: size,
              letterSpacing: "-0.02em",
              transform: `translateY(${(1 - p) * 110}%) rotate(${(1 - p) * 8}deg)`,
              opacity: p,
              filter: `blur(${(1 - p) * 8}px)`,
            }}
          >
            {ch}
          </span>
        );
      })}
    </div>
  );
};

/** 0–96: chrome logo spins in, headline reveals, camera flies through the logo's center. */
export const Opener: React.FC<{ headline: string[] }> = ({ headline }) => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const b = useBrand();
  const shapes = useSvgShapes(b.logo ?? "brand/logo.svg");
  const enter = seg(f, 0, 55, E.out);
  const fly = seg(f, 60, 32, E.in2);
  const camZ = mix(10, -3, fly);
  const textOut = 1 - seg(f, 58, 10, E.inOut);
  const fadeOut = 1 - seg(f, 86, 10, E.linear);
  return (
    <AbsoluteFill style={{ background: b.ink, opacity: fadeOut }}>
      <ThreeCanvas width={width} height={height} camera={{ position: [0, 0, 10], fov: 35 }}>
        <color attach="background" args={[b.ink]} />
        <CameraZ z={camZ} />
        <StudioEnv />
        <Lights sweep={seg(f, 20, 60, E.sine)} accent={b.accent} accent2={b.accent2} />
        <Particles drift={mix(0, 8, f / 96)} colors={[b.accent, b.accent2]} />
        {shapes && (
          <LogoMesh
            shapes={shapes}
            scale={3.5}
            position={[0, mix(0.9, 1.3, enter) * (1 - seg(f, 54, 14, E.inOut)), mix(-16, 0, enter)]}
            rotation={[mix(0.9, 0.12, enter), mix(-Math.PI * 2.5, 0, enter) + Math.sin(f / 18) * 0.06, 0]}
          />
        )}
        <Post />
      </ThreeCanvas>
      <AbsoluteFill style={{ justifyContent: "flex-end", paddingBottom: 100, opacity: textOut }}>
        {headline.map((line, i) => (
          <Reveal
            key={line}
            text={line}
            start={30 + i * 12}
            color={i === headline.length - 1 ? b.accent : "#F5F3EF"}
            size={84}
            font={b.display}
          />
        ))}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const CameraZ: React.FC<{ z: number; x?: number; y?: number }> = ({ z, x = 0, y = 0 }) => {
  const { camera } = useThree();
  camera.position.set(x, y, z);
  camera.lookAt(x, y, z - 10);
  return null;
};

/** Final card: logo lands with a light sweep, wordmark and CTA follow. */
export const EndCard: React.FC<{ cta?: string; url?: string; ctaAccent?: boolean }> = ({ cta, url, ctaAccent }) => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const b = useBrand();
  const shapes = useSvgShapes(b.logo ?? "brand/logo.svg");
  const land = seg(f, 0, 40, E.out);
  const fadeIn = seg(f, 0, 6, E.linear);
  return (
    <AbsoluteFill style={{ background: b.ink, opacity: fadeIn }}>
      <ThreeCanvas width={width} height={height} camera={{ position: [0, 0, 10], fov: 35 }}>
        <color attach="background" args={[b.ink]} />
        <StudioEnv />
        <Lights sweep={seg(f, 6, 50, E.inOut)} accent={b.accent} accent2={b.accent2} />
        <Particles drift={mix(2, 4, f / 80)} count={300} colors={[b.accent, b.accent2]} />
        {shapes && (
          <LogoMesh
            shapes={shapes}
            scale={mix(9, 2.6, land)}
            position={[0, mix(0, 1.55, land), 0]}
            rotation={[0.08 * (1 - land), mix(Math.PI * 1.5, 0, land) + Math.sin(f / 20) * 0.08, 0]}
          />
        )}
        <Post bloom={0.7} />
      </ThreeCanvas>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", paddingTop: 330, gap: 34 }}>
        <div style={{ opacity: seg(f, 16, 14), transform: `translateY(${(1 - seg(f, 16, 20)) * 24}px)` }}>
          {b.wordmark ? (
            <Img src={staticFile(b.wordmark)} style={{ height: 64, filter: "invert(1)" }} />
          ) : (
            <div style={{ fontFamily: b.display, fontSize: 72, color: "#F5F3EF" }}>{b.name}</div>
          )}
        </div>
        {cta && (
          <div
            style={{
              opacity: seg(f, 26, 14),
              transform: `scale(${mix(0.85, 1, seg(f, 26, 22, E.back))})`,
              background: ctaAccent ? b.accent : "#F5F3EF",
              color: ctaAccent ? "#FFFFFF" : b.ink,
              borderRadius: 999,
              padding: "18px 46px",
              fontFamily: b.body,
              fontWeight: 600,
              fontSize: 30,
            }}
          >
            {cta}
          </div>
        )}
        {url && (
          <div style={{ opacity: seg(f, 34, 14), color: "rgba(245,243,239,0.6)", fontFamily: b.body, fontSize: 26, letterSpacing: "0.06em" }}>
            {url}
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
