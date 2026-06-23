import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/municipios"].map((path) => ({
    url: new URL(path, SITE_URL).toString(),
    changeFrequency: "hourly",
    priority: path === "/" ? 1 : 0.8,
  }));
}
