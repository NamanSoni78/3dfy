import * as THREE from "three";

/**
 * Minecraft-style fly camera, shared by the 3D Studio and the World Studio.
 *
 * Desktop:  W / A / S / D move, Space = up, Shift = down.
 * Mobile:   the same states are driven by touch buttons (FlyTouchPad).
 *
 * Movement is camera-relative on the XZ plane (Minecraft creative flight):
 * pitch does NOT affect travel direction; Space/Shift move along world Y.
 */

export interface FlyKeyState {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

/**
 * Key state lives on globalThis so it is a TRUE singleton even if the bundler
 * duplicates this module across an async-chunk boundary (dev + prod).
 */
const flyGlobal = globalThis as unknown as { __3dfyFlyKeys?: FlyKeyState };
export const flyKeys: FlyKeyState = (flyGlobal.__3dfyFlyKeys ??= {
  forward: false, back: false, left: false, right: false, up: false, down: false,
});

export function anyFlyKey(): boolean {
  const k = flyKeys;
  return k.forward || k.back || k.left || k.right || k.up || k.down;
}

export function resetFlyKeys(): void {
  flyKeys.forward = flyKeys.back = flyKeys.left = flyKeys.right = flyKeys.up = flyKeys.down = false;
}

function setFromKey(k: FlyKeyState, key: string, down: boolean): boolean {
  switch (key) {
    case "w": k.forward = down; return true;
    case "a": k.left = down; return true;
    case "s": k.back = down; return true;
    case "d": k.right = down; return true;
    case " ": k.up = down; return true;
    case "shift": k.down = down; return true;
    default: return false;
  }
}

export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable
  );
}

/**
 * Attach desktop keyboard listeners. `getEnabled` is consulted on every event
 * so callers can disable flying while typing / dragging gizmos / dialogs.
 * Returns a detach function.
 */
export function attachDesktopFlyKeys(getEnabled: () => boolean): () => void {
  const onDown = (e: KeyboardEvent) => {
    if (isTypingTarget(e.target)) return;
    if (e.repeat && e.key !== " ") return;
    if (!getEnabled()) return;
    if (setFromKey(flyKeys, e.key.toLowerCase(), true) && e.key === " ") e.preventDefault();
  };
  const onUp = (e: KeyboardEvent) => {
    setFromKey(flyKeys, e.key.toLowerCase(), false);
  };
  const onBlur = () => resetFlyKeys();
  window.addEventListener("keydown", onDown);
  window.addEventListener("keyup", onUp);
  window.addEventListener("blur", onBlur);
  return () => {
    window.removeEventListener("keydown", onDown);
    window.removeEventListener("keyup", onUp);
    window.removeEventListener("blur", onBlur);
    resetFlyKeys();
  };
}

/* ------------------------------ the mover ------------------------------- */

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Advance the fly camera by dt seconds.
 *
 * @param target OrbitControls target — moved together with the camera so the
 *               orbit pivot travels with you (studio). Pass `null` in the
 *               World Studio (free-flight, no orbit).
 * @returns true when the camera actually moved.
 */
export function applyFly(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3 | null,
  dt: number,
  speed: number,
): boolean {
  if (!anyFlyKey()) return false;
  const k = flyKeys;

  camera.getWorldDirection(_fwd);
  _fwd.y = 0;
  if (_fwd.lengthSq() < 1e-8) _fwd.set(0, 0, -1);
  _fwd.normalize();

  _right.crossVectors(_fwd, UP).normalize();

  _move.set(0, 0, 0);
  if (k.forward) _move.add(_fwd);
  if (k.back) _move.sub(_fwd);
  if (k.right) _move.add(_right);
  if (k.left) _move.sub(_right);
  if (k.up) _move.y += 1;
  if (k.down) _move.y -= 1;

  if (_move.lengthSq() < 1e-8) return false;
  _move.normalize().multiplyScalar(Math.min(dt, 0.1) * speed);

  camera.position.add(_move);
  if (target) target.add(_move);
  return true;
}
