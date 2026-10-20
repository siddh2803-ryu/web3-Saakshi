import { NextRequest, NextResponse } from "next/server";
import { saveCaptureRecord, listUserCaptures } from "@/lib/firebase/admin";
import { startAgentRun } from "@/lib/tinyfish/agent";

function isPrivateOrLocalhost(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    const host = parsed.hostname.toLowerCase();

    // Allow internal sandbox URLs for demo purposes
    if (parsed.pathname.startsWith("/sandbox/")) {
      return false;
    }

    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host.endsWith(".local") ||
      host.endsWith(".internal")
    ) {
      // In local development, allow localhost sandbox
      if (process.env.NODE_ENV !== "production") {
        return false;
      }
      return true;
    }

    // Check private IPv4 ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16
    const ipParts = host.split(".").map(Number);
    if (ipParts.length === 4 && ipParts.every((p) => !isNaN(p))) {
      if (ipParts[0] === 10) return true;
      if (ipParts[0] === 127) return true;
      if (ipParts[0] === 169 && ipParts[1] === 254) return true;
      if (ipParts[0] === 192 && ipParts[1] === 168) return true;
      if (ipParts[0] === 172 && ipParts[1] >= 16 && ipParts[1] <= 31) return true;
    }

    return false;
  } catch {
    return true;
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get("uid") || "demo-user";
    const captures = await listUserCaptures(uid);
    return NextResponse.json({ captures });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, goal, mode = "standard", consent, uid = "demo-user", caseId } = body;

    // FR-2.2 Consent validation
    if (!consent) {
      return NextResponse.json(
        { error: "Preservation consent must be acknowledged before capturing evidence." },
        { status: 400 }
      );
    }

    // FR-2.1 & FR-2.3 URL validation
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "A valid target URL is required." }, { status: 400 });
    }

    let absoluteUrl = url.trim();
    if (absoluteUrl.startsWith("/")) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      absoluteUrl = `${appUrl}${absoluteUrl}`;
    }

    try {
      const parsed = new URL(absoluteUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return NextResponse.json({ error: "URL protocol must be HTTP or HTTPS." }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: "Invalid URL format." }, { status: 400 });
    }

    if (isPrivateOrLocalhost(absoluteUrl)) {
      return NextResponse.json(
        { error: "Capturing private internal or localhost network addresses is restricted." },
        { status: 400 }
      );
    }

    if (goal && typeof goal === "string" && goal.length > 300) {
      return NextResponse.json(
        { error: "Investigation goal exceeds 300 characters limit." },
        { status: 400 }
      );
    }

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
      mode: mode === "deep" ? "deep" : "standard",
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
        mode: mode === "deep" ? "deep" : "standard",
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

    return NextResponse.json({ captureId, status: "QUEUED" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
