import React from "react";

export default function CaseDetailLoading() {
  return (
    <div className="min-h-[calc(100vh-4rem)] py-8 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto space-y-6 animate-pulse">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-3">
        <div className="h-4 w-28 bg-slate-200 dark:bg-slate-800 rounded font-mono" />
        <div className="h-8 w-64 bg-slate-300 dark:bg-slate-700 rounded" />
        <div className="h-4 w-48 bg-slate-100 dark:bg-slate-800 rounded" />
      </div>

      {/* Notes Skeleton */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-4">
        <div className="h-4 w-36 bg-slate-200 dark:bg-slate-800 rounded" />
        <div className="h-28 bg-slate-50 dark:bg-slate-800/50 rounded-lg" />
      </div>

      {/* Timeline Skeleton */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-4">
        <div className="h-5 w-40 bg-slate-200 dark:bg-slate-800 rounded" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-20 bg-slate-50 dark:bg-slate-800/40 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
