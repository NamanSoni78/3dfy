"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft, Camera, Clapperboard, Crosshair, Film, Gamepad2, Globe2, Hand, HelpCircle, Lightbulb, MousePointer2, MoreVertical,
  Move3d, Palette, Plus, Redo2, RotateCcw, Scale3d, Undo2, Copy, SlidersHorizontal, Trash2, X,
  CircleCheckBig,
} from "lucide-react";
import { useEditor, loadProject, exportProjectFile, flushSave } from "@/lib/editor/store";
import { loadAsset } from "@/lib/editor/assets";
import { takeScreenshot, captureThumbDataUrl, playback, editorCapture } from "@/lib/editor/render";
import { upsertMeta, listProjects } from "@/lib/editor/store";
import { controlsRef, frameObjectInView, renderDriver, flyState, loadFlyPrefs, saveFlyPrefs, lookState, loadLookPrefs, saveLookPrefs, worldRuntime } from "@/lib/editor/runtime";
import { sfx, haptic } from "@/lib/audio";
import { FlyTouchPad } from "@/components/shared/FlyTouchPad";
import { AddMenuPanel } from "./panels/AddMenuPanel";
import { InspectorPanel, InspectorDock } from "./panels/InspectorPanel";
import { DirectorPanel, RenderDialog, TimelineDock, PathRecordBanner, captureKeyframe, togglePlay, startPathRecord, stopPathRecord } from "./panels/DirectorPanel";
import { MenuPanel, ThemePanel, WorldPanel } from "./panels/SettingsPanels";
import { WorldStagePanel } from "./panels/WorldStagePanel";
import { ShortcutsDialog } from "./panels/ShortcutsDialog";
import { useLookLocked, LookOverlay } from "./HandLook";

const Scene = dynamic(() => import("./EditorScene").then((m) => m.EditorScene), { ssr: false, loading: () => null });

function RailBtn({
  icon, label, hotkey, onClick, active, disabled,
}: {
  icon: React.ReactNode; label: string; hotkey?: string; onClick: () => void; active?: boolean; disabled?: boolean;
}) {
  return (
    <button
      aria-label={label}
      title={hotkey ? `${label} (${hotkey})` : label}
      disabled={disabled}
      onClick={() => { if (disabled) return; onClick(); sfx.play("tick", { vol: 0.35 }); }}
      className={`flex size-10 items-center justify-center rounded-lg transition-all active:scale-90 ${
        disabled
          ? "cursor-not-allowed bg-elevated/50 text-muted-foreground/40"
          : active
            ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
            : "bg-elevated text-secondary-foreground hover:bg-secondary"
      }`}
    >
      {icon}
    </button>
  );
}

/* ------------------------------ media query ------------------------------ */

function useMedia(query: string): boolean {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const fn = () => setM(mq.matches);
    fn();
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [query]);
  return m;
}

export function EditorApp({ projectId }: { projectId: string }) {
  const router = useRouter();
  const isDesktop = useMedia("(min-width: 768px)");
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setIsTouch(
        window.matchMedia("(pointer: coarse)").matches ||
          navigator.maxTouchPoints > 0 ||
          window.localStorage.getItem("3dfy.pad") === "1",
      );
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const load = useEditor((s) => s.load);
  const registerAsset = useEditor((s) => s.registerAsset);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const panel = useEditor((s) => s.panel);
  const setPanel = useEditor((s) => s.setPanel);
  const gizmo = useEditor((s) => s.gizmo);
  const setGizmo = useEditor((s) => s.setGizmo);
  const selectedId = useEditor((s) => s.selectedId);
  const select = useEditor((s) => s.select);
  const director = useEditor((s) => s.director);
  const setDirector = useEditor((s) => s.setDirector);
  const setPreviewing = useEditor((s) => s.setPreviewing);
  const projectName = useEditor((s) => s.project.name);
  const objects = useEditor((s) => s.project.objects);
  const updateWorld = useEditor((s) => s.updateWorld);
  const grid = useEditor((s) => s.project.world.grid);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const deleteObject = useEditor((s) => s.deleteObject);
  const duplicateObject = useEditor((s) => s.duplicateObject);
  const savedAt = useEditor((s) => s.savedAt);
  const pathRecord = useEditor((s) => s.pathRecord);

  const [ready, setReady] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);
  const [flyOn, setFlyOn] = useState(true);
  const [lookOn, setLookOn] = useState(true);
  const [directorHint, setDirectorHint] = useState(false);
  const [worldStats, setWorldStats] = useState({ loaded: 0, pending: 0, alt: 0 });
  const thumbTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stage = useEditor((s) => s.project.stage);
  const isWorld = stage === "world";
  const homeHref = isWorld ? "/world" : "/make3d";
  const locked = useLookLocked();

  const selectedObj = objects.find((o) => o.id === selectedId) ?? null;

  /* fly + look prefs (shared with the World Studio) */
  useEffect(() => {
    loadFlyPrefs();
    setFlyOn(flyState.enabled);
    loadLookPrefs();
    setLookOn(lookState.enabled);
  }, []);

  const toggleFly = useCallback(() => {
    flyState.enabled = !flyState.enabled;
    saveFlyPrefs();
    setFlyOn(flyState.enabled);
    sfx.play("tick", { vol: 0.4 });
  }, []);

  const toggleLook = useCallback(() => {
    lookState.enabled = !lookState.enabled;
    if (!lookState.enabled && document.pointerLockElement) document.exitPointerLock();
    saveLookPrefs();
    setLookOn(lookState.enabled);
    sfx.play("tick", { vol: 0.4 });
    toast.success(lookState.enabled ? "Hand-look on" : "Hand-look off", {
      description: lookState.enabled
        ? "Drag empty space to look around — Minecraft style."
        : "Classic orbit controls.",
    });
  }, []);

  /* world streaming stats readout */
  useEffect(() => {
    if (!isWorld) return;
    const id = setInterval(() => setWorldStats({ ...worldRuntime.stats }), 500);
    return () => clearInterval(id);
  }, [isWorld]);

  /* first-time director-mode coach */
  useEffect(() => {
    if (director && window.localStorage.getItem("3dfy.director.hint") !== "1") {
      setDirectorHint(true);
    }
  }, [director]);

  const closeDirectorHint = () => {
    window.localStorage.setItem("3dfy.director.hint", "1");
    setDirectorHint(false);
  };

  /* -------------------------- project loading -------------------------- */

  useEffect(() => {
    const p = loadProject(projectId);
    if (!p) {
      toast.error("Project not found");
      router.replace("/make3d");
      return;
    }
    load(p);
    void (async () => {
      await Promise.all(
        Object.keys(p.assets).map(async (id) => {
          const url = await loadAsset(id);
          if (url) registerAsset(id, url);
        }),
      );
      setReady(true);
    })();
  }, [projectId, load, registerAsset, router]);

  /* ------------------------- thumbnails + saves ------------------------ */

  const saveThumb = useCallback(async () => {
    const thumb = await captureThumbDataUrl();
    if (thumb) {
      upsertMeta({
        id: projectId,
        name: useEditor.getState().project.name,
        updatedAt: new Date().toISOString(),
        thumb,
        objectCount: useEditor.getState().project.objects.length,
      });
    }
  }, [projectId]);

  useEffect(() => {
    if (!ready) return;
    thumbTimer.current = setInterval(() => void saveThumb(), 24_000);
    const onHide = () => {
      flushSave();
      void saveThumb();
    };
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onHide);
    return () => {
      if (thumbTimer.current) clearInterval(thumbTimer.current);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onHide);
      void saveThumb();
    };
  }, [ready, saveThumb]);

  /* --------------------------- playback sync --------------------------- */

  useEffect(() => {
    const id = setInterval(() => {
      if (useEditor.getState().previewing !== playback.playing) {
        setPreviewing(playback.playing);
      }
    }, 120);
    return () => clearInterval(id);
  }, [setPreviewing]);

  /* ------------------- auto-frame freshly added objects ------------------- */

  const lastAddedN = useEditor((s) => s.lastAdded.n);
  useEffect(() => {
    if (lastAddedN === 0) return;
    const { lastAdded, pathRecord, previewing } = useEditor.getState();
    if (pathRecord || previewing || renderDriver.active) return;
    const objId = lastAdded.id;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = () => {
      const cam = editorCapture.camera;
      const controls = controlsRef.current;
      if (cam && controls && frameObjectInView(cam, controls, objId, "nudge")) return;
      if (retry++ < 3) timer = setTimeout(attempt, 350);
    };
    timer = setTimeout(attempt, 420);
    return () => { if (timer) clearTimeout(timer); };
  }, [lastAddedN]);

  /* ------------------------------ actions ------------------------------ */

  async function onScreenshot(): Promise<void> {
    await takeScreenshot();
    haptic(18);
    toast.success("Screenshot saved", { description: "Helpers hidden — clean capture. Copied to clipboard too (if supported)." });
  }

  const openLongPressMenu = useCallback(() => {
    setPanel("add");
  }, [setPanel]);

  function frameSelected(): void {
    if (!selectedId) return;
    const cam = editorCapture.camera;
    const controls = controlsRef.current;
    if (!cam || !controls) return;
    frameObjectInView(cam, controls, selectedId, "focus");
    sfx.play("tick", { vol: 0.35 });
  }

  async function onExportFile(): Promise<void> {
    const project = useEditor.getState().project;
    await exportProjectFile(project);
    toast.success("Project exported", { description: `${project.name}.3dfy — send it to any phone.` });
  }

  /* --------------------------- keyboard shorts --------------------------- */

  useEffect(() => {
    if (!isDesktop) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const store = useEditor.getState();
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;

      if (mod && k === "z") {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if (mod && k === "y") { e.preventDefault(); redo(); return; }
      if (mod && k === "d") { e.preventDefault(); if (store.selectedId) duplicateObject(store.selectedId); return; }
      if (mod && k === "s") { e.preventDefault(); void onExportFile(); return; }

      switch (k) {
        // WASD / Space / Shift are consumed by the fly camera (see fly.ts)
        case "g": setGizmo("translate"); sfx.play("tick", { vol: 0.3 }); break;
        case "r":
          if (e.shiftKey) {
            if (store.pathRecord) stopPathRecord(); else startPathRecord();
          } else {
            setGizmo("rotate");
          }
          sfx.play("tick", { vol: 0.3 });
          break;
        case "e": setGizmo("scale"); sfx.play("tick", { vol: 0.3 }); break;
        case "n": setPanel(store.panel === "add" ? null : "add"); break;
        case "i":
          if (store.selectedId) setPanel(store.panel === "inspector" ? null : "inspector");
          break;
        case "t": setDirector(!store.director); break;
        case "c": toggleLook(); break;
        case "k": captureKeyframe(); break;
        case "enter": togglePlay(); break;
        case "v": setPanel("render"); break;
        case "p": void onScreenshot(); break;
        case "f": frameSelected(); break;
        case "h": updateWorld({ grid: !store.project.world.grid }); break;
        case "?": case "/": setShortcutsOpen(true); break;
        case "x": case "delete": case "backspace":
          if (store.selectedId) { deleteObject(store.selectedId); sfx.play("break", { vol: 0.4 }); }
          break;
        case "escape":
          if (store.panel) setPanel(null);
          else select(null);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDesktop, undo, redo, setGizmo, setPanel, setDirector, select, deleteObject, duplicateObject, updateWorld, toggleLook]);

  /* --------------------------- first-use hint --------------------------- */

  useEffect(() => {
    const id = requestAnimationFrame(() => setHintOpen(window.localStorage.getItem("3dfy.editor.hint2") !== "1"));
    return () => cancelAnimationFrame(id);
  }, []);

  const closeHint = () => {
    window.localStorage.setItem("3dfy.editor.hint2", "1");
    setHintOpen(false);
  };

  /* ------------------------------- render ------------------------------- */

  const toolBtn = (
    mode: typeof gizmo,
    icon: React.ReactNode,
    label: string,
    hotkey: string,
  ) => (
    <button
      aria-label={label}
      title={`${label} (${hotkey})`}
      onClick={() => { setGizmo(mode); sfx.play("tick", { vol: 0.35 }); }}
      className={`flex size-11 items-center justify-center rounded-xl transition-all active:scale-90 md:size-10 md:rounded-lg ${
        gizmo === mode && selectedId ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" : "bg-elevated text-secondary-foreground hover:bg-secondary"
      }`}
    >
      {icon}
    </button>
  );

  return (
    <div
      className="fixed inset-0 select-none overflow-hidden bg-background"
      onPointerDown={() => sfx.unlock()}
    >
      <Scene onLongPressGround={openLongPressMenu} />

      {!ready && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-panel px-8 py-6">
            <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm font-semibold">Opening project…</p>
          </div>
        </div>
      )}

      {/* ------------------------------ top bar ------------------------------ */}
      <header
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-1.5 px-2.5 py-2 md:px-3"
        style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
      >
        <div className="pointer-events-auto flex items-center gap-1.5">
          <Link
            href={homeHref}
            aria-label="Back to projects"
            className="flex size-10 items-center justify-center rounded-lg border border-border bg-panel/90 text-foreground shadow-sm backdrop-blur transition-transform active:scale-95"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <button
            onClick={() => setPanel(panel === "menu" ? null : "menu")}
            className="flex h-10 max-w-[34vw] items-center gap-2 rounded-lg border border-border bg-panel/90 px-3.5 shadow-sm backdrop-blur transition-transform active:scale-95"
          >
            <span className="truncate font-display text-sm font-semibold">{projectName}</span>
          </button>
        </div>

        <div className="pointer-events-auto ml-auto flex items-center gap-1.5">
          {isWorld && ready && (
            <span className="hidden items-center gap-1 rounded-lg border border-border bg-panel/70 px-2 py-1.5 text-[10px] font-semibold text-muted-foreground md:flex">
              <Globe2 className="size-3 text-primary" />
              {worldStats.loaded} chunks{worldStats.pending > 0 ? ` · +${worldStats.pending}` : ""} · {Math.round(worldStats.alt)}m
            </span>
          )}
          {isTouch && (
            <button
              onClick={toggleFly}
              aria-label={flyOn ? "Hide fly controls" : "Show fly controls"}
              title={flyOn ? "Hide fly controls" : "Show fly controls"}
              className={`flex size-10 items-center justify-center rounded-lg border transition-transform active:scale-95 ${
                flyOn ? "border-primary/50 bg-primary/15 text-primary" : "border-border bg-panel/90 text-secondary-foreground"
              }`}
            >
              <Gamepad2 className="size-4.5" />
            </button>
          )}
          {!isTouch && (
            <button
              onClick={toggleLook}
              aria-label={lookOn ? "Hand-look mode on" : "Hand-look mode off"}
              title={lookOn ? "Hand-look: drag empty space to look (Minecraft style) — C to toggle" : "Hand-look off — classic orbit — C to toggle"}
              className={`flex size-10 items-center justify-center rounded-lg border transition-transform active:scale-95 ${
                lookOn ? "border-primary/50 bg-primary/15 text-primary" : "border-border bg-panel/90 text-secondary-foreground"
              }`}
            >
              <Hand className="size-4.5" />
            </button>
          )}
          {isWorld && (
            <TopBtn label="World settings" onClick={() => setPanel(panel === "worldstage" ? null : "worldstage")}>
              <Globe2 className="size-4.5" />
            </TopBtn>
          )}
          <TopBtn label="Undo (Ctrl+Z)" disabled={!canUndo} onClick={() => { undo(); sfx.play("tick"); }} className="hidden sm:flex"><Undo2 className="size-4.5" /></TopBtn>
          <TopBtn label="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={() => { redo(); sfx.play("tick"); }} className="hidden sm:flex"><Redo2 className="size-4.5" /></TopBtn>
          {savedAt > 0 && (
            <span
              title={`Autosaved ${new Date(savedAt).toLocaleTimeString()}`}
              className="hidden items-center gap-1 rounded-lg border border-border bg-panel/70 px-2 py-1.5 text-[10px] font-semibold text-muted-foreground md:flex"
            >
              <CircleCheckBig className="size-3 text-emerald-400" />
              Saved
            </span>
          )}
          <span className="mx-0.5 hidden h-5 w-px bg-border sm:block" />
          <TopBtn label="Screenshot (P) — helpers hidden" onClick={() => void onScreenshot()}><Camera className="size-4.5" /></TopBtn>
          <button
            onClick={() => { setPanel("render"); sfx.play("tick"); }}
            aria-label="Render video (V)"
            title="Render video (V)"
            className="flex h-10 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-transform active:scale-95"
          >
            <Film className="size-4" />
            <span className="hidden sm:inline">Render</span>
          </button>
          <TopBtn label="More" onClick={() => setPanel(panel === "menu" ? null : "menu")}><MoreVertical className="size-4.5" /></TopBtn>
        </div>
      </header>

      <PathRecordBanner />

      {/* Minecraft-style crosshair + hint while the pointer is locked */}
      <LookOverlay locked={locked} />

      {/* ------------------- first-time director-mode coach ------------------- */}
      {director && directorHint && !pathRecord && (
        <div className="pointer-events-auto absolute left-1/2 top-16 z-30 w-[min(92vw,26rem)] -translate-x-1/2 rounded-xl border border-primary/40 bg-panel/95 p-3.5 shadow-2xl backdrop-blur">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold">
            <Clapperboard className="size-4 text-primary" /> Director mode — camera magic
          </p>
          <ol className="mb-2.5 list-inside list-decimal space-y-0.5 text-[11px] leading-relaxed text-muted-foreground">
            <li>Fly the camera — <b className="text-foreground">WASD + Space/Shift</b> (or the on-screen pad on phones)</li>
            <li>Tap <b className="text-foreground">◆</b> to drop keyframes where you want the shot to go</li>
            <li>Hit <b className="text-foreground">▶</b> to preview the camera flight</li>
            <li><b className="text-foreground">Render</b> → frame-perfect MP4 video</li>
          </ol>
          <p className="mb-2 text-[10px] text-muted-foreground">
            Tip: press <b className="text-foreground">REC</b> and just fly — keyframes drop automatically (replay-mod style).
          </p>
          <button
            onClick={closeDirectorHint}
            className="h-8 w-full rounded-lg bg-primary text-xs font-bold text-primary-foreground transition-transform active:scale-95"
          >
            Got it
          </button>
        </div>
      )}

      {/* ------------------------ empty-scene hint ------------------------ */}
      {ready && objects.length === 0 && !panel && (
        <div className="pointer-events-none absolute inset-x-0 bottom-28 z-10 flex justify-center px-6 md:bottom-24">
          <p className="rounded-full border border-border bg-panel/85 px-4 py-2 text-center text-[11px] font-semibold text-muted-foreground shadow-lg backdrop-blur">
            {isWorld
              ? <>Tap <b className="text-primary">+</b> to add your first object · long-press the <b className="text-foreground">terrain</b> to place it exactly</>
              : <>Tap <b className="text-primary">+</b> to add your first object · long-press the ground to place it exactly</>}
          </p>
        </div>
      )}

      {/* ------------------------ mobile fly touch pad ------------------------ */}
      {!isDesktop && flyOn && ready && !selectedObj && !panel && (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 15 }}>
          <div
            className="pointer-events-none absolute inset-x-0"
            style={{ bottom: director ? "calc(4.4rem + env(safe-area-inset-bottom))" : "calc(5.4rem + env(safe-area-inset-bottom))" }}
          >
            <FlyTouchPad compact />
          </div>
        </div>
      )}

      {/* --------------------------- desktop tool rail --------------------------- */}
      {isDesktop && (
        <div
          className="pointer-events-auto absolute left-3 z-20 flex flex-col gap-1 rounded-xl border border-border bg-panel/90 p-1.5 shadow-xl backdrop-blur"
          style={{ top: "50%", transform: "translateY(-50%)" }}
        >
          {toolBtn("translate", <Move3d className="size-5" />, "Move", "G")}
          {toolBtn("rotate", <RotateCcw className="size-5" />, "Rotate", "R")}
          {toolBtn("scale", <Scale3d className="size-5" />, "Scale", "E")}
          <span className="my-0.5 h-px bg-border" />
          <RailBtn icon={<Plus className="size-5" />} label="Add object" hotkey="N" onClick={() => setPanel(panel === "add" ? null : "add")} active={panel === "add"} />
          <RailBtn icon={<Clapperboard className="size-5" />} label="Director mode" hotkey="T" onClick={() => setDirector(!director)} active={director} />
          {isWorld ? (
            <RailBtn icon={<Globe2 className="size-5" />} label="World settings" onClick={() => setPanel("worldstage")} active={panel === "worldstage"} />
          ) : (
            <>
              <RailBtn icon={<Palette className="size-5" />} label="World theme" onClick={() => setPanel("theme")} active={panel === "theme"} />
              <RailBtn icon={<Lightbulb className="size-5" />} label="Lights & world" onClick={() => setPanel("world")} active={panel === "world"} />
            </>
          )}
          <RailBtn
            icon={<SlidersHorizontal className="size-5" />}
            label={selectedId ? "Inspector" : "Inspector (select an object first)"}
            hotkey="I"
            disabled={!selectedId}
            onClick={() => setPanel(panel === "inspector" ? null : "inspector")}
            active={panel === "inspector"}
          />
          <span className="my-0.5 h-px bg-border" />
          <RailBtn icon={<HelpCircle className="size-5" />} label="Shortcuts (?)" onClick={() => setShortcutsOpen(true)} />
        </div>
      )}

      {/* --------------------------- desktop inspector dock --------------------------- */}
      {isDesktop && panel === "inspector" && selectedId && (
        <InspectorDock onClose={() => { setPanel(null); select(null); }} />
      )}

      {/* --------------------------- mobile toolbar --------------------------- */}
      {!isDesktop && !director && (
        <div
          className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-center gap-1.5 px-3"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <div className="flex items-center gap-1 rounded-2xl border border-border bg-panel/95 p-1.5 shadow-xl backdrop-blur">
            {toolBtn("translate", <Move3d className="size-5" />, "Move", "G")}
            {toolBtn("rotate", <RotateCcw className="size-5" />, "Rotate", "R")}
            {toolBtn("scale", <Scale3d className="size-5" />, "Scale", "E")}
            <span className="mx-0.5 h-6 w-px bg-border" />
            <RailBtn icon={<Clapperboard className="size-5" />} label="Director mode" onClick={() => setDirector(true)} active={director} />
          </div>
          <button
            onClick={() => setPanel("add")}
            aria-label="Add object"
            className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-xl shadow-primary/30 transition-transform active:scale-95"
          >
            <Plus className="size-6" />
          </button>
        </div>
      )}

      {/* ---------------------- mobile selection action strip ---------------------- */}
      {!isDesktop && selectedObj && !director && (
        <div
          className="absolute inset-x-0 z-20 flex justify-center px-3"
          style={{ bottom: "calc(4.6rem + env(safe-area-inset-bottom))" }}
        >
          <div className="flex max-w-full items-center gap-1 rounded-2xl border border-border bg-panel/95 px-1.5 py-1.5 shadow-xl backdrop-blur">
            <span className="max-w-28 truncate px-1.5 text-xs font-bold">{selectedObj.name}</span>
            <button
              onClick={() => { setPanel("inspector"); sfx.play("tick"); }}
              className="flex h-9 items-center gap-1 rounded-xl bg-primary px-3 text-[11px] font-bold text-primary-foreground transition-transform active:scale-95"
            >
              <SlidersHorizontal className="size-3.5" /> Edit
            </button>
            <button
              onClick={frameSelected}
              aria-label="Frame object in view"
              className="flex size-9 items-center justify-center rounded-xl bg-elevated text-secondary-foreground transition-transform active:scale-90"
            >
              <Crosshair className="size-4" />
            </button>
            <button
              onClick={() => { duplicateObject(selectedObj.id); sfx.play("chime", { vol: 0.5 }); }}
              aria-label="Duplicate"
              className="flex size-9 items-center justify-center rounded-xl bg-elevated text-secondary-foreground transition-transform active:scale-90"
            >
              <Copy className="size-4" />
            </button>
            <button
              onClick={() => { deleteObject(selectedObj.id); sfx.play("break", { vol: 0.4 }); haptic(20); }}
              aria-label="Delete"
              className="flex size-9 items-center justify-center rounded-xl bg-destructive/15 text-destructive transition-transform active:scale-90"
            >
              <Trash2 className="size-4" />
            </button>
            <button
              onClick={() => select(null)}
              aria-label="Deselect"
              className="flex size-9 items-center justify-center rounded-xl bg-elevated text-secondary-foreground transition-transform active:scale-90"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------ timeline ------------------------------ */}
      <div
        className={`absolute inset-x-0 z-20 ${director ? "" : "hidden md:block"}`}
        style={{ bottom: 0 }}
      >
        <TimelineDock onExpand={() => setPanel("director")} />
      </div>
      {!isDesktop && director && (
        <button
          onClick={() => setDirector(false)}
          className="absolute right-3 z-20 flex h-9 items-center gap-1.5 rounded-lg border border-border bg-panel/95 px-3 text-[11px] font-bold backdrop-blur"
          style={{ bottom: "calc(3.6rem + env(safe-area-inset-bottom))" }}
        >
          <MousePointer2 className="size-3.5" /> Exit director
        </button>
      )}

      {/* ---------------------------- first-use hint ---------------------------- */}
      {hintOpen && ready && (
        <div
          className="absolute left-1/2 z-20 w-[min(92vw,26rem)] -translate-x-1/2 rounded-xl border border-border bg-panel/95 px-4 py-3 shadow-xl backdrop-blur"
          style={{ top: "max(4.2rem, calc(env(safe-area-inset-top) + 3.9rem))" }}
        >
          <p className="text-center text-[11px] font-medium leading-relaxed text-muted-foreground">
            {isDesktop ? (
              <>
                {isWorld
                  ? <>Infinite world · <b className="text-foreground">WASD</b> fly · <b className="text-foreground">Hand</b>/drag to look · long-press terrain to place objects ·</>
                  : <>Click an object to select · drag the gizmo to transform ·</>}{" "}
                <b className="text-foreground">G / R / E</b> tools · <b className="text-foreground">T</b> camera timeline · <b className="text-foreground">C</b> hand-look
              </>
            ) : (
              <>
                {isWorld
                  ? <>Fly with the pad · drag empty space to look · long-press the terrain to place objects</>
                  : <>Tap an object to select it · buttons above transform it · drag empty space to orbit ·
                    long-press the ground to add things</>}
              </>
            )}
          </p>
          <button onClick={closeHint} className="mt-1.5 block w-full text-center text-[11px] font-bold text-primary hover:underline">
            Got it
          </button>
        </div>
      )}

      {/* ------------------------------ panels ------------------------------ */}
      <AddMenuPanel
        open={panel === "add"}
        onOpenChange={(v) => {
          if (!v && useEditor.getState().panel === "add") setPanel(null);
        }}
      />
      {!isDesktop && (
        <InspectorPanel open={panel === "inspector" && selectedId !== null} onOpenChange={(v) => setPanel(v ? "inspector" : null)} />
      )}
      <DirectorPanel open={panel === "director"} onOpenChange={(v) => setPanel(v ? "director" : null)} />
      <RenderDialog open={panel === "render"} onOpenChange={(v) => setPanel(v ? "render" : null)} />
      {isWorld ? (
        <WorldStagePanel open={panel === "worldstage"} onOpenChange={(v) => setPanel(v ? "worldstage" : null)} />
      ) : (
        <>
          <ThemePanel open={panel === "theme"} onOpenChange={(v) => setPanel(v ? "theme" : null)} />
          <WorldPanel open={panel === "world"} onOpenChange={(v) => setPanel(v ? "world" : null)} />
        </>
      )}
      <MenuPanel open={panel === "menu"} onOpenChange={(v) => setPanel(v ? "menu" : null)} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      {/* footer credit — tucked into the more-menu on mobile, rail bottom on desktop */}
      {isDesktop && (
        <div className="pointer-events-none absolute bottom-[4.6rem] left-3 z-10 hidden select-none text-[9px] text-muted-foreground/40 xl:block">
          Made by Naman
        </div>
      )}
    </div>
  );
}

function TopBtn({
  children, label, onClick, disabled, className,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex size-11 items-center justify-center rounded-xl border border-border bg-panel/90 text-foreground shadow-sm backdrop-blur transition-all hover:bg-elevated active:scale-90 disabled:opacity-35 sm:size-10 sm:rounded-lg ${className ?? ""}`}
    >
      {children}
    </button>
  );
}
