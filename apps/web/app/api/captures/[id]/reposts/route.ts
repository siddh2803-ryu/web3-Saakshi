import { NextRequest, NextResponse } from "next/server";
import { getCaptureRecord } from "@/lib/firebase/admin";
import { searchReposts, SearchResultItem } from "@/lib/tinyfish/search";

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
    let phrases: string[] = body.phrases;

    if (!phrases || phrases.length === 0) {
      phrases = capture.aiAnalysis?.repost_phrases || [];
    }

    if (phrases.length === 0 && capture.manifest?.observed?.title) {
      phrases = [capture.manifest.observed.title];
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

    // Deduplicate by URL
    const seen = new Set<string>();
    const deduplicated = allResults.filter((r) => {
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    });

    return NextResponse.json({
      success: true,
      phrases,
      results: deduplicated,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
