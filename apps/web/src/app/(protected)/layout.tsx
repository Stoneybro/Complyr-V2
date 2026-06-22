import { AuthGuard } from "@/components/auth-guard";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <AuthGuard>{children}</AuthGuard>
    </div>
  );
}
