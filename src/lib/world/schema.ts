/**
 * 3DWC — "3Dfy World Code" v2
 *
 * A compact, deterministic JSON format for infinite procedural worlds.
 * The user copies WORLD_PROMPT into any AI, answers a short interview, and
 * pastes the ```3dwc block back — the parser below normalizes EVERYTHING
 * (clamps, defaults, sanitization) before the chunk engine ever sees it, so
 * hostile/buggy AI output can never crash or lag the renderer.
 *
 * v2 additions (all optional — v1 codes parse unchanged):
 *  - mobs        : animated critters/birds/fish/orbs/butterflies (instanced,
 *                  deterministic pure-function animation → render-safe)
 *  - lights      : up to 4 custom point/spot lights, optionally following
 *                  the player
 *  - water       : flow (wave speed) + reflectivity
 *  - atmosphere.reflections : env map intensity (PMREM from the sky)
 *  - physics     : player "fly" (default) or "walk" (terrain-clamped)
 *  - custom features : "type": "custom" features built from 3DSC-style parts
 *                  (primitives + meshes) and instanced across the world
 */

import { normalizeShapeParts, type ShapePart } from "@/lib/shapes/schema";

/* ------------------------------ feature types ----------------------------- */

export type FeatureType =
  | "pine" | "round" | "palm" | "cactus" | "rock" | "boulder"
  | "crystal" | "flower" | "grass" | "mushroom" | "building" | "custom";

export const FEATURE_TYPES: FeatureType[] = [
  "pine", "round", "palm", "cactus", "rock", "boulder",
  "crystal", "flower", "grass", "mushroom", "building", "custom",
];

export interface WorldFeature {
  type: FeatureType;
  density: number; // 0..1
  scale: [number, number];
  colors: string[]; // 2 hex colors (accent + secondary)
  /** parts for type === "custom" (3DSC primitives and/or meshes) */
  parts?: ShapePart[];
}

/* --------------------------------- mobs ----------------------------------- */

export type MobKind = "critter" | "bird" | "fish" | "orb" | "butterfly";
export const MOB_KINDS: MobKind[] = ["critter", "bird", "fish", "orb", "butterfly"];

export type MobBehavior = "wander" | "hop" | "circle" | "swim" | "flock";
export const MOB_BEHAVIORS: MobBehavior[] = ["wander", "hop", "circle", "swim", "flock"];

export interface WorldMob {
  kind: MobKind;
  count: number; // 2..80
  size: [number, number]; // meters
  colors: string[]; // 2 hex
  behavior: MobBehavior;
  speed: number; // 0.5..8
  glow: boolean;
}

/* -------------------------------- lights ---------------------------------- */

export type WorldLightType = "point" | "spot";
export interface WorldLight {
  type: WorldLightType;
  color: string;
  intensity: number; // 0..60
  distance: number; // 4..60
  position: [number, number, number];
  followPlayer: boolean;
}

/* ------------------------------ the world def ----------------------------- */

export interface WorldCode {
  format: "3dwc-2";
  name: string;
  seed: number;
  terrain: {
    amplitude: number; // 0.5..24
    frequency: number; // 0.004..0.05
    detail: number; // 0..1
    waterLevel: number | null; // null = no water
    water: { color: string; opacity: number; flow: number; reflectivity: number };
    river: { on: boolean; width: number; meander: number } | null;
    colors: string[]; // low, mid, high, peak?
  };
  features: WorldFeature[];
  atmosphere: {
    sun: { elevation: number; azimuth: number; color: string; intensity: number };
    ambient: { intensity: number; sky: string; ground: string };
    fog: { color: string; density: number };
    stars: { on: boolean; intensity: number };
    clouds: { on: boolean; coverage: number };
    shadows: boolean;
    reflections: { env: number }; // 0..1
  };
  mobs: WorldMob[];
  lights: WorldLight[];
  physics: { player: "fly" | "walk" };
}

export const MAX_MOBS = 4;
export const MAX_LIGHTS = 4;
export const MAX_CUSTOM_FEATURES = 2;

/* ------------------------------- the prompt ------------------------------ */

export const WORLD_PROMPT = `You are 3Dfy World Architect — a specialist that designs infinite procedural 3D worlds for the 3Dfy World Engine.

STEP 1 — INTERVIEW me first (one short numbered list, then STOP and wait for my answers):
1. Biome / setting? (e.g. alpine valley, desert, volcanic island, alien crystal planet, mushroom forest, cherry valley...)
2. Water: none, lakes, or ocean? Any rivers?
3. Vegetation & props? (pine forest, palms, cacti, glowing crystals, mushrooms, huts, custom monoliths/sculptures...)
4. Living creatures (mobs)? (hopping critters, circling birds, swimming fish, glowing orbs, fluttering butterflies — or none)
5. Custom lights? (a glowing beacon, lantern glow following the player, spotlights...)
6. Time of day & mood? (dawn / noon / dusk / night, foggy, starry...) Should water and metal reflect the sky?
7. Palette: 3-4 hex colors for terrain + 2 accents for props?
8. Scale taste: gentle rolling hills or dramatic mountains? Do you fly or walk?

STEP 2 — ONLY AFTER I answer, output EXACTLY ONE fenced code block tagged 3dwc (no prose inside it) matching this schema:

\`\`\`3dwc
{
  "format": "3dwc-2",
  "name": "world name (max 40 chars)",
  "seed": 12345,
  "terrain": {
    "amplitude": 8,              // 0.5-24   hill/mountain height
    "frequency": 0.012,          // 0.004-0.05  hill spacing (smaller = wider hills)
    "detail": 0.5,               // 0-1      surface roughness
    "waterLevel": 0.4,           // number = water plane height, or null for no water
    "water": { "color": "#2f6f8f", "opacity": 0.82, "flow": 1.0, "reflectivity": 0.5 },
    "river": { "on": true, "width": 6, "meander": 0.5 },   // or null
    "colors": ["#4a7a3a", "#6f9a4c", "#8f8f7a", "#e8eef2"]
  },                             // terrain colors: [low, mid, high, peak/snow] — 3 or 4 hex colors
  "features": [
    { "type": "pine",   "density": 0.35, "scale": [1.6, 3.2], "colors": ["#5a3a22", "#2f6b45"] },
    { "type": "custom", "density": 0.05, "scale": [2, 4],     "colors": ["#3a3f5c", "#9fe8ff"],
      "parts": [
        { "primitive": "cylinder", "position": [0, 1.6, 0], "scale": [0.45, 3.2, 0.45], "color": "#3a3f5c" },
        { "primitive": "mesh", "position": [0, 3.4, 0], "scale": [1.4, 0.9, 1.4], "color": "#9fe8ff",
          "mesh": { "vertices": [[0,0.5,0],[0.4,-0.2,0.28],[0.28,-0.2,-0.38],[-0.4,-0.2,0.28],[-0.28,-0.2,-0.38]],
                    "faces": [[0,1,2],[0,2,4],[0,4,3],[0,3,1],[3,4,2],[1,3,2]] } }
      ] }
  ],
  "mobs": [
    { "kind": "orb", "count": 30, "size": [0.15, 0.35], "colors": ["#9fe8ff", "#ffffff"],
      "behavior": "wander", "speed": 1.2, "glow": true }
  ],
  "lights": [
    { "type": "point", "color": "#7af6ff", "intensity": 30, "distance": 40,
      "position": [0, 12, 0], "followPlayer": false }
  ],
  "atmosphere": {
    "sun":     { "elevation": 38, "azimuth": 210, "color": "#fff3d6", "intensity": 1.6 },
    "ambient": { "intensity": 0.55, "sky": "#bcd6ff", "ground": "#6f7a5a" },
    "fog":     { "color": "#9db4c8", "density": 0.006 },
    "stars":   { "on": false, "intensity": 0.6 },
    "clouds":  { "on": true, "coverage": 0.45 },
    "shadows": false,
    "reflections": { "env": 0.5 }
  },
  "physics": { "player": "fly" }
}
\`\`\`

FEATURE TYPES (choose from these ONLY): pine, round, palm, cactus, rock, boulder, crystal, flower, grass, mushroom, building, custom.
Each feature: density 0-1 (0.15 sparse, 0.5 lush, 0.9 dense), scale [min,max] meters (0.3-12), colors [accent, secondary] as #rrggbb.
- "crystal" glows — pair it with night skies and mob orbs.
- "building" spawns simple huts — keep density below 0.15.
- "custom" repeats YOUR OWN sculpture everywhere: an array of 3DSC-style parts (primitives AND raw "mesh" parts with vertices/faces). Use it for alien monoliths, totems, custom trees, ruins... Keep it to max 2 custom features, ~50-400 vertices each, base at y=0.

MOBS (optional, max 4 entries): kind critter|bird|fish|orb|butterfly · count 2-80 · size [min,max] meters (0.1-3) · colors [body, accent] · behavior wander|hop|circle|swim|flock · speed 0.5-8 · glow true/false.
- fish swim BELOW the water surface (they need waterLevel), birds fly high, orbs float and can glow (lovely at night).

LIGHTS (optional, max 4): type point|spot · color · intensity 0-60 · distance 4-60 · position [x,y,z] · followPlayer true/false (a lantern that follows the player is a nice touch in dark worlds).

WATER: flow 0-3 (wave animation speed), reflectivity 0-1 (mirror-smooth reflective water at 1).
REFLECTIONS: atmosphere.reflections.env 0-1 — how much the sky is reflected on water and shiny surfaces. 0.6+ looks stunning on oceans and night worlds.
PHYSICS: physics.player "fly" (Minecraft creative flight — default) or "walk" (camera walks on the ground).

RULES (follow strictly):
- Max 8 feature entries (custom counts too). Total density above 2.5 gets clamped by the engine for performance.
- All colors #rrggbb hex. All numbers inside the given ranges — out-of-range values are clamped.
- waterLevel must sit below most terrain (e.g. 0 to 2 when amplitude is 6+), otherwise you get an ocean world.
- Output ONLY the code block in your final answer (one short sentence before it is OK).`;

/* ------------------------------- defaults -------------------------------- */

export const DEFAULT_WORLD: WorldCode = {
  format: "3dwc-2",
  name: "Meadow",
  seed: 1337,
  terrain: {
    amplitude: 6,
    frequency: 0.012,
    detail: 0.5,
    waterLevel: null,
    water: { color: "#2f6f8f", opacity: 0.82, flow: 1, reflectivity: 0.35 },
    river: null,
    colors: ["#4a7a3a", "#6f9a4c", "#8f8f7a", "#e8eef2"],
  },
  features: [
    { type: "pine", density: 0.3, scale: [1.6, 3.2], colors: ["#5a3a22", "#2f6b45"] },
  ],
  atmosphere: {
    sun: { elevation: 38, azimuth: 210, color: "#fff3d6", intensity: 1.6 },
    ambient: { intensity: 0.55, sky: "#bcd6ff", ground: "#6f7a5a" },
    fog: { color: "#9db4c8", density: 0.006 },
    stars: { on: false, intensity: 0.6 },
    clouds: { on: true, coverage: 0.45 },
    shadows: false,
    reflections: { env: 0 },
  },
  mobs: [],
  lights: [],
  physics: { player: "fly" },
};

/* ------------------------------- parsing --------------------------------- */

export type WorldParseResult =
  | { world: WorldCode; warnings: string[] }
  | { error: string };

/** Pull the most likely JSON payload out of arbitrary pasted text. */
export function extractJsonBlock(text: string): string | null {
  const fenced = [...text.matchAll(/```(?:[3dDwWcC]+\s*)?(?:json|3dwc|world)?\s*\r?\n([\s\S]*?)```/g)];
  for (const m of fenced) {
    const body = m[1].trim();
    if (body.startsWith("{") || body.startsWith("[")) return body;
  }
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{") { if (depth === 0) start = i; depth++; }
    else if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function clampN(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return Math.min(hi, Math.max(lo, n));
}

function safeHex(v: unknown, fallback: string): string {
  if (typeof v !== "string") return fallback;
  const s = v.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    return ("#" + s.slice(1).split("").map((c) => c + c).join("")).toLowerCase();
  }
  return fallback;
}

function safeHexArray(v: unknown, fallback: string[], max: number): string[] {
  if (!Array.isArray(v) || !v.length) return fallback.slice();
  return v.slice(0, max).map((c, i) => safeHex(c, fallback[i % fallback.length]));
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** clamp a 3-vector position read from hostile input */
function safePos(v: unknown, fallback: [number, number, number]): [number, number, number] {
  if (!Array.isArray(v)) return fallback;
  return [
    clampN(v[0], -400, 400, fallback[0]),
    clampN(v[1], -60, 260, fallback[1]),
    clampN(v[2], -400, 400, fallback[2]),
  ];
}

export function parseWorldCode(text: string): WorldParseResult {
  const warnings: string[] = [];
  const body = extractJsonBlock(text);
  if (!body) {
    return { error: "No JSON found — paste the whole ```3dwc code block your AI gave you." };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch (e) {
    return { error: `JSON syntax error: ${(e as Error).message}. Copy the code again without edits.` };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { error: 'The world code must be a JSON object like { "format": "3dwc-2", ... }.' };
  }
  return normalizeWorld(raw as Record<string, unknown>, warnings);
}

function normalizeWorld(raw: Record<string, unknown>, warnings: string[]): WorldParseResult {
  const d = DEFAULT_WORLD;

  const name =
    typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 40) : "Untitled world";

  let seed = Math.floor(clampN(raw.seed, 1, 999_999, (Math.random() * 999_999) | 0));
  if (raw.seed === undefined) warnings.push("No seed given — generated a random one.");

  /* terrain */
  const rt = (typeof raw.terrain === "object" && raw.terrain !== null ? raw.terrain : {}) as Record<string, unknown>;
  const amplitude = clampN(rt.amplitude, 0.5, 24, d.terrain.amplitude);
  if (amplitude !== num(rt.amplitude, amplitude)) warnings.push(`terrain.amplitude clamped to ${amplitude}.`);
  const frequency = clampN(rt.frequency, 0.004, 0.05, d.terrain.frequency);
  const detail = clampN(rt.detail, 0, 1, d.terrain.detail);
  const waterRaw = rt.waterLevel;
  const waterLevel =
    waterRaw === null || waterRaw === undefined || waterRaw === false
      ? null
      : clampN(waterRaw, -50, 20, 0.4);
  const waterObj = (typeof rt.water === "object" && rt.water !== null ? rt.water : {}) as Record<string, unknown>;
  const riverRaw = rt.river;
  const river =
    riverRaw && typeof riverRaw === "object"
      ? {
          on: true,
          width: clampN((riverRaw as Record<string, unknown>).width, 2, 20, 6),
          meander: clampN((riverRaw as Record<string, unknown>).meander, 0.1, 1, 0.5),
        }
      : riverRaw === true
        ? { on: true, width: 6, meander: 0.5 }
        : null;
  const colors = safeHexArray(rt.colors, d.terrain.colors, 4);
  if (colors.length < 3) colors.push(d.terrain.colors[2]);

  /* features (incl. v2 "custom") */
  const rawFeatures = Array.isArray(raw.features) ? raw.features : [];
  const features: WorldFeature[] = [];
  let unknown = 0;
  let customCount = 0;
  for (const f of rawFeatures.slice(0, 8)) {
    if (typeof f !== "object" || f === null) { unknown++; continue; }
    const fo = f as Record<string, unknown>;
    const type = String(fo.type ?? "").toLowerCase() as FeatureType;
    if (!FEATURE_TYPES.includes(type)) { unknown++; continue; }
    const scaleRaw = Array.isArray(fo.scale) ? fo.scale : [1, 2];
    const lo = clampN(scaleRaw[0], 0.3, 12, 1);
    const hi = Math.max(lo, clampN(scaleRaw[1], 0.3, 12, 2));

    /* custom feature: inline 3DSC parts (validated lightly here — the shape
       builder is already hostile-proof) */
    let parts: ShapePart[] | undefined;
    if (type === "custom") {
      if (customCount >= MAX_CUSTOM_FEATURES) {
        warnings.push(`Only ${MAX_CUSTOM_FEATURES} custom features allowed — extra ones skipped.`);
        continue;
      }
      const rawParts = Array.isArray(fo.parts) ? fo.parts : [];
      if (!rawParts.length) { unknown++; continue; }
      parts = normalizeShapeParts(rawParts, warnings);
      if (!parts.length) { unknown++; continue; }
      customCount++;
    }

    features.push({
      type,
      density: clampN(fo.density, 0, 1, 0.25),
      scale: [lo, hi],
      colors: safeHexArray(fo.colors, ["#5a3a22", "#2f6b45"], 2),
      parts,
    });
  }
  if (unknown) warnings.push(`${unknown} unknown feature${unknown > 1 ? "s" : ""} ignored.`);
  if (!features.length) warnings.push("No valid features — world will be bare terrain.");
  const totalDensity = features.reduce((a, f) => a + f.density, 0);
  if (totalDensity > 2.5) warnings.push(`Feature density ${totalDensity.toFixed(2)} is heavy — engine will throttle small props for smoothness.`);

  /* atmosphere */
  const ra = (typeof raw.atmosphere === "object" && raw.atmosphere !== null ? raw.atmosphere : {}) as Record<string, unknown>;
  const sunObj = (typeof ra.sun === "object" && ra.sun !== null ? ra.sun : {}) as Record<string, unknown>;
  const ambObj = (typeof ra.ambient === "object" && ra.ambient !== null ? ra.ambient : {}) as Record<string, unknown>;
  const fogObj = (typeof ra.fog === "object" && ra.fog !== null ? ra.fog : {}) as Record<string, unknown>;
  const starObj = (typeof ra.stars === "object" && ra.stars !== null ? ra.stars : {}) as Record<string, unknown>;
  const cloudObj = (typeof ra.clouds === "object" && ra.clouds !== null ? ra.clouds : {}) as Record<string, unknown>;
  const reflObj = (typeof ra.reflections === "object" && ra.reflections !== null ? ra.reflections : {}) as Record<string, unknown>;

  /* mobs (v2) */
  const rawMobs = Array.isArray(raw.mobs) ? raw.mobs : [];
  const mobs: WorldMob[] = [];
  let mobsSkipped = 0;
  for (const m of rawMobs.slice(0, MAX_MOBS)) {
    if (typeof m !== "object" || m === null) { mobsSkipped++; continue; }
    const mo = m as Record<string, unknown>;
    const kind = String(mo.kind ?? "critter").toLowerCase() as MobKind;
    if (!MOB_KINDS.includes(kind)) { mobsSkipped++; continue; }
    const behavior = String(mo.behavior ?? "wander").toLowerCase() as MobBehavior;
    const sizeRaw = Array.isArray(mo.size) ? mo.size : [0.2, 0.5];
    const sLo = clampN(sizeRaw[0], 0.1, 3, 0.2);
    const sHi = Math.max(sLo, clampN(sizeRaw[1], 0.1, 3, 0.5));
    mobs.push({
      kind,
      count: Math.round(clampN(mo.count, 2, 80, 12)),
      size: [sLo, sHi],
      colors: safeHexArray(mo.colors, ["#e8ecf1", "#e2493b"], 2),
      behavior: MOB_BEHAVIORS.includes(behavior) ? behavior : "wander",
      speed: clampN(mo.speed, 0.5, 8, 1.5),
      glow: mo.glow === true,
    });
  }
  if (mobsSkipped) warnings.push(`${mobsSkipped} invalid mob${mobsSkipped > 1 ? "s" : ""} skipped.`);
  const fish = mobs.find((m) => m.kind === "fish");
  if (fish && waterLevel === null) warnings.push("Fish need water — add a waterLevel or they will hover at ground level.");

  /* lights (v2) */
  const rawLights = Array.isArray(raw.lights) ? raw.lights : [];
  const lights: WorldLight[] = [];
  let lightsSkipped = 0;
  for (const l of rawLights.slice(0, MAX_LIGHTS)) {
    if (typeof l !== "object" || l === null) { lightsSkipped++; continue; }
    const lo = l as Record<string, unknown>;
    const type = String(lo.type ?? "point").toLowerCase() === "spot" ? "spot" : "point";
    lights.push({
      type,
      color: safeHex(lo.color, "#7af6ff"),
      intensity: clampN(lo.intensity, 0, 60, 20),
      distance: clampN(lo.distance, 4, 60, 30),
      position: safePos(lo.position, [0, 12, 0]),
      followPlayer: lo.followPlayer === true,
    });
  }
  if (lightsSkipped) warnings.push(`${lightsSkipped} invalid light${lightsSkipped > 1 ? "s" : ""} skipped.`);

  /* physics (v2) */
  const physRaw = (typeof raw.physics === "object" && raw.physics !== null ? raw.physics : {}) as Record<string, unknown>;
  const player = String(physRaw.player ?? "fly").toLowerCase() === "walk" ? "walk" : "fly";

  const world: WorldCode = {
    format: "3dwc-2",
    name,
    seed,
    terrain: {
      amplitude,
      frequency,
      detail,
      waterLevel,
      water: {
        color: safeHex(waterObj.color, d.terrain.water.color),
        opacity: clampN(waterObj.opacity, 0.3, 0.95, d.terrain.water.opacity),
        flow: clampN(waterObj.flow, 0, 3, d.terrain.water.flow),
        reflectivity: clampN(waterObj.reflectivity, 0, 1, d.terrain.water.reflectivity),
      },
      river,
      colors,
    },
    features,
    atmosphere: {
      sun: {
        elevation: clampN(sunObj.elevation, 5, 90, d.atmosphere.sun.elevation),
        azimuth: clampN(sunObj.azimuth, 0, 360, d.atmosphere.sun.azimuth),
        color: safeHex(sunObj.color, d.atmosphere.sun.color),
        intensity: clampN(sunObj.intensity, 0, 3, d.atmosphere.sun.intensity),
      },
      ambient: {
        intensity: clampN(ambObj.intensity, 0, 1.5, d.atmosphere.ambient.intensity),
        sky: safeHex(ambObj.sky, d.atmosphere.ambient.sky),
        ground: safeHex(ambObj.ground, d.atmosphere.ambient.ground),
      },
      fog: {
        color: safeHex(fogObj.color, d.atmosphere.fog.color),
        density: clampN(fogObj.density, 0, 0.02, d.atmosphere.fog.density),
      },
      stars: {
        on: starObj.on === true,
        intensity: clampN(starObj.intensity, 0, 1, d.atmosphere.stars.intensity),
      },
      clouds: {
        on: cloudObj.on !== false,
        coverage: clampN(cloudObj.coverage, 0, 1, d.atmosphere.clouds.coverage),
      },
      shadows: ra.shadows === true,
      reflections: {
        env: clampN(reflObj.env, 0, 1, 0),
      },
    },
    mobs,
    lights,
    physics: { player },
  };

  return { world, warnings };
}
