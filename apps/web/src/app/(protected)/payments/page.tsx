"use client";

import { useState, useCallback, useEffect } from "react";
import { AppSidebar, type AppView } from "@/components/ui/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { PaymentForm } from "@/components/payment-form/PaymentForm";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { AuditOverview } from "@/components/audits/AuditOverview";
import { TransactionHistory } from "@/components/transactions/TransactionHistory";
import { ArrowRight, ExternalLink, InfoIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useReadContract, usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import AuditRegistryAbi from "@/lib/abis/AuditRegistry.json";
import { useOnboardingState } from "@/hooks/useOnboardingState";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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


// View titles
const viewMeta: Record<AppView, { title: string; description: string }> = {
  payments: { title: "Payments", description: "Send and manage onchain payments." },
  audits: { title: "Audits", description: "Review encrypted audit records." },
  transactions: { title: "Transactions", description: "View your transaction history." },
};

export default function Page() {
  const router = useRouter();
  const [activeView, setActiveView] = useState<AppView>("payments");
  const [isDashboardReady, setIsDashboardReady] = useState(false);
  const [showNoAuditorDialog, setShowNoAuditorDialog] = useState(false);

  const { state } = useOnboardingState();
  const auditRegistryAddress = state.phase === "ready" ? state.auditRegistryAddress : undefined;
  const walletAddress = state.phase === "ready" ? state.walletAddress : undefined;

  const publicClient = usePublicClient();
  const { data: auditorCountData } = useQuery({
    queryKey: ["auditor-count", auditRegistryAddress],
    queryFn: async () => {
      if (!publicClient || !auditRegistryAddress) return 0;
      const result = await publicClient.readContract({
        address: auditRegistryAddress,
        abi: AuditRegistryAbi,
        functionName: "auditorCount",
      });
      return Number(result ?? 0);
    },
    enabled: !!publicClient && !!auditRegistryAddress,
    // Shared key so AuditorManagement can invalidate it the moment a grant
    // confirms — lifts the payments lock without a page refresh.
    refetchInterval: 15_000,
  });

  // Payments require at least one auditor (possibly the owner's own address):
  // tests are evaluated against payments at send time, so without an auditor
  // nothing is auditable. Until one exists, users stay on the Audits view.
  const hasAuditor = auditorCountData !== undefined && Number(auditorCountData) > 0;

  useEffect(() => {
    if (auditorCountData !== undefined && !hasAuditor && activeView === "payments") {
      setActiveView("audits");
    }
  }, [auditorCountData, hasAuditor, activeView]);

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
        lockedViews={hasAuditor ? [] : ["payments"]}
      />

      <SidebarInset>
        {/* Top header bar — always visible */}
        <header className="bg-background sticky top-0 z-20 flex shrink-0 items-center gap-2 border-b px-4 py-3">
          <SidebarTrigger className="-ml-1" />

          <div className="flex flex-1 items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <span className=" font-medium text-muted-foreground">
                  Business workspace
                </span>
                {isDashboardReady && <span className="text-muted-foreground/40 font-light">/</span>}
              </div>
              {isDashboardReady && (
                <h1 className="font-semibold  tracking-tight text-foreground">
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
                Auditor workspace
                <ExternalLink className="h-4 w-4" />
              </Button>
            )}
          </div>
        </header>

        {/* Content area — gated by OnboardingShell */}
        <div className="flex flex-1 flex-col">
          <OnboardingShell onPhaseChange={handlePhaseChange}>
            {({ walletAddress, auditRegistryAddress, reviewRegistryAddress }) => {
              return (
              <div className="flex flex-1 flex-col px-6 py-4">
                {activeView === "payments" && (
                  <PaymentForm
                    walletAddress={walletAddress}
                    auditRegistryAddress={auditRegistryAddress}
                    hasAuditor={hasAuditor}
                    onNavigateToAudits={() => setActiveView("audits")}
                  />
                )}

                {activeView === "audits" && (
                  <div className="flex flex-col gap-4">
                    {!hasAuditor && (
                      <Alert className="max-w-4xl mx-auto w-full">
                        <InfoIcon />
                        <AlertTitle>Payments are locked until you add an auditor</AlertTitle>
                        <AlertDescription>
                          Audit tests evaluate payments at send time, so at least one
                          auditor must exist first — your own address works too. Add one
                          below, then open the auditor portal and configure the tests
                          that should run against your payments.
                        </AlertDescription>
                      </Alert>
                    )}
                    <AuditOverview
                      auditRegistryAddress={auditRegistryAddress}
                      businessAddress={walletAddress}
                    />
                  </div>
                )}

                {activeView === "transactions" && (
                  <TransactionHistory
                    auditRegistryAddress={auditRegistryAddress}
                    walletAddress={walletAddress}
                  />
                )}

              </div>
              );
            }}
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
