/** Y2K candy palette + helpers shared by both modes. */

export const CANDY = [
  "#FF6EC7", // bubblegum pink
  "#FF9671", // peach
  "#FFFB96", // butter yellow
  "#7AF6FF", // cotton-cyan
  "#05FFA1", // mint
  "#B967FF", // grape
  "#FF5E5B", // cherry
  "#FFD3F6", // pastel pink
  "#A0F0FF", // pastel cyan
  "#FFE9A8", // pastel lemon
] as const;

export const CANDY_DEEP = [
  "#E6338F", "#F26A3D", "#C7A500", "#12B5CB", "#00C874", "#8A2BE2",
] as const;

export function pick<T>(arr: readonly T[], seed?: number): T {
  if (seed === undefined) return arr[Math.floor(Math.random() * arr.length)];
  return arr[Math.floor(Math.abs(Math.sin(seed) * 10000)) % arr.length];
}

/** HSL tweak of a hex color. */
export function shade(hex: string, dl: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  r = clamp(r + dl * 255); g = clamp(g + dl * 255); b = clamp(b + dl * 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** Random pastel-candy gradient pair for backgrounds. */
export function candyGradient(seed?: number): [string, string] {
  const a = pick(CANDY, seed), b = pick(CANDY, seed !== undefined ? seed + 3 : undefined);
  return a === b ? [a, shade(a, -0.15)] : [a, b];
}
