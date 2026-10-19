import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SchoolOS",
    short_name: "SchoolOS",
    description: "School management that keeps working on a slow connection.",
    start_url: "/schools",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#1d5fd1",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
