import { NextRequest, NextResponse } from "next/server";
import {
  getCaptureRecord,
  saveCaptureRecord,
  listArtifactRecords,
  saveArtifactRecord,
} from "@/lib/firebase/admin";
import { analyzeEvidenceWithGemini, createFailedAnalysis } from "@/lib/ai/gemini";
import { computeSha256 } from "@/lib/evidence/hash";
import { unwrapDek, encryptWithKey } from "@/lib/evidence/crypto";
import { uploadBufferToIpfs } from "@/lib/evidence/ipfs";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_REGENERATIONS_PER_DAY = 3;

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

    if (capture.status !== "READY" && capture.status !== "PARTIAL") {
      return NextResponse.json(
        { error: "Capture is not in a finalized state eligible for analysis" },
        { status: 400 }
      );
    }

    // Per-capture daily limit check (maximum 3 regenerations per day per PRD Section 12)
    const now = new Date();
    const startOfDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    ).toISOString();

    const history: string[] = Array.isArray(capture.aiRegenerations)
      ? capture.aiRegenerations
      : [];
    const todayRegens = history.filter((timestamp: string) => timestamp >= startOfDay);

    if (todayRegens.length >= MAX_REGENERATIONS_PER_DAY) {
      return NextResponse.json(
        {
          error: `Daily regeneration limit reached (${MAX_REGENERATIONS_PER_DAY} per capture per day). Please try again tomorrow.`,
          remaining: 0,
          limit: MAX_REGENERATIONS_PER_DAY,
        },
        { status: 429 }
      );
    }

    // Retrieve existing artifacts to feed Gemini
    const artifacts = await listArtifactRecords(captureId);
    const fetchArt = artifacts.find((a) => a.kind === "fetch_markdown");
    const domArt = artifacts.find((a) => a.kind === "dom_html");
    const agentResultArt = artifacts.find((a) => a.kind === "agent_result_json");

    let observedText = "";
    if (fetchArt) {
      observedText = `Target: ${capture.url}\n\nEvidence Markdown:\n${fetchArt.content || fetchArt.text || ""}`;
    } else if (domArt) {
      observedText = `Target: ${capture.url}\n\nDOM Content Preview:\n${domArt.content || ""}`;
    } else {
      observedText = `Target: ${capture.url}\nPreserved evidence for capture ${captureId}`;
    }

    let agentData = null;
    if (agentResultArt) {
      try {
        agentData =
          typeof agentResultArt.content === "string"
            ? JSON.parse(agentResultArt.content)
            : agentResultArt.content;
      } catch {
        // fallback
      }
    }

    const stepScreenshots = artifacts
      .filter((a) => a.kind === "agent_step_screenshot")
      .map((a, idx) => ({
        stepIndex: a.stepIndex || idx + 1,
        action: a.action,
        mimeType: a.mime || "image/jpeg",
        base64Data: (a.base64Data || a.screenshot || "").replace(/^data:image\/\w+;base64,/, ""),
      }));

    let aiAnalysis = null;
    try {
      aiAnalysis = await analyzeEvidenceWithGemini(
        observedText,
        agentData,
        new Date().toISOString(),
        stepScreenshots
      );
    } catch (aiErr: unknown) {
      const msg = aiErr instanceof Error ? aiErr.message : String(aiErr);
      aiAnalysis = createFailedAnalysis(
        "AI analysis could not be regenerated for this capture.",
        msg
      );
    }

    // Store encrypted derivative ai_analysis.json (FR-9.3)
    let aiAnalysisArtifact = null;
    if (aiAnalysis && capture.wrappedDek) {
      try {
        const dek = unwrapDek(capture.wrappedDek);
        const aiBuffer = Buffer.from(JSON.stringify(aiAnalysis, null, 2), "utf8");
        const aiSha256 = computeSha256(aiBuffer);
        const encryptedAi = encryptWithKey(aiBuffer, dek, `${captureId}:art_ai_analysis`);

        const aiUpload = await uploadBufferToIpfs(encryptedAi.ciphertext, {
          name: `saakshi_${captureId}_ai_analysis.enc`,
          captureId,
          kind: "ai_analysis" as any,
        });

        const aiRecord = {
          id: "art_ai_analysis",
          kind: "ai_analysis",
          mime: "application/json",
          bytes: aiBuffer.length,
          sha256: aiSha256,
          cid: aiUpload.cid,
          pinataFileId: aiUpload.pinataFileId || null,
          iv: encryptedAi.ivHex,
          authTag: encryptedAi.authTagHex,
          isDerivative: true,
          capturedAt: new Date().toISOString(),
        };
        await saveArtifactRecord(captureId, aiRecord);

        aiAnalysisArtifact = {
          id: "art_ai_analysis",
          sha256: aiSha256,
          cid: aiUpload.cid,
          isDerivative: true,
          iv: encryptedAi.ivHex,
          authTag: encryptedAi.authTagHex,
        };
      } catch (storageErr) {
        console.warn("Derivative ai_analysis storage warning:", storageErr);
      }
    }

    const newHistory = [...history, new Date().toISOString()];
    const remaining = Math.max(0, MAX_REGENERATIONS_PER_DAY - (todayRegens.length + 1));

    await saveCaptureRecord(captureId, {
      aiAnalysis,
      ...(aiAnalysisArtifact ? { aiAnalysisArtifact } : {}),
      aiOptIn: true,
      aiRegenerations: newHistory,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      aiAnalysis,
      remaining,
      limit: MAX_REGENERATIONS_PER_DAY,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
