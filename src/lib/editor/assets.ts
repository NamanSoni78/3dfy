"use client";

import { get, set, del, keys } from "idb-keyval";
import type { AssetMeta } from "./types";

/**
 * Image assets live in IndexedDB (big), project JSON lives in localStorage
 * (small). The .3dfy export embeds assets as dataURLs so projects are
 * portable between phones.
 */

const assetKey = (id: string) => `3dfy.asset.${id}`;

export async function saveAsset(id: string, dataUrl: string): Promise<void> {
  await set(assetKey(id), dataUrl);
}

export async function loadAsset(id: string): Promise<string | null> {
  try {
    const v = await get<string>(assetKey(id));
    return v ?? null;
  } catch {
    return null;
  }
}

export async function deleteAsset(id: string): Promise<void> {
  try {
    await del(assetKey(id));
  } catch {
    /* ignore */
  }
}

export async function listAssetIds(): Promise<string[]> {
  try {
    const ks = await keys();
    return ks
      .map((k) => String(k))
      .filter((k) => k.startsWith("3dfy.asset."))
      .map((k) => k.slice("3dfy.asset.".length));
  } catch {
    return [];
  }
}

/** Resolve all asset dataUrls for a set of metas (for export). */
export async function gatherAssets(metas: Record<string, AssetMeta>): Promise<Record<string, { meta: AssetMeta; data: string }>> {
  const out: Record<string, { meta: AssetMeta; data: string }> = {};
  await Promise.all(
    Object.entries(metas).map(async ([id, meta]) => {
      const data = await loadAsset(id);
      if (data) out[id] = { meta, data };
    }),
  );
  return out;
}

/** Persist assets from an imported .3dfy file. */
export async function restoreAssets(assets: Record<string, { meta: AssetMeta; data: string }>): Promise<void> {
  await Promise.all(Object.entries(assets).map(([id, a]) => saveAsset(id, a.data)));
}
