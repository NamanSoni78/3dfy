"use client";

import { loadJSON, saveJSON, removeKey, uid } from "@/lib/storage";
import type { WorldCode } from "./schema";

/**
 * Saved worlds live in localStorage as the RAW pasted code + parsed snapshot,
 * so re-entering a world never re-parses and never drifts.
 */

const LIST_KEY = "3dfy.worlds";
const worldKey = (id: string) => `3dfy.world.${id}`;

export interface SavedWorldMeta {
  id: string;
  name: string;
  savedAt: string;
  seed: number;
}

export interface SavedWorld extends SavedWorldMeta {
  world: WorldCode;
}

export function listWorlds(): SavedWorldMeta[] {
  return loadJSON<SavedWorldMeta[]>(LIST_KEY, []).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function loadWorld(id: string): SavedWorld | null {
  return loadJSON<SavedWorld | null>(worldKey(id), null);
}

export function saveWorld(world: WorldCode): SavedWorldMeta {
  const existing = listWorlds().find((w) => w.name === world.name && w.seed === world.seed);
  const id = existing?.id ?? uid();
  const savedAt = new Date().toISOString();
  const meta: SavedWorldMeta = { id, name: world.name, savedAt, seed: world.seed };
  saveJSON(worldKey(id), { ...meta, world });
  saveJSON(LIST_KEY, [meta, ...listWorlds().filter((w) => w.id !== id)].slice(0, 30));
  return meta;
}

export function deleteWorld(id: string): void {
  removeKey(worldKey(id));
  saveJSON(LIST_KEY, listWorlds().filter((w) => w.id !== id));
}

/* ------------------------------ view options ------------------------------ */

export interface WorldOpts {
  renderDistance: number; // chunks: 2..6
  quality: "draft" | "balanced" | "high";
  fov: number; // 50..100
  flySpeed: number; // 2..20
}

export const DEFAULT_WORLD_OPTS: WorldOpts = {
  renderDistance: 3,
  quality: "balanced",
  fov: 62,
  flySpeed: 7,
};

const OPTS_KEY = "3dfy.world.opts";

export function loadWorldOpts(): WorldOpts {
  const o = loadJSON<Partial<WorldOpts>>(OPTS_KEY, {});
  return {
    renderDistance: Math.min(6, Math.max(2, Math.round(o.renderDistance ?? DEFAULT_WORLD_OPTS.renderDistance))),
    quality: o.quality === "draft" || o.quality === "high" ? o.quality : DEFAULT_WORLD_OPTS.quality,
    fov: Math.min(100, Math.max(50, o.fov ?? DEFAULT_WORLD_OPTS.fov)),
    flySpeed: Math.min(20, Math.max(2, o.flySpeed ?? DEFAULT_WORLD_OPTS.flySpeed)),
  };
}

export function saveWorldOpts(o: WorldOpts): void {
  saveJSON(OPTS_KEY, o);
}

export const QUALITY_SPECS: Record<WorldOpts["quality"], { dpr: [number, number]; featureMul: number; label: string; desc: string }> = {
  draft: { dpr: [0.75, 1], featureMul: 0.55, label: "Draft", desc: "Fastest — fewer props, softer pixels" },
  balanced: { dpr: [1, 1.5], featureMul: 1, label: "Balanced", desc: "Default — crisp & smooth" },
  high: { dpr: [1, 2], featureMul: 1.25, label: "High", desc: "Dense props — needs a strong phone/PC" },
};
