import type { MetadataRoute } from "next";

// App interna de Inseryal. No queremos que Google ni ningún otro
// crawler indexe NADA — ni la landing pública /c/[sales]/[client]
// que solo es un redirector hacia Google.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
