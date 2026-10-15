/**
 * Deterministic, seeded 2D simplex noise + fBm helpers for the World Studio.
 * Zero dependencies — a fixed seed always rebuilds the exact same terrain on
 * every device, which is what makes AI-generated world codes shareable.
 */

/** Small fast seeded PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic hash of chunk coords → PRNG seed. */
export function chunkSeed(cx: number, cz: number, seed: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = (Math.imul(cx, 0x85ebca6b) ^ h) >>> 0;
  h = (Math.imul(h >>> 13, 0xc2b2ae35) ^ Math.imul(cz, 0x27d4eb2f)) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

const GRAD2 = new Float32Array([
  1, 1, -1, 1, 1, -1, -1, -1,
  1, 0, -1, 0, 0, 1, 0, -1,
]);

export class SimplexNoise {
  private perm = new Uint8Array(512);
  private permMod8 = new Uint8Array(512);

  constructor(rand: () => number) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permMod8[i] = this.perm[i] & 7;
    }
  }

  /** Classic 2D simplex — output ≈ [-1, 1]. */
  noise2D(xin: number, yin: number): number {
    const perm = this.perm;
    const permMod8 = this.permMod8;

    let n0 = 0, n1 = 0, n2 = 0;

    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);

    let i1: number, j1: number;
    if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;

    const ii = i & 255;
    const jj = j & 255;

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      const g = permMod8[ii + perm[jj]] * 2;
      t0 *= t0;
      n0 = t0 * t0 * (GRAD2[g] * x0 + GRAD2[g + 1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      const g = permMod8[ii + i1 + perm[jj + j1]] * 2;
      t1 *= t1;
      n1 = t1 * t1 * (GRAD2[g] * x1 + GRAD2[g + 1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      const g = permMod8[ii + 1 + perm[jj + 1]] * 2;
      t2 *= t2;
      n2 = t2 * t2 * (GRAD2[g] * x2 + GRAD2[g + 1] * y2);
    }

    return 70.14805770653952 * (n0 + n1 + n2);
  }
}

/** Fractal Brownian motion — smooth rolling terrain. */
export function fbm(n: SimplexNoise, x: number, y: number, octaves = 4): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * n.noise2D(x * freq, y * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** Ridged multifractal — sharp mountain crests. */
export function ridged(n: SimplexNoise, x: number, y: number, octaves = 3): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const v = 1 - Math.abs(n.noise2D(x * freq, y * freq));
    sum += amp * v * v;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
