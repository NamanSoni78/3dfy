"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { toast } from "sonner";
import {
  Clapperboard, Circle, CircleStop, Download, Film, Play, Plus, Radio, Share2,
  Square, Trash2, X,
} from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useEditor } from "@/lib/editor/store";
import { MAX_DURATION } from "@/lib/editor/store";
import { EASES, sampleCamera, sortedKeyframes } from "@/lib/editor/keyframes";
import {
  editorCapture, playback, renderVideo, shareBlob, offlineRenderSupported, liveCaptureSupported,
  LiveRecorder, VIDEO_FPS, VIDEO_RESOLUTIONS, RENDER_QUALITIES,
  formatBytes, type RenderProgress, type RenderResult,
} from "@/lib/editor/render";
import { controlsRef, worldRuntime } from "@/lib/editor/runtime";
import { sfx, haptic } from "@/lib/audio";
import { downloadBlob, uid } from "@/lib/storage";
import { ChipRow, SliderRow, SwitchRow } from "../ui-bits";
import type { EaseId, Keyframe } from "@/lib/editor/types";

/* --------------------------- duration formatting --------------------------- */

function formatTimelineLen(v: number): string {
  if (v < 60) return `${v.toFixed(1)}s`;
  const m = Math.floor(v / 60);
  const s = Math.round(v % 60);
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

const DURATION_CHIPS: { v: number; label: string }[] = [
  { v: 6, label: "6s" },
  { v: 15, label: "15s" },
  { v: 30, label: "30s" },
  { v: 60, label: "1m" },
  { v: 120, label: "2m" },
  { v: 300, label: "5m" },
  { v: MAX_DURATION, label: "10m" },
];

/* ------------------------------ shared actions ----------------------------- */

export function captureKeyframe(): void {
  const cap = editorCapture;
  const controls = controlsRef.current;
  if (!cap.camera) return;
  const cam = cap.camera;
  const target = controls?.target ?? new THREE.Vector3(0, 1, 0);
  const { project } = useEditor.getState();
  const kfs = sortedKeyframes(project.keyframes);
  const lastT = kfs.length ? kfs[kfs.length - 1].t : -1;
  const scrubbed = playback.t > lastT + 0.25;
  let t: number;
  if (kfs.length === 0) t = 0;
  else if (scrubbed) t = Math.round(Math.min(project.duration, playback.t) * 10) / 10;
  else t = Math.round(Math.min(project.duration, lastT + 1) * 10) / 10;
  const existing = kfs.find((k) => Math.abs(k.t - t) < 0.13);
  const kf: Keyframe = {
    id: existing?.id ?? uid(),
    t: existing ? existing.t : t,
    position: [cam.position.x, cam.position.y, cam.position.z],
    target: [target.x, target.y, target.z],
    ease: existing?.ease ?? "easeInOut",
  };
  useEditor.getState().addKeyframe(kf);
  sfx.play("chime", { vol: 0.5 });
  haptic(12);
  toast.success(existing ? "Keyframe updated" : `Keyframe ${kfs.length + 1} added`, {
    description: "Move the camera, then add the next one.",
  });
}

export function previewTime(t: number): void {
  const cap = editorCapture;
  if (!cap.camera) return;
  playback.playing = false;
  playback.t = t;
  const kfs = useEditor.getState().project.keyframes;
  const sample = { position: new THREE.Vector3(), target: new THREE.Vector3() };
  sampleCamera(kfs, t, sample);
  cap.camera.position.copy(sample.position);
  const controls = controlsRef.current as { target: THREE.Vector3; update?: () => void } | null;
  if (controls) {
    controls.target.copy(sample.target);
    controls.update?.();
  }
  cap.camera.lookAt(sample.target);
}

export function togglePlay(): void {
  const kfs = useEditor.getState().project.keyframes;
  if (sortedKeyframes(kfs).length < 2) {
    toast.error("Add at least 2 keyframes first", { description: "Or record a path — it's faster." });
    return;
  }
  if (playback.playing) {
    playback.playing = false;
  } else {
    const { project } = useEditor.getState();
    playback.speed = 1;
    if (playback.t >= project.duration - 0.01) playback.t = 0;
    playback.playing = true;
    sfx.play("recStart", { vol: 0.4 });
  }
}

export function startPathRecord(): void {
  const store = useEditor.getState();
  playback.playing = false;
  store.setPathRecord(true);
  sfx.play("recStart");
  haptic(16);
}

export function stopPathRecord(): void {
  useEditor.getState().setPathRecord(false);
  playback.t = 0;
  sfx.play("recStop");
  haptic(12);
}

/* -------------------------------- timeline --------------------------------- */

function usePlayhead() {
  const [state, setState] = useState({ playing: false, t: 0, recording: false });
  useEffect(() => {
    const id = setInterval(() =>
      setState({ playing: playback.playing, t: playback.t, recording: useEditor.getState().pathRecord }), 100);
    return () => clearInterval(id);
  }, []);
  return state;
}

/** Compact scrub strip — always visible on desktop, expandable on mobile. */
export function TimelineDock({ onExpand }: { onExpand: () => void }) {
  const keyframes = useEditor((s) => s.project.keyframes);
  const duration = useEditor((s) => s.project.duration);
  const deleteKeyframe = useEditor((s) => s.deleteKeyframe);
  const pathRecord = useEditor((s) => s.pathRecord);
  const { playing, t } = usePlayhead();
  const kfs = useMemo(() => sortedKeyframes(keyframes), [keyframes]);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const scrubTo = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      previewTime(pct * duration);
    },
    [duration],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => dragging.current && scrubTo(e.clientX);
    const onUp = () => (dragging.current = false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [scrubTo]);

  return (
    <div className="flex items-center gap-1.5 border-t border-border bg-panel/95 px-2 py-2 backdrop-blur md:gap-3 md:px-3" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
      {/* play / stop */}
      <button
        onClick={togglePlay}
        aria-label={playing ? "Stop playback" : "Play camera path"}
        className={`flex size-11 shrink-0 items-center justify-center rounded-xl transition-all active:scale-90 md:size-9 md:rounded-lg ${
          playing ? "bg-destructive/90 text-white" : "bg-elevated text-foreground hover:bg-secondary"
        }`}
      >
        {playing ? <Square className="size-4" /> : <Play className="size-4" />}
      </button>

      {/* scrub track */}
      <div
        ref={trackRef}
        role="slider"
        aria-label="Timeline scrub"
        aria-valuenow={Math.round(t * 10) / 10}
        aria-valuemin={0}
        aria-valuemax={duration}
        className="relative h-11 flex-1 cursor-pointer touch-none select-none rounded-xl border border-border bg-secondary/50 md:h-9"
        onPointerDown={(e) => {
          dragging.current = true;
          scrubTo(e.clientX);
        }}
      >
        {/* track ticks */}
        <div className="absolute inset-x-2 top-1/2 h-px -translate-y-1/2 bg-border" />
        {kfs.map((k) => (
          <button
            key={k.id}
            aria-label={`Keyframe at ${k.t}s`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              previewTime(k.t);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              deleteKeyframe(k.id);
              sfx.play("tick");
            }}
            title={`${k.t.toFixed(1)}s — right-click to delete`}
            className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] border border-white/80 bg-primary shadow transition-transform hover:scale-125"
            style={{ left: `calc(${(k.t / duration) * 100}% )` }}
          />
        ))}
        {/* playhead */}
        <div
          className="pointer-events-none absolute inset-y-0.5 w-0.5 rounded bg-[#b9a8ff]"
          style={{ left: `${(t / duration) * 100}%` }}
        />
        {/* time */}
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold tabular-nums text-muted-foreground">
          {t.toFixed(1)} / {duration.toFixed(1)}s
        </span>
      </div>

      {/* add keyframe */}
      <button
        onClick={captureKeyframe}
        aria-label="Add keyframe at current camera"
        title="Add keyframe (K)"
        className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-elevated text-foreground transition-all hover:bg-secondary active:scale-90 md:size-9 md:rounded-lg"
      >
        <Plus className="size-4" />
      </button>

      {/* record path */}
      <button
        onClick={() => (pathRecord ? stopPathRecord() : startPathRecord())}
        aria-label="Record camera path"
        title="Record path — fly the camera, keyframes drop automatically"
        className={`flex h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[11px] font-bold transition-all active:scale-95 md:h-9 md:rounded-lg md:px-2.5 ${
          pathRecord
            ? "bg-destructive text-white"
            : "bg-destructive/15 text-destructive hover:bg-destructive/25"
        }`}
      >
        <span className="rec-dot size-2 rounded-full bg-destructive" />
        REC
      </button>

      {/* expand (full manager) */}
      <button
        onClick={onExpand}
        aria-label="Open keyframe manager"
        className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-elevated px-3 text-[11px] font-bold text-foreground transition-all hover:bg-secondary active:scale-95 md:h-9 md:rounded-lg md:px-2.5"
      >
        <Clapperboard className="size-4" />
        <span className="hidden sm:inline">{kfs.length} kf</span>
      </button>
    </div>
  );
}

/* --------------------------- path record banner ---------------------------- */

export function PathRecordBanner() {
  const pathRecord = useEditor((s) => s.pathRecord);
  const kfCount = useEditor((s) => s.project.keyframes.length);
  if (!pathRecord) return null;
  return (
    <div
      className="pointer-events-auto absolute left-1/2 z-30 flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-destructive/40 bg-[#2a1215]/95 px-4 py-2 shadow-xl backdrop-blur"
      style={{ top: "max(4.2rem, calc(env(safe-area-inset-top) + 3.9rem))" }}
    >
      <span className="rec-dot size-2.5 shrink-0 rounded-full bg-destructive" />
      <p className="whitespace-nowrap text-xs font-bold">
        REC · fly the camera <span className="text-muted-foreground">({kfCount} kf)</span>
      </p>
      <button
        onClick={stopPathRecord}
        className="rounded-full bg-destructive px-3 py-1 text-[11px] font-bold text-white transition-transform active:scale-95"
      >
        Done
      </button>
    </div>
  );
}

/* ----------------------------- director sheet ------------------------------ */

export function DirectorPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const project = useEditor((s) => s.project);
  const addKeyframe = useEditor((s) => s.addKeyframe);
  const updateKeyframe = useEditor((s) => s.updateKeyframe);
  const deleteKeyframe = useEditor((s) => s.deleteKeyframe);
  const clearKeyframes = useEditor((s) => s.clearKeyframes);
  const setDuration = useEditor((s) => s.setDuration);
  const setPanel = useEditor((s) => s.setPanel);
  const pathRecord = useEditor((s) => s.pathRecord);
  const { t } = usePlayhead();
  const [loop, setLoop] = useState(false);

  const kfs = useMemo(() => sortedKeyframes(project.keyframes), [project.keyframes]);

  function goTo(kf: Keyframe): void {
    previewTime(kf.t);
    sfx.play("tick");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-h-[86dvh] overflow-y-auto rounded-t-2xl border-border bg-panel sm:max-w-xl pro-scroll">
        <SheetHeader className="pb-1">
          <SheetTitle className="flex items-center gap-2 font-display text-base">
            <Clapperboard className="size-4 text-primary" /> Camera director
          </SheetTitle>
          <SheetDescription>
            Record a path by flying the camera, or place keyframes one by one. Then render a frame-perfect video.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-10 pt-3">
          {/* primary actions */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => (pathRecord ? stopPathRecord() : startPathRecord())}
              className={`flex h-14 items-center justify-center gap-2 rounded-xl border text-sm font-bold transition-all active:scale-[0.98] ${
                pathRecord
                  ? "border-destructive/50 bg-destructive/15 text-destructive"
                  : "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
              }`}
            >
              <span className="rec-dot size-2.5 rounded-full bg-destructive" />
              {pathRecord ? "Stop path" : "Record path"}
            </button>
            <button
              onClick={captureKeyframe}
              className="flex h-14 items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 text-sm font-bold text-primary transition-all hover:bg-primary/20 active:scale-[0.98]"
            >
              <Plus className="size-4" /> Add keyframe
            </button>
          </div>

          {kfs.length === 0 && (
            <div className="space-y-2 rounded-xl border border-border bg-secondary/40 p-4 text-center">
              <p className="text-xs font-semibold leading-relaxed text-muted-foreground">
                Fastest way to a movie: tap <b className="text-destructive">Record path</b>, fly the camera where you
                want it to go, tap <b>Done</b> — keyframes drop automatically.
              </p>
              <p className="text-[10px] leading-relaxed text-muted-foreground/70">
                Manual way: move camera → <b>Add keyframe</b> → repeat.
              </p>
            </div>
          )}

          {/* playback row */}
          {kfs.length >= 2 && (
            <div className="flex items-center gap-2">
              <Button
                onClick={togglePlay}
                variant={playback.playing ? "destructive" : "secondary"}
                className="h-11 gap-2 rounded-lg px-5 text-xs font-bold"
              >
                {playback.playing ? <CircleStop className="size-4" /> : <Circle className="size-4 fill-current" />}
                {playback.playing ? "Stop" : "Play"}
              </Button>
              <div className="flex-1 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-center text-xs font-bold tabular-nums text-muted-foreground">
                {t.toFixed(1)}s / {project.duration.toFixed(1)}s · {kfs.length} keyframes
              </div>
            </div>
          )}

          <SliderRow
            label="Timeline duration"
            value={project.duration}
            min={2}
            max={MAX_DURATION}
            step={1}
            onChange={setDuration}
            format={formatTimelineLen}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            {DURATION_CHIPS.map((c) => (
              <button
                key={c.v}
                onClick={() => setDuration(c.v)}
                className={`h-7 rounded-lg border px-2.5 text-[10px] font-bold transition-colors ${
                  Math.abs(project.duration - c.v) < 0.01
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          <SwitchRow
            label="Loop preview playback"
            checked={loop}
            onChange={(v) => { setLoop(v); playback.loop = v; }}
          />

          {/* keyframe list */}
          {kfs.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Keyframes</Label>
                {kfs.length > 0 && (
                  <button
                    onClick={() => { clearKeyframes(); sfx.play("break", { vol: 0.4 }); }}
                    className="text-[11px] font-semibold text-destructive hover:underline"
                  >
                    Clear all
                  </button>
                )}
              </div>
              <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1 pro-scroll">
                {kfs.map((k, i) => (
                  <div key={k.id} className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-2 py-1.5">
                    <span className="w-4 text-center text-[10px] font-bold text-muted-foreground">{i + 1}</span>
                    <Input
                      type="number"
                      value={k.t}
                      min={0}
                      max={project.duration}
                      step={0.1}
                      onChange={(e) => updateKeyframe(k.id, { t: Math.max(0, Math.min(project.duration, Number(e.target.value) || 0)) })}
                      className="h-8 w-16 rounded-md text-center text-[11px] tabular-nums"
                      aria-label={`Keyframe ${i + 1} time`}
                    />
                    <select
                      value={k.ease}
                      onChange={(e) => updateKeyframe(k.id, { ease: e.target.value as EaseId })}
                      className="h-8 flex-1 rounded-md border border-border bg-background px-1.5 text-[10px] font-semibold"
                      aria-label="Ease"
                    >
                      {EASES.map((es) => (
                        <option key={es.id} value={es.id}>{es.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => goTo(k)}
                      className="h-8 shrink-0 rounded-md bg-elevated px-2 text-[10px] font-bold transition-transform active:scale-95"
                      aria-label="Go to keyframe"
                    >
                      GO
                    </button>
                    <button
                      onClick={() => { deleteKeyframe(k.id); sfx.play("tick"); }}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-destructive transition-transform active:scale-90"
                      aria-label="Delete keyframe"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* render CTA */}
          <Button
            onClick={() => setPanel("render")}
            className="h-12 w-full gap-2 rounded-xl text-sm font-bold shadow-lg shadow-primary/20"
          >
            <Film className="size-4" /> Render video
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------- render dialog ------------------------------ */

export function RenderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const project = useEditor((s) => s.project);
  const setPanel = useEditor((s) => s.setPanel);
  const setPathRecord = useEditor((s) => s.setPathRecord);
  const select = useEditor((s) => s.select);
  const setPreviewing = useEditor((s) => s.setPreviewing);

  const [res, setRes] = useState<string>("720p");
  const [fps, setFps] = useState<(typeof VIDEO_FPS)[number]>(30);
  const [quality, setQuality] = useState<string>("high");
  const [speed, setSpeed] = useState(1);
  const [loops, setLoops] = useState(1);

  const [phase, setPhase] = useState<"setup" | "rendering" | "done" | "error">("setup");
  const [progress, setProgress] = useState<RenderProgress | null>(null);
  const [result, setResult] = useState<RenderResult | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const kfs = useMemo(() => sortedKeyframes(project.keyframes), [project.keyframes]);
  const offlineOk = offlineRenderSupported();
  const liveOk = liveCaptureSupported();

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      setResultUrl(null);
      setResult(null);
      setPhase("setup");
      setProgress(null);
    }
  }, [open, resultUrl]);

  function matchViewport(): { w: number; h: number } {
    const gl = editorCapture.gl;
    if (!gl) return { w: 1280, h: 720 };
    const size = gl.getSize(new THREE.Vector2());
    const dpr = gl.getPixelRatio();
    const w = Math.max(320, Math.round(size.x * dpr));
    const h = Math.max(240, Math.round(size.y * dpr));
    return { w: w - (w % 2), h: h - (h % 2) };
  }

  async function startRender(): Promise<void> {
    const q = RENDER_QUALITIES.find((x) => x.id === quality) ?? RENDER_QUALITIES[2];
    const dims = res === "match" ? matchViewport() : (() => {
      const r = VIDEO_RESOLUTIONS.find((x) => x.id === res) ?? VIDEO_RESOLUTIONS[1];
      return { w: r.w, h: r.h };
    })();

    setPhase("rendering");
    setProgress({ frame: 0, total: 0, phase: "prepare", etaSec: 0 });

    const hadSelection = useEditor.getState().selectedId;
    select(null); // no outlines/gizmo in the render
    setPathRecord(false);
    setPreviewing(false);
    await new Promise((r) => setTimeout(r, 80)); // let React unmount helpers

    const ac = new AbortController();
    abortRef.current = ac;

    /* world stage: pre-build every chunk along the camera path so the
       frame-stepped render never pops chunks in mid-video */
    if (project.stage === "world" && worldRuntime.prewarm) {
      const samples: [number, number, number][] = [];
      const samp = { position: new THREE.Vector3(), target: new THREE.Vector3() };
      const n = Math.max(2, Math.ceil(project.duration / 4));
      for (let i = 0; i <= n; i++) {
        const t = Math.min(project.duration - 1e-3, (i / n) * project.duration);
        sampleCamera(project.keyframes, t, samp);
        samples.push([samp.position.x, samp.position.y, samp.position.z]);
      }
      const done = await worldRuntime.prewarm(samples, (p) => {
        setProgress({ frame: Math.round(p * 20), total: 100, phase: "prepare", etaSec: 0 });
      });
      if (!done || ac.signal.aborted) {
        setPhase("setup");
        setProgress(null);
        abortRef.current = null;
        return;
      }
    }

    try {
      const out = await renderVideo(
        {
          width: dims.w,
          height: dims.h,
          fps,
          bitrate: q.bitrate,
          speed,
          loops,
          duration: project.duration,
        },
        setProgress,
        ac.signal,
      );
      if (!out) {
        if (ac.signal.aborted) {
          setPhase("setup");
          setProgress(null);
        } else {
          setPhase("error");
        }
      } else {
        setResult(out);
        setResultUrl(URL.createObjectURL(out.blob));
        setPhase("done");
        haptic([10, 30, 10]);
      }
    } catch {
      setPhase("error");
    } finally {
      abortRef.current = null;
      if (hadSelection) select(hadSelection);
    }
  }

  /* live-capture fallback (old browsers): record one realtime pass */
  async function startLiveFallback(): Promise<void> {
    const cap = editorCapture;
    if (!cap.gl) return;
    const dims = matchViewport();
    setPhase("rendering");
    setProgress({ frame: 0, total: Math.round(project.duration * 30), phase: "render", etaSec: 0 });
    const rec = new LiveRecorder();
    const hadSelection = useEditor.getState().selectedId;
    select(null);
    try {
      rec.start(cap.gl.domElement, 30, 12_000_000);
      playback.t = 0;
      playback.speed = speed;
      playback.loop = false;
      playback.playing = true;
      await new Promise<void>((resolve) => {
        playback.onDone = resolve;
      });
      const out = await rec.stop();
      if (out) {
        const blobUrl = URL.createObjectURL(out.blob);
        setResultUrl(blobUrl);
        setResult({
          blob: out.blob, ext: out.ext as "mp4" | "webm", codec: "Live capture",
          width: dims.w, height: dims.h, fps: 30,
          frames: Math.round(project.duration * 30),
          durationSec: project.duration / speed,
          sizeBytes: out.blob.size,
        });
        setPhase("done");
      } else {
        setPhase("error");
      }
    } catch {
      setPhase("error");
    } finally {
      playback.playing = false;
      playback.recording = false;
      if (hadSelection) select(hadSelection);
    }
  }

  function onDownload(): void {
    if (!result) return;
    const stamp = Date.now();
    downloadBlob(result.blob, `3dfy-render-${stamp}.${result.ext}`);
    sfx.play("shutter");
    toast.success("Video saved", { description: `${result.codec} · ${formatBytes(result.sizeBytes)}` });
  }

  async function onShare(): Promise<void> {
    if (!result) return;
    const ok = await shareBlob(result.blob, `3dfy-render.${result.ext}`);
    if (!ok) toast.error("Sharing not supported here", { description: "Use Download instead." });
  }

  const pct = progress && progress.total ? Math.round((progress.frame / progress.total) * 100) : 0;

  return (
    <Sheet open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setPanel(null); }}>
      <SheetContent side="bottom" className="mx-auto max-h-[92dvh] overflow-y-auto rounded-t-2xl border-border bg-panel sm:max-w-xl pro-scroll">
        <SheetHeader className="pb-1">
          <SheetTitle className="flex items-center gap-2 font-display text-base">
            <Film className="size-4 text-primary" /> Render video
          </SheetTitle>
          <SheetDescription>
            Offline, frame-perfect render — every frame is rendered individually, so the output can&apos;t lag or flicker.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-10 pt-3">
          {/* not enough keyframes */}
          {kfs.length < 2 && phase === "setup" && (
            <div className="space-y-3 rounded-xl border border-border bg-secondary/40 p-4 text-center">
              <p className="text-xs font-semibold leading-relaxed text-muted-foreground">
                A video needs a camera path with at least <b>2 keyframes</b>.
                The fastest way: record one while flying the camera.
              </p>
              <Button
                onClick={() => { onOpenChange(false); startPathRecord(); }}
                className="h-11 w-full gap-2 rounded-lg text-xs font-bold"
              >
                <Radio className="size-4" /> Record a camera path
              </Button>
            </div>
          )}

          {/* SETUP */}
          {phase === "setup" && (
            <>
              {!offlineOk && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[11px] leading-relaxed text-amber-300">
                  This browser lacks WebCodecs — the frame-perfect renderer is unavailable.
                  {liveOk ? " Falling back to realtime capture." : " Video export unavailable; use screenshots."}
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Resolution</Label>
                <ChipRow
                  columns={3}
                  value={res}
                  options={VIDEO_RESOLUTIONS.map((r) => ({ id: r.id, label: r.label }))}
                  onSelect={setRes}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Frame rate</Label>
                <ChipRow
                  columns={3}
                  value={String(fps)}
                  options={VIDEO_FPS.map((f) => ({ id: String(f), label: `${f} fps` }))}
                  onSelect={(id) => setFps(Number(id) as (typeof VIDEO_FPS)[number])}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Quality</Label>
                <ChipRow
                  columns={4}
                  value={quality}
                  options={RENDER_QUALITIES.map((q) => ({ id: q.id, label: q.label }))}
                  onSelect={setQuality}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Speed</Label>
                  <ChipRow
                    columns={3}
                    value={String(speed)}
                    options={[{ id: "0.5", label: "0.5×" }, { id: "1", label: "1×" }, { id: "2", label: "2×" }]}
                    onSelect={(id) => setSpeed(Number(id))}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Loops</Label>
                  <ChipRow
                    columns={3}
                    value={String(loops)}
                    options={[{ id: "1", label: "1×" }, { id: "2", label: "2×" }, { id: "3", label: "3×" }]}
                    onSelect={(id) => setLoops(Number(id))}
                  />
                </div>
              </div>

              <p className="text-center text-[10px] leading-relaxed text-muted-foreground">
                Path: {kfs.length} keyframes · {formatTimelineLen(project.duration)} timeline ·
                output ≈ {formatTimelineLen((project.duration / speed) * loops)} video
              </p>

              {(project.duration / speed) * loops > 120 && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center text-[10px] font-semibold text-amber-400">
                  Long timeline — offline renders stay frame-perfect but may take several minutes. Keep this tab focused.
                </p>
              )}

              {offlineOk ? (
                <Button
                  onClick={() => void startRender()}
                  disabled={kfs.length < 2}
                  className="h-12 w-full gap-2 rounded-xl text-sm font-bold shadow-lg shadow-primary/20"
                >
                  <Film className="size-4" /> Render {formatTimelineLen((project.duration / speed) * loops)} video
                </Button>
              ) : (
                <Button
                  onClick={() => void startLiveFallback()}
                  disabled={kfs.length < 2 || !liveOk}
                  className="h-12 w-full gap-2 rounded-xl text-sm font-bold"
                >
                  <Film className="size-4" /> Record realtime pass
                </Button>
              )}
            </>
          )}

          {/* RENDERING */}
          {phase === "rendering" && (
            <div className="space-y-3 py-4">
              <div className="flex items-center justify-center gap-2 text-sm font-bold text-primary">
                <span className="rec-dot size-2.5 rounded-full bg-primary" />
                Rendering frame {progress?.frame ?? 0} / {progress?.total ?? "…"}
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-center text-[11px] text-muted-foreground">
                {progress?.phase === "prepare"
                  ? project.stage === "world"
                    ? "Building world chunks along the camera path…"
                    : "Preparing renderer…"
                  : progress?.phase === "encode"
                    ? "Encoding final frames…"
                    : progress?.etaSec
                      ? `≈ ${Math.ceil(progress.etaSec)}s remaining — you can keep this open`
                      : "Preparing renderer…"}
              </p>
              <Button
                variant="outline"
                className="h-10 w-full rounded-lg text-xs font-bold"
                onClick={() => abortRef.current?.abort()}
              >
                <X className="size-4" /> Cancel render
              </Button>
            </div>
          )}

          {/* DONE */}
          {phase === "done" && result && resultUrl && (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-xl border border-border bg-black">
                { }
                <video src={resultUrl} controls playsInline className="max-h-[46dvh] w-full" />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-3 py-2 text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">{result.codec}</span>
                <span>{result.width}×{result.height} · {result.fps}fps · {formatBytes(result.sizeBytes)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={onDownload} className="h-11 gap-2 rounded-lg text-xs font-bold">
                  <Download className="size-4" /> Download
                </Button>
                <Button variant="secondary" onClick={() => void onShare()} className="h-11 gap-2 rounded-lg text-xs font-bold">
                  <Share2 className="size-4" /> Share
                </Button>
              </div>
              <Button variant="outline" className="h-10 w-full rounded-lg text-xs font-bold" onClick={() => { setPhase("setup"); setResult(null); }}>
                Adjust settings &amp; re-render
              </Button>
            </div>
          )}

          {/* ERROR */}
          {phase === "error" && (
            <div className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-center">
              <p className="text-xs font-semibold text-destructive">Render failed</p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Try a lower resolution or quality — or use the realtime fallback.
              </p>
              <Button variant="outline" className="h-10 w-full rounded-lg text-xs font-bold" onClick={() => setPhase("setup")}>
                Back to settings
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
