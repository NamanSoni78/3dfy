"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import { ChunkManager, CHUNK } from "@/lib/world/chunks";
import { MobSystem } from "@/lib/world/mobs";
import { QUALITY_SPECS } from "@/lib/world/storage";
import type { WorldOpts } from "@/lib/editor/types";
import type { WorldCode } from "@/lib/world/schema";
import { worldRuntime, setPendingSpawn, lookState, controlsRef, objectRefs, renderDriver } from "@/lib/editor/runtime";
import { playback } from "@/lib/editor/render";
import { flyKeys } from "@/lib/three/fly";
import { sfx, haptic } from "@/lib/audio";

/**
 * WorldStage — the infinite 3DWC world rendered INSIDE the editor Canvas.
 * Every editor feature (objects, gizmo, inspector, timeline, offline render)
 * works on top of this stage.
 *
 *  - ChunkManager streams terrain around the camera (lazy, budgeted).
 *  - MobSystem animates deterministic mobs.
 *  - Sky dome shader + fog + hemisphere/sun + custom lights + PMREM env.
 *  - Walk physics (terrain-clamped camera) or free flight.
 *  - Long-press on the TERRAIN raycasts the spawn point for the Add menu.
 *  - `worldRuntime` bridges stats + prewarm to the render dialog.
 */

/* immutable-hook lint helpers — mutation must hide behind function calls */
function setCameraFov(cam: THREE.PerspectiveCamera, fov: number): void {
  cam.fov = fov;
}
function setCameraFar(cam: THREE.PerspectiveCamera, far: number): void {
  cam.far = far;
}
function setManagerFrozen(m: { frozen: boolean }, v: boolean): void {
  m.frozen = v;
}
function setSceneEnvironment(scene: THREE.Scene, tex: THREE.Texture | null, intensity: number): void {
  scene.environment = tex;
  scene.environmentIntensity = intensity;
}

/* --------------------------------- sky dome -------------------------------- */

const SKY_VERT = `
varying vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = `
uniform vec3 topColor;
uniform vec3 bottomColor;
uniform vec3 sunColor;
uniform vec3 sunDir;
varying vec3 vWorld;
void main() {
  vec3 dir = normalize(vWorld);
  float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = mix(bottomColor, topColor, smoothstep(0.42, 0.72, h));
  float sun = pow(max(dot(dir, normalize(sunDir)), 0.0), 48.0);
  col += sunColor * sun * 0.5;
  gl_FragColor = vec4(col, 1.0);
}`;

function makeSkyMaterial(world: WorldCode): THREE.ShaderMaterial {
  const sunDir = sunDirection(world);
  return new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(world.atmosphere.ambient.sky) },
      bottomColor: { value: new THREE.Color(world.atmosphere.fog.color) },
      sunColor: { value: new THREE.Color(world.atmosphere.sun.color) },
      sunDir: { value: sunDir.clone() },
    },
  });
}

function sunDirection(world: WorldCode): THREE.Vector3 {
  const { elevation, azimuth } = world.atmosphere.sun;
  const el = THREE.MathUtils.degToRad(elevation);
  const az = THREE.MathUtils.degToRad(azimuth);
  return new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
}

function SkyDome({ world }: { world: WorldCode }) {
  const mat = useMemo(() => makeSkyMaterial(world), [world]);
  useEffect(() => () => mat.dispose(), [mat]);
  return (
    <mesh material={mat} frustumCulled={false} renderOrder={-10}>
      <sphereGeometry args={[760, 24, 16]} />
    </mesh>
  );
}

/* ------------------------------- custom lights ----------------------------- */

function WorldCustomLights({ world }: { world: WorldCode }) {
  const { camera } = useThree();
  const refs = useRef<(THREE.PointLight | THREE.SpotLight | THREE.DirectionalLight)[]>([]);
  const targets = useMemo(() => world.lights.map(() => new THREE.Object3D()), [world]);

  useFrame(() => {
    world.lights.forEach((l, i) => {
      const light = refs.current[i];
      const target = targets[i];
      if (!light || !target) return;
      if (l.followPlayer) {
        const t = performance.now() * 0.001;
        light.position.set(
          camera.position.x + Math.sin(t * 0.7) * 3,
          camera.position.y + 2.4,
          camera.position.z + Math.cos(t * 0.7) * 3,
        );
        target.position.copy(camera.position);
        target.updateMatrixWorld();
      }
    });
  });

  return (
    <>
      {world.lights.map((l, i) => (
        <group key={i}>
          <primitive object={targets[i]} />
          {l.type === "point" ? (
            <pointLight
              ref={(r) => { if (r) refs.current[i] = r; }}
              color={l.color}
              intensity={l.intensity}
              distance={l.distance}
              decay={1.6}
              position={l.followPlayer ? [0, 10, 0] : l.position}
            />
          ) : (
            <spotLight
              ref={(r) => { if (r) refs.current[i] = r; }}
              color={l.color}
              intensity={l.intensity * 2}
              distance={l.distance * 1.4}
              angle={0.55}
              penumbra={0.6}
              decay={1.4}
              position={l.followPlayer ? [0, 14, 0] : [l.position[0], l.position[1] + 8, l.position[2]]}
              target={targets[i]}
              castShadow={false}
            />
          )}
          {/* tiny visible marker so film-makers can see their light */}
          <mesh position={l.followPlayer ? [0, 10, 0] : l.position}>
            <sphereGeometry args={[0.35, 10, 8]} />
            <meshBasicMaterial color={l.color} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/* --------------------------------- the stage -------------------------------- */

export function WorldStage({
  world,
  opts,
  onLongPressGround,
}: {
  world: WorldCode;
  opts: WorldOpts;
  onLongPressGround: () => void;
}) {
  const { gl, scene, camera } = useThree();

  /* rebuild the manager only for content changes (not render distance) */
  const worldKey = useMemo(() => JSON.stringify([world.seed, world.terrain, world.features, world.mobs]), [world]);
  const q = QUALITY_SPECS[opts.quality];

  /* Intentional manual memoization: the manager must rebuild ONLY when the
     world content changes (worldKey), not when atmosphere-only fields do. */
  const manager = useMemo(
    // eslint-disable-next-line react-hooks/preserve-manual-memoization
    () =>
      new ChunkManager(scene, world, {
        renderDistance: opts.renderDistance,
        quality: opts.quality,
        featureMul: q.featureMul,
      }),
    [scene, worldKey, opts.quality],
  );
  useEffect(() => () => manager.dispose(), [manager]);

  useEffect(() => {
    manager.setOpts({ renderDistance: opts.renderDistance });
  }, [opts.renderDistance, manager]);

  /* MobSystem rebuilds with the manager (it samples terrain heights). */
  const mobs = useMemo(
    // eslint-disable-next-line react-hooks/preserve-manual-memoization
    () => new MobSystem(scene, world, (x: number, z: number) => manager.heightAt(x, z)),
    [scene, worldKey, manager],
  );
  useEffect(() => () => mobs.dispose(), [mobs]);

  /* sun light (shadow camera follows the player via attachSun) */
  const sunRef = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    if (sunRef.current) manager.attachSun(sunRef.current);
  }, [manager]);

  /* camera far plane widened for the world (folded into the frame loop) */

  const spawnedFor = useRef("");
  useEffect(() => {
    if (spawnedFor.current === worldKey) return;
    spawnedFor.current = worldKey;
    const cam = camera as THREE.PerspectiveCamera;
    const y = manager.heightAt(0, 0);
    cam.position.set(0, y + 9, 0);
    cam.rotation.set(-0.25, 0, 0, "YXZ");
    const c = controlsRef.current;
    if (c?.target) c.target.set(0, y + 1.5, -7);
  }, [worldKey, manager, camera]);

  /* PMREM environment (reflections) — generated from the sky dome once */
  const env = world.atmosphere.reflections.env;
  useEffect(() => {
    if (env <= 0) return;
    const pmrem = new THREE.PMREMGenerator(gl);
    const mat = makeSkyMaterial(world);
    const skyScene = new THREE.Scene();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(60, 24, 16), mat);
    skyScene.add(dome);
    const rt = pmrem.fromScene(skyScene, 0.08);
    setSceneEnvironment(scene, rt.texture, 0.25 + env * 0.9);
    return () => {
      setSceneEnvironment(scene, null, 1);
      rt.dispose();
      pmrem.dispose();
      dome.geometry.dispose();
      mat.dispose();
    };
  }, [gl, scene, env, worldKey]);

  /* worldRuntime bridge — stats + render prewarm */
  useEffect(() => {
    worldRuntime.manager = manager;
    worldRuntime.prewarm = async (samples, onProgress) => {
      const pts = samples.map((s) => new THREE.Vector3(s[0], s[1], s[2]));
      await manager.prewarm(pts, onProgress);
      return true;
    };
    return () => {
      worldRuntime.manager = null;
      worldRuntime.prewarm = null;
    };
  }, [manager]);

  /* long-press the TERRAIN → spawn point for the Add menu */
  useEffect(() => {
    const el = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const nodes: THREE.Object3D[] = [];
    let press: { x: number; y: number; moved: boolean } | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const toNdc = (cx: number, cy: number) => {
      const r = el.getBoundingClientRect();
      ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    };
    const hitEditorObject = (cx: number, cy: number): boolean => {
      nodes.length = 0;
      objectRefs.forEach((o) => nodes.push(o));
      if (!nodes.length) return false;
      toNdc(cx, cy);
      raycaster.setFromCamera(ndc, camera as THREE.PerspectiveCamera);
      return raycaster.intersectObjects(nodes, true).length > 0;
    };
    const hitTerrain = (cx: number, cy: number): THREE.Vector3 | null => {
      toNdc(cx, cy);
      raycaster.setFromCamera(ndc, camera as THREE.PerspectiveCamera);
      const hits = raycaster.intersectObjects(scene.children, true);
      for (const h of hits) {
        if (h.object.userData.terrain) return h.point.clone();
      }
      return null;
    };

    const onDown = (e: PointerEvent) => {
      if (lookState.locked || renderDriver.active) return;
      if (hitEditorObject(e.clientX, e.clientY)) return;
      press = { x: e.clientX, y: e.clientY, moved: false };
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (press && !press.moved) {
          const p = hitTerrain(press.x, press.y);
          if (p) {
            setPendingSpawn([p.x, p.y + 0.8, p.z]);
            sfx.play("pop");
            haptic(18);
            onLongPressGround();
          }
        }
      }, 460);
    };
    const onMove = (e: PointerEvent) => {
      if (!press) return;
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 14) {
        press.moved = true;
        if (timer) { clearTimeout(timer); timer = null; }
      }
    };
    const onUp = () => {
      press = null;
      if (timer) { clearTimeout(timer); timer = null; }
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (timer) clearTimeout(timer);
    };
  }, [gl, scene, camera, onLongPressGround]);

  /* frame loop — walk physics, streaming, mobs, stats */
  const statsClock = useRef(0);
  const dirV = useRef(new THREE.Vector3());
  useFrame((state, dt) => {
    const cam = camera as THREE.PerspectiveCamera;
    const t = state.clock.elapsedTime;

    if (cam.far < 900) {
      setCameraFar(cam, 900);
      cam.updateProjectionMatrix();
    }

    /* determinism guard: freeze streaming during offline renders */
    setManagerFrozen(manager, renderDriver.active);

    /* walk physics (skipped while the camera is driven by playback/render) */
    if (opts.walkMode && !renderDriver.active && !playback.playing) {
      const ground = manager.heightAt(cam.position.x, cam.position.z);
      const minY = ground + 1.65;
      if (cam.position.y < minY) cam.position.setY(minY);
      else if (!flyKeys.up) cam.position.setY(Math.max(minY, cam.position.y - Math.min(dt, 0.05) * 5.5));
    }

    cam.getWorldDirection(dirV.current);
    const stats = manager.update(cam.position, t, dirV.current);
    mobs.update(cam.position, t);

    statsClock.current += dt;
    if (statsClock.current > 0.5) {
      statsClock.current = 0;
      worldRuntime.stats = { ...stats, alt: cam.position.y };
    }
  });

  const fogDensity = Math.max(world.atmosphere.fog.density, 1.05 / (opts.renderDistance * CHUNK));
  const shadowsOn = opts.quality === "high" && world.atmosphere.shadows;
  const { elevation, azimuth } = world.atmosphere.sun;
  const el = THREE.MathUtils.degToRad(elevation);
  const az = THREE.MathUtils.degToRad(azimuth);
  const sunPos: [number, number, number] = [Math.cos(el) * Math.sin(az) * 130, Math.sin(el) * 130, Math.cos(el) * Math.cos(az) * 130];
  const starCount = Math.round(600 + world.atmosphere.stars.intensity * 2400);

  return (
    <>
      <fogExp2 attach="fog" args={[world.atmosphere.fog.color, fogDensity]} />
      <SkyDome world={world} />
      <hemisphereLight
        args={[world.atmosphere.ambient.sky, world.atmosphere.ambient.ground, world.atmosphere.ambient.intensity * 1.25]}
      />
      <directionalLight
        ref={sunRef}
        position={sunPos}
        color={world.atmosphere.sun.color}
        intensity={world.atmosphere.sun.intensity}
        castShadow={shadowsOn}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-camera-far={400}
        shadow-bias={-0.0004}
      />
      <WorldCustomLights world={world} />
      {world.atmosphere.stars.on && (
        <Stars radius={420} depth={80} count={starCount} factor={5} saturation={0.4} fade speed={0.6} />
      )}
    </>
  );
}
