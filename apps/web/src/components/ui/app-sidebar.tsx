"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CreditCard,
  ArrowLeftRight,
  LogOut,
  FileSearchCorner,
  Loader2,
} from "lucide-react";
import { useDisconnect, useAccount, useChainId } from "wagmi";
import Image from "next/image";
import {
  useConfidentialBalance,
  clearConfidentialBalanceSession,
} from "@/hooks/useConfidentialBalance";
import { Button } from "@/components/ui/button";
import CopyText from "@/components/ui/copy";
import { truncateAddress } from "@/utils/format";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,

} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";

import {
  Settings,
} from "lucide-react";

export type AppView = "payments" | "audits" | "transactions" | "settings";

const navItems: {
  id: AppView;
  title: string;
  icon: React.ElementType;
}[] = [
  { id: "payments", title: "Payments", icon: CreditCard },
  { id: "audits", title: "Audits", icon: FileSearchCorner },
  { id: "transactions", title: "Transactions", icon: ArrowLeftRight },
  { id: "settings", title: "Settings", icon: Settings },
];

type AppSidebarProps = {
  walletAddress?: string;
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  /** When true, all nav items are disabled until setup is complete */
  isLocked?: boolean;
  /** Called synchronously before wagmi's disconnect() — use to wipe localStorage */
  onBeforeDisconnect?: () => void;
} & React.ComponentProps<typeof Sidebar>;

export function AppSidebar({
  walletAddress,
  activeView,
  onNavigate,
  isLocked = false,
  onBeforeDisconnect,
  ...props
}: AppSidebarProps) {
  const router = useRouter();
  const { address } = useAccount();
  const chainId = useChainId();
  const actualWalletAddress = walletAddress || address;

  const [logoutOpen, setLogoutOpen] = React.useState(false);

  const { disconnect } = useDisconnect({
    mutation: {
      onSuccess: () => {
        // Removed router.push("/") to stay in the app shell on logout
      },
    },
  });

  const {
    formatted: formattedBalance,
    isLoading: isBalanceLoading,
    isUnlocking,
  } = useConfidentialBalance();

  const symbol = "cUSDC";

  const handleDisconnect = () => {
    // Clear our localStorage keys FIRST so wagmi can't auto-reconnect
    onBeforeDisconnect?.();
    // Wipe the FHE decrypt session so the next wallet doesn't inherit it
    if (actualWalletAddress && chainId) {
      clearConfidentialBalanceSession(chainId, actualWalletAddress);
    }
    disconnect();
    setLogoutOpen(false);
  };

  return (
    <Sidebar collapsible="icon" {...props}>
      {/* Logo */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
             
              className="md:h-12 md:p-0  hover:bg-transparent active:bg-transparent"
              onClick={() => router.push("/")}
              tooltip="Go home"
            >
              <div className="flex aspect-square size-6 items-center justify-center shrink-0">
                <Image
                  src="/complyrlogo-light.svg"
                  alt="Complyr"
                  width={32}
                  height={32}
                  className="h-5 w-auto"
                />
              </div>
              <span className="font-bold r text-lg truncate">
                Complyr
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>



      {/* Nav items */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Balance Card at the top */}
              {actualWalletAddress && (
                <SidebarMenuItem className="mb-6">
                  <div className="flex flex-col rounded-xl border border-border bg-card overflow-hidden shadow-sm group-data-[collapsible=icon]:hidden">
                    {/* Top segment: Balance */}
                    <div className="flex flex-col px-4 py-3 bg-muted/20">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                        Balance
                      </span>
                      <div className="flex items-baseline gap-1.5">
                        {isUnlocking ? (
                          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Unlocking…
                          </span>
                        ) : isBalanceLoading ? (
                          <span className="text-2xl font-semibold tracking-tight text-muted-foreground animate-pulse">
                            ···
                          </span>
                        ) : (
                          <span className="text-2xl font-semibold tracking-tight text-foreground">
                            {formattedBalance}
                          </span>
                        )}
                        {!isUnlocking && (
                          <span className="text-sm font-medium text-muted-foreground">
                            {symbol}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* Bottom segment: Address & Copy */}
                    <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-muted/40">
                      <span className="text-sm font-mono text-muted-foreground">
                        {truncateAddress(actualWalletAddress)}
                      </span>
                      <CopyText text={actualWalletAddress} />
                    </div>
                  </div>
                </SidebarMenuItem>
              )}

              {navItems.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger
                        className={isLocked ? "cursor-not-allowed w-full" : "w-full"}
                        render={<span />}
                      >
                        <SidebarMenuButton
                          isActive={!isLocked && activeView === item.id}
                          onClick={() => !isLocked && onNavigate(item.id)}
                          tooltip={isLocked ? undefined : item.title}
                          className={`gap-3 py-5 mt-1 rounded transition-opacity w-full ${
                            isLocked
                              ? "opacity-40 pointer-events-none select-none"
                              : ""
                          }`}
                          aria-disabled={isLocked}
                        >
                          <item.icon className="shrink-0" />
                          <span>{item.title}</span>
                        </SidebarMenuButton>
                      </TooltipTrigger>
                      {isLocked && (
                        <TooltipContent side="right">
                          <p className="text-xs">Complete setup to unlock</p>
                        </TooltipContent>
                       )}
                    </Tooltip>
                  </TooltipProvider>
                </SidebarMenuItem>
              ))}

              {/* Logout Action Button */}
              {actualWalletAddress && (
                <SidebarMenuItem className="mt-4">
                  <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
                    <AlertDialogTrigger 
                      render={
                        <SidebarMenuButton className="gap-3 py-5 rounded transition-all w-full text-destructive hover:text-destructive hover:bg-destructive/10" />
                      }
                    >
                      <LogOut className="shrink-0" />
                      <span>Log Out</span>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure you want to log out?</AlertDialogTitle>
                        <AlertDialogDescription>
                          You will need to reconnect your wallet to access your dashboard again.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDisconnect} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Log out
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}