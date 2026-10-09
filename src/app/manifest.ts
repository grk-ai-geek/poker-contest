import type { MetadataRoute } from "next";
import { brand } from "@/config/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.name,
    short_name: brand.shortName,
    description: brand.description,
    start_url: "/",
    display: "standalone",
    background_color: "#121614",
    theme_color: "#0f5132",
    icons: [{ src: brand.logo.mark, sizes: "any", type: "image/svg+xml" }],
  };
}
