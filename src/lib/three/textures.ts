import * as THREE from "three";

/** All textures are generated procedurally on canvas — zero asset downloads. */
const cache = new Map<string, THREE.Texture>();

function make(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, opts?: { colorSpace?: boolean }): THREE.Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  draw(ctx);
  const tex = new THREE.CanvasTexture(c);
  if (opts?.colorSpace !== false) tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

/** Soft radial glow (white core → transparent) for neon halos. */
export function glowTexture(): THREE.Texture {
  return make("glow", 128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,0.55)");
    g.addColorStop(0.6, "rgba(255,255,255,0.15)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
}

/** Flat circle sprite for particles. */
export function circleTexture(): THREE.Texture {
  return make("circle", 64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.7, "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, Math.PI * 2);
    ctx.fill();
  });
}

export function starTexture(): THREE.Texture {
  return make("star", 64, 64, (ctx) => {
    ctx.fillStyle = "#fff";
    ctx.translate(32, 32);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 30 : 12;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const fn = i === 0 ? "moveTo" : "lineTo";
      ctx[fn](Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  });
}

export function heartTexture(): THREE.Texture {
  return make("heart", 64, 64, (ctx) => {
    ctx.translate(32, 30);
    ctx.scale(1.15, 1.15);
    ctx.beginPath();
    ctx.moveTo(0, 12);
    ctx.bezierCurveTo(0, 22, -24, 26, -24, 8);
    ctx.bezierCurveTo(-24, -6, -10, -10, 0, -22);
    ctx.bezierCurveTo(10, -10, 24, -6, 24, 8);
    ctx.bezierCurveTo(24, 26, 0, 22, 0, 12);
    ctx.fillStyle = "#fff";
    ctx.fill();
  });
}

/** Spark: 4-point twinkle. */
export function sparkTexture(): THREE.Texture {
  return make("spark", 64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 8);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.moveTo(32, 2); ctx.lineTo(36, 28); ctx.lineTo(62, 32); ctx.lineTo(36, 36);
    ctx.lineTo(32, 62); ctx.lineTo(28, 36); ctx.lineTo(2, 32); ctx.lineTo(28, 28);
    ctx.closePath();
    ctx.fill();
  });
}

/** Snowflake-ish flake. */
export function flakeTexture(): THREE.Texture {
  return make("flake", 64, 64, (ctx) => {
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.translate(32, 32);
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -26);
      ctx.moveTo(0, -16); ctx.lineTo(7, -24);
      ctx.moveTo(0, -16); ctx.lineTo(-7, -24);
      ctx.stroke();
      ctx.rotate(Math.PI / 3);
    }
  });
}

export type SpriteKind = "circle" | "star" | "heart" | "spark" | "flake";

export function spriteTexture(kind: SpriteKind): THREE.Texture {
  switch (kind) {
    case "star": return starTexture();
    case "heart": return heartTexture();
    case "spark": return sparkTexture();
    case "flake": return flakeTexture();
    default: return circleTexture();
  }
}

/* ------------------------- material maps ------------------------- */

/** Vertical two-color gradient (sky, sweets). */
export function gradientTexture(top: string, bottom: string, horizontal = false): THREE.Texture {
  const key = `grad:${top}:${bottom}:${horizontal}`;
  return make(key, 16, 256, (ctx) => {
    const g = horizontal
      ? ctx.createLinearGradient(0, 0, 256, 0)
      : ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, 256);
  });
}

/** Multi-stop candy gradient (for text fills). */
export function candyGradientTexture(colors: string[]): THREE.Texture {
  const key = `candy:${colors.join(",")}`;
  return make(key, 256, 16, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 256, 0);
    colors.forEach((c, i) => g.addColorStop(i / (colors.length - 1), c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 16);
  });
}

/** Diagonal stripes (retro print). */
export function stripeTexture(a: string, b: string): THREE.Texture {
  const key = `stripe:${a}:${b}`;
  return make(key, 64, 64, (ctx) => {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = b;
    ctx.lineWidth = 16;
    for (let i = -64; i < 128; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 64, 64);
      ctx.stroke();
    }
  }, { colorSpace: false });
}

/** Swirly marble (layered soft gradients + veins). */
export function marbleTexture(base = "#f4f0ff"): THREE.Texture {
  const key = `marble:${base}`;
  return make(key, 256, 256, (ctx) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    const vein = (x: number, y: number, r: number, alpha: number) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(160,140,190,${alpha})`);
      g.addColorStop(0.55, `rgba(190,180,220,${alpha * 0.5})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (let i = 0; i < 26; i++) {
      vein(
        Math.random() * 256, Math.random() * 256,
        20 + Math.random() * 60,
        0.05 + Math.random() * 0.12,
      );
    }
    ctx.strokeStyle = "rgba(130,110,170,0.25)";
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 10; i++) {
      ctx.beginPath();
      let x = Math.random() * 256, y = Math.random() * 256;
      ctx.moveTo(x, y);
      for (let s = 0; s < 5; s++) {
        x += (Math.random() - 0.5) * 90;
        y += (Math.random() - 0.5) * 90;
        ctx.quadraticCurveTo(x + 20, y - 20, x, y);
      }
      ctx.stroke();
    }
  });
}

/** Glitter/confetti dots. */
export function glitterTexture(): THREE.Texture {
  const key = "glitter";
  return make(key, 128, 128, (ctx) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 128, 128);
    const colors = ["#FF6EC7", "#7AF6FF", "#FFFB96", "#B967FF", "#05FFA1"];
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = colors[i % colors.length];
      ctx.globalAlpha = 0.5 + Math.random() * 0.5;
      const s = 2 + Math.random() * 4;
      ctx.fillRect(Math.random() * 128, Math.random() * 128, s, s);
    }
    ctx.globalAlpha = 1;
  }, { colorSpace: false });
}

/** Checkerboard (Y2K floor). */
export function checkerTexture(a = "#ffd8f2", b = "#e9b8e0", n = 8): THREE.Texture {
  const key = `checker:${a}:${b}:${n}`;
  const tex = make(key, n * 16, n * 16, (ctx) => {
    const s = 16;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? a : b;
        ctx.fillRect(x * s, y * s, s, s);
      }
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
