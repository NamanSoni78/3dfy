"use client";

import * as THREE from "three";
import { lookState, gizmoDrag, objectRefs } from "@/lib/editor/runtime";

/**
 * Hand-look — Minecraft-style mouse look for both studios.
 *
 * Engagement model:
 *  - hand mode ON + LEFT-drag on empty space (no object under the pointer,
 *    no gizmo drag) → look around. We opportunistically request POINTER LOCK
 *    when the drag starts; if the browser grants it you get the true
 *    Minecraft feel (hidden cursor, free mouse); if not, plain drag-look.
 *  - While LOCKED: mouse deltas steer, wheel dollies, WASD/Space/Shift fly,
 *    clicking raycasts from the CENTER of the screen — hitting an object
 *    selects it and releases the lock so the transform gizmo is instantly
 *    usable. Esc releases.
 *  - While looking (locked or dragging) OrbitControls are disabled; on
 *    release the orbit target is re-synced ahead of the camera so orbiting
 *    resumes seamlessly.
 *
 * Pointer-downs that land on an object never engage (the object's own
 * select/drag handlers own them) and a gizmo drag always wins (checked on
 * every move).
 */

export interface HandLookOptions {
  dom: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  /** live OrbitControls handle (null before mount) */
  getControls: () => { enabled?: boolean; target: THREE.Vector3; update?: () => void } | null;
  /** render / playback in progress — camera is driven elsewhere */
  isBlocked: () => boolean;
  /** true when an editor object is under the given client point */
  wouldHitObject: (clientX: number, clientY: number) => boolean;
  /** locked click picked an object under the crosshair → select + unlock */
  onPick: (id: string) => void;
}

export interface HandLookApi {
  /** keep the orbit pivot ahead of the camera while locked (call per frame) */
  syncTarget: () => void;
  detach: () => void;
}

const SENS = 0.0026;
const MAX_PITCH = Math.PI / 2 - 0.02;
const ENGAGE_PX = 8;

const raycaster = new THREE.Raycaster();
const centerNdc = new THREE.Vector2(0, 0);
const euler = new THREE.Euler(0, 0, 0, "YXZ");
const dirV = new THREE.Vector3();

export function attachHandLook(opts: HandLookOptions): HandLookApi {
  const { dom, camera, getControls, isBlocked, wouldHitObject, onPick } = opts;

  let yaw = 0;
  let pitch = 0;
  let mode: "idle" | "maybe" | "drag" = "idle";
  let downX = 0;
  let downY = 0;
  let lastX = 0;
  let lastY = 0;

  const readEuler = () => {
    euler.setFromQuaternion(camera.quaternion, "YXZ");
    yaw = euler.y;
    pitch = euler.x;
  };

  const applyLook = (dx: number, dy: number) => {
    yaw -= dx * SENS;
    pitch = THREE.MathUtils.clamp(pitch - dy * SENS, -MAX_PITCH, MAX_PITCH);
    euler.set(pitch, yaw, 0, "YXZ");
    camera.quaternion.setFromEuler(euler);
  };

  const setControlsEnabled = (v: boolean) => {
    const c = getControls();
    if (c) c.enabled = v;
  };

  /** keep the orbit pivot ahead of the camera so orbit resumes seamlessly */
  const syncTarget = () => {
    const c = getControls();
    if (!c || !c.target) return;
    camera.getWorldDirection(dirV);
    const dist = THREE.MathUtils.clamp(camera.position.distanceTo(c.target), 3, 40);
    c.target.copy(camera.position).addScaledVector(dirV, dist);
    c.update?.();
  };

  const tryLock = () => {
    try {
      const r = dom.requestPointerLock() as unknown as Promise<void> | undefined;
      if (r && typeof r.catch === "function") r.catch(() => undefined);
    } catch { /* gesture denied → plain drag-look */ }
  };

  /** raycast the object registry; returns the owner id or null */
  const raycastRegistry = (): string | null => {
    const nodes: THREE.Object3D[] = [];
    objectRefs.forEach((o) => nodes.push(o));
    if (!nodes.length) return null;
    raycaster.setFromCamera(centerNdc, camera);
    const hits = raycaster.intersectObjects(nodes, true);
    if (!hits.length) return null;
    let walk: THREE.Object3D | null = hits[0].object;
    while (walk) {
      for (const [id, o] of objectRefs) {
        if (o === walk) return id;
      }
      walk = walk.parent;
    }
    return null;
  };

  const onDown = (e: PointerEvent) => {
    if (lookState.locked) {
      // crosshair click — pick the object under the center of the view
      if (e.button !== 0 || isBlocked()) return;
      const id = raycastRegistry();
      if (id) {
        onPick(id);
        document.exitPointerLock();
      }
      return;
    }
    if (e.button !== 0) return;
    if (!lookState.enabled || isBlocked()) return;
    if (gizmoDrag.active) return;
    // pointer lands on an editor object → its own handlers own this gesture
    if (wouldHitObject(e.clientX, e.clientY)) return;
    mode = "maybe";
    downX = lastX = e.clientX;
    downY = lastY = e.clientY;
  };

  const onMove = (e: PointerEvent) => {
    if (lookState.locked) {
      if (isBlocked()) return;
      applyLook(e.movementX || 0, e.movementY || 0);
      return;
    }
    if (mode === "maybe") {
      // the gizmo grabbed the gesture mid-press → it wins
      if (gizmoDrag.active) { mode = "idle"; return; }
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > ENGAGE_PX) {
        mode = "drag";
        readEuler();
        setControlsEnabled(false);
        if (e.pointerType === "mouse") tryLock();
      }
    }
    if (mode === "drag") {
      if (gizmoDrag.active) { mode = "idle"; setControlsEnabled(true); return; }
      applyLook(e.clientX - lastX, e.clientY - lastY);
      lastX = e.clientX;
      lastY = e.clientY;
    }
  };

  const onUp = () => {
    if (mode === "drag" && !lookState.locked) {
      setControlsEnabled(true);
      syncTarget();
    }
    mode = "idle";
  };

  const onWheel = (e: WheelEvent) => {
    if (!lookState.locked) return;
    e.preventDefault();
    camera.getWorldDirection(dirV);
    const step = THREE.MathUtils.clamp(Math.abs(e.deltaY) * 0.02, 0.4, 6);
    camera.position.addScaledVector(dirV, -Math.sign(e.deltaY) * step);
  };

  const onLockChange = () => {
    const locked = document.pointerLockElement === dom;
    lookState.locked = locked;
    if (locked) {
      readEuler();
      setControlsEnabled(false);
    } else {
      setControlsEnabled(true);
      syncTarget();
    }
  };

  dom.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  dom.addEventListener("wheel", onWheel, { passive: false });
  document.addEventListener("pointerlockchange", onLockChange);

  return {
    syncTarget,
    detach: () => {
      dom.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      dom.removeEventListener("wheel", onWheel);
      document.removeEventListener("pointerlockchange", onLockChange);
      if (document.pointerLockElement === dom) document.exitPointerLock();
      if (mode === "drag") setControlsEnabled(true);
      mode = "idle";
      lookState.locked = false;
    },
  };
}
