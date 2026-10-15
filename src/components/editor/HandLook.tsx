"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { attachHandLook } from "@/lib/three/look";
import { controlsRef, lookState, objectRefs, renderDriver } from "@/lib/editor/runtime";
import { playback } from "@/lib/editor/render";
import { useEditor } from "@/lib/editor/store";

/**
 * Canvas-side half of hand-look mode. Mount inside <Canvas>; it wires the
 * pointer-lock/drag-look controller to the live camera + controls and keeps
 * the orbit pivot ahead of the camera while locked.
 */
export function HandLook() {
  const { gl, camera } = useThree();
  const apiRef = useRef<ReturnType<typeof attachHandLook> | null>(null);

  useEffect(() => {
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const nodes: THREE.Object3D[] = [];

    const wouldHitObject = (clientX: number, clientY: number): boolean => {
      nodes.length = 0;
      objectRefs.forEach((o) => nodes.push(o));
      if (!nodes.length) return false;
      const rect = gl.domElement.getBoundingClientRect();
      ndc.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera as THREE.PerspectiveCamera);
      return raycaster.intersectObjects(nodes, true).length > 0;
    };

    const api = attachHandLook({
      dom: gl.domElement,
      camera: camera as THREE.PerspectiveCamera,
      getControls: () => controlsRef.current,
      isBlocked: () => renderDriver.active || playback.playing,
      wouldHitObject,
      onPick: (id) => useEditor.getState().select(id),
    });
    apiRef.current = api;
    return () => {
      api.detach();
      apiRef.current = null;
    };
  }, [gl, camera]);

  /* while locked, keep the orbit pivot following the camera (pitch changes) */
  useFrame(() => {
    if (lookState.locked) apiRef.current?.syncTarget();
  });

  return null;
}

/** React hook — true while the pointer is locked (drives the crosshair UI). */
export function useLookLocked(): boolean {
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    const onChange = () => setLocked(document.pointerLockElement !== null);
    document.addEventListener("pointerlockchange", onChange);
    onChange();
    return () => document.removeEventListener("pointerlockchange", onChange);
  }, []);
  return locked;
}

/** Minecraft-style center crosshair + hint chip shown while locked. */
export function LookOverlay({ locked }: { locked: boolean }) {
  if (!locked) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none">
      {/* crosshair */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative size-5">
          <span className="absolute left-1/2 top-0 h-5 w-[2px] -translate-x-1/2 rounded-full bg-white/85 mix-blend-difference" />
          <span className="absolute top-1/2 left-0 h-[2px] w-5 -translate-y-1/2 rounded-full bg-white/85 mix-blend-difference" />
        </div>
      </div>
      {/* hint chip */}
      <div className="absolute bottom-24 left-1/2 -translate-x-1/2 rounded-full border border-border bg-panel/85 px-3.5 py-1.5 text-[10px] font-semibold text-muted-foreground shadow-lg backdrop-blur md:bottom-20">
        Look mode · <b className="text-foreground">WASD</b> fly · <b className="text-foreground">Space/Shift</b> up/down ·
        click an object to select · <b className="text-foreground">Esc</b> to release
      </div>
    </div>
  );
}
