"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldAlert, ArrowRight, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";

export default function NewCapturePage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [goal, setGoal] = useState("");
  const [mode, setMode] = useState<"standard" | "deep">("standard");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleFillSandbox = () => {
    setUrl("/sandbox/post/internship-scam-alert");
    setGoal("Capture the internship listing, registration fee demand, UPI payment id, and comments warning of fraud.");
    setConsent(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!url.trim()) {
      setErrorMsg("Please enter a target URL.");
      return;
    }

    if (!consent) {
      setErrorMsg("You must confirm the legal preservation consent acknowledgment.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/captures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          goal: goal.trim() || undefined,
          mode,
          consent,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to start capture");
      }

      router.push(`/capture/${data.captureId}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] py-12 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-night">New Evidence Capture</h1>
          <p className="text-sm text-slate-600 mt-1">
            Deploy an automated TinyFish agent to view, record, and fingerprint web content before it is modified or deleted.
          </p>
        </div>

        {/* Demo Fast-Fill Banner */}
        <div className="mb-6 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <Sparkles className="w-5 h-5 text-saakshi-indigo shrink-0" />
            <div className="text-xs text-indigo-950">
              <span className="font-bold">KRITICAL HACKS &apos;26 Demo Post:</span> Click to load the pre-configured Chirp scam post for quick evaluation.
            </div>
          </div>
          <button
            type="button"
            onClick={handleFillSandbox}
            className="px-3 py-1.5 bg-saakshi-indigo text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 whitespace-nowrap transition-colors"
          >
            Auto-Fill
          </button>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form Card */}
        <form
          onSubmit={handleSubmit}
          className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200/80 shadow-soft space-y-6"
        >
          {/* Target URL */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
              Target Web URL <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/post/12345 or /sandbox/post/internship-scam-alert"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-saakshi-indigo"
            />
            <p className="text-[11px] text-slate-500 mt-1.5">
              Public web pages, social posts, forum threads, or job listings.
            </p>
          </div>

          {/* User Goal / Focus */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Investigation Focus / Goal (Optional)
              </label>
              <span className="text-[10px] text-slate-400">{goal.length}/300 chars</span>
            </div>
            <textarea
              maxLength={300}
              rows={3}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. Capture the post, caption, author profile, and top comments acknowledging payment."
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-saakshi-indigo"
            />
          </div>

          {/* Capture Mode Toggle */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
              Capture Depth Mode
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode("standard")}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  mode === "standard"
                    ? "border-saakshi-indigo bg-indigo-50/40 text-slate-900 shadow-sm"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">Standard Capture</span>
                  {mode === "standard" && <CheckCircle2 className="w-4 h-4 text-saakshi-indigo" />}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Budget: 15 agent steps &bull; up to 20 comments &bull; ~60 seconds.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMode("deep")}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  mode === "deep"
                    ? "border-saakshi-indigo bg-indigo-50/40 text-slate-900 shadow-sm"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">Deep Forensics</span>
                  {mode === "deep" && <CheckCircle2 className="w-4 h-4 text-saakshi-indigo" />}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Budget: 30 agent steps &bull; up to 60 comments &bull; ~120 seconds.
                </p>
              </button>
            </div>
          </div>

          {/* Consent Checkbox */}
          <div className="pt-2 border-t border-slate-100">
            <label className="flex items-start space-x-3 cursor-pointer">
              <input
                type="checkbox"
                required
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1 w-4 h-4 text-saakshi-indigo rounded border-slate-300 focus:ring-saakshi-indigo"
              />
              <span className="text-xs text-slate-600 leading-relaxed">
                I am preserving content that concerns me or that I have a legitimate reason to preserve. I will not use Saakshi to stalk, harass, or infringe upon the privacy of any individual.
              </span>
            </label>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 bg-saakshi-indigo hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-sm rounded-xl shadow-soft flex items-center justify-center space-x-2 transition-all"
          >
            <span>{submitting ? "Initiating TinyFish Agent..." : "Launch Evidence Capture"}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
