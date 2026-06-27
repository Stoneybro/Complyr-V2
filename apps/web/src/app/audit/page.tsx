"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ComplyrConsole } from "@/components/complyr/ComplyrConsole";

export default function AuditPage() {
  return (
    <Suspense fallback={null}>
      <AuditConsole />
    </Suspense>
  );
}

function AuditConsole() {
  const searchParams = useSearchParams();
  return <ComplyrConsole mode="auditor" initialRegistry={searchParams.get("registry") || ""} />;
}
