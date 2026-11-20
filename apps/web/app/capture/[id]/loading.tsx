import React from "react";

export default function CaptureDetailLoading() {
  return (
    <div className="min-h-[calc(100vh-4rem)] py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-6 animate-pulse">
      {/* Top Banner Skeleton */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-2 flex-1">
            <div className="flex items-center space-x-2">
              <div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 rounded font-mono" />
              <div className="h-5 w-20 bg-slate-100 dark:bg-slate-800 rounded-md" />
            </div>
            <div className="h-6 w-3/4 bg-slate-300 dark:bg-slate-700 rounded" />
          </div>
          <div className="flex items-center space-x-2">
            <div className="h-9 w-24 bg-slate-200 dark:bg-slate-800 rounded-lg" />
            <div className="h-9 w-28 bg-slate-200 dark:bg-slate-800 rounded-lg" />
          </div>
        </div>
      </div>

      {/* Main Grid Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-900 h-96 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-6" />
        </div>
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 h-64 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-6" />
          <div className="bg-white dark:bg-slate-900 h-48 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-6" />
        </div>
      </div>
    </div>
  );
}
