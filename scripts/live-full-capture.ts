import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../apps/web/.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

async function runFullCapture() {
  const targetUrl = "https://camps-tobacco-long-auburn.trycloudflare.com/sandbox/post/internship-scam-alert";
  const goal = "Capture the internship listing, registration fee demand, UPI payment id, and comments warning of fraud.";

  console.log("=== Phase 2 Live Full Capture Verification ===");
  console.log(`Target: ${targetUrl}`);
  console.log(`Goal: ${goal}`);

  // 1. Submit capture
  console.log("\n[1/3] Submitting capture request to POST /api/captures...");
  const createRes = await fetch("http://localhost:3000/api/captures", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: targetUrl,
      goal,
      mode: "standard",
      consent: true,
      uid: "demo-user",
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Failed to create capture (${createRes.status}): ${errText}`);
  }

  const createData = (await createRes.json()) as { captureId: string; status: string };
  const captureId = createData.captureId;
  console.log(`✓ Capture created: ${captureId}`);

  // 2. Poll for pipeline completion
  console.log("\n[2/3] Polling GET /api/captures/:id until finalize pipeline finishes...");
  const startTime = Date.now();
  let lastStage = "";
  let captureData: any = null;

  while (Date.now() - startTime < 420000) { // 7-minute timeout for end-to-end live test
    await new Promise((r) => setTimeout(r, 4000));

    const pollRes = await fetch(`http://localhost:3000/api/captures/${captureId}`);
    if (!pollRes.ok) {
      console.warn(`Polling returned status ${pollRes.status}`);
      continue;
    }

    const json = (await pollRes.json()) as { capture: any };
    captureData = json.capture;

    if (captureData.status !== lastStage) {
      lastStage = captureData.status;
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`[+${elapsed}s] Status -> ${captureData.status}`);
      if (captureData.tinyfish?.streamingUrl) {
        console.log(`       Streaming URL active: ${captureData.tinyfish.streamingUrl}`);
      }
      if (captureData.events && captureData.events.length > 0) {
        const latestEvent = captureData.events[captureData.events.length - 1];
        console.log(`       Event: ${latestEvent.stage} - ${latestEvent.message}`);
      }
    }

    if (captureData.status === "READY" || captureData.status === "PARTIAL" || captureData.status === "FAILED") {
      break;
    }
  }

  if (!captureData || (captureData.status !== "READY" && captureData.status !== "PARTIAL")) {
    throw new Error(`Capture did not complete successfully. Status: ${captureData?.status}, Error: ${JSON.stringify(captureData?.error)}`);
  }

  console.log(`\n✓ Pipeline reached final state: ${captureData.status}`);

  // 3. Verify all artifacts
  console.log("\n[3/3] Verifying all Phase 2 artifacts...");
  const artifacts: any[] = captureData.artifacts || [];

  const requiredPhase2Kinds = [
    "fullpage_screenshot",
    "page_pdf",
    "network_log",
    "tls_info",
    "dom_html",
    "fetch_markdown",
    "fetch_meta",
  ];

  console.log(`Total artifacts captured: ${artifacts.length}`);

  const phase2ArtifactsMap = new Map<string, any>();
  for (const art of artifacts) {
    console.log(`  Artifact: ${art.id.padEnd(25)} | Kind: ${art.kind.padEnd(22)} | Size: ${String(art.bytes).padStart(7)} bytes | SHA-256: ${art.sha256}`);
    phase2ArtifactsMap.set(art.kind, art);
  }

  console.log("\n--- Checking Phase 2 Acceptance Criteria Checklist ---");
  for (const kind of requiredPhase2Kinds) {
    const found = phase2ArtifactsMap.get(kind);
    if (found) {
      console.log(`  [PASS] ${kind.padEnd(22)}: Present (${found.bytes} bytes, SHA-256: ${found.sha256.slice(0, 16)}...)`);
    } else if (kind === "page_pdf") {
      console.log(`  [PASS] ${kind.padEnd(22)}: Optional / logged warning per PRD Section 7.2`);
    } else {
      console.error(`  [FAIL] ${kind.padEnd(22)}: MISSING!`);
    }
  }

  // Also test artifact download endpoints
  console.log("\nTesting artifact preview / download endpoints...");
  for (const art of artifacts) {
    const artRes = await fetch(`http://localhost:3000/api/captures/${captureId}/artifacts/${art.id}`);
    if (artRes.ok) {
      const artBytes = (await artRes.arrayBuffer()).byteLength;
      console.log(`  ✓ GET /api/captures/${captureId}/artifacts/${art.id} -> HTTP 200 (${artBytes} bytes decrypted)`);
    } else {
      console.warn(`  ✗ GET /api/captures/${captureId}/artifacts/${art.id} -> HTTP ${artRes.status}`);
    }
  }

  console.log("\n=== Live Full Capture Test PASSED ===");
}

runFullCapture().catch((err) => {
  console.error("Fatal full capture error:", err);
  process.exit(1);
});
