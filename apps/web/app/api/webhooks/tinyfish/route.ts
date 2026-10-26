import { NextRequest, NextResponse } from "next/server";
import { getAgentRun } from "@/lib/tinyfish/agent";
import { runFinalizePipeline } from "@/lib/pipeline/finalize";

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");
    const captureId = searchParams.get("captureId");

    const expectedToken = process.env.WEBHOOK_SECRET || "dev_webhook_secret";
    if (token !== expectedToken) {
      return NextResponse.json({ error: "Invalid webhook secret token" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const runId = body.run_id || body.id;

    if (!captureId) {
      return NextResponse.json({ error: "captureId query param required" }, { status: 400 });
    }

    if (runId) {
      // Re-read run from API directly before acting (per PRD Section 7.1)
      const verifiedRun = await getAgentRun(runId, false);
      if (verifiedRun.status === "COMPLETED") {
        runFinalizePipeline(captureId).catch((err) =>
          console.error("Webhook triggered finalize error:", err)
        );
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
