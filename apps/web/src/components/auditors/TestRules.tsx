"use client";

import React, { useState, useMemo } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { sepolia } from "wagmi/chains";
import {
  Loader2, Settings, ShieldCheck, AlertTriangle, Clock, CheckCircle2, Lock, ListFilter,
} from "lucide-react";
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
    description: "Always active. Flags if the approver's authority tier was insufficient for the payment amount. (Authorization)",
    configurable: false,
    builtin: true,
  },
  {
    id: 2,
    name: "Segregation of Duties",
    description: "Always active. Flags if the same person initiated and approved a payment, or if the recipient approved their own payment. (Authorization)",
    configurable: false,
    builtin: true,
  },
  {
    id: 3,
    name: "Missing Evidence",
    description: "Flags payments above the threshold that lack a supporting invoice or document hash. (Occurrence)",
    configurable: true,
  },
  {
    id: 4,
    name: "Category Concentration",
    description: "Flags when cumulative spend in a specific GL category exceeds the threshold. (Classification)",
    configurable: true,
    requiresScope: true,
  },
  {
    id: 5,
    name: "Recipient Concentration",
    description: "Flags when cumulative spend to a single recipient exceeds the threshold. (Completeness)",
    configurable: true,
  },
  {
    id: 6,
    name: "Structuring",
    description: "Flags suspiciously split payments just below DoA thresholds. Launching in V2.",
    configurable: false,
    upcoming: true,
  },
];

const PRIORITY_LABELS = ["None", "Monitoring", "Standard", "Critical"];

export function TestRules({ reviewRegistryAddress, accessLevel }: TestRulesProps) {
  const { address } = useAccount();
  const [configuringTest, setConfiguringTest] = useState<number | null>(null);

  const contracts = TEST_DEFINITIONS.filter((t) => t.configurable).map((test) => ({
    address: reviewRegistryAddress,
    abi: ReviewTestRegistryAbi as any,
    functionName: "getTest",
    args: [address, test.id],
    chainId: sepolia.id,
  }));

  const { data: testResults, refetch } = useReadContracts({
    contracts,
    query: { enabled: !!address },
  });

  // Map results back by testId since we only fetched configurable tests
  const configurableIds = TEST_DEFINITIONS.filter((t) => t.configurable).map((t) => t.id);
  const testResultMap = useMemo(() => {
    const map: Record<number, any> = {};
    configurableIds.forEach((id, i) => {
      map[id] = testResults?.[i]?.result;
    });
    return map;
  }, [testResults, configurableIds]);

  const isConfigured = (testId: number): boolean => {
    const d = testResultMap[testId] as any;
    return !!d && d[3] === true && Number(d[0]) !== 0;
  };

  const getStatusBadge = (test: typeof TEST_DEFINITIONS[number]) => {
    if (test.upcoming) {
      return <Badge variant="outline" className="text-muted-foreground border-dashed">Coming Soon</Badge>;
    }
    if (test.builtin) {
      return (
        <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-0">
          <ShieldCheck className="h-3 w-3 mr-1" /> Always Active
        </Badge>
      );
    }
    if (isConfigured(test.id)) {
      return (
        <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-primary/20">
          <CheckCircle2 className="h-3 w-3 mr-1" /> Configured & Active
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-0">
        <Clock className="h-3 w-3 mr-1" /> Inactive
      </Badge>
    );
  };

  const getTestDetails = (testId: number, requiresScope?: boolean) => {
    const d = testResultMap[testId] as any;
    if (!d || Number(d[0]) === 0 || !d[3]) return null;

    const priority = PRIORITY_LABELS[Number(d[0])];
    const scope = requiresScope ? CATEGORY_LABELS[Number(d[1])] ?? `Category ${d[1]}` : null;
    const frequency = Number(d[0]) === 1 ? Number(d[2]) : null;

    return (
      <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" /> Priority: {priority}
        </span>
        {scope && (
          <span className="flex items-center gap-1">
            <ListFilter className="h-3 w-3" /> Scope: {scope}
          </span>
        )}
        {frequency && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" /> Every {frequency} payments
          </span>
        )}
        <span className="flex items-center gap-1 text-primary/70">
          <Lock className="h-3 w-3" /> Threshold encrypted
        </span>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto w-full pb-12 space-y-6">
      <div className="flex flex-col gap-1 mb-6 border-b border-border pb-6">
        <h2 className="text-2xl font-semibold tracking-tight">Test Suite</h2>
        <p className="text-sm text-muted-foreground">
          Configure encrypted audit thresholds. Threshold values are FHE-encrypted before leaving your browser.
        </p>
      </div>

      <div className="space-y-4">
        {TEST_DEFINITIONS.map((test) => (
          <div
            key={test.id}
            className={`p-5 rounded-xl border bg-card flex flex-col md:flex-row md:items-start justify-between gap-4 transition-all hover:shadow-sm ${
              test.upcoming ? "opacity-60 border-dashed" : "border-border"
            }`}
          >
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-base font-medium">{test.name}</h3>
                {getStatusBadge(test)}
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {test.description}
              </p>
              {test.configurable && !test.upcoming && getTestDetails(test.id, test.requiresScope)}
            </div>

            {test.configurable && !test.upcoming && (
              <div className="flex flex-col items-end gap-1 shrink-0 md:mt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfiguringTest(test.id)}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  {isConfigured(test.id) ? "Edit" : "Configure"}
                </Button>
              </div>
            )}

            {test.upcoming && (
              <div className="flex flex-col items-end gap-1 shrink-0 md:mt-1">
                <Button variant="ghost" size="sm" disabled className="opacity-50">
                  Coming Soon
                </Button>
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
