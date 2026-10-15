import * as THREE from "three";
import { CANDY } from "@/lib/palette";
import {
  candyGradientTexture,
  glitterTexture,
  marbleTexture,
  stripeTexture,
} from "@/lib/three/textures";

export type MaterialPreset =
  | "clay" | "metallic" | "glass" | "neon" | "rubber" | "marble";

export const MATERIAL_PRESETS: { id: MaterialPreset; name: string; emoji: string }[] = [
  { id: "clay", name: "Clay", emoji: "🧱" },
  { id: "metallic", name: "Metallic", emoji: "🔩" },
  { id: "glass", name: "Glass", emoji: "🫧" },
  { id: "neon", name: "Neon", emoji: "💡" },
  { id: "rubber", name: "Rubber", emoji: "🛞" },
  { id: "marble", name: "Marble", emoji: "🏛️" },
];

export interface MaterialOptions {
  color?: string;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
  map?: THREE.Texture | null;
}

/** Build a material for a preset. Callers own disposal (cache small maps internally). */
export function createMaterial(preset: MaterialPreset, opts: MaterialOptions = {}): THREE.Material {
  const color = opts.color ?? CANDY[0];
  switch (preset) {
    case "metallic":
      return new THREE.MeshStandardMaterial({
        color, metalness: 1, roughness: 0.16, envMapIntensity: 1.6,
        map: opts.map ?? null,
      });
    case "glass":
      return new THREE.MeshPhysicalMaterial({
        color, metalness: 0, roughness: 0.05, transmission: 0.92,
        thickness: 1.2, ior: 1.4, transparent: true, opacity: opts.opacity ?? 1,
        clearcoat: 0.6, map: opts.map ?? null,
      });
    case "neon":
      return new THREE.MeshStandardMaterial({
        color: "#fff",
        emissive: opts.emissive ?? color,
        emissiveIntensity: opts.emissiveIntensity ?? 2.4,
        roughness: 0.4, map: opts.map ?? null,
      });
    case "rubber":
      return new THREE.MeshStandardMaterial({
        color, metalness: 0, roughness: 0.55, map: opts.map ?? null,
      });
    case "marble":
      return new THREE.MeshPhysicalMaterial({
        metalness: 0.05, roughness: 0.28,
        clearcoat: 1, clearcoatRoughness: 0.15,
        map: marbleTexture(),
        color: new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.25),
      });
    case "clay":
    default:
      return new THREE.MeshStandardMaterial({
        color, metalness: 0, roughness: 0.9, map: opts.map ?? null,
      });
  }
}

/** Physics restitution per preset (rubber = bouncy). */
export function materialRestitution(preset: MaterialPreset): number {
  switch (preset) {
    case "rubber": return 0.85;
    case "glass": return 0.25;
    case "metallic": return 0.45;
    case "clay": return 0.35;
    default: return 0.55;
  }
}

/* ---------------------- editor text themes ---------------------- */

export interface TextThemeDef {
  id: string;
  name: string;
  emoji: string;
  preset: MaterialPreset;
  color: string;
  /** gradient stops applied via map */
  gradient?: string[];
  stripes?: [string, string];
  glitter?: boolean;
  emissiveIntensity?: number;
  outline?: string;
}

export const TEXT_THEMES: TextThemeDef[] = [
  { id: "cartoon", name: "Cartoon", emoji: "🎨", preset: "clay", color: "#FF6EC7", outline: "#ffffff" },
  { id: "neon", name: "Neon", emoji: "💡", preset: "neon", color: "#05FFA1" },
  { id: "chrome", name: "Chrome", emoji: "🔩", preset: "metallic", color: "#cfd8e3" },
  { id: "candy", name: "Candy", emoji: "🍬", preset: "clay", color: "#ffffff", gradient: ["#FF6EC7", "#7AF6FF", "#FFFB96", "#B967FF"] },
  { id: "glass", name: "Glass", emoji: "🫧", preset: "glass", color: "#dff6ff" },
  { id: "gold", name: "Gold", emoji: "🏆", preset: "metallic", color: "#ffd24d" },
  { id: "retro", name: "Retro", emoji: "📺", preset: "clay", color: "#ffffff", stripes: ["#FF6EC7", "#3b2b4d"] },
  { id: "party", name: "Party", emoji: "🎉", preset: "clay", color: "#ffffff", glitter: true },
  { id: "ice", name: "Ice", emoji: "🧊", preset: "glass", color: "#cdefff", emissiveIntensity: 0.15 },
  { id: "lava", name: "Lava", emoji: "🌋", preset: "neon", color: "#ff5e5b", emissiveIntensity: 2.8 },
  { id: "balloon", name: "Balloon", emoji: "🎈", preset: "rubber", color: "#FF9671" },
  { id: "royal", name: "Royal", emoji: "👑", preset: "marble", color: "#B967FF" },
];

export function textThemeMap(theme: TextThemeDef): THREE.Texture | null {
  if (theme.gradient) return candyGradientTexture(theme.gradient);
  if (theme.stripes) return stripeTexture(theme.stripes[0], theme.stripes[1]);
  if (theme.glitter) return glitterTexture();
  return null;
}
