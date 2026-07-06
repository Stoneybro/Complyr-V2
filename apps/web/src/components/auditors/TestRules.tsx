"use client";

import React, { useState, useMemo } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { sepolia } from "wagmi/chains";
import type { Abi } from "viem";
import {
  Settings, ShieldCheck, Clock, CheckCircle2, Lock, ListFilter, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import ReviewTestRegistryAbi from "@/lib/abis/ReviewTestRegistry.json";
import { TestConfigurator } from "./TestConfigurator";
import { CATEGORY_LABELS } from "@/lib/audit-enums";

interface TestRulesProps {
  reviewRegistryAddress: `0x${string}`;
  accessLevel: number;
}

const TEST_DEFINITIONS = [
  {
    id: 0,
    name: "Materiality",
    description: "Flags any payment above the configured threshold.",
    configurable: true,
  },
  {
    id: 1,
    name: "Authorization Breach",
    description: "Flags if the approver's authority tier was insufficient for the payment amount.",
    configurable: false,
    builtin: true,
  },
  {
    id: 2,
    name: "Segregation of Duties",
    description: "Flags if the same person initiated and approved a payment, or if the recipient approved their own payment.",
    configurable: false,
    builtin: true,
  },
  {
    id: 3,
    name: "Missing Evidence",
    description: "Flags payments above the threshold that lack a supporting invoice or document hash.",
    configurable: true,
  },
  {
    id: 4,
    name: "Category Concentration",
    description: "Flags when cumulative spend in a specific category exceeds the threshold.",
    configurable: true,
    requiresScope: true,
  },
  {
    id: 5,
    name: "Recipient Concentration",
    description: "Flags when cumulative spend to a single recipient exceeds the threshold.",
    configurable: true,
  },
];

const PRIORITY_LABELS = ["None", "Monitoring", "Standard", "Critical"];
const CONFIGURABLE_TESTS = TEST_DEFINITIONS.filter((t) => t.configurable);
const INVARIANT_TESTS = TEST_DEFINITIONS.filter((t) => t.builtin);
const CONFIGURABLE_TEST_IDS = CONFIGURABLE_TESTS.map((t) => t.id);

type TestConfigResult = readonly [
  priority: number | bigint,
  scope: number | bigint,
  monitoringFrequency: number | bigint,
  exists: boolean,
  threshold: `0x${string}`,
];

export function TestRules({ reviewRegistryAddress }: TestRulesProps) {
  const { address } = useAccount();
  const [configuringTest, setConfiguringTest] = useState<number | null>(null);

  const contracts = useMemo(
    () =>
      address
        ? CONFIGURABLE_TESTS.map((test) => ({
            address: reviewRegistryAddress,
            abi: ReviewTestRegistryAbi as Abi,
            functionName: "getTest",
            args: [address, test.id],
            chainId: sepolia.id,
          }))
        : [],
    [address, reviewRegistryAddress]
  );

  const { data: testResults, refetch } = useReadContracts({
    contracts,
    query: { enabled: !!address },
  });

  // Map results back by testId since we only fetched configurable tests
  const testResultMap = useMemo(() => {
    const map: Record<number, TestConfigResult | undefined> = {};
    CONFIGURABLE_TEST_IDS.forEach((id, i) => {
      map[id] = testResults?.[i]?.result as TestConfigResult | undefined;
    });
    return map;
  }, [testResults]);

  const isConfigured = (testId: number): boolean => {
    const d = testResultMap[testId];
    return !!d && d[3] === true && Number(d[0]) !== 0;
  };

  const getStatusIndicator = (test: typeof TEST_DEFINITIONS[number]) => {
    if (test.builtin) {
      return (
        <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
          <ShieldCheck className="h-3.5 w-3.5" /> Always Active
        </span>
      );
    }
    if (isConfigured(test.id)) {
      return (
        <span className="flex items-center gap-1.5 text-primary font-medium">
          <CheckCircle2 className="h-3.5 w-3.5" /> Active
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Clock className="h-3.5 w-3.5" /> Inactive
      </span>
    );
  };

  const getTestDetails = (test: typeof TEST_DEFINITIONS[number]) => {
    const d = testResultMap[test.id];
    
    if (!test.configurable) {
      return (
        <div className="flex flex-wrap items-center gap-4 pt-2 text-sm text-muted-foreground">
          {getStatusIndicator(test)}
        </div>
      );
    }

    if (!d || Number(d[0]) === 0 || !d[3]) {
      return (
        <div className="flex flex-wrap items-center gap-4 pt-2 text-sm text-muted-foreground">
          {getStatusIndicator(test)}
        </div>
      );
    }

    const priority = PRIORITY_LABELS[Number(d[0])];
    const scope = test.requiresScope ? CATEGORY_LABELS[Number(d[1])] ?? `Category ${d[1]}` : null;
    const frequency = Number(d[0]) === 1 ? Number(d[2]) : null;

    return (
      <div className="flex flex-wrap items-center gap-4 pt-2 text-sm text-muted-foreground">
        {getStatusIndicator(test)}
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" /> Priority: {priority}
        </span>
        {scope && (
          <span className="flex items-center gap-1.5">
            <ListFilter className="h-3.5 w-3.5" /> Scope: {scope}
          </span>
        )}
        {frequency && (
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Every {frequency} payments
          </span>
        )}
        <span className="flex items-center gap-1.5 text-primary/70">
          <Lock className="h-3.5 w-3.5" /> Threshold encrypted
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
        {CONFIGURABLE_TESTS.map((test) => (
          <div
            key={test.id}
            className="p-6 rounded-xl border border-border bg-card flex flex-col sm:flex-row sm:items-start justify-between gap-6 transition-all hover:shadow-sm"
          >
            <div className="flex-1 space-y-1.5">
              <h4 className="text-base font-semibold">{test.name}</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {test.description}
              </p>
              {getTestDetails(test)}
            </div>

            <div className="flex flex-col items-end shrink-0 sm:min-w-[140px] pt-1">
              <Button
                variant={isConfigured(test.id) ? "outline" : "default"}
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => setConfiguringTest(test.id)}
              >
                <Settings className="h-4 w-4 mr-2" />
                {isConfigured(test.id) ? "Edit Config" : "Configure"}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="pt-6 mt-8 space-y-4">
        <Alert className="w-full bg-muted/30 border-muted-foreground/20">
          <Info className="h-4 w-4 text-primary" />
          <AlertDescription className="text-muted-foreground leading-relaxed">
            The following tests do not run at runtime. They run automatically when approvals are carried out.
          </AlertDescription>
        </Alert>
        
        {INVARIANT_TESTS.map((test) => (
          <div
            key={test.id}
            className="p-6 rounded-xl border border-border bg-card flex flex-col sm:flex-row sm:items-start justify-between gap-6 transition-all"
          >
            <div className="flex-1 space-y-1.5">
              <h4 className="text-base font-semibold">{test.name}</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {test.description}
              </p>
              {getTestDetails(test)}
            </div>
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
