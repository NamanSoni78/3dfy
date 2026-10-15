import type { Metadata } from "next";
import { EditorApp } from "@/components/editor/EditorApp";

export const metadata: Metadata = {
  title: "World Studio — Infinite AI Worlds · 3Dfy",
  description:
    "The full 3Dfy studio on infinite procedural land: place objects, direct camera keyframes and render frame-perfect videos inside an AI-designed world.",
};

export default async function WorldProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditorApp projectId={id} />;
}
