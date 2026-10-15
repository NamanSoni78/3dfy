import type { Metadata } from "next";
import { ProjectsHub } from "@/components/editor/ProjectsHub";

export const metadata: Metadata = {
  title: "Make 3D — Projects",
  description:
    "Your mobile 3D studio projects. Create a new candy world, or import a .3dfy file from another phone and continue right where you left off.",
};

export default function Make3dPage() {
  return <ProjectsHub />;
}
