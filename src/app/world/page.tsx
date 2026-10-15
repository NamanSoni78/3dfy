import type { Metadata } from "next";
import { WorldApp } from "@/components/world/WorldApp";

export const metadata: Metadata = {
  title: "World Studio — Infinite AI Worlds · 3Dfy",
  description:
    "Fly through infinite procedural 3D worlds designed by AI. Lazy-loaded chunks, render-distance controls, flight recording — all in your browser.",
};

export default function WorldPage() {
  return <WorldApp />;
}
