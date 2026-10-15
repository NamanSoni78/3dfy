"use client";

import * as THREE from "three";

/**
 * Shared editor runtime:
 *  - object3D registry (selection / gizmos / FX anchors)
 *  - pending spawn point from long-press
 *  - helper-object registry (gizmos, grids, outlines…): everything the user
 *    does NOT want in screenshots / renders gets tagged here.
 *  - renderDriver: deterministic offline-render clock that the camera rig
 *    and every useFrame system listens to (Blender-style frame stepping).
 */

export const objectRefs = new Map<string, THREE.Object3D>();

/** Live OrbitControls instance (for keyframe capture & go-to). */
export const controlsRef: { current: { target: THREE.Vector3 } | null } = { current: null };

export const pendingSpawn = {
  point: null as [number, number, number] | null,
};

export function setPendingSpawn(p: [number, number, number] | null): void {
  pendingSpawn.point = p;
}

/* ----------------------------- interaction ------------------------------ */

const rtGlobal = globalThis as unknown as {
  __3dfyGizmoDrag?: { end: number; active: boolean };
  __3dfyFlyState?: { enabled: boolean; speed: number };
  __3dfyLookState?: { enabled: boolean; locked: boolean };
  __3dfyWorldRuntime?: {
    manager: unknown;
    stats: { loaded: number; pending: number; alt: number };
    prewarm: null | ((samples: [number, number, number][], onProgress: (p: number) => void) => Promise<boolean>);
  };
};

/** Timestamp of the last transform-gizmo drag end — lets `onPointerMissed`
 *  ignore the click that ENDS a gizmo drag (the gizmo is not an R3F event
 *  object, so that click would otherwise deselect the object mid-work).
 *  globalThis singleton — safe across async-chunk duplication. */
export const gizmoDrag = (rtGlobal.__3dfyGizmoDrag ??= { end: 0, active: false });

/** Shared fly-camera preferences (studio + world studio) — same guarantee. */
export const flyState = (rtGlobal.__3dfyFlyState ??= { enabled: true, speed: 7 });

/** Hand-look (Minecraft pointer-lock) mode — shared by both studios. */
export const lookState = (rtGlobal.__3dfyLookState ??= { enabled: true, locked: false });

/** Live infinite-world runtime bridge (ChunkManager stats + prewarm hook). */
export const worldRuntime = (rtGlobal.__3dfyWorldRuntime ??= {
  manager: null as unknown,
  stats: { loaded: 0, pending: 0, alt: 0 },
  prewarm: null as null | ((samples: [number, number, number][], onProgress: (p: number) => void) => Promise<boolean>),
});

export function loadFlyPrefs(): void {
  try {
    const raw = window.localStorage.getItem("3dfy.fly");
    if (raw) {
      const v = JSON.parse(raw) as { enabled?: boolean; speed?: number };
      if (typeof v.enabled === "boolean") flyState.enabled = v.enabled;
      if (typeof v.speed === "number") flyState.speed = Math.min(30, Math.max(2, v.speed));
    }
  } catch { /* defaults */ }
}

export function saveFlyPrefs(): void {
  try {
    window.localStorage.setItem("3dfy.fly", JSON.stringify({ enabled: flyState.enabled, speed: flyState.speed }));
  } catch { /* private mode */ }
}

export function loadLookPrefs(): void {
  try {
    const raw = window.localStorage.getItem("3dfy.look");
    if (raw) {
      const v = JSON.parse(raw) as { enabled?: boolean };
      if (typeof v.enabled === "boolean") lookState.enabled = v.enabled;
    }
  } catch { /* defaults */ }
}

export function saveLookPrefs(): void {
  try {
    window.localStorage.setItem("3dfy.look", JSON.stringify({ enabled: lookState.enabled }));
  } catch { /* private mode */ }
}

/* ------------------------------ helpers -------------------------------- */

/**
 * Frame an object in the camera view (bounding-sphere accurate, works on
 * narrow portrait viewports where wide text would otherwise clip).
 *
 * mode "focus" — always center + fit (F hotkey / mobile Focus button).
 * mode "nudge" — only acts when the object does NOT comfortably fit or its
 *                center is off-screen (used after addObject so we never yank
 *                the camera while composing a scene).
 *
 * Returns false when the object (or its geometry) is not mounted yet —
 * callers may retry after a short delay (text fonts build asynchronously).
 */
export function frameObjectInView(
  camera: THREE.PerspectiveCamera,
  controls: { target: THREE.Vector3; update?: () => void } | null,
  id: string,
  mode: "focus" | "nudge" = "focus",
): boolean {
  const node = objectRefs.get(id);
  if (!node || !controls) return false;
  const box = new THREE.Box3().setFromObject(node);
  if (box.isEmpty()) return false;
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const r = Math.max(sphere.radius, 0.4);
  const center = sphere.center;

  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const aspect = camera.aspect || 1;
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
  const cone = Math.min(vfov, hfov);
  const margin = mode === "focus" ? 1.16 : 1.06;
  const need = Math.min((r / Math.sin(cone / 2)) * margin, 40);

  const dist = camera.position.distanceTo(center);
  const ndc = center.clone().project(camera);
  const onScreen = Math.abs(ndc.x) < 0.6 && Math.abs(ndc.y) < 0.84;

  if (mode === "nudge" && dist >= need && onScreen) return true;

  // keep the current viewing direction; pull the camera out / re-center
  const dir = camera.position.clone().sub(controls.target);
  if (dir.lengthSq() < 1e-6) dir.set(0.6, 0.5, 1);
  dir.normalize();
  const d = Math.max(dist, need);
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(dir, d);
  camera.lookAt(center);
  controls.update?.();
  return true;
}

/** Objects registered here are hidden during screenshots & video renders. */
const helperSet = new Set<THREE.Object3D>();

export function registerHelper(o: THREE.Object3D | null): () => void {
  if (o) helperSet.add(o);
  return () => {
    if (o) helperSet.delete(o);
  };
}

/** Hide every helper; returns a restore function. */
export function stashHelpers(): () => void {
  const restore: { o: THREE.Object3D; v: boolean }[] = [];
  helperSet.forEach((o) => {
    restore.push({ o, v: o.visible });
    o.visible = false;
  });
  return () => restore.forEach(({ o, v }) => (o.visible = v));
}

/* ---------------------------- render driver ----------------------------- */

/**
 * Drives deterministic offline rendering. While `active`, the camera rig and
 * other frame systems should take their time from `t` (seconds) instead of
 * integrating wall-clock deltas.
 */
export const renderDriver = {
  active: false,
  /** timeline time of the frame currently being rendered (seconds) */
  t: 0,
};

/* ------------------------- texture asset cache -------------------------- */

const texCache = new Map<string, THREE.Texture>();

export function getAssetTexture(id: string, dataUrl: string): THREE.Texture {
  const hit = texCache.get(id);
  if (hit) return hit;
  const tex = new THREE.TextureLoader().load(dataUrl);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(id, tex);
  return tex;
}
