# 3Dfy

**Infinite AI 3D worlds, a full browser 3D studio, and a physics name playground — no install, no sign-up, everything runs on your GPU.**

Live at **[3dfy.namansoni.in](https://3dfy.namansoni.in)** · Made with ❤️ by [Naman](https://github.com/NamanSoni78) · [Donate](https://payment.namansoni.in/payment)

## The three modes

| Mode | What it is |
|---|---|
| **Worlds** (flagship) | Infinite procedurally-generated 3D worlds with the complete studio inside: fly/walk, add objects & lights, keyframe camera paths, and render frame-perfect MP4 films offline. Import whole worlds from AI-generated world code (terrain, mobs, custom lights, reflections, physics). |
| **Make 3D** | A clean Blender-like bounded stage with the same editor engine — the classic place to compose and render a scene. Import AI-designed shapes as real geometry. |
| **Playground** | Your name as squeezable, shakeable, breakable 3D letters with real Rapier physics. |

## Highlights

- **AI import pipeline** — copy an engineered prompt into any chatbot, paste the code back: `3dsc-2` shapes arrive as real vertex/face meshes (with per-face colors), `3dwc-2` worlds arrive with terrain, mobs, lights and water. Both parsers are hostile-proof (clamped, validated, capped).
- **Blender-style render engine** — deterministic frame-stepped offline rendering through WebCodecs → real MP4 (or WebM), no dropped frames, no flicker, no gizmos in shot.
- **Minecraft-feel controls** — WASD/Space/Shift flight, pointer-lock hand-look, touch pad on phones, long-press-to-place.
- **100% client-side** — projects persist in localStorage/IndexedDB, export/import as `.3dfy` files. No backend, no accounts, no tracking.

## Run it

```bash
bun install          # or: npm install
bun run dev          # develop → http://localhost:3000

bun run build        # production build (Next.js standalone)
npm start            # serve it → http://localhost:3000
```

No environment variables are needed. Deploy anywhere that runs Node
(Vercel works zero-config — add your domain in project settings).

## Tech

Next.js (App Router) · React · TypeScript · Tailwind CSS · shadcn/ui ·
three.js + @react-three/fiber + drei + rapier · zustand · WebCodecs ·
mp4-muxer / webm-muxer.

## Repo map

- `src/lib/world/` — infinite-world engine (chunks, noise, mobs, presets)
- `src/lib/shapes/` — 3DSC v2 shape-code parser + geometry builder
- `src/lib/editor/` — editor store, runtime, offline render engine
- `src/components/editor/` — studio UI (inspector, director, world stage)
- `src/components/playground/` — physics name playground
- `plan.md` / `bugfix.md` / `worklog.md` — full architecture + history
- `scripts/test-shape-build.ts` — shape-import regression test (`bun scripts/test-shape-build.ts`)
