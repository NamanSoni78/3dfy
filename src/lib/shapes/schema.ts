/**
 * 3DSC — "3Dfy Shape Code" v2
 *
 * A compact, safe, deterministic JSON format for exchanging REAL 3D shapes
 * with any AI. v2 adds **mesh parts**: raw vertex/face arrays — the AI can
 * output true low-poly geometry (trees, creatures, terrain props, gems…),
 * not just primitive assemblies. The user copies SHAPE_PROMPT into any
 * chatbot, answers the interview, gets a ```3dsc block back, and pastes it
 * into 3Dfy — the parser below normalizes EVERYTHING (clamped numbers,
 * sanitized colors, index checks, caps) before it touches the renderer.
 */

/* ------------------------------- part types ------------------------------ */

export interface ShapePart {
  primitive: ShapePrimitive;
  position: [number, number, number];
  rotation: [number, number, number]; // degrees
  scale: [number, number, number];
  color: string; // #rrggbb
  params?: { points?: number; inner?: number };
  /** raw geometry when primitive === "mesh" (v2) */
  mesh?: MeshData;
}

/* ---------------------------------- mesh --------------------------------- */

export interface MeshData {
  /** triplet list or flat [x,y,z, ...] — the parser normalizes to flat */
  vertices: number[] | number[][];
  /** index lists — length 3 = triangle, 4 = quad, longer = fan */
  faces: number[][];
  /** optional per-face hex colors (cycled when shorter than faces) */
  colors?: string[];
}

export const MESH_MAX_VERTS = 3000;
export const MESH_MAX_FACES = 6000;

/* ------------------------------- primitives ------------------------------- */

export type ShapePrimitive =
  | "box" | "sphere" | "cylinder" | "cone" | "torus" | "knot"
  | "capsule" | "tetra" | "octa" | "dodeca" | "icosa"
  | "star" | "heart" | "gear" | "ring" | "mesh";

export const SHAPE_PRIMITIVES: ShapePrimitive[] = [
  "box", "sphere", "cylinder", "cone", "torus", "knot",
  "capsule", "tetra", "octa", "dodeca", "icosa",
  "star", "heart", "gear", "ring", "mesh",
];

export const MAX_PARTS = 64;
/** mesh parts are heavier — cap those separately */
export const MAX_MESH_PARTS = 16;

/* ------------------------------- the prompt ------------------------------ */

export const SHAPE_PROMPT = `You are 3Dfy Shape Smith — an expert 3D modeler that outputs REAL geometry for the 3Dfy Shape Engine.

STEP 1 — INTERVIEW me first (short numbered questions, one message, then STOP and wait):
1. What object should I build? (e.g. low-poly fox, sailboat, crystal gem, wizard tower, spaceship, bonsai tree...)
2. Style: faceted low-poly / smooth / chunky toy?
3. Size feel: small prop, or hero object?
4. Colors: 2-4 hex colors and where they go.

STEP 2 — ONLY AFTER I answer, output EXACTLY ONE fenced code block tagged 3dsc (no prose inside it) matching this schema:

\`\`\`3dsc
{
  "format": "3dsc-2",
  "name": "short object name (max 24 chars)",
  "parts": [
    {
      "primitive": "mesh",
      "position": [0, 0, 0],
      "rotation": [0, 0, 0],
      "scale": [1, 1, 1],
      "color": "#c9a86a",
      "mesh": {
        "vertices": [[0,0,0], [0.5,0,0.87], [-0.5,0,0.87], [0,1,0]],
        "faces": [[3,1,2], [3,0,1], [3,2,0], [0,2,1]],
        "colors": ["#f7e7c3", "#c9a86a"]
      }
    },
    {
      "primitive": "cylinder",
      "position": [0, -0.2, 0],
      "rotation": [0, 0, 0],
      "scale": [0.4, 1.2, 0.4],
      "color": "#8d99a8"
    }
  ]
}
\`\`\`

PART FIELDS (every part):
- "primitive": one of box sphere cylinder cone torus knot capsule tetra octa dodeca icosa star heart gear ring MESH.
- "position": [x, y, z] each -10..10 · "rotation": [rx, ry, rz] degrees each -360..360 · "scale": [sx, sy, sz] each 0.05..10.
- "color": fallback #rrggbb tint for the part.

MESH PARTS — use these for anything organic, curved or detailed (animals, terrain, foliage, gems, vehicle bodies):
- "mesh": { "vertices": [[x,y,z], ...] (or flat [x,y,z, x,y,z, ...]), "faces": [[a,b,c], ...] }.
- faces reference vertex indices (0-based). Length 3 = triangle, 4 = quad (auto-split), longer = fan.
- Optional "mesh.colors": per-face #rrggbb array for multi-colored meshes (striped fish, patterned wings).
- Limits: max ${MESH_MAX_VERTS} vertices and ${MESH_MAX_FACES} faces PER mesh part, max ${MAX_MESH_PARTS} mesh parts total. Aim for 100-1500 vertices — low-poly is beautiful and fast.
- Winding: counter-clockwise seen from outside when you can — the engine renders double-sided, so don't stress.
- Normals are computed automatically — never output them.

PRIMITIVE PARTS — use for hard-surface / mechanical bits (hull cylinders, wheel tori, window spheres, gear trains): assemble by OVERLAPPING so the object stays one connected solid.
- "star"/"gear" accept optional "params": { "points": 3-12, "inner": 0.1-0.9 }.

BUILD RULES:
- Base the object around the origin with its "feet" near y=0; roughly fit inside a 4x4x4 box so it imports at a sensible size.
- Combine MESH parts for the sculpted body + PRIMITIVE parts for details — that's the sweet spot.
- Every color #rrggbb hex. All numbers inside the ranges — out-of-range values are clamped by the parser.
- Output ONLY the code block in your final answer (one short sentence before it is OK).`;

/* ------------------------------- parsing --------------------------------- */

export interface ShapeCode {
  format: "3dsc-2";
  name: string;
  parts: ShapePart[];
}

export type ShapeParseResult =
  | { code: ShapeCode; warnings: string[] }
  | { error: string };

/** Extract the most likely JSON payload from arbitrary pasted text. */
export function extractJsonBlock(text: string): string | null {
  const fenced = [...text.matchAll(/```(?:[3dDsScC]+\s*)?(?:json|3dsc|shape|world)?\s*\r?\n([\s\S]*?)```/g)];
  for (const m of fenced) {
    const body = m[1].trim();
    if (body.startsWith("{") || body.startsWith("[")) return body;
  }
  // fallback: first balanced {...} run
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

function clamp(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return Math.min(hi, Math.max(lo, n));
}

function safeColor(v: unknown, fallback: string): string {
  if (typeof v !== "string") return fallback;
  const s = v.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    return ("#" + s.slice(1).split("").map((c) => c + c).join("")).toLowerCase();
  }
  return fallback;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/* ---------- mesh normalization (the v2 heart — hostile-proof) ---------- */

export function normalizeMesh(raw: unknown, fallbackColor: string, warnings: string[]): MeshData | null {
  const m = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;

  /* vertices: triplets or flat */
  let verts: number[] = [];
  if (Array.isArray(m.vertices) && m.vertices.length) {
    if (typeof m.vertices[0] === "number") {
      verts = m.vertices.filter((v) => typeof v === "number" && Number.isFinite(v));
    } else {
      for (const t of m.vertices) {
        if (Array.isArray(t) && t.length >= 3) {
          const x = Number(t[0]), y = Number(t[1]), z = Number(t[2]);
          if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) verts.push(x, y, z);
        }
      }
    }
  }
  if (verts.length < 9) return null; // fewer than one triangle
  if (verts.length % 3 !== 0) verts = verts.slice(0, Math.floor(verts.length / 3) * 3);
  if (verts.length > MESH_MAX_VERTS * 3) {
    warnings.push(`Mesh capped at ${MESH_MAX_VERTS} vertices.`);
    verts = verts.slice(0, MESH_MAX_VERTS * 3);
  }
  const nV = verts.length / 3;

  /* clamp coordinates into a sane box */
  for (let i = 0; i < verts.length; i++) {
    verts[i] = Math.min(10, Math.max(-10, verts[i]));
  }

  /* faces: index lists; 3=tri 4=quad >4=fan; indices checked */
  const faces: number[][] = [];
  let dropped = 0;
  const rawFaces = Array.isArray(m.faces) ? m.faces : [];
  for (const f of rawFaces.slice(0, MESH_MAX_FACES)) {
    if (!Array.isArray(f) || f.length < 3) { dropped++; continue; }
    const idx: number[] = [];
    let ok = true;
    for (const v of f) {
      const n = Math.floor(Number(v));
      if (!Number.isFinite(n) || n < 0 || n >= nV) { ok = false; break; }
      idx.push(n);
    }
    if (!ok) { dropped++; continue; }
    faces.push(idx);
  }
  if (!faces.length) return null;
  if (dropped) warnings.push(`${dropped} invalid face${dropped > 1 ? "s" : ""} skipped.`);

  /* per-face colors */
  let colors: string[] | undefined;
  if (Array.isArray(m.colors) && m.colors.length) {
    colors = m.colors.slice(0, faces.length).map((c) => safeColor(c, fallbackColor));
  }

  return { vertices: verts, faces, colors };
}

/* ------------------------- shared part normalizer ------------------------- */

/**
 * Normalizes a raw `parts` array (from 3DSC code OR world custom features)
 * into safe ShapeParts. Mutates `warnings`. Shared by both parsers.
 */
export function normalizeShapeParts(rawParts: unknown[], warnings: string[]): ShapePart[] {
  const parts: ShapePart[] = [];
  let skipped = 0;
  let meshCount = 0;

  for (const p of rawParts.slice(0, MAX_PARTS)) {
    if (typeof p !== "object" || p === null) { skipped++; continue; }
    const part = p as Record<string, unknown>;
    const primitive = String(part.primitive ?? "").toLowerCase() as ShapePrimitive;
    if (!SHAPE_PRIMITIVES.includes(primitive)) { skipped++; continue; }

    const pos = Array.isArray(part.position) ? part.position : [0, 0, 0];
    const rot = Array.isArray(part.rotation) ? part.rotation : [0, 0, 0];
    const scl = Array.isArray(part.scale) ? part.scale : [1, 1, 1];
    const color = safeColor(part.color, "#9aa3b2");

    /* mesh part (v2) */
    let mesh: MeshData | undefined;
    if (primitive === "mesh") {
      if (meshCount >= MAX_MESH_PARTS) {
        warnings.push(`Only ${MAX_MESH_PARTS} mesh parts allowed — extra ones skipped.`);
        continue;
      }
      const normalized = normalizeMesh(part.mesh, color, warnings);
      if (!normalized) { skipped++; continue; }
      mesh = normalized;
      meshCount++;
    }

    const paramsRaw = (typeof part.params === "object" && part.params !== null ? part.params : {}) as Record<string, unknown>;
    const useParams = primitive === "star" || primitive === "gear";
    const params = useParams
      ? {
          points: Math.round(clamp(paramsRaw.points, 3, 12, primitive === "gear" ? 8 : 5)),
          inner: clamp(paramsRaw.inner, 0.1, 0.9, primitive === "gear" ? 0.75 : 0.45),
        }
      : undefined;

    parts.push({
      primitive,
      position: [clamp(pos[0], -10, 10, 0), clamp(pos[1], -10, 10, 0), clamp(pos[2], -10, 10, 0)],
      rotation: [clamp(rot[0], -360, 360, 0), clamp(rot[1], -360, 360, 0), clamp(rot[2], -360, 360, 0)],
      scale: [clamp(scl[0], 0.05, 10, 1), clamp(scl[1], 0.05, 10, 1), clamp(scl[2], 0.05, 10, 1)],
      color,
      params,
      mesh,
    });
  }

  if (skipped) warnings.push(`${skipped} invalid part${skipped > 1 ? "s" : ""} skipped.`);
  return parts;
}

/* ------------------------------- main parser ------------------------------ */

export function parseShapeCode(text: string): ShapeParseResult {
  const warnings: string[] = [];
  const body = extractJsonBlock(text);
  if (!body) {
    return { error: "No JSON found — paste the whole ```3dsc code block your AI gave you." };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch (e) {
    return { error: `JSON syntax error: ${(e as Error).message}. Copy the code again without edits.` };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { error: "The shape code must be a JSON object like { \"format\": \"3dsc-2\", ... }." };
  }
  const obj = raw as Record<string, unknown>;
  const rawParts = Array.isArray(obj.parts) ? obj.parts : [];
  if (!rawParts.length) {
    return { error: "The code has no \"parts\" array — ask the AI to output the full 3dsc block." };
  }

  const name =
    typeof obj.name === "string" && obj.name.trim()
      ? obj.name.trim().slice(0, 24)
      : "Custom shape";

  const parts = normalizeShapeParts(rawParts, warnings);

  if (!parts.length) {
    return { error: "None of the parts used a known primitive. Known: " + SHAPE_PRIMITIVES.join(", ") + "." };
  }
  if (rawParts.length > MAX_PARTS) warnings.push(`Capped at ${MAX_PARTS} parts for performance.`);
  if (parts.some((p) => !HEX_RE.test(p.color))) {
    warnings.push("Some colors were invalid and replaced.");
  }

  return { code: { format: "3dsc-2", name, parts }, warnings };
}

/* --------------------------- sample for testing --------------------------- */

export const SAMPLE_SHAPE_CODE = `\`\`\`3dsc
{
  "format": "3dsc-2",
  "name": "Gem Rocket",
  "parts": [
    { "primitive": "cylinder", "position": [0, 0.5, 0], "rotation": [0, 0, 0], "scale": [0.8, 2.2, 0.8], "color": "#e8ecf1" },
    { "primitive": "cone", "position": [0, 2.4, 0], "rotation": [0, 0, 0], "scale": [0.85, 1.2, 0.85], "color": "#e2493b" },
    { "primitive": "box", "position": [0.85, -0.4, 0], "rotation": [0, 0, -18], "scale": [0.12, 1.2, 0.7], "color": "#e2493b" },
    { "primitive": "box", "position": [-0.85, -0.4, 0], "rotation": [0, 0, 18], "scale": [0.12, 1.2, 0.7], "color": "#e2493b" },
    { "primitive": "box", "position": [0, -0.4, 0.85], "rotation": [18, 0, 0], "scale": [0.7, 1.2, 0.12], "color": "#e2493b" },
    { "primitive": "box", "position": [0, -0.4, -0.85], "rotation": [-18, 0, 0], "scale": [0.7, 1.2, 0.12], "color": "#e2493b" },
    { "primitive": "sphere", "position": [0, 1.15, 0.44], "rotation": [0, 0, 0], "scale": [0.3, 0.3, 0.12], "color": "#57c8ff" },
    {
      "primitive": "mesh",
      "position": [0, -1.55, 0],
      "rotation": [0, 0, 0],
      "scale": [0.9, 1.1, 0.9],
      "color": "#ffb25e",
      "mesh": {
        "vertices": [
          [0, 0, 0], [0.42, -0.25, 0], [0.21, -0.25, 0.36], [-0.21, -0.25, 0.36], [-0.42, -0.25, 0], [-0.21, -0.25, -0.36], [0.21, -0.25, -0.36],
          [0.28, -0.9, 0], [0.14, -0.9, 0.24], [-0.14, -0.9, 0.24], [-0.28, -0.9, 0], [-0.14, -0.9, -0.24], [0.14, -0.9, -0.24], [0, -1.5, 0]
        ],
        "faces": [
          [1, 2, 8], [2, 9, 8], [2, 3, 9], [3, 10, 9], [3, 4, 10], [4, 11, 10], [4, 5, 11], [5, 12, 11], [5, 6, 12], [6, 7, 12], [6, 1, 7], [1, 8, 7],
          [7, 8, 13], [8, 9, 13], [9, 10, 13], [10, 11, 13], [11, 12, 13], [12, 7, 13]
        ],
        "colors": ["#ff5e5b", "#ffb25e", "#fffb96"]
      }
    }
  ]
}
\`\`\``;
