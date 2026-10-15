# 3Dfy — Bugfix Log

> Every bug found during development, its root cause, and its fix. Ordered
> oldest → newest. This file is context for future debugging sessions.

---

## #1 — Playground letters clipped at screen edges (V0 → fixed in V0.9)
**Symptom**: on phones, name letters floated half-out of frame ("NAMAN"
looked like "--MAN"); tilt gestures pushed them further out.
**Root cause**: physics boundary walls sat at the frustum edge +0.15, so
letter *centers* could touch the wall while half a letter width stuck out;
tilt pan gain (×1.7) amplified the drift.
**Fix**: fit BOTH width and height with margins, aspect-aware row wrap for
long names, tilt/zoom clamped. (V2 QA re-verified: all letters in frame.)

## #2 — Video output corrupt / laggy / flickering (V0 → replaced in V0.9)
**Symptom**: rendered videos stuttered, flickered and dropped frames.
**Root cause**: `captureStream(fps)` realtime capture depends on rAF (throttled
in background tabs), and recording resized the canvas mid-stream.
**Fix**: complete rewrite — offline frame-perfect renderer: R3F
`frameloop="never"` + deterministic `advance()` per frame → canvas copy →
`VideoFrame` with explicit µs timestamps → WebCodecs VideoEncoder
(H.264/VP9/VP8 probe) → real MP4/WebM mux. Live-capture kept only as a
fallback; playground/world use `LiveRecorder` with fixed size + high bitrate.
(Verified repeatedly with ffprobe — exact frame counts, e.g. 180/180.)

## #3 — Fly camera silently dead in the World Studio (V1)
**Symptom**: pressing W/A/S/D/Space did nothing; the keydown handler ran with
correct guards and `flyKeys` flipped true — but the render loop still saw
false.
**Root cause (two parts)**:
1. **Module duplication**: `next/dynamic` with `ssr:false` caused the bundler
   to duplicate `fly.ts` across the async-chunk boundary — the listener and
   the `useFrame` reader held *different* instances of `flyKeys`/`flyState`.
2. **Fake vectors**: the scratch vectors in `applyFly` were plain objects
   (`{x,y,z} as THREE.Vector3`) with `import type * as THREE` — no
   `.set/.add/.normalize` methods, so movement math could never run.
**Fix**:
1. `flyKeys`, `flyState`, `gizmoDrag` are now **globalThis singletons**
   (`__3dfyFlyKeys` / `__3dfyFlyState` / `__3dfyGizmoDrag`) — immune to any
   chunk duplication in dev or prod.
2. Real `new THREE.Vector3()` scratch instances with a runtime three import.
**Verified**: Space held 2s → altitude 7→13; W held 5s → chunks stream 49→56.

## #4 — Camera rotated while transforming objects (V1 — user report)
**Symptom**: "while changing position, why does my camera angle move?"
**Root cause (three stacked issues)**:
1. Users naturally drag the *object itself* — that used to fall through to
   OrbitControls and rotate the camera.
2. The transform gizmo is not an R3F event object, so the click that ENDS a
   gizmo drag fired `onPointerMissed` → deselect → gizmo vanished mid-work
   and the continued drag rotated the camera.
3. Orbit re-enabled edge cases during gizmo drags.
**Fix**:
1. **Drag-to-move**: pointer-down on an object (Move tool) starts a plane
   raycast drag; orbit is frozen for the whole drag; yields instantly if the
   gizmo takes over; whole drag = one undo step (lazy commit on first move).
2. `gizmoDrag.end` timestamp + 400ms grace in `onPointerMissed`.
3. `dragging-changed` listener hard-disables orbit while dragging (on top of
   drei's makeDefault handling); gizmo size bumped to 1.05 for easier grabs.
**Verified**: VLM pair-compare — object moves, camera angle identical.

## #5 — Crash: "Cannot read properties of undefined (reading '_listeners')" (V1)
**Symptom**: selecting an object (or adding a custom shape) crashed the whole
editor with a client-side exception.
**Root cause**: the `dragging-changed` listener was registered via a
**detached** `const add = tc.addEventListener; add("…", fn)` call — losing
`this`, so three's `EventDispatcher.addEventListener` read `this._listeners`
on undefined. (Introduced while appeasing TypeScript's `never` parameter
typing; only surfaced once a selection actually mounted the gizmo.)
**Fix**: `tc.addEventListener.bind(tc)` (bound, receiver preserved) with
typeof guards. TS appeased via `as unknown as (t, fn) => void`.
**Lesson**: never call three.js dispatcher methods detached; `.bind` or call
on the object.

## #6 — Mobile fly pad rendered off-screen (V1)
**Symptom**: a11y tree had W/A/S/D buttons, but nothing visible; button rects
extended below the viewport (y 830–878 in an 844px viewport).
**Root cause**: `FlyTouchPad`'s root was `absolute inset-x-0` inside a
zero-height absolutely-positioned wrapper — the child anchored at the
wrapper's top edge and flowed *downward*, off-screen.
**Fix**: pad root is now normal flow (`flex w-full justify-between`) inside
the bottom-anchored wrapper, so it grows *upward* from the bottom offset.
Also moved the chunks/alt readout above the pad when the pad is visible
(overlap check: readout y 623 vs pad y 728).

## #7 — Touch controls invisible in test environment (V1, tooling)
**Symptom**: `(pointer: coarse)` false under agent-browser device emulation →
no pad, no gamepad toggle — while real phones are fine.
**Fix (product-level win)**: touch detection = `pointer: coarse ||
navigator.maxTouchPoints > 0 || localStorage['3dfy.pad'] === '1'` — the last
escape hatch also lets desktop/touchscreen users force the on-screen pad.

## #8 — `ssr: false` not allowed in Server Component (V1)
**Symptom**: `/world` returned 500: "`ssr: false` is not allowed with
`next/dynamic` in Server Components."
**Root cause**: page.tsx (a Server Component) wrapped WorldApp in
`dynamic(..., { ssr:false })`.
**Fix**: page imports the client component directly (same pattern as
`/3dfy`); the Canvas stays behind `ssr:false` *inside* the client component
where it's legal. Sitemap/middleware updated for `/world`.

## #9 — Shadow-map deprecation warning spam (V0.9)
**Symptom**: `THREE.WebGLShadowMap: PCFSoftShadowMap has been removed`
every reload (three 0.186).
**Fix**: `<Canvas shadows="percentage">` (maps to PCFShadowMap). Remaining
`THREE.Clock` warning is drei-internal and benign.

## #10 — Undo lost transform drags (V1, found during design)
**Symptom** (latent): gizmo drags committed undo snapshots AFTER mutation, so
undo restored the post-drag state (drag wasn't undoable).
**Fix**: snapshot lazily on the FIRST actual movement of a drag (gizmo via
`gizmoDirty` ref; object drags via `committed` flag) → whole drag = one undo
step; clicks without movement create no undo entries.

## #11 — Minor known issues (accepted, V1)
- Sonner toasts can briefly cover top-bar buttons (~4s auto-dismiss). Only
  an automation annoyance; humans tap through/around. Candidate fix: mobile
  toast position bottom-left.
- World quality switch applies on next world entry (ChunkManager is
  memoized on quality) — intentional, avoids mid-flight rebuild jank; toast
  says so.
- `THREE.Clock` deprecation warning from drei internals — upstream, benign.
- Dev-mode HMR can crash the editor TransformControls lifecycle if files are
  edited while the page is open — dev-only, never seen in production builds.

## #12 — FOV "not working" (V1.5 — user report)
**Symptom**: changing the FOV slider did nothing.
**Root cause**: the FOV was only passed as the R3F `<Canvas camera={{ fov }}>`
prop — which is **initial-only**. After mount, changing the store value never
reached the live camera (`updateProjectionMatrix` was never called).
**Fix**: `FovRig` component inside the Canvas applies
`camera.fov` + `camera.far` every frame (via a mutation helper to satisfy the
react-hooks immutability lint) and calls `updateProjectionMatrix()` when they
drift. FOV sliders added to Lights & World (studio) and World settings
(world). Verified live: FOV 50→90 visibly re-frames the scene and persists.

## #13 — Camera STILL rotating while transforming objects (V1.5 — user report, the stubborn one)
**Symptom**: "when I want to rotate or change position of any object, it
turns left/right my own camera" — survived the V1 fix.
**Root cause (the residual V1 hole)**: the V1 fix froze orbit only for
*translate-tool drags that started on the object body*. Remaining leaks:
1. With the **rotate/scale tool** active, a pointer-down on the object body
   started an OrbitControls rotate gesture (nothing disabled it).
2. Grabbing **near-but-not-on** the gizmo fell through to orbit.
3. The freeze waited 4px of movement — the first few pixels still rotated.
**Fix (class-kill, not patch)**:
1. While any object is selected, `controls.mouseButtons.LEFT = -1`
   (OrbitControls: no action). Left-drag can NEVER orbit while a gizmo is up.
   Orbit stays available via **right-drag** (ROTATE) while selected.
2. Pointer-down on any object freezes orbit **immediately** (all gizmo
   modes), thawed on pointer-up (one-shot listeners for non-translate tools).
**Verified with pixel-diff on the static studio stage**: translate-tool drag →
sky band 0 changed pixels; rotate-tool drag → 2 clusters (UI edge). Camera
mathematically still. (World-stage verification uses the same code paths.)

## #14 — Chunk streaming would flicker in offline world renders (V1.5, found in design)
**Symptom** (latent): rendering a world project frame-steps the R3F clock
deterministically, but `ChunkManager.update()` builds chunks inside a
wall-clock `performance.now()` budget — chunks could appear/disappear
mid-video depending on how fast the machine was.
**Fix**: two-part —
1. `manager.frozen = renderDriver.active`: no build, no prune while the
   offline renderer drives frames (water/clouds/mobs keep animating — they
   are pure functions of the deterministic clock).
2. **Prewarm**: before rendering a world, the RenderDialog walks the camera
   path (samples every ~4s), and `manager.prewarm()` synchronously builds
   every chunk within render distance of every sample (14ms slices, progress
   reported as "Building world chunks along the camera path…").
**Verified**: world render → ffprobe 1280×720@24fps, exactly 72/72 frames =
3.000s; frame-tile VLM check: terrain in all frames, no pop-in, smooth motion.

## #15 — Path-record auto-duration silently capped at 120s (V1.5)
**Symptom** (latent): the timeline slider allows 10 minutes, but keyframes
recorded via REC stopped growing the timeline at 120s
(`Math.min(120, …)` in `nextPathT`/`pushPathKeyframe`).
**Fix**: both clamps now use `MAX_DURATION` (600s).

## #16 — Module-scope singletons under the React Compiler lint (V1.5, tooling)
**Symptom**: `react-hooks/immutability` errors on `camera.fov = …`,
`scene.environment = …`, `manager.frozen = …` — the compiler forbids direct
assignment on hook-derived values (method calls like `position.setY()` are
fine).
**Fix**: tiny module-scope mutation helpers
(`setCameraFov/setCameraFar/setManagerFrozen/setSceneEnvironment`) — the
compiler cannot track mutations across function boundaries, and the intent
stays explicit and greppable. Intentional heavy `useMemo`s (ChunkManager /
MobSystem keyed on a content hash, not object identity) carry an
`eslint-disable react-hooks/preserve-manual-memoization` with a comment
explaining why.

## #17 — Pointer lock ate every UI click during automation (V1.5, tooling — by design)
**Symptom**: after a hand-look drag, headless-browser clicks on toolbar
buttons "did nothing" — `document.pointerLockElement === canvas` and all
mouse events were being delivered to the locked canvas at its last position.
**Diagnosis**: that IS the Minecraft mode working — drag-to-look engages
pointer lock and keeps it until Esc / a crosshair click on an object.
**Product behavior kept**: locked = free look + WASD; Esc releases; clicking
an object under the crosshair selects it AND releases the lock (verified:
`inspectorEnabled: true, lockedAfterClick: false`). Automation just needs
`document.exitPointerLock()` between scripted interactions.

## #18 — Pixel-diff QA is meaningless on animated worlds (V1.5, methodology)
**Symptom**: "camera moved" conclusions from screenshot diffs that were
actually caused by animated orbs/stars/water (a no-interaction control pair
showed 12,211 changed clusters!).
**Fix (method)**: camera-still verification must run on the static void
stage (sky-band diff = 0) or read camera/object state directly from the
project store (localStorage). A no-interaction control pair is now part of
the diff protocol.
