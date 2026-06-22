import { AuthGuard } from "@/components/auth-guard";
import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b bg-surface">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="font-bold text-xl tracking-tighter">Complyr</Link>
            <nav className="hidden md:flex gap-4">
              <Link href="/payments" className="text-sm font-medium hover:text-primary transition-colors">Payments</Link>
            </nav>
          </div>
          <ConnectButton />
        </div>
      </header>
      <main className="flex-1 bg-surface/50">
        <div className="container mx-auto px-4 py-8">
          <AuthGuard>{children}</AuthGuard>
        </div>
      </main>
    </div>
  );
}
