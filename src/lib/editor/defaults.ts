import { CANDY } from "@/lib/palette";
import type { ShapeKind } from "@/lib/three/geometry";
import type { ParticleConfig, Project, SceneObject, WorldTheme } from "./types";
import { DEFAULT_WORLD_OPTS } from "./types";
import type { WorldCode } from "@/lib/world/schema";

export const WORLD_THEMES: WorldTheme[] = [
  {
    id: "candy", name: "Candy Land",
    skyTop: "#FFD9F2", skyBottom: "#FFEDCB",
    ground: "#FFC7E3",
    grid: { on: true, color: "#ffffff" },
    fog: { on: false, color: "#FFD9F2", density: 0.02 },
    stars: false,
  },
  {
    id: "galaxy", name: "Galaxy",
    skyTop: "#0B0518", skyBottom: "#221041",
    ground: "#150A28",
    grid: { on: true, color: "#7AF6FF" },
    fog: { on: true, color: "#12071F", density: 0.026 },
    stars: true,
  },
  {
    id: "studio", name: "Studio",
    skyTop: "#EEF0F4", skyBottom: "#D9DDE4",
    ground: "#E3E6EB",
    grid: { on: true, color: "#8A93A6" },
    fog: { on: false, color: "#E7EAEF", density: 0.015 },
    stars: false,
  },
  {
    id: "sunset", name: "Sunset",
    skyTop: "#FFB25E", skyBottom: "#FF5F8F",
    ground: "#FF8A5C",
    grid: { on: true, color: "#FFFFFF" },
    fog: { on: true, color: "#FF9A76", density: 0.018 },
    stars: false,
  },
  {
    id: "neon", name: "Neon Grid",
    skyTop: "#06010D", skyBottom: "#160033",
    ground: "#0A0018",
    grid: { on: true, color: "#FF5FC1" },
    fog: { on: true, color: "#0A0018", density: 0.032 },
    stars: true,
  },
];

/* --------------------------- particle FX --------------------------- */

const P = (over: Partial<ParticleConfig>): ParticleConfig => ({
  shape: "circle",
  colors: [CANDY[0]],
  count: 80,
  rate: 14,
  speed: 1.4,
  spread: 0.9,
  size: 0.16,
  gravity: -0.6,
  life: 1.1,
  additive: true,
  rise: true,
  ...over,
});

export const PARTICLE_PRESETS: { id: string; name: string; emoji: string; config: ParticleConfig }[] = [
  { id: "sparkles", name: "Sparkles", emoji: "✨", config: P({ shape: "spark", colors: ["#FFFFFF", "#FFFB96", "#7AF6FF"], rate: 22, speed: 0.9, size: 0.14, life: 0.9 }) },
  { id: "confetti", name: "Confetti", emoji: "🎉", config: P({ shape: "star", colors: ["#FF6EC7", "#05FFA1", "#FFFB96", "#7AF6FF"], rate: 26, speed: 2.6, size: 0.18, gravity: -2.4, life: 1.4, rise: false, additive: false }) },
  { id: "hearts", name: "Hearts", emoji: "💗", config: P({ shape: "heart", colors: ["#FF6EC7", "#FF9671"], rate: 10, speed: 0.8, size: 0.2, gravity: 0.5, life: 1.6 }) },
  { id: "stars", name: "Stars", emoji: "⭐", config: P({ shape: "star", colors: ["#FFFB96", "#FFFFFF"], rate: 12, speed: 1.1, size: 0.18, gravity: 0.2 }) },
  { id: "bubbles", name: "Bubbles", emoji: "🫧", config: P({ shape: "circle", colors: ["#7AF6FF", "#FFFFFF"], rate: 9, speed: 0.7, size: 0.22, gravity: 0.9, life: 1.8, additive: false }) },
  { id: "snow", name: "Snow", emoji: "❄️", config: P({ shape: "flake", colors: ["#FFFFFF", "#D9F6FF"], rate: 16, speed: 0.5, size: 0.15, gravity: -0.9, spread: 1.6, life: 2.2, rise: false, additive: false }) },
  { id: "rain", name: "Rain", emoji: "🌧️", config: P({ shape: "circle", colors: ["#9ADCFF", "#7AF6FF"], rate: 34, speed: 0.2, size: 0.09, gravity: -3.6, spread: 1.4, life: 1.2, rise: false, additive: false }) },
  { id: "embers", name: "Embers", emoji: "🔥", config: P({ shape: "circle", colors: ["#FF5E5B", "#FFB25E", "#FFFB96"], rate: 24, speed: 1.8, size: 0.11, gravity: 1.4, life: 0.9 }) },
  { id: "fireflies", name: "Fireflies", emoji: "🪰", config: P({ shape: "circle", colors: ["#05FFA1", "#FFFB96"], rate: 7, speed: 0.5, size: 0.12, gravity: 0.1, life: 2.4 }) },
  { id: "galaxy", name: "Galaxy Dust", emoji: "🌌", config: P({ shape: "spark", colors: ["#B967FF", "#7AF6FF", "#FFFFFF"], rate: 20, speed: 0.7, spread: 1.5, size: 0.13, gravity: 0, life: 1.6 }) },
  { id: "petals", name: "Petals", emoji: "🌸", config: P({ shape: "heart", colors: ["#FFD3F6", "#FF9671", "#FF6EC7"], rate: 11, speed: 1.2, size: 0.17, gravity: -1.1, spread: 1.5, life: 2, rise: false, additive: false }) },
  { id: "glitter", name: "Glitter", emoji: "✨", config: P({ shape: "spark", colors: ["#FFFB96", "#FFD700", "#FFFFFF"], rate: 30, speed: 2, size: 0.09, gravity: -1.5, life: 1 }) },
  { id: "smoke", name: "Smoke", emoji: "💨", config: P({ shape: "circle", colors: ["#B9AFC9", "#8E86A0"], rate: 12, speed: 0.6, size: 0.34, gravity: 0.7, life: 2, additive: false }) },
  { id: "magic", name: "Magic", emoji: "🪄", config: P({ shape: "spark", colors: ["#B967FF", "#FF6EC7", "#7AF6FF"], rate: 18, speed: 1.3, size: 0.16, gravity: 0.6, life: 1.3 }) },
  { id: "rainbow", name: "Rainbow", emoji: "🌈", config: P({ shape: "circle", colors: ["#FF5E5B", "#FFB25E", "#FFFB96", "#05FFA1", "#7AF6FF", "#B967FF"], rate: 24, speed: 1.5, size: 0.15, gravity: 0.3, life: 1.4 }) },
];

export function findParticleConfig(preset: string, custom: { id: string; config: ParticleConfig }[]): ParticleConfig {
  if (preset.startsWith("custom:")) {
    const id = preset.slice(7);
    const c = custom.find((x) => x.id === id);
    if (c) return c.config;
  }
  const p = PARTICLE_PRESETS.find((x) => x.id === preset);
  return p ? p.config : PARTICLE_PRESETS[0].config;
}

/* ---------------------------- factories ---------------------------- */

const uid = () => globalThis.crypto.randomUUID();

function baseObj(name: string, position: [number, number, number]): Omit<SceneObject, "type"> {
  return {
    id: uid(),
    name,
    position,
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    material: {
      preset: "clay",
      color: CANDY[Math.floor(Math.random() * CANDY.length)],
      metalness: 0,
      roughness: 0.9,
      emissive: "#FF6EC7",
      emissiveIntensity: 0,
      opacity: 1,
      printAsset: null,
    },
    effects: {
      particles: { on: false, preset: "sparkles", intensity: 1 },
      outline: { on: false, color: "#FFFFFF", thickness: 0.04 },
    },
    castShadow: true,
    receiveShadow: true,
    visible: true,
  } as Omit<SceneObject, "type">;
}

export function makeText(content = "HELLO", position: [number, number, number] = [0, 1, 0]): SceneObject {
  return {
    ...baseObj(`Text · ${content.slice(0, 12)}`, position),
    type: "text",
    text: { content, font: "helvetiker", depth: 0.35, bevel: true, theme: "cartoon" },
  } as SceneObject;
}

export function makeShape(shape: ShapeKind | "custom", position: [number, number, number] = [0, 0.6, 0]): SceneObject {
  return {
    ...baseObj(`Shape · ${shape}`, position),
    type: "shape",
    shape,
    depth: 0.3,
  } as SceneObject;
}

/** A shape object backed by imported 3DSC code (project.customShapes[id]). */
export function makeCustomShape(
  customShapeId: string,
  name: string,
  position: [number, number, number] = [0, 1, 0],
): SceneObject {
  return {
    ...baseObj(name.slice(0, 20), position),
    type: "shape",
    shape: "custom",
    customShapeId,
    depth: 0.3,
    scale: [1.4, 1.4, 1.4],
  } as SceneObject;
}

export function makeImage(asset: string, aspect: number, position: [number, number, number] = [0, 1.2, 0]): SceneObject {
  return {
    ...baseObj("Image", position),
    type: "image",
    image: { asset, aspect, frame: true },
  } as SceneObject;
}

export function makeLight(position: [number, number, number] = [2, 3, 2]): SceneObject {
  return {
    ...baseObj("Light", position),
    type: "light",
    light: { color: "#FFF3D6", intensity: 12, distance: 12 },
  } as SceneObject;
}

const CUTE_NAMES = ["Candy World", "Dreamscape", "Neon City", "Star Candy", "Cloud Nine", "Sugar Rush", "Cosmic Pop", "Glitter Verse"];

export function newProject(): Project {
  return {
    id: uid(),
    name: CUTE_NAMES[Math.floor(Math.random() * CUTE_NAMES.length)],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    stage: "void",
    worldDef: null,
    worldOpts: { ...DEFAULT_WORLD_OPTS },
    world: {
      themeId: "candy",
      custom: null,
      lightLevel: 1,
      keyLight: { on: true, intensity: 1.6, angle: 0.9, shadows: true },
      cameraLight: { on: true, intensity: 2.2, shadows: true },
      shadowQuality: 1024,
      grid: true,
    },
    objects: [],
    keyframes: [],
    duration: 6,
    cameraFov: 50,
    customParticles: [],
    customShapes: {},
    assets: {},
  };
}

/* ---------------------------- starter templates ---------------------------- */

export interface StarterTemplate {
  id: string;
  name: string;
  desc: string;
  emoji: string;
  make: () => Project;
}

function withObjects(base: Project, objects: SceneObject[], name: string, themeId: string): Project {
  return { ...base, name, world: { ...base.world, themeId, grid: true }, objects };
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: "blank",
    name: "Blank canvas",
    desc: "Empty ground + grid. Start from zero.",
    emoji: " ⬜",
    make: () => newProject(),
  },
  {
    id: "neon-loft",
    name: "Neon loft",
    desc: "Night loft with neon text, glow shapes & lights.",
    emoji: "🌃",
    make: () => {
      const p = newProject();
      const title = makeText("NEON", [0, 1.6, 0]);
      if (title.type === "text") {
        title.text.theme = "neon";
        title.material = { ...title.material, preset: "neon", emissive: "#7C6CFF", emissiveIntensity: 2.4 };
        title.effects = { ...title.effects, particles: { on: true, preset: "fireflies", intensity: 0.8 } };
      }
      const star = makeShape("star", [-2.6, 1.1, -0.8]);
      if (star.type === "shape") star.material = { ...star.material, preset: "neon", emissive: "#FF5FC1", emissiveIntensity: 2.2, color: "#FF5FC1" };
      const heart = makeShape("heart", [2.7, 1.3, -0.5]);
      if (heart.type === "shape") heart.material = { ...heart.material, preset: "neon", emissive: "#4DE1FF", emissiveIntensity: 2.2, color: "#4DE1FF" };
      const lampA = makeLight([-3.5, 3.2, 2.5]);
      if (lampA.type === "light") lampA.light = { ...lampA.light, color: "#7C6CFF", intensity: 18, distance: 16 };
      const lampB = makeLight([3.5, 3.2, 2.5]);
      if (lampB.type === "light") lampB.light = { ...lampB.light, color: "#FF5FC1", intensity: 18, distance: 16 };
      return withObjects(p, [title, star, heart, lampA, lampB], "Neon Loft", "neon");
    },
  },
  {
    id: "forest-diorama",
    name: "Forest diorama",
    desc: "Warm meadow with pine trees, rocks & fireflies.",
    emoji: "🌲",
    make: () => {
      const p = newProject();
      const objs: SceneObject[] = [];
      const pines: [number, number][] = [[-3.2, -2.4], [-2.2, 0.6], [2.9, -2.1], [3.6, 0.9], [0.4, -3.4], [-3.9, 1.6]];
      pines.forEach(([x, z], i) => {
        const s = 1 + (i % 3) * 0.22;
        const cone = makeShape("cone", [x, 0.9 * s, z]);
        if (cone.type === "shape") {
          cone.scale = [s * 0.7, s * 1.8, s * 0.7];
          cone.material = { ...cone.material, preset: "clay", color: i % 2 ? "#2f8f5b" : "#3aa76d" };
        }
        objs.push(cone);
        const trunk = makeShape("cylinder", [x, 0.3 * s, z]);
        if (trunk.type === "shape") {
          trunk.scale = [s * 0.22, s * 0.7, s * 0.22];
          trunk.material = { ...trunk.material, preset: "clay", color: "#6b4a2f" };
        }
        objs.push(trunk);
      });
      const rocks: [number, number, number][] = [[1.8, 0.35, 1.8], [-1.2, 0.3, 2.4], [0.6, 0.4, 3.4]];
      rocks.forEach(([x, y, z]) => {
        const r = makeShape("diamond", [x, y, z]);
        if (r.type === "shape") {
          r.scale = [0.55, 0.38, 0.55];
          r.rotation = [0.3, Math.random() * 3, 0.2];
          r.material = { ...r.material, preset: "clay", color: "#8d99a8" };
        }
        objs.push(r);
      });
      const fire = makeText("FOREST", [0, 2.1, -4.2]);
      if (fire.type === "text") fire.text.theme = "cartoon";
      objs.push(fire);
      return withObjects(p, objs, "Forest Diorama", "sunset");
    },
  },
  {
    id: "product-stage",
    name: "Product stage",
    desc: "Clean studio stage — 3-point light, hero object.",
    emoji: "💡",
    make: () => {
      const p = newProject();
      const hero = makeShape("knot", [0, 1.3, 0]);
      if (hero.type === "shape") {
        hero.scale = [1.6, 1.6, 1.6];
        hero.material = { ...hero.material, preset: "marble", metalness: 0.85, roughness: 0.18, color: "#dfe4ec" };
        hero.effects = { ...hero.effects, particles: { on: true, preset: "sparkle", intensity: 0.5 } };
      }
      const plinth = makeShape("cylinder", [0, 0.3, 0]);
      if (plinth.type === "shape") {
        plinth.scale = [2.4, 0.6, 2.4];
        plinth.material = { ...plinth.material, preset: "clay", color: "#c9cfda" };
      }
      const key = makeLight([4, 4.5, 3]);
      if (key.type === "light") key.light = { ...key.light, color: "#ffffff", intensity: 26, distance: 22 };
      const fill = makeLight([-4.5, 3, 2]);
      if (fill.type === "light") fill.light = { ...fill.light, color: "#cfe0ff", intensity: 10, distance: 18 };
      const rim = makeLight([0, 5, -4.5]);
      if (rim.type === "light") rim.light = { ...rim.light, color: "#ffe6c8", intensity: 16, distance: 18 };
      return withObjects(p, [hero, plinth, key, fill, rim], "Product Stage", "studio");
    },
  },
];

export function createFromTemplate(templateId: string): Project {
  const t = STARTER_TEMPLATES.find((x) => x.id === templateId) ?? STARTER_TEMPLATES[0];
  return t.make();
}

/* ----------------------------- world projects ---------------------------- */

/**
 * A project whose stage is an infinite 3DWC world — created by the /world
 * gallery when the user enters an example, a saved world, or an AI import.
 */
export function makeWorldProject(world: WorldCode): Project {
  const p = newProject();
  return {
    ...p,
    name: world.name.slice(0, 40) || "New world",
    stage: "world",
    worldDef: world,
    worldOpts: { ...DEFAULT_WORLD_OPTS },
    cameraFov: 62,
  };
}
