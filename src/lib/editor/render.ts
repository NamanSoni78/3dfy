"use client";

import * as THREE from "three";
import type { RootState } from "@react-three/fiber";
import { renderToBlob, copyImageToClipboard } from "@/lib/capture";
import { downloadBlob } from "@/lib/storage";
import { sfx } from "@/lib/audio";
import { stashHelpers, renderDriver } from "./runtime";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  3Dfy render engine
 *  ─────────────────────────────────────────────────────────────────────────
 *  Two pipelines:
 *
 *  1. OFFLINE RENDER (Blender-style, default)
 *     Deterministic, frame-perfect: for every frame we step the R3F loop with
 *     a fixed timestamp (`advance()` under `frameloop="never"`), render, copy
 *     the canvas into a VideoFrame and feed a WebCodecs VideoEncoder. The
 *     muxer (mp4-muxer / webm-muxer) writes a real MP4/WebM. No realtime
 *     dependency → impossible to lag, drop frames or flicker, no matter how
 *     slow the machine renders each frame.
 *
 *  2. LIVE CAPTURE (fallback + playground)
 *     MediaRecorder on the canvas stream — for live physics you interact with
 *     while recording. High bitrate, fixed viewport size (never resized
 *     mid-stream, which is what corrupted output in the old version).
 */

export const editorCapture: {
  gl: THREE.WebGLRenderer | null;
  scene: THREE.Scene | null;
  camera: THREE.PerspectiveCamera | null;
  root: RootState | null;
} = { gl: null, scene: null, camera: null, root: null };

/** Playback runtime shared with the in-canvas camera rig. */
export const playback = {
  t: 0,
  playing: false,
  speed: 1,
  loop: false,
  recording: false,
  /** resolved by the camera rig when playback completes a full pass */
  onDone: null as (() => void) | null,
};

/* ----------------------------- screenshots ------------------------------ */

export async function takeScreenshot(): Promise<void> {
  const { gl, scene, camera } = editorCapture;
  if (!gl || !scene || !camera) return;
  const restore = stashHelpers(); // no gizmo/grid lines in the shot
  try {
    const blob = await renderToBlob(gl, scene, camera);
    if (!blob) return;
    sfx.play("shutter");
    downloadBlob(blob, `3dfy-shot-${Date.now()}.png`);
    await copyImageToClipboard(blob);
  } finally {
    restore();
  }
}

export async function captureThumbDataUrl(): Promise<string | null> {
  const { gl, scene, camera } = editorCapture;
  if (!gl || !scene || !camera) return null;
  const restore = stashHelpers();
  try {
    const { blobToThumb } = await import("@/lib/capture");
    const blob = await renderToBlob(gl, scene, camera, "image/jpeg", 0.75);
    if (!blob) return null;
    return blobToThumb(blob, 320, 0.62);
  } finally {
    restore();
  }
}

/* ---------------------------- live recorder ----------------------------- */

function pickLiveMime(): string | null {
  const candidates = [
    "video/mp4;codecs=avc1.640028",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  if (typeof MediaRecorder === "undefined") return null;
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) ?? null;
}

export function liveCaptureSupported(): boolean {
  return pickLiveMime() !== null;
}

/** Realtime canvas recorder — used by the physics playground. */
export class LiveRecorder {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private mime: string | null = null;

  get supported(): boolean {
    return pickLiveMime() !== null;
  }

  start(canvas: HTMLCanvasElement, fps = 60, bitrate = 16_000_000): void {
    this.mime = pickLiveMime();
    if (!this.mime) throw new Error("Recording not supported in this browser");
    const stream = canvas.captureStream(fps);
    this.chunks = [];
    this.rec = new MediaRecorder(stream, { mimeType: this.mime, videoBitsPerSecond: bitrate });
    this.rec.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data);
    };
    this.rec.start(250);
  }

  get active(): boolean {
    return this.rec?.state === "recording";
  }

  async stop(): Promise<{ blob: Blob; ext: string } | null> {
    const rec = this.rec;
    if (!rec) return null;
    const done = new Promise<Blob>((resolve) => {
      rec.onstop = () => resolve(new Blob(this.chunks, { type: this.mime ?? "video/webm" }));
    });
    if (rec.state !== "inactive") rec.stop();
    const blob = await done;
    this.rec = null;
    if (!blob.size) return null;
    return { blob, ext: (this.mime ?? "").includes("mp4") ? "mp4" : "webm" };
  }
}

/* --------------------------- offline renderer ---------------------------- */

export const VIDEO_RESOLUTIONS = [
  { id: "match", label: "Match viewport", w: 0, h: 0 },
  { id: "720p", label: "720p · 16:9", w: 1280, h: 720 },
  { id: "1080p", label: "1080p · 16:9", w: 1920, h: 1080 },
  { id: "square", label: "Square · 1080", w: 1080, h: 1080 },
  { id: "vertical", label: "Vertical · 1080×1920", w: 1080, h: 1920 },
] as const;

export const VIDEO_FPS = [24, 30, 60] as const;

export const RENDER_QUALITIES = [
  { id: "draft", label: "Draft", bitrate: 4_000_000 },
  { id: "standard", label: "Standard", bitrate: 10_000_000 },
  { id: "high", label: "High", bitrate: 18_000_000 },
  { id: "ultra", label: "Ultra", bitrate: 30_000_000 },
] as const;

export type RenderQualityId = (typeof RENDER_QUALITIES)[number]["id"];

export interface RenderOptions {
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  speed: number;
  loops: number;
  duration: number; // timeline seconds
}

export interface RenderProgress {
  frame: number;
  total: number;
  phase: "prepare" | "render" | "encode" | "done";
  etaSec: number;
}

export interface RenderResult {
  blob: Blob;
  ext: "mp4" | "webm";
  codec: string;
  width: number;
  height: number;
  fps: number;
  frames: number;
  durationSec: number;
  sizeBytes: number;
}

export function offlineRenderSupported(): boolean {
  return typeof window !== "undefined" && "VideoEncoder" in window && "VideoFrame" in window;
}

/* ------------------------- codec / muxer probing -------------------------- */

interface EncoderPlan {
  container: "mp4" | "webm";
  encoderCodec: string;
  muxerCodec: string;
  label: string;
}

const AVC_CANDIDATES = ["avc1.640034", "avc1.640033", "avc1.64002A", "avc1.640028", "avc1.4D4028", "avc1.42E01E"];

async function probeEncoder(plan: Omit<EncoderPlan, "label"> & { label: string }, width: number, height: number, fps: number, bitrate: number): Promise<boolean> {
  try {
    const support = await VideoEncoder.isConfigSupported({
      codec: plan.encoderCodec,
      width,
      height,
      bitrate,
      framerate: fps,
    });
    return support.supported === true;
  } catch {
    return false;
  }
}

async function planEncoder(width: number, height: number, fps: number, bitrate: number): Promise<EncoderPlan | null> {
  for (const codec of AVC_CANDIDATES) {
    if (await probeEncoder({ container: "mp4", encoderCodec: codec, muxerCodec: "avc", label: "H.264 · MP4" }, width, height, fps, bitrate)) {
      return { container: "mp4", encoderCodec: codec, muxerCodec: "avc", label: "H.264 · MP4" };
    }
  }
  if (await probeEncoder({ container: "mp4", encoderCodec: "vp09.00.10.08", muxerCodec: "vp9", label: "VP9 · MP4" }, width, height, fps, bitrate)) {
    return { container: "mp4", encoderCodec: "vp09.00.10.08", muxerCodec: "vp9", label: "VP9 · MP4" };
  }
  if (await probeEncoder({ container: "webm", encoderCodec: "vp09.00.10.08", muxerCodec: "V_VP9", label: "VP9 · WebM" }, width, height, fps, bitrate)) {
    return { container: "webm", encoderCodec: "vp09.00.10.08", muxerCodec: "V_VP9", label: "VP9 · WebM" };
  }
  if (await probeEncoder({ container: "webm", encoderCodec: "vp8", muxerCodec: "V_VP8", label: "VP8 · WebM" }, width, height, fps, bitrate)) {
    return { container: "webm", encoderCodec: "vp8", muxerCodec: "V_VP8", label: "VP8 · WebM" };
  }
  return null;
}

/* ------------------------------ the renderer ------------------------------ */

/**
 * Frame-perfect offline render of the camera path.
 * `onProgress` fires per frame; pass an AbortSignal to cancel.
 */
export async function renderVideo(
  opts: RenderOptions,
  onProgress: (p: RenderProgress) => void,
  signal?: AbortSignal,
): Promise<RenderResult | null> {
  const cap = editorCapture;
  const state = cap.root;
  if (!cap.gl || !cap.scene || !cap.camera || !state) return null;
  if (!offlineRenderSupported()) return null;

  const plan = await planEncoder(opts.width, opts.height, opts.fps, opts.bitrate);
  if (!plan) return null;

  const gl = cap.gl;
  const camera = cap.camera;
  const { Muxer: Mp4Muxer, ArrayBufferTarget: Mp4Target } = await import("mp4-muxer");
  const { Muxer: WebmMuxer, ArrayBufferTarget: WebmTarget } = await import("webm-muxer");

  const totalFrames = Math.max(2, Math.round((opts.duration / opts.speed) * opts.loops * opts.fps));
  const stepMs = 1000 / opts.fps;
  const startedAt = performance.now();

  const prevSize = gl.getSize(new THREE.Vector2());
  const prevDpr = gl.getPixelRatio();
  const restoreHelpers = stashHelpers();

  // frame copy target
  let copyCanvas: HTMLCanvasElement | OffscreenCanvas;
  let ctx2d: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  try {
    copyCanvas = new OffscreenCanvas(opts.width, opts.height);
    ctx2d = copyCanvas.getContext("2d", { alpha: false })!;
  } catch {
    copyCanvas = document.createElement("canvas");
    copyCanvas.width = opts.width;
    copyCanvas.height = opts.height;
    ctx2d = (copyCanvas as HTMLCanvasElement).getContext("2d", { alpha: false })!;
  }

  let muxer: { addVideoChunk: (c: EncodedVideoChunk, m?: EncodedVideoChunkMetadata) => void; finalize: () => void; target: { buffer: ArrayBuffer } } | null = null;

  // stop the live loop — we drive frames ourselves now
  const prevPlaying = playback.playing;
  playback.playing = false;
  playback.recording = true;
  renderDriver.active = true;
  state.setFrameloop("never");

  let encoder: VideoEncoder | null = null;

  try {
    gl.setPixelRatio(1);
    gl.setSize(opts.width, opts.height, false);
    camera.aspect = opts.width / opts.height;
    camera.updateProjectionMatrix();

    if (plan.container === "mp4") {
      muxer = new Mp4Muxer({
        target: new Mp4Target(),
        video: { codec: plan.muxerCodec as "avc", width: opts.width, height: opts.height, frameRate: opts.fps },
        fastStart: "in-memory",
      }) as unknown as typeof muxer;
    } else {
      muxer = new WebmMuxer({
        target: new WebmTarget(),
        video: { codec: plan.muxerCodec, width: opts.width, height: opts.height, frameRate: opts.fps },
      }) as unknown as typeof muxer;
    }

    encoder = new VideoEncoder({
      output: (chunk, meta) => muxer!.addVideoChunk(chunk, meta),
      error: (e) => console.error("[3dfy render] encoder error", e),
    });
    encoder.configure({
      codec: plan.encoderCodec,
      width: opts.width,
      height: opts.height,
      bitrate: opts.bitrate,
      framerate: opts.fps,
      latencyMode: "quality",
    });

    let ts = state.clock.elapsedTime + stepMs;

    for (let i = 0; i < totalFrames; i++) {
      if (signal?.aborted) {
        try { encoder?.close(); } catch { /* already closed */ }
        return null;
      }

      // deterministic timeline time for this frame
      const timelineT = Math.min(
        opts.duration - 1e-4,
        (((i / opts.fps) * opts.speed) % opts.duration),
      );
      renderDriver.t = timelineT;

      // advance the loop with a fixed-step timestamp → dt is exactly 1/fps
      state.advance(ts);
      ts += stepMs;

      // copy the freshly rendered drawing buffer
      ctx2d.drawImage(gl.domElement, 0, 0, opts.width, opts.height);
      const frame = new VideoFrame(copyCanvas as unknown as CanvasImageSource, {
        timestamp: Math.round((i * 1e6) / opts.fps),
        duration: Math.round(1e6 / opts.fps),
      });
      encoder!.encode(frame, { keyFrame: i % (opts.fps * 2) === 0 });
      frame.close();

      // backpressure — don't let the encoder queue explode
      while (encoder!.encodeQueueSize > 8) {
        await new Promise<void>((r) => setTimeout(r, 4));
        if (signal?.aborted) break;
      }

      if (i % 3 === 0 || i === totalFrames - 1) {
        const elapsed = (performance.now() - startedAt) / 1000;
        const perFrame = elapsed / (i + 1);
        onProgress({
          frame: i + 1,
          total: totalFrames,
          phase: "render",
          etaSec: Math.max(0, perFrame * (totalFrames - i - 1)),
        });
      }
    }

    onProgress({ frame: totalFrames, total: totalFrames, phase: "encode", etaSec: 0 });
    await encoder!.flush();
    muxer!.finalize();
    const buffer = muxer!.target.buffer;

    const result: RenderResult = {
      blob: new Blob([buffer], { type: plan.container === "mp4" ? "video/mp4" : "video/webm" }),
      ext: plan.container,
      codec: plan.label,
      width: opts.width,
      height: opts.height,
      fps: opts.fps,
      frames: totalFrames,
      durationSec: totalFrames / opts.fps,
      sizeBytes: buffer.byteLength,
    };
    onProgress({ frame: totalFrames, total: totalFrames, phase: "done", etaSec: 0 });
    sfx.play("recStop");
    return result;
  } finally {
    try { encoder?.close(); } catch { /* ignore */ }
    restoreHelpers();
    renderDriver.active = false;
    playback.playing = false;
    playback.recording = false;
    playback.t = 0;
    state.setFrameloop("always");
    gl.setPixelRatio(prevDpr);
    gl.setSize(prevSize.x, prevSize.y, false);
    camera.aspect = prevSize.x / prevSize.y;
    camera.updateProjectionMatrix();
    state.invalidate();
    void prevPlaying;
  }
}

/* ------------------------------ sharing --------------------------------- */

export async function shareBlob(blob: Blob, filename: string, title = "3Dfy"): Promise<boolean> {
  try {
    const file = new File([blob], filename, { type: blob.type });
    if (!navigator.canShare?.({ files: [file] })) return false;
    await navigator.share({ files: [file], title });
    return true;
  } catch {
    return false;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
