import { NextRequest, NextResponse } from "next/server";
import { getShareRecordByTokenHash, getCaptureRecord, listArtifactRecords } from "@/lib/firebase/admin";
import { computeSha256 } from "@/lib/evidence/hash";
import { isShareActive } from "@/lib/share/model";
import { unwrapDek, decryptWithKey } from "@/lib/evidence/crypto";
import { FIXTURE_BROWSER_CAPTURE, MOCK_JPEG_BASE64 } from "@/lib/tinyfish/fixtures";
import { checkShareRateLimit } from "@/lib/share/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string; artifactId: string } }
) {
  try {
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : req.headers.get("x-real-ip") || "127.0.0.1";
    if (!checkShareRateLimit(ip)) {
      return new NextResponse("Too many requests", {
        status: 429,
        headers: {
          "Retry-After": "60",
          "Referrer-Policy": "no-referrer",
          "X-Robots-Tag": "noindex, nofollow",
        },
      });
    }

    const { token, artifactId } = params;
    const tokenHash = computeSha256(token);
    const share = await getShareRecordByTokenHash(tokenHash);

    if (!share || !isShareActive(share)) {
      return new NextResponse("This link is no longer available", {
        status: 404,
        headers: {
          "Referrer-Policy": "no-referrer",
          "X-Robots-Tag": "noindex, nofollow",
        },
      });
    }

    if (artifactId === "ai_analysis.json" && !share.includeAi) {
      return new NextResponse("This link is no longer available", {
        status: 404,
        headers: {
          "Referrer-Policy": "no-referrer",
          "X-Robots-Tag": "noindex, nofollow",
        },
      });
    }

    const capture = await getCaptureRecord(share.captureId);
    if (!capture) {
      return new NextResponse("This link is no longer available", {
        status: 404,
        headers: {
          "Referrer-Policy": "no-referrer",
          "X-Robots-Tag": "noindex, nofollow",
        },
      });
    }

    const artifacts = await listArtifactRecords(share.captureId);
    const artifact = artifacts.find((a: any) => a.id === artifactId);
    if (!artifact) {
      return new NextResponse("This link is no longer available", {
        status: 404,
        headers: {
          "Referrer-Policy": "no-referrer",
          "X-Robots-Tag": "noindex, nofollow",
        },
      });
    }

    if (process.env.TINYFISH_MODE === "fixture" || !capture.wrappedDek) {
      if (artifact.mime.startsWith("image/")) {
        const buf = artifact.kind === "fullpage_screenshot"
          ? FIXTURE_BROWSER_CAPTURE.fullpageScreenshot
          : Buffer.from(MOCK_JPEG_BASE64.replace(/^data:image\/\w+;base64,/, ""), "base64");
        return new NextResponse(new Uint8Array(buf), {
          headers: {
            "Content-Type": artifact.mime,
            "Referrer-Policy": "no-referrer",
            "X-Robots-Tag": "noindex, nofollow",
          },
        });
      }
      return new NextResponse("Preview fixture data", {
        headers: {
          "Content-Type": artifact.mime,
          "Referrer-Policy": "no-referrer",
          "X-Robots-Tag": "noindex, nofollow",
        },
      });
    }

    const dek = unwrapDek(capture.wrappedDek);
    const gateway = process.env.PINATA_GATEWAY || "https://gateway.pinata.cloud/ipfs";
    const ipfsRes = await fetch(`${gateway}/${artifact.cid}`);

    let ciphertext: Buffer;
    if (ipfsRes.ok) {
      const arrayBuf = await ipfsRes.arrayBuffer();
      ciphertext = Buffer.from(arrayBuf);
    } else {
      ciphertext = Buffer.from("simulated ciphertext");
    }

    const aad = `${share.captureId}:${artifact.id}`;
    const plaintext = decryptWithKey(ciphertext, dek, artifact.iv, artifact.authTag, aad);

    return new NextResponse(new Uint8Array(plaintext), {
      headers: {
        "Content-Type": artifact.mime || "application/octet-stream",
        "Content-Disposition": `inline; filename="${artifact.id}"`,
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new NextResponse(`Error: ${msg}`, { status: 500 });
  }
}
