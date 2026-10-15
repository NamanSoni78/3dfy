import * as THREE from "three";
import type { EaseId, Keyframe, Vec3 } from "./types";

/* ---------------------------- ease curves ---------------------------- */

export const EASES: { id: EaseId; name: string }[] = [
  { id: "linear", name: "Linear" },
  { id: "easeIn", name: "Ease In" },
  { id: "easeOut", name: "Ease Out" },
  { id: "easeInOut", name: "Smooth" },
  { id: "back", name: "Overshoot" },
  { id: "bounce", name: "Bounce" },
];

export function applyEase(u: number, ease: EaseId): number {
  switch (ease) {
    case "easeIn": return u * u;
    case "easeOut": return 1 - (1 - u) * (1 - u);
    case "easeInOut": return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    case "back": {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
    }
    case "bounce": {
      const n1 = 7.5625;
      const d1 = 2.75;
      let x = u;
      if (x < 1 / d1) return n1 * x * x;
      if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
      if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
      return n1 * (x -= 2.625 / d1) * x + 0.984375;
    }
    default: return u;
  }
}

/* -------------------------- camera path eval -------------------------- */

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

export interface CamSample {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

/** Sort keyframes by time. */
export function sortedKeyframes(kfs: Keyframe[]): Keyframe[] {
  return [...kfs].sort((a, b) => a.t - b.t);
}

/**
 * Evaluate camera position + lookAt target at time t (seconds).
 * Keyframes hold position + target; segments interpolate with the
 * OUTGOING keyframe's ease.
 */
export function sampleCamera(kfs: Keyframe[], t: number, out: CamSample): CamSample {
  const sorted = sortedKeyframes(kfs);
  if (sorted.length === 0) {
    out.position.set(6, 4.5, 8);
    out.target.set(0, 1, 0);
    return out;
  }
  if (sorted.length === 1) {
    const k = sorted[0];
    out.position.set(...k.position);
    out.target.set(...k.target);
    return out;
  }
  if (t <= sorted[0].t) {
    const k = sorted[0];
    out.position.set(...k.position);
    out.target.set(...k.target);
    return out;
  }
  const last = sorted[sorted.length - 1];
  if (t >= last.t) {
    out.position.set(...last.position);
    out.target.set(...last.target);
    return out;
  }
  let i = 0;
  for (let j = 0; j < sorted.length - 1; j++) {
    if (t >= sorted[j].t && t <= sorted[j + 1].t) {
      i = j;
      break;
    }
  }
  const a = sorted[i];
  const b = sorted[i + 1];
  const span = Math.max(0.0001, b.t - a.t);
  const u = applyEase(THREE.MathUtils.clamp((t - a.t) / span, 0, 1), a.ease);
  tmpA.set(...a.position);
  tmpB.set(...b.position);
  out.position.lerpVectors(tmpA, tmpB, u);
  tmpA.set(...a.target);
  tmpB.set(...b.target);
  out.target.lerpVectors(tmpA, tmpB, u);
  return out;
}

export function keyframeAt(kfs: Keyframe[], t: number, epsilon = 0.02): Keyframe | null {
  return sortedKeyframes(kfs).find((k) => Math.abs(k.t - t) < epsilon) ?? null;
}

export function v3(x = 0, y = 0, z = 0): Vec3 {
  return [x, y, z];
}
