"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { AuditorSidebar, type AuditorAppView } from "@/components/ui/auditor-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AuditorShell } from "@/components/auditors/AuditorShell";
import { TestRules } from "@/components/auditors/TestRules";
import { Findings } from "@/components/auditors/Findings";

const viewMeta: Record<AuditorAppView, { title: string }> = {
  rules: { title: "Test Rules" },
  findings: { title: "Findings" },
};

export default function AuditorPortalPage() {
  const params = useParams();
  const businessAddress = params?.wallet as `0x${string}`;

  const [activeView, setActiveView] = useState<AuditorAppView>("rules");
  const [isReady, setIsReady] = useState(false);

  const meta = viewMeta[activeView];

  return (
    <SidebarProvider defaultOpen={true}>
      <AuditorSidebar
        activeView={activeView}
        onNavigate={setActiveView}
        isLocked={!isReady}
      />

      <SidebarInset>
        {/* Top header bar — always visible */}
        <header className="bg-background sticky top-0 z-20 flex shrink-0 items-center gap-2 border-b px-4 py-3">
          <SidebarTrigger className="-ml-1" />

          <div className="flex flex-1 items-center justify-between">
            <div>
              <h1 className="font-semibold">
                {isReady ? meta.title : ""}
              </h1>
            </div>
          </div>
        </header>

        {/* Content area — gated by AuditorShell */}
        <div className="flex flex-1 flex-col">
          {businessAddress ? (
            <AuditorShell 
              businessAddress={businessAddress}
              onPhaseChange={setIsReady}
            >
              {({ reviewRegistryAddress, accessLevel }) => (
                <div className="flex flex-1 flex-col px-6 py-4">
                  {activeView === "rules" && (
                    <TestRules 
                      reviewRegistryAddress={reviewRegistryAddress}
                      accessLevel={accessLevel}
                    />
                  )}

                  {activeView === "findings" && (
                    <Findings 
                      reviewRegistryAddress={reviewRegistryAddress}
                      accessLevel={accessLevel}
                    />
                  )}
                </div>
              )}
            </AuditorShell>
          ) : (
             <div className="p-4 text-center text-muted-foreground">Invalid business address in URL.</div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
