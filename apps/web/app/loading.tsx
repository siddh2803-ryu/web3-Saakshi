import React from "react";

export default function Loading() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="flex flex-col items-center space-y-4">
        <div className="w-10 h-10 border-3 border-slate-200 border-t-slate-900 rounded-full animate-spin dark:border-slate-800 dark:border-t-white" />
        <p className="text-xs font-mono text-slate-500 tracking-wide animate-pulse">
          Loading Saakshi...
        </p>
      </div>
    </div>
  );
}
