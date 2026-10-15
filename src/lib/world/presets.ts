import type { WorldCode } from "./schema";

/**
 * Handcrafted 3DWC v2 example worlds — instant-load demos that double as
 * reference syntax for the AI prompt and parser test fixtures. Each one
 * exercises a different slice of the format (mobs, custom lights,
 * reflections, walk physics, custom mesh features).
 */

export interface WorldPreset {
  id: string;
  name: string;
  desc: string;
  tags: string[];
  gradient: [string, string];
  code: WorldCode;
}

export const WORLD_PRESETS: WorldPreset[] = [
  {
    id: "alpine",
    name: "Alpine Meadows",
    desc: "Green valley, pine forest, winding river, fish & soaring birds.",
    tags: ["river", "pines", "mobs"],
    gradient: ["#2f6b45", "#bcd6ff"],
    code: {
      format: "3dwc-2",
      name: "Alpine Meadows",
      seed: 41287,
      terrain: {
        amplitude: 11,
        frequency: 0.011,
        detail: 0.45,
        waterLevel: 0.2,
        water: { color: "#2e7fa8", opacity: 0.85, flow: 1.2, reflectivity: 0.45 },
        river: { on: true, width: 7, meander: 0.55 },
        colors: ["#3f6f3a", "#6f9a4c", "#8f8f7a", "#eef4f8"],
      },
      features: [
        { type: "pine", density: 0.42, scale: [1.8, 3.6], colors: ["#5a3a22", "#2f6b45"] },
        { type: "round", density: 0.12, scale: [1.4, 2.4], colors: ["#5a3a22", "#4c8f4c"] },
        { type: "rock", density: 0.18, scale: [0.7, 1.8], colors: ["#8d99a8", "#6f7a86"] },
        { type: "grass", density: 0.5, scale: [0.5, 1.0], colors: ["#6f9a4c", "#8f9a4c"] },
        { type: "flower", density: 0.22, scale: [0.5, 0.9], colors: ["#8f9a4c", "#ffd166"] },
      ],
      mobs: [
        { kind: "fish", count: 26, size: [0.25, 0.5], colors: ["#9db4c8", "#e8ecf1"], behavior: "swim", speed: 1.6, glow: false },
        { kind: "bird", count: 14, size: [0.3, 0.6], colors: ["#4a5568", "#e8ecf1"], behavior: "flock", speed: 2.2, glow: false },
      ],
      lights: [],
      atmosphere: {
        sun: { elevation: 42, azimuth: 215, color: "#fff3d6", intensity: 1.7 },
        ambient: { intensity: 0.6, sky: "#bcd6ff", ground: "#6f7a5a" },
        fog: { color: "#9db4c8", density: 0.0055 },
        stars: { on: false, intensity: 0.5 },
        clouds: { on: true, coverage: 0.5 },
        shadows: false,
        reflections: { env: 0.35 },
      },
      physics: { player: "fly" },
    },
  },
  {
    id: "sahara",
    name: "Sahara Dusk",
    desc: "Rolling dunes, cacti & boulders — hop the sands on foot.",
    tags: ["desert", "dusk", "walk"],
    gradient: ["#c97b3d", "#ffd9a0"],
    code: {
      format: "3dwc-2",
      name: "Sahara Dusk",
      seed: 77123,
      terrain: {
        amplitude: 6,
        frequency: 0.008,
        detail: 0.35,
        waterLevel: null,
        water: { color: "#2f6f8f", opacity: 0.82, flow: 1, reflectivity: 0.3 },
        river: null,
        colors: ["#c98d4f", "#e0b872", "#f0d9a0", "#fdf1cf"],
      },
      features: [
        { type: "cactus", density: 0.16, scale: [1.0, 2.6], colors: ["#3f7a4c", "#4c8f5c"] },
        { type: "boulder", density: 0.1, scale: [0.8, 2.2], colors: ["#a88d6f", "#8f7a5f"] },
        { type: "rock", density: 0.22, scale: [0.4, 1.2], colors: ["#c9a86f", "#a88d6f"] },
      ],
      mobs: [
        { kind: "critter", count: 16, size: [0.25, 0.45], colors: ["#e0b872", "#8f7a5f"], behavior: "hop", speed: 2.4, glow: false },
      ],
      lights: [],
      atmosphere: {
        sun: { elevation: 14, azimuth: 250, color: "#ffb25e", intensity: 2.1 },
        ambient: { intensity: 0.5, sky: "#ffd9a0", ground: "#c97b3d" },
        fog: { color: "#f0c98f", density: 0.007 },
        stars: { on: false, intensity: 0.4 },
        clouds: { on: false, coverage: 0.15 },
        shadows: false,
        reflections: { env: 0.15 },
      },
      physics: { player: "walk" },
    },
  },
  {
    id: "neon",
    name: "Neon Archipelago",
    desc: "Dark island sea, glowing crystals, orbs & a sky that reflects.",
    tags: ["night", "ocean", "reflections"],
    gradient: ["#0a1030", "#7af6ff"],
    code: {
      format: "3dwc-2",
      name: "Neon Archipelago",
      seed: 90210,
      terrain: {
        amplitude: 7,
        frequency: 0.02,
        detail: 0.55,
        waterLevel: 1.1,
        water: { color: "#123f66", opacity: 0.9, flow: 1.8, reflectivity: 0.9 },
        river: null,
        colors: ["#1c2a4a", "#2a3f66", "#41598c", "#7af6ff"],
      },
      features: [
        { type: "crystal", density: 0.3, scale: [1.2, 3.4], colors: ["#7af6ff", "#b967ff"] },
        { type: "pine", density: 0.14, scale: [1.6, 3.0], colors: ["#1c2a4a", "#23406b"] },
        { type: "rock", density: 0.16, scale: [0.6, 1.6], colors: ["#2a3f66", "#1c2a4a"] },
      ],
      mobs: [
        { kind: "orb", count: 36, size: [0.14, 0.34], colors: ["#9fe8ff", "#ffffff"], behavior: "wander", speed: 1.1, glow: true },
        { kind: "fish", count: 20, size: [0.3, 0.6], colors: ["#7af6ff", "#b967ff"], behavior: "swim", speed: 1.8, glow: true },
      ],
      lights: [
        { type: "point", color: "#7af6ff", intensity: 34, distance: 42, position: [0, 13, 0], followPlayer: false },
        { type: "point", color: "#b967ff", intensity: 22, distance: 30, position: [0, 0, 0], followPlayer: true },
      ],
      atmosphere: {
        sun: { elevation: 8, azimuth: 210, color: "#9fe8ff", intensity: 0.5 },
        ambient: { intensity: 0.3, sky: "#0a1030", ground: "#060a18" },
        fog: { color: "#0a1030", density: 0.009 },
        stars: { on: true, intensity: 0.9 },
        clouds: { on: true, coverage: 0.25 },
        shadows: false,
        reflections: { env: 0.85 },
      },
      physics: { player: "fly" },
    },
  },
  {
    id: "mushroom",
    name: "Mushroom Hollow",
    desc: "Teal dusk forest with glowing caps and fluttering butterflies.",
    tags: ["forest", "glow", "butterflies"],
    gradient: ["#2a1f4a", "#7ef2c8"],
    code: {
      format: "3dwc-2",
      name: "Mushroom Hollow",
      seed: 33117,
      terrain: {
        amplitude: 5,
        frequency: 0.016,
        detail: 0.5,
        waterLevel: -0.4,
        water: { color: "#2f6f8f", opacity: 0.8, flow: 0.8, reflectivity: 0.4 },
        river: { on: true, width: 5, meander: 0.7 },
        colors: ["#3f5a4c", "#4c7a5c", "#6f9a6c", "#a8d8b0"],
      },
      features: [
        { type: "mushroom", density: 0.4, scale: [0.8, 2.6], colors: ["#d8e8f0", "#ff6ec7"] },
        { type: "round", density: 0.2, scale: [1.6, 3.2], colors: ["#3a2a4a", "#2f6b45"] },
        { type: "grass", density: 0.45, scale: [0.5, 1.0], colors: ["#4c7a5c", "#6f9a6c"] },
        { type: "flower", density: 0.18, scale: [0.4, 0.8], colors: ["#6f9a6c", "#7ef2c8"] },
      ],
      mobs: [
        { kind: "butterfly", count: 30, size: [0.12, 0.28], colors: ["#ff6ec7", "#7ef2c8"], behavior: "wander", speed: 1.4, glow: false },
        { kind: "orb", count: 18, size: [0.1, 0.2], colors: ["#7ef2c8", "#ffffff"], behavior: "wander", speed: 0.8, glow: true },
      ],
      lights: [
        { type: "point", color: "#7ef2c8", intensity: 26, distance: 34, position: [0, 0, 0], followPlayer: true },
      ],
      atmosphere: {
        sun: { elevation: 11, azimuth: 300, color: "#b8a8ff", intensity: 0.9 },
        ambient: { intensity: 0.45, sky: "#2a1f4a", ground: "#1c1430" },
        fog: { color: "#2a1f4a", density: 0.011 },
        stars: { on: true, intensity: 0.6 },
        clouds: { on: true, coverage: 0.35 },
        shadows: false,
        reflections: { env: 0.55 },
      },
      physics: { player: "fly" },
    },
  },
  {
    id: "luminara",
    name: "Luminara Night",
    desc: "Alien obelisk plains under starlight — custom mesh monoliths.",
    tags: ["alien", "custom mesh", "night"],
    gradient: ["#120a2a", "#ff9ad5"],
    code: {
      format: "3dwc-2",
      name: "Luminara Night",
      seed: 5150,
      terrain: {
        amplitude: 9,
        frequency: 0.013,
        detail: 0.4,
        waterLevel: 0.1,
        water: { color: "#1a0f38", opacity: 0.92, flow: 1.5, reflectivity: 0.95 },
        river: null,
        colors: ["#241a3f", "#3a2a5c", "#5c4a8c", "#c9b8ff"],
      },
      features: [
        {
          type: "custom",
          density: 0.07,
          scale: [2.4, 4.4],
          colors: ["#2b2f4a", "#ff9ad5"],
          parts: [
            { primitive: "cylinder", position: [0, 1.9, 0], rotation: [0, 0, 0], scale: [0.5, 3.8, 0.5], color: "#2b2f4a" },
            {
              primitive: "mesh",
              position: [0, 4.15, 0],
              rotation: [0, 0, 0],
              scale: [1.5, 1.0, 1.5],
              color: "#ff9ad5",
              mesh: {
                vertices: [
                  [0, 0.55, 0], [0.55, -0.25, 0.32], [0.34, -0.25, -0.47], [-0.34, -0.25, 0.47],
                  [-0.55, -0.25, -0.32], [0, -0.6, 0],
                ],
                faces: [
                  [0, 1, 2], [0, 2, 4], [0, 4, 3], [0, 3, 1],
                  [5, 2, 1], [5, 4, 2], [5, 3, 4], [5, 1, 3],
                ],
                colors: ["#ff9ad5", "#c9b8ff", "#7af6ff"],
              },
            },
          ],
        },
        { type: "crystal", density: 0.2, scale: [0.8, 2.4], colors: ["#c9b8ff", "#ff9ad5"] },
        { type: "rock", density: 0.14, scale: [0.6, 1.6], colors: ["#3a2a5c", "#241a3f"] },
      ],
      mobs: [
        { kind: "orb", count: 44, size: [0.12, 0.3], colors: ["#ff9ad5", "#c9b8ff"], behavior: "wander", speed: 1.3, glow: true },
        { kind: "bird", count: 10, size: [0.3, 0.55], colors: ["#5c4a8c", "#c9b8ff"], behavior: "circle", speed: 2.6, glow: false },
      ],
      lights: [
        { type: "spot", color: "#ff9ad5", intensity: 30, distance: 44, position: [0, 0, 0], followPlayer: false },
      ],
      atmosphere: {
        sun: { elevation: 6, azimuth: 190, color: "#c9b8ff", intensity: 0.4 },
        ambient: { intensity: 0.28, sky: "#120a2a", ground: "#0a0618" },
        fog: { color: "#120a2a", density: 0.008 },
        stars: { on: true, intensity: 1.0 },
        clouds: { on: true, coverage: 0.2 },
        shadows: false,
        reflections: { env: 0.9 },
      },
      physics: { player: "fly" },
    },
  },
  {
    id: "sakura",
    name: "Sakura Valley",
    desc: "Pink river valley, blossom trees & koi drifting downstream.",
    tags: ["sakura", "river", "koi"],
    gradient: ["#e887b0", "#ffe3f0"],
    code: {
      format: "3dwc-2",
      name: "Sakura Valley",
      seed: 8388617,
      terrain: {
        amplitude: 7,
        frequency: 0.012,
        detail: 0.42,
        waterLevel: 0.15,
        water: { color: "#7ab8d8", opacity: 0.82, flow: 2.4, reflectivity: 0.5 },
        river: { on: true, width: 8, meander: 0.62 },
        colors: ["#6f9a6c", "#8fb87a", "#c9d8b0", "#f0e8d8"],
      },
      features: [
        { type: "round", density: 0.34, scale: [1.8, 3.4], colors: ["#5a3a22", "#ffb7c9"] },
        { type: "flower", density: 0.3, scale: [0.4, 0.8], colors: ["#8f9a4c", "#ffd1e0"] },
        { type: "grass", density: 0.4, scale: [0.5, 1.0], colors: ["#6f9a6c", "#8fb87a"] },
      ],
      mobs: [
        { kind: "fish", count: 24, size: [0.3, 0.55], colors: ["#ff9ad5", "#ffe3f0"], behavior: "swim", speed: 2.2, glow: false },
        { kind: "butterfly", count: 26, size: [0.12, 0.26], colors: ["#ff6ec7", "#fff0f5"], behavior: "wander", speed: 1.6, glow: false },
      ],
      lights: [],
      atmosphere: {
        sun: { elevation: 35, azimuth: 160, color: "#fff0e0", intensity: 1.6 },
        ambient: { intensity: 0.6, sky: "#ffe3f0", ground: "#c9a8b8" },
        fog: { color: "#ffd9e8", density: 0.006 },
        stars: { on: false, intensity: 0.4 },
        clouds: { on: true, coverage: 0.45 },
        shadows: false,
        reflections: { env: 0.45 },
      },
      physics: { player: "fly" },
    },
  },
  {
    id: "ember",
    name: "Ember Isles",
    desc: "Volcanic islands with molten seas and a smoking crimson sky.",
    tags: ["volcanic", "lava sea", "night"],
    gradient: ["#3a0f0f", "#ff7a3c"],
    code: {
      format: "3dwc-2",
      name: "Ember Isles",
      seed: 60613,
      terrain: {
        amplitude: 10,
        frequency: 0.018,
        detail: 0.65,
        waterLevel: 0.6,
        water: { color: "#ff5e2b", opacity: 0.95, flow: 2.8, reflectivity: 0.7 },
        river: null,
        colors: ["#2a1a14", "#4a2a1c", "#6f3a24", "#ff9a5c"],
      },
      features: [
        { type: "rock", density: 0.3, scale: [0.8, 2.4], colors: ["#2a1a14", "#4a2a1c"] },
        { type: "boulder", density: 0.14, scale: [1.2, 3.0], colors: ["#3a241c", "#2a1a14"] },
        { type: "crystal", density: 0.12, scale: [1.0, 2.6], colors: ["#ff7a3c", "#ffd166"] },
      ],
      mobs: [
        { kind: "orb", count: 30, size: [0.12, 0.3], colors: ["#ffb25e", "#ff5e5b"], behavior: "wander", speed: 1.7, glow: true },
      ],
      lights: [
        { type: "point", color: "#ff7a3c", intensity: 40, distance: 50, position: [0, 10, 0], followPlayer: false },
      ],
      atmosphere: {
        sun: { elevation: 9, azimuth: 220, color: "#ff7a3c", intensity: 1.2 },
        ambient: { intensity: 0.4, sky: "#3a0f0f", ground: "#1c0808" },
        fog: { color: "#4a1414", density: 0.012 },
        stars: { on: true, intensity: 0.5 },
        clouds: { on: true, coverage: 0.4 },
        shadows: false,
        reflections: { env: 0.6 },
      },
      physics: { player: "fly" },
    },
  },
];

/** Pasteable sample exercising EVERY v2 feature — used by the import dialog. */
export const SAMPLE_WORLD_TEXT = `\`\`\`3dwc
{
  "format": "3dwc-2",
  "name": "Aurora Shoals",
  "seed": 24601,
  "terrain": {
    "amplitude": 8,
    "frequency": 0.014,
    "detail": 0.5,
    "waterLevel": 0.5,
    "water": { "color": "#1e5f8f", "opacity": 0.88, "flow": 1.6, "reflectivity": 0.8 },
    "river": { "on": true, "width": 6, "meander": 0.6 },
    "colors": ["#2f5a4a", "#4c8f6c", "#8f9a7a", "#e8f4f8"]
  },
  "features": [
    { "type": "pine", "density": 0.3, "scale": [1.8, 3.4], "colors": ["#4a3a2a", "#2f6b45"] },
    { "type": "crystal", "density": 0.22, "scale": [1.0, 2.8], "colors": ["#7ef2c8", "#9fe8ff"] },
    { "type": "custom", "density": 0.05, "scale": [2, 3.6], "colors": ["#3a3f5c", "#9fe8ff"],
      "parts": [
        { "primitive": "cylinder", "position": [0, 1.5, 0], "scale": [0.4, 3, 0.4], "color": "#3a3f5c" },
        { "primitive": "mesh", "position": [0, 3.3, 0], "scale": [1.3, 0.9, 1.3], "color": "#9fe8ff",
          "mesh": { "vertices": [[0,0.5,0],[0.45,-0.2,0.26],[0.28,-0.2,-0.38],[-0.45,-0.2,0.26],[-0.28,-0.2,-0.38]],
                    "faces": [[0,1,2],[0,2,4],[0,4,3],[0,3,1],[3,4,2],[1,3,2]] } }
      ] }
  ],
  "mobs": [
    { "kind": "fish", "count": 24, "size": [0.25, 0.5], "colors": ["#9fe8ff", "#e8ecf1"], "behavior": "swim", "speed": 1.8, "glow": false },
    { "kind": "orb", "count": 28, "size": [0.12, 0.3], "colors": ["#7ef2c8", "#ffffff"], "behavior": "wander", "speed": 1.2, "glow": true },
    { "kind": "bird", "count": 12, "size": [0.3, 0.55], "colors": ["#4a5568", "#e8ecf1"], "behavior": "flock", "speed": 2.4, "glow": false }
  ],
  "lights": [
    { "type": "point", "color": "#7ef2c8", "intensity": 30, "distance": 40, "position": [0, 12, 0], "followPlayer": false },
    { "type": "point", "color": "#9fe8ff", "intensity": 18, "distance": 26, "position": [0, 0, 0], "followPlayer": true }
  ],
  "atmosphere": {
    "sun": { "elevation": 12, "azimuth": 240, "color": "#9fe8ff", "intensity": 0.8 },
    "ambient": { "intensity": 0.4, "sky": "#0e1a30", "ground": "#0a1420" },
    "fog": { "color": "#0e1a30", "density": 0.008 },
    "stars": { "on": true, "intensity": 0.85 },
    "clouds": { "on": true, "coverage": 0.3 },
    "shadows": false,
    "reflections": { "env": 0.8 }
  },
  "physics": { "player": "fly" }
}
\`\`\``;
