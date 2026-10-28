import { NextRequest, NextResponse } from "next/server";
import {
  saveCaptureRecord,
  listUserCaptures,
  checkUserDailyQuota,
} from "@/lib/firebase/admin";
import { startAgentRun } from "@/lib/tinyfish/agent";
import { validateCaptureUrl } from "@/lib/validation/url";
import { NewCaptureRequestSchema } from "@/lib/tinyfish/schemas";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get("uid") || "demo-user";
    const [captures, quota] = await Promise.all([
      listUserCaptures(uid),
      checkUserDailyQuota(uid),
    ]);
    return NextResponse.json({ captures, quota });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // Kill Switch (Section 7.7)
    if (process.env.CAPTURE_ENABLED === "false") {
      return NextResponse.json(
        { error: "Evidence capture is temporarily disabled for maintenance." },
        { status: 503 }
      );
    }

    const rawBody = await req.json().catch(() => null);
    if (!rawBody) {
      return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
    }

    // Validate body structure with Zod
    const parsed = NewCaptureRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || "Validation failed";
      return NextResponse.json({ error: firstError, details: parsed.error.issues }, { status: 400 });
    }

    const { url, goal, mode, consent, uid, caseId } = parsed.data;

    // FR-2.2 Statutory Consent Check
    if (!consent) {
      return NextResponse.json(
        { error: "Preservation consent must be acknowledged before capturing evidence." },
        { status: 400 }
      );
    }

    // FR-2.4 Enforce Daily Quota
    const quota = await checkUserDailyQuota(uid);
    if (!quota.allowed) {
      return NextResponse.json(
        {
          error: `Daily capture quota exceeded (${quota.used}/${quota.total} captures used today). Try again tomorrow or upgrade plan.`,
          quota,
        },
        { status: 429 }
      );
    }

    // FR-2.1 & FR-2.3 URL validation (http/https only, reject localhost & private IP ranges)
    const urlValidation = validateCaptureUrl(url, { allowSandboxPath: true });
    if (!urlValidation.valid || !urlValidation.normalizedUrl) {
      return NextResponse.json(
        { error: urlValidation.error || "Invalid target URL." },
        { status: 400 }
      );
    }

    const absoluteUrl = urlValidation.normalizedUrl;

    // Generate Capture ID (timestamp + random entropy)
    const captureId = `cap_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;

    // Build webhook URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const webhookSecret = process.env.WEBHOOK_SECRET || "dev_webhook_secret";
    const webhookUrl = `${appUrl}/api/webhooks/tinyfish?token=${webhookSecret}&captureId=${captureId}`;

    const captureRecord = {
      id: captureId,
      ownerUid: uid,
      caseId: caseId || null,
      url: absoluteUrl,
      finalUrl: absoluteUrl,
      goal: goal || "Capture the full post, author details, and comments.",
      mode,
      status: "QUEUED",
      events: [
        {
          stage: "QUEUED",
          message: "Capture job received and queued.",
          at: new Date().toISOString(),
        },
      ],
      tinyfish: {
        startedAt: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveCaptureRecord(captureId, captureRecord);

    // Start TinyFish agent run asynchronously
    try {
      const agentRun = await startAgentRun({
        url: absoluteUrl,
        userGoal: goal,
        mode,
        webhookUrl,
      });

      await saveCaptureRecord(captureId, {
        status: "AGENT_RUNNING",
        tinyfish: {
          runId: agentRun.run_id,
          startedAt: new Date().toISOString(),
        },
        events: [
          ...captureRecord.events,
          {
            stage: "AGENT_RUNNING",
            message: `TinyFish Web Agent started (runId: ${agentRun.run_id})`,
            at: new Date().toISOString(),
          },
        ],
      });
    } catch (agentErr) {
      console.error("Failed to launch TinyFish agent run:", agentErr);
      await saveCaptureRecord(captureId, {
        status: "FAILED",
        error: {
          stage: "AGENT_RUNNING",
          message: agentErr instanceof Error ? agentErr.message : "Agent launch error",
          at: new Date().toISOString(),
        },
      });
    }

    return NextResponse.json({
      captureId,
      status: "QUEUED",
      quota: {
        remaining: quota.remaining - 1,
        total: quota.total,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
