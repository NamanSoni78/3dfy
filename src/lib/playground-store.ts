"use client";

import { create } from "zustand";
import type { MaterialPreset } from "@/lib/three/materials";
import { loadJSON, saveJSON } from "@/lib/storage";

export type Difficulty = "zen" | "normal" | "chaos";
export type ColorMode = "rainbow" | "single" | "gradient";

export interface PlaygroundStats {
  shakes: number;
  breaks: number;
  drags: number;
  dragDistance: number;
  screenshots: number;
  presets: number;
  rerolls: number;
  lettersMade: number;
  squeezes: number;
  soundsPlayed: number;
}

export interface PlaygroundSettings {
  name: string;
  font: string;
  material: MaterialPreset;
  colorMode: ColorMode;
  color: string;
  difficulty: Difficulty;
  muted: boolean;
}

const KEY = "3dfy.playground.v1";

const DEFAULTS: PlaygroundSettings = {
  name: "NAMAN",
  font: "helvetiker",
  material: "clay",
  colorMode: "rainbow",
  color: "#FF6EC7",
  difficulty: "normal",
  muted: false,
};

interface PlaygroundState {
  settings: PlaygroundSettings;
  stats: PlaygroundStats;
  hydrated: boolean;
  setSettings: (patch: Partial<PlaygroundSettings>) => void;
  bump: (key: keyof PlaygroundStats, by?: number) => void;
  resetStats: () => void;
  hydrate: () => void;
  persist: () => void;
}

const EMPTY_STATS: PlaygroundStats = {
  shakes: 0, breaks: 0, drags: 0, dragDistance: 0, screenshots: 0,
  presets: 0, rerolls: 0, lettersMade: 0, squeezes: 0, soundsPlayed: 0,
};

export const usePlayground = create<PlaygroundState>((set, get) => ({
  settings: DEFAULTS,
  stats: { ...EMPTY_STATS },
  hydrated: false,

  setSettings: (patch) => {
    set((s) => ({ settings: { ...s.settings, ...patch } }));
    get().persist();
  },

  bump: (key, by = 1) => {
    set((s) => ({ stats: { ...s.stats, [key]: s.stats[key] + by } }));
    get().persist();
  },

  resetStats: () => {
    set({ stats: { ...EMPTY_STATS } });
    get().persist();
  },

  hydrate: () => {
    if (get().hydrated) return;
    const saved = loadJSON<{ settings?: Partial<PlaygroundSettings>; stats?: PlaygroundStats }>(KEY, {});
    set({
      settings: { ...DEFAULTS, ...(saved.settings ?? {}) },
      stats: { ...EMPTY_STATS, ...(saved.stats ?? {}) },
      hydrated: true,
    });
  },

  persist: () => {
    const { settings, stats } = get();
    saveJSON(KEY, { settings, stats });
  },
}));
