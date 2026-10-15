import * as THREE from "three";
import { TextGeometry } from "three-stdlib";
import type { Font } from "three-stdlib";

/* ------------------------------------------------------------------ */
/* Text geometry                                                       */
/* ------------------------------------------------------------------ */

export interface TextGeoOptions {
  size?: number;
  depth?: number;
  bevel?: boolean;
  bevelSize?: number;
  curveSegments?: number;
}

const geoCache = new Map<string, TextGeometry>();

/**
 * Extruded text geometry for a single character (or string), centered on its
 * bounding-box origin so rotation/scaling behave nicely. Cached per font+char+opts.
 */
export function textGeometry(text: string, font: Font, o: TextGeoOptions = {}): TextGeometry {
  const size = o.size ?? 1;
  const depth = o.depth ?? 0.35;
  const bevel = o.bevel ?? true;
  const bevelSize = o.bevelSize ?? 0.035;
  const key = `${text}|${size}|${depth}|${bevel}|${bevelSize}`;
  const hit = geoCache.get(key);
  if (hit) return hit;
  const geo = new TextGeometry(text, {
    font,
    size,
    height: depth, // three-stdlib uses `height` for depth
    curveSegments: o.curveSegments ?? 6,
    bevelEnabled: bevel,
    bevelThickness: bevelSize * 0.8,
    bevelSize,
  });
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  geo.translate(-(bb.max.x + bb.min.x) / 2, -(bb.max.y + bb.min.y) / 2, -(bb.max.z + bb.min.z) / 2);
  geo.computeBoundingBox();
  geoCache.set(key, geo);
  return geo;
}

/** Width/height of the centered geometry's bounding box. */
export function geoSize(geo: THREE.BufferGeometry): { w: number; h: number; d: number } {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  return { w: bb.max.x - bb.min.x, h: bb.max.y - bb.min.y, d: bb.max.z - bb.min.z };
}

/** Remap UVs to 0..1 across the geometry bounding box (enables texture prints). */
export function normalizeUVs(geo: THREE.BufferGeometry): void {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const uv = geo.attributes.uv;
  if (!uv) return;
  const pos = geo.attributes.position;
  const sx = bb.max.x - bb.min.x || 1;
  const sy = bb.max.y - bb.min.y || 1;
  for (let i = 0; i < uv.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    uv.setXY(i, (x - bb.min.x) / sx, (y - bb.min.y) / sy);
  }
  uv.needsUpdate = true;
}

/* ------------------------------------------------------------------ */
/* Shape geometries (star, heart + prims)                              */
/* ------------------------------------------------------------------ */

function starShape(outer: number, inner: number, points = 5): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

function heartShape(size: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = 0, y = 0;
  s.moveTo(x, y + size * 0.3);
  s.bezierCurveTo(x, y + size * 0.55, x - size * 0.5, y + size * 0.75, x - size * 0.5, y + size * 0.35);
  s.bezierCurveTo(x - size * 0.5, y + size * 0.05, x - size * 0.25, y - size * 0.1, x, y - size * 0.35);
  s.bezierCurveTo(x + size * 0.25, y - size * 0.1, x + size * 0.5, y + size * 0.05, x + size * 0.5, y + size * 0.35);
  s.bezierCurveTo(x + size * 0.5, y + size * 0.75, x, y + size * 0.55, x, y + size * 0.3);
  return s;
}

export type ShapeKind =
  | "star" | "heart" | "cube" | "sphere" | "torus" | "cone"
  | "cylinder" | "knot" | "diamond" | "capsule";

export const SHAPE_KINDS: { id: ShapeKind; name: string; emoji: string }[] = [
  { id: "star", name: "Star", emoji: "⭐" },
  { id: "heart", name: "Heart", emoji: "💗" },
  { id: "cube", name: "Cube", emoji: "🧊" },
  { id: "sphere", name: "Sphere", emoji: "🔮" },
  { id: "torus", name: "Donut", emoji: "🍩" },
  { id: "cone", name: "Cone", emoji: "🍦" },
  { id: "cylinder", name: "Cylinder", emoji: "🥫" },
  { id: "knot", name: "Knot", emoji: "🪢" },
  { id: "diamond", name: "Diamond", emoji: "💎" },
  { id: "capsule", name: "Capsule", emoji: "💊" },
];

export function shapeGeometry(kind: ShapeKind, size = 1, depth = 0.3): THREE.BufferGeometry {
  switch (kind) {
    case "star": {
      const geo = new THREE.ExtrudeGeometry(starShape(size, size * 0.45), {
        depth, bevelEnabled: true, bevelThickness: 0.04 * size, bevelSize: 0.04 * size, bevelSegments: 2,
      });
      geo.center();
      return geo;
    }
    case "heart": {
      const geo = new THREE.ExtrudeGeometry(heartShape(size), {
        depth, bevelEnabled: true, bevelThickness: 0.04 * size, bevelSize: 0.04 * size, bevelSegments: 2,
      });
      geo.center();
      return geo;
    }
    case "cube": return new THREE.BoxGeometry(size, size, size);
    case "sphere": {
      const geo = new THREE.SphereGeometry(size / 2, 32, 20);
      return geo;
    }
    case "torus": return new THREE.TorusGeometry(size / 2.2, size / 5, 16, 40);
    case "cone": return new THREE.ConeGeometry(size / 2, size, 24);
    case "cylinder": return new THREE.CylinderGeometry(size / 2.4, size / 2.4, size, 24);
    case "knot": return new THREE.TorusKnotGeometry(size / 2.6, size / 8, 80, 12);
    case "diamond": return new THREE.OctahedronGeometry(size / 1.4);
    case "capsule": return new THREE.CapsuleGeometry(size / 3.4, size / 1.7, 6, 12);
  }
}

/** Full word layout: geometries + x-offsets so letters sit side by side, centered. */
export interface LetterSlot {
  char: string;
  geo: TextGeometry;
  w: number;
  h: number;
  x: number;
}

export function layoutWord(
  text: string,
  font: Font,
  opts: TextGeoOptions & { spacing?: number } = {},
): { slots: LetterSlot[]; width: number; height: number } {
  const chars = [...text].filter((c) => c.trim().length > 0);
  const spacing = opts.spacing ?? 0.09;
  const slots: LetterSlot[] = chars.map((char) => {
    const geo = textGeometry(char, font, opts);
    const s = geoSize(geo);
    return { char, geo, w: s.w, h: s.h, x: 0 };
  });
  const total = slots.reduce((sum, s) => sum + s.w + spacing, 0) - (slots.length ? spacing : 0);
  let x = -total / 2;
  let height = 0;
  for (const s of slots) {
    x += s.w / 2;
    s.x = x;
    x += s.w / 2 + spacing;
    height = Math.max(height, s.h);
  }
  return { slots, width: total, height };
}
