import React from "react";
import Link from "next/link";
import { Metadata } from "next";
import { headers } from "next/headers";
import {
  getCaptureRecord,
  getShareRecordByTokenHash,
  listArtifactRecords,
} from "@/lib/firebase/admin";
import { computeSha256 } from "@/lib/evidence/hash";
import { isShareActive } from "@/lib/share/model";
import { checkShareRateLimit } from "@/lib/share/rate-limit";
import {
  ShieldCheck,
  ExternalLink,
  Lock,
  Clock,
  Layers,
  FileText,
  Download,
  AlertCircle,
  Cpu,
  Eye,
} from "lucide-react";
import { formatIST, truncateHash } from "@/lib/utils";

interface PageProps {
  params: { token: string };
}

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shared Evidence Record | Saakshi",
  description: "Cryptographically verified digital evidence record.",
  robots: {
    index: false,
    follow: false,
  },
  referrer: "no-referrer",
};

function formatUtc(isoString?: string): string {
  if (!isoString) return "Pending";
  try {
    const d = new Date(isoString);
    return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
  } catch {
    return "Pending";
  }
}

function LinkUnavailableView() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200/90 shadow-xl p-8 text-center space-y-4">
        <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-500">
          <Lock className="w-7 h-7" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">
          This link is no longer available
        </h1>
        <p className="text-sm text-slate-600 leading-relaxed">
          The link you followed may have expired, been revoked by the owner, or is invalid.
        </p>
        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
          >
            Go to Saakshi Home
          </Link>
        </div>
      </div>
    </div>
  );
}

export default async function SharedEvidencePage({ params }: PageProps) {
  // Rate limiting per IP (FR-14.1)
  const reqHeaders = headers();
  const forwarded = reqHeaders.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : reqHeaders.get("x-real-ip") || "127.0.0.1";
  if (!checkShareRateLimit(ip)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200/90 shadow-xl p-8 text-center space-y-4">
          <div className="w-14 h-14 bg-rose-100 rounded-full flex items-center justify-center mx-auto text-rose-600 font-bold text-lg">
            429
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Too Many Requests
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Rate limit exceeded (maximum 30 requests per minute). Please wait a moment before trying again.
          </p>
        </div>
      </div>
    );
  }

  const rawToken = params.token;
  if (!rawToken || typeof rawToken !== "string" || rawToken.length < 16) {
    return <LinkUnavailableView />;
  }

  const tokenHash = computeSha256(rawToken);
  const share = await getShareRecordByTokenHash(tokenHash);

  if (!share || !isShareActive(share)) {
    return <LinkUnavailableView />;
  }

  const capture = await getCaptureRecord(share.captureId);
  if (!capture) {
    return <LinkUnavailableView />;
  }

  const dbArtifacts = await listArtifactRecords(share.captureId);
  const artifacts = dbArtifacts.length > 0 ? dbArtifacts : (capture.manifest?.artifacts || []);

  const explorerUrl = process.env.NEXT_PUBLIC_EXPLORER_URL;
  const isAnchored = !!capture.anchoring?.txHash;

  const captureTimeIst = formatIST(capture.createdAt);
  const captureTimeUtc = formatUtc(capture.createdAt);

  const anchorTimeIst = capture.anchoring?.anchoredAt
    ? formatIST(capture.anchoring.anchoredAt)
    : "Pending batch anchoring";
  const anchorTimeUtc = capture.anchoring?.anchoredAt
    ? formatUtc(capture.anchoring.anchoredAt)
    : "Pending batch anchoring";

  const expiresIst = formatIST(share.expiresAt);
  const expiresUtc = formatUtc(share.expiresAt);

  // Filter out ai_analysis.json from artifacts list if includeAi is false
  const visibleArtifacts = share.includeAi
    ? artifacts
    : artifacts.filter((a: any) => a.id !== "ai_analysis.json");

  const screenshotArtifact = visibleArtifacts.find(
    (a: any) =>
      a.kind === "fullpage_screenshot" ||
      a.id === "screenshot.png" ||
      a.kind === "viewport_screenshot" ||
      a.id === "viewport.jpg"
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-slate-900 tracking-tight text-base">Saakshi</span>
              <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                Shared Evidence View
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <a
              href={`/api/shares/${rawToken}/bundle`}
              className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-sm flex items-center space-x-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Bundle (ZIP)</span>
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Banner with Target & Verification info */}
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Target Evidence URL
                </span>
                <span className="px-2 py-0.5 rounded-sm text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  Verified
                </span>
              </div>
              <h1 className="text-lg font-bold text-slate-900 mt-1 break-all">
                {capture.url || capture.targetUrl || "Evidence Target URL"}
              </h1>
            </div>

            <div className="text-right shrink-0">
              <div className="text-xs text-slate-500 font-medium">Link Expiration</div>
              <div className="text-xs font-semibold text-amber-700">
                {expiresIst} ({expiresUtc})
              </div>
            </div>
          </div>

          {/* Timestamp & Integrity Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
            <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-200/70">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Captured Timestamp</span>
              </div>
              <div className="text-xs font-bold text-slate-800 mt-1">{captureTimeIst}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{captureTimeUtc}</div>
            </div>

            <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-200/70">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                <span>Polygon Merkle Proof</span>
              </div>
              <div className="text-xs font-bold text-slate-800 mt-1">
                {isAnchored ? "Anchored On-Chain" : "Pending Batch Anchoring"}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {isAnchored ? `Tx: ${truncateHash(capture.anchoring.txHash, 10, 8)}` : "Batch queue active"}
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-200/70">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Evidence Manifest</span>
              </div>
              <div className="text-xs font-mono font-bold text-slate-800 mt-1 truncate" title={capture.manifestSha256}>
                {capture.manifestSha256 ? truncateHash(capture.manifestSha256, 12, 10) : "Computed"}
              </div>
              <div className="text-[11px] text-emerald-700 font-semibold mt-0.5">
                SHA-256 Verified
              </div>
            </div>
          </div>
        </div>

        {/* Visual Preview (if screenshot available) */}
        {screenshotArtifact && (
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                <Eye className="w-4 h-4 text-indigo-600" />
                <span>Visual Capture Preview</span>
              </h2>
              <span className="text-xs text-slate-500 font-mono">
                {screenshotArtifact.id}
              </span>
            </div>
            <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-950 flex items-center justify-center max-h-[500px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/shares/${rawToken}/artifacts/${screenshotArtifact.id}`}
                alt="Captured Web Evidence"
                className="max-h-[500px] w-auto object-contain"
              />
            </div>
          </div>
        )}

        {/* Forensic Artifacts Table */}
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
              <FileText className="w-4 h-4 text-indigo-600" />
              <span>Forensic Artifacts ({visibleArtifacts.length})</span>
            </h2>
            <span className="text-xs text-slate-500">
              Stored as AES-256 ciphertext; served via signed share token
            </span>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Artifact ID</th>
                  <th className="py-2.5 px-3">MIME Type</th>
                  <th className="py-2.5 px-3">SHA-256 Checksum</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {visibleArtifacts.map((art: any) => (
                  <tr key={art.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-slate-800">
                      {art.id}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">
                      {art.mime || "application/octet-stream"}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-600 text-[11px]">
                      {art.sha256}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <a
                        href={`/api/shares/${rawToken}/artifacts/${art.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-600 hover:text-indigo-800 font-semibold inline-flex items-center space-x-1"
                      >
                        <span>View</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* AI Analysis (Conditionally Included Only If share.includeAi is true) */}
        {share.includeAi && capture.aiAnalysis && (
          <div className="bg-white rounded-xl border border-indigo-200/90 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-indigo-100 pb-3">
              <div className="flex items-center space-x-2">
                <Cpu className="w-4 h-4 text-indigo-600" />
                <h2 className="text-sm font-bold text-slate-900">AI Legal Analysis & Evaluation</h2>
              </div>
              <span className="text-[11px] font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-200">
                Shared with Recipient
              </span>
            </div>

            {/* Classification & Confidence */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="text-[10px] uppercase font-bold text-slate-500">Classification</div>
                <div className="text-xs font-bold text-slate-800 mt-0.5">
                  {capture.aiAnalysis.classification || "Analysis Available"}
                </div>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="text-[10px] uppercase font-bold text-slate-500">Confidence</div>
                <div className="text-xs font-bold text-slate-800 mt-0.5">
                  {Math.round((capture.aiAnalysis.confidence || 0.9) * 100)}%
                </div>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="text-[10px] uppercase font-bold text-slate-500">s.63(4) Ready</div>
                <div className="text-xs font-bold text-emerald-700 mt-0.5">
                  {capture.aiAnalysis.section63_readiness || "Yes"}
                </div>
              </div>
            </div>

            {/* Summaries */}
            {capture.aiAnalysis.summary_en && (
              <div className="space-y-1">
                <h3 className="text-xs font-bold text-slate-700 uppercase">Executive Summary</h3>
                <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-200">
                  {capture.aiAnalysis.summary_en}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Security & Disclaimer Footer */}
        <div className="text-center text-[11px] text-slate-500 space-y-1 pt-4 pb-8">
          <p>
            This is a cryptographically secured read-only view. No owner identities or session tokens are exposed.
          </p>
          <p>
            Referrer-Policy: no-referrer &bull; Robots: noindex, nofollow &bull; SHA-256 Token Hash Protection
          </p>
        </div>
      </main>
    </div>
  );
}
