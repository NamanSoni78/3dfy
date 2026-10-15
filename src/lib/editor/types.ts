import type { MaterialPreset } from "@/lib/three/materials";
import type { ShapeKind } from "@/lib/three/geometry";
import type { SpriteKind } from "@/lib/three/textures";
import type { ShapePart } from "@/lib/shapes/schema";
import type { WorldCode } from "@/lib/world/schema";

export type Vec3 = [number, number, number];
export type EaseId = "linear" | "easeIn" | "easeOut" | "easeInOut" | "back" | "bounce";

/* ------------------------------ objects ----------------------------- */

/** An imported AI-designed shape (3DSC code, normalized). */
export interface CustomShapeDef {
  name: string;
  parts: ShapePart[];
}

export interface ParticleConfig {
  shape: SpriteKind;
  colors: string[];
  count: number;
  rate: number;
  speed: number;
  spread: number;
  size: number;
  gravity: number;
  life: number;
  additive: boolean;
  rise: boolean;
}

export interface ObjectMaterial {
  preset: MaterialPreset;
  color: string;
  metalness: number;
  roughness: number;
  emissive: string;
  emissiveIntensity: number;
  opacity: number;
  printAsset: string | null;
}

export interface ObjectEffects {
  particles: { on: boolean; preset: string; intensity: number };
  outline: { on: boolean; color: string; thickness: number };
}

export interface BaseObj {
  id: string;
  name: string;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  material: ObjectMaterial;
  effects: ObjectEffects;
  castShadow: boolean;
  receiveShadow: boolean;
  visible: boolean;
}

export interface TextObj extends BaseObj {
  type: "text";
  text: { content: string; font: string; depth: number; bevel: boolean; theme: string };
}

export interface ShapeObj extends BaseObj {
  type: "shape";
  shape: ShapeKind | "custom";
  depth: number;
  /** references project.customShapes[id] when shape === "custom" */
  customShapeId?: string;
}

export interface ImageObj extends BaseObj {
  type: "image";
  image: { asset: string; aspect: number; frame: boolean };
}

export interface LightObj extends BaseObj {
  type: "light";
  light: { color: string; intensity: number; distance: number };
}

export type SceneObject = TextObj | ShapeObj | ImageObj | LightObj;

/* ------------------------------ world ------------------------------- */

export interface WorldTheme {
  id: string;
  name: string;
  skyTop: string;
  skyBottom: string;
  ground: string;
  grid: { on: boolean; color: string };
  fog: { on: boolean; color: string; density: number };
  stars: boolean;
}

export interface WorldSettings {
  themeId: string;
  custom: WorldTheme | null;
  lightLevel: number;
  keyLight: { on: boolean; intensity: number; angle: number; shadows: boolean };
  cameraLight: { on: boolean; intensity: number; shadows: boolean };
  shadowQuality: number;
  grid: boolean;
}

/* ----------------------------- project ------------------------------ */

export interface Keyframe {
  id: string;
  t: number;
  position: Vec3;
  target: Vec3;
  ease: EaseId;
}

export interface CustomParticle {
  id: string;
  name: string;
  config: ParticleConfig;
}

export interface AssetMeta {
  name: string;
  w: number;
  h: number;
}

/* ------------------------- stage (V1.5) ------------------------------ */

/** Which stage the editor renders: bounded studio ground or infinite world. */
export type StageKind = "void" | "world";

/** Infinite-world view options persisted with the project. */
export interface WorldOpts {
  /** chunk radius around the camera (2–6) */
  renderDistance: number;
  quality: "draft" | "balanced" | "high";
  /** walk mode: camera clamped to the terrain (fake gravity) instead of free flight */
  walkMode: boolean;
}

export const DEFAULT_WORLD_OPTS: WorldOpts = {
  renderDistance: 3,
  quality: "balanced",
  walkMode: false,
};

/** Normalizes an arbitrary (possibly old / hostile) project shape. */
export function normalizeProject(p: Project): Project {
  return {
    ...p,
    stage: p.stage === "world" ? "world" : "void",
    worldDef: p.worldDef ?? null,
    worldOpts: {
      renderDistance: Math.min(6, Math.max(2, Math.round(p.worldOpts?.renderDistance ?? 3))),
      quality: p.worldOpts?.quality === "draft" || p.worldOpts?.quality === "high" ? p.worldOpts.quality : "balanced",
      walkMode: p.worldOpts?.walkMode === true,
    },
    customShapes: p.customShapes ?? {},
    cameraFov: Math.min(100, Math.max(20, p.cameraFov ?? 50)),
  };
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** "void" = classic bounded studio stage · "world" = infinite chunk-streamed terrain */
  stage: StageKind;
  /** the 3DWC world definition when stage === "world" */
  worldDef: WorldCode | null;
  worldOpts: WorldOpts;
  world: WorldSettings;
  objects: SceneObject[];
  keyframes: Keyframe[];
  duration: number;
  cameraFov: number;
  customParticles: CustomParticle[];
  customShapes: Record<string, CustomShapeDef>;
  assets: Record<string, AssetMeta>;
}

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: string;
  thumb: string | null;
  objectCount: number;
  stage?: StageKind;
}

/* --------------------------- .3dfy file ----------------------------- */

export interface ThreeDfyFile {
  format: "3dfy-project";
  version: 1;
  project: Omit<Project, "assets">;
  assets: Record<string, { meta: AssetMeta; data: string }>;
}
