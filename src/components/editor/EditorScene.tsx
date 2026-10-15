"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Grid, OrbitControls, Stars, TransformControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useEditor, MAX_DURATION } from "@/lib/editor/store";
import { findParticleConfig } from "@/lib/editor/defaults";
import { objectRefs, setPendingSpawn, controlsRef, cameraRef, registerHelper, renderDriver, gizmoDrag, flyState, lookState } from "@/lib/editor/runtime";
import { editorCapture, playback } from "@/lib/editor/render";
import { sampleCamera } from "@/lib/editor/keyframes";
import { WORLD_THEMES } from "@/lib/editor/defaults";
import { gradientTexture } from "@/lib/three/textures";
import { applyFly, attachDesktopFlyKeys } from "@/lib/three/fly";
import { sfx, haptic } from "@/lib/audio";
import { ObjectView } from "./ObjectView";
import { ParticleFX } from "./ParticleFX";
import { HandLook } from "./HandLook";
import { WorldStage } from "./WorldStage";
import type { Keyframe, SceneObject } from "@/lib/editor/types";

export function EditorScene({ onLongPressGround }: { onLongPressGround: () => void }) {
  const project = useEditor((s) => s.project);
  const selectedId = useEditor((s) => s.selectedId);
  const gizmo = useEditor((s) => s.gizmo);
  const assetUrls = useEditor((s) => s.assetUrls);
  const select = useEditor((s) => s.select);
  const updateObject = useEditor((s) => s.updateObject);
  const commit = useEditor((s) => s.commit);
  const pathRecord = useEditor((s) => s.pathRecord);

  const isWorld = project.stage === "world" && project.worldDef !== null;

  /* desktop fly keys — W/A/S/D + Space/Shift (typing-safe, gizmo-safe) */
  useEffect(
    () => attachDesktopFlyKeys(() => flyState.enabled && !gizmoDrag.active && !renderDriver.active),
    [],
  );

  /* re-render when the object3D registry changes so freshly added objects
     get their gizmo immediately (registration happens in child effects) */
  const [, bumpRegistry] = useState(0);
  const register = useCallback(
    (id: string, o: THREE.Object3D) => {
      objectRefs.set(id, o);
      bumpRegistry((t) => t + 1);
    },
    [],
  );
  const unregister = useCallback((id: string) => {
    objectRefs.delete(id);
    bumpRegistry((t) => t + 1);
  }, []);

  const theme = useMemo(() => {
    if (project.world.themeId === "custom" && project.world.custom) return project.world.custom;
    return WORLD_THEMES.find((t) => t.id === project.world.themeId) ?? WORLD_THEMES[0];
  }, [project.world.themeId, project.world.custom]);

  const selectedObj = project.objects.find((o) => o.id === selectedId) ?? null;
  const selectedNode = selectedId ? objectRefs.get(selectedId) : null;

  const handleGizmoChange = () => {
    if (!selectedId || !selectedNode) return;
    if (!gizmoDirty.current) {
      // first actual movement of this drag — snapshot the pre-drag state
      // so the whole drag is a single undo step
      gizmoDirty.current = true;
      commit();
    }
    updateObject(selectedId, {
      position: [selectedNode.position.x, selectedNode.position.y, selectedNode.position.z],
      rotation: [selectedNode.rotation.x, selectedNode.rotation.y, selectedNode.rotation.z],
      scale: [selectedNode.scale.x, selectedNode.scale.y, selectedNode.scale.z],
    } as Partial<SceneObject>);
  };

  const handleGizmoCommit = () => {
    if (!gizmoDirty.current) return; // a click on the gizmo without movement
    gizmoDirty.current = false;
    sfx.play("tick", { vol: 0.5 });
  };

  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 1.8]}
      gl={{ antialias: true, preserveDrawingBuffer: true, alpha: false }}
      camera={{ fov: project.cameraFov, position: [6, 4.5, 8], near: 0.1, far: 300 }}
      style={{ touchAction: "none" }}
      onPointerMissed={() => {
        // a click that ENDS a gizmo drag lands on the gizmo (not an R3F
        // object) — must not deselect the object we were transforming
        if (performance.now() - gizmoDrag.end < 400) return;
        select(null);
      }}
    >
      {isWorld && project.worldDef ? (
        <WorldStage
          world={project.worldDef}
          opts={project.worldOpts}
          onLongPressGround={onLongPressGround}
        />
      ) : (
        <>
          <Sky theme={theme} />
          {theme.fog.on && <fogExp2 attach="fog" args={[theme.fog.color, theme.fog.density]} />}
          {theme.stars && <Stars radius={90} depth={40} count={1400} factor={3} fade speed={0.6} />}
          <Lights world={project.world} />
          <Ground
            theme={theme}
            gridOn={project.world.grid}
            onLongPressGround={onLongPressGround}
          />
        </>
      )}
      {project.objects.map((obj) => (
        <ObjectView
          key={obj.id}
          obj={obj}
          selected={obj.id === selectedId}
          assetUrls={assetUrls}
          customShapes={project.customShapes}
          onSelect={select}
          register={register}
          unregister={unregister}
        />
      ))}
      {project.objects.map((obj) =>
        obj.effects.particles.on ? (
          <ParticleFX
            key={`fx-${obj.id}`}
            config={findParticleConfig(obj.effects.particles.preset, project.customParticles)}
            intensity={obj.effects.particles.intensity}
            getOrigin={() => objectRefs.get(obj.id) ?? null}
          />
        ) : null,
      )}
      {selectedNode && selectedObj && selectedObj.type !== "light" && (
        <TransformControlsWrapper
          node={selectedNode}
          mode={gizmo}
          onChange={handleGizmoChange}
          onCommit={handleGizmoCommit}
        />
      )}
      <CameraRig
        keyframes={project.keyframes}
        duration={project.duration}
        cameraLight={project.world.cameraLight}
        pathRecord={pathRecord}
        selectedId={selectedId}
        worldMode={isWorld}
      />
      <FovRig fov={project.cameraFov} far={isWorld ? 900 : 300} />
      <FlyRig />
      <HandLook />
      <CaptureBridge />
    </Canvas>
  );
}

/* --------------------------------- FOV rig -------------------------------- */

/** mutation helper (keeps the react-hooks immutability lint happy) */
function setFovFar(cam: THREE.PerspectiveCamera, fov: number, far: number): void {
  cam.fov = fov;
  cam.far = far;
}

/** Applies the project FOV + far plane LIVE (the Canvas camera prop is
 *  initial-only — this was the "FOV is not working" root cause). */
function FovRig({ fov, far }: { fov: number; far: number }) {
  const { camera } = useThree();
  useFrame(() => {
    const cam = camera as THREE.PerspectiveCamera;
    if (Math.abs(cam.fov - fov) > 0.01 || Math.abs(cam.far - far) > 0.01) {
      setFovFar(cam, fov, far);
      cam.updateProjectionMatrix();
    }
  });
  return null;
}

/* ------------------------------- void stage ------------------------------- */

function Sky({ theme }: { theme: (typeof WORLD_THEMES)[number] }) {
  const tex = useMemo(() => gradientTexture(theme.skyTop, theme.skyBottom), [theme.skyTop, theme.skyBottom]);
  return (
    <mesh scale={[200, 200, 200]}>
      <sphereGeometry args={[1, 24, 16]} />
      <meshBasicMaterial map={tex} side={THREE.BackSide} depthWrite={false} fog={false} />
    </mesh>
  );
}

function Lights({ world }: { world: ReturnType<typeof useEditor.getState>["project"]["world"] }) {
  const level = world.lightLevel;
  return (
    <>
      <ambientLight intensity={0.55 * level + 0.06} />
      <hemisphereLight intensity={0.65 * level} groundColor={theme2Ground(world.themeId)} />
      {world.keyLight.on && (
        <directionalLight
          position={[Math.cos(world.keyLight.angle) * 8, 9, Math.sin(world.keyLight.angle) * 8]}
          intensity={world.keyLight.intensity * (0.25 + 0.75 * level)}
          castShadow={world.keyLight.shadows}
          shadow-mapSize-width={world.shadowQuality}
          shadow-mapSize-height={world.shadowQuality}
          shadow-camera-left={-14}
          shadow-camera-right={14}
          shadow-camera-top={14}
          shadow-camera-bottom={-14}
          shadow-camera-far={40}
          shadow-bias={-0.0004}
        />
      )}
    </>
  );
}

function theme2Ground(themeId: string): string {
  const t = WORLD_THEMES.find((x) => x.id === themeId);
  return t ? t.ground : "#2a2f3a";
}

/** Transform gizmo — tags itself as a helper so captures stay clean. */
function TransformControlsWrapper({
  node, mode, onChange, onCommit,
}: {
  node: THREE.Object3D;
  mode: "translate" | "rotate" | "scale";
  onChange: () => void;
  onCommit: () => void;
}) {
  const ref = useRef<THREE.Object3D>(null);
  useEffect(() => registerHelper(ref.current), []);

  /* Orbit hard-off while dragging the gizmo (belt & braces on top of drei's
     makeDefault handling) + timestamp so `onPointerMissed` can ignore the
     click that ends a drag. */
  useEffect(() => {
    const tc = ref.current as unknown as Record<string, unknown> | null;
    if (!tc) return;
    const onDrag = (e: { value: boolean }) => {
      gizmoDrag.active = e.value;
      if (!e.value) gizmoDrag.end = performance.now();
      const c = controlsRef.current as unknown as { enabled?: boolean } | null;
      if (c) c.enabled = !e.value;
    };
    // bind() keeps `this` — calling the detached method would lose the
    // dispatcher receiver and crash inside three's EventDispatcher
    const add = typeof tc.addEventListener === "function"
      ? (tc.addEventListener as unknown as (t: string, fn: (e: { value: boolean }) => void) => void).bind(tc)
      : null;
    const remove = typeof tc.removeEventListener === "function"
      ? (tc.removeEventListener as unknown as (t: string, fn: (e: { value: boolean }) => void) => void).bind(tc)
      : null;
    if (!add || !remove) return;
    add("dragging-changed", onDrag);
    return () => remove("dragging-changed", onDrag);
  }, []);

  return (
    <TransformControls
      ref={ref as never}
      object={node}
      mode={mode}
      size={1.05}
      onObjectChange={onChange}
      onMouseUp={onCommit}
    />
  );
}

/* ------------------------------- fly rig ------------------------------- */

/** Minecraft-creative-style flight: WASD / Space / Shift move camera AND the
 *  orbit target together. Active in object mode and during path recording
 *  (replay-mod style), paused during camera playback and offline renders. */
function FlyRig() {
  useFrame((state, dt) => {
    if (!flyState.enabled || renderDriver.active || playback.playing || gizmoDrag.active) return;
    applyFly(state.camera as THREE.PerspectiveCamera, controlsRef.current?.target ?? null, dt, flyState.speed);
  });
  return null;
}

function Ground({
  theme, gridOn, onLongPressGround,
}: {
  theme: (typeof WORLD_THEMES)[number];
  gridOn: boolean;
  onLongPressGround: () => void;
}) {
  const { gl } = useThree();
  const press = useRef<{ x: number; y: number; moved: boolean; fired: boolean; point: [number, number, number] } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const p = press.current;
      if (!p) return;
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 14) p.moved = true;
    };
    const onUp = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      press.current = null;
    };
    gl.domElement.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      gl.domElement.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [gl]);

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
        onPointerDown={(e) => {
          // hand-look owns drags that start on the ground when enabled
          if (lookState.enabled && !lookState.locked) return;
          e.stopPropagation();
          setPendingSpawn(null);
          press.current = {
            x: e.nativeEvent.clientX,
            y: e.nativeEvent.clientY,
            moved: false,
            fired: false,
            point: [e.point.x, Math.max(0.4, e.point.y + 0.8), e.point.z],
          };
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            const p = press.current;
            if (p && !p.moved) {
              p.fired = true;
              setPendingSpawn(p.point);
              sfx.play("pop");
              haptic(18);
              onLongPressGround();
            }
          }, 460);
        }}
      >
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color={theme.ground} roughness={0.95} metalness={0} />
      </mesh>
      {gridOn && <EditorGrid theme={theme} />}
    </group>
  );
}

function EditorGrid({ theme }: { theme: (typeof WORLD_THEMES)[number] }) {
  const ref = useRef<THREE.Group>(null);
  useEffect(() => registerHelper(ref.current), []);
  return (
    <Grid
      ref={ref as never}
      position={[0, 0.01, 0]}
      args={[40, 40]}
      cellSize={0.5}
      cellThickness={0.6}
      cellColor={theme.grid.color}
      sectionSize={2.5}
      sectionThickness={1.2}
      sectionColor={theme.grid.color}
      fadeDistance={34}
      fadeStrength={1.2}
      infiniteGrid
    />
  );
}

/* path-record helpers (module scope — pure store access) */

const gizmoDirty = { current: false };

function nextPathT(): number {
  const { project } = useEditor.getState();
  const kfs = [...project.keyframes].sort((a, b) => a.t - b.t);
  const last = kfs.length ? kfs[kfs.length - 1].t : -1;
  return Math.round(Math.min(MAX_DURATION, last + 0.5) * 10) / 10;
}

function pushPathKeyframe(camera: THREE.PerspectiveCamera, target: THREE.Vector3, t: number): void {
  const store = useEditor.getState();
  store.addKeyframe({
    id: globalThis.crypto.randomUUID(),
    t,
    position: [camera.position.x, camera.position.y, camera.position.z],
    target: [target.x, target.y, target.z],
    ease: "easeInOut",
  });
  if (t + 1.5 > store.project.duration) {
    store.setDuration(Math.min(MAX_DURATION, Math.round((t + 1.5) * 10) / 10));
  }
}

/* ----------------------------- camera rig ----------------------------- */

function CameraRig({
  keyframes, duration, cameraLight, pathRecord, selectedId, worldMode,
}: {
  keyframes: Keyframe[];
  duration: number;
  cameraLight: { on: boolean; intensity: number; shadows: boolean };
  pathRecord: boolean;
  selectedId: string | null;
  worldMode: boolean;
}) {
  const controls = useRef<OrbitControlsImpl | null>(null);
  const spot = useRef<THREE.SpotLight | null>(null);
  const spotTarget = useMemo(() => new THREE.Object3D(), []);
  const sample = useMemo(
    () => ({ position: new THREE.Vector3(), target: new THREE.Vector3() }),
    [],
  );
  const dir = useMemo(() => new THREE.Vector3(), []);

  /* path recording bookkeeping (Minecraft-replay-style auto keyframes) */
  const rec = useRef({ clock: 0, lastPos: new THREE.Vector3(), lastTarget: new THREE.Vector3(), armed: false, lastDurationPush: 0 });

  /* ── interaction rules ──────────────────────────────────────────────────
     While an object is SELECTED the left button NEVER orbits (dragging the
     object body, grabbing at/near the gizmo, or plain empty space must never
     spin the camera). Orbit stays available via RIGHT-drag while selected.
     This kills the entire "camera turns while I transform" bug class. */
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    c.mouseButtons = {
      LEFT: selectedId ? -1 : THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: selectedId ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN,
    } as unknown as OrbitControlsImpl["mouseButtons"];
  }, [selectedId]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const camera = state.camera as THREE.PerspectiveCamera;

    if (controls.current) controlsRef.current = controls.current;

    // camera spotlight follows
    if (spot.current && cameraLight.on) {
      camera.getWorldDirection(dir);
      spot.current.position.copy(camera.position);
      spotTarget.position.copy(camera.position).addScaledVector(dir, 7);
      spotTarget.updateMatrixWorld();
    }

    /* ── offline render mode: the render engine drives time deterministically ── */
    if (renderDriver.active) {
      if (controls.current) controls.current.enabled = false;
      sampleCamera(keyframes, renderDriver.t, sample);
      camera.position.copy(sample.position);
      camera.lookAt(sample.target);
      return;
    }

    if (playback.playing && keyframes.length >= 2) {
      if (controls.current) controls.current.enabled = false;
      playback.t += dt * playback.speed;
      if (playback.t >= duration) {
        playback.t = duration;
        playback.playing = false;
        const done = playback.onDone;
        playback.onDone = null;
        done?.();
      }
      sampleCamera(keyframes, playback.t, sample);
      camera.position.copy(sample.position);
      camera.lookAt(sample.target);
    } else {
      if (controls.current) controls.current.enabled = !lookState.locked;

      /* ── path record: drop keyframes while the user flies the camera ── */
      if (pathRecord && controls.current) {
        const r = rec.current;
        r.clock += dt;
        const moved =
          r.armed &&
          (camera.position.distanceTo(r.lastPos) > 0.22 ||
            controls.current.target.distanceTo(r.lastTarget) > 0.22);
        if (!r.armed) {
          // first sample: keyframe 0 at the current pose
          r.armed = true;
          r.clock = 0;
          pushPathKeyframe(camera, controls.current.target, 0);
        } else if (r.clock >= 0.42 && (moved || r.clock > 2.2)) {
          r.clock = 0;
          pushPathKeyframe(camera, controls.current.target, nextPathT());
        }
        r.lastPos.copy(camera.position);
        r.lastTarget.copy(controls.current.target);
      }
    }
  });

  return (
    <>
      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping
        dampingFactor={0.12}
        maxPolarAngle={worldMode ? Math.PI - 0.02 : Math.PI / 2.04}
        minDistance={worldMode ? 1 : 1.5}
        maxDistance={worldMode ? 400 : 45}
        target={[0, 1, 0]}
      />
      {cameraLight.on && (
        <>
          <primitive object={spotTarget} />
          <spotLight
            ref={spot}
            target={spotTarget}
            intensity={cameraLight.intensity}
            angle={0.6}
            penumbra={0.75}
            distance={45}
            decay={1.3}
            castShadow={cameraLight.shadows}
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
            shadow-bias={-0.0005}
          />
        </>
      )}
    </>
  );
}

function CaptureBridge() {
  const state = useThree();
  useEffect(() => {
    editorCapture.gl = state.gl;
    editorCapture.scene = state.scene;
    editorCapture.camera = state.camera as THREE.PerspectiveCamera;
    editorCapture.root = state;
    cameraRef.current = state.camera as THREE.PerspectiveCamera;
  }, [state]);
  return null;
}
