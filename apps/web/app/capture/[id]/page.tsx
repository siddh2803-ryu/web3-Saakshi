"use client";

import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import { formatIST, truncateHash } from "@/lib/utils";

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
  const [watchEvents, setWatchEvents] = useState<any[]>([]);
  const [watchDetails, setWatchDetails] = useState<any>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const fetchCapture = async () => {
    try {
      const res = await fetch(`/api/captures/${captureId}`);
      if (!res.ok) throw new Error("Capture not found");
      const data = await res.json();
      setCapture(data.capture);

      // If watch active, fetch watch details
      if (data.capture?.watchId) {
        const wRes = await fetch(`/api/watches/${data.capture.watchId}`);
        if (wRes.ok) {
          const wData = await wRes.json();
          setWatchDetails(wData.watch);
          setWatchEvents(wData.watch?.events || []);
        }
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

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
  }, [captureId, capture?.status]);

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

  const handleCreateWatch = async () => {
    try {
      const res = await fetch(`/api/captures/${captureId}/watch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleCron: "0 * * * *" }),
      });
      if (res.ok) {
        await fetchCapture();
        setActiveTab("watch");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCheckWatchNow = async () => {
    if (!capture?.watchId) return;
    setWatchChecking(true);
    try {
      const res = await fetch(`/api/watches/${capture.watchId}/check`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        await fetchCapture();
      } else {
        alert(data.error || "Check now failed");
      }
    } catch (err) {
      console.error(err);
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

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-4">
        <div className="w-8 h-8 border-2 border-saakshi-indigo border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-500 font-mono">Loading capture session...</p>
      </div>
    );
  }

  if (errorMsg || !capture) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 text-center max-w-md">
          <ShieldAlert className="w-8 h-8 text-rose-500 mx-auto mb-2" />
          <h2 className="text-base font-bold text-slate-900">Capture Not Found</h2>
          <p className="text-xs text-slate-500 mt-1">{errorMsg || "Invalid capture ID"}</p>
          <Link
            href="/dashboard"
            className="mt-4 inline-block px-4 py-2 bg-saakshi-indigo text-white text-xs font-semibold rounded-lg"
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
      {/* Top Banner Header */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-soft mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2.5">
              <span className="text-xs font-mono font-bold text-slate-500">{capture.id}</span>
              {/* Status Badge */}
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  capture.status === "ANCHORED"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : capture.status === "READY"
                    ? "bg-indigo-50 text-saakshi-indigo border border-indigo-200"
                    : capture.status === "PARTIAL"
                    ? "bg-amber-50 text-amber-800 border border-amber-200"
                    : capture.status === "FAILED"
                    ? "bg-rose-50 text-rose-700 border border-rose-200"
                    : "bg-amber-50 text-amber-800 animate-pulse"
                }`}
              >
                {capture.status}
              </span>
              {capture.isWatching && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                  <span>WATCHING</span>
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
                  <a
                    href={`https://amoy.polygonscan.com/tx/${capture.anchoring.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-saakshi-indigo hover:underline flex items-center space-x-1"
                  >
                    <span>Polygonscan</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
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
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-sm flex items-center space-x-1.5 transition-colors disabled:opacity-50"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{anchoringLoading ? "Anchoring..." : "Anchor On-Chain"}</span>
              </button>
            )}

            {!isRunning && (
              <>
                <a
                  href={`/api/captures/${capture.id}/bundle`}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl shadow-sm flex items-center space-x-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Bundle (ZIP)</span>
                </a>

                <a
                  href={`/api/captures/${capture.id}/certificate`}
                  target="_blank"
                  className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl shadow-sm flex items-center space-x-1.5 transition-colors"
                >
                  <FileText className="w-3.5 h-3.5 text-saakshi-indigo" />
                  <span>s.63(4) Draft PDF</span>
                </a>

                <button
                  onClick={handleCreateShare}
                  className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl shadow-sm flex items-center space-x-1 transition-colors"
                  title="Generate Expiring Share Link"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Share</span>
                </button>
              </>
            )}
          </div>
        </div>

        {shareUrl && (
          <div className="mt-4 p-3 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-between text-xs text-indigo-900">
            <span className="truncate mr-2 font-mono">Share Link: {shareUrl}</span>
            <span className="font-semibold text-emerald-600 whitespace-nowrap">Copied to clipboard!</span>
          </div>
        )}
      </div>

      {/* RUNNING STATE: Live Preview & Progress Timeline */}
      {isRunning ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: TinyFish Live Streaming Preview */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-soft flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  TinyFish Live Agent View
                </h2>
              </div>
              <span className="text-xs text-slate-500 font-mono">
                Steps: {capture.tinyfish?.numOfSteps || 0}
              </span>
            </div>

            <div className="relative w-full aspect-video bg-slate-950 rounded-xl overflow-hidden flex items-center justify-center border border-slate-800">
              {capture.tinyfish?.streamingUrl ? (
                <iframe
                  src={capture.tinyfish.streamingUrl}
                  className="w-full h-full border-0 pointer-events-none"
                  title="TinyFish Cloud Browser Stream"
                />
              ) : (
                <div className="text-center p-6 space-y-3">
                  <div className="w-10 h-10 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs text-slate-300 font-mono">
                    Initializing cloud browser session...
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Target: {capture.url}
                  </p>
                </div>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-3 text-center">
              Agent runs with neutral stealth profile. Form inputs, sign-ins, and external links are prohibited.
            </p>
          </div>

          {/* Right: Stage Timeline & Event Logs */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-soft flex flex-col">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">
              Forensic Pipeline Progress
            </h2>
            <div className="space-y-4 flex-1 overflow-y-auto max-h-[420px] pr-2">
              {(capture.events || []).map((ev: any, idx: number) => (
                <div key={idx} className="flex items-start space-x-3 text-xs">
                  <div className="mt-0.5 p-1 bg-indigo-50 text-saakshi-indigo rounded-full">
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
          <div className="flex items-center space-x-2 border-b border-slate-200/80 pb-2 overflow-x-auto">
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
                className={`px-4 py-2 text-xs font-semibold rounded-xl whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? "bg-saakshi-indigo text-white shadow-sm"
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
                {/* AI Factual Summary Card */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-soft">
                  <h3 className="text-sm font-bold text-night uppercase tracking-wider mb-2">
                    Executive Summary (English)
                  </h3>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    {capture.aiAnalysis?.summary_en ||
                      "Factual summary generated from verified observations."}
                  </p>

                  <h3 className="text-sm font-bold text-night uppercase tracking-wider mt-6 mb-2">
                    तथ्यात्मक सारांश (Hindi)
                  </h3>
                  <p className="text-sm text-slate-700 leading-relaxed font-hindi">
                    {capture.aiAnalysis?.summary_hi || "तथ्यात्मक सारांश उपलब्ध है।"}
                  </p>
                </div>

                {/* Key Claims */}
                {capture.aiAnalysis?.key_claims && (
                  <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-soft">
                    <h3 className="text-sm font-bold text-night uppercase tracking-wider mb-3">
                      Observed Claims &amp; Assertions
                    </h3>
                    <ul className="space-y-2">
                      {capture.aiAnalysis.key_claims.map((claim: string, idx: number) => (
                        <li key={idx} className="text-xs text-slate-700 flex items-start space-x-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-saakshi-indigo mt-1.5 shrink-0" />
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
                <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-soft">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                    Potential Issue Classification
                  </h3>
                  <div className="space-y-3">
                    {(capture.aiAnalysis?.possible_issue_categories || []).map(
                      (cat: any, idx: number) => (
                        <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold text-slate-900 capitalize">
                              {cat.category.replace("_", " ")}
                            </span>
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                cat.confidence === "high"
                                  ? "bg-rose-100 text-rose-700"
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
                <div className="p-4 bg-slate-100/70 border border-slate-200 rounded-xl text-[11px] text-slate-500 leading-relaxed">
                  <span className="font-bold text-slate-700">Legal Disclaimer:</span> AI analysis is provided as an objective drafting aid and does not constitute judicial determination or certified legal advice.
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ARTIFACTS */}
          {activeTab === "artifacts" && (
            <div className="space-y-6">
              {/* Agent Step Filmstrip */}
              {capture.artifacts?.some((a: any) => a.kind === "agent_step_screenshot") && (
                <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-soft">
                  <div className="flex items-center space-x-2 mb-4">
                    <Film className="w-4 h-4 text-saakshi-indigo" />
                    <h3 className="text-sm font-bold text-night uppercase tracking-wider">
                      Agent Forensic Action Filmstrip
                    </h3>
                  </div>
                  <div className="flex gap-4 overflow-x-auto pb-4">
                    {capture.artifacts
                      .filter((a: any) => a.kind === "agent_step_screenshot")
                      .map((stepArt: any) => (
                        <div
                          key={stepArt.id}
                          className="min-w-[220px] max-w-[220px] bg-slate-50 border border-slate-200 rounded-xl overflow-hidden flex flex-col shrink-0"
                        >
                          <img
                            src={`/api/captures/${capture.id}/artifacts/${stepArt.id}`}
                            alt={stepArt.action || "Step"}
                            className="w-full h-32 object-cover bg-slate-200"
                          />
                          <div className="p-3 text-xs flex-1 flex flex-col justify-between">
                            <span className="font-semibold text-slate-900 line-clamp-2">
                              {stepArt.action || `Step ${stepArt.stepIndex}`}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono mt-2">
                              {truncateHash(stepArt.sha256, 8, 6)}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Complete Artifacts Hash Table */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-soft">
                <h3 className="text-sm font-bold text-night uppercase tracking-wider mb-4">
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
            <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200/80 shadow-soft space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-night">Merkle &amp; On-Chain Verification</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Immutable timestamp anchored into the Polygon Amoy EvidenceRegistry contract.
                  </p>
                </div>
                {capture.anchoring?.txHash && (
                  <span className="px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full border border-emerald-200">
                    Anchored on Polygon
                  </span>
                )}
              </div>

              {capture.anchoring ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                  <div className="space-y-4 text-xs font-mono">
                    <div>
                      <span className="font-sans font-semibold text-slate-500 block mb-1">
                        Canonical Manifest SHA-256:
                      </span>
                      <span className="p-2 bg-slate-50 border border-slate-200 rounded-lg block break-all text-slate-800">
                        {capture.manifestSha256}
                      </span>
                    </div>

                    <div>
                      <span className="font-sans font-semibold text-slate-500 block mb-1">
                        Merkle Root:
                      </span>
                      <span className="p-2 bg-slate-50 border border-slate-200 rounded-lg block break-all text-slate-800">
                        {capture.anchoring.root}
                      </span>
                    </div>

                    <div>
                      <span className="font-sans font-semibold text-slate-500 block mb-1">
                        Transaction Hash:
                      </span>
                      <a
                        href={`https://amoy.polygonscan.com/tx/${capture.anchoring.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 bg-slate-50 border border-slate-200 rounded-lg block break-all text-saakshi-indigo hover:underline flex items-center justify-between"
                      >
                        <span>{capture.anchoring.txHash}</span>
                        <ExternalLink className="w-3.5 h-3.5 shrink-0 ml-2" />
                      </a>
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
                        className="inline-flex items-center space-x-1.5 text-saakshi-indigo font-semibold hover:underline"
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
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition-all"
                  >
                    {anchoringLoading ? "Anchoring..." : "Anchor Root Now"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: DELETION WATCH */}
          {activeTab === "watch" && (
            <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200/80 shadow-soft space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-night">TinyFish Monitor: Edit &amp; Deletion Watch</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Regularly re-fetches URL, normalizes content, and checks against baseline hash.
                  </p>
                </div>
                {capture.isWatching ? (
                  <button
                    onClick={handleCheckWatchNow}
                    disabled={watchChecking}
                    className="px-4 py-2 bg-saakshi-indigo hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl flex items-center space-x-1.5 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${watchChecking ? "animate-spin" : ""}`} />
                    <span>{watchChecking ? "Evaluating Live..." : "Check Now (Demo)"}</span>
                  </button>
                ) : (
                  <button
                    onClick={handleCreateWatch}
                    className="px-4 py-2 bg-saakshi-rose hover:bg-rose-700 text-white text-xs font-semibold rounded-xl flex items-center space-x-1.5 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Activate Deletion Watch</span>
                  </button>
                )}
              </div>

              {/* Watch Check History */}
              <div className="pt-4 border-t border-slate-100 space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Watch Event Log ({watchEvents.length})
                </h4>
                {watchEvents.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">
                    No change checks recorded yet. Click &quot;Check Now&quot; to perform an instant evaluation.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {watchEvents.map((wEvent: any) => (
                      <div
                        key={wEvent.id}
                        className={`p-4 rounded-xl border ${
                          wEvent.type === "DELETED"
                            ? "border-rose-200 bg-rose-50/40 text-rose-900"
                            : wEvent.type === "EDITED"
                            ? "border-amber-200 bg-amber-50/40 text-amber-900"
                            : "border-slate-200 bg-slate-50 text-slate-800"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-xs uppercase">{wEvent.type}</span>
                            <span className="text-[10px] text-slate-500">
                              via {wEvent.source || "monitor"}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-500">
                            {formatIST(wEvent.detectedAt)}
                          </span>
                        </div>
                        <p className="text-xs mt-1">{wEvent.reason}</p>

                        {/* Diff Preview if present */}
                        {wEvent.diff && (
                          <div className="mt-3 p-3 bg-white border border-slate-200 rounded-lg font-mono text-[11px] overflow-x-auto whitespace-pre leading-relaxed text-slate-800">
                            {wEvent.diff}
                          </div>
                        )}

                        {wEvent.recaptureId && (
                          <div className="mt-3">
                            <Link
                              href={`/capture/${wEvent.recaptureId}`}
                              className="text-xs font-semibold text-saakshi-indigo underline hover:text-indigo-800"
                            >
                              View Linked Re-Capture &rarr;
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

          {/* TAB 5: COMPLAINT DRAFTS */}
          {activeTab === "report" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* English Complaint Draft */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-soft flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-night uppercase tracking-wider">
                      Complaint Draft (English)
                    </h3>
                    <button
                      onClick={() =>
                        copyToClipboard(capture.aiAnalysis?.complaint_draft_en || "", "text")
                      }
                      className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center space-x-1"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Draft</span>
                    </button>
                  </div>
                  <textarea
                    readOnly
                    rows={12}
                    value={capture.aiAnalysis?.complaint_draft_en || ""}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none"
                  />
                </div>
              </div>

              {/* Hindi Complaint Draft */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-soft flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-night uppercase tracking-wider">
                      शिकायत प्रारूप (Hindi)
                    </h3>
                    <button
                      onClick={() =>
                        copyToClipboard(capture.aiAnalysis?.complaint_draft_hi || "", "text")
                      }
                      className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center space-x-1"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Draft</span>
                    </button>
                  </div>
                  <textarea
                    readOnly
                    rows={12}
                    value={capture.aiAnalysis?.complaint_draft_hi || ""}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-hindi text-slate-800 focus:outline-none"
                  />
                </div>
              </div>

              {/* Official Reporting Portals */}
              <div className="md:col-span-2 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-soft">
                <h3 className="text-sm font-bold text-night uppercase tracking-wider mb-4">
                  Official Reporting Channels in India
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <a
                    href="https://cybercrime.gov.in"
                    target="_blank"
                    rel="noreferrer"
                    className="p-4 rounded-xl border border-slate-200 hover:border-saakshi-indigo hover:shadow-card transition-all"
                  >
                    <span className="text-xs font-bold text-slate-900 block">NCRP Cyber Portal</span>
                    <span className="text-[11px] text-slate-500 mt-1 block">
                      Helpline 1930 &bull; cybercrime.gov.in
                    </span>
                  </a>

                  <a
                    href="https://consumerhelpline.gov.in"
                    target="_blank"
                    rel="noreferrer"
                    className="p-4 rounded-xl border border-slate-200 hover:border-saakshi-indigo hover:shadow-card transition-all"
                  >
                    <span className="text-xs font-bold text-slate-900 block">Consumer Helpline</span>
                    <span className="text-[11px] text-slate-500 mt-1 block">
                      Helpline 1915 &bull; consumerhelpline.gov.in
                    </span>
                  </a>

                  <a
                    href="https://e-jagriti.gov.in"
                    target="_blank"
                    rel="noreferrer"
                    className="p-4 rounded-xl border border-slate-200 hover:border-saakshi-indigo hover:shadow-card transition-all"
                  >
                    <span className="text-xs font-bold text-slate-900 block">e-Jagriti Commission</span>
                    <span className="text-[11px] text-slate-500 mt-1 block">
                      Online Consumer Disputes Filing
                    </span>
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: CHAIN OF CUSTODY */}
          {activeTab === "custody" && (
            <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200/80 shadow-soft space-y-4">
              <h3 className="text-lg font-bold text-night">Forensic Chain of Custody</h3>
              <p className="text-xs text-slate-500">
                All lifecycle actions (creation, viewing, bundle export, external share, public verification) are logged with cryptographically salted actor identifiers. Key events are signed to the smart contract.
              </p>
              <div className="space-y-3 pt-4 border-t border-slate-100">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900">CREATE</span>
                    <p className="text-slate-500 mt-0.5">Capture created by owner: {truncateHash(capture.ownerUid || "anon")}</p>
                  </div>
                  <span className="text-slate-400 font-mono">{formatIST(capture.createdAt)}</span>
                </div>
                {capture.anchoring && (
                  <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs flex items-center justify-between">
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
