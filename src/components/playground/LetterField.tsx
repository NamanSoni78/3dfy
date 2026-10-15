"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import {
  CuboidCollider,
  RigidBody,
  useRapier,
  type RapierRigidBody,
} from "@react-three/rapier";
import type { ThreeEvent } from "@react-three/fiber";
import { sfx, haptic } from "@/lib/audio";
import { createMaterial, materialRestitution, type MaterialPreset } from "@/lib/three/materials";
import { glowTexture } from "@/lib/three/textures";
import { motion, trailFX, fieldApi } from "@/lib/playground-runtime";
import { usePlayground, type Difficulty } from "@/lib/playground-store";

export interface LetterSpec {
  id: string;
  char: string;
  geo: THREE.BufferGeometry;
  x: number;
  y: number;
  w: number;
  h: number;
  d: number;
  color: string;
}

export interface Bounds {
  halfW: number;
  halfH: number;
}

interface Entry {
  id: string;
  rb: RapierRigidBody | null;
  group: THREE.Group | null;
  mat: THREE.Material | null;
  home: THREE.Vector3;
  broken: boolean;
  stress: number;
  flash: number;
  squeeze: number;
}

interface DragState {
  id: string;
  pointerId: number;
  target: THREE.Vector3;
  moved: number;
}

interface SqueezeState {
  id: string;
  base: number;
  baseDist: number;
}

interface ZoomState {
  baseDist: number;
  baseZoom: number;
}

const DIFF: Record<Difficulty, { breakThreshold: number; gravityScale: number; chaos: boolean }> = {
  zen: { breakThreshold: Infinity, gravityScale: 0.72, chaos: false },
  normal: { breakThreshold: 3.1, gravityScale: 1, chaos: false },
  chaos: { breakThreshold: 2.0, gravityScale: 1.05, chaos: true },
};

const LEAN = new THREE.Vector3();

function matColor(mat: THREE.Material | null): THREE.ColorRepresentation {
  const std = mat as THREE.MeshStandardMaterial | null;
  return std && std.color ? std.color : "#FF6EC7";
}

export function LetterField({
  specs,
  bounds,
  material,
  difficulty,
}: {
  specs: LetterSpec[];
  bounds: Bounds;
  material: MaterialPreset;
  difficulty: Difficulty;
}) {
  const { gl, camera } = useThree();
  const { world } = useRapier();
  const entries = useRef(new Map<string, Entry>());
  const drag = useRef<DragState | null>(null);
  const squeeze = useRef<SqueezeState | null>(null);
  const zoom = useRef<ZoomState | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const preset = useRef<{ type: "spin" | "wave" | "bounce" | "orbit"; start: number; next: number } | null>(null);
  const chaosNext = useRef(0);
  const chaosUntil = useRef(0);
  const chaosMode = useRef<"flip" | "zero" | "burst">("burst");
  const bump = usePlayground((s) => s.bump);
  const soundGate = useRef(0);

  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const dragPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);
  const hit = useMemo(() => new THREE.Vector3(), []);

  /* ---------------------- field API (HUD hooks) ---------------------- */

  useEffect(() => {
    fieldApi.shake = (intensity, dx, dy) => {
      const now = performance.now();
      if (now - soundGate.current > 90) {
        soundGate.current = now;
        sfx.play("whoosh", { vol: 0.4 + intensity * 0.6 });
        haptic([20, 30, 20 + intensity * 40]);
      }
      bump("shakes");
      const mag = 2.2 + intensity * 3.4;
      for (const e of entries.current.values()) {
        const rb = e.rb;
        if (!rb) continue;
        const m = Math.max(0.2, rb.mass());
        const jx = (dx * 0.9 + (Math.random() - 0.5)) * mag * m;
        const jy = (dy * 0.8 + Math.random() * 0.7) * mag * m;
        rb.applyImpulse({ x: jx, y: jy, z: (Math.random() - 0.5) * mag * 0.3 * m }, true);
        rb.applyTorqueImpulse({ x: 0, y: 0, z: (Math.random() - 0.5) * mag * 1.6 * m }, true);
        if (Number.isFinite(DIFF[difficulty].breakThreshold)) {
          e.stress += intensity * 0.42;
        }
      }
    };
    fieldApi.preset = (type) => {
      preset.current = { type, start: performance.now(), next: 0 };
      bump("presets");
      sfx.play("sparkle");
      haptic(15);
      for (const e of entries.current.values()) {
        const rb = e.rb;
        if (!rb) continue;
        const m = Math.max(0.2, rb.mass());
        if (type === "spin") {
          rb.applyTorqueImpulse({ x: 0, y: 0, z: (Math.random() > 0.5 ? 1 : -1) * 3.2 * m }, true);
        } else if (type === "orbit") {
          const p = rb.translation();
          const tang = new THREE.Vector2(-p.y, p.x).normalize().multiplyScalar(4.2 * m);
          rb.applyImpulse({ x: tang.x, y: tang.y, z: 0 }, true);
        } else if (type === "bounce") {
          rb.applyImpulse({ x: 0, y: 6.5 * m, z: 0 }, true);
        }
      }
    };
    return () => {
      fieldApi.shake = () => {};
      fieldApi.preset = () => {};
    };
  }, [difficulty, bump]);

  /* --------------------- spawn cascade sounds ---------------------- */

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    specs.forEach((s, i) => {
      timers.push(setTimeout(() => sfx.play("spawn", { pitch: 0.85 + i * 0.07, vol: 0.4 }), i * 95));
    });
    bump("lettersMade", specs.length);
    return () => timers.forEach(clearTimeout);
  }, [specs]);

  /* ------------------------- interaction --------------------------- */

  function pointToTarget(clientX: number, clientY: number): THREE.Vector3 | null {
    const r = gl.domElement.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray.intersectPlane(dragPlane, hit) ? hit : null;
  }

  function onLetterGrab(e: ThreeEvent<PointerEvent>, spec: LetterSpec): void {
    e.stopPropagation();
    sfx.unlock();
    const existing = drag.current;
    if (existing && existing.id === spec.id && existing.pointerId !== e.pointerId) {
      // second finger on the same letter → squeeze mode
      const p1 = pointers.current.get(existing.pointerId);
      if (p1) {
        squeeze.current = {
          id: spec.id,
          base: 1,
          baseDist: Math.hypot(e.nativeEvent.clientX - p1.x, e.nativeEvent.clientY - p1.y) || 1,
        };
        sfx.play("tick");
        return;
      }
    }
    if (existing) return;
    const target = pointToTarget(e.nativeEvent.clientX, e.nativeEvent.clientY);
    if (!target) return;
    drag.current = { id: spec.id, pointerId: e.pointerId, target: target.clone(), moved: 0 };
    const entry = entries.current.get(spec.id);
    entry?.rb?.wakeUp();
    if (entry) entry.flash = 0.7;
    bump("drags");
    sfx.play("pop", { pitch: 0.9 + Math.random() * 0.4, vol: 0.35 });
    haptic(8);
  }

  useEffect(() => {
    const el = gl.domElement;

    const onDown = (e: PointerEvent) => {
      sfx.unlock();
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size === 2 && !drag.current && !squeeze.current) {
        const [a, b] = [...pointers.current.values()];
        zoom.current = { baseDist: Math.hypot(a.x - b.x, a.y - b.y) || 1, baseZoom: motion.zoom };
      }
    };

    const onMove = (e: PointerEvent) => {
      const p = pointers.current.get(e.pointerId);
      if (p) {
        p.x = e.clientX;
        p.y = e.clientY;
      }
      if (zoom.current && pointers.current.size >= 2) {
        const [a, b] = [...pointers.current.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        motion.zoom = THREE.MathUtils.clamp(
          zoom.current.baseZoom * (dist / zoom.current.baseDist), 0.6, 2.1,
        );
        return;
      }
      const sq = squeeze.current;
      if (sq && pointers.current.size >= 2) {
        const [a, b] = [...pointers.current.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const entry = entries.current.get(sq.id);
        if (entry) {
          entry.squeeze = THREE.MathUtils.clamp(sq.base * (dist / sq.baseDist), 0.42, 1.6);
        }
        return;
      }
      const d = drag.current;
      if (d && e.pointerId === d.pointerId) {
        const t = pointToTarget(e.clientX, e.clientY);
        if (t) {
          d.moved += t.distanceTo(d.target);
          d.target.copy(t);
        }
      }
    };

    const onUp = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId);
      if (zoom.current && pointers.current.size < 2) zoom.current = null;
      const sq = squeeze.current;
      if (sq) {
        const entry = entries.current.get(sq.id);
        if (entry && entry.squeeze < 0.95) {
          sfx.play("boing", { pitch: 0.75, vol: 0.4 });
          haptic(12);
          bump("squeezes");
        }
        squeeze.current = null;
      }
      const d = drag.current;
      if (d && e.pointerId === d.pointerId) {
        const entry = entries.current.get(d.id);
        if (entry) {
          const stretch = entry.rb
            ? LEAN.set(entry.rb.translation().x, entry.rb.translation().y, 0).distanceTo(entry.home)
            : 0;
          if (d.moved > 1.4) {
            bump("dragDistance", Math.round(d.moved * 10) / 10);
          }
          if (stretch > 1.1) {
            sfx.play("boing", { vol: 0.4 });
            if (entry.rb) {
              const pos = entry.rb.translation();
              trailFX.spawn(pos.x, pos.y, pos.z, matColor(entry.mat), { count: 8, speed: 2.2 });
            }
          }
        }
        drag.current = null;
      }
    };

    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [gl, camera, raycaster, dragPlane, ndc, bump]);

  /* --------------------------- physics loop ------------------------- */

  useFrame((_state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    const diff = DIFF[difficulty];
    const now = performance.now();

    // gravity from tilt (roll slides letters sideways, pitch presses them back/forward)
    const gx = THREE.MathUtils.clamp(motion.tiltX, -1, 1) * 9.81 * 1.2;
    const gz = -THREE.MathUtils.clamp(motion.tiltZ, -1, 1) * 9.81 * 0.85;
    const gy = -9.81 * diff.gravityScale;

    const setGravity = (x: number, y: number, z: number) => {
      // eslint-disable-next-line react-hooks/immutability -- Rapier's world gravity is a mutable engine value
      world.gravity = { x, y, z };
    };

    // chaos events
    if (diff.chaos) {
      if (now > chaosNext.current) {
        chaosNext.current = now + 1800 + Math.random() * 2200;
        chaosUntil.current = now + 800;
        chaosMode.current = (["flip", "zero", "burst"] as const)[Math.floor(Math.random() * 3)];
        if (chaosMode.current === "burst") {
          for (const e of entries.current.values()) {
            const rb = e.rb;
            if (!rb) continue;
            const m = Math.max(0.2, rb.mass());
            rb.applyImpulse({ x: (Math.random() - 0.5) * 5 * m, y: (3 + Math.random() * 4) * m, z: 0 }, true);
          }
          sfx.play("whoosh", { vol: 0.5 });
        }
      }
      if (now < chaosUntil.current) {
        if (chaosMode.current === "flip") setGravity(9.81 * (Math.random() > 0.5 ? 1 : -1), -2, 0);
        else if (chaosMode.current === "zero") setGravity(0, 0.4, 0);
        else setGravity(gx, gy, gz);
      } else {
        setGravity(gx, gy, gz);
      }
    } else {
      setGravity(gx, gy, gz);
    }

    // preset program
    const pr = preset.current;
    if (pr) {
      const t = (now - pr.start) / 1000;
      if (t > (pr.type === "orbit" ? 6 : 4)) preset.current = null;
      else if (now > pr.next) {
        pr.next = now + 420;
        let i = 0;
        for (const e of entries.current.values()) {
          const rb = e.rb;
          if (!rb) continue;
          const m = Math.max(0.2, rb.mass());
          if (pr.type === "wave") {
            rb.applyImpulse({ x: 0, y: Math.sin(t * 5.2 + i * 0.85) * 2.6 * m, z: 0 }, true);
          } else if (pr.type === "bounce" && (i + Math.floor(t * 2)) % 2 === 0) {
            rb.applyImpulse({ x: 0, y: 5.2 * m, z: 0 }, true);
          } else if (pr.type === "spin") {
            rb.applyTorqueImpulse({ x: 0, y: 0, z: (i % 2 === 0 ? 1 : -1) * 2.4 * m }, true);
          }
          i++;
        }
      }
      if (pr.type === "orbit") {
        for (const e of entries.current.values()) {
          const rb = e.rb;
          if (!rb) continue;
          const p = rb.translation();
          const m = Math.max(0.2, rb.mass());
          rb.applyImpulse({ x: -p.x * 5.5 * m * dt * 60 * 0.02, y: -p.y * 5.5 * m * dt * 60 * 0.02, z: 0 }, true);
        }
      }
    }

    for (const e of entries.current.values()) {
      const rb = e.rb;
      if (!rb) continue;
      const m = Math.max(0.2, rb.mass());
      const pos = rb.translation();
      const vel = rb.linvel();
      const dragging = drag.current?.id === e.id;

      // squeeze visual + recovery
      if (e.squeeze !== 1) {
        e.squeeze += (1 - e.squeeze) * Math.min(1, dt * 9);
        if (Math.abs(e.squeeze - 1) < 0.005) e.squeeze = 1;
      }
      if (e.group) {
        e.group.scale.set(e.squeeze, Math.pow(e.squeeze, -0.55), e.squeeze);
      }

      // springs
      if (!e.broken) {
        if (dragging) {
          const t = drag.current!.target;
          const fx = (t.x - pos.x) * 300 * m - vel.x * 16 * m;
          const fy = (t.y - pos.y) * 300 * m - vel.y * 16 * m;
          rb.applyImpulse({ x: fx * dt, y: fy * dt, z: 0 }, true);
          // candy trail while dragged fast
          const sp = Math.hypot(vel.x, vel.y);
          if (sp > 2.4) {
            trailFX.spawn(pos.x, pos.y, pos.z, matColor(e.mat), { count: 2, speed: 1.1, size: 0.15 });
          }
        } else {
          const fx = (e.home.x - pos.x) * 92 * m - vel.x * 8.6 * m;
          const fy = (e.home.y - pos.y) * 92 * m - vel.y * 8.6 * m;
          rb.applyImpulse({ x: fx * dt, y: fy * dt, z: (0 - pos.z) * 40 * m * dt }, true);

          // upright torque spring
          const q = rb.rotation();
          const angle = 2 * Math.acos(THREE.MathUtils.clamp(q.w, -1, 1));
          if (angle > 0.02 && angle < Math.PI - 0.02) {
            const s = Math.sqrt(1 - q.w * q.w) || 1;
            const axis = { x: q.x / s, y: q.y / s, z: q.z / s };
            const ang = rb.angvel();
            rb.applyTorqueImpulse({
              x: (axis.x * angle * 7 - ang.x * 0.9) * m * dt * 8,
              y: (axis.y * angle * 7 - ang.y * 0.9) * m * dt * 8,
              z: (axis.z * angle * 7 - ang.z * 0.9) * m * dt * 8,
            }, true);
          }
        }

        // stress / breaking — needs a sustained hard overstretch
        const stretch = Math.hypot(e.home.x - pos.x, e.home.y - pos.y);
        if (!dragging && Number.isFinite(diff.breakThreshold)) {
          if (stretch > diff.breakThreshold * 0.8) {
            e.stress += dt * (stretch / diff.breakThreshold - 0.55);
          } else {
            e.stress = Math.max(0, e.stress - dt * 0.5);
          }
          if (e.stress > 1.15) {
            e.broken = true;
            e.stress = 0;
            e.flash = 1;
            bump("breaks");
            sfx.play("break");
            haptic([30, 50, 80]);
            trailFX.spawn(pos.x, pos.y, pos.z, matColor(e.mat), { count: 16, speed: 3, size: 0.22 });
          }
        }
      } else if (dragging) {
        const t = drag.current!.target;
        rb.applyImpulse({
          x: ((t.x - pos.x) * 300 - vel.x * 16) * m * dt,
          y: ((t.y - pos.y) * 300 - vel.y * 16) * m * dt,
          z: 0,
        }, true);
      }

      // shake trails
      if (Math.hypot(vel.x, vel.y) > 5.5) {
        trailFX.spawn(pos.x, pos.y, pos.z, matColor(e.mat), { count: 1, speed: 0.8, size: 0.13 });
      }

      // flash decay
      if (e.flash > 0) {
        e.flash = Math.max(0, e.flash - dt * 2.4);
        const std = e.mat as THREE.MeshStandardMaterial | null;
        if (std && "emissive" in std && material !== "neon") {
          std.emissive.setScalar(e.flash * 0.85);
        }
      }
    }
  });

  /* ------------------------------ render ---------------------------- */

  return (
    <group>
      {specs.map((spec, i) => (
        <Letter
          key={spec.id}
          spec={spec}
          index={i}
          bounds={bounds}
          material={material}
          onGrab={onLetterGrab}
          register={(id, rb, group, mat, home) => {
            entries.current.set(id, { id, rb, group, mat, home, broken: false, stress: 0, flash: 0, squeeze: 1 });
          }}
          unregister={(id) => entries.current.delete(id)}
        />
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */

function Letter({
  spec,
  index,
  bounds,
  material,
  onGrab,
  register,
  unregister,
}: {
  spec: LetterSpec;
  index: number;
  bounds: Bounds;
  material: MaterialPreset;
  onGrab: (e: ThreeEvent<PointerEvent>, spec: LetterSpec) => void;
  register: (id: string, rb: RapierRigidBody | null, group: THREE.Group | null, mat: THREE.Material | null, home: THREE.Vector3) => void;
  unregister: (id: string) => void;
}) {
  const rbRef = useRef<RapierRigidBody>(null);
  const groupRef = useRef<THREE.Group>(null);
  const spriteRef = useRef<THREE.Sprite>(null);

  const mat = useMemo(() => {
    const m = createMaterial(material, {
      color: spec.color,
      emissive: material === "neon" ? spec.color : undefined,
      emissiveIntensity: material === "neon" ? 2.6 : undefined,
    });
    return m;
  }, [material, spec.color]);

  const glow = useMemo(() => glowTexture(), []);

  useEffect(() => {
    return () => mat.dispose();
  }, [mat]);

  useEffect(() => {
    register(spec.id, rbRef.current, groupRef.current, mat, new THREE.Vector3(spec.x, spec.y, 0));
    return () => unregister(spec.id);
  }, [spec.id, mat]);

  const pad = 0.09;
  // spawn INSIDE the arena (below the ceiling wall) with a downward kick
  const h = spec.h;
  const spawnY = THREE.MathUtils.clamp(
    spec.y + 1.6 + index * 0.35,
    -bounds.halfH + h / 2 + 0.15,
    bounds.halfH - h / 2 - 0.2,
  );
  const maxDim = Math.max(spec.w, spec.h) * 1.8 + 0.3;

  return (
    <RigidBody
      ref={rbRef}
      colliders={false}
      position={[spec.x, spawnY, (Math.random() - 0.5) * 0.3]}
      rotation={[(Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.5]}
      linearVelocity={[0, -2.5 - index * 0.4, 0]}
      canSleep={false}
      linearDamping={0.06}
      angularDamping={0.55}
    >
      <CuboidCollider
        args={[spec.w / 2 + pad, spec.h / 2 + pad, spec.d / 2 + 0.05]}
        restitution={materialRestitution(material)}
        friction={0.55}
        density={1.1}
      />
      <group ref={groupRef}>
        <mesh
          geometry={spec.geo}
          material={mat}
          onPointerDown={(e) => onGrab(e, spec)}
        />
        {material === "neon" && (
          <sprite ref={spriteRef} scale={[maxDim, maxDim, 1]}>
            <spriteMaterial
              map={glow}
              color={spec.color}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              opacity={0.85}
            />
          </sprite>
        )}
      </group>
    </RigidBody>
  );
}
