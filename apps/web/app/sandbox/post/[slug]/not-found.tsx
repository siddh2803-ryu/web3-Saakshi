import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export default function ChirpPostNotFound() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-8 text-center shadow-sm">
        <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-200">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">This post has been removed</h1>
        <p className="text-sm text-slate-600 mb-6 leading-relaxed">
          The author or platform administrator removed this publication. It is no longer accessible on the live network.
        </p>
        <div className="p-3 bg-slate-100 rounded-lg text-xs font-mono text-slate-700 mb-4 border border-slate-200">
          HTTP 404 &bull; Content Unavailable
        </div>
        <Link
          href="/sandbox/admin"
          className="text-xs text-blue-700 hover:underline font-semibold"
        >
          Go to Sandbox Admin Console
        </Link>
      </div>
    </div>
  );
}
