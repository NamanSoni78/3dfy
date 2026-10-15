"use client";

import * as THREE from "three";
import { SimplexNoise, fbm, ridged, mulberry32, chunkSeed, smoothstep, lerp } from "./noise";
import type { WorldCode, WorldFeature } from "./schema";
import { spriteTexture } from "@/lib/three/textures";
import { buildShapeGeometry } from "@/lib/shapes/build";

/**
 * Infinite procedural world renderer.
 *
 * - Lazy chunk loading: terrain builds inside a time-boxed budget (≈5ms/frame)
 *   around the camera and is disposed beyond renderDistance + 1.
 * - One shared material per feature family; per-chunk InstancedMesh for every
 *   feature → hundreds of trees per draw call.
 * - Deterministic: same seed → identical world on every device.
 * - Perf knobs: renderDistance (2-6), featureMul (quality), small-prop culling
 *   beyond 2 chunks, density throttling when total density is heavy.
 */

export const CHUNK = 32;
const RES = 24; // terrain vertices per side (uniform → no LOD cracks)
const SMALL_PROP_RANGE = 2; // chunks; grass/flowers skip beyond this
const BUILD_BUDGET_MS = 5;
const MAX_INSTANCES = 420;

export interface WorldRenderOpts {
  renderDistance: number; // in chunks (2-6)
  quality: "draft" | "balanced" | "high";
  featureMul: number; // 0.55 draft · 1 balanced · 1.25 high
}

interface FeatureSpec {
  perChunk: number;
  small?: boolean;
  slopeSensitive?: boolean;
  emissive?: boolean;
  castShadow?: boolean;
}

const FEATURE_SPECS: Record<string, FeatureSpec> = {
  pine: { perChunk: 110, slopeSensitive: true, castShadow: true },
  round: { perChunk: 90, slopeSensitive: true, castShadow: true },
  palm: { perChunk: 70, slopeSensitive: true, castShadow: true },
  cactus: { perChunk: 60, slopeSensitive: true },
  rock: { perChunk: 70 },
  boulder: { perChunk: 34 },
  crystal: { perChunk: 48, emissive: true },
  flower: { perChunk: 160, small: true },
  grass: { perChunk: 300, small: true },
  mushroom: { perChunk: 80, small: true },
  building: { perChunk: 10, slopeSensitive: true, castShadow: true },
  custom: { perChunk: 26, slopeSensitive: true, castShadow: true },
};

/* part geometries — shared, built once */
function makePartGeos(): Record<string, THREE.BufferGeometry[]> {
  const trunk = new THREE.CylinderGeometry(0.09, 0.12, 1, 7);
  trunk.translate(0, 0.5, 0);
  const cone = new THREE.ConeGeometry(0.42, 1, 8);
  cone.translate(0, 0.5, 0);
  const cone2 = new THREE.ConeGeometry(0.3, 0.7, 8);
  cone2.translate(0, 0.5, 0);
  const blob = new THREE.IcosahedronGeometry(0.5, 0);
  const palmTop = new THREE.IcosahedronGeometry(0.5, 0);
  palmTop.scale(1.5, 0.35, 1.5);
  const capsule = new THREE.CapsuleGeometry(0.16, 0.7, 4, 8);
  capsule.translate(0, 0.5, 0);
  const arm = new THREE.CapsuleGeometry(0.09, 0.3, 4, 8);
  const rock = new THREE.DodecahedronGeometry(0.5, 0);
  const boulder = new THREE.DodecahedronGeometry(1.1, 0);
  const crystal = new THREE.OctahedronGeometry(0.34, 0);
  crystal.translate(0, 0.5, 0);
  const shard = new THREE.OctahedronGeometry(0.18, 0);
  shard.translate(0, 0.3, 0);
  const stem = new THREE.CylinderGeometry(0.035, 0.05, 0.5, 5);
  stem.translate(0, 0.25, 0);
  const bloom = new THREE.IcosahedronGeometry(0.11, 0);
  const blade = new THREE.ConeGeometry(0.09, 0.55, 5);
  blade.translate(0, 0.27, 0);
  const mushStem = new THREE.CylinderGeometry(0.1, 0.14, 0.5, 7);
  mushStem.translate(0, 0.25, 0);
  const cap = new THREE.SphereGeometry(0.42, 10, 7);
  cap.scale(1, 0.45, 1);
  cap.translate(0, 0.48, 0);
  const hut = new THREE.BoxGeometry(1.2, 1, 1.2);
  hut.translate(0, 0.5, 0);
  const roof = new THREE.ConeGeometry(0.95, 0.6, 4);
  roof.rotateY(Math.PI / 4);
  roof.translate(0, 1.25, 0);

  return {
    pine: [trunk, cone, cone2],
    round: [trunk, blob],
    palm: [trunk, palmTop],
    cactus: [capsule, arm, arm],
    rock: [rock],
    boulder: [boulder],
    crystal: [crystal, shard],
    flower: [stem, bloom],
    grass: [blade],
    mushroom: [mushStem, cap],
    building: [hut, roof],
  };
}

/* part placements: [geoIndex, offsetX, offsetY, scaleMul] */
const FEATURE_PARTS: Record<string, [number, number, number, number][]> = {
  pine: [[0, 0, 0, 0.45], [1, 0, 0.45, 1], [2, 0, 1.05, 0.8]],
  round: [[0, 0, 0, 0.55], [1, 0, 0.8, 0.95]],
  palm: [[0, 0, 0, 1.6], [1, 0, 1.55, 1]],
  cactus: [[0, 0, 0, 1], [1, 0.2, 0.55, 0.8], [1, -0.2, 0.75, 0.7]],
  rock: [[0, 0, 0.18, 1]],
  boulder: [[0, 0, 0.35, 1]],
  crystal: [[0, 0, 0, 1], [1, 0.28, 0, 0.7]],
  flower: [[0, 0, 0, 1], [1, 0, 0.48, 1]],
  grass: [[0, 0, 0, 1]],
  mushroom: [[0, 0, 0, 1], [1, 0, 0.05, 1]],
  building: [[0, 0, 0, 1], [1, 0, 0, 1]],
};

/** Color index per part: 0 = accent (usually trunk/structure), 1 = secondary (canopy/bloom). */
const PART_COLOR: Record<string, number[]> = {
  pine: [0, 1, 1],
  round: [0, 1],
  palm: [0, 1],
  cactus: [1, 1, 1],
  rock: [0],
  boulder: [0],
  crystal: [1, 1],
  flower: [0, 1],
  grass: [1],
  mushroom: [0, 1],
  building: [1, 0],
};

export interface ChunkStats {
  loaded: number;
  pending: number;
}

export class ChunkManager {
  private scene: THREE.Scene;
  private world: WorldCode;
  private opts: WorldRenderOpts;
  private n: SimplexNoise;
  private n2: SimplexNoise;

  private chunks = new Map<string, { group: THREE.Group; terrain: THREE.BufferGeometry }>();
  private queue: { cx: number; cz: number; d: number }[] = [];
  private cameraChunk = { cx: 9999, cz: 9999 };

  private terrainMat: THREE.MeshStandardMaterial;
  private propMat: THREE.MeshStandardMaterial;
  private crystalMat: THREE.MeshStandardMaterial;
  private waterMesh: THREE.Mesh | null = null;
  private waterGeo: THREE.PlaneGeometry | null = null;
  private waterBase: Float32Array | null = null;
  private clouds: THREE.InstancedMesh | null = null;
  private cloudBase: { x: number; z: number; y: number; s: number }[] = [];
  private cloudAnchor = new THREE.Vector2(9999, 9999);
  private partGeos: Record<string, THREE.BufferGeometry[]>;
  /** merged geometry per "custom" feature (built once from its 3DSC parts) */
  private customGeos = new Map<number, THREE.BufferGeometry>();
  private customMat: THREE.MeshStandardMaterial;
  private sun: THREE.DirectionalLight | null = null;
  private heavyDensity: boolean;
  /** frozen: no streaming/pruning (offline render — determinism) */
  frozen = false;
  /** prewarming: build everything, never prune */
  private prewarming = false;

  constructor(scene: THREE.Scene, world: WorldCode, opts: WorldRenderOpts) {
    this.scene = scene;
    this.world = world;
    this.opts = opts;

    const rand = mulberry32(world.seed);
    this.n = new SimplexNoise(rand);
    this.n2 = new SimplexNoise(rand);

    const density = world.features.reduce((a, f) => a + f.density, 0);
    this.heavyDensity = density > 2.5;

    this.terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.95,
      metalness: 0,
    });
    this.propMat = new THREE.MeshStandardMaterial({
      flatShading: true,
      roughness: 0.9,
      metalness: 0,
    });
    this.crystalMat = new THREE.MeshStandardMaterial({
      flatShading: true,
      roughness: 0.25,
      metalness: 0.1,
      emissive: new THREE.Color("#9fe8ff"),
      emissiveIntensity: 0.55,
    });
    this.partGeos = makePartGeos();
    this.customMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.7,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });

    /* v2 custom features — merged 3DSC geometry, instanced like any prop */
    world.features.forEach((f, fi) => {
      if (f.type === "custom" && f.parts?.length) {
        const geo = buildShapeGeometry(f.parts);
        if (geo) this.customGeos.set(fi, geo);
      }
    });

    if (world.terrain.waterLevel !== null) this.buildWater();
    if (world.atmosphere.clouds.on) this.buildClouds();
  }

  /* ------------------------------ terrain math ------------------------------ */

  heightAt(x: number, z: number): number {
    const t = this.world.terrain;
    const f = t.frequency;
    let h = fbm(this.n, x * f, z * f, 4) * t.amplitude * 0.55;

    const mMask = smoothstep(0.16, 0.5, fbm(this.n2, x * f * 0.32, z * f * 0.32, 3));
    h += Math.pow(ridged(this.n, x * f * 0.6, z * f * 0.6, 3), 2.2) * t.amplitude * 1.35 * mMask;

    h += fbm(this.n2, x * f * 4.5, z * f * 4.5, 2) * t.amplitude * 0.1 * t.detail;

    const river = t.river;
    if (river) {
      const m = 0.7 + river.meander * 0.8;
      const rv = Math.abs(this.n.noise2D(x * 0.0028 * m, z * 0.0028));
      const thresh = 0.028 + river.width * 0.004;
      const channel = 1 - smoothstep(0, thresh, rv);
      if (channel > 0) {
        const bed = (t.waterLevel !== null ? t.waterLevel : h) - 2.2;
        h = lerp(h, Math.min(h, bed), channel);
      }
    }
    return h;
  }

  private terrainColor(h: number, jitter: number, out: THREE.Color): void {
    const colors = this.world.terrain.colors;
    const amp = this.world.terrain.amplitude;
    let t = Math.min(1, Math.max(0, (h + amp * 0.5) / (amp * 2.1)));
    t = Math.min(1, Math.max(0, t + jitter * 0.08));
    if (t < 0.5) out.set(colors[0]).lerp(new THREE.Color(colors[1]), t * 2);
    else if (t < 0.82) out.set(colors[1]).lerp(new THREE.Color(colors[2]), (t - 0.5) / 0.32);
    else {
      const peak = colors[3] ?? "#ffffff";
      out.set(colors[2]).lerp(new THREE.Color(peak), (t - 0.82) / 0.18);
    }
  }

  /* ------------------------------ construction ------------------------------ */

  private buildChunk(cx: number, cz: number): void {
    const key = `${cx},${cz}`;
    if (this.chunks.has(key)) return;

    const group = new THREE.Group();
    const ox = cx * CHUNK + CHUNK / 2;
    const oz = cz * CHUNK + CHUNK / 2;

    /* terrain mesh */
    const geo = new THREE.PlaneGeometry(CHUNK, CHUNK, RES, RES);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colorsArr = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const wx = ox + pos.getX(i);
      const wz = oz + pos.getZ(i);
      const h = this.heightAt(wx, wz);
      pos.setY(i, h);
      const jitter = this.n2.noise2D(wx * 0.11, wz * 0.11);
      this.terrainColor(h, jitter, c);
      colorsArr[i * 3] = c.r;
      colorsArr[i * 3 + 1] = c.g;
      colorsArr[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colorsArr, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, this.terrainMat);
    mesh.position.set(ox, 0, oz);
    mesh.receiveShadow = this.opts.quality === "high" && this.world.atmosphere.shadows;
    mesh.userData.terrain = true; // long-press raycast target in the world studio
    group.add(mesh);

    /* features */
    const cheb = Math.max(Math.abs(cx - this.cameraChunk.cx), Math.abs(cz - this.cameraChunk.cz));
    this.buildFeatures(group, cx, cz, cheb);

    this.scene.add(group);
    this.chunks.set(key, { group, terrain: geo });
  }

  private buildFeatures(group: THREE.Group, cx: number, cz: number, cheb: number): void {
    const t = this.world.terrain;
    const water = t.waterLevel;
    const rng = mulberry32(chunkSeed(cx, cz, this.world.seed));
    const ox = cx * CHUNK;
    const oz = cz * CHUNK;

    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scaleV = new THREE.Vector3();
    const mat4 = new THREE.Matrix4();
    const col = new THREE.Color();

    this.world.features.forEach((spec, fi) => {
      const fs = FEATURE_SPECS[spec.type];
      if (!fs) return;
      if (fs.small && cheb > SMALL_PROP_RANGE) return;

      let count = Math.round(spec.density * fs.perChunk * this.opts.featureMul);
      if (this.heavyDensity) count = Math.round(count * 0.8);
      count = Math.min(count, MAX_INSTANCES);
      if (count <= 0) return;

      /* v2 custom feature — one instanced mesh from merged 3DSC geometry */
      if (spec.type === "custom") {
        const geo = this.customGeos.get(fi);
        if (!geo) return;
        const transforms: { x: number; y: number; z: number; s: number; rot: number }[] = [];
        for (let i = 0; i < count; i++) {
          const x = ox + rng() * CHUNK;
          const z = oz + rng() * CHUNK;
          const y = this.heightAt(x, z);
          if (water !== null && y < water + 0.35) continue;
          const dy = Math.abs(this.heightAt(x + 1, z) - y) + Math.abs(this.heightAt(x, z + 1) - y);
          if (dy > 2.2) continue;
          transforms.push({ x, y, z, s: lerp(spec.scale[0], spec.scale[1], rng()), rot: rng() * Math.PI * 2 });
        }
        if (!transforms.length) return;
        const inst = new THREE.InstancedMesh(geo, this.customMat, transforms.length);
        for (let i = 0; i < transforms.length; i++) {
          const tr = transforms[i];
          pos.set(tr.x, tr.y, tr.z);
          euler.set(0, tr.rot, 0);
          quat.setFromEuler(euler);
          scaleV.setScalar(tr.s);
          mat4.compose(pos, quat, scaleV);
          inst.setMatrixAt(i, mat4);
          col.set("#ffffff");
          col.offsetHSL(0, 0, (rng() - 0.5) * 0.1);
          inst.setColorAt(i, col);
        }
        inst.castShadow = this.opts.quality === "high" && this.world.atmosphere.shadows;
        group.add(inst);
        return;
      }

      const parts = this.partGeos[spec.type];
      const placements = FEATURE_PARTS[spec.type];
      const colorIdx = PART_COLOR[spec.type];
      if (!parts || !placements) return;

      /* gather instance transforms first (some get culled) */
      const transforms: { x: number; y: number; z: number; s: number; rot: number }[] = [];
      for (let i = 0; i < count; i++) {
        const x = ox + rng() * CHUNK;
        const z = oz + rng() * CHUNK;
        const y = this.heightAt(x, z);
        if (water !== null && y < water + 0.35) continue;
        if (fs.slopeSensitive) {
          const dy = Math.abs(this.heightAt(x + 1, z) - y) + Math.abs(this.heightAt(x, z + 1) - y);
          if (dy > 1.7) continue;
        }
        transforms.push({
          x, y, z,
          s: lerp(spec.scale[0], spec.scale[1], rng()),
          rot: rng() * Math.PI * 2,
        });
      }
      if (!transforms.length) return;

      for (let pi = 0; pi < parts.length; pi++) {
        const geo = parts[pi];
        const mat = fs.emissive ? this.crystalMat : this.propMat;
        const inst = new THREE.InstancedMesh(geo, mat, transforms.length);
        const [gi, offX, offY, mul] = placements[pi];
        void gi;
        for (let i = 0; i < transforms.length; i++) {
          const tr = transforms[i];
          pos.set(tr.x + offX * tr.s, tr.y + offY * tr.s, tr.z);
          euler.set(0, tr.rot, 0);
          quat.setFromEuler(euler);
          scaleV.setScalar(tr.s * mul);
          mat4.compose(pos, quat, scaleV);
          inst.setMatrixAt(i, mat4);

          const hex = spec.colors[colorIdx[pi] ?? 0] ?? spec.colors[0];
          col.set(hex);
          const jitter = (rng() - 0.5) * 0.12;
          col.offsetHSL(0, 0, jitter);
          inst.setColorAt(i, col);
        }
        inst.castShadow = !!fs.castShadow && this.opts.quality === "high" && this.world.atmosphere.shadows;
        group.add(inst);
      }
    });
  }

  private buildWater(): void {
    const t = this.world.terrain;
    if (t.waterLevel === null) return;
    const geo = new THREE.PlaneGeometry(512, 512, 48, 48);
    geo.rotateX(-Math.PI / 2);
    this.waterBase = Float32Array.from((geo.attributes.position as THREE.BufferAttribute).array as Float32Array);
    const refl = t.water.reflectivity;
    const mat = new THREE.MeshStandardMaterial({
      color: t.water.color,
      transparent: true,
      opacity: t.water.opacity,
      roughness: THREE.MathUtils.clamp(0.22 - refl * 0.2, 0.02, 0.5),
      metalness: THREE.MathUtils.clamp(0.2 + refl * 0.75, 0.1, 0.95),
      envMapIntensity: 0.4 + refl * 1.6,
    });
    this.waterMesh = new THREE.Mesh(geo, mat);
    this.waterMesh.position.y = t.waterLevel;
    this.waterMesh.renderOrder = 1;
    this.scene.add(this.waterMesh);
    this.waterGeo = geo;
  }

  private buildClouds(): void {
    const coverage = this.world.atmosphere.clouds.coverage;
    const count = Math.round(10 + coverage * 70);
    const geo = new THREE.PlaneGeometry(30, 15);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.5,
      alphaMap: spriteTexture("circle"),
      depthWrite: false,
    });
    const rng = mulberry32(this.world.seed ^ 0x51ce);
    this.cloudBase = [];
    for (let i = 0; i < count; i++) {
      this.cloudBase.push({
        x: (rng() - 0.5) * 640,
        z: (rng() - 0.5) * 640,
        y: 55 + rng() * 24,
        s: 0.7 + rng() * 1.6,
      });
    }
    this.clouds = new THREE.InstancedMesh(geo, mat, count);
    this.clouds.frustumCulled = false;
    this.scene.add(this.clouds);
    this.cloudAnchor.set(9999, 9999);
  }

  /* -------------------------------- updates -------------------------------- */

  setOpts(opts: Partial<WorldRenderOpts>): void {
    const prevDist = this.opts.renderDistance;
    this.opts = { ...this.opts, ...opts };
    if (opts.renderDistance !== undefined && opts.renderDistance !== prevDist) {
      this.cameraChunk.cx = 9999; // force re-eval → prune + rebuild queue
      this.update(new THREE.Vector3(0, 0, 0), 0, new THREE.Vector3(0, 0, 0));
    }
  }

  attachSun(light: THREE.DirectionalLight): void {
    this.sun = light;
  }

  update(camPos: THREE.Vector3, elapsed: number, camDir?: THREE.Vector3): ChunkStats {
    const ccx = Math.floor(camPos.x / CHUNK);
    const ccz = Math.floor(camPos.z / CHUNK);

    /* frozen (offline render): streaming OFF — water/clouds/sun keep animating
       deterministically, chunks stay exactly as pre-warmed */
    if (!this.frozen) {
      if (ccx !== this.cameraChunk.cx || ccz !== this.cameraChunk.cz) {
        this.cameraChunk.cx = ccx;
        this.cameraChunk.cz = ccz;
        this.refreshQueue();
        if (!this.prewarming) this.pruneFar();
      }

      /* budgeted chunk building */
      const t0 = performance.now();
      while (this.queue.length && performance.now() - t0 < BUILD_BUDGET_MS) {
        const next = this.queue.shift()!;
        this.buildChunk(next.cx, next.cz);
      }
    }

    /* water: follow camera (snapped) + animate waves (flow-scaled) */
    if (this.waterMesh && this.waterGeo && this.waterBase) {
      this.waterMesh.position.x = Math.round(camPos.x / 8) * 8;
      this.waterMesh.position.z = Math.round(camPos.z / 8) * 8;
      const flow = Math.max(0.05, this.world.terrain.water.flow);
      const pos = this.waterGeo.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        const x = this.waterBase[i];
        const z = this.waterBase[i + 2];
        arr[i + 1] =
          Math.sin(x * 0.25 + elapsed * 1.35 * flow) * 0.09 +
          Math.cos((z + x) * 0.2 + elapsed * 0.9 * flow) * 0.07;
      }
      pos.needsUpdate = true;
    }

    /* clouds: wrap around the camera */
    if (this.clouds) {
      if (this.cloudAnchor.distanceTo(new THREE.Vector2(camPos.x, camPos.z)) > 10) {
        this.cloudAnchor.set(camPos.x, camPos.z);
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const s = new THREE.Vector3();
        const p = new THREE.Vector3();
        const RANGE = 640;
        for (let i = 0; i < this.cloudBase.length; i++) {
          const b = this.cloudBase[i];
          const x = (((b.x - camPos.x) % RANGE) + RANGE * 1.5) % RANGE - RANGE / 2 + camPos.x;
          const z = (((b.z - camPos.z) % RANGE) + RANGE * 1.5) % RANGE - RANGE / 2 + camPos.z;
          p.set(x, b.y, z);
          s.setScalar(b.s);
          m.compose(p, q, s);
          this.clouds.setMatrixAt(i, m);
        }
        this.clouds.instanceMatrix.needsUpdate = true;
      }
    }

    /* keep the shadow-casting sun glued to the camera */
    if (this.sun && camDir) {
      const d = camDir;
      this.sun.position.set(camPos.x + d.x * 130, camPos.y + d.y * 130, camPos.z + d.z * 130);
      this.sun.target.position.copy(camPos);
      this.sun.target.updateMatrixWorld();
    }

    return { loaded: this.chunks.size, pending: this.queue.length };
  }

  /** Synchronously build every chunk near each sampled camera position —
   *  called before an offline render so frames never pop in mid-video.
   *  Small props get built around every sample (cameraChunk is moved first). */
  async prewarm(samples: THREE.Vector3[], onProgress: (p: number) => void): Promise<boolean> {
    this.prewarming = true;
    try {
      const total = samples.length || 1;
      let done = 0;
      for (const s of samples) {
        const ccx = Math.floor(s.x / CHUNK);
        const ccz = Math.floor(s.z / CHUNK);
        if (ccx !== this.cameraChunk.cx || ccz !== this.cameraChunk.cz) {
          this.cameraChunk.cx = ccx;
          this.cameraChunk.cz = ccz;
          this.refreshQueue();
        }
        while (this.queue.length) {
          const t0 = performance.now();
          while (this.queue.length && performance.now() - t0 < 14) {
            const next = this.queue.shift()!;
            this.buildChunk(next.cx, next.cz);
          }
          if (this.queue.length) await new Promise<void>((r) => setTimeout(r, 0));
        }
        onProgress(++done / total);
        await new Promise<void>((r) => setTimeout(r, 0));
      }
      return true;
    } finally {
      this.prewarming = false;
    }
  }

  private refreshQueue(): void {
    const r = this.opts.renderDistance;
    const { cx, cz } = this.cameraChunk;
    const wanted: { cx: number; cz: number; d: number }[] = [];
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const key = `${cx + dx},${cz + dz}`;
        if (this.chunks.has(key)) continue;
        wanted.push({ cx: cx + dx, cz: cz + dz, d: Math.abs(dx) + Math.abs(dz) });
      }
    }
    wanted.sort((a, b) => a.d - b.d);
    this.queue = wanted;
  }

  private pruneFar(): void {
    const r = this.opts.renderDistance + 1;
    const { cx, cz } = this.cameraChunk;
    for (const [key, chunk] of [...this.chunks]) {
      const [kx, kz] = key.split(",").map(Number);
      if (Math.abs(kx - cx) > r || Math.abs(kz - cz) > r) {
        this.scene.remove(chunk.group);
        chunk.terrain.dispose();
        chunk.group.traverse((o) => {
          const im = o as THREE.InstancedMesh;
          if (im.isInstancedMesh) im.dispose();
        });
        this.chunks.delete(key);
      }
    }
  }

  dispose(): void {
    for (const [, chunk] of this.chunks) {
      this.scene.remove(chunk.group);
      chunk.terrain.dispose();
      chunk.group.traverse((o) => {
        const im = o as THREE.InstancedMesh;
        if (im.isInstancedMesh) im.dispose();
      });
    }
    this.chunks.clear();

    if (this.waterMesh) {
      this.scene.remove(this.waterMesh);
      this.waterGeo?.dispose();
      (this.waterMesh.material as THREE.Material).dispose();
    }
    if (this.clouds) {
      this.scene.remove(this.clouds);
      this.clouds.geometry.dispose();
      (this.clouds.material as THREE.Material).dispose();
    }
    for (const geos of Object.values(this.partGeos)) geos.forEach((g) => g.dispose());
    this.customGeos.forEach((g) => g.dispose());
    this.customGeos.clear();
    this.customMat.dispose();
    this.terrainMat.dispose();
    this.propMat.dispose();
    this.crystalMat.dispose();
  }
}
