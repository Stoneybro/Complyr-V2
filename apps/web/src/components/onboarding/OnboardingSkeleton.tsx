"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function OnboardingSkeleton() {
  return (
    <div className="flex flex-1 min-h-0 animate-in fade-in duration-300">
      {/* ── Left: Step tracker ─────────────────────────────────────── */}
      <aside className="w-[280px] shrink-0 border-r border-border flex flex-col px-5 py-10 gap-0.5">
        <Skeleton className="h-3 w-24 mb-8 ml-3 rounded" />
        
        {/* Step 1 */}
        <div className="flex items-start gap-3.5 px-3 py-3">
          <Skeleton className="mt-0.5 h-6 w-6 rounded-full shrink-0" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-32 rounded" />
            <Skeleton className="h-3 w-40 rounded" />
          </div>
        </div>
        
        {/* Step 2 */}
        <div className="flex items-start gap-3.5 px-3 py-3">
          <Skeleton className="mt-0.5 h-6 w-6 rounded-full shrink-0" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-32 rounded" />
            <Skeleton className="h-3 w-40 rounded" />
          </div>
        </div>
      </aside>

      {/* ── Right: Content Area ────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto px-10 py-12">
        <div className="max-w-[460px] space-y-6">
          <Skeleton className="h-8 w-64 rounded-md" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-full rounded" />
            <Skeleton className="h-4 w-5/6 rounded" />
            <Skeleton className="h-4 w-4/6 rounded" />
          </div>
          <Skeleton className="h-11 w-40 rounded-lg mt-8" />
        </div>
      </main>
    </div>
  );
}
