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
import { ArrowLeftRight, ArrowRight, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useReadContract } from "wagmi";
import AuditRegistryAbi from "@/lib/abis/AuditRegistry.json";
import { useOnboardingState } from "@/hooks/useOnboardingState";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { SettingsView } from "@/components/settings/SettingsView";

// View titles
const viewMeta: Record<AppView, { title: string; description: string }> = {
  payments: { title: "Payments", description: "Send and manage onchain payments." },
  audits: { title: "Audits", description: "Review encrypted audit records." },
  transactions: { title: "Transactions", description: "View your transaction history." },
  settings: { title: "Settings", description: "Manage business registry and approvers." },
};

export default function Page() {
  const router = useRouter();
  const [activeView, setActiveView] = useState<AppView>("payments");
  const [isDashboardReady, setIsDashboardReady] = useState(false);
  const [showNoAuditorDialog, setShowNoAuditorDialog] = useState(false);

  const { state } = useOnboardingState();
  const auditRegistryAddress = state.phase === "ready" ? state.auditRegistryAddress : undefined;
  const walletAddress = state.phase === "ready" ? state.walletAddress : undefined;

  const { data: auditorCountData } = useReadContract({
    address: auditRegistryAddress,
    abi: AuditRegistryAbi,
    functionName: "auditorCount",
    query: {
      enabled: !!auditRegistryAddress,
    },
  });

  const handleAuditorNavigation = () => {
    const count = Number(auditorCountData ?? 0);
    if (count > 0 && walletAddress) {
      window.open(`/auditors/${walletAddress}`, "_blank", "noopener,noreferrer");
    } else {
      setShowNoAuditorDialog(true);
    }
  };

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
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Business Workspace
                </span>
                {isDashboardReady && <span className="text-muted-foreground/40 font-light">/</span>}
              </div>
              {isDashboardReady && (
                <h1 className="font-semibold text-lg tracking-tight text-foreground">
                  {meta.title}
                </h1>
              )}
            </div>

            {/* Right side Auditor link */}
            {isDashboardReady && (
              <Button 
                variant="outline"
                size="sm"
                onClick={handleAuditorNavigation}
                className="text-muted-foreground hover:text-foreground flex items-center gap-1.5"
              >
                Auditor Workspace
                <ExternalLink className="h-4 w-4" />
              </Button>
            )}
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
                    hasAuditor={Number(auditorCountData ?? 0) > 0}
                    onNavigateToAudits={() => setActiveView("audits")}
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

      <AlertDialog open={showNoAuditorDialog} onOpenChange={setShowNoAuditorDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>No Auditors Configured</AlertDialogTitle>
            <AlertDialogDescription>
              You haven't added any auditors to your registry yet. The Auditor Workspace is a dedicated portal for your auditors to review payments. You must assign at least one auditor before accessing it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowNoAuditorDialog(false);
                setActiveView("audits");
              }}
            >
              Add Auditors
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}
