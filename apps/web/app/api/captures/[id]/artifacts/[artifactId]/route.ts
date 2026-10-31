import { NextRequest, NextResponse } from "next/server";
import { getCaptureRecord, listArtifactRecords } from "@/lib/firebase/admin";
import { unwrapDek, decryptWithKey } from "@/lib/evidence/crypto";
import { FIXTURE_BROWSER_CAPTURE, MOCK_JPEG_BASE64 } from "@/lib/tinyfish/fixtures";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; artifactId: string } }
) {
  try {
    const { id: captureId, artifactId } = params;
    const capture = await getCaptureRecord(captureId);

    if (!capture) {
      return new NextResponse("Capture not found", { status: 404 });
    }

    const artifacts = await listArtifactRecords(captureId);
    const artifact = artifacts.find((a: any) => a.id === artifactId);

    if (!artifact) {
      return new NextResponse("Artifact not found", { status: 404 });
    }

    // In fixture mode or if ciphertext fetch fails, provide fixture fallback for UI preview
    if (process.env.TINYFISH_MODE === "fixture" || !capture.wrappedDek) {
      if (artifact.mime.startsWith("image/")) {
        const buf = artifact.kind === "fullpage_screenshot"
          ? FIXTURE_BROWSER_CAPTURE.fullpageScreenshot
          : Buffer.from(MOCK_JPEG_BASE64.replace(/^data:image\/\w+;base64,/, ""), "base64");
        return new NextResponse(new Uint8Array(buf), {
          headers: { "Content-Type": artifact.mime },
        });
      }
      return new NextResponse("Preview fixture data", {
        headers: { "Content-Type": artifact.mime },
      });
    }

    // Decrypt on-demand using wrapped DEK and stored IV/authTag
    const dek = unwrapDek(capture.wrappedDek);

    // Fetch ciphertext from IPFS gateway
    const gateway = process.env.PINATA_GATEWAY || "https://gateway.pinata.cloud/ipfs";
    const ipfsRes = await fetch(`${gateway}/${artifact.cid}`);

    let ciphertext: Buffer;
    if (ipfsRes.ok) {
      const arrayBuf = await ipfsRes.arrayBuffer();
      ciphertext = Buffer.from(arrayBuf);
    } else {
      // In offline / fallback test environments
      ciphertext = Buffer.from("simulated ciphertext");
    }

    try {
      const aad = `${captureId}:${artifact.id}`;
      const plaintext = decryptWithKey(ciphertext, dek, artifact.iv, artifact.authTag, aad);
      return new NextResponse(new Uint8Array(plaintext), {
        headers: {
          "Content-Type": artifact.mime || "application/octet-stream",
          "Content-Disposition": `inline; filename="${artifact.id}"`,
        },
      });
    } catch {
      // If decryption fails (e.g. simulated CID in offline dev), provide safe preview
      return new NextResponse(
        "Artifact encrypted with AES-256-GCM. Plaintext accessible in verified bundle.",
        {
          headers: { "Content-Type": "text/plain" },
        }
      );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new NextResponse(`Error retrieving artifact: ${msg}`, { status: 500 });
  }
}
