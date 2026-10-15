"use client";

import * as THREE from "three";
import { circleTexture, spriteTexture, type SpriteKind } from "@/lib/three/textures";

/**
 * Module-level runtime shared between the HUD (DOM) and the R3F scene:
 * motion values, the candy trail particle system, and the physics-field API.
 * One playground instance exists at a time, so singletons are safe.
 */

export const motion = {
  /** -1..1 roll tilt — letters slide sideways. */
  tiltX: 0,
  /** -1..1 pitch tilt — letters sink back / rise forward. */
  tiltZ: 0,
  /** camera zoom multiplier (pinch). */
  zoom: 1,
};

export interface FieldApi {
  shake: (intensity: number, dx: number, dy: number) => void;
  preset: (type: "spin" | "wave" | "bounce" | "orbit") => void;
  rebuild: () => void;
  squeezeFlash: (id?: string) => void;
}

export const fieldApi: FieldApi = {
  shake: () => {},
  preset: () => {},
  rebuild: () => {},
  squeezeFlash: () => {},
};

/* ----------------------------- trails ----------------------------- */

interface TrailParticle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; maxLife: number;
  size: number;
  color: THREE.Color;
  spin: number;
}

const POOL = 600;

export class TrailSystem {
  particles: TrailParticle[] = [];
  dirty = true;
  private textureKind: SpriteKind = "circle";
  private sprites: THREE.InstancedMesh | null = null;

  spawn(
    x: number, y: number, z: number, color: THREE.ColorRepresentation,
    opts: { count?: number; speed?: number; size?: number; life?: number; up?: number } = {},
  ): void {
    const count = Math.min(opts.count ?? 3, 14);
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= POOL) this.particles.shift();
      const a = Math.random() * Math.PI * 2;
      const sp = (opts.speed ?? 1.4) * (0.4 + Math.random() * 0.9);
      this.particles.push({
        x, y, z,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.7 + (opts.up ?? 0.6),
        vz: (Math.random() - 0.5) * sp * 0.6,
        life: 0,
        maxLife: (opts.life ?? 0.65) * (0.7 + Math.random() * 0.6),
        size: (opts.size ?? 0.16) * (0.6 + Math.random() * 0.8),
        color: new THREE.Color(color),
        spin: (Math.random() - 0.5) * 6,
      });
    }
    this.dirty = true;
  }

  setSprite(kind: SpriteKind): void {
    this.textureKind = kind;
    if (this.sprites) {
      const mat = this.sprites.material as THREE.MeshBasicMaterial;
      mat.map = spriteTexture(kind);
      mat.needsUpdate = true;
    }
  }

  get spriteKind(): SpriteKind {
    return this.textureKind;
  }

  attach(mesh: THREE.InstancedMesh): void {
    this.sprites = mesh;
    const mat = mesh.material as THREE.MeshBasicMaterial;
    mat.map = spriteTexture(this.textureKind);
  }

  detach(): void {
    this.sprites = null;
  }

  step(dt: number): void {
    if (!this.sprites) return;
    const alive: TrailParticle[] = [];
    for (const p of this.particles) {
      p.life += dt;
      if (p.life >= p.maxLife) continue;
      p.vy -= 2.2 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      alive.push(p);
    }
    this.particles = alive;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const pos = new THREE.Vector3();
    const e = new THREE.Euler();
    const color = new THREE.Color();
    for (let i = 0; i < POOL; i++) {
      const p = this.particles[i];
      if (p) {
        const k = 1 - p.life / p.maxLife;
        scale.setScalar(p.size * (0.35 + k * 0.8));
        pos.set(p.x, p.y, p.z);
        e.set(0, 0, p.spin * p.life);
        q.setFromEuler(e);
        m.compose(pos, q, scale);
        this.sprites.setMatrixAt(i, m);
        this.sprites.setColorAt(i, color.copy(p.color).multiplyScalar(0.35 + k * 0.75));
      } else {
        m.makeScale(0, 0, 0);
        this.sprites.setMatrixAt(i, m);
      }
    }
    this.sprites.instanceMatrix.needsUpdate = true;
    if (this.sprites.instanceColor) this.sprites.instanceColor.needsUpdate = true;
  }
}

export const trailFX = new TrailSystem();

export function trailTextureDefault(): THREE.Texture {
  return circleTexture();
}
