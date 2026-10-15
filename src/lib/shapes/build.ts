"use client";

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { shapeGeometry } from "@/lib/three/geometry";
import type { CustomShapeDef } from "@/lib/editor/types";
import type { MeshData, ShapePart } from "./schema";

/**
 * Builds imported 3DSC shapes into ONE merged, vertex-colored BufferGeometry
 * → a single draw call per object, cached by shape id (import once, reuse for
 * duplicates / undo / replay without rebuilding).
 *
 * v2: "mesh" parts carry raw vertex/face data — converted to explicit
 * triangles with optional per-face colors. Meshes render double-sided (AI
 * winding is not trustworthy).
 *
 * v2.1 — THE MERGE RULE: three's mergeGeometries REFUSES to mix indexed and
 * non-indexed geometries (gear/star/heart are ExtrudeGeometry = non-indexed;
 * box/cylinder/mesh parts are indexed) and returns null — which made mixed
 * imports like "4 gear wheels + mesh body" spawn as an entity with NO visible
 * geometry. Every part is now normalized to NON-INDEXED before merging, so
 * any primitive combination merges cleanly.
 */

const cache = new Map<string, THREE.BufferGeometry>();

function partGeometry(p: ShapePart): THREE.BufferGeometry | null {
  switch (p.primitive) {
    case "box": return new THREE.BoxGeometry(1, 1, 1);
    case "sphere": return new THREE.SphereGeometry(0.5, 24, 16);
    case "cylinder": return new THREE.CylinderGeometry(0.5, 0.5, 1, 20);
    case "cone": return new THREE.ConeGeometry(0.5, 1, 20);
    case "torus": return new THREE.TorusGeometry(0.4, 0.14, 14, 30);
    case "knot": return new THREE.TorusKnotGeometry(0.34, 0.11, 64, 10);
    case "capsule": return new THREE.CapsuleGeometry(0.3, 0.55, 6, 12);
    case "tetra": return new THREE.TetrahedronGeometry(0.6);
    case "octa": return new THREE.OctahedronGeometry(0.58);
    case "dodeca": return new THREE.DodecahedronGeometry(0.55);
    case "icosa": return new THREE.IcosahedronGeometry(0.55);
    case "star": return shapeGeometry("star", 1, 0.3);
    case "heart": return shapeGeometry("heart", 1, 0.3);
    case "gear": {
      const points = p.params?.points ?? 8;
      const inner = p.params?.inner ?? 0.75;
      return gearGeometry(points, inner);
    }
    case "ring": return new THREE.TorusGeometry(0.45, 0.08, 10, 32);
    case "mesh": return null; // handled by meshPartGeometry
    default: return null;
  }
}

/* --------------------------- v2 mesh geometry ---------------------------- */

const _meshColor = new THREE.Color();

/** triplet lists OR flat arrays → flat [x,y,z, ...] (parser already
    normalizes, but hand-built defs may not) */
function flattenVerts(v: number[] | number[][]): number[] {
  if (!v.length) return [];
  if (typeof v[0] === "number") return v as number[];
  const out: number[] = [];
  for (const t of v as number[][]) {
    if (t.length >= 3) out.push(Number(t[0]) || 0, Number(t[1]) || 0, Number(t[2]) || 0);
  }
  return out;
}

/** per-face hex → THREE.Color (falls back to the part tint) */
function safeHex(v: unknown, fallback: string): string {
  if (typeof v !== "string") return fallback;
  const s = v.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    return ("#" + s.slice(1).split("").map((c) => c + c).join("")).toLowerCase();
  }
  return fallback;
}

/** faces → flat triangle index list (3 = tri, 4 = quad → two tris, >4 = fan) */
function faceTriangles(f: number[]): number[][] {
  if (f.length === 3) return [f];
  if (f.length === 4) return [[f[0], f[1], f[2]], [f[0], f[2], f[3]]];
  const tris: number[][] = [];
  for (let i = 2; i < f.length; i++) tris.push([f[0], f[i - 1], f[i]]);
  return tris;
}

/** Valid 0-based vertex indices inside the face (hand-built defs may skip
    the parser — every index must exist before we expand anything). */
function faceIsValid(f: unknown, nV: number): f is number[] {
  if (!Array.isArray(f) || f.length < 3) return false;
  for (const vi of f) {
    if (typeof vi !== "number" || !Number.isInteger(vi) || vi < 0 || vi >= nV) return false;
  }
  return true;
}

/**
 * Raw vertices/faces → NON-INDEXED BufferGeometry with per-face colors.
 *
 * Faces are expanded to explicit triangles (quad → 2 tris, longer → fan) so
 * every triangle carries its own color — crisp per-face color boundaries,
 * no bleeding across shared vertices — and the part is non-indexed, which
 * keeps mergeGeometries() happy no matter which primitives it ends up
 * combined with (see THE MERGE RULE above).
 */
function meshPartGeometry(mesh: MeshData, fallback: string): THREE.BufferGeometry | null {
  const verts = flattenVerts(mesh.vertices);
  const nV = verts.length / 3;
  if (nV < 3) return null;

  const faceColors = mesh.colors?.length ? mesh.colors : null;
  const positions: number[] = [];
  const colors: number[] = [];
  let fi = 0;

  for (const f of mesh.faces) {
    if (faceIsValid(f, nV)) {
      _meshColor.set(safeHex(faceColors ? faceColors[fi % faceColors.length] : fallback, fallback));
      for (const tri of faceTriangles(f)) {
        for (const vi of tri) {
          positions.push(verts[vi * 3], verts[vi * 3 + 1], verts[vi * 3 + 2]);
          colors.push(_meshColor.r, _meshColor.g, _meshColor.b);
        }
      }
    }
    fi++;
  }
  if (positions.length < 9) return null;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals(); // flat per-face normals — the faceted low-poly look
  return geo;
}

/* ------------------------------- assembly -------------------------------- */

function gearGeometry(points: number, inner: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const outerR = 0.5;
  const innerR = 0.5 * inner;
  const tooth = 0.5 * (1 - inner) + 0.12;
  const N = Math.max(3, Math.min(12, Math.round(points))) * 2;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const r = i % 2 === 0 ? outerR + tooth : outerR;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, Math.max(0.06, innerR * 0.55), 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.28, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1,
  });
  geo.center();
  return geo;
}

export function buildShapeGeometry(parts: ShapePart[]): THREE.BufferGeometry | null {
  const geos: THREE.BufferGeometry[] = [];
  const col = new THREE.Color();

  for (const p of parts) {
    let g: THREE.BufferGeometry | null = null;

    if (p.primitive === "mesh" && p.mesh) {
      // already non-indexed with its own color attribute
      g = meshPartGeometry(p.mesh, p.color);
    } else {
      g = partGeometry(p);
      if (g) {
        // THE MERGE RULE: normalize every primitive to non-indexed too
        if (g.index) {
          const ni = g.toNonIndexed();
          g.dispose();
          g = ni;
        }
        g.deleteAttribute("uv");
        if (!g.attributes.normal) g.computeVertexNormals();
      }
    }
    if (!g || !g.attributes.position || g.attributes.position.count < 3) continue;

    // flat part tint for primitives (mesh parts already carry colors)
    if (!g.attributes.color) {
      col.set(p.color);
      const count = g.attributes.position.count;
      const arr = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        arr[i * 3] = col.r;
        arr[i * 3 + 1] = col.g;
        arr[i * 3 + 2] = col.b;
      }
      g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    }

    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(p.position[0], p.position[1], p.position[2]),
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          THREE.MathUtils.degToRad(p.rotation[0]),
          THREE.MathUtils.degToRad(p.rotation[1]),
          THREE.MathUtils.degToRad(p.rotation[2]),
        ),
      ),
      new THREE.Vector3(p.scale[0], p.scale[1], p.scale[2]),
    );
    g.applyMatrix4(m);
    geos.push(g);
  }

  if (!geos.length) return null;

  // every part is non-indexed with exactly { position, normal, color } →
  // mergeGeometries can never bail out on attribute/index mismatch again
  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  if (!merged) return null;
  return merged;
}

/** Cached accessor — safe to call every render. */
export function getCustomShapeGeometry(id: string, def: CustomShapeDef | undefined): THREE.BufferGeometry | null {
  if (!def) return null;
  const hit = cache.get(id);
  if (hit) return hit;
  const geo = buildShapeGeometry(def.parts);
  if (!geo) return null;
  cache.set(id, geo);
  return geo;
}

export function disposeCustomShapeGeometry(id: string): void {
  const g = cache.get(id);
  if (g) {
    g.dispose();
    cache.delete(id);
  }
}
