"use client";

import React, { useState } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { sepolia } from "wagmi/chains";
import { Loader2, Settings, ShieldAlert, CheckCircle2, Lock, ListFilter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import ReviewTestRegistryAbi from "@/lib/abis/ReviewTestRegistry.json";
import { TestConfigurator } from "./TestConfigurator";
import { getCategoryOptions, CATEGORY_LABELS } from "@/lib/audit-enums";

interface TestRulesProps {
  reviewRegistryAddress: `0x${string}`;
  accessLevel: number;
}

const TEST_DEFINITIONS = [
  {
    id: 0,
    name: "Materiality",
    description: "Flags any payment above the examination threshold. (Occurrence, Accuracy)",
    configurable: true,
  },
  {
    id: 1,
    name: "Authorization Breach",
    description: "Built-in: Automatically flags if the approver's tier was insufficient for the payment amount. (Authorization)",
    configurable: false,
    builtin: true,
  },
  {
    id: 2,
    name: "Segregation of Duties",
    description: "Built-in: Automatically flags if the same person initiated and approved the payment. (Authorization)",
    configurable: false,
    builtin: true,
  },
  {
    id: 3,
    name: "Missing Evidence",
    description: "Flags any payment above the threshold that lacks a supporting invoice or document hash. (Occurrence)",
    configurable: true,
  },
  {
    id: 4,
    name: "Category Concentration",
    description: "Flags when the total spend in a specific GL Category exceeds the threshold. (Classification)",
    configurable: true,
    requiresScope: true,
  },
  {
    id: 5,
    name: "Recipient Concentration",
    description: "Flags when the total spend to a single recipient exceeds the threshold. (Completeness)",
    configurable: true,
  },
  {
    id: 6,
    name: "Structuring",
    description: "Flags suspiciously split payments just below DoA thresholds. (Coming in V2)",
    configurable: false,
    upcoming: true,
  },
];

const PRIORITY_LABELS = ["None", "Monitoring", "Standard", "Critical"];

export function TestRules({ reviewRegistryAddress, accessLevel }: TestRulesProps) {
  const { address } = useAccount();
  const [configuringTest, setConfiguringTest] = useState<number | null>(null);

  // Read all test configs for this auditor
  const contracts = TEST_DEFINITIONS.map((test) => ({
    address: reviewRegistryAddress,
    abi: ReviewTestRegistryAbi as any,
    functionName: "getTest",
    args: [address, test.id],
    chainId: sepolia.id,
  }));

  const { data: testResults, refetch } = useReadContracts({
    contracts,
    query: {
      enabled: !!address,
    },
  });

  const getStatusBadge = (testId: number, isBuiltin?: boolean, isUpcoming?: boolean) => {
    if (isUpcoming) {
      return <Badge variant="outline" className="text-muted-foreground">Coming Soon</Badge>;
    }
    if (isBuiltin) {
      return <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-0">Always Active</Badge>;
    }

    const testData = testResults?.[testId]?.result as any;
    if (!testData || !testData[3] || testData[0] === 0) {
      return <Badge variant="secondary" className="bg-muted">Not Configured</Badge>;
    }

    return (
      <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-primary/20">
        Active
      </Badge>
    );
  };

  const getTestDetails = (testId: number, requiresScope?: boolean) => {
    const testData = testResults?.[testId]?.result as any;
    if (!testData || !testData[3] || testData[0] === 0) return null;

    const priority = PRIORITY_LABELS[testData[0]];
    const scope = requiresScope ? CATEGORY_LABELS[testData[1]] ?? `Category ${testData[1]}` : null;
    const frequency = testData[0] === 1 ? testData[2] : null;

    return (
      <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Priority: {priority}</span>
        {scope && <span className="flex items-center gap-1"><ListFilter className="h-3 w-3" /> Scope: {scope}</span>}
        {frequency && <span className="flex items-center gap-1">Every {frequency} payments</span>}
        <span className="flex items-center gap-1 text-primary/70"><Lock className="h-3 w-3" /> Threshold Encrypted</span>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto w-full pb-12 space-y-6">
      <div className="flex flex-col gap-1 mb-6 border-b border-border pb-6">
        <h2 className="text-2xl font-semibold tracking-tight">Test Suite</h2>
        <p className="text-sm text-muted-foreground">
          Configure encrypted audit thresholds and rules. Threshold values are hidden by FHE once set.
        </p>
      </div>

      <div className="space-y-4">
        {TEST_DEFINITIONS.map((test) => (
          <div key={test.id} className="p-5 rounded-xl border border-border bg-card flex flex-col md:flex-row md:items-start justify-between gap-4 transition-all hover:shadow-sm">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-base font-medium">{test.name}</h3>
                {getStatusBadge(test.id, test.builtin, test.upcoming)}
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {test.description}
              </p>
              {!test.builtin && !test.upcoming && getTestDetails(test.id, test.requiresScope)}
            </div>

            {test.configurable && (
              <div className="flex flex-col items-end gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfiguringTest(test.id)}
                  className="shrink-0 md:mt-1"
                  disabled={accessLevel < 2} // Requires ANALYTICS or FULL
                >
                  {accessLevel < 2 ? <Lock className="h-4 w-4 mr-2 text-muted-foreground" /> : <Settings className="h-4 w-4 mr-2" />}
                  Configure
                </Button>
                {accessLevel < 2 && (
                  <span className="text-[11px] text-muted-foreground text-right w-32 leading-tight">
                    Requires Analytics or Full access
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {configuringTest !== null && (
        <TestConfigurator
          testId={configuringTest}
          testDefinition={TEST_DEFINITIONS.find((t) => t.id === configuringTest)!}
          reviewRegistryAddress={reviewRegistryAddress}
          onClose={() => setConfiguringTest(null)}
          onConfigured={() => {
            setConfiguringTest(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}
