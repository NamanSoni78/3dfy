"use client";

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mulberry32 } from "./noise";
import type { WorldCode, WorldMob } from "./schema";

/**
 * Deterministic mob system for 3DWC v2 worlds.
 *
 * One InstancedMesh per mob spec (critter / bird / fish / orb / butterfly).
 * Every instance position is a PURE function of (seed, t) — never of
 * wall-clock or update order — so offline renders are frame-perfect and
 * repeatable. Anchors are world-fixed and silently re-anchored near the
 * camera when the player travels far (they respawn behind the fog).
 *
 * Behaviors: wander (lissajous drift), hop (parabolic hops), circle (orbit
 * around the anchor), swim (below the water surface, hidden on land),
 * flock (a ring that wheels around the player).
 */

const _m4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _p2 = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _eul = new THREE.Euler();
const _scl = new THREE.Vector3();
const _col = new THREE.Color();
const _cam2 = new THREE.Vector2();

/* --------------------------- body geometries ------------------------------ */

function bodyGeometry(kind: WorldMob["kind"]): THREE.BufferGeometry {
  switch (kind) {
    case "critter": {
      const body = new THREE.CapsuleGeometry(0.16, 0.22, 4, 8);
      body.rotateZ(Math.PI / 2);
      body.translate(0, 0.16, 0);
      const head = new THREE.SphereGeometry(0.115, 10, 8);
      head.translate(0.26, 0.24, 0);
      const earL = new THREE.SphereGeometry(0.045, 6, 5);
      earL.translate(0.22, 0.36, 0.07);
      const earR = earL.clone();
      earR.translate(0, 0, -0.14);
      const tail = new THREE.ConeGeometry(0.06, 0.18, 6);
      tail.rotateZ(Math.PI / 2);
      tail.translate(-0.3, 0.16, 0);
      return mergeGeometries([body, head, earL, earR, tail], false)!;
    }
    case "bird": {
      const body = new THREE.ConeGeometry(0.09, 0.42, 7);
      body.rotateX(Math.PI / 2);
      const wingL = new THREE.BoxGeometry(0.22, 0.02, 0.1);
      wingL.translate(-0.13, 0.02, 0.02);
      wingL.rotateZ(0.25);
      const wingR = new THREE.BoxGeometry(0.22, 0.02, 0.1);
      wingR.translate(0.13, 0.02, 0.02);
      wingR.rotateZ(-0.25);
      const tail = new THREE.ConeGeometry(0.06, 0.16, 5);
      tail.rotateX(-Math.PI / 2);
      tail.translate(0, 0, -0.24);
      return mergeGeometries([body, wingL, wingR, tail], false)!;
    }
    case "fish": {
      const body = new THREE.ConeGeometry(0.11, 0.4, 7);
      body.rotateX(-Math.PI / 2);
      const tail = new THREE.ConeGeometry(0.08, 0.16, 5);
      tail.rotateX(Math.PI / 2);
      tail.translate(0, 0, 0.26);
      const fin = new THREE.BoxGeometry(0.02, 0.1, 0.1);
      fin.translate(0, 0.1, 0.02);
      return mergeGeometries([body, tail, fin], false)!;
    }
    case "orb": {
      return new THREE.IcosahedronGeometry(0.16, 0);
    }
    case "butterfly": {
      const body = new THREE.CapsuleGeometry(0.025, 0.16, 3, 6);
      const wingL = new THREE.BoxGeometry(0.2, 0.015, 0.14);
      wingL.translate(-0.11, 0, 0);
      wingL.rotateY(0.35);
      const wingR = new THREE.BoxGeometry(0.2, 0.015, 0.14);
      wingR.translate(0.11, 0, 0);
      wingR.rotateY(-0.35);
      return mergeGeometries([body, wingL, wingR], false)!;
    }
  }
}

/* ------------------------------- the system ------------------------------- */

interface MobSlot {
  anchor: THREE.Vector3;
  phase: number;
  size: number;
  radius: number;
  groundY: number;
  prevEval: THREE.Vector3;
}

interface MobLayer {
  spec: WorldMob;
  mesh: THREE.InstancedMesh;
  mat: THREE.MeshStandardMaterial;
  slots: MobSlot[];
  rng: () => number;
  frame: number;
}

export class MobSystem {
  private layers: MobLayer[] = [];
  private scene: THREE.Scene;
  private world: WorldCode;
  private heightAt: (x: number, z: number) => number;
  private frame = 0;

  constructor(scene: THREE.Scene, world: WorldCode, heightAt: (x: number, z: number) => number) {
    this.scene = scene;
    this.world = world;
    this.heightAt = heightAt;

    world.mobs.slice(0, 4).forEach((spec, si) => {
      const geo = bodyGeometry(spec.kind);
      geo.deleteAttribute("uv");
      const mat = new THREE.MeshStandardMaterial({
        flatShading: true,
        roughness: spec.kind === "orb" ? 0.25 : 0.75,
        metalness: 0.05,
      });
      if (spec.glow) {
        mat.emissive = new THREE.Color(spec.colors[1] ?? spec.colors[0]);
        mat.emissiveIntensity = spec.kind === "orb" ? 1.6 : 0.7;
      }
      const mesh = new THREE.InstancedMesh(geo, mat, spec.count);
      mesh.frustumCulled = false;
      mesh.castShadow = false;

      /* deterministic per-instance seeds */
      const rng = mulberry32((world.seed * 7919 + si * 104729) | 0);
      const slots: MobSlot[] = [];
      for (let i = 0; i < spec.count; i++) {
        const a = rng() * Math.PI * 2;
        const r = 10 + rng() * 55;
        const anchor = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
        slots.push({
          anchor,
          phase: rng() * Math.PI * 2,
          size: spec.size[0] + rng() * (spec.size[1] - spec.size[0]),
          radius: 4 + rng() * 5,
          groundY: 0,
          prevEval: new THREE.Vector3(),
        });
        _col.set(spec.colors[0]).offsetHSL(0, 0, (rng() - 0.5) * 0.14);
        mesh.setColorAt(i, _col);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

      this.scene.add(mesh);
      this.layers.push({ spec, mesh, mat, slots, rng, frame: 0 });
    });
  }

  /** evaluate the pure position function of instance (slot, t) */
  private evalPos(layer: MobLayer, slot: MobSlot, t: number, out: THREE.Vector3, camPos: THREE.Vector3): void {
    const spec = layer.spec;
    const sp = spec.speed;
    const ph = slot.phase;

    switch (spec.behavior) {
      case "circle": {
        const w = sp * 0.25;
        const r = slot.radius + 2;
        out.set(
          slot.anchor.x + Math.cos(w * t + ph) * r,
          0,
          slot.anchor.z + Math.sin(w * t + ph) * r,
        );
        out.y = slot.groundY + slot.size * 0.55;
        break;
      }
      case "swim": {
        out.set(
          slot.anchor.x + Math.sin(t * sp * 0.3 + ph) * 7,
          0,
          slot.anchor.z + Math.cos(t * sp * 0.22 + ph * 1.6) * 7,
        );
        const wl = this.world.terrain.waterLevel;
        out.y = wl !== null ? wl - 0.3 - slot.size * 0.2 + Math.sin(t * sp + ph) * 0.12 : slot.groundY + 0.3;
        break;
      }
      case "hop": {
        out.set(
          slot.anchor.x + Math.sin(t * sp * 0.14 + ph) * 8,
          0,
          slot.anchor.z + Math.cos(t * sp * 0.11 + ph) * 8,
        );
        const hop = Math.abs(Math.sin(t * sp * 1.4 + ph));
        out.y = slot.groundY + slot.size * 0.45 + hop * hop * 1.1;
        break;
      }
      case "flock": {
        /* the whole flock wheels around the player on a wide ring */
        const w = sp * 0.12;
        const R = 20 + Math.sin(t * 0.05 + ph) * 6;
        const baseA = w * t;
        const a = baseA + (slot.phase / (Math.PI * 2)) * Math.PI * 2 * 0.12 + slot.phase * 0.05;
        out.set(
          camPos.x + Math.cos(a) * R + Math.sin(t * 1.1 + ph) * 1.6,
          0,
          camPos.z + Math.sin(a) * R + Math.cos(t * 0.9 + ph) * 1.6,
        );
        out.y = slot.groundY + 12 + Math.sin(t * 0.8 + ph) * 2.5;
        break;
      }
      case "wander":
      default: {
        out.set(
          slot.anchor.x + Math.sin(t * sp * 0.3 + ph) * 6,
          0,
          slot.anchor.z + Math.cos(t * sp * 0.24 + ph * 1.7) * 6,
        );
        let y = slot.groundY + slot.size * 0.5;
        if (spec.kind === "bird") y = slot.groundY + 14 + Math.sin(t * 0.9 + ph) * 3;
        if (spec.kind === "orb") y = slot.groundY + 1.3 + Math.sin(t * 0.7 + ph) * 0.8;
        if (spec.kind === "butterfly") y = slot.groundY + 0.9 + Math.sin(t * 1.9 + ph) * 0.45;
        out.y = y;
        break;
      }
    }
  }

  update(camPos: THREE.Vector3, t: number): void {
    this.frame++;
    _cam2.set(camPos.x, camPos.z);

    for (const layer of this.layers) {
      const spec = layer.spec;
      const wl = this.world.terrain.waterLevel;
      layer.frame++;

      for (let i = 0; i < layer.slots.length; i++) {
        const slot = layer.slots[i];

        /* re-anchor far instances behind the player (silent — beyond fog) */
        if (Math.hypot(slot.anchor.x - camPos.x, slot.anchor.z - camPos.z) > 90) {
          const a = layer.rng() * Math.PI * 2;
          const r = 18 + layer.rng() * 50;
          slot.anchor.set(camPos.x + Math.cos(a) * r, 0, camPos.z + Math.sin(a) * r);
          slot.groundY = this.heightAt(slot.anchor.x, slot.anchor.z);
        }
        /* staggered ground refresh (cheap terrain sampling) */
        else if ((this.frame + i) % 10 === 0) {
          slot.groundY = this.heightAt(slot.anchor.x, slot.anchor.z);
        }

        this.evalPos(layer, slot, t, _pos, camPos);

        /* orientation from a tiny time offset (pure, deterministic) */
        this.evalPos(layer, slot, t + 0.12, _p2, camPos);
        const dx = _p2.x - _pos.x;
        const dz = _p2.z - _pos.z;
        const yaw = Math.abs(dx) + Math.abs(dz) > 1e-4 ? Math.atan2(dx, dz) : slot.phase;
        const pitch = spec.kind === "fish" ? Math.atan2(_p2.y - _pos.y, Math.hypot(dx, dz)) * 0.6 : 0;

        /* hide fish on land */
        let scale = slot.size;
        if (spec.kind === "fish" && wl !== null && slot.groundY > wl - 0.4) scale = 0;

        _eul.set(pitch, yaw, 0, "YXZ");
        _quat.setFromEuler(_eul);
        _scl.setScalar(scale);
        _m4.compose(_pos, _quat, _scl);
        layer.mesh.setMatrixAt(i, _m4);
      }
      layer.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const layer of this.layers) {
      this.scene.remove(layer.mesh);
      layer.mesh.geometry.dispose();
      layer.mesh.dispose();
      layer.mat.dispose();
    }
    this.layers = [];
  }
}
