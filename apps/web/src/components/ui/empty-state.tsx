"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * Reusable in-dashboard empty state.
 * Used by Audits, Transactions, Contacts when there's nothing to show.
 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 animate-in fade-in duration-300">
      <div className="flex flex-col items-center text-center gap-5 max-w-xs">
        {icon && (
          <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
            {icon}
          </div>
        )}

        <div className="space-y-2">
          <h3 className="text-base font-semibold">{title}</h3>
          {description && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {description}
            </p>
          )}
        </div>

        {action && (
          <Button size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </div>
    </div>
  );
}
