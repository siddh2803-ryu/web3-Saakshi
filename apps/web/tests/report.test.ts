import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import {
  saveCaptureRecord,
  getCaptureRecord,
  saveArtifactRecord,
  listArtifactRecords,
} from "../lib/firebase/admin";
import { POST as regenerateHandler } from "../app/api/captures/[id]/regenerate-analysis/route";
import { OFFICIAL_REPORTING_CHANNELS, getChannelById } from "../lib/ai/channels";
import { AiAnalysisSchema } from "../lib/ai/schema";
import { runFinalizePipeline } from "../lib/pipeline/finalize";
import { generateDek, wrapDek } from "../lib/evidence/crypto";

const MAX_REGENERATIONS_PER_DAY = 3;

describe("Phase 7 Part 2: Report Tab & Regenerate Route Tests", () => {
  const testCaptureId = "cap_report_test_001";
  const origEnv = { ...process.env };

  beforeEach(async () => {
    process.env = { ...origEnv };
    process.env.TINYFISH_MODE = "fixture";
    process.env.AI_FALLBACK = "dev";
    process.env.IPFS_FALLBACK = "dev";
    process.env.MASTER_KEY_B64 = "DoJBQTTy+d9ncfCa7etwiFCqD+QNlp9MlfBslTwxYQ4=";

    const dek = generateDek();
    const wrappedDek = wrapDek(dek);

    await saveCaptureRecord(testCaptureId, {
      id: testCaptureId,
      ownerUid: "test_user_report",
      url: "https://chirp.local/sandbox/post/internship-scam-alert",
      finalUrl: "https://chirp.local/sandbox/post/internship-scam-alert",
      status: "READY",
      wrappedDek,
      aiOptIn: true,
      aiRegenerations: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await saveArtifactRecord(testCaptureId, {
      id: "art_fetch_markdown",
      kind: "fetch_markdown",
      mime: "text/markdown",
      content: "# Fake Internship\nPay Rs 2500 for interview slot.",
      bytes: 50,
      sha256: "0000000000000000000000000000000000000000000000000000000000000001",
      cid: "bafy_mock_fetch",
    });
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("regenerate route returns 404 for unknown capture", async () => {
    const req = new NextRequest("http://localhost:3000/api/captures/cap_unknown/regenerate-analysis", {
      method: "POST",
    });
    const res = await regenerateHandler(req, { params: { id: "cap_unknown" } });
    expect(res.status).toBe(404);
  });

  it("regenerate route returns 400 for unfinalized capture", async () => {
    await saveCaptureRecord("cap_running", {
      id: "cap_running",
      status: "AGENT_RUNNING",
    });

    const req = new NextRequest("http://localhost:3000/api/captures/cap_running/regenerate-analysis", {
      method: "POST",
    });
    const res = await regenerateHandler(req, { params: { id: "cap_running" } });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("not in a finalized state");
  });

  it("successfully regenerates analysis and decrements daily remaining limit", async () => {
    const req = new NextRequest(`http://localhost:3000/api/captures/${testCaptureId}/regenerate-analysis`, {
      method: "POST",
    });
    const res = await regenerateHandler(req, { params: { id: testCaptureId } });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.aiAnalysis).toBeDefined();
    expect(data.remaining).toBe(2);
    expect(data.limit).toBe(MAX_REGENERATIONS_PER_DAY);

    const updated = await getCaptureRecord(testCaptureId);
    expect(updated.aiRegenerations.length).toBe(1);
  });

  it("enforces strict limit of 3 regenerations per capture per day (HTTP 429)", async () => {
    // Fill quota for today (3 calls)
    const now = new Date().toISOString();
    await saveCaptureRecord(testCaptureId, {
      aiRegenerations: [now, now, now],
    });

    const req = new NextRequest(`http://localhost:3000/api/captures/${testCaptureId}/regenerate-analysis`, {
      method: "POST",
    });
    const res = await regenerateHandler(req, { params: { id: testCaptureId } });
    expect(res.status).toBe(429);

    const data = await res.json();
    expect(data.remaining).toBe(0);
    expect(data.error).toContain("Daily regeneration limit reached");
  });

  it("allows regenerations if previous attempts occurred on a prior day", async () => {
    // 3 attempts from yesterday
    const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    await saveCaptureRecord(testCaptureId, {
      aiRegenerations: [yesterday, yesterday, yesterday],
    });

    const req = new NextRequest(`http://localhost:3000/api/captures/${testCaptureId}/regenerate-analysis`, {
      method: "POST",
    });
    const res = await regenerateHandler(req, { params: { id: testCaptureId } });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.remaining).toBe(2);
  });

  it("guarantees ai_analysis.json is NOT in the anchored manifest (FR-9.3)", async () => {
    const pipelineCapId = "cap_manifest_check_001";
    await saveCaptureRecord(pipelineCapId, {
      id: pipelineCapId,
      ownerUid: "test-user-manifest",
      url: "https://chirp.local/sandbox/post/internship-scam-alert",
      finalUrl: "https://chirp.local/sandbox/post/internship-scam-alert",
      goal: "Preserve post.",
      mode: "standard",
      status: "AGENT_DONE",
      aiOptIn: true,
      tinyfish: {
        runId: "run_manifest_check",
        startedAt: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const success = await runFinalizePipeline(pipelineCapId);
    expect(success).toBe(true);

    const cap = await getCaptureRecord(pipelineCapId);
    expect(cap.manifest).toBeDefined();

    // The anchored manifest.artifacts array MUST NOT contain ai_analysis
    const hasAiInManifest = cap.manifest.artifacts.some(
      (art: any) => art.id === "art_ai_analysis" || art.kind === "ai_analysis"
    );
    expect(hasAiInManifest).toBe(false);

    // But ai_analysis is preserved in the database and encrypted
    expect(cap.aiAnalysisArtifact).toBeDefined();
    expect(cap.aiAnalysisArtifact.isDerivative).toBe(true);
    expect(cap.aiAnalysisArtifact.sha256).toBeDefined();

    const storedArtifacts = await listArtifactRecords(pipelineCapId);
    const aiStored = storedArtifacts.find((a) => a.id === "art_ai_analysis");
    expect(aiStored).toBeDefined();
    expect(aiStored.isDerivative).toBe(true);
  });

  it("validates official reporting channel link integrity and text-only channels", () => {
    // ncrp, nch, ejagriti have official https URLs
    expect(getChannelById("ncrp")?.url).toMatch(/^https:\/\//);
    expect(getChannelById("nch")?.url).toMatch(/^https:\/\//);
    expect(getChannelById("ejagriti")?.url).toMatch(/^https:\/\//);

    // text-only channels have no URL
    expect(getChannelById("platform_go")?.url).toBeUndefined();
    expect(getChannelById("police")?.url).toBeUndefined();

    // helplines are text strings
    expect(getChannelById("ncrp")?.helpline).toBe("1930");
    expect(getChannelById("nch")?.helpline).toBe("1915");
    expect(getChannelById("police")?.helpline).toBe("112");
  });

  it("verifies complaint drafts and mandatory caveats are valid in schema", () => {
    const validData = {
      summary_en: "Observed illegal scam solicitation.",
      summary_hi: "देखी गई अवैध घोटाला याचना।",
      content_type: "job_offer" as const,
      parties: [{ role: "author" as const, name: "Scammer", handle: "@badguy" }],
      key_claims: ["Guaranteed job upon Rs 2000 payment."],
      timestamps_found: [{ text: "Today at 9 AM", context: "Message timestamp" }],
      possible_issue_categories: [
        {
          category: "fake_job" as const,
          confidence: "high" as const,
          rationale: "Upfront fee solicited for job application.",
        },
      ],
      suggested_channel_ids: ["ncrp", "nch"],
      complaint_draft_en: "To the Portal Officer,\n\nI am reporting a fake job offer...",
      complaint_draft_hi: "सेवा में,\n\nमैं फर्जी नौकरी की शिकायत दर्ज कर रहा हूँ...",
      repost_phrases: ["Guaranteed job upon Rs 2000"],
      caveats: [
        "AI-generated drafting assistance, not certified legal advice.",
        "Please replace placeholders like [Your Name] before submission.",
      ],
    };

    const parsed = AiAnalysisSchema.parse(validData);
    expect(parsed.complaint_draft_en).toContain("To the Portal Officer");
    expect(parsed.complaint_draft_hi).toContain("सेवा में");
    expect(parsed.caveats.length).toBe(2);
  });
});
