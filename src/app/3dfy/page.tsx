import type { Metadata } from "next";
import { PlaygroundApp } from "@/components/playground/PlaygroundApp";

export const metadata: Metadata = {
  title: "3D Name Physics Playground",
  description:
    "Type your name, watch it become living 3D candy with real physics. Shake your phone to break it, tilt to roll it, pinch to squeeze it.",
};

export default function PlaygroundPage() {
  return <PlaygroundApp />;
}
