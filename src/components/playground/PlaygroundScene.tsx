"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Physics, RigidBody, CuboidCollider } from "@react-three/rapier";
import { Environment, Lightformer } from "@react-three/drei";
import { usePlayground } from "@/lib/playground-store";
import { motion, trailFX, fieldApi, type FieldApi } from "@/lib/playground-runtime";
import { getFont } from "@/lib/three/fonts";
import { layoutWord } from "@/lib/three/geometry";
import { gradientTexture, spriteTexture } from "@/lib/three/textures";
import { CANDY, shade } from "@/lib/palette";
import { LetterField, type LetterSpec, type Bounds } from "./LetterField";

export interface CaptureHandle {
  gl: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
}

const FOV = 44;
const ROW_H = 1.24;

/* ---------------------- spec building (word layout) ---------------- */

function buildSpecs(
  text: string,
  fontId: string,
  colorMode: string,
  color: string,
  aspect: number,
): Promise<LetterSpec[]> {
  return getFont(fontId).then((font) => {
    const name = [...text.trim()].slice(0, 14).join("") || "?";
    // wrap rows for narrow screens — keep every row comfortably inside the view
    const maxRowW = aspect > 1.5 ? 9.5 : aspect > 0.95 ? 6.8 : aspect > 0.62 ? 4.4 : 3.4;
    const { slots } = layoutWord(name, font, { size: 1, depth: 0.38 });
    const rows: typeof slots[] = [];
    let row: typeof slots = [];
    let rowW = 0;
    for (const s of slots) {
      const next = rowW === 0 ? s.w : rowW + 0.09 + s.w;
      if (next > maxRowW && row.length) {
        rows.push(row);
        row = [];
        rowW = 0;
      }
      rowW = rowW === 0 ? s.w : rowW + 0.09 + s.w;
      row.push(s);
    }
    if (row.length) rows.push(row);

    const cA = new THREE.Color(colorMode === "single" ? color : CANDY[Math.floor(Math.random() * CANDY.length)]);
    const cB = new THREE.Color(CANDY[Math.floor(Math.random() * CANDY.length)]);
    const rowCount = rows.length;
    const specs: LetterSpec[] = [];
    rows.forEach((r, ri) => {
      const total = r.reduce((sum, s) => sum + s.w + 0.09, 0) - 0.09;
      let x = -total / 2;
      r.forEach((s) => {
        x += s.w / 2;
        const t = rowCount === 1 ? 0.5 : ri / (rowCount - 1);
        const base =
          colorMode === "single" ? cA :
          colorMode === "gradient" ? cA.clone().lerp(cB, t) :
          new THREE.Color(CANDY[(specs.length * 3 + 2) % CANDY.length]);
        const jitter = (Math.random() - 0.5) * 0.1;
        const col = shade("#" + base.getHexString(), jitter);
        const d = s.geo.boundingBox ? s.geo.boundingBox.max.z - s.geo.boundingBox.min.z : 0.4;
        specs.push({
          id: globalThis.crypto.randomUUID(),
          char: s.char,
          geo: s.geo,
          x,
          y: (rowCount - 1) * 0.62 - ri * ROW_H,
          w: s.w,
          h: s.h,
          d,
          color: col,
        });
        x += s.w / 2 + 0.09;
      });
    });
    return specs;
  });
}

/* ------------------------------- scene ----------------------------- */

export default function PlaygroundScene({
  onCaptureReady,
  rebuildSignal,
}: {
  onCaptureReady: (h: CaptureHandle) => void;
  rebuildSignal: number;
}) {
  const settings = usePlayground((s) => s.settings);
  const [specs, setSpecs] = useState<LetterSpec[] | null>(null);
  const [nonce, setNonce] = useState(0);
  const [aspect, setAspect] = useState(1);

  useEffect(() => {
    const update = () => setAspect(window.innerWidth / Math.max(1, window.innerHeight));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    buildSpecs(settings.name, settings.font, settings.colorMode, settings.color, aspect)
      .then((s) => {
        if (alive) setSpecs(s);
      })
      .catch(() => {
        if (alive) setSpecs([]);
      });
    return () => {
      alive = false;
    };
  }, [settings.name, settings.font, settings.colorMode, settings.color, aspect, nonce, rebuildSignal]);

  useEffect(() => {
    const api: FieldApi = {
      ...fieldApi,
      rebuild: () => setNonce((n) => n + 1),
    };
    Object.assign(fieldApi, api);
    return () => {
      fieldApi.rebuild = () => {};
    };
  }, []);

  /* ── framing: fit BOTH width and height with real margins ── */
  const totalW = useMemo(() => {
    if (!specs?.length) return 4;
    return Math.max(...specs.map((s) => Math.abs(s.x) + s.w / 2)) * 2;
  }, [specs]);
  const rows = useMemo(() => new Set(specs?.map((s) => s.y)).size, [specs]);
  const totalH = (rows - 1) * ROW_H + 1.1;

  const baseDist = useMemo(() => {
    const vHalf = Math.tan((FOV * Math.PI) / 360);
    const hHalf = vHalf * Math.max(aspect, 0.4);
    // 82% of the view width, 76% of the view height, plus room for tilt-pan
    const needW = (totalW / 2 + 0.95) / (hHalf * 0.82);
    const needH = (totalH / 2 + 0.95) / (vHalf * 0.76);
    return Math.min(24, Math.max(5.2, Math.max(needW, needH)));
  }, [totalW, totalH, aspect, rows]);

  const bounds = useMemo<Bounds>(() => {
    const vHalf = Math.tan((FOV * Math.PI) / 360);
    const halfH = vHalf * baseDist + 1.35; // extra room so tilting never pushes letters out
    const halfW = vHalf * baseDist * Math.max(aspect, 0.4) + 1.35;
    return { halfW, halfH };
  }, [baseDist, aspect]);

  return (
    <Canvas
      flat
      dpr={[1, 2]}
      gl={{ antialias: true, preserveDrawingBuffer: true, alpha: false }}
      camera={{ fov: FOV, position: [0, 0, 10], near: 0.1, far: 300 }}
      style={{ touchAction: "none" }}
    >
      <Sky />
      <ambientLight intensity={1.2} />
      <directionalLight position={[4, 7, 6]} intensity={0.9} />
      <Environment resolution={64}>
        <Lightformer intensity={1.6} position={[0, 5, 0]} scale={[10, 10, 1]} color="#ffffff" />
        <Lightformer intensity={0.8} position={[-6, 1, 2]} scale={[6, 6, 1]} color="#ffd6f2" />
        <Lightformer intensity={0.8} position={[6, -1, 2]} scale={[6, 6, 1]} color="#c9f4ff" />
      </Environment>
      {specs && (
        <Physics timeStep={1 / 60} gravity={[0, -9.81, 0]}>
          <LetterField
            specs={specs}
            bounds={bounds}
            material={settings.material}
            difficulty={settings.difficulty}
          />
          <Boundary bounds={bounds} />
        </Physics>
      )}
      <CameraRig baseDist={baseDist} />
      <Trails />
      <CaptureBridge onReady={onCaptureReady} />
    </Canvas>
  );
}

/* ------------------------------- parts ----------------------------- */

function Sky() {
  // studio-dark gradient — makes candy materials pop like a product render
  const tex = useMemo(() => gradientTexture("#1D2330", "#39445C"), []);
  return (
    <mesh scale={[90, 90, 90]}>
      <sphereGeometry args={[1, 24, 16]} />
      <meshBasicMaterial map={tex} side={THREE.BackSide} depthWrite={false} fog={false} toneMapped={false} />
    </mesh>
  );
}

function Boundary({ bounds }: { bounds: Bounds }) {
  const { halfW, halfH } = bounds;
  const d = 3;
  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider position={[-(halfW + 0.45), 0, 0]} args={[0.3, halfH * 3 + 4, d]} restitution={0.4} />
        <CuboidCollider position={[halfW + 0.45, 0, 0]} args={[0.3, halfH * 3 + 4, d]} restitution={0.4} />
        <CuboidCollider position={[0, -(halfH + 0.45), 0]} args={[halfW * 2 + 4, 0.3, d]} restitution={0.45} />
        <CuboidCollider position={[0, halfH + 0.45, 0]} args={[halfW * 2 + 4, 0.3, d]} restitution={0.45} />
        <CuboidCollider position={[0, 0, -1.7]} args={[halfW * 2 + 4, halfH * 3 + 4, 0.3]} restitution={0.3} />
        <CuboidCollider position={[0, 0, 1.7]} args={[halfW * 2 + 4, halfH * 3 + 4, 0.3]} restitution={0.3} />
      </RigidBody>
    </group>
  );
}

function CameraRig({ baseDist }: { baseDist: number }) {
  const { camera } = useThree();
  const cur = useRef(new THREE.Vector3(0, 0.2, baseDist));
  useFrame((_s, dt) => {
    const k = Math.min(1, dt * 6);
    // tilt-pan is clamped so letters can never leave the frame
    const tiltX = Math.max(-0.8, Math.min(0.8, motion.tiltX));
    const tiltZ = Math.max(-0.8, Math.min(0.8, motion.tiltZ));
    const zoom = Math.max(0.55, Math.min(1.7, motion.zoom));
    const target = new THREE.Vector3(
      tiltX * 0.85,
      -tiltZ * 0.5 + 0.15,
      baseDist * zoom,
    );
    cur.current.lerp(target, k);
    camera.position.copy(cur.current);
    camera.lookAt(0, 0, 0);
  });
  return null;
}

const POOL = 600;

function Trails() {
  const { scene } = useThree();
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const colors = new Float32Array(POOL * 3).fill(1);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    trailFX.attach(mesh);
    return () => trailFX.detach();
  }, [scene]);
  useFrame((_s, dt) => trailFX.step(Math.min(dt, 1 / 20)));
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, POOL]} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        map={spriteTexture("circle")}
        toneMapped={false}
      />
    </instancedMesh>
  );
}

function CaptureBridge({ onReady }: { onReady: (h: CaptureHandle) => void }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    onReady({ gl, scene, camera: camera as THREE.PerspectiveCamera });
  }, [gl, scene, camera, onReady]);
  return null;
}
