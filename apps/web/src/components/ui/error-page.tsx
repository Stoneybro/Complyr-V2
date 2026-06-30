"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorPageProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

/**
 * In-dashboard error state. Never navigates away — renders inside SidebarInset.
 */
export function ErrorPage({
  title = "Something went wrong",
  description = "We ran into a problem loading this data. Try refreshing, or come back shortly.",
  onRetry,
}: ErrorPageProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 animate-in fade-in duration-300">
      <div className="flex flex-col items-center text-center gap-5 max-w-sm">
        {/* Icon */}
        <div className="h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>

        {/* Text */}
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {description}
          </p>
        </div>

        {/* Actions */}
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="gap-2"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}
