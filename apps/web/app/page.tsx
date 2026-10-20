import React from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Camera,
  Hash,
  Layers,
  Eye,
  ArrowRight,
  Search,
  Lock,
  FileText,
  HeartHandshake,
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="flex flex-col items-center">
      {/* Hero Section */}
      <section className="w-full max-w-5xl mx-auto pt-20 pb-16 px-4 sm:px-6 text-center">
        {/* Hackathon Badge */}
        <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-saakshi-indigo text-xs font-semibold mb-6">
          <span className="w-2 h-2 rounded-full bg-saakshi-indigo animate-pulse" />
          <span>KRITICAL HACKS &apos;26 &bull; Web3 Track &bull; Powered by TinyFish</span>
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-night tracking-tight leading-[1.15]">
          Screenshots can be faked. <br className="hidden sm:inline" />
          Posts disappear. <br />
          <span className="text-saakshi-indigo">Saakshi keeps the proof.</span>
        </h1>

        {/* Subhead */}
        <p className="mt-6 text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
          An AI witness for the internet. Autonomous TinyFish web agents browse, record forensic step traces, fingerprint artifacts with SHA-256, and anchor immutable timestamps on Polygon.
        </p>

        {/* CTA Buttons */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/capture/new"
            className="w-full sm:w-auto px-8 py-3.5 bg-saakshi-indigo hover:bg-indigo-700 text-white font-semibold text-sm rounded-xl shadow-soft flex items-center justify-center space-x-2 transition-all group"
          >
            <span>Start a Capture</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>

          <Link
            href="/verify"
            className="w-full sm:w-auto px-8 py-3.5 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-sm rounded-xl border border-slate-200 shadow-card flex items-center justify-center space-x-2 transition-all"
          >
            <Search className="w-4 h-4 text-slate-500" />
            <span>Verify a File (No Sign-in)</span>
          </Link>
        </div>

        {/* Quick Sandbox Target Try */}
        <div className="mt-6 text-xs text-slate-500">
          Want to test now? Try preserving our{" "}
          <Link
            href="/sandbox/post/internship-scam-alert"
            className="text-saakshi-indigo font-semibold underline hover:text-indigo-800"
          >
            Chirp Demo Post
          </Link>
        </div>
      </section>

      {/* 4-Step Forensics Explainer */}
      <section className="w-full max-w-6xl mx-auto py-16 px-4 sm:px-6 border-t border-slate-200/80">
        <div className="text-center mb-12">
          <h2 className="text-xs font-bold text-saakshi-indigo uppercase tracking-widest">
            Architecture &amp; Process
          </h2>
          <p className="text-2xl sm:text-3xl font-bold text-night mt-2">
            Court-ready web evidence in four automated stages
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Step 1 */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-soft relative flex flex-col">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-saakshi-indigo flex items-center justify-center mb-4 font-bold">
              <Camera className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-semibold text-saakshi-indigo tracking-wider uppercase">
              Step 01
            </span>
            <h3 className="text-base font-bold text-slate-900 mt-1 mb-2">TinyFish Capture</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              A neutral cloud web agent opens the link, handles popups, expands comments, and documents every single action in a replayable step-by-step filmstrip.
            </p>
          </div>

          {/* Step 2 */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-soft relative flex flex-col">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-saakshi-amber flex items-center justify-center mb-4 font-bold">
              <Hash className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-semibold text-saakshi-amber tracking-wider uppercase">
              Step 02
            </span>
            <h3 className="text-base font-bold text-slate-900 mt-1 mb-2">Fingerprint &amp; Encrypt</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Every plaintext artifact is fingerprinted with SHA-256 and structured into an RFC 8785 canonical manifest. Artifacts are sealed with AES-256-GCM.
            </p>
          </div>

          {/* Step 3 */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-soft relative flex flex-col">
            <div className="w-10 h-10 rounded-xl bg-teal-50 text-saakshi-teal flex items-center justify-center mb-4 font-bold">
              <Layers className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-semibold text-saakshi-teal tracking-wider uppercase">
              Step 03
            </span>
            <h3 className="text-base font-bold text-slate-900 mt-1 mb-2">On-Chain Anchoring</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Manifest hashes are compiled into an OpenZeppelin Merkle tree. The root is committed to our Polygon Amoy registry with an immutable block timestamp.
            </p>
          </div>

          {/* Step 4 */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-soft relative flex flex-col">
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-saakshi-rose flex items-center justify-center mb-4 font-bold">
              <Eye className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-semibold text-saakshi-rose tracking-wider uppercase">
              Step 04
            </span>
            <h3 className="text-base font-bold text-slate-900 mt-1 mb-2">Deletion Watch</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              TinyFish Monitor checks the URL regularly. If an author alters or deletes the incriminating post, Saakshi flags the diff and alerts you immediately.
            </p>
          </div>
        </div>
      </section>

      {/* Legal BSA 2023 & Saakshi for Her Tier */}
      <section className="w-full max-w-5xl mx-auto py-12 px-4 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* BSA Section 63(4) Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-soft flex items-start space-x-4">
            <div className="p-3 bg-indigo-50 text-saakshi-indigo rounded-xl">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-night">
                Indian Evidence Law (BSA, 2023)
              </h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Section 63(4) of the Bharatiya Sakshya Adhiniyam, 2023 requires electronic evidence certificates to disclose the record&apos;s hash value, affirmed by the Supreme Court in <em>Pune Bar Association v. Union of India</em> (May 2026). Saakshi pre-fills Part A drafts with every artifact hash and Merkle anchor.
              </p>
            </div>
          </div>

          {/* Saakshi for Her Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-soft flex items-start space-x-4">
            <div className="p-3 bg-rose-50 text-saakshi-rose rounded-xl">
              <HeartHandshake className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-night">Saakshi for Her</h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Harassment survivors, victims of morphed imagery, and cyberstalking targets receive sponsored priority captures and free deletion tracking. Fast, private, and independent evidence preservation when you need it most.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
