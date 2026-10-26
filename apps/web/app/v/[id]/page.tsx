import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCaptureRecord, listArtifactRecords } from "@/lib/firebase/admin";
import QRCode from "qrcode";
import { ShieldCheck, ExternalLink, Download, Layers, CheckCircle2, ArrowRight } from "lucide-react";
import { formatIST, truncateHash } from "@/lib/utils";

interface PageProps {
  params: { id: string };
}

export const dynamic = "force-dynamic";

export default async function PublicProofPage({ params }: PageProps) {
  const captureId = params.id;
  const capture = await getCaptureRecord(captureId);

  if (!capture) {
    return notFound();
  }

  const artifacts = await listArtifactRecords(captureId);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const verifyUrl = `${appUrl}/v/${captureId}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 220 }).catch(() => null);

  return (
    <div className="min-h-[calc(100vh-4rem)] py-12 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto">
      {/* Header Badge */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-md bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold mb-3">
          <ShieldCheck className="w-4 h-4 text-emerald-700" />
          <span>Public Web Evidence Record</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Immutable Evidence Certificate
        </h1>
        <p className="text-xs text-slate-500 font-mono mt-1">Capture ID: {capture.id}</p>
      </div>

      {/* Main Certificate Card */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-6 sm:p-8 shadow-sm space-y-6">
        {/* Verification Summary Banner */}
        <div className="p-4 bg-emerald-50/70 border border-emerald-300 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center space-x-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 shrink-0" />
            <div>
              <h2 className="text-sm font-bold text-emerald-950">
                Anchored to Polygon Blockchain
              </h2>
              <p className="text-xs text-emerald-800 mt-0.5">
                Timestamped in block #{capture.anchoring?.blockNumber || "Pending"} at {formatIST(capture.anchoring?.anchoredAt || capture.createdAt)}
              </p>
            </div>
          </div>
          <Link
            href="/verify"
            className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg text-center shadow-sm transition-colors whitespace-nowrap"
          >
            Verify a File Against This Record
          </Link>
        </div>

        {/* Target Details */}
        <div className="space-y-3 pt-2">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Preserved Subject
          </h3>
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-2">
            <div>
              <span className="font-semibold text-slate-700">Page Title: </span>
              <span className="text-slate-900 font-bold">{capture.manifest?.observed?.title || "Observed Web Publication"}</span>
            </div>
            <div>
              <span className="font-semibold text-slate-700">Target URI: </span>
              <span className="text-slate-600 font-mono break-all">{capture.url}</span>
            </div>
            <div>
              <span className="font-semibold text-slate-700">Time of Capture: </span>
              <span className="text-slate-900">{formatIST(capture.createdAt)}</span>
            </div>
          </div>
        </div>

        {/* Cryptographic Proof Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
          <div className="space-y-4 text-xs">
            <div>
              <span className="font-semibold text-slate-500 block mb-1">Manifest SHA-256:</span>
              <span className="p-2 bg-slate-50 border border-slate-200 rounded-lg block font-mono break-all text-slate-800">
                {capture.manifestSha256}
              </span>
            </div>
            <div>
              <span className="font-semibold text-slate-500 block mb-1">Merkle Root:</span>
              <span className="p-2 bg-slate-50 border border-slate-200 rounded-lg block font-mono break-all text-slate-800">
                {capture.anchoring?.root || "Pending"}
              </span>
            </div>
            {capture.anchoring?.txHash && (
              <div>
                <span className="font-semibold text-slate-500 block mb-1">Transaction Hash:</span>
                <a
                  href={`https://amoy.polygonscan.com/tx/${capture.anchoring.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 bg-slate-50 border border-slate-200 rounded-lg block font-mono break-all text-blue-700 hover:underline flex items-center justify-between"
                >
                  <span>{capture.anchoring.txHash}</span>
                  <ExternalLink className="w-3.5 h-3.5 ml-2 shrink-0" />
                </a>
              </div>
            )}
          </div>

          {/* QR Code */}
          <div className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-xl border border-slate-200 text-center">
            {qrDataUrl && (
              <img
                src={qrDataUrl}
                alt="QR Code for Public Proof"
                width={144}
                height={144}
                className="w-36 h-36 rounded-lg border border-slate-200 shadow-sm"
              />
            )}
            <span className="text-[11px] font-semibold text-slate-600 mt-2">
              Scan to inspect or verify proof on-chain
            </span>
          </div>
        </div>

        {/* Artifacts Table */}
        <div className="pt-4 border-t border-slate-100 space-y-3">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Preserved Artifacts &amp; SHA-256 Fingerprints ({artifacts.length})
          </h3>
          <div className="divide-y divide-slate-100 text-xs">
            {artifacts.map((art: any) => (
              <div key={art.id} className="py-2.5 flex items-center justify-between gap-4 font-mono">
                <div>
                  <span className="font-bold text-slate-900">{art.id}</span>{" "}
                  <span className="text-slate-400">({art.kind})</span>
                  <div className="text-[11px] text-slate-600 break-all select-all">{art.sha256}</div>
                </div>
                <span className="text-[10px] text-slate-400 shrink-0">{(art.bytes / 1024).toFixed(1)} KB</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
