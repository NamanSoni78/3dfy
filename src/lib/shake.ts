"use client";

import { useEffect, useRef } from "react";

/**
 * Shake + tilt detection.
 * - Mobile: devicemotion (shake) + deviceorientation (tilt/gravity).
 * - iOS 13+ needs a permission prompt → `requestMotionPermission()`.
 * - Desktop: simulated via rapid pointer wobble over the canvas.
 */

export interface ShakeEvent {
  /** 0..1 normalized intensity. */
  intensity: number;
  /** Direction the device was jerked (unit-ish). */
  dx: number;
  dy: number;
}

export interface MotionCallbacks {
  onShake?: (e: ShakeEvent) => void;
  /** Tilt: gx = roll (-1..1, letters slide sideways), gz = pitch (-1..1, letters sink/rise). */
  onTilt?: (gx: number, gz: number) => void;
}

export function requestMotionPermission(): Promise<boolean> {
  const DME = (window as unknown as {
    DeviceMotionEvent?: { requestPermission?: () => Promise<string> };
  }).DeviceMotionEvent;
  if (DME?.requestPermission) {
    return DME.requestPermission()
      .then((r) => r === "granted")
      .catch(() => false);
  }
  return Promise.resolve(true);
}

export function motionPermissionRequired(): boolean {
  if (typeof window === "undefined") return false;
  const DME = (window as unknown as {
    DeviceMotionEvent?: { requestPermission?: () => Promise<string> };
  }).DeviceMotionEvent;
  return typeof DME?.requestPermission === "function" && !window.sessionStorage.getItem("3dfy.motion.granted");
}

/** Attaches devicemotion + deviceorientation listeners. */
export function useDeviceMotion(cb: MotionCallbacks): void {
  const cbRef = useRef(cb);

  useEffect(() => {
    cbRef.current = cb;
  });

  useEffect(() => {
    const state = {
      last: { x: 0, y: 0, z: 0 },
      cooldown: 0,
    };

    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null || a.z == null) return;
      const x = a.x, y = a.y, z = a.z;
      const jx = x - state.last.x, jy = y - state.last.y, jz = z - state.last.z;
      state.last = { x, y, z };
      const jolt = Math.hypot(jx, jy, jz);
      const now = performance.now();
      if (jolt > 14 && now > state.cooldown) {
        state.cooldown = now + 220;
        const intensity = Math.min(1, (jolt - 14) / 22);
        cbRef.current.onShake?.({
          intensity,
          dx: Math.sign(jx) * Math.min(1, Math.abs(jx) / 12),
          dy: Math.sign(jy) * Math.min(1, Math.abs(jy) / 12),
        });
      }
    };

    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      const beta = Math.max(-60, Math.min(60, e.beta)) * (Math.PI / 180);
      const gamma = Math.max(-60, Math.min(60, e.gamma)) * (Math.PI / 180);
      cbRef.current.onTilt?.(Math.sin(gamma), Math.sin(beta));
    };

    window.addEventListener("devicemotion", onMotion);
    window.addEventListener("deviceorientation", onOrient);
    return () => {
      window.removeEventListener("devicemotion", onMotion);
      window.removeEventListener("deviceorientation", onOrient);
    };
  }, []);
}

/**
 * Desktop shake simulation: fast pointer wobble over an element fires onShake.
 * Also: keyboard S = pulse shake, arrows tilt.
 */
export function useDesktopShake(
  elRef: React.RefObject<HTMLElement | null>,
  cb: MotionCallbacks,
): void {
  const cbRef = useRef(cb);

  useEffect(() => {
    cbRef.current = cb;
  });

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const samples: { x: number; y: number; t: number }[] = [];
    let cooldown = 0;
    let tilt = { x: 0, y: 0 };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const now = performance.now();
      samples.push({ x: e.clientX, y: e.clientY, t: now });
      while (samples.length && now - samples[0].t > 350) samples.shift();
      if (samples.length >= 6 && now > cooldown) {
        const first = samples[0];
        const dist = Math.hypot(e.clientX - first.x, e.clientY - first.y);
        const speed = dist / 350; // px per ms
        if (speed > 2.2) {
          cooldown = now + 260;
          cbRef.current.onShake?.({
            intensity: Math.min(1, (speed - 2.2) / 4),
            dx: Math.sign(e.clientX - first.x),
            dy: Math.sign(e.clientY - first.y),
          });
        }
      }
      // gentle tilt from pointer position (desktop parallax)
      const r = el.getBoundingClientRect();
      tilt.x = ((e.clientX - r.left) / r.width - 0.5) * 1.1;
      tilt.y = -((e.clientY - r.top) / r.height - 0.5) * 0.7;
    };

    const onLeave = () => {
      samples.length = 0;
      tilt = { x: 0, y: 0 };
      cbRef.current.onTilt?.(0, 0);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === "s" || e.key === "S") {
        cbRef.current.onShake?.({ intensity: 0.9, dx: (Math.random() - 0.5) * 2, dy: 1 });
      }
      if (e.key === "ArrowLeft") tilt.x = -0.7;
      if (e.key === "ArrowRight") tilt.x = 0.7;
      if (e.key === "ArrowUp") tilt.y = -0.5;
      if (e.key === "ArrowDown") tilt.y = 0.5;
    };

    let raf = 0;
    const loop = () => {
      cbRef.current.onTilt?.(tilt.x, tilt.y);
      raf = requestAnimationFrame(loop);
    };

    const isTouch = window.matchMedia("(pointer: coarse)").matches;
    if (!isTouch) {
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerleave", onLeave);
      window.addEventListener("keydown", onKey);
      raf = requestAnimationFrame(loop);
    }
    return () => {
      if (!isTouch) {
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerleave", onLeave);
        window.removeEventListener("keydown", onKey);
        cancelAnimationFrame(raf);
      }
    };
  }, [elRef]);
}
