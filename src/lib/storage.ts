"use client";

/** Safe, versioned localStorage JSON helpers (client-side only, never throws). */

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode — silently ignore */
  }
}

export function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Trigger a browser download for a blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Stamp an ISO date into a short file-safe slug. */
export function dateStamp(d = new Date()): string {
  return d.toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

/** Approximate localStorage usage in KB. */
export function storageUsageKB(): number {
  try {
    let total = 0;
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)!;
      total += (k.length + (window.localStorage.getItem(k)?.length ?? 0)) * 2;
    }
    return Math.round(total / 1024);
  } catch {
    return 0;
  }
}

export function uid(): string {
  return globalThis.crypto.randomUUID();
}
