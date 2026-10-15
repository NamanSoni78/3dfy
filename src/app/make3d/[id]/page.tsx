import type { Metadata } from "next";
import { EditorApp } from "@/components/editor/EditorApp";

export const metadata: Metadata = {
  title: "Make 3D — Studio",
  description:
    "A Blender-like 3D editor built for your phone: add text, shapes and images, style them with candy materials, direct camera keyframes and export videos.",
};

export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditorApp projectId={id} />;
}
