import { FontLoader, type Font } from "three-stdlib";

/** Self-hosted typeface fonts (downloaded from threejs.org examples). */
export interface FontDef {
  id: string;
  name: string;
  file: string;
}

export const FONTS: FontDef[] = [
  { id: "helvetiker", name: "Helvetiker Bold", file: "/fonts/helvetiker_bold.typeface.json" },
  { id: "optimer", name: "Optimer Bold", file: "/fonts/optimer_bold.typeface.json" },
  { id: "gentilis", name: "Gentilis Bold", file: "/fonts/gentilis_bold.typeface.json" },
  { id: "droidsans", name: "Droid Sans", file: "/fonts/droid_sans_bold.typeface.json" },
  { id: "droidserif", name: "Droid Serif", file: "/fonts/droid_serif_bold.typeface.json" },
  { id: "droidmono", name: "Droid Mono", file: "/fonts/droid_sans_mono_regular.typeface.json" },
];

const loader = new FontLoader();
const cache = new Map<string, Font>();
const pending = new Map<string, Promise<Font>>();

export function getFont(id: string): Promise<Font> {
  const hit = cache.get(id);
  if (hit) return Promise.resolve(hit);
  const inflight = pending.get(id);
  if (inflight) return inflight;
  const def = FONTS.find((f) => f.id === id) ?? FONTS[0];
  const p = fetch(def.file)
    .then((r) => r.json())
    .then((json: unknown) => {
      const font = loader.parse(json as Parameters<FontLoader["parse"]>[0]);
      cache.set(id, font);
      pending.delete(id);
      return font;
    })
    .catch((e) => {
      pending.delete(id);
      throw e;
    });
  pending.set(id, p);
  return p;
}

export function fontName(id: string): string {
  return FONTS.find((f) => f.id === id)?.name ?? "Helvetiker Bold";
}
