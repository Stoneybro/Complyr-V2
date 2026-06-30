"use client";

import { useState, useCallback } from "react";
import { AppSidebar, type AppView } from "@/components/ui/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { PaymentForm } from "@/components/payment-form/PaymentForm";
import { ContactList } from "@/components/contacts/ContactList";
import { Button } from "@/components/ui/button";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { EmptyState } from "@/components/ui/empty-state";
import { ShieldCheck, ArrowLeftRight } from "lucide-react";

// View titles
const viewMeta: Record<AppView, { title: string; description: string }> = {
  payments: { title: "Payments", description: "Send and manage onchain payments." },
  audits: { title: "Audits", description: "Review encrypted audit records." },
  transactions: { title: "Transactions", description: "View your transaction history." },
  contacts: { title: "Contacts", description: "Manage your saved contacts." },
};

export default function Page() {
  const [activeView, setActiveView] = useState<AppView>("payments");
  const [showContactForm, setShowContactForm] = useState(false);
  const [isDashboardReady, setIsDashboardReady] = useState(false);
  const [clearSession, setClearSession] = useState<(() => void) | null>(null);

  const handlePhaseChange = useCallback((isReady: boolean) => {
    setIsDashboardReady(isReady);
  }, []);

  const handleReady = useCallback(
    ({ clearSession: cs }: { clearSession: () => void }) => {
      // useState setter with function value needs to be wrapped to avoid
      // React treating it as an updater function
      setClearSession(() => cs);
    },
    []
  );

  const meta = viewMeta[activeView];

  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar
        activeView={activeView}
        onNavigate={(view) => {
          setActiveView(view);
          setShowContactForm(false);
        }}
        isLocked={!isDashboardReady}
        onBeforeDisconnect={clearSession ?? undefined}
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
            {/* Contextual actions — only shown when dashboard is ready */}
            {isDashboardReady && activeView === "contacts" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowContactForm(true)}
              >
                + Add Contact
              </Button>
            )}
          </div>
        </header>

        {/* Content area — gated by OnboardingShell */}
        <div className="flex flex-1 flex-col">
          <OnboardingShell onPhaseChange={handlePhaseChange} onReady={handleReady}>
            {(walletAddress) => (
              <div className="flex flex-1 flex-col px-6 py-4">
                {activeView === "payments" && (
                  <PaymentForm walletAddress={walletAddress} />
                )}

                {activeView === "audits" && (
                  <EmptyState
                    icon={<ShieldCheck className="h-5 w-5" />}
                    title="No audit records yet"
                    description="Encrypted audit records will appear here after your first payment is confirmed onchain."
                  />
                )}

                {activeView === "transactions" && (
                  <EmptyState
                    icon={<ArrowLeftRight className="h-5 w-5" />}
                    title="No transactions yet"
                    description="Your onchain transaction history will appear here after your first payment."
                  />
                )}

                {activeView === "contacts" && (
                  <ContactList
                    walletAddress={walletAddress}
                    showForm={showContactForm}
                    onCloseForm={() => setShowContactForm(false)}
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
