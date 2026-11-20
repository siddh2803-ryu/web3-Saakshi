import React from "react";

export default function VerificationPermalinkLoading() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6 animate-pulse">
        {/* Verification Certificate Card Skeleton */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-8 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row items-center justify-between pb-6 border-b border-slate-100 gap-4">
            <div className="space-y-2 text-center sm:text-left">
              <div className="h-6 w-56 bg-slate-200 rounded" />
              <div className="h-4 w-72 bg-slate-100 rounded" />
            </div>
            <div className="h-10 w-36 bg-emerald-100 rounded-full" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-32 bg-slate-50 rounded-xl" />
            <div className="h-32 bg-slate-50 rounded-xl" />
          </div>

          <div className="h-48 bg-slate-50 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
