import { NextRequest, NextResponse } from "next/server";
import { getCaptureRecord, listArtifactRecords } from "@/lib/firebase/admin";
import { searchReposts, SearchResultItem } from "@/lib/tinyfish/search";
import { pickRepostPhrases } from "@/lib/tinyfish/phrase-picker";
import { normalizeCompareUrl } from "@/lib/validation/url";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const captureId = params.id;
    const capture = await getCaptureRecord(captureId);

    if (!capture) {
      return NextResponse.json({ error: "Capture not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    let phrases: string[] = Array.isArray(body.phrases) ? body.phrases : [];

    if (!phrases || phrases.length === 0) {
      const artifacts = await listArtifactRecords(captureId);
      const fetchArt = artifacts.find((a: any) => a.kind === "fetch_markdown");
      const fetchText = fetchArt?.snippet || fetchArt?.text || capture.fetchText || null;
      phrases = pickRepostPhrases(capture, fetchText);
    }

    const allResults: SearchResultItem[] = [];
    for (const phrase of phrases.slice(0, 2)) {
      try {
        const searchRes = await searchReposts(phrase);
        allResults.push(...searchRes.results);
      } catch (err) {
        console.warn(`Search for phrase "${phrase}" failed:`, err);
      }
    }

    // Identify original page URLs to exclude (PRD FR-11.3)
    const originalUrls = new Set<string>();
    if (capture.url) originalUrls.add(normalizeCompareUrl(capture.url));
    if (capture.finalUrl) originalUrls.add(normalizeCompareUrl(capture.finalUrl));
    if (capture.manifest?.target?.url) originalUrls.add(normalizeCompareUrl(capture.manifest.target.url));

    // Deduplicate by normalized URL and exclude the original page
    const seen = new Set<string>();
    const deduplicated: SearchResultItem[] = [];

    for (const item of allResults) {
      if (!item.url) continue;
      const norm = normalizeCompareUrl(item.url);
      if (originalUrls.has(norm)) {
        continue; // Exclude original page
      }
      if (seen.has(norm)) {
        continue; // Exclude duplicates
      }
      seen.add(norm);
      deduplicated.push(item);
    }

    return NextResponse.json({
      success: true,
      phrases,
      results: deduplicated,
      totalFound: deduplicated.length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
