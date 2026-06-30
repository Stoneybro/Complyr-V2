"use client";

import * as React from "react";
import { Check } from "lucide-react";

// ─── Step metadata ────────────────────────────────────────────────────────────

const STEPS = [
  {
    num: 1 as const,
    title: "Deploy Account",
    desc: "Create your onchain smart registry",
  },
  {
    num: 2 as const,
    title: "Configure Policy",
    desc: "Set your authorization thresholds",
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

interface OnboardingLayoutProps {
  currentStep: 1 | 2;
  children: React.ReactNode;
}

/**
 * Split-panel onboarding wrapper.
 *
 * Left (280px): vertical step tracker — title, description, status icon.
 * Right (fills): bare content area, no card, no border, left-aligned.
 *
 * The `key` on the right panel's inner wrapper is set by `currentStep` so
 * React remounts it on every step change, triggering the slide-in animation.
 */
export function OnboardingLayout({ currentStep, children }: OnboardingLayoutProps) {
  return (
    <div className="flex flex-1 min-h-0">
      {/* ── Left: Step tracker ─────────────────────────────────────── */}
      <aside className="w-[280px] shrink-0 border-r border-border flex flex-col px-5 py-10 gap-0.5">
        {/* Product wordmark */}
        <p className="text-xs font-semibold tracking-[0.15em] uppercase text-muted-foreground/60 mb-8 px-3">
          Complyr Setup
        </p>

        {STEPS.map((step) => {
          const isDone = step.num < currentStep;
          const isActive = step.num === currentStep;
          const isUpcoming = step.num > currentStep;

          return (
            <div
              key={step.num}
              className={`
                relative flex items-start gap-3.5 px-3 py-3 rounded-lg transition-all duration-200
                ${isActive ? "bg-muted/40" : ""}
              `}
            >
              {/* Left accent bar for active step */}
              {isActive && (
                <span className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full bg-primary" />
              )}

              {/* Status icon */}
              <div
                className={`
                  mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-all duration-200
                  ${isDone ? "bg-primary text-primary-foreground" : ""}
                  ${isActive ? "border-2 border-primary text-primary bg-transparent" : ""}
                  ${isUpcoming ? "border border-border text-muted-foreground/40 bg-transparent" : ""}
                `}
              >
                {isDone ? (
                  <Check className="h-3 w-3 stroke-[3]" />
                ) : (
                  <span>{step.num}</span>
                )}
              </div>

              {/* Labels */}
              <div className="min-w-0">
                <p
                  className={`text-base font-medium leading-tight transition-colors duration-200 ${
                    isActive
                      ? "text-foreground"
                      : isDone
                      ? "text-muted-foreground"
                      : "text-muted-foreground/40"
                  }`}
                >
                  {step.title}
                </p>
                <p
                  className={`mt-0.5 text-sm leading-tight transition-colors duration-200 ${
                    isActive ? "text-muted-foreground" : "text-muted-foreground/30"
                  }`}
                >
                  {step.desc}
                </p>
              </div>
            </div>
          );
        })}
      </aside>

      {/* ── Right: Step content ────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* Animate on step change */}
        <div
          key={currentStep}
          className="flex flex-1 flex-col px-12 py-10 animate-in fade-in slide-in-from-right-3 duration-300"
        >
          {/* Step counter eyebrow */}
          <p className="text-xs font-semibold tracking-[0.15em] uppercase text-muted-foreground/50 mb-8">
            Step {currentStep} of 2
          </p>

          {children}
        </div>
      </div>
    </div>
  );
}
