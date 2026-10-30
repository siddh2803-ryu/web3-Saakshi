import { NextRequest, NextResponse } from "next/server";
import { getCaptureRecord, listArtifactRecords, saveCaptureRecord } from "@/lib/firebase/admin";
import { getAgentRun } from "@/lib/tinyfish/agent";
import { runFinalizePipeline } from "@/lib/pipeline/finalize";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const captureId = params.id;
    const capture = await getCaptureRecord(captureId);

    if (!capture) {
      return NextResponse.json({ error: "Capture not found" }, { status: 404 });
    }

    // While agent is running, poll TinyFish agent status
    if (capture.status === "AGENT_RUNNING" && capture.tinyfish?.runId) {
      try {
        const run = await getAgentRun(capture.tinyfish.runId, false);

        const updates: Record<string, unknown> = {
          tinyfish: {
            ...capture.tinyfish,
            streamingUrl: run.streaming_url,
            numOfSteps: run.num_of_steps,
          },
        };

        if (run.status === "COMPLETED") {
          // Agent completed! Trigger finalize asynchronously if not already triggered
          saveCaptureRecord(captureId, updates);
          // Run finalize without blocking this request
          runFinalizePipeline(captureId).catch((err) =>
            console.error("Async finalize execution error:", err)
          );
        } else if (run.status === "FAILED" || run.status === "CANCELLED") {
          updates.status = "FAILED";
          updates.error = {
            stage: "AGENT_RUNNING",
            message: run.error || `Agent ended with status: ${run.status}`,
            at: new Date().toISOString(),
          };
          await saveCaptureRecord(captureId, updates);
        } else {
          await saveCaptureRecord(captureId, updates);
        }

        // Merge latest updates into returned object
        Object.assign(capture, updates);
      } catch (pollErr) {
        console.warn("Status poll error from TinyFish:", pollErr);
      }
    }

    const artifacts = await listArtifactRecords(captureId);

    return NextResponse.json({
      capture: {
        ...capture,
        artifacts,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
