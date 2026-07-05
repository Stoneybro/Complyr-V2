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
import { Analytics } from "@/components/auditors/Analytics";
import { Payments } from "@/components/auditors/Payments";

const viewMeta: Record<AuditorAppView, { title: string }> = {
  tests:     { title: "Tests" },
  findings:  { title: "Findings" },
  analytics: { title: "Analytics" },
  payments:  { title: "Payments" },
};

export default function AuditorPortalPage() {
  const params = useParams();
  const businessAddress = params?.wallet as `0x${string}`;

  const [activeView, setActiveView] = useState<AuditorAppView>("tests");
  const [isReady, setIsReady] = useState(false);
  const [currentAccessLevel, setCurrentAccessLevel] = useState(0);

  const meta = viewMeta[activeView];

  return (
    <SidebarProvider defaultOpen={true}>
      <AuditorSidebar
        activeView={activeView}
        accessLevel={currentAccessLevel}
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
              onPhaseChange={(ready) => {
                setIsReady(ready);
              }}
              onAccessLevelChange={(level) => {
                if (level !== currentAccessLevel) setCurrentAccessLevel(level);
              }}
            >
              {({ auditRegistryAddress, reviewRegistryAddress, accessLevel, walletAddress, deployedAtBlock }) => {
                return (
                  <div className="flex flex-1 flex-col px-6 py-4">
                    {activeView === "tests" && (
                      <TestRules
                        reviewRegistryAddress={reviewRegistryAddress}
                        accessLevel={accessLevel}
                      />
                    )}

                    {activeView === "findings" && (
                      <Findings
                        auditRegistryAddress={auditRegistryAddress}
                        accessLevel={accessLevel}
                        walletAddress={walletAddress}
                      />
                    )}

                    {activeView === "analytics" && (
                      <Analytics
                        auditRegistryAddress={auditRegistryAddress}
                        deployedAtBlock={deployedAtBlock}
                        walletAddress={walletAddress}
                      />
                    )}

                    {activeView === "payments" && accessLevel >= 3 && (
                      <Payments
                        auditRegistryAddress={auditRegistryAddress}
                        walletAddress={walletAddress}
                      />
                    )}
                  </div>
                );
              }}
            </AuditorShell>
          ) : (
             <div className="p-4 text-center text-muted-foreground">Invalid business address in URL.</div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
