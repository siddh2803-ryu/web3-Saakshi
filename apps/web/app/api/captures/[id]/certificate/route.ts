import { NextRequest, NextResponse } from "next/server";
import { getCaptureRecord } from "@/lib/firebase/admin";
import { renderCertificatePdf } from "@/lib/pdf/certificate";
import QRCode from "qrcode";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const captureId = params.id;
    const capture = await getCaptureRecord(captureId);

    if (!capture || !capture.manifest) {
      return new NextResponse(
        JSON.stringify({ error: "Capture not found or not finalized." }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Owner-only authorization check
    const requesterUid =
      req.headers.get("x-user-uid")?.trim() ||
      new URL(req.url).searchParams.get("uid")?.trim() ||
      (req.headers.get("authorization")?.startsWith("Bearer ")
        ? req.headers.get("authorization")!.slice(7).trim()
        : null) ||
      "demo-user";

    if (capture.ownerUid && capture.ownerUid !== "anonymous") {
      if (requesterUid !== capture.ownerUid) {
        return new NextResponse(
          JSON.stringify({
            error: "Forbidden: Only the owner of this capture can download the s.63(4) certificate.",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const verifyUrl = `${appUrl}/v/${captureId}`;
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 200 }).catch(
      () => null
    );

    const pdfBuffer = await renderCertificatePdf(
      capture.manifest,
      capture.manifestSha256,
      capture.anchoring,
      qrDataUrl
    );

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="certificate_part_a_draft_${captureId}.pdf"`,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Certificate generation error:", err);
    return new NextResponse(
      JSON.stringify({ error: `Error generating certificate: ${msg}` }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
