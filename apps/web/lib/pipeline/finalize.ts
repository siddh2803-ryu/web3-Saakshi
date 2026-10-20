import {
  acquireFinalizeLock,
  releaseFinalizeLock,
  getCaptureRecord,
  saveCaptureRecord,
  saveArtifactRecord,
} from "@/lib/firebase/admin";
import { getAgentRun, isRunBlockedOrPartial } from "@/lib/tinyfish/agent";
import { captureWithBrowserApi } from "@/lib/tinyfish/browser";
import { fetchCleanText } from "@/lib/tinyfish/fetch";
import { computeSha256 } from "@/lib/evidence/hash";
import { normalizeText } from "@/lib/evidence/normalize";
import {
  generateDek,
  encryptWithKey,
  wrapDek,
} from "@/lib/evidence/crypto";
import { uploadBufferToIpfs, uploadJsonToIpfs } from "@/lib/evidence/ipfs";
import {
  EvidenceManifest,
  ManifestArtifact,
  computeManifestSha256,
  hashUid,
} from "@/lib/evidence/manifest";
import { analyzeEvidenceWithGemini } from "@/lib/ai/gemini";
import { CaptureStatus, PipelineStageEvent } from "./stages";

interface RawArtifact {
  id: string;
  kind: ManifestArtifact["kind"];
  mime: string;
  plaintextBuffer: Buffer;
  stepIndex?: number;
  stepId?: string;
  action?: string;
  capturedAt: string;
}

export async function runFinalizePipeline(captureId: string): Promise<boolean> {
  const locked = await acquireFinalizeLock(captureId);
  if (!locked) {
    console.log(`Finalize already in progress or completed for capture: ${captureId}`);
    return false;
  }

  const events: PipelineStageEvent[] = [];
  const logStage = async (stage: CaptureStatus, message: string) => {
    const event: PipelineStageEvent = { stage, message, at: new Date().toISOString() };
    events.push(event);
    await saveCaptureRecord(captureId, { status: stage, events });
  };

  try {
    const capture = await getCaptureRecord(captureId);
    if (!capture) {
      throw new Error(`Capture record ${captureId} not found`);
    }

    const targetUrl = capture.url;
    const runId = capture.tinyfish?.runId;

    // 1. Pull Agent Steps with base64 screenshots
    await logStage("AGENT_DONE", "Retrieving agent step trace and screenshots...");
    let agentRun = null;
    let isPartial = false;
    let partialReason = "";

    if (runId) {
      agentRun = await getAgentRun(runId, true);
      const blockedCheck = isRunBlockedOrPartial(agentRun.result);
      if (blockedCheck.isBlocked) {
        isPartial = true;
        partialReason = blockedCheck.reason || "Target was restricted";
      }
    }

    const rawArtifacts: RawArtifact[] = [];

    // Store agent step screenshots
    if (agentRun?.steps && agentRun.steps.length > 0) {
      agentRun.steps.forEach((step, idx) => {
        if (step.screenshot) {
          // Convert base64 data URI to Buffer
          const base64Data = step.screenshot.replace(/^data:image\/\w+;base64,/, "");
          const buf = Buffer.from(base64Data, "base64");
          rawArtifacts.push({
            id: `art_step_${idx + 1}`,
            kind: "agent_step_screenshot",
            mime: "image/jpeg",
            plaintextBuffer: buf,
            stepIndex: idx + 1,
            stepId: step.id,
            action: step.action,
            capturedAt: step.timestamp || new Date().toISOString(),
          });
        }
      });
    }

    // Store agent result JSON
    if (agentRun?.result) {
      const resultBuf = Buffer.from(JSON.stringify(agentRun.result, null, 2), "utf8");
      rawArtifacts.push({
        id: "art_agent_result",
        kind: "agent_result_json",
        mime: "application/json",
        plaintextBuffer: resultBuf,
        capturedAt: new Date().toISOString(),
      });
    }

    // 2. Full-Fidelity Browser API capture
    await logStage("BROWSER_CAPTURE", "Running TinyFish Browser API for full-page snapshot, PDF and network logs...");
    const browserCapture = await captureWithBrowserApi(targetUrl);

    // Fullpage screenshot
    rawArtifacts.push({
      id: "art_fullpage_screenshot",
      kind: "fullpage_screenshot",
      mime: "image/png",
      plaintextBuffer: browserCapture.fullpageScreenshot,
      capturedAt: new Date().toISOString(),
    });

    // Optional Page PDF
    if (browserCapture.pagePdf) {
      rawArtifacts.push({
        id: "art_page_pdf",
        kind: "page_pdf",
        mime: "application/pdf",
        plaintextBuffer: browserCapture.pagePdf,
        capturedAt: new Date().toISOString(),
      });
    }

    // DOM HTML
    rawArtifacts.push({
      id: "art_dom_html",
      kind: "dom_html",
      mime: "text/html; charset=utf-8",
      plaintextBuffer: Buffer.from(browserCapture.domHtml, "utf8"),
      capturedAt: new Date().toISOString(),
    });

    // Network log
    rawArtifacts.push({
      id: "art_network_log",
      kind: "network_log",
      mime: "application/json",
      plaintextBuffer: Buffer.from(JSON.stringify(browserCapture.networkLog, null, 2), "utf8"),
      capturedAt: new Date().toISOString(),
    });

    // TLS Info
    if (browserCapture.tlsInfo) {
      rawArtifacts.push({
        id: "art_tls_info",
        kind: "tls_info",
        mime: "application/json",
        plaintextBuffer: Buffer.from(JSON.stringify(browserCapture.tlsInfo, null, 2), "utf8"),
        capturedAt: new Date().toISOString(),
      });
    }

    // 3. TinyFish Fetch clean markdown
    await logStage("FETCHING", "Fetching clean text and markdown structure via TinyFish Fetch...");
    const fetchResult = await fetchCleanText(browserCapture.finalUrl || targetUrl);

    rawArtifacts.push({
      id: "art_fetch_markdown",
      kind: "fetch_markdown",
      mime: "text/markdown; charset=utf-8",
      plaintextBuffer: Buffer.from(fetchResult.text, "utf8"),
      capturedAt: new Date().toISOString(),
    });

    rawArtifacts.push({
      id: "art_fetch_meta",
      kind: "fetch_meta",
      mime: "application/json",
      plaintextBuffer: Buffer.from(JSON.stringify(fetchResult, null, 2), "utf8"),
      capturedAt: new Date().toISOString(),
    });

    // 4. Fingerprint and Encrypt Artifacts
    await logStage("FINGERPRINTING", "Computing SHA-256 fingerprints on plaintext bytes...");
    const normalizedFetchText = normalizeText(fetchResult.text);
    const contentHash = computeSha256(normalizedFetchText);

    await logStage("ENCRYPTING", "Generating 256-bit DEK and applying AES-256-GCM envelope encryption...");
    const dek = generateDek();
    const wrappedDek = wrapDek(dek);

    await logStage("UPLOADING", "Pinning encrypted artifacts to IPFS...");
    const manifestArtifacts: ManifestArtifact[] = [];

    for (const art of rawArtifacts) {
      // Step A: Hash plaintext bytes
      const plaintextSha256 = computeSha256(art.plaintextBuffer);

      // Step B: Encrypt with DEK
      const encrypted = encryptWithKey(art.plaintextBuffer, dek);

      // Step C: Upload ciphertext to IPFS
      const upload = await uploadBufferToIpfs(
        encrypted.ciphertext,
        `saakshi_${captureId}_${art.id}.enc`
      );

      // Save artifact metadata in database
      const artifactRecord = {
        id: art.id,
        kind: art.kind,
        stepIndex: art.stepIndex,
        stepId: art.stepId,
        action: art.action,
        mime: art.mime,
        bytes: art.plaintextBuffer.length,
        sha256: plaintextSha256,
        cid: upload.cid,
        iv: encrypted.ivHex,
        authTag: encrypted.authTagHex,
        capturedAt: art.capturedAt,
      };
      await saveArtifactRecord(captureId, artifactRecord);

      manifestArtifacts.push({
        id: art.id,
        kind: art.kind,
        stepIndex: art.stepIndex,
        stepId: art.stepId,
        action: art.action,
        mime: art.mime,
        bytes: art.plaintextBuffer.length,
        sha256: plaintextSha256,
        cid: upload.cid,
        capturedAt: art.capturedAt,
      });
    }

    // 5. Construct Canonical Manifest
    const manifest: EvidenceManifest = {
      schema: "saakshi.evidence/v1",
      captureId,
      previousCaptureId: capture.previousCaptureId || null,
      requester: {
        uidHash: hashUid(capture.ownerUid || "anonymous"),
      },
      target: {
        url: targetUrl,
        finalUrl: browserCapture.finalUrl || targetUrl,
        goal: capture.goal,
        mode: capture.mode || "standard",
      },
      time: {
        serverStartedAt: capture.createdAt || new Date().toISOString(),
        serverFinishedAt: new Date().toISOString(),
        agentStartedAt: capture.tinyfish?.startedAt,
        agentFinishedAt: new Date().toISOString(),
      },
      tools: {
        saakshiVersion: "0.1.0",
        gitCommit: process.env.VERCEL_GIT_COMMIT_SHA || "local-build",
        tinyfish: {
          agentRunId: runId,
          agentSteps: agentRun?.num_of_steps || manifestArtifacts.length,
          browserProfile: "stealth",
          proxyCountry: "US",
        },
      },
      observed: {
        title: browserCapture.pageTitle || fetchResult.title,
        author: agentRun?.result?.author_name || fetchResult.author,
        publishedAtText: agentRun?.result?.published_at_text || fetchResult.publishedDate,
        contentHash,
      },
      artifacts: manifestArtifacts,
      hashAlgorithm: "SHA-256",
      encryption: "AES-256-GCM (cid refers to ciphertext; sha256 refers to plaintext)",
    };

    const { canonicalJsonString, manifestSha256, bytes32Hash } = computeManifestSha256(manifest);

    // Upload canonical manifest to IPFS
    const manifestUpload = await uploadJsonToIpfs(
      canonicalJsonString,
      `saakshi_${captureId}_manifest.json`
    );

    // 6. AI Analysis
    await logStage("ANALYZING", "Running Gemini analysis for factual claims, issue categories and complaint drafts...");
    const aiAnalysis = await analyzeEvidenceWithGemini(
      fetchResult.text,
      agentRun?.result,
      manifest.time.serverFinishedAt
    );

    // Final state: READY or PARTIAL
    const finalStatus: CaptureStatus = isPartial ? "PARTIAL" : "READY";
    await logStage(
      finalStatus,
      isPartial
        ? `Evidence sealed with partial caveat: ${partialReason}`
        : "Evidence sealed, hashed, and ready for blockchain anchoring."
    );

    await saveCaptureRecord(captureId, {
      status: finalStatus,
      finalUrl: browserCapture.finalUrl || targetUrl,
      manifest,
      manifestSha256,
      manifestBytes32: bytes32Hash,
      manifestCid: manifestUpload.cid,
      contentHash,
      wrappedDek,
      artifactCount: manifestArtifacts.length,
      aiAnalysis,
      isPartial,
      partialReason: partialReason || null,
      updatedAt: new Date().toISOString(),
    });

    return true;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`Finalize pipeline failed for capture ${captureId}:`, err);
    await logStage("FAILED", `Pipeline failed: ${errorMsg}`);
    await saveCaptureRecord(captureId, {
      status: "FAILED",
      error: { message: errorMsg, at: new Date().toISOString() },
    });
    return false;
  } finally {
    await releaseFinalizeLock(captureId);
  }
}
