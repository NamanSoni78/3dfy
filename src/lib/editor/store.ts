"use client";

import { create } from "zustand";
import { loadJSON, saveJSON, removeKey, uid } from "@/lib/storage";
import type { Project, ProjectMeta, SceneObject, Keyframe, WorldSettings, CustomParticle, CustomShapeDef, ThreeDfyFile, AssetMeta, WorldOpts, StageKind } from "./types";
import { normalizeProject } from "./types";
import { newProject, createFromTemplate, makeWorldProject } from "./defaults";
import type { WorldCode } from "@/lib/world/schema";
import { gatherAssets, restoreAssets, saveAsset } from "./assets";

const INDEX_KEY = "3dfy.projects";
const projectKey = (id: string) => `3dfy.project.${id}`;

/** Max timeline length — 10 minutes. */
export const MAX_DURATION = 600;

/* --------------------------- projects index --------------------------- */

export function listProjects(): ProjectMeta[] {
  return loadJSON<ProjectMeta[]>(INDEX_KEY, []).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function saveIndex(metas: ProjectMeta[]): void {
  saveJSON(INDEX_KEY, metas);
}

export function upsertMeta(meta: ProjectMeta): void {
  const all = listProjects().filter((m) => m.id !== meta.id);
  all.unshift(meta);
  saveIndex(all);
}

export function loadProject(id: string): Project | null {
  const p = loadJSON<Project | null>(projectKey(id), null);
  return p ? normalizeProject(p) : null;
}

export function persistProject(project: Project, thumb?: string | null): void {
  const updated = { ...project, updatedAt: new Date().toISOString() };
  saveJSON(projectKey(updated.id), updated);
  upsertMeta({
    id: updated.id,
    name: updated.name,
    updatedAt: updated.updatedAt,
    thumb: thumb ?? listProjects().find((m) => m.id === updated.id)?.thumb ?? null,
    objectCount: updated.objects.length,
    stage: updated.stage,
  });
}

export function deleteProject(id: string): void {
  removeKey(projectKey(id));
  saveIndex(listProjects().filter((m) => m.id !== id));
}

export function createProject(): Project {
  const p = newProject();
  persistProject(p);
  return p;
}

export function createProjectFromTemplate(templateId: string): Project {
  const p = createFromTemplate(templateId);
  persistProject(p);
  return p;
}

/** Creates (and persists) a project whose stage is an infinite 3DWC world. */
export function createWorldProject(world: WorldCode): Project {
  const p = makeWorldProject(world);
  persistProject(p);
  return p;
}

export function duplicateProject(id: string): Project | null {
  const src = loadProject(id);
  if (!src) return null;
  const copy: Project = JSON.parse(JSON.stringify(src));
  copy.id = uid();
  copy.name = `${src.name} copy`;
  copy.createdAt = new Date().toISOString();
  copy.updatedAt = new Date().toISOString();
  // duplicate assets in IDB
  Object.entries(src.assets).forEach(async ([aid, meta]) => {
    const { loadAsset } = await import("./assets");
    const data = await loadAsset(aid);
    if (data) {
      const nid = uid();
      await saveAsset(nid, data);
      copy.assets[nid] = meta;
      (copy.objects as SceneObject[]).forEach((o) => {
        if (o.type === "image" && o.image.asset === aid) o.image.asset = nid;
        if (o.material.printAsset === aid) o.material.printAsset = nid;
      });
      persistProject(copy);
    }
  });
  persistProject(copy);
  return copy;
}

/* ------------------------------ .3dfy file ----------------------------- */

export async function exportProjectFile(project: Project): Promise<void> {
  const assets = await gatherAssets(project.assets);
  const { assets: _omit, ...projectRest } = project;
  const file: ThreeDfyFile = {
    format: "3dfy-project",
    version: 1,
    project: projectRest,
    assets,
  };
  const blob = new Blob([JSON.stringify(file)], { type: "application/json" });
  const { downloadBlob } = await import("@/lib/storage");
  const safe = project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  downloadBlob(blob, `${safe || "project"}.3dfy`);
}

export async function importProjectFile(file: File): Promise<Project> {
  const text = await file.text();
  const parsed = JSON.parse(text) as ThreeDfyFile;
  if (parsed?.format !== "3dfy-project" || !parsed?.project?.id) {
    throw new Error("Not a valid .3dfy project file");
  }
  const project: Project = normalizeProject({
    ...parsed.project,
    customShapes: parsed.project.customShapes ?? {},
    assets: {},
  });
  // restore assets into this phone's IDB
  if (parsed.assets) {
    await restoreAssets(parsed.assets);
    project.assets = Object.fromEntries(
      Object.entries(parsed.assets).map(([id, a]) => [id, a.meta]),
    );
  }
  persistProject(project);
  return project;
}

/* ------------------------------ editor store ---------------------------- */

export type PanelId = null | "add" | "inspector" | "director" | "render" | "theme" | "world" | "worldstage" | "menu" | "shortcuts";
export type GizmoMode = "translate" | "rotate" | "scale";

interface EditorState {
  project: Project;
  selectedId: string | null;
  gizmo: GizmoMode;
  panel: PanelId;
  /** director (camera) mode — timeline dock visible, path-record enabled */
  director: boolean;
  /** auto-keyframe path recording (Minecraft-replay style) */
  pathRecord: boolean;
  /** camera path preview is playing (hides gizmo chrome) */
  previewing: boolean;
  /** bumped by addObject so the UI can auto-frame the fresh object */
  lastAdded: { id: string; n: number };
  past: Project[];
  future: Project[];
  /** runtime asset dataUrl cache */
  assetUrls: Record<string, string>;
  saving: boolean;
  /** epoch ms of the last completed autosave (drives the “Saved” chip) */
  savedAt: number;

  load: (p: Project) => void;
  commit: () => void;
  undo: () => void;
  redo: () => void;
  save: () => void;

  select: (id: string | null) => void;
  setGizmo: (g: GizmoMode) => void;
  setPanel: (p: PanelId) => void;
  setDirector: (v: boolean) => void;
  setPathRecord: (v: boolean) => void;
  setPreviewing: (v: boolean) => void;

  addObject: (obj: SceneObject) => void;
  updateObject: (id: string, patch: Partial<SceneObject>, commit?: boolean) => void;
  deleteObject: (id: string) => void;
  duplicateObject: (id: string) => void;
  /** registers an imported 3DSC shape and returns its id */
  addCustomShape: (shape: CustomShapeDef) => string;

  addKeyframe: (kf: Keyframe) => void;
  updateKeyframe: (id: string, patch: Partial<Keyframe>) => void;
  deleteKeyframe: (id: string) => void;
  clearKeyframes: () => void;
  setDuration: (d: number) => void;

  updateWorld: (patch: Partial<WorldSettings>) => void;
  setWorldDef: (world: WorldCode) => void;
  updateWorldOpts: (patch: Partial<WorldOpts>) => void;
  setStage: (stage: StageKind) => void;
  setCameraFov: (fov: number) => void;
  setTheme: (themeId: string) => void;
  addCustomParticle: (cp: CustomParticle) => void;
  renameProject: (name: string) => void;

  registerAsset: (id: string, url: string) => void;
  registerAssetMeta: (id: string, meta: AssetMeta) => void;
}

const clone = (p: Project): Project => JSON.parse(JSON.stringify(p)) as Project;

/** Deterministic initial project — a random name here would break SSR hydration. */
const initialProject: Project = { ...newProject(), name: "Untitled" };

/* debounced-save machinery */
let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** Immediately persist the current project (pagehide, beforeunload, export). */
export function flushSave(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const { project } = useEditor.getState();
  persistProject(project);
  useEditor.setState({ savedAt: Date.now(), saving: false });
}

export const useEditor = create<EditorState>((set, get) => ({
  project: initialProject,
  selectedId: null,
  gizmo: "translate",
  panel: null,
  past: [],
  future: [],
  assetUrls: {},
  saving: false,
  savedAt: 0,
  director: false,
  pathRecord: false,
  previewing: false,
  lastAdded: { id: "", n: 0 },

  load: (p) =>
    set({
      project: normalizeProject({ ...p, customShapes: p.customShapes ?? {} }),
      selectedId: null,
      panel: null,
      director: false,
      pathRecord: false,
      previewing: false,
      past: [],
      future: [],
      assetUrls: {},
    }),

  commit: () => {
    const { project, past } = get();
    set({ past: [...past.slice(-24), clone(project)], future: [] });
  },

  undo: () => {
    const { past, future, project } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    set({ project: prev, past: past.slice(0, -1), future: [clone(project), ...future].slice(0, 24) });
    get().save();
  },

  redo: () => {
    const { past, future, project } = get();
    if (!future.length) return;
    const next = future[0];
    set({ project: next, future: future.slice(1), past: [...past, clone(project)] });
    get().save();
  },

  save: () => {
    // debounced autosave — a gizmo drag fires dozens of updates; we write
    // to localStorage once things go quiet (and flush on pagehide)
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      flushSave();
    }, 600);
  },

  /**
   * Selection ≠ editing. A tap only selects (gizmo appears, object can be
   * transformed freely). The inspector opens through an explicit action.
   */
  select: (id) => set({ selectedId: id }),

  setGizmo: (g) => set({ gizmo: g }),

  setPanel: (p) => set({ panel: p }),

  setDirector: (v) => set({ director: v, pathRecord: false }),

  setPathRecord: (v) => set({ pathRecord: v }),

  setPreviewing: (v) => set({ previewing: v }),

  addObject: (obj) => {
    get().commit();
    set((s) => ({
      project: { ...s.project, objects: [...s.project.objects, obj] },
      selectedId: obj.id,
      lastAdded: { id: obj.id, n: s.lastAdded.n + 1 },
    }));
    get().save();
  },

  updateObject: (id, patch, doCommit = false) => {
    if (doCommit) get().commit();
    set((s) => ({
      project: {
        ...s.project,
        objects: s.project.objects.map((o) => (o.id === id ? ({ ...o, ...patch } as SceneObject) : o)),
      },
    }));
    get().save();
  },

  deleteObject: (id) => {
    get().commit();
    set((s) => ({
      project: { ...s.project, objects: s.project.objects.filter((o) => o.id !== id) },
      selectedId: s.selectedId === id ? null : s.selectedId,
      panel: s.selectedId === id ? null : s.panel,
    }));
    get().save();
  },

  duplicateObject: (id) => {
    const obj = get().project.objects.find((o) => o.id === id);
    if (!obj) return;
    get().commit();
    const copy = { ...clone({ ...get().project, objects: [obj] }).objects[0], id: uid() };
    copy.position = [obj.position[0] + 1, obj.position[1], obj.position[2]];
    copy.name = `${obj.name} copy`;
    set((s) => ({ project: { ...s.project, objects: [...s.project.objects, copy] }, selectedId: copy.id }));
    get().save();
  },

  addCustomShape: (shape) => {
    const id = uid();
    get().commit();
    set((s) => ({
      project: { ...s.project, customShapes: { ...s.project.customShapes, [id]: shape } },
    }));
    get().save();
    return id;
  },

  clearKeyframes: () => {
    get().commit();
    set((s) => ({ project: { ...s.project, keyframes: [] } }));
    get().save();
  },

  addKeyframe: (kf) => {
    get().commit();
    set((s) => ({
      project: { ...s.project, keyframes: [...s.project.keyframes.filter((k) => k.id !== kf.id), kf] },
    }));
    get().save();
  },

  updateKeyframe: (id, patch) => {
    set((s) => ({
      project: {
        ...s.project,
        keyframes: s.project.keyframes.map((k) => (k.id === id ? { ...k, ...patch } : k)),
      },
    }));
    get().save();
  },

  deleteKeyframe: (id) => {
    get().commit();
    set((s) => ({ project: { ...s.project, keyframes: s.project.keyframes.filter((k) => k.id !== id) } }));
    get().save();
  },

  setDuration: (d) => {
    const dur = Math.min(MAX_DURATION, Math.max(2, d));
    set((s) => ({ project: { ...s.project, duration: dur } }));
    get().save();
  },

  updateWorld: (patch) => {
    set((s) => ({ project: { ...s.project, world: { ...s.project.world, ...patch } } }));
    get().save();
  },

  /** Swap the infinite-world definition (world stage). */
  setWorldDef: (world) => {
    get().commit();
    set((s) => ({ project: { ...s.project, stage: "world", worldDef: world } }));
    get().save();
  },

  updateWorldOpts: (patch) => {
    set((s) => ({ project: { ...s.project, worldOpts: { ...s.project.worldOpts, ...patch } } }));
    get().save();
  },

  setStage: (stage) => {
    get().commit();
    set((s) => ({ project: { ...s.project, stage } }));
    get().save();
  },

  setCameraFov: (fov) => {
    const f = Math.min(100, Math.max(20, Math.round(fov)));
    set((s) => ({ project: { ...s.project, cameraFov: f } }));
    get().save();
  },

  setTheme: (themeId) => {
    get().commit();
    set((s) => ({ project: { ...s.project, world: { ...s.project.world, themeId } } }));
    get().save();
  },

  addCustomParticle: (cp) => {
    set((s) => ({ project: { ...s.project, customParticles: [...s.project.customParticles, cp] } }));
    get().save();
  },

  renameProject: (name) => {
    set((s) => ({ project: { ...s.project, name: name.trim().slice(0, 40) || "Untitled" } }));
    get().save();
  },

  registerAsset: (id, url) => set((s) => ({ assetUrls: { ...s.assetUrls, [id]: url } })),

  registerAssetMeta: (id, meta) => {
    set((s) => ({ project: { ...s.project, assets: { ...s.project.assets, [id]: meta } } }));
    get().save();
  },
}));
