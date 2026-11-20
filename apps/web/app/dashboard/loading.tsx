import React from "react";

export default function DashboardLoading() {
  return (
    <div className="min-h-[calc(100vh-4rem)] py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-8 animate-pulse">
      {/* Header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-slate-200 dark:bg-slate-800 rounded-lg" />
          <div className="h-3.5 w-80 bg-slate-100 dark:bg-slate-800/60 rounded" />
        </div>
        <div className="flex items-center space-x-3">
          <div className="h-8 w-36 bg-slate-200 dark:bg-slate-800 rounded-lg" />
          <div className="h-8 w-24 bg-slate-200 dark:bg-slate-800 rounded-lg" />
          <div className="h-8 w-28 bg-slate-900/20 dark:bg-slate-700 rounded-lg" />
        </div>
      </div>

      {/* KPI Cards skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200/90 dark:border-slate-800 space-y-3">
            <div className="h-3.5 w-20 bg-slate-200 dark:bg-slate-800 rounded" />
            <div className="h-7 w-14 bg-slate-300 dark:bg-slate-700 rounded" />
          </div>
        ))}
      </div>

      {/* Filter bar skeleton */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200/90 dark:border-slate-800 flex flex-wrap gap-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-7 w-20 bg-slate-100 dark:bg-slate-800 rounded-md" />
        ))}
      </div>

      {/* Table skeleton */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800/60">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="p-5 flex items-center justify-between">
            <div className="space-y-2 flex-1">
              <div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-3 w-64 bg-slate-100 dark:bg-slate-800/60 rounded" />
            </div>
            <div className="h-8 w-24 bg-slate-100 dark:bg-slate-800 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
