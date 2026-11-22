import { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/config/url";

/**
 * Generates robots.txt adhering to PRD requirements:
 * Disallows search engine crawlers from indexing expiring /s/ share pages
 * and private /sandbox/admin simulator, while allowing public verification and landing.
 */
export default function robots(): MetadataRoute.Robots {
  const appUrl = getAppUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/verify", "/privacy", "/terms", "/sandbox/post/*"],
        disallow: [
          "/s/",
          "/sandbox/admin",
          "/api/",
          "/dashboard",
          "/capture/",
          "/case/",
        ],
      },
    ],
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
