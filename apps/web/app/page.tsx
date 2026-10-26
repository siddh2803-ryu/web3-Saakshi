import React from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Cpu,
  Hash,
  Layers,
  History,
  ArrowRight,
  Search,
  Lock,
  FileText,
  HeartHandshake,
  CheckCircle,
  XCircle,
  Terminal,
  ExternalLink,
} from "lucide-react";

export const metadata = {
  title: "Saakshi | Cryptographic Web Evidence & Verification",
  description:
    "Agentic, tamper-proof, court-admissible web evidence preserved by autonomous web agents, fingerprinted with SHA-256, and timestamped on Polygon.",
};

export default function LandingPage() {
  return (
    <div className="flex flex-col items-center">
      {/* Hero Section */}
      <section className="w-full max-w-5xl mx-auto pt-20 pb-16 px-4 sm:px-6 text-center">
        {/* Engineering Specification Badge */}
        <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-md bg-slate-100 border border-slate-200 text-slate-800 text-xs font-semibold mb-6">
          <span className="w-2 h-2 rounded-sm bg-emerald-600" />
          <span>KRITICAL HACKS &apos;26 &bull; Web3 Track &bull; Powered by TinyFish</span>
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight leading-[1.15]">
          Screenshots can be altered. <br className="hidden sm:inline" />
          Web content gets deleted. <br />
          <span className="text-blue-700">Saakshi preserves cryptographic proof.</span>
        </h1>

        {/* Subhead */}
        <p className="mt-6 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
          An autonomous web evidence platform. Headless web agents browse as neutral witnesses, capture forensic step traces, fingerprint plaintext artifacts with SHA-256, and anchor immutable timestamps on Polygon.
        </p>

        {/* CTA Buttons */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/capture/new"
            className="w-full sm:w-auto px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm rounded-lg shadow-sm flex items-center justify-center space-x-2 transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-900"
          >
            <span>Initiate Evidence Capture</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>

          <Link
            href="/verify"
            className="w-full sm:w-auto px-6 py-3.5 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-sm rounded-lg border border-slate-300 shadow-sm flex items-center justify-center space-x-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-900"
          >
            <Search className="w-4 h-4 text-slate-500" />
            <span>Verify File (Client-Side)</span>
          </Link>
        </div>

        {/* Quick Sandbox Target Try */}
        <div className="mt-6 text-xs text-slate-500 flex items-center justify-center space-x-1.5">
          <span>Need a sample target? Inspect our simulated</span>
          <Link
            href="/sandbox/post/internship-scam-alert"
            className="text-blue-700 font-semibold underline hover:text-blue-900"
          >
            Chirp Fraud Listing
          </Link>
        </div>
      </section>

      {/* 4-Step Forensic Architecture */}
      <section className="w-full max-w-6xl mx-auto py-16 px-4 sm:px-6 border-t border-slate-200">
        <div className="text-center mb-12">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
            Cryptographic Pipeline
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
            Tamper-evident web preservation in four automated stages
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Step 1 */}
          <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-sm flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-800 flex items-center justify-center mb-4">
                <Cpu className="w-5 h-5 text-slate-700" />
              </div>
              <span className="text-[11px] font-mono font-semibold text-slate-500 uppercase tracking-wider">
                Stage 01
              </span>
              <h3 className="text-base font-bold text-slate-900 mt-1 mb-2">Neutral Agent Browsing</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                TinyFish autonomous agents navigate the live target without using personal accounts. The agent expands replies, handles modals, and compiles a frame-by-frame filmstrip trace.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500 font-mono">
              Output: Screenshots, DOM HTML, HAR
            </div>
          </div>

          {/* Step 2 */}
          <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-sm flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-800 flex items-center justify-center mb-4">
                <Hash className="w-5 h-5 text-slate-700" />
              </div>
              <span className="text-[11px] font-mono font-semibold text-slate-500 uppercase tracking-wider">
                Stage 02
              </span>
              <h3 className="text-base font-bold text-slate-900 mt-1 mb-2">SHA-256 &amp; Envelope Encryption</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Artifacts are hashed with SHA-256 and structured into an RFC 8785 JSON canonical manifest. Raw payloads are sealed with AES-256-GCM envelope encryption.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500 font-mono">
              Standard: RFC 8785 (JCS) &bull; AES-256-GCM
            </div>
          </div>

          {/* Step 3 */}
          <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-sm flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-800 flex items-center justify-center mb-4">
                <Layers className="w-5 h-5 text-slate-700" />
              </div>
              <span className="text-[11px] font-mono font-semibold text-slate-500 uppercase tracking-wider">
                Stage 03
              </span>
              <h3 className="text-base font-bold text-slate-900 mt-1 mb-2">Merkle Batch Anchoring</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Manifest digests are batched into an OpenZeppelin standard Merkle tree. The Merkle root is anchored into EvidenceRegistry.sol on Polygon Amoy with block timestamps.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500 font-mono">
              Chain: Polygon Amoy (ID: 80002)
            </div>
          </div>

          {/* Step 4 */}
          <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-sm flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-800 flex items-center justify-center mb-4">
                <History className="w-5 h-5 text-slate-700" />
              </div>
              <span className="text-[11px] font-mono font-semibold text-slate-500 uppercase tracking-wider">
                Stage 04
              </span>
              <h3 className="text-base font-bold text-slate-900 mt-1 mb-2">Deletion &amp; Edit Watch</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                TinyFish Monitor checks target pages periodically. If a perpetrator modifies or removes the post, Saakshi flags the structural diff and records an automatic re-capture.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500 font-mono">
              Event Trigger: HTTP 404 / DOM Diff
            </div>
          </div>
        </div>
      </section>

      {/* Evidentiary Comparison Table: Device Screenshot vs Saakshi Bundle */}
      <section className="w-full max-w-5xl mx-auto py-12 px-4 sm:px-6">
        <div className="bg-white rounded-xl border border-slate-200/90 p-6 sm:p-8 shadow-sm">
          <div className="mb-6">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Forensic Comparison
            </span>
            <h3 className="text-xl font-bold text-slate-900 mt-1">
              Why client-side screenshots fail in modern legal disputes
            </h3>
            <p className="text-xs text-slate-600 mt-1">
              Courts and platform compliance teams increasingly reject standard device screenshots due to the ease of DOM inspection and image manipulation.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                  <th className="py-3 pr-4">Evidentiary Requirement</th>
                  <th className="py-3 px-4 text-slate-700">Client Screenshot</th>
                  <th className="py-3 pl-4 text-blue-900 font-bold">Saakshi Cryptographic Bundle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                <tr>
                  <td className="py-3.5 pr-4 font-medium">Independent Witness</td>
                  <td className="py-3.5 px-4 text-slate-500 flex items-center space-x-1.5">
                    <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                    <span>Captured by interested party</span>
                  </td>
                  <td className="py-3.5 pl-4 font-semibold text-slate-900">
                    <span className="inline-flex items-center space-x-1.5 text-emerald-700">
                      <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Autonomous cloud agent with neutral profile</span>
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="py-3.5 pr-4 font-medium">Tamper Resistance</td>
                  <td className="py-3.5 px-4 text-slate-500 flex items-center space-x-1.5">
                    <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                    <span>Easily altered via browser DevTools or photo editor</span>
                  </td>
                  <td className="py-3.5 pl-4 font-semibold text-slate-900">
                    <span className="inline-flex items-center space-x-1.5 text-emerald-700">
                      <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>SHA-256 fingerprint anchored to Polygon blockchain</span>
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="py-3.5 pr-4 font-medium">Verifiable Timestamp</td>
                  <td className="py-3.5 px-4 text-slate-500 flex items-center space-x-1.5">
                    <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                    <span>Local device clock (can be manually adjusted)</span>
                  </td>
                  <td className="py-3.5 pl-4 font-semibold text-slate-900">
                    <span className="inline-flex items-center space-x-1.5 text-emerald-700">
                      <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Decentralized block timestamp on Polygon Amoy</span>
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="py-3.5 pr-4 font-medium">BSA 2023 s.63(4) Alignment</td>
                  <td className="py-3.5 px-4 text-slate-500 flex items-center space-x-1.5">
                    <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                    <span>No hash value disclosure or custody logs</span>
                  </td>
                  <td className="py-3.5 pl-4 font-semibold text-slate-900">
                    <span className="inline-flex items-center space-x-1.5 text-emerald-700">
                      <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Automated Part A draft certificate with full hash schedule</span>
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="py-3.5 pr-4 font-medium">Third-Party Verification</td>
                  <td className="py-3.5 px-4 text-slate-500 flex items-center space-x-1.5">
                    <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                    <span>Impossible to prove exact state retrospectively</span>
                  </td>
                  <td className="py-3.5 pl-4 font-semibold text-slate-900">
                    <span className="inline-flex items-center space-x-1.5 text-emerald-700">
                      <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Zero-upload client-side verifier via W3C WebCrypto</span>
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Legal BSA 2023 & Consumer Protection Framework */}
      <section className="w-full max-w-5xl mx-auto py-12 px-4 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* BSA Section 63(4) Card */}
          <div className="bg-white p-6 sm:p-7 rounded-xl border border-slate-200/90 shadow-sm flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-800 mb-4">
                <FileText className="w-5 h-5 text-slate-700" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Indian Evidence Law (BSA, 2023)
              </h3>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                Section 63(4) of the Bharatiya Sakshya Adhiniyam, 2023 mandates that electronic evidence produced in court must include a certificate disclosing cryptographic hash values, system provenance, and lawful custody details. This standard was affirmed by the Supreme Court of India in <em>Pune Bar Association v. Union of India</em> (May 2026). Saakshi automates the drafting of Part A certificates matching this statutory criteria.
              </p>
            </div>
            <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <Link href="/terms" className="text-blue-700 hover:underline font-semibold">
                Review BSA 2023 Scope &rarr;
              </Link>
              <span className="text-slate-400 font-mono text-[11px]">Part A Automated Draft</span>
            </div>
          </div>

          {/* Incident Response & Anti-Harassment Card */}
          <div className="bg-white p-6 sm:p-7 rounded-xl border border-slate-200/90 shadow-sm flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-800 mb-4">
                <HeartHandshake className="w-5 h-5 text-slate-700" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Protection for Survivors of Online Abuse
              </h3>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                Perpetrators of cyberstalking, morphed non-consensual imagery, and defamatory social media campaigns routinely delete incriminating posts once confronted. Saakshi provides rapid, independent evidence archiving and continuous deletion tracking, securing immutable records for police reporting (NCRP 1930) and platform take-down demands.
              </p>
            </div>
            <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <Link href="/capture/new" className="text-blue-700 hover:underline font-semibold">
                Preserve Harassment Evidence &rarr;
              </Link>
              <span className="text-slate-400 font-mono text-[11px]">NCRP &bull; e-Jagriti &bull; 1930</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
