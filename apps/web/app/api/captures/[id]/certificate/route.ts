import { NextRequest, NextResponse } from "next/server";
import { getCaptureRecord } from "@/lib/firebase/admin";
import { renderCertificatePdf } from "@/lib/pdf/certificate";
import QRCode from "qrcode";

export const maxDuration = 300;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const captureId = params.id;
    const capture = await getCaptureRecord(captureId);

    if (!capture || !capture.manifest) {
      return new NextResponse("Capture not found or not finalized", { status: 404 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const verifyUrl = `${appUrl}/v/${captureId}`;
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 200 }).catch(() => null);

    const pdfBuffer = await renderCertificatePdf(
      capture.manifest,
      capture.manifestSha256,
      capture.anchoring,
      qrDataUrl
    );

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="certificate_part_a_${captureId}.pdf"`,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Certificate generation error:", err);
    return new NextResponse(`Error generating certificate: ${msg}`, { status: 500 });
  }
}
