"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { spriteTexture, type SpriteKind } from "@/lib/three/textures";
import type { ParticleConfig } from "@/lib/editor/types";

interface P {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; maxLife: number;
  size: number; colorIndex: number; rot: number; spin: number;
}

/**
 * Per-object particle effects — instanced sprites spawned around the
 * tracked object's world position. Stays a sibling of the object so
 * object scale doesn't distort particles.
 */
export function ParticleFX({
  config,
  intensity,
  getOrigin,
}: {
  config: ParticleConfig;
  intensity: number;
  getOrigin: () => THREE.Object3D | null;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const origin = useMemo(() => new THREE.Vector3(), []);

  /** particle pool — deliberately a mutable ref (hot path, runs every frame) */
  const particlesRef = useRef<P[]>([]);

  const colors = useMemo(
    () => config.colors.map((c) => new THREE.Color(c)),
    [config.colors],
  );

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const arr = new Float32Array(config.count * 3).fill(1);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(arr, 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    const mat = mesh.material as THREE.MeshBasicMaterial;
    mat.map = spriteTexture(config.shape as SpriteKind);
    mat.blending = config.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    mat.transparent = true;
    mat.depthWrite = false;
    mat.needsUpdate = true;
    particlesRef.current.length = 0;
  }, [config.shape, config.count, config.additive]);

  const spawnAcc = useRef(0);
  const mat = useMemo(() => new THREE.Matrix4(), []);
  const quat = useMemo(() => new THREE.Quaternion(), []);
  const eul = useMemo(() => new THREE.Euler(), []);
  const scale = useMemo(() => new THREE.Vector3(), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const col = useMemo(() => new THREE.Color(), []);

  useFrame((_s, rawDt) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const particles = particlesRef.current;
    const dt = Math.min(rawDt, 1 / 20);
    const o = getOrigin();
    if (o) o.getWorldPosition(origin);

    // spawn
    spawnAcc.current += dt * config.rate * intensity;
    while (spawnAcc.current >= 1 && particles.length < config.count) {
      spawnAcc.current -= 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * config.spread;
      const sp = config.speed * (0.4 + Math.random() * 0.9) * (0.6 + intensity * 0.5);
      particles.push({
        x: origin.x + Math.cos(a) * r,
        y: origin.y + (config.rise ? 0.1 : 0) + (Math.random() - 0.5) * config.spread * 0.6,
        z: origin.z + Math.sin(a) * r * 0.7,
        vx: Math.cos(a) * sp * 0.5,
        vy: config.rise ? sp : (Math.random() - 0.3) * sp * 0.4,
        vz: Math.sin(a) * sp * 0.35,
        life: 0,
        maxLife: config.life * (0.65 + Math.random() * 0.7),
        size: config.size * (0.6 + Math.random() * 0.9),
        colorIndex: Math.floor(Math.random() * Math.max(1, colors.length)),
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 5,
      });
    }
    if (spawnAcc.current > 3) spawnAcc.current = 3;

    // step
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        particles.splice(i, 1);
        continue;
      }
      p.vy += config.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rot += p.spin * dt;
    }

    // draw
    for (let i = 0; i < config.count; i++) {
      const p = particles[i];
      if (p) {
        const k = 1 - p.life / p.maxLife;
        scale.setScalar(p.size * (config.shape === "flake" || config.shape === "heart" ? 0.7 + k * 0.5 : 0.3 + k));
        pos.set(p.x, p.y, p.z);
        eul.set(0, 0, p.rot);
        quat.setFromEuler(eul);
        mat.compose(pos, quat, scale);
        mesh.setMatrixAt(i, mat);
        const c = colors[p.colorIndex] ?? colors[0];
        if (c) {
          const fade = config.additive ? 0.25 + k * 0.85 : 0.55 + k * 0.45;
          mesh.setColorAt(i, col.copy(c).multiplyScalar(fade));
        }
      } else {
        mat.makeScale(0, 0, 0);
        mesh.setMatrixAt(i, mat);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      key={`${config.shape}-${config.count}-${config.additive ? "a" : "n"}`}
      ref={meshRef}
      args={[undefined, undefined, Math.max(20, config.count)]}
      frustumCulled={false}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial transparent depthWrite={false} toneMapped={false} />
    </instancedMesh>
  );
}
