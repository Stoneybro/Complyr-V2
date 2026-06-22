import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Payments | Complyr',
  description: 'Manage your confidential payments and audits.',
};

export default function PaymentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Payments Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Manage your outgoing business payments with attached encrypted audit records.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6">
          <div className="flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">Total Volume</h3>
          </div>
          <div className="text-2xl font-bold">$0.00</div>
          <p className="text-xs text-muted-foreground">Encrypted on-chain</p>
        </div>
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6">
          <div className="flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">Active Audits</h3>
          </div>
          <div className="text-2xl font-bold">0</div>
          <p className="text-xs text-muted-foreground">Pending verification</p>
        </div>
      </div>

      <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
        <div className="flex flex-col space-y-1.5 p-6">
          <h3 className="text-lg font-semibold leading-none tracking-tight">Recent Transactions</h3>
          <p className="text-sm text-muted-foreground">
            You have not made any confidential payments yet.
          </p>
        </div>
        <div className="p-6 pt-0">
          <div className="flex items-center justify-center h-32 border-2 border-dashed rounded-md">
            <p className="text-muted-foreground text-sm">No transactions found</p>
          </div>
        </div>
      </div>
    </div>
  );
}
