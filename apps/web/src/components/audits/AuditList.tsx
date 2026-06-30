"use client";

import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Lock, FileText, CheckCircle2, Clock, Search, ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

const MOCK_AUDITS = [
  {
    id: "0x1a2b3c...4d5e",
    date: "2023-10-27 14:32",
    recipient: "0x7a5...3b92",
    amount: "1500.00",
    hasInvoice: true,
    hasPO: false,
    status: "approved",
  },
  {
    id: "0x5f6g7h...8i9j",
    date: "2023-10-26 09:15",
    recipient: "0x8b2...1c44",
    amount: "450.50",
    hasInvoice: true,
    hasPO: true,
    status: "pending",
  },
  {
    id: "0x9k0l1m...2n3o",
    date: "2023-10-25 11:00",
    recipient: "0x9c3...2d55",
    amount: "3200.00",
    hasInvoice: false,
    hasPO: false,
    status: "approved",
  }
];

export function AuditList() {
  const [search, setSearch] = useState("");
  const [isDecrypting, setIsDecrypting] = useState<string | null>(null);

  const handleDecrypt = (id: string) => {
    setIsDecrypting(id);
    // Simulate decryption delay
    setTimeout(() => {
      setIsDecrypting(null);
      // In a real app, this would open a dialog with the decrypted data
    }, 1500);
  };

  const filteredAudits = MOCK_AUDITS.filter(a => a.recipient.includes(search) || a.id.includes(search));

  if (MOCK_AUDITS.length === 0) {
    return (
      <Card className="max-w-4xl mx-auto mt-6">
        <CardContent className="pt-12 pb-12">
          <EmptyState
            icon={<ShieldCheck className="h-5 w-5" />}
            title="No audit records yet"
            description="Encrypted audit records will appear here after your first payment is confirmed onchain."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-5xl mx-auto w-full py-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Audit Records</h2>
          <p className="text-sm text-muted-foreground mt-1">Review encrypted audit records and transaction evidence.</p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search by address or TX..." 
            className="pl-9 bg-background shadow-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-[140px] pl-6">Transaction</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead className="text-right">Amount (USDC)</TableHead>
                <TableHead className="w-[180px]">GL Category</TableHead>
                <TableHead className="text-center">Evidence</TableHead>
                <TableHead className="pr-6 text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAudits.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    No records found matching "{search}"
                  </TableCell>
                </TableRow>
              ) : (
                filteredAudits.map((audit) => (
                  <TableRow key={audit.id}>
                    <TableCell className="pl-6 font-mono text-xs text-muted-foreground">
                      {audit.id}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                      {audit.date}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {audit.recipient}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {audit.amount}
                    </TableCell>
                    <TableCell>
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        className="h-7 text-xs bg-muted/50 hover:bg-muted"
                        onClick={() => handleDecrypt(audit.id)}
                        disabled={isDecrypting === audit.id}
                      >
                        {isDecrypting === audit.id ? (
                          <span className="flex items-center gap-1.5"><Lock className="h-3 w-3 animate-pulse text-primary" /> Decrypting...</span>
                        ) : (
                          <span className="flex items-center gap-1.5"><Lock className="h-3 w-3 text-muted-foreground" /> Encrypted</span>
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        {audit.hasInvoice ? (
                          <FileText className="h-4 w-4 text-primary" />
                        ) : (
                          <div className="h-4 w-4 opacity-10" />
                        )}
                        {audit.hasPO ? (
                          <FileText className="h-4 w-4 text-blue-500" />
                        ) : (
                          <div className="h-4 w-4 opacity-10" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      {audit.status === "approved" ? (
                        <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20 gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Approved
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20 gap-1">
                          <Clock className="h-3 w-3" /> Pending
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
