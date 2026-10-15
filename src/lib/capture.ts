"use client";

import * as THREE from "three";

/** Render the current frame and return it as a blob (for screenshots / thumbnails). */
export function renderToBlob(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  type = "image/png",
  quality?: number,
): Promise<Blob | null> {
  gl.render(scene, camera);
  return new Promise((resolve) => {
    gl.domElement.toBlob(
      (b) => resolve(b),
      type,
      quality,
    );
  });
}

/** Try to copy an image blob to the clipboard. Returns success. */
export async function copyImageToClipboard(blob: Blob): Promise<boolean> {
  try {
    const CI = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
    if (!CI || !navigator.clipboard?.write) return false;
    await navigator.clipboard.write([new CI({ [blob.type]: blob })]);
    return true;
  } catch {
    return false;
  }
}

/** Downscale a blob to a small JPEG dataURL (project thumbnails). */
export async function blobToThumb(blob: Blob, maxW = 220, quality = 0.62): Promise<string | null> {
  try {
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, maxW / bmp.width);
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    return c.toDataURL("image/jpeg", quality);
  } catch {
    return null;
  }
}

/** Downscale an image file/blob to a dataURL with max dimension (texture prints/uploads). */
export async function fileToDataUrl(file: Blob, maxDim = 1024, quality = 0.92): Promise<{ url: string; w: number; h: number }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const type = file.type === "image/png" && w * h < 400_000 ? "image/png" : "image/jpeg";
  return { url: c.toDataURL(type, quality), w, h };
}
