"use client";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Full-page skeleton that mirrors the dashboard content layout.
 * Shown during the "loading" phase while wagmi reconnects.
 */
export function SkeletonPage() {
  return (
    <div className="flex flex-1 flex-col px-6 py-6 max-w-2xl mx-auto w-full gap-6 animate-in fade-in duration-300">
      {/* Faux header bar */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-7 w-28 rounded-md" />
        <Skeleton className="h-5 w-16 rounded-md ml-auto" />
      </div>

      {/* Faux tabs */}
      <div className="flex gap-2">
        <Skeleton className="h-8 w-20 rounded-md" />
        <Skeleton className="h-8 w-20 rounded-md" />
      </div>

      {/* Faux form card */}
      <div className="space-y-4 p-5 border border-border rounded-xl">
        <div className="grid grid-cols-[1fr_140px] gap-4">
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-28 rounded" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-16 rounded" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
        </div>

        <div className="border-t border-dashed pt-4 space-y-3">
          <Skeleton className="h-4 w-40 rounded" />
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-dashed">
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-20 rounded" />
            <Skeleton className="h-8 w-full rounded-lg" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-24 rounded" />
            <Skeleton className="h-8 w-full rounded-lg" />
          </div>
        </div>
      </div>

      {/* Faux approval card */}
      <div className="flex items-start gap-3 p-4 border border-border rounded-xl">
        <Skeleton className="h-4 w-4 rounded mt-0.5 shrink-0" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-36 rounded" />
          <Skeleton className="h-3 w-full rounded" />
          <Skeleton className="h-3 w-3/4 rounded" />
        </div>
      </div>

      {/* Faux submit */}
      <Skeleton className="h-9 w-full rounded-lg" />
    </div>
  );
}
