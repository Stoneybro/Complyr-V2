"use client";

import { useState, useCallback } from "react";
import { AppSidebar, type AppView } from "@/components/ui/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { PaymentForm } from "@/components/payment-form/PaymentForm";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { EmptyState } from "@/components/ui/empty-state";
import { AuditOverview } from "@/components/audits/AuditOverview";
import { ArrowLeftRight } from "lucide-react";

import { SettingsView } from "@/components/settings/SettingsView";

// View titles
const viewMeta: Record<AppView, { title: string; description: string }> = {
  payments: { title: "Payments", description: "Send and manage onchain payments." },
  audits: { title: "Audits", description: "Review encrypted audit records." },
  transactions: { title: "Transactions", description: "View your transaction history." },
  settings: { title: "Settings", description: "Manage business registry and approvers." },
};

export default function Page() {
  const [activeView, setActiveView] = useState<AppView>("payments");
  const [isDashboardReady, setIsDashboardReady] = useState(false);

  const handlePhaseChange = useCallback((isReady: boolean) => {
    setIsDashboardReady(isReady);
  }, []);

  const meta = viewMeta[activeView];

  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar
        activeView={activeView}
        onNavigate={(view) => {
          setActiveView(view);
        }}
        isLocked={!isDashboardReady}
      />

      <SidebarInset>
        {/* Top header bar — always visible */}
        <header className="bg-background sticky top-0 z-20 flex shrink-0 items-center gap-2 border-b px-4 py-3">
          <SidebarTrigger className="-ml-1" />

          <div className="flex flex-1 items-center justify-between">
            <div>
              <h1 className="font-semibold">
                {isDashboardReady ? meta.title : ""}
              </h1>
            </div>
          </div>
        </header>

        {/* Content area — gated by OnboardingShell */}
        <div className="flex flex-1 flex-col">
          <OnboardingShell onPhaseChange={handlePhaseChange}>
            {({ walletAddress, auditRegistryAddress, reviewRegistryAddress }) => (
              <div className="flex flex-1 flex-col px-6 py-4">
                {activeView === "payments" && (
                  <PaymentForm
                    walletAddress={walletAddress}
                    auditRegistryAddress={auditRegistryAddress}
                  />
                )}

                {activeView === "audits" && (
                  <AuditOverview 
                    auditRegistryAddress={auditRegistryAddress} 
                    businessAddress={walletAddress}
                  />
                )}

                {activeView === "transactions" && (
                  <EmptyState
                    icon={<ArrowLeftRight className="h-5 w-5" />}
                    title="No transactions yet"
                    description="Your onchain transaction history will appear here after your first payment."
                  />
                )}

                {activeView === "settings" && (
                  <SettingsView
                    auditRegistryAddress={auditRegistryAddress}
                    walletAddress={walletAddress}
                  />
                )}
              </div>
            )}
          </OnboardingShell>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
