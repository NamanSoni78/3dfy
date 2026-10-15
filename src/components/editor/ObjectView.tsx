"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Outlines } from "@react-three/drei";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { getFont } from "@/lib/three/fonts";
import { normalizeUVs, shapeGeometry, textGeometry, type ShapeKind } from "@/lib/three/geometry";
import { createMaterial, TEXT_THEMES } from "@/lib/three/materials";
import { getAssetTexture, controlsRef, gizmoDrag, lookState } from "@/lib/editor/runtime";
import { getCustomShapeGeometry } from "@/lib/shapes/build";
import { useEditor } from "@/lib/editor/store";
import type { CustomShapeDef, ImageObj, LightObj, SceneObject, ShapeObj, TextObj } from "@/lib/editor/types";

export function ObjectView({
  obj,
  selected,
  assetUrls,
  customShapes,
  onSelect,
  register,
  unregister,
}: {
  obj: SceneObject;
  selected: boolean;
  assetUrls: Record<string, string>;
  customShapes: Record<string, CustomShapeDef>;
  onSelect: (id: string) => void;
  register: (id: string, o: THREE.Object3D) => void;
  unregister: (id: string) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    const g = groupRef.current;
    if (g) register(obj.id, g);
    return () => unregister(obj.id);
  }, [obj.id, register, unregister]);

  /* --------------------- direct drag-to-move (Move tool) ---------------------
   * Dragging the selected object moves it on its ground plane — the camera
   * stays perfectly still. Only the Move tool drags; Rotate/Scale fall back
   * to the gizmo. Yields instantly if the transform gizmo takes over. */
  const { camera, gl } = useThree();
  const dragRef = useRef<{
    plane: THREE.Plane;
    offset: THREE.Vector3;
    moved: boolean;
    committed: boolean;
    startY: number;
    onMove: (ev: PointerEvent) => void;
    onUp: () => void;
  } | null>(null);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);

  const endDrag = useCallback(() => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    window.removeEventListener("pointermove", d.onMove);
    window.removeEventListener("pointerup", d.onUp);
    const c = controlsRef.current as unknown as { enabled?: boolean } | null;
    if (c) c.enabled = true;
  }, []);

  const onObjectPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      // while the pointer is LOCKED (hand-look) the HandLook controller owns
      // clicks — it raycasts from the crosshair itself
      if (lookState.locked) return;
      e.stopPropagation();
      const store = useEditor.getState();
      onSelect(obj.id);

      /* freeze the orbit camera for the WHOLE press (any gizmo mode) —
         released on pointer-up. This is what keeps the camera perfectly
         still while the user grabs / drags / transforms an object. */
      const c0 = controlsRef.current as unknown as { enabled?: boolean } | null;
      if (c0) c0.enabled = false;

      if (store.gizmo !== "translate" || store.previewing) {
        // rotate/scale tools (or preview): no drag-to-move, but still thaw
        // the orbit camera on release
        const onUpOnce = () => {
          const c = controlsRef.current as unknown as { enabled?: boolean } | null;
          if (c && !gizmoDrag.active) c.enabled = true;
          window.removeEventListener("pointerup", onUpOnce);
          window.removeEventListener("pointercancel", onUpOnce);
        };
        window.addEventListener("pointerup", onUpOnce);
        window.addEventListener("pointercancel", onUpOnce);
        return;
      }

      const startY = obj.position[1];
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -startY);
      const hit = new THREE.Vector3();
      raycaster.setFromCamera(e.pointer, camera);
      if (!raycaster.ray.intersectPlane(plane, hit)) return;

      const offset = hit.sub(new THREE.Vector3(obj.position[0], startY, obj.position[2]));
      const rect = gl.domElement.getBoundingClientRect();

      const onMove = (ev: PointerEvent) => {
        const d = dragRef.current;
        if (!d) return;
        // the transform gizmo grabbed the pointer — yield completely
        if (gizmoDrag.active) { endDrag(); return; }
        if (!d.moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 4) return;
        if (!d.moved) {
          d.moved = true;
        }
        ndc.set(
          ((ev.clientX - rect.left) / rect.width) * 2 - 1,
          -((ev.clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(ndc, camera);
        const p = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(d.plane, p)) return;
        p.sub(d.offset);
        if (!d.committed) {
          d.committed = true;
          useEditor.getState().commit();
        }
        useEditor.getState().updateObject(obj.id, {
          position: [p.x, d.startY, p.z],
        } as Partial<SceneObject>);
      };

      const onUp = () => {
        endDrag();
      };

      dragRef.current = { plane, offset, moved: false, committed: false, startY, onMove, onUp };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [obj.id, obj.position, camera, gl, raycaster, ndc, onSelect, endDrag],
  );

  useEffect(() => endDrag, [endDrag]);

  if (!obj.visible) return null;

  return (
    <group
      ref={groupRef}
      position={obj.position}
      rotation={obj.rotation}
      scale={obj.scale}
      onPointerDown={onObjectPointerDown}
    >
      {obj.type === "text" && (
        <TextView obj={obj} selected={selected} assetUrls={assetUrls} />
      )}
      {obj.type === "shape" && (
        <ShapeView obj={obj} selected={selected} assetUrls={assetUrls} customShapes={customShapes} />
      )}
      {obj.type === "image" && (
        <ImageView obj={obj} selected={selected} assetUrls={assetUrls} />
      )}
      {obj.type === "light" && (
        <LightView obj={obj} selected={selected} />
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */

function useObjMaterial(
  obj: SceneObject,
  assetUrls: Record<string, string>,
): THREE.Material {
  return useMemo(() => {
    const m = obj.material;
    let map: THREE.Texture | null = null;
    if (m.printAsset && assetUrls[m.printAsset]) {
      map = getAssetTexture(m.printAsset, assetUrls[m.printAsset]);
    }
    const mat = createMaterial(m.preset, {
      color: m.color,
      emissive: m.emissive,
      emissiveIntensity: Math.max(m.emissiveIntensity, m.preset === "neon" ? 2.2 : 0),
      opacity: m.opacity,
      map,
    });
    if (m.preset !== "neon" && m.preset !== "marble") {
      (mat as THREE.MeshStandardMaterial).metalness = m.metalness;
      (mat as THREE.MeshStandardMaterial).roughness = m.roughness;
      if (m.emissiveIntensity > 0) {
        (mat as THREE.MeshStandardMaterial).emissive = new THREE.Color(m.emissive);
        (mat as THREE.MeshStandardMaterial).emissiveIntensity = m.emissiveIntensity;
      }
    }
    if (m.opacity < 1) mat.transparent = true;
    return mat;
  }, [obj.material, assetUrls]);
}

function TextView({
  obj, selected, assetUrls,
}: {
  obj: TextObj;
  selected: boolean;
  assetUrls: Record<string, string>;
}) {
  const [fontError, setFontError] = useState(false);
  const [geo, setGeo] = useState<THREE.BufferGeometry | null>(null);
  const mat = useObjMaterial(obj, assetUrls);

  useEffect(() => {
    let alive = true;
    getFont(obj.text.font)
      .then((font) => {
        if (!alive) return;
        const g = textGeometry(obj.text.content || "?", font, {
          size: 1,
          depth: obj.text.depth,
          bevel: obj.text.bevel,
          bevelSize: obj.text.bevel ? 0.03 : 0,
        });
        if (obj.material.printAsset) normalizeUVs(g);
        setGeo(g);
      })
      .catch(() => alive && setFontError(true));
    return () => {
      alive = false;
    };
  }, [obj.text.content, obj.text.font, obj.text.depth, obj.text.bevel, obj.material.printAsset]);

  useEffect(() => {
    return () => mat.dispose();
  }, [mat]);

  if (fontError || !geo) return null;

  return (
    <mesh geometry={geo} material={mat} castShadow={obj.castShadow} receiveShadow={obj.receiveShadow}>
      {selected && <Outlines thickness={0.045} color="#FF5FC1" />}
    </mesh>
  );
}

function ShapeView({
  obj, selected, assetUrls, customShapes,
}: {
  obj: ShapeObj;
  selected: boolean;
  assetUrls: Record<string, string>;
  customShapes: Record<string, CustomShapeDef>;
}) {
  const isCustom = obj.shape === "custom" && !!obj.customShapeId;

  /* imported AI shape — one merged, vertex-colored mesh (1 draw call) */
  const customGeo = useMemo(
    () => (isCustom && obj.customShapeId ? getCustomShapeGeometry(obj.customShapeId, customShapes[obj.customShapeId]) : null),
    [isCustom, obj.customShapeId, customShapes],
  );
  const customMat = useMemo(() => {
    if (!isCustom) return null;
    const m = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.62,
      metalness: 0.08,
      flatShading: true,
      // AI-generated mesh winding is not trustworthy — double-side it
      side: THREE.DoubleSide,
    });
    if (obj.material.opacity < 1) {
      m.transparent = true;
      m.opacity = obj.material.opacity;
    }
    return m;
  }, [isCustom, obj.material.opacity]);
  useEffect(() => () => customMat?.dispose(), [customMat]);

  const mat = useObjMaterial(obj, assetUrls);
  const geo = useMemo(() => {
    if (isCustom) return null;
    const g = shapeGeometry(obj.shape as ShapeKind, 1, obj.depth);
    if (obj.material.printAsset && (obj.shape === "star" || obj.shape === "heart")) {
      normalizeUVs(g);
    }
    return g;
  }, [obj.shape, obj.depth, obj.material.printAsset, isCustom]);

  useEffect(() => {
    return () => {
      geo?.dispose();
      if (!isCustom) mat.dispose();
    };
  }, [geo, mat, isCustom]);

  if (isCustom) {
    if (!customGeo || !customMat) return null;
    return (
      <mesh geometry={customGeo} material={customMat} castShadow={obj.castShadow} receiveShadow={obj.receiveShadow}>
        {selected && <Outlines thickness={0.045} color="#FF5FC1" />}
      </mesh>
    );
  }

  return (
    <mesh geometry={geo!} material={mat} castShadow={obj.castShadow} receiveShadow={obj.receiveShadow}>
      {selected && <Outlines thickness={0.045} color="#FF5FC1" />}
    </mesh>
  );
}

function ImageView({
  obj, selected, assetUrls,
}: {
  obj: ImageObj;
  selected: boolean;
  assetUrls: Record<string, string>;
}) {
  const url = assetUrls[obj.image.asset];
  const tex = useMemo(
    () => (url ? getAssetTexture(obj.image.asset, url) : null),
    [url, obj.image.asset],
  );
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.55,
      metalness: 0,
      side: THREE.DoubleSide,
      map: tex ?? undefined,
    });
    return m;
  }, [tex]);
  useEffect(() => () => mat.dispose(), [mat]);

  const frameMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.35 }),
    [],
  );
  useEffect(() => () => frameMat.dispose(), [frameMat]);

  const w = obj.image.aspect;

  return (
    <group>
      {obj.image.frame && (
        <mesh position={[0, 0, -0.03]} material={frameMat} receiveShadow={obj.receiveShadow}>
          <boxGeometry args={[w + 0.12, 1.12, 0.05]} />
        </mesh>
      )}
      <mesh material={mat} castShadow={obj.castShadow} receiveShadow={obj.receiveShadow}>
        <planeGeometry args={[w, 1]} />
        {selected && <Outlines thickness={0.035} color="#FF5FC1" />}
      </mesh>
    </group>
  );
}

function LightView({ obj, selected }: { obj: LightObj; selected: boolean }) {
  const target = useMemo(() => new THREE.Object3D(), []);
  return (
    <group>
      <pointLight
        color={obj.light.color}
        intensity={obj.light.intensity}
        distance={obj.light.distance}
        decay={1.6}
        position={[0, 0, 0]}
      />
      <primitive object={target} position={[0, -1, 0]} />
      <mesh castShadow={false}>
        <sphereGeometry args={[0.18, 16, 12]} />
        <meshBasicMaterial color={obj.light.color} toneMapped={false} />
        {selected && <Outlines thickness={0.05} color="#FF5FC1" />}
      </mesh>
    </group>
  );
}
