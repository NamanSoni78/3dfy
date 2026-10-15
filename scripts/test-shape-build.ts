/**
 * V1.6 shape-builder verification — run with: bun scripts/test-shape-build.ts
 *
 * Proves:
 *  1. the ROOT CAUSE of "imported object spawns as entity but is invisible":
 *     three's mergeGeometries returns null when indexed + non-indexed
 *     geometries are mixed (gear/star/heart are ExtrudeGeometry = non-indexed);
 *  2. the user's exact "Ultimate Pro PC Rig" 3dsc-2 code (mesh + gear + ring +
 *     capsule + cylinder + box + sphere mix) now parses AND builds into a real
 *     visible geometry with per-face colors;
 *  3. old imports (Gem Rocket sample, pure-primitive shapes) still build.
 */
import * as THREE from "three";
import { readFileSync } from "fs";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { parseShapeCode, SAMPLE_SHAPE_CODE } from "../src/lib/shapes/schema";
import { buildShapeGeometry } from "../src/lib/shapes/build";
import type { ShapePart } from "../src/lib/shapes/schema";

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  const line = `  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`;
  console.log(line);
  if (!cond) failures++;
}

console.log("\n[1] Root-cause repro: mixed indexed + non-indexed merge (the old bug)");
{
  const box = new THREE.BoxGeometry(1, 1, 1); // indexed
  const gearShape = new THREE.Shape();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 === 0 ? 0.6 : 0.5;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) gearShape.moveTo(x, y); else gearShape.lineTo(x, y);
  }
  gearShape.closePath();
  const gear = new THREE.ExtrudeGeometry(gearShape, { depth: 0.2, bevelEnabled: false }); // NON-indexed
  const mixed = mergeGeometries([box, gear], false);
  check("mergeGeometries(box, gear) returns null (mixed index-ness)", mixed === null);
  box.dispose();
  gear.dispose();
}

console.log("\n[2] The user's exact PC Rig code (mesh + gear + ring + capsule mix)");
{
  const raw = readFileSync(new URL("./pc-rig.json", import.meta.url), "utf8");
  const res = parseShapeCode("```3dsc\n" + raw + "\n```");
  check("parseShapeCode succeeds", !("error" in res), "error" in res ? res.error : "");
  if (!("error" in res)) {
    const { parts } = res.code;
    const gears = parts.filter((p) => p.primitive === "gear").length;
    const meshes = parts.filter((p) => p.primitive === "mesh").length;
    const rings = parts.filter((p) => p.primitive === "ring").length;
    check("parts parsed", parts.length >= 30, `${parts.length} parts (${meshes} mesh, ${gears} gear, ${rings} ring)`);
    check("has gear parts (the poison ingredient)", gears > 0);
    check("has real mesh parts", meshes > 0);

    const geo = buildShapeGeometry(parts);
    check("buildShapeGeometry returns a geometry (was null before the fix!)", geo !== null);
    if (geo) {
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const col = geo.attributes.color as THREE.BufferAttribute;
      const nrm = geo.attributes.normal as THREE.BufferAttribute;
      check("position attribute with real vertices", pos.count > 1000, `${pos.count} verts`);
      check("per-vertex color attribute", !!col && col.count === pos.count);
      check("normal attribute", !!nrm && nrm.count === pos.count);
      check("uniformly non-indexed (merge-safe)", geo.index === null);

      geo.computeBoundingBox();
      const bb = geo.boundingBox!;
      const sx = bb.max.x - bb.min.x, sy = bb.max.y - bb.min.y, sz = bb.max.z - bb.min.z;
      check("desk width ~3.9m", Math.abs(sx - 3.92) < 0.35, `x span ${sx.toFixed(2)}`);
      check("desk depth ~2m", Math.abs(sz - 2.0) < 0.4, `z span ${sz.toFixed(2)}`);
      check("height ~1.6-2.1m", sy > 1.5 && sy < 2.2, `y span ${sy.toFixed(2)}`);

      // neon accents present in vertex colors (#00f0ff cyan, #ff2a85 pink)
      // NOTE: THREE.Color stores LINEAR values (sRGB → linear), so thresholds
      // are in linear space: #ff2a85 → r 1.0, g 0.023, b 0.235
      let cyan = 0, pink = 0;
      for (let i = 0; i < col.count; i++) {
        const r = col.getX(i), g = col.getY(i), b = col.getZ(i);
        if (b > 0.85 && g > 0.8 && r < 0.3) cyan++;
        if (r > 0.8 && b > 0.15 && g < 0.1) pink++;
      }
      check("neon cyan faces present in vertex colors", cyan > 30, `${cyan} cyan verts`);
      check("neon pink faces present in vertex colors", pink > 30, `${pink} pink verts`);
      geo.dispose();
    }
  }
}

console.log("\n[3] Regressions");
{
  const res = parseShapeCode(SAMPLE_SHAPE_CODE);
  check("Gem Rocket sample parses", !("error" in res));
  if (!("error" in res)) {
    const geo = buildShapeGeometry(res.code.parts);
    check("Gem Rocket sample builds", geo !== null);
    geo?.dispose();
  }

  const gearOnly: ShapePart[] = [
    { primitive: "gear", position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: "#ffffff" },
    { primitive: "gear", position: [1.2, 0, 0], rotation: [0, 90, 0], scale: [0.8, 0.4, 0.8], color: "#00f0ff" },
  ];
  const g2 = buildShapeGeometry(gearOnly);
  check("pure-gear shape builds", g2 !== null);
  g2?.dispose();

  const prims: ShapePart[] = [
    { primitive: "box", position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: "#c9a86a" },
    { primitive: "sphere", position: [0, 1.4, 0], rotation: [0, 0, 0], scale: [0.5, 0.5, 0.5], color: "#e2493b" },
    { primitive: "cylinder", position: [0.8, 0.3, 0], rotation: [0, 0, 0], scale: [0.3, 0.6, 0.3], color: "#8d99a8" },
    { primitive: "torus", position: [-0.8, 0.4, 0], rotation: [90, 0, 0], scale: [0.6, 0.6, 0.6], color: "#57c8ff" },
  ];
  const g3 = buildShapeGeometry(prims);
  check("pure-primitive shape builds", g3 !== null);
  g3?.dispose();
}

console.log(failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
