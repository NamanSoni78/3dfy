import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: "/", changeFrequency: "weekly", priority: 1 },
    { url: "/3dfy", changeFrequency: "weekly", priority: 0.9 },
    { url: "/make3d", changeFrequency: "weekly", priority: 0.9 },
    { url: "/world", changeFrequency: "weekly", priority: 0.9 },
  ];
}
