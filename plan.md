# 3Dfy — V1.6 Plan & Architecture (production)

> Complete context package for 3Dfy **V1.6 (production)**. Read this first if you (or an AI)
> want to extend the app. It records every feature, file, schema and design
> decision that shipped, plus the open roadmap.
>
> Companion files: `worklog.md` (session log) and `bugfix.md` (every bug found
> and how it was fixed).

---

## 1. Product overview

**3Dfy** is a phone-first, 100% client-side 3D platform. No backend, no
accounts — everything runs on the user's GPU and persists in
localStorage / IndexedDB.

**Three modes (V1.5 order — Worlds is the flagship):**

| # | Route | Name | What it does |
|---|---|---|---|
| 1 | `/world` | **World Studio** (PRIMARY) | Infinite procedural worlds + the FULL studio: objects, lights, particles, inspector, keyframed camera paths, offline frame-perfect MP4 render. AI world-code import (3DWC v2: mobs, custom lights, reflections, walk physics). |
| 2 | `/make3d` | **Make 3D Studio** | The classic mini-Blender stage: same editor engine on a bounded stage with themes/grid. For people who want a basic, clean Blender-like place to render. |
| 3 | `/3dfy` | **Playground** | Physics name toy — squeezable 3D letters (Rapier WASM), shake/tilt, presets, live REC. |

**The key V1.5 architectural decision — ONE editor engine, two stages.**
`/world` and `/make3d` run the exact same `EditorApp` (objects, gizmo,
inspector, director timeline, render engine). The difference is the *stage*:

- `stage: "void"` — bounded 80×80 ground plane, theme sky, theme lights
  (the classic studio).
- `stage: "world"` — `WorldStage` mounts inside the same Canvas: infinite
  chunk-streamed terrain, sky-dome shader, world lights, water, clouds, mobs,
  ground-follow physics. Every editor feature works on top of it.

The stage lives in the project (`project.stage`), so world projects are normal
projects — they autosave, thumbnail, export `.3dfy`, and render video.

---

## 2. What shipped in V1.5 (feature by feature)

### 2.1 `/world` = full studio (the headline change)
- **Flow**: `/world` (gallery: example worlds, your worlds, AI import) →
  entering a world creates a *world project* → `/world/<id>` opens the full
  editor with the infinite world as the stage.
- Everything from `/make3d` works inside the world: add text/shapes/images/
  lights/AI-shapes, gizmo transform, inspector, particles, director timeline,
  keyframes + REC path recording, **offline frame-perfect MP4 render**
  (with world pre-warm — see 2.6), screenshot, undo/redo, autosave.
- Objects spawn by long-pressing the *terrain* (raycast against chunk meshes,
  `userData.terrain` tagged).
- World options in the World settings panel: render distance 2–6 (lag hint),
  quality Draft/Balanced/High, FOV, fly speed, walk mode.
- Legacy saved-worlds from V1 keep working (gallery imports them as projects).

### 2.2 Hand-look mode (Minecraft mouse-look) — NEW
- **Hand toggle button** (Hand icon) in the top bar of BOTH studios,
  persisted (`3dfy.look`).
- ON + click empty space/terrain → **pointer lock** → mouse moves the camera
  (free look, Minecraft style), wheel dollies, `Esc` releases.
- While locked: WASD/Space/Shift fly (replay-mod feel), a center crosshair
  shows, clicking selects the object under the crosshair and releases the lock
  (so the gizmo is immediately usable).
- While locked the OrbitControls are disabled; on release the orbit target is
  re-synced ahead of the camera so orbiting continues seamlessly.
- Mobile world stage: one-finger drag on empty space = look (Minecraft-PE
  feel); one-finger on an object = select/drag; two fingers = zoom/pan.

### 2.3 Camera-vs-transform interaction (bulletproof rework)
- While an object is **selected**, left-drag never orbits
  (`controls.mouseButtons.LEFT = -1`); orbit via **right-drag** (ROTATE) or
  release selection. Kills the entire class of "I grabbed the object / missed
  the gizmo and the camera spun" bugs.
- Pointer-down on any object freezes orbit **immediately** (all gizmo modes),
  re-enabled on pointer-up. The old 4px-threshold freeze is gone.
- Gizmo drags keep the `dragging-changed` hard-disable + the 400ms
  deselect-grace.

### 2.4 FOV actually works (bug fix) + camera settings
- `FovRig` inside the Canvas applies `project.cameraFov` live
  (`camera.fov = v; camera.updateProjectionMatrix()`). The Canvas `camera`
  prop is initial-only — that was the "FOV is not working" root cause.
- FOV slider (20–100°) lives in Lights & World panel (studio) and World
  settings (world stage). FOV is honored by offline renders automatically
  (same camera object).

### 2.5 3DSC v2 — real mesh import (AI shape code)
- Parts can now be `"primitive": "mesh"` with **raw geometry**:
  `mesh: { vertices: [[x,y,z]…] or flat, faces: [[a,b,c]…] (triangles or
  quads), colors?: ["#hex" per face] }` — real vertex/face data, not just
  basic primitives.
- Builder converts faces → non-indexed triangles, validates indices, computes
  normals when missing, applies the part transform, tints per-face colors →
  vertex colors. Limits: ≤ 3000 verts / ≤ 6000 tris per part, ≤ 16 parts,
  coords ±10.
- Prompt v2 explicitly coaches the AI to output meshes for organic/complex
  things (low-poly trees, characters, terrain rocks, spirals) and primitives
  for hard-surface assemblies. Sample code includes a mesh part.
- v1 codes parse unchanged (primitives-only still fine).

### 2.6 3DWC v2 — next-level world code
New optional sections (all clamped + defaulted, v1 codes parse unchanged):
- **mobs**: `[{ kind: critter|bird|fish|orb|butterfly, count, size:[min,max],
  colors:[a,b], behavior: wander|hop|circle|swim|flock, speed, glow }]` —
  instanced, animated as pure functions of (seed, t) → **fully deterministic
  in offline renders**. Fish stay under waterLevel, birds fly high, glowing
  orbs light up the night.
- **lights**: up to 4 custom point/spot lights `{type, color, intensity,
  distance, position, followPlayer}`.
- **water**: `flow` (wave animation speed) + `reflectivity` (0–1 →
  metalness/roughness/envMapIntensity on the water material).
- **atmosphere.reflections**: `{ env: 0..1 }` — PMREM environment generated
  from the sky dome (one-time), `scene.environmentIntensity` scaled →
  water/props/metal actually reflect the sky.
- **physics**: `{ player: "fly" | "walk" }` — walk mode clamps the camera to
  the terrain (eye 1.6m) with a light fake gravity; fly is the default
  Minecraft-creative mode. Toggleable live in settings.
- **custom features**: `features: [{ type: "custom", parts: [3DSC parts
  incl. mesh], density, scale, colors }]` — AI-designed props instanced
  across the world (monoliths, alien trees…). ≤ 2 custom features, ≤ 400
  verts each.
- Prompt v2: expanded interview (mobs? custom lights? reflections? walk or
  fly?) + exact schema + perf guidance.

### 2.7 Offline render in worlds (determinism)
- Chunk streaming is wall-clock-budgeted (non-deterministic) → would flicker
  in a frame-stepped render. Solution:
  1. **Pre-warm**: before rendering a world project, the RenderDialog walks
     the camera path (samples every ~4s), queues and builds every chunk
     within render distance of every sample, with a "Preparing world…"
     progress phase.
  2. **Freeze**: while `renderDriver.active`, the ChunkManager skips
     build/prune entirely (water/clouds/mobs keep animating — all pure
     functions of the deterministic clock).
- Mobs are pure `(seed, t)` functions → identical output on every render.

### 2.8 Everything verified carried over from V1
- Fly camera (desktop WASD/Space/Shift + mobile pad, default-on toggle).
- Autosave (debounced + flush) with "Saved ✓" chip.
- Inspector gating (enabled only with a selection).
- 10-minute timeline (`MAX_DURATION = 600`) — V1.5 also fixed the path-REC
  auto-duration growth which was silently capped at 120s.
- Director mode + first-entry coach card (what it is: camera keyframes →
  preview → render).
- Undo per drag, templates, thumbnails, `.3dfy` import/export, SEO,
  case redirects (`/3Dfy` `/make3D` `/World` + sub-paths).

---

## 3. File map (V1.5 deltas)

```
src/
  app/
    page.tsx                     home — Worlds is the PRIMARY CTA/card
    world/page.tsx               gallery (examples / your worlds / import)
    world/[id]/page.tsx          FULL studio on a world project        ← NEW
    make3d/page.tsx              projects hub (stage-aware routing)
    make3d/[id]/page.tsx         studio (void stage)
    middleware.ts                + /World/:path* case redirects
  lib/
    three/fly.ts                 fly engine (unchanged)
    three/look.ts                hand-look (pointer lock) engine        ← NEW
    shapes/schema.ts             3DSC v2 (mesh parts) + prompt + parser
    shapes/build.ts              mesh → BufferGeometry builder
    world/schema.ts              3DWC v2 (mobs/lights/reflections/
                                 physics/custom features) + prompt
    world/chunks.ts              + custom features, water flow/reflect,
                                 frozen + prewarm modes
    world/mobs.ts                deterministic mob system               ← NEW
    world/presets.ts             7 example worlds (v2 showcase)
    editor/types.ts              Project.stage/worldDef/worldOpts, meta
    editor/store.ts              setWorldDef/updateWorldOpts, stage meta
    editor/runtime.ts            + lookState, worldRuntime singletons
  components/
    editor/WorldStage.tsx        infinite world inside EditorScene      ← NEW
    editor/HandLook.tsx          pointer-lock look controller + UI      ← NEW
    editor/EditorScene.tsx       stage switch, FovRig, orbit rules
    editor/EditorApp.tsx         stage-aware shell, hand button, stats
    editor/ObjectView.tsx        immediate orbit freeze on grab
    editor/panels/WorldStagePanel.tsx    world settings + import        ← NEW
    editor/panels/ImportWorldDialog.tsx  shared v2 import dialog        ← NEW
    world/WorldApp.tsx           gallery only (studio removed)
    (WorldScene.tsx deleted — superseded by WorldStage)
```

---

## 4. The two AI interchange formats (v2 spec)

Both follow: **interview first, then ONE fenced code block; the parser
normalizes everything; the renderer never trusts the input.**

### 3DSC v2 (`format: "3dsc-2"`)
```json
{
  "format": "3dsc-2", "name": "Low-poly Fox",
  "parts": [
    { "primitive": "mesh",
      "position": [0,0,0], "rotation": [0,0,0], "scale": [1,1,1],
      "color": "#e8873a",
      "mesh": { "vertices": [[0,0,0],[1,0,0],[0,1,0]],
                "faces": [[0,1,2]],
                "colors": ["#e8873a","#f5d6b0"] } },
    { "primitive": "sphere", "position": [0,0.8,0], "scale": [1,1,1], "color": "#f5d6b0" }
  ]
}
```
- primitives: box sphere cylinder cone torus knot capsule tetra octa dodeca
  icosa star heart gear ring **mesh**.
- mesh: vertices (flat or triplet array), faces (tri or quad lists),
  optional per-face colors; ≤ 3000 verts / 6000 tris per part.
- clamps: ≤ 16 parts (primitives ≤ 64), position ±10, scale 0.05–10.

### 3DWC v2 (`format: "3dwc-2"`)
v1 fields (terrain/features/atmosphere) + optional:
```json
{
  "format": "3dwc-2", "name": "Luminara Night", "seed": 90210,
  "terrain": { "...": "v1", "water": { "color": "#123f66", "opacity": 0.9,
    "flow": 1.4, "reflectivity": 0.85 } },
  "features": [
    { "type": "crystal", "density": 0.3, "scale": [1,3], "colors": ["#7ef","##2af"] },
    { "type": "custom", "density": 0.06, "scale": [2,4], "colors": ["#2b2f4a","#9fe8ff"],
      "parts": [ { "primitive": "cylinder", "position": [0,1.5,0], "scale": [0.5,3,0.5], "color": "#2b2f4a" } ] }
  ],
  "mobs": [ { "kind": "orb", "count": 40, "size": [0.15,0.3], "colors": ["#9fe8ff","#ffffff"],
              "behavior": "wander", "speed": 1.2, "glow": true } ],
  "lights": [ { "type": "point", "color": "#7af6ff", "intensity": 30, "distance": 40,
                "position": [0, 14, 0], "followPlayer": false } ],
  "atmosphere": { "...": "v1", "reflections": { "env": 0.8 } },
  "physics": { "player": "fly" }
}
```
- mobs ≤ 4 specs, count 2–80 each; behaviors wander/hop/circle/swim/flock.
- lights ≤ 4; point or spot; optional followPlayer.
- reflections.env 0–1 (PMREM from sky). water.reflectivity 0–1.
- physics.player fly|walk.
- custom features ≤ 2, ≤ 400 verts, instanced like other props.

---

## 5. Performance model

| Knob | Values | Effect |
|---|---|---|
| Render distance | 2–6 chunks (default 3) | (2r+1)² resident chunks; fog auto-densifies to mask streaming |
| Quality | Draft / Balanced / High | DPR 0.75/1.25/1.75, feature density ×0.55/×1/×1.25, High unlocks shadows |
| Build budget | ≈5ms/frame (12ms pre-warm) | chunk gen never spikes a frame |
| Mobs | ≤ 4 specs × ≤ 80 | one InstancedMesh per spec, pure-function animation (no per-frame allocation) |
| Env reflections | one-time PMREM 128px | only when `reflections.env > 0` |
| Render freeze | streaming off during offline render | deterministic frames, zero pop-in |

Editor perf: dpr cap 1.8, helpers stashed during captures, one debounced
localStorage write per edit burst, thumbnails every 24s.

---

## 6. How to run

```bash
bun install
bun run dev        # http://localhost:3000
# production:
bun run build && bun run start
```

No environment variables — fully client-side.

---

## 7. Open roadmap (post-V1.5)

1. Web Worker chunk generation (transferable Float32Arrays).
2. GLB import with decimation (complement to 3DSC mesh parts).
3. Day/night cycle + weather particles per world.
4. Shape re-editing (re-open imported code, tweak, rebuild).
5. Shared worlds via compressed URL (seed + deltas) or QR.
6. Procedural ambience audio per world (wind/water/birds).
7. Multi-select & grouping, snap-to-grid.
8. PWA offline install + share-target for `.3dfy`.

---

## 8. V1.6 changelog (production release)

Fixed after the user's 3dfyV1.5 field test (full detail in `bugfix.md` #19–#22):

1. **AI imports that mix mesh + gear/star/heart parts no longer spawn
   invisible** — the merge rule: every 3DSC part is normalized to a
   non-indexed, vertex-colored geometry before `mergeGeometries`, so any
   primitive combination renders (raw-mesh parts get per-face colors baked
   per expanded triangle). Regression-tested in `scripts/test-shape-build.ts`
   with the user's exact 44-part PC-rig import.
2. **New objects spawn IN FRONT of the camera** (both studios, desktop +
   mobile FAB) at a size-aware distance, terrain-lifted in worlds; long-press
   exact placement still takes precedence.
3. **World entry camera** looks at the horizon from eye level (was a
   near-vertical top-down view) — objects added at spawn now sit dead-center
   ahead at eye level.
4. **Production wiring for the public repo + 3dfy.namansoni.in**: metadata
   base, robots sitemap, web manifest, package identity (name/version/
   description), portable `node .next/standalone/server.js` start.

Deploy quick-start:

```bash
bun install            # or npm install
bun run dev            # develop on :3000
bun run build && npm start   # standalone production server
```

Vercel: import the repo — `output: "standalone"` in next.config is
Vercel-compatible; add the `3dfy.namansoni.in` domain in project settings.
VPS: `bun run build && npm start` behind any reverse proxy (the app is fully
client-side — no env vars, no database required).

QA probe (development builds only): `window.__3dfyStore` (zustand live
state), `window.__3dfyProbe()` (camera + controls), `window.__3dfySpawn(r)`.
