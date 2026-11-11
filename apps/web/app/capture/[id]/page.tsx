"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ShieldCheck,
  ShieldAlert,
  Clock,
  Layers,
  FileText,
  Download,
  Share2,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Play,
  Film,
  Lock,
  Search,
  Activity,
  ArrowRight,
  Trash2,
  Cpu,
} from "lucide-react";
import { formatIST, truncateHash } from "@/lib/utils";
import { OFFICIAL_REPORTING_CHANNELS } from "@/lib/ai/channels";

export default function CaptureDetailPage() {
  const params = useParams();
  const captureId = params.id as string;

  const [capture, setCapture] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [activeTab, setActiveTab] = useState<
    "overview" | "artifacts" | "proof" | "watch" | "report" | "custody"
  >("overview");

  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [anchoringLoading, setAnchoringLoading] = useState(false);
  const [watchChecking, setWatchChecking] = useState(false);
  const [watchToggling, setWatchToggling] = useState(false);
  const [watchSchedule, setWatchSchedule] = useState("0 * * * *");
  const [watchEvents, setWatchEvents] = useState<any[]>([]);
  const [watchDetails, setWatchDetails] = useState<any>(null);
  const [watchError, setWatchError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [overviewLang, setOverviewLang] = useState<"en" | "hi">("en");

  const fetchCapture = useCallback(async () => {
    try {
      const res = await fetch(`/api/captures/${captureId}`);
      if (!res.ok) throw new Error("Capture not found");
      const data = await res.json();
      setCapture(data.capture);

      // Fetch watch details and timeline events
      try {
        const wRes = await fetch(`/api/captures/${captureId}/watch`);
        if (wRes.ok) {
          const wData = await wRes.json();
          setWatchDetails(wData.watch);
          setWatchEvents(wData.events || []);
          if (wData.watch?.scheduleCron) {
            setWatchSchedule(wData.watch.scheduleCron);
          }
        }
      } catch (wErr) {
        console.warn("Failed to fetch watch details:", wErr);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [captureId]);

  useEffect(() => {
    fetchCapture();
    // Poll while capture is still processing
    const interval = setInterval(() => {
      if (
        capture?.status === "QUEUED" ||
        capture?.status === "AGENT_RUNNING" ||
        capture?.status === "BROWSER_CAPTURE" ||
        capture?.status === "FETCHING" ||
        capture?.status === "FINGERPRINTING" ||
        capture?.status === "ENCRYPTING" ||
        capture?.status === "UPLOADING" ||
        capture?.status === "ANALYZING"
      ) {
        fetchCapture();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchCapture, capture?.status]);

  const copyToClipboard = (text: string, type: "hash" | "text") => {
    navigator.clipboard.writeText(text);
    if (type === "hash") {
      setCopiedHash(text);
      setTimeout(() => setCopiedHash(null), 2000);
    } else {
      setCopiedText(text);
      setTimeout(() => setCopiedText(null), 2000);
    }
  };

  const handleAnchorNow = async () => {
    setAnchoringLoading(true);
    try {
      const res = await fetch(`/api/captures/${captureId}/anchor`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        await fetchCapture();
        setActiveTab("proof");
      } else {
        alert(data.error || "Anchoring failed");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAnchoringLoading(false);
    }
  };

  const handleToggleWatch = async () => {
    setWatchToggling(true);
    setWatchError(null);
    try {
      const isCurrentlyActive = Boolean(capture?.isWatching && watchDetails?.state === "active");
      const res = await fetch(`/api/captures/${captureId}/watch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: !isCurrentlyActive,
          scheduleCron: watchSchedule,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWatchError(data.error || "Failed to update watch status");
        return;
      }
      await fetchCapture();
      setActiveTab("watch");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setWatchError(msg || "Failed to toggle watch");
    } finally {
      setWatchToggling(false);
    }
  };

  const handleScheduleChange = async (newSchedule: string) => {
    setWatchSchedule(newSchedule);
    setWatchError(null);
    if (capture?.isWatching && watchDetails?.state === "active") {
      try {
        const res = await fetch(`/api/captures/${captureId}/watch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enabled: true,
            scheduleCron: newSchedule,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setWatchError(data.error || "Failed to update schedule");
        } else {
          await fetchCapture();
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setWatchError(msg || "Failed to update schedule");
      }
    }
  };

  const handleCheckWatchNow = async () => {
    const watchId = capture?.watchId || watchDetails?.id;
    if (!watchId) {
      setWatchError("No active watch configured for this capture.");
      return;
    }
    setWatchChecking(true);
    setWatchError(null);
    try {
      const res = await fetch(`/api/watches/${watchId}/check`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        await fetchCapture();
      } else {
        setWatchError(data.error || "Check now failed");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setWatchError(msg || "Check now failed");
    } finally {
      setWatchChecking(false);
    }
  };

  const handleCreateShare = async () => {
    try {
      const res = await fetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ captureId, duration: "7d" }),
      });
      const data = await res.json();
      if (res.ok) {
        setShareUrl(data.shareUrl);
        copyToClipboard(data.shareUrl, "text");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteCapture = async () => {
    const confirmed = window.confirm(
      "Crypto-Shredding Notice (FR-5.5):\n\n" +
      "Deleting this capture permanently destroys its AES-256 encryption key and unpins all associated files from IPFS.\n\n" +
      "Anchored cryptographic hashes remain on Polygon, but reveal nothing about the content.\n\n" +
      "Are you sure you want to crypto-shred this capture?"
    );
    if (!confirmed) return;

    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/captures/${captureId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete capture");
      setCapture((prev: any) => ({ ...prev, status: "DELETED", wrappedDek: null }));
    } catch (err) {
      alert("Error deleting capture: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-4">
        <div className="w-8 h-8 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-500 font-mono">Loading capture session...</p>
      </div>
    );
  }

  if (errorMsg || !capture) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="bg-white p-6 rounded-xl border border-slate-200 text-center max-w-md shadow-sm">
          <ShieldAlert className="w-8 h-8 text-rose-600 mx-auto mb-2" />
          <h2 className="text-base font-bold text-slate-900">Capture Not Found</h2>
          <p className="text-xs text-slate-500 mt-1">{errorMsg || "Invalid capture ID"}</p>
          <Link
            href="/dashboard"
            className="mt-4 inline-block px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const isRunning =
    capture.status === "QUEUED" ||
    capture.status === "AGENT_RUNNING" ||
    capture.status === "BROWSER_CAPTURE" ||
    capture.status === "FETCHING" ||
    capture.status === "FINGERPRINTING" ||
    capture.status === "ENCRYPTING" ||
    capture.status === "UPLOADING" ||
    capture.status === "ANALYZING";

  return (
    <div className="min-h-[calc(100vh-4rem)] py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Alert Banner for Watch Alteration / Deletion Detection */}
      {capture.watchAlert && (
        <div
          className={`mb-6 p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm ${
            capture.watchAlert.type === "DELETED"
              ? "bg-rose-50 border-rose-300 text-rose-950"
              : "bg-amber-50 border-amber-300 text-amber-950"
          }`}
        >
          <div className="flex items-start space-x-3">
            <AlertTriangle
              className={`w-5 h-5 shrink-0 mt-0.5 ${
                capture.watchAlert.type === "DELETED" ? "text-rose-600" : "text-amber-600"
              }`}
            />
            <div>
              <div className="flex items-center space-x-2">
                <span
                  className={`font-bold text-xs uppercase tracking-wider px-2 py-0.5 rounded border ${
                    capture.watchAlert.type === "DELETED"
                      ? "bg-rose-100 border-rose-300 text-rose-900"
                      : "bg-amber-100 border-amber-300 text-amber-900"
                  }`}
                >
                  {capture.watchAlert.type} ALERT
                </span>
                <span className="text-xs font-semibold">
                  Detected {formatIST(capture.watchAlert.detectedAt)}
                </span>
              </div>
              <p className="text-xs mt-1 leading-relaxed">
                {capture.watchAlert.reason}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
            <button
              onClick={() => setActiveTab("watch")}
              className="px-3.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 rounded-lg text-xs font-semibold shadow-xs"
            >
              View Diff
            </button>
            {capture.watchAlert.recaptureId && (
              <Link
                href={`/capture/${capture.watchAlert.recaptureId}`}
                className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center space-x-1.5"
              >
                <span>View Re-Capture</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Linked Re-Capture Banner */}
      {capture.previousCaptureId && (
        <div className="mb-6 p-4 rounded-xl border border-blue-200 bg-blue-50 text-blue-900 flex items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center space-x-3">
            <Activity className="w-5 h-5 text-blue-600 shrink-0" />
            <div>
              <span className="font-bold text-xs uppercase tracking-wider text-blue-800">
                Automated Re-Capture Evidence
              </span>
              <p className="text-xs text-blue-700 mt-0.5">
                This capture was triggered automatically to preserve the state after an edit or deletion was detected.
              </p>
            </div>
          </div>
          <Link
            href={`/capture/${capture.previousCaptureId}`}
            className="px-3 py-1.5 bg-white border border-blue-200 hover:bg-blue-100 text-blue-900 rounded-lg text-xs font-semibold shrink-0"
          >
            View Original Baseline &rarr;
          </Link>
        </div>
      )}

      {/* Top Banner Header */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-6 shadow-sm mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2.5">
              <span className="text-xs font-mono font-bold text-slate-600">{capture.id}</span>
              {/* Status Badge */}
              <span
                className={`px-2.5 py-0.5 rounded-md text-xs font-bold ${
                  capture.status === "ANCHORED"
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-300"
                    : capture.status === "READY"
                    ? "bg-blue-50 text-blue-800 border border-blue-200"
                    : capture.status === "PARTIAL"
                    ? "bg-amber-50 text-amber-800 border border-amber-200"
                    : capture.status === "FAILED"
                    ? "bg-rose-50 text-rose-800 border border-rose-200"
                    : "bg-amber-50 text-amber-800 border border-amber-200"
                }`}
              >
                {capture.status}
              </span>
              {capture.isWatching && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-300 flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-sm bg-rose-600" />
                  <span>WATCHING</span>
                </span>
              )}
              {(capture.isFallbackCid || capture.manifestCid?.startsWith("bafy_mock") || capture.manifestCid?.startsWith("bafy_fallback")) && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-100 text-amber-900 border border-amber-300 flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
                  <span>Demo data: not on IPFS</span>
                </span>
              )}
            </div>

            <h1 className="text-xl font-bold text-slate-900 mt-2 truncate max-w-3xl">
              {capture.manifest?.observed?.title || capture.url}
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mt-1">
              <span className="truncate max-w-md font-mono">{capture.url}</span>
              <span>&bull;</span>
              <span>Captured: {formatIST(capture.createdAt)}</span>
              {capture.anchoring?.txHash && (
                <>
                  <span>&bull;</span>
                  {process.env.NEXT_PUBLIC_EXPLORER_URL ? (
                    <a
                      href={`${process.env.NEXT_PUBLIC_EXPLORER_URL}/tx/${capture.anchoring.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-700 hover:underline flex items-center space-x-1"
                    >
                      <span>Explorer</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="font-mono text-[11px] text-slate-500">
                      Tx: {truncateHash(capture.anchoring.txHash, 6, 4)}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {!isRunning && capture.status !== "ANCHORED" && (
              <button
                onClick={handleAnchorNow}
                disabled={anchoringLoading}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg shadow-sm flex items-center space-x-1.5 transition-colors disabled:opacity-50"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{anchoringLoading ? "Anchoring..." : "Anchor On-Chain"}</span>
              </button>
            )}

            {!isRunning && (
              <>
                <a
                  href={`/api/captures/${capture.id}/bundle`}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-sm flex items-center space-x-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Bundle (ZIP)</span>
                </a>

                <a
                  href={`/api/captures/${capture.id}/certificate`}
                  target="_blank"
                  className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-lg shadow-sm flex items-center space-x-1.5 transition-colors"
                >
                  <FileText className="w-3.5 h-3.5 text-blue-700" />
                  <span>s.63(4) Draft PDF</span>
                </a>

                <button
                  onClick={handleCreateShare}
                  className="px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-lg shadow-sm flex items-center space-x-1 transition-colors"
                  title="Generate Expiring Share Link"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Share</span>
                </button>

                {capture.status !== "DELETED" && (
                  <button
                    onClick={handleDeleteCapture}
                    disabled={deleteLoading}
                    className="px-3 py-2 bg-white border border-rose-300 hover:bg-rose-50 text-rose-700 text-xs font-semibold rounded-lg shadow-sm flex items-center space-x-1 transition-colors disabled:opacity-50"
                    title="Permanently crypto-shred encryption key and unpin IPFS files"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{deleteLoading ? "Shredding..." : "Crypto-Shred"}</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {capture.status === "DELETED" && (
          <div className="mt-4 p-4 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-900">
            <p className="font-bold mb-1">Capture Crypto-Shredded (FR-5.5)</p>
            <p>
              The AES-256 encryption key for this capture has been permanently destroyed and files unpinned from IPFS.
              Ciphertext can never be decrypted again. On-chain hashes remain anchored on Polygon, but cryptographically reveal nothing about the content.
            </p>
          </div>
        )}

        {shareUrl && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between text-xs text-blue-950">
            <span className="truncate mr-2 font-mono">Share Link: {shareUrl}</span>
            <span className="font-semibold text-emerald-700 whitespace-nowrap">Copied to clipboard!</span>
          </div>
        )}
      </div>

      {/* RUNNING STATE: Live Preview & Progress Timeline */}
      {isRunning ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: TinyFish Live Streaming Preview */}
          <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200/90 p-6 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-sm bg-rose-600" />
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  TinyFish Live Agent View
                </h2>
              </div>
              <span className="text-xs text-slate-500 font-mono">
                Steps: {capture.tinyfish?.numOfSteps || 0}
              </span>
            </div>

            <div className="relative w-full aspect-video bg-slate-950 rounded-lg overflow-hidden flex items-center justify-center border border-slate-800">
              {capture.tinyfish?.streamingUrl ? (
                <iframe
                  src={capture.tinyfish.streamingUrl}
                  className="w-full h-full border-0 pointer-events-none"
                  title="TinyFish Cloud Browser Stream"
                />
              ) : capture.artifacts?.some((a: any) => a.kind === "agent_step_screenshot") ? (
                /* Filmstrip Fallback when preview is gone / completed (PRD FR-3.2, Section 7.1) */
                <div className="w-full h-full bg-slate-900 p-4 flex flex-col justify-between overflow-hidden">
                  <div className="flex items-center justify-between text-xs text-slate-300 mb-2 border-b border-slate-800 pb-2">
                    <span className="font-semibold text-slate-200">
                      Live Stream Session Ended &bull; Step Action Filmstrip
                    </span>
                    <span className="text-[10px] font-mono text-emerald-400">
                      {capture.artifacts.filter((a: any) => a.kind === "agent_step_screenshot").length} Steps Recorded
                    </span>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-2 flex-1 items-center">
                    {capture.artifacts
                      .filter((a: any) => a.kind === "agent_step_screenshot")
                      .map((stepArt: any) => (
                        <div
                          key={stepArt.id}
                          className="min-w-[160px] max-w-[160px] bg-slate-800/90 border border-slate-700 rounded-lg overflow-hidden flex flex-col shrink-0 text-left"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/api/captures/${capture.id}/artifacts/${stepArt.id}`}
                            alt={stepArt.action || "Step"}
                            className="w-full h-24 object-cover bg-slate-950"
                          />
                          <div className="p-2 text-[11px] flex-1 flex flex-col justify-between">
                            <span className="font-semibold text-slate-200 line-clamp-2">
                              {stepArt.action || `Step ${stepArt.stepIndex || ""}`}
                            </span>
                            <span className="text-[9px] text-slate-400 font-mono mt-1">
                              {stepArt.id}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ) : (
                <div className="text-center p-6 space-y-3">
                  <div className="w-10 h-10 border-2 border-slate-400 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs text-slate-300 font-mono">
                    {capture.status === "AGENT_RUNNING"
                      ? "Initializing cloud browser session..."
                      : "Live preview session completed. Processing forensic artifacts..."}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Target: {capture.url}
                  </p>
                </div>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-3 text-center">
              Agent runs with neutral stealth profile. Form inputs, sign-ins, and external links are prohibited.
            </p>
          </div>

          {/* Right: Stage Timeline & Event Logs */}
          <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200/90 p-6 shadow-sm flex flex-col">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">
              Forensic Pipeline Progress
            </h2>
            <div className="space-y-4 flex-1 overflow-y-auto max-h-[420px] pr-2">
              {(capture.events || []).map((ev: any, idx: number) => (
                <div key={idx} className="flex items-start space-x-3 text-xs">
                  <div className="mt-0.5 p-1 bg-slate-100 text-slate-700 rounded-md">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-800">{ev.stage}</span>
                    <p className="text-slate-600 mt-0.5">{ev.message}</p>
                    <span className="text-[10px] text-slate-400">{formatIST(ev.at)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* READY / COMPLETED STATE: Tabs View */
        <div className="space-y-6">
          {/* Tabs Navigation */}
          <div className="flex items-center space-x-2 border-b border-slate-200 pb-2 overflow-x-auto">
            {[
              { id: "overview", label: "Overview & Facts" },
              { id: "artifacts", label: `Artifacts (${capture.artifacts?.length || 0})` },
              { id: "proof", label: "Blockchain Proof" },
              { id: "watch", label: "Deletion Watch" },
              { id: "report", label: "Complaint Drafts" },
              { id: "custody", label: "Chain of Custody" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* TAB 1: OVERVIEW */}
          {activeTab === "overview" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                {/* Safety-Blocked Notice if status is UNAVAILABLE */}
                {capture.aiAnalysis?.status === "UNAVAILABLE" && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start space-x-2.5 shadow-xs">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">AI summary unavailable for this content</span>
                      <p className="mt-0.5 text-amber-800">
                        Content safety policies restricted automated AI summarization. All preserved web artifacts, forensic screenshots, and cryptographic hashes remain intact.
                      </p>
                    </div>
                  </div>
                )}

                {/* Skipped / Opted-Out Notice if status is SKIPPED */}
                {capture.aiAnalysis?.status === "SKIPPED" && (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 flex items-start space-x-2.5 shadow-xs">
                    <Cpu className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-900 block">AI Analysis Disabled</span>
                      <p className="mt-0.5 text-slate-600">
                        AI analysis was disabled for this capture (opt-in was OFF). Original web artifacts, screenshots, and cryptographic hashes remain preserved and sealed without third-party AI processing.
                      </p>
                    </div>
                  </div>
                )}

                {/* AI Factual Summary Card (PRD Section 12, FR-9.3) */}
                <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-sm">
                  {/* Top Notice Bar & Language Toggle */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3 mb-4">
                    <div className="flex items-center space-x-2 text-xs text-slate-500 font-medium">
                      <Cpu className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>AI-generated, not part of the original evidence. Not legal advice.</span>
                    </div>

                    <div
                      className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 shrink-0 self-start sm:self-auto"
                      role="group"
                      aria-label="Summary language toggle"
                    >
                      <button
                        type="button"
                        onClick={() => setOverviewLang("en")}
                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                          overviewLang === "en"
                            ? "bg-white text-slate-900 shadow-2xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                        aria-pressed={overviewLang === "en"}
                      >
                        English
                      </button>
                      <button
                        type="button"
                        onClick={() => setOverviewLang("hi")}
                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-all font-hindi ${
                          overviewLang === "hi"
                            ? "bg-white text-slate-900 shadow-2xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                        aria-pressed={overviewLang === "hi"}
                      >
                        हिंदी
                      </button>
                    </div>
                  </div>

                  {/* Fallback Demo Data Badge (PRD 12) */}
                  {(capture.aiAnalysis?.isFallback || capture.aiAnalysis?.fallbackBadge) && (
                    <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-md bg-amber-100 text-amber-900 border border-amber-300 text-xs font-semibold mb-4 shadow-xs">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      <span>{capture.aiAnalysis.fallbackBadge || "Demo data: not real AI output"}</span>
                    </div>
                  )}

                  {overviewLang === "en" ? (
                    <div>
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        Factual Summary (English)
                      </h3>
                      <p className="text-sm text-slate-800 leading-relaxed">
                        {capture.aiAnalysis?.summary_en ||
                          "Factual summary generated from verified observations."}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 font-hindi">
                        तथ्यात्मक सारांश (Hindi)
                      </h3>
                      <p className="text-sm text-slate-800 leading-relaxed font-hindi">
                        {capture.aiAnalysis?.summary_hi || "तथ्यात्मक सारांश उपलब्ध है।"}
                      </p>
                    </div>
                  )}
                </div>

                {/* Key Claims */}
                {capture.aiAnalysis?.key_claims && (
                  <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3">
                      Observed Claims &amp; Assertions
                    </h3>
                    <ul className="space-y-2">
                      {capture.aiAnalysis.key_claims.map((claim: string, idx: number) => (
                        <li key={idx} className="text-xs text-slate-700 flex items-start space-x-2">
                          <span className="w-1.5 h-1.5 rounded-sm bg-slate-700 mt-1.5 shrink-0" />
                          <span>{claim}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Sidebar Info: Identified Parties & Categories */}
              <div className="space-y-6">
                {/* Possible Issue Categories */}
                <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-sm">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                    Potential Issue Classification
                  </h3>
                  <div className="space-y-3">
                    {(capture.aiAnalysis?.possible_issue_categories || []).map(
                      (cat: any, idx: number) => (
                        <div key={idx} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold text-slate-900 capitalize">
                              {cat.category.replace("_", " ")}
                            </span>
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                                cat.confidence === "high"
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {cat.confidence}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 leading-relaxed">{cat.rationale}</p>
                        </div>
                      )
                    )}
                  </div>
                </div>

                {/* Caveat */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600 leading-relaxed">
                  <span className="font-bold text-slate-800">Legal Disclaimer:</span> AI analysis is provided as an objective drafting aid and does not constitute judicial determination or certified legal advice.
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ARTIFACTS */}
          {activeTab === "artifacts" && (
            <div className="space-y-6">
              {/* Agent Step Filmstrip */}
              {capture.artifacts?.some((a: any) => a.kind === "agent_step_screenshot") && (
                <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-sm">
                  <div className="flex items-center space-x-2 mb-4">
                    <Film className="w-4 h-4 text-slate-700" />
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                      Agent Forensic Action Filmstrip
                    </h3>
                  </div>
                  <div className="flex gap-4 overflow-x-auto pb-4">
                    {capture.artifacts
                      .filter((a: any) => a.kind === "agent_step_screenshot")
                      .map((stepArt: any) => (
                        <div
                          key={stepArt.id}
                          className="min-w-[220px] max-w-[220px] bg-slate-50 border border-slate-200 rounded-lg overflow-hidden flex flex-col shrink-0"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/api/captures/${capture.id}/artifacts/${stepArt.id}`}
                            alt={stepArt.action || "Step"}
                            className="w-full h-32 object-cover bg-slate-200"
                          />
                          <div className="p-3 text-xs flex-1 flex flex-col justify-between">
                            <span className="font-semibold text-slate-900 line-clamp-2">
                              {stepArt.action || `Step ${stepArt.stepIndex}`}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono mt-2">
                              {truncateHash(stepArt.sha256, 8, 6)}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Complete Artifacts Hash Table */}
              <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">
                  Plaintext Fingerprints (SHA-256)
                </h3>
                <div className="divide-y divide-slate-100">
                  {(capture.artifacts || []).map((art: any) => (
                    <div key={art.id} className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-bold text-slate-900">{art.id}</span>
                          <span className="text-[11px] font-mono text-slate-500">({art.kind})</span>
                          <span className="text-[10px] text-slate-400">{(art.bytes / 1024).toFixed(1)} KB</span>
                        </div>
                        <div className="text-xs font-mono text-slate-600 mt-1 select-all break-all">
                          {art.sha256}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 shrink-0">
                        <button
                          onClick={() => copyToClipboard(art.sha256, "hash")}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Copy SHA-256"
                        >
                          {copiedHash === art.sha256 ? (
                            <Check className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                        <a
                          href={`/api/captures/${capture.id}/artifacts/${art.id}`}
                          target="_blank"
                          className="px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                        >
                          Preview
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: BLOCKCHAIN PROOF */}
          {activeTab === "proof" && (
            <div className="bg-white p-6 sm:p-8 rounded-xl border border-slate-200/90 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Merkle &amp; On-Chain Verification</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Immutable timestamp anchored into the Polygon Amoy EvidenceRegistry contract.
                  </p>
                </div>
                {capture.anchoring?.txHash && (
                  <span className="px-3 py-1 bg-emerald-50 text-emerald-800 text-xs font-semibold rounded-md border border-emerald-300">
                    Anchored on Polygon
                  </span>
                )}
              </div>

              {capture.anchoring ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                  <div className="space-y-4 text-xs font-mono">
                    <div>
                      <span className="font-sans font-semibold text-slate-600 block mb-1">
                        Canonical Manifest SHA-256:
                      </span>
                      <span className="p-2 bg-slate-50 border border-slate-200 rounded-lg block break-all text-slate-800">
                        {capture.manifestSha256}
                      </span>
                    </div>

                    <div>
                      <span className="font-sans font-semibold text-slate-600 block mb-1">
                        Merkle Root:
                      </span>
                      <span className="p-2 bg-slate-50 border border-slate-200 rounded-lg block break-all text-slate-800">
                        {capture.anchoring.root}
                      </span>
                    </div>

                    <div>
                      <span className="font-sans font-semibold text-slate-600 block mb-1">
                        Transaction Hash:
                      </span>
                      {process.env.NEXT_PUBLIC_EXPLORER_URL ? (
                        <a
                          href={`${process.env.NEXT_PUBLIC_EXPLORER_URL}/tx/${capture.anchoring.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2 bg-slate-50 border border-slate-200 rounded-lg block break-all text-blue-700 hover:underline flex items-center justify-between"
                        >
                          <span>{capture.anchoring.txHash}</span>
                          <ExternalLink className="w-3.5 h-3.5 shrink-0 ml-2" />
                        </a>
                      ) : (
                        <span className="p-2 bg-slate-50 border border-slate-200 rounded-lg block break-all font-mono text-slate-800">
                          {capture.anchoring.txHash}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4 text-xs">
                    <div>
                      <span className="font-semibold text-slate-500 block mb-1">Contract Address:</span>
                      <span className="font-mono text-slate-800 block break-all">
                        {capture.anchoring.contract}
                      </span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-500 block mb-1">Block Number:</span>
                      <span className="font-mono text-slate-800">#{capture.anchoring.blockNumber}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-500 block mb-1">Anchored Timestamp:</span>
                      <span className="text-slate-800">{formatIST(capture.anchoring.anchoredAt)}</span>
                    </div>
                    <div className="pt-2">
                      <Link
                        href={`/v/${capture.id}`}
                        className="inline-flex items-center space-x-1.5 text-blue-700 font-semibold hover:underline"
                      >
                        <span>View Public Trustless Certificate</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 space-y-4">
                  <Layers className="w-12 h-12 text-slate-300 mx-auto" />
                  <p className="text-sm text-slate-600 max-w-md mx-auto">
                    This capture is fingerprinted and sealed. Click &quot;Anchor On-Chain&quot; to permanently anchor its Merkle root to Polygon Amoy.
                  </p>
                  <button
                    onClick={handleAnchorNow}
                    disabled={anchoringLoading}
                    className="px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg transition-all"
                  >
                    {anchoringLoading ? "Anchoring..." : "Anchor Root Now"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: DELETION WATCH */}
          {activeTab === "watch" && (
            <div className="bg-white p-6 sm:p-8 rounded-xl border border-slate-200/90 shadow-sm space-y-6">
              {/* Header and Controls */}
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 pb-6 border-b border-slate-200">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
                    <Eye className="w-5 h-5 text-slate-800" />
                    <span>TinyFish Monitor: Edit &amp; Deletion Watch</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-xl">
                    Surveys target URL on schedule, detects edits or removal, triggers automatic re-capture,
                    and generates court-ready unified line diffs.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Schedule Picker */}
                  <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    <span className="font-semibold text-slate-700">Schedule:</span>
                    <select
                      value={watchSchedule}
                      onChange={(e) => handleScheduleChange(e.target.value)}
                      disabled={watchToggling}
                      className="bg-transparent font-medium text-slate-800 focus:outline-none cursor-pointer"
                    >
                      <option value="0 * * * *">Hourly (0 * * * *)</option>
                      <option value="0 */6 * * *">Every 6 Hours (0 */6 * * *)</option>
                      <option value="0 0 * * *">Daily (0 0 * * *)</option>
                    </select>
                  </div>

                  {/* Toggle Watch Button */}
                  <button
                    onClick={handleToggleWatch}
                    disabled={watchToggling}
                    className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center space-x-2 transition-all shadow-xs ${
                      capture.isWatching && watchDetails?.state === "active"
                        ? "bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300"
                        : "bg-rose-700 hover:bg-rose-800 text-white"
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        capture.isWatching && watchDetails?.state === "active"
                          ? "bg-emerald-500 animate-pulse"
                          : "bg-slate-400"
                      }`}
                    />
                    <span>
                      {watchToggling
                        ? "Updating..."
                        : capture.isWatching && watchDetails?.state === "active"
                        ? "Turn Off Watch"
                        : "Turn On Watch"}
                    </span>
                  </button>

                  {/* Check Now Button */}
                  <button
                    onClick={handleCheckWatchNow}
                    disabled={watchChecking || !(capture.isWatching && watchDetails?.state === "active")}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg flex items-center space-x-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${watchChecking ? "animate-spin" : ""}`} />
                    <span>{watchChecking ? "Evaluating Live..." : "Check Now"}</span>
                  </button>
                </div>
              </div>

              {/* Blocked page warning if >= 3 consecutive checks failed */}
              {(watchDetails?.isBlockedWarning || (watchDetails?.consecutiveBlockedCount && watchDetails.consecutiveBlockedCount >= 3)) && (
                <div className="p-4 rounded-xl bg-amber-50/90 border border-amber-300 text-amber-950 text-xs flex items-start space-x-3 shadow-xs">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-amber-900 block text-sm">
                      We couldn&apos;t check this page recently
                    </span>
                    <p className="text-amber-800 mt-0.5">
                      The target page has blocked or challenged access {watchDetails.consecutiveBlockedCount} consecutive times (bot detection, login barrier, or network timeout). Baseline evidence hash is preserved; monitoring will continue retrying on schedule.
                    </p>
                  </div>
                </div>
              )}

              {/* Error Notice if Watch limit or action failed */}
              {watchError && (
                <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center space-x-2.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span className="font-semibold">{watchError}</span>
                </div>
              )}

              {/* Watch Details Metadata Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                  <span className="text-slate-500 font-medium block">Watch Status</span>
                  <div className="mt-1 flex items-center space-x-1.5 font-bold text-slate-800">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        capture.isWatching && watchDetails?.state === "active"
                          ? "bg-emerald-500"
                          : "bg-slate-400"
                      }`}
                    />
                    <span>
                      {capture.isWatching && watchDetails?.state === "active"
                        ? "ACTIVE MONITORING"
                        : "DISABLED"}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                  <span className="text-slate-500 font-medium block">Monitor ID</span>
                  <span className="mt-1 block font-mono text-slate-800 truncate" title={watchDetails?.monitorId || "None"}>
                    {watchDetails?.monitorId || "Not provisioned"}
                  </span>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                  <span className="text-slate-500 font-medium block">Baseline Hash</span>
                  <span
                    className="mt-1 block font-mono text-slate-800 truncate"
                    title={watchDetails?.baselineContentHash || capture.contentHash || "None"}
                  >
                    {truncateHash(watchDetails?.baselineContentHash || capture.contentHash || "N/A", 8, 6)}
                  </span>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                  <span className="text-slate-500 font-medium block">Last Evaluated</span>
                  <span className="mt-1 block text-slate-800 font-medium">
                    {watchDetails?.lastCheckedAt ? formatIST(watchDetails.lastCheckedAt) : "Never"}
                  </span>
                </div>
              </div>

              {/* Watch Check Timeline */}
              <div className="pt-2 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-2">
                    <Activity className="w-3.5 h-3.5 text-slate-500" />
                    <span>Check Timeline ({watchEvents.length})</span>
                  </h4>
                  <span className="text-[11px] text-slate-400 font-mono">
                    All evaluations recorded immutably
                  </span>
                </div>

                {watchEvents.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50/50 border border-dashed border-slate-200 rounded-lg space-y-2">
                    <Eye className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="text-xs text-slate-500 font-medium">
                      No change checks recorded yet.
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Click &quot;Check Now&quot; above to run an instant live evaluation against the baseline content hash.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {watchEvents.map((wEvent: any) => (
                      <div
                        key={wEvent.id}
                        className={`p-4 rounded-xl border transition-all ${
                          wEvent.type === "DELETED"
                            ? "border-rose-300 bg-rose-50/60 text-rose-950"
                            : wEvent.type === "EDITED"
                            ? "border-amber-300 bg-amber-50/60 text-amber-950"
                            : wEvent.type === "BLOCKED"
                            ? "border-purple-300 bg-purple-50/60 text-purple-950"
                            : "border-slate-200 bg-slate-50/80 text-slate-800"
                        }`}
                      >
                        {/* Event Header */}
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <div className="flex items-center space-x-2">
                            <span
                              className={`px-2.5 py-0.5 rounded-md text-xs font-bold uppercase tracking-wide border ${
                                wEvent.type === "DELETED"
                                  ? "bg-rose-100 text-rose-800 border-rose-300"
                                  : wEvent.type === "EDITED"
                                  ? "bg-amber-100 text-amber-800 border-amber-300"
                                  : wEvent.type === "BLOCKED"
                                  ? "bg-purple-100 text-purple-800 border-purple-300"
                                  : "bg-emerald-100 text-emerald-800 border-emerald-300"
                              }`}
                            >
                              {wEvent.type}
                            </span>
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 px-2 py-0.5 rounded bg-white/70 border border-slate-200">
                              {wEvent.source || "manual"}
                            </span>
                          </div>
                          <span className="text-xs text-slate-500 font-mono">
                            {formatIST(wEvent.detectedAt)}
                          </span>
                        </div>

                        {/* Event Reason */}
                        <p className="text-xs font-medium mt-1 leading-relaxed">
                          {wEvent.reason}
                        </p>

                        {/* Content Hash Tag */}
                        {wEvent.contentHash && (
                          <div className="mt-2 text-[10px] font-mono text-slate-500">
                            Evaluated Hash: {truncateHash(wEvent.contentHash, 10, 8)}
                          </div>
                        )}

                        {/* Unified Line Diff Preview */}
                        {wEvent.diff && (
                          <div className="mt-3 p-3.5 bg-slate-950 text-slate-100 rounded-lg font-mono text-xs overflow-x-auto whitespace-pre leading-relaxed border border-slate-800">
                            {wEvent.diff.split("\n").map((line: string, lineIdx: number) => {
                              const isAdded = line.startsWith("+") && !line.startsWith("+++");
                              const isRemoved = line.startsWith("-") && !line.startsWith("---");
                              const isHunk = line.startsWith("@@");
                              return (
                                <div
                                  key={lineIdx}
                                  className={
                                    isAdded
                                      ? "text-emerald-400 bg-emerald-950/40 px-1 rounded-xs"
                                      : isRemoved
                                      ? "text-rose-400 bg-rose-950/40 px-1 rounded-xs"
                                      : isHunk
                                      ? "text-cyan-400 font-semibold"
                                      : "text-slate-300"
                                  }
                                >
                                  {line}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Linked Re-Capture Link */}
                        {wEvent.recaptureId && (
                          <div className="mt-3 pt-3 border-t border-current/10 flex items-center justify-between">
                            <span className="text-xs font-semibold">
                              Automatic re-capture triggered:
                            </span>
                            <Link
                              href={`/capture/${wEvent.recaptureId}`}
                              className="px-3 py-1 bg-white hover:bg-slate-100 border border-current rounded-md text-xs font-bold inline-flex items-center space-x-1.5 transition-colors shadow-2xs"
                            >
                              <span>View Re-Capture ({truncateHash(wEvent.recaptureId, 6, 4)})</span>
                              <ArrowRight className="w-3 h-3" />
                            </Link>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: COMPLAINT DRAFTS & REPORT */}
          {activeTab === "report" && (
            <div className="space-y-6">
              {/* Fallback Demo Data Badge (PRD 12) */}
              {(capture.aiAnalysis?.isFallback || capture.aiAnalysis?.fallbackBadge) && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs font-semibold text-amber-900 flex items-center space-x-2 shadow-xs">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span>{capture.aiAnalysis.fallbackBadge || "Demo data: not real AI output"}</span>
                  <span className="text-[11px] font-normal text-amber-700 ml-1">
                    &bull; Pre-written demonstration text. Real AI analysis disabled or unconfigured.
                  </span>
                </div>
              )}

              {/* Section 1: Possible Legal / Policy Issue Categories (PRD Section 12) */}
              <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                      Possible Legal &amp; Policy Issue Categories
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Statutory and policy issues identified in preserved evidence with confidence rating and rationale.
                    </p>
                  </div>
                  {capture.aiAnalysis?.content_type && (
                    <span className="text-[11px] font-semibold font-mono text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded self-start sm:self-auto">
                      Content Type: {capture.aiAnalysis.content_type}
                    </span>
                  )}
                </div>

                {capture.aiAnalysis?.possible_issue_categories &&
                capture.aiAnalysis.possible_issue_categories.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {capture.aiAnalysis.possible_issue_categories.map((cat: any, idx: number) => {
                      const confidenceStyle =
                        cat.confidence === "high"
                          ? "bg-rose-100 text-rose-800 border-rose-200"
                          : cat.confidence === "medium"
                          ? "bg-amber-100 text-amber-800 border-amber-200"
                          : "bg-blue-100 text-blue-800 border-blue-200";

                      return (
                        <div
                          key={idx}
                          className="p-4 bg-slate-50/70 rounded-lg border border-slate-200 flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-bold text-slate-900 capitalize">
                                {cat.category.replace(/_/g, " ")}
                              </span>
                              <span
                                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${confidenceStyle}`}
                              >
                                {cat.confidence} confidence
                              </span>
                            </div>
                            <p className="text-xs text-slate-700 leading-relaxed">
                              {cat.rationale}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200 text-xs text-slate-500">
                    No specific statutory violations or high-risk issues flagged for this content.
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* English Complaint Draft */}
              <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                      Complaint Draft (English)
                    </h3>
                    <button
                      onClick={() =>
                        copyToClipboard(capture.aiAnalysis?.complaint_draft_en || "", "text")
                      }
                      className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded-md flex items-center space-x-1"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Draft</span>
                    </button>
                  </div>
                  <textarea
                    readOnly
                    rows={12}
                    value={capture.aiAnalysis?.complaint_draft_en || ""}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 focus:outline-none"
                  />
                </div>
              </div>

              {/* Hindi Complaint Draft */}
              <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                      शिकायत प्रारूप (Hindi)
                    </h3>
                    <button
                      onClick={() =>
                        copyToClipboard(capture.aiAnalysis?.complaint_draft_hi || "", "text")
                      }
                      className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded-md flex items-center space-x-1"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Draft</span>
                    </button>
                  </div>
                  <textarea
                    readOnly
                    rows={12}
                    value={capture.aiAnalysis?.complaint_draft_hi || ""}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-hindi text-slate-800 focus:outline-none"
                  />
                </div>
              </div>

              {/* Official Reporting Portals (PRD 12.3) */}
              <div className="md:col-span-2 bg-white p-6 rounded-xl border border-slate-200/90 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                    Official Reporting Channels in India
                  </h3>
                  {capture.aiAnalysis?.suggested_channel_ids &&
                    capture.aiAnalysis.suggested_channel_ids.length > 0 && (
                      <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">
                        {capture.aiAnalysis.suggested_channel_ids.length} Recommended
                      </span>
                    )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {OFFICIAL_REPORTING_CHANNELS.map((ch) => {
                    const isSuggested =
                      Array.isArray(capture.aiAnalysis?.suggested_channel_ids) &&
                      capture.aiAnalysis.suggested_channel_ids.includes(ch.id);

                    if (ch.url) {
                      return (
                        <a
                          key={ch.id}
                          href={ch.url}
                          target="_blank"
                          rel="noreferrer"
                          className={`p-4 rounded-lg border transition-all ${
                            isSuggested
                              ? "border-blue-500 bg-blue-50/50 shadow-xs ring-1 ring-blue-500/20"
                              : "border-slate-200 hover:border-slate-900 hover:shadow-xs"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-900 block">
                              {ch.name}
                            </span>
                            {isSuggested && (
                              <span className="text-[10px] uppercase font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">
                                Recommended
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-500 mt-1 block">
                            {ch.helpline ? `Helpline ${ch.helpline} • ` : ""}
                            {ch.url.replace(/^https?:\/\//, "")}
                          </span>
                          <span className="text-[10px] text-slate-400 mt-1 block line-clamp-2">
                            {ch.description}
                          </span>
                        </a>
                      );
                    }

                    // Text-only channel: no link (PRD 12.3)
                    return (
                      <div
                        key={ch.id}
                        className={`p-4 rounded-lg border ${
                          isSuggested
                            ? "border-blue-500 bg-blue-50/50 shadow-xs ring-1 ring-blue-500/20"
                            : "border-slate-200 bg-slate-50/60"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900 block">
                            {ch.name}
                          </span>
                          {isSuggested && (
                            <span className="text-[10px] uppercase font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">
                              Recommended
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500 mt-1 block">
                          {ch.helpline ? `Helpline ${ch.helpline} • ` : ""}
                          Direct / Offline (No Portal Link)
                        </span>
                        <span className="text-[10px] text-slate-400 mt-1 block line-clamp-2">
                          {ch.description}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            </div>
          )}

          {/* TAB 6: CHAIN OF CUSTODY */}
          {activeTab === "custody" && (
            <div className="bg-white p-6 sm:p-8 rounded-xl border border-slate-200/90 shadow-sm space-y-4">
              <h3 className="text-lg font-bold text-slate-900">Forensic Chain of Custody</h3>
              <p className="text-xs text-slate-500">
                All lifecycle actions (creation, viewing, bundle export, external share, public verification) are logged with cryptographically salted actor identifiers. Key events are signed to the smart contract.
              </p>
              <div className="space-y-3 pt-4 border-t border-slate-100">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900">CREATE</span>
                    <p className="text-slate-500 mt-0.5">Capture created by owner: {truncateHash(capture.ownerUid || "anon")}</p>
                  </div>
                  <span className="text-slate-400 font-mono">{formatIST(capture.createdAt)}</span>
                </div>
                {capture.anchoring && (
                  <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-xs flex items-center justify-between">
                    <div>
                      <span className="font-bold text-emerald-900">ANCHOR</span>
                      <p className="text-emerald-700 mt-0.5">Committed to Polygon Amoy in block #{capture.anchoring.blockNumber}</p>
                    </div>
                    <span className="text-emerald-600 font-mono">{formatIST(capture.anchoring.anchoredAt)}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
