import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "3Dfy — Infinite AI 3D Worlds & 3D Studio",
    short_name: "3Dfy",
    description:
      "Explore infinite AI-generated 3D worlds, build with a full 3D studio, and play with your name in real 3D physics.",
    start_url: "/",
    display: "standalone",
    background_color: "#0e1116",
    theme_color: "#0e1116",
    orientation: "any",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
