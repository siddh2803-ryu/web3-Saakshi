import { NextRequest, NextResponse } from "next/server";
import { getAgentRun } from "@/lib/tinyfish/agent";
import { runFinalizePipeline } from "@/lib/pipeline/finalize";
import { saveCaptureRecord } from "@/lib/firebase/admin";
import { WebhookPayloadSchema } from "@/lib/tinyfish/schemas";

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");
    const captureId = searchParams.get("captureId");

    const expectedToken = process.env.WEBHOOK_SECRET || "dev_webhook_secret";
    if (!token || token !== expectedToken) {
      return NextResponse.json({ error: "Invalid or missing webhook secret token" }, { status: 401 });
    }

    if (!captureId) {
      return NextResponse.json({ error: "captureId query param required" }, { status: 400 });
    }

    const rawBody = await req.json().catch(() => ({}));
    const parsedBody = WebhookPayloadSchema.safeParse(rawBody);
    const payload = parsedBody.success ? parsedBody.data : rawBody;
    const runId = payload.run_id || payload.id;

    if (runId) {
      // Re-read run status from GET /v1/runs/{id} directly before taking action (PRD Section 7.1)
      const verifiedRun = await getAgentRun(runId, false);

      if (verifiedRun.status === "COMPLETED") {
        runFinalizePipeline(captureId).catch((err) =>
          console.error(`[Webhook] Async finalize error for ${captureId}:`, err)
        );
      } else if (verifiedRun.status === "FAILED" || verifiedRun.status === "CANCELLED") {
        await saveCaptureRecord(captureId, {
          status: "FAILED",
          error: {
            stage: "AGENT_RUNNING",
            message: verifiedRun.error || `Agent ended with status: ${verifiedRun.status}`,
            at: new Date().toISOString(),
          },
        });
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
