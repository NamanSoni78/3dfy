import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "3Dfy — 3D Name Physics Playground & Mobile 3D Studio",
    short_name: "3Dfy",
    description:
      "Real-physics 3D names you can shake, squeeze & break — plus a phone-first 3D mini-Blender with keyframe camera movies.",
    start_url: "/",
    display: "standalone",
    background_color: "#fff6fb",
    theme_color: "#ff5fc1",
    orientation: "portrait",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
