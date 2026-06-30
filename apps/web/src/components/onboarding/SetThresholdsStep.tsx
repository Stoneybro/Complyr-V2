"use client";

import * as React from "react";
import { useState } from "react";
import { ShieldAlert, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SetThresholdsStepProps {
  onConfigured: () => void;
}

/**
 * Step 2 — Configure Authorization Policy.
 *
 * Prompts the user to set DoA (Delegation of Authority) thresholds.
 * For now, this simply updates the frontend state. The actual smart contract 
 * interaction (setAuthTierThresholds) will be wired up when the ABI is ready.
 */
export function SetThresholdsStep({ onConfigured }: SetThresholdsStepProps) {
  const [managerThreshold, setManagerThreshold] = useState("1000");
  const [directorThreshold, setDirectorThreshold] = useState("10000");
  const [boardThreshold, setBoardThreshold] = useState("50000");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // TODO: Connect this to the actual `setAuthTierThresholds` contract call.
      // e.g. await writeContractAsync({ ... })
      
      // Simulate network delay for now
      await new Promise((resolve) => setTimeout(resolve, 1500));
      
      onConfigured();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-[460px]">
      {/* Headline */}
      <h1 className="text-3xl font-semibold tracking-tight mb-4">
        Set authorization thresholds
      </h1>
      <p className="text-base text-muted-foreground leading-relaxed mb-10">
        Define the monetary thresholds for each approval tier. Payments exceeding 
        these amounts will automatically require higher-level cryptographic signatures.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-4">
          <ThresholdInput 
            id="manager" 
            label="Manager Tier" 
            desc="Payments above this amount require Manager approval"
            value={managerThreshold} 
            onChange={(e) => setManagerThreshold(e.target.value)} 
          />
          <ThresholdInput 
            id="director" 
            label="Director Tier" 
            desc="Payments above this amount require Director approval"
            value={directorThreshold} 
            onChange={(e) => setDirectorThreshold(e.target.value)} 
          />
          <ThresholdInput 
            id="board" 
            label="Board Tier" 
            desc="Payments above this amount require full Board approval"
            value={boardThreshold} 
            onChange={(e) => setBoardThreshold(e.target.value)} 
          />
        </div>

        <div className="mt-8 rounded-lg border border-primary/20 bg-primary/5 p-4 flex gap-3 text-sm text-foreground/80">
          <ShieldAlert className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <p>
            These thresholds will be FHE-encrypted onchain. Reviewers and smart contracts 
            will evaluate policies without ever exposing the exact amounts in plaintext.
          </p>
        </div>

        <div className="pt-6">
          <Button 
            type="submit" 
            className="w-full h-12 text-base font-medium"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Encrypting & saving...
              </>
            ) : (
              <>
                Save thresholds <ArrowRight className="ml-2 h-5 w-5" />
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

function ThresholdInput({ 
  id, 
  label, 
  desc, 
  value, 
  onChange 
}: { 
  id: string, 
  label: string, 
  desc: string, 
  value: string, 
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void 
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
        <input
          id={id}
          type="number"
          required
          min="0"
          value={value}
          onChange={onChange}
          className="flex h-11 w-full rounded-md border border-input bg-transparent pl-8 pr-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="0.00"
        />
      </div>
      <p className="text-[13px] text-muted-foreground">
        {desc}
      </p>
    </div>
  );
}
